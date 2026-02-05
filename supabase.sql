-- HabitGlo Supabase schema + RLS
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  subscription_status text default 'free',
  theme_preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists habits (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  color text,
  speed integer,
  is_active boolean default true,
  priority integer default 0,
  created_at timestamptz default now(),
  last_done_at timestamptz,
  streak_current integer default 0,
  streak_best integer default 0
);

-- Migration: Add streak columns to existing habits table (run if table already exists)
-- ALTER TABLE habits ADD COLUMN IF NOT EXISTS streak_current integer default 0;
-- ALTER TABLE habits ADD COLUMN IF NOT EXISTS streak_best integer default 0;

create table if not exists habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id text not null references habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz default now()
);

create index if not exists habits_user_id_idx on habits(user_id);
create index if not exists habit_logs_user_id_idx on habit_logs(user_id);
create index if not exists habit_logs_habit_id_idx on habit_logs(habit_id);

alter table profiles enable row level security;
alter table habits enable row level security;
alter table habit_logs enable row level security;

-- Profiles policies
create policy "Profiles are viewable by owner"
  on profiles for select
  using (auth.uid() = user_id);

create policy "Profiles are insertable by owner"
  on profiles for insert
  with check (auth.uid() = user_id);

create policy "Profiles are updatable by owner"
  on profiles for update
  using (auth.uid() = user_id);

-- Habits policies
create policy "Habits are viewable by owner"
  on habits for select
  using (auth.uid() = user_id);

create policy "Habits are insertable by owner"
  on habits for insert
  with check (auth.uid() = user_id);

create policy "Habits are updatable by owner"
  on habits for update
  using (auth.uid() = user_id);

create policy "Habits are deletable by owner"
  on habits for delete
  using (auth.uid() = user_id);

-- Habit logs policies
create policy "Habit logs are viewable by owner"
  on habit_logs for select
  using (auth.uid() = user_id);

create policy "Habit logs are insertable by owner"
  on habit_logs for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from habits h
      where h.id = habit_logs.habit_id and h.user_id = auth.uid()
    )
  );

create policy "Habit logs are deletable by owner"
  on habit_logs for delete
  using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
