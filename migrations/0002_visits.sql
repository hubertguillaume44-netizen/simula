create table if not exists visits (
  id serial primary key,
  path text not null,
  referrer text not null default '',
  country text not null default '',
  session text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists visits_created_at_idx on visits (created_at);
create index if not exists visits_session_idx on visits (session);
create index if not exists visits_referrer_idx on visits (referrer);
