# Milestone 28: chat in the Iso pane, over GitHub and GitLab threads

Begun 2026-11-02. Iso's pane gains a **Chat** mode: a developer's chat over a project's issues and discussions, shown as a conversation (the other people's avatars, who said what, when), signed in to GitHub or GitLab with the least permission the work needs.

## Decided (Lachlan, 2026-11-02)

- Chat is a mode of the Iso pane, beside the agent's session and the drawer; it is team chat, not the agent.
- Both hosts from the start. GitHub: issues (REST) and Discussions (GraphQL). GitLab: issues, whose threaded notes are its discussions; GitLab has no separate Discussions feature.
- Sign in by the OAuth **device flow** (no server of isorite's is needed): a code is shown, approved in the browser. GitHub through a **GitHub App** (permissions: Issues and Discussions, read and write; installed on chosen repositories only). GitLab through an OAuth application with the `api` scope (the narrowest that can post; `read_api` reads only). Self-managed GitLab: the person gives the application's id for their instance.
- A signed-in `gh` or `glab` is offered as a labelled fallback (broader scopes, no registration).
- Phases 1 to 3: the host layer and sign-in; reading; replying with confirmation. Opening new threads and reactions are for later.

## Rules

- **Tokens are this machine's.** Kept in `chat.toml` beside `config.toml`, mode 0600; never in `.isorite/` (which may be committed, M27), never in an answer to the page. The page learns only whether a host is signed in, and as whom.
- **Nothing is posted unasked.** A reply names the repository and the thread, is sent only by the person's press, and no tool is given to an agent to post.
- **Local only.** Sign-in, reading and replying are answered to this machine alone; the page is served to other devices without them.
- **What others wrote is untrusted.** Bodies are markdown, drawn by the page's sanitising renderer; avatars are plain images with no referrer.
- The apps' client ids are public. They are `ISORITE_GITHUB_CLIENT_ID` and `ISORITE_GITLAB_CLIENT_ID` in the environment, or `[github] client_id` in `chat.toml`, until isorite's own are registered and built in.

## Shape

- `packages/engine/src/chat.ts`: the types (people, messages, threads, the state).
- `packages/server/src/chat/`: `github.ts`, `gitlab.ts` (a host each, over an injected `fetch`), `signin.ts` (device flow, the CLI fallback), `store.ts` (tokens), `chat.ts` (the service the routes call, and the repositories found from the project's remotes).
- Routes `/api/chat/*` in `http.ts`.
- `app`: `chat.svelte.ts`, `ChatPane.svelte`, a Chat switch in Iso's header.
- Tests: hosts against a fake server (`fetch` injected), sign-in against the same; the pane in the browser against the scripted server.

## To register (Lachlan)

- GitHub: Settings, Developer settings, GitHub Apps, New. Enable *Device flow*; no callback needed; permissions Issues: read and write, Discussions: read and write, Metadata: read. Users install it on the repositories they chat in.
- GitLab: Preferences, Applications (or the group's). Not confidential; scope `api`; redirect `http://127.0.0.1/`.
- The ids go into the environment or `chat.toml` until built in.

## Built (phases 1 to 3)

- **Hosts** (`github.ts`, `gitlab.ts`): issues and, on GitHub, Discussions (GraphQL, flattened to a conversation); GitLab issues with their notes, the system's own notes left out. Pull requests are not listed. A host is made with a token and a `fetch`, and answers only for a repository path of the right shape.
- **Sign-in** (`signin.ts`, `store.ts`): the device flow for both, polling no faster than the host allows; GitLab tokens renewed with their refresh token. A GitHub App should be made with *Opt out of user-to-server token expiration*, since renewing a GitHub token needs the app's secret, which a program on a person's machine cannot hold. The host's own tool (`gh auth token`, `glab config get token`) can be used instead; its token is asked of it each time and never copied.
- **The service** (`chat.ts`): repositories from the project's git remotes (read only); a page can ask only about those, and only of github.com, gitlab.com and the servers the remotes name. A token refused by the host leaves it signed out.
- **Routes**: `/api/chat` (state), `threads`, `thread`, `signin`, `signin/poll`, `signout`, `reply`; this machine only, the writes with the page's token as every write has.
- **The pane**: a Chat button in Iso's header; the repository, who is signed in, the threads (avatar, title, kind and number, who and when, replies), a thread as a conversation (avatar, name, short time, markdown through the sanitising renderer), and a reply box that names where it posts. Ctrl or Cmd+Enter sends, Enter is a new line. The open thread is read again every 10 s and the list every 30 s while the chat is shown.
- Tests: `chat.test.ts` (hosts against a fake `fetch`, the device flow, the token file's mode and its absence from every answer, the project-only rule, the routes); `chat.spec.ts` (the pane, the host played by the page's routes).

## Not verified, and left

- **Nothing here has met a real GitHub or GitLab.** The requests follow the documented APIs and are tested against a fake. GitLab is the less certain: `glab config get token --host` and the device flow on a self-managed instance (17.2 and later) are to be tried by someone with them.
- isorite's own applications are not registered, so Sign in is off until `ISORITE_GITHUB_CLIENT_ID` / `ISORITE_GITLAB_CLIENT_ID` (or `[github] client_id` in `chat.toml`) are set. One id serves every GitLab server; a self-managed instance needs its own application, so its id would need a per-server setting.
- Opening a new thread, reactions, edits and deleting a message; showing GitHub's nested replies as replies (they are flattened in order); unread marks; a link from a thread to a note, and a thread saved as a note.
