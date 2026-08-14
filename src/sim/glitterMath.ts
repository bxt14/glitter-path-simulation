/**
 * 亮线数学（纯函数、零堆分配版本）
 * 与 glitterScene.ts 中 GLSL shader 的 f(Q) 是同一公式的 CPU 复现：
 *   f(Q) = (p̂ − q̂)·t̂ = 0   ⟺   q̂·t̂ = p̂·t̂
 * selfCheck / updateGlitterPoint / 投影迭代统一使用这里的实现，避免多份副本漂移。
 */
import type { SimParams } from './types'

const DEG = Math.PI / 180

/** 观察者的有效位置：平行光模式下 eyePos + h·r̂，r̂ 为入射光的镜面反射方向（水平分量不变、z 翻转） */
export function effEye(p: { eyePos: { x: number; y: number; z: number }; lightMode: string; azimuth: number; elevation: number; specularH: number }) {
  if (p.lightMode !== 'parallel' || !p.specularH) return p.eyePos
  const az = p.azimuth * DEG
  const el = p.elevation * DEG
  const rx = -Math.cos(el) * Math.cos(az)
  const ry = -Math.cos(el) * Math.sin(az)
  const rz = Math.sin(el)
  return {
    x: p.eyePos.x + p.specularH * rx,
    y: p.eyePos.y + p.specularH * ry,
    z: p.eyePos.z + p.specularH * rz,
  }
}

/** 与着色器一致的 f(Q)（Q 在 z=0 平面上；零分配，全部为标量运算） */
export function fAt(p: SimParams, qx: number, qy: number, qz = 0): number {
  // p̂：入射光传播方向
  let px: number
  let py: number
  if (p.lightMode === 'point') {
    px = qx - p.pointLightPos.x
    py = qy - p.pointLightPos.y
    const pz = qz - p.pointLightPos.z
    const n = Math.hypot(px, py, pz) || 1
    px /= n
    py /= n
  } else {
    const az = p.azimuth * DEG
    const el = p.elevation * DEG
    px = -Math.cos(el) * Math.cos(az)
    py = -Math.cos(el) * Math.sin(az)
  }
  // q̂：指向眼睛方向
  const E = effEye(p)
  const ex = E.x - qx
  const ey = E.y - qy
  const ez = E.z - qz
  const en = Math.hypot(ex, ey, ez) || 1
  // t̂：沟槽方向（XY 平面内）
  let tx = 0
  let ty = 0
  if (p.surfaceType === 'plate') {
    const a = p.grooveAngle * DEG
    tx = Math.cos(a)
    ty = Math.sin(a)
  } else {
    const rx = qx - p.centerX
    const ry = qy - p.centerY
    const r = Math.hypot(rx, ry)
    if (r >= 1e-4) {
      tx = -ry / r
      ty = rx / r
    }
  }
  return (px - ex / en) * tx + (py - ey / en) * ty
}

/** Q 是否落在反射面范围内（板按沟槽角旋转后的局部矩形判定） */
export function inSurfaceBounds(p: SimParams, qx: number, qy: number): boolean {
  if (p.infiniteSurface) return true
  const dx = qx - p.centerX
  const dy = qy - p.centerY
  if (p.surfaceType === 'disk') return Math.hypot(dx, dy) <= p.diskRadius + 1e-6
  const a = p.grooveAngle * DEG
  const lx = dx * Math.cos(a) + dy * Math.sin(a)
  const ly = -dx * Math.sin(a) + dy * Math.cos(a)
  return Math.abs(lx) <= p.plateWidth / 2 + 1e-6 && Math.abs(ly) <= p.plateDepth / 2 + 1e-6
}

/**
 * 把目标点 (Tx,Ty) 投影到亮线 f=0 上：牛顿迭代压到零线 + 沿切线逼近目标；
 * 从 (guessX, guessY) 出发保证分支连续。结果写入 out，成功返回 true。
 */
export function projectToGlitter(
  p: SimParams,
  Tx: number,
  Ty: number,
  guessX: number,
  guessY: number,
  out: { x: number; y: number },
): boolean {
  let qx = guessX
  let qy = guessY
  const h = 1e-3
  for (let i = 0; i < 30; i++) {
    const f = fAt(p, qx, qy)
    const gx = (fAt(p, qx + h, qy) - f) / h
    const gy = (fAt(p, qx, qy + h) - f) / h
    const n2 = gx * gx + gy * gy
    if (n2 < 1e-12) break
    qx -= (gx * f) / n2
    qy -= (gy * f) / n2
    // 沿切线朝目标点滑动（切向 = (−gy, gx)）
    const s = (((Tx - qx) * -gy + (Ty - qy) * gx) / n2) * 0.6
    qx += -gy * s
    qy += gx * s
  }
  if (Math.abs(fAt(p, qx, qy)) < 1e-5 && inSurfaceBounds(p, qx, qy)) {
    out.x = qx
    out.y = qy
    return true
  }
  return false
}

/** 开关打开时的初始点：优先镜面反射点 O（必在亮线上）；否则粗采样找零线最近点再精化 */
export function findInitialGlitterPoint(p: SimParams, out: { x: number; y: number }): boolean {
  // O：镜面反射点（z=0 平面镜反射定律）
  let ox: number
  let oy: number
  if (p.lightMode === 'point') {
    const E0 = effEye(p)
    const s = p.pointLightPos.z / (p.pointLightPos.z + E0.z)
    ox = p.pointLightPos.x + (E0.x - p.pointLightPos.x) * s
    oy = p.pointLightPos.y + (E0.y - p.pointLightPos.y) * s
  } else {
    const az = p.azimuth * DEG
    const el = p.elevation * DEG
    const dx = -Math.cos(el) * Math.cos(az) // 传播方向 d̂
    const dy = -Math.cos(el) * Math.sin(az)
    const dz = -Math.sin(el)
    const E0 = effEye(p)
    const t = Math.abs(dz) < 1e-8 ? 0 : E0.z / -dz
    ox = E0.x + dx * t
    oy = E0.y + dy * t
  }
  if (inSurfaceBounds(p, ox, oy) && Math.abs(fAt(p, ox, oy)) < 1e-6) {
    out.x = ox
    out.y = oy
    return true
  }
  // 粗采样：面上网格找 |f| 最小点作为初值
  const ext = p.infiniteSurface ? 8 : p.surfaceType === 'disk' ? p.diskRadius : Math.max(p.plateWidth, p.plateDepth) / 2
  let bestX = 0
  let bestY = 0
  let bestAbs = Infinity
  const N = 50
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const qx = p.centerX - ext + (2 * ext * i) / N
      const qy = p.centerY - ext + (2 * ext * j) / N
      if (!inSurfaceBounds(p, qx, qy)) continue
      const a = Math.abs(fAt(p, qx, qy))
      if (a < bestAbs) {
        bestAbs = a
        bestX = qx
        bestY = qy
      }
    }
  }
  if (!Number.isFinite(bestAbs)) return false
  return projectToGlitter(p, bestX, bestY, bestX, bestY, out)
}
