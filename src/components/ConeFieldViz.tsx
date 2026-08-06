import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Slider } from '@/components/ui/slider'

/**
 * 光锥可视化：反射面点阵上每个点发出的反射光锥（满足 glitter 条件 q̂·t̂ = p̂·t̂ 的出射方向集合）。
 * 每个点 Q：
 *   t̂(Q) — 沟槽切向（拉丝板：恒定 (cosθ,sinθ,0)；同心圆盘：周向 (−sinφ,cosφ,0)）
 *   p̂(Q) — 指向表面的入射方向（平行光：恒定；点光源：随 Q 变化）
 *   c = p̂·t̂ → 半角 α = arccos|c|，轴 a = sign(c)·t̂
 *   母线 g(φ) = a·cosα + sinα·(ẑ·cosφ + u2·sinφ)，u2 = a×ẑ，取 z≥0 半锥（φ∈[−π/2,π/2]）
 * 与主场景「反射线上的一点」光锥同一公式（该公式已经数值验证到 1e-16）。
 * 预期结论（教学点）：平行光 + 平行拉丝板 → 所有点光锥全等；同心圆盘 → 各点光锥随切向旋转而各异。
 */

const PLATE_W = 4
const PLATE_D = 3
const DISK_R = 2
const DEG = Math.PI / 180

interface ConeSpec {
  apex: THREE.Vector3
  axis: THREE.Vector3  // 水平单位向量
  alpha: number        // 半角（弧度）
}

/** 计算点阵每个点的光锥参数 */
function buildCones(
  surface: 'plate' | 'disk',
  lightMode: 'parallel' | 'point',
  azimuth: number, elevation: number,
  lightPos: { x: number; y: number; z: number },
  grooveAngle: number,
  density: number,
): ConeSpec[] {
  const out: ConeSpec[] = []
  const n = density
  // 平行光入射方向 p̂（指向表面）：与主场景一致
  const az = azimuth * DEG
  const el = elevation * DEG
  const pParallel = new THREE.Vector3(-Math.cos(el) * Math.cos(az), -Math.cos(el) * Math.sin(az), -Math.sin(el))
  const th = grooveAngle * DEG
  const tPlate = new THREE.Vector3(Math.cos(th), Math.sin(th), 0)

  const push = (qx: number, qy: number) => {
    const Q = new THREE.Vector3(qx, qy, 0)
    const t = surface === 'plate'
      ? tPlate.clone()
      : new THREE.Vector3(-qy, qx, 0).normalize() // 圆盘周向
    if (t.lengthSq() < 1e-12) return // 圆心处切向无定义
    const p = lightMode === 'parallel'
      ? pParallel
      : new THREE.Vector3(lightPos.x - qx, lightPos.y - qy, lightPos.z).normalize().negate() // 指向表面
    const c = Math.max(-1, Math.min(1, p.dot(t)))
    const alpha = Math.acos(Math.abs(c)) // α=90° 时退化为半圆扇面、α=0 时退化为单线，均可正常绘制
    const axis = c < 0 ? t.clone().negate() : t
    out.push({ apex: Q, axis, alpha })
  }

  if (surface === 'plate') {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      push(-PLATE_W / 2 + 0.4 + ((PLATE_W - 0.8) * i) / (n - 1), -PLATE_D / 2 + 0.4 + ((PLATE_D - 0.8) * j) / (n - 1))
    }
  } else {
    // 圆盘用环×辐采样，与同心环沟槽结构对齐（相邻环交错半格）
    const rings = n - 1
    const spokes = 8
    for (let k = 1; k <= rings; k++) {
      const r = ((DISK_R - 0.2) * k) / (rings + 0.5)
      for (let a = 0; a < spokes; a++) {
        const phi = (a / spokes) * Math.PI * 2 + (k % 2) * (Math.PI / spokes)
        push(r * Math.cos(phi), r * Math.sin(phi))
      }
    }
  }
  return out
}

