// The base's tools over MCP's Streamable HTTP (M25), at /mcp on the base's own address (/b/<name>/mcp). Stateless,
// as MCP's 2026-07-28 revision has it: no session is kept, and a client that still opens with `initialize` (as
// those before it do) is answered without one. Each request is answered with JSON, never a stream.
//
// Who is asking is the agent's name: `?agent=` on the address (as `isorite mcp` gives it), else the
// client's own name where the request carries it, else "mcp". MCP says nothing of turns: one begins with a look-up,
// and ends after a quiet spell.

import type { Api } from "@isorite/engine";
import { slimLook, slimTools } from "./pi/slim.ts";

export const PROTOCOL = "2026-07-28";
/** The revisions answered, newest first: a client asking for one of these gets it. */
const KNOWN = [PROTOCOL, "2025-11-25", "2025-06-18", "2025-03-26"];
/** How long without a look-up before a turn is taken to have ended. */
export const QUIET_MS = 30_000;

export const INSTRUCTIONS = [
  "A knowledge base of notes, the person's own. Look in it before you answer from what you know: brief_base once first, then search_notes, outline_note and read_note (a section, not the whole note, where one will do), following a note's links before searching again. Where the notes don't cover the question, say so, and answer from what you know. Answer plainly: the point first, in few words.",
  "Where your answer rests on a note, cite it in the sentence: the phrase that rests on it is a Markdown link to the note by its path, as [the phrase](/folder/note.md) or [the phrase](/folder/note.md#Section), the path as the tools give it. No numbered references, no list of sources. Never invent a note, a link or a quotation.",
  "Before you write or change a note, or teach them something, call brief_base with part=writing (once): how notes are kept. Where a question back would do more than an answer, ask it with ask_question; it becomes an open question note. Where their own words would fill a gap in a note, offer them with offer_text rather than writing them in.",
  "Their message may point at passages they chose: a mark like [^1] stands where they mean it, defined at the end of the message with the file, its lines and the words quoted. Read the file for the text around it; the lines may have moved.",
  "Other knowledge bases lent to you (the agent's memory among them) are named by brief_base: pass base to the same tools to look or write there, and follow the practice each one's brief gives.",
].join("\n\n");

export interface Rpc { jsonrpc?: "2.0"; id?: string | number | null; method?: string; params?: Record<string, unknown> }
export interface Asker { agent: string; session: string; asked?: string; quiet?: number }

/** The client's name, where a request carries it: `_meta`'s client info (2026-07-28), or initialize's. */
export function clientName(rpc: Rpc): string | null {
  const meta = (rpc.params?._meta ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(meta)) if (/clientInfo$/i.test(k) && typeof (v as { name?: unknown })?.name === "string") return (v as { name: string }).name;
  const info = rpc.params?.clientInfo as { name?: unknown } | undefined;
  return typeof info?.name === "string" ? info.name : null;
}

/** A name the Atlas can show: small letters, digits and dashes. */
export const agentName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "mcp";

export class McpEndpoint {
  readonly #api: Api;
  readonly #base: string;
  readonly #version: string;
  #quiet = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(api: Api, { base, version }: { base: string; version: string }) {
    this.#api = api;
    this.#base = base;
    this.#version = version;
  }

  /** The answer to one request, or null for a notification. */
  async answer(rpc: Rpc, who: Asker): Promise<object | null> {
    if (rpc.id === undefined || rpc.id === null) return null;
    try {
      return { jsonrpc: "2.0", id: rpc.id, result: await this.#result(rpc, who) };
    } catch (e) {
      const err = e as Error & { code?: number };
      return { jsonrpc: "2.0", id: rpc.id, error: { code: err.code ?? -32603, message: err.message } };
    }
  }

  async #result(rpc: Rpc, who: Asker): Promise<object> {
    const p = rpc.params ?? {};
    switch (rpc.method) {
      case "initialize": {
        const asked = typeof p.protocolVersion === "string" && KNOWN.includes(p.protocolVersion) ? p.protocolVersion : KNOWN[1]!;
        return { protocolVersion: asked, capabilities: this.#capabilities(), serverInfo: this.#info(), instructions: INSTRUCTIONS };
      }
      case "server/discover":
        return { supportedVersions: KNOWN, capabilities: this.#capabilities(), serverInfo: this.#info(), instructions: INSTRUCTIONS };
      case "ping":
        return {};
      case "tools/list": {
        const tools = slimTools(await this.#api.agentTools());
        return { tools: tools.map(({ function: t }) => ({ name: t.name, description: t.description, inputSchema: t.parameters })) };
      }
      case "tools/call": {
        const tool = String(p.name ?? ""), args = (p.arguments ?? {}) as Record<string, unknown>;
        this.#busy(who);
        try {
          const { text } = await slimLook((t, a) => this.#api.agentLook({ agent: who.agent, session: who.session, tool: t, args: a, ...(who.asked ? { asked: who.asked } : {}) }), tool, args);
          return { content: [{ type: "text", text }] };
        } catch (e) {
          return { content: [{ type: "text", text: (e as Error).message }], isError: true };
        }
      }
      case "resources/list": {
        const { notes } = await this.#api.notes();
        return { resources: notes.map((n) => ({ uri: `isorite://${this.#base}/${n.id}`, name: n.id, title: n.title, mimeType: "text/markdown" })) };
      }
      case "resources/templates/list":
        return { resourceTemplates: [] };
      case "resources/read": {
        const uri = String(p.uri ?? ""), prefix = `isorite://${this.#base}/`;
        if (!uri.startsWith(prefix)) throw Object.assign(new Error(`no resource ${uri}`), { code: -32602 });
        const note = await this.#api.readNote(uri.slice(prefix.length)).catch(() => null);
        if (!note) throw Object.assign(new Error(`no note at ${uri}`), { code: -32602 });
        return { contents: [{ uri, mimeType: "text/markdown", text: note.text }] };
      }
      default:
        throw Object.assign(new Error(`no method ${rpc.method}`), { code: -32601 });
    }
  }

  #capabilities() { return { tools: {}, resources: {} }; }
  #info() { return { name: "isorite", title: `isorite: ${this.#base}`, version: this.#version }; }

  /** A look-up keeps the agent's turn going; quiet for a while, it ends. */
  #busy({ agent, session, quiet = QUIET_MS }: Asker): void {
    const key = `${agent}/${session}`;
    clearTimeout(this.#quiet.get(key));
    this.#quiet.set(key, setTimeout(() => { this.#quiet.delete(key); void this.#api.agentStatus(agent, session, false).catch(() => undefined); }, quiet).unref());
  }
}
