import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { SimParams } from './types'
import { clamp } from './types'

export interface DragUpdate {
  pointLightPos?: { x: number; y: number; z: number }
  eyePos?: { x: number; y: number; z: number }
  centerX?: number
  centerZ?: number
  azimuth?: number
  elevation?: number
}

const SUN_R = 6 // 太阳把手轨道半径
const MIN_Y = 0.15 // 点光源/眼睛最低高度

/* ------------------------------------------------------------------ */
/* 着色器：逐 fragment 在世界坐标中计算 f(Q) = (p̂ − q̂)·t̂，|f|≈0 处发光 */
/* ------------------------------------------------------------------ */
const VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FRAG = /* glsl */ `
uniform int uLightMode;      // 0 = 平行光, 1 = 点光源
uniform vec3 uPointPos;      // 点光源位置 L
uniform vec3 uParallelDir;   // 平行光传播方向 d̂ (y < 0)
uniform vec3 uEye;           // 眼睛位置 E
uniform vec3 uCenter;        // 反射面中心 C
uniform int uSurfaceType;    // 0 = 拉丝板, 1 = 同心圆盘
uniform float uGrooveAngle;  // 板沟槽角 θ (弧度)
uniform float uTime;

varying vec3 vWorldPos;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec3 Q = vWorldPos;
  vec3 rel = Q - uCenter;

  // p̂: 入射光传播方向;  q̂: 指向眼睛方向
  vec3 p = (uLightMode == 1) ? normalize(Q - uPointPos) : uParallelDir;
  vec3 q = normalize(uEye - Q);

  // t̂: 沟槽方向（XZ 平面内）；grooveCoord = 垂直沟槽方向坐标，用于程序化拉丝纹理
  vec3 t;
  float grooveCoord;
  if (uSurfaceType == 0) {
    t = vec3(cos(uGrooveAngle), 0.0, sin(uGrooveAngle));
    grooveCoord = rel.x * (-t.z) + rel.z * t.x;
  } else {
    float r = length(rel.xz);
    // t̂ = normalize(ŷ × (Q−C)) = normalize(rz, 0, −rx)；Q=C 处退化为 0 → 圆心天然发亮
    t = (r < 1e-4) ? vec3(0.0) : vec3(rel.z, 0.0, -rel.x) / r;
    grooveCoord = r;
  }

  // 核心发亮条件 f(Q) = (p̂ − q̂)·t̂ = 0
  float f = dot(p - q, t);
  // fwidth 屏幕空间抗锯齿，线宽随距离稳定
  float aa = max(fwidth(f), 1e-7) * 2.0;
  float glow = 1.0 - smoothstep(0.0, aa, abs(f));

  // 程序化金属底纹：沿沟槽垂直方向的高频正弦条纹 + 细微噪点（纹理方向严格跟随沟槽几何）
  float stripe = sin(grooveCoord * 90.0);
  float fine = sin(grooveCoord * 340.0 + hash(floor(Q.xz * 60.0)) * 6.2831);
  float baseGray = 0.125 + 0.030 * stripe + 0.012 * fine + 0.018 * (hash(floor(Q.xz * 200.0)) - 0.5);

  // 简化 Blinn-Phong（N = ŷ），低调暗灰金属，亮线是视觉主角
  vec3 N = vec3(0.0, 1.0, 0.0);
  vec3 Ld = (uLightMode == 1) ? normalize(uPointPos - Q) : -uParallelDir;
  vec3 H = normalize(Ld + q);
  float diff = max(dot(N, Ld), 0.0);
  float spec = pow(max(dot(N, H), 0.0), 60.0) * 0.16;
  vec3 baseColor = vec3(baseGray) * (0.5 + 0.5 * diff) + vec3(spec);

  // 暖金亮线，加法叠加 + 高频 sparkle 闪烁
  float sp = hash(floor(Q.xz * 140.0) + vec2(floor(uTime * 6.0)));
  float sparkle = 0.75 + 0.25 * sp;
  vec3 glowColor = vec3(1.0, 0.72, 0.35) * 2.5 * glow * sparkle;

  gl_FragColor = vec4(baseColor + glowColor, 1.0);
}
`

const DEG = Math.PI / 180

export class GlitterScene {
  private container: HTMLElement
  private insetEl: HTMLElement
  private onDragUpdate: (u: DragUpdate) => void

  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private mainCam: THREE.PerspectiveCamera
  private eyeCam: THREE.PerspectiveCamera
  private orbit: OrbitControls
  private tc: TransformControls
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()

