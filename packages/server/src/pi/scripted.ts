// A scripted model for isorite's own agent, for the browser tests and for looking at the pane: no network, no key.
// Offered only where ISORITE_SCRIPTED=1 (the test server sets it); then `scripted/scripted` is a model like any other.
//
// Each prompt is read as a script, a line each; lines it does not know are just what was asked. It makes one tool call a
// step, in order, through the agent's own loop (so the base sees them as any agent's), then replies:
//   read <note id>              read_note
//   outline <note id>           outline_note
//   search <words>              search_notes
//   edit <note id> <old> => <new>   edit_note: <old> replaced by <new>
//   write <note id> <title>     write_note: a new note with that title
//   ask <note id> <title>       ask_question about the note
//   offer <note id> <text>      offer_text for the note
//   file <path>                 read a file of the project (pi's read)
//   run <command>               bash (refused by the loop where the pane's Run is off: the tool is not there)
//   skill <name> [path]         use_skill: a skill's instructions, or a file it holds
//   wait <ms>                   take that long before the next step (a turn to stop, or to steer)
//   think <words>               think aloud before the reply
//   cite <link>                 cite the link in the reply: [cited](<link>)
//   draw                        reply with a diagram and a code block
//   long                        reply at length, a few paragraphs
//   say <words>                 reply with these words (a written \n in them is a newline)
//   fail <message>              end the turn with the model failing so (a rate limit, a missing key)
// The reply cites the first note read, in isorite's link form. When the prompt came with images, it says so ("Saw 1 image: image/png, 68 bytes."), which
// is how a test knows they reached the model. `scripted/scripted-text` is the same model without sight: it takes no images.

import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxThinking, fauxToolCall, type FauxContentBlock } from "@earendil-works/pi-ai";

export const SCRIPTED = "scripted";
/** The scripted model that takes no images. */
export const SCRIPTED_TEXT = "scripted-text";
/** Offered here: the environment says so. */
export const scriptedOn = (env: NodeJS.ProcessEnv): boolean => env.ISORITE_SCRIPTED === "1";

const DRAWN = "Here is how they stand:\n\n```mermaid\nflowchart LR\n  s[Surprise] --> e[Entropy]\n```\n\nAnd in code:\n\n```python\ndef surprise(p):\n    return -log2(p)  # in bits\n```";
const LONG = "Surprise is how unexpected one outcome is: an outcome of probability p carries −log p of it, so the rarer the outcome, the more it tells you when it comes.\n\nEntropy is the surprise you expect on average, over every outcome a source can emit. A fair coin has one bit of it; a coin that always lands heads has none, since nothing it does can surprise you.\n\nThe two meet in coding: a code that spends about −log p bits on an outcome of probability p is as short, on average, as any code can be. Huffman's construction gets within a bit of that.";

type Step = { name: string; args: Record<string, unknown>; wait: number };
interface Script { steps: Step[]; wait: number; think: string[]; cite: string[]; draw: boolean; long: boolean; say: string; fail: string; read: string[]; seen: string[] }

/** The script a prompt holds. */
export function parse(text: string): Script {
  const s: Script = { steps: [], wait: 0, think: [], cite: [], draw: false, long: false, say: "", fail: "", read: [], seen: [] };
  let wait = 0;
  const step = (name: string, args: Record<string, unknown>) => { s.steps.push({ name, args, wait }); wait = 0; };
  for (const line of text.split("\n").map((l) => l.trim())) {
    const [verb = "", ...rest] = line.split(/\s+/), arg = rest.join(" "), [id = "", ...more] = rest, tail = more.join(" ");
    if (verb === "read" && id) { step("read_note", { id }); s.read.push(id); }
    else if (verb === "outline" && id) step("outline_note", { id });
    else if (verb === "search" && arg) step("search_notes", { query: arg });
    else if (verb === "edit" && id && tail.includes("=>")) { const [from, to] = tail.split("=>").map((x) => x.trim()); step("edit_note", { note: id, oldString: from, newString: to }); }
    else if (verb === "write" && id) step("write_note", { note: id, content: `---\ntype: Concept\ntitle: ${tail || id.split("/").at(-1)}\n---\n\nWritten by the agent.\n` });
    else if (verb === "ask" && id) step("ask_question", { title: tail || "Why does it drift?", text: "", about: [id] });
    else if (verb === "offer" && id) step("offer_text", { id, text: tail });
    else if (verb === "file" && arg) step("read", { path: arg });
    else if (verb === "run" && arg) step("bash", { command: arg });
    else if (verb === "skill" && id) step("use_skill", { name: id, ...(tail ? { path: tail } : {}) });
    else if (verb === "wait") wait += Number(arg) || 500;
    else if (verb === "think" && arg) s.think.push(arg);
    else if (verb === "cite" && arg) s.cite.push(arg);
    else if (verb === "draw") s.draw = true;
    else if (verb === "long") s.long = true;
    else if (verb === "say" && arg) s.say = arg;
    else if (verb === "fail") s.fail = arg || "the model failed";
  }
  s.wait = wait;
  return s;
}

