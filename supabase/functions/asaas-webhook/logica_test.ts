import { assert, assertEquals } from "jsr:@std/assert@1";
import { decidirAcao, emailValido, tokenValido } from "./logica.ts";

const pag = { id: "pay_1", customer: "cus_1" };

Deno.test("decide a ação por tipo de evento", () => {
  assertEquals(decidirAcao({ id: "e1", event: "PAYMENT_CONFIRMED", payment: pag }), "ativar");
  assertEquals(decidirAcao({ id: "e2", event: "PAYMENT_RECEIVED", payment: pag }), "ativar");
  assertEquals(decidirAcao({ id: "e3", event: "PAYMENT_REFUNDED", payment: pag }), "suspender");
  assertEquals(decidirAcao({ id: "e4", event: "PAYMENT_CHARGEBACK_REQUESTED", payment: pag }), "suspender");
  assertEquals(decidirAcao({ id: "e5", event: "PAYMENT_CREATED", payment: pag }), "ignorar");
  assertEquals(decidirAcao({ id: "e6", event: "PAYMENT_CONFIRMED" }), "ignorar");
});

Deno.test("token: só o exato é aceito", () => {
  assert(tokenValido("segredo-123", "segredo-123"));
  assert(!tokenValido("segredo-124", "segredo-123"));
  assert(!tokenValido("segredo-12", "segredo-123"));
  assert(!tokenValido(null, "segredo-123"));
  assert(!tokenValido("", ""));
});

Deno.test("e-mail válido", () => {
  assert(emailValido("a@b.com"));
  assert(emailValido(" maria@escritorio.adv.br "));
  assert(!emailValido("sem-arroba"));
  assert(!emailValido("a@b"));
  assert(!emailValido(null));
});
