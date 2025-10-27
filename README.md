# Signal Stack – Seasonal Rail Dispatcher

Signal Stack is a Devvit Web experience where redditors co-manage a persistent rail network that evolves across seasons. Each season introduces new objectives, but the world history remains accessible through archives. This repository now ships the second milestone: a playable dispatcher console with a quick-dispatch action, live season metadata, and a rolling log of community trains.

- **Platform**: Devvit Web 0.12 (React client + Express server bundle)
- **Focus**: Community coordination, seasonal resets, persistent lore
- **Current milestone**: Interactive dispatcher console featuring a quick dispatch action, congestion-aware ETAs, automatic arrival tick handling, station heatmaps, and a live activity log alongside the mock rail network and season timer.

## Quick start

```bash
npm install            # install dependencies and produce initial build
npm run dev            # runs client/server builders + devvit playtest (requires devvit login)
```

> Make sure you have Node.js 22.x and the Devvit CLI authenticated (`npm install -g devvit`, `devvit login`). The playtest command will open a temporary subreddit post where you can inspect the dispatcher console in situ.

Useful scripts:

- `npm run build` – one-off production build for client + server
- `npm run type-check` – TypeScript project references build
- `npm run lint` – ESLint across `src`
- `npm run dev:vite` – optional local preview of the client at `http://localhost:7474` (pairs with `npm run dev:server` if you want to hit the Express API outside playtest)

### Testing shortcuts

- Copy `.env.template` to `.env` and set `DISPATCH_DEBUG_SPEED` to a value like `60` to shrink ETAs to roughly one minute per real-time second.
- Cooldowns remain in real seconds so you can still rehearse the pacing loop without waiting half an hour.
- Use the in-app **Clear dispatch log (debug)** button or run `./scripts/clear_dispatches.sh` (starts `npm run dev` with `CLEAR_DISPATCH_LOG=1`; stop it with `Ctrl+C` after the playtest boots, then relaunch normally).

## Repository layout

```
assets/                     # Splash & icon media used in Devvit posts
src/
  client/                   # React interface rendered in the Reddit post webview
    hooks/useDispatcherInit # Fetches `/api/init` and exposes loading/error states
  server/                   # Express server compiled for Devvit runtime
    core/season.ts          # Loads or seeds the active season + network in Redis
    core/dispatch.ts        # Persists dispatch records and cooldowns
    core/post.ts            # Creates the custom post with splash metadata
  shared/types/signal.ts    # Shared TypeScript types for season + network payloads
seasonal-rail-plan.md       # High-level roadmap for future milestones
```

`/dist` is generated automatically by the build scripts and is ignored from version control.

## API surface (Milestone 2)

- `GET /api/init` → `{ type: 'init', season, network, dispatchLog }`
  - `season` contains `id`, `name`, `description`, `startedAt`, `durationHours`.
  - `network` holds a minimal graph of three stations and two track segments.
  - `dispatchLog.entries` lists the most recent shared trains, including status, dispatcher, and ETA.
  - `dispatchLog.cooldownRemainingSeconds` shows how long the current user must wait before dispatching again.
- `POST /api/dispatch` → `{ type: 'dispatch', dispatch, dispatchLog }`
  - Validates that the route exists, enforces a per-user cooldown, assigns an ETA based on network distance, and persists the record to Redis.
  - Returns the refreshed `dispatchLog` so the client can sync without another `GET`.
- Internal endpoints (`/internal/on-app-install`, `/internal/menu/post-create`) create the splash post for moderators.

## Seasonal reset strategy (planned)

We are targeting a **soft reset** model: each season snapshots the previous network into an archive while seeding a new active graph. The default Redis keys are structured so we can later introduce `signal-stack:season:<id>` archives and keep the live state at `signal-stack:season:active`. See `seasonal-rail-plan.md` for the broader roadmap.

## Next steps

1. Persist station-level metrics (deliveries, delays) and surface congestion heatmaps.
2. Introduce dispatcher action cards (maintenance, upgrades) with shared resource budgets.
3. Build the season rollover flow plus an archived timeline viewer.
4. Integrate Kiro workflows (prompt generation, weekly summaries) before submission.

## Compliance checklist

- No Reddit IP is used; all art assets are bespoke (`assets/signal-stack-*.png`).
- Player data is limited to aggregated state; future milestones will continue to keep per-user data minimal and respect deletion requirements.
- `.env` files are ignored from Git; secrets should be managed through Devvit configuration.

Feel free to open playtest, try the console, and leave TODOs for the next sprint.
