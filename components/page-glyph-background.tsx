"use client"

import * as React from "react"
import { GlyphBackground } from "@/components/ui/backgrounds-glyph"

/**
 * Pins the glyph field behind the whole page. The page content sits on top of
 * it, so pointer moves and clicks anywhere are forwarded to the background:
 * the trail follows the cursor and clicks still send out a wave.
 */
export function PageGlyphBackground() {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const forwarded = new WeakSet<Event>()
    const forward = (e: PointerEvent) => {
      const el = ref.current
      if (!el || forwarded.has(e)) return
      const copy = new PointerEvent(e.type, {
        bubbles: true,
        clientX: e.clientX,
        clientY: e.clientY,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
      })
      forwarded.add(copy)
      el.dispatchEvent(copy)
    }
    window.addEventListener("pointermove", forward, { passive: true })
    window.addEventListener("pointerdown", forward, { passive: true })
    return () => {
      window.removeEventListener("pointermove", forward)
      window.removeEventListener("pointerdown", forward)
    }
  }, [])

  return (
    <GlyphBackground
      ref={ref}
      aria-hidden="true"
      glowColor="#0a0a0a"
      shapeColor="#0a0a0a"
      className="pointer-events-none fixed inset-0 z-0 h-screen w-screen"
    />
  )
}
