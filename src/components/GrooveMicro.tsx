import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Pause, Play } from 'lucide-react'

/**
 * 沟槽微观机理示意（3D：U 形半管槽，轴沿 Y）
 * 关键几何（按论文设定）：入射角 i、方位角 φ（入射光水平投影与槽轴 Y 的夹角）。
 * 光方向 d = (−sin i·sin φ, −sin i·cos φ, −cos i)；φ=0 时入射面即 YZ 平面（包含槽轴）。
 * 圆柱面法线没有沿槽（Y）分量 ⟹ 镜面反射保持方向的沿槽分量不变（r·ŷ = d·ŷ = −sin i·cos φ）
 * ⟹ 所有出射光与槽轴夹角恒定，落在绕槽轴的锥面上（numpy 验证到 1e-12）。
 * 实现要点：
 *  - 入射点固定：在槽壁横截面（y=0）上按 x0 均匀采样命中点，从命中点沿 −d 反推出射发点，
 *    因此改变 i / φ 时命中位置不动，只有光线角度变化；
 *  - 单次反射：第一次镜面反射后若再打到槽壁，光线在该点终止（消失），不再二次反射；
 *  - 槽底中心光（x0=0）对任意 i、φ 都存在：命中 (0,0,−R)，法线竖直。
 */

const R = 1
const START_Y = 2.3
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

/** 三维光线追踪：槽 = 半椭圆柱 x²/R² + z²/b² = 1（z≤0，轴沿 Y，b = depth·R 可调槽深）。
 *  椭圆法线同样无 Y 分量 ⟹ 锥条件 r·ŷ = d·ŷ 在任意槽深下成立。
 *  入射点固定：给定槽壁命中点，沿 −d 反推出射发点。
 *  单次反射：反射后若再打到槽壁，光线在该点终止（消失）。
 *  光屏开启时，出射段延伸至 y = screenY。 */
function traceRay(x0: number, iDeg: number, phiDeg: number, b: number, screenY: number | null, center = false): RayPath {
  const i = (iDeg * Math.PI) / 180
  const phi = (phiDeg * Math.PI) / 180
  const d0 = v(-Math.sin(i) * Math.sin(phi), -Math.sin(i) * Math.cos(phi), -Math.cos(i))
  const q1 = v(x0, 0, -b * Math.sqrt(1 - (x0 * x0) / (R * R))) // 固定命中点（随槽深）
  const sBack = Math.min((START_Y - q1.z) / Math.cos(i), 4.5)
  const p0 = sub(q1, mul(d0, sBack))
  const pts: V3[] = [p0, q1]
  const bounces: Bounce[] = [{ p: q1, kind: 'arc' }]
  let exit: V3 | null = null

  // 椭圆面法线（梯度方向，无 Y 分量）
  const ng = v(q1.x / (R * R), 0, q1.z / (b * b))
  const nl = len(ng)
  const n = mul(ng, 1 / nl)
  const d1 = sub(d0, mul(n, 2 * dot(d0, n)))
  const p1 = add(q1, mul(d1, 1e-5))

  // 反射后与椭圆柱面的二次求交
  let tArc = Infinity
  {
    const A = (d1.x * d1.x) / (R * R) + (d1.z * d1.z) / (b * b)
    const B = 2 * ((p1.x * d1.x) / (R * R) + (p1.z * d1.z) / (b * b))
    const C = (p1.x * p1.x) / (R * R) + (p1.z * p1.z) / (b * b) - 1
    const disc = B * B - 4 * A * C
    if (disc > 0 && A > 1e-12) {
      for (const t of [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)]) {
        if (t > 1e-4 && t < tArc) {
          const q = add(p1, mul(d1, t))
          if (q.z <= 1e-6) tArc = t
        }
      }
    }
  }
  const tExit = d1.z > 1e-9 ? -p1.z / d1.z : Infinity
  const exitEnd = (q: V3): V3 => {
    if (screenY !== null && d1.y < -1e-9) {
      const t = (screenY - q.y) / d1.y
      if (t > 0) return add(q, mul(d1, t))
    }
    return add(q, mul(d1, 1.3))
  }
  if (tExit < tArc && tExit < Infinity) {
    const qx = add(p1, mul(d1, tExit))
    if (Math.abs(qx.x) <= R + 1e-6) {
      pts.push(qx)
      pts.push(exitEnd(qx))
      exit = d1
      return { pts, exit, bounces, center }
    }
  }
  if (tArc < Infinity) {
    pts.push(add(p1, mul(d1, tArc))) // 二次命中：终止消失
  } else if (d1.z > 1e-6) {
    pts.push(exitEnd(p1))
    exit = d1
  }
  return { pts, exit, bounces, center }
}

