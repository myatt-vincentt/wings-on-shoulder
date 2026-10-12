# dev-media

Dev-only preview media. Nothing here ships: only `src/DevMediaSwitcher.tsx`
imports from this folder, and it is stripped from production builds.

`pnpm dev` expects a portrait clip of a moving person at
`dev-media/dancing.mp4` (the original was a 1080×1920 dance clip). It is
git-ignored (its licence isn't cleared for a public repo), so add your own
before running the dev server.
