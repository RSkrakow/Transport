-- ============================================================
-- TruckCalc HBM — Migration 002: Import tables
-- expense_records, revenue_records, drivers, route_history extension
-- ============================================================

-- ─── Expense records (koszty / faktury kosztowe) ─────────────
CREATE TABLE IF NOT EXISTS expense_records (
  id                BIGSERIAL PRIMARY KEY,
  invoice_number    TEXT UNIQUE,
  invoice_date      DATE,
  vendor            TEXT,
  expense_type      TEXT,
  status            TEXT,
  netto_pln         NUMERIC(12,2),
  brutto_pln        NUMERIC(12,2),
  netto_eur         NUMERIC(12,2),
  brutto_eur        NUMERIC(12,2),
  currency          TEXT,
  vehicle_ref       TEXT,         -- references vehicles.reg loosely
  payment_due       DATE,
  vat_id            TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_date      ON expense_records (invoice_date);
CREATE INDEX IF NOT EXISTS idx_expense_vehicle   ON expense_records (vehicle_ref);
CREATE INDEX IF NOT EXISTS idx_expense_vendor    ON expense_records (vendor);

-- ─── Revenue records (faktury wystawione / przychody) ─────────
CREATE TABLE IF NOT EXISTS revenue_records (
  id                BIGSERIAL PRIMARY KEY,
  invoice_number    TEXT UNIQUE,
  invoice_date      DATE,
  client            TEXT,
  status_platnosci  TEXT,
  invoice_type      TEXT,
  netto_pln         NUMERIC(12,2),
  brutto_pln        NUMERIC(12,2),
  netto_eur         NUMERIC(12,2),
  brutto_eur        NUMERIC(12,2),
  currency          TEXT,
  transport_ref     TEXT,
  wystawil          TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_date     ON revenue_records (invoice_date);
CREATE INDEX IF NOT EXISTS idx_revenue_client   ON revenue_records (client);
CREATE INDEX IF NOT EXISTS idx_revenue_status   ON revenue_records (status_platnosci);

-- ─── Drivers (kartoteka kierowców) ───────────────────────────
CREATE TABLE IF NOT EXISTS drivers (
  id                BIGSERIAL PRIMARY KEY,
  last_name         TEXT NOT NULL,
  first_name        TEXT,
  vehicle_reg       TEXT,
  trailer_reg       TEXT,
  is_driver         BOOLEAN DEFAULT TRUE,
  hire_date         DATE,
  termination_date  DATE,
  country           TEXT,
  country_code      TEXT,
  email             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (last_name, first_name, hire_date)
);

CREATE INDEX IF NOT EXISTS idx_drivers_vehicle ON drivers (vehicle_reg);
CREATE INDEX IF NOT EXISTS idx_drivers_active  ON drivers (termination_date) WHERE termination_date IS NULL;

-- ─── Route history (rejestr transportów / zlecenia) ──────────
-- Extend with columns if table already exists from 001_init.sql
ALTER TABLE route_history
  ADD COLUMN IF NOT EXISTS order_number    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS order_ref       TEXT,
  ADD COLUMN IF NOT EXISTS status          TEXT,
  ADD COLUMN IF NOT EXISTS client          TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_reg     TEXT,
  ADD COLUMN IF NOT EXISTS trailer_reg     TEXT,
  ADD COLUMN IF NOT EXISTS driver_name     TEXT,
  ADD COLUMN IF NOT EXISTS fracht_eur      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS fracht_currency TEXT,
  ADD COLUMN IF NOT EXISTS origin_country  TEXT,
  ADD COLUMN IF NOT EXISTS dest_country    TEXT,
  ADD COLUMN IF NOT EXISTS origin_city     TEXT,
  ADD COLUMN IF NOT EXISTS dest_city       TEXT,
  ADD COLUMN IF NOT EXISTS distance_km     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS margin_eur_km   NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS pickup_date     DATE,
  ADD COLUMN IF NOT EXISTS delivery_date   DATE;

CREATE INDEX IF NOT EXISTS idx_route_order   ON route_history (order_number);
CREATE INDEX IF NOT EXISTS idx_route_vehicle ON route_history (vehicle_reg);
CREATE INDEX IF NOT EXISTS idx_route_pickup  ON route_history (pickup_date);

-- ─── RLS: allow anon read, service role write ─────────────────
ALTER TABLE expense_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_read_expense"  ON expense_records FOR SELECT USING (true);
CREATE POLICY "allow_write_expense" ON expense_records FOR ALL    USING (auth.role() = 'service_role');

CREATE POLICY "allow_read_revenue"  ON revenue_records FOR SELECT USING (true);
CREATE POLICY "allow_write_revenue" ON revenue_records FOR ALL    USING (auth.role() = 'service_role');

CREATE POLICY "allow_read_drivers"  ON drivers         FOR SELECT USING (true);
CREATE POLICY "allow_write_drivers" ON drivers         FOR ALL    USING (auth.role() = 'service_role');
