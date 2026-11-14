# Regra de publicação por FTP (BRZ/BRUTUS)

Antes de enviar qualquer arquivo ao servidor, sempre nesta ordem:

1. **Confirmar a pasta de destino** no FTP. Nunca enviar na raiz sem conferir o que há nela.
2. **Listar o conteúdo atual** da pasta de destino (nada é enviado ainda).
3. **Fazer backup** do que existe lá: baixar uma cópia completa para uma pasta datada, por exemplo `backups/AAAA-MM-DD_HHMM/`, e conferir que os arquivos baixaram.
4. **Criar a pasta de publicação** (ou usar uma subpasta de teste) e enviar primeiro para ela quando for uma mudança grande.
5. **Enviar** só os arquivos da versão a publicar.
6. **Conferir ao vivo**: página inicial, `/app/`, login e uma tela interna.
7. **Se algo falhar**, restaurar a cópia do passo 3.

Credenciais do FTP ficam apenas nas variáveis do ambiente e nunca neste repositório.


## Como cada projeto é publicado (situação em 14/11/2026)

Cada projeto tem a sua própria publicação por git (GitHub Actions, sempre manual), com a sua pasta de destino:

| Projeto | Repositório | Pasta no servidor | Backup antes de publicar |
|---|---|---|---|
| SaaS BRZ/BRUTUS | `BRUTUS` (automação `Publicar SaaS no FTP`) | só 7 arquivos: `public_html/index.html` e `public_html/app/*` | Sim, automático (artefato por 90 dias) |
| Controladoria | `controladoria-interna` | `public_html/controladoria/` | Não (cópia de segurança no Dropbox pelo CLI) |
| Massa Falida | `controladoria-interna` | `public_html/massafalida/` | Não |
| Office | `brz-office` | `public_html/office/` | Não |
| Larissa Beiriz | `larissa-advocacia` (servidor próprio, outra conta) | `public_html/` da conta dela | Sim, automático (artefato por 90 dias) |
| Vendas | removido em 14/11/2026 | pasta apagada do servidor (backup em artefato por 90 dias) | n/a |

O SaaS e a Larissa estão em contas de hospedagem diferentes (servidores `191.252.83.184` e `179.188.55.60`): uma publicação nunca atinge a outra.
Para acionar a do SaaS: Actions > Publicar SaaS no FTP > Run workflow, informando `PUBLICAR`. Os segredos `FTP_HOST`, `FTP_USER` e `FTP_PASS` ficam no próprio repositório.
O script usado é `scripts/publicar_saas_ftp.sh` (`backup`, `publicar`, `verificar`).
