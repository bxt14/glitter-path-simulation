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
  /** 反射面中心（XY 平面，z 恒为 0） */
  centerX: number
  centerY: number
}

export const DEFAULT_PARAMS: SimParams = {
  lightMode: 'parallel',
  azimuth: 60,
  elevation: 55,
  pointLightPos: { x: -2.5, y: 2.0, z: 4.5 },
  surfaceType: 'plate',
  plateWidth: 4,
  plateDepth: 3,
  grooveAngle: 0,
  diskRadius: 2,
  eyePos: { x: 2.5, y: 3.5, z: 2.0 },
  centerX: 0,
  centerY: 0,
}

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
      azimuth: 120,
      elevation: 82,
      surfaceType: 'plate',
      grooveAngle: 0,
      eyePos: { x: 2.2, y: 3.2, z: 2.4 },
    },
  },
  {
    id: 'sunset-plate',
    label: '夕阳·拉丝板',
    params: {
      ...DEFAULT_PARAMS,
      lightMode: 'parallel',
      azimuth: 40,
      elevation: 14,
      surfaceType: 'plate',
      grooveAngle: 90,
      eyePos: { x: 0.4, y: 3.8, z: 1.8 },
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
      eyePos: { x: 2.0, y: 3.0, z: 2.0 },
    },
  },
  {
    id: 'lowlamp-disk',
    label: '低角度灯·圆盘',
    params: {
      ...DEFAULT_PARAMS,
      lightMode: 'point',
      pointLightPos: { x: 4.0, y: 1.5, z: 0.7 },
      surfaceType: 'disk',
      eyePos: { x: 2.5, y: 3.0, z: 1.6 },
    },
  },
]

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
