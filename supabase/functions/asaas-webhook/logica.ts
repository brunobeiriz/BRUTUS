// Regras puras do webhook do Asaas (sem rede nem banco), para poderem ser testadas.

export type Pagamento = {
  id: string;
  customer: string;
  status?: string;
  value?: number;
  billingType?: string;
  externalReference?: string | null;
  paymentLink?: string | null;
  installment?: string | null;
};

export type Evento = {
  id: string;
  event: string;
  payment?: Pagamento;
};

export type Acao = "ativar" | "suspender" | "ignorar";

// Cartão: PAYMENT_CONFIRMED chega na aprovação; PAYMENT_RECEIVED, na liquidação.
const ATIVAR = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const SUSPENDER = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
]);

export function decidirAcao(ev: Evento): Acao {
  if (!ev.payment?.customer) return "ignorar";
  if (ATIVAR.has(ev.event)) return "ativar";
  if (SUSPENDER.has(ev.event)) return "suspender";
  return "ignorar";
}

// Comparação em tempo constante do token enviado pelo Asaas (cabeçalho asaas-access-token).
export function tokenValido(recebido: string | null, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const enc = new TextEncoder();
  const a = enc.encode(recebido);
  const b = enc.encode(esperado);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export function emailValido(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

// Falha que não adianta repetir (dado do cliente inválido, plano desconhecido):
// o webhook responde 200 e registra o erro, para o Asaas não reenviar em loop.
export class ErroPermanente extends Error {}
