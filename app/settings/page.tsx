import type { Metadata } from "next";
import { SettingsPanel } from "@/components/SettingsPanel";

export const metadata: Metadata = {
  title: "Settings | Pomotato",
};

export default function SettingsPage() {
  return <SettingsPanel />;
}
