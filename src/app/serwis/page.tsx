"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

interface MaintenanceRow {
  id?: string;
  vehicle_reg: string;
  current_km: number | null;
  current_km_updated_at: string | null;
  last_oil_change_km: number | null;
  oil_change_interval_km: number;
  last_inspection_date: string | null;
  next_inspection_date: string | null;
  last_service_km: number | null;
  last_service_date: string | null;
  service_interval_km: number;
  service_interval_months: number;
  last_tire_change_km: number | null;
  tire_interval_km: number;
  notes: string | null;
}

type AlertLevel = "ok" | "warn" | "alert" | "overdue" | "unknown";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.round(diff / 86400000);
}

function kmRemaining(lastKm: number | null, interval: number, currentKm: number | null): number | null {
  if (lastKm == null || currentKm == null) return null;
  return lastKm + interval - currentKm;
}

function kmLevel(rem: number | null, warn = 5000, alert = 2000): AlertLevel {
  if (rem == null) return "unknown";
  if (rem < 0) return "overdue";
  if (rem <= alert) return "alert";
  if (rem <= warn) return "warn";
  return "ok";
}

function dayLevel(days: number | null, warn = 30, alert = 14): AlertLevel {
  if (days == null) return "unknown";
  if (days < 0) return "overdue";
  if (days <= alert) return "alert";
  if (days <= warn) return "warn";
  return "ok";
}

const levelColors: Record<AlertLevel, string> = {
  ok:      "text-emerald-600 bg-emerald-50",
  warn:    "text-amber-600 bg-amber-50",
  alert:   "text-red-600 bg-red-50",
  overdue: "text-white bg-red-600 font-bold",
  unknown: "text-slate-400 bg-slate-50",
};
const levelBorder: Record<AlertLevel, string> = {
  ok: "", warn: "border-l-4 border-amber-400", alert: "border-l-4 border-red-500",
  overdue: "border-l-4 border-red-700 bg-red-50/40", unknown: "",
};

