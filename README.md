# Retro Tactical Notes

A local-first note-taking app with a rugged retro field-console interface. Notes and preferences stay in the browser—no account, sync service, analytics, or server database.

## Features

- Create, edit, organize, favorite, search, and delete notes
- Folders, tags, color markers, Markdown shortcuts, rendered preview, and JSON backup/restore
- Interactive Markdown task-list checkboxes that update the underlying note
- Rendered Markdown tables with a toolbar shortcut
- Archive-first deletion with restore and permanent-delete actions
- Tag navigation with reusable-tag autocomplete
- 350 ms auto-save with page-close and background protection
- 100-step undo/redo history with keyboard shortcuts
- Responsive mobile layout and configurable themes/density
- Browser `localStorage` persistence only
- Optional note chat and rewrite actions through OVHcloud's anonymous OpenAI-compatible endpoint

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

The test suite covers note operations, filtering, tags, formatting helpers, backup validation, undo/redo history, mocked LLM success/error/rate-limit behavior, and production rendering.

## GitHub Pages

Every push to `main` builds and deploys the static browser-only app to GitHub Pages. The Pages build uses `npm run build:pages` and is configured for the `/retro-tactical-notes/` project path.

## Privacy

Notes remain on the current device in browser storage. When a user submits an AI chat or rewrite request, the active note and recent chat context are sent directly from the browser to the public OVHcloud endpoint. No API key or chat transcript is stored by the app. Clearing site data removes the notes unless they were exported first.

## License

Copyright © 2026. All rights reserved.
