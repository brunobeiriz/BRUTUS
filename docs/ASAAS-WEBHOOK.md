# Webhook do Asaas (BRZ/BRUTUS)

Cria o escritório e o acesso do contratante quando o pagamento é confirmado, e suspende o acesso em estorno
ou contestação. Código em `supabase/functions/asaas-webhook/`. Banco: migration `20261114000000_planos_e_provisionamento.sql`.

## Fluxo

1. O cliente paga um link de pagamento do Asaas (parcelado em até 10x no cartão).
2. O Asaas envia `PAYMENT_CONFIRMED` (aprovação) e depois `PAYMENT_RECEIVED` (liquidação) ao webhook.
3. O webhook confere o token, registra o evento (nunca processa o mesmo evento duas vezes), identifica o plano
   pelo link de pagamento (`planos.asaas_payment_link_id`) ou por `externalReference`, busca nome e e-mail do cliente
   no Asaas, cria o escritório (3 usuários, vigência do plano), convida o e-mail (o Supabase envia a mensagem para definir a senha)
   e cria o perfil de administrador.
4. `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED` e `PAYMENT_CHARGEBACK_DISPUTE` suspendem o escritório. Os dados são preservados.

## Implantação (nesta ordem; fazer backup antes, conforme docs/PUBLICACAO.md)

1. Revisar e aplicar a migration no projeto `brz brutus` (`umyynipwixjulrgqbfvm`).
2. Definir os segredos da função (o valor é digitado no painel do Supabase, nunca no chat):
   - `ASAAS_WEBHOOK_TOKEN`: um texto longo e aleatório (o mesmo que será cadastrado no Asaas).
   - `ASAAS_API_KEY`: chave de API do Asaas (sandbox no início).
   - `ASAAS_BASE_URL`: `https://api-sandbox.asaas.com/v3` (sandbox). Em produção, a URL de produção do Asaas.
   - `APP_URL`: `https://www.brz.adv.br/app/` (opcional).
3. Publicar a função `asaas-webhook` com a verificação de JWT DESLIGADA (o Asaas não envia JWT; a segurança é o token).
4. No painel do Asaas (Integrações, Webhooks), cadastrar:
   - URL: `https://umyynipwixjulrgqbfvm.supabase.co/functions/v1/asaas-webhook`
   - Token de autenticação: o mesmo `ASAAS_WEBHOOK_TOKEN`
   - Eventos: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`
5. Criar no Asaas um link de pagamento por plano (parcelamento em até 10x) e preencher na tabela `planos`:
   `asaas_payment_link_id`, `preco_centavos` e `ativo = true`.
6. Testar no sandbox com um pagamento de teste e conferir: linha em `asaas_eventos` (processado), escritório criado,
   e-mail de acesso recebido, login funcionando.

## Limitações conhecidas

- Se o e-mail do comprador já tiver cadastro no sistema, o evento é marcado com erro e precisa de tratamento manual.
- Se o convite for enviado e a gravação do perfil falhar, o reenvio do evento acusa "e-mail já cadastrado" e exige correção manual.
- Eventos de atraso (`PAYMENT_OVERDUE`) são ignorados: o acesso é regido pela vigência do plano.
- O envio de e-mail usa o remetente padrão do Supabase até configurarmos um remetente próprio.
