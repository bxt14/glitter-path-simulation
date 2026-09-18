/* ════════════════════════════════════════════════════════════════
   标签页 ②  沟槽微观机理
   槽 = 半椭圆柱 x²/R² + z²/b² = 1（z ≤ 0，轴沿 Y）。
   椭圆法线没有 Y 分量 ⟹ 反射保持沿槽分量：r·ŷ = d·ŷ = −sin i·cos φ
   ⟹ 所有出射光落在绕槽轴的锥面上。
   ════════════════════════════════════════════════════════════════ */
const GR = 1, START_Y = 2.3, PIPE_LEN = 5;
const OUT_LEN = 2.8;          // 反射光基准长度（滑块 100% 对应）
const COL_IN = 0xf5c667, COL_OUT = 0x8fd0ff, COL_MID = 0xffe9b0;

const v3 = (x, y, z) => ({ x, y, z });
const vsub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const vadd = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const vmul = (a, s) => v3(a.x * s, a.y * s, a.z * s);
const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const vlen = (a) => Math.hypot(a.x, a.y, a.z);
const toV = (p) => new T.Vector3(p.x, p.y, p.z);

/** 三维光线追踪：命中点固定在 y=0 横截面上（改 i/φ 时命中位置不动，只有角度变）；单次反射，二次撞壁即终止 */
function traceRay(x0, iDeg, phiDeg, b, outLen, center = false) {
  const i = iDeg * DEG, phi = phiDeg * DEG;
  const d0 = v3(-Math.sin(i) * Math.sin(phi), -Math.sin(i) * Math.cos(phi), -Math.cos(i));
  const q1 = v3(x0, 0, -b * Math.sqrt(Math.max(0, 1 - (x0 * x0) / (GR * GR))));
  const sBack = Math.min((START_Y - q1.z) / Math.cos(i), 4.5);
  const p0 = vsub(q1, vmul(d0, sBack));
  const pts = [p0, q1];
  const bounces = [{ p: q1, kind: 'arc' }];
  let exit = null;

  const ng = v3(q1.x / (GR * GR), 0, q1.z / (b * b));   // 椭圆面法线（梯度，无 Y 分量）
  const n = vmul(ng, 1 / vlen(ng));
  const d1 = vsub(d0, vmul(n, 2 * vdot(d0, n)));
  const p1 = vadd(q1, vmul(d1, 1e-5));

  let tArc = Infinity;
  {
    const A = (d1.x * d1.x) / (GR * GR) + (d1.z * d1.z) / (b * b);
    const B = 2 * ((p1.x * d1.x) / (GR * GR) + (p1.z * d1.z) / (b * b));
    const C = (p1.x * p1.x) / (GR * GR) + (p1.z * p1.z) / (b * b) - 1;
    const disc = B * B - 4 * A * C;
    if (disc > 0 && A > 1e-12) {
      for (const t of [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)]) {
        if (t > 1e-4 && t < tArc && vadd(p1, vmul(d1, t)).z <= 1e-6) tArc = t;
      }
    }
  }
  const tExit = d1.z > 1e-9 ? -p1.z / d1.z : Infinity;
  const exitEnd = (q) => vadd(q, vmul(d1, outLen));
  if (tExit < tArc && tExit < Infinity) {
    const qx = vadd(p1, vmul(d1, tExit));
    if (Math.abs(qx.x) <= GR + 1e-6) {
      pts.push(qx, exitEnd(qx));
      return { pts, exit: d1, bounces, center };
    }
  }
  if (tArc < Infinity) pts.push(vadd(p1, vmul(d1, tArc)));       // 二次命中 → 吸收消失
  else if (d1.z > 1e-6) { pts.push(exitEnd(p1)); exit = d1; }
  return { pts, exit, bounces, center };
}

