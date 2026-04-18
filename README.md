# No Time

A desktop time tracker that automatically groups your activity into projects.

## Stack

- Electron 33 + React 19 + TypeScript 5
- Vite 6 (via `electron-vite`)
- Tailwind CSS v4 + ShadCN UI
- `electron-store` for persistence
- `active-win` for window tracking

## Getting started

Requires Node 20+.

```
npm install
npm run dev
```

A tray icon will appear. Click it to open the widget, or the dashboard opens automatically.

## How it works

- No Time polls the active window every second and attributes that second to an activity (app + window title).
- You create projects and optionally attach keyword rules. Any activity matching a rule is automatically grouped under that project.
- You can also manually assign any activity to any project — manual assignments always win over rules.
- All data is persisted locally in your OS's app data directory. Nothing leaves your machine.

## Scripts

- `npm run dev` — start the Electron app in dev mode
- `npm run build` — build for production
- `npm run lint` — run ESLint
- `npm run format` — format with Prettier
- `npm run typecheck` — run TypeScript without emitting

## Known issues

- Tray icon does not adapt to macOS dark mode yet.
