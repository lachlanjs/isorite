/** @jsxImportSource @opentui/solid */
// A note in the terminal (`Terminal-Note`): its blocks behind a gutter of who wrote them, links underlined, maths as
// source, code on its own ground, a figure offered in the browser; the changes waiting to be kept between dotted
// rules, one of them current, with its keys; the step and squares at the top right.

import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import type { Entry } from "@isorite/core";
import { For, Show, type Accessor } from "solid-js";
import { agentName } from "@isorite/core";
import type { Ground } from "./palette.ts";
import type { Item, Mark, ViewBlock, ViewChange } from "./noteview.ts";


export interface NoteData {
  id: string;
  title: string;
  /** The note's text, as it is (or was, at a moment of its timeline). */
  text: string;
  items: Item[];
  /** At a moment of the timeline: what it was, and how long ago. Read only. */
  at?: { said: string; ago: string };
  entries: Entry[];
  /** What the study record says of it: 0 not reached … 3 understood, and its squares of 6. */
  step: number;
  squares: number;
}

export const STEPS = ["not reached", "opened", "worked through", "understood"];
const DOTS = "· ".repeat(40).trim();

/** A note's path as the boards write it: "dmft / self-consistency condition". */
export function pathOf(id: string, title: string): string {
  return [...id.split("/").slice(0, -1).map((d) => d.replace(/-/g, " ")), title.toLowerCase()].join(" / ");
}

/** Who a change is from, as people say it. */
export function fromWhom(who: string): string {
  return who.startsWith("iso:") ? "Iso" : agentName(who) || "you";
}

/** A run of a line: plain, or a link's text, underlined. */
function runs(line: string): { text: string; link: boolean }[] {
  const out: { text: string; link: boolean }[] = [];
  let at = 0;
  for (const m of line.matchAll(/(?<!!)\[([^\]]+)\]\([^)]*\)/g)) {
    if (m.index! > at) out.push({ text: line.slice(at, m.index), link: false });
    out.push({ text: m[1]!, link: true });
    at = m.index! + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at), link: false });
  return out.length ? out : [{ text: line || " ", link: false }];
}

