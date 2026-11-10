<script lang="ts">
  // The text of a note, in CodeMirror: the body as a live preview, or the whole file as source. What the note's
  // provenance lens marks is laid over it (overlays.ts).
  import { mount, onMount, unmount, untrack } from "svelte";
  import { citeKind, codeTarget, splitSource } from "@isorite/core";
  import { artifactOf } from "$lib/artifact.ts";
  import CodeEmbed from "$lib/components/CodeEmbed.svelte";
  import ArtifactEmbed from "./ArtifactEmbed.svelte";
  import { goto } from "$app/navigation";
  import type { EditorView } from "@codemirror/view";
  import { app, codeHref, findEmbed, noteHref, slug } from "$lib/app.svelte.ts";
  import { createEditor, setText, type Where } from "$lib/editor/codemirror.ts";
  import { setMarks, setTouched, type Mark, type Touched } from "$lib/editor/overlays.ts";
  import { panes } from "$lib/panes.svelte.ts";
  import { pointing } from "$lib/pointing.svelte.ts";
  import { digest, pastedName, pictureOf, pictureSrc, safeName } from "$lib/pictures.ts";
  import { address, titled } from "$lib/editor/links.ts";
  import { MAX_FILE_BYTES, type PictureInfo } from "@isorite/engine";
  import PictureName from "./PictureName.svelte";
  import { setPointedLines, setPointedNote } from "$lib/editor/pointing.ts";
  import { pointers } from "$lib/pointers.svelte.ts";
  import type { NoteSession } from "$lib/note.svelte.ts";

  // `touched` is what a moment of the timeline changed, by line of the whole file, while it is pointed at.
  // `lens` is what the note's agent lens marks (M10), by character of the whole file: the agent's words, and what was given to the agent.
  let { note, source, reading = false, touched = null, lens = [] }: { note: NoteSession; source: boolean; /** Read mode (M30): the note as it is read, not edited. */ reading?: boolean; touched?: Touched | null; lens?: Mark[] } = $props();

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
    // (a draft) in pictures/, linked from the top.
    const id = note.id, inBase = !id.startsWith("@");
    const folder = inBase ? id : "pictures";
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

  // The source shows the whole file; the live preview shows the text under the frontmatter. The agent's places are of
  // the whole file, so they are moved by the frontmatter's lines and characters on the way in and out.
  const head = $derived.by(() => {
    if (source) return { lines: 0, chars: 0 };
    try { const prefix = splitSource(note.text)[0]; return { lines: prefix.split("\n").length - 1, chars: prefix.length }; } catch { return { lines: 0, chars: 0 }; }
  });

  /** What the lens marks, placed in what the editor shows. */
  const laid = $derived(lens.map((m) => ({ kind: m.kind, from: m.from - head.chars, to: m.to - head.chars })).filter((m) => m.to > 0));

  onMount(() => {
    const made = createEditor(host, {
      doc: source ? note.text : note.body,
      source,
      readOnly: reading,
      label: source ? "The note's file" : "The note",
      notes: () => app.listing.notes.filter((n) => n.id !== note.id).map((n) => ({ id: n.id, title: n.title, folder: n.dir, ...(n.kind ? { kind: n.kind } : {}) })),
      noteMaker: {
        plan: (typed) => {
          const title = titled(typed), name = slug(title);
          if (!name) return null;
          // Beside this note: in its folder, or at the top for a draft or a note at the top.
          const folder = note.id.startsWith("@") || !note.id.includes("/") ? "" : note.id.slice(0, note.id.lastIndexOf("/"));
          return { title, id: [folder, name].filter(Boolean).join("/"), folder };
        },
        make: (n) => {
          void app.api.createNote(n.id, `---\ntype: Concept\ntitle: ${JSON.stringify(n.title)}\n---\n\n`).then(() => app.refresh(), (e: Error) => say(`${n.title} wasn't made: ${e.message}`));
        },
      },
      onPictures: (files, at, pasted) => { void addPictures(files, at, pasted); },
      pictureSource: {
        pictures: async () => (await app.api.pictures()).map((p) => ({ path: p.path, width: p.width, height: p.height, src: pictureSrc(app.api, { path: p.path, from: "notes" }) })),
        here: () => note.id,
      },
      onChange: (text) => (source ? note.setText(text) : note.setBody(text)),
      onSave: () => { void note.save(); },
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves
      onCode: (href) => { void goto(codeHref(href)); },
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
        // Code of the repository, in place (M29): `![…](code:path#symbol)`, but not a picture, which is drawn as one.
        const c = href.trim().startsWith("code:") ? codeTarget(href.trim()) : null;
        if (c && citeKind(c.path) !== "image") return { path: href, mount: (el) => { const e = mount(CodeEmbed, { target: el, props: { href: href.trim() } }); return () => { void unmount(e); }; } };
        const path = artifactOf(href, note.id);
        return path ? { path, mount: (el) => { const c = mount(ArtifactEmbed, { target: el, props: { path } }); return () => { void unmount(c); }; } } : null;
      },
      // Ctrl+Enter goes to the agent's pane (M10), with the text selected, if any, given to it.
      onAsk: (w: Where) => {
        // What is selected goes into the prompt as a pointer (pointers), at its cursor.
        const chosen = note.text.slice(w.from + head.chars, w.to + head.chars).trim();
        const doc = view?.state.doc;
        const p = chosen && doc ? pointers.make({ kind: "note", ref: note.id, title: note.fields.title || note.id, from: doc.lineAt(w.from).number + head.lines, to: doc.lineAt(Math.max(w.from, w.to - (doc.lineAt(w.to).from === w.to && w.to > w.from ? 1 : 0))).number + head.lines, text: chosen }) : null;
        if (p) pointers.insert?.(p); else document.getElementById("agent-box")?.focus();
        panes.to("agent");
      },
    });
    view = made;
    return () => { made.destroy(); pointing.set("note", null); };
  });

  // The text was replaced from outside the editor (their version, a change made elsewhere).
  $effect(() => {
    void note.revision;
    untrack(() => { if (view) setText(view, source ? note.text : note.body); });
  });

  // A pointer in the prompt pointed at: its words in this note are marked, if it is this note's.
  $effect(() => {
    const h = pointers.hover, id = note.id, lines = head.lines;
    if (view) view.dispatch({ effects: setPointedLines.of(h && h.kind === "note" && h.ref === id ? { from: h.from - lines, to: h.to - lines } : null) });
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

  // The marks are placed again whenever the note or what the lens marks changes.
  $effect(() => {
    const marks = laid;
    if (view) view.dispatch({ effects: setMarks.of(marks) });
  });
</script>

<div class="editor" class:source bind:this={host} data-point="note:{note.id}" data-line-offset={head.lines}></div>
{#if naming}<PictureName {...naming} />{/if}
{#if said}<p class="said" role="status">{said}</p>{/if}

<style>
  .editor { min-height: 50vh; }
  .said { position: fixed; z-index: 50; bottom: 24px; left: 50%; transform: translateX(-50%); max-width: min(520px, calc(100vw - 32px)); margin: 0; padding: 10px 14px; background: var(--ground-1); border: 1px solid var(--line-strong); font-family: var(--font-ui); font-size: 0.8125rem; }
</style>
