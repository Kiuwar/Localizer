-- QR de zona deixa de ser legível por todos: só o dono do local vê; participantes usam o RPC.
revoke select on public.zones from authenticated, anon;
grant select (id, venue_id, name, beacon_id) on public.zones to authenticated;

create or replace function public.owner_zones(vid uuid)
returns table(id uuid, name text, beacon_id text, qr_code text)
language sql stable security definer set search_path = '' as $$
  select z.id, z.name, z.beacon_id, z.qr_code from public.zones z
  join public.venues v on v.id = z.venue_id where z.venue_id = vid and v.owner = auth.uid();
$$;

create or replace function public.share_by_qr(gid uuid, qr text, minutes int default 60) returns uuid
language plpgsql security definer set search_path = '' as $$
declare zid uuid;
begin
  select z.id into zid from public.zones z join public.groups g on g.venue_id = z.venue_id
   where g.id = gid and z.qr_code = qr;
  if zid is null then raise exception 'QR inválido para este local'; end if;
  perform public.share_position(gid, zid, minutes);
  return zid;
end $$;

create or replace function public.create_group(vid uuid, gname text) returns table(id uuid, code text)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.venues where venues.id = vid and owner = auth.uid()) then
    raise exception 'apenas o dono do local cria grupos'; end if;
  return query insert into public.groups(venue_id, name, owner) values (vid, gname, auth.uid())
    returning groups.id, groups.code;
end $$;

-- Fluxo agregado: só o dono do local consulta.
create or replace function public.zone_counts(vid uuid) returns table(zone_id uuid, zone_name text, people int)
language sql stable security definer set search_path = '' as $$
  select z.id, z.name, count(*)::int
  from public.presence p join public.zones z on z.id = p.zone_id
  join public.venues v on v.id = z.venue_id
  where z.venue_id = vid and v.owner = auth.uid() and p.expires_at > now()
  group by z.id, z.name having count(*) >= 3;
$$;
