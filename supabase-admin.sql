-- 랜드마크 · 관리자 기능 (admin.html 이 쓴다). 여러 번 실행해도 안전하다.
create table if not exists admins (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
alter table admins enable row level security;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from admins where user_id = auth.uid()) $$;
grant execute on function is_admin() to anon, authenticated;

-- 하루 이용 기록: 기기마다 하루 한 줄 (누가 무엇을 했는지는 적지 않는다)
create table if not exists visits (day date not null, device text not null check (char_length(device) between 12 and 64), user_id uuid, app_version text, primary key (day, device));
alter table visits enable row level security;
create or replace function ping(p_device text, p_version text default null) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_device is null or char_length(p_device) not between 12 and 64 then return; end if;
  insert into visits (day, device, user_id, app_version) values ((now() at time zone 'Asia/Seoul')::date, p_device, auth.uid(), left(p_version, 12))
  on conflict (day, device) do update set user_id = coalesce(excluded.user_id, visits.user_id), app_version = excluded.app_version;
end $$;
grant execute on function ping(text, text) to anon, authenticated;

-- 관리자는 받은 편지함과 올라온 내용을 모두 보고 고칠 수 있다
do $$ declare t text; begin
  foreach t in array array['suggestions','fixes','feedback','reports','photos','guides','profiles','stamps','visits','admins'] loop
    execute format('drop policy if exists "admin all" on %I', t);
    execute format('create policy "admin all" on %I for all using (is_admin()) with check (is_admin())', t);
  end loop; end $$;
drop policy if exists "photos admin files" on storage.objects;
create policy "photos admin files" on storage.objects for all using (bucket_id = 'photos' and is_admin()) with check (bucket_id = 'photos' and is_admin());

-- 한눈에 보기: 오늘 숫자 + 최근 14일
create or replace function admin_stats() returns jsonb language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; r jsonb;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  select jsonb_build_object(
    'today', d,
    'dau', (select count(*) from visits where day = d),
    'dau_login', (select count(*) from visits where day = d and user_id is not null),
    'users', (select count(*) from profiles),
    'new_users', (select count(*) from profiles where (created_at at time zone 'Asia/Seoul')::date = d),
    'stamps_today', (select count(*) from stamps where day = d),
    'stamps', (select count(*) from stamps),
    'photos_today', (select count(*) from photos where (created_at at time zone 'Asia/Seoul')::date = d),
    'photos', (select count(*) from photos), 'photos_hidden', (select count(*) from photos where hidden),
    'guides_today', (select count(*) from guides where (created_at at time zone 'Asia/Seoul')::date = d),
    'guides', (select count(*) from guides),
    'wait', jsonb_build_object('reports', (select count(*) from reports where status = 'wait'), 'suggestions', (select count(*) from suggestions where status = 'wait'), 'fixes', (select count(*) from fixes where status = 'wait'), 'feedback', (select count(*) from feedback where (created_at at time zone 'Asia/Seoul')::date >= d - 7)),
    'days', (select jsonb_agg(jsonb_build_object('day', g.day, 'dau', (select count(*) from visits v where v.day = g.day), 'stamps', (select count(*) from stamps s where s.day = g.day), 'new_users', (select count(*) from profiles p where (p.created_at at time zone 'Asia/Seoul')::date = g.day), 'photos', (select count(*) from photos ph where (ph.created_at at time zone 'Asia/Seoul')::date = g.day)) order by g.day)
             from (select generate_series(d - 13, d, interval '1 day')::date as day) g),
    'top_places', (select coalesce(jsonb_agg(jsonb_build_object('place_id', place_id, 'n', n) order by n desc), '[]'::jsonb) from (select place_id, count(*) n from stamps where day >= d - 6 group by place_id order by n desc limit 10) t)
  ) into r; return r;
end $$;
grant execute on function admin_stats() to authenticated;

-- 신고 처리: 지우기(올린 사람 경고 1회 → 2회 7일 정지 → 3회 영구 정지) 또는 문제없음(되살리기)
create or replace function admin_resolve(p_type text, p_id text, p_remove boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_path text; v_strikes int;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if p_type = 'photo' then
    select user_id, path into v_user, v_path from photos where id = p_id::bigint;
    if p_remove then delete from photos where id = p_id::bigint; else update photos set hidden = false, report_count = 0 where id = p_id::bigint; end if;
  elsif p_type = 'guide' then
    select user_id into v_user from guides where id = p_id;
    if p_remove then delete from guides where id = p_id; else update guides set hidden = false, report_count = 0 where id = p_id; end if;
  end if;
  update reports set status = case when p_remove then 'removed' else 'kept' end where target_type = p_type and target_id = p_id and status = 'wait';
  if p_remove and v_user is not null then
    update profiles set strikes = strikes + 1, banned_until = case when strikes + 1 >= 3 then 'infinity'::timestamptz when strikes + 1 = 2 then now() + interval '7 days' else banned_until end where id = v_user returning strikes into v_strikes;
  end if;
  return jsonb_build_object('path', v_path, 'strikes', v_strikes);
end $$;
grant execute on function admin_resolve(text, text, boolean) to authenticated;

-- 사용자 목록 (이메일·활동 수·정지 상태). 관리자만.
create or replace function admin_users() returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into r from (
    select p.id, p.nickname, u.email, p.strikes, p.created_at,
      case when p.banned_until = 'infinity' then 'forever' when p.banned_until > now() then to_char(p.banned_until at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') end as ban,
      (select max(v.day) from visits v where v.user_id = p.id) as last_day,
      (select count(*) from stamps s where s.user_id = p.id) as stamps,
      (select count(*) from photos ph where ph.user_id = p.id) as photos,
      (select count(*) from guides g where g.user_id = p.id) as guides,
      exists (select 1 from admins a where a.user_id = p.id) as admin
    from profiles p left join auth.users u on u.id = p.id order by p.created_at desc limit 1000) x;
  return r;
end $$;
grant execute on function admin_users() to authenticated;

-- 정지·해제·경고 지우기. p_days: null=그대로, 0=해제, 음수=영구, 양수=그 날수만큼
create or replace function admin_ban(p_id uuid, p_days int default null, p_reset boolean default false) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  update profiles set banned_until = case when p_days is null then banned_until when p_days = 0 then null when p_days < 0 then 'infinity'::timestamptz else now() + make_interval(days => p_days) end,
    strikes = case when p_reset then 0 else strikes end where id = p_id;
end $$;
grant execute on function admin_ban(uuid, int, boolean) to authenticated;

-- 사용자가 자기 경고·정지를 스스로 고치지 못하게: 닉네임만 바꿀 수 있다
revoke update on profiles from anon, authenticated;
grant update (nickname) on profiles to authenticated;
