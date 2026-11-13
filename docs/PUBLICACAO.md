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
