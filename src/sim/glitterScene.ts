import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { SimParams } from './types'
import { clamp } from './types'

export interface DragUpdate {
  pointLightPos?: { x: number; y: number; z: number }
  eyePos?: { x: number; y: number; z: number }
  centerX?: number
  centerY?: number
  azimuth?: number
  elevation?: number
  grooveAngle?: number
}

const SUN_R = 6 // 太阳把手轨道半径
const MIN_Z = 0.15 // 点光源/眼睛最低高度（竖直方向为 z）
const SURFACE_THICK = 0.06 // 反射面金属基底厚度
const GLITTER_Z = SURFACE_THICK / 2 + 0.002 // glitter 发光层 z 微偏移，防 z-fighting
const TRIPOD_LEN = 0.7 // 场景内坐标轴 tripod 轴长
const TRIPOD_GAP = 0.8 // tripod 与反射面边界（-y 方向）的间距

/* ------------------------------------------------------------------ */
/* 着色器：逐 fragment 在世界坐标中计算 f(Q) = (p̂ − q̂)·t̂，|f|≈0 处发光。 */
/* 该层为透明 additive 的纯发光层，叠加在 PBR 金属基底之上；           */
/* 暖金亮线颜色、sparkle 闪烁、线宽抗锯齿与原版逐像素一致。           */
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
uniform vec3 uParallelDir;   // 平行光传播方向 d̂ (z < 0)
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

  // t̂: 沟槽方向（XY 平面内，z 轴竖直）
  vec3 t;
  if (uSurfaceType == 0) {
    t = vec3(cos(uGrooveAngle), sin(uGrooveAngle), 0.0);
  } else {
    float r = length(rel.xy);
    // t̂ = normalize(ẑ × (Q−C)) = normalize(−ry, rx, 0)；Q=C 处退化为 0 → 圆心天然发亮
    t = (r < 1e-4) ? vec3(0.0) : vec3(-rel.y, rel.x, 0.0) / r;
  }

  // 核心发亮条件 f(Q) = (p̂ − q̂)·t̂ = 0
  float f = dot(p - q, t);
  // fwidth 屏幕空间抗锯齿，线宽随距离稳定
  float aa = max(fwidth(f), 1e-7) * 2.0;
  float glow = 1.0 - smoothstep(0.0, aa, abs(f));

  // 暖金亮线 + 高频 sparkle 闪烁（additive 叠加，公式与原版逐像素一致）
  float sp = hash(floor(Q.xy * 140.0) + vec2(floor(uTime * 6.0)));
  float sparkle = 0.75 + 0.25 * sp;
  vec3 glowColor = vec3(1.0, 0.72, 0.35) * 2.5 * glow * sparkle;

  gl_FragColor = vec4(glowColor, 1.0);
}
`

const DEG = Math.PI / 180

/** 全画幅等效焦段 f (mm) → 垂直视场角（度）：fov = 2·atan(12/f) */
const focalToFov = (f: number) => 2 * Math.atan(12 / f) / DEG

/** 径向渐变 glow 纹理（additive 光晕 sprite 用） */
/** 太阳纹理：球核 + 光环 + 细环 + 光芒全部烘焙进一张 canvas 纹理（单一 Sprite，永不分离） */
function makeSunTexture(): THREE.CanvasTexture {
  const S = 256
  const C = S / 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!
  // 外层光晕
  const halo = ctx.createRadialGradient(C, C, 0, C, C, C)
  halo.addColorStop(0, 'rgba(255, 210, 140, 0.55)')
  halo.addColorStop(0.35, 'rgba(255, 180, 100, 0.22)')
  halo.addColorStop(0.7, 'rgba(255, 150, 60, 0.07)')
  halo.addColorStop(1, 'rgba(255, 140, 50, 0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, S, S)
  // 8 根短光芒
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.9)'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(C + Math.cos(a) * S * 0.30, C + Math.sin(a) * S * 0.30)
    ctx.lineTo(C + Math.cos(a) * S * 0.37, C + Math.sin(a) * S * 0.37)
    ctx.stroke()
  }
  // 细环
  ctx.strokeStyle = 'rgba(255, 196, 122, 0.95)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(C, C, S * 0.22, 0, Math.PI * 2)
  ctx.stroke()
  // 球核（亮白到暖金的径向渐变）
  const core = ctx.createRadialGradient(C, C, 0, C, C, S * 0.15)
  core.addColorStop(0, 'rgba(255, 250, 235, 1)')
  core.addColorStop(0.7, 'rgba(255, 214, 150, 1)')
  core.addColorStop(1, 'rgba(255, 184, 92, 0.95)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(C, C, S * 0.15, 0, Math.PI * 2)
  ctx.fill()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 点光源灯泡纹理：发光球核 + 光晕烘焙进一张纹理（单一 Sprite） */
function makeBulbTexture(): THREE.CanvasTexture {
  const S = 128
  const C = S / 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!
  const halo = ctx.createRadialGradient(C, C, 0, C, C, C)
  halo.addColorStop(0, 'rgba(255, 224, 170, 0.85)')
  halo.addColorStop(0.3, 'rgba(255, 190, 110, 0.4)')
  halo.addColorStop(0.65, 'rgba(255, 150, 60, 0.12)')
  halo.addColorStop(1, 'rgba(255, 140, 50, 0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, S, S)
  const core = ctx.createRadialGradient(C, C, 0, C, C, S * 0.16)
  core.addColorStop(0, 'rgba(255, 250, 235, 1)')
  core.addColorStop(1, 'rgba(255, 192, 106, 1)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(C, C, S * 0.16, 0, Math.PI * 2)
  ctx.fill()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 字母标签 Sprite（canvas 纹理） */
function makeLabelSprite(label: string, color: number, scale: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.font = 'bold 44px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`
  ctx.fillText(label, 32, 34)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  sprite.scale.setScalar(scale)
  return sprite
}

