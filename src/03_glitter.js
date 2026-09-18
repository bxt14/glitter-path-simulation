/* ════════════════════════════════════════════════════════════════
   标签页 ①  反射亮线模拟
   ════════════════════════════════════════════════════════════════ */

const SUN_R = 6;            // 太阳把手的轨道半径
const MIN_Z = 0.15;         // 点光源 / 眼睛的最低高度
const THICK = 0.06;         // 金属基底厚度
const GLIT_Z = THICK / 2 + 0.002; // 发光层 z 偏移，避免 z-fighting
const TRIPOD_LEN = 0.7, TRIPOD_GAP = 0.8;
const INF_SIZE = 60;        // 「无穷大反射面」的近似边长（圆盘半径取一半），远处交给雾淡出

const DEFAULTS = {
  lightMode: 'parallel',
  azimuth: 95, elevation: 45,
  pointLightPos: { x: -2.5, y: 2.0, z: 4.5 },
  surfaceType: 'plate',
  plateWidth: 4, plateDepth: 3, grooveAngle: 0, diskRadius: 2,
  eyePos: { x: 0.2, y: -2.2, z: 1.7 },
  specularH: 0, focalLength: 50,
  centerX: 0, centerY: 0,
  showGlitterPoint: false, showEyeCone: false, infiniteSurface: false,
};
const clone = (p) => ({ ...p, pointLightPos: { ...p.pointLightPos }, eyePos: { ...p.eyePos } });

const PRESETS = [
  // 亮线位置：平行光 + 沟槽沿 x（grooveAngle 0）时亮线就是 x = 眼睛的 x ⟹ 眼睛 x 取 0 即居中
  ['正午阳光 · 拉丝板', { lightMode: 'parallel', azimuth: 90, elevation: 70, surfaceType: 'plate', grooveAngle: 0, eyePos: { x: 0, y: -3, z: 2.2 }, focalLength: 50 }],
  // 沟槽沿 y（grooveAngle 90）时是真双曲线，顶点在镜面点 O；取 eyeY = −eyeZ·cot(仰角) 让 O 落在板心
  ['夕阳 · 拉丝板', { lightMode: 'parallel', azimuth: 90, elevation: 15, surfaceType: 'plate', grooveAngle: 90, plateWidth: 5, plateDepth: 4, eyePos: { x: 0, y: -6.3, z: 1.7 }, focalLength: 35 }],
  // 灯正对盘心（x=y=0）时 p̂ 处处沿半径、p̂·t̂ ≡ 0，亮线退化成一条极细的直径，几乎看不见；把灯挪偏一点才有弧线
  ['头顶灯 · 圆盘', { lightMode: 'point', pointLightPos: { x: 1.2, y: 1.5, z: 4 }, surfaceType: 'disk', eyePos: { x: 2, y: -3, z: 2 }, focalLength: 50 }],
  // 眼睛偏离入射面（x≠0）+ 压低眼高，圆盘上的亮线才明显弯成双曲线状；x=0 会退化成一条直径
  ['低角度灯 · 圆盘', { lightMode: 'point', pointLightPos: { x: 0, y: 4.5, z: .8 }, surfaceType: 'disk', diskRadius: 2.4, eyePos: { x: 1.6, y: -4, z: 1.0 }, focalLength: 50 }],
].map(([label, patch]) => [label, { ...clone(DEFAULTS), ...clone(patch) }]);

/* ── 亮线数学（CPU 侧，与着色器中的 f(Q) 同一公式） ───────────── */

/** 平行光下观察者的有效位置：eyePos + h·r̂（r̂ = 入射光的镜面反射方向） */
function effEye(p) {
  if (p.lightMode !== 'parallel' || !p.specularH) return p.eyePos;
  const az = p.azimuth * DEG, el = p.elevation * DEG;
  return {
    x: p.eyePos.x + p.specularH * -Math.cos(el) * Math.cos(az),
    y: p.eyePos.y + p.specularH * -Math.cos(el) * Math.sin(az),
    z: p.eyePos.z + p.specularH * Math.sin(el),
  };
}

/** f(Q) = (p̂ − q̂)·t̂，Q 在 z=0 平面上；零堆分配 */
function fAt(p, qx, qy, qz = 0) {
  let px, py;
  if (p.lightMode === 'point') {
    px = qx - p.pointLightPos.x; py = qy - p.pointLightPos.y;
    const pz = qz - p.pointLightPos.z;
    const n = Math.hypot(px, py, pz) || 1;
    px /= n; py /= n;
  } else {
    const az = p.azimuth * DEG, el = p.elevation * DEG;
    px = -Math.cos(el) * Math.cos(az); py = -Math.cos(el) * Math.sin(az);
  }
  const E = effEye(p);
  const ex = E.x - qx, ey = E.y - qy, ez = E.z - qz;
  const en = Math.hypot(ex, ey, ez) || 1;
  let tx = 0, ty = 0;
  if (p.surfaceType === 'plate') {
    const a = p.grooveAngle * DEG;
    tx = Math.cos(a); ty = Math.sin(a);
  } else {
    const rx = qx - p.centerX, ry = qy - p.centerY;
    const r = Math.hypot(rx, ry);
    if (r >= 1e-4) { tx = -ry / r; ty = rx / r; }
  }
  return (px - ex / en) * tx + (py - ey / en) * ty;
}

function inBounds(p, qx, qy) {
  if (p.infiniteSurface) return true;
  const dx = qx - p.centerX, dy = qy - p.centerY;
  if (p.surfaceType === 'disk') return Math.hypot(dx, dy) <= p.diskRadius + 1e-6;
  const a = p.grooveAngle * DEG;
  const lx = dx * Math.cos(a) + dy * Math.sin(a);
  const ly = -dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= p.plateWidth / 2 + 1e-6 && Math.abs(ly) <= p.plateDepth / 2 + 1e-6;
}

