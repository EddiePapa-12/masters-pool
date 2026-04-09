import type { Metadata } from "next";
import { Playfair_Display, Source_Sans_3 } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import NavTabs from "@/components/NavTabs";
import StatusBar from "@/components/StatusBar";
import type { Database } from "@/types/database";
import "./globals.css";

// ── Fonts ──────────────────────────────────────────────────────────────────
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "800"],
  variable: "--font-source-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "2026 Masters Pool",
  description:
    "2026 Masters Pool Leaderboard — Track your picks, scores, and standings.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⛳</text></svg>",
  },
};

async function getProjectedCut(): Promise<number> {
  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data } = await supabase
      .from("pool_settings")
      .select("projected_cut")
      .single();
    return data?.projected_cut ?? 0;
  } catch {
    return 0;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const projectedCut = await getProjectedCut();

  return (
    <html lang="en" className={`${playfair.variable} ${sourceSans.variable}`}>
      <body>
        {/* ── Sticky top nav ────────────────────────────────────────── */}
        <header className="top-nav">
          <div className="nav-left-placeholder" />

          <div className="nav-logo-container">
            <Image
              src="/logo.png"
              alt="2026 Masters Pool"
              className="nav-logo"
              width={300}
              height={70}
              priority
              style={{ height: "70px", width: "auto" }}
            />
          </div>

          <StatusBar projectedCut={projectedCut} />
        </header>

        {/* ── Green tab nav ─────────────────────────────────────────── */}
        <NavTabs />

        {/* ── Page content ──────────────────────────────────────────── */}
        <main>{children}</main>

        {/* ── Footer with admin link ────────────────────────────────── */}
        <footer className="site-footer">
          <Link href="/admin">Admin</Link>
        </footer>
      </body>
    </html>
  );
}
