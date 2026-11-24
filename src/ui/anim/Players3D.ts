// The players drawn as live 3D figures: the skinned model and its moves made
// in Blender (pipeline/anim/export_glb.py, served as anim/player3d.json), posed
// for every frame of a play from the track build.ts works out. The same
// figure plays every club and every official; each wears its own colors,
// number and build (from the player's real height and weight).
//
// The camera looks down at the field from 60 degrees, the angle the sprites
// were drawn from, over the field drawing's own flat measure: the ground is
// stretched toward the camera so every spot lands exactly where the SVG field
// has it. Nothing here touches the game's dice: what a player is doing comes
// from the track alone, and variety from `frac`-style hashes of his slot.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { PLAYER_BY_ID } from "../../engine/league";
import { TEAM_COLORS } from "../../engine/teamColors";
import { ACT, type Track } from "./book";

const TILT = (60 * Math.PI) / 180;
const SIN = Math.sin(TILT), COS = Math.cos(TILT);
const H = 533, MID = H / 2;
/** Field-drawing units a metre of the model, drawn larger than life (as the sprites were) to be told apart. */
const FIG = (10 / 0.9144) * 1.75;
/** Ball height: drawing units a yard up. */
const UP = 11;

export interface Model3D { scene: THREE.Object3D; clips: Map<string, THREE.AnimationClip>; ball: THREE.Object3D }

let loading: Promise<Model3D | null> | null = null;

/** The Blender model, fetched once. Null when it can't be had or the browser has no WebGL. */
export function playerModel(): Promise<Model3D | null> {
  return (loading ??= (async () => {
    try {
      const probe = document.createElement("canvas");
      if (!probe.getContext("webgl2") && !probe.getContext("webgl")) return null;
      const res = await fetch("anim/player3d.json");
      if (!res.ok) return null;
      const gltf = await new GLTFLoader().parseAsync(await res.arrayBuffer(), "");
      const ball = gltf.scene.getObjectByName("football");
      if (!ball) return null;
      ball.removeFromParent();
      ball.position.set(0, 0, 0);
      const player = gltf.scene.getObjectByName("player");
      if (!player) return null;
      return { scene: player, clips: new Map(gltf.animations.map((c) => [c.name, c])), ball };
    } catch {
      return null;
    }
  })());
}

// ---- What each player is doing, frame by frame ----

/** How a clip's clock runs: by distance covered (strides, yards a cycle), or by time since it began. */
interface Seg { from: number; clip: string; stride: number; back: boolean; start: number; rate: number; loop: boolean }

const STRIDE: Record<string, number> = { walk: 1.5, jog: 2.5, run: 3.7, sprint: 4.4, carry: 3.7, backpedal: 1.7, shuffle: 1.4 };
const LOOPS = new Set(["idle", "walk", "jog", "run", "sprint", "carry", "backpedal", "shuffle", "passset", "block", "rush", "stance3", "stance2", "ready", "under", "gun", "hold", "hips", "prone", "supine", "dance", "flex", "cheer", "ref_incomplete"]);

