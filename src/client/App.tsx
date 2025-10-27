import { useEffect, useMemo, useState } from 'react';
import { useDispatcherInit } from './hooks/useDispatcherInit';
import type {
  NetworkSnapshot,
  ObjectiveSnapshot,
  RailEvent,
  Season,
  Station,
  StationStats,
  Track,
  TrainDispatch,
} from '../shared/types/signal';

const VIEWBOX_SIZE = 100;

const formatCountdown = (season: Season): string => {
  const end = new Date(new Date(season.startedAt).getTime() + season.durationHours * 3_600_000);
  const diff = end.getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return 'Season turnover is imminent';
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes} minutes left`;
};

const TrackSegment = ({ stations, track }: { stations: Station[]; track: Track }) => {
  const from = stations.find((station) => station.id === track.from);
  const to = stations.find((station) => station.id === track.to);
  if (!from || !to) return null;
  return (
    <line
      key={track.id}
      x1={from.position.x}
      y1={from.position.y}
      x2={to.position.x}
      y2={to.position.y}
      stroke={track.status === 'open' ? '#f0b541' : '#94a3b8'}
      strokeWidth={2.5}
      strokeDasharray={track.status === 'open' ? '0' : '3 2'}
      strokeLinecap="round"
    />
  );
};

const getHeatmapColor = (normalized: number): string => {
  const clamped = Math.max(0, Math.min(1, normalized));
  const start = { r: 93, g: 168, b: 255 };
  const end = { r: 217, g: 75, b: 125 };
  const mix = (a: number, b: number) => Math.round(a + (b - a) * clamped);
  return `rgb(${mix(start.r, end.r)}, ${mix(start.g, end.g)}, ${mix(start.b, end.b)})`;
};

const StationNode = ({
  station,
  stat,
  maxScore,
}: {
  station: Station;
  stat?: StationStats | undefined;
  maxScore: number;
}) => {
  const deliveries = stat?.deliveries ?? 0;
  const delays = stat?.delays ?? 0;
  const avgDelay = stat?.averageDelaySeconds ?? 0;
  const score = stat?.congestionScore ?? 0;
  const normalized = maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
  const fill = stat ? getHeatmapColor(normalized) : '#5ba8ff';
  return (
    <g key={station.id}>
      <circle
        cx={station.position.x}
        cy={station.position.y}
        r={4}
        fill={fill}
        stroke="#0f1a23"
        strokeWidth={1.2}
      />
      <title>{`${station.name}
Deliveries: ${deliveries}
Delays: ${delays}
Avg delay: ${avgDelay}s`}</title>
      <text
        x={station.position.x + 2}
        y={station.position.y - 2}
        className="text-[3px] font-semibold"
        fill="#e2e8f0"
      >
        {station.name}
      </text>
    </g>
  );
};

const timeAgo = (iso: string): string => {
  const delta = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(delta) || delta < 0) return 'just now';
  const minutes = Math.floor(delta / 60000);
  if (minutes <= 0) {
    const seconds = Math.max(1, Math.floor(delta / 1000));
    return `${seconds}s ago`;
  }
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const timeUntil = (iso: string): string => {
  const delta = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(delta)) return '';
  if (delta <= 0) return 'arrived';
  const minutes = Math.floor(delta / 60000);
  if (minutes <= 0) {
    const seconds = Math.max(1, Math.floor(delta / 1000));
    return `${seconds}s`;
  }
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const DispatchLogList = ({ entries }: { entries: TrainDispatch[] }) => {
  if (!entries.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-slate-200/70">
        The network is quiet—be the first dispatcher to schedule a run this season.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const inTransit = entry.status === 'en_route';
        const slowdown = entry.congestionFactor > 1 ? `×${entry.congestionFactor.toFixed(2)}` : '×1.00';
        return (
          <li
            key={entry.id}
            className="rounded-2xl border border-white/15 bg-white/10 px-3 py-3 text-sm text-slate-100/90"
          >
            <div className="flex items-center justify-between gap-3 text-sm font-semibold text-white">
              <span>
                {entry.from} → {entry.to}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${
                  inTransit ? 'bg-amber-400/20 text-amber-200' : 'bg-emerald-400/20 text-emerald-200'
                }`}
              >
                {inTransit ? 'En route' : 'Arrived'}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-300/80">
              <span>Dispatched by {entry.dispatchedBy}</span>
              <span className="mx-2 text-slate-500">•</span>
              <span>{timeAgo(entry.dispatchedAt)}</span>
              <span className="mx-2 text-slate-500">•</span>
              <span>
                {inTransit ? `ETA ${timeUntil(entry.arrivalAt)}` : `Arrived ${timeAgo(entry.arrivalAt)}`}
              </span>
              <span className="mx-2 text-slate-500">•</span>
              <span>Load {slowdown}</span>
              <span className="mx-2 text-slate-500">•</span>
              <span>{Math.round(entry.durationSeconds)}s</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