export function NotePage(props: { note: Accessor<NoteData | undefined>; current: Accessor<string>; cursor: Accessor<number>; asking: Accessor<boolean>; ground: Accessor<Ground>; base: string; scroll: (s: ScrollBoxRenderable) => void }) {
  const g = () => props.ground();
  const glyph = (mark: Mark | "waiting") =>
    mark === "you" ? { c: "■", fg: g().lattice } : mark === "outside" ? { c: "□", fg: g().lattice } : mark === "iso" ? { c: "◆", fg: g().growth }
      : mark === "agent" ? { c: "◆", fg: g().faint } : mark === "waiting" ? { c: "◇", fg: g().growth } : { c: " ", fg: g().faint };

  /** One row: the gutter, the rail (blue beside the block the cursor is on), and what is on it. */
  const Row = (p: { mark?: Mark | "waiting"; at?: boolean; children: unknown }) => (
    <box flexDirection="row" minWidth={0}>
      <text width={4} flexShrink={0} fg={glyph(p.mark ?? "").fg}>{` ${glyph(p.mark ?? "").c}  `}</text>
      <box width={2} flexShrink={0} border={["left"]} borderColor={p.at ? g().lattice : g().line} />
      <box flexGrow={1} minWidth={0} paddingLeft={1} flexDirection="column">{p.children as never}</box>
    </box>
  );
  const Prose = (p: { text: string; bold?: boolean; fg?: string }) => (
    <For each={p.text.split("\n")}>
      {(line) => (
        <text wrapMode="word" fg={p.fg ?? g().text} attributes={p.bold ? TextAttributes.BOLD : 0}>
          <For each={runs(line)}>{(r) => (r.link ? <span style={{ fg: g().lattice, attributes: TextAttributes.UNDERLINE }}>{r.text}</span> : r.text)}</For>
        </text>
      )}
    </For>
  );
  const Change = (p: { c: ViewChange }) => {
    const on = () => props.current() === p.c.key;
    return (
      <box flexDirection="column">
        <Row mark="waiting"><text fg={g().growth} wrapMode="none">{DOTS}</text></Row>
        <Show when={!p.c.placed}><Row><text fg={g().faint} wrapMode="word">The place this was written for is no longer in the note.</text></Row></Show>
        <Show when={p.c.old !== undefined}><Row><text fg={g().faint} wrapMode="word" attributes={TextAttributes.STRIKETHROUGH}>{p.c.old}</text></Row></Show>
        <Row><Prose text={p.c.text.trim() || "(taken out)"} fg={on() ? g().text : g().soft} /></Row>
        <Row>
          <text wrapMode="none">
            <span style={{ fg: g().growth }}>{`◆ ${fromWhom(p.c.who)}`}</span>
            <span style={{ fg: g().faint }}>{" · not kept yet   "}</span>
            <span style={{ fg: on() ? g().mal : g().faint }}>{"[k] keep  "}</span>
            <span style={{ fg: on() ? g().growth : g().faint }}>{"[e] edit  "}</span>
            <span style={{ fg: on() ? g().rose : g().faint }}>{"[r] remove"}</span>
            <Show when={!on()}><span style={{ fg: g().faint }}>{"   [n] to choose it"}</span></Show>
          </text>
        </Row>
        <Show when={p.c.asked}><Row><text fg={g().faint} wrapMode="word">{`“${p.c.asked}”`}</text></Row></Show>
        <Row mark="waiting"><text fg={g().growth} wrapMode="none">{DOTS}</text></Row>
      </box>
    );
  };

  const blockIndex = (item: Item) => props.note()?.items.filter((i) => i.type === "block").indexOf(item as ViewBlock) ?? -1;

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={g().g0}>
      <Show when={props.note()} fallback={<text fg={g().faint} paddingLeft={4} paddingTop={1}>opening the note…</text>}>
        {(note) => (
          <>
            <box flexDirection="row" paddingLeft={4} paddingRight={4} paddingTop={1} flexShrink={0}>
              <text fg={g().text} wrapMode="none" flexShrink={1} minWidth={0}>{pathOf(note().id, note().title)}</text>
              <Show when={note().at}>{(at) => <text fg={g().growth} wrapMode="none" flexShrink={1} minWidth={0}>{`   as it was ${at().ago}: ${at().said}`}</text>}</Show>
              <box flexGrow={1} />
              <text fg={g().soft} wrapMode="none" flexShrink={0}>{`${STEPS[note().step] ?? ""}   `}</text>
              <text wrapMode="none" flexShrink={0}>
                <For each={[0, 1, 2, 3, 4, 5]}>{(k) => <span style={{ fg: k < note().squares ? g().mal : g().line }}>{k < note().squares ? "■" : "□"}</span>}</For>
              </text>
            </box>
            <scrollbox ref={props.scroll} flexGrow={1} paddingLeft={4} paddingRight={4} paddingTop={1} scrollbarOptions={{ visible: false }}>
              <For each={note().items}>
                {(item) => item.type === "change" ? <Change c={item} /> : (
                  <box flexDirection="column" id={`block-${blockIndex(item)}`}>
                    <Show when={item.kind === "code"} fallback={
                      <Row mark={item.mark} at={blockIndex(item) === props.cursor()}>
                        <Show when={item.kind === "figure"} fallback={
                          <Show when={item.kind === "math"} fallback={<Prose text={item.text} bold={item.kind === "heading"} />}>
                            <For each={item.text.split("\n")}>{(line) => <text wrapMode="word" fg={/^\$\$\s*$/.test(line) ? g().soft : g().text}>{line}</text>}</For>
                          </Show>
                        }>
                          <text wrapMode="word">
                            <span style={{ fg: g().faint }}>{`[ figure: ${/^!\[([^\]]*)\]/.exec(item.text)?.[1] || "untitled"} ]  `}</span>
                            <span style={{ fg: g().lattice, attributes: TextAttributes.UNDERLINE }}>{"[b] see it in the browser"}</span>
                          </text>
                        </Show>
                      </Row>
                    }>
                      <Row mark={item.mark} at={blockIndex(item) === props.cursor()}>
                        <box backgroundColor={g().g1} flexDirection="column" paddingLeft={1}>
                          <text fg={g().faint}>{/^(```|~~~)\s*(\S*)/.exec(item.text)?.[2] || "code"}</text>
                          <For each={item.text.split("\n").slice(1, -1)}>{(line) => <text fg={g().text} wrapMode="none">{line || " "}</text>}</For>
                        </box>
                      </Row>
                    </Show>
                    <Row><text> </text></Row>
                  </box>
                )}
              </For>
            </scrollbox>
          </>
        )}
      </Show>
      <box flexDirection="row" height={1} flexShrink={0} paddingLeft={4} paddingRight={4} backgroundColor={g().g1} gap={3}>
        <text fg={g().g0} bg={g().text}> note </text>
        <text fg={g().faint}>{props.base}</text>
        <Show when={props.asking()}><text fg={g().growth}>◆ Iso is writing here</text></Show>
        <box flexGrow={1} />
        <Show when={props.note()?.items.some((i) => i.type === "change")}><text fg={g().faint}>[n] next change</text></Show>
        <Show when={!props.note()?.at} fallback={<text fg={g().faint}>[q] back to now</text>}>
          <text fg={g().faint}>[t] timeline</text>
          <text fg={g().faint}>[/] ask in place</text>
          <text fg={g().faint}>[s] send to agent</text>
          <text fg={g().faint}>[b] browser</text>
          <text fg={g().faint}>[q] back</text>
        </Show>
      </box>
    </box>
  );
}
