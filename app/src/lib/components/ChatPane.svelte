<script lang="ts">
  // Chat (M28), a mode of the Iso pane: the project's issues and GitHub Discussions, or GitLab issues, read as a
  // conversation: each message with its author's picture, name and when. Signed in by the host's device flow (a code
  // given to the host in the browser), with the least permission the work needs. A reply is sent by the person's
  // press alone, to the thread it names; Enter makes a new line, Ctrl or Cmd+Enter sends.
  import { onMount } from "svelte";
  import { chat, short } from "$lib/chat.svelte.ts";
  import { render } from "$lib/markdown.ts";

  let text = $state("");
  onMount(() => { chat.show(true); return () => chat.show(false); });
  const me = $derived(chat.host?.me ?? null);
  const repoName = $derived(chat.repo ? `${chat.repo.path}` : "");
  async function send(): Promise<void> { if (await chat.reply(text)) text = ""; }
  function keys(e: KeyboardEvent): void { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); void send(); } }
  const when = (at: string) => new Date(at).toLocaleString();
  /** The thread's messages end at the newest: kept in view as they arrive. */
  let end = $state<HTMLElement>();
  $effect(() => { void chat.open?.messages.length; end?.scrollIntoView({ block: "end" }); });
</script>

<div class="chat" aria-label="Chat">
  {#if chat.state && !chat.state.repos.length}
    <p class="faint pad">This project has no GitHub or GitLab remote, so there is nothing to chat on yet. Chat reads the issues (and GitHub Discussions) of the repositories its git remotes name.</p>
  {:else if chat.state}
    <div class="bar">
      {#if chat.state.repos.length > 1}
        <select class="field" aria-label="Repository" value={`${chat.repo?.host}:${chat.repo?.server}/${chat.repo?.path}`} onchange={(e) => chat.choose(e.currentTarget.value)}>
          {#each chat.state.repos as r (`${r.host}:${r.server}/${r.path}`)}<option value={`${r.host}:${r.server}/${r.path}`}>{r.path}{r.server.endsWith("gitlab.com") || r.server === "github.com" ? "" : ` · ${r.server}`}</option>{/each}
        </select>
      {:else}<span class="repo">{repoName}</span>{/if}
      <span class="grow"></span>
      {#if me}<span class="who"><img class="av" src={me.avatar} alt="" referrerpolicy="no-referrer" />{me.login}</span> <button type="button" class="more" onclick={() => void chat.signOut()}>sign out</button>{/if}
    </div>

    {#if !me}
      <div class="signin pad">
        {#if chat.signing}
          <p>Give <b>{chat.host?.name}</b> this code, in your browser:</p>
          <p class="code" aria-label="Your code">{chat.signing.code}</p>
          <p><a class="btn" href={chat.signing.fullUrl} target="_blank" rel="noopener noreferrer">Open {chat.signing.url.replace(/^https?:\/\//, "")}</a></p>
          <p class="faint">Waiting for you to say yes… isorite asks for only the issues and discussions of the repositories you allow. <button type="button" class="more" onclick={() => chat.cancel()}>cancel</button></p>
        {:else}
          <p>Sign in to <b>{chat.host?.name}</b> to read {chat.repo?.host === "github" ? "this project's issues and discussions" : "this project's issues"} here, and reply.</p>
          <p>
            <button type="button" class="btn" disabled={!chat.host?.canSignIn} onclick={() => void chat.signIn()}>Sign in to {chat.host?.name}</button>
            {#if chat.host?.cli}<button type="button" class="btn" onclick={() => void chat.useCli()}>Use {chat.repo?.host === "github" ? "gh" : "glab"}, already signed in</button>{/if}
          </p>
          {#if !chat.host?.canSignIn}<p class="faint">isorite has no application registered for {chat.host?.name} on this machine yet{chat.host?.cli ? ", so its own tool's sign-in can be used" : ""}. See docs/plan-m28.md.</p>
          {:else}<p class="faint">You approve it on {chat.host?.name}, and choose which repositories isorite may use. The token stays on this machine, outside the notes.</p>{/if}
          {#if chat.host?.cli}<p class="faint">The tool's own sign-in is broader than isorite needs, and is asked of it each time; nothing is copied.</p>{/if}
        {/if}
      </div>
    {:else if chat.open}
      {@const t = chat.open}
      <div class="thread-head">
        <button type="button" class="more" aria-label="Back to the threads" onclick={() => chat.close()}>← threads</button>
        <a class="title" href={t.url} target="_blank" rel="noopener noreferrer">{t.title} <span class="faint">#{t.number}</span></a>
        <span class="state" class:closed={!t.open}>{t.kind === "discussion" ? "discussion" : "issue"} · {t.open ? "open" : "closed"}</span>
      </div>
      <div class="messages" role="log" aria-label="Messages">
        {#each t.messages as m (m.id)}
          <article class="msg" class:mine={m.author.login === me.login}>
            {#if m.author.avatar}<img class="av big" src={m.author.avatar} alt="" referrerpolicy="no-referrer" />{:else}<span class="av big none" aria-hidden="true">{m.author.login.slice(0, 1)}</span>{/if}
            <div class="what">
              <header><b>{m.author.name !== m.author.login ? m.author.name : m.author.login}</b> <span class="faint">@{m.author.login}</span> <time datetime={m.at} title={when(m.at)}>{short(m.at)}</time></header>
              <div class="body prose">{@html render(m.body || "*No description.*")}</div>
            </div>
          </article>
        {/each}
        <div bind:this={end}></div>
      </div>
      <div class="composer">
        <textarea bind:value={text} rows="2" aria-label="Reply" placeholder="Reply in this thread" onkeydown={keys}></textarea>
        <div class="send">
          <span class="faint">Posts as <b>{me.login}</b> to {repoName}#{t.number}, for everyone on it to see.</span>
          <button type="button" class="btn" disabled={!text.trim() || chat.sending} onclick={() => void send()}>Send{text.trim() ? "" : ""}</button>
        </div>
      </div>
    {:else}
      <div class="threads" role="list" aria-label="Threads">
        {#if chat.note}<p class="faint pad">{chat.note}</p>{/if}
        {#each chat.threads as t (`${t.kind}${t.number}`)}
          <div role="listitem">
            <button type="button" class="row" onclick={() => void chat.read(t.kind, t.number)}>
              {#if t.author.avatar}<img class="av big" src={t.author.avatar} alt="" referrerpolicy="no-referrer" />{:else}<span class="av big none" aria-hidden="true">{t.author.login.slice(0, 1)}</span>{/if}
              <span class="t"><span class="ttl">{t.title}</span><span class="m">{t.kind === "discussion" ? "discussion" : "issue"} #{t.number} · {t.author.login} · {short(t.updated)}{t.open ? "" : " · closed"}</span></span>
              <span class="n" title="{t.replies} replies">{t.replies}</span>
            </button>
          </div>
        {:else}
          {#if !chat.loading}<p class="faint pad">No threads yet.</p>{:else}<p class="faint pad">Reading…</p>{/if}
        {/each}
      </div>
    {/if}
    {#if chat.problem}<p class="bad pad" role="alert">{chat.problem}</p>{/if}
  {:else if chat.problem}
    <p class="bad pad" role="alert">{chat.problem}</p>
  {:else}
    <p class="faint pad">Reading…</p>
  {/if}
</div>

<style>
  .chat { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
  .pad { padding: 12px 16px; margin: 0; font-size: 12.5px; }
  .bad { color: var(--rose); }
  .bar { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--line); font: 12px var(--font-ui); }
  .repo { font: 12px var(--font-mono); color: var(--text-soft); overflow-wrap: anywhere; }
  .grow { flex: 1 1 auto; }
  .who { display: inline-flex; align-items: center; gap: 6px; color: var(--text-soft); }
  .av { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; background: var(--ground-2, var(--ground-1)); flex: none; }
  .av.big { width: 32px; height: 32px; }
  .av.none { display: grid; place-items: center; font: 600 13px var(--font-ui); color: var(--text-faint); text-transform: uppercase; }
  .more { background: none; border: 0; padding: 0; font: inherit; color: var(--lattice); cursor: pointer; }
  .btn { display: inline-block; font: 13px var(--font-ui); padding: 7px 12px; border: 1px solid var(--line-strong, var(--line)); background: var(--ground-1); color: var(--text); cursor: pointer; text-decoration: none; margin-right: 6px; }
  .btn:hover:not(:disabled) { border-color: var(--growth); color: var(--growth); }
  .btn:disabled { opacity: .5; cursor: default; }
  .signin p { margin: 0 0 10px; }
  .code { font: 600 26px var(--font-mono); letter-spacing: .12em; color: var(--growth); user-select: all; }
  .threads { flex: 1 1 auto; min-height: 0; overflow: auto; }
  .row { width: 100%; display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 10px; align-items: center; text-align: left; background: none; border: 0; border-bottom: 1px solid var(--line); padding: 10px 14px; color: var(--text); cursor: pointer; }
  .row:hover { background: var(--ground-1); }
  .t { display: grid; gap: 2px; min-width: 0; }
  .ttl { font: 14px/20px var(--font-text); overflow-wrap: anywhere; }
  .m { font: 11px var(--font-ui); color: var(--text-faint); text-transform: uppercase; letter-spacing: .05em; }
  .n { font: 11px var(--font-ui); color: var(--text-soft); border: 1px solid var(--line); padding: 1px 7px; }
  .thread-head { flex: none; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 8px 14px; border-bottom: 1px solid var(--line); }
  .title { font: 14px/20px var(--font-text); color: var(--text); text-decoration: none; overflow-wrap: anywhere; }
  .state { margin-left: auto; font: 11px var(--font-ui); text-transform: uppercase; letter-spacing: .05em; color: var(--growth); }
  .state.closed { color: var(--text-faint); }
  .messages { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 14px; display: flex; flex-direction: column; gap: 16px; }
  .msg { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 10px; }
  .what header { display: flex; gap: 6px; align-items: baseline; font: 12.5px var(--font-ui); }
  .what time { margin-left: auto; font-size: 11px; color: var(--text-faint); }
  .msg.mine .what { border-left: 2px solid var(--growth); padding-left: 8px; }
  .body { font: 14px/22px var(--font-text); overflow-wrap: anywhere; }
  .body :global(p) { margin: .3em 0; }
  .body :global(img) { max-width: 100%; }
  .composer { flex: none; border-top: 1px solid var(--line); padding: 10px 12px; display: grid; gap: 8px; }
  textarea { min-height: 42px; max-height: 160px; resize: none; field-sizing: content; background: var(--ground-1); border: 1px solid var(--line); padding: 9px 10px; font: 13px/1.5 var(--font-ui); color: var(--text); }
  textarea:focus { border-color: var(--line-strong); outline: none; }
  .send { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 11.5px; }
  .send .btn { margin: 0; }
</style>
