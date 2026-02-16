-- JABU MARKET Delivery (Phase 1)
-- Run in Supabase SQL Editor

create table if not exists public.riders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  whatsapp text null,
  zone text null,
  fee_note text null,
  is_available boolean not null default true,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- Optional but recommended: store delivery requests for future upgrades
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid null references public.listings(id) on delete set null,
  vendor_id uuid null references public.vendors(id) on delete set null,

  buyer_phone text null,
  pickup_location text null,
  dropoff_location text null,
  note text null,

  rider_id uuid null references public.riders(id) on delete set null,
  status text not null default 'requested'
    check (status in ('requested','assigned','picked_up','delivered','cancelled')),

  created_at timestamptz not null default now()
);

-- RLS (simple Phase 1: public read riders, anyone can create a delivery request)
alter table public.riders enable row level security;
alter table public.deliveries enable row level security;

drop policy if exists "riders public read" on public.riders;
create policy "riders public read"
on public.riders for select
to anon, authenticated
using (true);

drop policy if exists "deliveries public insert" on public.deliveries;
create policy "deliveries public insert"
on public.deliveries for insert
to anon, authenticated
with check (true);

-- Optional: allow reading deliveries (useful for debugging/admin later)
drop policy if exists "deliveries public read" on public.deliveries;
create policy "deliveries public read"
on public.deliveries for select
to anon, authenticated
using (true);
