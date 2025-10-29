import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
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
import mainMenuImageUrl from './assets/main-menu/signal_stack_9x16.png';
import tutorialBackgroundImageUrl from './assets/tutorial/tutorial_background.png';
import networkBackgroundUrl from './assets/network/rail_overlay.png';

const MAIN_MENU_IMAGE = mainMenuImageUrl;
const TUTORIAL_BACKGROUND_IMAGE = tutorialBackgroundImageUrl;
const NETWORK_BACKGROUND_IMAGE = networkBackgroundUrl;

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

  const dx = to.position.x - from.position.x;
  const dy = to.position.y - from.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const lengthSafe = distance === 0 ? 1 : distance;
  const baseOffset = Math.min(12, lengthSafe * 0.35);
  let hash = 0;
  for (const char of track.id) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  }
  const sign = hash % 2 === 0 ? 1 : -1;
  const offsetX = (-dy / lengthSafe) * baseOffset * sign;
  const offsetY = (dx / lengthSafe) * baseOffset * sign;
  const controlX = (from.position.x + to.position.x) / 2 + offsetX;
  const controlY = (from.position.y + to.position.y) / 2 + offsetY;
  const pathData = `M ${from.position.x} ${from.position.y} Q ${controlX} ${controlY} ${to.position.x} ${to.position.y}`;

  return (
    <path
      key={track.id}
      d={pathData}
      fill="none"
      stroke={track.status === 'open' ? accent : '#a8b5c7'}
      strokeWidth={2.5}
      strokeDasharray={track.status === 'open' ? '0' : '6 4'}
      strokeLinecap="round"
    />
  );
};

const STATION_ACCENTS: Record<string, string> = {
  port: '#60a5fa',
  industrial: '#fb923c',
  settlement: '#a855f7',
  agricultural: '#4ade80',
  junction: '#facc15',
  outpost: '#7dd3fc',
};

const getHeatmapColor = (normalized: number): string => {
  const clamped = Math.max(0, Math.min(1, normalized));
  const start = { r: 93, g: 168, b: 255 };
  const end = { r: 217, g: 75, b: 125 };
  const mix = (a: number, b: number) => Math.round(a + (b - a) * clamped);
  return `rgb(${mix(start.r, end.r)}, ${mix(start.g, end.g)}, ${mix(start.b, end.b)})`;
};

const getStationAccent = (station: Station): string => {
  for (const tag of station.tags) {
    if (STATION_ACCENTS[tag]) {
      return STATION_ACCENTS[tag];
    }
  }
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
    case 'agricultural':
      return (
        <>
          <rect x={-1.8} y={-0.6} width={3.6} height={1.6} rx={0.4} fill={accent} opacity={0.85} />
          <path d="M-1.6 0 L1.6 -0.8" stroke="#0f1a23" strokeWidth={0.25} strokeLinecap="round" />
          <path d="M-1.2 0.5 L1.8 -0.3" stroke="#0f1a23" strokeWidth={0.25} strokeLinecap="round" />
          <circle cx={0.2} cy={-1.2} r={0.6} fill="#fde68a" stroke="#0f1a23" strokeWidth={0.2} />
        </>
      );
    case 'junction':
      return (
        <>
          <rect x={-0.4} y={-1.8} width={0.8} height={3.6} rx={0.3} fill={accent} opacity={0.9} />
          <rect x={-1.8} y={-0.4} width={3.6} height={0.8} rx={0.3} fill={accent} opacity={0.9} />
          <circle cx={0} cy={0} r={0.6} fill="#0f1a23" />
        </>
      );
    case 'outpost':
      return (
        <>
          <rect x={-0.6} y={-1.2} width={1.2} height={2.4} rx={0.3} fill={accent} opacity={0.85} />
          <polygon points="0,-2 1.2,-1 0,0 -1.2,-1" fill={accent} stroke="#0f1a23" strokeWidth={0.2} />
          <circle cx={0} cy={-1.2} r={0.35} fill="#f8fafc" />
        </>
      );
    default:
      return <circle cx={0} cy={0} r={1.4} fill={accent} />;
  }
};

