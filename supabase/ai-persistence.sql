-- The First: persistent AI conversations and generated exams
create extension if not exists pgcrypto;

create table if not exists public.ai_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'محادثة جديدة',
  subject text check (subject in ('physics','chemistry') or subject is null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_chat_conversations_user_updated_idx on public.ai_chat_conversations(user_id, updated_at desc);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 6000),
  created_at timestamptz not null default now()
);
create index if not exists ai_chat_messages_conversation_created_idx on public.ai_chat_messages(conversation_id, created_at);
create index if not exists ai_chat_messages_user_idx on public.ai_chat_messages(user_id);

create table if not exists public.ai_generated_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (subject in ('physics','chemistry')),
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  topic text,
  exam_title text not null,
  questions jsonb not null,
  answers jsonb not null default '{}'::jsonb,
  score integer,
  submitted boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists ai_generated_exams_user_created_idx on public.ai_generated_exams(user_id, created_at desc);

alter table public.ai_chat_conversations enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_generated_exams enable row level security;

drop policy if exists "Users manage their AI conversations" on public.ai_chat_conversations;
create policy "Users manage their AI conversations" on public.ai_chat_conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their AI messages" on public.ai_chat_messages;
create policy "Users manage their AI messages" on public.ai_chat_messages for all using (
  auth.uid() = user_id and exists (select 1 from public.ai_chat_conversations c where c.id = conversation_id and c.user_id = auth.uid())
) with check (
  auth.uid() = user_id and exists (select 1 from public.ai_chat_conversations c where c.id = conversation_id and c.user_id = auth.uid())
);

drop policy if exists "Users manage their generated exams" on public.ai_generated_exams;
create policy "Users manage their generated exams" on public.ai_generated_exams for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
