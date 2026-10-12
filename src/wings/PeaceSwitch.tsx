// A peace sign ✌️ switches the wing style, like a tap. The SDK's gesture engine
// (one shared hand model) fires `onBegin` once per sign: holding it doesn't
// cycle, and the cooldown stops a wobbly hand from counting twice.
import { useGesture } from "@vincentt-xr/sdk/tracking";

import { PEACE } from "./config";
import { nextStyle } from "./Wings";

export const PeaceSwitch = () => {
  useGesture("peaceSign", {
    targetFps: PEACE.fps,
    holdMs: PEACE.holdMs,
    cooldownMs: PEACE.cooldownMs,
    onBegin: nextStyle,
  });
  return null;
};
