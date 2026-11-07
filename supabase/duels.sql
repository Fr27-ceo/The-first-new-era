-- التحدي المباشر بين طالبين
-- الصق الملف كله في Supabase > SQL Editor ثم Run (مرة واحدة، بعد schema.sql)
-- كل الكتابة تتم عبر دوال السيرفر فقط؛ الطلاب لا يصلون للجدولين مباشرة

create table public.duels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  subject_id uuid references public.subjects (id),
  host_id uuid not null,
  guest_id uuid,
  question_ids uuid[] not null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'cancelled')),
  is_open boolean not null default false,
  current_index int not null default 0,
  question_started_at timestamptz,
  host_score int not null default 0,
  guest_score int not null default 0,
  winner_id uuid,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.duel_answers (
  duel_id uuid not null references public.duels (id) on delete cascade,
  user_id uuid not null,
  question_index int not null,
  question_id uuid not null,
  option_id uuid,
  is_correct boolean not null,
  ms_taken int not null,
  points int not null,
  created_at timestamptz not null default now(),
  primary key (duel_id, user_id, question_index)
);

create index duels_open_idx on public.duels (created_at) where status = 'waiting' and is_open;
create index duels_players_idx on public.duels (host_id, guest_id);

alter table public.duels enable row level security;
alter table public.duel_answers enable row level security;
grant all on public.duels, public.duel_answers to service_role;

-- اختيار أسئلة عشوائية من مادة (أو من كل المواد)
create function public.pick_questions(p_subject uuid, p_count int)
returns uuid[]
language sql
volatile
security definer
set search_path = ''
as $$
  select array_agg(s.id) from (
    select q.id
    from public.questions q
    join public.concepts cn on cn.id = q.concept_id
    join public.lessons l on l.id = cn.lesson_id
    join public.units u on u.id = l.unit_id
    join public.courses co on co.id = u.course_id
    where p_subject is null or co.subject_id = p_subject
    order by random()
    limit p_count
  ) s;
$$;

