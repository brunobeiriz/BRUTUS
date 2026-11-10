-- BRZ/BRUTUS — fundação multi-escritório (SaaS)
-- Aditiva e com backfill: preserva os 2 usuários, a configuração e os dados de teste existentes,
-- que passam a pertencer a um "escritório piloto". Nada é apagado.
-- Decisão v1: um usuário pertence a um único escritório (profiles.escritorio_id).

begin;

-- 1. Escritórios (contratantes) -------------------------------------------------

create table public.escritorios (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null check (char_length(nome) between 2 and 120),
  plano                 text not null default 'semestral'
                          check (plano in ('piloto', 'semestral', 'anual')),
  max_usuarios          integer not null default 3 check (max_usuarios >= 1),
  status                text not null default 'pendente'
                          check (status in ('pendente', 'ativo', 'suspenso', 'cancelado')),
  vigencia_inicio       date,
  vigencia_fim          date,
  asaas_customer_id     text unique,
  asaas_subscription_id text unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger escritorios_set_updated_at
  before update on public.escritorios
  for each row execute function public.set_updated_at();

-- Idempotência do webhook do Asaas (acessível apenas pelo service_role).
create table public.asaas_eventos (
  id           text primary key,                -- id do evento enviado pelo Asaas
  tipo         text not null,
  payload      jsonb not null,
  escritorio_id uuid references public.escritorios (id) on delete set null,
  processado   boolean not null default false,
  erro         text,
  created_at   timestamptz not null default now(),
  processado_em timestamptz
);

-- 2. Escritório piloto + vínculo dos usuários existentes -------------------------

alter table public.profiles add column escritorio_id uuid references public.escritorios (id);

with piloto as (
  insert into public.escritorios (nome, plano, max_usuarios, status, vigencia_inicio)
  values ('Escritório piloto BRZ', 'piloto', 3, 'ativo', current_date)
  returning id
)
update public.profiles set escritorio_id = (select id from piloto);

alter table public.profiles alter column escritorio_id set not null;
create index profiles_escritorio_id_idx on public.profiles (escritorio_id);

-- 3. Funções de apoio (security definer, sem depender de RLS de profiles) ----------

create function public.meu_escritorio_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select escritorio_id from public.profiles where id = (select auth.uid()) and ativo
$$;

create function public.acesso_liberado()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select e.status = 'ativo' and (e.vigencia_fim is null or e.vigencia_fim >= current_date)
    from public.profiles p
    join public.escritorios e on e.id = p.escritorio_id
    where p.id = (select auth.uid()) and p.ativo
  ), false)
$$;

-- Mantém o nome usado pelo app: admin do próprio escritório, com assinatura ativa.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.acesso_liberado() and coalesce((
    select p.role = 'admin' from public.profiles p where p.id = (select auth.uid()) and p.ativo
  ), false)
$$;

create function public.mesmo_escritorio(uid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.escritorio_id = public.meu_escritorio_id()
  )
$$;

revoke all on function public.meu_escritorio_id(), public.acesso_liberado(),
  public.is_admin(), public.mesmo_escritorio(uuid) from public, anon;
grant execute on function public.meu_escritorio_id(), public.acesso_liberado(),
  public.is_admin(), public.mesmo_escritorio(uuid) to authenticated;

-- 4. Limite de usuários por plano --------------------------------------------------

create function public.checar_limite_usuarios()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ativo and (
    select count(*) from public.profiles
    where escritorio_id = new.escritorio_id and ativo and id <> new.id
  ) >= (select max_usuarios from public.escritorios where id = new.escritorio_id) then
    raise exception 'Limite de usuários do plano atingido' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger profiles_limite_usuarios
  before insert or update of ativo, escritorio_id on public.profiles
  for each row execute function public.checar_limite_usuarios();

-- 5. escritorio_id nas tabelas de dados (backfill no piloto; default pelo usuário logado) --

alter table public.tasks         add column escritorio_id uuid references public.escritorios (id);
alter table public.task_history  add column escritorio_id uuid references public.escritorios (id);
alter table public.import_batches add column escritorio_id uuid references public.escritorios (id);
alter table public.office_settings add column escritorio_id uuid references public.escritorios (id);

update public.tasks          set escritorio_id = (select id from public.escritorios where plano = 'piloto');
update public.task_history   set escritorio_id = (select id from public.escritorios where plano = 'piloto');
update public.import_batches set escritorio_id = (select id from public.escritorios where plano = 'piloto');
update public.office_settings set escritorio_id = (select id from public.escritorios where plano = 'piloto');

alter table public.tasks          alter column escritorio_id set not null, alter column escritorio_id set default public.meu_escritorio_id();
alter table public.task_history   alter column escritorio_id set not null, alter column escritorio_id set default public.meu_escritorio_id();
alter table public.import_batches alter column escritorio_id set not null, alter column escritorio_id set default public.meu_escritorio_id();
alter table public.office_settings alter column escritorio_id set not null, alter column escritorio_id set default public.meu_escritorio_id();

