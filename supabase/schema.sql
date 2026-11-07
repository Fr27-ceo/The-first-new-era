-- قاعدة بيانات منصة العصر الجديد الأول
-- الصق الملف كله في Supabase > SQL Editor ثم Run (مرة واحدة)

-- يحذف الجداول التجريبية من الملف القديم supabase-setup.sql إن كنت شغّلته
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.leaderboard(int);
drop table if exists public.answers, public.quiz_results, public.profiles cascade;


create type public.app_role as enum ('admin','moderator','user');
create type public.content_origin as enum ('official','editorial','ai_generated','demo');
create type public.verification_status as enum ('unverified','pending','verified');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'طالب',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles read" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- curriculum
create table public.content_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text,
  academic_year text not null,
  origin public.content_origin not null,
  status public.verification_status not null default 'unverified',
  notes text,
  retrieved_at date,
  created_at timestamptz not null default now()
);
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  accent text not null default 'violet',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title_ar text not null,
  academic_year text not null,
  sort_order int not null default 0,
  status public.verification_status not null default 'unverified',
  source_id uuid references public.content_sources(id),
  created_at timestamptz not null default now()
);
create table public.units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title_ar text not null,
  summary_ar text,
  sort_order int not null default 0,
  status public.verification_status not null default 'unverified',
  origin public.content_origin not null default 'demo',
  source_id uuid references public.content_sources(id),
  created_at timestamptz not null default now()
);
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  title_ar text not null,
  overview_ar text,
  objectives_ar text[] not null default '{}',
  body jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  status public.verification_status not null default 'unverified',
  origin public.content_origin not null default 'demo',
  source_id uuid references public.content_sources(id),
  created_at timestamptz not null default now()
);
create table public.concepts (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  title_ar text not null,
  explanation_ar text,
  formula_tex text,
  sort_order int not null default 0,
  origin public.content_origin not null default 'demo',
  created_at timestamptz not null default now()
);
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.concepts(id) on delete cascade,
  prompt_ar text not null,
  explanation_ar text,
  difficulty smallint not null default 1,
  xp_value int not null default 10,
  origin public.content_origin not null default 'demo',
  created_at timestamptz not null default now()
);
create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label_ar text not null,
  is_correct boolean not null default false,
  sort_order int not null default 0
);
create index on public.courses(subject_id);
create index on public.units(course_id);
create index on public.lessons(unit_id);
create index on public.concepts(lesson_id);
create index on public.questions(concept_id);
create index on public.question_options(question_id);

do $$ declare t text; begin
  foreach t in array array['content_sources','subjects','courses','units','lessons','concepts','questions'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "admin write" on public.%I for all to authenticated using (public.has_role(auth.uid(),''admin'')) with check (public.has_role(auth.uid(),''admin''))', t);
  end loop;
end $$;

-- options: hide is_correct from clients (answers checked on server)
grant select (id, question_id, label_ar, sort_order) on public.question_options to anon, authenticated;
grant all on public.question_options to service_role;
alter table public.question_options enable row level security;
create policy "public read" on public.question_options for select to anon, authenticated using (true);
create policy "admin write" on public.question_options for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- user learning data
create table public.learning_preferences (
  user_id uuid primary key,
  explanation_style text not null default 'balanced',
  explanation_length text not null default 'detailed',
  daily_goal_xp int not null default 50 check (daily_goal_xp between 10 and 500),
  reduce_motion boolean not null default false,
  large_text boolean not null default false,
  notify_streak boolean not null default true,
  notify_revision boolean not null default true,
  show_on_leaderboard boolean not null default true,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.learning_preferences to authenticated;
grant all on public.learning_preferences to service_role;
alter table public.learning_preferences enable row level security;
create policy "own prefs" on public.learning_preferences for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  correct_count int not null default 0,
  total_count int not null default 0,
  xp_awarded int not null default 0
);
create index on public.quiz_attempts(user_id, started_at desc);
create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  user_id uuid not null,
  question_id uuid not null references public.questions(id) on delete cascade,
  option_id uuid not null references public.question_options(id) on delete cascade,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);
