// Draws the mark and the wordmark as images, for terminals that show images (kitty's graphics protocol, or sixel):
// the mark from its shapes (`logo.ts`), the wordmark from the browser's own drawing (`Logo.svelte`), each on both
// grounds, with a clear background. Playwright's Chromium (the app's) draws them.
//
//   node scripts/logo-images.ts
//
// writes plugin/assets/{mark,wordmark}-{lapis,quartz}.png.

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { height, shapes, width, type Shape } from "../plugin/logo.ts";
import { lapis, quartz } from "../plugin/palette.ts";

const here = new URL("..", import.meta.url).pathname;
const out = join(here, "plugin", "assets");
mkdirSync(out, { recursive: true });

// A half is the square less the triangle at its empty corner.
const corners = { tl: [0, 0], tr: [1, 0], br: [1, 1], bl: [0, 1] } as const;
function polygon({ x, y, empty }: Shape): string {
  const all = [corners.tl, corners.tr, corners.br, corners.bl];
  return all.filter((c) => !empty || c !== corners[empty]).map(([cx, cy]) => `${x + cx},${y + cy}`).join(" ");
}

const svelte = readFileSync(join(here, "..", "..", "app", "src", "lib", "components", "Logo.svelte"), "utf8");
const [letters, iso, right] = [...svelte.matchAll(/<path[^>]* d="([^"]+)"/g)].map((m) => m[1]!);

const PX = 48;
const drawings = {
  mark: (g: typeof lapis) => ({
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * PX}" height="${height * PX}" shape-rendering="geometricPrecision">${shapes.map((s) => `<polygon fill="${s.growth ? g.growth : g.text}" points="${polygon(s)}"/>`).join("")}</svg>`,
  }),
  wordmark: (g: typeof lapis) => ({
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.4 -9.5 32.4 9.9" width="${Math.round(32.4 * PX)}" height="${Math.round(9.9 * PX)}"><path d="${letters}" fill="none" stroke="${g.text}" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round"/><path d="${iso}" fill="${g.growth}"/><path d="${right}" fill="${g.mal}"/></svg>`,
  }),
};

// CHROMIUM names a Chromium of your own where Playwright has not downloaded its own.
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const page = await browser.newPage();
  for (const [name, draw] of Object.entries(drawings)) {
    for (const [ground, g] of Object.entries({ lapis, quartz })) {
      await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${draw(g).svg}`);
      await page.locator("svg").screenshot({ path: join(out, `${name}-${ground}.png`), omitBackground: true });
    }
  }
} finally {
  await browser.close();
}