const TAB_DEFINITIONS = [
  { id: 'dispatch', label: 'Dispatch' },
  { id: 'stations', label: 'Stations' },
  { id: 'history', label: 'History' },
  { id: 'objectives', label: 'Objectives' },
  { id: 'alerts', label: 'Alerts' },
] as const;

type TabId = (typeof TAB_DEFINITIONS)[number]['id'];

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

const MainMenu = ({
  onPlay,
  onTutorial,
}: {
  onPlay: () => void;
  onTutorial: () => void;
}) => (
  <div className="relative flex min-h-screen items-end justify-center overflow-hidden">
    <div
      className="absolute inset-0 bg-cover bg-center"
      style={{ backgroundImage: `url('${MAIN_MENU_IMAGE}')` }}
    />
    <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 pb-16 text-center text-black">
      <div className="flex flex-col gap-4 sm:flex-row">
        <button
          className="w-full rounded-2xl border border-amber-300 bg-amber-400 px-8 py-3 text-sm font-semibold uppercase tracking-wide text-amber-950 transition hover:border-amber-400 hover:bg-amber-500 sm:w-44"
          onClick={onPlay}
        >
          Play
        </button>
        <button
          className="w-full rounded-2xl border border-slate-400/70 bg-white/80 px-8 py-3 text-sm font-semibold uppercase tracking-wide text-slate-900 transition hover:border-slate-500 hover:bg-white sm:w-44"
          onClick={onTutorial}
        >
          Tutorial
        </button>
      </div>
      <div className="flex flex-col items-center gap-3 text-xs text-slate-900/90">
        <span className="rounded-full border border-slate-400/60 bg-white/70 px-4 py-1 uppercase tracking-[0.35em]">
          Seasonal Dispatch Challenge
        </span>
        <span className="rounded-full border border-slate-400/60 bg-white/80 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-700">
          Coordinate trains, dodge network incidents, and push the community line forward before the season ends.
        </span>
        <span className="rounded-full border border-slate-400/60 bg-white/80 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-700">
          Pro tip: the console shines on desktop.
        </span>
      </div>
    </div>
  </div>
);

