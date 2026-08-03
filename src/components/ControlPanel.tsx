import type { SimParams } from '@/sim/types'
import { PRESETS, DEFAULT_PARAMS, clamp } from '@/sim/types'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { RotateCcw, Sun, Lightbulb, Eye, Square, Disc, Sparkles } from 'lucide-react'

interface Props {
  params: SimParams
  onChange: (patch: Partial<SimParams>) => void
  onPreset: (p: SimParams) => void
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (v: number) => void
}) {
  // 显示精度跟随步进：step 1 → 整数；step 0.1 → 一位小数；step 0.05 → 两位小数
  const decimals = step >= 1 ? 0 : (String(step).split('.')[1]?.length ?? 0)
  return (
    <div className="group space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#9aa5b4] transition-colors group-hover:text-[#d6dde8]">{label}</span>
        <span className="font-mono text-[#d4a054]">
          {value.toFixed(decimals)}
          {unit ?? ''}
        </span>
      </div>
      <div className="slider-amber">
        <Slider min={min} max={max} step={step} value={[clamp(value, min, max)]} onValueChange={(v) => onChange(v[0])} />
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-[#e6ebf2]">
      <span className="inline-block h-3 w-[3px] rounded-full bg-[#d4a054]/80" />
      {children}
    </h3>
  )
}

export default function ControlPanel({ params, onChange, onPreset }: Props) {
  const p = params
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      {/* 光源 */}
      <section className="space-y-3">
        <SectionTitle>光源</SectionTitle>
        <Tabs value={p.lightMode} onValueChange={(v) => onChange({ lightMode: v as SimParams['lightMode'] })}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="parallel" className="gap-1.5">
              <Sun className="size-3.5" /> 平行光
            </TabsTrigger>
            <TabsTrigger value="point" className="gap-1.5">
              <Lightbulb className="size-3.5" /> 点光源
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {p.lightMode === 'parallel' ? (
          <div className="space-y-3">
            <SliderRow label="方位角" value={p.azimuth} min={0} max={360} step={1} unit="°" onChange={(v) => onChange({ azimuth: v })} />
            <SliderRow label="仰角" value={p.elevation} min={5} max={90} step={1} unit="°" onChange={(v) => onChange({ elevation: v })} />
            <p className="text-[11px] leading-relaxed text-[#66707e]">提示：可拖动场景边缘的太阳把手改变光照方向。</p>
          </div>
        ) : (
          <div className="space-y-3">
            <SliderRow label="光源 X" value={p.pointLightPos.x} min={-8} max={8} step={0.1} onChange={(v) => onChange({ pointLightPos: { ...p.pointLightPos, x: v } })} />
            <SliderRow label="光源 Y" value={p.pointLightPos.y} min={-8} max={8} step={0.1} onChange={(v) => onChange({ pointLightPos: { ...p.pointLightPos, y: v } })} />
            <SliderRow label="光源 Z（高度）" value={p.pointLightPos.z} min={0.15} max={8} step={0.05} onChange={(v) => onChange({ pointLightPos: { ...p.pointLightPos, z: v } })} />
          </div>
        )}
      </section>

      <Separator className="bg-[#232a38]" />

      {/* 反射面 */}
      <section className="space-y-3">
        <SectionTitle>反射面</SectionTitle>
        <Tabs value={p.surfaceType} onValueChange={(v) => onChange({ surfaceType: v as SimParams['surfaceType'] })}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="plate" className="gap-1.5">
              <Square className="size-3.5" /> 拉丝金属板
            </TabsTrigger>
            <TabsTrigger value="disk" className="gap-1.5">
              <Disc className="size-3.5" /> 同心圆金属盘
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {p.surfaceType === 'plate' ? (
          <div className="space-y-3">
            <SliderRow label="宽度" value={p.plateWidth} min={1} max={8} step={0.1} onChange={(v) => onChange({ plateWidth: v })} />
            <SliderRow label="深度" value={p.plateDepth} min={1} max={8} step={0.1} onChange={(v) => onChange({ plateDepth: v })} />
            <SliderRow label="沟槽角 θ" value={p.grooveAngle} min={0} max={180} step={1} unit="°" onChange={(v) => onChange({ grooveAngle: v })} />
          </div>
        ) : (
          <SliderRow label="半径" value={p.diskRadius} min={0.5} max={10} step={0.05} onChange={(v) => onChange({ diskRadius: v })} />
        )}
        <p className="font-mono text-[11px] text-[#66707e]">
          板心 C = ({p.centerX.toFixed(2)}, {p.centerY.toFixed(2)}, 0) · 可拖动面板移动
        </p>
      </section>

      <Separator className="bg-[#232a38]" />

      {/* 观察者 */}
      <section className="space-y-3">
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <Eye className="size-3.5" /> 观察者
          </span>
        </SectionTitle>
        <div className="space-y-3">
          <SliderRow label="眼睛 X" value={p.eyePos.x} min={-8} max={8} step={0.1} onChange={(v) => onChange({ eyePos: { ...p.eyePos, x: v } })} />
          <SliderRow label="眼睛 Y" value={p.eyePos.y} min={-8} max={8} step={0.1} onChange={(v) => onChange({ eyePos: { ...p.eyePos, y: v } })} />
          <SliderRow label="眼睛 Z（高度）" value={p.eyePos.z} min={0.15} max={8} step={0.05} onChange={(v) => onChange({ eyePos: { ...p.eyePos, z: v } })} />
          <SliderRow label="等效焦段" value={p.focalLength} min={16} max={135} step={1} unit="mm" onChange={(v) => onChange({ focalLength: v })} />
          <div className="flex gap-1.5">
            {[24, 35, 50, 85].map((f) => (
              <Button
                key={f}
                variant="outline"
                size="sm"
                className={`h-6 flex-1 px-1 text-[10px] ${
                  Math.round(p.focalLength) === f
                    ? 'border-[#d4a054]/70 bg-[#d4a054]/15 text-[#f0d9b0]'
                    : 'border-[#2a3242] bg-[#141925] text-[#9aa5b4] hover:border-[#d4a054]/50 hover:text-[#f0d9b0]'
                }`}
                onClick={() => onChange({ focalLength: f })}
              >
                {f}mm
              </Button>
            ))}
          </div>
        </div>
      </section>

      <Separator className="bg-[#232a38]" />

      {/* 亮线分析 */}
      <section className="space-y-3">
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3.5" /> 亮线分析
          </span>
        </SectionTitle>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#9aa5b4]">显示亮线上的一点</span>
          <Switch checked={p.showGlitterPoint} onCheckedChange={(v) => onChange({ showGlitterPoint: v })} />
        </div>
        {p.showGlitterPoint && (
          <p className="text-[11px] leading-relaxed text-[#66707e]">
            拖动亮线上的点：同步显示该点的入射光、沟槽反射半光锥（锥面扫过眼睛）与射向眼睛的反射光。
          </p>
        )}
      </section>

      <Separator className="bg-[#232a38]" />

      {/* 预设场景 */}
      <section className="space-y-3">
        <SectionTitle>预设场景</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="outline"
              size="sm"
              className="h-auto whitespace-normal border-[#2a3242] bg-[#141925] px-2 py-2 text-[11px] leading-tight text-[#c9d1d9] hover:border-[#d4a054]/60 hover:bg-[#1a2130] hover:text-[#f0d9b0]"
              onClick={() => onPreset(preset.params)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </section>

      <Button
        variant="ghost"
        size="sm"
        className="mt-auto w-full text-[#9aa5b4] hover:bg-[#1a2130] hover:text-[#e6ebf2]"
        onClick={() => onPreset({ ...DEFAULT_PARAMS, pointLightPos: { ...DEFAULT_PARAMS.pointLightPos }, eyePos: { ...DEFAULT_PARAMS.eyePos } })}
      >
        <RotateCcw className="size-3.5" /> 重置全部参数
      </Button>
    </div>
  )
}
