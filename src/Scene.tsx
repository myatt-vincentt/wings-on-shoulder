// Scene.tsx — Wings: angel wings on your shoulders, behind you, over a
// night-tinted camera. They follow your arms and flap on big moves; a peace
// sign or a tap switches their style. See PLAN.md.
import { lazy, Suspense } from "react";

import { ExperienceStatus } from "./wings/ExperienceStatus";
import { PeaceSwitch } from "./wings/PeaceSwitch";
import { Prompt } from "./wings/Prompt";
import { Wings } from "./wings/Wings";

// Dev-only media switcher (a local dance clip, SDK sample media, webcam) for
// previewing without a camera. Lazy and behind a constant esbuild folds to false
// in production. Two rules: `process.env.NODE_ENV`, not `import.meta.env.DEV`
// (vincentt-xr/v2-template#112); and write the check INSIDE the ternary —
// hoisted into a `const`, esbuild keeps the dead branch.
const DevMediaSwitcher =
  process.env.NODE_ENV !== "production"
    ? lazy(() => import("./DevMediaSwitcher"))
    : null;

export const Scene = () => (
  <>
    <ExperienceStatus />
    <Wings />
    <PeaceSwitch />
    <Prompt />
    {DevMediaSwitcher ? (
      <Suspense fallback={null}>
        <DevMediaSwitcher />
      </Suspense>
    ) : null}
  </>
);