const formatLoadLabel = (score: number): string => {
  if (score >= 6) return 'Severe';
  if (score >= 3) return 'High';
  if (score >= 1.5) return 'Elevated';
  if (score > 0) return 'Light';
  return 'Idle';
};

const StationStatsList = ({
  stations,
  statsById,
  maxScore,
}: {
  stations: Station[];
  statsById: Map<string, StationStats>;
  maxScore: number;
}) => (
  <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
    <h2 className="text-base font-semibold text-white">Station load</h2>
    <p className="mt-1 text-xs text-slate-300/80">Heatmap colors correspond to the bubbles on the map.</p>
    <ul className="mt-3 space-y-2 text-sm text-slate-100/90">
      {stations.map((station) => {
        const stat = statsById.get(station.id);
        const score = stat?.congestionScore ?? 0;
        const normalized = maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
        const chipColor = getHeatmapColor(normalized);
        const loadLabel = formatLoadLabel(score);
        return (
          <li
            key={station.id}
            className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/10 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: chipColor }}
                aria-hidden
              />
              <span>{station.name}</span>
            </div>
            <div className="flex flex-col items-end text-xs text-slate-300/90">
              <span>{loadLabel}</span>
              <span className="text-slate-400">
                {stat ? `${stat.deliveries} runs · ${stat.delays} delays · avg ${stat.averageDelaySeconds}s` : 'No data'}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  </div>
);

const ObjectivesList = ({ objectives }: { objectives: ObjectiveSnapshot[] }) => {
  if (!objectives.length) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-slate-100/70 backdrop-blur-sm">
        No objectives configured yet. They’ll appear here once season goals are defined.
      </div>
    );
  }
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <h2 className="text-base font-semibold text-white">Season objectives</h2>
      <ul className="mt-3 space-y-3 text-sm text-slate-100/90">
        {objectives.map((objective) => {
          const target = objective.target || 1;
          const progressFraction = Math.max(0, Math.min(objective.progress / target, 1));
          const percent = Math.round(progressFraction * 100);
          const statusChip =
            objective.status === 'completed'
              ? 'bg-emerald-400/20 text-emerald-200'
              : objective.status === 'active'
              ? 'bg-amber-400/20 text-amber-200'
              : 'bg-white/10 text-slate-200';
          const tooltip = `Stations: ${
            objective.stationIds.length ? objective.stationIds.join(', ') : 'All'
          }`;
          return (
            <li key={objective.id} className="rounded-2xl border border-white/15 bg-white/10 px-3 py-3">
              <div className="flex items-center justify-between gap-3 text-sm font-semibold text-white">
                <span title={tooltip}>{objective.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${statusChip}`}>
                  {objective.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300/80">{objective.description}</p>
              <div className="mt-2 h-2 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-amber-400/80"
                  style={{ width: `${percent}%` }}
                  aria-hidden
                />
              </div>
              <div className="mt-1 text-xs text-slate-300/70">
                {objective.progress} / {objective.target} ({percent}%)
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};


const EventsList = ({ events }: { events: RailEvent[] }) => {
  if (!events.length) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-slate-100/70 backdrop-blur-sm">
        No active incidents. The network is clear.
      </div>
    );
  }
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <h2 className="text-base font-semibold text-white">Operational alerts</h2>
      <ul className="mt-3 space-y-3 text-sm text-slate-100/90">
        {events.map((event) => {
          const eta = timeUntil(event.expiresAt);
          return (
            <li key={event.id} className="rounded-2xl border border-white/15 bg-white/10 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <span>{event.description}</span>
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs uppercase tracking-wide text-amber-200">
                  ×{event.multiplier.toFixed(2)}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-300/70">Expires in {eta}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const NetworkMap = ({
  network,
  statsById,
  maxScore,
}: {
  network: NetworkSnapshot | null;
  statsById: Map<string, StationStats>;
  maxScore: number;
}) => {
  if (!network) {
    return (
      <div className="flex h-64 items-center justify-center rounded-3xl border border-white/10 bg-white/10 text-sm text-slate-200/70">
        Network data loading...
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} className="h-full w-full" role="img" aria-label="Rail network">
        <defs>
          <radialGradient id="bg-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#13293d" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0b151f" stopOpacity="0.95" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#bg-gradient)" rx="6" />
        {network.tracks.map((track) => (
          <TrackSegment key={track.id} stations={network.stations} track={track} />
        ))}
        {network.stations.map((station) => (
          <StationNode key={station.id} station={station} stat={statsById.get(station.id)} maxScore={maxScore} />
        ))}
      </svg>
    </div>
  );
};

export const App = () => {
  const {
    data,
    loading,
    error,
    dispatchTrain,
    dispatching,
    actionMessage,
    actionError,
    clearActionFeedback,
    clearDispatches,
    setDispatchSpeed,
    resetCooldown,
    load,
  } = useDispatcherInit();
  const [fromStation, setFromStation] = useState<string | null>(null);
  const [toStation, setToStation] = useState<string | null>(null);
  const [speedInput, setSpeedInput] = useState<number>(60);

  const countdown = useMemo(() => (data ? formatCountdown(data.season) : 'Preparing season...'), [data]);

  const stations = useMemo(() => data?.network.stations ?? [], [data?.network]);
  const activeCount = data?.dispatchLog.activeCount ?? 0;
  const stationStatsArray = useMemo(() => data?.dispatchLog.stationStats ?? [], [data?.dispatchLog.stationStats]);
  const stationStatsMap = useMemo(() => {
    const map = new Map<string, StationStats>();
    stationStatsArray.forEach((stat) => map.set(stat.stationId, stat));
    return map;
  }, [stationStatsArray]);
  const maxCongestionScore = useMemo(
    () => stationStatsArray.reduce((max, stat) => Math.max(max, stat.congestionScore), 0),
    [stationStatsArray]
  );
  const objectives = data?.objectives ?? [];
  const events = data?.events ?? [];

  useEffect(() => {
    if (activeCount <= 0) return;
    const timer = window.setInterval(() => load(), 15000);
    return () => window.clearInterval(timer);
  }, [activeCount, load]);


  useEffect(() => {
    if (!stations.length) return;
    setFromStation((prev) => prev ?? stations[0]?.id ?? null);
    setToStation((prev) => prev ?? stations[stations.length - 1]?.id ?? null);
  }, [stations]);

  const handleDispatch = () => {
    if (!fromStation || !toStation) return;
    void dispatchTrain(fromStation, toStation);
  };

  const cooldownSeconds = data?.dispatchLog.cooldownRemainingSeconds ?? 0;
  const networkLoadLabel = useMemo(() => {
    if (activeCount >= 3) return 'High';
    if (activeCount === 2) return 'Elevated';
    if (activeCount === 1) return 'Light';
    return 'Idle';
  }, [activeCount]);

  const dispatchDisabled =
    dispatching ||
    loading ||
    !fromStation ||
    !toStation ||
    fromStation === toStation ||
    cooldownSeconds > 0;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#071019] via-[#0b1723] to-[#102031] text-white">
      <div className="absolute inset-0 opacity-60 mix-blend-screen">
        <div className="absolute -left-32 top-10 h-48 w-48 rounded-full bg-[#1c2d3a66] blur-3xl" />
        <div className="absolute right-0 top-1/3 h-60 w-60 rounded-full bg-[#315bff22] blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 translate-y-1/3 rounded-full bg-[#f0b54122] blur-3xl" />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8 md:py-12">
        <header className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-md">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-white md:text-3xl">Signal Stack</h1>
              <p className="text-sm text-slate-200/80 md:text-base">
                Coordinate community trains across seasons. This console now supports shared dispatch runs.
              </p>
            </div>
            <div className="flex flex-col items-start rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs uppercase tracking-wide text-slate-200/80 md:items-end">
              <span className="text-white/90">{data?.season.name ?? 'Season syncing'}</span>
              <span>{countdown}</span>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-3xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
            <div className="flex items-start justify-between gap-4">
              <p>{error}</p>
              <button
                className="rounded-lg border border-red-400/60 px-3 py-1 text-xs uppercase tracking-wide text-red-100 transition hover:border-red-200 hover:text-red-50"
                onClick={() => load()}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {actionMessage && (
          <div className="rounded-3xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <div className="flex items-start justify-between gap-4">
              <p>{actionMessage}</p>
              <button
                className="rounded-lg border border-emerald-300/40 px-3 py-1 text-xs uppercase tracking-wide text-emerald-50 transition hover:border-emerald-200 hover:text-emerald-50"
                onClick={clearActionFeedback}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {actionError && (
          <div className="rounded-3xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
            <div className="flex items-start justify-between gap-4">
              <p>{actionError}</p>
              <button
                className="rounded-lg border border-red-400/60 px-3 py-1 text-xs uppercase tracking-wide text-red-100 transition hover:border-red-200 hover:text-red-50"
                onClick={clearActionFeedback}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <section className="grid gap-5 lg:grid-cols-[2fr,1fr]">
          <div className="flex flex-col gap-4">
            <NetworkMap
              network={data?.network ?? null}
              statsById={stationStatsMap}
              maxScore={maxCongestionScore}
            />
            <StationStatsList
              stations={stations}
              statsById={stationStatsMap}
              maxScore={Math.max(maxCongestionScore, 0)}
            />

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <h2 className="text-base font-semibold text-white">Quick dispatch</h2>
              <p className="mt-1 text-sm text-slate-200/80">
                Pick a departure and destination to schedule a shared train. Each dispatcher has a short cooldown before they can queue another run.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col text-sm text-slate-200/80">
                  <span className="mb-1 font-semibold text-white">From</span>
                  <select
                    className="rounded-xl border border-white/10 bg-[#132030] px-3 py-2 text-white focus:border-amber-300 focus:outline-none"
                    value={fromStation ?? ''}
                    onChange={(event) => setFromStation(event.target.value || null)}
                  >
                    {stations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col text-sm text-slate-200/80">
                  <span className="mb-1 font-semibold text-white">To</span>
                  <select
                    className="rounded-xl border border-white/10 bg-[#132030] px-3 py-2 text-white focus:border-amber-300 focus:outline-none"
                    value={toStation ?? ''}
                    onChange={(event) => setToStation(event.target.value || null)}
                  >
                    {stations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-300/80">
                <span>
                  {cooldownSeconds > 0 ? `Cooldown: ${cooldownSeconds}s remaining` : 'Ready to dispatch'}
                </span>
                <span>Load: {networkLoadLabel} ({activeCount} active)</span>
              </div>
              <button
                className="mt-4 w-full rounded-2xl border border-amber-300/60 bg-amber-400/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-200 hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-400"
                disabled={dispatchDisabled}
                onClick={handleDispatch}
              >
                {dispatching ? 'Dispatching…' : 'Dispatch shared train'}
              </button>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-2">
                  <label className="text-xs uppercase tracking-wide text-slate-300" htmlFor="speed-multiplier">Speed x</label>
                  <input
                    id="speed-multiplier"
                    type="number"
                    min="0"
                    step="10"
                    className="w-full rounded-xl border border-white/10 bg-[#132030] px-3 py-1 text-sm text-white focus:border-amber-300 focus:outline-none sm:w-24"
                    value={speedInput}
                    onChange={(event) => setSpeedInput(Number(event.target.value) || 0)}
                  />
                </div>
                <button
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/40 hover:bg-white/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-400"
                  disabled={dispatching}
                  onClick={() => setDispatchSpeed(speedInput)}
                >
                  {dispatching ? 'Working…' : 'Apply speed'}
                </button>
                <button
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/40 hover:bg-white/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-400"
                  disabled={dispatching}
                  onClick={() => clearDispatches()}
                >
                  {dispatching ? 'Working…' : 'Clear log'}
                </button>
                <button
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/40 hover:bg-white/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-400"
                  disabled={dispatching}
                  onClick={() => resetCooldown()}
                >
                  {dispatching ? 'Working…' : 'Reset cooldown'}
                </button>
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Latest dispatches</h2>
                <button
                  className="rounded-xl border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-slate-100 transition hover:border-white/40"
                  disabled={loading}
                  onClick={() => load()}
                >
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              <DispatchLogList entries={data?.dispatchLog.entries ?? []} />
            </div>
            <ObjectivesList objectives={objectives} />
            <EventsList events={events} />
          </aside>
        </section>

        <footer className="pb-6 text-xs text-slate-300/80">
          Season data resets on schedule but the rail history will persist in archives. Expect gameplay updates as we iterate on dispatch mechanics. Share feedback in the post comments to shape upcoming seasons.
        </footer>
      </main>
    </div>
  );
};
