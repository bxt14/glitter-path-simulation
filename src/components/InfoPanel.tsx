import { useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { BookOpen, ChevronDown, Activity, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SimParams } from '@/sim/types'

/** 动态解读：根据当前场景参数，用一句话说清"现在发生了什么"（所有断言均经数值验证） */
function liveReadings(p: SimParams): string[] {
  const out: string[] = []
  if (p.lightMode === 'parallel' && p.surfaceType === 'plate') {
    out.push('当前：平行光 × 单向沟槽 → 亮线是双曲线的一支，且必定经过镜面反射点 O。')
  } else if (p.lightMode === 'parallel' && p.surfaceType === 'disk') {
    out.push('当前：平行光 × 同心圆沟槽 → 亮线穿过盘心 C，近似一条直径；眼睛离得越远，它越接近完美的直线。')
  } else if (p.lightMode === 'point' && p.surfaceType === 'plate') {
    out.push('当前：点光源 × 单向沟槽 → 亮线呈弧形（类双曲线），形状随灯的位置明显变化，仍必过镜点 O。')
  } else {
    out.push('当前：点光源 × 同心圆沟槽 → 亮线依然穿过盘心、接近一条直线——这一点和平行光几乎一样，不妨切回去对比。')
  }
  if (p.lightMode === 'parallel' && p.elevation < 20) {
    out.push('光源仰角很低：亮线弯曲更明显（呈 V 形），且容易滑出板面边缘。')
  }
  if (p.eyePos.z < 0.4) {
    out.push('眼睛接近掠射高度：镜面点 O 被推向远处，亮线可能已滑出板面——把眼睛抬高试试。')
  }
  return out
}

/** 引导任务：每条"你会看到"都经过数值模拟验证 */
const TASKS = [
  {
    title: '① 亮线"拴"在镜点上',
    do: '任选光源与反射面，拖动眼睛四处移动。',
    see: '亮线形状不断变形，但始终穿过面上那个镜面反射点 O（若表面是光滑镜子，你只能在那个点看到光源的像）。',
    why: 'O 点满足平面镜反射定律，天然满足亮线条件 f = 0。沟槽把光滑镜面的"一个亮点"摊成"一条亮线"，而 O 始终是这条线的锚点。',
  },
  {
    title: '② 圆盘上的"时针"',
    do: '切到圆盘 + 平行光，眼睛保持不动，拖动太阳改变方位角。',
    see: '亮线始终穿过盘心，像时针一样跟着太阳转。再把眼睛拖远一些看：它更接近一条笔直的直径。',
    why: '圆心处沟槽方向退化，任何方向都满足条件，亮线因此必过盘心；眼睛越远，视线越接近平行光，亮线就越接近理想的笔直直径。',
  },
  {
    title: '③ 会转的线，不动的点',
    do: '切到拉丝板 + 平行光，拖动"沟槽角 θ"滑块（整块板随之旋转）。',
    see: '整条双曲线亮线随板一起转动，但镜面点 O 纹丝不动——亮线像在绕着 O 荡秋千。',
    why: 'O 只由光线方向与眼睛位置决定，与沟槽方向无关；旋转沟槽改变的是亮线扫过板面的方位，而非锚点。',
  },
  {
    title: '④ 把亮线"推"出板面',
    do: '把眼睛压到接近板面的掠射高度（z 调小，或拖眼睛贴近板面）。',
    see: '亮线向远处滑去，最终滑出板面消失。',
    why: '光并没有消失——只是满足反射条件的点已经不在板子上了：镜面点 O 被掠射的视线推到了板外。',
  },
]

/** 左下角可折叠教学面板（默认收起）：原理速览 + 动态解读 + 引导任务 */
export default function InfoPanel({ params }: { params: SimParams }) {
  const [open, setOpen] = useState(false)
  const readings = liveReadings(params)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="absolute bottom-4 left-4 z-10 w-[400px] max-w-[calc(100%-2rem)]">
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-[#2a3242] bg-[#11151d]/90 text-[#c9d1d9] backdrop-blur hover:border-[#d4a054]/60 hover:text-[#f0d9b0]"
        >
          <BookOpen className="size-3.5" /> 原理与探索
          <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 max-h-[62dvh] overflow-y-auto rounded-xl border border-[#232a38] bg-[#11151d]/95 p-4 text-[12.5px] leading-relaxed text-[#aeb8c6] shadow-2xl backdrop-blur">
        {/* 1. 原理速览 */}
        <h4 className="mb-2 text-[13px] font-semibold text-[#e6ebf2]">沟槽反射亮线（Glitter Path）从何而来？</h4>
        <p>
          带沟槽的金属表面可看作无数细长的微镜面。光在沟槽内反射时，
          <em className="font-serif text-[#f0d9b0]">沿沟槽方向的光矢量分量保持不变</em>
          ——反射只翻转垂直于沟槽的分量。因此表面上一点 <i>Q</i> 对观察者发亮的充要条件是
        </p>
        <div className="my-2.5 rounded-lg border border-[#2a3242] bg-[#0d1118] px-3 py-2 text-center font-serif text-[15px] italic text-[#ffb347]">
          f(Q) = ( p̂ − q̂ ) · t̂ = 0
        </div>
        <ul className="list-disc space-y-1.5 pl-4">
          <li>
            <i className="font-serif">p̂</i>：入射光传播方向（点光源时随 <i>Q</i> 变化，平行光时为常矢量）；
            <i className="font-serif">q̂</i>：从 <i>Q</i> 指向眼睛的方向；
            <i className="font-serif">t̂</i>：<i>Q</i> 处的沟槽方向。
          </li>
          <li>
            满足条件的点连成一条曲线，即眼中的<em className="text-[#f0d9b0]">亮线</em>。亮线必过
            <em className="text-[#f0d9b0]">镜面反射点 O</em>（平面镜反射定律给出的像点）。
          </li>
          <li>
            <b className="text-[#d6dde8]">平行沟槽（拉丝板）</b>：亮线是<em className="text-[#f0d9b0]">双曲线的一支</em>
            ——它是"以眼睛为顶点、沟槽方向为轴的圆锥"与板面的交线。光源低角度时呈明显的 V 形弯曲。
          </li>
          <li>
            <b className="text-[#d6dde8]">同心圆沟槽（金属盘）</b>：沟槽处处沿切线方向，亮线同时过
            <em className="text-[#f0d9b0]">镜面点 O 与圆心 C</em>（圆心处 t̂ 退化，天然发亮），始终接近一条过盘心的直线；
            眼睛越近线越微微弯曲，眼睛越远越接近精确直径。某些角度下还能看到另一支弧形亮线——它也是方程的真实解。
          </li>
        </ul>

        {/* 2. 动态解读 */}
        <h4 className="mb-2 mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-[#e6ebf2]">
          <Activity className="size-3.5 text-[#d4a054]" /> 此刻正在发生
        </h4>
        <ul className="list-disc space-y-1.5 pl-4">
          {readings.map((s, i) => (
            <li key={i} className="text-[#c9d1d9]">{s}</li>
          ))}
        </ul>

        {/* 3. 引导任务 */}
        <h4 className="mb-2 mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-[#e6ebf2]">
          <FlaskConical className="size-3.5 text-[#d4a054]" /> 动手试一试
        </h4>
        <div className="space-y-3">
          {TASKS.map((t) => (
            <div key={t.title} className="rounded-lg border border-[#232a38] bg-[#0d1118]/70 p-3">
              <p className="font-medium text-[#e6ebf2]">{t.title}</p>
              <p className="mt-1"><span className="text-[#d4a054]">做一做：</span>{t.do}</p>
              <p className="mt-1"><span className="text-[#d4a054]">你会看到：</span>{t.see}</p>
              <p className="mt-1 text-[#8b95a5]"><span className="text-[#7c8698]">为什么：</span>{t.why}</p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] text-[#66707e]">
          本模拟在着色器中对每个像素求解上式，用 fwidth 做屏幕空间抗锯齿，叠加暖金色自发光得到稳定线宽的亮线。
          面板中所有现象描述均经过数值模拟逐条验证。
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}