function hash(i: number, k: number): number {
  let h = (Math.imul(i + 11, 2654435761) ^ Math.imul(k + 3, 40503)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0;
  return ((h ^ (h >>> 13)) >>> 8) / 16777216;
}

/** Heading on the drawing's ground for a move of (dx, dy) field yards. */
const headingOf = (dx: number, dy: number) => Math.atan2(dy / SIN, dx);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface Plan { segs: Seg[]; at: Int16Array; heading: Float32Array }

/** Works out, for one player, which move he is in each frame and which way he faces. */
export function plan(t: Track, i: number, seed: number): Plan {
  const p = t.pos[i], frames = p.length / 2, last = frames - 1;
  const group = t.group?.[i] ?? "";
  const vel = (f: number): [number, number] => {
    const a = Math.max(0, f - 2), b = Math.min(last, f + 2);
    const dt = Math.max(1, b - a) / t.rate;
    return [(p[b * 2] - p[a * 2]) / dt, (p[b * 2 + 1] - p[a * 2 + 1]) / dt];
  };
  const toward = (t.team[i] === 1 ? -t.dir : t.dir) > 0 ? 0 : Math.PI;
  // Facing: where the track says to look, else where he is going, turned at a man's pace.
  const heading = new Float32Array(frames);
  let h = t.team[i] === 2 ? Math.PI / 2 : toward;
  const want = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const [vx, vy] = vel(f);
    const sp = Math.hypot(vx, vy);
    const fc = t.face[i][f];
    if (fc >= 0) want[f] = headingOf(Math.cos(fc * Math.PI / 4), Math.sin(fc * Math.PI / 4));
    else if (sp > 0.9) want[f] = headingOf(vx, vy);
    else want[f] = f ? want[f - 1] : h;
  }
  for (let f = 0; f < frames; f++) {
    const d = wrap(want[f] - h);
    const turn = t.act[i][f] === ACT.fall ? 0.12 : 0.5;
    h += Math.max(-turn, Math.min(turn, d * 0.6));
    heading[f] = h;
  }
  // The move each frame.
  const segs: Seg[] = [];
  const at = new Int16Array(frames);
  let started = false;
  const line = t.body[i] === "line";
  for (let f = 0; f < frames; f++) {
    const [vx, vy] = vel(f);
    const sp = Math.hypot(vx, vy);
    if (sp > 0.6) started = true;
    const code = t.act[i][f];
    let clip = "idle", stride = 0, back = false, rate = 1;
    const has = t.holder[f] === i;
    if (code === ACT.fall) {
      // The man with the ball is brought down; the man who got to him makes the tackle.
      let carried = false;
      for (let g = Math.max(0, f - 6); g <= Math.min(last, f + 2); g++) if (t.holder[g] === i) carried = true;
      const prev = segs.at(-1);
      clip = prev && (prev.clip === "tackled" || prev.clip === "tackle" || prev.clip === "dive" || prev.clip === "prone") ? (f - prev.from > 16 ? "prone" : prev.clip)
        : carried ? "tackled" : sp > 3 ? "tackle" : "dive";
    } else if (code === ACT.throw) clip = "throw";
    else if (code === ACT.kick) clip = group === "P" ? "punt" : "kick";
    else if (code === ACT.catch) clip = t.ball[f * 3 + 2] > 2.2 ? "highpoint" : "catch";
    else if (code === ACT.cheer) {
      if (t.team[i] === 2) clip = "ref_td";
      else { const r = hash(seed + i, 5); clip = has && r < 0.3 ? "spike" : r < 0.45 ? "leap" : r < 0.6 ? "dance" : r < 0.72 ? "flex" : r < 0.84 ? "point" : "cheer"; }
    } else if (code === ACT.kneel) clip = group === "QB" ? "kneel" : "hold";
    else if (code === ACT.snap) clip = "snap";
    else if (code === ACT.longsnap) clip = "longsnap";
    else if (code === ACT.handoff) clip = "handoff";
    else if (code === ACT.take) clip = "take";
    else if (code === ACT.incomplete) clip = "ref_incomplete";
    else if (code === ACT.first) clip = "ref_first";
    else if (code === ACT.toss) clip = "ref_flag";
    else if (code === ACT.set && sp <= 1.2) clip = line ? "stance3" : "ready";
    else if (code === ACT.block && sp <= 3.5) {
      const rel = Math.abs(wrap(headingOf(vx, vy) - heading[f]));
      clip = sp > 0.8 && rel > 2 && t.team[i] === 0 ? "passset" : t.team[i] === 1 && line ? "rush" : "block";
    } else if (sp > 0.6) {
      const rel = wrap(headingOf(vx, vy) - heading[f]);
      if (Math.abs(rel) > 2.1 && sp < 6.5) { clip = "backpedal"; stride = STRIDE.backpedal; }
      else if (Math.abs(rel) > 0.9 && sp < 5) { clip = "shuffle"; stride = STRIDE.shuffle; back = rel < 0; }
      else {
        clip = sp < 2 ? "walk" : sp < 4.6 ? "jog" : sp < 7.3 ? "run" : "sprint";
        if (has && t.team[i] !== 2 && sp >= 2) clip = "carry";
        stride = STRIDE[clip];
      }
    } else if (!started) {
      // Before the snap, everyone in his stance.
      clip = t.team[i] === 2 ? "hips" : group === "QB" ? (Math.abs(p[0] - t.ball[0]) < 2.2 ? "under" : "gun")
        : line || group === "OL" ? "stance3" : group === "WR" || group === "TE" ? "stance2" : group === "K" || group === "P" ? "idle" : "ready";
    } else clip = f > frames * 0.8 && hash(seed + i, 9) < 0.4 ? "hips" : "idle";
    // A carrier comes out of a fall only by getting up.
    const prev = segs.at(-1);
    if (prev && (prev.clip === "prone" || prev.clip === "tackled" || prev.clip === "tackle" || prev.clip === "dive") && code !== ACT.fall) clip = "getup";
    if (prev && prev.clip === "getup" && f - prev.from < 18) clip = "getup";
    if (!prev || prev.clip !== clip || prev.back !== back) {
      segs.push({ from: f, clip, stride, back, start: f / t.rate, rate, loop: LOOPS.has(clip) });
    }
    at[f] = segs.length - 1;
  }
  return { segs, at, heading };
}

