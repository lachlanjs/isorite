// The Atlas's layout, asked of a worker and kept by its key: the layout's version, the direction and what the
// map contains (core's layoutKey). Where there is no worker, it is worked out here.

import { gridLayout, gridRouter, layoutKey, plainModel, type Layout, type LayoutOptions, type Point } from "@isorite/core/atlas";
import type { MapModel } from "@isorite/core";
import type { Ask } from "./worker.ts";

type Drop<T> = T extends unknown ? Omit<T, "id"> : never;

let worker: Worker | null | undefined;
let next = 1;
const waiting = new Map<number, { resolve: (value: never) => void; reject: (e: Error) => void }>();

function ask<T>(message: Drop<Ask>): Promise<T> {
  if (worker === undefined) {
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
        const w = waiting.get(data.id);
        waiting.delete(data.id);
        if (data.error !== undefined) w?.reject(new Error(data.error)); else w?.resolve(data.result as never);
      };
      worker.onerror = () => { for (const w of waiting.values()) w.reject(new Error("the layout worker stopped")); waiting.clear(); worker = null; };
    } catch { worker = null; }
  }
  if (!worker) return Promise.reject(new Error("no worker"));
  const id = next++;
  return new Promise<T>((resolve, reject) => { waiting.set(id, { resolve, reject }); worker!.postMessage({ id, ...message }); });
}

const kept = new Map<string, Layout>();
const routers = new Map<string, ReturnType<typeof gridRouter>>();
let sentFor = "";

/** The layout of a map, and the key it is kept under. */
export async function layoutOf(model: MapModel, o: LayoutOptions): Promise<{ key: string; layout: Layout }> {
  const plain = plainModel(model), key = layoutKey(plain, o);
  let layout = kept.get(key);
  if (!layout) {
    layout = await ask<Layout>({ layout: { model: plain, o } }).catch(() => gridLayout(plain, o));
    if (kept.size >= 6) kept.delete(kept.keys().next().value!);
    kept.set(key, layout);
  }
  return { key, layout };
}

/** Ways between pairs of a layout's items that the layout drew none for. Each runs from `a` to `b`, or is null. */
export async function routesOf(key: string, layout: Layout, asks: { a: number; b: number }[]): Promise<(Point[] | null)[]> {
  if (!asks.length) return [];
  const here = (): { routes: ({ pts: Point[] } | null)[] } => {
    let run = routers.get(key);
    if (!run) { routers.clear(); routers.set(key, (run = gridRouter(layout))); }
    return run(asks);
  };
  const first = sentFor !== key;
  sentFor = key;
  const res = await ask<{ routes: ({ pts: Point[] } | null)[] }>({ routes: { key, layout: first ? layout : null, asks } })
    .catch(() => ask<{ routes: ({ pts: Point[] } | null)[] }>({ routes: { key, layout, asks } }))
    .catch(here);
  return res.routes.map((r) => r?.pts ?? null);
}
