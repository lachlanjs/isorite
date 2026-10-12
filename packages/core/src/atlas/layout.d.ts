// Types for layout.js. nested.js says how a layout is made; this is what comes out.

import type { MapModel } from "../study.ts";

export interface LayoutItem {
  id: string;
  ref: string;
  kind: "note" | "folder";
  /** The parent's index in `items`, -1 at the top; a parent comes before its children. */
  parent: number;
  depth: number;
  /** The block, in cells. A folder's is its whole region; its title sits on its top edge. */
  gx: number;
  gy: number;
  w: number;
  h: number;
}
export type Point = [x: number, y: number];
export interface LayoutLink { a: number; b: number; s: number; level: number; placed: boolean }
export interface LayoutTrunk { a: number; b: number; count: number; back?: boolean; implied?: boolean; pts?: Point[] }
export interface Feeder { item: number; folder: number; trunk: number; count: number; pts: Point[]; lane: number; leaf: boolean; via: number }
export interface Layout {
  W: number;
  H: number;
  flow: "up" | "right";
  items: LayoutItem[];
  links: LayoutLink[];
  trunks: LayoutTrunk[];
  feeders: Feeder[];
}
export interface LayoutOptions { gridFlow?: "up" | "right" }

export const LAYOUT_VERSION: number;
export function plainModel(model: MapModel, flat?: boolean): MapModel;
export function gridLayout(model: MapModel, o?: LayoutOptions): Layout;
export function feeders(layout: Omit<Layout, "feeders">): Feeder[];
export function gridRouter(layout: Layout): (asks: { a: number; b: number }[]) => { routes: ({ pts: Point[] } | null)[] };
export function layoutKey(plain: MapModel, o?: LayoutOptions): string;
