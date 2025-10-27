# Seasonal Rail Dispatcher – First Milestone Plan

## Vision
Create a persistent, community-managed rail network that periodically enters new "seasons". Seasons introduce temporary objectives, but the underlying world history remains accessible through archives. Players act as dispatchers who schedule trains, upgrade infrastructure, and respond to system events.

## Milestone 0: Scaffolding & Stub Gameplay
The first deliverable is a minimal Devvit Web app that:
- renders a simple map with 3 stations and one track in the post webview
- shows the current season name, start date, and time remaining
- exposes `/api/init` returning season info and the mock network graph
- stores the current season in Redis so it can later be swapped/reset

### Server tasks
- Configure Devvit metadata (`devvit.json`) with new app name and assets.
- Implement `/api/init` that returns `{ season, network }`.
- Seed a default season document in Redis if missing, with:
  - season id, name, start timestamp
  - duration (e.g., 14 days)
  - archived flag (false)
  - initial network graph (stations + track segments)

### Client tasks
- React component fetches `/api/init` on mount.
- Display a hero banner containing:
  - season name + countdown timer
  - CTA text about the upcoming dispatcher role
- Render the mock rail network (three nodes, single line) using simple SVG.
- Show a placeholder action panel: "Dispatch actions coming soon".

### Data sketch
```ts
Season = {
  id: string;
  name: string;
  startedAt: string; // ISO
  durationHours: number;
  description: string;
};

Station = {
  id: string;
  name: string;
  position: { x: number; y: number }; // percentage of viewBox
  tags: string[];
};

Track = {
  id: string;
  from: string; // station id
  to: string;
  status: 'open' | 'under_construction';
};

InitResponse = {
  season: Season;
  network: { stations: Station[]; tracks: Track[] };
};
```

### Season reset strategy (future milestone)
- Keep a master `network:v{n}` key for each season’s final state.
- On season rollover, snapshot current state into an archive key and init a fresh active key with carry-over structures selected by mods/community.
- Provide a timeline viewer so players can step through prior seasons.

## Next Steps After Milestone 0
1. Implement dispatcher actions (schedule train, upgrade track).
2. Add congestion simulation and scheduled ticks.
3. Introduce collaborative objectives per season.
4. Build archival viewer for previous seasons.

This plan ensures we build from a solid foundation while keeping the experience shippable to Devvit early for feedback.

## Milestone 1: Quick Dispatch Prototype (completed)
Goal: deliver the first interactive loop so playtesters can schedule trains together.

### Server
- Added Redis-backed dispatch log with per-user cooldown tracking.
- Implemented `POST /api/dispatch`, ensuring routes exist on the current network graph and calculating ETAs from layout distance.
- Extended `/api/init` to include the rolling dispatch log so clients stay in sync at load time.

### Client
- Replaced the placeholder sidebar with a quick-dispatch form and recent activity feed.
- Surfaced cooldown state, success toasts, and failure messaging to guide early playtesters.
- Continued to render the SVG network map and season banner as context for the new interaction.

### Open items carried forward
- Simulate train ticks / congestion rather than purely time-based ETAs.
- Add additional action cards (maintenance crews, upgrades).
- Ship the season archive browser and community goal tracker.

## Milestone 2: Congestion-aware runs (completed)
- Added congestion factors and cooldown-based auto tick so trains settle without manual refresh.
- Dispatch durations now scale with active traffic; arrivals are recorded automatically and old entries expire after an hour.
- In-app debug tools now let us clear logs, reset cooldowns, and adjust speed multipliers on the fly.

## Milestone 3: Station metrics & objectives (planned)
- Track deliveries, delays, and throughput per station to highlight bottlenecks.
- Render a heatmap overlay (color intensity based on congestion/delay) in the map.
- Introduce collaborative objectives (daily/seasonal goals) tied to station performance.
