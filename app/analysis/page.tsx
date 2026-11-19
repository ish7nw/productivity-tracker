import type { Metadata } from "next"
import { AnalysisView } from "@/components/analysis-view"

export const metadata: Metadata = {
  title: "Analysis · Productivity Log",
  description: "Your peak focus hours, your dips and your daily rhythm.",
}

export default function AnalysisPage() {
  return <AnalysisView />
}
