import * as THREE from '../dda/vendor/three.module.min.js';

/* Galeria pieței: un grafic de lumânări din aur lustruit și oțel negru, pe o pardoseală-oglindă.
   Camera îl urmează de la prima lumânare până la emblemă; fiecare secțiune are piesa ei. */
const root = document.documentElement;
const canvas = document.getElementById('home-scene');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const small = window.innerWidth < 760;
const lite = lowEnd || small;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  root.classList.remove('home3d');
  throw e;
}
root.classList.add('scene2');
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); root.classList.remove('home3d'); });
canvas.addEventListener('webglcontextrestored', () => { root.classList.add('home3d'); dirty = true; kick(); });

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
let seed = 20261;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

const nativeDpr = window.devicePixelRatio || 1;
/* o singură rezoluție, fără comutări la scroll; coboară doar dacă GPU-ul nu ține pasul */
const topDpr = Math.max(1, Math.min(nativeDpr, lowEnd ? 1.25 : 1.5));
const minDpr = 0.8;
let dpr = topDpr;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, 1, 0.3, 1200);
const uniforms = {
  uTime: { value: 0 },
  uGlow: { value: 0 },
  uCam: { value: new THREE.Vector3() },
  uPx: { value: 1 }
};
const FOG_D = 0.0062;
const FOG_C = new THREE.Color(0.0105, 0.0088, 0.0072);
scene.fog = new THREE.FogExp2(FOG_C, FOG_D);
const FOG_GLSL = `float pdSee(float d){ return exp(-d * d * ${(FOG_D * FOG_D).toFixed(8)}); }`;
const GOLD_GLSL = 'vec3(1.0, 0.68, 0.26)';

/* traseul camerei: câte două chei pe secțiune — poziție, țintă, înclinare, lumina din zare */
const KEYS = [
  [2.2, 4.6, 22, 10.5, 6.4, -14, -0.02, 0],
  [1.6, 5.4, 12, 10.2, 7.6, -26, 0.01, 0],
  [3.4, 6.2, -16, 9.0, 8.8, -66, 0.02, 0.03],
  [1.5, 7.6, -40, 4.0, 9.5, -92, -0.02, 0.06],
  [-3, 8.6, -56, -3.0, 10.4, -100, 0.015, 0.1],
  [-3, 17.4, -124, -10, 18.6, -176, -0.02, 0.2],
  [3.5, 22, -150, -13, 18, -180, 0.02, 0.28],
  [7.5, 17, -160, -12, 18, -186, -0.02, 0.34],
  [6, 23, -192, -5, 5, -232, 0.02, 0.42],
  [7, 13, -204, -5, 7, -232, -0.02, 0.5],
  [1, 27, -236, 0.5, 14, -320, 0.02, 0.6],
  [-0.5, 10, -262, 2.5, 15, -330, -0.01, 0.7],
  [0.5, 12.5, -274, 0, 17, -372, 0.01, 0.8],
  [0, 15, -286, 0, 18.5, -372, 0, 0.88],
  [0, 17, -298, 0, 19, -372, 0, 0.96],
  [0, 18.5, -308, 0, 19, -372, 0, 1]
];
const lastKey = KEYS.length - 1;
const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => V3(k[0], k[1], k[2])), false, 'centripetal');
const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => V3(k[3], k[4], k[5])), false, 'centripetal');
const camSamples = posCurve.getPoints(240);
const pathGap = (x, z) => Math.sqrt(camSamples.reduce((m, p) => Math.min(m, (p.x - x) ** 2 + (p.z - z) ** 2), 1e9));

