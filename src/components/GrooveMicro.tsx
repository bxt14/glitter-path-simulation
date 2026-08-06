import { useEffect, useMemo, useRef, useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Pause, Play } from 'lucide-react'

/**
 * 沟槽微观机理示意（2D 剖面）
 * 半圆形沟槽 + 一组以入射角 i 入射的平行光，槽壁上做真实镜面反射追踪（含多次反射，上限 4 次）。
 * 物理约定（已用 numpy 独立验证）：
 *  - 光线按「与 y=0.2R 参考线的交点」均匀采样，避免倾斜时错过槽口；
 *  - 穿过槽底中心 (0,-R) 的光线仅当 i ≤ 45° 时存在（xc0 = -(R+0.2R)·tan i），它沿镜面方向返回；
 *  - 左半槽壁的反射光射向右侧、右半射向左侧（多次交叉反射）；
 *  - 出射锥面轮廓由实际追踪到的出射方向 min/max 角绘制，不使用未经验证的解析公式。
 */

const R = 1
const REF_Y = 0.2
const START_Y = 2.3
const MAX_BOUNCE = 4

interface V2 { x: number; y: number }
interface Bounce { p: V2; kind: 'arc' | 'flat' }
interface RayPath {
  pts: V2[]            // 折线顶点（起点 → 各命中点 → 出射末端）
  exit: V2 | null      // 出射方向（向上离开时有值）
  bounces: Bounce[]
  center: boolean      // 是否穿过槽底中心的高亮光线
}

const v = (x: number, y: number): V2 => ({ x, y })
const sub = (a: V2, b: V2): V2 => v(a.x - b.x, a.y - b.y)
const add = (a: V2, b: V2): V2 => v(a.x + b.x, a.y + b.y)
const mul = (a: V2, s: number): V2 => v(a.x * s, a.y * s)
const dot = (a: V2, b: V2): number => a.x * b.x + a.y * b.y
const len = (a: V2): number => Math.hypot(a.x, a.y)

/** 追踪一条光线：xc 为与 y=REF_Y 参考线交点的 x 坐标 */
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
    let bestKind: 'arc' | 'flat' | null = null
    // 与槽壁圆（下半圆，y ≤ 0）求交
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
    // 与平坦表面 y=0（|x|>R）求交
    if (Math.abs(d.y) > 1e-9) {
      const t = -p.y / d.y
      if (t > 1e-6 && t < bestT) {
        const q = add(p, mul(d, t))
        if (Math.abs(q.x) > R) { bestT = t; bestKind = 'flat' }
      }
    }
    if (bestKind === null) { exit = d; break }

    const q = add(p, mul(d, bestT))
    pts.push(q)
    bounces.push({ p: q, kind: bestKind })
    const n = bestKind === 'arc' ? mul(q, -1 / len(q)) : v(0, 1) // 弧面法线指向圆心
    d = sub(d, mul(n, 2 * dot(d, n)))
    p = add(q, mul(d, 1e-6))
    if (d.y > 1e-6) { // 向上运动，必然离开沟槽
      pts.push(add(p, mul(d, 3)))
      exit = d
      break
    }
  }
  return { pts, exit, bounces, center }
}

/** 光子沿折线定位：s 为弧长坐标，返回位置与切向 */
function pointAlong(pts: V2[], cum: number[], s: number): { pos: V2; seg: number } {
  let seg = 0
  while (seg < cum.length - 2 && cum[seg + 1] < s) seg++
  const t = cum[seg + 1] === cum[seg] ? 0 : (s - cum[seg]) / (cum[seg + 1] - cum[seg])
  return { pos: add(pts[seg], mul(sub(pts[seg + 1], pts[seg]), Math.min(Math.max(t, 0), 1))), seg }
}

const COL_INCIDENT = '#f5c667'   // 入射光（暖金）
const COL_REFLECT = '#8fd0ff'    // 反射/出射光（浅蓝）
const COL_CENTER = '#ffe9b0'     // 槽底中心高亮光

