# dev-media

Optional dev-only preview media. Nothing here ships: only
`src/DevMediaSwitcher.tsx` reads this folder, and it is stripped from
production builds.

You don't need anything here. Without a webcam, `pnpm dev` starts on the SDK's
built-in "Person Fullbody" video and lists every SDK sample video and image.

To preview with your own clip, add a portrait video of a moving person at
`dev-media/dancing.mp4`; it is listed first and used as the start. Clips here
are git-ignored (the original dance clip's licence isn't cleared for a public
repo). Restart `pnpm dev` after adding or removing one.