create function public.duel_create(p_user uuid, p_subject uuid, p_open boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_code text;
  v_id uuid;
  v_tries int := 0;
begin
  update public.duels set status = 'cancelled' where host_id = p_user and status = 'waiting';

  v_ids := public.pick_questions(p_subject, 7);
  if v_ids is null or array_length(v_ids, 1) < 7 then
    raise exception 'لا توجد أسئلة كافية لبدء تحدٍّ في هذه المادة.';
  end if;

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.duels where code = v_code);
    v_tries := v_tries + 1;
    if v_tries > 10 then raise exception 'تعذّر إنشاء الكود، أعد المحاولة.'; end if;
  end loop;

  insert into public.duels (code, subject_id, host_id, question_ids, is_open)
  values (v_code, p_subject, p_user, v_ids, p_open)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.duel_join(p_user uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels;
begin
  select * into d from public.duels where code = upper(trim(p_code)) for update;
  if not found then raise exception 'الكود غير صحيح.'; end if;
  if d.host_id = p_user then raise exception 'لا يمكنك الانضمام إلى تحدٍّ أنشأته أنت.'; end if;
  if d.status <> 'waiting' or d.created_at < now() - interval '15 minutes' then
    raise exception 'هذا التحدي لم يعد متاحًا.';
  end if;
  update public.duels
    set guest_id = p_user, status = 'active', is_open = false,
        current_index = 0, question_started_at = now() + interval '4 seconds'
    where id = d.id;
  return d.id;
end;
$$;

create function public.duel_quick_match(p_user uuid, p_subject uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels;
begin
  update public.duels set status = 'cancelled' where host_id = p_user and status = 'waiting';

  select * into d from public.duels
  where status = 'waiting' and is_open and host_id <> p_user
    and last_seen > now() - interval '8 seconds'
    and subject_id is not distinct from p_subject
  order by created_at
  limit 1
  for update skip locked;

  if found then
    update public.duels
      set guest_id = p_user, status = 'active', is_open = false,
          current_index = 0, question_started_at = now() + interval '4 seconds'
      where id = d.id;
    return d.id;
  end if;
  return public.duel_create(p_user, p_subject, true);
end;
$$;

-- إنهاء التحدي وتحديد الفائز ومنح النقاط (حد أقصى 5 تحديات يوميًا لكل طالب)
create function public.duel_finish(p_duel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels;
  v_winner uuid;
  v_today timestamptz;
  v_uid uuid;
  v_count int;
  v_amount int;
begin
  select * into d from public.duels where id = p_duel for update;
  v_winner := case
    when d.host_score > d.guest_score then d.host_id
    when d.guest_score > d.host_score then d.guest_id
    else null end;
  update public.duels set status = 'finished', finished_at = now(), winner_id = v_winner where id = p_duel;

  if d.host_score + d.guest_score = 0 then return; end if;
  v_today := date_trunc('day', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo';
  foreach v_uid in array array[d.host_id, d.guest_id] loop
    select count(*) into v_count from public.xp_transactions
      where user_id = v_uid and reason = 'duel' and created_at >= v_today;
    if v_count < 5 then
      v_amount := case when v_winner is null then 25 when v_winner = v_uid then 40 else 15 end;
      insert into public.xp_transactions (user_id, amount, reason, ref_id) values (v_uid, v_amount, 'duel', p_duel);
    end if;
  end loop;
end;
$$;

create function public.duel_resolve(p_duel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels;
  v_answers int;
begin
  select * into d from public.duels where id = p_duel for update;
  if d.status <> 'active' then return; end if;
  select count(*) into v_answers from public.duel_answers
    where duel_id = p_duel and question_index = d.current_index;
  if v_answers < 2 then return; end if;

  if d.current_index >= array_length(d.question_ids, 1) - 1 then
    perform public.duel_finish(p_duel);
  else
    update public.duels
      set current_index = current_index + 1, question_started_at = now() + interval '3 seconds'
      where id = p_duel;
  end if;
end;
$$;

create function public.duel_submit(p_user uuid, p_duel uuid, p_option uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels;
  v_question uuid;
  v_correct boolean;
  v_secs numeric;
  v_ms int;
  v_points int := 0;
begin
  select * into d from public.duels where id = p_duel for update;
  if not found or d.status <> 'active' then raise exception 'التحدي غير نشط.'; end if;
  if p_user is distinct from d.host_id and p_user is distinct from d.guest_id then
    raise exception 'أنت لست طرفًا في هذا التحدي.';
  end if;
  if now() < d.question_started_at then raise exception 'السؤال لم يبدأ بعد.'; end if;
  if exists (select 1 from public.duel_answers
             where duel_id = p_duel and user_id = p_user and question_index = d.current_index) then
    return;
  end if;

  v_question := d.question_ids[d.current_index + 1];
  select o.is_correct into v_correct from public.question_options o
    where o.id = p_option and o.question_id = v_question;
  if v_correct is null then raise exception 'إجابة غير صالحة.'; end if;

  v_secs := extract(epoch from (now() - d.question_started_at));
  v_ms := least(20000, floor(v_secs * 1000))::int;
  if v_secs > 21 then v_correct := false; end if;
  if v_correct then v_points := 100 + floor(50 * (20000 - v_ms) / 20000.0)::int; end if;

  insert into public.duel_answers (duel_id, user_id, question_index, question_id, option_id, is_correct, ms_taken, points)
  values (p_duel, p_user, d.current_index, v_question, p_option, v_correct, v_ms, v_points);

  if p_user = d.host_id then
    update public.duels set host_score = host_score + v_points where id = p_duel;
  else
    update public.duels set guest_score = guest_score + v_points where id = p_duel;
  end if;
  perform public.duel_resolve(p_duel);
end;
$$;

-- يُستدعى مع كل تحديث للحالة: يغلق الأسئلة المنتهية وقتها وينظّف التحديات المهجورة
create function public.duel_tick(p_duel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels;
  v_uid uuid;
begin
  select * into d from public.duels where id = p_duel for update;
  if not found then return; end if;

  if d.status = 'waiting' then
    if d.created_at < now() - interval '15 minutes' then
      update public.duels set status = 'cancelled' where id = p_duel;
    else
      update public.duels set last_seen = now() where id = p_duel;
    end if;
    return;
  end if;

  if d.status <> 'active' or now() < d.question_started_at + interval '20.5 seconds' then return; end if;
  foreach v_uid in array array[d.host_id, d.guest_id] loop
    insert into public.duel_answers (duel_id, user_id, question_index, question_id, option_id, is_correct, ms_taken, points)
    values (p_duel, v_uid, d.current_index, d.question_ids[d.current_index + 1], null, false, 20000, 0)
    on conflict do nothing;
  end loop;
  perform public.duel_resolve(p_duel);
end;
$$;

-- حالة التحدي كما يراها طالب واحد (لا تكشف الإجابة الصحيحة للسؤال الجاري)
create function public.duel_state(p_user uuid, p_duel uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels;
  v_opp uuid;
  v_question jsonb;
  v_prev jsonb;
  v_prev_idx int;
  v_total int;
begin
  select * into d from public.duels where id = p_duel;
  if not found or (p_user is distinct from d.host_id and p_user is distinct from d.guest_id) then
    raise exception 'تحدٍّ غير موجود.';
  end if;
  v_total := array_length(d.question_ids, 1);
  v_opp := case when p_user = d.host_id then d.guest_id else d.host_id end;

  if d.status = 'active' then
    select jsonb_build_object(
      'id', qq.id,
      'prompt', qq.prompt_ar,
      'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label_ar) order by o.sort_order)
                  from public.question_options o where o.question_id = qq.id))
    into v_question
    from public.questions qq where qq.id = d.question_ids[d.current_index + 1];
  end if;

  v_prev_idx := case when d.status = 'finished' then v_total - 1
                     when d.status = 'active' and d.current_index > 0 then d.current_index - 1
                     else null end;
  if v_prev_idx is not null then
    select jsonb_build_object(
      'index', v_prev_idx,
      'correct_label', (select o.label_ar from public.question_options o
                        where o.question_id = d.question_ids[v_prev_idx + 1] and o.is_correct limit 1),
      'explanation', (select qq.explanation_ar from public.questions qq where qq.id = d.question_ids[v_prev_idx + 1]),
      'mine', (select jsonb_build_object('is_correct', a.is_correct, 'points', a.points)
               from public.duel_answers a where a.duel_id = p_duel and a.user_id = p_user and a.question_index = v_prev_idx),
      'theirs', (select jsonb_build_object('is_correct', a.is_correct, 'points', a.points)
                 from public.duel_answers a where a.duel_id = p_duel and a.user_id = v_opp and a.question_index = v_prev_idx))
    into v_prev;
  end if;

  return jsonb_build_object(
    'id', d.id,
    'code', d.code,
    'status', d.status,
    'total', v_total,
    'index', d.current_index,
    'started_at', floor(extract(epoch from d.question_started_at) * 1000),
    'server_now', floor(extract(epoch from clock_timestamp()) * 1000),
    'time_limit', 20,
    'my_score', case when p_user = d.host_id then d.host_score else d.guest_score end,
    'opp_score', case when p_user = d.host_id then d.guest_score else d.host_score end,
    'opp_name', case when v_opp is null then null
                     else coalesce((select p.display_name from public.profiles p where p.id = v_opp), 'منافس') end,
    'me_answered', exists (select 1 from public.duel_answers a
                           where a.duel_id = p_duel and a.user_id = p_user and a.question_index = d.current_index),
    'opp_answered', exists (select 1 from public.duel_answers a
                            where a.duel_id = p_duel and a.user_id = v_opp and a.question_index = d.current_index),
    'question', v_question,
    'prev', v_prev,
    'winner', case when d.winner_id is null then null when d.winner_id = p_user then 'me' else 'opp' end,
    'xp', (select coalesce(sum(x.amount), 0) from public.xp_transactions x
           where x.ref_id = d.id and x.user_id = p_user and x.reason = 'duel')
  );
end;
$$;

-- الدوال تُستدعى من السيرفر فقط
revoke all on function public.pick_questions(uuid, int) from public, anon, authenticated;
revoke all on function public.duel_create(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.duel_join(uuid, text) from public, anon, authenticated;
revoke all on function public.duel_quick_match(uuid, uuid) from public, anon, authenticated;
revoke all on function public.duel_finish(uuid) from public, anon, authenticated;
revoke all on function public.duel_resolve(uuid) from public, anon, authenticated;
revoke all on function public.duel_submit(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.duel_tick(uuid) from public, anon, authenticated;
revoke all on function public.duel_state(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pick_questions(uuid, int) to service_role;
grant execute on function public.duel_create(uuid, uuid, boolean) to service_role;
grant execute on function public.duel_join(uuid, text) to service_role;
grant execute on function public.duel_quick_match(uuid, uuid) to service_role;
grant execute on function public.duel_finish(uuid) to service_role;
grant execute on function public.duel_resolve(uuid) to service_role;
grant execute on function public.duel_submit(uuid, uuid, uuid) to service_role;
grant execute on function public.duel_tick(uuid) to service_role;
grant execute on function public.duel_state(uuid, uuid) to service_role;