/* ---------- lumina de studio în care se oglindește metalul ---------- */
scene.environment = (() => {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD;
      void main(){ float h = normalize(vD).y;
        vec3 c = mix(vec3(0.03, 0.02, 0.01), vec3(0.006, 0.006, 0.008), smoothstep(0.0, 0.45, abs(h)));
        c = mix(c, vec3(0.002), smoothstep(-0.02, -0.4, h));
        gl_FragColor = vec4(c, 1.0); }`
  })));
  /* panouri luminoase așezate după direcție: azimut 0 = înainte, pe traseu */
  const panel = (az, el, w, h, r, g, b) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: THREE.DoubleSide }));
    const a = az * Math.PI / 180, e = el * Math.PI / 180;
    m.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).multiplyScalar(60);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  /* benzi verticale de jur împrejur: oricum s-ar roti o față, prinde o dungă de lumină */
  [[-168, 4, 5], [-141, 7, 2.4], [-118, 3, 6], [-96, 5, 3], [-74, 2.4, 7], [-52, 6, 4], [-33, 3, 8], [-19, 8, 3], [-6, 2.2, 6.5], [8, 5, 4.5],
    [24, 3, 7.5], [41, 6, 3], [60, 2.6, 6], [82, 5, 3.4], [104, 3, 6.5], [127, 7, 2.6], [150, 3.4, 7], [172, 5, 4]].forEach(([az, w, k]) => panel(az, 8, w, 62, k, k * 0.88, k * 0.66));
  panel(100, 30, 3, 30, 1.3, 1.6, 2.2);
  panel(-88, 34, 3, 28, 1.1, 1.4, 1.9);
  [[0, 58], [90, 62], [180, 58], [-90, 62]].forEach(([az, el]) => panel(az, el, 40, 5, 4.4, 3.9, 3.0));
  panel(0, 89, 10, 10, 3.2, 2.9, 2.4);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.012, 0.1, 100).texture;
  pm.dispose();
  return tex;
})();
scene.environmentIntensity = 0.5;

/* ---------- materiale ---------- */
/* box: cutie cu muchii rotunjite, cu raza constantă indiferent de proporții; mirror: copia din pardoseală */
function pbr(params, opts = {}) {
  const m = new THREE.MeshStandardMaterial(params);
  m.userData.params = params;
  m.userData.opts = opts;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBevel = { value: opts.bevel || 0.07 };
    sh.uniforms.uPillow = { value: opts.pillow === undefined ? 0.3 : opts.pillow };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying float vWY;${opts.box ? '\nattribute vec3 aSize; uniform float uBevel; uniform float uPillow;' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 pdW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          pdW = instanceMatrix * pdW;
        #endif
        vWY = (modelMatrix * pdW).y;`);
    /* fețele sunt ușor bombate, ca la un lingou: reflexia alunecă pe ele în loc să fie un ton plat */
    if (opts.box) sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `
      vec3 pdIn = clamp(position, -0.25, 0.25);
      vec3 objectNormal = normalize(normal + pdIn * uPillow);`).replace('#include <begin_vertex>', `
      float pdB = min(uBevel, 0.5 * min(aSize.x, min(aSize.y, aSize.z)));
      vec3 transformed = pdIn * 4.0 * (aSize * 0.5 - pdB) + (position - pdIn) * (pdB * 4.0);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY;');
    if (opts.mirror) sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb *= 0.8 * exp(vWY * 0.1);\n#include <fog_fragment>');
  };
  m.customProgramCacheKey = () => `pd${opts.box ? 'B' : 'n'}${opts.mirror ? 'M' : 'n'}`;
  return m;
}
const mirrorMats = new Map();
function mirrorOf(mat) {
  if (!mirrorMats.has(mat)) mirrorMats.set(mat, pbr(mat.userData.params, { ...mat.userData.opts, mirror: true }));
  return mirrorMats.get(mat);
}
const goldColor = new THREE.Color().setRGB(1.0, 0.62, 0.2);
const steelColor = new THREE.Color().setRGB(0.034, 0.034, 0.04);
const goldBox = pbr({ color: goldColor, metalness: 1, roughness: 0.2 }, { box: true });
const steelBox = pbr({ color: steelColor, metalness: 1, roughness: 0.26 }, { box: true });
const bronzeBox = pbr({ color: new THREE.Color().setRGB(0.2, 0.115, 0.04), metalness: 1, roughness: 0.38 }, { box: true });
const goldMat = pbr({ color: goldColor, metalness: 1, roughness: 0.22 });
const steelMat = pbr({ color: steelColor, metalness: 1, roughness: 0.3 });
const gemMat = pbr({ color: goldColor, metalness: 1, roughness: 0.12, flatShading: true });

/* cutie-unitate cu muchiile rotunjite în două trepte */
const unitBox = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1, 6, 6, 6);
  const P = g.attributes.position, N = g.attributes.normal;
  const snap = (v) => { const a = Math.abs(v); return Math.sign(v) * (a < 0.05 ? 0 : a < 0.25 ? 0.25 : a < 0.4 ? 0.375 : 0.5); };
  const v = V3(0, 0, 0), c = V3(0, 0, 0);
  for (let i = 0; i < P.count; i++) {
    v.set(snap(P.getX(i)), snap(P.getY(i)), snap(P.getZ(i)));
    c.set(clamp(v.x, -0.25, 0.25), clamp(v.y, -0.25, 0.25), clamp(v.z, -0.25, 0.25));
    v.sub(c).normalize();
    N.setXYZ(i, v.x, v.y, v.z);
    P.setXYZ(i, c.x + v.x * 0.25, c.y + v.y * 0.25, c.z + v.z * 0.25);
  }
  return g;
})();

const solids = new THREE.Group();
const mirror = new THREE.Group();
mirror.scale.y = -1;
scene.add(solids);
if (!lite) scene.add(mirror);
const _M = new THREE.Matrix4();
/* items: { x, y, z (centru), sx, sy, sz, ry } */
function boxes(mat, items, reflect = true) {
  const geo = unitBox.clone();
  const size = new Float32Array(items.length * 3);
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    size.set([it.sx, it.sy, it.sz], i * 3);
    _M.makeRotationY(it.ry || 0).setPosition(it.x, it.y, it.z);
    mesh.setMatrixAt(i, _M);
  });
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 3));
  mesh.frustumCulled = false;
  solids.add(mesh);
  if (reflect && !lite) {
    const r = new THREE.InstancedMesh(geo, mirrorOf(mat), items.length);
    r.instanceMatrix = mesh.instanceMatrix;
    r.frustumCulled = false;
    mirror.add(r);
  }
  return mesh;
}
function solid(mesh, reflect = true) {
  mesh.frustumCulled = false;
  solids.add(mesh);
  if (reflect && !lite) {
    const r = mesh.isInstancedMesh ? new THREE.InstancedMesh(mesh.geometry, mirrorOf(mesh.material), mesh.count) : new THREE.Mesh(mesh.geometry, mirrorOf(mesh.material));
    if (mesh.isInstancedMesh) r.instanceMatrix = mesh.instanceMatrix;
    r.position.copy(mesh.position); r.quaternion.copy(mesh.quaternion); r.scale.copy(mesh.scale);
    r.frustumCulled = false;
    mirror.add(r);
  }
  return mesh;
}

/* ---------- linii de lumină ---------- */
const lightMat = (frag, extra = {}) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, ...extra, fragmentShader: frag });
const quad = new THREE.PlaneGeometry(1, 1);
const _x = V3(0, 0, 0), _y = V3(0, 0, 0), _c = V3(0, 0, 0);
/* bandă între a și b, lată de w, cu fața spre n */
function stripMatrix(a, b, w, n) {
  _x.subVectors(b, a);
  _y.crossVectors(n, _x).normalize().multiplyScalar(w);
  _c.addVectors(a, b).multiplyScalar(0.5);
  return new THREE.Matrix4().makeBasis(_x, _y, n).setPosition(_c);
}
function quads(mat, matrices, attrs) {
  const geo = quad.clone();
  Object.entries(attrs).forEach(([name, [arr, n]]) => geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(arr), n)));
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
const stripVert = (decl, assign) => `${decl} varying vec2 vUv; varying float vSee; ${FOG_GLSL}
  void main(){ vUv = uv; ${assign} vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vSee = pdSee(mv.z); gl_Position = projectionMatrix * mv; }`;

/* ---------- cerul sălii ---------- */
const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 20), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, uniforms,
  vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    varying vec3 vDir; uniform float uGlow; uniform float uTime;
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453), b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
      float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453), e = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
      return mix(mix(a, b, f.x), mix(c, e, f.x), f.y); }
    void main(){
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 haze = vec3(0.0105, 0.0088, 0.0072);
      vec3 c = mix(haze, vec3(0.0015, 0.0016, 0.0022), smoothstep(0.0, 0.5, h));
      float ahead = max(dot(d, normalize(vec3(0.0, 0.06, -1.0))), 0.0);
      vec3 amber = vec3(1.0, 0.55, 0.19);
      float up = smoothstep(-0.03, 0.03, h);
      c += amber * (pow(ahead, 5.0) * 0.012 + pow(ahead, 30.0) * 0.03) * (0.35 + uGlow * 1.4) * up;
      vec2 q = vec2(atan(d.x, -d.z) * 2.4, h * 10.0);
      float band = vn(q + vec2(uTime * 0.012, 0.0)) * 0.62 + vn(q * 2.3 + 5.0) * 0.38;
      c += amber * smoothstep(0.42, 0.92, band) * exp(-abs(h - 0.07) * 10.0) * 0.016 * (0.4 + uGlow * 1.6) * up;
      gl_FragColor = vec4(c, 1.0);
    }`
}));
sky.renderOrder = -100;
sky.frustumCulled = false;
scene.add(sky);

