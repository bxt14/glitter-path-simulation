import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Pause, Play } from 'lucide-react'

/**
 * 沟槽微观机理示意（3D：U 形半管槽，如自行车场地/滑板 U 池的剖面）
 * 槽为半圆柱面（轴沿 Y，截面是 X-Z 平面内的半圆，开口朝 +Z）。
 * 一组平行光以入射角 i 在 y=0 剖面内射入，在槽壁上做真实镜面反射追踪（含多次反射，上限 4 次）。
 * 物理与 2D 版完全相同（numpy 验证过）：
 *  - 光线按「与 z=0.2R 参考线的交点」均匀采样；
 *  - 穿过槽底中心 (0,-R) 的光线仅当 i ≤ 45° 时存在（xc0 = −(R+0.2R)·tan i），沿镜面方向返回；
 *  - 左半槽壁反射到右侧、右半反射到左侧（交叉反射）；
 *  - 出射方向大致张成扇形（三维中沿槽轴平移成光幕）；出射角范围由实际追踪结果绘制。
 * 2D (x, y) → 3D (x, 0, y)：y2d 是竖直方向 = z3d。
 */

const R = 1
const REF_Y = 0.2
const START_Y = 2.3
const MAX_BOUNCE = 4
const PIPE_LEN = 6 // 槽长（Y 方向）

interface V2 { x: number; y: number }
interface Bounce { p: V2; kind: 'arc' | 'flat' }
interface RayPath {
  pts: V2[]
  exit: V2 | null
  bounces: Bounce[]
  center: boolean
}

const v = (x: number, y: number): V2 => ({ x, y })
const sub = (a: V2, b: V2): V2 => v(a.x - b.x, a.y - b.y)
const add = (a: V2, b: V2): V2 => v(a.x + b.x, a.y + b.y)
const mul = (a: V2, s: number): V2 => v(a.x * s, a.y * s)
const dot = (a: V2, b: V2): number => a.x * b.x + a.y * b.y
const len = (a: V2): number => Math.hypot(a.x, a.y)
const to3 = (p: V2, y = 0): THREE.Vector3 => new THREE.Vector3(p.x, y, p.y)

