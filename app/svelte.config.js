// A single-page app: no server rendering, hash routing (so the built files
// can be served from any folder: isorite serve now, Tauri later), built with
// the static adapter into app/build, where isorite serve finds it.
import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    adapter: adapter({ pages: "build", assets: "build", strict: false }),
    router: { type: "hash" },
    paths: { relative: true },
  },
};
