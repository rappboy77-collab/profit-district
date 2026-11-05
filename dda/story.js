import * as THREE from './vendor/three.module.min.js';

const root = document.documentElement;
const stage = document.getElementById('stage');
const canvas = document.getElementById('scene');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

const GOLD = 0xc9a84c;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const kf = (T, keys) => {
  if (T <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (T <= keys[i + 1][0]) return lerp(keys[i][1], keys[i + 1][1], smooth(keys[i][0], keys[i + 1][0], T));
  }
  return keys[keys.length - 1][1];
};
const kfl = (T, keys) => {
  if (T <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (T <= keys[i + 1][0]) return lerp(keys[i][1], keys[i + 1][1], (T - keys[i][0]) / (keys[i + 1][0] - keys[i][0]));
  }
  return keys[keys.length - 1][1];
};

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  root.classList.remove('has3d');
  throw e;
}
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); root.classList.remove('has3d'); });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setClearColor(0x000000, 0);
renderer.autoClear = false;
renderer.setScissorTest(true);

const nativeDpr = window.devicePixelRatio || 1;
/* o singură rezoluție, puțin peste cea a ecranului ca personajele să fie clare; fără comutări la scroll, coboară doar dacă GPU-ul nu ține pasul */
const topDpr = lowEnd ? Math.max(1, Math.min(nativeDpr, 1.25)) : 1.5;
const minDpr = 0.85;
let dpr = topDpr;

/* ---------- ajutoare de geometrie ---------- */
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02, ...o });
const glow = (color, intensity = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false });
const BLOB = new THREE.SphereGeometry(1, 20, 14);

function box(parent, w, h, d, m, x = 0, y = 0, z = 0) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}
function cyl(parent, rt, rb, h, m, x = 0, y = 0, z = 0, seg = 28) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  c.position.set(x, y, z);
  parent.add(c);
  return c;
}
function blob(parent, sx, sy, sz, m, x = 0, y = 0, z = 0) {
  const b = new THREE.Mesh(BLOB, m);
  b.scale.set(sx, sy, sz);
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}
function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return { c, g: c.getContext('2d', { alpha: false }), t };
}
const softDot = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