/* ---------- graficul ---------- */
const CH = { x: 10, z0: 14, dz: 2, n: 177, w: 1.2, d: 1.0 };
const trendKeys = [[0, 5.2], [0.16, 8.4], [0.25, 7], [0.4, 12.6], [0.5, 11.2], [0.6, 12.4], [0.69, 10.2], [0.8, 15], [0.92, 22], [1, 27.5]];
const trend = (u) => {
  for (let i = 0; i < trendKeys.length - 1; i++) {
    const a = trendKeys[i], b = trendKeys[i + 1];
    if (u <= b[0]) return lerp(a[1], b[1], smooth(a[0], b[0], u));
  }
  return trendKeys[trendKeys.length - 1][1];
};
const bars = [];
{
  let prev = trend(0) - 0.7, wob = 0;
  for (let i = 0; i < CH.n; i++) {
    const u = i / (CH.n - 1);
    wob = wob * 0.55 + (rnd() - 0.5) * 3.6;
    let close = trend(u) + wob;
    const open = prev;
    if (Math.abs(close - open) < 0.7) close = open + (close >= open ? 1 : -1) * (0.7 + rnd() * 0.6);
    const top = Math.max(open, close), bot = Math.min(open, close);
    bars.push({
      z: CH.z0 - i * CH.dz, open, close, top, bot, bull: close > open,
      hi: top + 0.18 + rnd() * rnd() * 2.4, lo: Math.max(1.3, bot - 0.18 - rnd() * rnd() * 2.4),
      vol: 0.3 + (top - bot) * 0.36 + rnd() * 1.1
    });
    prev = close;
  }
}
{
  const g = [], s = [], v = [];
  bars.forEach((b) => {
    const list = b.bull ? g : s;
    list.push({ x: CH.x, y: (b.top + b.bot) / 2, z: b.z, sx: CH.d, sy: b.top - b.bot, sz: CH.w });
    list.push({ x: CH.x, y: (b.hi + b.lo) / 2, z: b.z, sx: 0.1, sy: b.hi - b.lo, sz: 0.1 });
    v.push({ x: CH.x, y: b.vol * 0.35, z: b.z, sx: CH.d * 0.7, sy: b.vol * 0.7, sz: CH.w });
  });
  boxes(goldBox, g);
  boxes(steelBox, s);
  boxes(bronzeBox, v);
}

/* mediile mobile și norul dintre ele */
const tubeMat = (r, g, b, k) => lightMat(`varying float vU; varying float vSee; uniform float uTime;
  void main(){ float pulse = pow(0.5 + 0.5 * sin(vU * 260.0 - uTime * 1.6), 16.0);
    gl_FragColor = vec4(vec3(${r}, ${g}, ${b}) * (${k} + pulse * 1.2), vSee); }`, {
  uniforms, vertexShader: `varying float vU; varying float vSee; ${FOG_GLSL} void main(){ vU = uv.x; vec4 mv = modelViewMatrix * vec4(position, 1.0); vSee = pdSee(mv.z); gl_Position = projectionMatrix * mv; }`
});
const ma = (span) => bars.map((b, i) => {
  let sum = 0, n = 0;
  for (let k = Math.max(0, i - span + 1); k <= i; k++) { sum += bars[k].close; n++; }
  return sum / n;
});
const maFast = ma(6), maSlow = ma(20);
const maX = CH.x - CH.d / 2 - 0.22;
const fastCurve = new THREE.CatmullRomCurve3(bars.map((b, i) => V3(maX, maFast[i], b.z)));
const slowCurve = new THREE.CatmullRomCurve3(bars.map((b, i) => V3(maX - 0.05, maSlow[i], b.z)));
{
  const a = new THREE.Mesh(new THREE.TubeGeometry(fastCurve, CH.n * 4, 0.034, 6, false), tubeMat('1.0', '0.68', '0.26', '1.15'));
  const b = new THREE.Mesh(new THREE.TubeGeometry(slowCurve, CH.n * 4, 0.028, 6, false), tubeMat('1.0', '0.86', '0.62', '0.8'));
  a.frustumCulled = b.frustumCulled = false;
  scene.add(a, b);
  const n = CH.n * 3, pos = new Float32Array((n + 1) * 6), idx = [];
  for (let i = 0; i <= n; i++) {
    const p = fastCurve.getPoint(i / n), q = slowCurve.getPoint(i / n);
    pos.set([maX + 0.03, p.y, p.z, maX + 0.03, q.y, q.z], i * 6);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const cloud = new THREE.Mesh(geo, lightMat(`varying float vSee; void main(){ gl_FragColor = vec4(${GOLD_GLSL}, 0.085 * vSee); }`, {
    vertexShader: `varying float vSee; ${FOG_GLSL} void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vSee = pdSee(mv.z); gl_Position = projectionMatrix * mv; }`
  }));
  cloud.frustumCulled = false;
  scene.add(cloud);
}

/* niveluri de suport și rezistență, din maximele și minimele graficului */
const stripMat = lightMat(`varying vec2 vUv; varying float vSee; varying vec4 vA; varying vec3 vC; uniform float uTime;
  void main(){
    float v = abs(vUv.y - 0.5) * 2.0;
    float prof = exp(-v * v * 70.0) + exp(-v * v * 6.0) * 0.16;
    float ends = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
    float dash = vA.y > 0.0 ? step(0.42, fract(vUv.x * vA.x / vA.y)) : 1.0;
    float pulse = pow(fract(vUv.x * vA.x * 0.016 - uTime * vA.z + vA.w), 22.0);
    gl_FragColor = vec4(vC * (1.0 + pulse * 2.0), prof * ends * dash * vSee);
  }`, { uniforms, vertexShader: stripVert('attribute vec4 aA; attribute vec3 aC; varying vec4 vA; varying vec3 vC;', 'vA = aA; vC = aC;') });
{
  const mats = [], A = [], C = [];
  const nX = V3(1, 0, 0), lx = maX - 0.06;
  const add = (y, z0, len, dash, k) => {
    mats.push(stripMatrix(V3(lx, y, z0), V3(lx, y, z0 - len), 0.46, nX));
    A.push(len, dash, 0.05 + rnd() * 0.05, rnd());
    C.push(1.0 * k, 0.68 * k, 0.26 * k);
  };
  for (let i = 3; i < CH.n - 9; i += 12) {
    const win = bars.slice(i, i + 12);
    const hi = win.reduce((m, b) => (b.hi > m.hi ? b : m)), lo = win.reduce((m, b) => (b.lo < m.lo ? b : m));
    if (((i - 3) / 12) % 2 < 1) add(hi.hi, hi.z + 1, 36 + rnd() * 40, 0, 0.9);
    else add(lo.lo, lo.z + 1, 30 + rnd() * 36, 0.9, 0.65);
  }
  quads(stripMat, mats, { aA: [A, 4], aC: [C, 3] });
}

/* poziții deschise: zona de profit și zona de stop */
{
  const mats = [], D = [], C = [], T = [];
  const nX = V3(1, 0, 0), px = maX - 0.1;
  [8, 50, 92, 142].forEach((i) => {
    const b = bars[i], len = 12 * CH.dz, z0 = b.z + CH.dz / 2, tp = 4.6, sl = 2.0;
    mats.push(stripMatrix(V3(px, b.close + tp / 2, z0), V3(px, b.close + tp / 2, z0 - len), tp, nX));
    D.push(len, tp); C.push(1.0, 0.68, 0.26); T.push(1);
    mats.push(stripMatrix(V3(px, b.close - sl / 2, z0), V3(px, b.close - sl / 2, z0 - len), sl, nX));
    D.push(len, sl); C.push(1.0, 0.2, 0.13); T.push(0);
  });
  quads(lightMat(`varying vec2 vUv; varying float vSee; varying vec2 vD; varying vec3 vC; varying float vT;
    void main(){
      vec2 p = vUv * vD; vec2 e = min(p, vD - p);
      float border = 1.0 - smoothstep(0.02, 0.07, min(e.x, e.y));
      float fill = mix(0.02, 0.085, vT > 0.5 ? 1.0 - vUv.y : vUv.y);
      gl_FragColor = vec4(vC, (fill + border * 0.55) * vSee * (vT > 0.5 ? 1.0 : 0.5));
    }`, { vertexShader: stripVert('attribute vec2 aD; attribute vec3 aC; attribute float aT; varying vec2 vD; varying vec3 vC; varying float vT;', 'vD = aD; vC = aC; vT = aT;') }),
  mats, { aD: [D, 2], aC: [C, 3], aT: [T, 1] });
}

/* peretele de sticlă din spatele graficului: caroiajul hârtiei de grafic */
{
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lightMat(`varying vec3 vW; varying float vSee;
    float ln(float c, float cell, float w){ float q = c / cell; float fw = fwidth(q); float d = abs(fract(q - 0.5) - 0.5); float lw = w / cell;
      return (1.0 - smoothstep(0.0, max(lw, fw), d)) * clamp(lw / fw, 0.0, 1.0); }
    void main(){
      float minor = max(ln(vW.y, 2.0, 0.022), ln(vW.z - 0.5, 3.0, 0.022));
      float major = max(ln(vW.y, 10.0, 0.04), ln(vW.z - 0.5, 15.0, 0.04));
      float fade = smoothstep(40.0, 16.0, vW.y) * smoothstep(0.0, 1.5, vW.y);
      gl_FragColor = vec4(${GOLD_GLSL}, (minor * 0.07 + major * 0.26) * fade * vSee);
    }`, { vertexShader: `varying vec3 vW; varying float vSee; ${FOG_GLSL} void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vSee = pdSee(mv.z); gl_Position = projectionMatrix * mv; }` }));
  wall.scale.set(380, 40, 1);
  wall.rotation.y = -Math.PI / 2;
  wall.position.set(CH.x + CH.d / 2 + 0.7, 20, -166);
  wall.frustumCulled = false;
  scene.add(wall);
}

