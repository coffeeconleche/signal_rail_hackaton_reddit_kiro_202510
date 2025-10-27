import { randomUUID } from 'node:crypto';
import { redis } from '@devvit/web/server';
import { DISPATCH_DEBUG_SPEED } from './config';
import type { StationStats, ObjectiveSnapshot, RailEvent } from '../../shared/types/signal';
import { loadNetwork, loadObjectives, saveObjectives } from './season';
import type {
  DispatchLog,
  DispatchRequest,
  NetworkSnapshot,
  TrainDispatch,
} from '../../shared/types/signal';

const DISPATCH_LOG_KEY = 'signal-stack:dispatch-log';
const USER_DISPATCH_KEY_PREFIX = 'signal-stack:dispatcher:';
const MAX_DISPATCH_ENTRIES = 25;
const BASE_DURATION_SECONDS = 180; // 3 minutes per segment
const COOLDOWN_SECONDS = 180; // 3 minutes per user
const CONGESTION_SLOWDOWN_PER_ACTIVE = 0.25;
const MAX_LOG_AGE_MS = 1000 * 60 * 60; // 1 hour

const now = () => new Date();

let dispatchLogInitialized = false;
const shouldClearOnBoot = process.env.CLEAR_DISPATCH_LOG === '1';
let debugSpeedOverride = DISPATCH_DEBUG_SPEED;

console.info(`[Signal Stack] CLEAR_DISPATCH_LOG flag ${shouldClearOnBoot ? 'enabled' : 'disabled'}`);
console.info(`[Signal Stack] Dispatch speed multiplier ${debugSpeedOverride}`);

export const setDispatchDebugSpeed = (speed: number): void => {
  debugSpeedOverride = speed;
  console.info(`[Signal Stack] Dispatch speed multiplier set to ${debugSpeedOverride}`);
};

const getDispatchDebugSpeed = (): number => debugSpeedOverride;

export const clearCooldownForUser = async (userId: string): Promise<void> => {
  await redis.del(getUserCooldownKey(userId));
};


const progressObjectives = (
  objectives: ObjectiveSnapshot[],
  stats: StationStats[],
  totalDeliveries: number
): ObjectiveSnapshot[] => {
  return objectives.map((objective) => {
    const relevantStats = objective.stationIds.length
      ? stats.filter((stat) => objective.stationIds.includes(stat.stationId))
      : stats;
    switch (objective.id) {
      case 'objective-network-deliveries': {
        const progress = totalDeliveries;
        const status = progress >= objective.target ? 'completed' : 'active';
        return { ...objective, progress, status };
      }
      case 'objective-harbor-supply': {
        const deliveries = relevantStats.reduce((sum, stat) => sum + stat.deliveries, 0);
        const progress = deliveries;
        const status = progress >= objective.target ? 'completed' : 'active';
        return { ...objective, progress, status };
      }
      case 'objective-ember-output': {
        const avgCongestion = relevantStats.length
          ? relevantStats.reduce((sum, stat) => sum + stat.congestionScore, 0) / relevantStats.length
          : 0;
        const shouldProgress = avgCongestion < 2.0;
        const progress = shouldProgress ? Math.min(objective.target, objective.progress + 15) : objective.progress;
        const status = progress >= objective.target ? 'completed' : 'active';
        return { ...objective, progress, status };
      }
      default: {
        return objective;
      }
    }
  });
};

