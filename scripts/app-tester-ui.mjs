// The browser, for the app tester: `import { open } from "./ui.mjs"` in a script of its own.
//   const ui = await open("http://localhost:4767/", { phone: false });
//   await ui.look();                 // the page's visible text, its buttons and links, as a list
//   await ui.page.getByRole("button", { name: "Check" }).click();
//   await ui.shot("after-check");    // a PNG under shots/, its path returned: read it to see the page
//   await ui.close();
// What the page keeps (local storage) is kept between scripts, in browser-profile/.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.ISORITE_REPO_APP ?? "/workspaces/isorite/app/package.json");
const { chromium } = require("playwright");

export async function open(url, { phone = false } = {}) {
  const context = await chromium.launchPersistentContext(join(here, "browser-profile"), { viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: phone });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  let n = 0;
  return {
    page,
    async look() {
      return page.evaluate(() => {
        const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const name = (el) => (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
        const items = [...document.querySelectorAll("button, a[href], input, textarea, select, [role=tab], [role=radio], [role=menuitem]")].filter(shown).map((el) => `${el.tagName.toLowerCase()}${el.getAttribute("type") ? `[${el.getAttribute("type")}]` : ""}: ${name(el) || el.getAttribute("placeholder") || el.id || ""}`);
        return { url: location.href, text: document.body.innerText.slice(0, 3000), controls: items.slice(0, 80) };
      });
    },
    async shot(label = "page") { const file = join(here, "shots", `${String(++n).padStart(2, "0")}-${label}.png`); await page.screenshot({ path: file }); return file; },
    close: () => context.close(),
  };
}