class GrooveMicro {
  constructor(stage) {
    this.S = { i: 40, phi: 0, rays: 11, depth: 100, normals: true, outLen: 100 };
    this.time = 0; this.last = performance.now();
    const rd = this.renderer = new T.WebGLRenderer({ antialias: true });
    rd.setPixelRatio(dprCap());
    Object.assign(rd.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    stage.insertBefore(rd.domElement, stage.firstChild);
    const sc = this.scene = new T.Scene();
    sc.background = new T.Color(0x0b0e13);
    const cam = this.cam = new T.PerspectiveCamera(42, 1, .1, 100);
    cam.up.set(0, 0, 1);
    cam.position.set(1.2, -5.6, 2.5);
    if ((stage.clientWidth || 1) / Math.max(stage.clientHeight, 1) < 0.9) cam.position.multiplyScalar(1.7);
    this.orbit = new Orbit(cam, rd.domElement, new T.Vector3(0, .1, -.1));
    this.orbit.maxPolar = Math.PI * 0.85;

    sc.add(new T.AmbientLight(0xffffff, .62));
    const key = new T.DirectionalLight(0xfff2dd, 1.5); key.position.set(2, -3, 5);
    const rim = new T.DirectionalLight(0x9cc2f0, .7); rim.position.set(-3, 2, 2);
    sc.add(key, rim);

    this.pipeGroup = new T.Group(); sc.add(this.pipeGroup);
    const flat = new T.MeshStandardMaterial({ color: 0x596270, metalness: .85, roughness: .42 });
    for (const s of [-1, 1]) {
      const strip = new T.Mesh(new T.BoxGeometry(2.2, PIPE_LEN, 1.35), flat);
      strip.position.set(s * (GR + 1.1), 0, -.675);
      sc.add(strip);
    }
    this.belly = new T.Mesh(new T.BoxGeometry(2.02, PIPE_LEN, .38), flat);
    sc.add(this.belly);
    const fill = new T.PointLight(0xfff2dd, 5, 7, 1.8); fill.position.set(.3, -1.6, 1.8);
    sc.add(fill);
    this.grid = new T.GridHelper(14, 28, 0x1c2430, 0x121821);
    this.grid.rotation.x = Math.PI / 2;
    sc.add(this.grid);
    this.rayGroup = new T.Group(); sc.add(this.rayGroup);

    this.photonTex = radialTex(64, [[0, 'rgba(255,244,214,1)'], [.35, 'rgba(245,200,110,.8)'], [1, 'rgba(0,0,0,0)']]);
    this.photonTex.userData.shared = true;   // 光路重建时不随材质一起释放
    const pg = new T.BufferGeometry();
    pg.setAttribute('position', new T.BufferAttribute(new Float32Array(3 * 96), 3));
    this.photons = new T.Points(pg, new T.PointsMaterial({
      map: this.photonTex, size: .14, sizeAttenuation: true,
      transparent: true, opacity: .95, blending: T.AdditiveBlending, depthWrite: false,
    }));
    this.photons.frustumCulled = false;
    sc.add(this.photons);

    this.ro = onResize(stage, (w, h) => {
      rd.setSize(w, h, false); cam.aspect = w / Math.max(h, 1); cam.updateProjectionMatrix();
    });
    this.rebuild();
  }

  set(patch) { Object.assign(this.S, patch); this.rebuild(); }

  rebuild() {
    const S = this.S, b = (S.depth / 100) * GR;
    const outLen = (S.outLen / 100) * OUT_LEN;
    const list = [];
    for (let k = 0; k < S.rays; k++) {
      const x0 = -.98 * GR + (1.96 * GR * k) / (S.rays - 1);
      list.push(traceRay(x0, S.i, S.phi, b, outLen));
    }
    list.push(traceRay(0, S.i, S.phi, b, outLen, true));
    this.rays = list;

    // 自检：锥条件 r·ŷ = −sin i·cos φ
    const want = -Math.sin(S.i * DEG) * Math.cos(S.phi * DEG);
    if (list.some((r) => r.exit && Math.abs(r.exit.y - want) > 1e-9)) console.warn('[沟槽微观] 锥条件 r·ŷ 被破坏');

    disposeTree(this.rayGroup); this.rayGroup.clear();
    disposeTree(this.pipeGroup); this.pipeGroup.clear();

    // 半椭圆柱槽体
    {
      const NT = 96, pos = [], nor = [], idx = [];
      for (let k = 0; k <= NT; k++) {
        const th = Math.PI + (Math.PI * k) / NT;
        const x = GR * Math.cos(th), z = b * Math.sin(th);
        const nx = Math.cos(th) / GR, nz = Math.sin(th) / b, nl = Math.hypot(nx, nz);
        for (const yy of [-PIPE_LEN / 2, PIPE_LEN / 2]) { pos.push(x, yy, z); nor.push(nx / nl, 0, nz / nl); }
      }
      for (let k = 0; k < NT; k++) { const a = 2 * k; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      geo.setIndex(idx);
      this.pipeGroup.add(new T.Mesh(geo, new T.MeshStandardMaterial({
        color: 0x8b95a2, metalness: .9, roughness: .32, side: T.DoubleSide,
      })));
    }
    this.belly.position.set(0, 0, -b - .19);
    this.grid.position.z = -b - .35;

    const grow = Math.max(0, outLen - OUT_LEN);
    const Y_CLIP = PIPE_LEN / 2 + .7 + grow, Z_CLIP = START_Y + .6 + grow;
    const clipSeg = (a, bb) => {
      let lo = 0, hi = 1;
      for (const [ac, bc, lim] of [[a.y, bb.y, Y_CLIP], [a.z, bb.z, Z_CLIP]]) {
        const d = bc - ac;
        if (Math.abs(d) < 1e-9) { if (Math.abs(ac) > lim) return null; continue; }
        const t1 = (-lim - ac) / d, t2 = (lim - ac) / d;
        lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
      }
      return lo >= hi ? null : [a.clone().lerp(bb, lo), a.clone().lerp(bb, hi)];
    };
    const addLines = (segs, color, opacity, yOff = 0) => {
      const pts = [];
      for (const seg of segs) for (let k = 0; k + 1 < seg.length; k++) {
        const c = clipSeg(seg[k], seg[k + 1]);
        if (!c) continue;
        pts.push(c[0].setY(c[0].y + yOff), c[1].setY(c[1].y + yOff));
      }
      if (pts.length) this.rayGroup.add(new T.LineSegments(
        new T.BufferGeometry().setFromPoints(pts),
        new T.LineBasicMaterial({ color, transparent: true, opacity })));
    };

    for (const ray of this.rays) {
      const p3 = ray.pts.map(toV);
      addLines([p3.slice(0, 2)], ray.center ? COL_MID : COL_IN, ray.center ? .95 : .6);
      if (p3.length > 2) addLines([p3.slice(1)], COL_OUT, ray.center ? .95 : .65);
      for (const bo of ray.bounces) {
        const dot = new T.Mesh(new T.SphereGeometry(ray.center ? .035 : .022, 10, 8),
          new T.MeshBasicMaterial({ color: ray.center ? COL_MID : 0xe8eef5 }));
        dot.position.copy(toV(bo.p));
        this.rayGroup.add(dot);
      }
      if (S.normals) {
        const np = [];
        for (const bo of ray.bounces) {
          const n = bo.kind === 'arc' ? v3(-bo.p.x / GR, 0, -bo.p.z / GR) : v3(0, 0, 1);
          np.push(toV(bo.p), toV(vadd(bo.p, vmul(n, .4))));
        }
        if (np.length) {
          const l = new T.LineSegments(new T.BufferGeometry().setFromPoints(np),
            new T.LineDashedMaterial({ color: 0xb4c0cd, transparent: true, opacity: .4, dashSize: .05, gapSize: .05 }));
          l.computeLineDistances();
          this.rayGroup.add(l);
        }
      }
    }

  }

  frame = (now) => {
    const dt = Math.min((now - this.last) / 1000, .1);
    this.last = now;
    this.time += dt;
    const pos = this.photons.geometry.attributes.position;
    let idx = 0;
    this.rays.forEach((ray, ri) => {
      const cum = [0];
      for (let k = 1; k < ray.pts.length; k++) cum.push(cum[k - 1] + vlen(vsub(ray.pts[k], ray.pts[k - 1])));
      const total = cum[cum.length - 1];
      const sp = (this.time * 1.15 + ri * .55) % (total + 1.1);
      if (sp > total || idx >= 96) return;
      let seg = 0;
      while (seg < cum.length - 2 && cum[seg + 1] < sp) seg++;
      const t = cum[seg + 1] === cum[seg] ? 0 : (sp - cum[seg]) / (cum[seg + 1] - cum[seg]);
      const p = vadd(ray.pts[seg], vmul(vsub(ray.pts[seg + 1], ray.pts[seg]), clamp(t, 0, 1)));
      pos.setXYZ(idx++, p.x, p.y, p.z);
    });
    for (let k = idx; k < 96; k++) pos.setXYZ(k, 0, 0, -1000);
    pos.needsUpdate = true;
    this.orbit.update();
    this.renderer.render(this.scene, this.cam);
  };
}

/* ════════════════════════════════════════════════════════════════
   标签页 ③  光锥可视化
   每个点 Q：c = p̂·t̂ → 半角 α = arccos|c|，轴 a = sign(c)·t̂
   母线 g(φ) = a·cosα + sinα·(ẑ·cosφ + u2·sinφ)，u2 = a×ẑ，取 z≥0 半锥
   ════════════════════════════════════════════════════════════════ */
const PLATE_W = 4, PLATE_D = 3, DISK_R = 2;

function buildCones(S) {
  const out = [];
  const az = S.azimuth * DEG, el = S.elevation * DEG;
  const pPar = new T.Vector3(-Math.cos(el) * Math.cos(az), -Math.cos(el) * Math.sin(az), -Math.sin(el));
  const tPlate = new T.Vector3(Math.cos(S.grooveAngle * DEG), Math.sin(S.grooveAngle * DEG), 0);
  const push = (qx, qy) => {
    const t = S.surface === 'plate' ? tPlate.clone() : new T.Vector3(-qy, qx, 0).normalize();
    if (t.lengthSq() < 1e-12) return;                        // 圆心处切向无定义
    const p = S.lightMode === 'parallel' ? pPar
      : new T.Vector3(S.lightPos.x - qx, S.lightPos.y - qy, S.lightPos.z).normalize().negate();
    const c = clamp(p.dot(t), -1, 1);
    out.push({ apex: new T.Vector3(qx, qy, 0), axis: c < 0 ? t.clone().negate() : t, alpha: Math.acos(Math.abs(c)) });
  };
  const n = S.density;
  if (S.surface === 'plate') {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
      push(-PLATE_W / 2 + .4 + ((PLATE_W - .8) * i) / (n - 1), -PLATE_D / 2 + .4 + ((PLATE_D - .8) * j) / (n - 1));
  } else {
    const rings = n - 1, spokes = 8;
    for (let k = 1; k <= rings; k++) {
      const r = ((DISK_R - .2) * k) / (rings + .5);
      for (let a = 0; a < spokes; a++) {
        const phi = (a / spokes) * Math.PI * 2 + (k % 2) * (Math.PI / spokes);
        push(r * Math.cos(phi), r * Math.sin(phi));
      }
    }
  }
  return out;
}

class ConeField {
  constructor(stage) {
    this.S = {
      lightMode: 'parallel', azimuth: 180, elevation: 45, lightPos: { x: -2, y: 0, z: 2.4 },
      surface: 'plate', grooveAngle: 0, density: 4, style: 'lines', lenPct: 100,
    };
    const rd = this.renderer = new T.WebGLRenderer({ antialias: true });
    rd.setPixelRatio(dprCap());
    Object.assign(rd.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    stage.insertBefore(rd.domElement, stage.firstChild);
    const sc = this.scene = new T.Scene();
    sc.background = new T.Color(0x0b0e13);
    const cam = this.cam = new T.PerspectiveCamera(45, 1, .1, 100);
    cam.up.set(0, 0, 1);
    cam.position.set(.6, -6.2, 2.6);
    this.orbit = new Orbit(cam, rd.domElement, new T.Vector3(0, 0, .35));
    this.orbit.maxPolar = Math.PI * 0.85;

    sc.add(new T.AmbientLight(0xffffff, .55));
    const key = new T.DirectionalLight(0xfff2dd, 1.6); key.position.set(3, 2, 5);
    sc.add(key);
    const grid = new T.GridHelper(12, 24, 0x1c2430, 0x141a24);
    grid.rotation.x = Math.PI / 2; grid.position.z = -.02;
    sc.add(grid);
    const axes = new T.AxesHelper(1.2); axes.position.set(-2.8, -2.2, 0);
    sc.add(axes);

    this.coneGroup = new T.Group();
    this.surfGroup = new T.Group();
    this.rayGroup = new T.Group();
    sc.add(this.coneGroup, this.surfGroup, this.rayGroup);
    this.lamp = new T.Mesh(new T.SphereGeometry(.09, 20, 14), new T.MeshBasicMaterial({ color: 0xffd9a0 }));
    this.sun = new T.Mesh(new T.SphereGeometry(.16, 20, 14), new T.MeshBasicMaterial({ color: 0xffd9a0 }));
    sc.add(this.lamp, this.sun);

    this.ro = onResize(stage, (w, h) => {
      rd.setSize(w, h, false); cam.aspect = w / Math.max(h, 1); cam.updateProjectionMatrix();
    });
    this.rebuild();
  }
  set(patch) { Object.assign(this.S, patch); this.rebuild(); }

  rebuild() {
    const S = this.S;
    /* 反射面 + 沟槽纹路 */
    disposeTree(this.surfGroup); this.surfGroup.clear();
    const grooveMat = new T.LineBasicMaterial({ color: 0x6b7684, transparent: true, opacity: .5 });
    if (S.surface === 'plate') {
      this.surfGroup.add(new T.Mesh(new T.PlaneGeometry(PLATE_W, PLATE_D),
        new T.MeshStandardMaterial({ color: 0x9aa4b0, metalness: .85, roughness: .35 })));
      const th = S.grooveAngle * DEG;
      const tx = Math.cos(th), ty = Math.sin(th), nx = -ty, ny = tx;
      const pts = [], halfW = PLATE_W / 2 - .02, halfD = PLATE_D / 2 - .02;
      for (let k = -9; k <= 9; k++) {
        const ox = nx * k * .18, oy = ny * k * .18;
        let lo = -Infinity, hi = Infinity;
        for (const [oc, tc, half] of [[ox, tx, halfW], [oy, ty, halfD]]) {
          if (Math.abs(tc) < 1e-9) { if (Math.abs(oc) > half) { lo = 1; hi = 0; break; } }
          else {
            const a = (-half - oc) / tc, b = (half - oc) / tc;
            lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
          }
        }
        if (lo >= hi) continue;
        pts.push(new T.Vector3(ox + tx * lo, oy + ty * lo, .001), new T.Vector3(ox + tx * hi, oy + ty * hi, .001));
      }
      this.surfGroup.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), grooveMat));
    } else {
      this.surfGroup.add(new T.Mesh(new T.CircleGeometry(DISK_R, 96),
        new T.MeshStandardMaterial({ color: 0x9aa4b0, metalness: .85, roughness: .35 })));
      const pts = [];
      for (let k = 1; k <= 9; k++) {
        const r = (DISK_R * k) / 10;
        for (let a = 0; a < 64; a++) {
          const a1 = (a / 64) * Math.PI * 2, a2 = ((a + 1) / 64) * Math.PI * 2;
          pts.push(new T.Vector3(r * Math.cos(a1), r * Math.sin(a1), .001), new T.Vector3(r * Math.cos(a2), r * Math.sin(a2), .001));
        }
      }
      this.surfGroup.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), grooveMat));
    }

    /* 光锥 */
    const cones = buildCones(S);
    // 教学自检：平行光 + 拉丝板时，各点光锥必须全等
    if (S.lightMode === 'parallel' && S.surface === 'plate' && cones.length > 1) {
      const a0 = cones[0];
      if (cones.some((k) => Math.abs(k.alpha - a0.alpha) > 1e-12 || k.axis.distanceTo(a0.axis) > 1e-12))
        console.warn('[光锥] 平行光+拉丝板的各点光锥应全等，自检失败');
    }
    disposeTree(this.coneGroup); this.coneGroup.clear();
    const spacing = S.surface === 'plate' ? (PLATE_W - .8) / (S.density - 1) : DISK_R / S.density;
    const L = clamp(spacing * .55, .28, .55) * (S.lenPct / 100);
    const col = new T.Color(0xf0c46a);
    const linePts = [], apexPts = [], surfPos = [];
    const ZA = new T.Vector3(0, 0, 1);
    for (const { apex, axis, alpha } of cones) {
      apexPts.push(apex.clone());
      const u2 = new T.Vector3(axis.y, -axis.x, 0);
      const sinA = Math.sin(alpha), cosA = Math.cos(alpha);
      const g = (phi) => new T.Vector3().addScaledVector(axis, cosA)
        .addScaledVector(ZA, sinA * Math.cos(phi)).addScaledVector(u2, sinA * Math.sin(phi));
      if (S.style === 'lines') {
        for (let k = 0; k < 8; k++) {
          const phi = -Math.PI / 2 + (Math.PI * k) / 7;
          linePts.push(apex.clone(), apex.clone().addScaledVector(g(phi), L));
        }
        for (let k = 0; k < 16; k++) {
          const p1 = -Math.PI / 2 + (Math.PI * k) / 16, p2 = -Math.PI / 2 + (Math.PI * (k + 1)) / 16;
          linePts.push(apex.clone().addScaledVector(g(p1), L), apex.clone().addScaledVector(g(p2), L));
        }
      } else {
        for (let k = 0; k < 16; k++) {
          const g1 = apex.clone().addScaledVector(g(-Math.PI / 2 + (Math.PI * k) / 16), L);
          const g2 = apex.clone().addScaledVector(g(-Math.PI / 2 + (Math.PI * (k + 1)) / 16), L);
          surfPos.push(apex.x, apex.y, apex.z, g1.x, g1.y, g1.z, g2.x, g2.y, g2.z);
        }
        for (const ph of [-Math.PI / 2, Math.PI / 2]) linePts.push(apex.clone(), apex.clone().addScaledVector(g(ph), L));
      }
    }
    if (surfPos.length) {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(surfPos, 3));
      geo.computeVertexNormals();
      this.coneGroup.add(new T.Mesh(geo, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: .2, side: T.DoubleSide, depthWrite: false })));
    }
    if (linePts.length) this.coneGroup.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(linePts),
      new T.LineBasicMaterial({ color: col, transparent: true, opacity: S.style === 'lines' ? .85 : .9 })));
    this.coneGroup.add(new T.Points(new T.BufferGeometry().setFromPoints(apexPts),
      new T.PointsMaterial({ color: 0xe8eef5, size: 4, sizeAttenuation: false })));

    /* 光源标记与入射线 */
    disposeTree(this.rayGroup); this.rayGroup.clear();
    const rayPts = [];
    if (S.lightMode === 'point') {
      this.lamp.visible = true; this.sun.visible = false;
      this.lamp.position.set(S.lightPos.x, S.lightPos.y, S.lightPos.z);
      const L0 = this.lamp.position;
      for (const [tx, ty] of [[-1.2, -1], [0, -1], [1.2, -1], [-1.2, 1], [0, 1], [1.2, 1], [0, 0]])
        rayPts.push(L0.clone(), L0.clone().lerp(new T.Vector3(tx, ty, 0), .88));
    } else {
      this.lamp.visible = false; this.sun.visible = true;
      const az = S.azimuth * DEG, el = S.elevation * DEG;
      const from = new T.Vector3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el));
      this.sun.position.copy(from).multiplyScalar(3.1);
      for (let k = -2; k <= 2; k++) {
        const B = new T.Vector3(0, k * .85, 0);
        rayPts.push(B.clone().add(from.clone().multiplyScalar(2.6)), B.clone().add(from.clone().multiplyScalar(.45)));
      }
    }
    this.rayGroup.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(rayPts),
      new T.LineBasicMaterial({ color: 0xf5c667, transparent: true, opacity: .45 })));
  }

  frame = () => { this.orbit.update(); this.renderer.render(this.scene, this.cam); };
}

