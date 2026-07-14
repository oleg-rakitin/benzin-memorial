# Многостадийная сборка: сначала компилируем статический Go-бинарник,
# затем кладём его в минимальный образ для запуска — итоговый образ
# получается на порядок легче любого JVM-варианта (несколько десятков МБ
# вместо сотен), что и было одним из аргументов в пользу Go для этого
# shared-хостинга.
#
# ВАЖНО (см. README.md в этой директории): на реальном сервере
# 37.140.192.133 (reg.ru, ISPmanager, без root-доступа у пользователя)
# демон Docker установлен, но не запущен, а поднять его без sudo не
# получилось — поэтому в проде используется fallback-деплой (бинарник
# + nohup), а этот Dockerfile/compose — рабочий путь для любого
# Docker-совместимого хоста с root-доступом (свой VPS и т.п.).

FROM golang:1.24-bookworm AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /build/benzinopedia-backend .

FROM gcr.io/distroless/static-debian12:nonroot AS runtime
WORKDIR /app
COPY --from=builder /build/benzinopedia-backend /app/benzinopedia-backend

ENV SERVER_PORT=8082 \
    MYSQL_HOST=127.0.0.1 \
    MYSQL_PORT=3306 \
    MYSQL_DATABASE=u3577787_default \
    MYSQL_USER=u3577787_default \
    CORS_ALLOWED_ORIGINS=https://benzinopedia.ru,https://oleg-rakitin.github.io

EXPOSE 8082
ENTRYPOINT ["/app/benzinopedia-backend"]
