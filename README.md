# Retro Tactical Notes

A local-first note-taking app with a rugged retro field-console interface. The first iteration stores every note and preference exclusively in the browser—no account, sync service, analytics, or server database.

## Features

- Create, edit, organize, favorite, search, and delete notes
- Folders, tags, color markers, Markdown shortcuts, and JSON backup/restore
- 350 ms auto-save with page-close and background protection
- 100-step undo/redo history with keyboard shortcuts
- Responsive mobile layout and configurable themes/density
- Browser `localStorage` persistence only

Existing installations continue to use the original `retro-notes:v1` storage keys so the rebrand does not lose local data.

## Development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

## Validation

```bash
npm run lint
npm test
```

The test suite covers note operations, filtering, tags, formatting helpers, backup validation, undo/redo history, and production rendering.

## GitHub Pages

Every push to `main` builds and deploys the static browser-only app to GitHub Pages. The Pages build uses `npm run build:pages` and is configured for the `/retro-tactical-notes/` project path.

## Privacy

All content remains on the current device in browser storage. Clearing site data removes the notes unless they were exported first.

## License

Copyright © 2026. All rights reserved.
