"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Lock, Pencil } from "lucide-react"
import { Button, buttonClasses } from "@/components/ui/button"
import { PageGlyphBackground } from "@/components/page-glyph-background"
import { useNow, useSaved, write } from "@/lib/store"
import { verifyKey } from "@/lib/pro"
import { downloadIcs } from "@/lib/ics"
import {
  BENCHMARKS,
  CATEGORIES,
  SAMPLE_DATE,
  benchmarkBlocks,
  cat,
  dateKey,
  dayLabel,
  dayStats,
  detect,
  duration,
  grade,
  nowMinutes,
  sampleEntries,
  score,
  segments,
  shiftDay,
  time12,
  time24,
  toBlocks,
  uid,
  type CatId,
  type Entry,
  type Segment,
} from "@/lib/tracker"

type Pick = "AUTO" | CatId
const PICKS: Pick[] = ["AUTO", "DEEP", "LEARN", "ADMIN", "HEALTH", "CHORE", "BREAK"]
const EDIT_CATS: CatId[] = ["DEEP", "LEARN", "ADMIN", "HEALTH", "CHORE", "BREAK", "SLEEP"]

interface EditDraft {
  id: string
  date: string
  time: string
  text: string
  cat: CatId
  fresh: boolean
}

function Strip({ segs, className }: { segs: Segment[]; className?: string }) {
  return (
    <div className={"strip " + (className || "")}>
      {segs.map((s, i) => (
        <span key={i} style={{ left: s.left + "%", width: s.width + "%", background: s.fill }} />
      ))}
    </div>
  )
}

