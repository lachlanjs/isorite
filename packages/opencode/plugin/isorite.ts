// The isorite server, as the plugin reaches it: over HTTP, as the browser does.
// `isorite term` names it in ISORITE_URL.

/** This harness's name as the server knows its agent. */
export const AGENT = "opencode";

export const url = (process.env.ISORITE_URL ?? "http://127.0.0.1:4767").replace(/\/$/, "");

export interface Session { name: string; study: boolean; device: string; token: string }
export interface Listing { notes: { id: string; title: string; dir: string }[]; dirs: string[] }

/** A GET on the server's API; a refusal is thrown with the server's own words. */
export async function get<T>(path: string): Promise<T> {
  const response = await fetch(url + path);
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `${response.status} from ${url + path}`);
  return body;
}

let token: Promise<string> | null = null;

/** A POST to the server, made as its own page makes one: from its origin, with the token it hands out. */
export async function post<T>(path: string, body: unknown): Promise<T> {
  token ??= get<Session>("/api/session").then((s) => s.token, (e: Error) => { token = null; throw e; });
  const response = await fetch(url + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-isorite-token": await token, Origin: new URL(url).origin },
    body: JSON.stringify(body),
  });
  const answer = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(answer.error ?? `${response.status} from ${url + path}`);
  return answer;
}

/** A tool the server offers an agent, as OpenAI's API describes one. */
export interface ToolDef { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }

/** What the splash says of the base: its name, how many notes, whether it has a study base. */
export async function base(): Promise<{ name: string; notes: number; study: boolean }> {
  const [session, listing] = await Promise.all([get<Session>("/api/session"), get<Listing>("/api/notes")]);
  return { name: session.name, notes: listing.notes.length, study: session.study };
}

/** The server's events, as the browser hears them, until the signal aborts; heard again after a dropped stream. */
export function listen(on: (type: string, data: Record<string, unknown>) => void, signal: AbortSignal): void {
  void (async () => {
    while (!signal.aborted) {
      try {
        // As an agent: the server counts only browser pages as watching.
        const response = await fetch(`${url}/api/events?agent=${AGENT}`, { signal });
        const decoder = new TextDecoder();
        let buffer = "";
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          buffer += decoder.decode(chunk, { stream: true });
          for (let end; (end = buffer.indexOf("\n\n")) >= 0; buffer = buffer.slice(end + 2)) {
            const block = buffer.slice(0, end);
            const type = block.match(/^event: (.*)$/m)?.[1], data = block.match(/^data: (.*)$/m)?.[1];
            if (type && data) { try { on(type, JSON.parse(data) as Record<string, unknown>); } catch { /* not ours */ } }
          }
        }
      } catch { /* the server went; try again */ }
      if (!signal.aborted) await new Promise((r) => setTimeout(r, 2000));
    }
  })();
}
