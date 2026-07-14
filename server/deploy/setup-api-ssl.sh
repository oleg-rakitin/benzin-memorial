#!/usr/bin/env bash
# Повторный запуск SSL для api.benzinopedia.ru после добавления DNS A-записи.
# Запуск на VPS: bash setup-api-ssl.sh
set -euo pipefail

DOMAIN="api.benzinopedia.ru"
EXPECTED_IP="5.188.19.170"
EMAIL="admin@benzinopedia.ru"
NGINX_CONF="/etc/nginx/conf.d/benzinopedia.conf"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Проверка DNS: ${DOMAIN} → ${EXPECTED_IP}"
RESOLVED=$(dig +short "${DOMAIN}" A | head -1 || true)
if [[ "${RESOLVED}" != "${EXPECTED_IP}" ]]; then
  echo "ОШИБКА: DNS ещё не готов. dig ${DOMAIN} = '${RESOLVED:-пусто}', ожидается ${EXPECTED_IP}"
  echo "Добавьте A-запись в reg.ru и подождите 1–15 мин, затем запустите скрипт снова."
  exit 1
fi
echo "DNS OK: ${DOMAIN} → ${RESOLVED}"

echo "==> Установка nginx-конфига"
NGINX_SRC="${SCRIPT_DIR}/nginx-api-benzinopedia.conf"
[[ -f "${NGINX_SRC}" ]] || NGINX_SRC="${SCRIPT_DIR}/deploy/nginx-api-benzinopedia.conf"
install -m 644 "${NGINX_SRC}" "${NGINX_CONF}"
nginx -t
systemctl reload nginx

echo "==> Проверка HTTP proxy"
HTTP_BODY=$(curl -sf "http://${DOMAIN}/api/health" || true)
if [[ "${HTTP_BODY}" != '{"status":"ok"}' ]]; then
  echo "ПРЕДУПРЕЖДЕНИЕ: http://${DOMAIN}/api/health вернул: ${HTTP_BODY:-ошибка}"
  echo "Проверьте nginx и backend (systemctl status benzinopedia-backend)"
fi

echo "==> Установка certbot (если нет)"
if ! command -v certbot &>/dev/null; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx
fi

echo "==> Получение SSL-сертификата"
certbot --nginx -d "${DOMAIN}" \
  --non-interactive --agree-tos -m "${EMAIL}" \
  --redirect

# FastPanel parking слушает 5.188.19.170:443 default_server — certbot ставит listen 443 ssl,
# из-за чего SNI попадает на self-signed parking. Привязываем к IP.
if grep -q 'listen 443 ssl; # managed by Certbot' "${NGINX_CONF}"; then
  sed -i "s/listen 443 ssl; # managed by Certbot/listen ${EXPECTED_IP}:443 ssl; # managed by Certbot/" "${NGINX_CONF}"
  nginx -t
  systemctl reload nginx
fi

echo "==> Проверка HTTPS"
HTTPS_BODY=$(curl -sf "https://${DOMAIN}/api/health")
if [[ "${HTTPS_BODY}" == '{"status":"ok"}' ]]; then
  echo "ГОТОВО: https://${DOMAIN}/api/health → ${HTTPS_BODY}"
else
  echo "ОШИБКА: https://${DOMAIN}/api/health → ${HTTPS_BODY}"
  exit 1
fi
