/**
 * Canvas-backed media streams for every NON-webcam source.
 *
 * One mechanism for all of them — the configured `video`/`photo` sources, the
 * framed preset default, and a runtime switch from the media switcher — so the
 * framed path adds no second way to produce a stream, and so every non-webcam
 * source gets the same pre-mirroring that cancels the SDK's selfie flip.
 *
 * Nothing here touches `getUserMedia`. That call has exactly one site in this
 * app (the webcam branch of `MediaSourceBinder`), which is what lets the framed
 * startup path be webcam-free by construction rather than by care.
 */

type CaptureCanvas = HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream };

export type VideoStreamHandle = {
  stream: MediaStream;
  /** Stops the mirroring RAF loop. Safe to call more than once. */
  stop: () => void;
};

/** A looping clip, mirrored into a canvas and captured as a live stream. */
export const streamFromVideoUrl = async (url: string): Promise<VideoStreamHandle> => {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.src = url;
  video.loop = true;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  await video.play();

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");

  let rafId = 0;
  let stopped = false;
  const draw = () => {
    if (stopped) return;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
    rafId = requestAnimationFrame(draw);
  };
  draw();

  return {
    stream: (canvas as CaptureCanvas).captureStream(),
    stop: () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      video.pause();
    },
  };
};

/** A still, mirrored into a canvas and captured as a one-frame stream. */
export const streamFromImageUrl = async (url: string): Promise<MediaStream> => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");
  ctx.scale(-1, 1);
  ctx.drawImage(img, -canvas.width, 0);

  return (canvas as CaptureCanvas).captureStream(0);
};
