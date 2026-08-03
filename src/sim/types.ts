export type LightMode = 'parallel' | 'point'
export type SurfaceType = 'plate' | 'disk'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface SimParams {
  lightMode: LightMode
  /** 平行光：方位角（度，0-360，XY 平面内从 +x 起算） */
  azimuth: number
  /** 平行光：仰角（度，5-90，相对 XY 平面） */
  elevation: number
  /** 点光源位置（z 为竖直高度，z ≥ 0.15） */
  pointLightPos: Vec3
  surfaceType: SurfaceType
  plateWidth: number
  plateDepth: number
  /** 沟槽角 θ（度，0-180） */
  grooveAngle: number
  diskRadius: number
  /** 观察者位置（z 为竖直高度，z ≥ 0.15） */
  eyePos: Vec3
  /** 观察者视角等效焦段（全画幅 mm，16-135；垂直视场角 fov = 2·atan(12/f)） */
  focalLength: number
  /** 反射面中心（XY 平面，z 恒为 0） */
  centerX: number
  centerY: number
  /** 亮线分析：显示亮线上的可拖动点 + 入射光/沟槽半光锥/反射光 */
  showGlitterPoint: boolean
  /** 亮线分析（仅平行光+拉丝板）：显示由光路可逆从眼睛发出的圆锥，其与板面交线即亮线 */
  showEyeCone: boolean
}

export const DEFAULT_PARAMS: SimParams = {
  lightMode: 'parallel',
  // 首屏构型经数值验证：阳光从板后 (+y) 低角度照来，人在对面 (−y)，
  // 双曲线亮线完整扫过板面且弧度明显（旧默认参数下亮线落在板外，首屏看不到）
  azimuth: 95,
  elevation: 45,
  pointLightPos: { x: -2.5, y: 2.0, z: 4.5 },
  surfaceType: 'plate',
  plateWidth: 4,
  plateDepth: 3,
  grooveAngle: 0,
  diskRadius: 2,
  eyePos: { x: 0.2, y: -2.2, z: 1.7 },
  focalLength: 50,
  centerX: 0,
  centerY: 0,
  showGlitterPoint: false,
  showEyeCone: false,
}

/** 深拷贝参数（嵌套 Vec3 不共享引用，防止预设/DEFAULT_PARAMS 之间串数据） */
export const cloneParams = (p: SimParams): SimParams => ({
  ...p,
  pointLightPos: { ...p.pointLightPos },
  eyePos: { ...p.eyePos },
})

export interface Preset {
  id: string
  label: string
  params: SimParams
}

export const PRESETS: Preset[] = [
  {
    id: 'noon-plate',
    label: '正午阳光·拉丝板',
    params: {
      ...DEFAULT_PARAMS,
      lightMode: 'parallel',
      // 高仰角正午阳光；太阳在 +y 远侧（方位角 90°），眼睛在 −y 近侧，人隔着板面向太阳
      azimuth: 90,
      elevation: 70,
      surfaceType: 'plate',
      grooveAngle: 0,
      eyePos: { x: 0.6, y: -3.0, z: 2.2 },
      focalLength: 50,
    },
  },
  {
    id: 'sunset-plate',
    label: '夕阳·拉丝板',
    params: {
      ...DEFAULT_PARAMS,
      lightMode: 'parallel',
      // 低仰角夕阳；光从 +y 一侧照向 −y 一侧的眼睛，呈 V 形双曲线亮线
      //（参数经数值扫描校准：el=15°、眼睛 −5 时 V 形顶点恰好落在板面内；
      //  旧参数 el=12°/眼睛 −3.8 时整条亮线 missed 板面，预设看不到线）
      azimuth: 90,
      elevation: 15,
      surfaceType: 'plate',
      grooveAngle: 90,
      eyePos: { x: 0.3, y: -5.0, z: 1.7 },
      focalLength: 35,
    },
  },
  {
    id: 'overhead-disk',
    label: '头顶灯·圆盘',
    params: {
      ...DEFAULT_PARAMS,
      lightMode: 'point',
      pointLightPos: { x: 0.0, y: 0.0, z: 5.0 },
      surfaceType: 'disk',
      eyePos: { x: 2.0, y: -3.0, z: 2.0 },
      focalLength: 50,
    },
  },
  {
    id: 'lowlamp-disk',
    label: '低角度灯·圆盘',
    params: {
      ...DEFAULT_PARAMS,
      lightMode: 'point',
      // 低角度点光源在盘 +y 一侧，眼睛在 −y 对侧，人隔着盘面向灯
      pointLightPos: { x: 0.0, y: 4.5, z: 0.8 },
      surfaceType: 'disk',
      eyePos: { x: 0.0, y: -4.0, z: 1.8 },
      focalLength: 50,
    },
  },
]

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