const computeStationStats = (
  entries: StoredDispatch[],
  stationMap: Map<string, StationStats>
): StationStats[] => {
  const nowMs = Date.now();
  const stats = new Map<string, StationStats>();
  for (const [stationId, base] of stationMap.entries()) {
    stats.set(stationId, { ...base, deliveries: 0, delays: 0, averageDelaySeconds: 0, congestionScore: 0 });
  }
  for (const entry of entries) {
    const arrivalMs = Date.parse(entry.arrivalAt);
    const targetMap = [entry.from, entry.to];
    const isDelayed = !entry.completedAt && arrivalMs < nowMs;
    for (const stationId of targetMap) {
      const current = stats.get(stationId) ?? {
        stationId,
        deliveries: 0,
        delays: 0,
        averageDelaySeconds: 0,
        congestionScore: 0,
      };
      if (entry.completedAt) {
        current.deliveries += 1;
      }
      if (isDelayed) {
        current.delays += 1;
        current.averageDelaySeconds += Math.max(0, (nowMs - arrivalMs) / 1000);
      }
      current.congestionScore += entry.congestionFactor;
      stats.set(stationId, current);
    }
  }
  return Array.from(stats.values()).map((stat) => ({
    ...stat,
    averageDelaySeconds:
      stat.delays > 0 ? Math.round(stat.averageDelaySeconds / stat.delays) : 0,
  }));
};

const stationMapFromNetwork = (network: NetworkSnapshot): Map<string, StationStats> => {
  const map = new Map<string, StationStats>();
  for (const station of network.stations) {
    map.set(station.id, {
      stationId: station.id,
      deliveries: 0,
      delays: 0,
      averageDelaySeconds: 0,
      congestionScore: 0,
    });
  }
  return map;
};


const EVENTS_KEY = 'signal-stack:events';
const EVENT_DURATION_SECONDS = 300;
const EVENT_CREATION_PROBABILITY = 0.35;

type EventDefinition = {
  template: (stationName: string) => string;
  multiplier: number;
};

const EVENT_DEFINITIONS: EventDefinition[] = [
  {
    template: (name) => `Signal fault near ${name} slows departures.`,
    multiplier: 1.5,
  },
  {
    template: (name) => `Heavy storm over ${name} reduces visibility.`,
    multiplier: 1.3,
  },
  {
    template: (name) => `${name} maintenance crews restrict capacity.`,
    multiplier: 1.4,
  },
];

const fetchEvents = async (): Promise<RailEvent[]> => {
  const raw = await redis.get(EVENTS_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as RailEvent[];
    if (Array.isArray(data)) return data;
  } catch (error) {
    console.error('Failed to parse events; resetting.', error);
  }
  return [];
};

const saveEvents = async (events: RailEvent[]): Promise<void> => {
  await redis.set(EVENTS_KEY, JSON.stringify(events));
};

const pruneExpiredEvents = (events: RailEvent[]): { events: RailEvent[]; changed: boolean } => {
  const nowMs = Date.now();
  const filtered = events.filter((event) => Date.parse(event.expiresAt) > nowMs);
  return { events: filtered, changed: filtered.length !== events.length };
};

const loadActiveEvents = async (): Promise<RailEvent[]> => {
  const events = await fetchEvents();
  const { events: filtered, changed } = pruneExpiredEvents(events);
  if (changed) {
    await saveEvents(filtered);
  }
  return filtered;
};

const createRandomEvent = (network: NetworkSnapshot): RailEvent | null => {
  if (!network.stations.length) return null;
  const station = network.stations[Math.floor(Math.random() * network.stations.length)];
  if (!station) return null;
  const definition = EVENT_DEFINITIONS[Math.floor(Math.random() * EVENT_DEFINITIONS.length)];
  if (!definition) return null;
  const created = now();
  return {
    id: randomUUID(),
    stationId: station.id,
    description: definition.template(station.name),
    multiplier: definition.multiplier,
    createdAt: created.toISOString(),
    expiresAt: new Date(created.getTime() + EVENT_DURATION_SECONDS * 1000).toISOString(),
  };
};

const ensureEvents = async (network: NetworkSnapshot): Promise<RailEvent[]> => {
  let events = await loadActiveEvents();
  if (events.length === 0 && Math.random() < EVENT_CREATION_PROBABILITY) {
    const newEvent = createRandomEvent(network);
    if (newEvent) {
      events = [...events, newEvent];
      await saveEvents(events);
    }
  }
  return events;
};

