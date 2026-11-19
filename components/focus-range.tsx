"use client"

// A data-driven take on the Ridgeline Dither Footer: each ridge is a day of your
// log, its crest the share of every hour you spent focused. Your average day is
// the front ridge; recent days recede behind it into the mist. Hover reads the
// hour under the pointer, click blows the mist aside.

import * as React from "react"
import {
  RDF_BAYER,
  rdfDither,
  rdfEase,
  rdfFbm,
  rdfHash,
  rdfHex,
  rdfNoise,
  rdfPack,
  rdfSmooth,
} from "@/components/ui/ridgeline-dither-footer"
import { time12 } from "@/lib/tracker"

export interface RangeLayer {
  label: string
  /** 24 values, 0–1. null draws a decorative ridge with no readout. */
  profile: number[] | null
}

export interface FocusRangeProps {
  layers: RangeLayer[]
  tones: string[]
  /** Starts the develop-in animation. */
  revealed: boolean
  className?: string
  children?: React.ReactNode
  "aria-label"?: string
}

const PIXEL = 2
const SEED = 7

function sampleProfile(profile: number[], u: number) {
  const hp = u * 24 - 0.5
  const i0 = Math.floor(hp)
  const f = hp - i0
  const a = profile[Math.max(0, Math.min(23, i0))]
  const b = profile[Math.max(0, Math.min(23, i0 + 1))]
  return a + (b - a) * ((1 - Math.cos(f * Math.PI)) / 2)
}

