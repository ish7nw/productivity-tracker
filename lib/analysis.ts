import { cat, dateKey, nowMinutes, score, toBlocks, type CatId, type Entry } from "./tracker"

export interface DayAnalysis {
  date: string
  dow: number
  /** Share of each hour spent in weighted focus, 0–1. */
  hf: number[]
  /** Share of each hour that was tracked at all, 0–1. */
  ht: number[]
  tracked: number
  weighted: number
  score: number
  runs: number[]
  first: number
  last: number
  firstFocus: number | null
  switches: number
  derail: Partial<Record<CatId, number>>
}

export interface Analysis {
  N: number
  days: DayAnalysis[]
  /** Typical focus share for each hour, averaged over all logged days. */
  profile: number[]
  coverage: number[]
  peak: number | null
  peakVal: number
  dip: number | null
  dipCat: CatId | null
  derailCat: CatId | null
  derailN: number
  avgScore: number
  sd: number | null
  avgFocus: number
  avgRun: number
  longRun: number
  ramp: number | null
  start: number
  end: number
  switches: number
  weekdays: { dow: number; n: number; score: number | null }[]
  bestWeekday: { dow: number; n: number; score: number | null } | null
  bestDay: DayAnalysis | null
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

export function analyze(entries: Entry[], target: number, isSample = false): Analysis {
  const today = dateKey(new Date())
  const nowMin = nowMinutes()
  const by: Record<string, Entry[]> = {}
  for (const e of entries) (by[e.date] ||= []).push(e)

  const days: DayAnalysis[] = Object.keys(by)
    .sort()
    .map((date) => {
      const blocks = toBlocks(by[date], !isSample && date === today, nowMin)
      const hf = new Array(24).fill(0)
      const ht = new Array(24).fill(0)
      let tracked = 0
      let weighted = 0
      const runs: number[] = []
      let lastFocusEnd = -1
      let first: number | null = null
      let last = 0
      let firstFocus: number | null = null
      let switches = 0
      const derail: Partial<Record<CatId, number>> = {}
      for (const b of blocks) {
        if (b.cat === "SLEEP" || b.d <= 0) continue
        const w = cat(b.cat).w
        tracked += b.d
        weighted += b.d * w
        switches++
        if (first === null) first = b.t
        last = b.end
        if (w >= 0.9) {
          if (lastFocusEnd === b.t && runs.length) runs[runs.length - 1] += b.d
          else runs.push(b.d)
          lastFocusEnd = b.end
          if (firstFocus === null) firstFocus = b.t
        } else {
          if (lastFocusEnd === b.t) derail[b.cat] = (derail[b.cat] || 0) + 1
          lastFocusEnd = -1
        }
        for (let m = b.t; m < Math.min(b.end, 1440); m++) {
          const h = Math.floor(m / 60)
          ht[h] += 1
          hf[h] += w
        }
      }
      const [y, mo, d] = date.split("-").map(Number)
      return {
        date,
        dow: new Date(y, mo - 1, d).getDay(),
        hf: hf.map((v) => v / 60),
        ht: ht.map((v) => v / 60),
        tracked,
        weighted,
        score: score(weighted, tracked, target),
        runs,
        first: first ?? 0,
        last,
        firstFocus,
        switches,
        derail,
      }
    })
    .filter((d) => d.tracked > 0)

  const N = days.length
  const profile = Array.from({ length: 24 }, (_, h) => (N ? days.reduce((s, d) => s + d.hf[h], 0) / N : 0))
  const coverage = Array.from({ length: 24 }, (_, h) => (N ? days.filter((d) => d.ht[h] > 0.25).length / N : 0))

  // Peak: the best 3-hour window of typical focus.
  let peak: number | null = null
  let peakVal = -1
  for (let a = 0; a <= 21; a++) {
    const v = (profile[a] + profile[a + 1] + profile[a + 2]) / 3
    if (v > peakVal + 1e-9) {
      peakVal = v
      peak = a
    }
  }
  if (peakVal <= 0) peak = null

  // Dip: the weakest 2-hour stretch inside your usual waking window, away from the peak.
  const span = profile.map((_, h) => h).filter((h) => coverage[h] >= 0.5)
  let dip: number | null = null
  let worst = 2
  if (span.length >= 5) {
    for (let a = span[0] + 1; a <= span[span.length - 1] - 2; a++) {
      if (coverage[a] < 0.5 || coverage[a + 1] < 0.5) continue
      if (peak !== null && a + 1 >= peak && a <= peak + 2) continue
      const v = (profile[a] + profile[a + 1]) / 2
      if (v < worst - 1e-9) {
        worst = v
        dip = a
      }
    }
  }

  // What fills the dip, by minutes of non-focus categories.
  let dipCat: CatId | null = null
  if (dip !== null) {
    const mins: Partial<Record<CatId, number>> = {}
    for (const d of days) {
      for (const b of toBlocks(by[d.date], false, 0)) {
        if (b.cat === "SLEEP" || cat(b.cat).w >= 0.9) continue
        const o = Math.max(0, Math.min(b.end, (dip + 2) * 60) - Math.max(b.t, dip * 60))
        if (o > 0) mins[b.cat] = (mins[b.cat] || 0) + o
      }
    }
    let top = 0
    for (const [k, v] of Object.entries(mins) as [CatId, number][]) if (v > top) [top, dipCat] = [v, k]
  }

  const der: Partial<Record<CatId, number>> = {}
  for (const d of days) for (const [k, v] of Object.entries(d.derail) as [CatId, number][]) der[k] = (der[k] || 0) + v
  let derailCat: CatId | null = null
  let derailN = 0
  for (const [k, v] of Object.entries(der) as [CatId, number][]) if (v > derailN) [derailN, derailCat] = [v, k]

  const scores = days.map((d) => d.score)
  const avgScore = Math.round(mean(scores))
  const sd = N > 1 ? Math.sqrt(mean(scores.map((s) => (s - avgScore) ** 2))) : null
  const ramps = days.filter((d) => d.firstFocus !== null).map((d) => (d.firstFocus as number) - d.first)

  const weekdays = [1, 2, 3, 4, 5, 6, 0].map((dow) => {
    const ds = days.filter((d) => d.dow === dow)
    return { dow, n: ds.length, score: ds.length ? Math.round(mean(ds.map((d) => d.score))) : null }
  })
  const bestWeekday = weekdays.reduce<(typeof weekdays)[number] | null>(
    (b, w) => (w.score !== null && (!b || (b.score ?? -1) < w.score) ? w : b),
    null,
  )
  const bestDay = days.reduce<DayAnalysis | null>((b, d) => (!b || d.score > b.score ? d : b), null)

  return {
    N,
    days,
    profile,
    coverage,
    peak,
    peakVal: Math.max(0, peakVal),
    dip,
    dipCat,
    derailCat,
    derailN,
    avgScore,
    sd,
    avgFocus: mean(days.map((d) => d.weighted / 60)),
    avgRun: mean(days.flatMap((d) => d.runs)),
    longRun: mean(days.map((d) => (d.runs.length ? Math.max(...d.runs) : 0))),
    ramp: ramps.length ? mean(ramps) : null,
    start: mean(days.map((d) => d.first)),
    end: mean(days.map((d) => d.last)),
    switches: mean(days.map((d) => d.switches)),
    weekdays,
    bestWeekday,
    bestDay,
  }
}
