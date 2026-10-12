/**
 * Shared esbuild config for this project. Travels with the repo so the
 * server-side publish build and the in-browser esbuild-wasm preview use the
 * exact same options (preview == publish). Replaces the old Vite setup.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import stylePlugin from "esbuild-style-plugin";

const require = createRequire(import.meta.url);
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

// Packages that MUST resolve to a single instance. Two React instances give
// "Cannot read properties of null (reading 'useMemo')"; two fiber instances
// break the <Canvas> R3F context ("Hooks can only be used within the Canvas").
// With the SDK installed as a tarball these hoist to one copy on their own, but
// pinning here is cheap insurance against a transitive dep (or a symlinked dev
// SDK) pulling a second copy. Pin each to this repo's own copy.
const SINGLETONS = [
  "react",
  "react-dom",
  "scheduler",
  "three",
  "@react-three/fiber",
  "@react-three/drei",
  "react-reconciler",
  "its-fine",
];

// Resolve a package to its install DIRECTORY (the dir holding its package.json),
// not its main file — aliasing to a file breaks subpath imports like
// "react-dom/client". esbuild dedups by directory and resolves subpaths itself.
function pkgDir(localRequire, pkg) {
  const pkgJson = localRequire.resolve(`${pkg}/package.json`);
  return path.dirname(pkgJson);
}

const SDK_PKG = "@vincentt-sdks/xr-sdk";

// Dev-only SDK link: `SDK_LINK=1 npm run dev` resolves the SDK to a local xr-sdk
// checkout (its built dist/) instead of the pinned tarball, so SDK edits show up
// in the app's dev loop without publish→repin→reinstall. Run `pnpm build:watch`
// in xr-sdk alongside so dist/ rebuilds on change. `SDK_LINK=1` uses the sibling
// `../xr-sdk`; `SDK_LINK=/abs/path/to/xr-sdk` overrides. Resolves to the package
// DIRECTORY (esbuild reads its exports → dist/main.js), and the SINGLETONS pins
// above keep the linked SDK from dragging a second React/three. Never affects the
// publish build (SDK_LINK unset) — the tarball remains the source of truth.
function linkedSdkDir() {
  const link = process.env.SDK_LINK;
  if (!link) return undefined;
  const dir = link === "1" ? path.resolve(repoRoot, "..", "xr-sdk") : path.resolve(link);
  return dir;
}

export function aliasMap(root = repoRoot) {
  const localRequire = createRequire(path.join(root, "package.json"));
  const singletons = {};
  for (const pkg of SINGLETONS) {
    try {
      singletons[pkg] = pkgDir(localRequire, pkg);
    } catch {
      // Not installed (e.g. optional dep) — skip; esbuild resolves normally.
    }
  }
  const sdkLink = linkedSdkDir();
  return {
    ...singletons,
    ...(sdkLink ? { [SDK_PKG]: sdkLink } : {}),
  };
}

// The three hosts a viewer beacon may be sent to, as literals. This list IS the
// constraint: `@vincentt-xr/analytics` ships a pre-built dist, so the endpoint can
// only be chosen at the creator's build, and the value must not be free-form.
// A creator's own repo config naming an arbitrary host would redirect their
// viewers' beacons to it, and a published bundle is unfixable afterward.
//
// Keyed by environment rather than parsed, so nothing here matches or derives a
// host. The publish apexes NEST (`vincentt.app` is a suffix of
// `staging.vincentt.app`), which is exactly why this is a lookup and not a suffix
// test — see internal/meter/host.go in the api repo for what that costs.
//
// This prevents a MISTAKE, not an attacker: the creator owns this build and can
// edit dist by hand. That is true of every byte in the bundle. Do not describe
// this as a security boundary.
const BEACON_ENDPOINTS = {
  production: "https://api.vincentt.studio/v/beacon",
  staging: "https://api.staging.vincentt.studio/v/beacon",
  dev: "https://api.dev.vincentt.studio/v/beacon",
};

// Unset means production, so an ordinary creator build is byte-identical to the
// one that shipped before this existed. An unrecognized value FAILS THE BUILD
// rather than falling back: a typo'd `VINCENTT_ENV=stagng` that silently built a
// production beacon is the failure this whole change exists to remove.
function beaconEndpointDefine() {
  const env = process.env.VINCENTT_ENV;
  if (!env) return {};
  const endpoint = BEACON_ENDPOINTS[env];
  if (!endpoint) {
    throw new Error(
      `VINCENTT_ENV=${JSON.stringify(env)} is not a known environment. ` +
        `Expected one of: ${Object.keys(BEACON_ENDPOINTS).join(", ")}. ` +
        `Leave it unset for a normal production build.`,
    );
  }
  return { "globalThis.__VCT_BEACON__": JSON.stringify(endpoint) };
}

export function buildOptions({ mode = "production", root = repoRoot } = {}) {
  const prod = mode === "production";
  return {
    entryPoints: [path.join(root, "src", "main.tsx")],
    bundle: true,
    format: "esm",
    splitting: true,
    outdir: path.join(root, "dist", "assets"),
    entryNames: "[name]-[hash]",
    chunkNames: "chunks/[name]-[hash]",
    assetNames: "[name]-[hash]",
    publicPath: "/assets",
    minify: prod,
    sourcemap: !prod,
    target: ["es2020"],
    jsx: "automatic",
    loader: {
      ".png": "file",
      ".jpg": "file",
      ".jpeg": "file",
      ".svg": "file",
      ".gif": "file",
      ".webp": "file",
      ".mp4": "file",
      ".glb": "file",
      ".gltf": "file",
      ".hdr": "file",
      ".woff": "file",
      ".woff2": "file",
    },
    alias: aliasMap(root),
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        prod ? "production" : "development",
      ),
      "globalThis.VCT_MOBILE_XR_ACCEPTANCE_HARNESS": JSON.stringify(
        process.env.VITE_MOBILE_XR_ACCEPTANCE_HARNESS === "true",
      ),
      // The template's _core config helpers read Vite's import.meta.env, which
      // esbuild doesn't provide — inject a populated object so the app mounts.
      "import.meta.env": JSON.stringify({
        MODE: prod ? "production" : "development",
        PROD: prod,
        DEV: !prod,
        BASE_URL: "/",
      }),
      ...beaconEndpointDefine(),
    },
    plugins: [
      stylePlugin({ postcss: { plugins: [require("@tailwindcss/postcss")] } }),
    ],
    metafile: true,
    logLevel: "info",
  };
}
