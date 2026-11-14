-- BRZ/BRUTUS — planos e provisionamento automático de escritórios (webhook do Asaas)
-- Rascunho para revisão: não aplicado. Aditiva; não altera dados existentes.

begin;

-- 1. Planos vendidos (preço e link de pagamento do Asaas são preenchidos depois) ----------------
create table public.planos (
  id                    text primary key check (id in ('semestral', 'anual')),
  nome                  text not null,
  meses                 integer not null check (meses > 0),
  preco_centavos        integer check (preco_centavos > 0),
  max_parcelas          integer not null default 10 check (max_parcelas between 1 and 12),
  asaas_payment_link_id text unique,
  ativo                 boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger planos_set_updated_at
  before update on public.planos
  for each row execute function public.set_updated_at();

insert into public.planos (id, nome, meses) values
  ('semestral', 'Plano semestral', 6),
  ('anual',     'Plano anual',    12);

alter table public.planos enable row level security;

-- A landing page lê os planos ativos (nome, preço e parcelas) sem login.
create policy planos_leitura_publica on public.planos
  for select to anon, authenticated
  using (ativo);

grant select on public.planos to anon, authenticated;

-- 2. O webhook usa a chave service_role: garante as permissões nas tabelas novas ---------------
grant all on public.escritorios, public.asaas_eventos, public.planos to service_role;

-- 3. Criação atômica do escritório a partir de um pagamento confirmado ------------------------
-- Idempotente: se já existir escritório para o cliente do Asaas, devolve o existente.
create function public.provisionar_escritorio(
  p_nome     text,
  p_plano    text,
  p_customer text,
  p_cobranca text
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_meses integer;
  v_nome  text := left(coalesce(nullif(trim(p_nome), ''), 'Escritório'), 120);
  v_id    uuid;
begin
  select meses into v_meses from public.planos where id = p_plano;
  if v_meses is null then
    raise exception 'Plano inexistente: %', p_plano;
  end if;

  select id into v_id from public.escritorios where asaas_customer_id = p_customer;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.escritorios
    (nome, plano, max_usuarios, status, vigencia_inicio, vigencia_fim, asaas_customer_id, asaas_subscription_id)
  values
    (v_nome, p_plano, 3, 'ativo', current_date,
     (current_date + make_interval(months => v_meses))::date, p_customer, p_cobranca)
  returning id into v_id;

  insert into public.office_settings (escritorio_id, office_name) values (v_id, v_nome);

  return v_id;
end
$$;

revoke all on function public.provisionar_escritorio(text, text, text, text) from public, anon, authenticated;
grant execute on function public.provisionar_escritorio(text, text, text, text) to service_role;

commit;
