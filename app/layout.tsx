import type { Metadata } from "next";
import { Comfortaa, Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Headers only, per DESIGN.md: body text stays the plain sans so the cuteness
// stays contained. Self-hosted by next/font, no request to Google at runtime.
const comfortaa = Comfortaa({
  variable: '--font-comfortaa',
  subsets: ['latin'],
  weight: ['400', '700'],
})

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Pomotato",
  description: "A cozy, local-first Pomodoro focus timer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${comfortaa.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