/* ---------- pardoseala-oglindă ---------- */
const POOLS = [
  [CH.x, 2, 13, 0.035], [-13, -180, 13, 0.05], [-5, -232, 10, 0.1], [0, -372, 26, 0.13], [0, -340, 16, 0.04], [-3, -92, 16, 0.025]
];
const floor = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, toneMapped: false,
  uniforms: { ...uniforms, uPools: { value: POOLS.map((p) => new THREE.Vector4(...p)) } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `
    precision highp float;
    varying vec3 vW; uniform vec3 uCam; uniform float uTime; uniform vec4 uPools[${POOLS.length}];
    ${FOG_GLSL}
    float grid(vec2 p, float cell, float w){ vec2 q = p / cell; vec2 fw = fwidth(q); vec2 d = abs(fract(q - 0.5) - 0.5); vec2 lw = vec2(w / cell);
      vec2 a = (1.0 - smoothstep(vec2(0.0), max(lw, fw), d)) * clamp(lw / fw, 0.0, 1.0); return max(a.x, a.y); }
    void main(){
      vec3 toCam = uCam - vW;
      float dist = length(toCam);
      vec3 V = toCam / dist;
      vec3 gold = ${GOLD_GLSL};
      vec2 p = vW.xz - vec2(0.0, 0.5);
      vec3 c = vec3(0.0042, 0.004, 0.0038);
      c += gold * (grid(p, 3.0, 0.02) * 0.02 + grid(p, 15.0, 0.045) * 0.085) * exp(-dist * 0.016);
      /* un impuls rar pe liniile mari, ca un ordin care traversează piața */
      vec2 id = floor(p / 15.0 + 0.5);
      float hx = fract(sin(id.x * 12.9898) * 43758.5453), hz = fract(sin(id.y * 78.233) * 43758.5453);
      vec2 g = abs(fract(p / 15.0 - 0.5) - 0.5) * 15.0;
      float run = pow(fract(p.y * 0.011 + uTime * (0.03 + hx * 0.05) + hx * 7.0), 30.0) * step(0.55, hx) * (1.0 - smoothstep(0.0, 0.1, g.x))
                + pow(fract(p.x * 0.011 - uTime * (0.03 + hz * 0.05) + hz * 5.0), 30.0) * step(0.55, hz) * (1.0 - smoothstep(0.0, 0.1, g.y));
      c += gold * run * 1.4 * exp(-dist * 0.012);
      for (int i = 0; i < ${POOLS.length}; i++) { vec2 d = vW.xz - uPools[i].xy; c += gold * uPools[i].w * exp(-dot(d, d) / (uPools[i].z * uPools[i].z)); }
      float under = vW.x - ${CH.x.toFixed(1)};
      c += gold * 0.014 * exp(-under * under * 0.12) * step(-346.0, vW.z) * step(vW.z, 18.0);
      float see = pdSee(dist);
      c = mix(vec3(0.0105, 0.0088, 0.0072), c, see);
      float fres = pow(1.0 - max(V.y, 0.0), 3.0);
      gl_FragColor = vec4(c, mix(1.0, mix(0.9, 0.42, fres), see));
    }`
}));
floor.renderOrder = -10;
floor.frustumCulled = false;
scene.add(floor);

