/* ════════════════════════════════════════════════════════════════
   标签页 ④  方程图像（GeoGebra 式 2D 绘图）
   坐标与论文 v6 一致：原点在镜面反射点 O，y 轴在入射面内（光从 +y 侧射来）
     眼睛 E(0, −h tan i, h)，眼下点 F(0, −h tan i)
     点光源 L(0, l tan i, l)，灯下点 G(0, l tan i)
     平行沟槽 ŝ = (sin θ, cos θ, 0)；同心沟槽 s = (y − v, u − x, 0)，圆心 C(u, v)
   三条方程一律保持"未平方"：符号就是反射锥的那一叶，逐格变号追踪只画真正射进眼睛的那支。
   平方引入的伪解（另一叶）单独作为可选图层画出。
   ════════════════════════════════════════════════════════════════ */

const EQ_PAL = {
  light: {
    bg: '#ffffff', minor: '#eef1f5', major: '#dce1e8', axis: '#394150', tick: '#6b7383',
    curve: '#d06a17', halo: 'rgba(208,106,23,.16)', asym: '#3f72cf',
    limit: '#8757d1', guide: '#7f8896', tangent: '#2a303b',
    disk: '#8a94a3', diskFill: 'rgba(120,132,150,.08)', diskGroove: 'rgba(120,132,150,.16)',
    free: '#3f5fd0', freeRim: '#1d2f80', dep: '#262c38', text: '#1c2230', textHalo: 'rgba(255,255,255,.92)',
  },
  dark: {
    bg: '#0b0f15', minor: '#121821', major: '#1c2430', axis: '#8b95a5', tick: '#747e8d',
    curve: '#ffb347', halo: 'rgba(255,179,71,.2)', asym: '#7fb3f0',
    limit: '#b69cf2', guide: '#5f6a7b', tangent: '#c9d1dc',
    disk: '#6f7a8b', diskFill: 'rgba(200,210,225,.05)', diskGroove: 'rgba(200,210,225,.08)',
    free: '#8fd0ff', freeRim: '#0b0f15', dep: '#e8edf4', text: '#dbe2ec', textHalo: 'rgba(11,15,21,.92)',
  },
};
const EQ_MATH_FONT = '"Iowan Old Style",Palatino,"Songti SC",Georgia,Cambria,serif';
const EQ_MONO_FONT = 'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace';

const EQ_PARAMS = {
  i: { sym: 'i', unit: '°', min: 1, max: 89, step: 0.5, lo: 0.1, hi: 89.9, name: '入射角' },
  theta: { sym: 'θ', unit: '°', min: 0, max: 180, step: 0.5, name: '沟槽与 y 轴夹角' },
  h: { sym: 'h', unit: '', min: 0.05, max: 5, step: 0.01, lo: 0.01, name: '眼高' },
  l: { sym: 'l', unit: '', min: 0.05, max: 20, step: 0.05, lo: 0.01, name: '灯高' },
  u: { sym: 'u', unit: '', min: -5, max: 5, step: 0.01, name: '圆心 C 的横坐标' },
  v: { sym: 'v', unit: '', min: -5, max: 5, step: 0.01, name: '圆心 C 的纵坐标' },
  R: { sym: 'R', unit: '', min: 0.1, max: 30, step: 0.1, lo: 0.01, name: '圆盘半径' },
};

const EQ_CASES = {
  point: { tab: '点光源 · 平行槽', kind: '三次曲线', title: '点光源照射平行沟槽', src: '补充材料 · van Wieringen 1947', params: ['i', 'theta', 'h', 'l'] },
  parallel: { tab: '平行光 · 平行槽', kind: '双曲线一支', title: '平行光照射平行沟槽', src: '正文式 (2)、(3)', params: ['i', 'theta', 'h'] },
  concentric: { tab: '平行光 · 同心槽', kind: '四次曲线', title: '平行光照射同心沟槽', src: '正文式 (4)、(5)', params: ['i', 'h', 'u', 'v', 'R'] },
};

const EQ_PRESETS = {
  point: [
    ['灯在近处 l = 0.8', { i: 50, theta: 35, h: 1, l: 0.8 }],
    ['灯在远处 l = 20', { i: 50, theta: 35, h: 1, l: 20 }, { limit: true }],
    ['沟槽垂直入射面 θ = 90°', { i: 50, theta: 90, h: 1, l: 2.5 }],
    ['恢复默认', { i: 50, theta: 35, h: 1, l: 2.5 }],
  ],
  parallel: [
    ['θ = 0：顶点落在 O', { i: 50, theta: 0, h: 1 }],
    ['θ = 90°：光柱直线', { i: 50, theta: 90, h: 1 }],
    ['夕阳掠射 i = 80°', { i: 80, theta: 30, h: 1 }],
    ['恢复默认', { i: 50, theta: 35, h: 1 }],
  ],
  // 六个实拍场景（i = 80°）；R = 20 足以框住各自的特征（④ 的圈离 C 约 18）。视图对准圆盘
  concentric: [
    ['(1) 一条直径', { i: 80, h: 48, u: 0, v: -270, R: 20 }],
    ['(2) 一道弯弧', { i: 80, h: 28, u: 8, v: -100, R: 20 }],
    ['(3) 上大下小的两道弯弧', { i: 80, h: 7, u: -3, v: -10, R: 20 }],
    ['(4) 一个勾带个圈', { i: 80, h: 5, u: 6, v: -13, R: 20 }],
    ['(5) 上小下大两道弯弧', { i: 80, h: 8, u: 10, v: 6, R: 20 }],
    ['(6) 十字架', { i: 80, h: 10, u: -3, v: 0, R: 20 }],
  ],
};

/* ── 方程（CPU，逐点求值；零堆分配） ─────────────────────────── */
function eqConsts(S, mode = S.mode) {
  const i = S.i * DEG, th = S.theta * DEG;
  const si = Math.sin(i), ci = Math.cos(i), ti = Math.tan(i);
  return { mode, si, ci, ti, st: Math.sin(th), ct: Math.cos(th), h: S.h, l: S.l, u: S.u, v: S.v, H: S.h * ti, L: S.l * ti };
}

/** 未平方方程的 左边 − 右边 */
function eqLR(K, x, y) {
  let lhs, rhs;
  const yp = y + K.H;
  if (K.mode === 'point') {
    const ym = y - K.L;
    lhs = (-x * K.st - ym * K.ct) / Math.sqrt(x * x + ym * ym + K.l * K.l);
    rhs = (x * K.st + yp * K.ct) / Math.sqrt(x * x + yp * yp + K.h * K.h);
  } else if (K.mode === 'parallel') {
    lhs = (x * K.st + yp * K.ct) / Math.sqrt(x * x + yp * yp + K.h * K.h);
    rhs = K.ct * K.si;
  } else {
    lhs = (-x * (y - K.v) + yp * (x - K.u)) / Math.sqrt(x * x + K.h * K.h + yp * yp);
    rhs = (x - K.u) * K.si;
  }
  return lhs - rhs;
}

