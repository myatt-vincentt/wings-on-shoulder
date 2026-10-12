// Wings behind the person, composed the SDK's way for portrait segmentation:
// one ScreenSpaceUI with the tinted camera below and PersonCutout above, and the
// wings drawn in between.
//
//   renderOrder 0    background — the camera, night-tinted (ScreenImage)
//   renderOrder 10   light      — soft light behind the body
//   renderOrder 20   rays       — light rays fanning out when both arms are up
//   renderOrder 40   wing glow  — a blurred copy of each wing (additive)
//   renderOrder 50   wings      — two planes, one image, the right one mirrored
//   renderOrder 60   halo back  — the far half of the head halo, behind the head
//   renderOrder 100  person     — PersonCutout, so the wings sit behind the body
//   renderOrder 110  halo front — the near half of the head halo
//
// The wings and lights are plain meshes on the stage (the z = 0 plane), not
// ScreenImages: they move and rotate every frame, and a rotated child of a
// full-screen ScreenTransform would shear with the screen's aspect ratio. The
// stage has uniform units and draws in renderOrder with the screen layers.
//
// Pose: BodyTracker landmarks (shoulders, elbows, wrists, nose, ears), sorted by
// screen side and handed to the pure updateWings (pose.ts). Tapping the screen
// cycles the wing style (STYLES in config.ts); the neon style is drawn from the
// same art by the wing shader.
import { Suspense, useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  type Mesh,
  type MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  type Texture,
  TextureLoader,
  Vector2,
} from "three";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  FULL_SCREEN_ANCHORS,
  PersonCutout,
  ScreenImage,
  ScreenSpaceUI,
  XRModel,
} from "@vincentt-xr/sdk";
import {
  useXRCameraTexture,
  useXRModelNode,
  type XRModelNodeBodyTracking,
} from "@vincentt-xr/sdk/low-level";
import { BodyTracker } from "@vincentt-xr/sdk/tracking";

import { GLOW, HALO, NIGHT, RAYS, STYLES, SWITCH, WING_ART } from "./config";
import { type Arm, type Body, createWings, updateWings } from "./pose";

/** Live state for the prompt and the dev hook. */
export const wingsState = {
  tracked: false,
  wings: createWings(),
  /** Index into STYLES, and seconds since the last switch (Infinity: never). */
  style: 0,
  sinceSwitch: Infinity,
};

/** Cycle to the next wing style. */
export const nextStyle = () => {
  wingsState.style = (wingsState.style + 1) % STYLES.length;
  wingsState.sinceSwitch = 0;
};

// MediaPipe pose indices (the person's own left / right).
const NOSE = 0;
const EAR = [7, 8] as const;
const SHOULDER = [11, 12] as const;
const ELBOW = [13, 14] as const;
const WRIST = [15, 16] as const;

/** A plane of `size` whose origin is the wing root, so it rotates and scales about it. */
const makeWingGeometry = (size = 1) => {
  const g = new PlaneGeometry(size, size);
  g.translate(0.5 - WING_ART.pivot[0], 0.5 - WING_ART.pivot[1], 0);
  return g;
};

/** The wing's silhouette, blurred and filled white (tinted by the material), with padding. */
const makeGlowTexture = (
  image: CanvasImageSource & { width: number; height: number },
) => {
  const pad = Math.round(image.width * GLOW.pad);
  const canvas = document.createElement("canvas");
  canvas.width = image.width + pad * 2;
  canvas.height = image.height + pad * 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.filter = `blur(${GLOW.blur}px)`;
    ctx.drawImage(image, pad, pad);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return new CanvasTexture(canvas);
};

/** A soft round light (white; tinted by the material). */
const makeLightTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(canvas);
};

