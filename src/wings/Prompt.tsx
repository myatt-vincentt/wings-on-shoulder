// One quiet line at the bottom: while the models load, when no body is tracked,
// the style's name after a switch, and the "peace sign or tap" instruction
// (always until the first switch, then now and then). Otherwise no UI.
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  ScreenSpaceUI,
  ScreenText,
  usePersonMaskTexture,
} from "@vincentt-xr/sdk";
import { useXRReady } from "@vincentt-xr/sdk/low-level";

import { HINT, STYLES, SWITCH } from "./config";
import { wingsState } from "./Wings";

/** Untracked for this long → "Step back to show your shoulders". */
const AFTER = 1.2;

export const Prompt = () => {
  const cameraReady = useXRReady();
  const { status } = usePersonMaskTexture();
  const [text, setText] = useState("");
  const lost = useRef(0);
  /** Tracked seconds since the last switch (or since start). */
  const seen = useRef(0);

  useFrame((_s, dt) => {
    lost.current = wingsState.tracked ? 0 : lost.current + dt;
    if (wingsState.sinceSwitch < seen.current)
      seen.current = wingsState.sinceSwitch;
    if (wingsState.tracked) seen.current += dt;
    const switched = wingsState.sinceSwitch !== Infinity;
    const hint = switched
      ? seen.current > HINT.every && seen.current % HINT.every < HINT.for
      : seen.current > HINT.after;
    let next = "";
    if (cameraReady && status === "loading") next = "Getting your wings ready…";
    else if (wingsState.sinceSwitch < SWITCH.label)
      next = `${STYLES[wingsState.style].name} wings`;
    else if (cameraReady && lost.current > AFTER)
      next = "Step back to show your shoulders";
    else if (wingsState.tracked && hint) next = HINT.text;
    if (next !== text) setText(next);
  });

  if (!text) return null;
  return (
    <ScreenSpaceUI>
      <ScreenText
        name="wingsPrompt"
        text={text}
        screenTransform={{
          position: { x: 0, y: -560 },
          size: { width: 640, height: 70 },
          renderOrder: 200,
          overlay: true,
        }}
        textAlign="center"
        verticalAlign="center"
        fontFamily='system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
        fontWeight={600}
        fontSize={30}
        resolution={150}
        letterSpacing={0.04}
        color="rgba(240,242,248,0.85)"
        bgColor="transparent"
      />
    </ScreenSpaceUI>
  );
};
