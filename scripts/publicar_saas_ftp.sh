#!/usr/bin/env bash
# Publica o site do SaaS BRZ/BRUTUS (pasta site/) por FTP, sem apagar nada no servidor.
# Uso: publicar_saas_ftp.sh backup | publicar | verificar
# Variáveis: FTP_HOST, FTP_USER, FTP_PASS (obrigatórias para backup e publicar; a conferência não precisa); FTP_PORTA, RAIZ_REMOTA, BASE_SITE, ORIGEM, BACKUP_DIR (opcionais).
#
# Só os 7 arquivos abaixo são tocados. A pasta app/icons, o service-worker.js e as pastas
# office/, vendas/, massafalida/ e controladoria/ NÃO são alteradas.
set -euo pipefail

FTP_PORTA="${FTP_PORTA:-21}"
RAIZ_REMOTA="${RAIZ_REMOTA:-public_html}"
BASE_SITE="${BASE_SITE:-https://www.brz.adv.br}"
ORIGEM="${ORIGEM:-site}"
BACKUP_DIR="${BACKUP_DIR:-backup-servidor}"

ARQUIVOS=(
  index.html
  app/index.html
  app/app.js
  app/style.css
  app/pwa.js
  app/config.js
  app/manifest.webmanifest
)

exigir_ftp() {
  : "${FTP_HOST:?FTP_HOST ausente}" "${FTP_USER:?FTP_USER ausente}" "${FTP_PASS:?FTP_PASS ausente}"
}

url_ftp() { printf 'ftp://%s:%s/%s/%s' "$FTP_HOST" "$FTP_PORTA" "$RAIZ_REMOTA" "$1"; }

backup() {
  exigir_ftp
  mkdir -p "$BACKUP_DIR"
  for f in "${ARQUIVOS[@]}"; do
    mkdir -p "$BACKUP_DIR/$(dirname "$f")"
    set +e
    curl -sS --fail -m 90 -u "$FTP_USER:$FTP_PASS" -o "$BACKUP_DIR/$f" "$(url_ftp "$f")"
    rc=$?
    set -e
    if [ "$rc" -eq 0 ]; then
      echo "backup ok: $f ($(wc -c < "$BACKUP_DIR/$f") bytes)"
    elif [ "$rc" -eq 78 ]; then
      rm -f "$BACKUP_DIR/$f"
      echo "backup: $f ainda não existe no servidor (arquivo novo)"
    else
      echo "ERRO no backup de $f (curl código $rc). Nada foi publicado." >&2
      exit 1
    fi
  done
  ( cd "$BACKUP_DIR" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum > SHA256.txt )
  echo "backup concluído em $BACKUP_DIR"
}

publicar() {
  exigir_ftp
  for f in "${ARQUIVOS[@]}"; do
    [ -f "$ORIGEM/$f" ] || { echo "ERRO: falta $ORIGEM/$f" >&2; exit 1; }
  done
  for f in "${ARQUIVOS[@]}"; do
    curl -sS --fail --ftp-create-dirs -m 180 -u "$FTP_USER:$FTP_PASS" -T "$ORIGEM/$f" "$(url_ftp "$f")"
    echo "enviado: $f"
  done
}

verificar() {
  falhas=0
  for f in "${ARQUIVOS[@]}"; do
    local_hash=$(sha256sum "$ORIGEM/$f" | cut -d' ' -f1)
    remoto_hash=$(curl -sS --fail -m 60 -L "$BASE_SITE/$f?conferencia=$RANDOM$RANDOM" | sha256sum | cut -d' ' -f1) || remoto_hash="erro"
    if [ "$local_hash" = "$remoto_hash" ]; then
      echo "conferido: $f"
    else
      echo "DIFERENTE no ar: $f" >&2
      falhas=$((falhas + 1))
    fi
  done
  [ "$falhas" -eq 0 ] || { echo "$falhas arquivo(s) diferente(s) no ar. Restaure o backup." >&2; exit 1; }
  echo "tudo conferido: o site no ar é idêntico ao publicado"
}

case "${1:-}" in
  backup) backup ;;
  publicar) publicar ;;
  verificar) verificar ;;
  *) echo "uso: $0 backup | publicar | verificar" >&2; exit 2 ;;
esac