create table public.lesson_progress (
  user_id uuid not null,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  progress_pct int not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create table public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount int not null,
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index on public.xp_transactions(user_id, created_at desc);
create table public.streaks (
  user_id uuid primary key,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_activity_date date,
  updated_at timestamptz not null default now()
);
create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title_ar text not null,
  description_ar text not null,
  icon text not null default 'achievements',
  xp_reward int not null default 0
);
create table public.user_achievements (
  user_id uuid not null,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  model text not null,
  prompt_chars int not null,
  response_chars int not null default 0,
  status text not null,
  created_at timestamptz not null default now()
);
create index on public.ai_interactions(user_id, created_at desc);

-- read-only for owners; writes only via server (service_role)
do $$ declare t text; begin
  foreach t in array array['quiz_attempts','attempt_answers','lesson_progress','xp_transactions','streaks','user_achievements','ai_interactions'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own read" on public.%I for select to authenticated using (auth.uid() = user_id)', t);
  end loop;
end $$;
grant select on public.achievements, public.seasons to anon, authenticated;
grant all on public.achievements, public.seasons to service_role;
alter table public.achievements enable row level security;
alter table public.seasons enable row level security;
create policy "public read" on public.achievements for select to anon, authenticated using (true);
create policy "public read" on public.seasons for select to anon, authenticated using (true);

-- leaderboard: only name + xp of opted-in users
create or replace function public.get_leaderboard(_limit int default 50)
returns table(rank bigint, user_id uuid, display_name text, total_xp bigint, is_me boolean)
language sql stable security definer set search_path = public as $$
  select row_number() over (order by sum(x.amount) desc), p.id, p.display_name, sum(x.amount)::bigint, p.id = auth.uid()
  from public.profiles p
  join public.xp_transactions x on x.user_id = p.id
  left join public.learning_preferences lp on lp.user_id = p.id
  where coalesce(lp.show_on_leaderboard, true)
  group by p.id, p.display_name
  order by sum(x.amount) desc
  limit least(greatest(_limit,1),100)
$$;
revoke execute on function public.get_leaderboard(int) from public, anon;
grant execute on function public.get_leaderboard(int) to authenticated;

-- signup trigger
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), nullif(trim(new.raw_user_meta_data->>'name'),''), 'طالب'), 20));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  insert into public.learning_preferences (user_id) values (new.id);
  insert into public.streaks (user_id) values (new.id);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- seed: subjects, placeholder structure, demo concept
insert into public.content_sources (id, title, academic_year, origin, status, notes) values
 ('00000000-0000-0000-0000-0000000000d1','Demo content (not curriculum)','2026/2027','demo','unverified','Illustrative only. Replace with verified Ministry material.');
insert into public.subjects (id, slug, name_ar, name_en, description_ar, accent, sort_order) values
 ('00000000-0000-0000-0000-000000000a01','physics','الفيزياء','Physics','الكهرباء والمغناطيسية والفيزياء الحديثة — في انتظار المنهج المعتمد.','blue',1),
 ('00000000-0000-0000-0000-000000000a02','chemistry','الكيمياء','Chemistry','الكيمياء للصف الثالث الثانوي — في انتظار المنهج المعتمد.','violet',2);
insert into public.courses (id, subject_id, title_ar, academic_year, status) values
 ('00000000-0000-0000-0000-000000000b01','00000000-0000-0000-0000-000000000a01','فيزياء الصف الثالث الثانوي','2026/2027','unverified'),
 ('00000000-0000-0000-0000-000000000b02','00000000-0000-0000-0000-000000000a02','كيمياء الصف الثالث الثانوي','2026/2027','unverified');
insert into public.units (id, course_id, title_ar, summary_ar, sort_order, origin, source_id) values
 ('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-000000000b01','وحدة تجريبية (عرض توضيحي)','وحدة توضيحية لاختبار التجربة فقط — ليست من المنهج الرسمي.',1,'demo','00000000-0000-0000-0000-0000000000d1'),
 ('00000000-0000-0000-0000-000000000c02','00000000-0000-0000-0000-000000000b02','وحدة تجريبية (عرض توضيحي)','وحدة توضيحية لاختبار التجربة فقط — ليست من المنهج الرسمي.',1,'demo','00000000-0000-0000-0000-0000000000d1');
