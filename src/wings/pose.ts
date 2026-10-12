// The wings' pose (from the body tracker's shoulders, elbows and wrists), the
// head halo (nose and ears) and the arms-up light rays. Pure: stage units in,
// transforms out, so it is unit-tested and frame-rate
// independent.
//
// Stage space: x right, y up, uniform units (the world plane the wings sit on).
// "left" / "right" are SCREEN sides: the caller sorts the landmarks by where they
// appear, so the mirror of a selfie camera never matters here.
import { ARMS, FLAP, FOLLOW, HALO, RAYS, WING } from "./config";

export type Pt = { x: number; y: number };

/** One side's landmarks, in stage units. */
export type Arm = { shoulder: Pt; elbow: Pt; wrist: Pt };

/** Head landmarks in stage units; the ears sorted by screen side. */
export type Head = { nose: Pt; leftEar: Pt; rightEar: Pt };

export type Body = { left: Arm; right: Arm; head?: Head };

export type Halo = {
  /** Ring centre (stage units), width, tilt (radians) and 0..1 visibility. */
  x: number;
  y: number;
  width: number;
  roll: number;
  opacity: number;
};

export type Wing = {
  /** Root position (stage units). */
  x: number;
  y: number;
  /** Rotation about the root (radians, CCW), as applied to this side's mesh. */
  rotation: number;
  /** Wing image size (stage units). */
  size: number;
  /** -1 folded (arms down) … 0 level … 1 lifted (arms up). */
  lift: number;
  /** 0..1 strength of the current flap. */
  flap: number;
  /** 0..1 visibility. */
  opacity: number;
  // Internal state.
  liftRaw: number;
  angle: number;
  velocity: number;
  cooldown: number;
  prevWrist: Pt | null;
};

export type Wings = {
  left: Wing;
  right: Wing;
  /** Smoothed shoulder width and shoulder-line roll. */
  sw: number;
  roll: number;
  /** Body centre (between the shoulders) for the halo. */
  centre: Pt;
  halo: Halo;
  /** 0..1 strength of the arms-up light rays. */
  rays: number;
  /** Seconds since the body was last seen; Infinity before the first sighting. */
  lost: number;
  prevCentreY: number | null;
};

const createWing = (): Wing => ({
  x: 0,
  y: 0,
  rotation: 0,
  size: 0,
  lift: 0,
  flap: 0,
  opacity: 0,
  liftRaw: 0,
  angle: 0,
  velocity: 0,
  cooldown: 0,
  prevWrist: null,
});

export const createWings = (): Wings => ({
  left: createWing(),
  right: createWing(),
  sw: 0,
  roll: 0,
  centre: { x: 0, y: 0 },
  halo: { x: 0, y: 0, width: 0, roll: 0, opacity: 0 },
  rays: 0,
  lost: Infinity,
  prevCentreY: null,
});

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const DEG = Math.PI / 180;
const smoothstep = (lo: number, hi: number, v: number) => {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Upper-arm lift: -1 hanging down, 0 level, 1 straight up. Measured as the
 * angle of shoulder → elbow from straight down.
 */
export const armLift = (arm: Arm): number => {
  const dx = arm.elbow.x - arm.shoulder.x;
  const dy = arm.elbow.y - arm.shoulder.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 0;
  const elevation = Math.acos(clamp(-dy / len, -1, 1)); // 0 down … π up
  return clamp((elevation - Math.PI / 2) / ARMS.range, -1, 1);
};

/** Kick a wing's spring (a big flap), respecting its cooldown. */
const kick = (w: Wing) => {
  if (w.cooldown > 0) return;
  w.velocity += FLAP.impulse;
  w.cooldown = FLAP.cooldown;
};

const stepSpring = (w: Wing, dt: number) => {
  const omega = 2 * Math.PI * FLAP.freq;
  // Semi-implicit Euler in small steps: stable at any frame time.
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const accel =
      -omega * omega * w.angle - 2 * FLAP.damping * omega * w.velocity;
    w.velocity += accel * h;
    w.angle += w.velocity * h;
  }
  w.cooldown = Math.max(0, w.cooldown - dt);
  w.flap = clamp(Math.abs(w.angle) / FLAP.full, 0, 1);
};

/**
 * The halo floats above the head: over the ear midpoint, up along the head's
 * own "up" (perpendicular to the ear line), sized by shoulder width so a turned
 * head (ears close together) doesn't shrink it.
 */
const updateHalo = (
  s: Wings,
  head: Head | undefined,
  snap: boolean,
  k: number,
  step: number,
) => {
  const h = s.halo;
  if (!head) {
    h.opacity = Math.max(0, h.opacity - FOLLOW.fadeOut * step);
    return;
  }
  const mx = (head.leftEar.x + head.rightEar.x) / 2;
  const my = (head.leftEar.y + head.rightEar.y) / 2;
  const roll = clamp(
    Math.atan2(
      head.rightEar.y - head.leftEar.y,
      head.rightEar.x - head.leftEar.x,
    ),
    -HALO.maxRoll * DEG,
    HALO.maxRoll * DEG,
  );
  h.roll = snap ? roll : h.roll + (roll - h.roll) * k;
  const up = HALO.up * s.sw;
  const tx = mx - Math.sin(h.roll) * up;
  const ty = my + Math.cos(h.roll) * up;
  h.x = snap ? tx : h.x + (tx - h.x) * k;
  h.y = snap ? ty : h.y + (ty - h.y) * k;
  h.width = HALO.width * s.sw;
  h.opacity = Math.min(1, h.opacity + FOLLOW.fadeIn * step);
};

