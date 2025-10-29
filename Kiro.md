# Kiro Workflow Summary

Signal Stack keeps Kiro enabled throughout development to streamline docs, compliance, and polish. This file captures the hooks exercised during the Reddit × Kiro Community Games Challenge.

## Active Hooks

| Hook file | Purpose | Trigger |
|-----------|---------|---------|
| `.kiro/hooks/client-readme-updater.kiro.hook` | Prompts the team to refresh README content (game summary, features, instructions) so the public app listing matches the latest build. | Any edit under `src/client/**/*` |
| `.kiro/hooks/devvit-fetch-guide.kiro.hook` | Provides Devvit fetch guidelines and allow-list reminders whenever we add HTTP calls. | Edits to `*.ts` / `*.js` files |
| `.kiro/hooks/splash-screen-generator.kiro.hook` | Requests updated splash-screen copy/art after asset or entrypoint updates, keeping the Reddit feed preview on brand. | Changes in `assets/`, `src/client/index.*`, or the main client entry |
| `.kiro/hooks/template-cleanup-hook.kiro.hook` | Offers to remove starter template code once we start customizing the project, avoiding dead assets and boilerplate. | Modifications to core project files (`main.ts`, `post.ts`, README, etc.) |

All hooks are committed so judges can verify our Kiro usage; we never ignore the `.kiro/` directory. During development we followed the prompts to:

1. Keep the README/game description in sync with feature updates.
2. Validate that any planned external requests would pass Devvit review.
3. Iterate on splash art whenever the theme or assets changed.
4. Strip template logic early so the repo stays focused on Signal Stack.

## Workflow Impact

- **Documentation:** Kiro’s README hook kept the project page on developers.reddit.com accurate without relying on memory after late-night coding sessions.
- **Compliance:** The fetch guide hook reminded us of the allow-list process whenever we considered external APIs, preventing accidental violations.
- **Polish:** Splash prompts made sure our main menu + splash remained consistent with the latest art direction and Reddit best practices.
- **Cleanup:** The template cleanup reminder helped us remove irrelevant Three.js boilerplate before it caused confusion.

These hooks plus the `.kiro/settings`/`steering` configs form the backbone of our award submission. They demonstrate how Kiro improved our workflow beyond basic code edits.
