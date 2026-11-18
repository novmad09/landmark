-- ⚠ 실행 순서: schema.sql → admin.sql → account.sql. 이 파일은 정책을 모두 지우고 다시 만들기 때문에, 다시 실행했다면 admin.sql 과 account.sql 도 반드시 이어서 실행한다.
-- 랜드마크 · Supabase 설계도 v2 (2026-11)
-- 명소 목록은 앱 안(js/data.js)에 있고, 서버에는 사람들이 만든 기록만 둔다.
-- 여러 번 실행해도 안전하다.

-- ───────── 프로필 (로그인 계정과 1:1) ─────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '여행자' check (char_length(nickname) between 1 and 20),
  strikes int not null default 0,            -- 사진·가이드가 삭제된 횟수
  banned_until timestamptz,                  -- 이 시각까지 올리기 정지
  created_at timestamptz not null default now()
);
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nickname) values (new.id, left(coalesce(new.raw_user_meta_data->>'nickname', '여행자'), 20)) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ───────── 도장 (현장 gps / 사진 photo. 한 명소·하루·종류에 하나) ─────────
create table if not exists stamps (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null,
  day date not null,                         -- 한국 날짜
  kind text not null default 'gps' check (kind in ('gps','photo')),
  at timestamptz not null default now(),
  lat double precision, lng double precision, accuracy double precision,
  unique (user_id, place_id, day, kind)
);
create index if not exists stamps_user_idx on stamps(user_id);
create index if not exists stamps_place_idx on stamps(place_id);

-- ───────── 명소 사진 (공개. 한 명소에 하루 한 장) ─────────
create table if not exists photos (
  id bigint generated always as identity primary key,
  place_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text,
  path text not null,                        -- storage 안의 경로 (지울 때 씀)
  url text not null,
  like_count int not null default 0,
  report_count int not null default 0,
  hidden boolean not null default false,     -- 신고 누적·운영자 판단으로 숨김
  created_at timestamptz not null default now()
);
create index if not exists photos_place_idx on photos(place_id, like_count desc);
create unique index if not exists photos_one_per_place_day on photos (user_id, place_id, ((created_at at time zone 'Asia/Seoul')::date));
create table if not exists photo_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_id bigint not null references photos(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (user_id, photo_id)
);