/** 中文文字标签 Sprite：自动量宽、深色描边，悬浮于把手上方向用户说明物体身份 */
function makeTextSprite(text: string, scale = 0.42): THREE.Sprite {
  const font = 'bold 30px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + 24
  canvas.width = w // 注意：设置 width 会重置 ctx 状态，下面需重设 font
  canvas.height = 52
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(8, 10, 14, 0.85)'
  ctx.strokeText(text, w / 2, 27)
  ctx.fillStyle = '#d7dee8'
  ctx.fillText(text, w / 2, 27)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.95 }))
  sprite.scale.set(scale * (w / 52), scale, 1)
  return sprite
}

export class GlitterScene {
  private container: HTMLElement
  private insetEl: HTMLElement
  private onDragUpdate: (u: DragUpdate) => void
  private onSelectionChange: ((id: string | null) => void) | null
  /** 反射面的变换模式：平移（默认）/ 旋转（仅拉丝板有意义，松手提交到沟槽角 θ） */
  private transformMode: 'translate' | 'rotate' = 'translate'

  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private mainCam: THREE.PerspectiveCamera
  private eyeCam: THREE.PerspectiveCamera
  private orbit: OrbitControls
  private tc: TransformControls
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private envTex: THREE.Texture
  private bgTex: THREE.CanvasTexture
  private shadowTex: THREE.CanvasTexture
  private contactShadow!: THREE.Mesh
  // 渲染循环复用的临时向量（避免每帧分配，减轻 GC 压力）
  private tmpD = new THREE.Vector3()
  private tmpOff = new THREE.Vector3()
  private tmpA = new THREE.Vector3()
  private tmpB = new THREE.Vector3()

  private params: SimParams
  private surfaceGroup = new THREE.Group() // 平移由拖动控制（= 反射面中心 C）
  private plateGroup = new THREE.Group() // 绕中心 z 轴随沟槽角 θ 旋转
  private diskGroup = new THREE.Group()
  private plateBase!: THREE.Mesh // PBR 金属基底（薄盒体）
  private plateGlitter!: THREE.Mesh // additive glitter 发光层
  private diskBase!: THREE.Mesh
  private diskGlitter!: THREE.Mesh
  private plateBaseMat: THREE.MeshPhysicalMaterial
  private diskBaseMat: THREE.MeshPhysicalMaterial
  private glitterMat: THREE.ShaderMaterial
  private geoKey = ''

  private tripod = new THREE.Group() // 世界坐标轴指示（场景内物体，固定世界朝向）

  private pointLightHandle = new THREE.Group()
  private sunHandle = new THREE.Group()
  private eyeHandle = new THREE.Group()
  private eyeLabel!: THREE.Sprite // 挂在 scene 下而非 eyeHandle 下：eyeHandle 会 lookAt 旋转，标签需保持世界方位
  private eyeCone!: THREE.Mesh
  private sunTex: THREE.CanvasTexture
  private bulbTex: THREE.CanvasTexture
  private sightLine: THREE.Line
  private parallelLines: THREE.LineSegments
  private pointLine: THREE.Line
  private pointLightObj = new THREE.PointLight(0xffc47a, 20, 0, 1.8)

  private raf = 0
  private clock = new THREE.Clock()
  private resizeObs: ResizeObserver
  private disposed = false

