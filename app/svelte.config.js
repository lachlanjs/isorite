// A single-page app: no server rendering, hash routing (so the built files
// can be served from any folder: isorite serve now, Tauri later), built with
// the static adapter into app/build, where isorite serve finds it.
import adapter from "@sveltejs/adapter-static";

// The tutorial (npm run build:tutorial) is the same app with the engine in the page, over the example base, built into
// site/ at the repository's root for GitHub Pages.
const out = process.env.ISORITE_TUTORIAL ? "../site" : "build";

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    adapter: adapter({ pages: out, assets: out, strict: false }),
    router: { type: "hash" },
    // The tutorial is one page that SvelteKit serves as its fallback, whose links are absolute however `relative` is
    // set: on GitHub Pages it is served under the repository's name (/isorite/), which BASE_PATH gives.
    paths: { relative: true, base: process.env.ISORITE_TUTORIAL ? (process.env.BASE_PATH ?? "") : "" },
  },
};
