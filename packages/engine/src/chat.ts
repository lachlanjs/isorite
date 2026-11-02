// Chat over a project's threads on GitHub and GitLab (M28): the shapes the server answers with and the page draws.
// Nothing here holds a token.

export type ChatHostId = "github" | "gitlab";

export interface ChatPerson { login: string; name: string; avatar: string; url: string }
export interface ChatMessage { id: string; author: ChatPerson; at: string; body: string }

/** An issue, or a GitHub Discussion. */
export type ChatKind = "issue" | "discussion";
export interface ChatThread {
  kind: ChatKind;
  number: number;
  title: string;
  open: boolean;
  author: ChatPerson;
  /** When it was opened, and last added to. */
  at: string;
  updated: string;
  /** Replies, not counting the opening post. */
  replies: number;
  url: string;
}
/** A thread with its messages, the opening post first. */
export interface ChatThreadFull extends ChatThread { messages: ChatMessage[] }

/** A repository the project's remotes name. */
export interface ChatRepo { host: ChatHostId; /** The server for a self-managed GitLab; github.com / gitlab.com otherwise. */ server: string; path: string; url: string }

export interface ChatHostState {
  id: ChatHostId;
  /** The host's name, github.com or gitlab.com or a self-managed GitLab's. */
  server: string;
  name: string;
  /** Signed in, and as whom. */
  me: ChatPerson | null;
  /** Through the host's own tool, not an application of isorite's. */
  via: "device" | "cli" | null;
  /** isorite knows an application id for this host, so the device flow can be offered. */
  canSignIn: boolean;
  /** The host's CLI is signed in here, so its token can be used. */
  cli: boolean;
}
export interface ChatState { hosts: ChatHostState[]; repos: ChatRepo[] }

/** The code to give the host, and where. */
export interface ChatSignIn { host: ChatHostId; server: string; code: string; url: string; fullUrl: string; expires: number }
export type ChatSignInState = { state: "waiting" | "denied" | "expired" } | { state: "done"; me: ChatPerson };