create index tasks_escritorio_id_idx          on public.tasks (escritorio_id);
create index task_history_escritorio_id_idx   on public.task_history (escritorio_id);
create index import_batches_escritorio_id_idx on public.import_batches (escritorio_id);

-- office_settings era singleton (id boolean). Agora é uma linha por escritório;
-- a coluna id permanece (sempre true) para o app continuar filtrando por ela.
alter table public.office_settings drop constraint office_settings_pkey;
alter table public.office_settings add primary key (escritorio_id);

-- 6. RLS — substitui as políticas antigas -------------------------------------------

alter table public.escritorios   enable row level security;
alter table public.asaas_eventos enable row level security;  -- sem políticas: só service_role

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'office_settings', 'import_batches', 'tasks',
                        'task_history', 'usage_days', 'user_feedback')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- escritorios: cada usuário lê apenas o seu; escrita somente por service_role (webhook).
create policy escritorios_select_proprio on public.escritorios
  for select to authenticated
  using (id = (select public.meu_escritorio_id()));

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid())
         or (escritorio_id = (select public.meu_escritorio_id()) and ativo and (select public.acesso_liberado())));
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using ((select public.is_admin()) and escritorio_id = (select public.meu_escritorio_id()))
  with check ((select public.is_admin()) and escritorio_id = (select public.meu_escritorio_id()));

-- office_settings (a leitura pública anônima deixa de existir)
create policy office_settings_select on public.office_settings
  for select to authenticated
  using (escritorio_id = (select public.meu_escritorio_id()) and (select public.acesso_liberado()));
create policy office_settings_admin_all on public.office_settings
  for all to authenticated
  using ((select public.is_admin()) and escritorio_id = (select public.meu_escritorio_id()))
  with check ((select public.is_admin()) and escritorio_id = (select public.meu_escritorio_id()));

-- import_batches (o INSERT anônimo deixa de existir)
create policy import_batches_admin_all on public.import_batches
  for all to authenticated
  using ((select public.is_admin()) and escritorio_id = (select public.meu_escritorio_id()))
  with check ((select public.is_admin()) and escritorio_id = (select public.meu_escritorio_id()));

-- tasks
create policy tasks_admin_all on public.tasks
  for all to authenticated
  using ((select public.is_admin()) and escritorio_id = (select public.meu_escritorio_id()))
  with check ((select public.is_admin()) and escritorio_id = (select public.meu_escritorio_id()));
create policy tasks_collab_select on public.tasks
  for select to authenticated
  using ((select public.acesso_liberado()) and escritorio_id = (select public.meu_escritorio_id())
         and responsavel_id = (select auth.uid()));
create policy tasks_collab_insert_own on public.tasks
  for insert to authenticated
  with check ((select public.acesso_liberado()) and escritorio_id = (select public.meu_escritorio_id())
              and responsavel_id = (select auth.uid()) and created_by = (select auth.uid()));
create policy tasks_collab_update_assigned on public.tasks
  for update to authenticated
  using ((select public.acesso_liberado()) and escritorio_id = (select public.meu_escritorio_id())
         and responsavel_id = (select auth.uid()))
  with check ((select public.acesso_liberado()) and escritorio_id = (select public.meu_escritorio_id())
              and responsavel_id = (select auth.uid()));

-- task_history
create policy history_admin_all on public.task_history
  for all to authenticated
  using ((select public.is_admin()) and escritorio_id = (select public.meu_escritorio_id()))
  with check ((select public.is_admin()) and escritorio_id = (select public.meu_escritorio_id()));
create policy history_collab_select on public.task_history
  for select to authenticated
  using ((select public.acesso_liberado()) and escritorio_id = (select public.meu_escritorio_id())
         and user_id = (select auth.uid()));
create policy history_collab_insert on public.task_history
  for insert to authenticated
  with check ((select public.acesso_liberado()) and escritorio_id = (select public.meu_escritorio_id())
              and user_id = (select auth.uid()));

-- usage_days e user_feedback (por usuário; admin vê os do próprio escritório)
create policy usage_days_select on public.usage_days
  for select to authenticated
  using (user_id = (select auth.uid()) or ((select public.is_admin()) and (select public.mesmo_escritorio(user_id))));
create policy usage_days_insert_own on public.usage_days
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.acesso_liberado()));

create policy feedback_select on public.user_feedback
  for select to authenticated
  using (user_id = (select auth.uid()) or ((select public.is_admin()) and (select public.mesmo_escritorio(user_id))));
create policy feedback_insert_own on public.user_feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.acesso_liberado()));

commit;
