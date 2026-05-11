-- folders created before uploads (uploads has a FK to folders)
create table public.folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.users (
  id         uuid primary key,
  locale     text not null default 'ja',
  created_at timestamptz not null default now(),
  constraint users_auth_fk  foreign key (id) references auth.users(id) on delete cascade,
  constraint users_locale_ck check (locale in ('ja', 'en'))
);

alter table public.folders
  add constraint folders_user_fk foreign key (user_id) references public.users(id) on delete cascade;

create table public.uploads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  folder_id     uuid references public.folders(id) on delete set null,
  original_path text not null,
  upscaled_path text,
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  constraint uploads_status_ck check (status in ('pending', 'done', 'failed'))
);

create table public.daily_usage (
  user_id uuid not null references public.users(id) on delete cascade,
  date    date not null,
  count   int  not null default 0,
  primary key (user_id, date)
);

create table public.subscription_status (
  user_id              uuid primary key references public.users(id) on delete cascade,
  plan                 text        not null default 'free',
  platform             text,
  provider_customer_id text,
  monthly_count        int         not null default 0,
  monthly_reset_date   date,
  expires_at           timestamptz,
  updated_at           timestamptz not null default now(),
  constraint subscription_plan_ck     check (plan in ('free', 'pro')),
  constraint subscription_platform_ck check (platform is null or platform in ('ios', 'android', 'web'))
);

-- Indexes for common query patterns
create index on public.uploads (user_id, created_at desc);
create index on public.uploads (user_id, status);
create index on public.subscription_status (provider_customer_id);
create index on public.folders (user_id);

-- Enable RLS (policies defined in next migration)
alter table public.users               enable row level security;
alter table public.folders             enable row level security;
alter table public.uploads             enable row level security;
alter table public.daily_usage         enable row level security;
alter table public.subscription_status enable row level security;