  private params: SimParams
  private surfaceGroup = new THREE.Group()
  private plateMesh: THREE.Mesh
  private diskMesh: THREE.Mesh
  private surfaceMat: THREE.ShaderMaterial
  private geoKey = ''

  private pointLightHandle = new THREE.Group()
  private sunHandle = new THREE.Group()
  private eyeHandle = new THREE.Group()
  private eyeCone!: THREE.Mesh
  private sightLine: THREE.Line
  private parallelLines: THREE.LineSegments
  private pointLine: THREE.Line
  private pointLightObj = new THREE.PointLight(0xffc47a, 40, 0, 1.8)

  private raf = 0
  private clock = new THREE.Clock()
  private resizeObs: ResizeObserver
  private disposed = false

  constructor(container: HTMLElement, insetEl: HTMLElement, params: SimParams, onDragUpdate: (u: DragUpdate) => void) {
    this.container = container
    this.insetEl = insetEl
    this.params = params
    this.onDragUpdate = onDragUpdate

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.domElement.style.position = 'absolute'
    this.renderer.domElement.style.inset = '0'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(0x0b0e13)
    this.scene.fog = new THREE.Fog(0x0b0e13, 18, 42)

    this.mainCam = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
    this.mainCam.position.set(6.2, 4.6, 7.2)
    this.mainCam.layers.enable(1) // 主相机可见 layer 0 + 1（眼睛把手在 layer 1）

    this.eyeCam = new THREE.PerspectiveCamera(55, 320 / 208, 0.05, 200)

    this.orbit = new OrbitControls(this.mainCam, this.renderer.domElement)
    this.orbit.enableDamping = true
    this.orbit.dampingFactor = 0.08
    this.orbit.maxPolarAngle = Math.PI * 0.495
    this.orbit.minDistance = 2
    this.orbit.maxDistance = 30

    // 暗色低存在感网格地面
    const grid = new THREE.GridHelper(40, 40, 0x273043, 0x171e2c)
    grid.position.y = -0.01
    const gm = grid.material as THREE.Material
    gm.transparent = true
    gm.opacity = 0.55
    this.scene.add(grid)
    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.5))

    /* ---------------- 反射面（共享 shader 的板/盘） ---------------- */
    this.surfaceMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uLightMode: { value: 0 },
        uPointPos: { value: new THREE.Vector3() },
        uParallelDir: { value: new THREE.Vector3(0, -1, 0) },
        uEye: { value: new THREE.Vector3() },
        uCenter: { value: new THREE.Vector3() },
        uSurfaceType: { value: 0 },
        uGrooveAngle: { value: 0 },
        uTime: { value: 0 },
      },
      side: THREE.DoubleSide,
    })
    this.plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.surfaceMat)
    this.plateMesh.geometry.rotateX(-Math.PI / 2)
    this.plateMesh.userData.dragId = 'surface'
    this.diskMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 160), this.surfaceMat)
    this.diskMesh.geometry.rotateX(-Math.PI / 2)
    this.diskMesh.userData.dragId = 'surface'
    this.surfaceGroup.userData.dragId = 'surface'
    this.surfaceGroup.add(this.plateMesh, this.diskMesh)
    this.scene.add(this.surfaceGroup)

    /* ---------------- 把手 ---------------- */
    this.buildPointLightHandle()
    this.buildSunHandle()
    this.buildEyeHandle()
    this.scene.add(this.pointLightHandle, this.sunHandle, this.eyeHandle, this.pointLightObj)

    /* ---------------- 光线指示线 ---------------- */
    const mkLine = (color: number, opacity: number) =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
      )
    this.sightLine = mkLine(0x8fa3bf, 0.5)
    this.pointLine = mkLine(0xffb347, 0.45)
    this.scene.add(this.sightLine, this.pointLine)

    this.parallelLines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(new Array(10).fill(0).map(() => new THREE.Vector3())),
      new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.32 }),
    )
    this.scene.add(this.parallelLines)

    /* ---------------- TransformControls：点击选中 + 拖动 ---------------- */
    this.tc = new TransformControls(this.mainCam, this.renderer.domElement)
    this.tc.setMode('translate')
    this.tc.setSize(0.85)
    this.scene.add(this.tc.getHelper())
    this.tc.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value
    })
    this.tc.addEventListener('objectChange', () => this.handleObjectChange())
    this.renderer.domElement.addEventListener('pointerdown', this.handlePick)

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(container)
    this.resize()
    this.applyParams()
    this.loop()
  }

  /* ---------------- 把手构建 ---------------- */
  private buildPointLightHandle() {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd28a }))
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    core.userData.dragId = 'pointLight'
    this.pointLightHandle.add(core, glow)
    this.pointLightHandle.userData.dragId = 'pointLight'
  }

  private buildSunHandle() {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffcf6e }))
    core.userData.dragId = 'sun'
    this.sunHandle.add(core)
    const rayMat = new THREE.MeshBasicMaterial({ color: 0xffb347 })
    for (let i = 0; i < 8; i++) {
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 6), rayMat)
      const a = (i / 8) * Math.PI * 2
      ray.position.set(Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0)
      ray.rotation.z = a + Math.PI / 2
      this.sunHandle.add(ray)
    }
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.sunHandle.add(glow)
    this.sunHandle.userData.dragId = 'sun'
  }

  private buildEyeHandle() {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshBasicMaterial({ color: 0xdfe7ef }))
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: 0x1c2430 }))
    pupil.position.set(0, 0, 0.09)
    this.eyeCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.18, 16),
      new THREE.MeshBasicMaterial({ color: 0x8fa3bf, transparent: true, opacity: 0.85 }),
    )
    this.eyeCone.geometry.rotateX(Math.PI / 2) // 顶点指向 +z，配合 lookAt 指向板心
    this.eyeCone.position.z = 0.2
    this.eyeHandle.add(body, pupil, this.eyeCone)
    this.eyeHandle.userData.dragId = 'eye'
    // 眼睛把手整体放 layer 1：主相机可见，观察者相机不可见（避免自遮挡）
    this.eyeHandle.traverse((o) => o.layers.set(1))
  }

  /* ---------------- 选中与拖动 ---------------- */
  private handlePick = (ev: PointerEvent) => {
    if (this.tc.dragging) return
    if (this.tc.axis) return // 指针悬停在 gizmo 手柄上：交给 TransformControls，不做重选
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.mainCam)
    this.raycaster.layers.enableAll()
    const targets: THREE.Object3D[] = [this.pointLightHandle, this.sunHandle, this.eyeHandle, this.plateMesh, this.diskMesh]
    const hits = this.raycaster.intersectObjects(targets, true)
    let obj: THREE.Object3D | null = null
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      while (o && !o.userData.dragId) o = o.parent
      if (o) {
        const id = o.userData.dragId as string
        const visible =
          (id === 'pointLight' && this.pointLightHandle.visible) ||
          (id === 'sun' && this.sunHandle.visible) ||
          id === 'eye' ||
          (id === 'surface' && (h.object as THREE.Mesh).visible)
        if (visible) {
          // 反射面拖动作用于 surfaceGroup（uniform 中心取自 group 位置）
          obj = id === 'surface' ? this.surfaceGroup : o
          break
        }
      }
    }
    if (obj) this.tc.attach(obj)
    else this.tc.detach()
  }

  private handleObjectChange() {
    const obj = this.tc.object
    if (!obj) return
    const id = obj.userData.dragId as string
    const p = obj.position
    const round = (v: number) => Math.round(v * 1000) / 1000

    if (id === 'pointLight') {
      p.y = Math.max(p.y, MIN_Y)
      p.x = clamp(p.x, -8, 8)
      p.z = clamp(p.z, -8, 8)
      this.onDragUpdate({ pointLightPos: { x: round(p.x), y: round(p.y), z: round(p.z) } })
    } else if (id === 'eye') {
      p.y = Math.max(p.y, MIN_Y)
      p.x = clamp(p.x, -8, 8)
      p.z = clamp(p.z, -8, 8)
      this.onDragUpdate({ eyePos: { x: round(p.x), y: round(p.y), z: round(p.z) } })
    } else if (id === 'surface') {
      p.y = 0
      p.x = clamp(p.x, -6, 6)
      p.z = clamp(p.z, -6, 6)
      this.onDragUpdate({ centerX: round(p.x), centerZ: round(p.z) })
    } else if (id === 'sun') {
      // 投影到以板心为球心、SUN_R 为半径的球面，回算方位角/仰角
      const c = this.surfaceGroup.position
      const s = new THREE.Vector3().subVectors(p, c)
      if (s.lengthSq() < 1e-6) return
      s.normalize()
      const el = Math.asin(clamp(s.y, Math.sin(5 * DEG), 1)) / DEG
      let az = Math.atan2(s.z, s.x) / DEG
      if (az < 0) az += 360
      this.positionSun(az, el)
      this.onDragUpdate({ azimuth: round(az), elevation: round(el) })
    }
  }

  /* ---------------- 参数 → 场景 ---------------- */
  private sunDir(azimuthDeg: number, elevationDeg: number) {
    const az = azimuthDeg * DEG
    const el = elevationDeg * DEG
    return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az))
  }

  private positionSun(azimuth: number, elevation: number) {
    const s = this.sunDir(azimuth, elevation)
    this.sunHandle.position.copy(this.surfaceGroup.position).addScaledVector(s, SUN_R)
  }

  setParams(params: SimParams) {
    this.params = params
    this.applyParams()
  }

  private applyParams() {
    const p = this.params
    // 拖动中的物体不回写位置，避免与 TransformControls 打架
    const dragId = this.tc.dragging ? (this.tc.object?.userData.dragId as string | undefined) : undefined

    if (dragId !== 'pointLight') this.pointLightHandle.position.set(p.pointLightPos.x, p.pointLightPos.y, p.pointLightPos.z)
    if (dragId !== 'eye') this.eyeHandle.position.set(p.eyePos.x, p.eyePos.y, p.eyePos.z)
    if (dragId !== 'surface') this.surfaceGroup.position.set(p.centerX, 0, p.centerZ)
    if (dragId !== 'sun') this.positionSun(p.azimuth, p.elevation)

    this.pointLightHandle.visible = p.lightMode === 'point'
    this.pointLine.visible = p.lightMode === 'point'
    this.sunHandle.visible = p.lightMode === 'parallel'
    this.parallelLines.visible = p.lightMode === 'parallel'
    this.pointLightObj.visible = p.lightMode === 'point'
    this.pointLightObj.position.copy(this.pointLightHandle.position)

    this.plateMesh.visible = p.surfaceType === 'plate'
    this.diskMesh.visible = p.surfaceType === 'disk'

    // 几何尺寸重建（dispose 旧 geometry）
    const key = `${p.plateWidth}|${p.plateDepth}|${p.diskRadius}`
    if (key !== this.geoKey) {
      this.geoKey = key
      this.plateMesh.geometry.dispose()
      this.plateMesh.geometry = new THREE.PlaneGeometry(p.plateWidth, p.plateDepth)
      this.plateMesh.geometry.rotateX(-Math.PI / 2)
      this.diskMesh.geometry.dispose()
      this.diskMesh.geometry = new THREE.CircleGeometry(p.diskRadius, 160)
      this.diskMesh.geometry.rotateX(-Math.PI / 2)
    }

    const u = this.surfaceMat.uniforms
    u.uLightMode.value = p.lightMode === 'point' ? 1 : 0
    u.uSurfaceType.value = p.surfaceType === 'plate' ? 0 : 1
    u.uGrooveAngle.value = p.grooveAngle * DEG
  }

  /* ---------------- 渲染循环：每帧从把手实际位置推导 uniform ---------------- */
  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const t = this.clock.getElapsedTime()
    this.orbit.update()

    const p = this.params
    const center = this.surfaceGroup.position
    const eyePos = this.eyeHandle.position
    const u = this.surfaceMat.uniforms

    // 平行光方向由太阳把手实时位置定义：d̂ = normalize(C − handle)，保证拖动跟手
    const d = new THREE.Vector3().subVectors(center, this.sunHandle.position)
    if (d.lengthSq() > 1e-8) d.normalize()
    else d.set(0, -1, 0)
    u.uParallelDir.value.copy(d)
    u.uPointPos.value.copy(this.pointLightHandle.position)
    u.uEye.value.copy(eyePos)
    u.uCenter.value.copy(center)
    u.uTime.value = t

    // 眼睛看向板心 + 视锥指示线
    this.eyeHandle.lookAt(center)
    const sightPos = this.sightLine.geometry.attributes.position as THREE.BufferAttribute
    sightPos.setXYZ(0, eyePos.x, eyePos.y, eyePos.z)
    sightPos.setXYZ(1, center.x, center.y, center.z)
    sightPos.needsUpdate = true
    this.sightLine.layers.set(1) // 仅主视图可见

    // 光线指示
    if (p.lightMode === 'parallel') {
      const attr = this.parallelLines.geometry.attributes.position as THREE.BufferAttribute
      let i = 0
      for (let k = -2; k <= 2; k++) {
        const off = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(k * 0.9)
        const base = new THREE.Vector3().copy(center).add(off)
        const a = new THREE.Vector3().copy(base).addScaledVector(d, -5.5)
        const b = new THREE.Vector3().copy(base).addScaledVector(d, 1.2)
        attr.setXYZ(i++, a.x, a.y, a.z)
        attr.setXYZ(i++, b.x, b.y, b.z)
      }
      attr.needsUpdate = true
    } else {
      const attr = this.pointLine.geometry.attributes.position as THREE.BufferAttribute
      const L = this.pointLightHandle.position
      attr.setXYZ(0, L.x, L.y, L.z)
      attr.setXYZ(1, center.x, center.y, center.z)
      attr.needsUpdate = true
    }

    // 观察者相机
    this.eyeCam.position.copy(eyePos)
    this.eyeCam.lookAt(center)

    this.render()
  }

  private render() {
    const canvas = this.renderer.domElement
    // 注意：three.js 的 setViewport/setScissor 接受 CSS 像素，内部会自行乘以 pixelRatio，
    // 这里不能再乘 devicePixelRatio，否则高 DPR 屏幕上小窗视口会被推出画布而不可见。
    const crect = canvas.getBoundingClientRect()

    this.renderer.setScissorTest(true)
    this.renderer.setViewport(0, 0, crect.width, crect.height)
    this.renderer.setScissor(0, 0, crect.width, crect.height)
    this.renderer.render(this.scene, this.mainCam)

    // 观察者视角小窗：同一 renderer，setViewport/setScissor 第二遍渲染
    const rect = this.insetEl.getBoundingClientRect()
    const vw = Math.round(rect.width)
    const vh = Math.round(rect.height)
    if (vw > 8 && vh > 8) {
      const vx = Math.round(rect.left - crect.left)
      const vy = Math.round(crect.bottom - rect.bottom) // GL 原点在左下
      this.eyeCam.aspect = vw / vh
      this.eyeCam.updateProjectionMatrix()
      this.renderer.setViewport(vx, vy, vw, vh)
      this.renderer.setScissor(vx, vy, vw, vh)
      this.renderer.render(this.scene, this.eyeCam)
    }
  }

  private resize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.mainCam.aspect = w / h
    this.mainCam.updateProjectionMatrix()
  }

  /* ---------------- 物理正确性自检（CPU 复现 shader 公式） ---------------- */
  selfCheck(): string {
    const p = this.params
    const C = new THREE.Vector3(p.centerX, 0, p.centerZ)
    const E = new THREE.Vector3(p.eyePos.x, p.eyePos.y, p.eyePos.z)
    const L = new THREE.Vector3(p.pointLightPos.x, p.pointLightPos.y, p.pointLightPos.z)
    const d = this.sunDir(p.azimuth, p.elevation).multiplyScalar(-1) // 传播方向

    const fAt = (Q: THREE.Vector3): number => {
      const ph = p.lightMode === 'point' ? Q.clone().sub(L).normalize() : d.clone()
      const qh = E.clone().sub(Q).normalize()
      let th: THREE.Vector3
      if (p.surfaceType === 'plate') {
        const th0 = p.grooveAngle * DEG
        th = new THREE.Vector3(Math.cos(th0), 0, Math.sin(th0))
      } else {
        const rel = Q.clone().sub(C)
        const r = Math.hypot(rel.x, rel.z)
        th = r < 1e-4 ? new THREE.Vector3() : new THREE.Vector3(rel.z, 0, -rel.x).divideScalar(r)
      }
      return ph.sub(qh).dot(th)
    }

    // 镜面反射点 O（平面镜反射定律）
    let O: THREE.Vector3
    if (p.lightMode === 'point') {
      const Er = new THREE.Vector3(E.x, -E.y, E.z)
      const s = L.y / (L.y + E.y)
      O = L.clone().addScaledVector(Er.clone().sub(L), s)
    } else {
      const qh = new THREE.Vector3(d.x, -d.y, d.z) // d̂ 经镜面反射后的方向
      const tt = E.y / qh.y
      O = E.clone().addScaledVector(qh, -tt)
    }
    const fO = fAt(O)
    const msgs: string[] = []
    const okO = Math.abs(fO) < 1e-6
    msgs.push(`镜面点 O=(${O.x.toFixed(3)}, 0, ${O.z.toFixed(3)})，|f(O)|=${Math.abs(fO).toExponential(2)} → ${okO ? '通过：亮线必过镜面点' : '失败'}`)
    if (p.surfaceType === 'disk') {
      const fC = fAt(C)
      msgs.push(`圆心 f(C)=${fC} → ${fC === 0 ? '通过：Q=C 处 t̂ 退化，圆心天然发亮' : '失败'}`)
    }
    if (p.lightMode === 'parallel') {
      msgs.push(`d̂.y=${d.y.toFixed(3)} ${d.y < 0 ? '< 0 → 通过：平行光向下照射' : '→ 失败'}`)
    }
    const summary = `[物理自检] ${msgs.join('；')}`
    console.debug(summary)
    return summary
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObs.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePick)
    this.tc.detach()
    this.tc.dispose()
    this.orbit.dispose()
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else if (mat) mat.dispose()
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