/* ════════════════════════════════════════════════════════════════
   界面装配
   ════════════════════════════════════════════════════════════════ */
let P = clone(DEFAULTS);
let sim = null, micro = null, cones = null, eqTab = null, railPanel = null, selection = null, transformMode = 'translate';

function setP(patch, reproject) {
  Object.assign(P, patch);
  if (sim) sim.setParams(P);
  if (reproject) sim && (sim.pointNeedsInit = true);
  railPanel && railPanel.refresh();
  $('#focalTag').textContent = Math.round(P.focalLength) + 'mm';
  updateModebar();
}

function updateModebar() {
  const show = selection === 'surface' && P.surfaceType === 'plate';
  $('#modebar').classList.toggle('on', show);
  $('#modebar').querySelectorAll('button').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.mode === transformMode)));
}

/* ---- 右侧参数面板 ----
   随模式切换的那几组控件（平行光/点光源、板/盘、h、眼锥）整块重建；
   dyn 收集它们的 Panel，refresh 时一并同步。                        */
function buildRail() {
  const host = $('#rail');
  const p = Panel(host);
  let dyn = [];
  // 手机端分组栏（桌面端隐藏）；各组在下面用 data-g 认领
  const gbar = GroupBar(host, host, [['light', '光源'], ['surf', '反射面'], ['eye', '观察者'], ['ana', '分析'], ['preset', '预设']], 'light');

  const light = p.sub('grp', '光源');
  light.node.dataset.g = 'light';
  light.seg({ options: [['parallel', '平行光'], ['point', '点光源']], get: () => P.lightMode, set: (v) => setP({ lightMode: v }, true) });
  const lightBox = light.sub('grp');
  const rebuildLight = () => {
    lightBox.node.innerHTML = '';
    const q = Panel(lightBox.node);
    if (P.lightMode === 'parallel') {
      q.slider({ label: '方位角', min: 0, max: 360, step: 1, unit: '°', get: () => P.azimuth, set: (v) => setP({ azimuth: v }) });
      q.slider({ label: '仰角', min: 5, max: 90, step: 1, unit: '°', get: () => P.elevation, set: (v) => setP({ elevation: v }) });
      q.text('note', '提示：也可以直接拖动场景里的太阳把手改变光照方向。');
    } else {
      const ax = (k, label, min, max, step) => q.slider({
        label, min, max, step,
        get: () => P.pointLightPos[k],
        set: (v) => setP({ pointLightPos: { ...P.pointLightPos, [k]: v } }),
      });
      ax('x', '光源 X', -8, 8, .1); ax('y', '光源 Y', -8, 8, .1); ax('z', '光源 Z（高度）', .15, 8, .05);
    }
    q.button('光线来自 +Y（YZ 平面内射向 −Y）', '', () => setP(P.lightMode === 'parallel'
      ? { azimuth: 90 } : { pointLightPos: { x: 0, y: 4, z: P.pointLightPos.z } }));
    return q;
  };

  p.rule();
  const surf = p.sub('grp', '反射面');
  surf.node.dataset.g = 'surf';
  surf.seg({ options: [['plate', '拉丝金属板'], ['disk', '同心圆金属盘']], get: () => P.surfaceType, set: (v) => setP({ surfaceType: v }, true) });
  const surfBox = surf.sub('grp');
  const rebuildSurf = () => {
    surfBox.node.innerHTML = '';
    const q = Panel(surfBox.node);
    if (P.surfaceType === 'plate') {
      q.slider({ label: '宽度', min: 1, max: 8, step: .1, get: () => P.plateWidth, set: (v) => setP({ plateWidth: v }) });
      q.slider({ label: '深度', min: 1, max: 8, step: .1, get: () => P.plateDepth, set: (v) => setP({ plateDepth: v }) });
      q.slider({ label: '沟槽角 θ', min: 0, max: 180, step: 1, unit: '°', get: () => P.grooveAngle, set: (v) => setP({ grooveAngle: v }) });
    } else {
      q.slider({ label: '半径', min: .5, max: 10, step: .05, get: () => P.diskRadius, set: (v) => setP({ diskRadius: v }) });
    }
    return q;
  };
  surf.toggle({ label: '无穷大反射面', get: () => P.infiniteSurface, set: (v) => setP({ infiniteSurface: v }, true) });
  const infNote = surf.text('note', '反射面视为无限大平面（沟槽遍布全平面），整条亮线完整显示；尺寸滑块暂时不生效。');

  p.rule();
  const eye = p.sub('grp', '观察者');
  eye.node.dataset.g = 'eye';
  const ex = (k, label, min, max, step) => eye.slider({
    label, min, max, step, get: () => P.eyePos[k], set: (v) => setP({ eyePos: { ...P.eyePos, [k]: v } }),
  });
  ex('x', '眼睛 X', -8, 8, .1); ex('y', '眼睛 Y', -8, 8, .1); ex('z', '眼睛 Z（高度）', .15, 8, .05);
  const hBox = eye.sub('grp');
  const rebuildH = () => {
    hBox.node.innerHTML = '';
    if (P.lightMode !== 'parallel') return null;
    const q = Panel(hBox.node);
    q.slider({ label: '沿镜面方向远离 h', min: 0, max: 40, step: .1, get: () => P.specularH, set: (v) => setP({ specularH: v }) });
    q.text('note', '观察者沿入射光的镜面反射方向 <em>r̂</em> 远离（不是单纯升高 z）；<em>h</em> → ∞ 时亮线趋向双曲线。');
    return q;
  };
  eye.slider({ label: '等效焦段', min: 16, max: 135, step: 1, unit: 'mm', get: () => P.focalLength, set: (v) => setP({ focalLength: v }) });
  const focalRow = el('div', 'row', eye.node);
  const focalBtns = [24, 35, 50, 85].map((f) => {
    const b = el('button', 'btn', focalRow);
    b.textContent = f + 'mm';
    b.addEventListener('click', () => setP({ focalLength: f }));
    return [f, b];
  });

  p.rule();
  const ana = p.sub('grp', '亮线分析');
  ana.node.dataset.g = 'ana';
  ana.toggle({ label: '显示亮线上的一点', get: () => P.showGlitterPoint, set: (v) => setP({ showGlitterPoint: v }, v) });
  const anaNote = ana.text('note', '拖动亮线上的点：同步显示该点的入射光、沟槽反射半光锥（锥面恰好扫过眼睛）与射向眼睛的反射光。');
  const coneBox = ana.sub('grp');
  const rebuildCone = () => {
    coneBox.node.innerHTML = '';
    if (P.lightMode !== 'parallel' || P.surfaceType !== 'plate') return null;
    const q = Panel(coneBox.node);
    q.toggle({ label: '显示眼睛发出的圆锥', get: () => P.showEyeCone, set: (v) => setP({ showEyeCone: v }) });
    if (P.showEyeCone) q.text('note', '由光路可逆，从眼睛出发、与沟槽方向 <em>t̂</em> 夹角等于 <em>α</em> 的所有光线构成一个圆锥；它与板面的交线正是反射亮线。');
    return q;
  };

  p.rule();
  const pre = p.sub('grp', '预设场景');
  pre.node.dataset.g = 'preset';
  const grid = el('div', 'grid2', pre.node);
  PRESETS.forEach(([label, params]) => {
    const b = el('button', 'btn', grid);
    b.textContent = label;
    b.addEventListener('click', () => applyPreset(params));
  });
  const resetBtn = el('button', 'btn quiet', host);
  resetBtn.textContent = '↺ 重置全部参数';
  resetBtn.dataset.g = 'preset';
  gbar.apply();
  resetBtn.addEventListener('click', () => applyPreset(DEFAULTS));

  let sig = '';
  const rebuildDyn = () => {
    dyn = [rebuildLight(), rebuildSurf(), rebuildH(), rebuildCone()].filter(Boolean);
  };
  return {
    refresh() {
      const s = `${P.lightMode}|${P.surfaceType}|${P.showEyeCone}`;
      if (s !== sig) { sig = s; rebuildDyn(); }
      p.refresh();
      dyn.forEach((q) => q.refresh());
      infNote.style.display = P.infiniteSurface ? '' : 'none';
      anaNote.style.display = P.showGlitterPoint ? '' : 'none';
      focalBtns.forEach(([f, b]) => b.setAttribute('aria-pressed', String(Math.round(P.focalLength) === f)));
    },
  };
}

