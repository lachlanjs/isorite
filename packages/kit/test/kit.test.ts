// The kit's host side (M23): data read the same in the artifact and for Iso, the manifest, the assembled document,
// and the rules.
import { expect, test } from "vitest";
import { assemble, checkArtifact, describeShape, format, manifestOf, parseData, partsUsed, shapeOf, type KitFiles } from "../src/index.ts";

test("data: CSV with quotes, TSV, JSON and JSON lines; numbers as numbers, empty as null", () => {
  expect(parseData("a.csv", 'name,x,note\n"Smith, J",1.5,"said ""hi"""\nLee,,plain\n')).toEqual([
    { name: "Smith, J", x: 1.5, note: 'said "hi"' }, { name: "Lee", x: null, note: "plain" },
  ]);
  expect(parseData("a.tsv", "a\tb\r\n1\t2e-3\r\n")).toEqual([{ a: 1, b: 0.002 }]);
  expect(parseData("a.json", '{"rows":[{"a":1}]}')).toEqual([{ a: 1 }]);
  expect(parseData("a.jsonl", '{"a":1}\n\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
  expect(() => parseData("a.parquet", "")).toThrow(/CSV, TSV, JSON/);
});

test("a file's shape, as read_data gives it to Iso", () => {
  const rows = parseData("t.csv", "integrator,dt,err\neuler,0.04,0.5\nleapfrog,0.04,0.1\nleapfrog,0.02,\n");
  const s = shapeOf("t.csv", rows);
  expect(s.columns).toEqual([
    { name: "integrator", type: "text", distinct: 2, values: ["euler", "leapfrog"], empty: 0 },
    { name: "dt", type: "number", min: 0.02, max: 0.04, mean: expect.closeTo(0.0333, 3), empty: 0 },
    { name: "err", type: "number", min: 0.1, max: 0.5, mean: expect.closeTo(0.3, 6), empty: 1 },
  ]);
  expect(describeShape(s)).toContain("- integrator: text, 2 distinct: euler, leapfrog");
  expect(describeShape(s)).toContain("- err: number, 0.1 to 0.5 (mean 0.3), 1 empty");
});

test("numbers read out: three figures, powers of ten when small or large, a minus sign", () => {
  expect([format(0.0005744), format(-1.3349), format(1200), format(3.2e-6), format(2e7), format(0), format(0.5, 2), format(NaN)])
    .toEqual(["5.74×10⁻⁴", "−1.33", "1200", "3.2×10⁻⁶", "2×10⁷", "0", "0.50", "–"]);
});

const ART = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Runs &amp; errors</title>
<meta name="description" content="What the runs say.">
<meta name="isorite:kit" content="1"><meta name="isorite:uses" content="runs.csv">
<link rel="stylesheet" href="kit/isorite.css"><script src="kit/kit.js"></script></head>
<body><iso-chart data="runs.csv" x="t" y="e"></iso-chart></body></html>`;
const KIT: KitFiles = { "kit.js": "/*kit*/", "chart.js": "/*chart</script>*/", "model.js": "/*model*/", "math.js": "/*math*/", "math.css": "/*mathcss*/", "isorite.css": "/*isorite*/", "plain.css": "/*plain*/", "kit.css": "/*kitcss*/" };

test("the manifest, and the parts an artifact uses", () => {
  expect(manifestOf(ART)).toEqual({ title: "Runs & errors", description: "What the runs say.", author: "", date: "", kit: "1", uses: ["runs.csv"] });
  expect(partsUsed(ART)).toEqual(["chart"]);
  expect(partsUsed('<iso-model src="a.glb">')).toEqual(["model"]);
  expect(partsUsed("<iso-panel>")).toEqual([]);
  // Maths in the text, not a template string's $ in a script, nor a price.
  expect(partsUsed("<p>Energy $E = mc^2$ here.</p>")).toEqual(["math"]);
  expect(partsUsed("<p>$$\\int f$$</p>")).toEqual(["math"]);
  expect(partsUsed("<p>It costs $5 and $6.</p><script>const s = `${a}px ${b}`;</script>")).toEqual([]);
});

test("assembled: the CSP first, the kit and the parts it uses inlined, its own kit links gone, the ground and look set", () => {
  const doc = assemble(ART, KIT, { ground: "quartz" });
  expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("/*isorite*/"));
  expect(doc).toContain('<html lang="en" data-look="isorite" data-ground="quartz">');
  expect(doc).toContain("/*chart<\\/script>*/");
  expect(doc).not.toContain("/*model*/");
  expect(doc).not.toContain("/*mathcss*/");
  expect(doc).not.toContain('href="kit/');
  expect(doc).not.toContain('src="kit/');
  const standalone = assemble(ART, KIT, { data: { "runs.csv": "t,e\n0,1\n", "part.glb": new Uint8Array([1, 2, 3]) } });
  expect(standalone).toContain('<script type="text/plain" data-path="runs.csv">t,e\n0,1\n</script>');
  expect(standalone).toContain('data-encoding="base64" data-path="part.glb">AQID</script>');
});

test("the rules: each broken one said so that it can be fixed", () => {
  const ctx = { files: ["runs.csv"], columns: { "runs.csv": ["t", "e"] } };
  expect(checkArtifact(ART, ctx)).toEqual([]);
  const bad = ART.replace('<meta name="isorite:kit" content="1">', "")
    .replace('y="e"', 'y="energy"')
    .replace("</body>", `<style>.a{color:#fff;border-radius:4px;font-family:Arial}</style><script src="https://cdn.example/x.js"></script>
      <script>iso.data("other.csv"); fetch("x")</script><p>Drag to rotate it.</p></body>`);
  const said = checkArtifact(bad, ctx).map((b) => `${b.rule} ${b.level}: ${b.message}`);
  expect(said).toEqual([
    '1 error: no <meta name="isorite:kit" content="1">: without it isorite gives it no kit',
    '2 error: it reads other.csv, which isn\'t in <meta name="isorite:uses">',
    '3 error: <iso-chart data="runs.csv" y="energy">: runs.csv has no column "energy" (it has t, e)',
    "4 error: a colour of its own (#fff): use the theme's, var(--lattice) in CSS or iso.tokens().lattice in script",
    "4 error: a font of its own (font-family:Arial): use var(--font-ui), var(--font-text) or iso.tokens().ui",
    "4 error: border-radius: the theme decides corners",
    "5 error: a web address (https://cdn.example/x.js): an artifact reaches nothing outside the file",
    "5 error: a <script src>: everything is in the file, and the kit is given",
    "5 error: fetch, XMLHttpRequest or import(): read files with iso.data(path)",
    '7 warning: text that explains how to use it ("Drag to rotate it"): say what a thing is, not what to do with it',
  ]);
  // A token, a template using one, and an SVG namespace are not broken rules.
  expect(checkArtifact(ART.replace("</body>", '<script>ctx.fillStyle = t.rose; ctx.font = `11px ${t.ui}`; document.createElementNS("http://www.w3.org/2000/svg", "svg")</script><iso-stat tone="blue"></iso-stat></body>'), ctx)).toEqual([]);
  expect(checkArtifact(ART, { files: [] }).map((b) => b.message)).toEqual(["runs.csv is in isorite:uses but there's no such file beside it"]);
});

test("Iso's context is generated from the reference and recipes as they are, and every recipe keeps the rules", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  // @ts-expect-error a plain script beside the kit
  const { generated } = await import("../context/build.mjs");
  expect(readFileSync(new URL("../src/context.gen.ts", import.meta.url), "utf8")).toBe(generated());
  const data = new URL("../context/data/", import.meta.url), files = readdirSync(data);
  const columns = Object.fromEntries(files.filter((f) => f.endsWith(".csv")).map((f) => [f, Object.keys(parseData(f, readFileSync(new URL(f, data), "utf8"))[0]!)]));
  const { RECIPES } = await import("../src/index.ts");
  for (const [name, r] of Object.entries(RECIPES)) expect([name, checkArtifact(r.html, { files, columns })]).toEqual([name, []]);
});

test("the manifest written as given, whatever the file said or left out", async () => {
  const { withManifest } = await import("../src/index.ts");
  const m = { title: "Runs <1>", description: 'The "runs"', author: "Iso", date: "2026-10-28", kit: "1", uses: ["a.csv", "b.csv"] };
  const doc = withManifest(ART, m);
  expect(manifestOf(doc)).toEqual({ ...m, title: "Runs <1>" });
  expect(doc.match(/isorite:kit/g)!.length).toBe(1);
  // A body alone is given a document.
  const bare = withManifest("<iso-panel><h2>x</h2></iso-panel>", m);
  expect(bare).toMatch(/^<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">/);
  expect(bare).toContain("<body>\n<iso-panel><h2>x</h2></iso-panel>\n</body>");
  expect(manifestOf(bare).uses).toEqual(["a.csv", "b.csv"]);
});
