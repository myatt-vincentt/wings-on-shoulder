// DevMediaSwitcher.tsx — dev-only: preview with a local dance clip and the
// SDK's sample media.
//
// The template's own media switcher (App.tsx → MediaSourceControl) appears in
// development once a source is announced, which only happens when the webcam
// works. In a browser without a camera (the built-in preview) it never shows,
// so this fills exactly that gap: when the webcam fails it starts on the
// project's dance clip (dev-media/dancing.mp4) and shows the SDK's
// MediaSourceSwitcher with that clip, every SDK sample video and image, and the
// webcam. The clip lives in dev-media/: outside src/ (the zone manifest can't
// classify .mp4) and outside public/ (which ships). With a working webcam it stays out of the
// way and the template's switcher is the one you see.
//   ?input=webcam  never take over
//
// Never reaches production: Scene.tsx lazy-imports this module behind an inline
// `process.env.NODE_ENV` check, which esbuild folds.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { Html } from "@react-three/drei";
import { XRMediaSource } from "@vincentt-xr/sdk";
import {
  useXRContext,
  useXRError,
  useXRReady,
} from "@vincentt-xr/sdk/low-level";

import danceUrl from "../dev-media/dancing.mp4";
import { streamFromImageUrl } from "./mediaStream";

type Preset = {
  id: string;
  kind: "webcam" | "image" | "video";
  label: string;
  url?: string;
};
type SwitcherModule = {
  Switcher: ComponentType<{
    value: Preset;
    onChange: (p: Preset) => void;
    sources: Preset[];
  }>;
  sources: Preset[];
};

/** The project's own dance clip, listed first and used as the starting source. */
const DANCE: Preset = {
  id: "local-dance",
  kind: "video",
  label: "Dancing",
  url: danceUrl,
};
const START_ID = DANCE.id;

type CaptureCanvas = HTMLCanvasElement & {
  captureStream: (fps?: number) => MediaStream;
};

/**
 * A looping clip, pre-mirrored like the template's `streamFromVideoUrl` (to
 * cancel the SDK's selfie flip), but it keeps retrying `play()`: Chrome pauses
 * video-only media in a hidden tab, and a single rejected `play()` would abort
 * the swap.
 */
const streamFromClip = async (url: string) => {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.src = url;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error(`failed to load ${url}`));
  });
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");
  let stopped = false;
  let raf = 0;
  const draw = () => {
    if (stopped) return;
    if (video.paused) video.play().catch(() => {});
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
    raf = requestAnimationFrame(draw);
  };
  video.play().catch(() => {});
  draw();
  return {
    stream: (canvas as CaptureCanvas).captureStream(),
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      video.pause();
    },
  };
};

const DevMediaSwitcher = () => {
  const { session } = useXRContext();
  const ready = useXRReady();
  const error = useXRError();
  const [mod, setMod] = useState<SwitcherModule | null>(null);
  const [value, setValue] = useState<Preset | null>(null);
  const started = useRef(false);
  const stopVideo = useRef<(() => void) | undefined>();

  useEffect(() => () => stopVideo.current?.(), []);

  const apply = useCallback(
    async (p: Preset) => {
      setValue(p);
      stopVideo.current?.();
      stopVideo.current = undefined;
      try {
        if (p.kind === "webcam") {
          await session.setMediaSource({ source: XRMediaSource.WEBCAM });
        } else if (p.url) {
          let stream: MediaStream;
          if (p.kind === "image") {
            stream = await streamFromImageUrl(p.url);
          } else {
            const handle = await streamFromClip(p.url);
            stopVideo.current = handle.stop;
            ({ stream } = handle);
          }
          await session.setMediaSource({
            source: XRMediaSource.STREAM,
            stream,
          });
        }
        await session.start();
      } catch (e) {
        // eslint-disable-next-line no-console -- dev-only diagnostic
        console.warn("[DevMediaSwitcher]", e);
      }
    },
    [session],
  );

  // Take over only when the webcam failed (no camera / permission denied).
  useEffect(() => {
    if (
      started.current ||
      new URLSearchParams(window.location.search).get("input") === "webcam"
    )
      return;
    if (!error) return;
    started.current = true;
    import("@vincentt-xr/sdk/debug-ui/media-source").then((m) => {
      const sources = [
        DANCE,
        ...(m.defaultMediaSources as unknown as Preset[]),
      ];
      setMod({
        Switcher:
          m.MediaSourceSwitcher as unknown as SwitcherModule["Switcher"],
        sources,
      });
      const first =
        sources.find((s) => s.id === START_ID) ??
        sources.find((s) => s.kind === "video");
      if (first) apply(first);
    });
  }, [error, ready, apply]);

  if (!mod || !value) return null;
  const { Switcher } = mod;
  return (
    <Html fullscreen zIndexRange={[40, 0]}>
      <Switcher value={value} onChange={apply} sources={mod.sources} />
    </Html>
  );
};

export default DevMediaSwitcher;