// ---- Looks ----

const hex = (c: string) => new THREE.Color(c);
const light = (c: string) => { const x = new THREE.Color(c); return x.r * 0.3 + x.g * 0.59 + x.b * 0.11 > 0.55; };
const SKIN = ["#8d5524", "#c68642", "#e0ac69", "#f1c27d", "#5a3825"];

interface Kit { [mat: string]: THREE.Material }

const ROUGH: Record<string, number> = { helmet: 0.28, mask: 0.4, stripe: 0.3, shoe: 0.5 };

function std(color: string, name: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: hex(color), roughness: ROUGH[name] ?? 0.78, metalness: name === "helmet" ? 0.15 : 0 });
}

/** A club's uniform: the home team in its color, the visitors in white; the helmet is the same either way. */
function teamKit(colors: [string, string], home: boolean): Kit {
  const [c0, c1] = colors;
  const shell = c1;
  const jersey = home ? c0 : "#f4f4f4";
  const pants = home ? (light(c1) ? c1 : "#e9e9e6") : light(c1) ? c1 : c0;
  const kit: Kit = {};
  const set = (name: string, color: string) => { kit[name] = std(color, name); };
  set("jersey", jersey); set("pants", pants); set("socks", home ? c0 : c1 === "#ffffff" ? c0 : c1);
  set("sleeve", home ? (light(c0) ? "#1d1f22" : c0) : "#f4f4f4"); set("glove", light(c1) ? c1 : "#ececec");
  set("shoe", home ? "#16181b" : "#f2f2f2"); set("helmet", shell); set("stripe", light(shell) ? c0 : "#f4f4f4");
  set("mask", light(shell) ? c0 : "#9aa0a6"); set("face", "#14110f");
  for (const hide of ["cap", "head"]) { kit[hide] = std("#000", hide); kit[hide].visible = false; }
  return kit;
}

/** Officials: black and white stripes, black trousers, a cap (white for the referee) and no helmet. */
function officialKit(chief: boolean, skin: string): Kit {
  const stripes = std("#ffffff", "jersey");
  stripes.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vRest;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRest = position;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vRest;")
      .replace("#include <color_fragment>", "#include <color_fragment>\nfloat a = atan(vRest.z, vRest.x) * 7.0 / 3.14159;\ndiffuseColor.rgb *= mix(0.06, 1.0, step(0.5, fract(a)));");
  };
  const kit: Kit = { jersey: stripes, sleeve: stripes, pants: std("#121314", "pants"), socks: std("#121314", "socks"), shoe: std("#0d0d0d", "shoe"),
    glove: std(skin, "glove"), head: std(skin, "head"), cap: std(chief ? "#f6f6f6" : "#141414", "cap") };
  for (const hide of ["helmet", "stripe", "mask", "face", "num"]) { kit[hide] = std("#000", hide); kit[hide].visible = false; }
  return kit;
}

