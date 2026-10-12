// Tells whoever is hosting the page when the experience is usable.
//
//   <html data-experience="loading | ready | error">   — for CSS, tests, crawlers
//   window "experience:status" CustomEvent             — same document
//   parent.postMessage({ type: "experience:status", experience, status, reason? })
//                                                      — when embedded in an iframe
//
// "ready" = camera running AND the portrait segmentation model ready (the wings appear once a body is tracked).
// The message carries no user data, so it is posted to any origin ("*"): the
// embedder's origin isn't known in advance.
import { useEffect } from "react";
import { usePersonMaskTexture } from "@vincentt-xr/sdk";
import { useXRError, useXRReady } from "@vincentt-xr/sdk/low-level";

import { isFramed } from "../framed";

export const EXPERIENCE_ID = "wings-portrait-segmentation";

export type ExperienceStatusValue = "loading" | "ready" | "error";

export const ExperienceStatus = () => {
  const cameraReady = useXRReady();
  const cameraError = useXRError();
  // Shares the segmentation model with usePersonMask (no second download).
  const { status: maskStatus, error: maskError } = usePersonMaskTexture();
  const segReady = maskStatus === "ready";
  const segError = maskStatus === "error" ? maskError : null;

  let status: ExperienceStatusValue = "loading";
  if (cameraError || segError) status = "error";
  else if (cameraReady && segReady) status = "ready";
  const reason = cameraError?.reason ?? (segError ? "segmentation" : undefined);

  useEffect(() => {
    document.documentElement.dataset.experience = status;
    const detail = {
      type: "experience:status",
      experience: EXPERIENCE_ID,
      status,
      reason,
    };
    window.dispatchEvent(new CustomEvent("experience:status", { detail }));
    if (isFramed()) {
      try {
        window.parent.postMessage(detail, "*");
      } catch {
        // A detached or sandboxed parent: nothing to tell.
      }
    }
  }, [status, reason]);

  return null;
};
