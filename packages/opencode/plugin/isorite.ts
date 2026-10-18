// The isorite server, as the plugin reaches it: over HTTP, as the browser does.
// `isorite term` names it in ISORITE_URL.

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