function applyPreset(params) {
  // 预设只改场景构型；亮线分析的两个开关属于视图叠加层，保留用户当前状态
  const keep = { showGlitterPoint: P.showGlitterPoint, showEyeCone: P.showEyeCone };
  P = { ...clone(params), ...keep };
  if (sim) { sim.setParams(P); sim.pointNeedsInit = true; }
  railPanel.refresh();
  $('#focalTag').textContent = Math.round(P.focalLength) + 'mm';
  requestAnimationFrame(() => sim && sim.selfCheck());
}

/* ---- 标签页 2 / 3 的控制条 ---- */
function buildMicroBar() {
  const host = $('#microCtl');
  const p = Panel(host);
  const set = (patch) => { micro.set(patch); p.refresh(); };
  p.slider({ inline: true, label: '入射角 <em>i</em>', min: 0, max: 80, step: 1, unit: '°', get: () => micro.S.i, set: (v) => set({ i: v }) });
  p.slider({ inline: true, label: '方位角 <em>φ</em>', min: 0, max: 90, step: 1, unit: '°', get: () => micro.S.phi, set: (v) => set({ phi: v }) });
  p.slider({ inline: true, label: '光线数', min: 5, max: 61, step: 2, get: () => micro.S.rays, set: (v) => set({ rays: v }) });
  p.slider({ inline: true, label: '槽深', min: 30, max: 100, step: 5, unit: '%', get: () => micro.S.depth, set: (v) => set({ depth: v }) });
  p.slider({ inline: true, label: '反射光长度', min: 40, max: 300, step: 10, unit: '%', get: () => micro.S.outLen, set: (v) => set({ outLen: v }) });
  p.toggle({ inline: true, label: '法线', get: () => micro.S.normals, set: (v) => set({ normals: v }) });
}

