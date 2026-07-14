package handlers

import (
	"database/sql"
	"fmt"

	"ru.benzinopedia/backend/internal/models"
)

// Repository — простой слой доступа к данным поверх database/sql,
// без ORM: проект маленький, а лишняя зависимость лишь увеличивает
// размер бинарника и время сборки, что противоречит духу выбора Go
// для этого лёгкого shared-хостинга.
type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// ListStationSummaries отдаёт облегчённый список всех заправок для карты:
// координаты и только статус последней отметки (без комментариев, адресов
// и авторов) — станций в базе может быть до нескольких десятков тысяч
// (весь охват России из OSM), поэтому список должен оставаться лёгким.
func (r *Repository) ListStationSummaries() ([]models.StationSummary, error) {
	rows, err := r.db.Query(`
		SELECT
			s.id, s.name, s.lat, s.lng,
			latest.status, latest.created_at,
			COALESCE(cnt.reports_count, 0)
		FROM stations s
		LEFT JOIN (
			SELECT sr1.station_id, sr1.status, sr1.created_at
			FROM status_records sr1
			LEFT JOIN status_records sr2
				ON sr1.station_id = sr2.station_id
				AND (sr1.created_at < sr2.created_at OR (sr1.created_at = sr2.created_at AND sr1.id < sr2.id))
			WHERE sr2.id IS NULL
		) latest ON latest.station_id = s.id
		LEFT JOIN (
			SELECT station_id, COUNT(*) AS reports_count
			FROM status_records
			GROUP BY station_id
		) cnt ON cnt.station_id = s.id
		ORDER BY s.id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("выборка списка заправок: %w", err)
	}
	defer rows.Close()

	var result []models.StationSummary
	for rows.Next() {
		var (
			st           models.StationSummary
			statusStr    sql.NullString
			statusAt     sql.NullTime
		)
		if err := rows.Scan(&st.ID, &st.Name, &st.Lat, &st.Lng, &statusStr, &statusAt, &st.ReportsCount); err != nil {
			return nil, fmt.Errorf("чтение строки заправки: %w", err)
		}
		if statusStr.Valid {
			fs := models.FuelStatus(statusStr.String)
			st.Status = &fs
		}
		if statusAt.Valid {
			t := statusAt.Time
			st.StatusAt = &t
		}
		result = append(result, st)
	}
	return result, rows.Err()
}

func (r *Repository) StationExists(id int64) (bool, error) {
	var exists bool
	err := r.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM stations WHERE id = ?)`, id).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("проверка существования заправки: %w", err)
	}
	return exists, nil
}

// GetStationDetail отдаёт полную карточку одной заправки — для попапа на
// карте после клика: адрес, последняя отметка целиком и несколько
// последних отметок по этой конкретно заправке.
func (r *Repository) GetStationDetail(id int64) (*models.StationDetail, error) {
	var detail models.StationDetail
	err := r.db.QueryRow(
		`SELECT id, name, address, lat, lng, created_at FROM stations WHERE id = ?`, id,
	).Scan(&detail.ID, &detail.Name, &detail.Address, &detail.Lat, &detail.Lng, &detail.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("выборка заправки: %w", err)
	}

	rows, err := r.db.Query(
		`SELECT id, station_id, status, comment, author, created_at
		 FROM status_records WHERE station_id = ? ORDER BY created_at DESC, id DESC LIMIT 5`, id,
	)
	if err != nil {
		return nil, fmt.Errorf("выборка последних отметок заправки: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var rec models.StatusRecord
		if err := rows.Scan(&rec.ID, &rec.StationID, &rec.Status, &rec.Comment, &rec.Author, &rec.CreatedAt); err != nil {
			return nil, fmt.Errorf("чтение отметки заправки: %w", err)
		}
		detail.RecentStatuses = append(detail.RecentStatuses, rec)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(detail.RecentStatuses) > 0 {
		latest := detail.RecentStatuses[0]
		detail.LatestStatus = &latest
	}

	if err := r.db.QueryRow(
		`SELECT COUNT(*) FROM status_records WHERE station_id = ?`, id,
	).Scan(&detail.ReportsCount); err != nil {
		return nil, fmt.Errorf("подсчёт отметок заправки: %w", err)
	}

	return &detail, nil
}

func (r *Repository) CreateStation(name string, address *string, lat, lng float64) (int64, error) {
	res, err := r.db.Exec(
		`INSERT INTO stations (name, address, lat, lng) VALUES (?, ?, ?, ?)`,
		name, address, lat, lng,
	)
	if err != nil {
		return 0, fmt.Errorf("создание заправки: %w", err)
	}
	return res.LastInsertId()
}

func (r *Repository) AddStatusRecord(stationID int64, status models.FuelStatus, comment, author *string) (*models.StatusRecord, error) {
	res, err := r.db.Exec(
		`INSERT INTO status_records (station_id, status, comment, author) VALUES (?, ?, ?, ?)`,
		stationID, status, comment, author,
	)
	if err != nil {
		return nil, fmt.Errorf("добавление отметки статуса: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("получение id новой отметки: %w", err)
	}

	var rec models.StatusRecord
	err = r.db.QueryRow(
		`SELECT id, station_id, status, comment, author, created_at FROM status_records WHERE id = ?`, id,
	).Scan(&rec.ID, &rec.StationID, &rec.Status, &rec.Comment, &rec.Author, &rec.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("чтение только что созданной отметки: %w", err)
	}
	return &rec, nil
}

func (r *Repository) LatestStatuses(limit int) ([]models.LatestStatusEntry, error) {
	rows, err := r.db.Query(`
		SELECT sr.id, sr.station_id, sr.status, sr.comment, sr.author, sr.created_at,
		       s.name, s.address
		FROM status_records sr
		JOIN stations s ON s.id = sr.station_id
		ORDER BY sr.created_at DESC, sr.id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("выборка последних отметок: %w", err)
	}
	defer rows.Close()

	var result []models.LatestStatusEntry
	for rows.Next() {
		var e models.LatestStatusEntry
		if err := rows.Scan(
			&e.ID, &e.StationID, &e.Status, &e.Comment, &e.Author, &e.CreatedAt,
			&e.StationName, &e.StationAddress,
		); err != nil {
			return nil, fmt.Errorf("чтение строки последней отметки: %w", err)
		}
		result = append(result, e)
	}
	return result, rows.Err()
}