/**
 * Advance the wings one frame. `body` is null when nobody is tracked. `dt` in
 * seconds. Mutates `s`.
 */
export const updateWings = (s: Wings, body: Body | null, dt: number): void => {
  // Motion steps are capped (a stalled tab must not fling the spring); speeds use
  // the real elapsed time, or a slow frame would make every move look fast.
  const step = Math.max(0, Math.min(dt, 0.25));
  const elapsed = Math.max(0, dt);

  if (!body) {
    s.lost += step;
    for (const w of [s.left, s.right]) {
      stepSpring(w, step);
      if (s.lost > FOLLOW.hold)
        w.opacity = Math.max(0, w.opacity - FOLLOW.fadeOut * step);
      w.prevWrist = null;
    }
    if (s.lost > FOLLOW.hold)
      s.halo.opacity = Math.max(0, s.halo.opacity - FOLLOW.fadeOut * step);
    s.rays = Math.max(0, s.rays - RAYS.fadeOut * step);
    s.prevCentreY = null;
    return;
  }

  const { left: L, right: R } = body;
  const sw = Math.hypot(
    R.shoulder.x - L.shoulder.x,
    R.shoulder.y - L.shoulder.y,
  );
  if (sw < 1e-4) return;
  const roll = Math.atan2(
    R.shoulder.y - L.shoulder.y,
    R.shoulder.x - L.shoulder.x,
  );
  const centre = {
    x: (L.shoulder.x + R.shoulder.x) / 2,
    y: (L.shoulder.y + R.shoulder.y) / 2,
  };

  // Snap after a gap (first sighting or fully faded out), otherwise follow smoothly.
  const snap =
    s.lost === Infinity || (s.left.opacity === 0 && s.right.opacity === 0);
  const k = snap ? 1 : ease(FOLLOW.rate, step);
  s.sw += (sw - s.sw) * k;
  s.roll += (roll - s.roll) * k;
  s.centre.x += (centre.x - s.centre.x) * k;
  s.centre.y += (centre.y - s.centre.y) * k;
  s.lost = 0;

  // A jump flaps both wings.
  if (s.prevCentreY !== null && elapsed > 0) {
    const rise = (centre.y - s.prevCentreY) / elapsed / sw;
    if (rise > FLAP.jumpSpeed) {
      kick(s.left);
      kick(s.right);
    }
  }
  s.prevCentreY = centre.y;

  const cos = Math.cos(s.roll);
  const sin = Math.sin(s.roll);
  const sides: [Wing, Arm, -1 | 1][] = [
    [s.left, L, -1],
    [s.right, R, 1],
  ];
  for (const [w, arm, side] of sides) {
    // Root: in from the shoulder toward the spine and up, along the shoulder line.
    const along = -side * WING.inward * s.sw;
    const up = WING.up * s.sw;
    const tx = arm.shoulder.x + along * cos - up * sin;
    const ty = arm.shoulder.y + along * sin + up * cos;
    w.x = snap ? tx : w.x + (tx - w.x) * k;
    w.y = snap ? ty : w.y + (ty - w.y) * k;

    // Follow the arm.
    const target = armLift(arm);
    w.liftRaw = snap
      ? target
      : w.liftRaw + (target - w.liftRaw) * ease(ARMS.rate, step);
    w.lift = w.liftRaw;

    // A fast arm swing flaps this wing.
    if (w.prevWrist && elapsed > 0) {
      const speed =
        Math.hypot(arm.wrist.x - w.prevWrist.x, arm.wrist.y - w.prevWrist.y) /
        elapsed /
        sw;
      if (speed > FLAP.wristSpeed) kick(w);
    }
    w.prevWrist = { ...arm.wrist };
    stepSpring(w, step);

    // Angle that raises the tip: lift up, fold down, the flap on top.
    const liftAngle =
      w.lift >= 0 ? w.lift * ARMS.liftDeg * DEG : w.lift * ARMS.foldDeg * DEG;
    const raise = WING.baseDeg * DEG + liftAngle + w.angle;
    // The left wing's tip points up-left, so raising it turns clockwise; the
    // right wing is its mirror image.
    w.rotation = s.roll + side * raise;

    const liftScale =
      w.lift >= 0 ? w.lift * ARMS.liftScale : w.lift * ARMS.foldScale;
    w.size = WING.size * s.sw * (1 + liftScale + w.flap * FLAP.spread);
    w.opacity = Math.min(1, w.opacity + FOLLOW.fadeIn * step);
  }

  // Light rays: both arms up.
  const raysTarget = smoothstep(
    RAYS.from,
    RAYS.full,
    Math.min(s.left.lift, s.right.lift),
  );
  const raysRate = raysTarget > s.rays ? RAYS.fadeIn : RAYS.fadeOut;
  s.rays += (raysTarget - s.rays) * ease(raysRate, step);

  updateHalo(s, body.head, snap, k, step);
};
