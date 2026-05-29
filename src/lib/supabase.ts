import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client (uses service role for admin ops)
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ─── Types matching 001_init.sql ──────────────────────────────
export interface Vehicle {
  id: string;
  reg: string;
  brand: string | null;
  model: string | null;
  vehicle_type: string;
  year_produced: number | null;
  odometer_km: number | null;
  avg_fuel_l100: number | null;
  leasing_eur_mo: number | null;
  is_active: boolean;
}

export interface CostRate {
  param_key: string;
  param_value: number;
  unit: string | null;
  description: string | null;
}

export interface TollRate {
  country_iso: string;
  country_name: string | null;
  toll_eur_100km: number;
}

export interface RouteCalculation {
  id?: string;
  origin_country: string;
  dest_country: string;
  distance_km: number;
  vehicle_reg: string | null;
  freight_eur: number | null;
  fuel_price_eur: number | null;
  cost_fuel: number | null;
  cost_toll: number | null;
  cost_driver: number | null;
  cost_leasing: number | null;
  cost_service: number | null;
  cost_total: number | null;
  margin_eur: number | null;
  margin_pct: number | null;
  min_freight_eur: number | null;
  notes: string | null;
  created_at?: string;
}
