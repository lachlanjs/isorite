// Link suggestions while writing: "[[" offers notes by title and inserts an
// ordinary Markdown link to the note ([Title](/folder/note.md)), the form the
// bundle's other links use; inside "](" it offers note paths, and pictures'.
// "[[!" (M22) offers what can be shown in the note: its pictures, each with a
// thumbnail, put in as Markdown (![what it shows](/folder/picture.png)), and
// its questions and problems, put in as embeds ([[!name]]).

import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { embedFor } from "@isorite/core";

export interface LinkTarget {
  id: string; // such as forms/orientation
  title: string;
  folder: string; // for telling apart notes with the same title
  kind?: "question" | "problem"; // embeddable with [[!name]] (M12)
}

/** A picture in the notes, as `[[!` offers it (M22). */
export interface PictureChoice {
  path: string; // from the top of the notes: art/sprites/player.png
  width: number | null;
  height: number | null;
  /** Where the browser gets it, for its thumbnail. */
  src: string | Promise<string | null>;
}

/** What `[[!` and `](` offer of the notes' pictures: asked for each time the list opens, so it's as the folder is. */
export interface PictureSource {
  pictures: () => Promise<PictureChoice[]>;
  /** The note being written: pictures beside it come first. */
  here: () => string;
}

type PictureCompletion = Completion & { picture?: PictureChoice };

function fromTitle(notes: () => LinkTarget[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const before = ctx.matchBefore(/\[\[(?!!)[^\]\n]*$/);
    if (!before) return null;
    const options: Completion[] = notes().map((n) => ({
      label: n.title,
      detail: n.folder,
      apply: (view, _c, from, to) => {
        const text = `[${n.title}](/${n.id}.md)`;
        // Replace the "[[" too, and the "]]" that bracket closing added.
        const start = from - 2, end = view.state.sliceDoc(to, to + 2) === "]]" ? to + 2 : to;
        view.dispatch({ changes: { from: start, to: end, insert: text }, selection: { anchor: start + text.length } });
      },
    }));
    // Matched against what follows the "[[".
    return { from: before.from + 2, options, filter: true, validFor: /^[^\]\n]*$/ };
  };
}

/** What a picture shows, as a first guess from its file name: "player-idle.png" is "player idle". */
export const describedAs = (path: string): string => path.split("/").at(-1)!.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();

/** A path as a link's address: in angle brackets where it has a space or a bracket. */
export const address = (path: string): string => (/[\s()<>]/.test(path) ? `<${path}>` : path);

function fromEmbed(notes: () => LinkTarget[], source: PictureSource | null) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const before = ctx.matchBefore(/\[\[![^\]\n]*$/);
    if (!before) return null;
    // Replace the "[[!" and the "]]" bracket closing added.
    const replace = (view: Parameters<Exclude<Completion["apply"], string | undefined>>[0], from: number, to: number, text: string, select?: [number, number]) => {
      const start = from - 3, end = view.state.sliceDoc(to, to + 2) === "]]" ? to + 2 : to;
      view.dispatch({ changes: { from: start, to: end, insert: text }, selection: select ? { anchor: start + select[0], head: start + select[1] } : { anchor: start + text.length } });
    };
    const here = source?.here() ?? "", dir = here.includes("/") ? here.slice(0, here.lastIndexOf("/")) : "";
    const pictures = source ? await source.pictures().catch(() => []) : [];
    const options: PictureCompletion[] = pictures.map((p) => {
      const folder = p.path.includes("/") ? p.path.slice(0, p.path.lastIndexOf("/")) : "";
      return {
        label: p.path.split("/").at(-1)!,
        detail: folder,
        picture: p,
        type: "picture",
        // This note's own pictures first, then those in its folder.
        boost: folder === here ? 2 : folder === dir ? 1 : 0,
        info: () => preview(p),
        apply: (view, _c, from, to) => {
          const said = describedAs(p.path), text = `![${said}](/${address(p.path)})`;
          replace(view, from, to, text, [2, 2 + said.length]);
        },
      };
    });
    const ids = notes().map((n) => n.id);
    for (const n of notes()) {
      if (!n.kind) continue;
      options.push({ label: n.title, detail: n.kind, boost: -1, apply: (view, _c, from, to) => replace(view, from, to, embedFor(n.id, ids)) });
    }
    if (source) options.push({ label: "Paste or drop a picture to add one", type: "hint", boost: -99, apply: () => undefined });
    return { from: before.from + 3, options, filter: true, validFor: /^[^\]\n]*$/ };
  };
}

function fromPath(notes: () => LinkTarget[], source: PictureSource | null) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const before = ctx.matchBefore(/\]\([^)\s]*$/);
    if (!before) return null;
    const pictures = source ? await source.pictures().catch(() => []) : [];
    return {
      from: before.from + 2,
      options: [
        ...notes().map((n): PictureCompletion => ({ label: `/${n.id}.md`, detail: n.title })),
        ...pictures.map((p): PictureCompletion => ({ label: `/${p.path}`, detail: "picture", picture: p, type: "picture", info: () => preview(p) })),
      ],
      validFor: /^[^)\s]*$/,
    };
  };
}

/** Where a picture's thumbnail or preview gets its source. */
function show(img: HTMLImageElement, p: PictureChoice): void {
  img.alt = "";
  img.decoding = "async";
  if (typeof p.src === "string") img.src = p.src;
  else void p.src.then((s) => { if (s) img.src = s; });
}

/** The picture larger, beside the list, with its size in pixels. */
function preview(p: PictureChoice): HTMLElement {
  const box = document.createElement("div");
  box.className = "cm-picture-preview";
  const img = document.createElement("img");
  show(img, p);
  const size = document.createElement("div");
  size.className = "cm-picture-size";
  size.textContent = p.width && p.height ? `${p.width} × ${p.height}` : "";
  box.append(img, size);
  return box;
}

export function linkCompletion(notes: () => LinkTarget[], source: PictureSource | null = null) {
  return autocompletion({
    override: [fromEmbed(notes, source), fromTitle(notes), fromPath(notes, source)],
    icons: false,
    activateOnTyping: true,
    // A picture's thumbnail, at the left of its name.
    addToOptions: [{
      position: 20,
      render: (c: PictureCompletion) => {
        if (!c.picture) return null;
        const img = document.createElement("img");
        img.className = "cm-picture-thumb";
        img.loading = "lazy";
        show(img, c.picture);
        return img;
      },
    }],
  });
}