const loadActiveEventsForDispatch = async (): Promise<RailEvent[]> => {
  return loadActiveEvents();
};

const ensureDispatchLogInitialized = async (): Promise<void> => {
  if (!dispatchLogInitialized) {
    dispatchLogInitialized = true;
    if (shouldClearOnBoot) {
      await redis.del(DISPATCH_LOG_KEY);
      console.info('[Signal Stack] Dispatch log cleared via CLEAR_DISPATCH_LOG');
    }
  }
};


const parseStored = (raw: string | null | undefined): StoredDispatch[] => {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown[];
    if (!Array.isArray(data)) return [];
    return data
      .map((entry) => sanitizeStoredDispatch(entry as RawStoredDispatch))
      .filter((entry): entry is StoredDispatch => entry !== null);
  } catch (error) {
    console.error('Failed to parse dispatch log; resetting.', error);
    return [];
  }
};

type StoredDispatch = {
  id: string;
  from: string;
  to: string;
  dispatchedBy: string;
  dispatchedAt: string;
  durationSeconds: number;
  arrivalAt: string;
  congestionFactor: number;
  completedAt?: string;
};

type RawStoredDispatch = Record<string, unknown> | null | undefined;

const sanitizeStoredDispatch = (input: RawStoredDispatch): StoredDispatch | null => {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const { id, from, to, dispatchedBy, dispatchedAt, durationSeconds } = record;
  if (typeof id !== 'string' || typeof from !== 'string' || typeof to !== 'string') return null;
  if (typeof dispatchedBy !== 'string' || typeof dispatchedAt !== 'string') return null;
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) return null;
  const dispatchedMs = Date.parse(dispatchedAt);
  if (Number.isNaN(dispatchedMs)) return null;
  const arrivalCandidate = typeof record.arrivalAt === 'string' ? Date.parse(record.arrivalAt) : NaN;
  const arrivalAt = Number.isNaN(arrivalCandidate)
    ? new Date(dispatchedMs + durationSeconds * 1000).toISOString()
    : new Date(arrivalCandidate).toISOString();
  const congestionFactor =
    typeof record.congestionFactor === 'number' && Number.isFinite(record.congestionFactor) && record.congestionFactor > 0
      ? record.congestionFactor
      : 1;
  const completedAt =
    typeof record.completedAt === 'string' && !Number.isNaN(Date.parse(record.completedAt))
      ? new Date(Date.parse(record.completedAt)).toISOString()
      : undefined;
  const normalized: StoredDispatch = {
    id,
    from,
    to,
    dispatchedBy,
    dispatchedAt: new Date(dispatchedMs).toISOString(),
    durationSeconds,
    arrivalAt,
    congestionFactor,
  };
  if (completedAt) {
    normalized.completedAt = completedAt;
  }
  return normalized;
};

const toTrainDispatch = (entry: StoredDispatch): TrainDispatch => {
  const arrivalAtDate = new Date(entry.arrivalAt);
  const arrived = entry.completedAt ? true : arrivalAtDate.getTime() <= Date.now();
  const status = arrived ? 'arrived' : 'en_route';
  const completedAt = entry.completedAt ?? (arrived ? arrivalAtDate.toISOString() : undefined);
  return {
    ...entry,
    arrivalAt: arrivalAtDate.toISOString(),
    status,
    ...(completedAt ? { completedAt } : {}),
  };
};

const getUserCooldownKey = (userId: string) => `${USER_DISPATCH_KEY_PREFIX}${userId}`;

const ensureStations = (network: NetworkSnapshot, id: string) =>
  network.stations.find((station) => station.id === id);

