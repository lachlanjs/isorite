<script lang="ts">
  // The parts: every token and component of the one style, to be looked at on both grounds.
  import Logo from "$lib/components/Logo.svelte";
  import { GROUNDS as CHOICES, ground } from "$lib/ground.svelte.ts";

  const GROUNDS = ["ground-0", "ground-1", "ground-2", "ground-3", "line", "line-strong"];
  const INKS = ["text", "text-soft", "text-faint"];
  const ACCENTS = ["lattice", "growth", "malachite", "rose"];

</script>

<div class="parts">
  <section>
    <h2 class="label">the ground</h2>
    <div class="row" role="radiogroup" aria-label="Ground">
      {#each CHOICES as [value, name] (value)}
        <button class="btn" class:primary={ground.chosen === value} type="button" role="radio" aria-checked={ground.chosen === value} onclick={() => ground.choose(value)}>{name}</button>
      {/each}
    </div>
  </section>

  <section>
    <h2 class="label">the name</h2>
    <div class="row"><Logo width={216} /><Logo /></div>
  </section>

  <section>
    <h2 class="label">colour</h2>
    <div class="swatches">
      {#each GROUNDS as name (name)}<div class="swatch"><i style:background={`var(--${name})`}></i><span>{name}</span></div>{/each}
    </div>
    <div class="swatches">
      {#each INKS as name (name)}<div class="swatch"><i style:background={`var(--${name})`}></i><span>{name}</span></div>{/each}
    </div>
    <div class="swatches">
      {#each ACCENTS as name (name)}
        <div class="swatch"><i style:background={`var(--${name})`}></i><span>{name}</span></div>
        <div class="swatch"><i style:background={`var(--${name}-soft)`}></i><span>{name}-soft</span></div>
      {/each}
    </div>
  </section>

  <section>
    <h2 class="label">type</h2>
    <p class="pixel" style:font-size="22px">Departure Mono, for display</p>
    <p>Ioskeley Mono, for the interface. <b>Bold.</b> <i>Italic.</i> 0123456789</p>
    <p class="serif" style:font-size="18px">Charter, for what is read: the entropy of a source is the average surprise of its symbols. <b>Bold</b>, <i>italic</i>.</p>
  </section>

  <section>
    <h2 class="label">buttons and chips</h2>
    <div class="row">
      <button class="btn" type="button">plain</button>
      <button class="btn primary" type="button">primary</button>
      <button class="btn danger" type="button">delete</button>
      <button class="btn quiet" type="button">quiet</button>
      <button class="btn" type="button" disabled>off</button>
      <button class="btn tall primary" type="button">tall</button>
    </div>
    <div class="row">
      <button class="btn keep" type="button">keep</button>
      <button class="btn edit" type="button">edit</button>
      <button class="btn remove" type="button">remove</button>
    </div>
    <div class="row">
      <span class="chip">plain</span><span class="chip lattice">lattice</span><span class="chip growth">growth</span>
      <span class="chip malachite">malachite</span><span class="chip rose">rose</span>
    </div>
  </section>

  <section>
    <h2 class="label">a frame, a field, the marks</h2>
    <div class="frame box">
      <span class="frame-title">a frame</span>
      <input class="field" placeholder="a field" aria-label="A field" />
      <div class="row"><i class="sq"></i><span>you</span><i class="sq empty"></i><span>not yet</span><i class="dia"></i><span>Iso</span><i class="dia open"></i><span>Iso, unkept</span></div>
    </div>
    <div class="dots ground"></div>
  </section>
</div>

<style>
  .parts { max-width: 760px; margin: 0 auto; padding: var(--space-8) var(--space-4) var(--space-16); display: flex; flex-direction: column; gap: var(--space-8); }
  section { display: flex; flex-direction: column; gap: var(--space-3); }
  h2 { font-weight: 400; border-bottom: 1px solid var(--line); padding-bottom: var(--space-1); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
  .swatches { display: flex; flex-wrap: wrap; gap: var(--space-3); }
  .swatch { display: flex; flex-direction: column; gap: var(--space-1); font-size: 12px; color: var(--text-faint); width: 104px; }
  .swatch i { height: 40px; border: 1px solid var(--line); }
  .box { padding: var(--space-6) var(--space-4) var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); }
  .ground { height: 96px; border: 1px solid var(--line); }
</style>
