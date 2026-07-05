create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create type post_type as enum ('missing', 'found');
create type microchip_status as enum ('yes', 'no', 'unknown');
create type post_status as enum ('active', 'resolved');

create table posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  type post_type not null,
  species text not null,
  breed text,
  color text,
  size text,
  collar boolean not null default false,
  collar_description text,
  microchipped microchip_status not null default 'unknown',
  distinctive_markings text,
  pet_name text,
  reward_amount numeric,
  location_lat double precision not null,
  location_lng double precision not null,
  location_text text not null,
  date_lost_or_found date not null,
  status post_status not null default 'active',
  created_at timestamptz not null default now()
);

create table post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table posts enable row level security;
alter table post_photos enable row level security;

create policy "profiles are viewable by everyone" on profiles
  for select using (true);
create policy "users can insert their own profile" on profiles
  for insert with check (auth.uid() = id);
create policy "users can update their own profile" on profiles
  for update using (auth.uid() = id);

create policy "posts are viewable by everyone" on posts
  for select using (true);
create policy "users can insert their own posts" on posts
  for insert with check (auth.uid() = owner_id);
create policy "owners can update their own posts" on posts
  for update using (auth.uid() = owner_id);
create policy "owners can delete their own posts" on posts
  for delete using (auth.uid() = owner_id);

create policy "post photos are viewable by everyone" on post_photos
  for select using (true);
create policy "owners can insert photos on their posts" on post_photos
  for insert with check (
    exists (select 1 from posts where posts.id = post_id and posts.owner_id = auth.uid())
  );
create policy "owners can delete photos on their posts" on post_photos
  for delete using (
    exists (select 1 from posts where posts.id = post_id and posts.owner_id = auth.uid())
  );
