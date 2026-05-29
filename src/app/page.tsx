import RouteCalculator from "@/components/RouteCalculator";

export default function HomePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Kalkulator rentowności trasy
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Koszty floty na bazie danych rzeczywistych · Trimble FMS · 67 ciągników · 5,18 mln km
        </p>
      </div>
      <RouteCalculator />
    </div>
  );
}
