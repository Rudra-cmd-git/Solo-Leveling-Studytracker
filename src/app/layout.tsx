import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Rajdhani } from "next/font/google";
import "./globals.css";
import { SystemEventsProvider } from "@/components/system/system-events";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Hunter System — gamified study tracking",
    template: "%s · Hunter System",
  },
  description:
    "Awaken as a Hunter. Track focused study sessions, complete quests, earn XP, climb the ranks and compete on a global leaderboard.",
  applicationName: "Hunter System",
  keywords: ["study tracker", "gamified study", "focus timer", "leaderboard", "hunter ranks"],
  openGraph: {
    title: "Hunter System",
    description: "Every study session is a raid. Awaken, level up, and climb the ranks.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#04060c",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${rajdhani.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        <div className="system-backdrop" aria-hidden />
        <SystemEventsProvider>{children}</SystemEventsProvider>
      </body>
    </html>
  );
}