/** 独立校验：论文式 (1) 的三维矢量形式  d̂·ŝ − q̂·ŝ（不经过上面任何一行代数） */
function eqConeResidual(S, x, y) {
  const K = eqConsts(S);
  let dx = 0, dy = -K.si, dz = -K.ci;
  if (S.mode === 'point') {
    dx = x; dy = y - K.L; dz = -K.l;
    const n = Math.hypot(dx, dy, dz); dx /= n; dy /= n; dz /= n;
  }
  let sx = K.st, sy = K.ct;
  if (S.mode === 'concentric') {
    sx = y - K.v; sy = K.u - x;
    const r = Math.hypot(sx, sy);
    if (r < 1e-9) return 0;
    sx /= r; sy /= r;
  }
  const qx = -x, qy = -K.H - y, qz = K.h, qn = Math.hypot(qx, qy, qz);
  return (dx * sx + dy * sy) - (qx * sx + qy * sy) / qn;
}

/* ── 公式排版 ─────────────────────────────────────────────────── */
const eqI = (s) => `<i>${s}</i>`;
const eqFn = (s) => `<span class="fn">${s}</span>`;
const eqFr = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
const eqRt = (a) => `<span class="rad">√<span>${a}</span></span>`;
const hti = `${eqI('h')} ${eqFn('tan')} ${eqI('i')}`, lti = `${eqI('l')} ${eqFn('tan')} ${eqI('i')}`;
const sinT = `${eqFn('sin')} θ`, cosT = `${eqFn('cos')} θ`, sinI = `${eqFn('sin')} ${eqI('i')}`;
const EQ_TEX = {
  // 点光源方程两边都是分式，太宽：拆成两行
  point: '<span>' + eqFr(`−${eqI('x')} ${sinT} − (${eqI('y')} − ${lti}) ${cosT}`, eqRt(`${eqI('x')}² + (${eqI('y')} − ${lti})² + ${eqI('l')}²`))
    + '</span><span>= ' + eqFr(`${eqI('x')} ${sinT} + (${eqI('y')} + ${hti}) ${cosT}`, eqRt(`${eqI('x')}² + (${eqI('y')} + ${hti})² + ${eqI('h')}²`)) + '</span>',
  parallel: eqFr(`${eqI('x')} ${sinT} + (${eqI('y')} + ${hti}) ${cosT}`, eqRt(`${eqI('x')}² + (${eqI('y')} + ${hti})² + ${eqI('h')}²`))
    + ` = ${cosT} ${sinI}`,
  concentric: eqFr(`−${eqI('x')}(${eqI('y')} − ${eqI('v')}) + (${eqI('y')} + ${hti})(${eqI('x')} − ${eqI('u')})`, eqRt(`${eqI('x')}² + ${eqI('h')}² + (${eqI('y')} + ${hti})²`))
    + ` = (${eqI('x')} − ${eqI('u')}) ${sinI}`,
};

const eqN = (v, d = 3) => {
  if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
  const s = (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d);
  return s.replace('-', '−');
};
/** "y − 1.192" / "y + 1.192" */
const eqOff = (name, c) => (c >= 0 ? `${name} − ${eqN(c)}` : `${name} + ${eqN(-c)}`);
/** a·A + b·B，自动处理符号 */
const eqLin = (a, A, b, B) => `${eqN(a)}${A} ${b < 0 ? '−' : '+'} ${eqN(Math.abs(b))}${B}`;

function eqNumeric(S) {
  const K = eqConsts(S);
  const yH = eqOff('y', -K.H), yL = eqOff('y', K.L);
  if (S.mode === 'point') {
    return `(${eqLin(-K.st, 'x', -K.ct, `(${yL})`)}) / √(x² + (${yL})² + ${eqN(K.l * K.l)})`
      + `\n  = (${eqLin(K.st, 'x', K.ct, `(${yH})`)}) / √(x² + (${yH})² + ${eqN(K.h * K.h)})`;
  }
  if (S.mode === 'parallel') {
    return `(${eqLin(K.st, 'x', K.ct, `(${yH})`)}) / √(x² + (${yH})² + ${eqN(K.h * K.h)})  =  ${eqN(K.ct * K.si)}`;
  }
  return `(−x(${eqOff('y', K.v)}) + (${yH})(${eqOff('x', K.u)})) / √(x² + ${eqN(K.h * K.h)} + (${yH})²)\n  =${eqN(K.si)}·(${eqOff('x', K.u)})`;
}

