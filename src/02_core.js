/* ════════════════════════════════════════════════════════════════
   Glitter Path · 沟槽反射亮线模拟
   复刻自 github.com/bxt14/glitter-path-simulation（three.js 内联版）

   核心物理（三个标签页共用同一公式，与论文《金属光的反射》一致）：
     沟槽壁法线没有沿槽分量 ⟹ 镜面反射保持光矢量的沿槽分量不变
     ⟹ 表面一点 Q 对眼睛发亮的充要条件  f(Q) = (p̂ − q̂)·t̂ = 0
   ════════════════════════════════════════════════════════════════ */
const T = THREE;
const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** 渲染像素比上限：触摸设备多为手机，封顶 1.5 省一半以上填充开销；鼠标设备保持 2 */
const dprCap = () => Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2);

/* ── DOM 小工具 ───────────────────────────────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
function el(tag, cls, host) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (host) host.appendChild(n);
  return n;
}

/** 数值滑块：显示精度跟随步进 */
function Slider(host, o) {
  const dec = o.step >= 1 ? 0 : (String(o.step).split('.')[1] || '').length;
  const wrap = el('div', o.inline ? 'u' : 'sl', host);
  let out;
  if (o.inline) {
    const lab = el('label', null, wrap);
    lab.innerHTML = o.label + ' <span class="v"></span>';
    out = lab.querySelector('.v');
  } else {
    const top = el('div', 'sl-top', wrap);
    el('span', null, top).textContent = o.label;
    out = el('span', 'v', top);
  }
  const inp = el('input', null, wrap);
  Object.assign(inp, { type: 'range', min: o.min, max: o.max, step: o.step });
  inp.setAttribute('aria-label', o.label);
  const sync = () => {
    const v = clamp(o.get(), o.min, o.max);
    inp.value = v;
    inp.style.setProperty('--p', ((v - o.min) / (o.max - o.min)) * 100 + '%');
    out.textContent = (o.fmt ? o.fmt(v) : v.toFixed(dec)) + (o.unit || '');
  };
  inp.addEventListener('input', () => { o.set(parseFloat(inp.value)); sync(); });
  sync();
  return sync;
}

/** 开关（inline：开关在前、文字在后，用于顶部控制条） */
function Toggle(host, o) {
  const lab = el('label', o.inline ? 'sw u' : 'sw', host);
  const inp = document.createElement('input');
  inp.type = 'checkbox';
  const knob = document.createElement('i');
  const txt = document.createElement('span');
  txt.textContent = o.label;
  if (o.inline) lab.append(inp, knob, txt);
  else lab.append(txt, inp, knob);
  const sync = () => { inp.checked = !!o.get(); };
  inp.addEventListener('change', () => o.set(inp.checked));
  sync();
  return sync;
}

/** 分段选择器 */
function Seg(host, o) {
  const box = el('div', 'seg', host);
  const btns = o.options.map(([val, label]) => {
    const b = el('button', null, box);
    b.textContent = label;
    b.addEventListener('click', () => o.set(val));
    return [val, b];
  });
  const sync = () => btns.forEach(([v, b]) => b.setAttribute('aria-pressed', String(o.get() === v)));
  sync();
  return sync;
}

/** 手机端参数分组栏：一排分组标签 + 收起按钮。
 *  panel 里带 data-g 的节点按组显示；只在窄屏生效（桌面端 CSS 隐藏标签栏、忽略 .g-off / .g-collapsed）。
 *  再点当前组 = 收起；收起状态下点任意组 = 展开到该组。 */
function GroupBar(host, panel, groups, initial, before) {
  const bar = el('div', 'gbar');
  if (before) host.insertBefore(bar, before); else host.appendChild(bar);
  const tabs = el('div', 'gbar-tabs', bar);
  tabs.setAttribute('role', 'tablist');
  let cur = initial, collapsed = false;
  const btns = groups.map(([k, label]) => {
    const b = el('button', null, tabs);
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => {
      if (k === cur && !collapsed) collapsed = true;
      else { cur = k; collapsed = false; }
      apply();
    });
    return [k, b];
  });
  const fold = el('button', 'gbar-fold', bar);
  fold.type = 'button';
  fold.addEventListener('click', () => { collapsed = !collapsed; apply(); });
  const apply = () => {
    btns.forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === cur && !collapsed)));
    panel.classList.toggle('g-collapsed', collapsed);
    panel.querySelectorAll('[data-g]').forEach((n) => n.classList.toggle('g-off', n.dataset.g !== cur));
    fold.textContent = collapsed ? '展开 ▾' : '收起 ▴';
    fold.setAttribute('aria-expanded', String(!collapsed));
  };
  apply();
  return { apply, bar };
}

