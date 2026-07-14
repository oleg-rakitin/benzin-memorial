# Деплой backend на VPS (FastPanel, root)

Split-архитектура:

| Компонент | Сервер | Путь |
|-----------|--------|------|
| Статика (HTML, CSS, JS) | reg.ru `37.140.192.133` | `/var/www/u3577787/data/www/benzinopedia.ru/` |
| Go backend + MariaDB | VPS `5.188.19.170` | `/opt/benzinopedia-backend/` |
| API (публичный URL) | `https://api.benzinopedia.ru/api/` | nginx → `127.0.0.1:8082` |

## VPS (backend-only)

| Параметр | Значение |
|----------|----------|
| IP | `5.188.19.170` |
| Backend | systemd `benzinopedia-backend.service`, порт `8082` |
| БД | MariaDB `benzinopedia` / пользователь `benzinopedia` |

## Сборка и выкладка backend

```bash
cd server
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o benzinopedia-backend .

scp benzinopedia-backend root@5.188.19.170:/opt/benzinopedia-backend/
scp deploy/.env root@5.188.19.170:/opt/benzinopedia-backend/
scp deploy/benzinopedia-backend.service root@5.188.19.170:/etc/systemd/system/

ssh root@5.188.19.170 'systemctl daemon-reload && systemctl restart benzinopedia-backend'
```

## Nginx (только API)

```bash
scp deploy/nginx-api-benzinopedia.conf root@5.188.19.170:/etc/nginx/conf.d/benzinopedia.conf
ssh root@5.188.19.170 'rm -f /etc/nginx/conf.d/benzinopedia.conf.bak; nginx -t && systemctl reload nginx'
```

Проверка:

```bash
curl http://5.188.19.170/api/health
curl 'http://5.188.19.170/api/stations?limit=1'
```

## SSL для api.benzinopedia.ru

1. DNS: `api.benzinopedia.ru` A → `5.188.19.170`
2. Дождитесь распространения (dig api.benzinopedia.ru)
3. Выпуск сертификата:

```bash
certbot --nginx -d api.benzinopedia.ru
```

`benzinopedia.ru` (статика) остаётся на reg.ru — A-запись apex **не** переносится на VPS.

## CORS

Backend должен разрешать origin'ы фронтенда (статика на reg.ru и GitHub Pages):

```
CORS_ALLOWED_ORIGINS=https://benzinopedia.ru,http://benzinopedia.ru,https://www.benzinopedia.ru,http://www.benzinopedia.ru,https://oleg-rakitin.github.io
```

## Деплой map.js на reg.ru (статика)

```bash
scp map.js u3577787@37.140.192.133:/var/www/u3577787/data/www/benzinopedia.ru/map.js
```

`map.js` указывает на `https://api.benzinopedia.ru/api` (cross-origin).

## Отличие от shared-хостинга (legacy)

| Shared (reg.ru) | VPS (API) |
|-----------------|-----------|
| `api.php` → `127.0.0.1:8082` | nginx `location /api/` → `127.0.0.1:8082` |
| `nohup` + cron | systemd |
| БД `u3577787_default` | БД `benzinopedia` |

На reg.ru удалены: `~/benzinopedia-backend/`, cron, `api.php`. Статика **не трогается**.
