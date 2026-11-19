"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { FocusRange, type RangeLayer } from "@/components/focus-range"
import { analyze } from "@/lib/analysis"
import { useSaved } from "@/lib/store"
import { cat, dayLabel, duration, hourLabel, hourRange, sampleEntries, time12, type CatId } from "@/lib/tracker"

const PALETTES = {
  mono: { paper: "#ffffff", ink: "#0a0a0a", muted: "#5e5e5e", line: "#e2e2e2", tones: ["#ffffff", "#ececec", "#cfcfcf", "#a3a3a3", "#6e6e6e", "#3a3a3a", "#0a0a0a"] },
  evergreen: { paper: "#f3f8f5", ink: "#14211a", muted: "#5c6b63", line: "#dce8e1", tones: ["#f3f8f5", "#d4ecdf", "#a5d7bb", "#69b38a", "#2e7c52", "#145131", "#0a2d1a"] },
  glacier: { paper: "#f2f6fa", ink: "#121b26", muted: "#5a6879", line: "#dae3ed", tones: ["#f2f6fa", "#d6e6f4", "#a8cae7", "#6b9ecc", "#34679a", "#1a3e66", "#0b2140"] },
  dusk: { paper: "#f8f4f7", ink: "#21151f", muted: "#6f5e6b", line: "#ecdfe8", tones: ["#f8f4f7", "#efdbe7", "#d9b2cb", "#b1789f", "#7a4975", "#4a2750", "#25102c"] },
  sepia: { paper: "#f7f2ea", ink: "#231a10", muted: "#6e6152", line: "#e9dfcf", tones: ["#f7f2ea", "#efdfc6", "#ddbb8d", "#bb8a55", "#8a5a2e", "#5a3518", "#2f1a0b"] },
  night: { paper: "#08100c", ink: "#e2eee7", muted: "#8fa398", line: "#18271f", tones: ["#08100c", "#0c1c14", "#123224", "#1a4b33", "#256a48", "#3a8c63", "#62b388"] },
} as const
type PaletteName = keyof typeof PALETTES
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function AnalysisView() {
  const saved = useSaved()
  const [mounted, setMounted] = React.useState(false)
  const [palName, setPalName] = React.useState<PaletteName>("mono")
  const [inView, setInView] = React.useState(false)
  const frameRef = React.useRef<HTMLElement>(null)

  React.useEffect(() => setMounted(true), [])
  React.useEffect(() => {
    try {
      const p = localStorage.getItem("prodlog.palette") as PaletteName | null
      if (p && p in PALETTES) setPalName(p)
    } catch {}
  }, [])
  React.useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const isSample = !saved.entries.some((e) => e.cat !== "SLEEP")
  const m = React.useMemo(
    () => (mounted ? analyze(isSample ? sampleEntries() : saved.entries, saved.target, isSample) : null),
    [mounted, isSample, saved.entries, saved.target],
  )
  const pal = PALETTES[palName]

  const layers: RangeLayer[] = React.useMemo(() => {
    const L: RangeLayer[] = []
    if (m && m.N) {
      for (const d of m.days.slice(-5)) L.push({ label: dayLabel(d.date), profile: d.hf })
      L.push({ label: "AVERAGE", profile: m.profile })
    }
    while (L.length < 4) L.unshift({ label: "", profile: null })
    return L
  }, [m])

  const catL = (id: CatId | null) => (id ? cat(id).label : "—")
  const peakShort = m && m.peak !== null ? hourRange(m.peak, m.peak + 3) : "—"
  const dipShort = m && m.dip !== null ? hourRange(m.dip, m.dip + 2) : "—"
  const maxP = m ? Math.max(0.0001, ...m.profile) : 1

  const choosePalette = (p: PaletteName) => {
    setPalName(p)
    try {
      localStorage.setItem("prodlog.palette", p)
    } catch {}
  }

  const style = {
    "--rdf-paper": pal.paper,
    "--rdf-ink": pal.ink,
    "--rdf-muted": pal.muted,
    "--rdf-line": pal.line,
  } as React.CSSProperties

  const tagline =
    m && m.N
      ? `Across ${m.N} logged day${m.N === 1 ? "" : "s"}, you usually start around ${time12(m.start)}` +
        (m.peak !== null ? `, climb to ${Math.round(m.peakVal * 100)}% focus between ${peakShort}` : "") +
        (m.dip !== null ? ` and slide between ${dipShort}${m.dipCat ? `, mostly into ${catL(m.dipCat).toLowerCase()}` : ""}` : "") +
        "."
      : ""

  const columns: { title: string; items: [string, string][] }[] = m
    ? [
        {
          title: "Peaks",
          items: [
            ["Sharpest window", peakShort],
            ["Time to first focus", m.ramp === null ? "—" : duration(m.ramp)],
            ["Avg focus block", duration(m.avgRun)],
            ["Longest block, avg", duration(m.longRun)],
          ],
        },
        {
          title: "Dips",
          items: [
            ["Weakest stretch", dipShort],
            ["What fills it", catL(m.dipCat)],
            ["Focus usually ends in", m.derailCat ? `${catL(m.derailCat)} (${m.derailN}×)` : "—"],
            ["Task switches / day", m.switches.toFixed(1)],
          ],
        },
        {
          title: "Rhythm",
          items: [
            ["Usual start", m.N ? time12(m.start) : "—"],
            ["Usual wrap-up", m.N ? time12(Math.min(m.end, 1439)) : "—"],
            ["Best weekday", m.bestWeekday ? `${WEEKDAY[m.bestWeekday.dow]} · ${m.bestWeekday.score}` : "—"],
            ["Best day", m.bestDay ? `${dayLabel(m.bestDay.date)} · ${m.bestDay.score}` : "—"],
          ],
        },
      ]
    : []

  return (
    <div className="an min-h-screen" style={style}>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-7 px-5 pt-6 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-6 border-t pt-3.5" style={{ borderColor: "var(--rdf-ink)" }}>
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[.08em]">
            <span className="font-medium">Productivity</span>
            <span>×××</span>
            <span style={{ color: "var(--rdf-muted)" }}>Analysis</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.08em]" style={{ color: "var(--rdf-muted)" }}>
              Palette
              <select
                value={palName}
                onChange={(e) => choosePalette(e.target.value as PaletteName)}
                className="min-h-11 border bg-transparent px-2 font-mono text-[11px] uppercase"
                style={{ borderColor: "var(--rdf-ink)", color: "var(--rdf-ink)" }}
              >
                {Object.keys(PALETTES).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2 border px-3.5 font-mono text-[11px] font-medium uppercase tracking-[.1em] no-underline transition-transform duration-500 hover:-translate-x-1"
              style={{ borderColor: "var(--rdf-ink)" }}
            >
              <ArrowLeft className="size-3.5" aria-hidden /> Back to log
            </Link>
          </div>
        </div>

        <div className="overflow-hidden">
          <h1 className="headline">ANALYSIS/RANGE</h1>
        </div>

        {m && isSample && (
          <div className="self-start border px-3.5 py-3 font-mono text-[11px] uppercase tracking-[.06em]" style={{ borderColor: "var(--rdf-ink)" }}>
            Sample data: your 19 Nov sheet. Log days in the tracker and this page fills in with yours.
          </div>
        )}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-7">
          {[
            ["Avg day score", m && m.N ? String(m.avgScore) : "--", m?.sd == null ? "Out of 100. Consistency shows after two days." : `Out of 100, give or take ${Math.round(m.sd)} points day to day.`],
            ["Focus / day", m ? m.avgFocus.toFixed(1) + "h" : "--", "Weighted focus hours on an average logged day."],
            ["Peak window", peakShort, m && m.peak !== null ? `${Math.round(m.peakVal * 100)}% of those hours go to focused work on a typical day.` : ""],
            ["Days logged", m ? String(m.N) : "0", m && m.N ? (m.N === 1 ? dayLabel(m.days[0].date) : `${dayLabel(m.days[0].date)} → ${dayLabel(m.days[m.N - 1].date)}`) : ""],
          ].map(([k, v, s]) => (
            <div key={k} className="flex flex-col gap-3.5 border-t pt-5" style={{ borderColor: "var(--rdf-line)" }}>
              <span className="an-h3">{k}</span>
              <span className="font-display text-[clamp(48px,6vw,84px)] font-bold leading-[.9] tracking-[-.05em]">{v}</span>
              <span className="text-[13px] leading-normal" style={{ color: "var(--rdf-muted)" }}>{s}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-10 pt-3">
          <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="an-h3" style={{ color: "var(--rdf-ink)" }}>Focus by hour ×××</h2>
              <div className="flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--rdf-muted)" }}>
                <span className="inline-flex items-center gap-1.5"><i className="inline-block size-3 border" style={{ background: "var(--rdf-ink)", borderColor: "var(--rdf-ink)" }} />Peak</span>
                <span className="inline-flex items-center gap-1.5"><i className="dither-50 inline-block size-3 border" style={{ borderColor: "var(--rdf-ink)" }} />Typical</span>
                <span className="inline-flex items-center gap-1.5"><i className="dither-dots inline-block size-3 border" style={{ borderColor: "var(--rdf-ink)" }} />Dip</span>
              </div>
            </div>
            <div className="flex h-[200px] items-end gap-1 border-b" style={{ borderColor: "var(--rdf-ink)" }}>
              {(m?.profile ?? new Array(24).fill(0)).map((v, h) => {
                const isPeak = m?.peak != null && h >= m.peak && h < m.peak + 3
                const isDip = m?.dip != null && h >= m.dip && h < m.dip + 2
                return (
                  <div key={h} className="flex h-full min-w-0 flex-1 items-end" title={`${hourLabel(h)}: ${Math.round(v * 100)}% focus`}>
                    <div
                      className={"w-full min-h-0.5 transition-[height] duration-700 " + (isPeak ? "" : isDip ? "dither-dots" : "dither-50")}
                      style={{ height: (100 * v) / maxP + "%", background: isPeak ? "var(--rdf-ink)" : undefined, boxShadow: isDip ? "inset 0 1px 0 var(--rdf-ink)" : undefined }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="min-w-0 flex-1 whitespace-nowrap font-mono text-[8px] sm:text-[10px]" style={{ color: "var(--rdf-muted)" }}>
                  {h % 3 === 0 ? hourLabel(h).replace(" AM", "A").replace(" PM", "P") : ""}
                </span>
              ))}
            </div>
            <p className="m-0 text-[13px]" style={{ color: "var(--rdf-muted)" }}>
              Bar height is the share of each hour you spend in weighted focus, averaged over every logged day.
            </p>
          </div>

          <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-7">
            <div className="flex flex-col gap-3">
              <h2 className="an-h3" style={{ color: "var(--rdf-ink)" }}>By weekday ×××</h2>
              {m?.weekdays.map((w) => {
                const best = m.bestWeekday?.dow === w.dow
                return (
                  <div key={w.dow} className="grid grid-cols-[96px_minmax(0,1fr)_64px] items-center gap-3.5 text-[13px]">
                    <span className="font-mono text-[11px] uppercase tracking-[.08em]">{WEEKDAY[w.dow]}</span>
                    <div className="relative h-2.5 border" style={{ borderColor: "var(--rdf-ink)" }}>
                      <div className={"absolute inset-y-0 left-0 " + (best ? "" : "dither-50")} style={{ width: (w.score ?? 0) + "%", background: best ? "var(--rdf-ink)" : undefined }} />
                    </div>
                    <span className="text-right">{w.score ?? "—"}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="an-h3" style={{ color: "var(--rdf-ink)" }}>Recent days ×××</h2>
              {m?.days.slice(-7).reverse().map((d) => (
                <div key={d.date} className="grid grid-cols-[96px_minmax(0,1fr)_64px] items-center gap-3.5 text-[13px]">
                  <span className="font-mono text-[11px] uppercase tracking-[.08em]">{dayLabel(d.date)}</span>
                  <div className="relative h-2.5 border" style={{ borderColor: "var(--rdf-ink)" }}>
                    <div className="absolute inset-y-0 left-0" style={{ width: d.score + "%", background: "var(--rdf-ink)" }} />
                  </div>
                  <span className="text-right">{d.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* The ridgeline frame: summary columns over the dithered range of your days. */}
      <footer ref={frameRef} className={"relative mt-14 grid w-full overflow-hidden" + (inView ? " rdf-in" : "")}>
        <div className="rdf-frame2">
          <div className="relative z-[2] grid grid-cols-2 gap-x-7 gap-y-9 px-[clamp(20px,3.2vw,30px)] pb-[clamp(30px,4vw,52px)] pt-[clamp(44px,6.4vw,80px)] md:grid-cols-[minmax(0,1.9fr)_repeat(3,minmax(0,1fr))] md:gap-y-7">
            <div className="col-span-2 flex flex-col items-start gap-5 md:col-span-1">
              <div className="rise max-w-[16ch] font-display text-[clamp(30px,3.4vw,46px)] font-bold leading-[1.02] tracking-[-.035em]" style={{ "--d": 140 } as React.CSSProperties}>
                {m ? (m.peak !== null ? `You peak ${peakShort}.` : "Log a few days to find your peak.") : "Reading your days…"}
              </div>
              <p className="rise m-0 max-w-[46ch] text-sm leading-relaxed" style={{ color: "var(--rdf-muted)", "--d": 230 } as React.CSSProperties}>
                {tagline}
              </p>
            </div>
            {columns.map((col, ci) => (
              <nav key={col.title} aria-label={col.title}>
                <h3 className="an-h3 rise" style={{ "--d": 260 + ci * 110 } as React.CSSProperties}>{col.title}</h3>
                <ul className="mt-[18px] grid list-none gap-3.5 p-0">
                  {col.items.map(([k, v], li) => (
                    <li key={k} className="rise flex flex-col gap-1" style={{ "--d": 330 + ci * 110 + li * 55 } as React.CSSProperties}>
                      <span className="text-[11.5px]" style={{ color: "var(--rdf-muted)" }}>{k}</span>
                      <span className="text-[15px] font-medium tracking-[-.01em]">{v}</span>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="rise relative z-[2] flex flex-col items-start justify-between gap-1.5 px-[clamp(20px,3.2vw,30px)] text-xs md:flex-row md:items-center md:gap-4" style={{ color: "var(--rdf-muted)", "--d": 1250 } as React.CSSProperties}>
            <p className="m-0">{m && m.N ? `Front ridge: your average day. Behind it: your last ${Math.min(5, m.N)} day${Math.min(5, m.N) === 1 ? "" : "s"}.` : ""}</p>
            <p className="m-0">Hover the range to read an hour. Click it to blow the mist away.</p>
          </div>
          <FocusRange
            layers={layers}
            tones={[...pal.tones]}
            revealed={inView}
            className="-mt-10"
            aria-label={`Mountain range of focus by hour.${m && m.peak !== null ? ` Highest between ${peakShort}.` : ""}${m && m.dip !== null ? ` Lowest between ${dipShort}.` : ""}`}
          >
            {m && m.peak !== null && (
              <div className="fr-mark" style={{ left: ((m.peak + 1.5) / 24) * 100 + "%", top: 56 }}>
                <span>▲ Peak · {peakShort}</span>
                <b />
              </div>
            )}
            {m && m.dip !== null && (
              <div className="fr-mark" style={{ left: ((m.dip + 1) / 24) * 100 + "%", top: 120 }}>
                <span>▼ Dip · {dipShort}</span>
                <b />
              </div>
            )}
          </FocusRange>
          <div
            className="relative z-[2] flex justify-between border-t px-[clamp(20px,3.2vw,30px)] pb-7 pt-3 font-mono text-[10px] tracking-[.08em]"
            style={{ color: "var(--rdf-muted)", borderColor: "var(--rdf-line)" }}
            aria-hidden
          >
            {["12A", "3A", "6A", "9A", "12P", "3P", "6P", "9P", "12A"].map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
