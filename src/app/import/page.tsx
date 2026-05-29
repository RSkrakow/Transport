import ImportPanel from "@/components/ImportPanel";
import { createServiceClient } from "@/lib/supabase";

export const revalidate = 0;

export default async function ImportPage() {
  const supabase = createServiceClient();
  const { data: logs } = await supabase
    .from("import_log")
    .select("*")
    .order("imported_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Import danych</h1>
        <p className="text-slate-500 text-sm mt-1">
          Wgraj pliki XLS/XLSX aby zasilić bazę danych
        </p>
      </div>

      <ImportPanel />

      {/* Import log */}
      {logs && logs.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4">Historia importów</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  {["Data", "Plik", "Typ", "Zaimportowano", "Pominięto", "Status"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2.5 pr-4 text-slate-500 whitespace-nowrap">
                      {log.imported_at ? new Date(log.imported_at).toLocaleString("pl-PL") : "—"}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{log.filename}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{log.file_type}</td>
                    <td className="py-2.5 pr-4 text-emerald-600 font-semibold">{log.rows_imported}</td>
                    <td className="py-2.5 pr-4 text-amber-600">{log.rows_skipped}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                        ${log.status === "success" ? "bg-emerald-100 text-emerald-700" :
                          log.status === "error"   ? "bg-red-100 text-red-700" :
                          "bg-slate-100 text-slate-600"}`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
