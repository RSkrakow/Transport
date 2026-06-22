import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import NavBar from "@/components/NavBar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TruckCalc HBM — System zarządzania flotą",
  description: "System kalkulacji kosztów transportu i zarządzania serwisem | HBM Audyt",
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
              {/* Logo */}
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold tracking-tight">🚛 TruckCalc</span>
                <span className="hidden sm:inline text-xs text-blue-300 font-medium uppercase tracking-widest">
                  HBM Audyt
                </span>
              </div>

              {/* Nawigacja dynamiczna — zależna od trybu (Transport / Serwis) */}
              <NavBar />
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
