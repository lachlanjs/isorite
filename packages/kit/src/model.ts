// 3D, on three.js, added to an artifact only when it uses one of these (plan-m23 §3.1, §3.8):
//
//   <iso-model src="part.glb" height="360"></iso-model>
//     a model's viewer (glTF, GLB, STL, OBJ), lit to suit the ground, turned by dragging, zoomed by the wheel
//   <iso-chart3d data="orbits.csv" x="x" y="y" z="z" by="body" type="line" at="t" height="420"></iso-chart3d>
//     points or paths from a data file in 3D, a series per value of `by`, with a dot on each series at the row whose
//     column `at` is nearest iso.state[at]; where="…" keeps rows as <iso-chart>'s does
// Both read the theme's colours, and draw again when it changes.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { Row } from "./data.ts";

const attr = (el: Element, name: string, fallback = "") => el.getAttribute(name) ?? fallback;
const colour = (css: string) => new THREE.Color().setStyle(css || "#888", THREE.SRGBColorSpace);

/** A scene in an element: renderer, camera, controls, drawn when something changes rather than every frame. */
class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
  controls: OrbitControls;
  #queued = false;
  constructor(el: HTMLElement, height: number) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(devicePixelRatio || 1);
    this.renderer.domElement.style.height = `${height}px`;
    el.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener("change", () => this.draw());
    new ResizeObserver(() => this.resize()).observe(el);
  }
  resize(): void {
    const c = this.renderer.domElement, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.draw();
  }
  draw(): void {
    if (this.#queued) return;
    this.#queued = true;
    requestAnimationFrame(() => {
      this.#queued = false;
      if (this.controls.update()) this.draw();
      this.renderer.render(this.scene, this.camera);
    });
  }
  /** The camera placed to see a box from a three-quarter view. */
  frame(box: THREE.Box3): void {
    const size = box.getSize(new THREE.Vector3()).length() || 1, centre = box.getCenter(new THREE.Vector3());
    this.controls.target.copy(centre);
    this.camera.position.copy(centre).add(new THREE.Vector3(0.9, 0.7, 1.1).normalize().multiplyScalar(size * 1.25));
    this.camera.near = size / 100; this.camera.far = size * 100;
    this.camera.updateProjectionMatrix();
    this.draw();
  }
}

/** A file's bytes: inline in a standalone export, from the host in isorite, or beside the page. */
async function bytes(path: string): Promise<ArrayBuffer> {
  const inline = document.querySelector(`script[data-path="${CSS.escape(path)}"][data-encoding="base64"]`);
  if (inline) return Uint8Array.from(atob(inline.textContent!.trim()), (c) => c.charCodeAt(0)).buffer;
  return window.iso.bytes(path);
}

class IsoModel extends HTMLElement {
  stage?: Stage;
  async connectedCallback() {
    if (this.stage) return;
    const src = attr(this, "src"), stage = (this.stage = new Stage(this, +attr(this, "height", "360")));
    const light = new THREE.HemisphereLight(0xffffff, 0x445566, 1.6), key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 4);
    stage.scene.add(light, key);
    const theme = () => { const t = window.iso.tokens(); light.color = colour(t.text); light.groundColor = colour(t.ground3); stage.draw(); };
    window.iso.on("theme", theme); theme();
    if (!src) { window.iso.complain("<iso-model> has no src=\"…\""); return; }
    try {
      const buf = await bytes(src), ext = src.toLowerCase().split(".").pop();
      let object: THREE.Object3D;
      if (ext === "glb" || ext === "gltf") object = (await new GLTFLoader().parseAsync(ext === "gltf" ? new TextDecoder().decode(buf) : buf, "")).scene;
      else if (ext === "stl") object = new THREE.Mesh(new STLLoader().parse(buf), new THREE.MeshStandardMaterial({ color: colour(window.iso.tokens().soft), metalness: 0.1, roughness: 0.6 }));
      else if (ext === "obj") object = new OBJLoader().parse(new TextDecoder().decode(buf));
      else { window.iso.complain(`<iso-model src="${src}">: the kit shows glTF, GLB, STL and OBJ`); return; }
      stage.scene.add(object);
      stage.frame(new THREE.Box3().setFromObject(object));
    } catch (e) { window.iso.complain(`<iso-model src="${src}">: ${(e as Error).message}`); }
  }
}

class IsoChart3d extends HTMLElement {
  stage?: Stage;
  connectedCallback() {
    if (this.stage) return;
    const stage = (this.stage = new Stage(this, +attr(this, "height", "420")));
    let framed = false;
    window.iso._.live(this, async () => {
      const x = attr(this, "x", "x"), y = attr(this, "y", "y"), z = attr(this, "z", "z"), by = attr(this, "by"), at = attr(this, "at");
      const rows = await window.iso._.rowsFor(this, [x, y, z, by, at].filter(Boolean));
      if (!rows) return;
      const t = window.iso.tokens(), series = new Map<string, Row[]>();
      for (const r of rows) { const k = by ? String(r[by]) : ""; series.set(k, [...(series.get(k) ?? []), r]); }
      stage.scene.clear();
      const box = new THREE.Box3(), v = (r: Row) => new THREE.Vector3(+r[x]!, +r[z]!, -+r[y]!);
      // A ground grid under the data, in the theme's line colour.
      [...series.values()].flat().forEach((r) => box.expandByPoint(v(r)));
      const size = box.getSize(new THREE.Vector3()), span = Math.max(size.x, size.z, 1e-9);
      const grid = new THREE.GridHelper(span * 1.2, 12, colour(t.lineStrong), colour(t.line));
      grid.position.set(box.getCenter(new THREE.Vector3()).x, box.min.y, box.getCenter(new THREE.Vector3()).z);
      stage.scene.add(grid);
      let i = 0;
      for (const [, rs] of series) {
        const c = colour(t.series[i++ % t.series.length] ?? t.lattice), pts = rs.map(v);
        if (attr(this, "type", "line") === "dot") stage.scene.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color: c, size: 4, sizeAttenuation: false })));
        else stage.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c })));
        const now = window.iso.state[at];
        if (at && typeof now === "number") {
          const best = rs.reduce((b, r) => (Math.abs(+r[at]! - now) < Math.abs(+b[at]! - now) ? r : b), rs[0]!);
          const dot = new THREE.Mesh(new THREE.SphereGeometry(span * 0.018, 16, 12), new THREE.MeshBasicMaterial({ color: c }));
          dot.position.copy(v(best));
          stage.scene.add(dot);
        }
      }
      if (!framed) { framed = true; stage.frame(box); } else stage.draw();
    });
  }
}

window.iso._.define("iso-model", IsoModel);
window.iso._.define("iso-chart3d", IsoChart3d);
(window as unknown as { THREE: typeof THREE }).THREE = THREE;