/* ── 零值集追踪：逐格变号 + 试位法细化 + 连成折线 ─────────────── */
function eqTrace(view, fn, step) {
  const W = view.w, Hh = view.h, off = -0.37 * step;
  const nx = Math.ceil(W / step) + 2, ny = Math.ceil(Hh / step) + 2;
  const wx = new Float64Array(nx), wy = new Float64Array(ny), val = new Float64Array(nx * ny);
  for (let i = 0; i < nx; i++) wx[i] = view.wx(i * step + off);
  for (let j = 0; j < ny; j++) wy[j] = view.wy(j * step + off);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[j * nx + i] = fn(wx[i], wy[j]);

  const pts = new Map(), adj = new Map();
  // 边编号：横边 (i,j)→(i+1,j) 为偶数，竖边 (i,j)→(i,j+1) 为奇数
  const edge = (i0, j0, i1, j1) => {
    const key = 2 * (j0 * nx + i0) + (j1 !== j0 ? 1 : 0);
    if (pts.has(key)) return key;
    let fa = val[j0 * nx + i0], fb = val[j1 * nx + i1], ta = 0, tb = 1;
    let t = fa / (fa - fb);
    const X0 = wx[i0], Y0 = wy[j0], DX = wx[i1] - X0, DY = wy[j1] - Y0;
    for (let k = 0; k < 3; k++) {
      const f = fn(X0 + DX * t, Y0 + DY * t);
      if (!isFinite(f)) break;
      if ((f > 0) === (fa > 0)) { ta = t; fa = f; } else { tb = t; fb = f; }
      t = ta + ((tb - ta) * fa) / (fa - fb);
    }
    pts.set(key, [(i0 + (i1 - i0) * t) * step + off, (j0 + (j1 - j0) * t) * step + off]);
    return key;
  };
  const link = (a, b) => {
    (adj.get(a) || adj.set(a, []).get(a)).push(b);
    (adj.get(b) || adj.set(b, []).get(b)).push(a);
  };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = val[j * nx + i], b = val[j * nx + i + 1], c = val[(j + 1) * nx + i + 1], d = val[(j + 1) * nx + i];
    if (!(isFinite(a) && isFinite(b) && isFinite(c) && isFinite(d))) continue;
    const pa = a > 0, pb = b > 0, pc = c > 0, pd = d > 0;
    const top = pa !== pb, right = pb !== pc, bottom = pd !== pc, left = pa !== pd;
    const n = top + right + bottom + left;
    if (n === 2) {
      const E = [];
      if (top) E.push(edge(i, j, i + 1, j));
      if (right) E.push(edge(i + 1, j, i + 1, j + 1));
      if (bottom) E.push(edge(i, j + 1, i + 1, j + 1));
      if (left) E.push(edge(i, j, i, j + 1));
      link(E[0], E[1]);
    } else if (n === 4) {
      const T = edge(i, j, i + 1, j), R = edge(i + 1, j, i + 1, j + 1), B = edge(i, j + 1, i + 1, j + 1), L = edge(i, j, i, j + 1);
      const m = fn((wx[i] + wx[i + 1]) / 2, (wy[j] + wy[j + 1]) / 2);
      if ((m > 0) === pa) { link(T, R); link(B, L); } else { link(T, L); link(R, B); }
    }
  }
  const lines = [], seen = new Set();
  const walk = (start) => {
    const arr = [];
    let prev = -1, cur = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      const p = pts.get(cur);
      arr.push(p[0], p[1]);
      const nb = adj.get(cur);
      const nxt = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur; cur = nxt;
    }
    if (cur === start && arr.length > 4) arr.push(arr[0], arr[1]);
    lines.push(arr);
  };
  for (const [k, nb] of adj) if (nb.length === 1 && !seen.has(k)) walk(k);
  for (const k of adj.keys()) if (!seen.has(k)) walk(k);
  return lines;
}

/* ════════════════════════════════════════════════════════════════ */
class EquationTab {
  constructor(pane) {
    this.pane = pane;
    let look = 'light';
    try { look = localStorage.getItem('glitter.eqLook') || 'light'; } catch (e) { /* 无痕窗口 */ }
    this.S = {
      mode: 'point', i: 50, theta: 35, h: 1, l: 2.5, u: 0.6, v: 1.2, R: 2, unitH: false, look,
      rng: Object.fromEntries(Object.entries(EQ_PARAMS).map(([k, d]) => [k, { min: d.min, max: d.max, step: d.step }])),
      show: { curve: true, points: true, limit: false, asym: true, axis: false, disk: true, wedge: false, vasym: false, tangent: false, minnaert: false },
    };
    pane.dataset.look = look;
    this.canvas = $('#eqCanvas', pane);
    this.ctx = this.canvas.getContext('2d');
    this.w = 1; this.h = 1; this.dpr = 1;
    this.cx = 0; this.cy = 0; this.s = 60;
    this.dirty = true;
    this.syncs = [];
    this.hover = null; this.drag = null;

    this.buildCases();
    // 手机端分组栏：插在情况切换与滚动区之间（桌面端隐藏）
    this.gbar = GroupBar($('#eqAlg', pane), $('#eqAlg', pane),
      [['formula', '方程'], ['params', '参数'], ['layers', '图层'], ['preset', '预设']], 'params', $('#eqScroll', pane));
    $('#eqForm', pane).dataset.g = 'params';
    this.buildTool();
    this.bindInput();
    this.bindCanvas();
    this.bindDrawer();
    this.rebuild();
    this.ro = onResize($('#eqStage', pane), (w, h) => this.resize(w, h));
    this.fit();
    requestAnimationFrame(() => this.selfCheck());
  }

  /* ---- 坐标变换：绘图坐标 = 世界坐标 / k（"以 h 为单位"时 k = h） ---- */
  get k() { return this.S.unitH ? this.S.h : 1; }
  sx(x) { return this.w / 2 + (x / this.k - this.cx) * this.s; }
  sy(y) { return this.h / 2 - (y / this.k - this.cy) * this.s; }
  wx(px) { return ((px - this.w / 2) / this.s + this.cx) * this.k; }
  wy(py) { return (-(py - this.h / 2) / this.s + this.cy) * this.k; }

  resize(w, h) {
    if (w < 2 || h < 2) return;
    const first = this.w < 2;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    if (first) this.fit();
    this.dirty = true;
  }

  /** 各情况的特征点（世界坐标） */
  keyPoints() {
    const S = this.S, K = eqConsts(S);
    const P = [{ id: 'O', x: 0, y: 0, free: false }];
    P.push({ id: 'F', x: 0, y: -K.H, free: !S.unitH });
    if (S.mode === 'point') P.push({ id: 'G', x: 0, y: K.L, free: !S.unitH });
    if (S.mode === 'concentric') P.push({ id: 'C', x: K.u, y: K.v, free: true });
    if (S.mode === 'parallel') {
      const k = K.ct * K.si;
      if (Math.abs(k) > 1e-6) {
        const m = k / Math.sqrt(1 - k * k);
        P.push({ id: 'V', x: m * K.h * K.st, y: -K.H + m * K.h * K.ct, free: false });
      }
    }
    return P;
  }

  /** 标准视图：框住特征点（过远的灯下点不强求）；同心槽以圆盘为主，离盘太远的 O、F 不强求 */
  fit() {
    if (this.w < 2) return;
    const S = this.S, k = this.k;
    let cx, cy, half;
    {
      let P = this.keyPoints().filter((p) => p.id !== 'G' || Math.abs(p.y) < 8 * S.h);
      if (S.mode === 'concentric') {
        P = P.filter((p) => p.id === 'C' || Math.hypot(p.x - S.u, p.y - S.v) < 3 * S.R);
        P.push({ x: S.u - S.R, y: S.v - S.R }, { x: S.u + S.R, y: S.v + S.R });
      }
      const xs = P.map((p) => p.x / k), ys = P.map((p) => p.y / k);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2;
      const span = Math.max((x1 - x0) / 2, (y1 - y0) / 2);
      half = S.mode === 'concentric' ? span * 1.15 : Math.max(span * 1.7 + 1.2, 2.5);
    }
    this.cx = cx; this.cy = cy;
    this.s = Math.min(this.w, this.h) / (2 * half);
    this.dirty = true;
  }

