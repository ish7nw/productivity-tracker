import { cat, dayStats, duration, pad, shiftDay, type Block } from "./tracker"

const esc = (t: string) =>
  String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")

/** Local "floating" time, so calendars show it at the same clock time it was logged. */
function stamp(dateKey: string, minutes: number) {
  const [y, m, d] = dateKey.split("-").map(Number)
  const dt = new Date(y, m - 1, d, 0, minutes)
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`
}

/** RFC 5545 lines are folded at 75 octets. */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ""
  let len = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ""
      len = 0
    }
    cur += ch
    len += n
  }
  out.push(cur)
  return out.join("\r\n ")
}

export function buildIcs(day: string, blocks: Block[], target: number) {
  const st = dayStats(blocks, target)
  const now = new Date()
  const dtstamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Productivity Log//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:Productivity ${day}`]
  L.push(
    "BEGIN:VEVENT",
    `UID:score-${day}@productivity-log`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${day.replace(/-/g, "")}`,
    `DTEND;VALUE=DATE:${shiftDay(day, 1).replace(/-/g, "")}`,
    `SUMMARY:${esc(`Day score ${st.score}/100 · ${(st.weighted / 60).toFixed(1)}h focus`)}`,
    `DESCRIPTION:${esc(
      `Tracked ${(st.tracked / 60).toFixed(1)}h. Focus ratio ${st.tracked ? Math.round((100 * st.weighted) / st.tracked) : 0}%. Longest streak ${duration(st.streak)}.`,
    )}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  )
  blocks.forEach((b, i) => {
    if (b.cat === "SLEEP" || b.d <= 0) return
    const c = cat(b.cat)
    L.push(
      "BEGIN:VEVENT",
      `UID:${b.id || i}-${day}@productivity-log`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${stamp(day, b.t)}`,
      `DTEND:${stamp(day, b.end)}`,
      `SUMMARY:${esc(b.text || "Untitled")}`,
      `DESCRIPTION:${esc(`${c.label} · weight ×${c.w.toFixed(1)} · ${duration(b.d)}`)}`,
      `CATEGORIES:${esc(c.label)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    )
  })
  L.push("END:VCALENDAR")
  return L.map(fold).join("\r\n") + "\r\n"
}

export function downloadIcs(day: string, blocks: Block[], target: number) {
  const blob = new Blob([buildIcs(day, blocks, target)], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `productivity-${day}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
