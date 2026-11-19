import type { Metadata } from "next"
import "@fontsource-variable/inter"
import "@fontsource/inter-tight/700.css"
import "@fontsource/inter-tight/800.css"
import "@fontsource/jetbrains-mono/400.css"
import "@fontsource/jetbrains-mono/500.css"
import "./globals.css"

export const metadata: Metadata = {
  title: "Productivity Log",
  description: "Log what you're doing, score your day, and find your peak focus hours.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  )
}
