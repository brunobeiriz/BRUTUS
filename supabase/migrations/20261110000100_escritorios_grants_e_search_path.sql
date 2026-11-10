-- Aplicada após a fundação multi-escritório: o papel authenticated não tinha SELECT em escritorios,
-- e set_updated_at ficou sem search_path fixo (aviso do verificador de segurança).
grant select on public.escritorios to authenticated;
alter function public.set_updated_at() set search_path = '';
