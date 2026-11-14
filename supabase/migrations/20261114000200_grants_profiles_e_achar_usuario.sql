-- O webhook (papel service_role) precisa ler e gravar perfis, e localizar um usuário pelo e-mail.
grant select, insert, update on public.profiles to service_role;

create function public.achar_usuario_por_email(p_email text)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;

revoke all on function public.achar_usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.achar_usuario_por_email(text) to service_role;
