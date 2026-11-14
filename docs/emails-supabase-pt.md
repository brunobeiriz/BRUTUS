# E-mails do Supabase em português (BRZ/BRUTUS)

Onde colar: painel do Supabase, projeto `brz brutus`, **Authentication**, **Email Templates**.
Para cada modelo: copie o **Assunto** no campo "Subject" e o bloco HTML no campo "Message body".
Não altere as partes entre chaves duplas, como `{{ .ConfirmationURL }}`: o Supabase as preenche sozinho.

Antes de publicar, confira o endereço de suporte (`suporte@brz.adv.br`) quando a caixa existir.

---

## 1. Invite user (convite: é o e-mail enviado depois da compra)

**Assunto:** Seu acesso ao BRZ/BRUTUS está pronto

```html
<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;padding:24px">
  <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:12px;padding:28px;color:#172033">
    <h2 style="margin:0 0 4px;color:#11263f">BRZ/BRUTUS</h2>
    <p style="margin:0 0 20px;color:#667085;font-size:13px">Controladoria Jurídica</p>
    <h3 style="margin:0 0 12px">Bem-vindo(a)! Defina sua senha</h3>
    <p style="line-height:1.5">Sua contratação foi confirmada e o seu acesso está pronto. Para começar, defina sua senha no botão abaixo.</p>
    <p style="text-align:center;margin:28px 0"><a href="{{ .ConfirmationURL }}" style="background:#244a73;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">Definir minha senha</a></p>
    <p style="font-size:13px;color:#667085;line-height:1.5">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all">{{ .ConfirmationURL }}</span></p>
    <p style="font-size:13px;color:#667085;line-height:1.5">Este link é pessoal e tem validade limitada. Se ele expirar, abra a página de acesso e use "Esqueci minha senha".</p>
    <hr style="border:0;border-top:1px solid #e4e7ec;margin:24px 0 16px">
    <p style="font-size:12px;color:#98a2b3;line-height:1.5">Se você não reconhece esta mensagem, pode ignorá-la. Dúvidas: suporte@brz.adv.br</p>
  </div>
</div>
```

---

## 2. Reset password (esqueci minha senha)

**Assunto:** Redefinir sua senha do BRZ/BRUTUS

```html
<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;padding:24px">
  <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:12px;padding:28px;color:#172033">
    <h2 style="margin:0 0 4px;color:#11263f">BRZ/BRUTUS</h2>
    <p style="margin:0 0 20px;color:#667085;font-size:13px">Controladoria Jurídica</p>
    <h3 style="margin:0 0 12px">Redefinir sua senha</h3>
    <p style="line-height:1.5">Recebemos um pedido para redefinir a senha da sua conta. Toque no botão abaixo para escolher uma nova senha.</p>
    <p style="text-align:center;margin:28px 0"><a href="{{ .ConfirmationURL }}" style="background:#244a73;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">Escolher nova senha</a></p>
    <p style="font-size:13px;color:#667085;line-height:1.5">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all">{{ .ConfirmationURL }}</span></p>
    <hr style="border:0;border-top:1px solid #e4e7ec;margin:24px 0 16px">
    <p style="font-size:12px;color:#98a2b3;line-height:1.5">Se você não pediu a redefinição, ignore esta mensagem: sua senha continua a mesma. Dúvidas: suporte@brz.adv.br</p>
  </div>
</div>
```

---

## 3. Confirm signup (confirmação de cadastro)

**Assunto:** Confirme seu e-mail no BRZ/BRUTUS

```html
<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;padding:24px">
  <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:12px;padding:28px;color:#172033">
    <h2 style="margin:0 0 4px;color:#11263f">BRZ/BRUTUS</h2>
    <p style="margin:0 0 20px;color:#667085;font-size:13px">Controladoria Jurídica</p>
    <h3 style="margin:0 0 12px">Confirme seu e-mail</h3>
    <p style="line-height:1.5">Para ativar sua conta, confirme o seu endereço de e-mail no botão abaixo.</p>
    <p style="text-align:center;margin:28px 0"><a href="{{ .ConfirmationURL }}" style="background:#244a73;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">Confirmar e-mail</a></p>
    <p style="font-size:13px;color:#667085;line-height:1.5">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all">{{ .ConfirmationURL }}</span></p>
    <hr style="border:0;border-top:1px solid #e4e7ec;margin:24px 0 16px">
    <p style="font-size:12px;color:#98a2b3;line-height:1.5">Se você não criou esta conta, pode ignorar esta mensagem. Dúvidas: suporte@brz.adv.br</p>
  </div>
</div>
```

