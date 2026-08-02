import { useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { BookOpen, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 左下角可折叠教学面板（默认收起） */
export default function InfoPanel() {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="absolute bottom-4 left-4 z-10 w-[380px] max-w-[calc(100%-2rem)]">
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-[#2a3242] bg-[#11151d]/90 text-[#c9d1d9] backdrop-blur hover:border-[#d4a054]/60 hover:text-[#f0d9b0]"
        >
          <BookOpen className="size-3.5" /> 原理说明
          <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-xl border border-[#232a38] bg-[#11151d]/95 p-4 text-[12.5px] leading-relaxed text-[#aeb8c6] shadow-2xl backdrop-blur">
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
            ，沟槽方向即其对称轴。光源低角度时呈明显的 V 形弯曲。
          </li>
          <li>
            <b className="text-[#d6dde8]">同心圆沟槽（金属盘）</b>：沟槽方向处处沿切线，亮线同时过
            <em className="text-[#f0d9b0]">镜面点 O 与圆心 C</em>（圆心处 t̂ 退化，天然发亮）。入射角小时接近一条直径；
            入射角大时分裂为两条弧形，远处观察退化为双曲线——正如黑胶唱片上的光带。
          </li>
        </ul>
        <p className="mt-2 text-[11px] text-[#66707e]">
          本模拟在着色器中对每个像素求解上式，用 fwidth 做屏幕空间抗锯齿，叠加暖金色自发光得到稳定线宽的亮线。
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}
