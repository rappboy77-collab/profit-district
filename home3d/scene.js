import * as THREE from '../dda/vendor/three.module.min.js';

const root = document.documentElement;
const canvas = document.getElementById('home-scene');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const small = window.innerWidth < 760;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  root.classList.remove('home3d');
  throw e;
}
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); root.classList.remove('home3d'); });
canvas.addEventListener('webglcontextrestored', () => { root.classList.add('home3d'); dirty = true; kick(); });

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
let seed = 90210;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

const nativeDpr = window.devicePixelRatio || 1;
/* o singură rezoluție, fără comutări la scroll; coboară doar dacă GPU-ul nu ține pasul */
const topDpr = Math.max(1, Math.min(nativeDpr, lowEnd ? 1.25 : 1.5));
const minDpr = 0.8;
let dpr = topDpr;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 900);
const uniforms = {
  uTime: { value: 0 },
  uDawn: { value: 0 },
  uCam: { value: new THREE.Vector3() },
  uDraw: { value: 0 }
};

/* traseul camerei: câte două chei pe secțiune, încet cât citești și rapid între secțiuni */
const KEYS = [
  [5, 2.0, 14, -7, 7.5, -40, -0.02, 0],
  [3, 2.7, 4, -4, 8, -40, 0.01, 0],
  [2, 10, -22, 0, 10, -70, 0.03, 0.02],
  [-2, 12, -40, 0, 11, -90, -0.02, 0.04],
  [-1, 7, -52, 0, 8, -84, 0.02, 0.06],
  [5, 13, -128, -1, 37, -176, -0.03, 0.2],
  [0, 104, -128, 0, 0, -226, 0, 0.32],
  [9, 118, -150, 0, 0, -246, 0.02, 0.4],
  [27, 22, -192, 0, 15, -216, -0.03, 0.46],
  [9, 18, -187, 0, 17, -216, 0.03, 0.5],
  [-25, 12, -206, 0, 17, -222, -0.02, 0.56],
  [-27, 15, -227, 0, 17, -222, 0.02, 0.6],
  [8, 6, -246, -4, 8, -288, 0.02, 0.72],
  [4, 7.5, -264, -4, 10, -305, -0.01, 0.8],
  [0, 12, -284, 0, 19, -430, 0, 0.94],
  [0, 16, -294, 0, 24, -430, 0, 1]
];
const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(k[0], k[1], k[2])), false, 'centripetal');
const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(k[3], k[4], k[5])), false, 'centripetal');
const camSamples = posCurve.getPoints(160);

const roadX = (z) => Math.sin(z * 0.042) * 4 + Math.sin(z * 0.013 + 1) * 2.4;
const PEAK = { x: 0, z: -176, h: 52 };
const CLUSTER = { x: 0, z: -218, r: 14 };