/** 追踪一条光线（2D 剖面）：xc 为与 z=REF_Y 参考线交点的 x 坐标 */
function traceRay(xc: number, iDeg: number, center = false): RayPath {
  const i = (iDeg * Math.PI) / 180
  let d = v(Math.sin(i), -Math.cos(i))
  const q0 = v(xc, REF_Y)
  let p = sub(q0, mul(d, (REF_Y - START_Y) / d.y))
  const pts: V2[] = [v(p.x, p.y)]
  const bounces: Bounce[] = []
  let exit: V2 | null = null

  for (let k = 0; k < MAX_BOUNCE; k++) {
    let bestT = Infinity
    let bestKind: 'arc' | 'flat' | 'exit' | null = null
    const b = 2 * dot(p, d)
    const c = dot(p, p) - R * R
    const disc = b * b - 4 * c
    if (disc > 0) {
      for (const t of [(-b - Math.sqrt(disc)) / 2, (-b + Math.sqrt(disc)) / 2]) {
        if (t > 1e-6 && t < bestT) {
          const q = add(p, mul(d, t))
          if (q.y <= 1e-6) { bestT = t; bestKind = 'arc' }
        }
      }
    }
    if (Math.abs(d.y) > 1e-9) {
      const t = -p.y / d.y
      if (t > 1e-6 && t < bestT) {
        const q = add(p, mul(d, t))
        if (d.y > 0 && p.y < 0) { bestT = t; bestKind = 'exit' }
        else if (d.y < 0 && Math.abs(q.x) > R) { bestT = t; bestKind = 'flat' }
      }
    }
    if (bestKind === null) {
      if (d.y > 1e-6) pts.push(add(p, mul(d, 2.4)))
      exit = d
      break
    }
    const q = add(p, mul(d, bestT))
    pts.push(q)
    if (bestKind === 'exit') {
      pts.push(add(q, mul(d, 2.4)))
      exit = d
      break
    }
    bounces.push({ p: q, kind: bestKind })
    const n = bestKind === 'arc' ? mul(q, -1 / len(q)) : v(0, 1)
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
    photonMat: THREE.PointsMaterial
  } | null>(null)
  const timeRef = useRef(0)
  const playingRef = useRef(playing)
  playingRef.current = playing

  // 光线束（2D 剖面追踪）
  const rays = useMemo(() => {
    const list: RayPath[] = []
    for (let k = 0; k < rayCount; k++) {
      const xc = -1.35 + (2.7 * k) / (rayCount - 1)
      list.push(traceRay(xc, angleI))
    }
    if (angleI <= 45) {
      const xc0 = -(R + REF_Y) * Math.tan((angleI * Math.PI) / 180)
      const cr = traceRay(xc0, angleI, true)
      const first = cr.bounces[0]?.p
      const ok = first && Math.hypot(first.x, first.y + R) < 1e-6 &&
        cr.exit && Math.abs(Math.atan2(cr.exit.x, cr.exit.y) - (angleI * Math.PI) / 180) < 1e-6
      if (!ok) console.warn('[GrooveMicro] 槽底中心光线自检失败', cr)
      list.push(cr)
    }
    return list
  }, [angleI, rayCount])

  const cone = useMemo(() => {
    const angs = rays.filter((r) => r.exit && r.exit.y > 0).map((r) => Math.atan2(r.exit!.x, r.exit!.y))
    if (angs.length < 2) return null
    return { min: Math.min(...angs), max: Math.max(...angs) }
  }, [rays])

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
    camera.position.set(3.4, -4.6, 2.4)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, -0.1)
    controls.enableDamping = true

    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
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
    // CylinderGeometry 顶点：x=R·sinθ, z=R·cosθ；θ∈(π/2, 3π/2) → z≤0 下半圆
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, PIPE_LEN, 128, 1, true, Math.PI / 2, Math.PI),
      pipeMat,
    )
    scene.add(pipe)

    // ---- 两侧平坦表面（z=0 平面，|x|>R）----
    const flatMat = new THREE.MeshStandardMaterial({ color: 0x767f8c, metalness: 0.85, roughness: 0.4 })
    for (const sgn of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(2.2, PIPE_LEN, 0.06), flatMat)
      strip.position.set(sgn * (R + 1.1), 0, -0.03)
      scene.add(strip)
    }
    // 槽口两端封口（可有可无的视觉细节：端面圆环省略，保持开放感）

    // 地面参考网格
    const grid = new THREE.GridHelper(14, 28, 0x1c2430, 0x121821)
    grid.rotation.x = Math.PI / 2
    grid.position.z = -1.35
    scene.add(grid)

    const rayGroup = new THREE.Group()
    scene.add(rayGroup)

    // 光子（每光线一个，Points 逐帧更新位置）
    const photonGeo = new THREE.BufferGeometry()
    photonGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 64), 3))
    const photonMat = new THREE.PointsMaterial({
      color: 0xfff3d0, size: 0.09, sizeAttenuation: true,
      transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const photons = new THREE.Points(photonGeo, photonMat)
    photons.frustumCulled = false
    scene.add(photons)

    sceneRef.current = { renderer, camera, rayGroup, photons, photonMat }

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

    const addLines = (segs: THREE.Vector3[][], color: number, opacity: number, widthY = 0) => {
      const pts: THREE.Vector3[] = []
      for (const seg of segs) for (let k = 0; k + 1 < seg.length; k++) {
        pts.push(seg[k].clone().setY(widthY), seg[k + 1].clone().setY(widthY))
      }
      if (!pts.length) return
      s.rayGroup.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
      ))
    }

    // 主光幕（y=0）：入射段金色、反射段蓝色；中心高亮光更亮
    for (const ray of rays) {
      const p3 = ray.pts.map((p) => to3(p))
      addLines([p3.slice(0, 2)], ray.center ? COL_CENTER : COL_INCIDENT, ray.center ? 0.95 : 0.6)
      if (p3.length > 2) addLines([p3.slice(1)], ray.center ? COL_CENTER : COL_REFLECT, ray.center ? 0.95 : 0.65)
      // 命中点
      for (const b of ray.bounces) {
        const dotMesh = new THREE.Mesh(
          new THREE.SphereGeometry(ray.center ? 0.035 : 0.022, 10, 8),
          new THREE.MeshBasicMaterial({ color: ray.center ? COL_CENTER : 0xe8eef5 }),
        )
        dotMesh.position.copy(to3(b.p))
        s.rayGroup.add(dotMesh)
      }
      // 法线
      if (showNormals) {
        const nPts: THREE.Vector3[] = []
        for (const b of ray.bounces) {
          const n = b.kind === 'arc' ? mul(b.p, -1 / len(b.p)) : v(0, 1)
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

    // 两侧淡化平行光幕（体现三维平移对称性）
    for (const wy of [-1.1, 1.1]) {
      for (const ray of rays) {
        if (ray.center) continue
        const p3 = ray.pts.map((p) => to3(p))
        addLines([p3.slice(0, 2)], COL_INCIDENT, 0.14, wy)
        if (p3.length > 2) addLines([p3.slice(1)], COL_REFLECT, 0.16, wy)
      }
    }

    // 出射光锥角度规（y=0 剖面内：槽口中心为顶点的角弧 + 两条虚线边界）
    if (showCone && cone) {
      const apex = v(0, 0)
      const RL = 0.85 * R
      const arcPts: THREE.Vector3[] = []
      const N = 48
      for (let k = 0; k <= N; k++) {
        const a = cone.min + ((cone.max - cone.min) * k) / N
        arcPts.push(to3(add(apex, v(RL * Math.sin(a), RL * Math.cos(a)))))
      }
      s.rayGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(arcPts),
        new THREE.LineBasicMaterial({ color: COL_REFLECT, transparent: true, opacity: 0.9 }),
      ))
      const bPts: THREE.Vector3[] = []
      for (const a of [cone.min, cone.max]) {
        bPts.push(to3(apex), to3(add(apex, v(1.25 * RL * Math.sin(a), 1.25 * RL * Math.cos(a)))))
      }
      const bMat = new THREE.LineDashedMaterial({ color: COL_REFLECT, transparent: true, opacity: 0.55, dashSize: 0.07, gapSize: 0.06 })
      const bLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(bPts), bMat)
      bLines.computeLineDistances()
      s.rayGroup.add(bLines)
    }
  }, [rays, cone, showNormals, showCone])

  // ---------- 光子动画 + 出射光锥标签投影 ----------
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const s = sceneRef.current
      if (!s) return
      // 光子位置
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
        pos.setXYZ(idx++, p.x, 0, p.y)
      })
      // 隐藏多余点（挪到远处）
      for (let k = idx; k < 64; k++) pos.setXYZ(k, 0, 0, -1000)
      pos.needsUpdate = true
      // 「出射光锥」标签跟随投影
      const label = coneLabelRef.current
      if (label && wrapRef.current) {
        if (showCone && cone) {
          const mid = (cone.min + cone.max) / 2
          const wp = new THREE.Vector3(1.2 * R * Math.sin(mid), 0, 1.2 * R * Math.cos(mid))
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
          出射光锥
        </div>
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-[#232a38] bg-[#11151d]/85 px-3 py-2 backdrop-blur md:left-4 md:top-4">
          <h2 className="text-[13px] font-semibold tracking-wide text-[#e6ebf2]">沟槽微观机理示意</h2>
          <p className="mt-0.5 hidden text-[11px] text-[#66707e] md:block">平行光在 U 形（半圆截面）沟槽壁上的镜面反射 · 拖动旋转视角</p>
        </div>
      </div>

      {/* 说明条 */}
      <div className="border-t border-[#232a38] bg-[#11151d] px-4 py-2.5 text-[11px] leading-relaxed text-[#8b95a5] md:text-xs">
        <span className="text-[#f0d9b0]">①</span> 射到槽底中心的光线沿正常（镜面）方向原路返回{angleI <= 45 ? '（图中高亮金色）' : '（当前 i>45°，槽底中心被槽沿遮挡）'}&ensp;
        <span className="text-[#f0d9b0]">②</span> 射到左半槽壁的光被反射到右侧，右半槽壁的光被反射到左侧，彼此交叉&ensp;
        <span className="text-[#f0d9b0]">③</span> 全部出射光的方向大致张成一个锥面（蓝色角弧）——宏观亮线的微观来源
      </div>
    </div>
  )
}