/* ---------- harta în 6 pași: șase inele prin care trece camera ---------- */
const softDot = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,255,255,0.5)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.1)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const glowTube = (intensity) => lightMat(`varying vec3 vN; varying vec3 vV; varying float vSee; uniform float uI;
  void main(){ float f = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 1.4);
    gl_FragColor = vec4(${GOLD_GLSL} * uI * (0.3 + 0.7 * f), vSee); }`, {
  uniforms: { uI: { value: intensity } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying float vSee; ${FOG_GLSL} void main(){ vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vSee = pdSee(mv.z); gl_Position = projectionMatrix * mv; }`
});
const tickGeo = new THREE.BoxGeometry(0.055, 1, 0.055);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = V3(1, 1, 1), _p = V3(0, 0, 0);
function ticks(count, radius, lenOf) {
  const m = new THREE.InstancedMesh(tickGeo, goldMat, count);
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2, L = lenOf(k);
    _p.set(Math.cos(a) * (radius - L / 2), Math.sin(a) * (radius - L / 2), 0);
    _q.setFromEuler(_e.set(0, 0, a - Math.PI / 2));
    m.setMatrixAt(k, _M.compose(_p, _q, _s.set(1, L, 1)));
  }
  m.frustumCulled = false;
  return m;
}
const rings = [];
{
  const R = 6.4;
  const ringGeo = new THREE.TorusGeometry(R, 0.12, 12, 140);
  const innerGeo = new THREE.TorusGeometry(R - 0.78, 0.028, 6, 140);
  for (let i = 0; i < 6; i++) {
    const T = 4.1 + i * 0.165, u = T / lastKey;
    const g = new THREE.Group();
    g.position.copy(posCurve.getPoint(u));
    g.lookAt(g.position.clone().add(posCurve.getTangent(u)));
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(ringGeo, goldMat), new THREE.Mesh(innerGeo, goldMat), ticks(60, R - 0.2, (k) => (k % 5 ? 0.24 : 0.5)));
    /* arcul aprins crește cu fiecare pas: 1/6 … 6/6 */
    const arc = new THREE.Mesh(new THREE.TorusGeometry(R - 1.02, 0.05, 8, 160, ((i + 1) / 6) * Math.PI * 2), glowTube(0));
    arc.rotation.set(0, Math.PI, Math.PI / 2);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xffc66e, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
    halo.scale.setScalar(R * 3.4);
    g.add(spin, arc, halo);
    g.traverse((o) => { o.frustumCulled = false; });
    scene.add(g);
    rings.push({ g, spin, arc, halo, T, dir: i % 2 ? -1 : 1 });
  }
}

/* ---------- ceasul pieței: cele trei sesiuni ---------- */
const CLOCK = V3(-13, 18, -180);
const clock = new THREE.Group();
const sessions = [];
let hand;
{
  clock.position.copy(CLOCK);
  clock.lookAt(V3(6, 19, -138));
  const R = 9;
  clock.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.17, 14, 180), goldMat), new THREE.Mesh(new THREE.TorusGeometry(R - 1.05, 0.03, 6, 180), goldMat), new THREE.Mesh(new THREE.TorusGeometry(R + 0.55, 0.022, 6, 180), goldMat));
  clock.add(ticks(96, R - 0.26, (k) => (k % 12 === 0 ? 0.74 : k % 4 === 0 ? 0.44 : 0.2)));
  hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, R - 1.5, 0.05).translate(0, (R - 1.5) / 2 + 0.4, 0), goldMat);
  hand.position.z = 0.25;
  clock.add(hand);
  [['tokyo', 7.3, 0.5, 0.2], ['london', 6.0, -0.75, 0.9], ['newyork', 4.7, 1.2, -0.5]].forEach(([id, r, tx, ty], i) => {
    const tilt = new THREE.Group();
    tilt.rotation.set(tx, ty, 0);
    const turn = new THREE.Group();
    turn.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 10, 140), goldMat));
    const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.105, 8, 90, (9 / 24) * Math.PI * 2), glowTube(1));
    turn.add(arc);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), goldMat);
    bead.position.set(r, 0, 0);
    turn.add(bead);
    tilt.add(turn);
    clock.add(tilt);
    sessions.push({ id, turn, arc, speed: (i % 2 ? -1 : 1) * (0.05 + i * 0.022), live: false, el: document.querySelector(`.session-item[data-session="${id}"]`) });
  });
  const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55, 1), gemMat);
  gem.name = 'gem';
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 23, 8), goldMat);
  axis.rotation.z = 0.41;
  clock.add(gem, axis);
  clock.traverse((o) => { o.frustumCulled = false; });
  scene.add(clock);
}
const gem = clock.getObjectByName('gem');
function readSessions() {
  sessions.forEach((s) => { s.live = !!(s.el && s.el.classList.contains('is-live')); });
  const d = new Date();
  hand.rotation.z = -((d.getHours() + d.getMinutes() / 60) / 24) * Math.PI * 2;
  dirty = true;
}

/* ---------- cele 12 sisteme: un semnal pleacă din centru și e copiat de fiecare ---------- */
const HUB = { x: -5, z: -232, r: 11.5 };
{
  /* cercul e rotit astfel încât camera să treacă printre monoliți, nu prin ei */
  let best = 0, bestGap = -1;
  for (let o = 0; o < 24; o++) {
    const off = (o / 24) * (Math.PI / 6);
    let gap = 1e9;
    for (let i = 0; i < 12; i++) { const a = off + (i / 12) * Math.PI * 2; gap = Math.min(gap, pathGap(HUB.x + Math.cos(a) * HUB.r, HUB.z + Math.sin(a) * HUB.r)); }
    if (gap > bestGap) { bestGap = gap; best = off; }
  }
  const slabs = [], caps = [], mats = [], K = [];
  const up = V3(0, 1, 0);
  for (let i = 0; i < 12; i++) {
    const a = best + (i / 12) * Math.PI * 2, h = 11.5 + ((i * 5) % 4) * 1.9;
    const cx = HUB.x + Math.cos(a) * HUB.r, cz = HUB.z + Math.sin(a) * HUB.r;
    slabs.push({ x: cx, y: h / 2, z: cz, sx: 1.9, sy: h, sz: 0.56, ry: Math.PI / 2 - a });
    caps.push({ x: cx, y: h + 0.12, z: cz, sx: 1.9, sy: 0.16, sz: 0.56, ry: Math.PI / 2 - a });
    const inward = V3(-Math.cos(a), 0, -Math.sin(a));
    const face = V3(cx, 0, cz).addScaledVector(inward, 0.3);
    mats.push(stripMatrix(V3(face.x, 0.5, face.z), V3(face.x, h - 0.5, face.z), 0.5, inward));
    K.push(1, i * 0.045, h);
    mats.push(stripMatrix(V3(HUB.x + Math.cos(a) * 1.9, 0.04, HUB.z + Math.sin(a) * 1.9), V3(cx - Math.cos(a) * 0.5, 0.04, cz - Math.sin(a) * 0.5), 0.6, up));
    K.push(0, i * 0.045, HUB.r);
  }
  boxes(steelBox, slabs);
  boxes(goldBox, caps, false);
  boxes(goldBox, [{ x: HUB.x, y: 10, z: HUB.z, sx: 2.3, sy: 20, sz: 2.3, ry: Math.PI / 4 }]);
  quads(lightMat(`varying vec2 vUv; varying float vSee; varying vec3 vK; uniform float uTime;
    void main(){
      float v = abs(vUv.y - 0.5) * 2.0;
      float prof = exp(-v * v * 46.0) + exp(-v * v * 5.0) * 0.2;
      float p = fract(uTime / 5.5 - vK.y);
      float a;
      if (vK.x < 0.5) {
        float head = p * 2.0;
        a = 0.09 + exp(-pow((vUv.x - head) * 6.0, 2.0)) * 1.7 * step(head, 1.2);
        a *= smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
      } else {
        float rise = clamp((p - 0.5) / 0.2, 0.0, 1.0);
        float lit = smoothstep(rise + 0.02, rise - 0.1, vUv.x) * step(0.5, p);
        a = 0.15 + lit * (1.0 - smoothstep(0.72, 1.0, p)) * 1.5;
        a *= smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x);
      }
      gl_FragColor = vec4(${GOLD_GLSL} * 1.5, a * prof * vSee);
    }`, { uniforms, vertexShader: stripVert('attribute vec3 aK; varying vec3 vK;', 'vK = aK;') }), mats, { aK: [K, 3] });
}
const hubRing = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.06, 10, 120), goldMat);
hubRing.position.set(HUB.x, 21.6, HUB.z);
hubRing.frustumCulled = false;
scene.add(hubRing);
const hubGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xffc66e, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
hubGlow.position.set(HUB.x, 20.6, HUB.z);
hubGlow.scale.setScalar(9);
scene.add(hubGlow);

/* ---------- emblema: cele două lumânări din sigla Profit District, în scut ---------- */
const EMB = { z: -372, s: 0.085 };
const embPt = (px, py) => V3((px - 235) * EMB.s, (437 - py) * EMB.s + 2, 0);
const embUniforms = { uOn: { value: 0 }, uTime: uniforms.uTime };
{
  const at = (m) => { m.position.z = EMB.z; return m; };
  const at2 = (m) => { m.position.z += EMB.z; return m; };
  const body = (cx, top, bot, w) => { const a = embPt(cx, top), b = embPt(cx, bot); return { x: a.x, y: (a.y + b.y) / 2, z: EMB.z, sx: w * EMB.s, sy: a.y - b.y, sz: w * EMB.s }; };
  boxes(pbr({ color: goldColor, metalness: 1, roughness: 0.16 }, { box: true, bevel: 0.13, pillow: 0.16 }), [body(212, 222, 292, 30), body(266, 155, 262, 30), body(212, 202, 312, 5), body(266, 132, 285, 5)]);

  const shield = new THREE.Path();
  shield.moveTo(235, 42);
  shield.quadraticCurveTo(165, 84, 67, 88);
  shield.lineTo(67, 250);
  shield.bezierCurveTo(67, 345, 150, 398, 235, 437);
  shield.bezierCurveTo(320, 398, 403, 345, 403, 250);
  shield.lineTo(403, 88);
  shield.quadraticCurveTo(305, 84, 235, 42);
  const outline = (scale, radius, mat, segs) => {
    const pts = shield.getSpacedPoints(260).slice(0, -1).map((p) => embPt(235 + (p.x - 235) * scale, 240 + (p.y - 240) * scale));
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 520, radius, segs, true), mat);
  };
  solid(at(outline(1, 0.2, goldMat, 10)));
  /* fondul scutului: email negru, pe care aurul se citește */
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(shield.getSpacedPoints(200).map((p) => { const q = embPt(235 + (p.x - 235) * 0.985, 240 + (p.y - 240) * 0.985); return new THREE.Vector2(q.x, q.y); }))),
    pbr({ color: new THREE.Color().setRGB(0.014, 0.013, 0.012), metalness: 1, roughness: 0.34, side: THREE.DoubleSide }));
  plate.position.z = -0.32;
  solid(at2(plate));
  solid(at(outline(0.952, 0.06, goldMat, 6)), false);
  /* lumina care urcă pe scut din vârful de jos spre creastă */
  const lit = outline(1, 0.27, lightMat(`varying float vU; varying vec3 vN; varying vec3 vV; uniform float uOn; uniform float uTime;
    void main(){ float d = abs(vU - 0.5) * 2.0;
      float show = smoothstep(uOn * 1.04, uOn * 1.04 - 0.06, d);
      float head = exp(-pow((d - uOn) * 16.0, 2.0)) * (1.0 - smoothstep(0.9, 1.0, uOn));
      float f = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 2.0);
      float breathe = 0.85 + 0.15 * sin(uTime * 0.9);
      gl_FragColor = vec4(${GOLD_GLSL} * (0.5 * breathe + head * 2.6), f * show); }`, {
    uniforms: embUniforms,
    vertexShader: 'varying float vU; varying vec3 vN; varying vec3 vV; void main(){ vU = uv.x; vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }'
  }), 8);
  lit.frustumCulled = false;
  scene.add(at(lit));

  /* laurii */
  const leafGeo = (() => {
    const g = new THREE.SphereGeometry(1, 18, 10);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const y = P.getY(i), k = Math.pow(Math.max(1 - y * y, 0), 0.55); P.setXYZ(i, P.getX(i) * k, y, P.getZ(i) * k); }
    g.computeVertexNormals();
    return g;
  })();
  const leaves = [];
  [1, -1].forEach((side) => {
    const stem = new THREE.CatmullRomCurve3([[238, 392], [196, 366], [146, 322], [110, 266], [100, 208], [116, 152]].map(([x, y]) => embPt(side > 0 ? x : 470 - x, y)));
    solid(at(new THREE.Mesh(new THREE.TubeGeometry(stem, 60, 0.055, 6, false), goldMat)), false);
    for (let k = 0; k <= 9; k++) {
      const t = 0.13 + (k / 9) * 0.87, p = stem.getPoint(t), tan = stem.getTangent(t), ang = Math.atan2(tan.y, tan.x);
      const len = (46 - k * 1.6) * EMB.s, wid = 13 * EMB.s;
      (k === 9 ? [0] : [0.62, -0.62]).forEach((d) => {
        const a = ang + d * side;
        leaves.push({ p: V3(p.x + Math.cos(a) * len * 0.5, p.y + Math.sin(a) * len * 0.5, EMB.z + d * 0.25), a, len, wid });
      });
    }
  });
  const leafMesh = new THREE.InstancedMesh(leafGeo, goldMat, leaves.length);
  leaves.forEach((l, i) => leafMesh.setMatrixAt(i, _M.compose(l.p, _q.setFromEuler(_e.set(0, 0, l.a - Math.PI / 2)), _s.set(l.wid / 2, l.len / 2, 0.13))));
  solid(leafMesh);

  /* soclul */
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(15, 15.5, 0.36, 96), pbr({ color: new THREE.Color().setRGB(0.02, 0.019, 0.018), metalness: 1, roughness: 0.5 }));
  dais.position.set(0, 0.18, 0);
  solid(at(dais), false);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(15, 0.07, 8, 200).rotateX(Math.PI / 2), goldMat);
  rim.position.set(0, 0.38, 0);
  solid(at(rim), false);

  /* raze în spatele scutului */
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), lightMat(`varying vec2 vUv; uniform float uOn; uniform float uTime;
    void main(){ vec2 p = vUv - 0.5; float r = length(p); float a = atan(p.y, p.x);
      float ray = (0.5 + 0.5 * sin(a * 13.0 + uTime * 0.05)) * (0.5 + 0.5 * sin(a * 31.0 - uTime * 0.035 + 2.0));
      float c = exp(-r * 17.0) * 0.2 + pow(ray, 3.0) * exp(-r * 9.0) * 0.22;
      gl_FragColor = vec4(vec3(1.0, 0.66, 0.26) * c * uOn, 1.0); }`, {
    uniforms: embUniforms, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
  }));
  rays.position.set(0, 20, EMB.z - 5);
  rays.frustumCulled = false;
  rays.renderOrder = -5;
  scene.add(rays);
}

/* ---------- comunitatea: un râu de lumini care curge spre emblemă ---------- */
{
  const n = lite ? 1100 : 3400;
  const a = new Float32Array(n * 4), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([rnd(), rnd() * 6.283, 0.25 + rnd() * rnd() * 0.75, 0.5 + rnd()], i * 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aR', new THREE.BufferAttribute(a, 4));
  const river = new THREE.Points(g, lightMat(`uniform sampler2D uTex; varying float vA; varying float vHot;
    void main(){ if (vA < 0.004) discard; gl_FragColor = vec4(mix(${GOLD_GLSL}, vec3(1.0, 0.92, 0.74), vHot) * 1.7, texture2D(uTex, gl_PointCoord).a * vA); }`, {
    uniforms: { ...uniforms, uTex: { value: softDot } },
    vertexShader: `attribute vec4 aR; uniform float uTime; uniform float uPx; varying float vA; varying float vHot; ${FOG_GLSL}
      void main(){
        float u = fract(aR.x + uTime * 0.012 * aR.w);
        float ang = aR.y + u * 5.0 + uTime * 0.05;
        float rad = aR.z * mix(15.0, 2.2, pow(u, 0.8));
        vec3 c = mix(vec3(-3.0, 6.0, -236.0), vec3(0.0, 21.0, -371.0), u);
        c.y += sin(u * 9.0) * 1.4;
        vec3 p = c + vec3(cos(ang) * rad, sin(ang) * rad * 0.7, sin(ang * 1.7) * 3.0);
        p.y = max(p.y, 0.4);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = max(-mv.z, 0.5);
        vA = smoothstep(0.0, 0.07, u) * (1.0 - smoothstep(0.93, 1.0, u)) * (0.5 + 0.5 * sin(uTime * 1.4 + aR.y * 9.0)) * pdSee(d) * smoothstep(1.0, 5.0, d);
        vHot = u * u;
        gl_PointSize = clamp(uPx * 46.0 * (0.6 + aR.w * 0.5) / d, 1.6 * uPx, 14.0 * uPx);
        gl_Position = projectionMatrix * mv;
      }`
  }));
  river.frustumCulled = false;
  scene.add(river);
}

/* ---------- praf auriu care plutește în jurul camerei ---------- */
{
  const n = lite ? 260 : 620;
  const pos = new Float32Array(n * 3), s = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    pos.set([rnd() * 70, rnd() * 36, rnd() * 70], i * 3);
    s.set([0.4 + rnd() * rnd() * 1.6, rnd() * 6.283], i * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.BufferAttribute(s, 2));
  const dust = new THREE.Points(g, lightMat(`uniform sampler2D uTex; varying float vA;
    void main(){ if (vA < 0.004) discard; gl_FragColor = vec4(${GOLD_GLSL} * 1.5, texture2D(uTex, gl_PointCoord).a * vA); }`, {
    uniforms: { ...uniforms, uTex: { value: softDot } },
    vertexShader: `attribute vec2 aS; uniform vec3 uCam; uniform float uTime; uniform float uPx; varying float vA;
      void main(){
        vec3 box = vec3(70.0, 36.0, 70.0);
        vec3 p = position;
        p.y += uTime * 0.1 * aS.x; p.x += sin(uTime * 0.11 + aS.y) * 0.7; p.z += cos(uTime * 0.09 + aS.y) * 0.7;
        p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = max(-mv.z, 0.4);
        float ps = min(uPx * 24.0 * aS.x / d, 64.0 * uPx);
        float tw = 0.55 + 0.45 * sin(uTime * (0.5 + aS.x) + aS.y * 6.0);
        vA = smoothstep(34.0, 20.0, length(p - uCam)) * tw * min(1.0, 16.0 * uPx * uPx / (ps * ps)) * smoothstep(0.5, 2.2, d) * step(0.15, p.y) * 0.8;
        gl_PointSize = max(ps, 1.3 * uPx);
        gl_Position = projectionMatrix * mv;
      }`
  }));
  dust.frustumCulled = false;
  scene.add(dust);
}

/* ---------- strălucirea: imaginea se desenează întâi într-o țintă HDR, apoi luminile se revarsă ---------- */
const hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
const rtType = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
const sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: rtType, samples: lowEnd ? 2 : 4, depthBuffer: true });
const LEVELS = lite ? 4 : 5;
const mkRT = () => new THREE.WebGLRenderTarget(2, 2, { type: rtType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const downs = Array.from({ length: LEVELS }, mkRT), ups = Array.from({ length: LEVELS - 1 }, mkRT);
const postGeo = new THREE.BufferGeometry();
postGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
postGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postScene = new THREE.Scene();
const postMesh = new THREE.Mesh(postGeo, null);
postMesh.frustumCulled = false;
postScene.add(postMesh);
const postMat = (uniformsIn, frag) => new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, toneMapped: false, uniforms: uniformsIn, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag });
const TAP4 = `vec4 o = uTexel.xyxy * vec4(-1.0, -1.0, 1.0, 1.0);
  vec3 c = (texture2D(tSrc, vUv + o.xy).rgb + texture2D(tSrc, vUv + o.zy).rgb + texture2D(tSrc, vUv + o.xw).rgb + texture2D(tSrc, vUv + o.zw).rgb) * 0.25;`;
const downMat = postMat({ tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uPre: { value: 0 } }, `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uPre;
  void main(){ ${TAP4}
    if (uPre > 0.5) { c = min(c, vec3(5.0)); float br = max(c.r, max(c.g, c.b)); float soft = clamp(br - 0.55, 0.0, 0.9); soft = soft * soft / 1.8; c *= max(soft, br - 1.0) / max(br, 0.0001); }
    gl_FragColor = vec4(c, 1.0); }`);
const upMat = postMat({ tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } }, `varying vec2 vUv; uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel;
  void main(){ ${TAP4}
    gl_FragColor = vec4(c + texture2D(tAdd, vUv).rgb, 1.0); }`);
const finalMat = postMat({ tScene: { value: sceneRT.texture }, tBloom: { value: ups[0].texture }, uBloom: { value: 0.62 / LEVELS }, uTime: uniforms.uTime }, `varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform float uTime;
  void main(){
    vec2 p = vUv - 0.5;
    vec2 ca = p * dot(p, p) * 0.006;
    vec3 c = vec3(texture2D(tScene, vUv + ca).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - ca).b);
    c += texture2D(tBloom, vUv).rgb * uBloom;
    c *= 1.0 - smoothstep(0.32, 1.05, length(p * vec2(1.0, 0.86)) * 1.45) * 0.42;
    float m = max(max(c.r, max(c.g, c.b)), 0.0001);
    vec3 hue = c * ((m * (2.51 * m + 0.03)) / (m * (2.43 * m + 0.59) + 0.14) / m);
    c = clamp(mix(hue, (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.25), 0.0, 1.0);
    c = pow(c, vec3(1.0 / 2.2));
    /* granulație fină: ține gradientele închise fără trepte */
    float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
    c += (n - 0.5) * 0.014;
    gl_FragColor = vec4(c, 1.0);
  }`);
function pass(mat, target) { postMesh.material = mat; renderer.setRenderTarget(target); renderer.render(postScene, postCam); }
function sizeTargets() {
  let w = Math.max(2, Math.floor(W * dpr)), h = Math.max(2, Math.floor(H * dpr));
  sceneRT.setSize(w, h);
  downs.forEach((rt, i) => { w = Math.max(2, w >> 1); h = Math.max(2, h >> 1); rt.setSize(w, h); if (ups[i]) ups[i].setSize(w, h); });
  uniforms.uPx.value = dpr;
}
function draw() {
  renderer.setRenderTarget(sceneRT);
  renderer.render(scene, camera);
  let src = sceneRT;
  downs.forEach((rt, i) => {
    downMat.uniforms.tSrc.value = src.texture;
    downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
    downMat.uniforms.uPre.value = i === 0 ? 1 : 0;
    pass(downMat, rt);
    src = rt;
  });
  let low = downs[LEVELS - 1];
  for (let i = LEVELS - 2; i >= 0; i--) {
    upMat.uniforms.tSrc.value = low.texture;
    upMat.uniforms.uTexel.value.set(0.75 / low.width, 0.75 / low.height);
    upMat.uniforms.tAdd.value = downs[i].texture;
    pass(upMat, ups[i]);
    low = ups[i];
  }
  pass(finalMat, null);
}

/* ---------- legarea de scroll ---------- */
const SECTION_IDS = ['hero', 'social-proof', 'proces', 'educatie', 'systems', 'webinar', 'community', 'final-cta'];
const sections = SECTION_IDS.map((id) => document.getElementById(id));
/* paginile fără secțiunile primei pagini își parcurg propriul traseu: data-route="start,final" */
const route = canvas.dataset.route ? canvas.dataset.route.split(',').map(Number) : null;
const headers = [...document.querySelectorAll('.section-header')];
let anchors = [], vh = 1, W = 1, H = 1, lastW = 0, lastH = 0, headerBoxes = [];
function computeAnchors() {
  vh = window.innerHeight;
  const sc = window.scrollY;
  headerBoxes = headers.map((h) => { const r = h.getBoundingClientRect(); return { el: h, top: r.top + sc, h: r.height }; });
  if (route || sections.some((s) => !s)) {
    const r = route || [0, lastKey];
    anchors = [[0, r[0]], [Math.max(document.documentElement.scrollHeight - vh, 1), r[1]]];
    return;
  }
  const ys = [];
  sections.forEach((s) => {
    const r = s.getBoundingClientRect();
    const top = r.top + sc;
    ys.push(Math.max(top - vh * 0.15, 0), Math.max(top + r.height - vh * 0.85, top - vh * 0.14));
  });
  anchors = ys.map((y, i) => [i === 0 ? 0 : Math.max(y, ys[i - 1] + 1), i]);
}
function targetT() {
  const y = window.scrollY;
  if (y <= anchors[0][0]) return anchors[0][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    if (y <= anchors[i + 1][0]) return lerp(anchors[i][1], anchors[i + 1][1], clamp((y - anchors[i][0]) / (anchors[i + 1][0] - anchors[i][0])));
  }
  return anchors[anchors.length - 1][1];
}
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  sizeTargets();
  camera.aspect = W / H;
  camera.fov = W < H ? 62 : 46;
  camera.updateProjectionMatrix();
  computeAnchors();
  dirty = true;
  kick();
}

/* titlurile plutesc cu altă viteză decât pagina, ca niște obiecte din scenă */
function moveHeaders() {
  if (reduced.matches) return;
  const y = window.scrollY;
  headerBoxes.forEach((b) => {
    const rel = b.top + b.h / 2 - y - vh / 2;
    if (Math.abs(rel) > vh * 1.2) return;
    const v = (rel * 0.07).toFixed(1) + 'px';
    if (b.last !== v) { b.el.style.translate = `0 ${v}`; b.last = v; }
  });
}

/* ---------- starea scenei ---------- */
const pos = V3(0, 0, 0), look = V3(0, 0, 0);
function render(T, time) {
  const u = clamp(T / lastKey);
  posCurve.getPoint(u, pos);
  lookCurve.getPoint(u, look);
  const i = Math.min(Math.floor(T), lastKey - 1), f = T - i;
  const k0 = KEYS[i], k1 = KEYS[i + 1];
  const s = smooth(0, 1, f);
  const roll = lerp(k0[6], k1[6], s);
  pos.x += Math.sin(time * 0.13) * 0.35;
  pos.y += Math.sin(time * 0.17) * 0.2;
  look.x += Math.sin(time * 0.09 + 1) * 0.5;
  camera.position.copy(pos);
  camera.up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.lookAt(look);

  uniforms.uTime.value = time;
  uniforms.uGlow.value = lerp(k0[7], k1[7], s);
  uniforms.uCam.value.copy(pos);
  sky.position.copy(pos);
  /* reflexiile alunecă pe metal: lumina de studio se rotește încet și odată cu drumul */
  scene.environmentRotation.y = Math.sin(time * 0.06) * 0.4 + T * 0.1;

  rings.forEach((r) => {
    r.spin.rotation.z = time * 0.045 * r.dir;
    const on = smooth(r.T - 0.42, r.T - 0.08, T);
    r.arc.material.uniforms.uI.value = 0.25 + on * 1.7;
    r.halo.material.opacity = on * 0.045 * (1 - smooth(r.T - 0.04, r.T + 0.02, T));
  });
  sessions.forEach((se, n) => {
    se.turn.rotation.z = time * se.speed + n * 2.1;
    se.arc.material.uniforms.uI.value = se.live ? 2.1 + Math.sin(time * 1.3 + n) * 0.35 : 0.55;
  });
  gem.rotation.set(time * 0.11, time * 0.17, 0);
  hubRing.rotation.set(Math.PI / 2 + Math.sin(time * 0.3) * 0.12, 0, time * 0.2);
  hubGlow.material.opacity = 0.34 + Math.sin(time * 1.14) * 0.1;
  embUniforms.uOn.value = smooth(11.2, 14.3, T);

  draw();
}

/* ---------- buclă ---------- */
let curT = 0, dirty = true, running = false, visible = true, lastTime = 0, clockT = 0, slowSum = 0, slowCount = 0, settleUntil = performance.now() + 1500;
const animated = () => !reduced.matches;
/* la fiecare cadru; o dată din două doar ca ultimă soluție, după ce rezoluția a coborât la minim */
let idleStride = 1, idleCount = 0;
let goodRuns = 0, raisedAt = -1e9, canRaise = true;
function kick() { if (!running && visible) { running = true; lastTime = performance.now(); requestAnimationFrame(tick); } }
function setScale(v) {
  if (v === dpr) return;
  dpr = v;
  renderer.setPixelRatio(v);
  renderer.setSize(W, H, false);
  sizeTargets();
  dirty = true;
  settleUntil = performance.now() + 200;
}
/* o eroare într-un cadru nu are voie să oprească animația */
function tick(now) {
  let keepGoing = true;
  try {
    keepGoing = step(now);
  } catch (e) {
    console.error(e);
    dirty = true;
  }
  if (keepGoing) requestAnimationFrame(tick);
  else running = false;
}
function step(now) {
  const raw = now - lastTime;
  lastTime = now;
  if (animated()) clockT += Math.min(raw, 100) / 1000;
  const target = targetT();
  moveHeaders();
  const before = curT;
  if (reduced.matches) curT = target;
  else {
    curT += (target - curT) * (1 - Math.exp(-Math.min(raw / 1000, 0.1) * 5));
    if (Math.abs(target - curT) < 0.0004) curT = target;
  }
  const moved = before !== curT;
  const moving = Math.abs(target - curT) > 0.002;
  idleCount++;
  if (dirty || moved || (animated() && idleCount % idleStride === 0)) {
    render(curT, clockT);
    dirty = false;
  }
  /* sub ~52 de cadre pe secundă coboară rezoluția; după 8 s bune urcă înapoi, dar renunță dacă urcarea nu ține */
  if (now < settleUntil) { slowSum = 0; slowCount = 0; }
  else if (raw < 1000 && (moving || animated())) {
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
  return visible && (animated() || curT !== target);
}
setInterval(() => { if (!document.hidden) { visible = true; kick(); } }, 1000);
setInterval(readSessions, 20000);

document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) { dirty = true; kick(); } });
window.addEventListener('scroll', kick, { passive: true });
new ResizeObserver(() => {
  const w = window.innerWidth, h = window.innerHeight;
  if (w === lastW && Math.abs(h - lastH) < 120) { computeAnchors(); return; }
  lastW = w; lastH = h;
  resize();
}).observe(document.documentElement);
if (document.fonts) document.fonts.ready.then(() => { computeAnchors(); dirty = true; kick(); });
window.addEventListener('load', () => { computeAnchors(); readSessions(); dirty = true; kick(); });

lastW = window.innerWidth; lastH = window.innerHeight;
readSessions();
resize();
curT = targetT();
render(curT, 0);
