import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Pause, Play } from 'lucide-react'

/**
 * 沟槽微观机理示意（3D：U 形半管槽，轴沿 Y）
 * 关键几何（按论文设定）：光的入射面包含沟槽轴 —— 平行光方向 d = (0, −sin i, −cos i) 位于 YZ 平面内。
 * 圆柱面法线没有沿槽（Y）分量 ⟹ 镜面反射保持方向的 t̂ 分量不变 ⟹ 所有出射光与槽轴夹角恒定，
 * 出射方向落在一个绕槽轴的锥面上（锥条件 r·ŷ = −sin i，numpy 验证到 1e-12）。
 * 每条光线在三维中做真实多次镜面反射追踪（上限 4 次）：
 *  - 光线按 x0（与 z=0.2R 参考面交点的 x）均匀采样，横跨槽口与两侧平面；
 *  - 槽底中心光（x0=0）对任意 i 都存在：命中 (0,·,−R)，法线竖直，沿镜面方向返回；
 *  - 左半槽壁的光折向右半、右半折向左半，在腔内交叉；
 *  - 出射锥面轮廓：轴 −ŷ、半角 90°−i 的上半锥线框（z≥0），角范围取实际出射方向的 φ 覆盖区间。
 */

const R = 1
const REF_Y = 0.2
const START_Y = 2.3
const MAX_BOUNCE = 4
const PIPE_LEN = 5

interface V3 { x: number; y: number; z: number }
interface Bounce { p: V3; kind: 'arc' | 'flat' }
interface RayPath {
  pts: V3[]
  exit: V3 | null
  bounces: Bounce[]
  center: boolean
}

const v = (x: number, y: number, z: number): V3 => ({ x, y, z })
const sub = (a: V3, b: V3): V3 => v(a.x - b.x, a.y - b.y, a.z - b.z)
const add = (a: V3, b: V3): V3 => v(a.x + b.x, a.y + b.y, a.z + b.z)
const mul = (a: V3, s: number): V3 => v(a.x * s, a.y * s, a.z * s)
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
const len = (a: V3): number => Math.hypot(a.x, a.y, a.z)
const to3 = (p: V3): THREE.Vector3 => new THREE.Vector3(p.x, p.y, p.z)

/** 三维光线追踪：槽 = 半圆柱 x²+z²=R²（z≤0，轴沿 Y），光在 YZ 入射面内 */
function traceRay(x0: number, iDeg: number, center = false): RayPath {
  const i = (iDeg * Math.PI) / 180
  let d = v(0, -Math.sin(i), -Math.cos(i))
  let p = sub(v(x0, 0, REF_Y), mul(d, (REF_Y - START_Y) / d.z))
  const pts: V3[] = [v(p.x, p.y, p.z)]
  const bounces: Bounce[] = []
  let exit: V3 | null = null

  for (let k = 0; k < MAX_BOUNCE; k++) {
    let bestT = Infinity
    let bestKind: 'arc' | 'flat' | 'exit' | null = null
    // 圆柱 x²+z²=R²（z≤0 半管）
    const a2 = d.x * d.x + d.z * d.z
    const b = 2 * (p.x * d.x + p.z * d.z)
    const c = p.x * p.x + p.z * p.z - R * R
    const disc = b * b - 4 * a2 * c
    if (disc > 0 && a2 > 1e-12) {
      for (const t of [(-b - Math.sqrt(disc)) / (2 * a2), (-b + Math.sqrt(disc)) / (2 * a2)]) {
        if (t > 1e-6 && t < bestT) {
          const q = add(p, mul(d, t))
          if (q.z <= 1e-6) { bestT = t; bestKind = 'arc' }
        }
      }
    }
    // 表面平面 z=0：向上穿越 = 出射；向下且 |x|>R = 平坦表面反射
    if (Math.abs(d.z) > 1e-9) {
      const t = -p.z / d.z
      if (t > 1e-6 && t < bestT) {
        const q = add(p, mul(d, t))
        if (d.z > 0 && p.z < 0) { bestT = t; bestKind = 'exit' }
        else if (d.z < 0 && Math.abs(q.x) > R) { bestT = t; bestKind = 'flat' }
      }
    }
    if (bestKind === null) {
      if (d.z > 1e-6) pts.push(add(p, mul(d, 1.7)))
      exit = d
      break
    }
    const q = add(p, mul(d, bestT))
    pts.push(q)
    if (bestKind === 'exit') {
      pts.push(add(q, mul(d, 1.7)))
      exit = d
      break
    }
    bounces.push({ p: q, kind: bestKind })
    const n = bestKind === 'arc' ? v(-q.x / R, 0, -q.z / R) : v(0, 0, 1) // 柱面法线无 Y 分量
    d = sub(d, mul(n, 2 * dot(d, n)))
    p = add(q, mul(d, 1e-6))
  }
  return { pts, exit, bounces, center }
}