/** A fan of soft rays from the centre (white; tinted by the material). */
const makeRaysTexture = () => {
  const n = 256;
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const c = n / 2;
    ctx.translate(c, c);
    for (let i = 0; i < RAYS.count; i++) {
      const a = (i / RAYS.count) * Math.PI * 2;
      // Alternate ray widths so the fan doesn't look stamped.
      const half = (Math.PI / RAYS.count) * (0.35 + 0.15 * (i % 3));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, c, a - half, a + half);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fill();
    }
    // Fade toward the rim, and hollow out the centre (the body sits there).
    ctx.globalCompositeOperation = "destination-in";
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.18, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-c, -c, n, n);
  }
  return new CanvasTexture(canvas);
};

/** Halo texture: a 256 px wide ring with this much glow margin on each side. */
const HALO_TEX = { width: 256, margin: 24 };

/**
 * One half of the head halo, a glowing ellipse ring (white; tinted by the
 * material): `back` keeps the far (upper) half, otherwise the near (lower) half.
 */
const makeHaloTexture = (back: boolean) => {
  const w = HALO_TEX.width;
  const m = HALO_TEX.margin;
  const h = Math.round((w - 2 * m) * HALO.aspect) + 2 * m;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const rx = w / 2 - m;
    const ry = h / 2 - m;
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 16;
    ctx.strokeStyle = "#fff";
    for (const [width, alpha] of [
      [9, 0.35],
      [4, 1],
    ] as const) {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.clearRect(0, back ? h / 2 : 0, w, h / 2);
  }
  return new CanvasTexture(canvas);
};

/**
 * The wing: mode 0 shows the art times `uTint`; mode 1 draws it as neon lines,
 * the silhouette's edge plus the feathers' own shading edges, coloured along the
 * wing from `uNeonA` (root) to `uNeonB` (tip).
 */
const makeWingMaterial = (map: Texture) =>
  new ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uTexel: { value: new Vector2(1 / 360, 1 / 360) },
      uMode: { value: 0 },
      uOpacity: { value: 0 },
      uTint: { value: new Color("#fff") },
      uNeonA: { value: new Color("#fff") },
      uNeonB: { value: new Color("#fff") },
      uGain: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec2 uTexel;
      uniform float uMode;
      uniform float uOpacity;
      uniform vec3 uTint;
      uniform vec3 uNeonA;
      uniform vec3 uNeonB;
      uniform float uGain;
      varying vec2 vUv;

      float luma(vec4 c) { return dot(c.rgb, vec3(0.299, 0.587, 0.114)) * c.a; }

      void main() {
        vec4 c = texture2D(uMap, vUv);
        if (uMode < 0.5) {
          gl_FragColor = vec4(c.rgb * uTint * uGain, c.a * uOpacity);
        } else {
          float aMax = 0.0;
          float aMin = 1.0;
          float lEdge = 0.0;
          float l0 = luma(c);
          for (int i = 0; i < 8; i++) {
            float ang = float(i) * 0.785398;
            vec2 d = vec2(cos(ang), sin(ang)) * uTexel;
            vec4 s = texture2D(uMap, vUv + d * 2.5);
            aMax = max(aMax, s.a);
            aMin = min(aMin, s.a);
            lEdge = max(lEdge, abs(luma(texture2D(uMap, vUv + d * 1.5)) - l0));
          }
          float outline = smoothstep(0.25, 0.75, aMax - aMin);
          float feathers = smoothstep(0.05, 0.16, lEdge) * c.a * 0.75;
          float line = max(outline, feathers);
          // Root (bottom right) to tip (top left).
          float t = clamp(length(vUv - vec2(0.92, 0.25)) / 1.1, 0.0, 1.0);
          vec3 col = mix(uNeonA, uNeonB, t) * (1.2 + 0.8 * outline) * uGain;
          gl_FragColor = vec4(col, line * uOpacity);
        }
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });

const toStage = (
  pts: { x: number; y: number }[],
  i: number,
  halfW: number,
  halfH: number,
) => ({ x: pts[i].x * halfW, y: pts[i].y * halfH });

/** Taps on these are left to the control under the finger. */
const TAP_IGNORE =
  'button, a, input, select, textarea, label, [role="button"], [role="menu"], [role="dialog"]';

