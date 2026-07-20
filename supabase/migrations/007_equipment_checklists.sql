-- ============================================================
-- TruckCalc HBM — Checklista wyposażenia pojazdu
-- Tabela była tworzona ręcznie w Supabase (bez trackowanej migracji),
-- a kolumny podpisów z commita 509c5b1 nigdy nie trafiły do repo.
-- Ten plik domyka schemat: bootstrap tabeli + wszystkie późniejsze kolumny.
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists equipment_checklists (
  id                 uuid primary key default uuid_generate_v4(),
  vehicle_reg        text not null,
  checklist_type     text,               -- 'ciagnik' | 'naczepa' | ...
  driver_name        text,
  mechanic_name      text,
  km_reading         int,
  items              jsonb,              -- [{id, label, qty, status, notes}, ...]
  overall_status     text,               -- 'complete' | 'incomplete'
  notes              text,
  created_at         timestamptz default now()
);

-- Kolumny dodane po utworzeniu tabeli (idempotentne):
alter table equipment_checklists add column if not exists vehicle_condition  text;  -- migracja 005
alter table equipment_checklists add column if not exists driver_signature   text;  -- PNG base64 (commit 509c5b1)
alter table equipment_checklists add column if not exists mechanic_signature text;  -- PNG base64 (commit 509c5b1)

create index if not exists idx_equipment_checklists_reg
  on equipment_checklists (vehicle_reg, created_at desc);
