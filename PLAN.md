# Plan — Wings

The user's request (2026-10-12): portrait segmentation, with **two wing images between the
background and the person**, attached by body tracking so they sit **behind the body like
wings** (reference: neon wings on the shoulders over a night-graded scene). There is no Brief.md.

## Decisions (the user's answers)

- **Anchor:** each wing rooted on its own shoulder.
- **Motion:** the wings **follow the arms** (arms up lifts and spreads them, arms down folds
  them in) and give a **big flap** on a fast arm swing or a jump. No idle flap.
- **Background:** **night-tinted camera** with a soft blue light behind the person.
- **Extras:** **wing glow** (a warm halo that brightens with lifted arms and flaps).
- **Improvements picked (round 1):** a **head halo**, **light rays** when both arms are up, and a
  **wing style switch** by tapping (Angel / Neon / Dark, all from the one wing image).
- **Round 2:** a **peace sign ✌️ also switches** the style (tap kept), with an on-screen
  instruction.
- **Art:** the user's `public/images/wing.png` (one wing, root bottom right), mirrored for the
  other side.
- **Preview:** the dev media switcher starts on the SDK's built-in "Person Fullbody" video, so a
  fresh clone needs no clip. An optional local clip at `dev-media/dancing.mp4` (the user's dance
  clip: 1080×1920, 29 s, 43 MB) is listed first and used instead. It's loaded by a glob-style
  dynamic import, so a missing file only gives an esbuild "empty-glob" warning; the generated
  lookup then throws synchronously, so the import runs inside a `.then`. The clip is outside
  `public/` and `src/` (never ships) and git-ignored (licence not cleared for a public repo).

## Composition

| renderOrder | Layer      | What                                                       |
| ----------- | ---------- | ---------------------------------------------------------- |
| 0           | background | camera `ScreenImage`, tinted `#26305a`                     |
| 10          | light      | soft radial light behind the shoulders (additive)          |
| 20          | rays       | fan of light rays, arms up only (additive, slowly turning) |
| 40          | wing glow  | blurred silhouette of each wing (additive)                 |
| 50          | wings      | two planes, one texture + wing shader, right one mirrored  |
| 60          | halo back  | far half of the head halo, behind the head                 |
| 100         | person     | `PersonCutout`, feather 5 / erode 0.9                      |
| 110         | halo front | near half of the head halo, in front                       |

The wings and lights are meshes on the stage (z = 0) rather than `ScreenImage`s: they move and
rotate every frame, and a rotated child of a full-screen `ScreenTransform` would shear with the
screen aspect. The stage has uniform units and sorts by renderOrder with the screen layers.

## Pipeline

1. `<BodyTracker />` registers the pose model; `useXRModelNode(XRModel.BODY_TRACKER)` gives
   `getLandmarks2D()` (33 tracker points, centre origin, y up).
2. Shoulders, elbows and wrists go to stage units and are **sorted by screen side**, so the
   camera's mirroring never matters.
3. `updateWings` (`src/wings/pose.ts`, pure, unit-tested):
   - root = shoulder, moved in toward the spine and up (in shoulder widths, along the shoulder
     line); size = 1.75 × shoulder width; everything rolls with the shoulder line;
   - **arm lift** = the upper arm's angle from hanging (−1 down, 0 level, 1 up), smoothed;
     lift raises the tip 32° and grows the wing; fold lowers it 28° and shrinks it;
   - **flap** = a damped spring (2.4 Hz, ζ 0.22) kicked when a wrist moves faster than 6 shoulder
     widths/s (that wing) or the shoulders rise faster than 2.2 widths/s (both wings), with a
     0.45 s cooldown;
   - lost body: hold 0.3 s, then fade out; snap back in on return.
   - **halo**: over the ear midpoint, up 0.44 sw along the head's own up, tilting with the head
     (max 30°), 0.56 sw wide; it fades with the head landmarks;
   - **rays**: strength = smoothstep(0.35 → 0.8) of the LOWER arm's lift, so both arms must be up.
4. `Wings.tsx` applies the transforms, glow strength (base + lift + flap), the rays, the light and
   the halo. Near the top of the frame the halo drops up to 0.15 sw to stay in view, never more.

## Styles (peace sign or tap to switch)

`STYLES` in `config.ts`: each sets the wing look and the glow, halo, rays and light colours, eased
over ~0.3 s; a switch pops the wings and flares the glow, and the prompt shows "<Name> wings".

- **Angel**: the art as is, warm gold glow and halo.
- **Neon**: the wing shader draws the art as lines (silhouette edge + the feathers' shading
  edges), cyan at the root to pink at the tip.
- **Dark**: the art multiplied by violet-grey, purple glow and halo.

**Peace sign:** `PeaceSwitch.tsx` uses the SDK's `useGesture("peaceSign")` (one shared hand model,
15 fps, 250 ms hold, 900 ms cooldown). `onBegin` fires once per sign, so holding it doesn't cycle.
Checked on the SDK's "Person Peace Sign" sample (score ≈ 0.81 → switched once and held). The hand
model takes a few seconds to load before the first sign counts.

**Taps** are read on R3F's event source (the canvas wrapper), skipping buttons / links / inputs, so
overlay layers can't swallow them and floating dev panels don't trigger them. "✌️ Peace sign or tap to switch wings" shows at the bottom while tracked (after 2 s) until the
first switch, then for 4 s after every 25 s without one (`HINT` in `config.ts`).

## Notes

- The pivot is the wing's shoulder joint, measured at (330, 270) in the 360 px art.
- The two halo halves are what let the ring pass behind the head when it settles onto the hair.
- On the dance clip the arms stay low (lift ≈ −0.6…−1), so the wings rest folded; flaps fire
  on the fast moves. The built-in preview runs at ~1 fps, so check flap feel on a phone.
- Tuning lives in `src/wings/config.ts`.

## Production

- The dev media switcher and the `window.__wings` hook are dev-only (inline `NODE_ENV` guards).
- The production build ships the wing art and nothing from `dev-media/`.
