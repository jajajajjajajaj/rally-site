-- 집결 배정 사이트: 테이블 + 접근 권한
-- Supabase SQL Editor에 전체를 붙여넣고 Run 하세요.

-- 1) 설정 (현재 회차)
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);
insert into settings (key, value) values ('current_season', '1')
  on conflict (key) do nothing;

-- 2) 사용자 제출
create table if not exists submissions (
  id          bigint generated always as identity primary key,
  season      int  not null,
  name        text not null,
  slots       text[] not null default '{}',
  trial_rank  text not null,
  inf_tg int not null check (inf_tg between 1 and 8),
  inf_t  int not null check (inf_t  between 9 and 11),
  arc_tg int not null check (arc_tg between 1 and 8),
  arc_t  int not null check (arc_t  between 9 and 11),
  cav_tg int not null check (cav_tg between 1 and 8),
  cav_t  int not null check (cav_t  between 9 and 11),
  heroes      jsonb not null default '{}',   -- {"파드": true, ...}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (season, name)                     -- 같은 회차·같은 이름은 덮어쓰기
);

-- 3) 배정 결과 (회차당 1행)
create table if not exists assignments (
  season     int primary key,
  leaders    jsonb not null default '[null,null,null,null,null,null]',
  reqs       jsonb not null default '{}',
  groups     jsonb not null default '[[],[],[],[],[],[]]',
  unassigned jsonb not null default '[]',
  published  boolean not null default false,
  updated_at timestamptz not null default now()
);

-- updated_at 자동 갱신
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists submissions_touch on submissions;
create trigger submissions_touch before update on submissions
  for each row execute function touch_updated_at();
drop trigger if exists assignments_touch on assignments;
create trigger assignments_touch before update on assignments
  for each row execute function touch_updated_at();

-- 4) 접근 권한 (RLS)
-- 원칙: 사용자는 제출만 가능, 공개된 배정만 조회 가능.
--       제출 목록 열람·배정 편집은 Edge Function(관리자 코드 검증)만 가능.
alter table settings    enable row level security;
alter table submissions enable row level security;
alter table assignments enable row level security;

-- settings: 누구나 읽기 (현재 회차 표시용)
drop policy if exists "settings read" on settings;
create policy "settings read" on settings for select using (true);

-- submissions: 누구나 제출/덮어쓰기 가능, 읽기는 불가
drop policy if exists "submissions insert" on submissions;
create policy "submissions insert" on submissions for insert with check (true);
drop policy if exists "submissions update own" on submissions;
create policy "submissions update own" on submissions for update using (true) with check (true);

-- assignments: 공개된 회차만 읽기 가능, 쓰기 불가
drop policy if exists "assignments read published" on assignments;
create policy "assignments read published" on assignments for select using (published = true);
