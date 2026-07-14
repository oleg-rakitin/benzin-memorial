package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"ru.benzinopedia/backend/internal/models"
)

type API struct {
	repo *Repository
}

func NewAPI(repo *Repository) *API {
	return &API{repo: repo}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if payload != nil {
		if err := json.NewEncoder(w).Encode(payload); err != nil {
			log.Printf("ошибка сериализации ответа: %v", err)
		}
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// Health — простой health-check, полезен и для ручной проверки, и для
// будущего мониторинга/оркестрации контейнера.
func (a *API) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ListStations — GET /api/stations. Отдаёт облегчённый список всех заправок
// (id, название, координаты, статус последней отметки) — без адресов и
// комментариев, чтобы ответ оставался быстрым при больших объёмах данных
// (по всей России из OSM это десятки тысяч точек).
func (a *API) ListStations(w http.ResponseWriter, r *http.Request) {
	stations, err := a.repo.ListStationSummaries()
	if err != nil {
		log.Printf("ListStations: %v", err)
		writeError(w, http.StatusInternalServerError, "не удалось получить список заправок")
		return
	}
	if stations == nil {
		stations = []models.StationSummary{}
	}
	writeJSON(w, http.StatusOK, stations)
}

// GetStation — GET /api/stations/{id}. Полная карточка заправки: адрес,
// последняя отметка целиком и несколько последних отметок именно по этой
// заправке — вызывается по клику на маркер на карте.
func (a *API) GetStation(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDFromPath(r.URL.Path, "/api/stations/")
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id заправки")
		return
	}

	detail, err := a.repo.GetStationDetail(id)
	if err != nil {
		log.Printf("GetStation: %v", err)
		writeError(w, http.StatusInternalServerError, "не удалось получить заправку")
		return
	}
	if detail == nil {
		writeError(w, http.StatusNotFound, "заправка не найдена")
		return
	}
	if detail.RecentStatuses == nil {
		detail.RecentStatuses = []models.StatusRecord{}
	}
	writeJSON(w, http.StatusOK, detail)
}

type createStationRequest struct {
	Name    string  `json:"name"`
	Address *string `json:"address"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
	Status  *string `json:"status"`
	Comment *string `json:"comment"`
	Author  *string `json:"author"`
}

// CreateStation — POST /api/stations. Пользователь кликнул по свободному
// месту на карте и оставил новую метку: создаём одновременно и заправку,
// и (опционально) её первую отметку статуса, чтобы фронтенду не нужно было
// делать два запроса.
func (a *API) CreateStation(w http.ResponseWriter, r *http.Request) {
	var req createStationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "некорректное тело запроса")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "название заправки не может быть пустым")
		return
	}
	if len(req.Name) > 200 {
		req.Name = req.Name[:200]
	}
	if req.Lat < -90 || req.Lat > 90 || req.Lng < -180 || req.Lng > 180 {
		writeError(w, http.StatusBadRequest, "некорректные координаты")
		return
	}

	stationID, err := a.repo.CreateStation(req.Name, req.Address, req.Lat, req.Lng)
	if err != nil {
		log.Printf("CreateStation: %v", err)
		writeError(w, http.StatusInternalServerError, "не удалось создать заправку")
		return
	}

	var latest *models.StatusRecord
	if req.Status != nil && strings.TrimSpace(*req.Status) != "" {
		status := models.FuelStatus(strings.ToUpper(strings.TrimSpace(*req.Status)))
		if !status.IsValid() {
			writeError(w, http.StatusBadRequest, "недопустимый статус")
			return
		}
		latest, err = a.repo.AddStatusRecord(stationID, status, req.Comment, req.Author)
		if err != nil {
			log.Printf("CreateStation.AddStatusRecord: %v", err)
			writeError(w, http.StatusInternalServerError, "заправка создана, но не удалось сохранить статус")
			return
		}
	}

	detail, err := a.repo.GetStationDetail(stationID)
	if err != nil || detail == nil {
		log.Printf("CreateStation.GetStationDetail: %v", err)
		writeError(w, http.StatusInternalServerError, "заправка создана, но не удалось прочитать её обратно")
		return
	}
	_ = latest
	writeJSON(w, http.StatusCreated, detail)
}

type addStatusRequest struct {
	Status  string  `json:"status"`
	Comment *string `json:"comment"`
	Author  *string `json:"author"`
}

// AddStatus — POST /api/stations/{id}/statuses. Основной эндпоинт
// крауд-сорсинга: любой посетитель сайта отмечает статус конкретной
// заправки, отметка сразу видна всем остальным посетителям.
func (a *API) AddStatus(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDFromPathBetween(r.URL.Path, "/api/stations/", "/statuses")
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id заправки")
		return
	}

	exists, err := a.repo.StationExists(id)
	if err != nil {
		log.Printf("AddStatus.StationExists: %v", err)
		writeError(w, http.StatusInternalServerError, "ошибка проверки заправки")
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "заправка не найдена")
		return
	}

	var req addStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "некорректное тело запроса")
		return
	}

	status := models.FuelStatus(strings.ToUpper(strings.TrimSpace(req.Status)))
	if !status.IsValid() {
		writeError(w, http.StatusBadRequest, "недопустимый статус, допустимые значения: AVAILABLE, SHORTAGE_92, SHORTAGE_95, QUEUE_ONLY, CLOSED")
		return
	}

	if req.Comment != nil {
		c := strings.TrimSpace(*req.Comment)
		if len(c) > 500 {
			c = c[:500]
		}
		req.Comment = &c
	}
	if req.Author != nil {
		au := strings.TrimSpace(*req.Author)
		if len(au) > 100 {
			au = au[:100]
		}
		if au == "" {
			req.Author = nil
		} else {
			req.Author = &au
		}
	}

	rec, err := a.repo.AddStatusRecord(id, status, req.Comment, req.Author)
	if err != nil {
		log.Printf("AddStatus: %v", err)
		writeError(w, http.StatusInternalServerError, "не удалось сохранить отметку")
		return
	}

	writeJSON(w, http.StatusCreated, rec)
}

// LatestStatuses — GET /api/statuses/latest?limit=5. Последние N отметок
// по всем заправкам сразу, для блока "Последние отметки" на сайте.
func (a *API) LatestStatuses(w http.ResponseWriter, r *http.Request) {
	limit := 5
	if v := r.URL.Query().Get("limit"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > 100 {
		limit = 100
	}

	entries, err := a.repo.LatestStatuses(limit)
	if err != nil {
		log.Printf("LatestStatuses: %v", err)
		writeError(w, http.StatusInternalServerError, "не удалось получить последние отметки")
		return
	}
	if entries == nil {
		entries = []models.LatestStatusEntry{}
	}
	writeJSON(w, http.StatusOK, entries)
}

func parseIDFromPath(path, prefix string) (int64, error) {
	rest := strings.TrimPrefix(path, prefix)
	rest = strings.Trim(rest, "/")
	if rest == "" || strings.Contains(rest, "/") {
		return 0, errors.New("empty or nested id")
	}
	return strconv.ParseInt(rest, 10, 64)
}

func parseIDFromPathBetween(path, prefix, suffix string) (int64, error) {
	rest := strings.TrimPrefix(path, prefix)
	idx := strings.Index(rest, suffix)
	if idx < 0 {
		return 0, errors.New("suffix not found")
	}
	idStr := strings.Trim(rest[:idx], "/")
	return strconv.ParseInt(idStr, 10, 64)
}