/** 把目标点投影到亮线 f=0 上：牛顿迭代压零 + 沿切线滑向目标（从 guess 出发保证分支连续） */
function projectToLine(p, Tx, Ty, gx0, gy0, out) {
  let qx = gx0, qy = gy0;
  const h = 1e-3;
  for (let i = 0; i < 30; i++) {
    const f = fAt(p, qx, qy);
    const gx = (fAt(p, qx + h, qy) - f) / h;
    const gy = (fAt(p, qx, qy + h) - f) / h;
    const n2 = gx * gx + gy * gy;
    if (n2 < 1e-12) break;
    qx -= (gx * f) / n2; qy -= (gy * f) / n2;
    const s = (((Tx - qx) * -gy + (Ty - qy) * gx) / n2) * 0.6;
    qx += -gy * s; qy += gx * s;
  }
  if (Math.abs(fAt(p, qx, qy)) < 1e-5 && inBounds(p, qx, qy)) { out.x = qx; out.y = qy; return true; }
  return false;
}

/** 初始亮点：优先取镜面反射点 O（必在亮线上），否则粗采样再精化 */
function findLinePoint(p, out) {
  let ox, oy;
  const E = effEye(p);
  if (p.lightMode === 'point') {
    const s = p.pointLightPos.z / (p.pointLightPos.z + E.z);
    ox = p.pointLightPos.x + (E.x - p.pointLightPos.x) * s;
    oy = p.pointLightPos.y + (E.y - p.pointLightPos.y) * s;
  } else {
    const az = p.azimuth * DEG, el = p.elevation * DEG;
    const dx = -Math.cos(el) * Math.cos(az), dy = -Math.cos(el) * Math.sin(az), dz = -Math.sin(el);
    // 从眼睛沿反射光线（水平分量与入射相同、竖直分量反号）倒推回板面
    const t = Math.abs(dz) < 1e-8 ? 0 : E.z / -dz;
    ox = E.x - dx * t; oy = E.y - dy * t;
  }
  if (inBounds(p, ox, oy) && Math.abs(fAt(p, ox, oy)) < 1e-6) { out.x = ox; out.y = oy; return true; }
  const ext = p.infiniteSurface ? 8 : p.surfaceType === 'disk' ? p.diskRadius : Math.max(p.plateWidth, p.plateDepth) / 2;
  let bx = 0, by = 0, best = Infinity, N = 50;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const qx = p.centerX - ext + (2 * ext * i) / N, qy = p.centerY - ext + (2 * ext * j) / N;
    if (!inBounds(p, qx, qy)) continue;
    const a = Math.abs(fAt(p, qx, qy));
    if (a < best) { best = a; bx = qx; by = qy; }
  }
  if (!isFinite(best)) return false;
  return projectToLine(p, bx, by, bx, by, out);
}

/* ── 着色器：逐像素解 f(Q)=0，|f|≈0 处发光 ────────────────────── */
const VERT = `
varying vec3 vWorldPos;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = `
uniform int uLightMode;     // 0 平行光 / 1 点光源
uniform vec3 uPointPos;
uniform vec3 uParallelDir;  // 传播方向 d̂ (z<0)
uniform vec3 uEye;
uniform vec3 uCenter;
uniform int uSurfaceType;   // 0 拉丝板 / 1 同心圆盘
uniform float uGrooveAngle;
uniform float uTime;
varying vec3 vWorldPos;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