function Badge({ level, text }: { level: AlertLevel; text: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${levelColors[level]}`}>
      {text}
    </span>
  );
}

function rowUrgency(r: MaintenanceRow): number {
  const scores: number[] = [];
  const oilRem = kmRemaining(r.last_oil_change_km, r.oil_change_interval_km, r.current_km);
  const srvRem = kmRemaining(r.last_service_km, r.service_interval_km, r.current_km);
  const tireRem = kmRemaining(r.last_tire_change_km, r.tire_interval_km, r.current_km);
  const inspDays = daysUntil(r.next_inspection_date);
  [oilRem, srvRem, tireRem].forEach(v => { if (v != null) scores.push(v / 1000); });
  if (inspDays != null) scores.push(inspDays / 30);
  return scores.length ? Math.min(...scores) : 9999;
}

export default function SerwisPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<MaintenanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<MaintenanceRow | null>(null);
  const [filter, setFilter] = useState<"all" | "warn" | "alert" | "overdue">("all");
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    // Get all active vehicles
    const { data: vehicles } = await supabase.from("vehicles").select("reg").eq("is_active", true).order("reg");
    // Get maintenance records
    const { data: maint } = await supabase.from("maintenance").select("*");
    const maintMap: Record<string, MaintenanceRow> = {};
    for (const m of maint ?? []) maintMap[m.vehicle_reg] = m;

    const merged: MaintenanceRow[] = (vehicles ?? []).map(v => maintMap[v.reg] ?? {
      vehicle_reg: v.reg, current_km: null, current_km_updated_at: null,
      last_oil_change_km: null, oil_change_interval_km: 40000,
      last_inspection_date: null, next_inspection_date: null,
      last_service_km: null, last_service_date: null,
      service_interval_km: 100000, service_interval_months: 12,
      last_tire_change_km: null, tire_interval_km: 120000, notes: null,
    });

    merged.sort((a, b) => rowUrgency(a) - rowUrgency(b));
    setRows(merged);
    setLoading(false);
  }

  // Parse Trimble XLS for current odometers
  async function handleTrimbleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const all = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" }) as string[][];

      // Find header row with registration + km columns
      let hIdx = 0;
      for (let i = 0; i < Math.min(10, all.length); i++) {
        const joined = all[i].join("|").toLowerCase();
        if ((joined.includes("rej") || joined.includes("pojazd") || joined.includes("vehicle")) &&
            (joined.includes("km") || joined.includes("przebieg") || joined.includes("odometer"))) {
          hIdx = i; break;
        }
      }
      const headers = all[hIdx].map(h => String(h).toLowerCase().trim());
      const regIdx = headers.findIndex(h => h.includes("rej") || h.includes("pojazd") || h.includes("vehicle") || h.includes("name"));
      const kmIdx  = headers.findIndex(h => h.includes("przebieg") || h.includes("odometer") || h.includes("km total") || h.includes("total km") || h.includes("suma km"));

      if (regIdx < 0 || kmIdx < 0) {
        setUploadMsg(`Nie znaleziono kolumn. Nagłówki: ${headers.filter(h=>h).slice(0,8).join(", ")}`);
        setUploading(false);
        return;
      }

      const updates: Record<string, number> = {};
      for (const row of all.slice(hIdx + 1)) {
        const reg = String(row[regIdx] ?? "").trim().toUpperCase();
        const km  = parseFloat(String(row[kmIdx] ?? "").replace(/\s/g, "").replace(",", "."));
        if (reg && !isNaN(km) && km > 0) updates[reg] = km;
      }

      // Upsert to maintenance table
      const now = new Date().toISOString();
      let updated = 0;
      for (const [reg, km] of Object.entries(updates)) {
        await supabase.from("maintenance").upsert(
          { vehicle_reg: reg, current_km: km, current_km_updated_at: now },
          { onConflict: "vehicle_reg" }
        );
        updated++;
      }

      setUploadMsg(`✓ Zaktualizowano przebieg dla ${updated} pojazdów z pliku Trimble`);
      await loadData();
    } catch (err) {
      setUploadMsg(`Błąd: ${String(err)}`);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function saveEdit(r: MaintenanceRow) {
    setSaving(r.vehicle_reg);
    await supabase.from("maintenance").upsert(
      { ...r, updated_at: new Date().toISOString() },
      { onConflict: "vehicle_reg" }
    );
    setSaving(null);
    setEditRow(null);
    await loadData();
  }

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter(r => {
      const levels = [
        kmLevel(kmRemaining(r.last_oil_change_km, r.oil_change_interval_km, r.current_km)),
        dayLevel(daysUntil(r.next_inspection_date)),
        kmLevel(kmRemaining(r.last_service_km, r.service_interval_km, r.current_km)),
        kmLevel(kmRemaining(r.last_tire_change_km, r.tire_interval_km, r.current_km)),
      ];
      if (filter === "overdue") return levels.some(l => l === "overdue");
      if (filter === "alert")   return levels.some(l => l === "overdue" || l === "alert");
      if (filter === "warn")    return levels.some(l => l === "overdue" || l === "alert" || l === "warn");
      return true;
    });
  }, [rows, filter]);

  // KPI counts
  const overdueCount = rows.filter(r => {
    const ls = [kmLevel(kmRemaining(r.last_oil_change_km, r.oil_change_interval_km, r.current_km)), dayLevel(daysUntil(r.next_inspection_date)), kmLevel(kmRemaining(r.last_service_km, r.service_interval_km, r.current_km)), kmLevel(kmRemaining(r.last_tire_change_km, r.tire_interval_km, r.current_km))];
    return ls.some(l => l === "overdue");
  }).length;
  const alertCount = rows.filter(r => {
    const ls = [kmLevel(kmRemaining(r.last_oil_change_km, r.oil_change_interval_km, r.current_km)), dayLevel(daysUntil(r.next_inspection_date)), kmLevel(kmRemaining(r.last_service_km, r.service_interval_km, r.current_km)), kmLevel(kmRemaining(r.last_tire_change_km, r.tire_interval_km, r.current_km))];
    return ls.some(l => l === "alert") && !ls.some(l => l === "overdue");
  }).length;
  const warnCount = rows.filter(r => {
    const ls = [kmLevel(kmRemaining(r.last_oil_change_km, r.oil_change_interval_km, r.current_km)), dayLevel(daysUntil(r.next_inspection_date)), kmLevel(kmRemaining(r.last_service_km, r.service_interval_km, r.current_km)), kmLevel(kmRemaining(r.last_tire_change_km, r.tire_interval_km, r.current_km))];
    return ls.some(l => l === "warn") && !ls.some(l => l === "alert" || l === "overdue");
  }).length;

  function fmtKm(v: number | null) { return v != null ? v.toLocaleString("pl-PL") : "—"; }
  function fmtRem(rem: number | null) {
    if (rem == null) return "—";
    if (rem < 0) return `PRZETERMIN. ${Math.abs(rem).toLocaleString("pl-PL")} km`;
    return `${rem.toLocaleString("pl-PL")} km`;
  }
  function fmtDays(days: number | null) {
    if (days == null) return "—";
    if (days < 0) return `PRZETERMIN. ${Math.abs(days)}d`;
    return `${days}d`;
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-blue-600 text-sm p-8">
      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      Ładowanie danych serwisowych…
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nadzór serwisowy</h1>
          <p className="text-slate-500 text-sm mt-1">Wymiana oleju · Przegląd techniczny · Serwis · Opony — alert wg przebiegu i dat</p>
        </div>
        <div className="flex items-center gap-2">
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors
            ${uploading ? "bg-slate-200 text-slate-500" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
            <span>⬆ Wgraj Trimble XLS</span>
            <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleTrimbleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {uploadMsg && (
        <div className={`px-4 py-3 rounded-lg text-sm ${uploadMsg.startsWith("✓") ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {uploadMsg}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`card py-3 cursor-pointer ${filter==="all" ? "ring-2 ring-blue-500" : ""}`} onClick={() => setFilter("all")}>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Wszystkie</p>
          <p className="text-2xl font-bold text-slate-800 mt-0.5">{rows.length}</p>
          <p className="text-xs text-slate-400">pojazdów</p>
        </div>
        <div className={`card py-3 cursor-pointer border-l-4 border-red-700 ${filter==="overdue" ? "ring-2 ring-red-500" : ""}`} onClick={() => setFilter("overdue")}>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Przeterminowane</p>
          <p className={`text-2xl font-bold mt-0.5 ${overdueCount > 0 ? "text-red-700" : "text-slate-800"}`}>{overdueCount}</p>
          <p className="text-xs text-slate-400">wymagają natychmiastowej akcji</p>
        </div>
        <div className={`card py-3 cursor-pointer border-l-4 border-red-500 ${filter==="alert" ? "ring-2 ring-red-400" : ""}`} onClick={() => setFilter("alert")}>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Pilne &lt;2000km / &lt;14dni</p>
          <p className={`text-2xl font-bold mt-0.5 ${alertCount > 0 ? "text-red-600" : "text-slate-800"}`}>{alertCount}</p>
          <p className="text-xs text-slate-400">zaplanuj w tym tygodniu</p>
        </div>
        <div className={`card py-3 cursor-pointer border-l-4 border-amber-500 ${filter==="warn" ? "ring-2 ring-amber-400" : ""}`} onClick={() => setFilter("warn")}>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Zbliżające się</p>
          <p className={`text-2xl font-bold mt-0.5 ${warnCount > 0 ? "text-amber-600" : "text-slate-800"}`}>{warnCount}</p>
          <p className="text-xs text-slate-400">&lt;5000km lub &lt;30 dni</p>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Pojazd</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Przebieg</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-amber-600 uppercase">🛢 Olej</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-blue-600 uppercase">🔍 Przegląd</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-purple-600 uppercase">🔧 Serwis</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase">🏎 Opony</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Akcja</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(r => {
              const oilRem  = kmRemaining(r.last_oil_change_km, r.oil_change_interval_km, r.current_km);
              const srvRem  = kmRemaining(r.last_service_km, r.service_interval_km, r.current_km);
              const tireRem = kmRemaining(r.last_tire_change_km, r.tire_interval_km, r.current_km);
              const inspDays = daysUntil(r.next_inspection_date);
              const oilLvl  = kmLevel(oilRem);
              const inspLvl = dayLevel(inspDays);
              const srvLvl  = kmLevel(srvRem);
              const tireLvl = kmLevel(tireRem);
              const worstLvl = [oilLvl, inspLvl, srvLvl, tireLvl].reduce((worst, l) => {
                const order: AlertLevel[] = ["ok","unknown","warn","alert","overdue"];
                return order.indexOf(l) > order.indexOf(worst) ? l : worst;
              }, "ok" as AlertLevel);
              return (
                <tr key={r.vehicle_reg} className={`hover:bg-slate-50 ${levelBorder[worstLvl]}`}>
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-slate-800">{r.vehicle_reg}</div>
                    {r.notes && <div className="text-xs text-slate-400 truncate max-w-[120px]">{r.notes}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-medium text-slate-700">{fmtKm(r.current_km)} km</div>
                    {r.current_km_updated_at && (
                      <div className="text-xs text-slate-400">
                        {new Date(r.current_km_updated_at).toLocaleDateString("pl-PL")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge level={oilLvl} text={fmtRem(oilRem)} />
                    {r.last_oil_change_km && <div className="text-xs text-slate-400 mt-0.5">ost.: {fmtKm(r.last_oil_change_km)} km</div>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge level={inspLvl} text={fmtDays(inspDays)} />
                    {r.next_inspection_date && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        {new Date(r.next_inspection_date).toLocaleDateString("pl-PL")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge level={srvLvl} text={fmtRem(srvRem)} />
                    {r.last_service_km && <div className="text-xs text-slate-400 mt-0.5">ost.: {fmtKm(r.last_service_km)} km</div>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge level={tireLvl} text={fmtRem(tireRem)} />
                    {r.last_tire_change_km && <div className="text-xs text-slate-400 mt-0.5">ost.: {fmtKm(r.last_tire_change_km)} km</div>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setEditRow({...r})}
                      className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition-colors">
                      Edytuj
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">Brak pojazdów w tej kategorii</div>
        )}
      </div>

      {/* Edit modal */}
      {editRow && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Dane serwisowe — {editRow.vehicle_reg}</h2>
              <button onClick={() => setEditRow(null)} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Oil */}
              <div className="col-span-2 border-t pt-3">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-2">🛢 Wymiana oleju</p>
              </div>
              <label className="block">
                <span className="text-xs text-slate-500">Ostatnia wymiana (km)</span>
                <input type="number" value={editRow.last_oil_change_km ?? ""} onChange={e => setEditRow({...editRow, last_oil_change_km: e.target.value ? +e.target.value : null})}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="np. 250000" />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Interwał (km)</span>
                <input type="number" value={editRow.oil_change_interval_km} onChange={e => setEditRow({...editRow, oil_change_interval_km: +e.target.value})}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </label>

              {/* Inspection */}
              <div className="col-span-2 border-t pt-3">
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">🔍 Przegląd techniczny</p>
              </div>
              <label className="block">
                <span className="text-xs text-slate-500">Data ostatniego</span>
                <input type="date" value={editRow.last_inspection_date ?? ""} onChange={e => setEditRow({...editRow, last_inspection_date: e.target.value || null})}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Data następnego</span>
                <input type="date" value={editRow.next_inspection_date ?? ""} onChange={e => setEditRow({...editRow, next_inspection_date: e.target.value || null})}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </label>

              {/* Service */}
              <div className="col-span-2 border-t pt-3">
                <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-2">🔧 Serwis planowy</p>
              </div>
              <label className="block">
                <span className="text-xs text-slate-500">Ostatni serwis (km)</span>
                <input type="number" value={editRow.last_service_km ?? ""} onChange={e => setEditRow({...editRow, last_service_km: e.target.value ? +e.target.value : null})}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="np. 200000" />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Interwał (km)</span>
                <input type="number" value={editRow.service_interval_km} onChange={e => setEditRow({...editRow, service_interval_km: +e.target.value})}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Data ostatniego serwisu</span>
                <input type="date" value={editRow.last_service_date ?? ""} onChange={e => setEditRow({...editRow, last_service_date: e.target.value || null})}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Interwał (mies.)</span>
                <input type="number" value={editRow.service_interval_months} onChange={e => setEditRow({...editRow, service_interval_months: +e.target.value})}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </label>

              {/* Tires */}
              <div className="col-span-2 border-t pt-3">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">🏎 Opony</p>
              </div>
              <label className="block">
                <span className="text-xs text-slate-500">Ostatnia zmiana (km)</span>
                <input type="number" value={editRow.last_tire_change_km ?? ""} onChange={e => setEditRow({...editRow, last_tire_change_km: e.target.value ? +e.target.value : null})}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="np. 180000" />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Interwał (km)</span>
                <input type="number" value={editRow.tire_interval_km} onChange={e => setEditRow({...editRow, tire_interval_km: +e.target.value})}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </label>

              <div className="col-span-2 border-t pt-3">
                <label className="block">
                  <span className="text-xs text-slate-500">Notatki</span>
                  <textarea value={editRow.notes ?? ""} onChange={e => setEditRow({...editRow, notes: e.target.value || null})}
                    rows={2} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => saveEdit(editRow)} disabled={!!saving}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving === editRow.vehicle_reg ? "Zapisuję…" : "Zapisz"}
              </button>
              <button onClick={() => setEditRow(null)}
                className="px-6 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-lg hover:border-slate-400 transition-colors">
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
