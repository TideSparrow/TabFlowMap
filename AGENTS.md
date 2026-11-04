# Project rules

- Scope: Tab Flow Map only. Do not add SEO, AI, account, analytics or remote-update features.
- Keep the original tab-map interactions and recovery behavior when changing the shell or translations.
- All UI text, errors, tooltips and accessibility labels must support English, Simplified Chinese and Japanese.
- Never commit secrets, local browser data, environment files or generated packages.
- Run `pnpm check`, `pnpm build` and `pnpm zip` before delivery.
- Prefer files under 800 lines; split only along clear responsibilities.
