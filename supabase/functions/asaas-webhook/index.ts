// Webhook do Asaas: cria o escritório e o acesso do contratante quando o pagamento é confirmado,
// e suspende o acesso em estorno ou contestação (chargeback).
// Segredo necessário: ASAAS_API_KEY (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem).
// O token do webhook fica no Vault do banco (função obter_webhook_token); a variável ASAAS_WEBHOOK_TOKEN,
// se existir, tem prioridade. Opcionais: ASAAS_BASE_URL (padrão: sandbox) e APP_URL.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  decidirAcao,
  descreverErro,
  emailValido,
  ErroPermanente,
  type Evento,
  type Pagamento,
  tokenValido,
} from "./logica.ts";

const ASAAS_BASE = Deno.env.get("ASAAS_BASE_URL") ?? "https://api-sandbox.asaas.com/v3";
const APP_URL = Deno.env.get("APP_URL") ?? "https://www.brz.adv.br/app/";

const env = (nome: string): string => {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Segredo ausente: ${nome}`);
  return v;
};

const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return resposta(405, { erro: "método não permitido" });

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const esperado = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? await tokenDoCofre(db);
  if (!tokenValido(req.headers.get("asaas-access-token"), esperado)) {
    return resposta(401, { erro: "não autorizado" });
  }

  let ev: Evento;
  try {
    ev = await req.json();
  } catch {
    return resposta(400, { erro: "corpo inválido" });
  }
  if (!ev?.id || !ev?.event) return resposta(400, { erro: "evento inválido" });

  // Idempotência: o mesmo evento nunca é processado duas vezes.
  const reg = await db.from("asaas_eventos").insert({ id: ev.id, tipo: ev.event, payload: ev });
  if (reg.error) {
    if (reg.error.code !== "23505") return resposta(500, { erro: reg.error.message });
    const ja = await db.from("asaas_eventos").select("processado").eq("id", ev.id).single();
    if (ja.data?.processado) return resposta(200, { ok: true, duplicado: true });
  }

  try {
    const escritorioId = await processar(db, ev);
    await db.from("asaas_eventos").update({
      processado: true,
      erro: null,
      processado_em: new Date().toISOString(),
      escritorio_id: escritorioId,
    }).eq("id", ev.id);
    return resposta(200, { ok: true });
  } catch (e) {
    const msg = descreverErro(e);
    await db.from("asaas_eventos").update({ erro: msg.slice(0, 1000) }).eq("id", ev.id);
    if (e instanceof ErroPermanente) {
      await db.from("asaas_eventos").update({ processado: true, processado_em: new Date().toISOString() })
        .eq("id", ev.id);
      return resposta(200, { ok: false, erro: msg });
    }
    return resposta(500, { erro: msg }); // o Asaas reenvia
  }
});

async function tokenDoCofre(db: SupabaseClient): Promise<string> {
  const r = await db.rpc("obter_webhook_token");
  return typeof r.data === "string" ? r.data : "";
}

async function processar(db: SupabaseClient, ev: Evento): Promise<string | null> {
  const p = ev.payment;
  switch (decidirAcao(ev)) {
    case "ativar":
      return await ativar(db, p!);
    case "suspender":
      return await suspender(db, p!);
    default:
      return null;
  }
}

async function ativar(db: SupabaseClient, p: Pagamento): Promise<string> {
  // Parcelas seguintes de uma compra já provisionada não refazem nada.
  const existente = await db.from("escritorios").select("id, status").eq("asaas_customer_id", p.customer)
    .maybeSingle();
  if (existente.error) throw existente.error;
  if (existente.data) {
    const admin = await db.from("profiles").select("id").eq("escritorio_id", existente.data.id)
      .eq("role", "admin").limit(1);
    if (admin.error) throw admin.error;
    if (admin.data?.length) return existente.data.id;
  }

  const plano = await descobrirPlano(db, p);
  const cliente = await buscarCliente(p.customer);
  if (!emailValido(cliente.email)) {
    throw new ErroPermanente(`Cliente ${p.customer} sem e-mail válido no Asaas`);
  }
  const email = cliente.email.trim().toLowerCase();
  const nome = (cliente.name ?? "").trim() || "Contratante";

  const prov = await db.rpc("provisionar_escritorio", {
    p_nome: nome,
    p_plano: plano,
    p_customer: p.customer,
    p_cobranca: p.installment ?? p.id,
  });
  if (prov.error) throw prov.error;
  const escritorioId = prov.data as string;

  // Reaproveita o usuário se o e-mail já existir; senão cria e envia o e-mail para definir a senha.
  const achado = await db.rpc("achar_usuario_por_email", { p_email: email });
  if (achado.error) throw achado.error;
  let usuarioId = achado.data as string | null;
  if (usuarioId) {
    const outro = await db.from("profiles").select("escritorio_id").eq("id", usuarioId).maybeSingle();
    if (outro.error) throw outro.error;
    if (outro.data && outro.data.escritorio_id !== escritorioId) {
      throw new ErroPermanente(`O e-mail ${email} já pertence a outro escritório; tratar manualmente`);
    }
    if (outro.data) return escritorioId;
  } else {
    const convite = await db.auth.admin.inviteUserByEmail(email, { data: { nome }, redirectTo: APP_URL });
    if (convite.error) throw convite.error;
    usuarioId = convite.data.user.id;
  }
  const perfil = await db.from("profiles").insert({
    id: usuarioId,
    nome,
    email,
    role: "admin",
    ativo: true,
    escritorio_id: escritorioId,
  });
  if (perfil.error) throw perfil.error;
  return escritorioId;
}

async function suspender(db: SupabaseClient, p: Pagamento): Promise<string | null> {
  const r = await db.from("escritorios").update({ status: "suspenso" }).eq("asaas_customer_id", p.customer)
    .select("id").maybeSingle();
  if (r.error) throw r.error;
  return r.data?.id ?? null;
}

async function descobrirPlano(db: SupabaseClient, p: Pagamento): Promise<string> {
  if (p.paymentLink) {
    const r = await db.from("planos").select("id").eq("asaas_payment_link_id", p.paymentLink).maybeSingle();
    if (r.error) throw r.error;
    if (r.data) return r.data.id;
  }
  if (p.externalReference) {
    const r = await db.from("planos").select("id").eq("id", p.externalReference).maybeSingle();
    if (r.error) throw r.error;
    if (r.data) return r.data.id;
  }
  throw new ErroPermanente(`Plano não identificado para o pagamento ${p.id}`);
}

async function buscarCliente(id: string): Promise<{ name?: string; email?: string }> {
  const r = await fetch(`${ASAAS_BASE}/customers/${encodeURIComponent(id)}`, {
    headers: { access_token: env("ASAAS_API_KEY"), "User-Agent": "BRZ-BRUTUS/1.0" },
  });
  if (r.status === 404) throw new ErroPermanente(`Cliente ${id} não existe no Asaas`);
  if (!r.ok) throw new Error(`Asaas respondeu ${r.status} ao buscar o cliente`);
  return await r.json();
}
