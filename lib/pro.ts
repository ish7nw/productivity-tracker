const D = (process.env.NEXT_PUBLIC_ACCESS_DIGEST || "8c8438d58981873d11d50e4ebd5fd7e8718bab12e8a0841153741ef4b5692ba7").trim().toLowerCase()

async function digest(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("")
}

export async function verifyKey(key: string) {
  const k = (key || "").trim()
  if (!k) return false
  try {
    return (await digest(k)) === D
  } catch {
    return false
  }
}