  constructor(
    container: HTMLElement,
    insetEl: HTMLElement,
    params: SimParams,
    onDragUpdate: (u: DragUpdate) => void,
    onSelectionChange?: (id: string | null) => void,
  ) {
    this.container = container
    this.insetEl = insetEl
    this.params = params
    this.onDragUpdate = onDragUpdate
    this.onSelectionChange = onSelectionChange ?? null

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.domElement.style.position = 'absolute'
    this.renderer.domElement.style.inset = '0'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    // 背景：垂直暗色渐变（上深灰蓝 → 下近黑），比纯色更有纵深
    this.bgTex = this.makeBackgroundTexture()
    this.scene.background = this.bgTex
    this.scene.fog = new THREE.Fog(0x0b0e13, 18, 42)

    // 环境反射：RoomEnvironment 经 PMREM 作为 IBL，适度强度保留深色氛围
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.scene.environment = this.envTex
    this.scene.environmentIntensity = 0.5

    this.mainCam = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
    this.mainCam.up.set(0, 0, 1) // z 轴竖直
    this.mainCam.position.set(6.2, 7.2, 4.6)
    this.mainCam.layers.enable(1) // 主相机可见 layer 0 + 1（眼睛把手在 layer 1）

    this.eyeCam = new THREE.PerspectiveCamera(focalToFov(params.focalLength), 320 / 208, 0.05, 200)
    this.eyeCam.up.set(0, 0, 1)

    this.orbit = new OrbitControls(this.mainCam, this.renderer.domElement)
    this.orbit.enableDamping = true
    this.orbit.dampingFactor = 0.08
    this.orbit.maxPolarAngle = Math.PI * 0.495
    this.orbit.minDistance = 2
    this.orbit.maxDistance = 30

    // 暗色低存在感网格地面（GridHelper 默认在 XZ 平面，旋转到 XY 平面）
    const grid = new THREE.GridHelper(40, 40, 0x232c3e, 0x151b29)
    grid.rotation.x = Math.PI / 2
    grid.position.z = -0.01
    const gm = grid.material as THREE.Material
    gm.transparent = true
    gm.opacity = 0.45
    this.scene.add(grid)
    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.22))
    // 主光 + 冷色轮廓光：让把手/ tripod / 金属边缘有立体感（不影响 glitter 发光层）
    const keyLight = new THREE.DirectionalLight(0xfff0dd, 0.45)
    keyLight.position.set(4, -3, 6)
    const rimLight = new THREE.DirectionalLight(0x6a86b8, 0.25)
    rimLight.position.set(-5, 4, 2.5)
    this.scene.add(keyLight, rimLight)

    // 反射面接触阴影：软径向渐变"落地影"，跟随反射面中心，增强落地感
    this.shadowTex = this.makeShadowTexture()
    this.contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: 0.62 }),
    )
    this.contactShadow.position.z = -0.005
    this.scene.add(this.contactShadow)

    /* ---------------- 反射面：PBR 金属基底 + additive glitter 发光层 ---------------- */
    this.glitterMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uLightMode: { value: 0 },
        uPointPos: { value: new THREE.Vector3() },
        uParallelDir: { value: new THREE.Vector3(0, 0, -1) },
        uEye: { value: new THREE.Vector3() },
        uCenter: { value: new THREE.Vector3() },
        uSurfaceType: { value: 0 },
        uGrooveAngle: { value: 0 },
        uTime: { value: 0 },
      },
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy()
    this.plateBaseMat = new THREE.MeshPhysicalMaterial({
      map: this.makePlateBrushTexture(maxAniso),
      color: 0xffffff,
      metalness: 0.9,
      roughness: 0.38,
      anisotropy: 0.5,
      envMapIntensity: 1.0,
    })
    this.diskBaseMat = new THREE.MeshPhysicalMaterial({
      map: this.makeDiskBrushTexture(maxAniso),
      color: 0xffffff,
      metalness: 0.9,
      roughness: 0.42,
      envMapIntensity: 1.0,
    })

    // 板：薄盒体基底（带边缘厚度感）+ 顶面 glitter 层（z 微偏移）
    this.plateBase = new THREE.Mesh(new THREE.BoxGeometry(1, 1, SURFACE_THICK), this.plateBaseMat)
    this.plateGlitter = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.glitterMat)
    this.plateGlitter.position.z = GLITTER_Z
    this.plateGroup.add(this.plateBase, this.plateGlitter)
    this.plateGroup.userData.dragId = 'surface'

    // 盘：薄圆柱基底 + 顶面 glitter 层
    this.diskBase = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, SURFACE_THICK, 128).rotateX(Math.PI / 2), this.diskBaseMat)
    this.diskGlitter = new THREE.Mesh(new THREE.CircleGeometry(1, 160), this.glitterMat)
    this.diskGlitter.position.z = GLITTER_Z
    this.diskGroup.add(this.diskBase, this.diskGlitter)
    this.diskGroup.userData.dragId = 'surface'

    this.surfaceGroup.userData.dragId = 'surface'
    this.surfaceGroup.add(this.plateGroup, this.diskGroup)
    this.scene.add(this.surfaceGroup)

    /* ---------------- 场景内世界坐标轴 tripod ---------------- */
    this.buildTripod()
    this.scene.add(this.tripod)

    /* ---------------- 把手 ---------------- */
    this.sunTex = makeSunTexture()
    this.bulbTex = makeBulbTexture()
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
      // 反射面旋转拖动结束时：把累积的 z 旋转提交到沟槽角 θ（仅拉丝板；圆盘各向同性，直接归零）
      if (!e.value && this.tc.object === this.surfaceGroup) {
        const dz = this.surfaceGroup.rotation.z
        this.surfaceGroup.rotation.set(0, 0, 0)
        if (Math.abs(dz) > 1e-4 && this.params.surfaceType === 'plate') {
          let th = (this.params.grooveAngle + dz / DEG) % 180
          if (th < 0) th += 180
          this.onDragUpdate({ grooveAngle: Math.round(th * 10) / 10 })
        }
      }
      // 太阳拖动结束时，把手吸附回以板心为球心、SUN_R 为半径的球面
      if (!e.value && this.tc.object === this.sunHandle) {
        const c = this.surfaceGroup.position
        const s = new THREE.Vector3().subVectors(this.sunHandle.position, c)
        if (s.lengthSq() > 1e-6) {
          s.normalize()
          const el = Math.asin(clamp(s.z, Math.sin(5 * DEG), 1)) / DEG
          let az = Math.atan2(s.y, s.x) / DEG
          if (az < 0) az += 360
          this.positionSun(az, el)
        }
      }
    })
    this.tc.addEventListener('objectChange', () => this.handleObjectChange())
    this.renderer.domElement.addEventListener('pointerdown', this.handlePick)

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(container)
    this.resize()
    this.applyParams()
    this.loop()
  }

  /** 背景垂直渐变纹理（scene.background 用，2px 宽即可横向拉伸） */
  private makeBackgroundTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 0, 512)
    g.addColorStop(0, '#141a26')
    g.addColorStop(0.55, '#0c1017')
    g.addColorStop(1, '#06080c')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 2, 512)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  /** 接触阴影纹理：中心浓、边缘全透明的径向渐变（模拟柔和落地影） */
  private makeShadowTexture(): THREE.CanvasTexture {
    const S = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = S
    const ctx = canvas.getContext('2d')!
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(0, 'rgba(0, 0, 0, 0.85)')
    g.addColorStop(0.55, 'rgba(0, 0, 0, 0.42)')
    g.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    return new THREE.CanvasTexture(canvas)
  }

  /* ---------------- 程序化拉丝纹理（PBR 基底贴图） ---------------- */
  /** 拉丝板：沿沟槽方向（局部 x）的长条纹理，垂直沟槽方向疏密变化 */
  private makePlateBrushTexture(anisotropy: number): THREE.CanvasTexture {
    const S = 512
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = S
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#8f9298'
    ctx.fillRect(0, 0, S, S)
    for (let i = 0; i < 1000; i++) {
      const y = Math.random() * S
      const l = 118 + Math.random() * 76
      ctx.strokeStyle = `rgba(${l | 0}, ${(l + 2) | 0}, ${(l + 7) | 0}, ${0.1 + Math.random() * 0.24})`
      ctx.lineWidth = Math.random() < 0.85 ? 1 : 2
      const x0 = Math.random() * S * 0.4 - S * 0.2
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.lineTo(x0 + S * (0.6 + Math.random() * 0.8), y + (Math.random() - 0.5) * 1.6)
      ctx.stroke()
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = anisotropy
    return tex
  }

  /** 同心圆盘：环形拉丝纹理 */
  private makeDiskBrushTexture(anisotropy: number): THREE.CanvasTexture {
    const S = 512
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = S
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#8b8e94'
    ctx.fillRect(0, 0, S, S)
    for (let r = 1.5; r < S * 0.72; r += 0.8 + Math.random() * 2.2) {
      const l = 112 + Math.random() * 80
      ctx.strokeStyle = `rgba(${l | 0}, ${(l + 2) | 0}, ${(l + 7) | 0}, ${0.1 + Math.random() * 0.26})`
      ctx.lineWidth = Math.random() < 0.8 ? 1 : 2
      ctx.beginPath()
      ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = anisotropy
    return tex
  }

  /* ---------------- 场景内世界坐标轴 tripod：XYZ 三轴 + 锥端 + 字母标签 ---------------- */
  private buildTripod() {
    const axes: Array<{ dir: THREE.Vector3; color: number; label: string }> = [
      { dir: new THREE.Vector3(1, 0, 0), color: 0xc05a52, label: 'X' }, // 低饱和暖红
      { dir: new THREE.Vector3(0, 1, 0), color: 0x6da26d, label: 'Y' }, // 低饱和绿
      { dir: new THREE.Vector3(0, 0, 1), color: 0x5f83c4, label: 'Z' }, // 低饱和蓝
    ]
    const Y = new THREE.Vector3(0, 1, 0)
    for (const { dir, color, label } of axes) {
      const mat = new THREE.MeshBasicMaterial({ color })
      const quat = new THREE.Quaternion().setFromUnitVectors(Y, dir)
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, TRIPOD_LEN, 10), mat)
      shaft.quaternion.copy(quat)
      shaft.position.copy(dir).multiplyScalar(TRIPOD_LEN / 2)
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.11, 12), mat)
      tip.quaternion.copy(quat)
      tip.position.copy(dir).multiplyScalar(TRIPOD_LEN + 0.055)
      const sprite = makeLabelSprite(label, color, 0.2)
      sprite.position.copy(dir).multiplyScalar(TRIPOD_LEN + 0.24)
      this.tripod.add(shaft, tip, sprite)
    }
    // 原点小球
    this.tripod.add(new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 8), new THREE.MeshBasicMaterial({ color: 0x8b93a3 })))
    // tripod 在 layer 0：主视图与观察者视角小窗均可见；朝向固定为世界方向（不挂到反射面下）
  }

  /* ---------------- 把手构建 ---------------- */
  private buildPointLightHandle() {
    // 单一 Sprite：球核 + 光晕烘焙在同一张纹理里，任何情况下都不可能分离
    const bulb = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bulbTex, transparent: true, depthWrite: false }))
    bulb.scale.setScalar(0.8)
    // 注意：子对象绝不能设 dragId —— 否则拾取会附着在子对象上，拖动时只有它被拖走（与把手其余部分分离）
    const label = makeTextSprite('点光源')
    label.position.set(0, 0, 0.42)
    this.pointLightHandle.add(bulb, label)
    this.pointLightHandle.userData.dragId = 'pointLight'
  }

  private buildSunHandle() {
    // 单一 Sprite：球核 + 光环 + 细环 + 光芒烘焙在同一张纹理里，任何情况下都不可能分离
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sunTex, transparent: true, depthWrite: false }))
    sun.scale.setScalar(1.25)
    // 注意：子对象绝不能设 dragId —— 否则拾取会附着在子对象上，拖动时只有它被拖走（与把手其余部分分离）
    const label = makeTextSprite('太阳 · 平行光')
    label.position.set(0, 0, 0.66)
    this.sunHandle.add(sun, label)
    this.sunHandle.userData.dragId = 'sun'
  }

  private buildEyeHandle() {
    // 风格化眼球：眼白 + 虹膜 + 瞳孔 + 高光点，朝向由 lookAt 控制（+z 朝板心）
    const sclera = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.25, metalness: 0.05 }),
    )
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.052, 32), new THREE.MeshStandardMaterial({ color: 0x2e4a66, roughness: 0.3, metalness: 0.2 }))
    iris.position.set(0, 0, 0.117)
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.024, 24), new THREE.MeshBasicMaterial({ color: 0x0a0d12 }))
    pupil.position.set(0, 0, 0.118)
    const highlight = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }))
    highlight.position.set(0.032, 0.03, 0.108)
    this.eyeCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.18, 16),
      new THREE.MeshBasicMaterial({ color: 0x8fa3bf, transparent: true, opacity: 0.85 }),
    )
    this.eyeCone.geometry.rotateX(Math.PI / 2) // 顶点指向 +z，配合 lookAt 指向板心
    this.eyeCone.position.z = 0.22
    this.eyeHandle.add(sclera, iris, pupil, highlight, this.eyeCone)
    this.eyeHandle.up.set(0, 0, 1) // z 轴竖直，lookAt 时保持正确滚转角
    this.eyeHandle.userData.dragId = 'eye'
    // 眼睛把手整体放 layer 1：主相机可见，观察者相机不可见（避免自遮挡）
    this.eyeHandle.traverse((o) => o.layers.set(1))
    // 「观察者」标签：layer 1，位置在 loop 中每帧同步到眼睛上方
    this.eyeLabel = makeTextSprite('观察者')
    this.eyeLabel.layers.set(1)
    this.scene.add(this.eyeLabel)
  }

  /* ---------------- 选中与拖动 ---------------- */
  private handlePick = (ev: PointerEvent) => {
    if (this.tc.dragging) return
    if (this.tc.axis) return // 指针悬停在 gizmo 手柄上：交给 TransformControls，不做重选
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.mainCam)
    this.raycaster.layers.enableAll()
    const targets: THREE.Object3D[] = [this.pointLightHandle, this.sunHandle, this.eyeHandle, this.plateGroup, this.diskGroup]
    const hits = this.raycaster.intersectObjects(targets, true)
    let obj: THREE.Object3D | null = null
    for (const h of hits) {
      // 沿父链向上解析到【最外层】带 dragId 的把手组：
      // 若误附着在子对象上，拖动时只有该子对象被拖走，会出现把手部件相互分离。
      // 同时若链路上任一对象不可见（如当前模式下隐藏的另一光源/反射面），跳过该命中。
      let o: THREE.Object3D | null = h.object
      let resolved: THREE.Object3D | null = null
      let anyInvisible = false
      while (o) {
        if (!o.visible) anyInvisible = true
        if (o.userData.dragId) resolved = o
        o = o.parent
      }
      if (resolved && !anyInvisible) {
        const id = resolved.userData.dragId as string
        // 反射面拖动作用于 surfaceGroup（uniform 中心取自 group 位置）
        obj = id === 'surface' ? this.surfaceGroup : resolved
        break
      }
    }
    if (obj) {
      // 模式跟随选中对象：反射面可用当前模式（平移/旋转），其余把手恒为平移
      const id = obj.userData.dragId as string
      this.tc.setMode(id === 'surface' ? this.transformMode : 'translate')
      this.applyGizmoAxes(id)
      this.tc.attach(obj)
      this.onSelectionChange?.(id)
    } else {
      this.tc.detach()
      this.onSelectionChange?.(null)
    }
  }

  /** 按选中对象裁剪 gizmo 轴：反射面平移只给 XY 箭头（z 锁定）、旋转只给 Z 环（x/y 翻转无意义） */
  private applyGizmoAxes(id: string) {
    if (id === 'surface') {
      const rotating = this.transformMode === 'rotate'
      this.tc.showX = !rotating
      this.tc.showY = !rotating
      this.tc.showZ = rotating
    } else {
      this.tc.showX = this.tc.showY = this.tc.showZ = true
    }
  }

  private handleObjectChange() {
    const obj = this.tc.object
    if (!obj) return
    const id = obj.userData.dragId as string
    const p = obj.position
    const round = (v: number) => Math.round(v * 1000) / 1000

    if (id === 'pointLight') {
      p.z = Math.max(p.z, MIN_Z)
      p.x = clamp(p.x, -8, 8)
      p.y = clamp(p.y, -8, 8)
      this.onDragUpdate({ pointLightPos: { x: round(p.x), y: round(p.y), z: round(p.z) } })
    } else if (id === 'eye') {
      p.z = Math.max(p.z, MIN_Z)
      p.x = clamp(p.x, -8, 8)
      p.y = clamp(p.y, -8, 8)
      this.onDragUpdate({ eyePos: { x: round(p.x), y: round(p.y), z: round(p.z) } })
    } else if (id === 'surface') {
      p.z = 0
      p.x = clamp(p.x, -6, 6)
      p.y = clamp(p.y, -6, 6)
      // 旋转模式下锁定绕 x/y 轴的翻转，只允许绕竖直 z 轴转；z 旋转在松手时提交到 θ
      obj.rotation.x = 0
      obj.rotation.y = 0
      this.onDragUpdate({ centerX: round(p.x), centerY: round(p.y) })
    } else if (id === 'sun') {
      // 拖动中不回拉把手：gizmo 与太阳始终重合，方位角/仰角实时取自当前位置；
      // 松手时才在 dragging-changed 中吸附回球面（此前拖动中吸附会导致 gizmo 与太阳视觉分离）
      const c = this.surfaceGroup.position
      const s = new THREE.Vector3().subVectors(p, c)
      if (s.lengthSq() < 1e-6) return
      s.normalize()
      const el = Math.asin(clamp(s.z, Math.sin(5 * DEG), 1)) / DEG
      let az = Math.atan2(s.y, s.x) / DEG
      if (az < 0) az += 360
      this.onDragUpdate({ azimuth: round(az), elevation: round(el) })
    }
  }

  /* ---------------- 参数 → 场景 ---------------- */
  /** 太阳方向：方位角 az 在 XY 平面内从 +x 起算，仰角 el 相对 XY 平面 */
  private sunDir(azimuthDeg: number, elevationDeg: number) {
    const az = azimuthDeg * DEG
    const el = elevationDeg * DEG
    return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el))
  }

  private positionSun(azimuth: number, elevation: number) {
    const s = this.sunDir(azimuth, elevation)
    this.sunHandle.position.copy(this.surfaceGroup.position).addScaledVector(s, SUN_R)
  }

  setParams(params: SimParams) {
    this.params = params
    this.applyParams()
  }

  /** 切换反射面的变换模式（平移/旋转）。仅在反射面被选中时对 gizmo 生效。 */
  setTransformMode(mode: 'translate' | 'rotate') {
    this.transformMode = mode
    if (this.tc.object === this.surfaceGroup) {
      this.tc.setMode(mode)
      this.applyGizmoAxes('surface')
    }
  }

  private applyParams() {
    const p = this.params
    // 拖动中的物体不回写位置，避免与 TransformControls 打架
    const dragId = this.tc.dragging ? (this.tc.object?.userData.dragId as string | undefined) : undefined

    if (dragId !== 'pointLight') this.pointLightHandle.position.set(p.pointLightPos.x, p.pointLightPos.y, p.pointLightPos.z)
    if (dragId !== 'eye') this.eyeHandle.position.set(p.eyePos.x, p.eyePos.y, p.eyePos.z)
    if (dragId !== 'surface') this.surfaceGroup.position.set(p.centerX, p.centerY, 0)
    if (dragId !== 'sun') this.positionSun(p.azimuth, p.elevation)

    this.pointLightHandle.visible = p.lightMode === 'point'
    this.pointLine.visible = p.lightMode === 'point'
    this.sunHandle.visible = p.lightMode === 'parallel'
    this.parallelLines.visible = p.lightMode === 'parallel'
    this.pointLightObj.visible = p.lightMode === 'point'
    this.pointLightObj.position.copy(this.pointLightHandle.position)

    this.plateGroup.visible = p.surfaceType === 'plate'
    this.diskGroup.visible = p.surfaceType === 'disk'

    // 沟槽角 θ：整块板（含轮廓与 glitter 层）绕自身中心 z 轴旋转，沟槽相对板固定（沿板局部 x）。
    // shader 中 t̂ = (cosθ, sinθ, 0) 与此等价，公式无需变动。圆盘各向同性，不受影响。
    this.plateGroup.rotation.z = p.grooveAngle * DEG

    // 观察者视角等效焦段 → 垂直视场角
    this.eyeCam.fov = focalToFov(p.focalLength)
    this.eyeCam.updateProjectionMatrix()

    // 几何尺寸重建（dispose 旧 geometry）；glitter 面默认即在 XY 平面、法线 +z
    const key = `${p.plateWidth}|${p.plateDepth}|${p.diskRadius}`
    if (key !== this.geoKey) {
      this.geoKey = key
      this.plateBase.geometry.dispose()
      this.plateBase.geometry = new THREE.BoxGeometry(p.plateWidth, p.plateDepth, SURFACE_THICK)
      this.plateGlitter.geometry.dispose()
      this.plateGlitter.geometry = new THREE.PlaneGeometry(p.plateWidth, p.plateDepth)
      this.diskBase.geometry.dispose()
      this.diskBase.geometry = new THREE.CylinderGeometry(p.diskRadius, p.diskRadius, SURFACE_THICK, 128).rotateX(Math.PI / 2)
      this.diskGlitter.geometry.dispose()
      this.diskGlitter.geometry = new THREE.CircleGeometry(p.diskRadius, 160)
    }

    const u = this.glitterMat.uniforms
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
    const u = this.glitterMat.uniforms

    // 平行光方向由太阳把手实时位置定义：d̂ = normalize(C − handle)，保证拖动跟手
    const d = this.tmpD.subVectors(center, this.sunHandle.position)
    if (d.lengthSq() > 1e-8) d.normalize()
    else d.set(0, 0, -1)
    u.uParallelDir.value.copy(d)
    u.uPointPos.value.copy(this.pointLightHandle.position)
    u.uEye.value.copy(eyePos)
    u.uCenter.value.copy(center)
    u.uTime.value = t

    // 坐标轴 tripod 跟随反射面平移（不随板旋转）：置于反射面边界外 -y 方向
    const halfExtent = p.surfaceType === 'plate' ? Math.max(p.plateWidth, p.plateDepth) / 2 : p.diskRadius
    this.tripod.position.set(center.x, center.y - halfExtent - TRIPOD_GAP, 0)

    // 接触阴影跟随反射面（略大于轮廓，板用椭圆比例、盘用圆形）
    if (p.surfaceType === 'plate') {
      this.contactShadow.scale.set(p.plateWidth * 1.35, p.plateDepth * 1.35, 1)
    } else {
      this.contactShadow.scale.setScalar(p.diskRadius * 2.6)
    }
    this.contactShadow.position.set(center.x, center.y, -0.005)

    // 眼睛看向板心 + 视锥指示线
    this.eyeHandle.lookAt(center)
    this.eyeLabel.position.set(eyePos.x, eyePos.y, eyePos.z + 0.36)
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
        // 沟槽平面（XY）内垂直于光方向的水平偏移
        const off = this.tmpOff.set(-d.y, d.x, 0).normalize().multiplyScalar(k * 0.9)
        const a = this.tmpA.copy(center).add(off).addScaledVector(d, -5.5)
        const b = this.tmpB.copy(center).add(off).addScaledVector(d, 1.2)
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
    const C = new THREE.Vector3(p.centerX, p.centerY, 0)
    const E = new THREE.Vector3(p.eyePos.x, p.eyePos.y, p.eyePos.z)
    const L = new THREE.Vector3(p.pointLightPos.x, p.pointLightPos.y, p.pointLightPos.z)
    const d = this.sunDir(p.azimuth, p.elevation).multiplyScalar(-1) // 传播方向

    const fAt = (Q: THREE.Vector3): number => {
      const ph = p.lightMode === 'point' ? Q.clone().sub(L).normalize() : d.clone()
      const qh = E.clone().sub(Q).normalize()
      let th: THREE.Vector3
      if (p.surfaceType === 'plate') {
        const th0 = p.grooveAngle * DEG
        th = new THREE.Vector3(Math.cos(th0), Math.sin(th0), 0)
      } else {
        const rel = Q.clone().sub(C)
        const r = Math.hypot(rel.x, rel.y)
        th = r < 1e-4 ? new THREE.Vector3() : new THREE.Vector3(-rel.y, rel.x, 0).divideScalar(r)
      }
      return ph.sub(qh).dot(th)
    }

    // 镜面反射点 O（平面镜 z=0 反射定律）
    let O: THREE.Vector3
    if (p.lightMode === 'point') {
      const Er = new THREE.Vector3(E.x, E.y, -E.z)
      const s = L.z / (L.z + E.z)
      O = L.clone().addScaledVector(Er.clone().sub(L), s)
    } else {
      const qh = new THREE.Vector3(d.x, d.y, -d.z) // d̂ 经镜面反射后的方向
      const tt = E.z / qh.z
      O = E.clone().addScaledVector(qh, -tt)
    }
    const fO = fAt(O)
    const msgs: string[] = []
    const okO = Math.abs(fO) < 1e-6
    msgs.push(`镜面点 O=(${O.x.toFixed(3)}, ${O.y.toFixed(3)}, 0)，|f(O)|=${Math.abs(fO).toExponential(2)} → ${okO ? '通过：亮线必过镜面点' : '失败'}`)
    if (p.surfaceType === 'disk') {
      const fC = fAt(C)
      msgs.push(`圆心 f(C)=${fC} → ${fC === 0 ? '通过：Q=C 处 t̂ 退化，圆心天然发亮' : '失败'}`)
    }
    if (p.lightMode === 'parallel') {
      msgs.push(`d̂.z=${d.z.toFixed(3)} ${d.z < 0 ? '< 0 → 通过：平行光向下照射' : '→ 失败'}`)
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
      const disposeMat = (m: THREE.Material) => {
        // 材质 dispose 不会自动释放其纹理（标签 Sprite / 接触阴影等的 canvas 纹理），需手动释放
        const mapped = m as THREE.Material & { map?: THREE.Texture | null }
        mapped.map?.dispose()
        m.dispose()
      }
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach(disposeMat)
      else if (mat) disposeMat(mat)
    })
    this.plateBaseMat.map?.dispose()
    this.diskBaseMat.map?.dispose()
    this.sunTex.dispose()
    this.bulbTex.dispose()
    this.bgTex.dispose()
    this.shadowTex.dispose()
    this.envTex.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
