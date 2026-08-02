import { useCallback, useRef, useState } from 'react'
import type { SimParams } from '@/sim/types'
import { DEFAULT_PARAMS } from '@/sim/types'
import type { DragUpdate, GlitterScene } from '@/sim/glitterScene'
import GlitterCanvas from '@/components/GlitterCanvas'
import ControlPanel from '@/components/ControlPanel'
import InfoPanel from '@/components/InfoPanel'

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS)
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
    setParams({ ...p, pointLightPos: { ...p.pointLightPos }, eyePos: { ...p.eyePos } })
    // 预设生效后运行一次物理自检（rAF 确保 scene 已拿到新参数）
    requestAnimationFrame(() => sceneRef.current?.selfCheck())
  }, [])

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#0b0e13] text-[#c9d1d9]">
      <main className="relative min-w-0 flex-1">
        <GlitterCanvas params={params} insetRef={insetRef} onDragUpdate={onDragUpdate} sceneRef={sceneRef} />

        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-lg border border-[#232a38] bg-[#11151d]/85 px-3 py-2 backdrop-blur">
          <h1 className="text-sm font-semibold tracking-wide text-[#e6ebf2]">Glitter Path · 沟槽反射亮线模拟</h1>
          <p className="mt-0.5 text-[11px] text-[#66707e]">点击发光体 / 太阳 / 眼睛 / 金属面可选中并拖动 · 空白处拖动旋转视角</p>
        </div>

        <InfoPanel params={params} />

        {/* 观察者视角小窗：透明视口区，由同一 WebGLRenderer 第二遍 setViewport/setScissor 渲染 */}
        <div className="absolute bottom-4 right-4 z-10 overflow-hidden rounded-xl border border-[#2a3242] shadow-2xl">
          <div className="border-b border-[#232a38] bg-[#11151d]/90 px-3 py-1.5 text-[11px] font-medium tracking-wide text-[#9aa5b4]">
            观察者视角 · {Math.round(params.focalLength)}mm
          </div>
          <div ref={insetRef} style={{ width: 320, height: 208 }} className="bg-transparent" />
        </div>
      </main>

      <aside className="w-[320px] shrink-0 border-l border-[#232a38] bg-[#11151d]">
        <ControlPanel params={params} onChange={onChange} onPreset={onPreset} />
      </aside>
    </div>
  )
}