const TutorialScreen = ({
  onBack,
  onPlay,
}: {
  onBack: () => void;
  onPlay: () => void;
}) => (
  <div className="relative min-h-screen overflow-hidden text-slate-900">
    <div
      className="absolute inset-0 bg-cover bg-center"
      style={{
        backgroundImage: `url('${TUTORIAL_BACKGROUND_IMAGE}')`,
        backgroundAttachment: 'fixed',
      }}
    />
    <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10 md:py-14">
      <div className="flex items-center justify-between text-slate-900">
        <button
          className="rounded-xl border border-slate-400/80 bg-white/80 px-4 py-2 text-xs uppercase tracking-wide text-slate-900 transition hover:border-slate-500 hover:bg-white"
          onClick={onBack}
        >
          ← Back
        </button>
        <button
          className="rounded-xl border border-amber-300/70 bg-amber-400/60 px-4 py-2 text-xs uppercase tracking-wide text-amber-900 transition hover:border-amber-400 hover:bg-amber-400/80"
          onClick={onPlay}
        >
          Jump in
        </button>
      </div>

      <header className="rounded-3xl border border-slate-400/40 bg-white/85 p-6 text-slate-900 backdrop-blur-sm">
        <h1 className="text-3xl font-semibold md:text-4xl">How to Run the Line</h1>
        <p className="mt-2 text-sm md:text-base">
          Signal Stack is a co-op dispatcher built for community play. Dispatch trains together, chase seasonal objectives, and keep the network humming.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <article className="rounded-3xl border border-slate-300/50 bg-white/85 p-6 text-slate-900 backdrop-blur-sm">
          <h2 className="text-lg font-semibold">Dispatch Loop</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>• Pick a departure station and a destination.</li>
            <li>• Each dispatch has a short cooldown per player to prevent spamming.</li>
            <li>• Active trains increase congestion, stretching the next ETA.</li>
            <li>• Random operational alerts can slow specific stations—watch the sidebar.</li>
          </ul>
        </article>
        <article className="rounded-3xl border border-slate-300/50 bg-white/85 p-6 text-slate-900 backdrop-blur-sm">
          <h2 className="text-lg font-semibold">Season Goals</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>• Complete shared objectives before the season timer expires.</li>
            <li>• Deliveries feed long-term milestones for the whole subreddit.</li>
            <li>• Keep congestion in check to unlock special events and reroutes.</li>
            <li>• Seasons reset on schedule, but highlights persist in the post.</li>
          </ul>
        </article>
        <article className="rounded-3xl border border-slate-300/50 bg-white/85 p-6 text-slate-900 backdrop-blur-sm md:col-span-2">
          <h2 className="text-lg font-semibold">Tips for Coordinators</h2>
          <ul className="mt-3 grid gap-4 text-sm md:grid-cols-2">
            <li>
              <strong className="block text-slate-950">Speed tweaks</strong>
              Use the debug controls (bottom of the play console) to test at accelerated speed before going live.
            </li>
            <li>
              <strong className="block text-slate-950">Clearing jams</strong>
              Reset cooldowns or the dispatch log from the same panel to simulate fresh starts.
            </li>
            <li>
              <strong className="block text-slate-950">Team planning</strong>
              On busy nights, split duties: one player focuses on Ember Field supply while others feed Frostford.
            </li>
            <li>
              <strong className="block text-slate-950">Feedback</strong>
              Drop ideas in the post comments—events and objectives rotate between seasons based on community input.
            </li>
          </ul>
        </article>
      </section>

      <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-300/50 bg-white/85 p-6 text-center text-sm text-slate-900 backdrop-blur-sm">
        <p className="text-slate-800">
          Ready? Hit play to open the dispatcher console. Playtest progress wipes when the season flips, so experiment freely!
        </p>
        <button
          className="rounded-2xl border border-emerald-400/80 bg-emerald-400/60 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-900 transition hover:border-emerald-500 hover:bg-emerald-400/80"
          onClick={onPlay}
        >
          Launch Console
        </button>
      </div>
    </main>
  </div>
);

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
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/85 p-4 text-sm text-slate-600">
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
            className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-900 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span>
                {entry.from} → {entry.to}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${
                  inTransit ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                }`}
              >
                {inTransit ? 'En route' : 'Arrived'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
              <span>Dispatched by {entry.dispatchedBy}</span>
              <span className="text-slate-400">•</span>
              <span>{timeAgo(entry.dispatchedAt)}</span>
              <span className="text-slate-400">•</span>
              <span>
                {inTransit ? `ETA ${timeUntil(entry.arrivalAt)}` : `Arrived ${timeAgo(entry.arrivalAt)}`}
              </span>
              <span className="text-slate-400">•</span>
              <span>Load {slowdown}</span>
              <span className="text-slate-400">•</span>
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
  <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 text-slate-900 shadow-sm backdrop-blur-sm">
    <h2 className="text-base font-semibold">Station load</h2>
    <p className="mt-1 text-xs text-slate-500">Heatmap colors correspond to the bubbles on the map.</p>
    <ul className="mt-3 space-y-2 text-sm">
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
            className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/95 px-3 py-3"
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
            <div className="relative flex items-center justify-between gap-4 text-slate-900">
              <div className="flex items-center gap-3 text-slate-900">
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white"
                  style={{ boxShadow: `0 0 18px ${withAlpha(accent, '22')}` }}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: chipColor }}
                    aria-hidden
                  />
                </span>
                <div>
                  <div className="text-sm font-semibold">{station.name}</div>
                  <div className="text-xs text-slate-600">{loadLabel}</div>
                </div>
              </div>
              <div className="flex flex-col items-end text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-700">
                    {stat ? `${stat.deliveries} Delivered` : 'No Runs'}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
                    {stat ? `${stat.delays} Delays` : '—'}
                  </span>
                </div>
                <span className="mt-1 text-slate-500">
                  {stat ? `Avg delay ${stat.averageDelaySeconds}s` : 'Awaiting data'}
                </span>
              </div>
            </div>
            <div className="relative mt-3 h-1.5 rounded-full bg-slate-200/70">
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
      <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 text-sm text-slate-600 shadow-sm backdrop-blur-sm">
        No objectives configured yet. They’ll appear here once season goals are defined.
      </div>
    );
  }
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 text-slate-900 shadow-sm backdrop-blur-sm">
      <h2 className="text-base font-semibold">Season objectives</h2>
      <ul className="mt-3 space-y-3 text-sm text-slate-700">
        {objectives.map((objective) => {
          const target = objective.target || 1;
          const progressFraction = Math.max(0, Math.min(objective.progress / target, 1));
          const percent = Math.round(progressFraction * 100);
          const statusChip =
            objective.status === 'completed'
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : objective.status === 'active'
              ? 'bg-amber-100 text-amber-700 border border-amber-200'
              : 'bg-slate-100 text-slate-700 border border-slate-200';
          const tooltip = `Stations: ${
            objective.stationIds.length ? objective.stationIds.join(', ') : 'All'
          }`;
          return (
            <li key={objective.id} className="rounded-2xl border border-slate-200 bg-white/95 px-3 py-3 shadow-sm">
              <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                <span title={tooltip}>{objective.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${statusChip}`}>
                  {objective.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{objective.description}</p>
              <div className="mt-2 h-2 rounded-full bg-slate-200/60">
                <div
                  className="h-full rounded-full bg-amber-400/80"
                  style={{ width: `${percent}%` }}
                  aria-hidden
                />
              </div>
              <div className="mt-1 text-xs text-slate-600">
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
      <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 text-sm text-slate-600 shadow-sm backdrop-blur-sm">
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
    <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 text-slate-900 shadow-sm backdrop-blur-sm">
      <h2 className="text-base font-semibold">Operational alerts</h2>
      <ul className="mt-3 space-y-3 text-sm text-slate-700">
        {events.map((event) => {
          const eta = timeUntil(event.expiresAt);
          const visual = resolveVisual(event);
          return (
            <li
              key={event.id}
              className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/95 px-4 py-4 shadow-sm"
            >
              <div
                className="absolute inset-0 opacity-60"
                style={{
                  background: `linear-gradient(135deg, ${withAlpha(visual.glow, '28')} 0%, transparent 65%)`,
                }}
                aria-hidden
              />
              <div className="relative flex items-start justify-between gap-3 text-slate-900">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white"
                    style={{ boxShadow: `0 0 22px ${withAlpha(visual.base, '38')}` }}
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
                      <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-700">
                        {visual.label}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white/75 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
                        ×{event.multiplier.toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-1 max-w-[16rem] text-sm text-slate-700">{event.description}</p>
                    <p className="text-xs text-slate-500">Expires in {eta}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500">
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
  seasonName,
  seasonCountdown,
}: {
  network: NetworkSnapshot | null;
  statsById: Map<string, StationStats>;
  maxScore: number;
  trains: TrainToken[];
  palette: SeasonPalette;
  seasonName: string;
  seasonCountdown: string;
}) => {
  if (!network) {
    return (
      <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white/85 text-sm text-slate-600 shadow-sm">
        Network data loading...
      </div>
    );
  }

  const gridId = `bg-grid-${palette.id}`;

  return (
    <div
      className="relative h-full rounded-3xl border border-slate-200 bg-white p-4 shadow-sm overflow-hidden"
      style={{
        backgroundImage: `url('${NETWORK_BACKGROUND_IMAGE}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <svg viewBox="0 0 104 104" className="h-full w-full" role="img" aria-label="Rail network">
        <defs>
          <pattern id={gridId} width="10" height="10" patternUnits="userSpaceOnUse">
            <path
              d="M10 0 L0 0 0 10"
              fill="none"
              stroke="#cbd5f5"
              strokeWidth="0.2"
              opacity="0.3"
            />
          </pattern>
        </defs>
        <rect width="104" height="104" fill={`url(#${gridId})`} rx="6" opacity="0.3" />
        {network.tracks.map((track) => (
          <TrackSegment key={track.id} stations={network.stations} track={track} accent={palette.rail} />
        ))}
        {network.stations.map((station) => (
          <StationNode key={station.id} station={station} stat={statsById.get(station.id)} maxScore={maxScore} />
        ))}
        <TrainTokens trains={trains} accent={palette.accent} glow={palette.glow} />
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[18%] bg-gradient-to-t from-[#fef7e8] via-[#fef7e8]/95 to-transparent" />
      <div className="absolute inset-x-6 bottom-4 flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-xs text-slate-700 shadow">
        <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Season</span>
        <span className="text-sm font-semibold text-slate-900">{seasonName}</span>
        <span className="text-sm text-slate-700">{seasonCountdown}</span>
      </div>
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
  const [screen, setScreen] = useState<'menu' | 'tutorial' | 'play'>('menu');
  const [activeTab, setActiveTab] = useState<TabId>('dispatch');

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
    if (screen !== 'play' || activeCount <= 0) return;
    const timer = window.setInterval(() => load(), 15000);
    return () => window.clearInterval(timer);
  }, [screen, activeCount, load]);


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

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dispatch':
        return (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 text-slate-900 shadow-sm backdrop-blur-sm">
              <h2 className="text-base font-semibold">Dispatch console</h2>
              <p className="mt-1 text-sm text-slate-600">
                Pick a departure and destination to schedule a shared train. Each dispatcher has a short cooldown before they can queue another run.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col text-sm text-slate-700">
                  <span className="mb-1 font-semibold text-slate-900">From</span>
                  <select
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-amber-300 focus:outline-none"
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
                <label className="flex flex-col text-sm text-slate-700">
                  <span className="mb-1 font-semibold text-slate-900">To</span>
                  <select
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-amber-300 focus:outline-none"
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
              <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                <span>
                  {cooldownSeconds > 0 ? `Cooldown: ${cooldownSeconds}s remaining` : 'Ready to dispatch'}
                </span>
                <span>Load: {networkLoadLabel} ({activeCount} active)</span>
              </div>
              <button
                className="mt-4 w-full rounded-2xl border border-amber-300 bg-amber-200 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                disabled={dispatchDisabled}
                onClick={handleDispatch}
              >
                {dispatching ? 'Dispatching…' : 'Dispatch shared train'}
              </button>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-2">
                  <label className="text-xs uppercase tracking-wide text-slate-600" htmlFor="speed-multiplier">Speed x</label>
                  <input
                    id="speed-multiplier"
                    type="number"
                    min="0"
                    step="10"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900 shadow-sm focus:border-amber-300 focus:outline-none sm:w-24"
                    value={speedInput}
                    onChange={(event) => setSpeedInput(Number(event.target.value) || 0)}
                  />
                </div>
                <button
                  className="rounded-2xl border border-slate-300 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  disabled={dispatching}
                  onClick={() => setDispatchSpeed(speedInput)}
                >
                  {dispatching ? 'Working…' : 'Apply speed'}
                </button>
                <button
                  className="rounded-2xl border border-slate-300 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  disabled={dispatching}
                  onClick={() => clearDispatches()}
                >
                  {dispatching ? 'Working…' : 'Clear log'}
                </button>
                <button
                  className="rounded-2xl border border-slate-300 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  disabled={dispatching}
                  onClick={() => resetCooldown()}
                >
                  {dispatching ? 'Working…' : 'Reset cooldown'}
                </button>
              </div>
            </div>
          </div>
        );
      case 'stations':
        return (
          <StationStatsList
            stations={stations}
            statsById={stationStatsMap}
            maxScore={Math.max(maxCongestionScore, 0)}
            palette={palette}
          />
        );
      case 'history':
        return (
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 text-slate-900 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Latest dispatches</h2>
              <button
                className="rounded-xl border border-slate-300 bg-white/90 px-3 py-1 text-xs uppercase tracking-wide text-slate-700 transition hover:border-amber-300 hover:bg-amber-100"
                disabled={loading}
                onClick={() => load()}
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            <DispatchLogList entries={data?.dispatchLog.entries ?? []} />
          </div>
        );
      case 'objectives':
        return <ObjectivesList objectives={objectives} />;
      case 'alerts':
        return <EventsList events={events} />;
      default:
        return null;
    }
  };

  if (screen === 'menu') {
    return <MainMenu onPlay={() => setScreen('play')} onTutorial={() => setScreen('tutorial')} />;
  }

  if (screen === 'tutorial') {
    return <TutorialScreen onBack={() => setScreen('menu')} onPlay={() => setScreen('play')} />;
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden text-slate-900"
      style={{
        background: 'linear-gradient(155deg, #fef7e8 0%, #faf3d7 45%, #f3e8c4 100%)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-40 top-[-6rem] h-[26rem] w-[26rem] rounded-full blur-[130px] animate-orbit-slow"
          style={{
            background: 'radial-gradient(circle, rgba(253, 230, 138, 0.65) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute right-[-8rem] top-[24%] h-[28rem] w-[28rem] rounded-full blur-[140px] animate-drift-slower"
          style={{
            background: 'radial-gradient(circle, rgba(251, 191, 36, 0.35) 0%, transparent 65%)',
          }}
        />
        <div
          className="absolute left-1/2 bottom-[-12rem] h-[32rem] w-[32rem] -translate-x-1/2 rounded-full blur-[150px] animate-orbit-slower"
          style={{
            background: 'radial-gradient(circle, rgba(253, 186, 116, 0.28) 0%, transparent 75%)',
          }}
        />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col md:flex-row">
        <aside className="w-full md:w-1/2">
          <div className="px-6 py-8 md:sticky md:top-0 md:h-screen md:px-8 md:py-12">
            <div className="h-[55vh] md:h-full">
              <NetworkMap
                network={data?.network ?? null}
                statsById={stationStatsMap}
                maxScore={maxCongestionScore}
                trains={trainTokens}
                palette={palette}
                seasonName={data?.season.name ?? 'Season syncing'}
                seasonCountdown={countdown}
              />
            </div>
          </div>
        </aside>
        <section className="flex w-full flex-col gap-6 px-6 pb-12 md:w-1/2 md:h-screen md:overflow-y-auto md:px-8 md:py-12">
          <header className="rounded-3xl border border-slate-200 bg-white/90 p-6 text-slate-900 shadow-sm backdrop-blur-md">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-semibold md:text-3xl">Signal Stack</h1>
                <p className="text-sm text-slate-600 md:text-base">
                  Coordinate community trains across seasons. This console now supports shared dispatch runs.
                </p>
              </div>
              <button
                className="mt-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-amber-300 hover:bg-amber-100 md:mt-0"
                onClick={() => setScreen('menu')}
              >
                Exit to menu
              </button>
            </div>
          </header>

          {error && (
            <div className="rounded-3xl border border-rose-200 bg-rose-100 p-4 text-sm text-rose-900 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <p>{error}</p>
                <button
                  className="rounded-lg border border-rose-300 bg-white/90 px-3 py-1 text-xs uppercase tracking-wide text-rose-700 transition hover:border-rose-400 hover:bg-rose-200"
                  onClick={() => load()}
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {actionMessage && (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-100 p-4 text-sm text-emerald-900 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <p>{actionMessage}</p>
                <button
                  className="rounded-lg border border-emerald-300 bg-white/90 px-3 py-1 text-xs uppercase tracking-wide text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-200"
                  onClick={clearActionFeedback}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {actionError && (
            <div className="rounded-3xl border border-rose-200 bg-rose-100 p-4 text-sm text-rose-900 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <p>{actionError}</p>
                <button
                  className="rounded-lg border border-rose-300 bg-white/90 px-3 py-1 text-xs uppercase tracking-wide text-rose-700 transition hover:border-rose-400 hover:bg-rose-200"
                  onClick={clearActionFeedback}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur-sm">
            <div className="flex flex-wrap gap-2">
              {TAB_DEFINITIONS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    'rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition',
                    activeTab === tab.id
                      ? 'border-amber-300 bg-amber-200 text-amber-900'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-100'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            {renderTabContent()}
          </div>

          <footer className="pb-4 text-xs text-slate-300/80">
            Season data resets on schedule but the rail history will persist in archives. Expect gameplay updates as we iterate on dispatch mechanics. Share feedback in the post comments to shape upcoming seasons.
          </footer>
        </section>
      </main>
    </div>
  );
};
