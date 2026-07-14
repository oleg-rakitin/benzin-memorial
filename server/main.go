// Backend "Карты скорби" энциклопедии Бензина.
//
// ПОЧЕМУ GO, А НЕ JAVA/SPRING BOOT: сервер — shared-хостинг reg.ru
// (AlmaLinux, ISPmanager), где нет root-доступа и не гарантирован Docker.
// Go компилируется в один статический бинарник linux/amd64 прямо на
// разработческой машине (кросс-компиляция), не требует установки JRE/JVM
// или какого-либо runtime на сервере, занимает десятки МБ памяти вместо
// сотен у JVM и запускается одной командой nohup — что снимает саму
// проблему "доступен ли Docker на сервере", а не решает её через
// network_mode: host.
package main

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ru.benzinopedia/backend/internal/db"
	"ru.benzinopedia/backend/internal/handlers"
	"ru.benzinopedia/backend/internal/seed"
)

//go:embed migrations
var migrationsFS embed.FS

//go:embed data
var dataFS embed.FS

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	cfg := db.Config{
		Host:     getenv("MYSQL_HOST", "127.0.0.1"),
		Port:     getenv("MYSQL_PORT", "3306"),
		Name:     getenv("MYSQL_DATABASE", "u3577787_default"),
		User:     getenv("MYSQL_USER", "u3577787_default"),
		Password: getenv("MYSQL_PASSWORD", "Axt3pRh13Y1Vg41I"),
	}
	port := getenv("SERVER_PORT", "8082")
	corsOrigins := getenv("CORS_ALLOWED_ORIGINS", "https://benzinopedia.ru,https://oleg-rakitin.github.io,http://localhost:5500,http://127.0.0.1:5500")

	log.Printf("Подключаюсь к MySQL %s:%s/%s как %s...", cfg.Host, cfg.Port, cfg.Name, cfg.User)
	sqlDB, err := db.Connect(cfg)
	if err != nil {
		log.Fatalf("Не удалось подключиться к БД: %v", err)
	}
	defer sqlDB.Close()
	log.Println("Подключение к MySQL установлено.")

	migSubFS, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		log.Fatalf("Не удалось подготовить встроенные миграции: %v", err)
	}
	if err := db.RunMigrations(sqlDB, migSubFS); err != nil {
		log.Fatalf("Ошибка применения миграций: %v", err)
	}

	if err := seed.SeedIfEmpty(sqlDB, dataFS, "data/stations_ru.json"); err != nil {
		log.Printf("Предупреждение: сидирование станций из OSM-снэпшота не выполнено: %v", err)
	}

	repo := handlers.NewRepository(sqlDB)
	api := handlers.NewAPI(repo)
	cors := handlers.NewCORSMiddleware(corsOrigins)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", api.Health)
	mux.HandleFunc("GET /api/stations", api.ListStations)
	mux.HandleFunc("POST /api/stations", api.CreateStation)
	mux.HandleFunc("GET /api/stations/{id}", api.GetStation)
	mux.HandleFunc("POST /api/stations/{id}/statuses", api.AddStatus)
	mux.HandleFunc("GET /api/statuses/latest", api.LatestStatuses)

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      cors.Wrap(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("Backend слушает на порту %s (CORS origins: %s)", port, corsOrigins)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Ошибка HTTP-сервера: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Println("Получен сигнал остановки, завершаю работу...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Ошибка при graceful shutdown: %v", err)
	}
}