-- ───────── 가이드 (공개) ─────────
create table if not exists guides (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text,
  title text not null check (char_length(title) between 1 and 60),
  data jsonb not null,                       -- 들르는 곳·시간·팁 등 앱이 쓰는 내용 그대로
  like_count int not null default 0,
  completions int not null default 0,
  report_count int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists guide_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  guide_id text not null references guides(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (user_id, guide_id)
);

-- ───────── 받은 편지함: 명소 제안 / 수정 제안 / 문의 / 신고 ─────────
-- 로그인하지 않아도 보낼 수 있다(device = 기기마다 만든 임의 번호). 읽는 것은 운영자만.
create table if not exists suggestions (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  device text check (char_length(device) <= 64),
  nickname text check (char_length(nickname) <= 20),
  name text not null check (char_length(name) between 1 and 40),
  descr text check (char_length(descr) <= 300),
  lat double precision not null, lng double precision not null,
  show_name boolean not null default true,
  photo_url text,
  status text not null default 'wait' check (status in ('wait','ok','no','dup')),
  place_id text,                             -- 통과되면 만들어진 명소 번호
  created_at timestamptz not null default now()
);
create table if not exists fixes (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  device text check (char_length(device) <= 64),
  place_id text not null,
  kind text not null check (kind in ('pos','info','gone','etc')),
  body text check (char_length(body) <= 300),
  lat double precision, lng double precision, accuracy double precision,
  status text not null default 'wait' check (status in ('wait','done','no')),
  created_at timestamptz not null default now()
);
create table if not exists feedback (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  device text check (char_length(device) <= 64),
  body text not null check (char_length(body) between 1 and 500),
  app_version text check (char_length(app_version) <= 12),
  created_at timestamptz not null default now()
);
create table if not exists reports (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  device text check (char_length(device) <= 64),
  target_type text not null check (target_type in ('photo','guide','user')),
  target_id text not null,
  reason text check (char_length(reason) <= 40),
  body text check (char_length(body) <= 300),
  status text not null default 'wait' check (status in ('wait','removed','kept')),
  created_at timestamptz not null default now()
);
create index if not exists reports_target_idx on reports(target_type, target_id);

-- ───────── 권한 (RLS) ─────────
alter table profiles enable row level security;   alter table stamps enable row level security;
alter table photos enable row level security;     alter table photo_likes enable row level security;
alter table guides enable row level security;     alter table guide_likes enable row level security;
alter table suggestions enable row level security; alter table fixes enable row level security;
alter table feedback enable row level security;   alter table reports enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop execute format('drop policy if exists %I on %I', r.policyname, r.tablename); end loop;
end $$;

-- 올리기 정지 중인지 (정책 안에서 쓴다. 경고·정지 칸은 남이 못 보게 막아 두었으므로 함수로 확인한다)
create or replace function is_banned() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and banned_until > now()) $$;
grant execute on function is_banned() to anon, authenticated;
-- 남들이 볼 수 있는 것은 닉네임뿐. 고칠 수 있는 것도 자기 닉네임뿐 (경고·정지는 운영자 함수로만)
revoke select, update on profiles from anon, authenticated;
grant select (id, nickname, created_at) on profiles to anon, authenticated;
grant update (nickname) on profiles to authenticated;
create policy "profiles read" on profiles for select using (true);
create policy "profiles update own" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "stamps read own" on stamps for select using (auth.uid() = user_id);
create policy "stamps insert own" on stamps for insert with check (auth.uid() = user_id);
create policy "stamps delete own" on stamps for delete using (auth.uid() = user_id);

create policy "photos read" on photos for select using (not hidden or auth.uid() = user_id);
create policy "photos insert own" on photos for insert with check (
  auth.uid() = user_id and like_count = 0 and report_count = 0 and not hidden
  and not is_banned());
create policy "photos delete own" on photos for delete using (auth.uid() = user_id);
create policy "photo_likes read own" on photo_likes for select using (auth.uid() = user_id);

create policy "guides read" on guides for select using (not hidden or auth.uid() = user_id);
create policy "guides insert own" on guides for insert with check (
  auth.uid() = user_id and like_count = 0 and completions = 0 and report_count = 0 and not hidden
  and not is_banned());
create policy "guides delete own" on guides for delete using (auth.uid() = user_id);
create policy "guide_likes read own" on guide_likes for select using (auth.uid() = user_id);

-- 받은 편지함: 누구나 넣을 수만 있다. (본인이 로그인해 보낸 명소 제안만 진행 상황을 볼 수 있다)
create policy "suggestions insert" on suggestions for insert with check (status = 'wait' and place_id is null and (user_id is null or user_id = auth.uid()));
create policy "suggestions read own" on suggestions for select using (auth.uid() = user_id);
create policy "fixes insert" on fixes for insert with check (status = 'wait' and (user_id is null or user_id = auth.uid()));
create policy "feedback insert" on feedback for insert with check (user_id is null or user_id = auth.uid());
create policy "reports insert" on reports for insert with check (status = 'wait' and (user_id is null or user_id = auth.uid()));

-- ───────── 서버에서 처리하는 동작 ─────────
-- 가이드 고치기: 내용만 바꿀 수 있게 (추천 수 등은 못 건드린다)
create or replace function save_guide(p_id text, p_title text, p_data jsonb, p_nickname text) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if exists (select 1 from profiles where id = auth.uid() and banned_until > now()) then raise exception 'banned'; end if;
  insert into guides (id, user_id, nickname, title, data) values (p_id, auth.uid(), left(p_nickname, 20), p_title, p_data)
  on conflict (id) do update set title = excluded.title, data = excluded.data, nickname = excluded.nickname, updated_at = now() where guides.user_id = auth.uid();
end $$;