export default function ConeFieldViz() {
  const [lightMode, setLightMode] = useState<'parallel' | 'point'>('parallel')
  const [azimuth, setAzimuth] = useState(180) // 默认光从左侧射入（+X 方向）
  const [elevation, setElevation] = useState(45)
  const [lightPos, setLightPos] = useState({ x: -2.0, y: 0, z: 2.4 }) // 默认在左侧
  const [surface, setSurface] = useState<'plate' | 'disk'>('plate')
  const [grooveAngle, setGrooveAngle] = useState(0) // 默认 t̂ 沿 +X，配合左侧来光 → 锥口朝右
  const [density, setDensity] = useState(4)

  const wrapRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer
    coneGroup: THREE.Group
    lightMesh: THREE.Mesh
    sunSprite: THREE.Group
    surfaceGroup: THREE.Group
    camera: THREE.PerspectiveCamera
  } | null>(null)

  // 光锥参数（纯函数，UI 状态变化时重算）
  const cones = useMemo(
    () => buildCones(surface, lightMode, azimuth, elevation, lightPos, grooveAngle, density),
    [surface, lightMode, azimuth, elevation, lightPos, grooveAngle, density],
  )
  // 教学自检：平行光+拉丝板时所有锥的 (axis, alpha) 必须全等
  useMemo(() => {
    if (lightMode === 'parallel' && surface === 'plate' && cones.length > 1) {
      const a0 = cones[0]
      const bad = cones.some(
        (k) => Math.abs(k.alpha - a0.alpha) > 1e-12 || k.axis.distanceTo(a0.axis) > 1e-12,
      )
      if (bad) console.warn('[ConeField] 平行光+拉丝板的各点光锥应全等，自检失败')
    }
  }, [cones, lightMode, surface])

  // 初始化 three 场景（仅一次）
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    wrap.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b0e13)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.up.set(0, 0, 1)
    camera.position.set(0.6, -6.2, 2.6) // 正面略俯视：反射面水平、左→右构图
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0.35)
    controls.enableDamping = true

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xfff2dd, 1.6)
    key.position.set(3, 2, 5)
    scene.add(key)

    const grid = new THREE.GridHelper(12, 24, 0x1c2430, 0x141a24)
    grid.rotation.x = Math.PI / 2
    grid.position.z = -0.02
    scene.add(grid)
    const axes = new THREE.AxesHelper(1.2)
    axes.position.set(-2.8, -2.2, 0)
    scene.add(axes)

    const coneGroup = new THREE.Group()
    scene.add(coneGroup)
    const surfaceGroup = new THREE.Group()
    scene.add(surfaceGroup)

    // 点光源标记
    const lightMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
    )
    scene.add(lightMesh)
    // 平行光太阳标记（简单圆盘+光芒放远处指示方向）
    const sunSprite = new THREE.Group()
    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
    )
    sunSprite.add(sunCore)
    scene.add(sunSprite)

    sceneRef.current = { renderer, coneGroup, lightMesh, sunSprite, surfaceGroup, camera }

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
    const loop = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [])

  // 反射面重建
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    s.surfaceGroup.clear()
    if (surface === 'plate') {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(PLATE_W, PLATE_D),
        new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.85, roughness: 0.35 }),
      )
      s.surfaceGroup.add(mesh)
      // 沟槽方向细线
      const th = grooveAngle * DEG
      const t = new THREE.Vector2(Math.cos(th), Math.sin(th))
      const nrm = new THREE.Vector2(-t.y, t.x)
      const mat = new THREE.LineBasicMaterial({ color: 0x6b7684, transparent: true, opacity: 0.5 })
      const pts: THREE.Vector3[] = []
      // 沟槽线裁剪到板面矩形内：求解沿 t 方向的参数范围
      const halfW = PLATE_W / 2 - 0.02
      const halfD = PLATE_D / 2 - 0.02
      for (let k = -9; k <= 9; k++) {
        const o = nrm.clone().multiplyScalar(k * 0.18)
        let lo = -Infinity
        let hi = Infinity
        for (const [oc, tc, half] of [[o.x, t.x, halfW], [o.y, t.y, halfD]] as const) {
          if (Math.abs(tc) < 1e-9) {
            if (Math.abs(oc) > half) { lo = 1; hi = 0; break }
          } else {
            const a = (-half - oc) / tc
            const b = (half - oc) / tc
            lo = Math.max(lo, Math.min(a, b))
            hi = Math.min(hi, Math.max(a, b))
          }
        }
        if (lo >= hi) continue
        pts.push(new THREE.Vector3(o.x + t.x * lo, o.y + t.y * lo, 0.001))
        pts.push(new THREE.Vector3(o.x + t.x * hi, o.y + t.y * hi, 0.001))
      }
      s.surfaceGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat))
    } else {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(DISK_R, 96),
        new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.85, roughness: 0.35 }),
      )
      s.surfaceGroup.add(mesh)
      const mat = new THREE.LineBasicMaterial({ color: 0x6b7684, transparent: true, opacity: 0.5 })
      const pts: THREE.Vector3[] = []
      for (let k = 1; k <= 9; k++) {
        const r = (DISK_R * k) / 10
        for (let a = 0; a < 64; a++) {
          const a1 = (a / 64) * Math.PI * 2
          const a2 = ((a + 1) / 64) * Math.PI * 2
          pts.push(new THREE.Vector3(r * Math.cos(a1), r * Math.sin(a1), 0.001))
          pts.push(new THREE.Vector3(r * Math.cos(a2), r * Math.sin(a2), 0.001))
        }
      }
      s.surfaceGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat))
    }
  }, [surface, grooveAngle])

  // 光锥重建
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    s.coneGroup.clear()
    if (cones.length === 0) return
    const spacing = surface === 'plate' ? (PLATE_W - 0.8) / (density - 1) : DISK_R / density
    const L = Math.max(0.28, Math.min(0.55, spacing * 0.55))
    const NG = 8   // 半锥母线条数
    const NR = 16  // 半环分段
    const linePts: THREE.Vector3[] = []
    const apexPts: THREE.Vector3[] = []
    const zAxis = new THREE.Vector3(0, 0, 1)
    for (const cone of cones) {
      const { apex, axis, alpha } = cone
      apexPts.push(apex.clone())
      const u2 = new THREE.Vector3(axis.y, -axis.x, 0) // a×ẑ
      const sinA = Math.sin(alpha)
      const cosA = Math.cos(alpha)
      const g = (phi: number) =>
        new THREE.Vector3()
          .addScaledVector(axis, cosA)
          .addScaledVector(zAxis, sinA * Math.cos(phi))
          .addScaledVector(u2, sinA * Math.sin(phi))
      // 母线
      for (let k = 0; k < NG; k++) {
        const phi = -Math.PI / 2 + (Math.PI * k) / (NG - 1)
        linePts.push(apex.clone(), apex.clone().addScaledVector(g(phi), L))
      }
      // 半环（长度 L 处的圆周五轴截面）
      for (let k = 0; k < NR; k++) {
        const p1 = -Math.PI / 2 + (Math.PI * k) / NR
        const p2 = -Math.PI / 2 + (Math.PI * (k + 1)) / NR
        linePts.push(apex.clone().addScaledVector(g(p1), L), apex.clone().addScaledVector(g(p2), L))
      }
    }
    const coneLines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(linePts),
      new THREE.LineBasicMaterial({ color: 0xf0c46a, transparent: true, opacity: 0.85 }),
    )
    s.coneGroup.add(coneLines)
    const dots = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(apexPts),
      new THREE.PointsMaterial({ color: 0xe8eef5, size: 4, sizeAttenuation: false }),
    )
    s.coneGroup.add(dots)
  }, [cones, surface, density])

  // 光源标记位置
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    if (lightMode === 'point') {
      s.lightMesh.visible = true
      s.sunSprite.visible = false
      s.lightMesh.position.set(lightPos.x, lightPos.y, lightPos.z)
    } else {
      s.lightMesh.visible = false
      s.sunSprite.visible = true
      const az = azimuth * DEG
      const el = elevation * DEG
      // 太阳位于入射方向的反方向（光来自那里）
      s.sunSprite.position.set(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)).multiplyScalar(4.5)
    }
  }, [lightMode, lightPos, azimuth, elevation])

  const segBtn = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs font-medium transition-colors ${active ? 'bg-[#d4a054]/15 text-[#f0d9b0]' : 'text-[#8b95a5] hover:text-[#e6ebf2]'}`

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0e13]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[#232a38] bg-[#11151d] px-4 py-2 text-xs text-[#9aa5b4]">
        <div className="flex items-center gap-1">
          <span className="mr-1">光源</span>
          <button className={segBtn(lightMode === 'parallel')} onClick={() => setLightMode('parallel')}>平行光</button>
          <button className={segBtn(lightMode === 'point')} onClick={() => setLightMode('point')}>点光源</button>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1">反射面</span>
          <button className={segBtn(surface === 'plate')} onClick={() => setSurface('plate')}>平行拉丝板</button>
          <button className={segBtn(surface === 'disk')} onClick={() => setSurface('disk')}>同心圆盘</button>
        </div>
        {lightMode === 'parallel' ? (
          <>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">方位角 {azimuth}°</span>
              <Slider className="w-24" min={0} max={360} step={1} value={[azimuth]} onValueChange={(v) => setAzimuth(v[0])} />
            </div>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">仰角 {elevation}°</span>
              <Slider className="w-24" min={5} max={85} step={1} value={[elevation]} onValueChange={(v) => setElevation(v[0])} />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">X {lightPos.x.toFixed(1)}</span>
              <Slider className="w-20" min={-3} max={3} step={0.1} value={[lightPos.x]} onValueChange={(v) => setLightPos((p) => ({ ...p, x: v[0] }))} />
            </div>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">Y {lightPos.y.toFixed(1)}</span>
              <Slider className="w-20" min={-3} max={3} step={0.1} value={[lightPos.y]} onValueChange={(v) => setLightPos((p) => ({ ...p, y: v[0] }))} />
            </div>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">Z {lightPos.z.toFixed(1)}</span>
              <Slider className="w-20" min={0.5} max={5} step={0.1} value={[lightPos.z]} onValueChange={(v) => setLightPos((p) => ({ ...p, z: v[0] }))} />
            </div>
          </>
        )}
        {surface === 'plate' && (
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap">沟槽角 θ {grooveAngle}°</span>
            <Slider className="w-24" min={0} max={180} step={1} value={[grooveAngle]} onValueChange={(v) => setGrooveAngle(v[0])} />
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-[#c9d1d9]">点阵密度 {surface === 'plate' ? `${density}×${density}` : `${density - 1}环×8`}</span>
          <Slider className="w-28" min={2} max={8} step={1} value={[density]} onValueChange={(v) => setDensity(v[0])} />
        </div>
      </div>

      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-[#232a38] bg-[#11151d]/85 px-3 py-2 backdrop-blur md:left-4 md:top-4">
          <h2 className="text-[13px] font-semibold tracking-wide text-[#e6ebf2]">光锥可视化</h2>
          <p className="mt-0.5 hidden text-[11px] text-[#66707e] md:block">反射面点阵上每个点满足 q̂·t̂ = p̂·t̂ 的出射方向锥（z≥0 半锥）· 拖动旋转视角</p>
        </div>
      </div>

      <div className="border-t border-[#232a38] bg-[#11151d] px-4 py-2.5 text-[11px] leading-relaxed text-[#8b95a5] md:text-xs">
        <span className="text-[#f0d9b0]">①</span> 每个点能产生闪光的出射方向构成一个圆锥：轴沿沟槽切向 t̂，半角 α = arccos|p̂·t̂|&ensp;
        <span className="text-[#f0d9b0]">②</span> 平行光 + 平行拉丝板：t̂ 与 p̂ 处处相同，所有光锥全等&ensp;
        <span className="text-[#f0d9b0]">③</span> 同心圆盘：切向随位置旋转，各点光锥方向、开角各异——正是它让整条亮线在不同位置同时被看到
      </div>
    </div>
  )
}
