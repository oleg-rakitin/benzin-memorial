# Деплой на VPS (FastPanel, root)

Миграция с shared-хостинга reg.ru (`37.140.192.133`, PHP-shim `api.php`) на VPS с root-доступом и прямым nginx proxy.

## Текущий прод-сервер

| Параметр | Значение |
|----------|----------|
| IP | `5.188.19.170` |
| ОС | Ubuntu 24.04, nginx 1.30, MariaDB 11.8 |
| Backend | systemd `benzinopedia-backend.service`, порт `8082` |
| Статика | `/var/www/benzinopedia.ru/` |
| БД | MariaDB `benzinopedia` / пользователь `benzinopedia` |

## Сборка и выкладка backend

```bash
cd server
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o benzinopedia-backend .

scp benzinopedia-backend root@5.188.19.170:/opt/benzinopedia-backend/
scp deploy/.env root@5.188.19.170:/opt/benzinopedia-backend/
scp deploy/benzinopedia-backend.service root@5.188.19.170:/etc/systemd/system/

ssh root@5.188.19.170 'systemctl daemon-reload && systemctl enable --now benzinopedia-backend'
```

## Nginx

```bash
scp deploy/nginx-benzinopedia.conf root@5.188.19.170:/etc/nginx/conf.d/benzinopedia.conf
ssh root@5.188.19.170 'nginx -t && systemctl reload nginx'
```

Проверка:

```bash
curl http://5.188.19.170/api/health
curl 'http://5.188.19.170/api/stations?limit=1'
```

## SSL (Let's Encrypt)

DNS `benzinopedia.ru` → `5.188.19.170` должен быть настроен **до** выпуска сертификата:

```bash
certbot --nginx -d benzinopedia.ru -d www.benzinopedia.ru
```

На момент миграции (2026-07-15) домен `benzinopedia.ru` в публичном DNS не резолвился (NXDOMAIN) — certbot пропущен.

## Переключение DNS

1. В панели регистратора домена создайте/обновите A-запись: `benzinopedia.ru` → `5.188.19.170`
2. Опционально: `www.benzinopedia.ru` → `5.188.19.170` (или CNAME на apex)
3. Дождитесь распространения (TTL, обычно 5–60 мин)
4. Выпустите SSL: `certbot --nginx -d benzinopedia.ru -d www.benzinopedia.ru`
5. Старый сервер `37.140.192.133` **не удалять** — откат через возврат A-записи

## Отличие от shared-хостинга

| Shared (reg.ru) | VPS |
|-----------------|-----|
| `api.php` → `127.0.0.1:8082` | nginx `location /api/` → `127.0.0.1:8082` |
| `nohup` + cron | systemd |
| БД `u3577787_default` | БД `benzinopedia` |

Фронтенд (`map.js`): на проде путь `/api/` (без `?path=` и без `api.php`).