function buildConeBar() {
  const host = $('#coneCtl');
  const S = cones.S;
  const syncs = [];
  const set = (patch) => { cones.set(patch); refresh(); };
  const refresh = () => {
    const s = `${S.lightMode}|${S.surface}`;
    if (s !== sig) { sig = s; buildDyn(); }
    syncs.forEach((f) => f());
    dynPanel && dynPanel.refresh();
  };
  const labelled = (text) => {
    const u = el('div', 'u', host);
    el('label', null, u).textContent = text;
    return u;
  };

  syncs.push(Seg(labelled('光源'), { options: [['parallel', '平行光'], ['point', '点光源']], get: () => S.lightMode, set: (v) => set({ lightMode: v }) }));
  syncs.push(Seg(labelled('反射面'), { options: [['plate', '平行拉丝板'], ['disk', '同心圆盘']], get: () => S.surface, set: (v) => set({ surface: v }) }));

  const dynHost = el('div', 'u ctl-group', host);   // 随光源模式 / 反射面变化的滑块（手机网格里用 display:contents 摊平）
  let dynPanel = null, sig = '';
  const buildDyn = () => {
    dynHost.innerHTML = '';
    const q = Panel(dynHost);
    if (S.lightMode === 'parallel') {
      q.slider({ inline: true, label: '方位角', min: 0, max: 360, step: 1, unit: '°', get: () => S.azimuth, set: (v) => set({ azimuth: v }) });
      q.slider({ inline: true, label: '仰角', min: 5, max: 85, step: 1, unit: '°', get: () => S.elevation, set: (v) => set({ elevation: v }) });
    } else {
      ['x', 'y', 'z'].forEach((k) => q.slider({
        inline: true, label: k.toUpperCase(), min: k === 'z' ? .5 : -3, max: k === 'z' ? 5 : 3, step: .1,
        get: () => S.lightPos[k], set: (v) => set({ lightPos: { ...S.lightPos, [k]: v } }),
      }));
    }
    if (S.surface === 'plate') q.slider({ inline: true, label: '沟槽角 θ', min: 0, max: 180, step: 1, unit: '°', get: () => S.grooveAngle, set: (v) => set({ grooveAngle: v }) });
    dynPanel = q;
  };

  const tail = Panel(host);
  tail.slider({
    inline: true, label: '点阵密度', min: 2, max: 8, step: 1,
    fmt: (v) => (S.surface === 'plate' ? `${v}×${v}` : `${v - 1}环×8`),
    get: () => S.density, set: (v) => set({ density: v }),
  });
  syncs.push(Seg(labelled('锥'), { options: [['lines', '线框'], ['surface', '锥面']], get: () => S.style, set: (v) => set({ style: v }) }));
  tail.slider({ inline: true, label: '锥长', min: 40, max: 300, step: 10, unit: '%', get: () => S.lenPct, set: (v) => set({ lenPct: v }) });
  syncs.push(tail.refresh);

  refresh();
}

