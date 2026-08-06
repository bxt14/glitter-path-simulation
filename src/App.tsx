import { useCallback, useEffect, useRef, useState } from 'react'
import type { SimParams } from '@/sim/types'
import { DEFAULT_PARAMS, cloneParams } from '@/sim/types'
import type { DragUpdate, GlitterScene } from '@/sim/glitterScene'
import GlitterCanvas from '@/components/GlitterCanvas'
import GrooveMicro from '@/components/GrooveMicro'
import ConeFieldViz from '@/components/ConeFieldViz'
import ControlPanel from '@/components/ControlPanel'
import InfoPanel from '@/components/InfoPanel'
import { useIsMobile } from '@/hooks/use-mobile'
import { Move, RotateCw, SlidersHorizontal, X } from 'lucide-react'

export default function App() {
  const [tab, setTab] = useState<'glitter' | 'micro' | 'cones'>('glitter')
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selection, setSelection] = useState<string | null>(null)
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>('translate')
  const isMobile = useIsMobile()
  const insetRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<GlitterScene | null>(null)

  const onChange = useCallback((patch: Partial<SimParams>) => {
    setParams((prev) => ({ ...prev, ...patch }))
  }, [])

  // 3D 拖动 → 滑块双向同步（拖动时 three 已直接移动物体，此处只同步 UI 数值）
  const onDragUpdate = useCallback((u: DragUpdate) => {
    setParams((prev) => ({ ...prev, ...u }))
  }, [])

  const onPreset = useCallback((p: SimParams) => {
    // 预设只改场景构型；亮线分析的两个开关属于视图叠加层，保持用户当前状态不被预设吞掉
    setParams((prev) => ({ ...cloneParams(p), showGlitterPoint: prev.showGlitterPoint, showEyeCone: prev.showEyeCone }))
    // 预设生效后运行一次物理自检（rAF 确保 scene 已拿到新参数）
    requestAnimationFrame(() => sceneRef.current?.selfCheck())
  }, [])

  // 旋转模式仅对拉丝板有意义：切到圆盘或取消选中时回落到平移模式
  useEffect(() => {
    if (params.surfaceType !== 'plate' && transformMode === 'rotate') {
      setTransformMode('translate')
      sceneRef.current?.setTransformMode('translate')
    }
  }, [params.surfaceType, transformMode])

  const onModeSwitch = useCallback((m: 'translate' | 'rotate') => {
    setTransformMode(m)
    sceneRef.current?.setTransformMode(m)
  }, [])

  // 观察者视角小窗尺寸：移动端缩小，避免遮挡场景
  const insetW = isMobile ? 168 : 320
  const insetH = isMobile ? 110 : 208

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#0b0e13] text-[#c9d1d9]">
      {/* 页面最顶上：功能标签栏 */}
      <div className="flex h-11 shrink-0 items-center justify-center gap-1 border-b border-[#232a38] bg-[#0e1219] px-3">
        {([['micro', '沟槽微观机理'], ['cones', '光锥可视化'], ['glitter', '反射亮线模拟']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors ${
              tab === key ? 'bg-[#d4a054]/15 text-[#f0d9b0]' : 'text-[#8b95a5] hover:text-[#e6ebf2]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'micro' ? (
        <main className="min-h-0 flex-1">
          <GrooveMicro />
        </main>
      ) : tab === 'cones' ? (
        <main className="min-h-0 flex-1">
          <ConeFieldViz />
        </main>
      ) : (
      <div className="flex min-h-0 flex-1">
      <main className="relative min-w-0 flex-1">
        <GlitterCanvas params={params} insetRef={insetRef} onDragUpdate={onDragUpdate} sceneRef={sceneRef} onSelectionChange={setSelection} />

        {/* 选中拉丝板时：平移/旋转模式切换（旋转环拖动松手后提交到沟槽角 θ） */}
        {selection === 'surface' && params.surfaceType === 'plate' && (
          <div className="absolute left-1/2 top-16 z-10 flex -translate-x-1/2 overflow-hidden rounded-full border border-[#2a3242] bg-[#11151d]/90 shadow-lg backdrop-blur md:top-4">
            <button
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium transition-colors ${
                transformMode === 'translate' ? 'bg-[#d4a054]/20 text-[#f0d9b0]' : 'text-[#9aa5b4] hover:text-[#e6ebf2]'
              }`}
              onClick={() => onModeSwitch('translate')}
            >
              <Move className="size-3.5" /> 平移
            </button>
            <button
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium transition-colors ${
                transformMode === 'rotate' ? 'bg-[#d4a054]/20 text-[#f0d9b0]' : 'text-[#9aa5b4] hover:text-[#e6ebf2]'
              }`}
              onClick={() => onModeSwitch('rotate')}
            >
              <RotateCw className="size-3.5" /> 旋转
            </button>
          </div>
        )}

        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-[#232a38] bg-[#11151d]/85 px-3 py-2 backdrop-blur md:left-4 md:top-4">
          <h1 className="text-[13px] font-semibold tracking-wide text-[#e6ebf2] md:text-sm">Glitter Path · 沟槽反射亮线模拟</h1>
          <p className="mt-0.5 hidden text-[11px] text-[#66707e] md:block">点击发光体 / 太阳 / 眼睛 / 金属面可选中并拖动 · 空白处拖动旋转视角</p>
        </div>

        <InfoPanel params={params} />

        {/* 移动端：参数面板唤起按钮（底部居中，避开左下教学面板与右下小窗） */}
        <button
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[#2a3242] bg-[#11151d]/90 px-4 py-2 text-xs font-medium text-[#c9d1d9] shadow-lg backdrop-blur transition-colors hover:border-[#d4a054]/60 hover:text-[#f0d9b0] md:hidden"
          onClick={() => setPanelOpen(true)}
        >
          <SlidersHorizontal className="size-3.5" /> 参数调节
        </button>

        {/* 观察者视角小窗：透明视口区，由同一 WebGLRenderer 第二遍 setViewport/setScissor 渲染 */}
        <div className="absolute bottom-4 right-3 z-10 overflow-hidden rounded-xl border border-[#2a3242] shadow-2xl md:right-4">
          <div className="border-b border-[#232a38] bg-[#11151d]/90 px-2.5 py-1 text-[10px] font-medium tracking-wide text-[#9aa5b4] md:px-3 md:py-1.5 md:text-[11px]">
            观察者视角 · {Math.round(params.focalLength)}mm
          </div>
          <div ref={insetRef} style={{ width: insetW, height: insetH }} className="bg-transparent" />
        </div>
      </main>

      {/* 桌面端：右侧固定参数面板 */}
      <aside className="hidden w-[320px] shrink-0 border-l border-[#232a38] bg-[#11151d] md:block">
        <ControlPanel params={params} onChange={onChange} onPreset={onPreset} />
      </aside>

      {/* 移动端：底部抽屉参数面板 + 背景遮罩 */}
      {panelOpen && (
        <>
          <div className="fixed inset-0 z-20 bg-black/55 backdrop-blur-[2px] md:hidden" onClick={() => setPanelOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-30 flex h-[64dvh] flex-col rounded-t-2xl border-t border-[#2a3242] bg-[#11151d] shadow-2xl md:hidden">
            <div className="flex items-center justify-between border-b border-[#232a38] px-4 py-2.5">
              <span className="text-[13px] font-semibold text-[#e6ebf2]">参数调节</span>
              <button
                className="rounded-md p-1.5 text-[#9aa5b4] transition-colors hover:bg-[#1a2130] hover:text-[#e6ebf2]"
                onClick={() => setPanelOpen(false)}
                aria-label="关闭参数面板"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ControlPanel params={params} onChange={onChange} onPreset={onPreset} />
            </div>
          </div>
        </>
      )}
      </div>
      )}
    </div>
  )
}
