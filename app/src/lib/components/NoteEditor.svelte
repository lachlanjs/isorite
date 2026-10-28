<script lang="ts">
  // The text of a note, in CodeMirror: the body as a live preview, or the whole file as source. Iso's blocks
  // are laid over it (overlays.ts) at the places the note's journal gives them.
  import { mount, onMount, unmount, untrack } from "svelte";
  import { artifactOf } from "$lib/artifact.ts";
  import ArtifactEmbed from "./ArtifactEmbed.svelte";
  import { goto } from "$app/navigation";
  import type { EditorView } from "@codemirror/view";
  import { app, findEmbed, noteHref } from "$lib/app.svelte.ts";
  import { createEditor, setText, type Where } from "$lib/editor/codemirror.ts";
  import { setMarks, setOverlays, setTouched, type Inline, type Mark, type Overlay, type Touched } from "$lib/editor/overlays.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { pointing } from "$lib/pointing.svelte.ts";
  import { digest, pastedName, pictureOf, pictureSrc, safeName } from "$lib/pictures.ts";
  import { address } from "$lib/editor/links.ts";
  import { MAX_FILE_BYTES, type PictureInfo } from "@isorite/engine";
  import PictureName from "./PictureName.svelte";
  import { setPointedNote } from "$lib/editor/pointing.ts";
  import { tray } from "$lib/tray.svelte.ts";
  import type { NoteIso } from "$lib/iso.svelte.ts";
  import type { NoteSession } from "$lib/note.svelte.ts";
  import IsoBlock from "./IsoBlock.svelte";
  import IsoChange from "./IsoChange.svelte";

  // Without `iso` (a note written for Iso) there is no prompt line and nothing is laid over the text.
  // `touched` is what a moment of the timeline changed, by line of the whole file, while it is pointed at.
  // `lens` is what the note's Iso lens marks (M10), by character of the whole file: Iso's words, and what was given to Iso.
  let { note, iso, source, placeholder, touched = null, lens = [] }: { note: NoteSession; iso?: NoteIso; source: boolean; placeholder?: string; touched?: Touched | null; lens?: Mark[] } = $props();

  let host: HTMLDivElement;
  let view = $state.raw<EditorView>();

  // ------------------------------------------------------------ pictures pasted or dropped (M22)

  const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/avif"];
  type Naming = Omit<import("svelte").ComponentProps<typeof PictureName>, "onDone"> & { onDone: (r: { path: string; alt: string; save: boolean } | null) => void };
  let naming = $state.raw<Naming | null>(null);
  let said = $state<string | null>(null);
  let sayTimer: ReturnType<typeof setTimeout> | undefined;
  const say = (text: string) => { said = text; clearTimeout(sayTimer); sayTimer = setTimeout(() => (said = null), 8000); };

  /** Each picture named in turn, saved beside the note (or the same one already there linked), and its link put in. */
  async function addPictures(files: File[], at: number, pasted: boolean): Promise<void> {
    if (!view || naming) return;
    if (import.meta.env.MODE === "guide") { say("The guide's site has nowhere to keep a picture. In isorite on your own machine, paste or drop one into a note and it's saved beside it."); return; }
    // A note of the base keeps its pictures in a folder named for it, linked from beside it; a note outside the base
    // (a draft, an Understanding note) in that of the note it's about, or in pictures/, linked from the top.
    const id = note.id, inBase = !id.startsWith("@");
    const about = id.startsWith("@understanding/") ? id.slice("@understanding/".length) : null;
    const folder = inBase ? id : about ?? "pictures";
    const hrefOf = (path: string) => (inBase && path.startsWith(`${id}/`) ? address(path.slice(id.lastIndexOf("/") + 1)) : `/${address(path)}`);
    let known: PictureInfo[] = [];
    try { known = await app.api.pictures(); } catch { /* none known: every name is free, as far as is known */ }
    const taken = new Set(known.map((p) => p.path));
    for (const file of files) {
      if (!TYPES.includes(file.type)) { say(`${file.name || "That"} isn't a picture isorite keeps: png, jpg, gif, webp, svg and avif are.`); continue; }
      if (file.size > MAX_FILE_BYTES) { say(`${file.name || "That picture"} is larger than isorite takes (${MAX_FILE_BYTES / 1e6} MB).`); continue; }
      const bytes = new Uint8Array(await file.arrayBuffer()), hash = await digest(bytes);
      const same = known.find((p) => p.sha256 === hash)?.path ?? null;
      const src = URL.createObjectURL(file), v = view;
      const c = v.coordsAtPos(Math.min(at, v.state.doc.length)), box = host.getBoundingClientRect();
      const result = await new Promise<{ path: string; alt: string; save: boolean } | null>((onDone) => {
        naming = {
          file, src, folder, same, onDone,
          suggested: pasted || !file.name ? pastedName() : safeName(file.name) || "picture",
          taken: (p: string) => taken.has(p),
          at: { left: Math.max(16, Math.min((c?.left ?? box.left), innerWidth - 476)), top: Math.min((c?.bottom ?? box.top) + 6, innerHeight - 220) },
        };
      });
      naming = null;
      URL.revokeObjectURL(src);
      if (!result) continue;
      if (result.save) {
        try {
          const info = await app.api.savePicture(result.path, bytes);
          known.push(info); taken.add(info.path);
        } catch (e) { say(`It wasn't saved: ${(e as Error).message}`); continue; }
      }
      const text = `![${result.alt.replace(/[[\]]/g, "")}](${hrefOf(result.path)})`;
      v.dispatch({ changes: { from: at, insert: text }, selection: { anchor: at + text.length } });
      at += text.length;
    }
    view.focus();
  }

  // The source shows the whole file; the live preview shows the text under the frontmatter. Iso's places are of
  // the whole file, so they are moved by the frontmatter's lines and characters on the way in and out.
  const head = $derived(source || !iso ? { lines: 0, chars: 0 } : iso.head);

  /** What Iso has over the text, placed in what the editor shows. */
  const laid = $derived.by((): { blocks: Overlay[]; marks: Mark[]; inline: Inline[] } => {
    if (!iso) return { blocks: [], marks: [], inline: [] };
    const within = (kind: Mark["kind"]) => (s: { from: number; to: number }): Mark => ({ kind, from: s.from - head.chars, to: s.to - head.chars });
    return {
      blocks: iso.layout.blocks.map((b) => ({ key: b.key, line: Math.max(0, b.line - head.lines) })).sort((a, b) => a.line - b.line),
      marks: [...iso.layout.picked.map(within("picked")), ...iso.layout.old.map(within("old")), ...lens.map((m) => within(m.kind)(m))].filter((m) => m.to > 0),
      inline: iso.layout.inline.map((i) => ({ key: i.key, at: i.at - head.chars })).filter((i) => i.at >= 0),
    };
  });

  onMount(() => {
    const made = createEditor(host, {
      doc: source ? note.text : note.body,
      source,
      label: source ? "The note's file" : "The note",
      notes: () => app.listing.notes.filter((n) => n.id !== note.id).map((n) => ({ id: n.id, title: n.title, folder: n.dir, ...(n.kind ? { kind: n.kind } : {}) })),
      onPictures: (files, at, pasted) => { void addPictures(files, at, pasted); },
      pictureSource: {
        pictures: async () => (await app.api.pictures()).map((p) => ({ path: p.path, width: p.width, height: p.height, src: pictureSrc(app.api, { path: p.path, from: "notes" }) })),
        here: () => note.id,
      },
      onChange: (text) => (source ? note.setText(text) : note.setBody(text)),
      onSave: () => { void note.save(); },
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
      onFollow: (id) => { void goto(noteHref(id)); },
      // An embedded question or problem (M12) opens in the Note pane.
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
      embeds: { find: findEmbed, open: (id) => { void goto(noteHref(id)); } },
      // A link under the mouse is lit on the Atlas (M17).
      onPoint: (to) => pointing.set("note", to ? { ...to, who: "you" } : null),
      codeBroken: (href) => app.listing.notes.find((n) => n.id === note.id)?.broken?.includes(href) ?? false,
      pictures: (href) => { const p = pictureOf(href, note.id); return p ? { key: `${p.from}:${p.path}`, src: pictureSrc(app.api, p) } : null; },
      // An artifact shown in the note (M23) works in place, in its sandboxed frame.
      artifacts: (href) => {
        const path = artifactOf(href, note.id);
        return path ? { path, mount: (el) => { const c = mount(ArtifactEmbed, { target: el, props: { path } }); return () => { void unmount(c); }; } } : null;
      },
      ...(iso ? {
        // Ctrl+Enter goes to Iso's pane (M10), with the text selected, if any, given to Iso.
        onAsk: (w: Where) => {
          const chosen = note.text.slice(w.from + head.chars, w.to + head.chars).trim();
          if (chosen) tray.add({ kind: "passage", id: note.id, title: note.fields.title || note.id, text: chosen });
          panes.to("iso");
          requestAnimationFrame(() => document.getElementById("iso-box")?.focus());
        },
        onCursor: (w: Where) => { iso.cursor = { line: w.line + head.lines, from: w.from + head.chars, to: w.to + head.chars }; },
        // While the prompt asks for a rewrite, text selected in the note is chosen for it.
        picking: () => iso.picking,
        onPick: (ranges: { from: number; to: number }[]) => iso.pick(ranges.map((r) => ({ from: r.from + head.chars, to: r.to + head.chars }))),
        onUnpick: (at: number) => iso.unpick(at + head.chars),
        mountOverlay: (el: HTMLElement, key: string) => {
          // "r:…" is one change of a rewrite.
          const piece = mount(key.startsWith("r:") ? IsoChange : IsoBlock, { target: el, props: { iso, key } });
          return () => { void unmount(piece); };
        },
      } : { placeholder: untrack(() => placeholder) ?? "Write what you understand, what you do not, and what you want from Iso. [[ links a note it should rest on." }),
    });
    view = made;
    return () => { made.destroy(); pointing.set("note", null); };
  });

  // The text was replaced from outside the editor (their version, a change made elsewhere, a proposal kept).
  $effect(() => {
    void note.revision;
    untrack(() => { if (view) setText(view, source ? note.text : note.body); });
  });

  // What a moment of the timeline changed, in the lines the editor shows.
  $effect(() => {
    const t = touched, lines = head.lines;
    if (view) view.dispatch({ effects: setTouched.of(t ? { who: t.who, lines: t.lines.map((l) => l - lines) } : null) });
  });

  // The note pointed at on the Atlas: its links here are marked (M17).
  $effect(() => {
    const id = pointing.onAtlas;
    if (view) view.dispatch({ effects: setPointedNote.of(id) });
  });

  // The blocks are placed again whenever the note or what Iso has in it changes.
  $effect(() => {
    const { blocks, marks, inline } = laid;
    if (view) view.dispatch({ effects: [setOverlays.of(blocks), setMarks.of({ marks, inline })] });
  });
</script>

<div class="editor" class:source bind:this={host}></div>
{#if naming}<PictureName {...naming} />{/if}
{#if said}<p class="said" role="status">{said}</p>{/if}

<style>
  .editor { min-height: 50vh; }
  .said { position: fixed; z-index: 50; bottom: 24px; left: 50%; transform: translateX(-50%); max-width: min(520px, calc(100vw - 32px)); margin: 0; padding: 10px 14px; background: var(--ground-1); border: 1px solid var(--line-strong); font-family: var(--font-ui); font-size: 13px; }
</style>