insert into public.lessons (id, unit_id, title_ar, overview_ar, objectives_ar, body, origin, source_id) values
 ('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-000000000c01','درس تجريبي: قانون أوم','مثال توضيحي لطريقة عرض الدروس والمعادلات.', array['فهم العلاقة بين الجهد والتيار والمقاومة','تطبيق القانون في مسائل بسيطة'],
  '[{"type":"text","text":"ينص قانون أوم على أن التيار المار في موصل يتناسب طرديًا مع فرق الجهد بين طرفيه عند ثبوت درجة الحرارة."},{"type":"formula","tex":"V = I \\times R"},{"type":"note","text":"محتوى توضيحي — سيتم استبداله بمحتوى معتمد."}]'::jsonb,'demo','00000000-0000-0000-0000-0000000000d1'),
 ('00000000-0000-0000-0000-000000000e02','00000000-0000-0000-0000-000000000c02','درس تجريبي: المول','مثال توضيحي لطريقة عرض الدروس والمعادلات.', array['تعريف المول','حساب عدد المولات من الكتلة'],
  '[{"type":"text","text":"المول هو كمية المادة التي تحتوي على عدد أفوجادرو من الجسيمات."},{"type":"formula","tex":"n = \\dfrac{m}{M}"},{"type":"note","text":"محتوى توضيحي — سيتم استبداله بمحتوى معتمد."}]'::jsonb,'demo','00000000-0000-0000-0000-0000000000d1');
insert into public.concepts (id, lesson_id, title_ar, explanation_ar, formula_tex) values
 ('00000000-0000-0000-0000-000000000f01','00000000-0000-0000-0000-000000000e01','حساب التيار من الجهد والمقاومة','التيار يساوي الجهد مقسومًا على المقاومة.','I = \dfrac{V}{R}'),
 ('00000000-0000-0000-0000-000000000f02','00000000-0000-0000-0000-000000000e02','حساب عدد المولات','عدد المولات يساوي الكتلة مقسومة على الكتلة المولية.','n = \dfrac{m}{M}');
insert into public.questions (id, concept_id, prompt_ar, explanation_ar) values
 ('00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000000f01','مقاومة قيمتها 10 أوم وفرق الجهد بين طرفيها 20 فولت. ما شدة التيار؟','I = V / R = 20 / 10 = 2 أمبير.'),
 ('00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000000f01','إذا تضاعف فرق الجهد مع ثبات المقاومة، فإن التيار:','التيار يتناسب طرديًا مع الجهد، لذا يتضاعف.'),
 ('00000000-0000-0000-0000-000000001003','00000000-0000-0000-0000-000000000f02','كم عدد مولات 36 جرام من الماء؟ (M = 18 g/mol)','n = 36 / 18 = 2 مول.'),
 ('00000000-0000-0000-0000-000000001004','00000000-0000-0000-0000-000000000f02','الكتلة المولية لمادة 40 g/mol، فما كتلة 0.5 مول منها؟','m = n × M = 0.5 × 40 = 20 جرام.');
insert into public.question_options (question_id, label_ar, is_correct, sort_order) values
 ('00000000-0000-0000-0000-000000001001','0.5 أمبير',false,1),('00000000-0000-0000-0000-000000001001','2 أمبير',true,2),('00000000-0000-0000-0000-000000001001','200 أمبير',false,3),('00000000-0000-0000-0000-000000001001','30 أمبير',false,4),
 ('00000000-0000-0000-0000-000000001002','يقل للنصف',false,1),('00000000-0000-0000-0000-000000001002','يتضاعف',true,2),('00000000-0000-0000-0000-000000001002','يبقى ثابتًا',false,3),
 ('00000000-0000-0000-0000-000000001003','0.5 مول',false,1),('00000000-0000-0000-0000-000000001003','2 مول',true,2),('00000000-0000-0000-0000-000000001003','18 مول',false,3),
 ('00000000-0000-0000-0000-000000001004','80 جرام',false,1),('00000000-0000-0000-0000-000000001004','20 جرام',true,2),('00000000-0000-0000-0000-000000001004','0.0125 جرام',false,3);
insert into public.achievements (code, title_ar, description_ar, icon, xp_reward) values
 ('first_practice','أول خطوة','أكمل أول جلسة تدريب','practice',20),
 ('perfect_session','إجابات كاملة','أجب عن كل أسئلة جلسة بشكل صحيح','achievements',30),
 ('streak_3','ثلاثة أيام متتالية','حافظ على سلسلة تعلم لمدة 3 أيام','streak',30);