export function FocusRange({ layers, tones, revealed, className, children, ...rest }: FocusRangeProps) {
  const sceneRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const altRef = React.useRef<HTMLDivElement>(null)
  const altTextRef = React.useRef<HTMLSpanElement>(null)
  const revealAt = React.useRef<number | null>(null)
  const layersRef = React.useRef(layers)
  layersRef.current = layers

  React.useEffect(() => {
    if (revealed && revealAt.current === null) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      revealAt.current = reduced ? -Infinity : performance.now()
    }
  }, [revealed])

  const key = JSON.stringify(layers) + "|" + tones.join(",")

  React.useEffect(() => {
    const scene = sceneRef.current
    const canvas = canvasRef.current
    if (!scene || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const pal = new Uint32Array(tones.map((t) => rdfPack(rdfHex(t) || [128, 128, 128])))
    const nT = pal.length
    const L = layersRef.current

    let cols = 1
    let rows = 1
    let margin = 2
    let img: ImageData | null = null
    let buf = new Uint32Array(0)
    let tops: Float32Array[] = []
    let vals: Float32Array[] = []
    let pools: Float32Array[] = []
    let colTop = new Float32Array(0)
    let colSlope = new Float32Array(0)
    let colPool = new Float32Array(0)
    let fog = new Float32Array(0)
    let fw = 1
    let fh = 1
    let fadeTo = 1
    let raf = 0
    let visible = true
    let awake = true
    let lastDraw = 0
    let lastTick = performance.now()
    let tx = 0, ty = 0, ex = 0, ey = 0
    let inside = false
    let clear = 0
    let pt = 0, pe = 0
    let windV = 0, windX = 0
    let altShown = false
    let altLabel = ""

    const layout = () => {
      const rect = scene.getBoundingClientRect()
      cols = Math.max(8, Math.ceil(rect.width / PIXEL))
      rows = Math.max(8, Math.ceil(rect.height / PIXEL))
      canvas.width = cols
      canvas.height = rows
      canvas.style.width = cols * PIXEL + "px"
      canvas.style.height = rows * PIXEL + "px"
      img = ctx.createImageData(cols, rows)
      buf = new Uint32Array(img.data.buffer)
      margin = Math.ceil(cols * 0.045) + 3
      const ceil = Math.max(rows * 0.17, 92 / PIXEL)
      fadeTo = Math.max(rows * 0.3, 128 / PIXEL)
      const n = cols + margin * 2
      tops = []
      vals = []
      pools = []
      L.forEach((layer, i) => {
        const k = L.length > 1 ? i / (L.length - 1) : 1
        const base = rows * (0.42 + 0.55 * Math.pow(k, 1.3))
        const amp = rows * (0.16 + 0.5 * k)
        const freq = 6 - 3.8 * k
        const s = SEED * 13 + i * 101
        const t = new Float32Array(n)
        const v = new Float32Array(n)
        const pool = new Float32Array(n)
        for (let x = 0; x < n; x++) {
          const u = (x - margin) / cols
          const uc = u < 0 ? 0 : u > 1 ? 1 : u
          const r1 = 1 - Math.abs(rdfNoise(u * freq + i * 3.7, 0.5, s) * 2 - 1)
          const r2 = 1 - Math.abs(rdfNoise(u * freq * 2.3, 3.5, s + 1) * 2 - 1)
          const f = rdfFbm(u * freq * 4.1, 9.5, s + 2, 3)
          let h: number
          if (layer.profile) {
            v[x] = sampleProfile(layer.profile, uc)
            h = 0.04 + 0.82 * v[x] + 0.09 * r1 * r1 + 0.05 * f
          } else {
            v[x] = -1
            h = (r1 * r1 * 0.62 + r2 * 0.24 + f * 0.14) * 0.7
          }
          let y = base - h * amp
          if (y < ceil) y = ceil - (ceil - y) * 0.2
          t[x] = y
          pool[x] = 0.45 + 1.1 * rdfFbm(((x - margin) / cols) * 4, i * 5.3, SEED + 9, 2)
        }
        tops.push(t)
        vals.push(v)
        pools.push(pool)
      })
      colTop = new Float32Array(L.length * cols)
      colSlope = new Float32Array(L.length * cols)
      colPool = new Float32Array(L.length * cols)
      fw = (cols >> 1) + 2
      fh = (rows >> 1) + 2
      fog = new Float32Array(fw * fh)
      awake = true
    }

    const draw = (now: number) => {
      if (!img) return
      const layersN = L.length
      const dt = Math.min(64, now - lastTick)
      lastTick = now
      const age = revealAt.current === null ? -1 : now - revealAt.current
      const e1 = 1 - Math.pow(0.82, dt / 16.7)
      const e2 = 1 - Math.pow(0.93, dt / 16.7)
      ex += (tx - ex) * e1
      ey += (ty - ey) * e1
      clear += ((inside ? 1 : 0) - clear) * e2
      pe += ((reduced ? 0 : pt) - pe) * e2
      windV *= Math.pow(0.965, dt / 16.7)
      windX += (windV * dt) / 1000
      const fogT = (reduced ? 0 : (now / 1000) * 0.045) + windX

      const sx = 9 / cols
      const sy = 4.4 / rows
      for (let gy = 0; gy < fh; gy++) {
        const ny = gy * sy
        for (let gx = 0; gx < fw; gx++) {
          const nx = gx * sx + fogT
          const warp = rdfNoise(nx * 0.45 - fogT * 0.6, ny * 0.8, 77) * 0.6
          fog[gy * fw + gx] = rdfSmooth(0.3, 0.74, rdfFbm(nx + warp, ny + warp * 0.4, 31, 3))
        }
      }

      const rev = new Float32Array(layersN)
      const k = new Float32Array(layersN)
      const tb = new Float32Array(layersN)
      const shifts = new Int32Array(layersN)
      for (let i = 0; i < layersN; i++) {
        k[i] = layersN > 1 ? i / (layersN - 1) : 1
        rev[i] = age < 0 ? 0 : rdfEase((age - 380 - i * 170) / 1300)
        tb[i] = 0.16 + 0.76 * Math.pow(k[i], 1.6)
        const depth = rows * (0.08 + 0.42 * k[i])
        const rise = (1 - rev[i]) * rows * 0.09
        shifts[i] = Math.round(pe * (0.25 + k[i]) * 0.75 * (margin - 3))
        const t = tops[i]
        const last = t.length - 1
        for (let x = 0; x < cols; x++) {
          const at = x + margin + shifts[i]
          colTop[i * cols + x] = t[at] + rise
          colSlope[i * cols + x] = t[Math.min(last, at + 2)] - t[Math.max(0, at - 2)]
          colPool[i * cols + x] = depth * pools[i][at]
        }
      }
      const lift = age < 0 ? 1 : 1 - rdfEase((age - 900) / 1800)
      const r = 130 / PIXEL
      const r2 = r * r

      for (let y = 0; y < rows; y++) {
        const fade = rdfSmooth(0, fadeTo, y)
        const frow = (y >> 1) * fw
        const by = (y & 7) * 8
        const dyc = (y - ey) * 1.5
        for (let x = 0; x < cols; x++) {
          let Ly = -1
          for (let i = layersN - 1; i >= 0; i--) {
            if (y >= colTop[i * cols + x]) {
              Ly = i
              break
            }
          }
          let tone = 0
          let mk = 0.3
          if (Ly >= 0) {
            const kk = k[Ly]
            const d = y - colTop[Ly * cols + x]
            const depth = colPool[Ly * cols + x]
            tone = tb[Ly] * (1 - rdfSmooth(0, depth, d) * (0.88 - 0.45 * kk))
            const sl = colSlope[Ly * cols + x] * 0.06
            tone += (sl < -0.2 ? -0.2 : sl > 0.2 ? 0.2 : sl) * (1 - rdfSmooth(0, depth * 0.5, d))
            tone += (rdfHash(x + Math.round(colTop[Ly * cols + x] * 7), d | 0, Ly) - 0.5) * 0.07 * kk
            tone *= rev[Ly]
            mk = 0.95 - 0.5 * kk
          } else {
            tone = 0.05 * rdfSmooth(rows * 0.15, rows * 0.6, y)
          }
          let m = fog[frow + (x >> 1)] * 0.8 * mk
          if (clear > 0.01) {
            const dx = x - ex
            const q = (dx * dx + dyc * dyc) / r2
            if (q < 4) {
              const c = clear * Math.exp(-q)
              m *= 1 - c * 0.92
              if (Ly >= 0) tone += c * 0.16 * rev[Ly]
            }
          }
          if (tone > 0.93) tone = 0.93
          m += lift * 0.55
          if (m > 1) m = 1
          tone = (tone * (1 - m) + 0.09 * m * (1 - lift)) * fade
          buf[y * cols + x] = pal[rdfDither(tone, nT, RDF_BAYER[by + (x & 7)])]
        }
      }
      ctx.putImageData(img, 0, 0)

      // The readout rides the crest under the pointer: which day, what time, how focused.
      const alt = altRef.current
      const label = altTextRef.current
      let show = false
      if (alt && label && inside && age > 1600) {
        const cx = Math.max(0, Math.min(cols - 1, Math.round(ex)))
        for (let i = layersN - 1; i >= 0; i--) {
          const crest = colTop[i * cols + cx]
          if (ey >= crest - 6) {
            const layer = L[i]
            if (!layer.profile) break
            show = true
            alt.style.transform = `translate(${(cx * PIXEL).toFixed(1)}px,${(crest * PIXEL).toFixed(1)}px)`
            const u = Math.max(0, Math.min(0.9999, (cx + shifts[i]) / cols))
            const val = vals[i][cx + margin + shifts[i]]
            const text = `${layer.label} · ${time12(Math.floor((u * 1440) / 15) * 15)} · ${Math.round(Math.max(0, val) * 100)}% focus`
            if (text !== altLabel) {
              altLabel = text
              label.textContent = text
            }
            break
          }
        }
      }
      if (alt && show !== altShown) {
        altShown = show
        alt.style.opacity = show ? "1" : "0"
      }

      const settling =
        Math.abs(tx - ex) + Math.abs(ty - ey) > 0.05 ||
        Math.abs((inside ? 1 : 0) - clear) > 0.005 ||
        Math.abs(pt - pe) > 0.001 ||
        Math.abs(windV) > 0.002
      awake = age < 3400 || settling || !reduced
    }

    const busy = () => {
      const age = revealAt.current === null ? -1 : performance.now() - revealAt.current
      return (age >= 0 && age < 3400) || inside || Math.abs(windV) > 0.002 || Math.abs(pt - pe) > 0.001
    }
    const loop = (now: number) => {
      raf = 0
      if (!visible) return
      if (revealAt.current === null) {
        raf = requestAnimationFrame(loop)
        return
      }
      if (busy() || now - lastDraw > 32) {
        draw(now)
        lastDraw = now
      }
      if (awake) raf = requestAnimationFrame(loop)
    }
    const wake = () => {
      awake = true
      if (!raf && visible) raf = requestAnimationFrame(loop)
    }

    const onMove = (e: PointerEvent) => {
      const s = scene.getBoundingClientRect()
      pt = s.width > 0 ? ((e.clientX - s.left) / s.width) * 2 - 1 : 0
      const lx = (e.clientX - s.left) / PIXEL
      const ly = (e.clientY - s.top) / PIXEL
      const was = inside
      inside = lx >= 0 && ly >= 0 && lx < cols && ly < rows
      tx = lx
      ty = ly
      if (inside && !was) {
        ex = tx
        ey = ty
      }
      wake()
    }
    const onLeave = () => {
      pt = 0
      inside = false
      wake()
    }
    const onDown = () => {
      if (reduced || !inside) return
      windV += tx < cols / 2 ? 1.4 : -1.4
      wake()
    }

    layout()
    draw(performance.now())
    wake()
    scene.addEventListener("pointermove", onMove)
    scene.addEventListener("pointerleave", onLeave)
    scene.addEventListener("pointerdown", onDown)
    const ro = new ResizeObserver(() => {
      layout()
      draw(performance.now())
      wake()
    })
    ro.observe(scene)
    const io = new IntersectionObserver((entries) => {
      visible = entries[0] ? entries[0].isIntersecting : true
      if (visible) {
        lastTick = performance.now()
        wake()
      }
    })
    io.observe(scene)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      scene.removeEventListener("pointermove", onMove)
      scene.removeEventListener("pointerleave", onLeave)
      scene.removeEventListener("pointerdown", onDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (
    <div ref={sceneRef} className={"fr-scene " + (className || "")} role="img" aria-label={rest["aria-label"]}>
      <canvas ref={canvasRef} aria-hidden="true" />
      {children}
      <div ref={altRef} className="fr-alt" aria-hidden="true">
        <b />
        <i />
        <span ref={altTextRef} />
      </div>
    </div>
  )
}
