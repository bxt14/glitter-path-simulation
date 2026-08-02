import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { SimParams } from '@/sim/types'
import { GlitterScene } from '@/sim/glitterScene'
import type { DragUpdate } from '@/sim/glitterScene'

interface Props {
  params: SimParams
  insetRef: RefObject<HTMLDivElement | null>
  onDragUpdate: (u: DragUpdate) => void
  sceneRef: RefObject<GlitterScene | null>
}

/** 挂载原生 Three.js 场景（无 StrictMode，useEffect 只跑一次） */
export default function GlitterCanvas({ params, insetRef, onDragUpdate, sceneRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragCbRef = useRef(onDragUpdate)
  dragCbRef.current = onDragUpdate
  const initParamsRef = useRef(params)

  useEffect(() => {
    const container = containerRef.current
    const inset = insetRef.current
    if (!container || !inset) return
    const scene = new GlitterScene(container, inset, initParamsRef.current, (u) => dragCbRef.current(u))
    sceneRef.current = scene
    scene.selfCheck()
    return () => {
      sceneRef.current = null
      scene.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    sceneRef.current?.setParams(params)
  }, [params, sceneRef])

  return <div ref={containerRef} className="absolute inset-0 overflow-hidden" />
}