---

## 4. Magic link (link de acesso)

**Assunto:** Seu link de acesso ao BRZ/BRUTUS

```html
<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;padding:24px">
  <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:12px;padding:28px;color:#172033">
    <h2 style="margin:0 0 4px;color:#11263f">BRZ/BRUTUS</h2>
    <p style="margin:0 0 20px;color:#667085;font-size:13px">Controladoria Jurídica</p>
    <h3 style="margin:0 0 12px">Seu link de acesso</h3>
    <p style="line-height:1.5">Toque no botão abaixo para entrar no sistema. O link é de uso único e tem validade limitada.</p>
    <p style="text-align:center;margin:28px 0"><a href="{{ .ConfirmationURL }}" style="background:#244a73;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">Entrar no sistema</a></p>
    <p style="font-size:13px;color:#667085;line-height:1.5">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all">{{ .ConfirmationURL }}</span></p>
    <hr style="border:0;border-top:1px solid #e4e7ec;margin:24px 0 16px">
    <p style="font-size:12px;color:#98a2b3;line-height:1.5">Se você não pediu este link, ignore esta mensagem. Dúvidas: suporte@brz.adv.br</p>
  </div>
</div>
```

---

## 5. Change email address (troca de e-mail)

**Assunto:** Confirme a alteração do seu e-mail

```html
<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;padding:24px">
  <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:12px;padding:28px;color:#172033">
    <h2 style="margin:0 0 4px;color:#11263f">BRZ/BRUTUS</h2>
    <p style="margin:0 0 20px;color:#667085;font-size:13px">Controladoria Jurídica</p>
    <h3 style="margin:0 0 12px">Confirme a alteração do e-mail</h3>
    <p style="line-height:1.5">Você pediu para trocar o e-mail da sua conta de <strong>{{ .Email }}</strong> para <strong>{{ .NewEmail }}</strong>. Para concluir, confirme no botão abaixo.</p>
    <p style="text-align:center;margin:28px 0"><a href="{{ .ConfirmationURL }}" style="background:#244a73;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">Confirmar alteração</a></p>
    <hr style="border:0;border-top:1px solid #e4e7ec;margin:24px 0 16px">
    <p style="font-size:12px;color:#98a2b3;line-height:1.5">Se você não pediu esta alteração, ignore esta mensagem e avise o suporte: suporte@brz.adv.br</p>
  </div>
</div>
```

---

## 6. Reauthentication (código de confirmação)

**Assunto:** Seu código de confirmação do BRZ/BRUTUS

```html
<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;padding:24px">
  <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:12px;padding:28px;color:#172033">
    <h2 style="margin:0 0 4px;color:#11263f">BRZ/BRUTUS</h2>
    <p style="margin:0 0 20px;color:#667085;font-size:13px">Controladoria Jurídica</p>
    <h3 style="margin:0 0 12px">Seu código de confirmação</h3>
    <p style="line-height:1.5">Use o código abaixo para confirmar a operação no sistema:</p>
    <p style="text-align:center;margin:24px 0;font-size:28px;letter-spacing:6px;font-weight:bold;color:#11263f">{{ .Token }}</p>
    <hr style="border:0;border-top:1px solid #e4e7ec;margin:24px 0 16px">
    <p style="font-size:12px;color:#98a2b3;line-height:1.5">Se você não pediu este código, ignore esta mensagem. Dúvidas: suporte@brz.adv.br</p>
  </div>
</div>
```

---

## Observações

- Os modelos usam apenas estilos em linha, para funcionarem bem nos aplicativos de e-mail e no celular.
- O e-mail de **convite** (modelo 1) é o que o contratante recebe logo depois da compra, e o de **redefinição** (modelo 2) vale para "Esqueci minha senha".
- Em **Authentication, SMTP Settings**, configurar um remetente próprio (por exemplo `nao-responda@brz.adv.br`) melhora a entrega e evita o limite baixo de envios do Supabase. Peça ao administrador da Locaweb o SPF, o DKIM e o DMARC do domínio.