export default function GrooveMicro() {
  const [angleI, setAngleI] = useState(40)
  const [rayCount, setRayCount] = useState(11)
  const [showNormals, setShowNormals] = useState(true)
  const [showCone, setShowCone] = useState(true)
  const [playing, setPlaying] = useState(true)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timeRef = useRef(0)
  const playingRef = useRef(playing)
  playingRef.current = playing

  // 光线束：均匀采样 + 一条穿过槽底中心的高亮光（i ≤ 45° 时才存在）
  const rays = useMemo(() => {
    const list: RayPath[] = []
    for (let k = 0; k < rayCount; k++) {
      const xc = -1.35 + (2.7 * k) / (rayCount - 1)
      list.push(traceRay(xc, angleI))
    }
    if (angleI <= 45) {
      const xc0 = -(R + REF_Y) * Math.tan((angleI * Math.PI) / 180)
      const cr = traceRay(xc0, angleI, true)
      // 物理自检：槽底中心光的首个命中点应贴近 (0,-R)，出射方向应等于镜面反射方向 +i
      const first = cr.bounces[0]?.p
      const ok = first && Math.hypot(first.x, first.y + R) < 1e-6 &&
        cr.exit && Math.abs(Math.atan2(cr.exit.x, cr.exit.y) - (angleI * Math.PI) / 180) < 1e-6
      if (!ok) console.warn('[GrooveMicro] 槽底中心光线自检失败', cr)
      list.push(cr)
    }
    return list
  }, [angleI, rayCount])

  // 出射锥面轮廓：实际出射方向的 min/max 角
  const cone = useMemo(() => {
    const angs = rays.filter((r) => r.exit && r.exit.y > 0).map((r) => Math.atan2(r.exit!.x, r.exit!.y))
    if (angs.length < 2) return null
    return { min: Math.min(...angs), max: Math.max(...angs) }
  }, [rays])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = rect.width
      h = rect.height
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    // 世界坐标：x∈[-2.2,2.2]，y∈[-1.55,1.75]，y 轴向上
    const toScreen = (p: V2): V2 => {
      const s = Math.min(w / 4.6, h / 3.5)
      return v(w / 2 + p.x * s, h * 0.56 - p.y * s)
    }
    const scale = (): number => Math.min(w / 4.6, h / 3.5)

    let raf = 0
    let last = performance.now()

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      if (playingRef.current) timeRef.current += dt
      const tGlob = timeRef.current

      ctx.clearRect(0, 0, w, h)
      const s = scale()

      // ---------- 金属块 ----------
      const tl = toScreen(v(-2.3, 0))
      const br = toScreen(v(2.3, -1.55))
      const metalGrad = ctx.createLinearGradient(0, tl.y, 0, br.y)
      metalGrad.addColorStop(0, '#2c333f')
      metalGrad.addColorStop(0.5, '#20262f')
      metalGrad.addColorStop(1, '#161a21')
      ctx.fillStyle = metalGrad
      ctx.fillRect(0, tl.y, w, br.y - tl.y)
      // 拉丝纹理（水平细线）
      ctx.strokeStyle = 'rgba(255,255,255,0.025)'
      ctx.lineWidth = 1
      for (let y = tl.y + 6; y < br.y; y += 7) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }
      // 表面高亮线
      ctx.strokeStyle = 'rgba(220,230,245,0.35)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(0, tl.y); ctx.lineTo(w, tl.y); ctx.stroke()

      // ---------- 沟槽腔体 ----------
      const c0 = toScreen(v(0, 0))
      const rad = R * s
      ctx.save()
      ctx.beginPath()
      ctx.arc(c0.x, c0.y, rad, 0, Math.PI, false) // 下半圆（屏幕 y 向下）
      ctx.closePath()
      const cavGrad = ctx.createRadialGradient(c0.x, c0.y + rad * 0.4, rad * 0.1, c0.x, c0.y, rad)
      cavGrad.addColorStop(0, '#05070a')
      cavGrad.addColorStop(1, '#0d1117')
      ctx.fillStyle = cavGrad
      ctx.fill()
      // 槽壁
      ctx.strokeStyle = '#7d8794'
      ctx.lineWidth = 2.5
      ctx.stroke()
      ctx.restore()

      // ---------- 出射锥面轮廓 ----------
      if (showCone && cone) {
        const apex = toScreen(v(0, -R))
        const L = 3.2 * s
        const a1 = toScreen(v(3.2 * Math.sin(cone.min), -R + 3.2 * Math.cos(cone.min)))
        const a2 = toScreen(v(3.2 * Math.sin(cone.max), -R + 3.2 * Math.cos(cone.max)))
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(apex.x, apex.y)
        ctx.lineTo(apex.x + (a1.x - apex.x), apex.y + (a1.y - apex.y))
        ctx.lineTo(apex.x + (a2.x - apex.x), apex.y + (a2.y - apex.y))
        ctx.closePath()
        ctx.fillStyle = 'rgba(143,208,255,0.07)'
        ctx.fill()
        ctx.setLineDash([6, 5])
        ctx.strokeStyle = 'rgba(143,208,255,0.45)'
        ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.lineTo(a1.x, a1.y); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.lineTo(a2.x, a2.y); ctx.stroke()
        ctx.setLineDash([])
        // 标注
        const mid = (cone.min + cone.max) / 2
        const lp = toScreen(v(2.55 * Math.sin(mid), -R + 2.55 * Math.cos(mid)))
        ctx.font = `12px ui-sans-serif, system-ui`
        ctx.fillStyle = 'rgba(143,208,255,0.85)'
        ctx.textAlign = 'center'
        ctx.fillText('出射光锥', lp.x, lp.y)
        ctx.restore()
        void L
      }

      // ---------- 光路 ----------
      const firstBounceIdx = 1
      for (const ray of rays) {
        const pts = ray.pts.map(toScreen)
        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        // 入射段
        ctx.strokeStyle = ray.center ? COL_CENTER : COL_INCIDENT
        ctx.globalAlpha = ray.center ? 0.95 : 0.55
        ctx.lineWidth = ray.center ? 3 : 1.6
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[firstBounceIdx]?.x ?? pts[0].x, pts[firstBounceIdx]?.y ?? pts[0].y); ctx.stroke()
        // 反射段
        ctx.strokeStyle = ray.center ? COL_CENTER : COL_REFLECT
        ctx.globalAlpha = ray.center ? 0.95 : 0.6
        ctx.beginPath()
        ctx.moveTo(pts[firstBounceIdx].x, pts[firstBounceIdx].y)
        for (let k = firstBounceIdx + 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y)
        ctx.stroke()
        ctx.restore()

        // 命中点
        for (const b of ray.bounces) {
          const bp = toScreen(b.p)
          ctx.beginPath()
          ctx.arc(bp.x, bp.y, ray.center ? 3.4 : 2.2, 0, Math.PI * 2)
          ctx.fillStyle = ray.center ? COL_CENTER : '#e8eef5'
          ctx.fill()
        }

        // 法线（弧面：指向圆心；平面：竖直向上）
        if (showNormals) {
          ctx.save()
          ctx.setLineDash([3, 4])
          ctx.strokeStyle = 'rgba(180,192,205,0.4)'
          ctx.lineWidth = 1
          for (const b of ray.bounces) {
            const n = b.kind === 'arc' ? mul(b.p, -1 / len(b.p)) : v(0, 1)
            const a = toScreen(b.p)
            const bq = toScreen(add(b.p, mul(n, 0.42)))
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bq.x, bq.y); ctx.stroke()
          }
          ctx.restore()
        }
      }

      // ---------- 光子动画 ----------
      const speed = 1.15 // 世界单位 / 秒
      rays.forEach((ray, idx) => {
        const pts = ray.pts
        const cum: number[] = [0]
        for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + len(sub(pts[k], pts[k - 1])))
        const total = cum[cum.length - 1]
        const cycle = total + 1.1
        const sPos = (tGlob * speed + idx * 0.55) % cycle
        if (sPos > total) return
        const { pos, seg } = pointAlong(pts, cum, sPos)
        const sp = toScreen(pos)
        // 拖尾
        const tail = pointAlong(pts, cum, Math.max(0, sPos - 0.22))
        const tp = toScreen(tail.pos)
        ctx.save()
        ctx.strokeStyle = seg === 0 ? COL_INCIDENT : COL_REFLECT
        ctx.lineWidth = ray.center ? 3.4 : 2.2
        ctx.globalAlpha = 0.9
        ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(tp.x, tp.y); ctx.lineTo(sp.x, sp.y); ctx.stroke()
        // 光点头
        const glow = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 7)
        glow.addColorStop(0, 'rgba(255,244,214,1)')
        glow.addColorStop(0.35, seg === 0 ? 'rgba(245,198,103,0.85)' : 'rgba(143,208,255,0.85)')
        glow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = glow
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      })

      // ---------- 入射角标注（左上角小图） ----------
      {
        const gx = 56
        const gy = 52
        const L = 34
        const iRad = (angleI * Math.PI) / 180
        ctx.save()
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = 'rgba(180,192,205,0.55)'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(gx, gy - L); ctx.lineTo(gx, gy + L); ctx.stroke()
        ctx.setLineDash([])
        // 光线方向 d=(sin i, -cos i)，小图画的是入射光线（朝右下）
        ctx.strokeStyle = COL_INCIDENT
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(gx - L * Math.sin(iRad), gy - L * Math.cos(iRad))
        ctx.lineTo(gx, gy)
        ctx.stroke()
        // 角弧
        ctx.strokeStyle = 'rgba(240,217,176,0.9)'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(gx, gy, L * 0.55, -Math.PI / 2 - iRad, -Math.PI / 2, false)
        ctx.stroke()
        ctx.font = 'italic 13px Georgia, serif'
        ctx.fillStyle = '#f0d9b0'
        ctx.textAlign = 'left'
        ctx.fillText('i', gx + 12, gy - L * 0.32)
        ctx.restore()
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [rays, cone, showNormals, showCone])

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

      {/* 画布 */}
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-[#232a38] bg-[#11151d]/85 px-3 py-2 backdrop-blur md:left-4 md:top-4">
          <h2 className="text-[13px] font-semibold tracking-wide text-[#e6ebf2]">沟槽微观机理示意</h2>
          <p className="mt-0.5 hidden text-[11px] text-[#66707e] md:block">平行光在半圆形沟槽壁上的镜面反射（剖面放大图）</p>
        </div>
      </div>

      {/* 说明条 */}
      <div className="border-t border-[#232a38] bg-[#11151d] px-4 py-2.5 text-[11px] leading-relaxed text-[#8b95a5] md:text-xs">
        <span className="text-[#f0d9b0]">①</span> 射到槽底中心的光线沿正常（镜面）方向原路返回（高亮金色）&ensp;
        <span className="text-[#f0d9b0]">②</span> 射到左半槽壁的光被反射到右侧，右半槽壁的光被反射到左侧，彼此交叉&ensp;
        <span className="text-[#f0d9b0]">③</span> 全部出射光的方向大致张成一个锥面（蓝色轮廓）——宏观亮线的微观来源
      </div>
    </div>
  )
}
