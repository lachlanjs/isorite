<script lang="ts">
  // The study page (Study-Fit's "next for you"): every exercise in the study base, in the order the record gives,
  // each with its kind, its title, what it tests and the square for its last result. Below the list, each folder of
  // the base has [ + an exercise ], which asks Iso for one. `?note=<id>`: only the exercises that test that note.
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import type { DraftSummary, StudyReport } from "@isorite/engine";
  import { app, noteHref } from "$lib/app.svelte.ts";

  let study = $state.raw<StudyReport | null>(null);
  let asked = $state.raw<DraftSummary[]>([]);
  let problem = $state("");

  // With hash routing the question mark is inside the fragment.
  const only = $derived(page.url.searchParams.get("note") ?? new URLSearchParams(page.url.hash.split("?")[1] ?? "").get("note") ?? "");
  const titleOf = (n: string): string => app.listing.notes.find((x) => x.id === n)?.title ?? n.split("/").at(-1)!;
  const shown = $derived((study?.exercises ?? []).filter((x) => !only || x.tests.includes(only)));
  const KINDS: Record<string, string> = { written: "written" };

  async function read() {
    try { [study, asked] = await Promise.all([app.api.study(), app.api.drafts().then((d) => d.filter((x) => x.exercise))]); } catch (e) { problem = (e as Error).message; }
  }
  onMount(() => {
    void read();
    return app.on((e) => { if (e.type === "record" || (e.type === "note-changed" && (e.id.startsWith("@study/") || e.id.startsWith("@draft/")))) void read(); });
  });

  /** Ask Iso for an exercise in a folder: a request opens, to say what it tests and send. */
  async function ask(folder: string, tests: string[] = []) {
    problem = "";
    try {
      const made = await app.api.createExerciseDraft(folder, tests);
      await goto(resolve("/draft/[id]", { id: made.id.slice("@draft/".length) }));
    } catch (e) { problem = (e as Error).message; }
  }
</script>

<div class="study">
  {#if !app.session?.study}
    <p class="soft empty">Exercises are kept in a study base, and none is open. <span class="faint">isorite study init</span> makes one.</p>
  {:else}
    <section class="frame list">
      <span class="frame-title">{only ? `study · what tests ${titleOf(only)}` : "study · next for you"}</span>
      {#each shown as x (x.id)}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- noteHref resolves -->
        <a class="sr" href={noteHref(x.id)}>
          <span class="faint kind">{KINDS[x.kind] ?? x.kind}</span>
          <span class="grow t">{x.title}</span>
          <span class="label tests">tests {x.tests.map(titleOf).join(", ")}</span>
          <i class="pip" class:ok={x.result === "right"} class:part={x.result === "partly"} class:no={x.result === "wrong"} title={x.result ? `last: ${x.result}` : "not tried"}></i>
        </a>
      {:else}
        <p class="soft none">{study ? (only ? "Nothing tests this note yet." : "No exercises yet. Ask Iso for one in a folder below.") : "reading…"}</p>
      {/each}
      {#if only}<a class="label all" href={resolve("/study")}>every exercise</a>{/if}
      {#if asked.length}
        <span class="label sub">asked of Iso · not kept yet</span>
        {#each asked as d (d.id)}
          <a class="sr" href={resolve("/draft/[id]", { id: d.id.slice("@draft/".length) })}><i class="dia open" aria-hidden="true"></i><span class="grow t">{d.title}</span></a>
        {/each}
      {/if}
      <span class="label foot">ordered from your record: due first, then never tried, then the fewest squares</span>
    </section>

    {#if problem}<p class="bad" role="alert">{problem}</p>{/if}

    <section class="folders">
      <h2 class="label">ask Iso for an exercise</h2>
      {#if only}
        <div class="fr"><span class="grow">on {titleOf(only)}</span><button class="link" type="button" onclick={() => ask(app.listing.notes.find((n) => n.id === only)?.dir ?? "", [only])}>[ + an exercise ]</button></div>
      {/if}
      {#each study?.folders ?? [] as dir (dir)}
        <div class="fr"><span class="grow soft">{dir || "the top of the base"}</span><button class="link" type="button" aria-label={`An exercise in ${dir || "the top of the base"}`} onclick={() => ask(dir)}>[ + an exercise ]</button></div>
      {/each}
    </section>
  {/if}
</div>

<style>
  .study { max-width: var(--measure); margin: 0 auto; padding: var(--space-8) var(--space-4) var(--space-16); display: flex; flex-direction: column; gap: var(--space-8); }
  .list { padding: 24px 22px 14px; display: flex; flex-direction: column; gap: 4px; }
  .sr { display: flex; align-items: center; gap: 14px; min-height: 36px; white-space: nowrap; border-bottom: 1px solid var(--line); color: var(--text); min-width: 0; }
  .sr:hover { text-decoration: none; background: var(--ground-1); }
  .sr .dia { margin: 0 3px; }
  .kind { width: 7ch; flex: none; font-size: 12px; }
  .t { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .tests { overflow: hidden; text-overflow: ellipsis; max-width: 45%; }
  .sub { margin-top: 14px; }
  .foot { margin-top: 14px; }
  .all { align-self: flex-start; margin-top: 8px; }
  .none { padding: var(--space-4) 0; }
  .empty { padding: var(--space-8) 0; text-align: center; }
  .bad { color: var(--rose); }
  .folders { display: flex; flex-direction: column; }
  .folders h2 { font-weight: 400; border-bottom: 1px solid var(--line); padding-bottom: 6px; margin: 0; }
  .fr { display: flex; align-items: center; gap: 14px; min-height: 36px; border-bottom: 1px solid var(--line); }
  .link { background: none; border: 0; padding: 4px 0; color: var(--lattice); white-space: nowrap; font-size: 12px; }
  @media (max-width: 600px) {
    .study { padding: var(--space-4) 16px 120px; }
    .list { padding: 20px 14px 12px; }
    .sr { flex-wrap: wrap; row-gap: 0; padding: 6px 0; }
    .tests { order: 3; flex: 1 1 100%; max-width: none; padding-left: calc(7ch + 14px); }
  }
</style>
