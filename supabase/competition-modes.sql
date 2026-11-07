-- أوضاع المنافسة (النقاط، السرعة، ضربات الجزاء) واختيار الباك
-- الصق الملف كله في Supabase > SQL Editor ثم Run (مرة واحدة، بعد duels.sql)

alter table public.duels
  add column mode text not null default 'points' check (mode in ('points', 'speed', 'penalties')),
  add column pack_scope text not null default 'subject' check (pack_scope in ('subject', 'unit', 'lesson')),
  add column pack_id uuid;

-- اختيار أسئلة عشوائية من باك: كل المادة أو فصل (وحدة) أو درس واحد
create function public.pick_pack_questions(p_subject uuid, p_scope text, p_pack uuid, p_count int)
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
    where case p_scope
            when 'lesson' then l.id = p_pack
            when 'unit' then u.id = p_pack
            else (p_subject is null or co.subject_id = p_subject)
          end
    order by random()
    limit p_count
  ) s;
$$;

drop function public.duel_create(uuid, uuid, boolean);
drop function public.duel_quick_match(uuid, uuid);

create function public.duel_create(
  p_user uuid, p_subject uuid, p_open boolean default false,
  p_mode text default 'points', p_scope text default 'subject', p_pack uuid default null)
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
  v_count int;
  v_min int;
begin
  if p_mode not in ('points', 'speed', 'penalties') then raise exception 'وضع غير معروف.'; end if;
  if p_scope not in ('subject', 'unit', 'lesson') then raise exception 'باك غير معروف.'; end if;
  v_count := case p_mode when 'speed' then 5 when 'points' then 7 else 8 end;
  v_min := case p_mode when 'speed' then 5 when 'points' then 7 else 5 end;

  update public.duels set status = 'cancelled' where host_id = p_user and status = 'waiting';

  v_ids := public.pick_pack_questions(p_subject, p_scope, p_pack, v_count);
  if v_ids is null or array_length(v_ids, 1) < v_min then
    raise exception 'الباك المختار لا يحتوي أسئلة كافية لهذا الوضع (يلزم % أسئلة على الأقل).', v_min;
  end if;

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.duels where code = v_code);
    v_tries := v_tries + 1;
    if v_tries > 10 then raise exception 'تعذّر إنشاء الكود، أعد المحاولة.'; end if;
  end loop;

  insert into public.duels (code, subject_id, host_id, question_ids, is_open, mode, pack_scope, pack_id)
  values (v_code, p_subject, p_user, v_ids, p_open, p_mode, p_scope, p_pack)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.duel_quick_match(
  p_user uuid, p_subject uuid,
  p_mode text default 'points', p_scope text default 'subject', p_pack uuid default null)
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
    and mode = p_mode and pack_scope = p_scope and pack_id is not distinct from p_pack
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
  return public.duel_create(p_user, p_subject, true, p_mode, p_scope, p_pack);
end;
$$;

-- إنهاء التحدي: الأعلى نقاطًا/أهدافًا يفوز، وفي السرعة الأقل زمنًا معدّلًا (آخر إجابة + 5 ثوانٍ لكل خطأ)
create or replace function public.duel_finish(p_duel uuid)
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
  v_total int;
  v_host_ms int;
  v_guest_ms int;
begin
  select * into d from public.duels where id = p_duel for update;
  if d.status = 'finished' then return; end if;
  v_total := array_length(d.question_ids, 1);

  if d.mode = 'speed' then
    select coalesce(max(a.ms_taken), 0) + 5000 * (v_total - count(*) filter (where a.is_correct))
      into v_host_ms from public.duel_answers a where a.duel_id = p_duel and a.user_id = d.host_id;
    select coalesce(max(a.ms_taken), 0) + 5000 * (v_total - count(*) filter (where a.is_correct))
      into v_guest_ms from public.duel_answers a where a.duel_id = p_duel and a.user_id = d.guest_id;
    update public.duels set host_score = v_host_ms, guest_score = v_guest_ms where id = p_duel;
    v_winner := case when v_host_ms < v_guest_ms then d.host_id
                     when v_guest_ms < v_host_ms then d.guest_id else null end;
  else
    v_winner := case
      when d.host_score > d.guest_score then d.host_id
      when d.guest_score > d.host_score then d.guest_id
      else null end;
  end if;
  update public.duels set status = 'finished', finished_at = now(), winner_id = v_winner where id = p_duel;

  if not exists (select 1 from public.duel_answers where duel_id = p_duel and is_correct) then return; end if;
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

