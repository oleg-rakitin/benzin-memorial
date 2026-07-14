package seed

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
)

// StationSeed — одна строка снэпшота реальных заправок, собранного из
// OpenStreetMap (Overpass API). Хранится в server/data/stations_ru.json
// и вшивается в бинарник через go:embed (см. main.go), чтобы сидирование
// не зависело от доступности Overpass в момент будущих деплоев/перезапусков.
type StationSeed struct {
	Name    string  `json:"name"`
	Address *string `json:"address"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
}

const batchSize = 500

// SeedIfEmpty заливает станции из встроенного JSON-снэпшота, но только если
// таблица stations сейчас пуста — чтобы не дублировать данные при каждом
// перезапуске приложения. У импортированных реальных заправок сознательно
// нет ни одной стартовой отметки статуса: реального открытого источника
// данных о наличии топлива не существует, поэтому статус остаётся
// "неизвестен", пока его не оставит живой пользователь сайта.
func SeedIfEmpty(sqlDB *sql.DB, dataFS fs.FS, path string) error {
	var count int
	if err := sqlDB.QueryRow(`SELECT COUNT(*) FROM stations`).Scan(&count); err != nil {
		return fmt.Errorf("проверка количества заправок перед сидированием: %w", err)
	}
	if count > 0 {
		log.Printf("В таблице stations уже %d записей — сидирование из снэпшота OSM пропущено", count)
		return nil
	}

	raw, err := fs.ReadFile(dataFS, path)
	if err != nil {
		return fmt.Errorf("чтение встроенного снэпшота станций %s: %w", path, err)
	}

	var stations []StationSeed
	if err := json.Unmarshal(raw, &stations); err != nil {
		return fmt.Errorf("разбор снэпшота станций: %w", err)
	}
	if len(stations) == 0 {
		log.Printf("Снэпшот станций пуст, сидирование не выполняется")
		return nil
	}

	log.Printf("Заливаю %d станций из снэпшота OSM (server/data/stations_ru.json) в пустую таблицу stations...", len(stations))

	tx, err := sqlDB.Begin()
	if err != nil {
		return fmt.Errorf("начало транзакции сидирования: %w", err)
	}
	defer tx.Rollback()

	for i := 0; i < len(stations); i += batchSize {
		end := i + batchSize
		if end > len(stations) {
			end = len(stations)
		}
		batch := stations[i:end]

		query := "INSERT INTO stations (name, address, lat, lng) VALUES "
		args := make([]any, 0, len(batch)*4)
		for j, st := range batch {
			if j > 0 {
				query += ", "
			}
			query += "(?, ?, ?, ?)"
			args = append(args, st.Name, st.Address, st.Lat, st.Lng)
		}
		if _, err := tx.Exec(query, args...); err != nil {
			return fmt.Errorf("вставка батча станций [%d:%d]: %w", i, end, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("подтверждение транзакции сидирования: %w", err)
	}

	log.Printf("Сидирование завершено: %d станций залито", len(stations))
	return nil
}