/** 控件集合：build 时收集各控件的 sync，统一 refresh（子面板递归） */
function Panel(host) {
  const syncs = [];
  const self = {
    node: host,
    slider(o) { syncs.push(Slider(host, o)); return self; },
    toggle(o) { syncs.push(Toggle(host, o)); return self; },
    seg(o) { syncs.push(Seg(host, o)); return self; },
    /** 子容器（默认 .grp 分组，可带标题）；返回子 Panel */
    sub(cls, title) {
      const g = el('div', cls === undefined ? 'grp' : cls, host);
      if (title) el('h3', null, g).textContent = title;
      const p = Panel(g);
      syncs.push(p.refresh);
      return p;
    },
    text(cls, html) { const n = el('div', cls, host); n.innerHTML = html; return n; },
    rule() { el('div', 'rule', host); return self; },
    button(label, cls, fn) {
      const b = el('button', 'btn' + (cls ? ' ' + cls : ''), host);
      b.innerHTML = label;
      b.addEventListener('click', fn);
      return b;
    },
    refresh() { syncs.forEach((f) => f()); },
  };
  return self;
}

/* ── three 小工具 ─────────────────────────────────────────────── */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), c);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

/** 中文文字标签 Sprite：自动量宽 + 深色描边 */
function textSprite(text, scale = 0.42) {
  const font = 'bold 30px system-ui,"PingFang SC","Microsoft YaHei",sans-serif';
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 24;
  const tex = canvasTex(w, 52, (ctx) => {
    ctx.font = font;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(8,10,14,.85)';
    ctx.strokeText(text, w / 2, 27);
    ctx.fillStyle = '#d7dee8';
    ctx.fillText(text, w / 2, 27);
  });
  const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: .95 }));
  s.scale.set(scale * (w / 52), scale, 1);
  return s;
}

function letterSprite(ch, color, scale) {
  const tex = canvasTex(64, 64, (ctx) => {
    ctx.font = 'bold 44px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillText(ch, 32, 34);
  });
  const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.setScalar(scale);
  return s;
}

/** 柔和径向光斑纹理（光子 / 光晕 / 接触阴影共用生成器） */
function radialTex(size, stops) {
  return canvasTex(size, size, (ctx) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([p, c]) => g.addColorStop(p, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** 程序化棚拍环境（PMREM）：一间带自发光柔光箱的暗室，给金属可反射的内容。
 *  必须用 fromScene 而非画布贴图——自发光强度可以超过 1，金属才有真正的"打光感"。
 *  注意世界坐标 z 轴向上，主柔光箱要放在 +z。 */
function studioEnv(renderer) {
  const sc = new T.Scene();
  const box = new T.BoxGeometry();
  box.deleteAttribute('uv');
  const room = new T.Mesh(box, new T.MeshStandardMaterial({ color: 0x2c3444, side: T.BackSide, roughness: 1 }));
  room.scale.set(22, 22, 14);
  sc.add(room);
  const panel = (color, intensity, pos, scale) => {
    const m = new T.Mesh(box, new T.MeshStandardMaterial({ color: 0x000000, emissive: new T.Color(color), emissiveIntensity: intensity }));
    m.position.set(...pos); m.scale.set(...scale);
    sc.add(m);
  };
  panel(0xfff4e6, 22, [0, 0, 6.2], [9, 9, .2]);      // 顶部主柔光箱
  panel(0xdfeaff, 9, [-7, 2.5, 2.6], [.2, 6, 5]);    // 冷色侧光
  panel(0xffe9cd, 7, [6.5, -3, 2.2], [.2, 6, 4]);    // 暖色侧光
  panel(0xa8bcdc, 3.5, [0, 8, 1.6], [7, .2, 3.5]);   // 背景反光板
  const pm = new T.PMREMGenerator(renderer);
  const env = pm.fromScene(sc, 0.04).texture;
  pm.dispose();
  disposeTree(sc);
  return env;
}

function lineSeg(n, color, opacity) {
  const pts = new Array(n).fill(0).map(() => new T.Vector3());
  return new T.LineSegments(
    new T.BufferGeometry().setFromPoints(pts),
    new T.LineBasicMaterial({ color, transparent: true, opacity })
  );
}

/** 释放子树的几何与材质；标记了 userData.shared 的纹理为复用资源，不释放 */
function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    mats.forEach((m) => {
      if (m.map && !m.map.userData.shared) m.map.dispose();
      m.dispose();
    });
  });
}