void main(){
  vec3 Q = vWorldPos;
  vec3 rel = Q - uCenter;
  vec3 p = (uLightMode == 1) ? normalize(Q - uPointPos) : uParallelDir;
  vec3 q = normalize(uEye - Q);

  vec3 t;
  if (uSurfaceType == 0) {
    t = vec3(cos(uGrooveAngle), sin(uGrooveAngle), 0.0);
  } else {
    float r = length(rel.xy);
    // t̂ = normalize(ẑ × (Q−C))；Q=C 处退化为 0 → 圆心天然发亮
    t = (r < 1e-4) ? vec3(0.0) : vec3(-rel.y, rel.x, 0.0) / r;
  }

  // 核心发亮条件
  float f = dot(p - q, t);
  float aa = max(fwidth(f), 1e-7) * 2.0;      // 屏幕空间抗锯齿，线宽随距离稳定
  float core = 1.0 - smoothstep(0.0, aa, abs(f));
  float halo = 1.0 - smoothstep(0.0, aa * 5.0, abs(f));

  float sp = hash(floor(Q.xy * 140.0) + vec2(floor(uTime * 6.0)));
  vec3 col = vec3(1.0, 0.72, 0.35) * 2.5 * core * (0.75 + 0.25 * sp)
           + vec3(1.0, 0.60, 0.26) * 0.22 * halo * halo;   // 柔和外晕：线宽不变，只在录屏时更"有光"
  gl_FragColor = vec4(col, 1.0);
}`;

const focalToFov = (f) => (2 * Math.atan(12 / f)) / DEG;

/* ── 主场景 ───────────────────────────────────────────────────── */
class GlitterSim {
  constructor(stage, insetEl, params, onDrag, onSelect) {
    this.stage = stage; this.insetEl = insetEl; this.P = params;
    this.onDrag = onDrag; this.onSelect = onSelect;
    this.transformMode = 'translate';

    const rd = this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    rd.setPixelRatio(dprCap());
    rd.toneMapping = T.ACESFilmicToneMapping;
    Object.assign(rd.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    stage.insertBefore(rd.domElement, stage.firstChild);

    const sc = this.scene = new T.Scene();
    this.bgTex = canvasTex(2, 512, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, '#141a26'); g.addColorStop(.55, '#0c1017'); g.addColorStop(1, '#06080c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 512);
    });
    sc.background = this.bgTex;
    sc.fog = new T.Fog(0x0b0e13, 18, 42);
    this.envTex = studioEnv(rd);
    sc.environment = this.envTex;

    this.cam = new T.PerspectiveCamera(50, 1, 0.1, 200);
    this.cam.up.set(0, 0, 1);
    this.cam.position.set(6.2, 7.2, 4.6);
    this.cam.layers.enable(1);                 // 眼睛把手在 layer 1：主视图可见、观察者视角不可见
    this.eyeCam = new T.PerspectiveCamera(focalToFov(params.focalLength), 320 / 208, 0.05, 200);
    this.eyeCam.up.set(0, 0, 1);

    this.orbit = new Orbit(this.cam, rd.domElement);
    this.orbit.minDist = 2; this.orbit.maxDist = 30;

    const grid = new T.GridHelper(40, 40, 0x232c3e, 0x151b29);
    grid.rotation.x = Math.PI / 2; grid.position.z = -0.01;
    grid.material.transparent = true; grid.material.opacity = 0.45;
    sc.add(grid);
    sc.add(new T.AmbientLight(0x8899bb, 0.22));
    const key = new T.DirectionalLight(0xfff0dd, 0.45); key.position.set(4, -3, 6);
    const rim = new T.DirectionalLight(0x6a86b8, 0.25); rim.position.set(-5, 4, 2.5);
    sc.add(key, rim);

    // 接触阴影：柔和落地影，跟随反射面
    this.shadowTex = radialTex(256, [[0, 'rgba(0,0,0,.85)'], [.55, 'rgba(0,0,0,.42)'], [1, 'rgba(0,0,0,0)']]);
    this.shadow = new T.Mesh(new T.PlaneGeometry(1, 1),
      new T.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: .62 }));
    this.shadow.position.z = -0.005;
    sc.add(this.shadow);

    /* 反射面：PBR 金属基底 + additive 发光层 */
    this.glitMat = new T.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uLightMode: { value: 0 }, uPointPos: { value: new T.Vector3() },
        uParallelDir: { value: new T.Vector3(0, 0, -1) }, uEye: { value: new T.Vector3() },
        uCenter: { value: new T.Vector3() }, uSurfaceType: { value: 0 },
        uGrooveAngle: { value: 0 }, uTime: { value: 0 },
      },
      side: T.DoubleSide, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
    });
    const aniso = rd.capabilities.getMaxAnisotropy();
    // envMapIntensity 压到 0.42：棚拍环境本身很亮，全强度会把金属吹爆、亮线反而看不出来
    this.plateMat = new T.MeshPhysicalMaterial({ map: this.brushTex(aniso), metalness: .9, roughness: .38, envMapIntensity: .42 });
    this.diskMat = new T.MeshPhysicalMaterial({ map: this.diskTex(aniso), metalness: .9, roughness: .42, envMapIntensity: .45 });

    this.surfaceGroup = new T.Group();
    this.plateGroup = new T.Group();
    this.diskGroup = new T.Group();
    this.plateBase = new T.Mesh(new T.BoxGeometry(1, 1, THICK), this.plateMat);
    this.plateGlit = new T.Mesh(new T.PlaneGeometry(1, 1), this.glitMat);
    this.plateGlit.position.z = GLIT_Z;
    this.plateGroup.add(this.plateBase, this.plateGlit);
    this.diskBase = new T.Mesh(new T.CylinderGeometry(1, 1, THICK, 128).rotateX(Math.PI / 2), this.diskMat);
    this.diskGlit = new T.Mesh(new T.CircleGeometry(1, 160), this.glitMat);
    this.diskGlit.position.z = GLIT_Z; this.diskGlit.renderOrder = 1;
    this.diskGroup.add(this.diskBase, this.diskGlit);
    this.plateGroup.userData.dragId = this.diskGroup.userData.dragId = this.surfaceGroup.userData.dragId = 'surface';
    this.surfaceGroup.add(this.plateGroup, this.diskGroup);
    sc.add(this.surfaceGroup);
    this.geoKey = '';

    this.buildTripod(); sc.add(this.tripod);

    /* 把手 */
    this.sunTex = this.makeSunTex();
    this.bulbTex = this.makeBulbTex();
    this.lampHandle = new T.Group();
    this.sunHandle = new T.Group();
    this.eyeHandle = new T.Group();
    this.buildHandles();
    this.lamp = new T.PointLight(0xffc47a, 20, 0, 1.8);
    sc.add(this.lampHandle, this.sunHandle, this.eyeHandle, this.lamp);

    /* 光线指示 */
    const mkLine = (c, o) => new T.Line(
      new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]),
      new T.LineBasicMaterial({ color: c, transparent: true, opacity: o }));
    this.sightLine = mkLine(0x8fa3bf, .5);
    this.sightLine.layers.set(1);
    this.lampLine = mkLine(0xffb347, .45);
    this.sunRays = lineSeg(10, 0xffb347, .32);
    sc.add(this.sightLine, this.lampLine, this.sunRays);

    this.buildAnalysis();
    sc.add(this.pointGroup, this.eyeConeGroup);

    /* 选中与拖动 */
    this.gizmo = new Gizmo(this.cam, rd.domElement, sc);
    this.gizmo.onChange = () => this.onGizmoChange();
    this.gizmo.onEnd = () => this.onGizmoEnd();
    this.ray = new T.Raycaster();
    rd.domElement.addEventListener('pointerdown', this.onPick);
    // 指针压在手柄箭头上时不启动轨道旋转（Orbit 的监听先于本类注册，故用 filter 而非阻断事件）
    this.orbit.filter = (e) => !this.gizmo.pick(e);

    this.tmp = { d: new T.Vector3(), off: new T.Vector3(), a: new T.Vector3(), b: new T.Vector3(), P: new T.Vector3(), E: new T.Vector3(), ph: new T.Vector3(), s: new T.Vector3() };
    this.pointPos = new T.Vector3();
    this.pointNeedsInit = true;
    this.snap = new Float64Array(16);
    this.clock = new T.Clock();

    this.ro = onResize(stage, (w, h) => this.resize(w, h));
    this.roInset = onResize(insetEl, () => this.cacheRects());
    this.apply();
  }

  /* ---- 纹理 ---- */
  brushTex(aniso) {
    const t = canvasTex(512, 512, (ctx) => {
      ctx.fillStyle = '#8f9298'; ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 1000; i++) {
        const y = Math.random() * 512, l = 118 + Math.random() * 76;
        ctx.strokeStyle = `rgba(${l | 0},${(l + 2) | 0},${(l + 7) | 0},${.1 + Math.random() * .24})`;
        ctx.lineWidth = Math.random() < .85 ? 1 : 2;
        const x0 = Math.random() * 205 - 102;
        ctx.beginPath(); ctx.moveTo(x0, y);
        ctx.lineTo(x0 + 512 * (.6 + Math.random() * .8), y + (Math.random() - .5) * 1.6);
        ctx.stroke();
      }
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso;
    return t;
  }
  diskTex(aniso) {
    const t = canvasTex(512, 512, (ctx) => {
      ctx.fillStyle = '#8b8e94'; ctx.fillRect(0, 0, 512, 512);
      for (let r = 1.5; r < 512 * .72; r += .8 + Math.random() * 2.2) {
        const l = 112 + Math.random() * 80;
        ctx.strokeStyle = `rgba(${l | 0},${(l + 2) | 0},${(l + 7) | 0},${.1 + Math.random() * .26})`;
        ctx.lineWidth = Math.random() < .8 ? 1 : 2;
        ctx.beginPath(); ctx.arc(256, 256, r, 0, 7); ctx.stroke();
      }
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso;
    return t;
  }
  makeSunTex() {
    return canvasTex(256, 256, (ctx) => {
      const C = 128;
      const halo = ctx.createRadialGradient(C, C, 0, C, C, C);
      halo.addColorStop(0, 'rgba(255,210,140,.55)'); halo.addColorStop(.35, 'rgba(255,180,100,.22)');
      halo.addColorStop(.7, 'rgba(255,150,60,.07)'); halo.addColorStop(1, 'rgba(255,140,50,0)');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = 'rgba(255,179,71,.9)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(C + Math.cos(a) * 76.8, C + Math.sin(a) * 76.8);
        ctx.lineTo(C + Math.cos(a) * 94.7, C + Math.sin(a) * 94.7);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,196,122,.95)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(C, C, 56.3, 0, 7); ctx.stroke();
      const core = ctx.createRadialGradient(C, C, 0, C, C, 38.4);
      core.addColorStop(0, 'rgba(255,250,235,1)'); core.addColorStop(.7, 'rgba(255,214,150,1)');
      core.addColorStop(1, 'rgba(255,184,92,.95)');
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(C, C, 38.4, 0, 7); ctx.fill();
    });
  }
  makeBulbTex() {
    return canvasTex(128, 128, (ctx) => {
      const C = 64;
      const halo = ctx.createRadialGradient(C, C, 0, C, C, C);
      halo.addColorStop(0, 'rgba(255,224,170,.85)'); halo.addColorStop(.3, 'rgba(255,190,110,.4)');
      halo.addColorStop(.65, 'rgba(255,150,60,.12)'); halo.addColorStop(1, 'rgba(255,140,50,0)');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, 128, 128);
      const core = ctx.createRadialGradient(C, C, 0, C, C, 20.5);
      core.addColorStop(0, 'rgba(255,250,235,1)'); core.addColorStop(1, 'rgba(255,192,106,1)');
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(C, C, 20.5, 0, 7); ctx.fill();
    });
  }

  /* ---- 场景内世界坐标轴 ---- */
  buildTripod() {
    this.tripod = new T.Group();
    const Y = new T.Vector3(0, 1, 0);
    for (const [dir, color, label] of [[[1, 0, 0], 0xc05a52, 'X'], [[0, 1, 0], 0x6da26d, 'Y'], [[0, 0, 1], 0x5f83c4, 'Z']]) {
      const d = new T.Vector3(...dir);
      const mat = new T.MeshBasicMaterial({ color });
      const q = new T.Quaternion().setFromUnitVectors(Y, d);
      const shaft = new T.Mesh(new T.CylinderGeometry(.014, .014, TRIPOD_LEN, 10), mat);
      shaft.quaternion.copy(q); shaft.position.copy(d).multiplyScalar(TRIPOD_LEN / 2);
      const tip = new T.Mesh(new T.ConeGeometry(.04, .11, 12), mat);
      tip.quaternion.copy(q); tip.position.copy(d).multiplyScalar(TRIPOD_LEN + .055);
      const s = letterSprite(label, color, .2);
      s.position.copy(d).multiplyScalar(TRIPOD_LEN + .24);
      this.tripod.add(shaft, tip, s);
    }
    this.tripod.add(new T.Mesh(new T.SphereGeometry(.032, 12, 8), new T.MeshBasicMaterial({ color: 0x8b93a3 })));
  }

  /* ---- 把手：太阳 / 灯泡 / 眼睛 ---- */
  buildHandles() {
    // 注意：子对象绝不设 dragId，否则拾取会附着到子对象上，拖动时把手会散架
    const bulb = new T.Sprite(new T.SpriteMaterial({ map: this.bulbTex, transparent: true, depthWrite: false }));
    bulb.scale.setScalar(.8);
    const lampLabel = textSprite('点光源'); lampLabel.position.set(0, 0, .42);
    this.lampHandle.add(bulb, lampLabel);
    this.lampHandle.userData.dragId = 'pointLight';

    const sun = new T.Sprite(new T.SpriteMaterial({ map: this.sunTex, transparent: true, depthWrite: false }));
    sun.scale.setScalar(1.25);
    const sunLabel = textSprite('太阳 · 平行光'); sunLabel.position.set(0, 0, .66);
    this.sunHandle.add(sun, sunLabel);
    this.sunHandle.userData.dragId = 'sun';

    const sclera = new T.Mesh(new T.SphereGeometry(.12, 32, 24), new T.MeshStandardMaterial({ color: 0xf4f7fa, roughness: .25, metalness: .05 }));
    const iris = new T.Mesh(new T.CircleGeometry(.052, 32), new T.MeshStandardMaterial({ color: 0x2e4a66, roughness: .3, metalness: .2 }));
    iris.position.z = .117;
    const pupil = new T.Mesh(new T.CircleGeometry(.024, 24), new T.MeshBasicMaterial({ color: 0x0a0d12 }));
    pupil.position.z = .118;
    const spec = new T.Mesh(new T.SphereGeometry(.014, 10, 8), new T.MeshBasicMaterial({ color: 0xffffff }));
    spec.position.set(.032, .03, .108);
    const cone = new T.Mesh(new T.ConeGeometry(.05, .18, 16), new T.MeshBasicMaterial({ color: 0x8fa3bf, transparent: true, opacity: .85 }));
    cone.geometry.rotateX(Math.PI / 2); cone.position.z = .22;
    this.eyeHandle.add(sclera, iris, pupil, spec, cone);
    this.eyeHandle.up.set(0, 0, 1);
    this.eyeHandle.userData.dragId = 'eye';
    this.eyeHandle.traverse((o) => o.layers.set(1));
    this.eyeLabel = textSprite('观察者');
    this.eyeLabel.layers.set(1);
    this.scene.add(this.eyeLabel);
  }

  /* ---- 亮线分析：可拖动亮点 + 入射/半光锥/反射，以及眼睛发出的圆锥 ---- */
  buildAnalysis() {
    const RIM = this.RIM = 33;
    this.pointGroup = new T.Group();
    this.pointHandle = new T.Group();
    const marker = new T.Mesh(new T.SphereGeometry(.045, 20, 14), new T.MeshBasicMaterial({ color: 0xfff3dd }));
    const glow = new T.Sprite(new T.SpriteMaterial({ map: this.bulbTex, transparent: true, depthWrite: false, opacity: .9 }));
    glow.scale.setScalar(.32);
    this.pointHandle.add(marker, glow);
    this.pointHandle.userData.dragId = 'glitterPoint';
    this.pointGroup.add(this.pointHandle);

    this.incident = this.makeArrow(0xffd27a);
    this.reflected = this.makeArrow(0x8fd0ff);
    this.pointGroup.add(this.incident, this.reflected);

    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array((RIM + 1) * 3), 3));
    const idx = [];
    for (let i = 0; i < RIM - 1; i++) idx.push(0, i + 1, i + 2);
    geo.setIndex(idx);
    this.coneMesh = new T.Mesh(geo, new T.MeshBasicMaterial({
      color: 0xffb347, transparent: true, opacity: .22, side: T.DoubleSide,
      depthWrite: false, blending: T.AdditiveBlending }));   // 叠加而非普通混合：普通混合的暗橙会把画面压黑
    this.coneMesh.renderOrder = 2;
    this.coneRim = new T.Line(new T.BufferGeometry().setFromPoints(new Array(RIM).fill(0).map(() => new T.Vector3())),
      new T.LineBasicMaterial({ color: 0xffc47a, transparent: true, opacity: .6 }));
    this.coneGens = lineSeg(10, 0xffc47a, .38);
    this.pointGroup.add(this.coneMesh, this.coneRim, this.coneGens);
    this.pointGroup.visible = false;

    const N = this.EYE_N = 72;
    this.eyeConeGroup = new T.Group();
    const g2 = new T.BufferGeometry();
    g2.setAttribute('position', new T.BufferAttribute(new Float32Array((N + 1) * 3), 3));
    const idx2 = [];
    for (let i = 0; i < N; i++) idx2.push(0, i + 1, ((i + 1) % N) + 1);
    g2.setIndex(idx2);
    this.eyeConeMesh = new T.Mesh(g2, new T.MeshBasicMaterial({
      color: 0x7fb0e8, transparent: true, opacity: .13, side: T.DoubleSide,
      depthWrite: false, blending: T.AdditiveBlending }));
    this.eyeConeMesh.renderOrder = 2;
    this.eyeConeRim = new T.LineLoop(new T.BufferGeometry().setFromPoints(new Array(N).fill(0).map(() => new T.Vector3())),
      new T.LineBasicMaterial({ color: 0x9cc2f0, transparent: true, opacity: .4 }));
    this.eyeConeGens = lineSeg(8, 0x9cc2f0, .3);
    this.eyeConeGroup.add(this.eyeConeMesh, this.eyeConeRim, this.eyeConeGens);
    this.eyeConeGroup.visible = false;
  }
  makeArrow(color) {
    const g = new T.Group();
    const line = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]),
      new T.LineBasicMaterial({ color, transparent: true, opacity: .9 }));
    const head = new T.Mesh(new T.ConeGeometry(.035, .12, 10), new T.MeshBasicMaterial({ color }));
    g.add(line, head);
    g.userData = { line, head };
    return g;
  }
  updateArrow(g, s, e) {
    const attr = g.userData.line.geometry.attributes.position;
    attr.setXYZ(0, s.x, s.y, s.z); attr.setXYZ(1, e.x, e.y, e.z);
    attr.needsUpdate = true;
    const dir = this.tmp.a.subVectors(e, s);
    if (dir.lengthSq() < 1e-8) return;
    dir.normalize();
    g.userData.head.position.copy(e).addScaledVector(dir, -.06);
    g.userData.head.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
  }

  /* ---- 选中 ---- */
  onPick = (ev) => {
    if (ev.button === 2 || ev.button === 1) return;
    if (this.gizmo.begin(ev)) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new T.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), this.cam);
    this.ray.layers.enableAll();
    const hits = this.ray.intersectObjects([this.lampHandle, this.sunHandle, this.eyeHandle, this.plateGroup, this.diskGroup, this.pointHandle], true);
    let target = null;
    for (const h of hits) {
      let o = h.object, resolved = null, hidden = false;
      while (o) { if (!o.visible) hidden = true; if (o.userData.dragId) resolved = o; o = o.parent; }
      if (resolved && !hidden) {
        const id = resolved.userData.dragId;
        target = id === 'surface' ? this.surfaceGroup : resolved;
        break;
      }
    }
    if (target) {
      const id = target.userData.dragId;
      const rot = id === 'surface' && this.transformMode === 'rotate';
      this.gizmo.attach(target, rot ? 'rotate' : 'translate',
        id === 'surface' ? { x: !rot, y: !rot, z: rot }
          : id === 'glitterPoint' ? { x: true, y: true, z: false }
            : { x: true, y: true, z: true });
      if (this.onSelect) this.onSelect(id);
    } else {
      this.gizmo.detach();
      if (this.onSelect) this.onSelect(null);
    }
  };

  setTransformMode(mode) {
    this.transformMode = mode;
    if (this.gizmo.object === this.surfaceGroup) {
      const rot = mode === 'rotate';
      this.gizmo.attach(this.surfaceGroup, mode, { x: !rot, y: !rot, z: rot });
    }
  }

  onGizmoChange() {
    const obj = this.gizmo.object;
    if (!obj) return;
    const id = obj.userData.dragId, p = obj.position;
    const rn = (v) => Math.round(v * 1000) / 1000;
    if (id === 'pointLight') {
      p.z = Math.max(p.z, MIN_Z); p.x = clamp(p.x, -8, 8); p.y = clamp(p.y, -8, 8);
      this.onDrag({ pointLightPos: { x: rn(p.x), y: rn(p.y), z: rn(p.z) } });
    } else if (id === 'eye') {
      p.z = Math.max(p.z, MIN_Z); p.x = clamp(p.x, -8, 8); p.y = clamp(p.y, -8, 8);
      // 拖的是有效位置，写回 base = 有效位置 − h·r̂
      const az = this.P.azimuth * DEG, el = this.P.elevation * DEG;
      const h = this.P.lightMode === 'parallel' ? this.P.specularH : 0;
      this.onDrag({ eyePos: { x: rn(p.x + h * Math.cos(el) * Math.cos(az)), y: rn(p.y + h * Math.cos(el) * Math.sin(az)), z: rn(p.z - h * Math.sin(el)) } });
    } else if (id === 'surface') {
      p.z = 0; p.x = clamp(p.x, -6, 6); p.y = clamp(p.y, -6, 6);
      obj.rotation.x = obj.rotation.y = 0;
      this.onDrag({ centerX: rn(p.x), centerY: rn(p.y) });
    } else if (id === 'glitterPoint') {
      p.x = clamp(p.x, -8, 8); p.y = clamp(p.y, -8, 8);
      const out = { x: 0, y: 0 };
      if (projectToLine(this.P, p.x, p.y, this.pointPos.x, this.pointPos.y, out)) this.pointPos.set(out.x, out.y, 0);
      p.set(this.pointPos.x, this.pointPos.y, GLIT_Z + .02);
    } else if (id === 'sun') {
      // 拖动中不回拉，松手时才吸附回球面（否则 gizmo 与太阳会视觉分离）
      const s = this.tmp.s.subVectors(p, this.surfaceGroup.position);
      if (s.lengthSq() < 1e-6) return;
      s.normalize();
      let az = Math.atan2(s.y, s.x) / DEG;
      if (az < 0) az += 360;
      this.onDrag({ azimuth: rn(az), elevation: rn(Math.asin(clamp(s.z, Math.sin(5 * DEG), 1)) / DEG) });
    }
  }
  onGizmoEnd() {
    const obj = this.gizmo.object;
    if (!obj) return;
    if (obj === this.surfaceGroup) {
      const dz = this.surfaceGroup.rotation.z;
      this.surfaceGroup.rotation.set(0, 0, 0);
      if (Math.abs(dz) > 1e-4 && this.P.surfaceType === 'plate') {
        let th = (this.P.grooveAngle + dz / DEG) % 180;
        if (th < 0) th += 180;
        this.onDrag({ grooveAngle: Math.round(th * 10) / 10 });
      }
    }
    if (obj === this.sunHandle) this.positionSun(this.P.azimuth, this.P.elevation);
  }

  /* ---- 参数 → 场景 ---- */
  positionSun(az, el) {
    const a = az * DEG, e = el * DEG;
    this.sunHandle.position.copy(this.surfaceGroup.position)
      .addScaledVector(new T.Vector3(Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)), SUN_R);
  }
  setParams(p) { this.P = p; this.apply(); }
  effGroove() { return (this.P.grooveAngle + this.surfaceGroup.rotation.z / DEG) * DEG; }

  apply() {
    const p = this.P;
    const dragId = this.gizmo.dragging && this.gizmo.object ? this.gizmo.object.userData.dragId : null;

    if (dragId !== 'pointLight') this.lampHandle.position.set(p.pointLightPos.x, p.pointLightPos.y, p.pointLightPos.z);
    if (dragId !== 'eye') { const e = effEye(p); this.eyeHandle.position.set(e.x, e.y, Math.max(e.z, MIN_Z)); }
    if (dragId !== 'surface') this.surfaceGroup.position.set(p.centerX, p.centerY, 0);
    if (dragId !== 'sun') this.positionSun(p.azimuth, p.elevation);

    const par = p.lightMode === 'parallel';
    this.lampHandle.visible = this.lampLine.visible = this.lamp.visible = !par;
    this.sunHandle.visible = this.sunRays.visible = par;
    this.lamp.position.copy(this.lampHandle.position);
    this.plateGroup.visible = p.surfaceType === 'plate';
    this.diskGroup.visible = p.surfaceType === 'disk';
    // 沟槽角 θ：整块板绕自身 z 轴旋转，沟槽相对板固定
    this.plateGroup.rotation.z = p.grooveAngle * DEG;

    this.eyeCam.fov = focalToFov(p.focalLength);
    this.eyeCam.updateProjectionMatrix();

    const key = `${p.plateWidth}|${p.plateDepth}|${p.diskRadius}|${p.infiniteSurface}`;
    if (key !== this.geoKey) {
      this.geoKey = key;
      const W = p.infiniteSurface ? INF_SIZE : p.plateWidth;
      const D = p.infiniteSurface ? INF_SIZE : p.plateDepth;
      const R = p.infiniteSurface ? INF_SIZE / 2 : p.diskRadius;
      this.plateBase.geometry.dispose(); this.plateBase.geometry = new T.BoxGeometry(W, D, THICK);
      this.plateGlit.geometry.dispose(); this.plateGlit.geometry = new T.PlaneGeometry(W, D);
      this.diskBase.geometry.dispose(); this.diskBase.geometry = new T.CylinderGeometry(R, R, THICK, 128).rotateX(Math.PI / 2);
      this.diskGlit.geometry.dispose(); this.diskGlit.geometry = new T.CircleGeometry(R, 160);
    }
    if (p.showGlitterPoint && !this.pointGroup.visible) this.pointNeedsInit = true;

    const u = this.glitMat.uniforms;
    u.uLightMode.value = par ? 0 : 1;
    u.uSurfaceType.value = p.surfaceType === 'plate' ? 0 : 1;
    u.uGrooveAngle.value = this.effGroove();
  }

  /* ---- 亮点逐帧更新 ---- */
  paramsChanged(p) {
    const s = this.snap;
    let ch = false;
    const c = (i, v) => { if (s[i] !== v) { s[i] = v; ch = true; } };
    c(0, p.azimuth); c(1, p.elevation);
    c(2, p.pointLightPos.x); c(3, p.pointLightPos.y); c(4, p.pointLightPos.z);
    c(5, p.plateWidth); c(6, p.plateDepth); c(7, p.grooveAngle); c(8, p.diskRadius);
    c(9, p.centerX); c(10, p.centerY);
    c(11, p.eyePos.x); c(12, p.eyePos.y); c(13, p.eyePos.z);
    c(14, p.specularH);
    c(15, (p.lightMode === 'point' ? 1 : 0) + (p.surfaceType === 'disk' ? 2 : 0) + (p.infiniteSurface ? 4 : 0));
    return ch;
  }

  updatePoint() {
    const p = this.P;
    if (!p.showGlitterPoint) { this.pointGroup.visible = false; return; }
    const out = { x: 0, y: 0 };
    if (this.pointNeedsInit) {
      if (!findLinePoint(p, out)) { this.pointGroup.visible = false; return; }
      this.pointPos.set(out.x, out.y, 0);
      this.pointNeedsInit = false;
      this.paramsChanged(p);
    } else if (this.paramsChanged(p)) {
      // 参数变了：把点重投影回新亮线，保持分支连续
      if (projectToLine(p, this.pointPos.x, this.pointPos.y, this.pointPos.x, this.pointPos.y, out) || findLinePoint(p, out)) {
        this.pointPos.set(out.x, out.y, 0);
      } else { this.pointGroup.visible = false; return; }
    }
    this.pointGroup.visible = true;
    const dragging = this.gizmo.dragging && this.gizmo.object === this.pointHandle;
    if (!dragging) this.pointHandle.position.set(this.pointPos.x, this.pointPos.y, GLIT_Z + .02);
    const P = this.tmp.P.set(this.pointPos.x, this.pointPos.y, GLIT_Z + .02);
    const ee = effEye(p);
    const E = this.tmp.E.set(ee.x, ee.y, ee.z);
    const ph = this.tmp.ph;
    if (p.lightMode === 'point') {
      ph.set(P.x - p.pointLightPos.x, P.y - p.pointLightPos.y, P.z - p.pointLightPos.z).normalize();
      this.updateArrow(this.incident, this.tmp.s.set(p.pointLightPos.x, p.pointLightPos.y, p.pointLightPos.z), P);
    } else {
      const az = p.azimuth * DEG, el = p.elevation * DEG;
      ph.set(-Math.cos(el) * Math.cos(az), -Math.cos(el) * Math.sin(az), -Math.sin(el));
      this.updateArrow(this.incident, this.tmp.s.copy(P).addScaledVector(ph, -2.2), P);
    }
    this.updateArrow(this.reflected, P, E);

    // 半光锥：轴 a = sign(c)·t̂，半角 α = arccos|c|，c = p̂·t̂
    let tx = 0, ty = 0;
    if (p.surfaceType === 'plate') { const a = this.effGroove(); tx = Math.cos(a); ty = Math.sin(a); }
    else {
      const rx = P.x - p.centerX, ry = P.y - p.centerY, r = Math.hypot(rx, ry);
      if (r >= 1e-4) { tx = -ry / r; ty = rx / r; }
    }
    const cc = ph.x * tx + ph.y * ty;
    const sgn = cc < 0 ? -1 : 1;
    const ax = tx * sgn, ay = ty * sgn;
    const alpha = Math.acos(clamp(Math.abs(cc), 0, 1));
    const cosA = Math.cos(alpha), sinA = Math.sin(alpha);
    const u2x = ay, u2y = -ax;                 // u2 = a × ẑ
    const L = clamp(E.distanceTo(P), .8, 4);
    const RIM = this.RIM;
    const cpos = this.coneMesh.geometry.attributes.position;
    const rpos = this.coneRim.geometry.attributes.position;
    const gpos = this.coneGens.geometry.attributes.position;
    cpos.setXYZ(0, P.x, P.y, P.z);
    for (let i = 0; i < RIM; i++) {
      const phi = -Math.PI / 2 + (Math.PI * i) / (RIM - 1);
      const cf = Math.cos(phi), sf = Math.sin(phi);
      const x = P.x + L * (ax * cosA + sinA * u2x * sf);
      const y = P.y + L * (ay * cosA + sinA * u2y * sf);
      const z = P.z + L * sinA * cf;
      cpos.setXYZ(i + 1, x, y, z); rpos.setXYZ(i, x, y, z);
    }
    [-90, -45, 0, 45, 90].forEach((deg, k) => {
      const phi = deg * DEG, cf = Math.cos(phi), sf = Math.sin(phi);
      gpos.setXYZ(k * 2, P.x, P.y, P.z);
      gpos.setXYZ(k * 2 + 1, P.x + L * (ax * cosA + sinA * u2x * sf), P.y + L * (ay * cosA + sinA * u2y * sf), P.z + L * sinA * cf);
    });
    cpos.needsUpdate = rpos.needsUpdate = gpos.needsUpdate = true;
  }

  /** 光路可逆锥：从眼睛发出、与 t̂ 夹角 α 的所有射线；它与板面的交线正是亮线 */
  updateEyeCone() {
    const p = this.P;
    if (!p.showEyeCone || p.lightMode !== 'parallel' || p.surfaceType !== 'plate') { this.eyeConeGroup.visible = false; return; }
    const d = this.tmp.a.subVectors(this.surfaceGroup.position, this.sunHandle.position);
    d.lengthSq() < 1e-8 ? d.set(0, 0, -1) : d.normalize();
    const th = this.effGroove();
    const tx = Math.cos(th), ty = Math.sin(th);
    const c = d.x * tx + d.y * ty;
    const sinA = Math.sqrt(Math.max(0, 1 - c * c));
    if (sinA < 1e-3) { this.eyeConeGroup.visible = false; return; }
    const sgn = c < 0 ? 1 : -1;                // r̂ = −q̂ ⟹ 轴取 −sign(c)·t̂
    const ax = tx * sgn, ay = ty * sgn, cosA = Math.abs(c);
    const E = this.eyeHandle.position;
    const L = clamp((E.z / sinA) * 1.6, 1.5, 30);
    const u2x = ay, u2y = -ax, N = this.EYE_N;
    const cpos = this.eyeConeMesh.geometry.attributes.position;
    const rpos = this.eyeConeRim.geometry.attributes.position;
    cpos.setXYZ(0, E.x, E.y, E.z);
    for (let i = 0; i < N; i++) {
      const phi = (2 * Math.PI * i) / N, cf = Math.cos(phi), sf = Math.sin(phi);
      const x = E.x + L * (ax * cosA + sinA * u2x * sf);
      const y = E.y + L * (ay * cosA + sinA * u2y * sf);
      const z = E.z + L * sinA * cf;
      cpos.setXYZ(i + 1, x, y, z); rpos.setXYZ(i, x, y, z);
    }
    const gpos = this.eyeConeGens.geometry.attributes.position;
    [120, 160, 200, 240].forEach((deg, k) => {
      const phi = deg * DEG, cf = Math.cos(phi), sf = Math.sin(phi);
      gpos.setXYZ(k * 2, E.x, E.y, E.z);
      gpos.setXYZ(k * 2 + 1, E.x + L * (ax * cosA + sinA * u2x * sf), E.y + L * (ay * cosA + sinA * u2y * sf), E.z + L * sinA * cf);
    });
    cpos.needsUpdate = rpos.needsUpdate = gpos.needsUpdate = true;
    this.eyeConeGroup.visible = true;
  }

  /* ---- 每帧 ---- */
  frame = () => {
    const p = this.P, t = this.clock.getElapsedTime();
    this.orbit.update();
    this.gizmo.layout();

    const center = this.surfaceGroup.position;
    const eye = this.eyeHandle.position;
    const u = this.glitMat.uniforms;
    const d = this.tmp.d.subVectors(center, this.sunHandle.position);
    d.lengthSq() > 1e-8 ? d.normalize() : d.set(0, 0, -1);
    u.uParallelDir.value.copy(d);
    u.uPointPos.value.copy(this.lampHandle.position);
    u.uEye.value.copy(eye);
    u.uCenter.value.copy(center);
    u.uTime.value = t;

    const half = p.infiniteSurface ? INF_SIZE / 2
      : p.surfaceType === 'plate' ? Math.max(p.plateWidth, p.plateDepth) / 2 : p.diskRadius;
    this.tripod.position.set(center.x, center.y - half - TRIPOD_GAP, 0);
    this.tripod.visible = !p.infiniteSurface;
    this.shadow.visible = !p.infiniteSurface;
    if (p.surfaceType === 'plate') this.shadow.scale.set(p.plateWidth * 1.35, p.plateDepth * 1.35, 1);
    else this.shadow.scale.setScalar(p.diskRadius * 2.6);
    this.shadow.position.set(center.x, center.y, -.005);

    this.eyeHandle.lookAt(center);
    this.eyeLabel.position.set(eye.x, eye.y, eye.z + .36);
    const sp = this.sightLine.geometry.attributes.position;
    sp.setXYZ(0, eye.x, eye.y, eye.z);
    sp.setXYZ(1, center.x, center.y, center.z);
    sp.needsUpdate = true;

    if (p.lightMode === 'parallel') {
      const attr = this.sunRays.geometry.attributes.position;
      let i = 0;
      for (let k = -2; k <= 2; k++) {
        const off = this.tmp.off.set(-d.y, d.x, 0).normalize().multiplyScalar(k * .9);
        const a = this.tmp.a.copy(center).add(off).addScaledVector(d, -5.5);
        const b = this.tmp.b.copy(center).add(off).addScaledVector(d, 1.2);
        attr.setXYZ(i++, a.x, a.y, a.z); attr.setXYZ(i++, b.x, b.y, b.z);
      }
      attr.needsUpdate = true;
    } else {
      const attr = this.lampLine.geometry.attributes.position;
      const L = this.lampHandle.position;
      attr.setXYZ(0, L.x, L.y, L.z);
      attr.setXYZ(1, center.x, center.y, center.z);
      attr.needsUpdate = true;
    }

    this.eyeCam.position.copy(eye);
    this.eyeCam.lookAt(center);

    this.updatePoint();
    this.updateEyeCone();
    this.render();
  };

  render() {
    const rd = this.renderer;
    const c = this.crect || (this.crect = rd.domElement.getBoundingClientRect());
    rd.setScissorTest(true);
    rd.setViewport(0, 0, c.width, c.height);
    rd.setScissor(0, 0, c.width, c.height);
    rd.render(this.scene, this.cam);
    // 观察者视角小窗：同一 renderer 第二遍 setViewport/setScissor（单位是 CSS 像素）
    const r = this.irect;
    if (r && r.width > 8 && r.height > 8 && !document.body.classList.contains('hideInset')) {
      const vw = Math.round(r.width), vh = Math.round(r.height);
      this.eyeCam.aspect = vw / vh;
      this.eyeCam.updateProjectionMatrix();
      rd.setViewport(Math.round(r.left - c.left), Math.round(c.bottom - r.bottom), vw, vh);
      rd.setScissor(Math.round(r.left - c.left), Math.round(c.bottom - r.bottom), vw, vh);
      rd.render(this.scene, this.eyeCam);
    }
  }

  cacheRects() {
    this.crect = this.renderer.domElement.getBoundingClientRect();
    this.irect = this.insetEl.getBoundingClientRect();
  }
  resize(w, h) {
    if (w < 2 || h < 2) return;   // 标签页隐藏时 ResizeObserver 会报 0 尺寸
    this.renderer.setPixelRatio(dprCap());
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.cacheRects();
  }

  /** 物理自检：亮线必过镜面反射点 O（控制台输出） */
  selfCheck() {
    const p = this.P;
    const E = effEye(p);
    let O;
    if (p.lightMode === 'point') {
      const s = p.pointLightPos.z / (p.pointLightPos.z + E.z);
      O = { x: p.pointLightPos.x + (E.x - p.pointLightPos.x) * s, y: p.pointLightPos.y + (E.y - p.pointLightPos.y) * s };
    } else {
      const az = p.azimuth * DEG, el = p.elevation * DEG;
      const dx = -Math.cos(el) * Math.cos(az), dy = -Math.cos(el) * Math.sin(az), dz = -Math.sin(el);
      const t = E.z / -dz;
      O = { x: E.x - dx * t, y: E.y - dy * t };
    }
    const f = Math.abs(fAt(p, O.x, O.y));
    const msg = `[物理自检] 镜面点 O=(${O.x.toFixed(3)}, ${O.y.toFixed(3)}, 0)，|f(O)|=${f.toExponential(2)} → ${f < 1e-6 ? '通过：亮线必过镜面点' : '失败'}`
      + (p.surfaceType === 'disk' ? `；圆心 f(C)=${fAt(p, p.centerX, p.centerY)} → 圆心天然发亮` : '');
    console.debug(msg);
    return msg;
  }
}