const buildAdjacency = (network: NetworkSnapshot): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>();
  for (const station of network.stations) {
    map.set(station.id, new Set<string>());
  }
  for (const track of network.tracks) {
    if (!map.has(track.from) || !map.has(track.to)) continue;
    map.get(track.from)!.add(track.to);
    map.get(track.to)!.add(track.from);
  }
  return map;
};

const shortestPathEdges = (network: NetworkSnapshot, from: string, to: string): number | null => {
  if (from === to) return 0;
  const adjacency = buildAdjacency(network);
  const visited = new Set<string>([from]);
  const queue: Array<{ node: string; distance: number }> = [{ node: from, distance: 0 }];

  while (queue.length > 0) {
    const { node, distance } = queue.shift()!;
    const neighbors = adjacency.get(node);
    if (!neighbors) continue;
    for (const next of neighbors) {
      if (visited.has(next)) continue;
      if (next === to) return distance + 1;
      visited.add(next);
      queue.push({ node: next, distance: distance + 1 });
    }
  }
  return null;
};

const computeDurationSeconds = (
  edges: number,
  network: NetworkSnapshot,
  from: string,
  to: string
) => {
  if (edges === 0) return BASE_DURATION_SECONDS; // shunt move within station
  const fromStation = ensureStations(network, from);
  const toStation = ensureStations(network, to);
  if (!fromStation || !toStation) return BASE_DURATION_SECONDS * edges;
  const dx = toStation.position.x - fromStation.position.x;
  const dy = toStation.position.y - fromStation.position.y;
  const distanceFactor = Math.max(1, Math.sqrt(dx * dx + dy * dy) / 10);
  return Math.round(BASE_DURATION_SECONDS * edges * distanceFactor);
};

const tickStoredDispatches = (entries: StoredDispatch[]): StoredDispatch[] => {
  const cutoff = Date.now() - MAX_LOG_AGE_MS;
  let changed = false;
  const next = entries
    .map((entry) => {
      const arrivalTime = new Date(entry.arrivalAt).getTime();
      if (!entry.completedAt && arrivalTime <= Date.now()) {
        changed = true;
        return { ...entry, completedAt: new Date(arrivalTime).toISOString() };
      }
      return entry;
    })
    .filter((entry) => new Date(entry.dispatchedAt).getTime() >= cutoff);
  if (changed || next.length !== entries.length) {
    return next;
  }
  return entries;
};

const loadStoredDispatches = async (): Promise<StoredDispatch[]> => {
  await ensureDispatchLogInitialized();
  const raw = await redis.get(DISPATCH_LOG_KEY);
  return parseStored(raw);
};

const saveStoredDispatches = async (entries: StoredDispatch[]): Promise<void> => {
  await redis.set(DISPATCH_LOG_KEY, JSON.stringify(entries));
};

export const clearDispatchLog = async (): Promise<void> => {
  await redis.del(DISPATCH_LOG_KEY);
  dispatchLogInitialized = false;
};

const computeCooldownRemaining = (lastDispatchedAtIso: string | null | undefined): number => {
  if (!lastDispatchedAtIso) return 0;
  const last = new Date(lastDispatchedAtIso).getTime();
  if (Number.isNaN(last)) return 0;
  const remaining = last + COOLDOWN_SECONDS * 1000 - Date.now();
  return remaining > 0 ? Math.round(remaining / 1000) : 0;
};

export type DispatcherSnapshot = {
  log: DispatchLog;
  objectives: ObjectiveSnapshot[];
  events: RailEvent[];
};