/* ---------- cerul ---------- */
const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 20), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    varying vec3 vDir; uniform float uDawn; uniform float uTime;
    float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453), b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
      float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453), e = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
      return mix(mix(a, b, f.x), mix(c, e, f.x), f.y); }
    void main(){
      vec3 d = normalize(vDir);
      float h = clamp(d.y, -0.1, 1.0);
      vec3 night = mix(vec3(0.020,0.018,0.017), vec3(0.004,0.005,0.009), smoothstep(0.0, 0.42, h));
      vec3 dawnA = mix(vec3(0.17,0.095,0.04), vec3(0.018,0.015,0.018), smoothstep(0.0, 0.32, h));
      vec3 c = mix(night, dawnA, uDawn * uDawn);
      float sun = max(dot(d, normalize(vec3(0.0, 0.035, -1.0))), 0.0);
      c += vec3(1.0, 0.66, 0.30) * (pow(sun, 9.0) * 0.09 + pow(sun, 90.0) * 0.24) * (0.2 + uDawn * 1.15);
      c += vec3(1.0, 0.86, 0.6) * pow(sun, 1500.0) * uDawn * 1.6;
      vec2 cp = d.xz / (max(d.y, 0.0) + 0.18) * 1.5 + vec2(uTime * 0.035, uTime * 0.012);
      float cloud = vn(cp) * 0.55 + vn(cp * 2.1 + 4.0 - uTime * 0.02) * 0.3 + vn(cp * 4.3 + 9.0) * 0.15;
      cloud = smoothstep(0.46, 0.8, cloud) * smoothstep(0.0, 0.1, h) * (1.0 - smoothstep(0.32, 0.72, h));
      c += mix(vec3(0.07, 0.054, 0.034), vec3(0.34, 0.2, 0.09), uDawn) * cloud;
      vec3 cell = floor(d * 240.0);
      float s = step(0.9972, hash(cell));
      c += s * vec3(0.8,0.75,0.6) * (0.5 + 0.5 * sin(uTime * 1.3 + hash(cell + 3.0) * 40.0)) * smoothstep(0.04, 0.3, h) * (1.0 - uDawn * 0.8) * 0.75;
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`
}));
sky.renderOrder = -10;
scene.add(sky);

/* ---------- orașul de lumânări ---------- */
const candleVert = `
  attribute vec3 aInfo;
  attribute float aLive;
  varying vec3 vN; varying vec3 vWorld; varying vec3 vLocal; varying vec3 vSize; varying vec3 vInfo; varying float vLive;
  uniform float uMirror; uniform float uTime;
  void main(){
    vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    float seed = aInfo.z;
    float beat = uTime * (0.9 + seed * 1.7) + seed * 173.0;
    float wave = sin(beat) * 0.56 + sin(beat * 2.3 + seed * 391.0) * 0.28 + sin(beat * 0.37 + seed * 57.0) * 0.36;
    float grow = wave * aLive;
    float lift = (1.0 - aInfo.y) * (0.5 + 0.5 * sin(beat * 0.8 + seed * 91.0)) * aLive * 0.5;
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    w.y += position.y * grow + (1.0 - position.y) * lift;
    vSize = vec3(sc.x, sc.y + grow - lift, sc.z);
    vLocal = position * vSize;
    vN = normal;
    vInfo = aInfo;
    vLive = wave;
    vWorld = w.xyz;
    if (uMirror > 0.5) w.y *= -1.0;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const candleFrag = `
  precision highp float;
  varying vec3 vN; varying vec3 vWorld; varying vec3 vLocal; varying vec3 vSize; varying vec3 vInfo; varying float vLive;
  uniform vec3 uCam; uniform float uTime; uniform float uDawn; uniform float uMirror;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  void main(){
    float bull = vInfo.x, kind = vInfo.y, sd = vInfo.z;
    vec3 V = normalize(uCam - vWorld);
    vec3 N = normalize(vN);
    float ndv = abs(dot(N, V));
    float rim = pow(1.0 - ndv, 3.0);
    float top = step(0.5, N.y);
    float yn = clamp(vLocal.y / max(vSize.y, 0.001), 0.0, 1.0);

    float dist0 = length(uCam - vWorld);
    vec3 base = mix(vec3(0.0085,0.0085,0.0105), vec3(0.052,0.036,0.015), bull);
    base *= mix(0.5, 1.18, yn);
    /* reflexie verticală, ca pe sticlă închisă */
    float sheen = pow(max(1.0 - abs(dot(normalize(vec3(V.x, 0.0, V.z)), N)), 0.0), 2.0);
    base += mix(vec3(0.010,0.013,0.020), vec3(0.055,0.038,0.016), bull) * sheen;

    vec3 q = abs(vLocal - vec3(0.0, vSize.y * 0.5, 0.0));
    vec3 e = vSize * 0.5 - q;
    float a = abs(N.x) > 0.5 ? e.z : e.x;
    float b = abs(N.y) > 0.5 ? a : e.y;
    float w = 0.022 + dist0 * 0.0007;
    float edge = 1.0 - smoothstep(0.0, w, min(a, b));

    /* ferestre înguste și rare, ca liniile unui zgârie-nori văzut de departe */
    float lit = 0.0;
    if (top < 0.5 && kind < 0.5) {
      float u = abs(N.x) > 0.5 ? vLocal.z : vLocal.x;
      vec2 g = vec2(u * 3.4 + sd * 20.0, vLocal.y * 1.15);
      vec2 id = floor(g);
      vec2 f = fract(g);
      float cell = step(0.3, f.x) * step(f.x, 0.7) * step(0.12, f.y) * step(f.y, 0.86);
      float on = step(mix(0.975, 0.86, bull), hash(id + sd * 7.0));
      float tw = 0.72 + 0.28 * sin(uTime * (0.3 + hash(id) * 0.8) + hash(id + 2.0) * 30.0);
      lit = cell * on * tw * smoothstep(9.0, 34.0, dist0);
    }
    vec3 goldLine = vec3(0.96, 0.69, 0.30);
    vec3 col = base;
    col += goldLine * lit * mix(0.42, 0.74, bull);
    col += goldLine * edge * mix(0.07, 0.56, bull) * mix(0.5, 1.15, yn) * mix(0.6, 1.0, smoothstep(10.0, 50.0, dist0));
    col += mix(vec3(0.05,0.08,0.14), vec3(0.42,0.28,0.12), bull) * rim * 0.28;
    col += goldLine * top * mix(0.012, 0.5, bull * bull);
    /* când o lumânare urcă, vârful ei se aprinde; un val de lumină străbate orașul din când în când */
    if (kind < 0.5) col += goldLine * smoothstep(0.9, 1.0, yn) * max(vLive, 0.0) * mix(0.22, 0.6, bull);
    float pulseWave = pow(0.5 + 0.5 * sin(vWorld.z * 0.03 - vWorld.x * 0.012 + uTime * 0.42), 12.0);
    col += goldLine * (edge * 0.5 + lit * 0.45 + top * 0.12) * pulseWave;
    /* doar lumânările-reper ard cu adevărat auriu, spre vârf */
    float hero = smoothstep(0.82, 1.0, bull);
    col += vec3(0.62,0.40,0.14) * hero * pow(yn, 2.4) * 0.62 * mix(0.14, 1.0, smoothstep(14.0, 80.0, dist0));
    if (kind > 0.5) col = mix(vec3(0.05,0.045,0.04), goldLine * 0.9, bull) * mix(0.5, 1.2, 1.0 - abs(yn - 0.5) * 2.0);

    float dawnL = max(dot(N, normalize(vec3(0.0, 0.3, -1.0))), 0.0);
    col += vec3(1.0, 0.60, 0.24) * dawnL * uDawn * uDawn * 0.2;

    float dist = length(uCam - vWorld);
    float fog = 1.0 - exp(-pow(dist * 0.0095, 1.6));
    vec3 fogC = mix(vec3(0.020,0.018,0.017), vec3(0.17,0.095,0.04), uDawn * uDawn);
    col = mix(col, fogC, fog);

    if (uMirror > 0.5) {
      col *= 0.5;
      col = mix(col, fogC * 0.45, smoothstep(1.0, 26.0, vWorld.y));
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const candles = [];
const addCandle = (x, z, bodyBase, bodyH, w, bull, wTop, wBot) => candles.push({ x, z, bodyBase, bodyH, w, bull, wTop, wBot });
const nearPath = (x, z, r) => camSamples.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r);

const stepZ = lowEnd || small ? 13 : 10.5;
const stepX = lowEnd || small ? 11 : 8.8;
for (let z = 26; z > -345; z -= stepZ) {
  for (let x = -78; x <= 78; x += stepX) {
    const px = x + (rnd() - 0.5) * 2.6, pz = z + (rnd() - 0.5) * 2.6;
    const off = Math.abs(px - roadX(pz));
    if (off < 8.5 || nearPath(px, pz, 12)) continue;
    if (Math.hypot(px - PEAK.x, pz - PEAK.z) < 9 || Math.hypot(Math.hypot(px - CLUSTER.x, pz - CLUSTER.z) - CLUSTER.r, 0) < 6) continue;
    if (rnd() < 0.16) continue;
    const dist = clamp(off / 46);
    const h = (6 + rnd() * rnd() * 34) * lerp(0.62, 1.32, dist) + (rnd() > 0.93 ? 16 : 0);
    const base = 1.6 + rnd() * (2 + h * 0.2);
    const roll = rnd();
    addCandle(px, pz, base, h, 2.1 + rnd() * 1.9, roll > 0.9 ? 1 : roll > 0.52 ? 0.42 : 0, 1.5 + rnd() * h * 0.26, base);
  }
}
addCandle(PEAK.x, PEAK.z, 5, PEAK.h, 6.2, 1, 12, 5);
candles[candles.length - 1].fixed = true;
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  addCandle(CLUSTER.x + Math.cos(a) * CLUSTER.r, CLUSTER.z + Math.sin(a) * CLUSTER.r, 3, 15 + (i % 3) * 3.5, 2.8, 1, 4, 3);
  candles[candles.length - 1].fixed = true;
}

const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
function buildCity(mirror) {
  const count = candles.length * 2;
  const geo = unit.clone();
  const info = new Float32Array(count * 3);
  const live = new Float32Array(count);
  const mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
    vertexShader: candleVert, fragmentShader: candleFrag,
    uniforms: { ...uniforms, uMirror: { value: mirror ? 1 : 0 } },
    side: mirror ? THREE.BackSide : THREE.FrontSide, toneMapped: false
  }), count);
  const M = new THREE.Matrix4();
  candles.forEach((c, i) => {
    const s = (c.x * 0.137 + c.z * 0.071) % 1;
    M.makeScale(c.w, c.bodyH, c.w).setPosition(c.x, c.bodyBase, c.z);
    mesh.setMatrixAt(i * 2, M);
    const amp = Math.min(c.bodyH * 0.22, 7) * (c.fixed ? 0.45 : 1);
    live[i * 2] = amp;
    live[i * 2 + 1] = amp;
    info.set([c.bull, 0, Math.abs(s)], i * 2 * 3);
    M.makeScale(0.11, c.wBot + c.bodyH + c.wTop, 0.11).setPosition(c.x, c.bodyBase - c.wBot, c.z);
    mesh.setMatrixAt(i * 2 + 1, M);
    info.set([c.bull, 1, Math.abs(s)], (i * 2 + 1) * 3);
  });
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 3));
  geo.setAttribute('aLive', new THREE.InstancedBufferAttribute(live, 1));
  mesh.frustumCulled = false;
  return mesh;
}
if (!lowEnd && !small) {
  const mirrorCity = buildCity(true);
  mirrorCity.renderOrder = -20;
  scene.add(mirrorCity);
}

/* ---------- pardoseală lucioasă ---------- */
const floor = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, toneMapped: false, uniforms,
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `
    precision highp float;
    varying vec3 vW; uniform vec3 uCam; uniform float uDawn; uniform float uTime;
    float roadX(float z){ return sin(z*0.042)*4.0 + sin(z*0.013+1.0)*2.4; }
    void main(){
      float dist = length(uCam - vW);
      vec2 g = abs(fract(vW.xz / 8.0 - 0.5) - 0.5) * 8.0;
      float fw = 0.015 + dist * 0.0011;
      float grid = 1.0 - smoothstep(0.0, fw, min(g.x, g.y));
      float off = abs(vW.x - roadX(vW.z));
      float road = exp(-off * off * 0.09);
      float flow = pow(0.5 + 0.5 * sin(vW.z * 0.42 + uTime * 1.3), 9.0);
      vec3 gold = vec3(0.98, 0.70, 0.28);
      vec3 c = vec3(0.012, 0.011, 0.012);
      c += gold * grid * 0.04 * exp(-dist * 0.018);
      c += gold * road * (0.05 + flow * 0.2);
      vec2 lineId = floor(vW.xz / 8.0 + 0.5);
      float hx = fract(sin(lineId.x * 12.9898) * 43758.5453), hz = fract(sin(lineId.y * 78.233) * 43758.5453);
      float px = pow(fract(vW.z * 0.014 + uTime * (0.05 + hx * 0.09) + hx * 7.0), 26.0) * step(0.62, hx) * (1.0 - smoothstep(0.0, fw * 1.7, g.x));
      float pz = pow(fract(vW.x * 0.014 - uTime * (0.05 + hz * 0.09) + hz * 5.0), 26.0) * step(0.62, hz) * (1.0 - smoothstep(0.0, fw * 1.7, g.y));
      c += gold * (px + pz) * 1.1 * exp(-dist * 0.011);
      vec3 V = normalize(uCam - vW);
      float fres = pow(1.0 - max(V.y, 0.0), 4.0);
      float fog = 1.0 - exp(-pow(dist * 0.0095, 1.6));
      vec3 fogC = mix(vec3(0.020,0.018,0.017), vec3(0.17,0.095,0.04), uDawn * uDawn);
      c = mix(c, fogC, fog);
      float a = mix(0.86, 0.56, fres);
      a = mix(a, 1.0, fog);
      gl_FragColor = vec4(c, a);
      #include <colorspace_fragment>
    }`
}));
floor.renderOrder = -4;
scene.add(floor);

const city = buildCity(false);
/* clădirile se desenează primele, ca cerul și reflexia să nu mai calculeze pixeli pe care îi acoperă oricum */
city.renderOrder = -30;
scene.add(city);

/* ---------- linia prețului: se desenează în fața camerei ---------- */
const CHART = (t) => {
  const z = lerp(30, -330, t);
  const trend = 3.4 + t * 27;
  const wave = Math.sin(t * 25) * 2.3 + Math.sin(t * 61 + 1) * 1.15 + Math.sin(t * 131) * 0.5;
  const dip = -5.4 * Math.exp(-Math.pow((t - 0.3) / 0.04, 2)) - 7 * Math.exp(-Math.pow((t - 0.62) / 0.05, 2));
  return new THREE.Vector3(roadX(z) + Math.sin(t * 40) * 0.8, Math.max(1.6, trend + wave + dip), z);
};
const linePts = [];
for (let i = 0; i <= 560; i++) linePts.push(CHART(i / 560));
const lineCurve = new THREE.CatmullRomCurve3(linePts);
const lineMat = (radiusGlow) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { ...uniforms, uGlow: { value: radiusGlow } },
  vertexShader: 'varying float vU; varying vec3 vN; varying vec3 vV; void main(){ vU = uv.x; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: `
    varying float vU; varying vec3 vN; varying vec3 vV; uniform float uDraw; uniform float uTime; uniform float uGlow;
    void main(){
      float show = smoothstep(uDraw + 0.002, uDraw - 0.012, vU);
      float head = exp(-pow((vU - uDraw) * 170.0, 2.0));
      float pulse = pow(0.5 + 0.5 * sin(vU * 130.0 - uTime * 2.2), 14.0);
      vec3 c = vec3(1.0, 0.76, 0.34);
      float a;
      if (uGlow > 0.5) { a = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 2.6) * 0.13; }
      else { a = 0.82 + pulse * 0.5; c = mix(c, vec3(1.0, 0.9, 0.68), pulse * 0.55); }
      gl_FragColor = vec4(c * (1.0 + head * 3.0), a * show);
      #include <colorspace_fragment>
    }`
});
scene.add(new THREE.Mesh(new THREE.TubeGeometry(lineCurve, 1100, 0.03, 6, false), lineMat(0)));
scene.add(new THREE.Mesh(new THREE.TubeGeometry(lineCurve, 700, 0.3, 8, false), lineMat(1)));

/* halourile aduc lumina pe care un bloom ar aduce-o, fără costul lui */
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
const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xffc66e, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
headGlow.scale.setScalar(5);
scene.add(headGlow);

/* ---------- faruri: harta în 6 pași și cele 12 sisteme ---------- */
const pillarGeo = (() => {
  const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const pos = new Float32Array([...a.attributes.position.array, ...b.attributes.position.array]);
  const uv = new Float32Array([...a.attributes.uv.array, ...b.attributes.uv.array]);
  const idx = [...a.index.array, ...[...b.index.array].map((i) => i + 4)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
})();
const beacons = [];
for (let i = 0; i < 6; i++) {
  const t = i / 5;
  const z = lerp(-66, PEAK.z, t);
  beacons.push({ x: i === 5 ? PEAK.x : roadX(z), z, y: i === 5 ? PEAK.h + 17 : 0.1, h: i === 5 ? 180 : 42, w: i === 5 ? 4.2 : 2.2, on: 2 + t * 0.92 + 0.03, off: 99 });
}
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  beacons.push({ x: CLUSTER.x + Math.cos(a) * CLUSTER.r, z: CLUSTER.z + Math.sin(a) * CLUSTER.r, y: 20, h: 70, w: 1.6, on: 7.05 + i * 0.075, off: 10.9 });
}
const beaconOn = new Float32Array(beacons.length);
const pillarAttr = new THREE.InstancedBufferAttribute(beaconOn, 1);
pillarGeo.setAttribute('aOn', pillarAttr);
const pillars = new THREE.InstancedMesh(pillarGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  vertexShader: 'attribute float aOn; varying vec2 vUv; varying float vOn; void main(){ vUv = uv; vOn = aOn; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position,1.0); }',
  fragmentShader: `varying vec2 vUv; varying float vOn; void main(){ float x = abs(vUv.x - 0.5) * 2.0; float a = pow(1.0 - x, 3.2) * pow(1.0 - vUv.y, 1.5) * vOn * 0.62; gl_FragColor = vec4(vec3(1.0, 0.76, 0.38), a);
    #include <colorspace_fragment>
  }`
}), beacons.length);
{
  const M = new THREE.Matrix4();
  beacons.forEach((b, i) => { M.makeScale(b.w, b.h, b.w).setPosition(b.x, b.y, b.z); pillars.setMatrixAt(i, M); });
  pillars.frustumCulled = false;
  scene.add(pillars);
}
const flareGeo = new THREE.BufferGeometry();
flareGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(beacons.flatMap((b) => [b.x, b.y + 0.4, b.z])), 3));
flareGeo.setAttribute('aOn', pillarAttr);
const flares = new THREE.Points(flareGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uTex: { value: softDot }, uPx: { value: 1 } },
  vertexShader: 'attribute float aOn; varying float vOn; uniform float uPx; void main(){ vOn = aOn; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(uPx * 460.0 * aOn / max(-mv.z, 1.0), 260.0 * uPx); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform sampler2D uTex; varying float vOn; void main(){ if (vOn < 0.01) discard; vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(1.0,0.78,0.42), t.a * vOn);\n#include <colorspace_fragment>\n}'
}));
flares.frustumCulled = false;
scene.add(flares);

/* ---------- praf auriu și bokeh aproape de cameră ---------- */
function dust(n, spreadXY, size, opacity) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rnd() - 0.5) * spreadXY;
    pos[i * 3 + 1] = rnd() * spreadXY * 0.5 - spreadXY * 0.12;
    pos[i * 3 + 2] = -rnd() * spreadXY;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ map: softDot, color: 0xe2b768, size, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  p.frustumCulled = false;
  scene.add(p);
  return p;
}
const fine = dust(lowEnd ? 120 : 280, 90, 0.16, 0.8);
const bokeh = dust(lowEnd ? 16 : 32, 40, 2.1, 0.13);

/* ---------- viața orașului ---------- */
const beams = [];
if (!lowEnd) {
  /* trasee luminoase care zboară printre clădiri */
  const trailMat = (i, speed, count, tone) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uTime: uniforms.uTime, uS: { value: i * 0.37 }, uV: { value: speed }, uN: { value: count }, uC: { value: tone } },
    vertexShader: 'varying float vU; varying float vD; void main(){ vU = uv.x; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `varying float vU; varying float vD; uniform float uTime; uniform float uS; uniform float uV; uniform float uN; uniform vec3 uC;
      void main(){
        float t = fract(vU * uN - uTime * uV + uS);
        float comet = pow(t, 16.0) * smoothstep(1.0, 0.985, t);
        float a = (comet * 1.1 + 0.035) * exp(-vD * 0.0075) * smoothstep(2.5, 11.0, vD);
        gl_FragColor = vec4(uC * (1.0 + comet * 0.8), a);
        #include <colorspace_fragment>
      }`
  });
  const gold = new THREE.Vector3(1.0, 0.72, 0.32), cream = new THREE.Vector3(1.0, 0.9, 0.7);
  const trailCount = small ? 7 : 13;
  for (let i = 0; i < trailCount; i++) {
    const high = i % 3 === 2;
    const z0 = 34 - (i / trailCount) * 300, len = high ? 150 : 96, dir = i % 2 ? 1 : -1;
    const pts = [];
    const seg = 9;
    for (let k = 0; k <= seg; k++) {
      const u = k / seg, z = z0 - u * len;
      const x = high ? dir * lerp(-70, 70, u) : roadX(z) + dir * (2.6 + Math.sin(u * 7 + i) * 3);
      const y = high ? 58 + Math.sin(u * 5 + i) * 8 : 15 + (i % 5) * 3.4 + Math.sin(u * 6 + i * 2) * 2.2;
      pts.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 110, high ? 0.075 : 0.038, 4, false), trailMat(i, 0.05 + (i % 4) * 0.018, high ? 2 : 3, i % 2 ? gold : cream));
    m.frustumCulled = false;
    scene.add(m);
  }

  /* scântei care urcă dintre clădiri */
  const n = small ? 300 : 760;
  const base = new Float32Array(n * 3), rise = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    base[i * 3] = (rnd() - 0.5) * 150;
    base[i * 3 + 1] = rnd();
    base[i * 3 + 2] = 30 - rnd() * 370;
    rise[i * 2] = 0.012 + rnd() * 0.028;
    rise[i * 2 + 1] = rnd() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(base, 3));
  g.setAttribute('aRise', new THREE.BufferAttribute(rise, 2));
  const sparks = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uTime: uniforms.uTime, uTex: { value: softDot }, uPx: flares.material.uniforms.uPx },
    vertexShader: `attribute vec2 aRise; uniform float uTime; uniform float uPx; varying float vA;
      void main(){
        float y = fract(position.y + uTime * aRise.x);
        vec3 p = vec3(position.x + sin(uTime * 0.4 + aRise.y) * 1.3, y * 52.0, position.z + cos(uTime * 0.33 + aRise.y) * 1.3);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.55, 1.0, y)) * (0.45 + 0.55 * sin(uTime * 1.6 + aRise.y * 3.0)) * exp(-(-mv.z) * 0.009);
        gl_PointSize = min(uPx * 42.0 / max(-mv.z, 1.0), 9.0 * uPx);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ if (vA <= 0.003) discard; gl_FragColor = vec4(1.0, 0.76, 0.38, texture2D(uTex, gl_PointCoord).a * vA);
        #include <colorspace_fragment>
      }`
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);

  /* reflectoare care mătură cerul, de pe cele mai înalte clădiri */
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv;
      void main(){ float x = abs(vUv.x - 0.5) * 2.0; float spread = mix(0.1, 1.0, vUv.y);
        float a = pow(max(1.0 - x / spread, 0.0), 2.4) * pow(1.0 - vUv.y, 1.6) * 0.17;
        gl_FragColor = vec4(1.0, 0.78, 0.44, a);
        #include <colorspace_fragment>
      }`
  });
  const plane = new THREE.PlaneGeometry(30, 210).translate(0, 105, 0);
  [-40, -112, -196, -262, -322].forEach((z, i) => {
    const pick = candles.filter((c) => Math.abs(c.z - z) < 26 && Math.abs(c.x) > 16 && !c.fixed && (i % 2 ? c.x > 0 : c.x < 0)).sort((a, c) => c.bodyH - a.bodyH)[0];
    if (!pick) return;
    const beam = new THREE.Group();
    beam.position.set(pick.x, pick.bodyBase + pick.bodyH, pick.z);
    const a = new THREE.Mesh(plane, beamMat);
    const c = new THREE.Mesh(plane, beamMat);
    c.rotation.y = Math.PI / 2;
    a.frustumCulled = c.frustumCulled = false;
    beam.add(a, c);
    scene.add(beam);
    beams.push({ beam, s: i * 1.9, r: (i % 2 ? -1 : 1) * 0.3 });
  });
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
  if (route) {
    anchors = [[0, route[0]], [Math.max(document.documentElement.scrollHeight - vh, 1), route[1]]];
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
  camera.aspect = W / H;
  camera.fov = W < H ? 62 : 46;
  camera.updateProjectionMatrix();
  flares.material.uniforms.uPx.value = dpr;
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
const pos = new THREE.Vector3(), look = new THREE.Vector3();
const lastKey = KEYS.length - 1;
function render(T, time) {
  const u = clamp(T / lastKey);
  posCurve.getPoint(u, pos);
  lookCurve.getPoint(u, look);
  const i = Math.min(Math.floor(T), lastKey - 1), f = T - i;
  const k0 = KEYS[i], k1 = KEYS[i + 1];
  const s = smooth(0, 1, f);
  const roll = lerp(k0[6], k1[6], s);
  const dawn = lerp(k0[7], k1[7], s);
  if (small) { pos.y += 2; }
  pos.x += Math.sin(time * 0.13) * 0.55;
  pos.y += Math.sin(time * 0.17) * 0.3;
  look.x += Math.sin(time * 0.09 + 1) * 0.7;
  camera.position.copy(pos);
  camera.up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.lookAt(look);

  uniforms.uTime.value = time;
  beams.forEach((b) => {
    b.beam.rotation.z = b.r + Math.sin(time * 0.13 + b.s) * 0.46;
    b.beam.rotation.x = Math.cos(time * 0.1 + b.s) * 0.3;
  });
  headGlow.scale.setScalar(4.6 + Math.sin(time * 1.5) * 0.9);
  uniforms.uDawn.value = dawn;
  uniforms.uCam.value.copy(pos);
  sky.position.copy(pos);

  /* linia se desenează cu puțin înaintea camerei */
  const lineZ = pos.z - 48 - T * 2;
  const draw = clamp((30 - lineZ) / 360, 0.03, 1);
  uniforms.uDraw.value = draw;
  lineCurve.getPointAt(draw, headGlow.position);

  let changed = false;
  beacons.forEach((b, n) => {
    const v = Math.round(smooth(b.on, b.on + 0.1, T) * (1 - smooth(b.off, b.off + 0.5, T)) * 50) / 50;
    if (beaconOn[n] !== v) { beaconOn[n] = v; changed = true; }
  });
  if (changed) pillarAttr.needsUpdate = true;

  fine.position.set(pos.x, 0, pos.z + 42);
  fine.rotation.y = Math.sin(time * 0.04) * 0.05;
  const wrap = (((pos.z * 0.8 % 40) + 40) % 40);
  bokeh.position.set(pos.x + Math.sin(T * 0.8) * 3, pos.y - 2, pos.z + 8 + wrap - 20);

  renderer.render(scene, camera);
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
  flares.material.uniforms.uPx.value = v;
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

document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) { dirty = true; kick(); } });
window.addEventListener('scroll', kick, { passive: true });
new ResizeObserver(() => {
  const w = window.innerWidth, h = window.innerHeight;
  if (w === lastW && Math.abs(h - lastH) < 120) { computeAnchors(); return; }
  lastW = w; lastH = h;
  resize();
}).observe(document.documentElement);
if (document.fonts) document.fonts.ready.then(() => { computeAnchors(); dirty = true; kick(); });
window.addEventListener('load', () => { computeAnchors(); dirty = true; kick(); });

lastW = window.innerWidth; lastH = window.innerHeight;
resize();
curT = reduced.matches ? targetT() : targetT();
render(curT, 0);