create or replace function toggle_photo_like(p_photo_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_liked boolean; v_count int;
begin
  if v_uid is null then raise exception 'login required'; end if;
  if exists (select 1 from photo_likes where user_id = v_uid and photo_id = p_photo_id) then delete from photo_likes where user_id = v_uid and photo_id = p_photo_id; v_liked := false;
  else insert into photo_likes (user_id, photo_id) values (v_uid, p_photo_id); v_liked := true; end if;
  update photos set like_count = (select count(*) from photo_likes where photo_id = p_photo_id) where id = p_photo_id returning like_count into v_count;
  return jsonb_build_object('liked', v_liked, 'like_count', v_count);
end $$;

create or replace function toggle_guide_like(p_guide_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_liked boolean; v_count int;
begin
  if v_uid is null then raise exception 'login required'; end if;
  if exists (select 1 from guide_likes where user_id = v_uid and guide_id = p_guide_id) then delete from guide_likes where user_id = v_uid and guide_id = p_guide_id; v_liked := false;
  else insert into guide_likes (user_id, guide_id) values (v_uid, p_guide_id); v_liked := true; end if;
  update guides set like_count = (select count(*) from guide_likes where guide_id = p_guide_id) where id = p_guide_id returning like_count into v_count;
  return jsonb_build_object('liked', v_liked, 'like_count', v_count);
end $$;

-- 신고가 들어오면: 서로 다른 3명(기기)이 신고한 사진·가이드는 바로 숨긴다 → 운영자가 확인해 지우거나 되살린다
create or replace function on_report() returns trigger language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  select count(distinct coalesce(user_id::text, device)) into v_n from reports where target_type = new.target_type and target_id = new.target_id;
  if new.target_type = 'photo' and new.target_id ~ '^[0-9]+$' then update photos set report_count = v_n, hidden = hidden or v_n >= 3 where id = new.target_id::bigint;
  elsif new.target_type = 'guide' then update guides set report_count = v_n, hidden = hidden or v_n >= 3 where id = new.target_id; end if;
  return new;
end $$;
drop trigger if exists reports_after_insert on reports;
create trigger reports_after_insert after insert on reports for each row execute function on_report();

-- 계정·기록 전부 삭제 (스토어 필수). 사진 파일은 앱이 storage 에서 먼저 지운 뒤 부른다
create or replace function delete_my_account() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from photo_likes where user_id = auth.uid(); delete from guide_likes where user_id = auth.uid();
  delete from photos where user_id = auth.uid(); delete from guides where user_id = auth.uid();
  delete from stamps where user_id = auth.uid(); delete from profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function save_guide(text, text, jsonb, text), toggle_photo_like(bigint), toggle_guide_like(text), delete_my_account() from public, anon;
grant execute on function save_guide(text, text, jsonb, text), toggle_photo_like(bigint), toggle_guide_like(text), delete_my_account() to authenticated;

-- ───────── 사진 저장소 ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('photos', 'photos', true, 1048576, array['image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg','image/webp'];
drop policy if exists "photos upload own folder" on storage.objects; drop policy if exists "photos delete own files" on storage.objects;
create policy "photos upload own folder" on storage.objects for insert with check (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "photos delete own files" on storage.objects for delete using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);
-- 자기 폴더의 파일을 볼 수 있어야 지울 수도 있다 (공개 주소로 보는 것과는 별개)
drop policy if exists "photos read own files" on storage.objects;
create policy "photos read own files" on storage.objects for select using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- 내가 보낸 명소 제안의 진행 상황 (로그인했으면 내 계정 것, 아니면 이 기기에서 보낸 것)
create or replace function my_suggestions(p_device text) returns table (id bigint, name text, status text, place_id text, created_at timestamptz) language sql security definer set search_path = public as $$
  select s.id, s.name, s.status, s.place_id, s.created_at from suggestions s
  where (auth.uid() is not null and s.user_id = auth.uid()) or (p_device is not null and char_length(p_device) >= 12 and s.device = p_device)
  order by s.created_at desc limit 200;
$$;
grant execute on function my_suggestions(text) to anon, authenticated;