const COL_INCIDENT = 0xf5c667
const COL_REFLECT = 0x8fd0ff
const COL_CENTER = 0xffe9b0

export default function GrooveMicro() {
  const [angleI, setAngleI] = useState(40)
  const [rayCount, setRayCount] = useState(11)
  const [showNormals, setShowNormals] = useState(true)
  const [showCone, setShowCone] = useState(true)
  const [playing, setPlaying] = useState(true)

  const wrapRef = useRef<HTMLDivElement>(null)
  const coneLabelRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer
    camera: THREE.PerspectiveCamera
    rayGroup: THREE.Group
    photons: THREE.Points
  } | null>(null)
  const timeRef = useRef(0)
  const playingRef = useRef(playing)
  playingRef.current = playing

  // 光线束（三维追踪）；中心光 x0=0 对任意 i 存在（柱面法线无 Y 分量，与 2D 剖面情形不同）
  const rays = useMemo(() => {
    const list: RayPath[] = []
    for (let k = 0; k < rayCount; k++) {
      const x0 = -1.35 + (2.7 * k) / (rayCount - 1)
      list.push(traceRay(x0, angleI))
    }
    const cr = traceRay(0, angleI, true)
    // 物理自检：中心光首命中 (0,·,−R)，出射 = 镜面方向 (0,−sin i,+cos i)
    const i = (angleI * Math.PI) / 180
    const first = cr.bounces[0]?.p
    const ok = first && Math.hypot(first.x, first.z + R) < 1e-6 &&
      cr.exit && Math.abs(cr.exit.y + Math.sin(i)) < 1e-9 && Math.abs(cr.exit.z - Math.cos(i)) < 1e-9
    if (!ok) console.warn('[GrooveMicro] 槽底中心光线自检失败', cr)
    list.push(cr)
    return list
  }, [angleI, rayCount])

  // 出射锥：所有出射方向满足 r·ŷ = −sin i；φ = atan2(r_z, r_x) 的实际覆盖范围
  const cone = useMemo(() => {
    const exits = rays.filter((r) => r.exit && r.exit.z > 0).map((r) => r.exit!)
    if (exits.length < 2) return null
    // 锥条件自检
    const i = (angleI * Math.PI) / 180
    if (exits.some((e) => Math.abs(e.y + Math.sin(i)) > 1e-9)) {
      console.warn('[GrooveMicro] 锥条件 r·ŷ = −sin i 被破坏')
    }
    const phis = exits.map((e) => Math.atan2(e.z, e.x))
    return { min: Math.min(...phis), max: Math.max(...phis), alpha: Math.PI / 2 - i }
  }, [rays, angleI])

  // ---------- three 场景（一次初始化） ----------
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    wrap.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b0e13)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.up.set(0, 0, 1)
    camera.position.set(1.2, -5.6, 2.5)
    // 窄屏（移动端竖屏）拉远初始相机
    const initRect = wrap.getBoundingClientRect()
    if (initRect.width / Math.max(initRect.height, 1) < 0.9) camera.position.multiplyScalar(1.7)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.1, -0.1)
    controls.enableDamping = true

    scene.add(new THREE.AmbientLight(0xffffff, 0.62))
    const key = new THREE.DirectionalLight(0xfff2dd, 1.5)
    key.position.set(2, -3, 5)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x9cc2f0, 0.7)
    rim.position.set(-3, 2, 2)
    scene.add(rim)

    // ---- U 形半管槽体（半圆柱，轴沿 Y，开口朝 +Z）----
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0x8b95a2, metalness: 0.9, roughness: 0.32, side: THREE.DoubleSide,
    })
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, PIPE_LEN, 128, 1, true, Math.PI / 2, Math.PI),
      pipeMat,
    )
    scene.add(pipe)

    // ---- 金属实体：两侧厚壁 + 槽底托板 ----
    const flatMat = new THREE.MeshStandardMaterial({ color: 0x596270, metalness: 0.85, roughness: 0.42 })
    for (const sgn of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(2.2, PIPE_LEN, 1.35), flatMat)
      strip.position.set(sgn * (R + 1.1), 0, -0.675)
      scene.add(strip)
    }
    const belly = new THREE.Mesh(new THREE.BoxGeometry(2.02, PIPE_LEN, 0.38), flatMat)
    belly.position.set(0, 0, -1.19)
    scene.add(belly)
    // 槽腔内柔和补光
    const fill = new THREE.PointLight(0xfff2dd, 5, 7, 1.8)
    fill.position.set(0.3, -1.6, 1.8)
    scene.add(fill)

    const grid = new THREE.GridHelper(14, 28, 0x1c2430, 0x121821)
    grid.rotation.x = Math.PI / 2
    grid.position.z = -1.35
    scene.add(grid)

    const rayGroup = new THREE.Group()
    scene.add(rayGroup)

    // 光子（圆形发光贴图）
    const pc = document.createElement('canvas')
    pc.width = pc.height = 64
    const pctx = pc.getContext('2d')!
    const grad = pctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,244,214,1)')
    grad.addColorStop(0.35, 'rgba(245,200,110,0.8)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    pctx.fillStyle = grad
    pctx.fillRect(0, 0, 64, 64)
    const photonGeo = new THREE.BufferGeometry()
    photonGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 64), 3))
    const photons = new THREE.Points(photonGeo, new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(pc), color: 0xffffff, size: 0.14, sizeAttenuation: true,
      transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    photons.frustumCulled = false
    scene.add(photons)

    sceneRef.current = { renderer, camera, rayGroup, photons }

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      renderer.setSize(r.width, r.height)
      camera.aspect = r.width / Math.max(r.height, 1)
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      if (playingRef.current) timeRef.current += dt
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [])

  // ---------- 光路重建 ----------
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    s.rayGroup.clear()

    const addLines = (segs: THREE.Vector3[][], color: number, opacity: number, yOff = 0) => {
      const pts: THREE.Vector3[] = []
      for (const seg of segs) for (let k = 0; k + 1 < seg.length; k++) {
        pts.push(seg[k].clone().setY(seg[k].y + yOff), seg[k + 1].clone().setY(seg[k + 1].y + yOff))
      }
      if (!pts.length) return
      s.rayGroup.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
      ))
    }

    for (const ray of rays) {
      const p3 = ray.pts.map(to3)
      addLines([p3.slice(0, 2)], ray.center ? COL_CENTER : COL_INCIDENT, ray.center ? 0.95 : 0.6)
      if (p3.length > 2) addLines([p3.slice(1)], ray.center ? COL_CENTER : COL_REFLECT, ray.center ? 0.95 : 0.65)
      for (const b of ray.bounces) {
        const dotMesh = new THREE.Mesh(
          new THREE.SphereGeometry(ray.center ? 0.035 : 0.022, 10, 8),
          new THREE.MeshBasicMaterial({ color: ray.center ? COL_CENTER : 0xe8eef5 }),
        )
        dotMesh.position.copy(to3(b.p))
        s.rayGroup.add(dotMesh)
      }
      if (showNormals) {
        const nPts: THREE.Vector3[] = []
        for (const b of ray.bounces) {
          const n = b.kind === 'arc' ? v(-b.p.x / R, 0, -b.p.z / R) : v(0, 0, 1)
          nPts.push(to3(b.p), to3(add(b.p, mul(n, 0.4))))
        }
        if (nPts.length) {
          const mat = new THREE.LineDashedMaterial({ color: 0xb4c0cd, transparent: true, opacity: 0.4, dashSize: 0.05, gapSize: 0.05 })
          const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(nPts), mat)
          lines.computeLineDistances()
          s.rayGroup.add(lines)
        }
      }
    }

    // 两侧淡化平行光幕（平移对称性）
    for (const wy of [-1.5, 1.5]) {
      for (const ray of rays) {
        if (ray.center) continue
        const p3 = ray.pts.map(to3)
        addLines([p3.slice(0, 2)], COL_INCIDENT, 0.07, wy)
        if (p3.length > 2) addLines([p3.slice(1)], COL_REFLECT, 0.08, wy)
      }
    }

    // 出射锥面：轴 −ŷ、半角 90°−i 的上半锥线框（φ 取实际出射覆盖范围）
    if (showCone && cone) {
      const apex = new THREE.Vector3(0, 0, 0)
      const L = 1.6 * R
      const a = new THREE.Vector3(0, -1, 0)
      const cosA = Math.cos(cone.alpha)
      const sinA = Math.sin(cone.alpha)
      const g = (phi: number) => new THREE.Vector3(
        sinA * Math.cos(phi),
        -cosA,
        sinA * Math.sin(phi),
      )
      const linePts: THREE.Vector3[] = []
      const NG = 8
      for (let k = 0; k < NG; k++) {
        const phi = cone.min + ((cone.max - cone.min) * k) / (NG - 1)
        linePts.push(apex.clone(), apex.clone().addScaledVector(g(phi), L))
      }
      const NR = 40
      for (let k = 0; k < NR; k++) {
        const p1 = cone.min + ((cone.max - cone.min) * k) / NR
        const p2 = cone.min + ((cone.max - cone.min) * (k + 1)) / NR
        linePts.push(apex.clone().addScaledVector(g(p1), L), apex.clone().addScaledVector(g(p2), L))
      }
      void a
      s.rayGroup.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(linePts),
        new THREE.LineBasicMaterial({ color: COL_REFLECT, transparent: true, opacity: 0.7 }),
      ))
    }
  }, [rays, cone, showNormals, showCone])

  // ---------- 光子动画 + 出射光锥标签投影 ----------
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const s = sceneRef.current
      if (!s) return
      const pos = s.photons.geometry.getAttribute('position') as THREE.BufferAttribute
      const speed = 1.15
      let idx = 0
      rays.forEach((ray, ri) => {
        const cum: number[] = [0]
        for (let k = 1; k < ray.pts.length; k++) cum.push(cum[k - 1] + len(sub(ray.pts[k], ray.pts[k - 1])))
        const total = cum[cum.length - 1]
        const sp = (timeRef.current * speed + ri * 0.55) % (total + 1.1)
        if (sp > total || idx >= 64) return
        let seg = 0
        while (seg < cum.length - 2 && cum[seg + 1] < sp) seg++
        const t = cum[seg + 1] === cum[seg] ? 0 : (sp - cum[seg]) / (cum[seg + 1] - cum[seg])
        const p = add(ray.pts[seg], mul(sub(ray.pts[seg + 1], ray.pts[seg]), Math.min(Math.max(t, 0), 1)))
        pos.setXYZ(idx++, p.x, p.y, p.z)
      })
      for (let k = idx; k < 64; k++) pos.setXYZ(k, 0, 0, -1000)
      pos.needsUpdate = true
      // 标签
      const label = coneLabelRef.current
      if (label && wrapRef.current) {
        if (showCone && cone) {
          const mid = (cone.min + cone.max) / 2
          const sinA = Math.sin(cone.alpha)
          const cosA = Math.cos(cone.alpha)
          const wp = new THREE.Vector3(1.9 * sinA * Math.cos(mid), -1.9 * cosA, 1.9 * sinA * Math.sin(mid))
          wp.project(s.camera)
          const r = wrapRef.current.getBoundingClientRect()
          label.style.display = 'block'
          label.style.left = `${((wp.x + 1) / 2) * r.width}px`
          label.style.top = `${((1 - wp.y) / 2) * r.height}px`
        } else {
          label.style.display = 'none'
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [rays, cone, showCone])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0e13]">
      {/* 控制条 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[#232a38] bg-[#11151d] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-xs text-[#9aa5b4]">入射角 <em className="font-serif text-[#f0d9b0]">i</em> = {angleI}°</span>
          <Slider className="w-36" min={0} max={80} step={1} value={[angleI]} onValueChange={(v) => setAngleI(v[0])} />
        </div>
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-xs text-[#9aa5b4]">光线数 {rayCount}</span>
          <Slider className="w-24" min={5} max={17} step={2} value={[rayCount]} onValueChange={(v) => setRayCount(v[0])} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[#9aa5b4]">
          <Switch checked={showNormals} onCheckedChange={setShowNormals} id="sw-normals" />
          <span>法线</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[#9aa5b4]">
          <Switch checked={showCone} onCheckedChange={setShowCone} id="sw-cone" />
          <span>出射光锥轮廓</span>
        </label>
        <button
          className="flex items-center gap-1.5 rounded-full border border-[#2a3242] bg-[#161b25] px-3 py-1 text-xs text-[#c9d1d9] transition-colors hover:border-[#d4a054]/60 hover:text-[#f0d9b0]"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? <><Pause className="size-3.5" /> 暂停</> : <><Play className="size-3.5" /> 播放</>}
        </button>
      </div>

      {/* 3D 画布 */}
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <div ref={coneLabelRef} className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full pb-1 text-xs text-[#8fd0ff]" style={{ display: 'none' }}>
          出射光锥（绕槽轴）
        </div>
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-[#232a38] bg-[#11151d]/85 px-3 py-2 backdrop-blur md:left-4 md:top-4">
          <h2 className="text-[13px] font-semibold tracking-wide text-[#e6ebf2]">沟槽微观机理示意</h2>
          <p className="mt-0.5 hidden text-[11px] text-[#66707e] md:block">入射面包含槽轴（YZ 平面）的平行光在 U 形槽壁上的镜面反射 · 拖动旋转视角</p>
        </div>
      </div>

      {/* 说明条 */}
      <div className="border-t border-[#232a38] bg-[#11151d] px-4 py-2.5 text-[11px] leading-relaxed text-[#8b95a5] md:text-xs">
        <span className="text-[#f0d9b0]">①</span> 射到槽底中心的光线沿正常（镜面）方向返回（高亮金色）&ensp;
        <span className="text-[#f0d9b0]">②</span> 射到左半槽壁的光折向右半、右半折向左半，在腔内交叉&ensp;
        <span className="text-[#f0d9b0]">③</span> 槽壁法线没有沿槽分量，反射保持方向的沿槽分量不变 → 全部出射光与槽轴夹角恒定，张成一个绕槽轴的锥面（蓝色线框）
      </div>
    </div>
  )
}
