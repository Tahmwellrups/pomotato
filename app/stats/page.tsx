import type { Metadata } from "next";
import { StatsDashboard } from "@/components/StatsDashboard";

export const metadata: Metadata = {
  title: "Focus stats | Pomotato",
};

export default function StatsPage() {
  return <StatsDashboard />;
}
