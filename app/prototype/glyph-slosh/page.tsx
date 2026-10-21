import type { Metadata } from "next";
import { GlyphSloshLab } from "@/components/prototype/GlyphSloshLab";

export const metadata: Metadata = {
  title: "Prototype: slosh inside the digits",
  robots: { index: false, follow: false },
};

export default function GlyphSloshPrototypePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <GlyphSloshLab />
    </main>
  );
}
