// Core model for the productivity log: categories, auto-detection, time blocks and scoring.

export type CatId = "DEEP" | "LEARN" | "ADMIN" | "HEALTH" | "CHORE" | "BREAK" | "SLEEP"

export interface Entry {
  id: string
  /** Local date, YYYY-MM-DD. */
  date: string
  /** Minutes from local midnight. */
  t: number
  text: string
  cat: CatId
  /** Created-at timestamp (ms), used to order entries logged at the same minute. */
  c: number
}

export interface Block extends Entry {
  end: number
  d: number
  running: boolean
}

export interface Category {
  id: CatId
  label: string
  w: number
  fill: string
  kw: string[]
}

export const CATEGORIES: Category[] = [
  { id: "DEEP", label: "Deep work", w: 1, fill: "#0a0a0a", kw: ["work", "code", "coding", "build", "lab", "project", "writ", "design", "ship", "dev", "debug", "deploy"] },
  { id: "LEARN", label: "Learning", w: 0.9, fill: "#3d3d3d", kw: ["aws", "module", "course", "study", "learn", "cert", "read", "lecture", "tutorial", "practice", "exam", "class"] },
  { id: "ADMIN", label: "Admin", w: 0.6, fill: "#7a7a7a", kw: ["email", "mail", "meeting", "call", "job", "apply", "plan", "admin", "agent", "invoice", "inbox"] },
  { id: "HEALTH", label: "Health", w: 0.5, fill: "#a8a8a8", kw: ["gym", "run", "workout", "walk", "yoga", "exercise", "meditat", "stretch", "swim"] },
  { id: "CHORE", label: "Chores", w: 0.3, fill: "#cfcfcf", kw: ["clean", "bath", "shower", "kitchen", "cook", "laundry", "shop", "grocer", "errand", "dishes"] },
  { id: "BREAK", label: "Break", w: 0, fill: "#ececec", kw: ["break", "food", "lunch", "dinner", "breakfast", "rest", "nap", "tv", "wake", "coffee", "social", "scroll", "eat"] },
  { id: "SLEEP", label: "End day", w: 0, fill: "#ffffff", kw: ["sleep", "bed", "end day", "good night", "goodnight"] },
]

const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CatId, Category>
export const cat = (id: CatId) => BY_ID[id] ?? BY_ID.ADMIN

const DETECT_ORDER: CatId[] = ["SLEEP", "BREAK", "HEALTH", "LEARN", "DEEP", "ADMIN", "CHORE"]

/** Guess a category from the words of a task. Unknown tasks count as admin. */
export function detect(text: string): CatId {
  const t = (text || "").toLowerCase()
  for (const id of DETECT_ORDER) {
    for (const kw of cat(id).kw) if (new RegExp("\\b" + kw).test(t)) return id
  }
  return "ADMIN"
}

