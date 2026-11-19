"use client"

// Everything lives in this browser's localStorage, shared by every page of the site.

import * as React from "react"
import type { Entry } from "./tracker"

export const STORE_KEY = "prodlog.v1"

export interface Saved {
  entries: Entry[]
  target: number
  /** The Pro key the user unlocked with, re-checked on load. */
  key: string
}

const EMPTY: Saved = { entries: [], target: 8, key: "" }
const listeners = new Set<() => void>()
let cache: Saved | null = null
let cacheRaw: string | null = null

function read(): Saved {
  if (typeof window === "undefined") return EMPTY
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORE_KEY)
  } catch {
    raw = null
  }
  if (cache && raw === cacheRaw) return cache
  cacheRaw = raw
  try {
    const parsed = raw ? JSON.parse(raw) : null
    cache = {
      entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
      target: typeof parsed?.target === "number" ? parsed.target : 8,
      key: typeof parsed?.key === "string" ? parsed.key : "",
    }
  } catch {
    cache = EMPTY
  }
  return cache
}

export function write(patch: Partial<Saved>) {
  const next = { ...read(), ...patch }
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: keep working in memory for this visit.
    cache = next
    cacheRaw = null
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORE_KEY) cb()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}

/** The saved log, kept in sync across components and browser tabs. */
export function useSaved(): Saved {
  return React.useSyncExternalStore(subscribe, read, () => EMPTY)
}

/** Re-render every `ms` so running timers and the clock stay current. */
export function useNow(ms = 10_000) {
  const [now, setNow] = React.useState<Date | null>(null)
  React.useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
