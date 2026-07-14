package models

import "time"

// FuelStatus — статус заправки на момент отметки.
type FuelStatus string

const (
	StatusAvailable   FuelStatus = "AVAILABLE"
	StatusShortage92  FuelStatus = "SHORTAGE_92"
	StatusShortage95  FuelStatus = "SHORTAGE_95"
	StatusQueueOnly   FuelStatus = "QUEUE_ONLY"
	StatusClosed      FuelStatus = "CLOSED"
)

// IsValid проверяет, что значение статуса входит в допустимый enum.
func (s FuelStatus) IsValid() bool {
	switch s {
	case StatusAvailable, StatusShortage92, StatusShortage95, StatusQueueOnly, StatusClosed:
		return true
	default:
		return false
	}
}

// Station — заправка/колонка на карте скорби.
type Station struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Address   *string   `json:"address"`
	Lat       float64   `json:"lat"`
	Lng       float64   `json:"lng"`
	CreatedAt time.Time `json:"createdAt"`
}

// StatusRecord — одна отметка статуса, оставленная пользователем сайта.
type StatusRecord struct {
	ID        int64      `json:"id"`
	StationID int64      `json:"stationId"`
	Status    FuelStatus `json:"status"`
	Comment   *string    `json:"comment"`
	Author    *string    `json:"author"`
	CreatedAt time.Time  `json:"createdAt"`
}

// StationSummary — облегчённая карточка заправки для списочного эндпоинта
// GET /api/stations. Заправок в базе могут быть десятки тысяч (весь список
// населённых пунктов России из OSM), поэтому список отдаёт только то, что
// нужно, чтобы нарисовать маркер и раскрасить его по статусу: без адреса,
// комментариев и авторов отметок — это ощутимо уменьшает объём ответа.
type StationSummary struct {
	ID           int64       `json:"id"`
	Name         string      `json:"name"`
	Lat          float64     `json:"lat"`
	Lng          float64     `json:"lng"`
	Status       *FuelStatus `json:"status"`
	StatusAt     *time.Time  `json:"statusAt"`
	ReportsCount int         `json:"reportsCount"`
}

// StationDetail — полная информация по одной заправке для GET /api/stations/{id}:
// адрес, последняя отметка целиком и несколько последних отметок по этой станции.
type StationDetail struct {
	Station
	LatestStatus    *StatusRecord  `json:"latestStatus"`
	ReportsCount    int            `json:"reportsCount"`
	RecentStatuses  []StatusRecord `json:"recentStatuses"`
}

// LatestStatusEntry — запись из выборки "последние N отметок по всем заправкам",
// дополненная названием и адресом заправки, чтобы фронтенду не нужно было
// делать отдельный join-запрос.
type LatestStatusEntry struct {
	StatusRecord
	StationName    string  `json:"stationName"`
	StationAddress *string `json:"stationAddress"`
}
