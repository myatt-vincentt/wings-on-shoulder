// Tuning for the wings. Lengths are in shoulder widths (sw) unless noted, so the
// wings keep their proportions at any distance from the camera.

/** The wing art: one wing, root (shoulder joint) at the bottom right, tip top left. */
export const WING_ART = {
  url: "/images/wing.png",
  /** The root in the image's UV space (0..1, y up): measured at (330, 270) of 360 px. */
  pivot: [0.917, 0.25] as const,
};

export const WING = {
  /** Wing image size (it is square). */
  size: 1.75,
  /** The root sits this far in from the shoulder (toward the spine) … */
  inward: 0.12,
  /** … and this far up, so the cut-out hides it. */
  up: 0.08,
  /** Extra rotation at rest (degrees, + raises the tip). */
  baseDeg: -12,
};

/** Arm-following: the upper arm's elevation (0 = hanging, 90° = level, 180° = up). */
export const ARMS = {
  /** Wing lift at arms fully up (degrees) and scale growth. */
  liftDeg: 32,
  liftScale: 0.12,
  /** Wing fold at arms fully down (degrees, lowers the tip) and scale shrink. */
  foldDeg: 28,
  foldScale: 0.14,
  /** Elevation range (radians) from level to fully up / fully down. */
  range: 1.2,
  /** Smoothing rate (1/s). */
  rate: 9,
};

/** A big flap: a damped spring kicked by fast arm swings or a jump. */
export const FLAP = {
  /** Wrist speed (sw per second) that triggers a flap. */
  wristSpeed: 6,
  /** Upward body speed (sw per second) that triggers a flap on both wings. */
  jumpSpeed: 2.2,
  /** Kick (radians per second; negative = downstroke first). */
  impulse: -9,
  /** Spring frequency (Hz) and damping ratio. */
  freq: 2.4,
  damping: 0.22,
  /** No new kick for this long (s). */
  cooldown: 0.45,
  /** The angle (radians) counted as a full-strength flap, for glow and spread. */
  full: 0.45,
  /** Wing spread (scale) at a full-strength flap. */
  spread: 0.1,
};

/** Following the shoulders. */
export const FOLLOW = {
  /** Position / size / roll smoothing rate (1/s). */
  rate: 18,
  /** Keep the last pose this long after the body is lost (s) … */
  hold: 0.3,
  /** … then fade out at this rate (1/s); fade in at `fadeIn`. */
  fadeOut: 4,
  fadeIn: 5,
};

/** The night look. */
export const NIGHT = {
  /** Camera tint (multiplies the feed). */
  tint: "#26305a",
  /** Soft light behind the person (colour from the style): radius (sw) and strength. */
  lightRadius: 2.6,
  lightStrength: 0.7,
};

/** The halo around each wing (its colour comes from the style). */
export const GLOW = {
  /** Glow image blur (px of the 360 px art) and its size relative to the wing. */
  blur: 16,
  pad: 0.22,
  /** Opacity at rest, extra with lifted arms, extra at a full flap. */
  base: 0.35,
  lift: 0.25,
  flap: 0.6,
};

/** The ring above the head. Lengths in shoulder widths. */
export const HALO = {
  /** Above the ear midpoint, and ring width. */
  up: 0.44,
  width: 0.56,
  /** Ring height / width (seen from a little above). */
  aspect: 0.3,
  /** Near the frame top it drops at most this far (sw) to stay in view. */
  maxDrop: 0.15,
  /** Head tilt followed, at most (degrees). */
  maxRoll: 30,
  /** Gentle float (sw) and speed (rad/s). */
  bob: 0.025,
  bobSpeed: 1.8,
  strength: 0.95,
};

/** Light rays behind the shoulders when both arms are up. */
export const RAYS = {
  /** Lift of the LOWER arm (−1 … 1) where rays begin and reach full strength. */
  from: 0.35,
  full: 0.8,
  fadeIn: 2.5,
  fadeOut: 3,
  /** Size (sw), spin (rad/s), strength and ray count. */
  size: 6,
  spin: 0.12,
  strength: 0.8,
  count: 14,
};

/**
 * Wing styles, cycled by tapping the screen. `mode` 0 shows the art (multiplied
 * by `tint`), 1 draws it as neon lines (its outline and feather edges) in a
 * gradient from `neonA` to `neonB`. `glow`, `halo`, `rays` and `light` colour
 * the wing glow, head halo, light rays and the light behind the body.
 */
export const STYLES = [
  {
    name: "Angel",
    mode: 0,
    tint: "#ffffff",
    neonA: "#ffffff",
    neonB: "#ffffff",
    glow: "#ffe2a8",
    halo: "#ffd36b",
    rays: "#ffe7b0",
    light: "#5b7cff",
  },
  {
    name: "Neon",
    mode: 1,
    tint: "#ffffff",
    neonA: "#3ee8ff",
    neonB: "#ff4fd8",
    glow: "#45c8ff",
    halo: "#6ff3ff",
    rays: "#8f7bff",
    light: "#4f5dff",
  },
  {
    name: "Dark",
    mode: 0,
    tint: "#4b4166",
    neonA: "#ffffff",
    neonB: "#ffffff",
    glow: "#a64dff",
    halo: "#c06bff",
    rays: "#8a3dff",
    light: "#7a3cff",
  },
] as const;

/** Peace-sign switching: hand model rate, hold before it counts, and the gap before the next. */
export const PEACE = { fps: 15, holdMs: 250, cooldownMs: 900 };

/**
 * The "how to switch" instruction: shown while tracked until the first switch
 * (after `after` s), then again for `for` s after every `every` s without one.
 */
export const HINT = {
  text: "✌️ Peace sign or tap to switch wings",
  after: 2,
  every: 25,
  for: 4,
};

/** A style switch pops the wings and glow; the name shows this long (s). */
export const SWITCH = { pop: 0.12, glow: 0.6, decay: 4, label: 1.6 };