const STYLE_KEYS = [
  "tint",
  "neonA",
  "neonB",
  "glow",
  "halo",
  "rays",
  "light",
] as const;

const WingLayers = () => {
  const { viewport, camera } = useThree();
  const cameraTexture = useXRCameraTexture();
  const body = useXRModelNode<XRModelNodeBodyTracking>(XRModel.BODY_TRACKER);
  const wingTex = useLoader(TextureLoader, WING_ART.url) as Texture;

  const geometry = useMemo(() => makeWingGeometry(), []);
  // The glow image is padded on every side; the pivot offset stays the same.
  const glowGeometry = useMemo(() => makeWingGeometry(1 + 2 * GLOW.pad), []);
  const wingMats = useMemo(
    () => [makeWingMaterial(wingTex), makeWingMaterial(wingTex)] as const,
    [wingTex],
  );
  const glowTex = useMemo(
    () => makeGlowTexture(wingTex.image as HTMLImageElement),
    [wingTex],
  );
  const lightTex = useMemo(makeLightTexture, []);
  const raysTex = useMemo(makeRaysTexture, []);
  const haloBackTex = useMemo(() => makeHaloTexture(true), []);
  const haloFrontTex = useMemo(() => makeHaloTexture(false), []);
  // Style colours, eased toward the current style.
  const colors = useMemo(
    () => ({
      ...(Object.fromEntries(
        STYLE_KEYS.map((key) => [key, new Color(STYLES[0][key])]),
      ) as Record<(typeof STYLE_KEYS)[number], Color>),
      target: new Color(),
    }),
    [],
  );

  useEffect(() => {
    wingTex.colorSpace = SRGBColorSpace;
    wingTex.needsUpdate = true;
    const img = wingTex.image as
      | { width?: number; height?: number }
      | undefined;
    if (img?.width && img.height) {
      for (const m of wingMats)
        m.uniforms.uTexel.value.set(1 / img.width, 1 / img.height);
    }
  }, [wingTex, wingMats]);
  useEffect(
    () => () => {
      for (const d of [
        geometry,
        glowGeometry,
        glowTex,
        lightTex,
        raysTex,
        haloBackTex,
        haloFrontTex,
        ...wingMats,
      ])
        d.dispose();
    },
    [
      geometry,
      glowGeometry,
      glowTex,
      lightTex,
      raysTex,
      haloBackTex,
      haloFrontTex,
      wingMats,
    ],
  );

  // Tap the scene to switch styles. Listened for on R3F's event source (the
  // canvas wrapper), not the canvas: layers drawn over the canvas inside the
  // wrapper would swallow the tap, and floating panels outside it (the SDK's dev
  // tools) shouldn't count. Taps on real controls are left to them.
  const eventSource = useThree((st) => st.events.connected) as
    | HTMLElement
    | undefined;
  useEffect(() => {
    const el = eventSource;
    if (!el) return undefined;
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button > 0) return;
      const target = e.target as Element | null;
      if (target?.closest?.(TAP_IGNORE)) return;
      nextStyle();
    };
    el.addEventListener("pointerdown", onDown);
    return () => el.removeEventListener("pointerdown", onDown);
  }, [eventSource]);

  const wingL = useRef<Mesh>(null);
  const wingR = useRef<Mesh>(null);
  const glowL = useRef<Mesh>(null);
  const glowR = useRef<Mesh>(null);
  const light = useRef<Mesh>(null);
  const rays = useRef<Mesh>(null);
  const haloBack = useRef<Mesh>(null);
  const haloFront = useRef<Mesh>(null);

  useFrame((state, dt) => {
    const { width: vw, height: vh } = viewport.getCurrentViewport(
      camera,
      [0, 0, 0],
    );
    const t = state.clock.elapsedTime;
    const pts = body?.getLandmarks2D?.();
    let input: Body | null = null;
    if (pts && pts.length > WRIST[1]) {
      const at = (i: number) => toStage(pts, i, vw / 2, vh / 2);
      const arm = (side: 0 | 1): Arm => ({
        shoulder: at(SHOULDER[side]),
        elbow: at(ELBOW[side]),
        wrist: at(WRIST[side]),
      });
      const a = arm(0);
      const b = arm(1);
      const ea = at(EAR[0]);
      const eb = at(EAR[1]);
      // Screen sides, whatever the camera's mirroring.
      const flip = a.shoulder.x > b.shoulder.x;
      input = {
        left: flip ? b : a,
        right: flip ? a : b,
        head: {
          nose: at(NOSE),
          leftEar: ea.x <= eb.x ? ea : eb,
          rightEar: ea.x <= eb.x ? eb : ea,
        },
      };
    }
    const s = wingsState.wings;
    updateWings(s, input, dt);
    wingsState.tracked = input !== null;
    wingsState.sinceSwitch += dt;

    // Style: ease the colours over; a switch pops the wings and flares the glow.
    const style = STYLES[wingsState.style];
    const ce = 1 - Math.exp(-8 * dt);
    for (const key of STYLE_KEYS)
      colors[key].lerp(colors.target.set(style[key]), ce);
    const pop = Math.exp(-SWITCH.decay * wingsState.sinceSwitch);

    const place = (
      wing: typeof s.left,
      mesh: Mesh | null,
      glow: Mesh | null,
      mirror: 1 | -1,
    ) => {
      const size = wing.size * (1 + SWITCH.pop * pop);
      for (const m of [mesh, glow]) {
        if (!m) continue;
        m.position.set(wing.x, wing.y, 0);
        m.rotation.z = wing.rotation;
        m.scale.set(size * mirror, size, 1);
        m.visible = wing.opacity > 0.001;
      }
      if (mesh) {
        const u = (mesh.material as ShaderMaterial).uniforms;
        u.uOpacity.value = wing.opacity;
        u.uMode.value = style.mode;
        u.uTint.value.copy(colors.tint);
        u.uNeonA.value.copy(colors.neonA);
        u.uNeonB.value.copy(colors.neonB);
        u.uGain.value = 1 + 0.5 * wing.flap;
      }
      if (glow) {
        const mat = glow.material as MeshBasicMaterial;
        const strength =
          GLOW.base +
          GLOW.lift * Math.max(0, wing.lift) +
          GLOW.flap * wing.flap +
          SWITCH.glow * pop;
        mat.opacity = wing.opacity * Math.min(1, strength);
        mat.color.copy(colors.glow);
      }
    };
    place(s.left, wingL.current, glowL.current, 1);
    place(s.right, wingR.current, glowR.current, -1);

    const bodyOpacity = Math.max(s.left.opacity, s.right.opacity);
    if (light.current) {
      light.current.visible = bodyOpacity > 0.001;
      light.current.position.set(s.centre.x, s.centre.y - s.sw * 0.3, 0);
      const r = NIGHT.lightRadius * s.sw * 2;
      light.current.scale.set(r, r * 1.15, 1);
      const mat = light.current.material as MeshBasicMaterial;
      mat.opacity = bodyOpacity * NIGHT.lightStrength * (1 + 0.4 * s.rays);
      mat.color.copy(colors.light);
    }
    if (rays.current) {
      const strength = bodyOpacity * s.rays * RAYS.strength;
      rays.current.visible = strength > 0.001;
      rays.current.position.set(s.centre.x, s.centre.y + s.sw * 0.15, 0);
      rays.current.rotation.z = t * RAYS.spin;
      const r = RAYS.size * s.sw * (0.85 + 0.15 * s.rays);
      rays.current.scale.set(r, r, 1);
      const mat = rays.current.material as MeshBasicMaterial;
      mat.opacity = strength * (0.85 + 0.15 * Math.sin(t * 2.3));
      mat.color.copy(colors.rays);
    }
    const h = s.halo;
    const bob = Math.sin(t * HALO.bobSpeed) * HALO.bob * s.sw;
    // The texture is the ring plus its glow margin.
    const ringW = HALO_TEX.width - 2 * HALO_TEX.margin;
    const w = h.width * (HALO_TEX.width / ringW);
    const texH = Math.round(ringW * HALO.aspect) + 2 * HALO_TEX.margin;
    for (const m of [haloBack.current, haloFront.current]) {
      if (!m) continue;
      m.visible = h.opacity > 0.001;
      // Near the top edge the ring drops a little to stay in frame (onto the
      // hair; its back half still passes behind the head), but never further
      // than `maxDrop`: over the face it would read as a headband.
      const natural = h.y + bob;
      const inFrame = Math.min(natural, vh / 2 - h.width * HALO.aspect);
      m.position.set(h.x, Math.max(inFrame, natural - HALO.maxDrop * s.sw), 0);
      m.rotation.z = h.roll;
      m.scale.set(w, w * (texH / HALO_TEX.width), 1);
      const mat = m.material as MeshBasicMaterial;
      mat.opacity = h.opacity * HALO.strength * (0.9 + 0.1 * Math.sin(t * 3.1));
      mat.color.copy(colors.halo);
    }
  });

  const additive = {
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    opacity: 0,
    blending: AdditiveBlending,
  };
  return (
    <>
      <ScreenSpaceUI>
        {cameraTexture ? (
          <ScreenImage
            name="wingsBackground"
            source={{ kind: "texture", texture: cameraTexture }}
            anchors={FULL_SCREEN_ANCHORS}
            fit="stretch"
            color={NIGHT.tint}
            renderOrder={0}
          />
        ) : null}
        {/* Erode only trims inside the feather, so both go above the defaults
            (4 / 0.7): a bright room shows as a pale fringe against the night tint. */}
        <PersonCutout
          name="wingsPerson"
          renderOrder={100}
          maskErode={0.9}
          maskFeather={5}
        />
      </ScreenSpaceUI>
      <mesh
        ref={light}
        name="bodyLight"
        renderOrder={10}
        frustumCulled={false}
        visible={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={lightTex} {...additive} />
      </mesh>
      <mesh
        ref={rays}
        name="rays"
        renderOrder={20}
        frustumCulled={false}
        visible={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={raysTex} {...additive} />
      </mesh>
      {(
        [
          ["glowLeft", glowL],
          ["glowRight", glowR],
        ] as const
      ).map(([name, ref]) => (
        <mesh
          key={name}
          name={name}
          ref={ref}
          geometry={glowGeometry}
          renderOrder={40}
          frustumCulled={false}
          visible={false}
        >
          <meshBasicMaterial map={glowTex} {...additive} />
        </mesh>
      ))}
      {(
        [
          ["wingLeft", wingL, wingMats[0]],
          ["wingRight", wingR, wingMats[1]],
        ] as const
      ).map(([name, ref, material]) => (
        <mesh
          key={name}
          name={name}
          ref={ref}
          geometry={geometry}
          material={material}
          renderOrder={50}
          frustumCulled={false}
          visible={false}
        />
      ))}
      {(
        [
          ["haloBack", haloBack, haloBackTex, 60],
          ["haloFront", haloFront, haloFrontTex, 110],
        ] as const
      ).map(([name, ref, map, order]) => (
        <mesh
          key={name}
          name={name}
          ref={ref}
          renderOrder={order}
          frustumCulled={false}
          visible={false}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={map} {...additive} />
        </mesh>
      ))}
    </>
  );
};

export const Wings = () => {
  // Dev hook for inspecting the live pose and switching styles.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __wings?: unknown }).__wings = Object.assign(
        wingsState,
        { next: nextStyle },
      );
    }
  }, []);
  return (
    <>
      <BodyTracker />
      {/* ScreenImage / PersonCutout and the wing texture load through suspending
          loaders; mounted mid-session they need their own boundary. */}
      <Suspense fallback={null}>
        <WingLayers />
      </Suspense>
    </>
  );
};
