// Works out the Atlas's layouts and routes off the main thread (see layout.ts).

import { gridLayout, gridRouter, type Layout, type LayoutOptions } from "@isorite/core/atlas";
import type { MapModel } from "@isorite/core";

export type Ask =
  | { id: number; layout: { model: MapModel; o: LayoutOptions } }
  | { id: number; routes: { key: string; layout: Layout | null; asks: { a: number; b: number }[] } };

let router: { key: string; run: ReturnType<typeof gridRouter> } | null = null; // the router for one layout

self.onmessage = ({ data }: MessageEvent<Ask>) => {
  try {
    if ("layout" in data) { self.postMessage({ id: data.id, result: gridLayout(data.layout.model, data.layout.o) }); return; }
    const { key, layout, asks } = data.routes;
    if (router?.key !== key) {
      if (!layout) throw new Error("no layout for these routes");
      router = { key, run: gridRouter(layout) };
    }
    self.postMessage({ id: data.id, result: router.run(asks) });
  } catch (e) {
    self.postMessage({ id: data.id, error: String((e as Error)?.message ?? e) });
  }
};
