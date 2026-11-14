import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const raiz = '/home/user/BRUTUS/site/app';
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/json' };
const servidor = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(raiz, p.replace(/^\/app/, ''));
  if (!f.startsWith(raiz) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': tipos[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(0);
const porta = servidor.address().port;

// Supabase de mentira: registra as chamadas e devolve respostas fixas.
const supabaseFalso = `
window.__chamadas = [];
window.supabase = { createClient: () => ({
  auth: {
    getSession: async () => ({ data: { session: window.__sessao || null } }),
    signInWithPassword: async (a) => { window.__chamadas.push(['login', a.email]); return { data: { user: { id: 'u1', email: a.email } }, error: null }; },
    updateUser: async (a) => { window.__chamadas.push(['updateUser', a.password.length]); return window.__erroUpdate ? { data: null, error: window.__erroUpdate } : { data: { user: { id: 'u1', email: 'a@b.c' } }, error: null }; },
    resetPasswordForEmail: async (e, o) => { window.__chamadas.push(['reset', e, o.redirectTo]); return { error: null }; },
    signOut: async () => ({})
  },
  from: (t) => { const mk = (single) => new Proxy(function(){}, { get(_, k) {
    if (k === 'then') { const r = { data: (t === 'profiles' && single) ? { id: 'u1', nome: 'Teste', role: 'admin', ativo: true, escritorio_id: 'e1' } : [], error: null }; return (ok) => Promise.resolve(r).then(ok); }
    if (k === 'single' || k === 'maybeSingle') return () => mk(true);
    return () => mk(single); } }); return mk(false); }
}) };`;

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let falhas = 0;
const confere = (ok, nome) => { console.log((ok ? 'OK    ' : 'FALHA ') + nome); if (!ok) falhas++; };

async function abrir(hash, sessao) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('ERRO JS:', e.message); falhas++; });
  await page.route('**/@supabase/supabase-js@2', r => r.fulfill({ contentType: 'text/javascript', body: supabaseFalso }));
  await page.route(/fonts\.g/, r => r.abort());
  if (sessao) await page.addInitScript(() => { window.__sessao = { user: { id: 'u1', email: 'a@b.c' } }; });
  await page.goto(`http://localhost:${porta}/app/${hash}`);
  await page.waitForTimeout(400);
  return page;
}
const visivel = (page, id) => page.locator('#' + id).evaluate(e => !e.classList.contains('hidden'));

// A) acesso normal, sem link
let p = await abrir('', false);
confere(await visivel(p, 'loginScreen') && !(await visivel(p, 'passwordScreen')), 'A1 acesso normal mostra só o login');
await p.click('#forgotBtn');
confere((await p.locator('#loginMsg').textContent()).includes('Digite seu e-mail'), 'A2 "esqueci a senha" sem e-mail pede o e-mail');
await p.fill('#loginEmail', 'maria@escritorio.adv.br'); await p.click('#forgotBtn'); await p.waitForTimeout(200);
const ch = await p.evaluate(() => window.__chamadas);
confere(ch.some(c => c[0] === 'reset' && c[1] === 'maria@escritorio.adv.br' && c[2].endsWith('/app/')), 'A3 pede o link de nova senha com redirecionamento para /app/');
confere((await p.locator('#loginMsg').textContent()).includes('Se este e-mail tiver cadastro') && (await p.locator('#loginMsg').getAttribute('class')).includes('success'), 'A4 mensagem neutra (não revela se o e-mail existe)');
await p.fill('#loginPassword', 'x'); await p.press('#loginPassword', 'Enter'); await p.waitForTimeout(300);
confere((await p.evaluate(() => window.__chamadas)).some(c => c[0] === 'login'), 'A5 Enter no campo de senha faz o login');

// B) convite
for (const tipo of ['invite', 'recovery']) {
  p = await abrir(`#access_token=abc&type=${tipo}`, true);
  confere(await visivel(p, 'passwordScreen') && !(await visivel(p, 'loginScreen')) && !(await visivel(p, 'app')), `B1 link de ${tipo} abre a tela de definir senha`);
  await p.fill('#newPassword', 'curta1'); await p.fill('#newPassword2', 'curta1'); await p.click('#savePasswordBtn');
  confere((await p.locator('#passwordMsg').textContent()).includes('pelo menos 10'), `B2 ${tipo}: recusa senha curta`);
  await p.fill('#newPassword', 'somenteletrasaqui'); await p.fill('#newPassword2', 'somenteletrasaqui'); await p.click('#savePasswordBtn');
  confere((await p.locator('#passwordMsg').textContent()).includes('letras e números'), `B3 ${tipo}: exige letras e números`);
  await p.fill('#newPassword', 'SenhaBoa12345'); await p.fill('#newPassword2', 'SenhaBoa1234x'); await p.click('#savePasswordBtn');
  confere((await p.locator('#passwordMsg').textContent()).includes('não são iguais'), `B4 ${tipo}: recusa senhas diferentes`);
  confere(!(await p.evaluate(() => window.__chamadas)).some(c => c[0] === 'updateUser'), `B5 ${tipo}: nenhuma chamada ao Supabase com senha inválida`);
  await p.fill('#newPassword2', 'SenhaBoa12345'); await p.click('#savePasswordBtn'); await p.waitForTimeout(500);
  confere((await p.evaluate(() => window.__chamadas)).some(c => c[0] === 'updateUser' && c[1] === 13), `B6 ${tipo}: senha válida é enviada ao Supabase`);
  confere(await visivel(p, 'app') && !(await visivel(p, 'passwordScreen')), `B7 ${tipo}: depois de salvar, entra no sistema`);
  confere(!(await p.evaluate(() => location.hash)), `B8 ${tipo}: a chave do link some do endereço`);
}

// C) senha fraca recusada pelo servidor
p = await abrir('#access_token=abc&type=invite', true);
await p.evaluate(() => { window.__erroUpdate = { code: 'weak_password', message: 'Password is known to be weak' }; });
await p.fill('#newPassword', 'SenhaBoa12345'); await p.fill('#newPassword2', 'SenhaBoa12345'); await p.click('#savePasswordBtn'); await p.waitForTimeout(300);
confere((await p.locator('#passwordMsg').textContent()).includes('fraca') && !(await visivel(p, 'app')), 'C1 senha fraca recusada pelo servidor continua na tela com aviso em português');

// D) link expirado
p = await abrir('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', false);
confere(await visivel(p, 'loginScreen') && (await p.locator('#loginMsg').textContent()).includes('expirou'), 'D1 link expirado mostra aviso e o login');
confere(!(await p.evaluate(() => location.hash)), 'D2 o erro some do endereço');

// E) já logado, sem link: vai direto ao sistema
p = await abrir('', true);
confere(await visivel(p, 'app') && !(await visivel(p, 'passwordScreen')), 'E1 sessão existente sem link entra direto no sistema');

await p.screenshot({ path: '/tmp/claude-0/-home-user/dad25a56-cb5b-53cd-a136-b1a40a58a0c8/scratchpad/pw/tela_app.png' });
p = await abrir('#access_token=abc&type=invite', true);
await p.screenshot({ path: '/tmp/claude-0/-home-user/dad25a56-cb5b-53cd-a136-b1a40a58a0c8/scratchpad/pw/tela_senha.png' });
await navegador.close(); servidor.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
