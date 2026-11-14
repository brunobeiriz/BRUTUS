-- Função que entrega ao webhook o token guardado no Vault do Supabase.
-- O token em si NÃO fica neste arquivo: foi gravado direto no Vault (vault.create_secret), fora do histórico de migrations.
create function public.obter_webhook_token()
returns text
language sql stable security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'asaas_webhook_token' limit 1
$$;

revoke all on function public.obter_webhook_token() from public, anon, authenticated;
grant execute on function public.obter_webhook_token() to service_role;