-- الأوضاع المتزامنة (نقاط وجزاء): ننتقل للسؤال التالي عندما يجيب الطرفان
create or replace function public.duel_resolve(p_duel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels;
  v_answers int;
  v_total int;
  v_finish boolean;
begin
  select * into d from public.duels where id = p_duel for update;
  if d.status <> 'active' or d.mode = 'speed' then return; end if;
  select count(*) into v_answers from public.duel_answers
    where duel_id = p_duel and question_index = d.current_index;
  if v_answers < 2 then return; end if;

  v_total := array_length(d.question_ids, 1);
  if d.mode = 'points' then
    v_finish := d.current_index >= v_total - 1;
  else
    -- ضربات الجزاء: خمس ركلات، ثم موت مفاجئ إن تعادلا (حتى ثلاث ركلات إضافية)
    v_finish := d.current_index >= v_total - 1 or (d.current_index >= 4 and d.host_score <> d.guest_score);
  end if;

  if v_finish then
    perform public.duel_finish(p_duel);
  else
    update public.duels
      set current_index = current_index + 1, question_started_at = now() + interval '3 seconds'
      where id = p_duel;
  end if;
end;
$$;

create or replace function public.duel_submit(p_user uuid, p_duel uuid, p_option uuid)
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
  v_idx int;
  v_total int;
  v_limit int;
begin
  select * into d from public.duels where id = p_duel for update;
  if not found or d.status <> 'active' then raise exception 'التحدي غير نشط.'; end if;
  if p_user is distinct from d.host_id and p_user is distinct from d.guest_id then
    raise exception 'أنت لست طرفًا في هذا التحدي.';
  end if;
  if now() < d.question_started_at then raise exception 'السؤال لم يبدأ بعد.'; end if;
  v_total := array_length(d.question_ids, 1);

  if d.mode = 'speed' then
    -- كل طالب يتقدم بسرعته: رقم سؤاله هو عدد إجاباته
    select count(*) into v_idx from public.duel_answers where duel_id = p_duel and user_id = p_user;
    if v_idx >= v_total then return; end if;
    v_question := d.question_ids[v_idx + 1];
    select o.is_correct into v_correct from public.question_options o
      where o.id = p_option and o.question_id = v_question;
    if v_correct is null then raise exception 'إجابة غير صالحة.'; end if;
    v_ms := floor(extract(epoch from (now() - d.question_started_at)) * 1000)::int;
    if v_ms > 151000 then raise exception 'انتهى وقت التحدي.'; end if;
    insert into public.duel_answers (duel_id, user_id, question_index, question_id, option_id, is_correct, ms_taken, points)
    values (p_duel, p_user, v_idx, v_question, p_option, v_correct, least(v_ms, 150000), case when v_correct then 1 else 0 end);
    if (select count(*) from public.duel_answers where duel_id = p_duel) >= v_total * 2 then
      perform public.duel_finish(p_duel);
    end if;
    return;
  end if;

  v_idx := d.current_index;
  if exists (select 1 from public.duel_answers
             where duel_id = p_duel and user_id = p_user and question_index = v_idx) then
    return;
  end if;
  v_limit := case d.mode when 'penalties' then 15 else 20 end;

  v_question := d.question_ids[v_idx + 1];
  select o.is_correct into v_correct from public.question_options o
    where o.id = p_option and o.question_id = v_question;
  if v_correct is null then raise exception 'إجابة غير صالحة.'; end if;

  v_secs := extract(epoch from (now() - d.question_started_at));
  v_ms := least(v_limit * 1000, floor(v_secs * 1000))::int;
  if v_secs > v_limit + 1 then v_correct := false; end if;
  if v_correct then
    v_points := case d.mode
      when 'penalties' then 1
      else 100 + floor(50 * (20000 - v_ms) / 20000.0)::int end;
  end if;

  insert into public.duel_answers (duel_id, user_id, question_index, question_id, option_id, is_correct, ms_taken, points)
  values (p_duel, p_user, v_idx, v_question, p_option, v_correct, v_ms, v_points);

  if p_user = d.host_id then
    update public.duels set host_score = host_score + v_points where id = p_duel;
  else
    update public.duels set guest_score = guest_score + v_points where id = p_duel;
  end if;
  perform public.duel_resolve(p_duel);
end;
$$;

create or replace function public.duel_tick(p_duel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels;
  v_uid uuid;
  v_i int;
  v_total int;
  v_limit_ms int;
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
  if d.status <> 'active' then return; end if;
  v_total := array_length(d.question_ids, 1);

  if d.mode = 'speed' then
    -- نهاية الوقت الكلي: ما لم يُجب عنه يُحتسب خطأً
    if now() < d.question_started_at + interval '150.5 seconds' then return; end if;
    foreach v_uid in array array[d.host_id, d.guest_id] loop
      for v_i in 0 .. v_total - 1 loop
        insert into public.duel_answers (duel_id, user_id, question_index, question_id, option_id, is_correct, ms_taken, points)
        values (p_duel, v_uid, v_i, d.question_ids[v_i + 1], null, false, 150000, 0)
        on conflict do nothing;
      end loop;
    end loop;
    perform public.duel_finish(p_duel);
    return;
  end if;

  v_limit_ms := case d.mode when 'penalties' then 15000 else 20000 end;
  if now() < d.question_started_at + (v_limit_ms + 500) * interval '1 millisecond' then return; end if;
  foreach v_uid in array array[d.host_id, d.guest_id] loop
    insert into public.duel_answers (duel_id, user_id, question_index, question_id, option_id, is_correct, ms_taken, points)
    values (p_duel, v_uid, d.current_index, d.question_ids[d.current_index + 1], null, false, v_limit_ms, 0)
    on conflict do nothing;
  end loop;
  perform public.duel_resolve(p_duel);
end;
$$;

create or replace function public.duel_state(p_user uuid, p_duel uuid)
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
  v_my_idx int;
  v_opp_idx int;
  v_resolved int;
  v_finished boolean;
begin
  select * into d from public.duels where id = p_duel;
  if not found or (p_user is distinct from d.host_id and p_user is distinct from d.guest_id) then
    raise exception 'تحدٍّ غير موجود.';
  end if;
  v_total := array_length(d.question_ids, 1);
  v_finished := d.status = 'finished';
  v_opp := case when p_user = d.host_id then d.guest_id else d.host_id end;

  if d.mode = 'speed' then
    select count(*) into v_my_idx from public.duel_answers where duel_id = p_duel and user_id = p_user;
    select count(*) into v_opp_idx from public.duel_answers where duel_id = p_duel and user_id = v_opp;
  else
    v_my_idx := d.current_index;
    v_opp_idx := 0;
  end if;

  if d.status = 'active' and v_my_idx < v_total then
    select jsonb_build_object(
      'id', qq.id,
      'prompt', qq.prompt_ar,
      'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label_ar) order by o.sort_order)
                  from public.question_options o where o.question_id = qq.id))
    into v_question
    from public.questions qq where qq.id = d.question_ids[v_my_idx + 1];
  end if;

  v_prev_idx := case
    when v_finished and d.mode = 'speed' then v_total - 1
    when v_finished then d.current_index
    when d.status = 'active' and v_my_idx > 0 then v_my_idx - 1
    else null end;
  if v_prev_idx is not null then
    select jsonb_build_object(
      'index', v_prev_idx,
      'correct_label', (select o.label_ar from public.question_options o
                        where o.question_id = d.question_ids[v_prev_idx + 1] and o.is_correct limit 1),
      'explanation', (select qq.explanation_ar from public.questions qq where qq.id = d.question_ids[v_prev_idx + 1]),
      'mine', (select jsonb_build_object('is_correct', a.is_correct, 'points', a.points)
               from public.duel_answers a where a.duel_id = p_duel and a.user_id = p_user and a.question_index = v_prev_idx),
      'theirs', case when d.mode = 'speed' then null else
                (select jsonb_build_object('is_correct', a.is_correct, 'points', a.points)
                 from public.duel_answers a where a.duel_id = p_duel and a.user_id = v_opp and a.question_index = v_prev_idx) end)
    into v_prev;
  end if;

  v_resolved := case when v_finished then d.current_index + 1 else d.current_index end;

  return jsonb_build_object(
    'id', d.id,
    'code', d.code,
    'status', d.status,
    'mode', d.mode,
    'total', case when d.mode = 'penalties' then least(5, v_total) else v_total end,
    'sudden_death', d.mode = 'penalties' and d.current_index >= 5,
    'index', v_my_idx,
    'started_at', floor(extract(epoch from d.question_started_at) * 1000),
    'server_now', floor(extract(epoch from clock_timestamp()) * 1000),
    'time_limit', case d.mode when 'speed' then 150 when 'penalties' then 15 else 20 end,
    'my_score', case when d.mode = 'speed' and not v_finished then 0
                     when p_user = d.host_id then d.host_score else d.guest_score end,
    'opp_score', case when d.mode = 'speed' and not v_finished then 0
                      when p_user = d.host_id then d.guest_score else d.host_score end,
    'opp_name', case when v_opp is null then null
                     else coalesce((select p.display_name from public.profiles p where p.id = v_opp), 'منافس') end,
    'me_answered', case when d.mode = 'speed' then v_my_idx >= v_total
                        else exists (select 1 from public.duel_answers a
                                     where a.duel_id = p_duel and a.user_id = p_user and a.question_index = d.current_index) end,
    'opp_answered', case when d.mode = 'speed' then v_opp_idx >= v_total
                         else exists (select 1 from public.duel_answers a
                                      where a.duel_id = p_duel and a.user_id = v_opp and a.question_index = d.current_index) end,
    'my_wrong', (select count(*) from public.duel_answers a
                 where a.duel_id = p_duel and a.user_id = p_user and not a.is_correct),
    'opp_count', v_opp_idx,
    'my_kicks', (select coalesce(jsonb_agg(a.is_correct order by a.question_index), '[]'::jsonb) from public.duel_answers a
                 where d.mode = 'penalties' and a.duel_id = p_duel and a.user_id = p_user and a.question_index < v_resolved),
    'opp_kicks', (select coalesce(jsonb_agg(a.is_correct order by a.question_index), '[]'::jsonb) from public.duel_answers a
                  where d.mode = 'penalties' and a.duel_id = p_duel and a.user_id = v_opp and a.question_index < v_resolved),
    'question', v_question,
    'prev', v_prev,
    'winner', case when d.winner_id is null then null when d.winner_id = p_user then 'me' else 'opp' end,
    'xp', (select coalesce(sum(x.amount), 0) from public.xp_transactions x
           where x.ref_id = d.id and x.user_id = p_user and x.reason = 'duel')
  );
end;
$$;

revoke all on function public.pick_pack_questions(uuid, text, uuid, int) from public, anon, authenticated;
revoke all on function public.duel_create(uuid, uuid, boolean, text, text, uuid) from public, anon, authenticated;
revoke all on function public.duel_quick_match(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.duel_finish(uuid) from public, anon, authenticated;
revoke all on function public.duel_resolve(uuid) from public, anon, authenticated;
revoke all on function public.duel_submit(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.duel_tick(uuid) from public, anon, authenticated;
revoke all on function public.duel_state(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pick_pack_questions(uuid, text, uuid, int) to service_role;
grant execute on function public.duel_create(uuid, uuid, boolean, text, text, uuid) to service_role;
grant execute on function public.duel_quick_match(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.duel_finish(uuid) to service_role;
grant execute on function public.duel_resolve(uuid) to service_role;
grant execute on function public.duel_submit(uuid, uuid, uuid) to service_role;
grant execute on function public.duel_tick(uuid) to service_role;
grant execute on function public.duel_state(uuid, uuid) to service_role;
