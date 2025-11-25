# Development

## Setup
- Install dependencies: `npm install`
- Build TypeScript: `npm run compile`
- Debug: open the folder in VS Code and press `F5` to launch the extension host.
- Node target: `moduleResolution`/`module` are set to `Node16`; keep this when updating `tsconfig.json`.

## Scripts
- `npm run compile` — type-check and emit to `out/`
- `npm run watch` — incremental build
- `npm test` — Vitest suite (covers `applySteps`)

## Publishing
- Update metadata in `package.json` (`publisher`/`author`/`repository`/`homepage`) as needed.
- Package: `npx vsce package`
- Publish: `npx vsce publish`
- Marketplace category: `Other`
- Extension icon: `media/icon.png` (PNG only; SVG not accepted by vsce)

## Troubleshooting
- If commands are missing, reload the window (Cmd/Ctrl+Shift+P → Reload Window).
- If npm is unavailable, you can temporarily use the prebuilt `out/` files, but rebuild before release.