export const getDispatcherSnapshot = async (userId: string | undefined, networkOverride?: NetworkSnapshot): Promise<DispatcherSnapshot> => {
  let stored = await loadStoredDispatches();
  const ticked = tickStoredDispatches(stored);
  if (ticked !== stored) {
    stored = ticked;
    await saveStoredDispatches(stored.slice(0, MAX_DISPATCH_ENTRIES));
  }
  const entries = stored.slice(0, MAX_DISPATCH_ENTRIES).map(toTrainDispatch);
  const activeCount = stored.filter((entry) => !entry.completedAt).length;
  const lastKey = userId ? getUserCooldownKey(userId) : undefined;
  const lastDispatchedAtIso = lastKey ? await redis.get(lastKey) : null;
  const cooldownRemainingSeconds = lastKey ? computeCooldownRemaining(lastDispatchedAtIso) : 0;
  const network = networkOverride ?? (await loadNetwork());
  const stationStats = computeStationStats(stored, stationMapFromNetwork(network));
  const events = await ensureEvents(network);
  let objectives = await loadObjectives();
  const totalDeliveries = stationStats.reduce((sum, stat) => sum + stat.deliveries, 0);
  objectives = progressObjectives(objectives, stationStats, totalDeliveries);
  await saveObjectives(objectives);
  const log: DispatchLog = {
    entries,
    cooldownRemainingSeconds,
    activeCount,
    stationStats,
  };
  return { log, objectives, events };
};

export const recordDispatch = async (
  request: DispatchRequest,
  username: string,
  userId: string,
  network: NetworkSnapshot
): Promise<TrainDispatch> => {
  await ensureDispatchLogInitialized();
  const { from, to } = request;
  if (!ensureStations(network, from) || !ensureStations(network, to)) {
    throw new DispatchError('INVALID_ROUTE', 'Unknown station selected.');
  }
  if (from === to) {
    throw new DispatchError('SAME_STATION', 'Choose two different stations.');
  }

  const lastKey = getUserCooldownKey(userId);
  const lastIso = await redis.get(lastKey);
  const cooldownRemaining = computeCooldownRemaining(lastIso);
  if (cooldownRemaining > 0) {
    throw new DispatchError(
      'COOLDOWN_ACTIVE',
      `Dispatcher cooldown active. Try again in ${cooldownRemaining} seconds.`,
      cooldownRemaining
    );
  }

  const edges = shortestPathEdges(network, from, to);
  if (edges === null) {
    throw new DispatchError('NO_PATH', 'No track connects those stations yet.');
  }

  let stored = await loadStoredDispatches();
  stored = tickStoredDispatches(stored);
  const activeCount = stored.filter((entry) => !entry.completedAt).length;

  const events = await loadActiveEventsForDispatch();
  const eventMultiplier = events.reduce((factor, event) => {
    if (event.stationId === from || event.stationId === to) {
      return factor * event.multiplier;
    }
    return factor;
  }, 1);

  const congestionFactor = (1 + activeCount * CONGESTION_SLOWDOWN_PER_ACTIVE) * eventMultiplier;
  const baseDuration = computeDurationSeconds(edges, network, from, to);
  const debugSpeed = getDispatchDebugSpeed();
  const adjustedDuration = Math.round(baseDuration * congestionFactor);
  const durationSeconds =
    debugSpeed > 0
      ? Math.max(5, Math.round(adjustedDuration / debugSpeed))
      : Math.max(5, adjustedDuration);
  const dispatchedAtDate = now();
  const arrivalAt = new Date(dispatchedAtDate.getTime() + durationSeconds * 1000).toISOString();
  const storedEntry: StoredDispatch = {
    id: randomUUID(),
    from,
    to,
    dispatchedBy: username,
    dispatchedAt: dispatchedAtDate.toISOString(),
    durationSeconds,
    arrivalAt,
    congestionFactor,
  };

  const updated = [storedEntry, ...stored].slice(0, MAX_DISPATCH_ENTRIES);
  await saveStoredDispatches(updated);

  await redis.set(lastKey, storedEntry.dispatchedAt, {
    expiration: new Date(dispatchedAtDate.getTime() + COOLDOWN_SECONDS * 1000),
  });

  return toTrainDispatch(storedEntry);
};

export class DispatchError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly cooldownRemainingSeconds: number = 0
  ) {
    super(message);
    this.name = 'DispatchError';
  }
}