  /* ---- 图层定义（数组顺序 = 绘制顺序，亮线压在最上） ---- */
  layers() {
    const S = this.S;
    const L = [];
    if (S.mode === 'point') {
      L.push({ key: 'limit', color: 'limit', dashed: true, label: `平行光极限 ${eqI('l')} → ∞`, note: '即式 (2)。把 l 调大，亮线向它靠拢' });
    }
    if (S.mode === 'parallel') {
      L.push({ key: 'axis', color: 'guide', dashed: true, label: '对称轴（过 F、沿沟槽）', note: '双曲线的实轴方向' });
      L.push({ key: 'asym', color: 'asym', dashed: true, label: `渐近线 ${eqI('Y')} = ±${eqI('mX')}`, note: '都过 F；与沟槽的夹角等于反射锥半顶角 α' });
    }
    if (S.mode === 'concentric') {
      L.push({ key: 'disk', color: 'disk', label: `圆盘：圆心 ${eqI('C')}、半径 ${eqI('R')}`, note: '真实的锅或盘只在盘面上亮' });
      L.push({ key: 'wedge', color: 'guide', dashed: true, label: `边界：直线 ${eqI('FC')} 与 ${eqI('x')} = ${eqI('u')}`, note: '整条亮线只在这对对顶角里' });
      L.push({ key: 'vasym', color: 'asym', dashed: true, label: `竖直渐近线 ${eqI('x')} = ${eqI('u')}(1 ± 1/${eqFn('sin')} ${eqI('i')})`, note: '只由 u 和 i 决定，与 v、h 无关' });
      L.push({ key: 'tangent', color: 'tangent', dashed: true, label: `${eqI('O')} 处切线`, note: '斜率 v/(u cos²i)；真实曲线与远场双曲线在 O 相切' });
      L.push({ key: 'minnaert', color: 'limit', dashed: true, label: '远场双曲线 式 (5)', note: 'Minnaert 的结果，含十字渐近线；眼睛越远越贴合' });
    }
    L.push({ key: 'curve', color: 'curve', label: '亮线', note: `未平方方程的零值集 · ${EQ_CASES[S.mode].kind}` });
    const ptsLabel = { point: `${eqI('O')} 镜面点 · ${eqI('F')} 眼下点 · ${eqI('G')} 灯下点`, parallel: `${eqI('O')} 镜面点 · ${eqI('F')} 眼下点（中心）· ${eqI('V')} 顶点`, concentric: `${eqI('O')} 镜面点 · ${eqI('F')} 眼下点 · ${eqI('C')} 沟槽圆心` }[S.mode];
    L.push({ key: 'points', color: 'free', label: '特征点', note: ptsLabel + '；蓝色点可拖' });
    return L;
  }

  /* ---- 界面：情况切换 ---- */
  buildCases() {
    const box = el('div', 'seg', $('#eqCases', this.pane));
    this.caseBtns = Object.entries(EQ_CASES).map(([id, c]) => {
      const b = el('button', null, box);
      b.type = 'button';
      b.innerHTML = `${c.tab}<small>${c.kind}</small>`;
      b.addEventListener('click', () => this.setMode(id));
      return [id, b];
    });
  }
  setMode(id) {
    if (this.S.mode === id) return;
    this.S.mode = id;
    this.rebuild();
    this.fit();
    this.selfCheck();
  }

  /* ---- 界面：绘图区工具条 ---- */
  buildTool() {
    const host = $('#eqTool', this.pane);
    const home = el('button', 'btn', host);
    home.type = 'button';
    home.textContent = '⌂ 标准视图';
    home.addEventListener('click', () => this.fit());
    this.unitSync = Seg(host, {
      options: [[false, '绝对长度'], [true, '以 h 为单位']],
      get: () => this.S.unitH,
      set: (v) => { this.S.unitH = v; this.unitSync(); this.fit(); this.changed(); },
    });
    this.lookSync = Seg(host, {
      options: [['light', '白底'], ['dark', '暗底']],
      get: () => this.S.look,
      set: (v) => {
        this.S.look = v; this.pane.dataset.look = v; this.lookSync();
        try { localStorage.setItem('glitter.eqLook', v); } catch (e) { /* 忽略 */ }
        this.rebuild();
      },
    });
    const to3d = el('button', 'btn', host);
    to3d.type = 'button';
    to3d.textContent = '在 3D 场景中查看 ↗';
    // 手机上一行放不下：每个按钮给一长一短两套文字，CSS 按宽度切换
    const short = { '⌂ 标准视图': '⌂', '绝对长度': '绝对', '以 h 为单位': '÷h', '白底': '白', '暗底': '暗', '在 3D 场景中查看 ↗': '3D ↗' };
    host.querySelectorAll('button').forEach((b) => {
      const t = b.textContent;
      if (short[t]) b.innerHTML = `<span class="lbl-l">${t}</span><span class="lbl-s">${short[t]}</span>`;
    });
    home.setAttribute('aria-label', '标准视图');
    to3d.title = '把当前 i、θ、h、l、u、v、R 换算成「反射亮线模拟」的太阳、灯、眼睛与沟槽，跳过去对照';
    to3d.addEventListener('click', () => this.sendTo3D());
  }

