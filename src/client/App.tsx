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

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const withAlpha = (color: string, alpha: string) =>
  color.startsWith('#') && color.length === 7 ? `${color}${alpha}` : color;

type SeasonPalette = {
  id: string;
  background: string;
  backgroundAlt: string;
  accent: string;
  glow: string;
  rail: string;
  card: string;
};

const SEASON_PALETTES: Record<string, SeasonPalette> = {
  'season-prelude': {
    id: 'season-prelude',
    background: '#050c16',
    backgroundAlt: '#0e1b2c',
    accent: '#f0b541',
    glow: '#4f83ff',
    rail: '#f4c76b',
    card: 'bg-white/6',
  },
};

const DEFAULT_PALETTE: SeasonPalette = {
  id: 'default',
  background: '#060b14',
  backgroundAlt: '#101d2d',
  accent: '#facc15',
  glow: '#60a5fa',
  rail: '#facc15',
  card: 'bg-white/8',
};

const getSeasonPalette = (season: Season | null | undefined): SeasonPalette => {
  if (!season) return DEFAULT_PALETTE;
  return SEASON_PALETTES[season.id] ?? {
    ...DEFAULT_PALETTE,
    id: season.id,
  };
};

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

const TrackSegment = ({
  stations,
  track,
  accent,
}: {
  stations: Station[];
  track: Track;
  accent: string;
}) => {
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
      stroke={track.status === 'open' ? accent : '#94a3b8'}
      strokeWidth={2.5}
      strokeDasharray={track.status === 'open' ? '0' : '3 2'}
      strokeLinecap="round"
    />
  );
};

const STATION_ACCENTS: Record<string, string> = {
  port: '#60a5fa',
  industrial: '#fb923c',
  settlement: '#a855f7',
};

const getHeatmapColor = (normalized: number): string => {
  const clamped = Math.max(0, Math.min(1, normalized));
  const start = { r: 93, g: 168, b: 255 };
  const end = { r: 217, g: 75, b: 125 };
  const mix = (a: number, b: number) => Math.round(a + (b - a) * clamped);
  return `rgb(${mix(start.r, end.r)}, ${mix(start.g, end.g)}, ${mix(start.b, end.b)})`;
};

const getStationAccent = (station: Station): string => {
  const firstTag = station.tags[0];
  if (firstTag && STATION_ACCENTS[firstTag]) return STATION_ACCENTS[firstTag];
  return '#38bdf8';
};

