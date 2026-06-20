# Agent tooling guardrails

Rules for **agent-only** tooling (browser automation, E2E runners, debug CLIs) that support the coding session but are **not** part of the product runtime unless the user explicitly approves.

## Do not install without user approval

Before adding or upgrading any of the following in **any** `package.json` in the repo (including `devDependencies`), **stop and ask the user**:

- Playwright, Puppeteer, Cypress, Selenium WebDriver
- Other browser/E2E drivers or test runners added mainly for agent verification
- Similar packages installed only because the agent could not use IDE/MCP browser tools

**Allowed without prior approval** (when clearly required for the task the user requested):

- Dependencies that are part of the product or already listed in the project plan
- Package manager install / lockfile updates that only resolve existing declared dependencies
- One-off commands that do **not** modify the repo, e.g. `pnpm dlx playwright@…` in the terminal without writing to `package.json`

## Browser automation order

When the user asks to test or debug the UI in a browser:

1. **Prefer Cursor IDE browser MCP** (`cursor-ide-browser`) when enabled — read tool schemas before calling.
2. If MCP is unavailable, **say so** and ask whether to use manual browser, a one-off `pnpm dlx …`, or adding a dedicated E2E package — do **not** default to adding Playwright to `package.json`.
3. Prefer HTTP smoke against a **deployed staging URL** (Zeabur) when local dev server is unavailable (common in Cloud Agents).

## If tooling was added by mistake

1. Remove it from `package.json` and reinstall dependencies.
2. Clear framework build caches if applicable (e.g. `.next`, `dist`).
3. Tell the user to hard-reload the browser if UI was affected.
4. Note the failure mode in `docs/errors-and-learnings.md` if the project uses live docs.

## Duplicate dev servers

If a dev server reports another instance on the same port, do not start a second server unless the user wants a restart. Either use the running URL or stop the existing process after confirming with the user.
