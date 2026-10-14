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
  /** Units a cell, at zoom 1: 7, or 14 on the coarse grid. */
  cell: number;
  /** The clearance a route keeps from a note or a wall, in cells. */
  keep: number;
  /** Free cells around the whole map, for the ways round the outside. */
  margin: number;
  items: LayoutItem[];
  links: LayoutLink[];
  trunks: LayoutTrunk[];
  feeders: Feeder[];
  gated: Gated;
  /** The highways (highways.js): a way between each pair of items the trunks join, and feeders to them. */
  highways: { trunks: LayoutTrunk[]; feeders: Feeder[] };
}
/** A gate: the cell it is entered by from outside, the cell inside (a folder's; -1 for a note's), and the
 *  point on the wall it crosses. */
export interface Gate { item: number; cell: number; inner: number; wall: Point }
/** The way between two gates (or a gate and a note, or two notes) in one folder (-1: the top level), shared
 *  by every link through them (indices into `links`). `rest`: drawn at rest. */
export interface Stretch { region: number; a: number; b: number; pts: Point[]; links: number[]; strong: boolean; rest: boolean; ends: ["gate" | "note", "gate" | "note"] }
/** Gated routes (gates.js): each link's way as stretches, from link.a to link.b, each with whether it is run backwards. */
export interface Gated { gates: Gate[]; stretches: Stretch[]; paths: ([number, boolean][] | null)[] }
/** `coarse`: cells twice the size, and folders further apart. `blocks`: a folder holding folders placed as blocks (floorplan.js), not in layers. */
export interface LayoutOptions { gridFlow?: "up" | "right"; coarse?: boolean; blocks?: boolean }

export const LAYOUT_VERSION: number;
export const HIGHWAY_COSTS: Record<string, number>;
export function highwayTrunks(layout: Layout): LayoutTrunk[];
export const FEEDER_COSTS: Record<string, number>;
export function highwayFeeders(layout: Layout, trunks: LayoutTrunk[]): Feeder[];
export function plainModel(model: MapModel, flat?: boolean): MapModel;
export function gridLayout(model: MapModel, o?: LayoutOptions): Layout;
export function feeders(layout: Omit<Layout, "feeders">): Feeder[];
export function gridRouter(layout: Layout): (asks: { a: number; b: number }[]) => { routes: ({ pts: Point[] } | null)[] };
export function layoutKey(plain: MapModel, o?: LayoutOptions): string;

/** What the router knows of a layout, cell by cell (cells.js). A route runs through cell centres. */
export interface Cells {
  W: number;
  H: number;
  /** Nesting depth: 0 between folders. */
  elev: Int8Array;
  /** 1 where a note is: nothing is routed through it. */
  blocked: Uint8Array;
  /** The deepest folder holding the cell, or -1. */
  owner: Int32Array;
  noteAt: Int32Array;
  /** 1 within KEEP of a note or a folder's wall: a route pays `hug` for each. */
  close: Uint8Array;
}
export function buildCells(layout: Pick<Layout, "W" | "H" | "items">): Cells;
export const KEEP: number;
export const ROUTER_DEFAULTS: { climb: number; turn45: number; turn90: number; foreign: number; crowd: number; near: number; hug: number; haste: number };
export function gatedRoutes(layout: Pick<Layout, "W" | "H" | "items" | "links" | "trunks">, o?: Partial<typeof GATE_COSTS>): Gated;
export const GATE_COSTS: { turn45: number; turn90: number; hug: number; share: number; haste: number };