export function Tracker() {
  const saved = useSaved()
  const now = useNow(10_000)
  const { entries, target } = saved

  const [viewDate, setViewDate] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState("")
  const [pick, setPick] = React.useState<Pick>("AUTO")
  const [premium, setPremium] = React.useState(false)
  const [keyInput, setKeyInput] = React.useState("")
  const [keyMsg, setKeyMsg] = React.useState("")
  const [edit, setEdit] = React.useState<EditDraft | null>(null)

  // Re-check a remembered key on load.
  React.useEffect(() => {
    if (!saved.key) return
    let live = true
    verifyKey(saved.key).then((ok) => live && setPremium(ok))
    return () => {
      live = false
    }
  }, [saved.key])

  const today = now ? dateKey(now) : ""
  const nowMin = now ? nowMinutes(now) : 0
  const view = viewDate || today
  const isToday = view === today
  const blocks = React.useMemo(
    () => toBlocks(entries.filter((e) => e.date === view), isToday, nowMin),
    [entries, view, isToday, nowMin],
  )
  const stats = dayStats(blocks, target)

  const guess = pick === "AUTO" ? detect(draft) : pick
  const g = cat(guess)

  const last = entries.reduce<Entry | null>((b, e) => (!b || (e.c || 0) > (b.c || 0) ? e : b), null)
  const canUndo = !!last && Date.now() - (last.c || 0) < 10 * 60 * 1000

  const log = (text: string, c: Pick) => {
    const t = text.trim()
    if (!t) return
    const d = new Date()
    const e: Entry = { id: uid(), date: dateKey(d), t: nowMinutes(d), text: t, cat: c === "AUTO" ? detect(t) : c, c: Date.now() }
    write({ entries: [...entries, e] })
    setDraft("")
    setPick("AUTO")
    setViewDate(null)
  }

  const saveEdit = () => {
    if (!edit) return
    const [hh, mm] = (edit.time || "00:00").split(":").map(Number)
    const t = Math.min(1439, Math.max(0, (hh || 0) * 60 + (mm || 0)))
    write({
      entries: entries.map((x) =>
        x.id === edit.id ? { ...x, date: edit.date || x.date, t, text: edit.text.trim() || x.text || "Untitled", cat: edit.cat } : x,
      ),
    })
    setViewDate(edit.date || viewDate)
    setEdit(null)
  }
  const cancelEdit = () => {
    if (edit?.fresh) write({ entries: entries.filter((x) => x.id !== edit.id) })
    setEdit(null)
  }
  const deleteEntry = (id: string) => {
    write({ entries: entries.filter((x) => x.id !== id) })
    setEdit(null)
  }
  const backfill = () => {
    const t = isToday ? nowMin : 720
    const e: Entry = { id: uid(), date: view, t, text: "", cat: "DEEP", c: Date.now() }
    write({ entries: [...entries, e] })
    setEdit({ id: e.id, date: view, time: time24(t), text: "", cat: "DEEP", fresh: true })
  }

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await verifyKey(keyInput)) {
      write({ key: keyInput.trim() })
      setPremium(true)
      setKeyInput("")
      setKeyMsg("")
    } else setKeyMsg("Invalid key.")
  }
  const lockPro = () => {
    write({ key: "" })
    setPremium(false)
    setEdit(null)
  }

  // Leaderboard
  const board = [
    { name: "You", note: isToday ? "Today, live" : dayLabel(view, true), you: true, st: stats, segs: segments(blocks) },
    ...BENCHMARKS.map((b) => {
      const bl = benchmarkBlocks(b)
      return { name: b.name, note: b.note, you: false, st: dayStats(bl, target), segs: segments(bl) }
    }),
  ].sort((a, b) => b.st.score - a.st.score || (a.you ? -1 : 1))
  const youIdx = board.findIndex((b) => b.you)
  let insight = "Log a few tasks and your day lines up against the board."
  if (stats.tracked) {
    if (youIdx === 0) insight = `You top the board for ${isToday ? "today" : "this day"} with ${stats.score} points. Protect the streak.`
    else {
      const above = board[youIdx - 1]
      let add = 0
      while (add < 720 && score(stats.weighted + add, stats.tracked + add, target) < above.st.score) add += 5
      insight = `You are ${above.st.score - stats.score} points behind ${above.name}. About ${duration(add)} more deep work would pass that day. Rank #${youIdx + 1} of ${board.length}.`
    }
  }

  const breakdown = CATEGORIES.filter((c) => c.id !== "SLEEP").map((c) => {
    const m = blocks.filter((b) => b.cat === c.id).reduce((s, b) => s + b.d, 0)
    return { ...c, m, pct: stats.tracked ? (100 * m) / stats.tracked : 0 }
  })

  const hasSample = entries.some((e) => e.date === SAMPLE_DATE)
  const hasIcs = blocks.some((b) => b.cat !== "SLEEP" && b.d > 0)
  const clock = now ? time12(nowMin) : "--:--"

  return (
    <div className="relative min-h-screen">
      <PageGlyphBackground />
      <main className="relative z-10 mx-auto flex max-w-[1440px] flex-col gap-7 px-5 pb-20 pt-6 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-6 border-t border-foreground pt-3.5 text-[11px] uppercase tracking-[.08em]">
          <div className="flex items-center gap-3">
            <span className="font-bold">Productivity</span>
            <span>×××</span>
            {premium && <span className="bg-foreground px-2 py-0.5 text-background">Pro</span>}
          </div>
          <div className="text-right leading-[1.7]">
            Every hour you log
            <br />
            is an hour you own.
            <br />
            Make it count.
          </div>
        </div>

        <div className="overflow-hidden">
          <h1 className="headline">PRODUCTIVITY/LOG</h1>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-[11px] uppercase tracking-[.08em]">Local time ×××</div>
            <div className="font-display text-4xl font-bold leading-none tracking-tight" suppressHydrationWarning>
              {clock}
            </div>
            <div className="text-xs uppercase tracking-[.08em]">{today ? dayLabel(today, true) : ""}</div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <Link href="/analysis" className={buttonClasses("default", "default")}>
              Analysis <ArrowRight className="size-3.5" aria-hidden />
            </Link>
            <div className="max-w-[420px] text-right text-[11px] uppercase leading-[1.7] tracking-[.08em]">
              Type what you&apos;re doing. The clock stamps it. Each task runs until you log the next one.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-6">
          {/* Left column */}
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
            <section className="flex flex-col gap-4 border border-foreground bg-background p-6">
              <div className="flex flex-wrap justify-between gap-3 text-[11px] uppercase tracking-[.08em]">
                <span className="font-bold">Log a task ×××</span>
                <span>
                  Auto-stamp · {clock} · {today ? dayLabel(today) : ""}
                </span>
              </div>
              <form
                className="flex flex-wrap gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  log(draft, pick)
                }}
              >
                <label htmlFor="task" className="sr-only">
                  What are you doing right now?
                </label>
                <input
                  id="task"
                  className="field flex-[1_1_280px] !w-auto text-lg"
                  autoComplete="off"
                  placeholder="WHAT ARE YOU DOING RIGHT NOW?"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Button type="submit">{"{Log it}"}</Button>
              </form>
              <div className="flex flex-wrap gap-2">
                {PICKS.map((p) => (
                  <button key={p} type="button" className="chip" data-on={pick === p} onClick={() => setPick(p)}>
                    {p === "AUTO" ? "Auto" : cat(p).label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[#4a4a4a]">
                  {pick === "AUTO" ? (draft.trim() ? "Auto-detected → " : "Auto mode: category is guessed from your words → ") : "Category → "}
                  {g.label.toUpperCase()} ×{g.w.toFixed(1)}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => log("Break", "BREAK")}>
                    Take a break
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => log("End day", "SLEEP")}>
                    End day
                  </Button>
                </div>
              </div>
            </section>

            <section className="border border-foreground bg-background">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="border-transparent" aria-label="Previous day" onClick={() => { setViewDate(shiftDay(view, -1)); setEdit(null) }}>
                    <ChevronLeft className="size-4" aria-hidden />
                  </Button>
                  <div className="px-1.5 font-display text-xl font-bold tracking-tight">
                    {isToday ? `TODAY · ${today ? dayLabel(view) : ""}` : dayLabel(view, true)}
                  </div>
                  <Button variant="outline" size="icon" className="border-transparent" aria-label="Next day" onClick={() => { setViewDate(shiftDay(view, 1)); setEdit(null) }}>
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                  {!isToday && (
                    <Button variant="outline" size="sm" onClick={() => { setViewDate(null); setEdit(null) }}>
                      Today
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canUndo && (
                    <Button variant="outline" size="sm" onClick={() => last && deleteEntry(last.id)}>
                      Undo last
                    </Button>
                  )}
                  {hasIcs && (
                    <Button variant="outline" size="sm" onClick={() => downloadIcs(view, blocks, target)}>
                      <CalendarDays className="size-3.5" aria-hidden /> Export .ics
                    </Button>
                  )}
                  {premium && (
                    <Button size="sm" onClick={backfill}>
                      + Add past entry
                    </Button>
                  )}
                </div>
              </div>

              <div className="logrow !min-h-0 !bg-transparent py-2 text-[10px] uppercase tracking-[.08em] text-[#4a4a4a]">
                <div>Time</div>
                <div>Task performed</div>
                <div className="c3">Category</div>
                <div className="c4 text-right">Spent</div>
                <div className="c5" />
              </div>

              {blocks.map((b) => {
                const c = cat(b.cat)
                if (premium && edit && edit.id === b.id) {
                  return (
                    <div key={b.id} className="flex flex-col gap-3.5 border-y border-foreground bg-[#f6f6f6] p-4">
                      <div className="text-[11px] font-bold uppercase tracking-[.08em]">Edit entry · Pro</div>
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
                        <label className="flex flex-col gap-1.5 text-[11px] uppercase tracking-[.08em]">
                          Date
                          <input className="field" type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
                        </label>
                        <label className="flex flex-col gap-1.5 text-[11px] uppercase tracking-[.08em]">
                          Time
                          <input className="field" type="time" value={edit.time} onChange={(e) => setEdit({ ...edit, time: e.target.value })} />
                        </label>
                        <label className="col-span-2 flex flex-col gap-1.5 text-[11px] uppercase tracking-[.08em]">
                          Task
                          <input className="field" type="text" value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {EDIT_CATS.map((id) => (
                          <button key={id} type="button" className="chip" data-on={edit.cat === id} onClick={() => setEdit({ ...edit, cat: id })}>
                            {cat(id).label}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={saveEdit}>Save</Button>
                        <Button variant="outline" size="sm" onClick={cancelEdit}>Cancel</Button>
                        <Button variant="outline" size="sm" className="ml-auto" onClick={() => deleteEntry(b.id)}>Delete</Button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={b.id} className="logrow" data-run={b.running}>
                    <div className="tabular-nums">{time12(b.t)}</div>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="truncate">{b.text || "(untitled)"}</span>
                      {b.running && <span className="live">● NOW</span>}
                    </div>
                    <div className="c3 flex items-center gap-2 text-[11px] uppercase tracking-[.08em]">
                      <span className="inline-block size-3 flex-none border border-current" style={{ background: c.fill }} />
                      {c.label}
                    </div>
                    <div className="c4 text-right tabular-nums">{b.cat === "SLEEP" ? "—" : duration(b.d)}</div>
                    <div className="c5">
                      {premium ? (
                        <button
                          type="button"
                          aria-label="Edit time, date and task"
                          className="inline-flex size-11 cursor-pointer items-center justify-center border border-transparent hover:border-current"
                          onClick={() => setEdit({ id: b.id, date: b.date, time: time24(b.t), text: b.text, cat: b.cat, fresh: false })}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </button>
                      ) : (
                        <a
                          href="#pro"
                          aria-label="Editing is a Pro feature. Unlock Pro"
                          className="inline-flex size-11 items-center justify-center border border-transparent hover:border-current"
                          onClick={() => setKeyMsg("Editing time & date needs Pro.")}
                        >
                          <Lock className="size-4" aria-hidden />
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}

              {blocks.length === 0 && (
                <div className="flex flex-col items-start gap-4 border-t border-black/10 px-4 py-10">
                  <div className="font-display text-2xl font-bold tracking-tight">Nothing logged yet</div>
                  <p className="m-0 max-w-[460px] text-[13px] leading-relaxed text-[#4a4a4a]">
                    Type what you&apos;re doing above and hit Enter. The time and date are picked up automatically.
                  </p>
                  {!hasSample && (
                    <Button variant="outline" size="sm" onClick={() => { write({ entries: [...entries, ...sampleEntries()] }); setViewDate(SAMPLE_DATE) }}>
                      Load my 19 Nov sheet
                    </Button>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Right column */}
          <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-6">
            <section className="ink flex flex-col gap-5 bg-[#0a0a0a] p-6 text-white">
              <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[.08em]">
                <span className="font-bold">Day score ×××</span>
                <span className="font-display text-base font-bold tracking-tight">{grade(stats.score, stats.tracked)}</span>
              </div>
              <div className="flex items-end gap-2.5">
                <div className="font-display text-[148px] font-extrabold leading-[.8] tracking-[-.05em]">{stats.tracked ? stats.score : "00"}</div>
                <div className="pb-1.5 font-display text-[22px] font-bold text-[#a3a3a3]">/100</div>
              </div>
              <div>
                <Strip segs={segments(blocks)} className="!border-white" />
                <div className="mt-1.5 flex justify-between text-[10px] tracking-[.08em] text-[#a3a3a3]">
                  <span>12A</span><span>6A</span><span>12P</span><span>6P</span><span>12A</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  ["Focus hours", (stats.weighted / 60).toFixed(1) + "h"],
                  ["Tracked", (stats.tracked / 60).toFixed(1) + "h"],
                  ["Focus ratio", stats.tracked ? Math.round((100 * stats.weighted) / stats.tracked) + "%" : "--"],
                  ["Longest streak", duration(stats.streak)],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-1.5 border border-white/30 p-3.5">
                    <span className="text-[10px] uppercase tracking-[.12em] text-[#a3a3a3]">{k}</span>
                    <span className="font-display text-[30px] font-bold leading-none tracking-tight">{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] uppercase tracking-[.08em] text-[#a3a3a3]">Daily focus target</span>
                <div className="flex items-center gap-1.5">
                  <Button variant="inverseOutline" size="icon" aria-label="Lower target" onClick={() => write({ target: Math.max(1, target - 1) })}>−</Button>
                  <span className="min-w-14 text-center font-display text-[22px] font-bold">{target}h</span>
                  <Button variant="inverseOutline" size="icon" aria-label="Raise target" onClick={() => write({ target: Math.min(16, target + 1) })}>+</Button>
                </div>
              </div>
              <p className="m-0 text-[11px] leading-relaxed text-[#a3a3a3]">
                Score = 60% hitting your focus target + 40% focus ratio. Focus hours are weighted: deep work ×1.0, learning ×0.9, admin ×0.6, health ×0.5, chores ×0.3, breaks ×0.
              </p>
            </section>

            <section className="flex flex-col gap-3.5 border border-foreground bg-background p-6">
              <div className="text-[11px] font-bold uppercase tracking-[.08em]">Breakdown ×××</div>
              {breakdown.map((c) => (
                <div key={c.id} className="grid grid-cols-[14px_104px_44px_minmax(0,1fr)_72px] items-center gap-2.5 text-xs">
                  <span className="inline-block size-3 border border-foreground" style={{ background: c.fill }} />
                  <span className="text-[11px] uppercase tracking-[.08em]">{c.label}</span>
                  <span className="text-muted-foreground">×{c.w.toFixed(1)}</span>
                  <div className="relative h-2 border border-foreground">
                    <div className="absolute inset-y-0 left-0 bg-foreground" style={{ width: c.pct + "%" }} />
                  </div>
                  <span className="text-right tabular-nums">{duration(c.m)}</span>
                </div>
              ))}
            </section>
          </div>
        </div>

        {/* Pro: comparison board, blurred until unlocked */}
        <div id="pro" className="relative">
          <div className={premium ? "" : "pointer-events-none select-none opacity-55 blur-[9px]"} aria-hidden={!premium}>
            <section className="border border-foreground bg-background">
              <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-7">
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] uppercase tracking-[.08em]">Pro · Compare ×××</div>
                  <div className="font-display text-[56px] font-extrabold leading-[.9] tracking-[-.04em]">YOU VS/</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-[.08em]">{isToday ? "Today" : dayLabel(view, true)}</span>
                  {premium && <Button variant="outline" size="sm" onClick={lockPro}>Lock Pro</Button>}
                </div>
              </div>
              <p className="m-0 max-w-[820px] px-5 pb-5 text-sm leading-relaxed">{insight}</p>
              {board.map((b, i) => (
                <div key={b.name} className="brow" data-you={b.you}>
                  <div className="font-display text-[28px] font-bold">#{i + 1}</div>
                  <div>
                    <div className="text-sm font-bold uppercase tracking-[.08em]">{b.name}</div>
                    <div className={"mt-1 text-[11px] leading-normal " + (b.you ? "text-[#bdbdbd]" : "text-[#5e5e5e]")}>{b.note}</div>
                  </div>
                  <Strip segs={b.segs} />
                  <div className="bscore flex flex-col items-end gap-1">
                    <span className="font-display text-4xl font-bold leading-none">{b.st.tracked ? b.st.score : "--"}</span>
                    <span className="text-[11px] uppercase tracking-[.08em]">{(b.st.weighted / 60).toFixed(1)}h focus</span>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-foreground px-5 py-4">
                <div className="flex flex-wrap gap-4">
                  {CATEGORIES.filter((c) => c.id !== "SLEEP").map((c) => (
                    <span key={c.id} className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[.08em]">
                      <span className="inline-block size-3 border border-foreground" style={{ background: c.fill }} />
                      {c.label}
                    </span>
                  ))}
                </div>
                <p className="m-0 max-w-[520px] text-[11px] leading-relaxed text-[#5e5e5e]">
                  Benchmarks are rough reconstructions of publicly reported routines, scored with the same formula as your day. Treat them as motivation, not data.
                </p>
              </div>
            </section>
          </div>
          {!premium && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="ink flex w-full max-w-[440px] flex-col gap-4 bg-[#0a0a0a] p-8 text-white">
                <div className="text-center font-display text-[56px] font-extrabold leading-[.9] tracking-[-.04em]">PRO</div>
                <div className="text-center text-[11px] uppercase tracking-[.08em] text-[#bdbdbd]">Enter key to unlock</div>
                <form className="flex flex-wrap gap-2.5" onSubmit={unlock}>
                  <label htmlFor="pro-key" className="sr-only">Pro key</label>
                  <input
                    id="pro-key"
                    className="field flex-[1_1_180px] !w-auto"
                    type="password"
                    autoComplete="off"
                    placeholder="Pro key"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                  />
                  <Button type="submit" variant="inverse">Unlock</Button>
                </form>
                {keyMsg && <div className="text-center text-xs">{keyMsg}</div>}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
