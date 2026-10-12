import { HarnessProvider } from "@vincentt-xr/harness";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";

// HarnessProvider is what makes `vincentt logs | network | trace` and
// `vincentt feedback` return anything at all: it patches console.*, wraps
// fetch/XHR, samples performance, and mounts the "Send feedback" button. The
// CLI verbs connect to the relay either way, so without this they report "no
// events yet" forever and the reverse channel has nothing to send.
//
// It belongs here rather than in each app because every scaffolded app is a
// copy of this template, and a diagnostics limb that each author has to
// remember to wire is one that is usually not wired.
//
// Safe in production by construction: `enabled` defaults to import.meta.env.DEV
// (esbuild.config.mjs defines it as !prod), and the instrumentation and overlay
// are both DYNAMIC imports inside the effect — so a production build emits them
// as chunks nothing ever loads. Do not pass `enabled` explicitly to force it on
// in a published bundle.
//
// The package is a runtime DEPENDENCY, not a devDependency, even though nothing
// it provides survives into a production run: this file is bundled application
// source, so an install without dev packages must still resolve the import.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <HarnessProvider>
    <App />
  </HarnessProvider>,
);