/* ---------- personaj: manechin sculptat, intenționat fără trăsături ---------- */
function rimMaterial(color, rim, o = {}) {
  const m = mat(color, o);
  const value = new THREE.Color(rim);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimC = { value };
    sh.fragmentShader = 'uniform vec3 rimC;\n' + sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       float rimF = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 2.6);
       totalEmissiveRadiance += rimC * rimF * 1.35;`
    );
  };
  m.customProgramCacheKey = () => 'rim';
  return m;
}
function tube(len, r1, r2, m) {
  const pts = [];
  const cap = 6;
  for (let i = 0; i <= cap; i++) { const a = (i / cap) * Math.PI * 0.5; pts.push(new THREE.Vector2(Math.max(Math.sin(a) * r2, 0.0001), -len + r2 - Math.cos(a) * r2)); }
  for (let i = 0; i <= cap; i++) { const a = (i / cap) * Math.PI * 0.5; pts.push(new THREE.Vector2(Math.max(Math.cos(a) * r1, 0.0001), Math.sin(a) * r1)); }
  const pivot = new THREE.Group();
  pivot.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 16), m));
  return pivot;
}
function makePerson({ cloth, cloth2, skin, hair, rim, longHair }) {
  const mC = rimMaterial(cloth, rim), mP = rimMaterial(cloth2, rim), mK = rimMaterial(skin, rim, { roughness: 0.42 }), mH = rimMaterial(hair, rim, { roughness: 0.5 }), mF = rimMaterial(0x121214, rim, { roughness: 0.35 }), mT = mat(GOLD, { metalness: 0.85, roughness: 0.3 });
  const p = new THREE.Group();
  const hips = new THREE.Group();
  p.add(hips);
  blob(hips, 0.155, 0.11, 0.105, mP, 0, 0.0, 0);

  const torso = new THREE.Group();
  hips.add(torso);
  const prof = [[0.0001, 0.02], [0.13, 0.03], [0.14, 0.09], [0.128, 0.19], [0.14, 0.3], [0.168, 0.4], [0.178, 0.47], [0.15, 0.53], [0.085, 0.57], [0.0001, 0.585]].map(([r, y]) => new THREE.Vector2(r, y));
  const chest = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(22), 24), mC);
  chest.scale.z = 0.66;
  torso.add(chest);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.009, 10, 32), mT);
  collar.rotation.x = Math.PI / 2 - 0.15;
  collar.position.set(0, 0.575, 0.002);
  torso.add(collar);

  const head = new THREE.Group();
  head.position.y = 0.58;
  torso.add(head);
  cyl(head, 0.044, 0.056, 0.11, mK, 0, 0.035, 0);
  const skull = new THREE.Group();
  skull.position.y = 0.2;
  head.add(skull);
  const headProf = [[0.0001, -0.128], [0.042, -0.122], [0.07, -0.09], [0.086, -0.04], [0.099, 0.02], [0.105, 0.07], [0.097, 0.116], [0.07, 0.146], [0.03, 0.161], [0.0001, 0.165]].map(([r, y]) => new THREE.Vector2(r, y));
  const face = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve(headProf).getPoints(24), 28), mK);
  face.scale.z = 1.1;
  skull.add(face);
  if (longHair) {
    blob(skull, 0.046, 0.046, 0.046, mH, 0, 0.1, -0.116);
    const tail = blob(skull, 0.034, 0.13, 0.032, mH, 0, -0.04, -0.128);
    tail.rotation.x = -0.1;
  }

  const arm = (sx) => {
    const shoulder = tube(0.3, 0.054, 0.042, mC);
    shoulder.position.set(sx * 0.19, 0.49, 0);
    torso.add(shoulder);
    blob(shoulder, 0.058, 0.058, 0.058, mC);
    const elbow = tube(0.26, 0.042, 0.032, mC);
    elbow.position.y = -0.3;
    shoulder.add(elbow);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.006, 8, 22), mT);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.245;
    elbow.add(cuff);
    const hand = new THREE.Group();
    hand.position.y = -0.27;
    elbow.add(hand);
    blob(hand, 0.024, 0.052, 0.04, mK, 0, -0.03, 0);
    blob(hand, 0.019, 0.045, 0.034, mK, 0, -0.082, 0.002);
    const thumb = blob(hand, 0.012, 0.032, 0.012, mK, sx * -0.006, -0.03, 0.04);
    thumb.rotation.x = 0.5;
    return { shoulder, elbow, hand };
  };
  const leg = (sx) => {
    const hip = tube(0.44, 0.078, 0.052, mP);
    hip.position.set(sx * 0.085, -0.01, 0);
    hips.add(hip);
    const knee = tube(0.44, 0.054, 0.038, mP);
    knee.position.y = -0.44;
    hip.add(knee);
    blob(knee, 0.052, 0.042, 0.13, mF, 0, -0.455, 0.052);
    box(knee, 0.086, 0.012, 0.23, mT, 0, -0.49, 0.052);
    return { hip, knee };
  };
  return { root: p, hips, torso, head, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1) };
}
const POSES = {
  stand: { y: 0.95, t: 0, hx: 0, hy: 0, lS: 0, lZ: 0.08, lE: -0.14, rS: 0, rZ: 0.08, rE: -0.14, lH: 0, lK: 0, rH: 0, rK: 0 },
  look: { y: 0.52, t: 0.1, hx: -0.06, hy: 0, lS: -0.62, lZ: 0.05, lE: -0.92, rS: -0.62, rZ: 0.05, rE: -0.92, lH: -1.57, lK: 1.57, rH: -1.57, rK: 1.57 },
  write: { y: 0.52, t: 0.3, hx: 0.42, hy: 0.06, lS: -0.5, lZ: 0.02, lE: -1.05, rS: -0.86, rZ: 0.02, rE: -1.16, lH: -1.57, lK: 1.57, rH: -1.57, rK: 1.57 },
  trade: { y: 0.52, t: 0.2, hx: -0.04, hy: 0.08, lS: -0.5, lZ: 0.04, lE: -0.95, rS: -1.0, rZ: 0, rE: -0.72, lH: -1.57, lK: 1.57, rH: -1.57, rK: 1.57 },
  phone: { y: 0.52, t: 0.08, hx: 0.36, hy: 0, lS: -0.4, lZ: 0.08, lE: -0.9, rS: -0.72, rZ: -0.08, rE: -1.6, lH: -1.57, lK: 1.57, rH: -1.57, rK: 1.57 },
  sofa: { y: 0.5, t: -0.06, hx: 0.02, hy: 0.42, lS: -0.2, lZ: 0.03, lE: -0.62, rS: -0.2, rZ: 0.03, rE: -0.62, lH: -1.5, lK: 1.5, rH: -1.5, rK: 1.5 },
  read: { y: 0.5, t: 0, hx: 0.34, hy: 0, lS: -0.62, lZ: 0.1, lE: -1.25, rS: -0.62, rZ: 0.1, rE: -1.25, lH: -1.5, lK: 1.5, rH: -1.5, rK: 1.5 }
};
function poseAt(T, keys) {
  if (T <= keys[0][0]) return POSES[keys[0][1]];
  for (let i = 0; i < keys.length - 1; i++) {
    if (T <= keys[i + 1][0]) {
      const u = smooth(keys[i][0], keys[i + 1][0], T);
      const a = POSES[keys[i][1]], b = POSES[keys[i + 1][1]];
      const o = {};
      for (const k in a) o[k] = lerp(a[k], b[k], u);
      return o;
    }
  }
  return POSES[keys[keys.length - 1][1]];
}
function applyPose(P, p, walk = 0, phi = 0, breath = 0) {
  const sw = Math.sin(phi) * 0.55 * walk, kn = walk * 0.6;
  P.hips.position.y = p.y + Math.abs(Math.cos(phi)) * 0.022 * walk;
  P.torso.rotation.x = p.t + breath * 0.012;
  P.head.rotation.x = p.hx;
  P.head.rotation.y = p.hy;
  P.armL.shoulder.rotation.set(p.lS - sw * 0.8, 0, -p.lZ);
  P.armR.shoulder.rotation.set(p.rS + sw * 0.8, 0, p.rZ);
  P.armL.elbow.rotation.x = p.lE;
  P.armR.elbow.rotation.x = p.rE;
  P.legL.hip.rotation.x = p.lH + sw;
  P.legR.hip.rotation.x = p.rH - sw;
  P.legL.knee.rotation.x = p.lK + kn * Math.max(0, -Math.cos(phi));
  P.legR.knee.rotation.x = p.rK + kn * Math.max(0, Math.cos(phi));
}

/* ---------- decor comun: sol, bare de lumină, particule ---------- */
function addGround(scene, tint, opacity, size = 7) {
  const m = new THREE.MeshBasicMaterial({ map: softDot, color: tint, transparent: true, opacity, depthWrite: false, toneMapped: false });
  const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
  g.rotation.x = -Math.PI / 2;
  g.position.y = -0.002;
  scene.add(g);
}
function contact(parent, size = 1.1, opacity = 0.55) {
  const m = new THREE.MeshBasicMaterial({ map: softDot, color: 0x000000, transparent: true, opacity, depthWrite: false, toneMapped: false });
  const c = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
  c.rotation.x = -Math.PI / 2;
  c.position.y = 0.004;
  parent.add(c);
  return c;
}
const BAR = new THREE.CylinderGeometry(1, 1, 1, 12);
function addBars(scene, center, color, seedOffset) {
  const group = new THREE.Group();
  group.position.copy(center);
  scene.add(group);
  const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.5), toneMapped: false });
  const halo = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
  const bars = [];
  const n = lowEnd ? 3 : 5;
  for (let i = 0; i < n; i++) {
    const s = i * 2.399 + seedOffset;
    const pivot = new THREE.Group();
    const len = 0.9 + ((i * 37) % 10) * 0.14;
    const a = new THREE.Mesh(BAR, core);
    a.scale.set(0.008, len, 0.008);
    const b = new THREE.Mesh(BAR, halo);
    b.scale.set(0.028, len * 1.01, 0.028);
    pivot.add(a, b);
    group.add(pivot);
    bars.push({ pivot, s, r: 2.1 + (i % 3) * 0.8, y: 0.25 + ((i * 53) % 10) * 0.25 });
  }
  return {
    update(T, time) {
      bars.forEach((b) => {
        const a = b.s + T * 0.62 + time * 0.05;
        b.pivot.position.set(Math.cos(a) * b.r, b.y + Math.sin(a * 1.3 + b.s) * 0.35, Math.sin(a) * b.r);
        b.pivot.rotation.set(b.s + T * 0.5 + time * 0.07, a * 0.5, b.s * 1.7 + T * 0.35);
      });
    }
  };
}
function addDust(scene, center, color, seed) {
  const n = lowEnd ? 50 : 110;
  const pos = new Float32Array(n * 3);
  let x = seed;
  const rnd = () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; };
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rnd() - 0.5) * 7;
    pos[i * 3 + 1] = rnd() * 3.6;
    pos[i * 3 + 2] = (rnd() - 0.5) * 7;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: softDot, color, size: 0.038, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false });
  const p = new THREE.Points(g, m);
  p.position.copy(center);
  scene.add(p);
  return { update(T, time) { p.rotation.y = T * 0.14 + time * 0.012; p.position.y = center.y + Math.sin(time * 0.15 + seed) * 0.06; } };
}

/* graficul e ilustrativ: urcă și coboară, fără valori */
const SERIES = Array.from({ length: 64 }, (_, i) => {
  const base = 0.46 + 0.14 * Math.sin(i * 0.33) + 0.08 * Math.sin(i * 0.87 + 1) + 0.05 * Math.sin(i * 1.9);
  const dip = i > 45 ? -0.27 * smooth(45, 56, i) : 0;
  return clamp(base + i * 0.0028 + dip, 0.06, 0.95);
});
function drawCandles(g, x, y, w, h, n, up, down) {
  const cw = w / 64;
  for (let i = 1; i < n; i++) {
    const o = SERIES[i - 1], c = SERIES[i];
    const hi = Math.max(o, c) + 0.025 + 0.02 * Math.abs(Math.sin(i * 7.1));
    const lo = Math.min(o, c) - 0.025 - 0.02 * Math.abs(Math.sin(i * 3.3));
    g.fillStyle = c >= o ? up : down;
    const cx = x + i * cw;
    g.fillRect(cx - cw * 0.06, y + h - hi * h, Math.max(1, cw * 0.12), (hi - lo) * h);
    g.fillRect(cx - cw * 0.32, y + h - Math.max(o, c) * h, cw * 0.64, Math.max(2, Math.abs(c - o) * h));
  }
}
function drawLine(g, x, y, w, h, n, color, lw) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const px = x + (i / 63) * w, py = y + h - SERIES[i] * h;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineJoin = 'round';
  g.stroke();
}
function makeDesk(scene, top, legs) {
  const g = new THREE.Group();
  const out = new THREE.Group();
  scene.add(out);
  box(g, 1.7, 0.045, 0.74, top, 0, 0.735, 0.62);
  [[-0.78, 0.3], [0.78, 0.3], [-0.78, 0.94], [0.78, 0.94]].forEach(([x, z]) => cyl(g, 0.016, 0.016, 0.72, legs, x, 0.36, z, 10));
  out.add(g);
  const seat = new THREE.Group();
  box(seat, 0.44, 0.04, 0.42, legs, 0, 0.45, -0.02);
  box(seat, 0.4, 0.46, 0.035, legs, 0, 0.72, -0.24);
  cyl(seat, 0.02, 0.02, 0.44, legs, 0, 0.22, -0.02, 10);
  cyl(seat, 0.2, 0.2, 0.014, legs, 0, 0.01, -0.02);
  out.add(seat);
  return out;
}

/* ---------- LUMEA A: studiu, efort, timp ---------- */
const A = (() => {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0x9fb4d6, 0x0a0a0c, 0.4));
  const key = new THREE.DirectionalLight(0xb9cce8, 0.8);
  key.position.set(-2.5, 3.5, 3);
  const back = new THREE.DirectionalLight(0xffd898, 2.2);
  back.position.set(2.4, 2.6, -3);
  const lamp = new THREE.PointLight(0xffc27a, 3.2, 5, 1.6);
  lamp.position.set(0.62, 1.32, 0.68);
  scene.add(key, back, lamp);
  addGround(scene, 0x34404f, 0.5);

  const wood = mat(0x2a2320, { roughness: 0.42 }), dark = mat(0x0f1013, { roughness: 0.4 }), brass = mat(GOLD, { metalness: 0.85, roughness: 0.3 });
  const props = makeDesk(scene, wood, dark);
  contact(scene, 1.5, 0.7).position.z = 0.25;

  const mon = canvasTex(lowEnd ? 640 : 1024, lowEnd ? 400 : 640);
  /* ecran de sticlă: fără spate negru care să acopere personajul */
  const monitor = new THREE.Group();
  monitor.position.set(0.32, 1.26, 0.86);
  monitor.rotation.y = Math.PI + 0.32;
  monitor.add(new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.7), new THREE.MeshBasicMaterial({ map: mon.t, toneMapped: false, side: THREE.DoubleSide })));
  const monEdge = glow(GOLD, 1.1);
  [[0, 0.356, 1.14, 0.009], [0, -0.356, 1.14, 0.009], [-0.566, 0, 0.009, 0.72], [0.566, 0, 0.009, 0.72]].forEach(([x, y, w, h]) => box(monitor, w, h, 0.006, monEdge, x, y, 0));
  cyl(monitor, 0.012, 0.012, 0.15, brass, 0, -0.43, 0, 10);
  props.add(monitor);

  const lampGroup = new THREE.Group();
  lampGroup.position.set(0.74, 0.76, 0.5);
  cyl(lampGroup, 0.08, 0.09, 0.02, brass);
  cyl(lampGroup, 0.008, 0.008, 0.56, brass, 0, 0.28, 0, 8);
  const shadeM = new THREE.MeshStandardMaterial({ color: 0x6f5a2a, emissive: 0xffc56a, emissiveIntensity: 1.5, metalness: 0.4, roughness: 0.4 });
  cyl(lampGroup, 0.06, 0.15, 0.13, shadeM, 0, 0.6, 0, 24);
  props.add(lampGroup);

  const book = new THREE.Group();
  book.position.set(-0.46, 0.765, 0.52);
  book.rotation.y = 0.16;
  const paper = mat(0xece4d0, { roughness: 0.9 }), cover = mat(0x7b2f26);
  box(book, 0.25, 0.03, 0.34, paper, 0.125, 0, 0);
  const leftBlock = box(book, 0.25, 0.012, 0.34, paper, -0.125, 0, 0);
  const coverHinge = new THREE.Group();
  coverHinge.position.y = 0.022;
  book.add(coverHinge);
  box(coverHinge, 0.26, 0.012, 0.35, cover, -0.13, 0, 0);
  const pages = [0, 1, 2, 3].map((i) => {
    const hinge = new THREE.Group();
    hinge.position.y = 0.019 + i * 0.001;
    hinge.add(new THREE.Mesh(new THREE.PlaneGeometry(0.245, 0.335).translate(0.1225, 0, 0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf5eedb, side: THREE.DoubleSide, roughness: 0.9 })));
    book.add(hinge);
    return hinge;
  });
  props.add(book);
  const journal = box(props, 0.2, 0.024, 0.28, mat(GOLD, { roughness: 0.5 }), 0.42, 0.77, 0.74);

  /* ceasul e decor mare, ca un obiect suspendat în spatele personajului */
  const clock = new THREE.Group();
  clock.position.set(1.62, 1.98, -0.72);
  clock.rotation.y = -1.1;
  clock.add(new THREE.Mesh(new THREE.CircleGeometry(0.82, 64), new THREE.MeshBasicMaterial({ color: 0x0b0d10, transparent: true, opacity: 0.72, toneMapped: false })));
  const ringM = glow(GOLD, 1.25);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.012, 10, 96), ringM);
  ring.position.z = 0.01;
  clock.add(ring);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tick = box(clock, 0.012, i % 3 ? 0.05 : 0.11, 0.004, ringM, Math.sin(a) * 0.72, Math.cos(a) * 0.72, 0.012);
    tick.rotation.z = -a;
  }
  const hand = (len, w) => {
    const h = new THREE.Group();
    box(h, w, len, 0.006, glow(0xf0ece0, 1), 0, len / 2, 0);
    h.position.z = 0.02;
    clock.add(h);
    return h;
  };
  const handH = hand(0.42, 0.024), handM = hand(0.64, 0.013);
  scene.add(clock);

  /* notițele se adună în jurul lui, ca decor care crește în timp */
  const notes = [[1.5, 1.5, -0.4], [1.75, 0.95, 0.15], [1.2, 2.25, -0.9], [0.7, 2.45, -1.1], [1.95, 1.85, 0.45], [-0.7, 2.35, -1.0]].map(([x, y, z], i) => {
    const n = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.2), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xd9cfa0 : 0xe8e2d2, side: THREE.DoubleSide, toneMapped: false }));
    n.position.set(x, y, z);
    n.userData = { y, s: i * 1.7 };
    scene.add(n);
    return n;
  });

  const person = makePerson({ cloth: 0x23272f, cloth2: 0x121317, skin: 0x6b5a4d, hair: 0x0b0a09, rim: 0x7aa0d8 });
  scene.add(person.root);
  const bars = addBars(scene, new THREE.Vector3(0, 0.2, 0.2), 0xe2bf6a, 0.4);
  const dust = addDust(scene, new THREE.Vector3(0, 0, 0.2), 0xd9b85e, 4242);

  const candlesAt = (T) => Math.round(kfl(T, [[0, 16], [1, 20], [3, 36], [4.15, 42], [5, 60], [6, 64]]));
  function draw(T) {
    const { c, g: x } = mon;
    const W = c.width, H = c.height, pad = W * 0.05;
    x.fillStyle = '#0a0d11';
    x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(160,170,190,0.13)';
    for (let i = 1; i < 5; i++) x.fillRect(0, (i * H) / 5, W, 1);
    drawCandles(x, pad, H * 0.1, W - pad * 2, H * 0.8, candlesAt(T), '#e2bf6a', '#c26c55');
    const entry = smooth(3.7, 4.05, T);
    if (entry > 0) {
      const py = H * 0.9 - SERIES[40] * H * 0.8, px = pad + (40 * (W - pad * 2)) / 64;
      x.globalAlpha = entry;
      x.fillStyle = '#f0ece0';
      for (let u = px; u < W; u += W * 0.024) x.fillRect(u, py - 1, W * 0.012, 3);
      x.beginPath(); x.arc(px, py, W * 0.014, 0, Math.PI * 2); x.fill();
      x.globalAlpha = 1;
    }
    mon.t.needsUpdate = true;
  }
  function update(T, time) {
    props.scale.setScalar(Math.max(0.001, smooth(0.55, 0.95, T)));
    clock.scale.setScalar(Math.max(0.001, smooth(2.1, 2.5, T) * (1 - smooth(4.0, 4.3, T))));
    coverHinge.rotation.z = kf(T, [[1.3, -Math.PI + 0.02], [1.75, 0]]);
    leftBlock.scale.y = smooth(1.45, 1.75, T);
    pages.forEach((h, i) => { h.rotation.z = kf(T, [[2.1 + i * 0.32, 0], [2.4 + i * 0.32, Math.PI - 0.03]]); });
    journal.position.x = kf(T, [[4.6, 0.42], [4.9, 0.02]]);
    journal.position.z = kf(T, [[4.6, 0.74], [4.9, 0.5]]);
    journal.position.y = kf(T, [[4.6, 0.77], [4.9, 0.775]]);
    const hours = 18.5 + T * 0.8 + kf(T, [[2.4, 0], [3.7, 9]]);
    handH.rotation.z = -(hours / 12) * Math.PI * 2;
    handM.rotation.z = -hours * Math.PI * 2;
    const night = kf(T, [[2.4, 0], [2.9, 1], [3.4, 1], [3.75, 0]]);
    lamp.intensity = lerp(3.2, 6, night);
    key.intensity = lerp(0.8, 0.4, night);
    shadeM.emissiveIntensity = lerp(1.3, 2.4, night);
    notes.forEach((n, i) => {
      const u = n.userData;
      n.scale.setScalar(Math.max(0.001, smooth(2.45 + i * 0.2, 2.7 + i * 0.2, T)));
      n.rotation.set(0.25 * Math.sin(u.s + T * 0.8 + time * 0.25), u.s + T * 0.35 + time * 0.05, 0.12 * Math.cos(u.s + T));
      n.position.y = u.y + Math.sin(u.s + time * 0.4) * 0.03;
    });
    bars.update(T, time);
    dust.update(T, time);
    const walk = smooth(5.6, 5.68, T) * (1 - smooth(5.92, 6, T));
    const pose = poseAt(T, [[0, 'look'], [1.2, 'look'], [1.6, 'write'], [2.75, 'write'], [3.0, 'look'], [3.25, 'write'], [3.65, 'look'], [3.95, 'trade'], [4.45, 'trade'], [4.78, 'write'], [5.42, 'write'], [5.62, 'stand']]);
    const quill = smooth(1.55, 1.75, T) * (1 - smooth(3.6, 3.7, T)) * Math.sin(T * 38 + time * 4) * 0.08;
    const scan = (1 - smooth(5.4, 5.6, T)) * smooth(0.5, 0.9, T);
    return { pose, quill, walk, scan };
  }
  return { scene, person, draw, update, candlesAt };
})();

/* ---------- LUMEA B: alegere, copiere, viață ---------- */
const B = (() => {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff0d6, 0x2a1d0d, 0.5));
  const key = new THREE.DirectionalLight(0xfff0d8, 1.1);
  key.position.set(2.5, 4, 3);
  const back = new THREE.DirectionalLight(0xffe2ac, 2.2);
  back.position.set(-2.8, 2.4, -3);
  scene.add(key, back, new THREE.PointLight(0xffe0b0, 1.5, 6, 1.6));
  addGround(scene, 0xc8a56b, 0.55);

  const top = mat(0xd8b98a, { roughness: 0.35 }), legs = mat(0x4b3a25, { roughness: 0.4 }), dark = mat(0x18150f, { roughness: 0.4 }), white = mat(0xf4eddc);
  const props = makeDesk(scene, top, legs);
  contact(scene, 1.5, 0.45).position.z = 0.25;

  const laptop = new THREE.Group();
  laptop.position.set(0.1, 0.765, 0.62);
  laptop.rotation.y = Math.PI;
  const alu = mat(0xb0b0ac, { metalness: 0.65, roughness: 0.3 });
  box(laptop, 0.5, 0.016, 0.34, alu);
  const lid = box(laptop, 0.5, 0.33, 0.012, alu, 0, 0.16, -0.17);
  lid.rotation.x = -0.14;
  const lapScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.29), new THREE.MeshBasicMaterial({ color: 0xb59e76, toneMapped: false }));
  lapScreen.position.z = 0.008;
  lid.add(lapScreen);
  props.add(laptop);

  const phoneScreen = new THREE.MeshBasicMaterial({ color: 0x8a6e2f, toneMapped: false });
  const phone = new THREE.Group();
  box(phone, 0.085, 0.012, 0.165, mat(0x15171b, { roughness: 0.25 }));
  const ps = new THREE.Mesh(new THREE.PlaneGeometry(0.073, 0.15).rotateX(-Math.PI / 2), phoneScreen);
  ps.position.y = 0.0075;
  phone.add(ps);
  phone.position.set(-0.42, 0.765, 0.46);
  scene.add(phone);

  /* panoul strategiei plutește în decor; în viața de zi cu zi rămâne în fundal */
  const pan = canvasTex(lowEnd ? 704 : 1100, lowEnd ? 453 : 708);
  const panel = new THREE.Group();
  box(panel, 1.92, 1.26, 0.025, mat(0x0d0c09, { metalness: 0.4, roughness: 0.3 })).position.z = -0.016;
  panel.add(new THREE.Mesh(new THREE.PlaneGeometry(1.86, 1.2), new THREE.MeshBasicMaterial({ map: pan.t, toneMapped: false })));
  const edge = glow(GOLD, 1.2);
  [[0, 0.635, 1.94, 0.012], [0, -0.635, 1.94, 0.012], [-0.965, 0, 0.012, 1.28], [0.965, 0, 0.012, 1.28]].forEach(([x, y, w, h]) => box(panel, w, h, 0.012, edge, x, y, 0));
  scene.add(panel);

  const sofaM = mat(0x77806d, { roughness: 0.95 });
  const living = new THREE.Group();
  living.position.set(-2.4, 0, 0);
  box(living, 1.5, 0.36, 0.7, sofaM, 0, 0.26, 0);
  box(living, 1.5, 0.52, 0.16, sofaM, 0, 0.66, -0.28);
  blob(living, 0.09, 0.14, 0.34, sofaM, -0.74, 0.5, 0);
  blob(living, 0.09, 0.14, 0.34, sofaM, 0.74, 0.5, 0);
  const coffee = new THREE.Group();
  coffee.position.set(0.05, 0, 0.86);
  cyl(coffee, 0.36, 0.36, 0.03, white, 0, 0.4, 0, 36);
  cyl(coffee, 0.024, 0.04, 0.4, dark, 0, 0.2, 0, 12);
  living.add(coffee);
  const cups = [[-0.12, 0.06], [0.14, -0.06]].map(([x, z]) => {
    const c = cyl(coffee, 0.04, 0.032, 0.075, white, x, 0.452, z, 18);
    c.scale.setScalar(0.001);
    return c;
  });
  contact(living, 2.2, 0.4);
  scene.add(living);
  cyl(living, 0.14, 0.1, 0.28, mat(0x8f5a3d), 1.1, 0.14, -0.2, 18);
  const leafM = mat(0x54704a);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = blob(living, 0.045, 0.24, 0.09, leafM, 1.1 + Math.cos(a) * 0.13, 0.54, -0.2 + Math.sin(a) * 0.13);
    leaf.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
  }

  const person = makePerson({ cloth: 0x3a2d1c, cloth2: 0x221a10, skin: 0x7d5f44, hair: 0x1a0f07, rim: 0xffd890, longHair: true });
  const friend = makePerson({ cloth: 0x3c2318, cloth2: 0x1a1714, skin: 0x6a4c36, hair: 0x0d0a08, rim: 0xffc98a });
  scene.add(person.root, friend.root);
  const friendBook = box(friend.root, 0.2, 0.02, 0.27, mat(0x2c4356), 0, 0.74, 0.3);
  friendBook.rotation.x = 0.8;
  const bars = addBars(scene, new THREE.Vector3(-0.6, 0.2, 0.2), 0xfff0cf, 2.2);
  const dust = addDust(scene, new THREE.Vector3(-0.6, 0, 0.2), 0xffe6b0, 7777);

  const label = (x, t, p, size, color, weight = 400) => { x.font = `${weight} ${size}px Outfit, sans-serif`; x.fillStyle = color; x.fillText(t, ...p); };
  const cream = '#f0ece0', muted = '#b8b09a', gold = '#e2bf6a', red = '#d07a60', track = 'rgba(240,236,224,0.16)';

  function draw(T) {
    const { c, g: x } = pan;
    const W = c.width, H = c.height, u = W / 1100, m = 54 * u;
    x.fillStyle = '#100f0b';
    x.fillRect(0, 0, W, H);
    x.textBaseline = 'top';
    x.textAlign = 'left';
    const big = 66 * u, mid = 48 * u;
    if (T < 1.45) {
      label(x, 'Piețele financiare', [m, m], big, cream, 500);
      drawCandles(x, m, H * 0.26, W - m * 2, H * 0.64, Math.round(kfl(T, [[0, 22], [1.45, 40]])), gold, red);
    } else if (T < 2.72) {
      const r = (a) => smooth(1.45 + a * 0.2, 1.65 + a * 0.2, T);
      label(x, 'Profilul strategiei', [m, m * 0.85], big, cream, 500);
      const cy = H * 0.21, ch = H * 0.36, cx = m + 340 * u, cw = W - m - cx;
      x.globalAlpha = r(0);
      label(x, 'Istoric', [m, cy], mid, muted);
      drawLine(x, cx, cy, cw, ch, 64, gold, 5 * u);
      x.globalAlpha = r(1);
      x.fillStyle = 'rgba(208,122,96,0.3)';
      x.fillRect(cx + cw * 0.72, cy, cw * 0.2, ch);
      x.fillRect(cx + cw * 0.16, cy, cw * 0.1, ch);
      label(x, 'Perioade de', [m, cy + ch * 0.42], mid, red);
      label(x, 'pierdere', [m, cy + ch * 0.42 + mid * 1.1], mid, red);
      const ry = H * 0.65;
      x.globalAlpha = r(2);
      label(x, 'Risc', [m, ry], mid, muted);
      for (let i = 0; i < 8; i++) { x.fillStyle = i < 5 ? gold : track; x.fillRect(cx + i * 76 * u, ry + 10 * u, 66 * u, 30 * u); }
      x.globalAlpha = r(3);
      label(x, 'Costuri', [m, H * 0.82], mid, muted);
      x.fillStyle = track;
      x.fillRect(cx, H * 0.82 + 10 * u, 600 * u, 30 * u);
      x.fillStyle = gold;
      x.fillRect(cx, H * 0.82 + 10 * u, 170 * u, 30 * u);
      x.globalAlpha = 1;
    } else if (T < 3.6) {
      const k = smooth(2.75, 3.0, T), on = smooth(3.0, 3.12, T);
      label(x, 'Copiere', [m, m * 0.85], big, cream, 500);
      label(x, 'Suma alocată', [m, H * 0.3], mid, muted);
      x.fillStyle = track;
      x.fillRect(m, H * 0.42, W - m * 2, 12 * u);
      x.fillStyle = gold;
      x.fillRect(m, H * 0.42, (W - m * 2) * 0.32 * k, 12 * u);
      x.beginPath(); x.arc(m + (W - m * 2) * 0.32 * k, H * 0.42 + 6 * u, 22 * u, 0, Math.PI * 2); x.fill();
      label(x, on > 0.5 ? 'Copiere activă' : 'Copiere inactivă', [m, H * 0.65], mid, on > 0.5 ? gold : muted);
      const tx = W - m - 170 * u, ty = H * 0.63;
      x.fillStyle = on > 0.5 ? gold : track;
      x.beginPath(); x.roundRect(tx, ty, 170 * u, 80 * u, 40 * u); x.fill();
      x.fillStyle = cream;
      x.beginPath(); x.arc(tx + lerp(40, 130, on) * u, ty + 40 * u, 30 * u, 0, Math.PI * 2); x.fill();
    } else if (T < 4.68) {
      const a = smooth(3.72, 3.92, T), b = smooth(4.02, 4.28, T), p = clamp((T - 3.9) / 0.26);
      const bh = H * 0.32, y1 = H * 0.07, y2 = H * 0.61;
      const card = (y, title, text, on) => {
        x.strokeStyle = on ? gold : 'rgba(240,236,224,0.25)';
        x.lineWidth = 3 * u;
        x.strokeRect(m, y, W - m * 2, bh);
        label(x, title, [m + 30 * u, y + 26 * u], mid, on ? cream : muted, 500);
        if (on) label(x, text, [m + 30 * u, y + 112 * u], mid, gold);
      };
      card(y1, 'Contul traderului', 'Tranzacție executată', a > 0.5);
      card(y2, 'Contul tău conectat', 'Tranzacție copiată', b > 0.5);
      const cx = W / 2;
      x.fillStyle = 'rgba(226,191,106,0.4)';
      x.fillRect(cx - 2 * u, y1 + bh, 4 * u, y2 - y1 - bh);
      if (p > 0 && p < 1) {
        x.fillStyle = gold;
        x.beginPath(); x.arc(cx, lerp(y1 + bh, y2, p), 16 * u, 0, Math.PI * 2); x.fill();
      }
    } else {
      label(x, 'Evoluția strategiei', [m, m * 0.85], big, cream, 500);
      drawLine(x, m, H * 0.2, W - m * 2, H * 0.44, Math.round(kfl(T, [[4.68, 46], [5.1, 60]])), gold, 5 * u);
      label(x, 'Expunerea contului', [m, H * 0.7], mid, muted);
      x.fillStyle = track;
      x.fillRect(m, H * 0.82, W - m * 2, 28 * u);
      x.fillStyle = red;
      x.fillRect(m, H * 0.82, (W - m * 2) * 0.38, 28 * u);
    }
    pan.t.needsUpdate = true;
  }
  const offDesk = new THREE.Vector3(-0.42, 0.765, 0.46);
  function update(T, time) {
    const show = Math.max(0.001, smooth(0.55, 0.95, T));
    const home = Math.max(0.001, smooth(2.9, 3.3, T) * (1 - smooth(5.3, 5.5, T)));
    living.scale.setScalar(home);
    friend.root.scale.setScalar(home);
    props.scale.setScalar(show);
    phone.visible = T > 0.8;
    const hold = kf(T, [[2.66, 0], [2.78, 1], [3.02, 1], [3.14, 0]]);
    if (hold > 0.5 && phone.parent !== person.armR.hand) {
      person.armR.hand.add(phone);
      phone.position.set(0, -0.08, 0.05);
      phone.rotation.set(-1.25, 0, 0);
    } else if (hold <= 0.5 && phone.parent !== scene) {
      scene.add(phone);
      phone.position.copy(offDesk);
      phone.rotation.set(0, 0.3, 0);
    }
    phoneScreen.color.setHex(hold > 0.5 || (T > 4.02 && T < 4.55) ? 0xe2bf6a : 0x5f4c22);
    cups.forEach((c, i) => c.scale.setScalar(Math.max(0.001, smooth(3.3 + i * 0.1, 3.5 + i * 0.1, T))));
    const away = kf(T, [[3.2, 0], [3.55, 1], [4.62, 1], [4.86, 0]]);
    panel.position.set(lerp(-0.42, -2.58, away), lerp(1.68, 1.78, away), lerp(1.75, -1.0, away));
    panel.scale.setScalar(show * lerp(0.8, 0.72, away));
    panel.rotation.y = lerp(Math.PI, Math.PI * 2, away);
    bars.update(T, time);
    dust.update(T, time);
    const walk = clamp(smooth(3.2, 3.26, T) * (1 - smooth(3.48, 3.56, T)) + smooth(4.68, 4.72, T) * (1 - smooth(4.84, 4.9, T)) + smooth(5.6, 5.68, T) * (1 - smooth(5.92, 6, T)));
    const pose = poseAt(T, [[0, 'look'], [2.64, 'look'], [2.78, 'phone'], [3.02, 'phone'], [3.16, 'stand'], [3.48, 'stand'], [3.62, 'sofa'], [4.6, 'sofa'], [4.7, 'stand'], [4.84, 'stand'], [4.96, 'look'], [5.42, 'look'], [5.62, 'stand']]);
    const scan = (1 - smooth(5.4, 5.6, T)) * smooth(0.5, 0.9, T) * (1 - smooth(3.1, 3.2, T) + smooth(4.9, 5, T));
    return { pose, walk, away, scan };
  }
  return { scene, person, friend, friendBook, draw, update };
})();

/* ---------- SALA comună ---------- */
let invalidate = () => {};
const Hall = (() => {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffe6c0, 0x120d07, 0.32));
  const key = new THREE.DirectionalLight(0xffe3b4, 0.8);
  key.position.set(0.5, 3.5, 5);
  const back = new THREE.DirectionalLight(0xffc979, 2.4);
  back.position.set(-1.5, 3, -2);
  const spot = new THREE.PointLight(0xffc979, 14, 9, 1.6);
  spot.position.set(0, 3.4, -1);
  scene.add(key, back, spot);
  addGround(scene, 0x8a6e2f, 0.45, 12);

  const scr = canvasTex(1024, 440);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.4), new THREE.MeshBasicMaterial({ map: scr.t, toneMapped: false }));
  screen.position.set(0, 2.62, -4.1);
  scene.add(screen);
  function paint() {
    const { c, g: x } = scr;
    x.fillStyle = '#0d0c0a';
    x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#8a6e2f';
    x.lineWidth = 3;
    x.strokeRect(16, 16, c.width - 32, c.height - 32);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#f0ece0';
    x.font = 'italic 500 104px "Cormorant Garamond", serif';
    x.fillText('Dincolo de aparențe', c.width / 2, c.height * 0.5);
    scr.t.needsUpdate = true;
  }
  paint();
  if (document.fonts) document.fonts.ready.then(() => { paint(); invalidate(); });
  box(scene, 7.4, 0.3, 1.4, mat(0x241d12), 0, 0.15, -3.5);
  box(scene, 7.4, 0.015, 0.015, glow(GOLD, 1.2), 0, 0.31, -2.8);

  const chairM = mat(0x241f17), crowdM = mat(0x4f483c, { roughness: 0.9 }), headM = mat(0x75695a, { roughness: 0.8 });
  const rows = [-1.7, -0.9, -0.1];
  const xs = [];
  for (let i = 0; i < 6; i++) xs.push(0.46 + i * 0.86, -0.46 - i * 0.86);
  const count = rows.length * xs.length;
  const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.05, 0.44), chairM, count);
  const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.04), chairM, count);
  const M = new THREE.Matrix4();
  const people = [];
  let k = 0;
  rows.forEach((z, r) => xs.forEach((x, i) => {
    seats.setMatrixAt(k, M.makeTranslation(x, 0.45, z));
    backs.setMatrixAt(k, M.makeTranslation(x, 0.7, z + 0.2));
    k++;
    if ((i * 3 + r * 5) % 7 !== 0 && (lowEnd ? (i + r) % 3 : (i + r) % 2) === 0) people.push([x, z]);
  }));
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.16, 0.3, 3, 10), crowdM, people.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 14, 12), headM, people.length);
  people.forEach(([x, z], i) => {
    bodies.setMatrixAt(i, M.makeTranslation(x, 0.8, z + 0.02));
    heads.setMatrixAt(i, M.makeTranslation(x, 1.25, z));
  });
  [seats, backs, bodies, heads].forEach((m) => { m.frustumCulled = false; });
  scene.add(seats, backs, bodies, heads);
  contact(scene, 2.6, 0.5).position.set(0, 0.006, 1.5);
  const bars = addBars(scene, new THREE.Vector3(0, -0.2, -1.6), 0xe2bf6a, 5.1);
  const dust = addDust(scene, new THREE.Vector3(0, 0, 0.4), 0xe2bf6a, 991);
  return { scene, screen, update(T, time) { bars.update(T, time); dust.update(T, time); } };
})();

/* ---------- camere: [T, az, el, dist, tx, ty, tz, sx, sy] ---------- */
const CAM_A = [
  [0, -1.28, 0.02, 3.0, 0, 1.2, 0.04, 0.3, -0.22],
  [0.5, -2.2, 0.06, 2.1, 0, 1.18, 0.1, 0.2, -0.08],
  [1, -2.65, 0.1, 2.85, 0.14, 1.22, 0.55, 0.05, 0.28],
  [1.5, -1.6, 0.1, 2.85, 0.05, 1.05, 0.25, 0.22, 0.08],
  [2, -1.0, 0.22, 2.95, 0.08, 1.0, 0.3, 0.3, 0.02],
  [2.5, -0.78, 0.06, 3.2, 0.12, 1.08, 0.1, 0.3, 0.02],
  [3, -1.1, -0.08, 3.6, 0.12, 1.32, 0.1, 0.3, 0.02],
  [3.5, -1.7, 0.1, 3.1, 0.1, 1.08, 0.25, 0.28, 0.02],
  [4, -2.72, 0.12, 3.05, 0.14, 1.2, 0.55, 0.24, 0.02],
  [4.5, -2.3, 0.14, 3.0, 0.1, 1.12, 0.45, 0.24, 0.02],
  [5, -1.0, 0.45, 2.8, 0.1, 0.9, 0.3, 0, 0.26],
  [5.45, -0.9, 0.1, 3.2, 0, 1.05, 0.1, 0, 0.26],
  [6, -0.6, 0.06, 3.4, 0, 1.2, 1.2, 0, 0.26]
];
const CAM_B = [
  [0, 1.28, 0.02, 3.0, 0, 1.2, 0.04, -0.3, -0.22],
  [0.5, 2.2, 0.06, 2.1, 0, 1.18, 0.1, -0.2, -0.08],
  [1, 3.5, 0.08, 3.2, -0.2, 1.34, 0.75, 0, 0.28],
  [1.5, 3.05, 0.1, 3.4, -0.25, 1.28, 0.6, 0, 0.1],
  [2, 3.5, 0.06, 3.5, -0.32, 1.46, 0.85, 0.02, 0.1],
  [2.55, 3.34, 0.08, 3.4, -0.3, 1.42, 0.8, 0.02, 0.1],
  [2.8, 1.1, 0.1, 2.15, 0.02, 1.05, 0.08, -0.28, 0.02],
  [3.15, 0.8, 0.12, 2.75, -0.1, 1.05, 0.05, -0.28, 0.02],
  [3.55, 0.1, 0.08, 4.3, -1.55, 1.1, 0.05, -0.26, 0.0],
  [4, 0.2, 0.07, 4.9, -2.3, 1.32, -0.1, -0.3, 0.02],
  [4.55, 0.4, 0.08, 4.8, -2.3, 1.3, -0.1, -0.3, 0.02],
  [4.82, 1.2, 0.1, 3.4, -0.7, 1.1, 0.1, -0.2, 0.1],
  [5, 3.45, 0.06, 3.4, -0.3, 1.42, 0.8, 0, 0.26],
  [5.45, 0.9, 0.1, 3.2, 0, 1.05, 0.1, 0, 0.26],
  [6, 0.6, 0.06, 3.4, 0, 1.2, 1.2, 0, 0.26]
];
const CAM_HALL = [
  [5.45, 0.25, 0.05, 7.4, 0, 1.3, 1.2, 0, 0.26],
  [6, 0.05, 0.05, 6.7, 0, 1.3, 1.4, 0, 0.13],
  [6.5, -0.14, 0.06, 6.2, 0, 1.3, 1.4, 0, 0.13],
  [7, 0.05, 0.05, 5.6, 0, 1.42, 1.4, 0, 0.02]
];
const camA = new THREE.PerspectiveCamera(33, 1, 0.1, 60);
const camB = new THREE.PerspectiveCamera(33, 1, 0.1, 60);
const camH = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

function sampleCam(table, T) {
  if (T <= table[0][0]) return table[0];
  for (let i = 0; i < table.length - 1; i++) {
    if (T <= table[i + 1][0]) {
      const u = smooth(table[i][0], table[i + 1][0], T);
      return table[i].map((v, k) => lerp(v, table[i + 1][k], u));
    }
  }
  return table[table.length - 1];
}
function placeCam(cam, s, rectAspect, distScale, shiftScale = 1, driftAz = 0) {
  cam.aspect = rectAspect;
  cam.updateProjectionMatrix();
  const az = s[1] + driftAz, el = s[2], d = s[3] * distScale;
  cam.position.set(s[4] + Math.sin(az) * Math.cos(el) * d, s[5] + Math.sin(el) * d, s[6] + Math.cos(az) * Math.cos(el) * d);
  cam.lookAt(s[4], s[5], s[6]);
  cam.projectionMatrix.elements[8] = -s[7] * shiftScale;
  cam.projectionMatrix.elements[9] = -s[8];
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}

/* ---------- încadrare ---------- */
let W = 1, H = 1, portrait = false, navPx = 72, barPx = 0;
const barEl = document.querySelector('.book-bar');
const navEl = document.querySelector('.nav');
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  W = w; H = h;
  portrait = w < 900 || w / h < 1;
  root.classList.toggle('stack', portrait);
  navPx = navEl.offsetHeight;
  barPx = barEl && getComputedStyle(barEl).display !== 'none' ? barEl.offsetHeight : 0;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  computeAnchors();
  invalidate();
}

/* ---------- legarea de scroll ---------- */
const beats = [...document.querySelectorAll('.beat')];
const heroEl = document.getElementById('hero');
const finalEl = document.getElementById('final');
const heroCopy = document.getElementById('hero-copy');
const rubrics = [...document.querySelectorAll('.rubric')];
const HOLDS = rubrics.map((r) => +r.dataset.hold);
const rail = document.getElementById('rail');
const railFill = rail.firstElementChild;
const railDots = [...rail.querySelectorAll('i')];
const seam = document.getElementById('seam');
const bdA = document.getElementById('bd-a'), bdB = document.getElementById('bd-b'), bdH = document.getElementById('bd-h');
const dusk = document.getElementById('bd-dusk'), nightL = document.getElementById('bd-night'), dawn = document.getElementById('bd-dawn');
const scrim = document.getElementById('scrim');
let anchors = [], boxes = [], holds = [], vh = 1, heroBottom = 0;
const covered = () => { const y = window.scrollY; return holds.some((h) => y >= h.top && y + vh <= h.bottom); };
function computeAnchors() {
  vh = window.innerHeight;
  const sc = window.scrollY;
  heroBottom = heroCopy.getBoundingClientRect().bottom + sc;
  const pts = [[0, 0]];
  holds = [];
  boxes = [];
  [...beats, ...rubrics].map((el) => {
    const r = el.getBoundingClientRect();
    return { el, top: r.top + sc, h: r.height };
  }).sort((a, b) => a.top - b.top).forEach((it) => {
    if (it.el.dataset.beat) {
      pts.push([it.top + (it.h - vh) / 2, +it.el.dataset.beat]);
      boxes.push({ top: it.top, h: it.h, text: it.el.querySelector('.beat-text') });
    } else {
      /* scena se oprește cât timp rubrica e pe ecran */
      const T = +it.el.dataset.hold;
      pts.push([it.top - vh * 0.55, T], [it.top + it.h - vh * 0.45, T]);
      holds.push({ top: it.top, bottom: it.top + it.h });
    }
  });
  pts.push([finalEl.getBoundingClientRect().top + sc - vh * 0.05, 7]);
  anchors = pts;
}
function targetT() {
  const y = window.scrollY;
  if (y <= anchors[0][0]) return anchors[0][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    if (y <= anchors[i + 1][0]) return lerp(anchors[i][1], anchors[i + 1][1], clamp((y - anchors[i][0]) / (anchors[i + 1][0] - anchors[i][0])));
  }
  return anchors[anchors.length - 1][1];
}
const written = new WeakMap();
function put(el, prop, value) {
  let m = written.get(el);
  if (!m) { m = {}; written.set(el, m); }
  if (m[prop] === value) return;
  m[prop] = value;
  el.style[prop] = value;
}
function updateOverlay(goal) {
  const y = window.scrollY, still = reduced.matches;
  boxes.forEach((b) => {
    if (b.top - y > vh + 60 || b.top + b.h - y < -60) return;
    const end = b.top + b.h - vh;
    const o = smooth(b.top - vh * 0.42, b.top - vh * 0.06, y) * (1 - smooth(end + vh * 0.02, end + vh * 0.3, y));
    const t = b.text;
    put(t, 'opacity', o.toFixed(2));
    put(t, 'visibility', o < 0.01 ? 'hidden' : 'visible');
    if (!still) put(t, 'transform', `translate3d(0, ${lerp(20, -20, clamp((y - b.top + vh * 0.42) / (b.h - vh + vh * 0.72))).toFixed(1)}px, 0)`);
  });
  put(rail, 'opacity', (smooth(0.35, 0.7, goal) * (1 - smooth(6.32, 6.5, goal))).toFixed(2));
  const fill = kfl(goal, [[0, 0], [HOLDS[0], 0.25], [HOLDS[1], 0.5], [HOLDS[2], 0.75], [HOLDS[3], 1]]);
  put(railFill, 'transform', `scaleX(${fill.toFixed(4)})`);
  railDots.forEach((d, i) => d.classList.toggle('on', goal >= HOLDS[i] - 0.01));
}

/* ---------- starea scenei ---------- */
let keyA = -1, keyB = -1, flip = false, lastRedraw = 0;
function panelKey(T) {
  if (T < 1.45) return 1000 + Math.round(kfl(T, [[0, 22], [1.45, 40]]));
  if (T < 2.4) return 2000 + Math.round(T * 50);
  if (T < 2.72) return 3000;
  if (T < 3.2) return 4000 + Math.round(T * 50);
  if (T < 3.6) return 5000;
  if (T < 4.35) return 6000 + Math.round(T * 50);
  if (T < 4.68) return 7000;
  if (T < 5.15) return 8000 + Math.round(T * 50);
  return 9000;
}
function redraw(T, both) {
  const now = performance.now();
  if (!both && now - lastRedraw < 90) return;
  lastRedraw = now;
  flip = !flip;
  if (both || flip) {
    const k = A.candlesAt(T) * 100 + Math.round(smooth(3.7, 4.05, T) * 8);
    if (k !== keyA) { A.draw(T); keyA = k; }
  }
  if (both || !flip) {
    const k = panelKey(T);
    if (k !== keyB) { B.draw(T); keyB = k; }
  }
}

const SOFA = { x: -2.04, z: 0.06 };
function render(T, time, both) {
  const wipe = smooth(5.45, 5.92, T);
  const a = A.update(T, time);
  const b = B.update(T, time);
  redraw(T, both);
  Hall.update(T, time);

  const inHall = T >= 5.74;
  const hallWalk = smooth(5.74, 6, T);
  const out = smooth(5.62, 5.8, T);
  const back = lerp(0, -0.55, smooth(5.42, 5.6, T));

  /* A */
  if (inHall) {
    if (A.person.root.parent !== Hall.scene) Hall.scene.add(A.person.root);
    A.person.root.position.set(lerp(-2.6, -0.42, hallWalk), 0, lerp(2.3, 1.5, hallWalk));
    A.person.root.rotation.y = lerp(1.4, 0.52, hallWalk);
  } else {
    if (A.person.root.parent !== A.scene) A.scene.add(A.person.root);
    A.person.root.position.set(lerp(0, 0.15, out), 0, back + out * 2.2);
    A.person.root.rotation.y = lerp(0, 0.1, out);
  }
  applyPose(A.person, a.pose, a.walk, reduced.matches ? T * 60 : time * 7.5, Math.sin(time * 1.6));
  A.person.armR.elbow.rotation.x += a.quill;
  A.person.head.rotation.y += Math.sin(T * 5 + time * 0.5) * 0.14 * a.scan;

  /* B */
  if (inHall) {
    if (B.person.root.parent !== Hall.scene) Hall.scene.add(B.person.root);
    B.person.root.position.set(lerp(2.6, 0.42, hallWalk), 0, lerp(2.3, 1.5, hallWalk));
    B.person.root.rotation.y = lerp(-1.4, -0.52, hallWalk);
  } else {
    if (B.person.root.parent !== B.scene) B.scene.add(B.person.root);
    B.person.root.position.set(lerp(0, SOFA.x, b.away) - out * 0.15, 0, lerp(back, SOFA.z, b.away) + out * 2.2);
    let r = 0;
    r = lerp(r, -1.75, kf(T, [[3.14, 0], [3.24, 1], [3.48, 1], [3.58, 0]]));
    r = lerp(r, 0.32, kf(T, [[3.5, 0], [3.6, 1], [4.6, 1], [4.68, 0]]));
    r = lerp(r, 1.45, kf(T, [[4.64, 0], [4.72, 1], [4.84, 1], [4.92, 0]]));
    B.person.root.rotation.y = r - out * 0.1;
  }
  applyPose(B.person, b.pose, b.walk, reduced.matches ? T * 60 : time * 7.5 + 1.3, Math.sin(time * 1.5 + 1));
  B.person.head.rotation.y += Math.sin(T * 4.4 + 1 + time * 0.45) * 0.14 * b.scan;

  B.friend.root.position.set(-2.76, 0, 0.06);
  B.friend.root.rotation.y = -0.1 - 0.22 * smooth(3.5, 3.72, T);
  const fp = poseAt(T, [[0, 'read'], [3.5, 'read'], [3.72, 'sofa']]);
  applyPose(B.friend, { ...fp, hy: -0.42 * smooth(3.5, 3.72, T) }, 0, 0, Math.sin(time * 1.3 + 2));
  B.friendBook.visible = T < 3.6;

  /* cele două ferestre și deschiderea către sală */
  const drift = reduced.matches ? 0 : Math.sin(time * 0.22) * 0.035;
  const halfW = W / 2;
  let rA, rB;
  if (portrait) {
    const mid = (navPx + (H - barPx)) / 2;
    rA = { x: 0, y: navPx, w: W, h: mid - navPx };
    rB = { x: 0, y: mid, w: W, h: H - barPx - mid };
  } else {
    rA = { x: 0, y: 0, w: halfW, h: H };
    rB = { x: halfW, y: 0, w: halfW, h: H };
  }
  const sA = sampleCam(CAM_A, T).slice(), sB = sampleCam(CAM_B, T).slice();
  const open = 1 - smooth(0.05, 0.7, T);
  if (portrait && open > 0) {
    const top = heroBottom + 4, band = Math.max(H - barPx - 4 - top, 70);
    const mix = (r, hx) => ({ x: lerp(r.x, hx, open), y: lerp(r.y, top, open), w: lerp(r.w, W / 2, open), h: lerp(r.h, band, open) });
    rA = mix(rA, 0);
    rB = mix(rB, W / 2);
    sA[3] = lerp(sA[3], 1.5, open); sA[7] = lerp(sA[7], 0.22, open); sA[8] = lerp(sA[8], -0.42, open);
    sB[3] = lerp(sB[3], 1.5, open); sB[7] = lerp(sB[7], -0.22, open); sB[8] = lerp(sB[8], -0.42, open);
  } else if (open > 0) {
    const ppu = H / (2 * Math.tan(THREE.MathUtils.degToRad(16.5)) * sA[3]);
    const sy = (H / 2 - (Math.max(heroBottom + 10, H * 0.42) + 0.3 * ppu)) / (H / 2);
    sA[8] = lerp(sA[8], sy, open);
    sB[8] = lerp(sB[8], sy, open);
  }
  placeCam(camA, sA, rA.w / rA.h, portrait ? 1.02 : 1, portrait ? 0.8 : 1, drift);
  placeCam(camB, sB, rB.w / rB.h, portrait ? 1.02 : 1, portrait ? 0.8 : 1, drift);

  renderer.setScissor(0, 0, W, H);
  renderer.clear();
  const draw = (scene, cam, r) => {
    const x = Math.round(r.x), y = Math.round(H - r.y - r.h), w = Math.round(r.w), h = Math.round(r.h);
    renderer.setViewport(x, y, w, h);
    const sx = Math.max(0, x), sy = Math.max(0, y);
    renderer.setScissor(sx, sy, Math.max(0, Math.min(x + w, W) - sx), Math.max(0, Math.min(y + h, H) - sy));
    renderer.clearDepth();
    renderer.render(scene, cam);
  };
  if (wipe < 0.999) {
    const sh = portrait ? { x: 0, y: wipe * rA.h } : { x: wipe * halfW, y: 0 };
    draw(A.scene, camA, { x: rA.x - sh.x, y: rA.y - sh.y, w: rA.w, h: rA.h });
    draw(B.scene, camB, { x: rB.x + sh.x, y: rB.y + sh.y, w: rB.w, h: rB.h });
  }
  if (wipe > 0.001) {
    Hall.screen.scale.setScalar(portrait ? 0.56 : 1);
    placeCam(camH, sampleCam(CAM_HALL, T), W / H, portrait ? 1.5 : 1, 1, drift * 0.6);
    /* sala se deschide din linia dintre cele două lumi */
    const cw = portrait ? W : wipe * W, ch = portrait ? wipe * H : H;
    renderer.setViewport(0, 0, W, H);
    renderer.setScissor(Math.round((W - cw) / 2), Math.round((H - ch) / 2), Math.round(cw), Math.round(ch));
    renderer.clearDepth();
    renderer.render(Hall.scene, camH);
  }

  /* fundaluri CSS, sincronizate cu scena */
  const night = kf(T, [[2.4, 0], [2.9, 1], [3.4, 1], [3.75, 0]]);
  put(dusk, 'opacity', (1 - smooth(2.4, 2.9, T)).toFixed(2));
  put(nightL, 'opacity', night.toFixed(2));
  put(dawn, 'opacity', smooth(3.45, 3.85, T).toFixed(2));
  if (portrait) {
    put(bdA, 'transform', `translate3d(0, ${(-wipe * 100).toFixed(2)}%, 0)`);
    put(bdB, 'transform', `translate3d(0, ${(wipe * 100).toFixed(2)}%, 0)`);
    put(bdH, 'clipPath', `inset(${((1 - wipe) * 50).toFixed(2)}% 0)`);
  } else {
    put(bdA, 'transform', `translate3d(${(-wipe * 100).toFixed(2)}%, 0, 0)`);
    put(bdB, 'transform', `translate3d(${(wipe * 100).toFixed(2)}%, 0, 0)`);
    put(bdH, 'clipPath', `inset(0 ${((1 - wipe) * 50).toFixed(2)}%)`);
  }
  put(seam, 'opacity', (smooth(0.55, 0.95, T) * (1 - wipe)).toFixed(2));
  const endScrim = portrait ? smooth(5.9, 6, T) : smooth(5.9, 6, T) * (1 - smooth(6.45, 6.6, T));
  put(scrim, 'opacity', clamp(smooth(0.75, 1, T) * (1 - smooth(1.2, 1.5, T)) + smooth(3.7, 3.9, T) * (1 - smooth(4.35, 4.55, T)) * 0.42 + smooth(4.6, 4.9, T) * (1 - smooth(5.92, 6.3, T)) * 0.7 + endScrim).toFixed(2));
}

/* ---------- buclă ---------- */
let curT = 0, dirty = true, running = false, visible = true, lastTime = 0, slowSum = 0, slowCount = 0, settleUntil = performance.now() + 1500, clockT = 0;
/* la fiecare cadru; o dată din două doar ca ultimă soluție, după ce rezoluția a coborât la minim */
let idleStride = 1, idleCount = 0, goodRuns = 0, raisedAt = -1e9, canRaise = true;
const animated = () => !reduced.matches && !lowEnd;
invalidate = () => { dirty = true; kick(); };
function kick() { if (!running && visible) { running = true; lastTime = performance.now(); requestAnimationFrame(tick); } }

function setScale(v) {
  if (v === dpr) return;
  dpr = v;
  renderer.setPixelRatio(v);
  renderer.setSize(W, H, false);
  dirty = true;
  settleUntil = performance.now() + 200;
}
function tick(now) {
  const raw = now - lastTime;
  lastTime = now;
  if (animated()) clockT += Math.min(raw, 100) / 1000;
  const goal = targetT();
  updateOverlay(goal);
  const target = reduced.matches ? Math.round(goal) : goal;
  const before = curT;
  if (reduced.matches) curT = target;
  else {
    curT += (target - curT) * (1 - Math.exp(-Math.min(raw / 1000, 0.1) * 6));
    if (Math.abs(target - curT) < 0.0005) curT = target;
  }
  const moved = before !== curT;
  const moving = Math.abs(target - curT) > 0.003;
  idleCount++;
  if (dirty || moved || (animated() && idleCount % idleStride === 0 && !covered())) {
    render(curT, clockT, dirty || curT === target);
    dirty = false;
  }
  /* sub ~52 de cadre pe secundă coboară rezoluția; după 8 s bune urcă înapoi, dar renunță dacă urcarea nu ține */
  if (now < settleUntil) { slowSum = 0; slowCount = 0; }
  else if (raw < 1000 && (moving || (animated() && !covered()))) {
    slowSum += raw;
    if (++slowCount === 60 || slowSum > 1000) {
      const avg = slowSum / slowCount;
      if (avg > 19) {
        goodRuns = 0;
        if (now - raisedAt < 4000) canRaise = false;
        if (dpr > minDpr) setScale(Math.max(minDpr, dpr * 0.85));
        else idleStride = 2;
      } else if (avg < 17.6 && canRaise && (dpr < topDpr || idleStride > 1)) {
        if (++goodRuns >= 8) {
          goodRuns = 0;
          raisedAt = now;
          if (idleStride > 1) idleStride = 1;
          else setScale(Math.min(topDpr, dpr / 0.85));
        }
      } else goodRuns = 0;
      slowSum = 0;
      slowCount = 0;
    }
  }
  if (visible && (animated() || curT !== target)) requestAnimationFrame(tick);
  else running = false;
}

const seen = new Set();
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
  visible = seen.size > 0;
  stage.style.visibility = visible ? 'visible' : 'hidden';
  if (visible) invalidate();
});
[heroEl, ...beats, ...rubrics, finalEl].forEach((n) => io.observe(n));
const reveal = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); reveal.unobserve(e.target); } });
}, { rootMargin: '0px 0px -18% 0px' });
rubrics.forEach((r) => reveal.observe(r));

window.addEventListener('scroll', kick, { passive: true });
let lastW = 0, lastH = 0;
new ResizeObserver(() => {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (w === lastW && Math.abs(h - lastH) < 120) { computeAnchors(); invalidate(); return; }
  lastW = w; lastH = h;
  resize();
}).observe(stage);
reduced.addEventListener('change', invalidate);
if (document.fonts) document.fonts.ready.then(() => { computeAnchors(); keyB = -1; invalidate(); });
window.addEventListener('load', () => { computeAnchors(); invalidate(); });

lastW = stage.clientWidth; lastH = stage.clientHeight;
resize();
curT = reduced.matches ? Math.round(targetT()) : targetT();
updateOverlay(targetT());
render(curT, 0, true);
invalidate();