const COL_INCIDENT = 0xf5c667
const COL_REFLECT = 0x8fd0ff
const COL_CENTER = 0xffe9b0

export default function GrooveMicro() {
  const [angleI, setAngleI] = useState(40)
  const [angleP, setAngleP] = useState(0)
  const [rayCount, setRayCount] = useState(11)
  const [depthPct, setDepthPct] = useState(100)
  const [showNormals, setShowNormals] = useState(true)
  const [showConeSurf, setShowConeSurf] = useState(false)
  const [showScreen, setShowScreen] = useState(false)
  const [playing, setPlaying] = useState(true)

  const wrapRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer
    camera: THREE.PerspectiveCamera
    rayGroup: THREE.Group
    photons: THREE.Points
    pipeGroup: THREE.Group
    belly: THREE.Mesh
    grid: THREE.GridHelper
  } | null>(null)
  const timeRef = useRef(0)
  const playingRef = useRef(playing)
  playingRef.current = playing

  const SCREEN_Y = -3.4
  const b = (depthPct / 100) * R
  // 光线束（三维追踪）：命中点固定在槽壁横截面 y=0 上，只随 x0 变化
  const rays = useMemo(() => {
    const list: RayPath[] = []
    for (let k = 0; k < rayCount; k++) {
      const x0 = -0.98 * R + (1.96 * R * k) / (rayCount - 1)
      list.push(traceRay(x0, angleI, angleP, b, showScreen ? SCREEN_Y : null))
    }
    const cr = traceRay(0, angleI, angleP, b, showScreen ? SCREEN_Y : null, true)
    // 物理自检：中心光命中 (0,0,−b)；若逃逸，出射须满足 z 分量翻转
    const i = (angleI * Math.PI) / 180
    const phi = (angleP * Math.PI) / 180
    const first = cr.bounces[0]?.p
    const hitOk = first && Math.hypot(first.x, first.y, first.z + b) < 1e-9
    const exitOk = !cr.exit || (Math.abs(cr.exit.y + Math.sin(i) * Math.cos(phi)) < 1e-9 && Math.abs(cr.exit.z - Math.cos(i)) < 1e-9)
    if (!hitOk || !exitOk) console.warn('[GrooveMicro] 槽底中心光线自检失败', cr)
    const exits = list.filter((r) => r.exit).map((r) => r.exit!)
    if (exits.some((e) => Math.abs(e.y + Math.sin(i) * Math.cos(phi)) > 1e-9)) {
      console.warn('[GrooveMicro] 锥条件 r·ŷ = −sin i·cos φ 被破坏')
    }
    list.push(cr)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angleI, angleP, rayCount, depthPct, showScreen])

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

    // ---- U 形半管槽体（半椭圆柱，轴沿 Y，开口朝 +Z；槽深可调，几何在光路 effect 中重建）----
    const pipeGroup = new THREE.Group()
    scene.add(pipeGroup)

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
    photonGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 96), 3))
    const photons = new THREE.Points(photonGeo, new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(pc), color: 0xffffff, size: 0.14, sizeAttenuation: true,
      transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    photons.frustumCulled = false
    scene.add(photons)

    sceneRef.current = { renderer, camera, rayGroup, photons, pipeGroup, belly, grid }

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

    // ---- 半椭圆柱槽体（槽深 b 可调）----
    s.pipeGroup.clear()
    {
      const NT = 96
      const positions: number[] = []
      const normals: number[] = []
      const indices: number[] = []
      for (let k = 0; k <= NT; k++) {
        const th = Math.PI + (Math.PI * k) / NT // θ∈[π,2π]：下半椭圆，开口朝 +Z
        const x = R * Math.cos(th)
        const z = b * Math.sin(th)
        const nx = Math.cos(th) / R
        const nz = Math.sin(th) / b
        const nl = Math.hypot(nx, nz)
        for (const yy of [-PIPE_LEN / 2, PIPE_LEN / 2]) {
          positions.push(x, yy, z)
          normals.push(nx / nl, 0, nz / nl)
        }
      }
      for (let k = 0; k < NT; k++) {
        const a0 = 2 * k
        indices.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
      geo.setIndex(indices)
      s.pipeGroup.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0x8b95a2, metalness: 0.9, roughness: 0.32, side: THREE.DoubleSide,
      })))
    }
    s.belly.position.z = -b - 0.19
    s.grid.position.z = -b - 0.35

    // ---- 出射锥统计（锥条件 r·ŷ = −sin i·cos φ）----
    const iRad = (angleI * Math.PI) / 180
    const phiRad = (angleP * Math.PI) / 180
    const cosA = Math.sin(iRad) * Math.cos(phiRad)
    const alpha = Math.acos(Math.min(Math.max(cosA, -1), 1))
    const sinA = Math.sin(alpha)
    const exits = rays.filter((r) => r.exit && r.exit.z > 0).map((r) => r.exit!)
    const phis = exits.map((e) => Math.atan2(e.z, e.x))
    const phiMin = phis.length ? Math.min(...phis) : 0
    const phiMax = phis.length ? Math.max(...phis) : 0

    const Y_CLIP = showScreen ? 4.0 : PIPE_LEN / 2 + 0.7
    const clipSeg = (a: THREE.Vector3, b: THREE.Vector3): [THREE.Vector3, THREE.Vector3] | null => {
      let lo = 0
      let hi = 1
      for (const [ac, bc, lim] of [[a.y, b.y, Y_CLIP], [a.z, b.z, START_Y + 0.6]] as const) {
        const d = bc - ac
        if (Math.abs(d) < 1e-9) { if (Math.abs(ac) > lim) return null; continue }
        const t1 = (-lim - ac) / d
        const t2 = (lim - ac) / d
        lo = Math.max(lo, Math.min(t1, t2))
        hi = Math.min(hi, Math.max(t1, t2))
      }
      // z 下界不裁（槽底在 z=-1）
      if (lo >= hi) return null
      return [a.clone().lerp(b, lo), a.clone().lerp(b, hi)]
    }
    const addLines = (segs: THREE.Vector3[][], color: number, opacity: number, yOff = 0) => {
      const pts: THREE.Vector3[] = []
      for (const seg of segs) for (let k = 0; k + 1 < seg.length; k++) {
        const clipped = clipSeg(seg[k], seg[k + 1])
        if (!clipped) continue
        pts.push(clipped[0].setY(clipped[0].y + yOff), clipped[1].setY(clipped[1].y + yOff))
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

    // ---- 出射光锥半透明锥面（开关）----
    if (showConeSurf && exits.length >= 2) {
      const apex = new THREE.Vector3(0, 0, 0)
      const L = showScreen ? Math.abs(SCREEN_Y) / Math.max(cosA, 0.05) : 2.2
      const g = (ph: number) => new THREE.Vector3(sinA * Math.cos(ph), -cosA, sinA * Math.sin(ph))
      const NP = 36
      const pos: number[] = []
      for (let k = 0; k < NP; k++) {
        const p1 = phiMin + ((phiMax - phiMin) * k) / NP
        const p2 = phiMin + ((phiMax - phiMin) * (k + 1)) / NP
        const g1 = g(p1).multiplyScalar(L)
        const g2 = g(p2).multiplyScalar(L)
        pos.push(apex.x, apex.y, apex.z, g1.x, g1.y, g1.z, g2.x, g2.y, g2.z)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.computeVertexNormals()
      s.rayGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: COL_REFLECT, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false,
      })))
      // 锥面边界母线
      const edge: THREE.Vector3[] = []
      for (const ph of [phiMin, phiMax]) {
        edge.push(apex.clone(), apex.clone().addScaledVector(g(ph), L))
      }
      s.rayGroup.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(edge),
        new THREE.LineBasicMaterial({ color: COL_REFLECT, transparent: true, opacity: 0.75 }),
      ))
    }

    // ---- 光屏：反射锥面在屏上截出半圆（开关）----
    if (showScreen) {
      const scrGeo = new THREE.PlaneGeometry(9.0, 4.8)
      scrGeo.rotateX(-Math.PI / 2) // 法线朝 +Y（面向槽体）
      const scr = new THREE.Mesh(scrGeo, new THREE.MeshBasicMaterial({
        color: 0x151b25, side: THREE.DoubleSide,
        transparent: true, opacity: 0.32, depthWrite: false, // 半透明无反光：不挡住相机看槽体
      }))
      scr.position.set(0, SCREEN_Y, 2.1)
      s.rayGroup.add(scr)
      // 屏框
      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(scrGeo),
        new THREE.LineBasicMaterial({ color: 0x3a4656 }),
      )
      frame.position.copy(scr.position)
      s.rayGroup.add(frame)
      // 半圆引导线：半径 ρ = |SCREEN_Y|·tanα
      const rho = Math.abs(SCREEN_Y) * Math.tan(alpha)
      const arc: THREE.Vector3[] = []
      const NA = 64
      for (let k = 0; k < NA; k++) {
        const t1 = (Math.PI * k) / NA
        const t2 = (Math.PI * (k + 1)) / NA
        arc.push(
          new THREE.Vector3(rho * Math.cos(t1), SCREEN_Y, rho * Math.sin(t1)),
          new THREE.Vector3(rho * Math.cos(t2), SCREEN_Y, rho * Math.sin(t2)),
        )
      }
      s.rayGroup.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(arc),
        new THREE.LineBasicMaterial({ color: COL_REFLECT, transparent: true, opacity: 0.85 }),
      ))
      // 光斑：出射光打在屏上的点
      const spotPts: THREE.Vector3[] = []
      for (const ray of rays) {
        if (!ray.exit) continue
        const end = ray.pts[ray.pts.length - 1]
        if (Math.abs(end.y - SCREEN_Y) < 0.05) spotPts.push(to3(end))
      }
      if (spotPts.length) {
        const pGeo = new THREE.BufferGeometry().setFromPoints(spotPts)
        s.rayGroup.add(new THREE.Points(pGeo, new THREE.PointsMaterial({
          map: (s.photons.material as THREE.PointsMaterial).map ?? undefined, color: 0xbfe2ff, size: 0.16, sizeAttenuation: true,
          transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
        })))
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

  }, [rays, showNormals, depthPct, showConeSurf, showScreen, b, SCREEN_Y, angleI, angleP])

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
        if (sp > total || idx >= 96) return
        let seg = 0
        while (seg < cum.length - 2 && cum[seg + 1] < sp) seg++
        const t = cum[seg + 1] === cum[seg] ? 0 : (sp - cum[seg]) / (cum[seg + 1] - cum[seg])
        const p = add(ray.pts[seg], mul(sub(ray.pts[seg + 1], ray.pts[seg]), Math.min(Math.max(t, 0), 1)))
        pos.setXYZ(idx++, p.x, p.y, p.z)
      })
      for (let k = idx; k < 96; k++) pos.setXYZ(k, 0, 0, -1000)
      pos.needsUpdate = true
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [rays])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0e13]">
      {/* 控制条 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[#232a38] bg-[#11151d] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-xs text-[#9aa5b4]">入射角 <em className="font-serif text-[#f0d9b0]">i</em> = {angleI}°</span>
          <Slider className="w-36" min={0} max={80} step={1} value={[angleI]} onValueChange={(v) => setAngleI(v[0])} />
        </div>
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-xs text-[#9aa5b4]">方位角 <em className="font-serif text-[#f0d9b0]">φ</em> = {angleP}°</span>
          <Slider className="w-28" min={0} max={90} step={1} value={[angleP]} onValueChange={(v) => setAngleP(v[0])} />
        </div>
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-xs text-[#9aa5b4]">光线数 {rayCount}</span>
          <Slider className="w-24" min={5} max={61} step={2} value={[rayCount]} onValueChange={(v) => setRayCount(v[0])} />
        </div>
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-xs text-[#9aa5b4]">槽深 {depthPct}%{depthPct < 100 ? '（半椭圆）' : '（半圆）'}</span>
          <Slider className="w-24" min={30} max={100} step={5} value={[depthPct]} onValueChange={(v) => setDepthPct(v[0])} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[#9aa5b4]">
          <Switch checked={showNormals} onCheckedChange={setShowNormals} id="sw-normals" />
          <span>法线</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[#9aa5b4]">
          <Switch checked={showConeSurf} onCheckedChange={setShowConeSurf} id="sw-conesurf" />
          <span>出射锥面</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[#9aa5b4]">
          <Switch checked={showScreen} onCheckedChange={setShowScreen} id="sw-screen" />
          <span>光屏</span>
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
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-[#232a38] bg-[#11151d]/85 px-3 py-2 backdrop-blur md:left-4 md:top-4">
          <h2 className="text-[13px] font-semibold tracking-wide text-[#e6ebf2]">沟槽微观机理示意</h2>
          <p className="mt-0.5 hidden text-[11px] text-[#66707e] md:block">平行光在 U 形槽壁上的镜面反射 · φ 控制入射面与槽轴的夹角 · 拖动旋转视角</p>
        </div>
      </div>

      {/* 说明条 */}
      <div className="border-t border-[#232a38] bg-[#11151d] px-4 py-2.5 text-[11px] leading-relaxed text-[#8b95a5] md:text-xs">
        <span className="text-[#f0d9b0]">①</span> 射到槽底中心的光线沿正常（镜面）方向返回（高亮金色）&ensp;
        <span className="text-[#f0d9b0]">②</span> 射到左半槽壁的光折向右半、右半折向左半；若再撞上槽壁则被吸收消失&ensp;
        <span className="text-[#f0d9b0]">③</span> 槽壁（含半椭圆）法线没有沿槽分量，反射保持沿槽分量不变 → 出射光张成绕槽轴的锥面（可开「出射锥面」显示）；减小槽深可减少二次反射&ensp;
        <span className="text-[#f0d9b0]">④</span> 打开「光屏」，锥面在屏上截出一个半圆
      </div>
    </div>
  )
}
