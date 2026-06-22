import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import AppShell from "@/components/AppShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TruckCalc HBM — Kalkulator Rentowności Tras",
  description: "System kalkulacji kosztów transportu | HBM Audyt",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body className={inter.className}>
        {/* ── Top Nav ── */}
        <header className="bg-[#1F3864] text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold tracking-tight">🚛 TruckCalc</span>
                <span className="hidden sm:inline text-xs text-blue-300 font-medium uppercase tracking-widest">
                  HBM Audyt
                </span>
              </div>
              <nav className="flex items-center gap-1">
                <Link
                  href="/"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-100 hover:text-white hover:bg-blue-800 transition-colors"
                >
                  Kalkulator
                </Link>
                <Link
                  href="/history"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-100 hover:text-white hover:bg-blue-800 transition-colors"
                >
                  Historia
                </Link>
                <Link
                  href="/fleet"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-100 hover:text-white hover:bg-blue-800 transition-colors"
                >
                  Flota
                </Link>
                <Link
                  href="/analiza"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-100 hover:text-white hover:bg-blue-800 transition-colors"
                >
                  Analiza
                </Link>
                <Link
                  href="/fms"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-100 hover:text-white hover:bg-blue-800 transition-colors"
                >
                  FMS
                </Link>
                <Link
                  href="/ubezpieczenia"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-100 hover:text-white hover:bg-blue-800 transition-colors"
                >
                  Ubezpieczenia
                </Link>
                <Link
                  href="/dyspozytorzy"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-100 hover:text-white hover:bg-blue-800 transition-colors"
                >
                  Dyspozytorzy
                </Link>
                <Link
                  href="/kola"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-100 hover:text-white hover:bg-blue-800 transition-colors"
                >
                  Kółka
                </Link>
                <Link
                  href="/serwis"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-100 hover:text-white hover:bg-blue-800 transition-colors"
                >
                  Serwis
                </Link>
                <Link
                  href="/opony"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-100 hover:text-white hover:bg-blue-800 transition-colors"
                >
                  Opony
                </Link>
                <Link
                  href="/budzet"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-100 hover:text-white hover:bg-blue-800 transition-colors"
                >
                  Budżet
                </Link>
                <Link
                  href="/zarzad"
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-yellow-400 text-[#1F3864] hover:bg-yellow-300 transition-colors font-bold"
                >
                  Zarząd
                </Link>
                <Link
                  href="/import"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-100 hover:text-white hover:bg-blue-800 transition-colors"
                >
                  Import
                </Link>
                <Link
                  href="/konfiguracja"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-blue-100 hover:text-white hover:bg-blue-800 transition-colors"
                >
                  ⚙️
                </Link>
              </nav>
            </div>
          </div>
        </header>

        {/* ── Main ── */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <AppShell>{children}</AppShell>
        </main>

        {/* ── Footer ── */}
        <footer className="mt-16 border-t border-slate-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <p className="text-xs text-slate-400 text-center">
              TruckCalc · HBM Audyt · Dane kalkulacyjne: Trimble FMS, kartoteka pojazdów, wydatki 2024-2025
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
