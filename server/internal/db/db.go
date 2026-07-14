package db

import (
	"database/sql"
	"fmt"
	"io/fs"
	"log"
	"time"

	"github.com/go-sql-driver/mysql"
	migrate "github.com/golang-migrate/migrate/v4"
	mysqlmigrate "github.com/golang-migrate/migrate/v4/database/mysql"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

// Config — параметры подключения к MySQL, всё берётся из переменных окружения
// (см. main.go), с дефолтами, совпадающими с реквизитами реальной БД на сервере.
type Config struct {
	Host     string
	Port     string
	Name     string
	User     string
	Password string
}

// Connect открывает пул соединений к MySQL и проверяет его пингом.
func Connect(cfg Config) (*sql.DB, error) {
	mysqlCfg := mysql.NewConfig()
	mysqlCfg.Net = "tcp"
	mysqlCfg.Addr = fmt.Sprintf("%s:%s", cfg.Host, cfg.Port)
	mysqlCfg.DBName = cfg.Name
	mysqlCfg.User = cfg.User
	mysqlCfg.Passwd = cfg.Password
	mysqlCfg.ParseTime = true
	mysqlCfg.Loc = time.Local
	mysqlCfg.Params = map[string]string{"charset": "utf8mb4"}
	// Миграционные .sql-файлы содержат несколько CREATE TABLE в одном файле —
	// драйверу нужно явно разрешить это одним соединением, иначе он пытается
	// выполнить весь файл как один statement и падает с ошибкой синтаксиса
	// на втором CREATE TABLE.
	mysqlCfg.MultiStatements = true

	sqlDB, err := sql.Open("mysql", mysqlCfg.FormatDSN())
	if err != nil {
		return nil, fmt.Errorf("открытие соединения с MySQL: %w", err)
	}

	sqlDB.SetMaxOpenConns(10)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)

	var pingErr error
	for attempt := 1; attempt <= 10; attempt++ {
		pingErr = sqlDB.Ping()
		if pingErr == nil {
			break
		}
		log.Printf("MySQL пока недоступна (попытка %d/10): %v", attempt, pingErr)
		time.Sleep(2 * time.Second)
	}
	if pingErr != nil {
		return nil, fmt.Errorf("не удалось подключиться к MySQL после нескольких попыток: %w", pingErr)
	}

	return sqlDB, nil
}

// RunMigrations применяет все SQL-миграции, вшитые в бинарник (см. go:embed в
// main.go), используя golang-migrate. Ведёт себя как Flyway: хранит номер
// последней применённой миграции в таблице schema_migrations и на каждом
// старте приложения доводит схему до актуальной версии автоматически.
func RunMigrations(sqlDB *sql.DB, migrationsFS fs.FS) error {
	sourceDriver, err := iofs.New(migrationsFS, ".")
	if err != nil {
		return fmt.Errorf("чтение встроенных миграций: %w", err)
	}

	dbDriver, err := mysqlmigrate.WithInstance(sqlDB, &mysqlmigrate.Config{})
	if err != nil {
		return fmt.Errorf("инициализация migrate-драйвера MySQL: %w", err)
	}

	m, err := migrate.NewWithInstance("iofs", sourceDriver, "mysql", dbDriver)
	if err != nil {
		return fmt.Errorf("создание migrate.Migrate: %w", err)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("применение миграций: %w", err)
	}

	version, dirty, verErr := m.Version()
	if verErr == nil {
		log.Printf("Миграции применены, текущая версия схемы: %d (dirty=%v)", version, dirty)
	}

	return nil
}
