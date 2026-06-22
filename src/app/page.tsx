"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function WelcomePage() {
  const router = useRouter();

  // Jeśli tryb jest już wybrany — przekieruj od razu
  useEffect(() => {
    const mode = localStorage.getItem("hbm_mode");
    if (mode === "transport") router.replace("/kalkulator");
    else if (mode === "serwis") router.replace("/serwis");
  }, [router]);

  function pick(mode: "transport" | "serwis") {
    localStorage.setItem("hbm_mode", mode);
    router.push(mode === "transport" ? "/kalkulator" : "/serwis");
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-10">
      {/* Nagłówek */}
      <div className="text-center">
        <div className="text-5xl mb-3">🚛</div>
        <h1 className="text-3xl font-bold text-slate-800">TruckCalc HBM</h1>
        <p className="text-slate-500 mt-2 text-sm">
          System zarządzania flotą i serwisem · B&amp;M Investgroup
        </p>
      </div>

      {/* Karty wyboru */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl px-4">
        {/* Transport */}
        <button
          onClick={() => pick("transport")}
          className="group flex flex-col items-center gap-4 p-8 bg-white rounded-2xl border-2 border-slate-200 hover:border-[#1F3864] hover:shadow-2xl transition-all text-left cursor-pointer"
        >
          <div className="text-5xl">📊</div>
          <div className="w-full">
            <div className="text-xl font-bold text-slate-800 group-hover:text-[#1F3864] mb-1">
              Transport
            </div>
            <div className="text-sm text-slate-500 leading-relaxed">
              Kalkulacje tras · Flota · Analiza<br />
              FMS · Budżet · Zarząd · Kółka
            </div>
          </div>
          <div className="w-full mt-2">
            <span className="inline-block px-4 py-2 bg-[#1F3864] text-white text-sm font-medium rounded-lg group-hover:bg-[#162a4f] transition-colors w-full text-center">
              Wejdź →
            </span>
          </div>
        </button>

        {/* Serwis */}
        <button
          onClick={() => pick("serwis")}
          className="group flex flex-col items-center gap-4 p-8 bg-white rounded-2xl border-2 border-slate-200 hover:border-green-600 hover:shadow-2xl transition-all text-left cursor-pointer"
        >
          <div className="text-5xl">🔧</div>
          <div className="w-full">
            <div className="text-xl font-bold text-slate-800 group-hover:text-green-700 mb-1">
              Serwis / Warsztat
            </div>
            <div className="text-sm text-slate-500 leading-relaxed">
              Kartoteka serwisowa · Opony<br />
              Historia przeglądów · Magazyn
            </div>
          </div>
          <div className="w-full mt-2">
            <span className="inline-block px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg group-hover:bg-green-700 transition-colors w-full text-center">
              Wejdź →
            </span>
          </div>
        </button>
      </div>

      <p className="text-xs text-slate-400">
        HBM Audyt · wybór jest zapamiętywany w przeglądarce
      </p>
    </div>
  );
}