// ---------- time helpers ----------
export const pad = (n: number) => (n < 10 ? "0" : "") + n
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const shiftDay = (key: string, n: number) => {
  const [y, m, d] = key.split("-").map(Number)
  return dateKey(new Date(y, m - 1, d + n))
}
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
const MONS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
export function dayLabel(key: string, withYear = false) {
  const [y, m, d] = key.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  return `${DAYS[dt.getDay()]} ${dt.getDate()} ${MONS[dt.getMonth()]}${withYear ? " " + dt.getFullYear() : ""}`
}
export function time12(t: number) {
  const h = Math.floor(t / 60) % 24
  const m = Math.round(t % 60)
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`
}
export const time24 = (t: number) => `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`
export function hourLabel(h: number) {
  h = ((h % 24) + 24) % 24
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`
}
export function hourRange(a: number, b: number) {
  const A = hourLabel(a)
  const B = hourLabel(b)
  return A.slice(-2) === B.slice(-2) ? `${A.slice(0, -3)}–${B}` : `${A}–${B}`
}
export function duration(m: number) {
  m = Math.max(0, Math.round(m))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${pad(m % 60)}m`
}
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes()

// ---------- blocks & scoring ----------
/** Each entry runs until the next one. The last one runs until now (today) or for an hour (past days). */
export function toBlocks(list: Entry[], isToday: boolean, nowMin: number): Block[] {
  const sorted = [...list].sort((a, b) => a.t - b.t || (a.c || 0) - (b.c || 0))
  return sorted.map((e, i) => {
    const next = sorted[i + 1]
    let end: number
    if (e.cat === "SLEEP") end = e.t
    else if (next) end = next.t
    else end = isToday ? Math.max(nowMin, e.t) : Math.min(e.t + 60, 1440)
    return { ...e, end, d: end - e.t, running: isToday && !next && e.cat !== "SLEEP" }
  })
}

export function score(weighted: number, tracked: number, target: number) {
  if (tracked <= 0) return 0
  return Math.round(100 * (0.6 * Math.min(1, weighted / (target * 60)) + 0.4 * (weighted / tracked)))
}

export interface DayStats {
  tracked: number
  weighted: number
  streak: number
  score: number
}

export function dayStats(blocks: Block[], target: number): DayStats {
  let tracked = 0
  let weighted = 0
  let best = 0
  let run = 0
  let lastEnd = -1
  for (const b of blocks) {
    if (b.cat === "SLEEP") {
      run = 0
      continue
    }
    const w = cat(b.cat).w
    tracked += b.d
    weighted += b.d * w
    if (w >= 0.9) {
      run = (lastEnd === b.t ? run : 0) + b.d
      best = Math.max(best, run)
      lastEnd = b.end
    } else {
      run = 0
      lastEnd = -1
    }
  }
  return { tracked, weighted, streak: best, score: score(weighted, tracked, target) }
}

export interface Segment {
  left: number
  width: number
  fill: string
}

/** Positions on a 24h strip, in percent. Blocks past midnight wrap to the start. */
export function segments(blocks: Pick<Block, "cat" | "t" | "end" | "d">[]): Segment[] {
  const out: Segment[] = []
  for (const b of blocks) {
    if (b.cat === "SLEEP" || b.d <= 0) continue
    const fill = cat(b.cat).fill
    const z = Math.min(b.end, 1440)
    if (z > b.t) out.push({ left: b.t / 14.4, width: (z - b.t) / 14.4, fill })
    if (b.end > 1440) out.push({ left: 0, width: (b.end - Math.max(1440, b.t)) / 14.4, fill })
  }
  return out
}

export function grade(s: number, tracked: number) {
  if (!tracked) return "{NO DATA}"
  if (s >= 85) return "{DEEP FLOW}"
  if (s >= 70) return "{LOCKED IN}"
  if (s >= 50) return "{STEADY}"
  if (s >= 25) return "{WARMING UP}"
  return "{JUST STARTED}"
}

// ---------- your 19 Nov sheet, as a sample ----------
export const SAMPLE_DATE = "2026-11-19"
export function sampleEntries(): Entry[] {
  const rows: [number, string][] = [
    [480, "Wake Up"], [510, "Start AWS"], [570, "Finish Module 9 AWS"], [610, "Start Module 10 AWS"], [670, "Kitchen + Food"],
    [740, "AWS Module 10"], [800, "AWS Module 10 Finish"], [845, "Break"], [845, "Agent (job search) + AI Agent Certification"],
    [890, "Break + shopping run"], [960, "Cleaning + Bath"], [1020, "AI agent lab"], [1080, "Work"], [1140, "Work"],
    [1200, "Work"], [1260, "Work"], [1320, "Work"], [1380, "Work"],
  ]
  const c = Date.now()
  return rows.map(([t, text], i) => ({ id: `${uid()}${i}`, date: SAMPLE_DATE, t, text, cat: detect(text), c: c + i }))
}

// ---------- benchmarks (rough reconstructions of publicly reported routines) ----------
export interface Benchmark {
  name: string
  note: string
  plan: [number, string, CatId][]
}
const H = (h: number, m = 0) => h * 60 + m
export const BENCHMARKS: Benchmark[] = [
  {
    name: "Elon Musk",
    note: "~6h sleep · 80–100 hr weeks · 5-minute timeboxing",
    plan: [
      [H(7), "Wake, coffee, kids", "BREAK"], [H(7, 30), "Critical email", "ADMIN"], [H(8), "Engineering reviews", "DEEP"],
      [H(13), "Lunch in a meeting", "BREAK"], [H(13, 15), "Design & engineering", "DEEP"], [H(19), "Dinner", "BREAK"],
      [H(20), "Factory floor / engineering", "DEEP"], [H(23, 30), "Late email", "ADMIN"], [H(25), "Sleep", "SLEEP"],
    ],
  },
  {
    name: "Steve Jobs",
    note: "Up ~6 · walking meetings · family dinner, then back to work",
    plan: [
      [H(6), "Wake, family breakfast", "BREAK"], [H(7, 30), "Email from home", "ADMIN"], [H(9), "Product & design reviews", "DEEP"],
      [H(13), "Walking meeting", "ADMIN"], [H(14), "Design reviews", "DEEP"], [H(18), "Family dinner", "BREAK"],
      [H(20, 30), "Work from home", "DEEP"], [H(23), "Sleep", "SLEEP"],
    ],
  },
  {
    name: "Tim Cook",
    note: "Up before 4 AM · email, then gym · early to bed",
    plan: [
      [H(3, 45), "Email", "ADMIN"], [H(5), "Gym", "HEALTH"], [H(6), "Coffee & commute", "BREAK"], [H(7), "Operations & exec work", "DEEP"],
      [H(12), "Lunch", "BREAK"], [H(13), "Exec & partner work", "DEEP"], [H(18), "Dinner", "BREAK"], [H(20), "Wind-down email", "ADMIN"],
      [H(21), "Sleep", "SLEEP"],
    ],
  },
  {
    name: "Jeff Bezos",
    note: '8h sleep · slow mornings · "high-IQ" meetings at 10 AM',
    plan: [
      [H(6, 30), "Putter, family breakfast", "BREAK"], [H(7, 30), "Read the news", "LEARN"], [H(8, 30), "Coffee & breakfast", "BREAK"],
      [H(10), "High-IQ meetings", "DEEP"], [H(12), "Lunch", "BREAK"], [H(13), "Decisions & meetings", "ADMIN"],
      [H(17), "Family time, dishes", "BREAK"], [H(22, 30), "Sleep", "SLEEP"],
    ],
  },
]

export function benchmarkBlocks(b: Benchmark): Block[] {
  const list: Entry[] = b.plan.map(([t, text, c], i) => ({ id: b.name + i, date: "", t, text, cat: c, c: i }))
  return toBlocks(list, false, 0)
}