function numberMaterial(n: number | null, fill: string, edge: string): THREE.Material {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 96;
  const g = c.getContext("2d")!;
  if (n !== null) {
    g.font = "800 78px 'Arial Narrow', Arial, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 10; g.strokeStyle = edge; g.lineJoin = "round";
    g.strokeText(String(n), 64, 52);
    g.fillStyle = fill; g.fillText(String(n), 64, 52);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, visible: n !== null });
}

// ---- The stage ----

interface Figure {
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  hand: THREE.Object3D;
  head: THREE.Object3D;
  plan: Plan;
  num: THREE.Material | null;
}

/** One WebGL view of the players and ball, laid over the field drawing. */
export class Stage3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 0, -1, -4000, 4000);
  private sun = new THREE.DirectionalLight(0xffffff, 3.1);
  private figs: Figure[] = [];
  private ball: THREE.Object3D;
  private track: Track | null = null;
  private kits = new Map<string, Kit>();
  private spinAt = 0;

  constructor(canvas: HTMLCanvasElement, private model: Model3D) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera.position.set(0, 2000 * SIN, 2000 * COS);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4c6b3c, 1.15));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
    // The grass only catches the shadows; the field drawing underneath is the grass.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1400), new THREE.ShadowMaterial({ opacity: 0.3 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(600, 0, MID / SIN);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ball = model.ball.clone();
    this.ball.scale.setScalar(FIG * 1.6);
    this.ball.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        const name = (m.material as THREE.Material).name;
        m.material = std(name === "lace" ? "#f4f1ea" : "#6b3412", "ball");
      }
    });
    this.scene.add(this.ball);
  }

  private kit(key: string, make: () => Kit): Kit {
    let k = this.kits.get(key);
    if (!k) { k = make(); this.kits.set(key, k); }
    return k;
  }

  /** Puts a play's players on the stage, dressed for their clubs. */
  setTrack(track: Track, teams: [string, string], offenseHome: boolean, seed: number): void {
    this.track = track;
    for (const f of this.figs) { this.scene.remove(f.root); f.mixer.stopAllAction(); (f.num as THREE.MeshStandardMaterial | null)?.map?.dispose(); f.num?.dispose(); }
    this.figs = [];
    const colors = (team: string): [string, string] => TEAM_COLORS[team] ?? ["#2b3a4a", "#9aa5b1"];
    track.pos.forEach((_, i) => {
      const team = track.team[i];
      const home = team === 0 ? offenseHome : !offenseHome;
      const club = team === 2 ? "" : teams[team as 0 | 1];
      const slot = track.slot[i];
      const kit = team === 2
        ? this.kit(`ref|${track.group?.[i] === "REF" && i === track.pos.length - 1}|${Math.floor(hash(seed, i) * SKIN.length)}`, () => officialKit(i === track.pos.length - 1, SKIN[Math.floor(hash(seed, i) * SKIN.length)]))
        : this.kit(`${club}|${home}`, () => teamKit(colors(club), home));
      const model = SkeletonUtils.clone(this.model.scene);
      let num: THREE.Material | null = null;
      if (team !== 2) {
        const cl = colors(club);
        const fill = home ? (light(cl[0]) ? "#1a1a1a" : "#ffffff") : cl[0];
        const edge = home ? cl[1] : light(cl[1]) ? cl[0] : cl[1];
        num = numberMaterial(slot?.number ?? null, fill, edge);
      }
      model.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.frustumCulled = false;
        const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => (x.name === "num" ? num ?? kit.num : kit[x.name] ?? x));
        m.material = mats.length === 1 ? mats[0] : mats;
      });
      // A build from the man's real height and weight; linemen without a name are drawn big.
      const p = slot?.id ? PLAYER_BY_ID[slot.id] : undefined;
      const tall = p?.heightIn ? p.heightIn / 74 : 1;
      const wide = p?.weightLb ? Math.max(0.86, Math.min(1.32, Math.sqrt(p.weightLb / (225 * tall)))) : track.body[i] === "line" ? 1.22 : 1;
      model.scale.set(FIG * tall * (0.75 + wide * 0.25), FIG * tall, FIG * tall * wide);
      const root = new THREE.Group();
      root.add(model);
      this.scene.add(root);
      const mixer = new THREE.AnimationMixer(model);
      this.figs.push({
        root, model, mixer, actions: new Map(), num, plan: plan(track, i, seed),
        hand: model.getObjectByName("hand.R") ?? model, head: model.getObjectByName("head") ?? model,
      });
    });
  }

  private action(fig: Figure, name: string): THREE.AnimationAction | null {
    let a = fig.actions.get(name);
    if (!a) {
      const clip = this.model.clips.get(name);
      if (!clip) return null;
      a = fig.mixer.clipAction(clip);
      a.play();
      a.enabled = false;
      fig.actions.set(name, a);
    }
    return a;
  }

  private clipTime(_fig: Figure, seg: Seg, s: number, dist: number): number {
    const clip = this.model.clips.get(seg.clip);
    if (!clip) return 0;
    const dur = clip.duration;
    if (seg.stride) {
      const k = ((dist / seg.stride) % 1 + 1) % 1;
      return (seg.back ? 1 - k : k) * dur * 0.999;
    }
    const el = Math.max(0, s - seg.start) * seg.rate;
    return seg.loop ? el % dur : Math.min(dur - 1e-3, el);
  }

  /** The part of the field drawing on show (left, top, width, height) on a canvas of this many CSS pixels, at second `s` of the play. */
  draw(s: number, [left, top, width, height]: [number, number, number, number], cssW: number, cssH: number, dpr: number): void {
    const t = this.track;
    if (!t) return;
    const r = this.renderer;
    if (r.getPixelRatio() !== dpr) r.setPixelRatio(dpr);
    const size = r.getSize(new THREE.Vector2());
    if (size.x !== cssW || size.y !== cssH) r.setSize(cssW, cssH, false);
    // The same fit the field drawing uses: the stretch on show, whole and centered.
    const k = Math.min(cssW / width, cssH / height);
    const vw = cssW / k, vh = cssH / k;
    const x0 = left - (vw - width) / 2, y0 = top - (vh - height) / 2;
    const cam = this.camera;
    cam.left = x0; cam.right = x0 + vw; cam.top = -y0; cam.bottom = -(y0 + vh);
    cam.updateProjectionMatrix();
    // The sun from the upper left, its shadow box over what is on show.
    const cx = x0 + vw / 2, cz = (y0 + vh / 2) / SIN;
    this.sun.position.set(cx - 260, 600, cz - 260);
    this.sun.target.position.set(cx, 0, cz);
    const sc = this.sun.shadow.camera;
    sc.left = -vw * 0.75; sc.right = vw * 0.75; sc.top = 520; sc.bottom = -520; sc.near = 1; sc.far = 2000;
    sc.updateProjectionMatrix();

    const last = t.pos[0].length / 2 - 1;
    const fs = Math.max(0, Math.min(last, s * t.rate));
    const f = Math.min(last, Math.floor(fs)), g = Math.min(last, f + 1), kf = fs - f;
    this.figs.forEach((fig, i) => {
      const p = t.pos[i];
      const x = p[f * 2] + (p[g * 2] - p[f * 2]) * kf, y = p[f * 2 + 1] + (p[g * 2 + 1] - p[f * 2 + 1]) * kf;
      fig.root.position.set(100 + x * 10, 0, (MID - y * 10) / SIN);
      const h0 = fig.plan.heading[f], h1 = fig.plan.heading[g];
      fig.root.rotation.y = h0 + wrap(h1 - h0) * kf;
      const dist = t.dist[i][f] + (t.dist[i][g] - t.dist[i][f]) * kf;
      const idx = fig.plan.at[f];
      const seg = fig.plan.segs[idx], prev = idx > 0 ? fig.plan.segs[idx - 1] : null;
      // A new move blends in over a moment from the one before.
      const w = prev ? Math.min(1, (s - seg.start) / 0.16) : 1;
      for (const a of fig.actions.values()) a.enabled = false;
      const cur = this.action(fig, seg.clip);
      if (cur) { cur.enabled = true; cur.setEffectiveWeight(w); cur.time = this.clipTime(fig, seg, s, dist); }
      if (prev && w < 1 && prev.clip !== seg.clip) {
        const pa = this.action(fig, prev.clip);
        if (pa) { pa.enabled = true; pa.setEffectiveWeight(1 - w); pa.time = this.clipTime(fig, prev, s, dist); }
      }
      fig.mixer.update(0);
    });
    this.scene.updateMatrixWorld();

    // The ball: in a hand when someone has it, otherwise where the track puts it, spiraling or tumbling.
    const b = t.ball;
    const bx = b[f * 3] + (b[g * 3] - b[f * 3]) * kf, by = b[f * 3 + 1] + (b[g * 3 + 1] - b[f * 3 + 1]) * kf, bh = b[f * 3 + 2] + (b[g * 3 + 2] - b[f * 3 + 2]) * kf;
    const who = t.holder[f];
    if (who >= 0 && this.figs[who]) {
      const hand = this.figs[who].hand;
      hand.getWorldPosition(this.ball.position);
      hand.getWorldQuaternion(this.ball.quaternion);
      this.ball.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
      this.ball.translateY(-FIG * 0.04);
    } else {
      this.ball.position.set(100 + bx * 10, Math.max(FIG * 0.09, bh * UP + FIG * 0.09), (MID - by * 10) / SIN);
      const a = Math.max(0, f - 1), c = Math.min(last, f + 1);
      const dx = (b[c * 3] - b[a * 3]) * 10, dz = -(b[c * 3 + 1] - b[a * 3 + 1]) * 10 / SIN, dy = (b[c * 3 + 2] - b[a * 3 + 2]) * UP;
      const moving = Math.hypot(dx, dz, dy) > 0.5;
      if (moving) {
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        this.ball.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
        const tumble = t.tumble && f >= t.tumble[0] && f <= t.tumble[1];
        // A spiral turns about the ball's length; a kick tumbles end over end.
        this.ball.rotateOnAxis(tumble ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), s * (tumble ? 11 : 26));
        this.spinAt = s;
      } else if (bh < 0.2) {
        // At rest it lies on its side.
        this.ball.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4 + this.spinAt);
      }
    }
    r.render(this.scene, cam);
  }

  /** Where a player's helmet is in the field drawing's units, for his number and name. */
  headAt(i: number): [number, number] | null {
    const fig = this.figs[i];
    if (!fig) return null;
    const v = fig.head.getWorldPosition(new THREE.Vector3());
    return [v.x, v.z * SIN - v.y * COS];
  }

  /** Whether a player is on the ground at second s. */
  down(i: number, s: number): boolean {
    const fig = this.figs[i], t = this.track;
    if (!fig || !t) return false;
    const f = Math.min(t.pos[0].length / 2 - 1, Math.max(0, Math.floor(s * t.rate)));
    const c = fig.plan.segs[fig.plan.at[f]].clip;
    return c === "prone" || c === "tackled" || c === "tackle" || c === "dive";
  }

  dispose(): void {
    for (const f of this.figs) { (f.num as THREE.MeshStandardMaterial | null)?.map?.dispose(); f.num?.dispose(); }
    for (const kit of this.kits.values()) for (const m of Object.values(kit)) m.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
