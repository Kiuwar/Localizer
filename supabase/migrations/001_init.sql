-- Localizador por consentimento: tudo opt-in, expira sozinho, apagável pelo titular (LGPD).
create extension if not exists pgcrypto;

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

-- Zonas do local (ex.: "Entrada", "Praça de alimentação"). beacon_id = nome do beacon BLE do LOCAL (não de pessoas).
create table public.zones (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues on delete cascade,
  name text not null,
  beacon_id text,
  qr_code text not null default encode(gen_random_bytes(6), 'hex') unique
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  version text not null,
  purpose text not null default 'compartilhar localização aproximada (zona) com membros do meu grupo, temporariamente',
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index one_active_consent on public.consents(user_id) where revoked_at is null;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues on delete cascade,
  name text not null,
  code text not null unique default upper(encode(gen_random_bytes(4), 'hex')),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid references public.groups on delete cascade,
  user_id uuid references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.presence (
  group_id uuid references public.groups on delete cascade,
  user_id uuid references auth.users on delete cascade,
  zone_id uuid not null references public.zones on delete cascade,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (group_id, user_id)
);

alter table public.venues enable row level security;
alter table public.zones enable row level security;
alter table public.consents enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.presence enable row level security;

create or replace function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function public.has_consent() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.consents where user_id = auth.uid() and revoked_at is null);
$$;

-- Políticas: escrita só via RPC (abaixo); leitura restrita.
create policy venues_read on public.venues for select to authenticated using (true);
create policy venues_ins on public.venues for insert to authenticated with check (owner = auth.uid());
create policy zones_read on public.zones for select to authenticated using (true);
create policy zones_ins on public.zones for insert to authenticated
  with check (exists (select 1 from public.venues v where v.id = venue_id and v.owner = auth.uid()));
create policy consents_own on public.consents for select to authenticated using (user_id = auth.uid());
create policy groups_read on public.groups for select to authenticated using (public.is_member(id) or owner = auth.uid());
create policy groups_ins on public.groups for insert to authenticated with check (owner = auth.uid());
create policy members_read on public.group_members for select to authenticated using (public.is_member(group_id));
create policy members_leave on public.group_members for delete to authenticated using (user_id = auth.uid());
create policy presence_read on public.presence for select to authenticated
  using (public.is_member(group_id) and expires_at > now());
create policy presence_del on public.presence for delete to authenticated using (user_id = auth.uid());

-- RPCs
create or replace function public.give_consent(v text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  insert into public.consents(user_id, version) values (auth.uid(), v) on conflict do nothing;
end $$;

create or replace function public.revoke_consent() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.consents set revoked_at = now() where user_id = auth.uid() and revoked_at is null;
  delete from public.presence where user_id = auth.uid();
end $$;

create or replace function public.join_group(c text, name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  if not public.has_consent() then raise exception 'consentimento necessário'; end if;
  select id into gid from public.groups where code = upper(c);
  if gid is null then raise exception 'código inválido'; end if;
  insert into public.group_members(group_id, user_id, display_name) values (gid, auth.uid(), name)
    on conflict (group_id, user_id) do update set display_name = excluded.display_name;
  return gid;
end $$;

create or replace function public.share_position(gid uuid, zid uuid, minutes int default 60) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_consent() then raise exception 'consentimento necessário'; end if;
  if not public.is_member(gid) then raise exception 'você não é membro deste grupo'; end if;
  if not exists (select 1 from public.zones z join public.groups g on g.venue_id = z.venue_id
                 where z.id = zid and g.id = gid) then raise exception 'zona inválida'; end if;
  insert into public.presence(group_id, user_id, zone_id, expires_at)
  values (gid, auth.uid(), zid, now() + make_interval(mins => least(greatest(minutes, 5), 240)))
  on conflict (group_id, user_id) do update
    set zone_id = excluded.zone_id, updated_at = now(), expires_at = excluded.expires_at;
end $$;

create or replace function public.stop_sharing() returns void
language sql security definer set search_path = '' as $$
  delete from public.presence where user_id = auth.uid();
$$;

-- Direito de eliminação (LGPD art. 18, VI). Mantém só a prova de consentimento/revogação.
create or replace function public.delete_my_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.consents set revoked_at = coalesce(revoked_at, now()) where user_id = auth.uid();
  delete from public.presence where user_id = auth.uid();
  delete from public.group_members where user_id = auth.uid();
  delete from public.groups where owner = auth.uid();
end $$;

-- Fluxo agregado e anônimo: só mostra zonas com >= 3 pessoas (k-anonimato).
create or replace function public.zone_counts(vid uuid) returns table(zone_id uuid, zone_name text, people int)
language sql stable security definer set search_path = '' as $$
  select z.id, z.name, count(*)::int
  from public.presence p join public.zones z on z.id = p.zone_id
  where z.venue_id = vid and p.expires_at > now()
  group by z.id, z.name having count(*) >= 3;
$$;

-- Retenção mínima: agende com pg_cron (ex.: a cada 15 min).
create or replace function public.purge_expired() returns void
language sql security definer set search_path = '' as $$
  delete from public.presence where expires_at < now();
$$;
revoke all on function public.purge_expired() from public, anon, authenticated;

-- Grupos antigos somem em 30 dias (minimização).
create or replace function public.purge_old_groups() returns void
language sql security definer set search_path = '' as $$
  delete from public.groups where created_at < now() - interval '30 days';
$$;
revoke all on function public.purge_old_groups() from public, anon, authenticated;

alter publication supabase_realtime add table public.presence;