/** The reply once every step is made. */
export function reply(s: Script): string {
  if (s.say) return s.say.replaceAll("\\n", "\n");
  const cite = s.read[0] ? `[as the note says](/${s.read[0].replace(/^\/+|\.md$/g, "")}.md)` : "with no note";
  return `Done, ${cite}${s.cite.map((c) => `, [cited](${c})`).join("")}.${s.seen.length ? ` Saw ${s.seen.length === 1 ? "1 image" : `${s.seen.length} images`}: ${s.seen.join("; ")}.` : ""}${s.long ? `\n\n${LONG}` : ""}${s.draw ? `\n\n${DRAWN}` : ""}`;
}

const sleep = (ms: number, signal?: AbortSignal): Promise<boolean> => new Promise((done) => {
  if (!ms) { done(true); return; }
  if (signal?.aborted) { done(false); return; }
  const t = setTimeout(() => { signal?.removeEventListener("abort", stop); done(true); }, ms);
  const stop = () => { clearTimeout(t); done(false); };
  signal?.addEventListener("abort", stop, { once: true });
});

type Message = { role?: string; content?: unknown };
// The person's request is the last block of their message: what is given with it, or a skill invoked, goes before it and is not a script.
const textOf = (content: unknown): string => (typeof content === "string" ? content : Array.isArray(content) ? content.filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b.text ?? "").slice(-1).join("") : "");

/** The model and the way to reach it. Each request reads the conversation: the person's last message is the script,
 *  and how many answers have come since it says which step is next. */
export function scriptedModel(id: string = SCRIPTED): { chosen: ReturnType<ReturnType<typeof fauxProvider>["getModel"]>; streamFn: (...args: never[]) => unknown } {
  const faux = fauxProvider({ provider: SCRIPTED, models: [{ id: SCRIPTED, name: "Scripted", contextWindow: 200_000, maxTokens: 8000 }, { id: SCRIPTED_TEXT, name: "Scripted, text only", contextWindow: 200_000, maxTokens: 8000, input: ["text"] }], tokensPerSecond: 600, tokenSize: { min: 2, max: 6 } });
  const models = createModels();
  models.setProvider(faux.provider);
  const respond = async (context: { messages: Message[] }, options?: { signal?: AbortSignal }) => {
    const messages = context.messages;
    let at = messages.length - 1;
    // The person's last message (a tool's result is not theirs), and how many answers since.
    while (at >= 0 && messages[at]!.role !== "user") at--;
    const said = at >= 0 ? textOf(messages[at]!.content) : "";
    const k = messages.slice(at + 1).filter((m) => m.role === "assistant").length;
    // A summary asked for (compaction): a line will do, with the focus the person gave (`/compact <words>`) after it.
    if (/summar/i.test(said) && /<conversation>|earlier part/i.test(said)) {
      const focus = /\n\nAdditional focus: ([^]*)$/.exec(said)?.[1]?.trim();
      return fauxAssistantMessage([fauxText(`Earlier, they asked about the notes.${focus ? ` Kept: ${focus}` : ""}`)]);
    }
    const s = parse(said);
    // The images the person's message came with: what the model was sent of them (a type, and the bytes' size).
    const sent = at >= 0 && Array.isArray(messages[at]!.content) ? (messages[at]!.content as { type?: string; mimeType?: string; data?: string }[]).filter((b) => b?.type === "image") : [];
    s.seen = sent.map((b) => `${b.mimeType}, ${Buffer.from(b.data ?? "", "base64").length} bytes`);
    const next = s.steps[k];
    if (!(await sleep(next ? next.wait : s.wait, options?.signal))) return fauxAssistantMessage([], { stopReason: "aborted" });
    if (next) return fauxAssistantMessage([fauxToolCall(next.name, next.args as never, { id: `call-${k}-${Math.random().toString(36).slice(2, 8)}` })], { stopReason: "toolUse" });
    if (s.fail) return fauxAssistantMessage([], { stopReason: "error", errorMessage: s.fail });
    const content: FauxContentBlock[] = [...(s.think.length ? [fauxThinking(s.think.join("\n"))] : []), fauxText(reply(s))];
    return fauxAssistantMessage(content);
  };
  const streamFn = ((model: never, context: never, options: never) => {
    faux.appendResponses([respond as never]);
    return models.streamSimple(model, context, options);
  }) as (...args: never[]) => unknown;
  return { chosen: faux.getModel(id) ?? faux.getModel(), streamFn };
}
