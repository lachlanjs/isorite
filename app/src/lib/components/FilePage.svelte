<script lang="ts">
  // A file of the notes that isn't a note, open in the Note pane (plan-m23 §5.3; sketch V): its name, a label (its
  // kind, where it is, and for an artifact the data it uses), and the file itself as suits its kind: an artifact
  // working, data as its shape and first rows, a picture, a PDF, a 3D model in the kit's viewer, and anything else
  // as its size and type.
  import { citeKind, type FileKind } from "@isorite/core";
  import { describeShape, format, parseData, shapeOf, type Row, type Shape } from "@isorite/kit";
  import { app, noteHref } from "$lib/app.svelte.ts";
  import { dataOf, documentOf, groundNow, loadArtifact, modelArtifact, within } from "$lib/artifact.ts";
  import { KIND_NAMES } from "$lib/glyphs.ts";
  import ArtifactFrame from "./ArtifactFrame.svelte";
  import Glyph from "./Glyph.svelte";

  let { path }: { path: string } = $props();

  const kind = $derived<FileKind>(citeKind(path) ?? "misc");
  const name = $derived(path.split("/").at(-1) ?? path);
  const folder = $derived(path.split("/").slice(0, -1));
  const MODEL = /\.(glb|gltf|stl|obj)$/i, READABLE = /\.(csv|tsv|json|jsonl|ndjson)$/i;

  let problem = $state("");
  let loaded = $state.raw<{ html: string; title: string; description: string; uses: string[] } | null>(null);
  let bytes = $state.raw<{ size: number; type: string; url?: string } | null>(null);
  let table = $state.raw<{ shape: Shape; rows: Row[] } | null>(null);
  let errors = $state<string[]>([]);
  let look = $state("isorite");
  let said = $state("");

  $effect(() => {
    const p = path, k = kind;
    problem = ""; loaded = null; bytes = null; table = null; errors = []; said = "";
    let url: string | undefined;
    (async () => {
      if (k === "artifact") {
        const { html, manifest } = await loadArtifact(app.api, p);
        loaded = { html, title: manifest.title || p.split("/").at(-1)!, description: manifest.description, uses: manifest.uses };
        return;
      }
      if (MODEL.test(p)) { loaded = { html: modelArtifact(p.split("/").at(-1)!), title: p.split("/").at(-1)!, description: "", uses: [p.split("/").at(-1)!] }; return; }
      const got = await app.api.file(p);
      if (!got) throw new Error(`no file at ${p}`);
      if (k === "image" || got.type === "application/pdf") url = URL.createObjectURL(new Blob([got.bytes as Uint8Array<ArrayBuffer>], { type: got.type }));
      bytes = { size: got.bytes.length, type: got.type, ...(url ? { url } : {}) };
      if (k === "data" && READABLE.test(p)) { const rows = parseData(p, new TextDecoder().decode(got.bytes)); table = { shape: shapeOf(p, rows), rows: rows.slice(0, 50) }; }
    })().catch((e) => { problem = (e as Error).message; });
    return () => { if (url) URL.revokeObjectURL(url); };
  });

  const title = $derived(loaded?.title ?? name);
  const size = (n: number) => (n < 1024 ? `${n} bytes` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} kB` : `${(n / 1024 ** 2).toFixed(1)} MB`);
  const cell = (v: unknown) => (typeof v === "number" ? format(v) : String(v ?? ""));

  /** Standalone (§3.3): one HTML with the kit, the look chosen and its data inside, which opens anywhere. */
  async function standalone(): Promise<void> {
    if (!loaded) return;
    try {
      const doc = await documentOf(loaded.html, { look, ground: groundNow(), data: await dataOf(app.api, path, loaded.uses) });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
      a.download = name.replace(/\.html?$/i, "") + ".standalone.html";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      said = `saved ${a.download}, ${size(doc.length)}`;
    } catch (e) { problem = (e as Error).message; }
  }
  /** A data file it uses, opened: a path relative to the artifact. */
  const dataHref = (rel: string) => { const at = within(path, rel); return at === null ? null : noteHref(at); };
</script>

<article class="file">
  <header>
    <h1 class="serif">{title}</h1>
    {#if loaded?.description}<p class="stand">{loaded.description}</p>{/if}
    <div class="label">
      <span class="kind"><Glyph kind={kind} />{KIND_NAMES[kind]}</span>
      <span class="path">{#each folder as f (f)}<span>{f}</span><span class="sep">/</span>{/each}<span class="name">{name}</span></span>
      {#if kind === "artifact" && loaded?.uses.length}
        <span class="uses">uses {#each loaded.uses as u (u)}{@const href = dataHref(u)}{#if href}<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves --><a class="br" {href}>{u}</a>{:else}<span class="br">{u}</span>{/if} {/each}</span>
      {/if}
      {#if bytes}<span class="faint">{size(bytes.size)}</span>{/if}
      {#if kind === "artifact"}
        <span class="tools">
          <span class="seg" role="radiogroup" aria-label="look">
            {#each ["isorite", "plain"] as l (l)}<button type="button" role="radio" aria-checked={look === l} onclick={() => (look = l)}>{l}</button>{/each}
          </span>
          <button type="button" class="btn quiet" onclick={() => void standalone()}>standalone</button>
        </span>
      {/if}
    </div>
    {#if said}<p class="said" role="status">{said}</p>{/if}
    {#if errors.length}<ul class="errors" role="alert">{#each errors as e (e)}<li>{e}</li>{/each}</ul>{/if}
  </header>

  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  {#if loaded}
    <ArtifactFrame {path} html={loaded.html} uses={loaded.uses} {look} {title} onerror={(m) => { if (!errors.includes(m)) errors = [...errors, m]; }} />
  {:else if kind === "image" && bytes?.url}
    <img class="picture" src={bytes.url} alt={name} />
  {:else if bytes?.type === "application/pdf" && bytes.url}
    <iframe class="pdf" src={bytes.url} title={name}></iframe>
  {:else if table}
    <pre class="shape">{describeShape({ ...table.shape, head: [] }).split("\nFirst rows:")[0]}</pre>
    <div class="rows">
      <table>
        <thead><tr>{#each table.shape.columns as c (c.name)}<th class:n={c.type === "number"}>{c.name}</th>{/each}</tr></thead>
        <tbody>{#each table.rows as r, i (i)}<tr>{#each table.shape.columns as c (c.name)}<td class:n={c.type === "number"}>{cell(r[c.name])}</td>{/each}</tr>{/each}</tbody>
      </table>
    </div>
    {#if table.shape.rows > table.rows.length}<p class="faint">the first {table.rows.length} of {table.shape.rows} rows</p>{/if}
  {:else if bytes}
    <p class="faint">{bytes.type}</p>
  {/if}
</article>

<style>
  .file { max-width: 1120px; margin: 0 auto; padding: 40px var(--space-4) var(--space-12); display: flex; flex-direction: column; gap: var(--space-3); }
  h1 { margin: 0; font-size: 34px; line-height: 1.2; font-weight: 700; color: var(--text); overflow-wrap: anywhere; }
  .stand { margin: 4px 0 0; font: italic 17px/1.5 var(--font-text); color: var(--text-soft); max-width: 72ch; }
  .label { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); margin-top: var(--space-3); padding-bottom: var(--space-3); border-bottom: 1px solid var(--line); font-size: 12px; color: var(--text-faint); }
  .kind { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border: 1px solid var(--line-strong); color: var(--text-soft); text-transform: uppercase; letter-spacing: .06em; font-size: 11px; }
  .path { color: var(--text-soft); } .path .sep { color: var(--text-faint); padding: 0 4px; } .path .name { color: var(--text); }
  /* A part in corner brackets (sketch U). */
  .br { color: var(--text-soft); padding: 3px 8px; text-decoration: none; --b: var(--line-strong); background:
    linear-gradient(var(--b), var(--b)) top left / 5px 1px no-repeat, linear-gradient(var(--b), var(--b)) top left / 1px 5px no-repeat,
    linear-gradient(var(--b), var(--b)) bottom right / 5px 1px no-repeat, linear-gradient(var(--b), var(--b)) bottom right / 1px 5px no-repeat; }
  a.br:hover { color: var(--text); --b: var(--lattice); }
  .tools { margin-left: auto; display: flex; gap: var(--space-2); align-items: center; }
  .seg { display: flex; }
  .seg button { font: 11px/18px var(--font-ui); color: var(--text-soft); background: none; border: 1px solid var(--line); margin-left: -1px; padding: 3px 9px; cursor: pointer; text-transform: uppercase; letter-spacing: .06em; }
  .seg button[aria-checked="true"] { background: var(--text); color: var(--ground-0); border-color: var(--text); position: relative; }
  .tools .btn { height: 26px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  .said { margin: 0; font-size: 12px; color: var(--text-faint); }
  .errors { margin: 0; padding: 0; list-style: none; font-size: 12px; color: var(--rose); }
  .problem { color: var(--rose); }
  .picture { max-width: 100%; height: auto; align-self: flex-start; }
  .pdf { width: 100%; height: 80vh; border: 1px solid var(--line); }
  .shape { margin: 0; font: 12px/18px var(--font-ui); color: var(--text-soft); white-space: pre-wrap; }
  .rows { overflow-x: auto; }
  table { border-collapse: collapse; font: 12px/18px var(--font-ui); font-variant-numeric: tabular-nums; }
  th { text-align: left; font-weight: 400; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint); padding: 6px 10px; border-bottom: 1px solid var(--line-strong); white-space: nowrap; }
  td { padding: 5px 10px; border-bottom: 1px solid var(--line); color: var(--text-soft); white-space: nowrap; }
  .n { text-align: right; }
</style>