const StationGlyph = ({ tag, accent }: { tag: string | undefined; accent: string }) => {
  switch (tag) {
    case 'port':
      return (
        <>
          <path d="M0 -1.5 V1.2" stroke="#0f1a23" strokeWidth={0.3} strokeLinecap="round" />
          <circle cx={0} cy={-1.8} r={0.6} fill={accent} stroke="#0f1a23" strokeWidth={0.2} />
          <path
            d="M-1 0.8 C-0.6 1.8 0.6 1.8 1 0.8"
            stroke="#0f1a23"
            strokeWidth={0.3}
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
    case 'industrial':
      return (
        <>
          <circle cx={0} cy={0} r={1.6} fill={accent} opacity={0.85} />
          <circle cx={0} cy={0} r={0.6} fill="#0f1a23" />
          <path
            d="M0 -1.6 L0.5 -2.4"
            stroke="#0f1a23"
            strokeWidth={0.3}
            strokeLinecap="round"
          />
          <path
            d="M-0.5 -2.4 L0 -1.6"
            stroke="#0f1a23"
            strokeWidth={0.3}
            strokeLinecap="round"
          />
        </>
      );
    case 'settlement':
      return (
        <>
          <polygon points="0,-1.8 1.6,-0.4 -1.6,-0.4" fill={accent} stroke="#0f1a23" strokeWidth={0.3} />
          <rect x={-1.05} y={-0.4} width={2.1} height={1.8} fill="#f8fafc" rx={0.2} />
          <rect x={-0.4} y={0.1} width={0.8} height={0.9} fill="#0f1a23" rx={0.1} />
        </>
      );
    default:
      return <circle cx={0} cy={0} r={1.4} fill={accent} />;
  }
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
  const accent = getStationAccent(station);
  const glowId = `glow-${station.id}`;
  const coreId = `core-${station.id}`;
  return (
    <g key={station.id}>
      <defs>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
          <stop offset="100%" stopColor={accent} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={coreId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={fill} stopOpacity={0.9} />
          <stop offset="100%" stopColor="#1d2a38" stopOpacity={1} />
        </radialGradient>
      </defs>
      <circle
        cx={station.position.x}
        cy={station.position.y}
        r={7}
        fill={`url(#${glowId})`}
        opacity={0.6}
      />
      <circle
        cx={station.position.x}
        cy={station.position.y}
        r={4}
        fill={`url(#${coreId})`}
        stroke="#0f1a23"
        strokeWidth={1.2}
      />
      <g transform={`translate(${station.position.x} ${station.position.y})`}>
        <g transform="scale(1.1)">
          <StationGlyph tag={station.tags[0]} accent={accent} />
        </g>
      </g>
      <title>{`${station.name}
Deliveries: ${deliveries}
Delays: ${delays}
Avg delay: ${avgDelay}s`}</title>
      <g transform={`translate(${station.position.x + 3} ${station.position.y - 3})`}>
        <rect
          x={-1}
          y={-3.8}
          width={station.name.length * 2.2}
          height={4.8}
          rx={1.2}
          fill="#0f172aAA"
        />
        <text className="text-[3px] font-semibold" fill="#e2e8f0">
          {station.name}
        </text>
      </g>
    </g>
  );
};

type TrainToken = {
  id: string;
  from: Station;
  to: Station;
  progress: number;
  congestion: number;
  dispatchedAt: string;
  arrivalAt: string;
};

const TrainTokens = ({
  trains,
  accent,
  glow,
}: {
  trains: TrainToken[];
  accent: string;
  glow: string;
}) => {
  if (!trains.length) return null;
  return (
    <>
      {trains.map((train) => {
        const dx = train.to.position.x - train.from.position.x;
        const dy = train.to.position.y - train.from.position.y;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const x = train.from.position.x + dx * train.progress;
        const y = train.from.position.y + dy * train.progress;
        const glowId = `train-glow-${train.id}`;
        const progression = Math.max(0.15, train.progress);
        return (
          <g key={train.id}>
            <defs>
              <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={glow} stopOpacity={0.6} />
                <stop offset="100%" stopColor={glow} stopOpacity={0} />
              </radialGradient>
            </defs>
            <line
              x1={train.from.position.x}
              y1={train.from.position.y}
              x2={train.from.position.x + dx * progression}
              y2={train.from.position.y + dy * progression}
              stroke={glow}
              strokeWidth={1.4}
              strokeDasharray="3 2"
              opacity={0.35}
            />
            <g transform={`translate(${x} ${y})`}>
              <circle r={3.2} fill={`url(#${glowId})`} opacity={0.75} />
              <g transform={`rotate(${angle})`}>
                <rect
                  x={-2.6}
                  y={-1.1}
                  width={5.2}
                  height={2.2}
                  rx={0.8}
                  fill="#0f172a"
                  stroke={accent}
                  strokeWidth={0.4}
                />
                <rect
                  x={-1.8}
                  y={-0.6}
                  width={1.6}
                  height={1.2}
                  rx={0.3}
                  fill={accent}
                  opacity={0.85}
                />
                <rect
                  x={0.4}
                  y={-0.6}
                  width={1.6}
                  height={1.2}
                  rx={0.3}
                  fill={accent}
                  opacity={0.65}
                />
                <path
                  d="M2.2 -0.8 L2.8 0 L2.2 0.8"
                  fill="none"
                  stroke={accent}
                  strokeWidth={0.3}
                  strokeLinecap="round"
                />
              </g>
            </g>
          </g>
        );
      })}
    </>
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
  palette,
}: {
  stations: Station[];
  statsById: Map<string, StationStats>;
  maxScore: number;
  palette: SeasonPalette;
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
        const accent = getStationAccent(station);
        const progressPercent = Math.round(normalized * 100);
        return (
          <li
            key={station.id}
            className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/10 px-3 py-3"
          >
            <div
              className="absolute inset-0 opacity-60"
              style={{
                background: `linear-gradient(90deg, ${withAlpha(accent, '22')} 0%, ${withAlpha(
                  palette.glow,
                  '11'
                )} ${progressPercent}%, transparent ${progressPercent + 15}%)`,
              }}
              aria-hidden
            />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/20 bg-[#0f1a27]"
                  style={{ boxShadow: `0 0 18px ${withAlpha(accent, '33')}` }}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: chipColor }}
                    aria-hidden
                  />
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">{station.name}</div>
                  <div className="text-xs text-slate-300/80">{loadLabel}</div>
                </div>
              </div>
              <div className="flex flex-col items-end text-xs text-slate-200/80">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-200/90">
                    {stat ? `${stat.deliveries} Delivered` : 'No Runs'}
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300/80">
                    {stat ? `${stat.delays} Delays` : '—'}
                  </span>
                </div>
                <span className="mt-1 text-slate-400">
                  {stat ? `Avg delay ${stat.averageDelaySeconds}s` : 'Awaiting data'}
                </span>
              </div>
            </div>
            <div className="relative mt-3 h-1.5 rounded-full bg-white/10">
              <div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{ width: `${progressPercent}%`, background: `linear-gradient(90deg, ${accent}, ${palette.accent})` }}
                aria-hidden
              />
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
  const resolveVisual = (event: RailEvent) => {
    if (event.multiplier >= 1.5) {
      return { label: 'Critical', base: '#f87171', glow: '#fb7185' };
    }
    if (event.multiplier >= 1.3) {
      return { label: 'Warning', base: '#facc15', glow: '#fbbf24' };
    }
    return { label: 'Advisory', base: '#60a5fa', glow: '#38bdf8' };
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <h2 className="text-base font-semibold text-white">Operational alerts</h2>
      <ul className="mt-3 space-y-3 text-sm text-slate-100/90">
        {events.map((event) => {
          const eta = timeUntil(event.expiresAt);
          const visual = resolveVisual(event);
          return (
            <li
              key={event.id}
              className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/10 px-4 py-4"
            >
              <div
                className="absolute inset-0 opacity-70"
                style={{
                  background: `linear-gradient(135deg, ${withAlpha(visual.glow, '33')} 0%, transparent 65%)`,
                }}
                aria-hidden
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-[#0f1928]"
                    style={{ boxShadow: `0 0 22px ${withAlpha(visual.base, '44')}` }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 4 L20 18 H4 L12 4Z"
                        stroke={visual.base}
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                        fill={withAlpha(visual.base, '33')}
                      />
                      <line x1="12" y1="9" x2="12" y2="13" stroke="#0f172a" strokeWidth="1.4" />
                      <circle cx="12" cy="16.5" r="1" fill="#0f172a" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-200/80">
                        {visual.label}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-200/70">
                        ×{event.multiplier.toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-1 max-w-[16rem] text-sm text-slate-100">{event.description}</p>
                    <p className="text-xs text-slate-300/70">Expires in {eta}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-300/60">
                  Started {timeAgo(event.createdAt)}
                </span>
              </div>
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
  trains,
  palette,
}: {
  network: NetworkSnapshot | null;
  statsById: Map<string, StationStats>;
  maxScore: number;
  trains: TrainToken[];
  palette: SeasonPalette;
}) => {
  if (!network) {
    return (
      <div className="flex h-64 items-center justify-center rounded-3xl border border-white/10 bg-white/10 text-sm text-slate-200/70">
        Network data loading...
      </div>
    );
  }

  const gradientId = `bg-gradient-${palette.id}`;
  const gridId = `bg-grid-${palette.id}`;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} className="h-full w-full" role="img" aria-label="Rail network">
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor={palette.backgroundAlt} stopOpacity="0.8" />
            <stop offset="70%" stopColor={palette.background} stopOpacity="0.95" />
            <stop offset="100%" stopColor="#03060c" stopOpacity="1" />
          </radialGradient>
          <pattern id={gridId} width="10" height="10" patternUnits="userSpaceOnUse">
            <path
              d="M10 0 L0 0 0 10"
              fill="none"
              stroke="#1f2a3f"
              strokeWidth="0.2"
              opacity="0.35"
            />
          </pattern>
        </defs>
        <rect width="100" height="100" fill={`url(#${gradientId})`} rx="6" />
        <rect width="100" height="100" fill={`url(#${gridId})`} opacity="0.2" rx="6" />
        {network.tracks.map((track) => (
          <TrackSegment key={track.id} stations={network.stations} track={track} accent={palette.rail} />
        ))}
        {network.stations.map((station) => (
          <StationNode key={station.id} station={station} stat={statsById.get(station.id)} maxScore={maxScore} />
        ))}
        <TrainTokens trains={trains} accent={palette.accent} glow={palette.glow} />
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
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, []);

  const palette = useMemo(() => getSeasonPalette(data?.season), [data?.season]);

  const countdown = useMemo(() => (data ? formatCountdown(data.season) : 'Preparing season...'), [data]);

  const stations = useMemo(() => data?.network?.stations ?? [], [data?.network]);
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
  const trainTokens = useMemo(() => {
    const network = data?.network;
    if (!network) return [];
    const stationLookup = new Map(network.stations.map((station) => [station.id, station]));
    const entries = data?.dispatchLog.entries ?? [];
    const tokens: TrainToken[] = [];
    for (const entry of entries) {
      if (entry.status !== 'en_route') continue;
      const from = stationLookup.get(entry.from);
      const to = stationLookup.get(entry.to);
      if (!from || !to) continue;
      const dispatchedMs = Date.parse(entry.dispatchedAt);
      const arrivalMs = Date.parse(entry.arrivalAt);
      if (Number.isNaN(dispatchedMs) || Number.isNaN(arrivalMs) || arrivalMs <= dispatchedMs) continue;
      const progress = clamp((nowMs - dispatchedMs) / (arrivalMs - dispatchedMs));
      if (progress >= 1) continue;
      tokens.push({
        id: entry.id,
        from,
        to,
        progress,
        congestion: entry.congestionFactor,
        dispatchedAt: entry.dispatchedAt,
        arrivalAt: entry.arrivalAt,
      });
    }
    return tokens;
  }, [data?.network, data?.dispatchLog.entries, nowMs]);

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
    <div
      className="relative min-h-screen overflow-hidden text-white"
      style={{
        background: `linear-gradient(160deg, ${palette.background} 0%, ${palette.backgroundAlt} 55%, #050910 100%)`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-40 top-[-6rem] h-[28rem] w-[28rem] rounded-full blur-3xl animate-orbit-slow"
          style={{
            background: `radial-gradient(circle, ${withAlpha(palette.glow, '66')} 0%, transparent 70%)`,
          }}
        />
        <div
          className="absolute right-[-10rem] top-[22%] h-[30rem] w-[30rem] rounded-full blur-3xl animate-drift-slower"
          style={{
            background: `radial-gradient(circle, ${withAlpha(palette.accent, '33')} 0%, transparent 65%)`,
          }}
        />
        <div
          className="absolute left-1/2 bottom-[-12rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full blur-3xl animate-orbit-slower"
          style={{
            background: `radial-gradient(circle, ${withAlpha(palette.rail, '22')} 0%, transparent 75%)`,
          }}
        />
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
              trains={trainTokens}
              palette={palette}
            />
            <StationStatsList
              stations={stations}
              statsById={stationStatsMap}
              maxScore={Math.max(maxCongestionScore, 0)}
              palette={palette}
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
