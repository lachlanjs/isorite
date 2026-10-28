// What isorite's host side uses from the kit: the manifest, the assembled document, the rules, and data shapes. The
// kit's browser parts (kit.ts, chart.ts, model.ts) are built into scripts by build.ts and never imported.
export { CSP, assemble, manifestOf, partsUsed, type Assembly, type KitFiles, type Manifest, type Part } from "./assemble.ts";
export { LIMIT, checkArtifact, type Broken, type RuleContext } from "./rules.ts";
export { columnsOf, describeShape, parseData, parseDelimited, shapeOf, type Row, type Shape, type Value } from "./data.ts";
export { aggregate, format } from "./numbers.ts";