  /* ---- 界面：代数区（情况 / 视觉主题变化时整块重建） ---- */
  rebuild() {
    const S = this.S, pal = EQ_PAL[S.look], c = EQ_CASES[S.mode];
    this.caseBtns.forEach(([id, b]) => b.setAttribute('aria-pressed', String(id === S.mode)));
    $('#eqTitle', this.pane).textContent = `${c.title} · ${c.kind}`;
    const host = $('#eqScroll', this.pane);
    host.innerHTML = '';
    this.syncs = [];

    const fm = el('section', 'formula', host);
    fm.dataset.g = 'formula';
    fm.innerHTML = `<div class="src"><b>亮线方程</b><span>${c.src}</span></div><div class="big">${S.mode === 'point' ? EQ_TEX.point : `<span>${EQ_TEX[S.mode]}</span>`}</div>`;
    this.numEl = el('div', 'sub', fm);

    el('div', 'alg-sec', host).textContent = '参数';
    const pbox = el('div', null, host);
    pbox.dataset.g = 'params';
    c.params.forEach((key) => this.paramRow(pbox, key));

    el('div', 'alg-sec', host).textContent = '图层';
    const lbox = el('div', null, host);
    lbox.dataset.g = 'layers';
    this.layers().forEach((ly) => {
      const row = el('div', 'arow', lbox);
      const mb = el('button', 'marble' + (ly.dashed ? ' dashed' : ''), row);
      mb.type = 'button';
      mb.style.setProperty('--c', pal[ly.color]);
      mb.setAttribute('aria-label', '显示或隐藏：' + ly.label.replace(/<[^>]+>/g, ''));
      const lab = el('div', 'lay', row);
      lab.innerHTML = `<span>${ly.label}</span><small>${ly.note}</small>`;
      const toggle = () => { S.show[ly.key] = !S.show[ly.key]; sync(); this.dirty = true; };
      const sync = () => mb.setAttribute('aria-pressed', String(!!S.show[ly.key]));
      mb.addEventListener('click', toggle);
      lab.addEventListener('click', toggle);
      sync();
      this.syncs.push(sync);
    });

    el('div', 'alg-sec', host).textContent = '预设';
    const pre = el('div', 'alg-presets', host);
    pre.dataset.g = 'preset';
    EQ_PRESETS[S.mode].forEach(([label, patch, layers]) => {
      const b = el('button', 'btn', pre);
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        Object.entries(patch).forEach(([k, v]) => {
          S[k] = v;
          const rg = S.rng[k];
          if (v < rg.min) rg.min = v;
          if (v > rg.max) rg.max = v;
        });
        if (layers) Object.assign(S.show, layers);
        this.changed();
        this.fit();
        this.say(`已切换到「${label}」`);
      });
    });
    const hint = el('p', 'alg-hint', host);
    hint.dataset.g = 'preset';
    hint.innerHTML = '数值框可直接改写；⋮ 可调滑块范围与步长。输入框支持 <span class="num">i = 60°</span>、<span class="num">θ = 30</span>、<span class="num">C = (0.5, 1)</span>、<span class="num">R = 20</span>，多条用分号隔开。';

    this.changed();
    if (this.gbar) this.gbar.apply();   // 节点是重建出来的，重新套用分组
  }

  paramRow(host, key) {
    const d = EQ_PARAMS[key], S = this.S, rg = S.rng[key];
    const row = el('div', 'arow prow', host);
    el('span', 'pdot', row);
    const main = el('div', 'pmain', row);
    const line = el('div', 'pline', main);
    const lab = el('label', null, line);
    lab.htmlFor = `eq-p-${key}`;
    lab.textContent = `${d.sym} =`;
    const num = el('input', 'pnum num', line);
    Object.assign(num, { id: `eq-p-${key}`, type: 'text', inputMode: 'decimal', spellcheck: false });
    if (d.unit) el('span', 'unit', line).textContent = d.unit;
    el('span', 'pname', line).textContent = d.name;
    const rng = el('input', null, main);
    Object.assign(rng, { id: `eq-r-${key}`, type: 'range' });
    rng.setAttribute('aria-label', `${d.name} ${d.sym}`);
    const box = el('div', 'prng', main);
    box.hidden = true;
    const fields = ['min', 'max', 'step'].map((f) => {
      const l = el('label', null, box);
      l.textContent = { min: '最小值', max: '最大值', step: '步长' }[f];
      const inp = el('input', null, l);
      Object.assign(inp, { id: `eq-${f}-${key}`, type: 'text', inputMode: 'decimal' });
      inp.addEventListener('change', () => {
        const v = eqParse(inp.value);
        const next = { ...rg, [f]: v };
        if (!isFinite(v) || next.min >= next.max || next.step <= 0) { this.say(`${d.sym} 的${l.firstChild.textContent}无效：需满足 最小值 < 最大值、步长 > 0`, true); }
        else Object.assign(rg, next);
        sync();
      });
      return [f, inp];
    });
    const kebab = el('button', 'kebab', row);
    kebab.type = 'button';
    kebab.textContent = '⋮';
    kebab.title = '滑块范围与步长';
    kebab.setAttribute('aria-expanded', 'false');
    kebab.addEventListener('click', () => {
      box.hidden = !box.hidden;
      kebab.setAttribute('aria-expanded', String(!box.hidden));
    });

    rng.addEventListener('input', () => this.setParam(key, parseFloat(rng.value)));
    const commit = () => {
      const v = eqParse(num.value);
      if (!isFinite(v)) { this.say(`「${num.value}」不是数字，${d.sym} 保持 ${eqFmt(S[key])}`, true); sync(); return; }
      this.setParam(key, v, true);
    };
    num.addEventListener('change', commit);
    num.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); num.blur(); }
      if (e.key === 'Escape') { sync(); num.blur(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        this.setParam(key, S[key] + (e.key === 'ArrowUp' ? 1 : -1) * rg.step * (e.shiftKey ? 10 : 1), true);
      }
    });
    const sync = () => {
      const v = S[key];
      Object.assign(rng, { min: rg.min, max: rg.max, step: rg.step });
      rng.value = v;
      rng.style.setProperty('--p', clamp((v - rg.min) / (rg.max - rg.min), 0, 1) * 100 + '%');
      if (document.activeElement !== num) num.value = eqFmt(v);
      fields.forEach(([f, inp]) => { if (document.activeElement !== inp) inp.value = eqFmt(rg[f]); });
    };
    sync();
    this.syncs.push(sync);
  }

  /** 设参数：越出硬界时夹住；extend 时像 GeoGebra 一样把滑块范围撑开 */
  setParam(key, val, extend) {
    const d = EQ_PARAMS[key], rg = this.S.rng[key];
    if (!isFinite(val)) return false;
    let clipped = false;
    if (d.lo !== undefined && val < d.lo) { val = d.lo; clipped = true; }
    if (d.hi !== undefined && val > d.hi) { val = d.hi; clipped = true; }
    if (extend) { if (val < rg.min) rg.min = val; if (val > rg.max) rg.max = val; }
    this.S[key] = val;
    if (clipped) this.say(key === 'i' ? '入射角 i 需在 0° 与 90° 之间（不含端点），已夹到边界' : `${d.sym} 必须为正，已夹到 ${d.lo}`, true);
    this.changed();
    return true;
  }

  changed() {
    this.dirty = true;
    this.syncs.forEach((f) => f());
    if (this.numEl) this.numEl.textContent = eqNumeric(this.S);
  }

  /* ---- 输入栏 ---- */
  bindInput() {
    $('#eqForm', this.pane).addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('#eqInput', this.pane);
      if (this.applyInput(inp.value)) inp.value = '';
    });
  }
  say(msg, err) {
    const m = $('#eqMsg', this.pane);
    m.textContent = msg;
    m.classList.toggle('err', !!err);
  }
  applyInput(text) {
    const src = text.replace(/[＝]/g, '=').replace(/，/g, ',').replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/−/g, '-');
    const parts = src.split(/[;；\n]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return false;
    const alias = { i: 'i', θ: 'theta', theta: 'theta', h: 'h', l: 'l', u: 'u', v: 'v', r: 'R' };
    const done = [], unused = [];
    for (const p of parts) {
      let m = p.match(/^C\s*=?\s*\(\s*([^,]+),\s*([^)]+)\)$/i);
      if (m) {
        const u = eqParse(m[1]), v = eqParse(m[2]);
        if (!isFinite(u) || !isFinite(v)) return this.fail(p);
        this.setParam('u', u, true); this.setParam('v', v, true);
        done.push(`C = (${eqFmt(u)}, ${eqFmt(v)})`);
        if (this.S.mode !== 'concentric') unused.push('C');
        continue;
      }
      m = p.match(/^([a-zA-Zθ]+)\s*=\s*(.+)$/);
      const key = m && alias[m[1].toLowerCase()] || (m && alias[m[1]]);
      if (!key) return this.fail(p);
      const v = eqParse(m[2]);
      if (!isFinite(v)) return this.fail(p);
      this.setParam(key, v, true);
      done.push(`${EQ_PARAMS[key].sym} = ${eqFmt(this.S[key])}${EQ_PARAMS[key].unit}`);
      if (!EQ_CASES[this.S.mode].params.includes(key)) unused.push(EQ_PARAMS[key].sym);
    }
    this.say('已设置 ' + done.join('，') + (unused.length ? `（当前情况用不到 ${unused.join('、')}，切换情况后生效）` : ''));
    return true;
  }
  fail(p) {
    this.say(`没看懂「${p}」。可以输入 i = 60°、θ = 30、h = 1.2、l = 3、u = 0.5、v = -1、R = 20 或 C = (0.5, 1)`, true);
    return false;
  }

  /* ---- 绘图区交互：拖点 / 平移 / 缩放 ---- */
  hit(px, py, touch) {
    if (!this.S.show.points) return null;
    const R = touch ? 20 : 12;
    let best = null, bd = R;
    this.keyPoints().forEach((p) => {
      if (!p.free) return;
      const d = Math.hypot(this.sx(p.x) - px, this.sy(p.y) - py);
      if (d < bd) { bd = d; best = p.id; }
    });
    return best;
  }
  bindCanvas() {
    const cv = this.canvas, ptrs = new Map();
    const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    let pinch = 0;
    cv.addEventListener('pointerdown', (e) => {
      const [px, py] = local(e);
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, [px, py]);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
        this.drag = { kind: 'pinch' };
        return;
      }
      const id = this.hit(px, py, e.pointerType === 'touch');
      this.drag = id ? { kind: 'point', id } : { kind: 'pan', px, py, cx: this.cx, cy: this.cy };
      cv.style.cursor = 'grabbing';
    });
    cv.addEventListener('pointermove', (e) => {
      const [px, py] = local(e);
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [px, py]);
      this.showCoord(px, py);
      const D = this.drag;
      if (!D) { cv.style.cursor = this.hit(px, py) ? 'grab' : 'default'; return; }
      if (D.kind === 'pinch' && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const dd = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch > 0) this.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, dd / pinch);
        pinch = dd;
      } else if (D.kind === 'pan') {
        this.cx = D.cx - (px - D.px) / this.s;
        this.cy = D.cy + (py - D.py) / this.s;
        this.dirty = true;
      } else if (D.kind === 'point') {
        const x = this.wx(px), y = this.wy(py), K = eqConsts(this.S);
        if (D.id === 'C') {
          const snap = (v) => (Math.abs(v) < 6 / this.s * this.k ? 0 : Math.round(v * 100) / 100);
          this.setParam('u', snap(x), true); this.setParam('v', snap(y), true);
        } else if (D.id === 'F') this.setParam('h', Math.max(0.01, Math.round((-y / K.ti) * 100) / 100), true);
        else if (D.id === 'G') this.setParam('l', Math.max(0.01, Math.round((y / K.ti) * 100) / 100), true);
      }
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0) { this.drag = null; cv.style.cursor = 'default'; }
      else if (this.drag && this.drag.kind === 'pinch') {
        const [p] = [...ptrs.values()];
        this.drag = { kind: 'pan', px: p[0], py: p[1], cx: this.cx, cy: this.cy };
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (!this.drag) $('#eqCoord', this.pane).textContent = ''; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [px, py] = local(e);
      this.zoomAt(px, py, Math.exp(-clamp(e.deltaY, -120, 120) * 0.0016));
    }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  zoomAt(px, py, f) {
    const gx = (px - this.w / 2) / this.s + this.cx, gy = -(py - this.h / 2) / this.s + this.cy;
    this.s = clamp(this.s * f, 2, 20000);
    this.cx = gx - (px - this.w / 2) / this.s;
    this.cy = gy + (py - this.h / 2) / this.s;
    this.dirty = true;
  }
  showCoord(px, py) {
    const k = this.S.unitH ? '/h' : '';
    const dec = clamp(Math.ceil(Math.log10(this.s)) , 1, 5);
    $('#eqCoord', this.pane).textContent = `x${k} = ${eqN(this.wx(px) / this.k, dec)}    y${k} = ${eqN(this.wy(py) / this.k, dec)}`;
  }

  bindDrawer() {
    const alg = $('#eqAlg', this.pane), scrim = $('#scrim');
    const open = (v) => { alg.classList.toggle('open', v); scrim.classList.toggle('open', v); };
    $('#eqFab', this.pane).addEventListener('click', () => open(true));
    $('#eqAlgClose', this.pane).addEventListener('click', () => open(false));
    scrim.addEventListener('click', () => open(false));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  }

  /* ---- 联动 3D：同一坐标系（O 在世界原点，光从 +y 射来） ---- */
  sendTo3D() {
    const S = this.S, K = eqConsts(S), conc = S.mode === 'concentric';
    // 同心槽：方程对平移与整体缩放不变 ⟹ 把 C 挪到 3D 原点、圆盘缩到半径 2，便于 3D 取景
    const q = conc ? 2 / S.R : 1, ox = conc ? S.u : 0, oy = conc ? S.v : 0;
    const patch = {
      lightMode: S.mode === 'point' ? 'point' : 'parallel',
      azimuth: 90, elevation: 90 - S.i,
      pointLightPos: { x: 0, y: +K.L.toFixed(3), z: +K.l.toFixed(3) },
      surfaceType: S.mode === 'concentric' ? 'disk' : 'plate',
      // 3D 场景沟槽方向 t̂ = (cos g, sin g)；论文 ŝ = (sin θ, cos θ) ⟹ g = 90° − θ
      grooveAngle: (((90 - S.theta) % 180) + 180) % 180,
      centerX: 0, centerY: 0, diskRadius: 2,
      eyePos: { x: +(-ox * q).toFixed(3), y: +((-K.H - oy) * q).toFixed(3), z: +(K.h * q).toFixed(3) },
      specularH: 0, infiniteSurface: !conc,
    };
    showTab('glitter');
    applyPreset(clone({ ...DEFAULTS, ...patch }));
  }

  /* ---- 绘制 ---- */
  frame = () => {
    if (!this.dirty || this.w < 2) return;
    this.dirty = false;
    this.draw();
  };

  draw() {
    const S = this.S, pal = EQ_PAL[S.look], ctx = this.ctx, K = eqConsts(S);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawGrid(pal);

    const step = clamp(Math.sqrt((this.w * this.h) / 90000), 2.5, 5);
    const traced = (fn, color, width, dash) => this.stroke(eqTrace(this, fn, step), color, width, dash);
    const sh = S.show;

    if (S.mode === 'point' && sh.limit) {
      const K2 = eqConsts(S, 'parallel');
      traced((x, y) => eqLR(K2, x, y), pal.limit, 1.6, [7, 5]);
    }
    if (S.mode === 'parallel') {
      const k = K.ct * K.si, Fy = -K.H;
      if (sh.axis) this.lineInf(0, Fy, K.st, K.ct, pal.guide, 1.2, [2, 4]);
      if (sh.asym && Math.abs(k) > 1e-6 && Math.abs(k) < 1) {
        const m = k / Math.sqrt(1 - k * k);
        this.lineInf(0, Fy, K.ct + m * K.st, -K.st + m * K.ct, pal.asym, 1.3, [8, 5]);
        this.lineInf(0, Fy, K.ct - m * K.st, -K.st - m * K.ct, pal.asym, 1.3, [8, 5]);
      }
    }
    if (S.mode === 'concentric') {
      if (sh.disk) this.drawDisk(pal);
      if (sh.wedge) {
        this.lineInf(0, -K.H, K.u, K.v + K.H, pal.guide, 2.4, [9, 6]);
        this.lineInf(K.u, 0, 0, 1, pal.guide, 2.4, [9, 6]);
      }
      if (sh.vasym && Math.abs(K.u) > 1e-9) {
        this.lineInf(K.u * (1 - 1 / K.si), 0, 0, 1, pal.asym, 1.3, [8, 5]);
        this.lineInf(K.u * (1 + 1 / K.si), 0, 0, 1, pal.asym, 1.3, [8, 5]);
      }
      if (sh.tangent) {
        if (Math.abs(K.u) < 1e-9) this.lineInf(0, 0, 0, 1, pal.tangent, 1.2, [5, 4]);
        else this.lineInf(0, 0, K.u * K.ci * K.ci, K.v, pal.tangent, 1.2, [5, 4]);
      }
      if (sh.minnaert) {
        const t2 = K.ti * K.ti, s2 = K.si * K.si;
        traced((x, y) => x * y + (K.u * y) / t2 - (K.v * x) / s2, pal.limit, 1.6, [7, 5]);
        this.lineInf(-K.u / t2, 0, 0, 1, pal.limit, 1, [2, 4]);
        this.lineInf(0, K.v / s2, 1, 0, pal.limit, 1, [2, 4]);
      }
    }
    if (sh.curve) {
      const lines = eqTrace(this, (x, y) => eqLR(K, x, y), step);
      this.stroke(lines, pal.halo, 8);
      this.stroke(lines, pal.curve, 2.6);
    }
    if (sh.points) this.drawPoints(pal);
  }

  /** 圆盘：淡底 + 盘沿 + 几圈示意沟槽（纹圈数随屏幕半径自适应，不代表真实槽距） */
  drawDisk(pal) {
    const S = this.S, ctx = this.ctx, x = this.sx(S.u), y = this.sy(S.v), r = (S.R / this.k) * this.s;
    if (r < 0.5) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = pal.diskFill; ctx.fill();
    ctx.strokeStyle = pal.diskGroove; ctx.lineWidth = 1;
    const rings = clamp(Math.floor(r / 14), 0, 14);
    for (let n = 1; n < rings; n++) { ctx.beginPath(); ctx.arc(x, y, (r * n) / rings, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = pal.disk; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.restore();
  }

  stroke(lines, color, width, dash) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.lineJoin = ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    for (const a of lines) {
      if (a.length < 4) continue;
      ctx.moveTo(a[0], a[1]);
      for (let i = 2; i < a.length; i += 2) ctx.lineTo(a[i], a[i + 1]);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** 过 (x0, y0)、方向 (dx, dy) 的整条直线（世界坐标） */
  lineInf(x0, y0, dx, dy, color, width, dash) {
    const n = Math.hypot(dx, dy);
    if (n < 1e-12) return;
    const L = ((this.w + this.h) / this.s) * this.k * 2 + Math.hypot(x0 - this.cx * this.k, y0 - this.cy * this.k) * 2;
    const ux = (dx / n) * L, uy = (dy / n) * L, ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(this.sx(x0 - ux), this.sy(y0 - uy));
    ctx.lineTo(this.sx(x0 + ux), this.sy(y0 + uy));
    ctx.stroke();
    ctx.restore();
  }

  drawGrid(pal) {
    const ctx = this.ctx, W = this.w, H = this.h, s = this.s;
    const target = 84 / s, p10 = 10 ** Math.floor(Math.log10(target)), r = target / p10;
    const mult = r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10;
    const major = mult * p10, minor = major / (mult === 2 ? 4 : 5);
    const gx0 = this.cx - W / 2 / s, gx1 = this.cx + W / 2 / s;
    const gy0 = this.cy - H / 2 / s, gy1 = this.cy + H / 2 / s;
    const X = (g) => W / 2 + (g - this.cx) * s, Y = (g) => H / 2 - (g - this.cy) * s;
    const lines = (spacing, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let g = Math.ceil(gx0 / spacing) * spacing; g <= gx1; g += spacing) { const x = Math.round(X(g)) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let g = Math.ceil(gy0 / spacing) * spacing; g <= gy1; g += spacing) { const y = Math.round(Y(g)) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    };
    lines(minor, pal.minor);
    lines(major, pal.major);

    // 坐标轴（离开视野时贴边）
    const ax = Math.round(clamp(X(0), 0, W)) + 0.5, ay = Math.round(clamp(Y(0), 0, H)) + 0.5;
    ctx.strokeStyle = pal.axis; ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (X(0) >= 0 && X(0) <= W) { ctx.moveTo(ax, H); ctx.lineTo(ax, 4); }
    if (Y(0) >= 0 && Y(0) <= H) { ctx.moveTo(0, ay); ctx.lineTo(W - 4, ay); }
    ctx.stroke();
    ctx.fillStyle = pal.axis;
    if (Y(0) >= 0 && Y(0) <= H) { ctx.beginPath(); ctx.moveTo(W - 2, ay); ctx.lineTo(W - 11, ay - 4.5); ctx.lineTo(W - 11, ay + 4.5); ctx.fill(); }
    if (X(0) >= 0 && X(0) <= W) { ctx.beginPath(); ctx.moveTo(ax, 2); ctx.lineTo(ax - 4.5, 11); ctx.lineTo(ax + 4.5, 11); ctx.fill(); }

    const dec = Math.max(0, -Math.floor(Math.log10(major) + 1e-9));
    const txt = (g) => (Math.abs(g) < major * 1e-6 ? '0' : g.toFixed(dec)).replace('-', '−');
    ctx.font = `11px ${EQ_MONO_FONT}`;
    ctx.fillStyle = pal.tick;
    ctx.lineWidth = 3; ctx.strokeStyle = pal.bg;
    const lyTop = clamp(Y(0) + 5, 4, H - 16);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let g = Math.ceil(gx0 / major) * major; g <= gx1; g += major) {
      if (Math.abs(g) < major * 1e-6) continue;
      const x = X(g);
      if (x < 14 || x > W - 22) continue;
      ctx.strokeText(txt(g), x, lyTop); ctx.fillText(txt(g), x, lyTop);
    }
    const lxRight = clamp(X(0) - 6, 34, W - 6);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let g = Math.ceil(gy0 / major) * major; g <= gy1; g += major) {
      if (Math.abs(g) < major * 1e-6) continue;
      const y = Y(g);
      if (y < 22 || y > H - 10) continue;
      ctx.strokeText(txt(g), lxRight, y); ctx.fillText(txt(g), lxRight, y);
    }
    const u = this.S.unitH ? '/h' : '';
    ctx.font = `italic 14px ${EQ_MATH_FONT}`;
    ctx.fillStyle = pal.axis;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.strokeText('x' + u, W - 8, ay - 8); ctx.fillText('x' + u, W - 8, ay - 8);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.strokeText('y' + u, ax + 9, 6); ctx.fillText('y' + u, ax + 9, 6);
  }

  drawPoints(pal) {
    const ctx = this.ctx;
    const off = { O: [9, -9], F: [9, 13], G: [9, -9], C: [10, -10], V: [-10, -10] };
    this.keyPoints().forEach((p) => {
      const x = this.sx(p.x), y = this.sy(p.y);
      if (x < -20 || x > this.w + 20 || y < -20 || y > this.h + 20) return;
      ctx.beginPath();
      if (p.free) {
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = pal.free; ctx.fill();
        ctx.lineWidth = 1.6; ctx.strokeStyle = pal.freeRim; ctx.stroke();
      } else {
        ctx.arc(x, y, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = pal.dep; ctx.fill();
      }
      const [dx, dy] = off[p.id];
      ctx.font = `italic 16px ${EQ_MATH_FONT}`;
      ctx.textAlign = dx < 0 ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = pal.textHalo;
      ctx.strokeText(p.id, x + dx, y + dy);
      ctx.fillStyle = pal.text;
      ctx.fillText(p.id, x + dx, y + dy);
    });
  }

  /** 物理自检（控制台）：追踪到的亮线点代回式 (1) 的矢量形式；双曲线核对式 (3)；u = 0 核对环半径 */
  selfCheck() {
    const S = this.S, K = eqConsts(S);
    let worst = 0, n = 0, worst3 = 0;
    for (let r = 0; r < 24; r++) {
      const y = -3 + (6 * r) / 23 + 0.013;
      let xa = -6, fa = eqLR(K, xa, y);
      for (let c = 1; c <= 600; c++) {
        const xb = -6 + (12 * c) / 600, fb = eqLR(K, xb, y);
        if ((fa > 0) !== (fb > 0) && isFinite(fa) && isFinite(fb)) {
          let lo = xa, hi = xb, flo = fa;
          for (let it = 0; it < 60; it++) {
            const mid = (lo + hi) / 2, fm = eqLR(K, mid, y);
            if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
          }
          const x = (lo + hi) / 2;
          worst = Math.max(worst, Math.abs(eqConeResidual(S, x, y)));
          n++;
          if (S.mode === 'parallel') {
            const k = K.ct * K.si;
            if (Math.abs(k) > 1e-3) {
              const m = k / Math.sqrt(1 - k * k), X = x * K.ct - (y + K.H) * K.st, Y = x * K.st + (y + K.H) * K.ct;
              worst3 = Math.max(worst3, Math.abs((Y * Y) / (m * m * K.h * K.h) - (X * X) / (K.h * K.h) - 1) * Math.min(1, (m * m * K.h * K.h) / (Y * Y || 1)));
            }
          }
        }
        xa = xb; fa = fb;
      }
    }
    // u = 0：环上取点代回式 (4)
    const K0 = { ...eqConsts(S, 'concentric'), u: 0, v: 1.3 };
    const r0 = Math.sqrt(((K0.v + K0.H) ** 2) / (K0.si * K0.si) - K0.h * K0.h);
    let ring = 0;
    for (let a = 0; a < 16; a++) ring = Math.max(ring, Math.abs(eqLR(K0, r0 * Math.cos(a * 0.39), -K0.H + r0 * Math.sin(a * 0.39))));
    const ok = worst < 1e-8 && ring < 1e-12 && worst3 < 1e-6;
    const msg = `[方程图像自检] ${EQ_CASES[S.mode].title}：${n} 个亮线点代回式 (1) 矢量形式，最大残差 ${worst.toExponential(1)}`
      + (S.mode === 'parallel' ? `；式 (3) 标准形残差 ${worst3.toExponential(1)}` : '')
      + `；u = 0 环半径代回残差 ${ring.toExponential(1)} → ${ok ? '通过' : '失败'}`;
    console.debug(msg);
    return msg;
  }
}

/** 宽松数字解析：接受 −、°、全角符号 */
function eqParse(s) {
  const t = String(s).trim().replace(/−/g, '-').replace(/[°度]$/, '').replace(/deg$/i, '').trim();
  return t === '' ? NaN : Number(t);
}
const eqFmt = (v) => String(+(+v).toFixed(4)).replace('-', '−');

boot();