/* ── 轨道控制器（z 轴竖直；旋转 / 缩放 / 平移 + 阻尼） ─────────── */
class Orbit {
  constructor(cam, dom, target = new T.Vector3()) {
    this.cam = cam; this.dom = dom; this.target = target;
    this.enabled = true;
    /** 返回 false 则本次 pointerdown 不启动轨道操作（让位给变换手柄） */
    this.filter = null;
    this.minDist = 1.2; this.maxDist = 40;
    this.minPolar = 0.02; this.maxPolar = Math.PI * 0.495;
    this.damping = 0.12;
    const off = cam.position.clone().sub(target);
    this.r = off.length();
    this.theta = Math.atan2(off.y, off.x);
    this.phi = Math.acos(clamp(off.z / this.r, -1, 1));
    this.dT = 0; this.dP = 0; this.dR = 1; this.pan = new T.Vector3();
    this._ptr = new Map(); this._mode = null; this._last = null; this._pinch = 0;
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', this.down);
    dom.addEventListener('wheel', this.wheel, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    this.apply();
  }
  down = (e) => {
    if (!this.enabled || (this.filter && this.filter(e) === false)) return;
    this._ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.dom.setPointerCapture(e.pointerId);
    if (this._ptr.size === 1) {
      this._mode = e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'rot';
      this._last = { x: e.clientX, y: e.clientY };
    } else if (this._ptr.size === 2) {
      this._mode = 'pinch';
      const [a, b] = [...this._ptr.values()];
      this._pinch = Math.hypot(a.x - b.x, a.y - b.y);
      this._last = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
  };
  move = (e) => {
    if (!this._ptr.has(e.pointerId)) return;
    this._ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const h = this.dom.clientHeight || 1;
    if (this._mode === 'pinch' && this._ptr.size === 2) {
      const [a, b] = [...this._ptr.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this._pinch > 0) this.dR *= this._pinch / Math.max(d, 1);
      this._pinch = d;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      this.panBy((cx - this._last.x) / h, (cy - this._last.y) / h);
      this._last = { x: cx, y: cy };
      return;
    }
    const dx = e.clientX - this._last.x, dy = e.clientY - this._last.y;
    this._last = { x: e.clientX, y: e.clientY };
    if (this._mode === 'pan') this.panBy(dx / h, dy / h);
    else { this.dT -= (dx / h) * 2.2; this.dP -= (dy / h) * 2.2; }
  };
  up = (e) => {
    this._ptr.delete(e.pointerId);
    if (this._ptr.size === 0) {
      this._mode = null;
      window.removeEventListener('pointermove', this.move);
      window.removeEventListener('pointerup', this.up);
      window.removeEventListener('pointercancel', this.up);
    } else {
      const [a] = [...this._ptr.values()];
      this._mode = 'rot'; this._last = { x: a.x, y: a.y };
    }
  };
  wheel = (e) => {
    if (!this.enabled) return;
    e.preventDefault();
    this.dR *= Math.pow(0.95, -Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60 + 1));
  };
  panBy(nx, ny) {
    const scale = 2 * this.r * Math.tan((this.cam.fov * DEG) / 2);
    const m = this.cam.matrix;
    const right = new T.Vector3(m.elements[0], m.elements[1], m.elements[2]);
    const up = new T.Vector3(m.elements[4], m.elements[5], m.elements[6]);
    this.pan.addScaledVector(right, -nx * scale).addScaledVector(up, ny * scale);
  }
  update() {
    const k = this.damping;
    this.theta += this.dT * k; this.phi += this.dP * k;
    this.dT *= 1 - k; this.dP *= 1 - k;
    this.r = clamp(this.r * (1 + (this.dR - 1) * k), this.minDist, this.maxDist);
    this.dR = 1 + (this.dR - 1) * (1 - k);
    this.target.addScaledVector(this.pan, k);
    this.pan.multiplyScalar(1 - k);
    this.phi = clamp(this.phi, this.minPolar, this.maxPolar);
    this.apply();
  }
  apply() {
    const s = Math.sin(this.phi);
    this.cam.up.set(0, 0, 1);
    this.cam.position.set(
      this.target.x + this.r * s * Math.cos(this.theta),
      this.target.y + this.r * s * Math.sin(this.theta),
      this.target.z + this.r * Math.cos(this.phi)
    );
    this.cam.lookAt(this.target);
  }
}

/* ── 变换手柄（替代 TransformControls：世界轴箭头 + 绕 z 旋转环） ──
   拖动沿轴：取指针射线与轴线的最近点，跟手且不受视角影响。          */
const AXIS_COL = { x: 0xd2635c, y: 0x6fb36f, z: 0x6b93d6 };
class Gizmo {
  constructor(cam, dom, scene) {
    this.cam = cam; this.dom = dom;
    this.object = null; this.mode = 'translate'; this.dragging = false;
    this.onChange = null; this.onEnd = null;
    this.show = { x: true, y: true, z: true };
    this.root = new T.Group();
    this.root.visible = false;
    this.root.renderOrder = 999;
    scene.add(this.root);
    this.parts = [];
    const mkMat = (c) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: .95, depthTest: false });
    const YUP = new T.Vector3(0, 1, 0);
    for (const [ax, dir] of [['x', [1, 0, 0]], ['y', [0, 1, 0]], ['z', [0, 0, 1]]]) {
      const d = new T.Vector3(...dir);
      const q = new T.Quaternion().setFromUnitVectors(YUP, d);
      const g = new T.Group();
      const mat = mkMat(AXIS_COL[ax]);
      const shaft = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.62, 8), mat);
      shaft.quaternion.copy(q); shaft.position.copy(d).multiplyScalar(0.31);
      const head = new T.Mesh(new T.ConeGeometry(0.052, 0.16, 14), mat);
      head.quaternion.copy(q); head.position.copy(d).multiplyScalar(0.7);
      // 不可见的粗拾取柱，扩大命中范围
      const pick = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.8, 6), new T.MeshBasicMaterial({ visible: false }));
      pick.quaternion.copy(q); pick.position.copy(d).multiplyScalar(0.4);
      g.add(shaft, head, pick);
      g.userData = { axis: ax, kind: 'translate', mat, base: AXIS_COL[ax] };
      this.root.add(g); this.parts.push(g);
    }
    const ringMat = mkMat(AXIS_COL.z);
    const ring = new T.Group();
    const torus = new T.Mesh(new T.TorusGeometry(0.62, 0.012, 6, 64), ringMat);
    const pickR = new T.Mesh(new T.TorusGeometry(0.62, 0.06, 5, 32), new T.MeshBasicMaterial({ visible: false }));
    ring.add(torus, pickR);
    ring.userData = { axis: 'z', kind: 'rotate', mat: ringMat, base: AXIS_COL.z };
    this.root.add(ring); this.parts.push(ring);
    this.ring = ring;
    this.ray = new T.Raycaster();
    this.ray.params.Line.threshold = 0.05;
    this.hover = null;
    dom.addEventListener('pointermove', this.onHover);
  }
  attach(obj, mode, show) {
    this.object = obj; this.mode = mode || 'translate';
    this.show = show || { x: true, y: true, z: true };
    this.root.visible = true;
    this.layout();
  }
  detach() { this.object = null; this.root.visible = false; }
  layout() {
    if (!this.object) return;
    this.root.position.copy(this.object.getWorldPosition(new T.Vector3()));
    const s = this.root.position.distanceTo(this.cam.position) * 0.16;
    this.root.scale.setScalar(s);
    const rot = this.mode === 'rotate';
    this.parts.forEach((p) => {
      if (p.userData.kind === 'rotate') p.visible = rot && this.show.z;
      else p.visible = !rot && this.show[p.userData.axis];
    });
  }
  ndc(e) {
    const r = this.dom.getBoundingClientRect();
    return new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  pick(e) {
    if (!this.object) return null;
    this.ray.setFromCamera(this.ndc(e), this.cam);
    const hits = this.ray.intersectObjects(this.parts.filter((p) => p.visible), true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.kind) o = o.parent;
    return o;
  }
  onHover = (e) => {
    if (this.dragging || !this.object) return;
    const p = this.pick(e);
    if (p === this.hover) return;
    if (this.hover) this.hover.userData.mat.color.setHex(this.hover.userData.base);
    this.hover = p;
    if (p) p.userData.mat.color.setHex(0xffd27a);
    this.dom.style.cursor = p ? 'grab' : '';
  };
  /** 供外层 pointerdown 调用：命中手柄则接管拖动并返回 true */
  begin(e) {
    const part = this.pick(e);
    if (!part) return false;
    const c = this.root.position.clone();
    this.dragging = true;
    this.dom.style.cursor = 'grabbing';
    const axis = new T.Vector3(part.userData.axis === 'x' ? 1 : 0, part.userData.axis === 'y' ? 1 : 0, part.userData.axis === 'z' ? 1 : 0);
    const rotating = part.userData.kind === 'rotate';
    const startPos = this.object.position.clone();
    const startRot = this.object.rotation.z;
    let ref = rotating ? this.anglePlane(e, c) : this.alongAxis(e, c, axis);
    const move = (ev) => {
      if (rotating) {
        const a = this.anglePlane(ev, c);
        if (a === null || ref === null) return;
        let d = a - ref;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        this.object.rotation.z = startRot + d;
      } else {
        const t = this.alongAxis(ev, c, axis);
        if (t === null || ref === null) return;
        this.object.position.copy(startPos).addScaledVector(axis, t - ref);
      }
      this.layout();
      if (this.onChange) this.onChange();
    };
    const up = () => {
      this.dragging = false;
      this.dom.style.cursor = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (this.onEnd) this.onEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return true;
  }
  /** 指针射线与轴线的最近点参数 t（沿 axis 的位移） */
  alongAxis(e, c, axis) {
    this.ray.setFromCamera(this.ndc(e), this.cam);
    const ro = this.ray.ray.origin, rd = this.ray.ray.direction;
    const w0 = new T.Vector3().subVectors(c, ro);
    const b = axis.dot(rd), d = axis.dot(w0), ee = rd.dot(w0);
    const den = 1 - b * b; // 轴与视线接近平行时无解（此时该轴本就不可拖）
    if (Math.abs(den) < 1e-4) return null;
    return (b * ee - d) / den;
  }
  /** 指针射线与过手柄中心的水平面交点的极角 */
  anglePlane(e, c) {
    this.ray.setFromCamera(this.ndc(e), this.cam);
    const rd = this.ray.ray.direction, ro = this.ray.ray.origin;
    if (Math.abs(rd.z) < 1e-6) return null;
    const t = (c.z - ro.z) / rd.z;
    if (t < 0) return null;
    return Math.atan2(ro.y + rd.y * t - c.y, ro.x + rd.x * t - c.x);
  }
}

/* ── 渲染循环调度：只跑当前可见标签页 ─────────────────────────── */
const Loop = {
  jobs: new Map(),
  active: null,
  add(id, fn) { this.jobs.set(id, fn); },
  show(id) { this.active = id; },
  start() {
    const tick = (now) => {
      requestAnimationFrame(tick);
      const f = this.jobs.get(this.active);
      if (f) f(now);
    };
    requestAnimationFrame(tick);
  },
};

/** 容器尺寸变化 → 回调（带缓存 rect） */
function onResize(node, fn) {
  const ro = new ResizeObserver(() => fn(node.clientWidth || 1, node.clientHeight || 1));
  ro.observe(node);
  fn(node.clientWidth || 1, node.clientHeight || 1);
  return ro;
}