/* ---- 标签切换 ---- */
function showTab(id) {
  document.querySelectorAll('.pane').forEach((n) => n.classList.toggle('on', n.id === 'pane-' + id));
  $('#tabs').querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  if (id === 'micro' && !micro) { micro = new GrooveMicro($('#stage-micro')); Loop.add('micro', micro.frame); buildMicroBar(); }
  if (id === 'cones' && !cones) { cones = new ConeField($('#stage-cones')); Loop.add('cones', cones.frame); buildConeBar(); }
  if (id === 'eq' && !eqTab) { eqTab = new EquationTab($('#pane-eq')); Loop.add('eq', eqTab.frame); }
  Loop.show(id);
  if (id === 'glitter' && sim) requestAnimationFrame(() => sim.cacheRects());
}

/* ---- 启动 ---- */
function boot() {
  sim = new GlitterSim($('#stage-glitter'), $('#insetView'), P,
    (u) => setP(u),
    (id) => { selection = id; updateModebar(); });
  Loop.add('glitter', sim.frame);
  Loop.show('glitter');
  Loop.start();
  railPanel = buildRail();
  railPanel.refresh();
  sim.selfCheck();

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) showTab(b.dataset.tab);
  });
  $('#modebar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    transformMode = b.dataset.mode;
    sim.setTransformMode(transformMode);
    updateModebar();
  });
  const rail = $('#rail'), scrim = $('#scrim');
  const openRail = (v) => { rail.classList.toggle('open', v); scrim.classList.toggle('open', v); };
  $('#fab').addEventListener('click', () => openRail(true));
  $('#railClose').addEventListener('click', () => openRail(false));
  scrim.addEventListener('click', () => openRail(false));

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'v') { document.body.classList.toggle('hideInset'); requestAnimationFrame(() => sim.cacheRects()); }
    if (k === 'escape') openRail(false);
    if (k >= '1' && k <= '4') showTab(['micro', 'cones', 'glitter', 'eq'][+k - 1]);
  });
  // 双保险：任何控件获得焦点都不该把整页滚走（滚了就会露出 .app 之外的黑边）
  for (const node of [$('.app'), $('.body')]) {
    node.addEventListener('scroll', () => { if (node.scrollTop || node.scrollLeft) { node.scrollTop = 0; node.scrollLeft = 0; } });
  }
  addEventListener('resize', () => sim.cacheRects());
  addEventListener('scroll', () => sim.cacheRects(), true);
}
// boot() 在 05_equations.js 末尾调用：方程图像标签页的类定义要先于启动
