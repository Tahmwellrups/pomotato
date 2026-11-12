import type { Metadata, Viewport } from "next";
import { Comfortaa, Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { TimerClockProvider } from "@/components/TimerClockProvider";
// Leaf module, not the package index: the index re-exports the zustand store.
import { PREFERENCES_BOOT_SCRIPT } from "@/lib/preferences/boot-script";
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

// Dark only. `colorScheme` emits <meta name="color-scheme" content="dark">, and
// `themeColor` must equal the computed --background on <html> (app/globals.css
// :root); a metadata value cannot read a CSS variable, so the hex is repeated
// here and the e2e assertion keeps the two in step.
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#1c140e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the boot script sets data-task-panel on <html>
    // before React hydrates, and the server cannot know the stored panel state.
    // data-theme="dark" is server-rendered and static; the palette itself is
    // the :root tokens, so nothing reads this attribute to choose colours.
    <html
      lang="en"
      data-theme="dark"
      className={`${geistSans.variable} ${geistMono.variable} ${comfortaa.variable} ${spaceGrotesk.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TimerClockProvider>{children}</TimerClockProvider>
      </body>
    </html>
  );
}
