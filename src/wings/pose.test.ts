import { describe, expect, it } from "vitest";

import { FLAP, FOLLOW, HALO } from "./config";
import { type Arm, type Body, armLift, createWings, updateWings } from "./pose";

/** A body facing the camera, shoulders 1 unit apart, arms at `raise` (-1 down … 1 up). */
const body = (
  raise: number,
  opts: { y?: number; wristDx?: number } = {},
): Body => {
  const y = opts.y ?? 0;
  const angle = (raise * Math.PI) / 2; // from level
  const arm = (side: -1 | 1): Arm => {
    const shoulder = { x: side * 0.5, y };
    const elbow = {
      x: shoulder.x + side * 0.5 * Math.cos(angle),
      y: y + 0.5 * Math.sin(angle),
    };
    const wrist = {
      x:
        elbow.x +
        side * 0.5 * Math.cos(angle) +
        (side === -1 ? (opts.wristDx ?? 0) : 0),
      y: elbow.y + 0.5 * Math.sin(angle),
    };
    return { shoulder, elbow, wrist };
  };
  return { left: arm(-1), right: arm(1) };
};

const settle = (b: Body, seconds = 2) => {
  const s = createWings();
  for (let t = 0; t < seconds; t += 1 / 60) updateWings(s, b, 1 / 60);
  return s;
};

describe("armLift", () => {
  it("is -1 hanging, 0 level, 1 up", () => {
    expect(armLift(body(-1).left)).toBeCloseTo(-1, 1);
    expect(armLift(body(0).left)).toBeCloseTo(0, 5);
    expect(armLift(body(1).right)).toBeCloseTo(1, 1);
  });
});

describe("updateWings", () => {
  it("roots each wing near its own shoulder, sized by shoulder width, mirrored", () => {
    const s = settle(body(0));
    expect(s.left.x).toBeLessThan(0);
    expect(s.right.x).toBeGreaterThan(0);
    expect(Math.abs(s.left.x + 0.5)).toBeLessThan(0.2);
    expect(s.left.size).toBeCloseTo(s.right.size, 5);
    expect(s.left.rotation).toBeCloseTo(-s.right.rotation, 5);
    expect(s.left.opacity).toBe(1);
  });

  it("lifts the wings with the arms up and folds them with the arms down", () => {
    const up = settle(body(1));
    const level = settle(body(0));
    const down = settle(body(-1));
    // The left wing's tip rises clockwise (more negative rotation).
    expect(up.left.rotation).toBeLessThan(level.left.rotation);
    expect(down.left.rotation).toBeGreaterThan(level.left.rotation);
    expect(up.left.size).toBeGreaterThan(level.left.size);
    expect(down.left.size).toBeLessThan(level.left.size);
  });

  it("flaps on a fast arm swing, then settles", () => {
    const s = settle(body(0));
    expect(s.left.flap).toBeLessThan(0.01);
    // One frame where the left wrist jumps by 0.3 units (18 sw/s at 60 fps).
    updateWings(s, body(0, { wristDx: -0.3 }), 1 / 60);
    let peak = 0;
    for (let t = 0; t < 0.4; t += 1 / 60) {
      updateWings(s, body(0), 1 / 60);
      peak = Math.max(peak, s.left.flap);
    }
    expect(peak).toBeGreaterThan(0.5);
    expect(s.right.flap).toBeLessThan(0.01);
    for (let t = 0; t < 3; t += 1 / 60) updateWings(s, body(0), 1 / 60);
    expect(s.left.flap).toBeLessThan(0.05);
  });

  it("does not flap on an ordinary move during a slow frame", () => {
    const s = settle(body(0));
    // 0.3 units over a 1 s stall is 0.3 sw/s: slow, even though the step is capped.
    updateWings(s, body(0, { wristDx: -0.3 }), 1);
    expect(s.left.velocity).toBe(0);
  });

  it("flaps both wings on a jump", () => {
    const s = settle(body(0));
    const perFrame = (FLAP.jumpSpeed * 1.5) / 60; // shoulders 1 unit apart
    let y = 0;
    let peak = { left: 0, right: 0 };
    for (let t = 0; t < 0.4; t += 1 / 60) {
      if (t < 0.15) y += perFrame;
      updateWings(s, body(0, { y }), 1 / 60);
      peak = {
        left: Math.max(peak.left, s.left.flap),
        right: Math.max(peak.right, s.right.flap),
      };
    }
    expect(peak.left).toBeGreaterThan(0.5);
    expect(peak.right).toBeGreaterThan(0.5);
  });

  it("holds, then fades out when the body is lost", () => {
    const s = settle(body(0));
    updateWings(s, null, FOLLOW.hold * 0.5);
    expect(s.left.opacity).toBe(1);
    for (let t = 0; t < 1; t += 1 / 60) updateWings(s, null, 1 / 60);
    expect(s.left.opacity).toBe(0);
  });

  it("floats the halo above the head and tilts it with the head", () => {
    const head = {
      nose: { x: 0, y: 0.45 },
      leftEar: { x: -0.15, y: 0.5 },
      rightEar: { x: 0.15, y: 0.5 },
    };
    const s = settle({ ...body(0), head });
    expect(s.halo.x).toBeCloseTo(0, 3);
    expect(s.halo.y).toBeCloseTo(0.5 + HALO.up, 3);
    expect(s.halo.width).toBeCloseTo(HALO.width, 3);
    expect(s.halo.opacity).toBe(1);
    // Head tilted toward the screen-left shoulder: the ring tilts and shifts left.
    const tilted = settle({
      ...body(0),
      head: {
        ...head,
        leftEar: { x: -0.15, y: 0.42 },
        rightEar: { x: 0.15, y: 0.58 },
      },
    });
    expect(tilted.halo.roll).toBeGreaterThan(0.3);
    expect(tilted.halo.x).toBeLessThan(-0.1);
    // No head landmarks: the halo fades.
    for (let t = 0; t < 1; t += 1 / 60) updateWings(s, body(0), 1 / 60);
    expect(s.halo.opacity).toBe(0);
  });

  it("shows light rays only with both arms up", () => {
    expect(settle(body(1)).rays).toBeGreaterThan(0.95);
    expect(settle(body(0)).rays).toBeLessThan(0.01);
    const oneArm = body(0);
    oneArm.right = body(1).right;
    expect(settle(oneArm).rays).toBeLessThan(0.01);
  });
});
