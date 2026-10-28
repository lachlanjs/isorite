// isorite as an artifact's host (plan-m23 §3.4): the kit, read once from the app's own files; an artifact's
// document, assembled and given to a sandboxed frame through srcdoc, so the frame makes no request of its own; and
// the bridge, which answers it with the files its manifest names and nothing else.

import { asset } from "$app/paths";
import { KIT_FILES, assemble, manifestOf, type KitFiles, type Manifest } from "@isorite/kit";
import type { Api } from "@isorite/engine";

let kit: Promise<KitFiles> | null = null;
/** The kit's built files (packages/kit, built into the app's static files). */
export function kitFiles(): Promise<KitFiles> {
  kit ??= Promise.all(KIT_FILES.map(async (f) => {
    const r = await fetch(asset(`/kit/${f}`));
    if (!r.ok) throw new Error(`the kit's ${f} isn't there (${r.status}): build the app again`);
    return [f, await r.text()] as const;
  })).then((pairs) => Object.fromEntries(pairs) as KitFiles).catch((e) => { kit = null; throw e; });
  return kit;
}

const folderOf = (path: string) => path.split("/").slice(0, -1).join("/");
/** A path the artifact names, relative to it, as a path in the notes; null when it leaves them. */
export function within(artifact: string, rel: string): string | null {
  const parts = folderOf(artifact).split("/").filter(Boolean);
  for (const p of rel.replace(/^\.\//, "").split("/")) {
    if (p === "" || p === ".") continue;
    if (p === "..") { if (!parts.length) return null; parts.pop(); } else parts.push(p);
  }
  return parts.join("/");
}

export interface Loaded { html: string; manifest: Manifest }
export async function loadArtifact(api: Api, path: string): Promise<Loaded> {
  const got = await api.file(path);
  if (!got) throw new Error(`no artifact at ${path}`);
  const html = new TextDecoder().decode(got.bytes);
  return { html, manifest: manifestOf(html) };
}

/** The data its manifest names, read for a standalone export: text as text, anything else as bytes. */
export async function dataOf(api: Api, path: string, uses: string[]): Promise<Record<string, string | Uint8Array>> {
  const out: Record<string, string | Uint8Array> = {};
  for (const rel of uses) {
    const at = within(path, rel), got = at === null ? null : await api.file(at);
    if (!got) continue;
    out[rel] = /^(text\/|application\/(json|jsonl|x-ndjson))/.test(got.type) ? new TextDecoder().decode(got.bytes) : got.bytes;
  }
  return out;
}

/** One artifact's document for its frame, or a standalone export with its data inside. */
export async function documentOf(html: string, opts: { look: string; ground: string; data?: Record<string, string | Uint8Array> }): Promise<string> {
  return assemble(html, await kitFiles(), opts);
}

export interface Bridge {
  /** What the frame said: its height, an error, a note to open. */
  onHeight(px: number): void;
  onError(message: string): void;
  onOpen(note: string): void;
  /** Ground and look as they are now, sent when the frame is ready. */
  current(): { ground: string; look: string };
}
/** Answers one frame: its file and bytes requests from its manifest only, and passes on what it says. Returns a
 *  function that sends it a message, and one that stops listening. */
export function bridge(frame: HTMLIFrameElement, api: Api, path: string, uses: () => string[], to: Bridge): { tell(m: object): void; stop(): void } {
  const tell = (m: object, transfer: Transferable[] = []) => frame.contentWindow?.postMessage({ isorite: 0, ...m }, "*", transfer);
  const listen = async (e: MessageEvent) => {
    if (e.source !== frame.contentWindow) return;
    const m = e.data;
    if (!m || m.isorite !== 0) return;
    if (m.type === "ready") { const c = to.current(); tell({ type: "ground", ground: c.ground }); tell({ type: "look", look: c.look }); }
    else if (m.type === "file" || m.type === "bytes") {
      const rel = String(m.path ?? "");
      if (!uses().includes(rel)) { tell({ type: "reply", id: m.id, error: `${rel} is not in the artifact's manifest (isorite:uses)` }); return; }
      const at = within(path, rel);
      try {
        const got = at === null ? null : await api.file(at);
        if (!got) tell({ type: "reply", id: m.id, error: `${rel}: no such file beside the artifact` });
        else if (m.type === "bytes") { const buf = got.bytes.slice().buffer; tell({ type: "reply", id: m.id, bytes: buf }, [buf]); }
        else tell({ type: "reply", id: m.id, text: new TextDecoder().decode(got.bytes) });
      } catch (err) { tell({ type: "reply", id: m.id, error: `${rel}: ${(err as Error).message}` }); }
    }
    else if (m.type === "height") to.onHeight(Number(m.height) || 0);
    else if (m.type === "error") to.onError(String(m.message));
    else if (m.type === "open") to.onOpen(String(m.note));
  };
  addEventListener("message", listen);
  return { tell, stop: () => removeEventListener("message", listen) };
}

/** The artifact an address in a note names (`/a/fig.html`, or `fig.html` beside the note), or null. */
export function artifactOf(href: string, noteId: string): string | null {
  const raw = href.split(/[#?]/)[0]!.trim();
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//") || !/\.html?$/i.test(raw)) return null;
  const at = raw.startsWith("/") ? raw.slice(1) : within(`${noteId}.md`, raw);
  return at ? decodeURI(at) : null;
}

/** The ground as the page shows it: the one chosen, or the system's. */
export function groundNow(): "lapis" | "quartz" {
  const g = document.documentElement.dataset.ground;
  if (g === "lapis" || g === "quartz") return g;
  return matchMedia("(prefers-color-scheme: light)").matches ? "quartz" : "lapis";
}

/** A 3D model shown through the kit's viewer: a small artifact made for it. */
export function modelArtifact(name: string): string {
  const esc = name.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc}</title><meta name="isorite:kit" content="1"><meta name="isorite:uses" content="${esc}"></head><body><iso-model src="${esc}" height="440"></iso-model></body></html>`;
}
