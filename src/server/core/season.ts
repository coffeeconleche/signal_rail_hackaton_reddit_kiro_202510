import { redis } from '@devvit/web/server';
import type { NetworkSnapshot, Season } from '../../shared/types/signal';

const SEASON_KEY = 'signal-stack:season';
const NETWORK_KEY = 'signal-stack:network:v2';

const DEFAULT_SEASON: Season = {
  id: 'season-prelude',
  name: 'Prelude Run',
  description: 'Bring the first line online before the seasonal turnover.',
  startedAt: new Date().toISOString(),
  durationHours: 24 * 14, // two weeks
};

const DEFAULT_NETWORK: NetworkSnapshot = {
  stations: [
    {
      id: 'red-harbor',
      name: 'Red Harbor',
      position: { x: 22, y: 68 },
      tags: ['port', 'origin'],
    },
    {
      id: 'sunspire',
      name: 'Sunspire Works',
      position: { x: 14, y: 50 },
      tags: ['agricultural', 'industrial'],
    },
    {
      id: 'ember-field',
      name: 'Ember Field',
      position: { x: 54, y: 34 },
      tags: ['industrial'],
    },
    {
      id: 'mistmoor',
      name: 'Mistmoor',
      position: { x: 38, y: 18 },
      tags: ['settlement'],
    },
    {
      id: 'cinder-crossing',
      name: 'Cinder Crossing',
      position: { x: 66, y: 46 },
      tags: ['junction'],
    },
    {
      id: 'frostford',
      name: 'Frostford',
      position: { x: 82, y: 70 },
      tags: ['settlement'],
    },
    {
      id: 'glacier-run',
      name: 'Glacier Run',
      position: { x: 90, y: 28 },
      tags: ['outpost'],
    },
  ],
  tracks: [
    { id: 'mainline-a', from: 'red-harbor', to: 'ember-field', status: 'open' },
    { id: 'mainline-b', from: 'ember-field', to: 'frostford', status: 'open' },
    { id: 'spur-sunspire', from: 'red-harbor', to: 'sunspire', status: 'open' },
    { id: 'sunspire-connector', from: 'sunspire', to: 'ember-field', status: 'open' },
    { id: 'ember-mist', from: 'ember-field', to: 'mistmoor', status: 'open' },
    { id: 'mist-cinder', from: 'mistmoor', to: 'cinder-crossing', status: 'open' },
    { id: 'ember-cinder', from: 'ember-field', to: 'cinder-crossing', status: 'open' },
    { id: 'cinder-frost', from: 'cinder-crossing', to: 'frostford', status: 'open' },
    { id: 'cinder-glacier', from: 'cinder-crossing', to: 'glacier-run', status: 'open' },
    { id: 'frost-glacier', from: 'frostford', to: 'glacier-run', status: 'open' },
  ],
};

const parseJson = <T>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error('Failed to parse stored data, reverting to fallback', error);
    return fallback;
  }
};

export const loadSeason = async (): Promise<Season> => {
  const raw = await redis.get(SEASON_KEY);
  const season = parseJson(raw, DEFAULT_SEASON);
  if (!raw) {
    await redis.set(SEASON_KEY, JSON.stringify(season));
  }
  return season;
};

export const loadNetwork = async (): Promise<NetworkSnapshot> => {
  const raw = await redis.get(NETWORK_KEY);
  const network = parseJson(raw, DEFAULT_NETWORK);
  if (!raw) {
    await redis.set(NETWORK_KEY, JSON.stringify(network));
  }
  return network;
};

import type { ObjectiveSnapshot } from '../../shared/types/signal';

export type ObjectiveConfig = ObjectiveSnapshot;

const DEFAULT_OBJECTIVES: ObjectiveConfig[] = [
  {
    id: 'objective-network-deliveries',
    title: 'Keep the Line Moving',
    description: 'Complete 10 total deliveries across any stations this season.',
    progress: 0,
    target: 10,
    status: 'active',
    stationIds: ['red-harbor', 'sunspire', 'ember-field', 'mistmoor', 'cinder-crossing', 'frostford', 'glacier-run'],
  },
  {
    id: 'objective-harbor-supply',
    title: 'Harbor Supply Run',
    description: 'Deliver 5 trains to Red Harbor without delay.',
    progress: 0,
    target: 5,
    status: 'pending',
    stationIds: ['red-harbor'],
  },
  {
    id: 'objective-ember-output',
    title: 'Stabilize Ember Field',
    description: 'Keep congestion below 2.0 at Ember Field for 10 minutes.',
    progress: 0,
    target: 600,
    status: 'pending',
    stationIds: ['ember-field'],
  },
  {
    id: 'objective-junction-flow',
    title: 'Keep Cinder Crossing Clear',
    description: 'Maintain congestion below 1.5 at Cinder Crossing for 8 minutes.',
    progress: 0,
    target: 480,
    status: 'pending',
    stationIds: ['cinder-crossing'],
  },
  {
    id: 'objective-glacier-link',
    title: 'Reach Glacier Run',
    description: 'Complete 3 successful deliveries to Glacier Run.',
    progress: 0,
    target: 3,
    status: 'pending',
    stationIds: ['glacier-run'],
  },
];

const OBJECTIVES_KEY = 'signal-stack:objectives:v2';

export const loadObjectives = async (): Promise<ObjectiveSnapshot[]> => {
  const raw = await redis.get(OBJECTIVES_KEY);
  if (!raw) {
    await redis.set(OBJECTIVES_KEY, JSON.stringify(DEFAULT_OBJECTIVES));
    return DEFAULT_OBJECTIVES;
  }
  try {
    const data = JSON.parse(raw) as ObjectiveSnapshot[];
    if (Array.isArray(data)) return data;
  } catch (error) {
    console.error('Failed to parse objectives; resetting.', error);
  }
  await redis.set(OBJECTIVES_KEY, JSON.stringify(DEFAULT_OBJECTIVES));
  return DEFAULT_OBJECTIVES;
};

export const saveObjectives = async (objectives: ObjectiveSnapshot[]): Promise<void> => {
  await redis.set(OBJECTIVES_KEY, JSON.stringify(objectives));
};
