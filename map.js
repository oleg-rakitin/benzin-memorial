/**
 * Карта скорби: статус заправок.
 *
 * ИСТОРИЯ ВОПРОСА (для тех, кто будет это поддерживать): раньше сайт был
 * полностью статическим (GitHub Pages) без единого сервера, и метки
 * пользователей хранились только в localStorage браузера — то есть их
 * видел только тот же человек на том же устройстве, без крауд-сорсинга.
 *
 * Теперь есть настоящий backend (см. /server в репозитории, Go +
 * MySQL + автомиграции) — общий для всех посетителей сайта. Список
 * заправок (реальные АЗС по всей России, собранные через Overpass API
 * из OpenStreetMap, © OpenStreetMap contributors, ODbL) и статусы,
 * которые оставляют реальные пользователи, хранятся на сервере, а не
 * в браузере.
 *
 * localStorage и DEMO_STATIONS ниже оставлены только как ФОЛБЭК на
 * случай, если backend недоступен (сеть легла, сервер перезагружается
 * и т.п.) — чтобы карта не была пустой и сайт не выглядел сломанным.
 * В штатной ситуации все данные и все новые отметки идут через
 * REST API backend'а.
 */

// На GitHub Pages (чистая статика, без backend) запросы идут на реальный
// сервер по прямому HTTPS-адресу через PHP-прокси (см. /server/deploy/api.php
// и README.md — почему именно так, а не напрямую на порт backend'а).
// На самом benzinopedia.ru прокси лежит на том же домене, поэтому путь
// относительный — так надёжнее (нет CORS, нет mixed content).
const API_BASE =
  location.hostname === "oleg-rakitin.github.io"
    ? "https://benzinopedia.ru/api.php"
    : "/api.php";

const FETCH_TIMEOUT_MS = 8000;

const MARKERS_STORAGE_KEY = "benzin-map-markers";

const STATUS_CONFIG = {
  AVAILABLE: { label: "Топливо есть", color: "#5cb85c", short: "есть" },
  SHORTAGE_92: { label: "Дефицит АИ-92", color: "#e6c778", short: "деф. 92" },
  SHORTAGE_95: { label: "Дефицит АИ-95", color: "#d68a3c", short: "деф. 95" },
  QUEUE_ONLY: { label: "Только очередь", color: "#6a8fd6", short: "очередь" },
  CLOSED: { label: "Закрыта", color: "#d64f4f", short: "закрыта" },
  UNKNOWN: { label: "Статус неизвестен", color: "#6b6b70", short: "неизв." },
};

// Демо-метки — используются только если backend совсем недоступен.
const DEMO_STATIONS = [
  {
    id: "demo-msk",
    name: "АЗС у МКАД, Москва",
    lat: 55.751244,
    lng: 37.618423,
    status: "SHORTAGE_95",
    comment: "АИ-95 привозят раз в сутки и разбирают за двадцать минут, как театральные билеты.",
    minutesAgo: 35,
  },
  {
    id: "demo-spb",
    name: "АЗС на КАД, Санкт-Петербург",
    lat: 59.93428,
    lng: 30.335098,
    status: "QUEUE_ONLY",
    comment: "Топливо формально есть, но очередь заняла соседнюю полосу движения ещё вчера.",
    minutesAgo: 120,
  },
  {
    id: "demo-krasnodar",
    name: "АЗС на въезде, Краснодар",
    lat: 45.03547,
    lng: 38.975313,
    status: "CLOSED",
    comment: "Закрыта «по техническим причинам». Технические причины — это отсутствие бензина.",
    minutesAgo: 400,
  },
  {
    id: "demo-omsk",
    name: "АЗС у путепровода, Омск",
    lat: 54.989342,
    lng: 73.368221,
    status: "SHORTAGE_92",
    comment: "После атаки на Омский НПЗ АИ-92 выдают по чуть-чуть — «чтоб всем досталось».",
    minutesAgo: 260,
  },
  {
    id: "demo-novosibirsk",
    name: "АЗС в центре, Новосибирск",
    lat: 55.030204,
    lng: 82.92043,
    status: "AVAILABLE",
    comment: "Топливо есть и без очереди — редкий вид, наблюдайте, пока не улетело.",
    minutesAgo: 15,
  },
];

let map = null;
let clusterGroup = null;
let usingBackend = false;
const markerByStationId = new Map();

function escapeHtmlMap(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function formatRelativeTime(timestampMs) {
  const diffMs = Date.now() - timestampMs;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин. назад`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ч. назад`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} дн. назад`;
}

function buildApiUrl(path) {
  const clean = path.startsWith("/") ? path.slice(1) : path;
  const [pathOnly, query = ""] = clean.split("?");
  let url = `${API_BASE}?path=${encodeURIComponent(pathOnly)}`;
  if (query) url += `&${query}`;
  return url;
}

async function apiFetch(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(buildApiUrl(path), {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function loadUserMarkers() {
  try {
    const raw = localStorage.getItem(MARKERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistUserMarker(marker) {
  const current = loadUserMarkers();
  current.push(marker);
  localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(current));
}

function buildLegend() {
  const legendEl = document.getElementById("mapLegend");
  if (!legendEl) return;
  legendEl.innerHTML = Object.values(STATUS_CONFIG)
    .map(
      (s) => `
      <li>
        <span class="legend-dot" style="background:${s.color}"></span>
        <span>${escapeHtmlMap(s.label)}</span>
      </li>`
    )
    .join("");
}

function buildStatusOptions() {
  return Object.entries(STATUS_CONFIG)
    .filter(([key]) => key !== "UNKNOWN")
    .map(([key, s]) => `<option value="${key}">${escapeHtmlMap(s.label)}</option>`)
    .join("");
}

function makeStationIcon(color) {
  return L.divIcon({
    className: "fuel-marker-icon",
    html: `<span class="fuel-marker-dot" style="background:${color}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

function statusConfigFor(status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.UNKNOWN;
}

function buildAddStatusFormHtml(stationId) {
  return `
    <form class="add-marker-form station-status-form" data-station-id="${stationId}">
      <p class="add-marker-title">Отметить статус этой заправки</p>
      <label>
        Статус
        <select name="status">${buildStatusOptions()}</select>
      </label>
      <label>
        Комментарий (не обязательно)
        <textarea name="comment" maxlength="140" placeholder="Например: очередь как в мавзолей"></textarea>
      </label>
      <label>
        Ваш псевдоним (не обязательно)
        <input type="text" name="author" maxlength="40" placeholder="Например: Аноним из очереди">
      </label>
      <button type="submit">Отметить статус 🕯️</button>
      <p class="add-marker-note add-marker-note--muted"></p>
    </form>
  `;
}

function buildStationPopupSkeleton(station) {
  const cfg = statusConfigFor(station.status);
  const statusAt = station.statusAt ? formatRelativeTime(new Date(station.statusAt).getTime()) : null;
  return `
    <div class="fuel-popup" data-station-id="${station.id}">
      <div class="fuel-popup-title">${escapeHtmlMap(station.name)}</div>
      <div class="fuel-popup-status" style="color:${cfg.color}">${escapeHtmlMap(cfg.label)}</div>
      <div class="fuel-popup-meta">${statusAt ? "Обновлено: " + escapeHtmlMap(statusAt) : "Ждёт первой отметки"}</div>
      <div class="fuel-popup-details" data-role="details">
        <p class="fuel-popup-loading">Загрузка подробностей…</p>
      </div>
    </div>
  `;
}

function renderStationDetails(container, detail) {
  const cfg = statusConfigFor(detail.latestStatus ? detail.latestStatus.status : null);
  const address = detail.address ? `<div class="fuel-popup-address">${escapeHtmlMap(detail.address)}</div>` : "";
  const comment = detail.latestStatus && detail.latestStatus.comment
    ? `<div class="fuel-popup-comment">«${escapeHtmlMap(detail.latestStatus.comment)}»</div>`
    : "";
  const author = detail.latestStatus && detail.latestStatus.author
    ? `<div class="fuel-popup-origin">отметил(а): ${escapeHtmlMap(detail.latestStatus.author)}</div>`
    : "";
  const reportsNote = `<div class="fuel-popup-origin">всего отметок: ${detail.reportsCount || 0}</div>`;

  container.innerHTML = `
    ${address}
    ${comment}
    ${author}
    ${reportsNote}
    ${buildAddStatusFormHtml(detail.id)}
  `;

  const form = container.querySelector(".station-status-form");
  wireStatusForm(form);
}

function wireStatusForm(form) {
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const stationId = form.dataset.stationId;
    const statusSelect = form.querySelector('[name="status"]');
    const commentInput = form.querySelector('[name="comment"]');
    const authorInput = form.querySelector('[name="author"]');
    const note = form.querySelector(".add-marker-note--muted");
    const submitBtn = form.querySelector("button[type=submit]");

    submitBtn.disabled = true;
    note.textContent = "Отправляю...";

    try {
      if (!usingBackend) throw new Error("backend недоступен, сохранено только локально");
      await apiFetch(`/stations/${stationId}/statuses`, {
        method: "POST",
        body: JSON.stringify({
          status: statusSelect.value,
          comment: commentInput.value.trim() || null,
          author: authorInput.value.trim() || null,
        }),
      });
      note.textContent = "Спасибо, отметка сохранена для всех посетителей сайта.";
      await refreshLatestUpdates();
      await reloadStationMarker(stationId);
    } catch (err) {
      note.textContent = "Не удалось отправить на сервер — сеть недоступна. Попробуйте позже.";
      console.warn("Не удалось отправить статус:", err);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function reloadStationMarker(stationId) {
  const marker = markerByStationId.get(String(stationId));
  if (!marker) return;
  try {
    const detail = await apiFetch(`/stations/${stationId}`);
    const cfg = statusConfigFor(detail.latestStatus ? detail.latestStatus.status : null);
    marker.setIcon(makeStationIcon(cfg.color));
  } catch {
    /* тихо игнорируем — не критично для UX */
  }
}

function addStationMarker(station) {
  const cfg = statusConfigFor(station.status);
  const marker = L.marker([station.lat, station.lng], {
    icon: makeStationIcon(cfg.color),
  });
  marker.bindPopup(buildStationPopupSkeleton(station), { maxWidth: 280 });

  marker.on("popupopen", async (e) => {
    const el = e.popup.getElement();
    const details = el && el.querySelector('[data-role="details"]');
    if (!details) return;
    if (!usingBackend) {
      details.innerHTML = `<p class="fuel-popup-origin">Backend недоступен — детали заправки нельзя загрузить в офлайн-режиме.</p>`;
      return;
    }
    try {
      const detail = await apiFetch(`/stations/${station.id}`);
      renderStationDetails(details, detail);
    } catch (err) {
      details.innerHTML = `<p class="fuel-popup-origin">Не удалось загрузить подробности: ${escapeHtmlMap(err.message)}</p>`;
    }
  });

  clusterGroup.addLayer(marker);
  markerByStationId.set(String(station.id), marker);
  return marker;
}

function addDemoMarker(map, station, isUser) {
  const cfg = statusConfigFor(station.status);
  const marker = L.marker([station.lat, station.lng], {
    icon: makeStationIcon(cfg.color),
  });
  const originLabel = isUser ? "ваша метка, видна только вам (офлайн-режим)" : "демонстрационная метка (офлайн-режим)";
  marker.bindPopup(`
    <div class="fuel-popup">
      <div class="fuel-popup-title">${escapeHtmlMap(station.name)}</div>
      <div class="fuel-popup-status" style="color:${cfg.color}">${escapeHtmlMap(cfg.label)}</div>
      ${station.comment ? `<div class="fuel-popup-comment">«${escapeHtmlMap(station.comment)}»</div>` : ""}
      <div class="fuel-popup-meta">Обновлено: ${escapeHtmlMap(formatRelativeTime(station.updatedAt))}</div>
      <div class="fuel-popup-origin">${originLabel}</div>
    </div>
  `);
  marker.addTo(map);
  return marker;
}

function buildAddMarkerFormHtml() {
  return `
    <form class="add-marker-form">
      <p class="add-marker-title">Отметить скорбь по бензину здесь</p>
      <label>
        Название заправки
        <input type="text" name="name" maxlength="60" required placeholder="АЗС «Надежда», 3-й км">
      </label>
      <label>
        Статус
        <select name="status">${buildStatusOptions()}</select>
      </label>
      <label>
        Комментарий (не обязательно)
        <textarea name="comment" maxlength="140" placeholder="Например: очередь как в мавзолей"></textarea>
      </label>
      <label>
        Ваш псевдоним (не обязательно)
        <input type="text" name="author" maxlength="40" placeholder="Например: Аноним из очереди">
      </label>
      <button type="submit">Отметить на карте 🕯️</button>
      <p class="add-marker-note">${usingBackend ? "Метка станет видна всем посетителям сайта." : "Backend недоступен: метка сохранится только в этом браузере."}</p>
    </form>
  `;
}

async function loadStationsFromBackend() {
  const stations = await apiFetch("/stations");
  return stations;
}

async function refreshLatestUpdates() {
  const listEl = document.getElementById("latestUpdatesList");
  if (!listEl) return;

  if (!usingBackend) {
    listEl.innerHTML = `<p class="condolence-empty">Backend недоступен — список последних отметок сейчас показать нельзя.</p>`;
    return;
  }

  try {
    const entries = await apiFetch("/statuses/latest?limit=5");
    if (!entries.length) {
      listEl.innerHTML = `<p class="condolence-empty">Пока никто не оставил ни одной отметки. Будьте первым.</p>`;
      return;
    }
    listEl.innerHTML = entries
      .map((entry) => {
        const cfg = statusConfigFor(entry.status);
        const when = formatRelativeTime(new Date(entry.createdAt).getTime());
        const author = entry.author ? ` · ${escapeHtmlMap(entry.author)}` : "";
        return `
          <div class="latest-update-item">
            <div class="latest-update-head">
              <span class="latest-update-station">${escapeHtmlMap(entry.stationName)}</span>
              <span class="latest-update-status" style="color:${cfg.color}">${escapeHtmlMap(cfg.label)}</span>
            </div>
            ${entry.comment ? `<div class="latest-update-comment">«${escapeHtmlMap(entry.comment)}»</div>` : ""}
            <div class="latest-update-meta">${escapeHtmlMap(when)}${author}</div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    listEl.innerHTML = `<p class="condolence-empty">Не удалось загрузить последние отметки: ${escapeHtmlMap(err.message)}</p>`;
  }
}

async function initFuelMap() {
  const mapEl = document.getElementById("fuelMap");
  if (!mapEl || typeof L === "undefined") return;

  buildLegend();

  map = L.map(mapEl, {
    center: [61, 90],
    zoom: 3,
    minZoom: 2,
    maxZoom: 15,
    worldCopyJump: true,
    attributionControl: false,
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  clusterGroup =
    typeof L.markerClusterGroup === "function"
      ? L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60, spiderfyOnMaxZoom: true })
      : L.layerGroup();
  clusterGroup.addTo(map);

  let stations = null;
  try {
    stations = await loadStationsFromBackend();
    usingBackend = true;
  } catch (err) {
    console.warn("Backend недоступен, включаю офлайн-режим карты:", err);
    usingBackend = false;
  }

  const offlineBanner = document.getElementById("mapOfflineBanner");
  if (offlineBanner) offlineBanner.hidden = usingBackend;

  if (usingBackend) {
    stations.forEach((station) => addStationMarker(station));
  } else {
    const now = Date.now();
    DEMO_STATIONS.forEach((station) => {
      addDemoMarker(map, { ...station, updatedAt: now - station.minutesAgo * 60000 }, false);
    });
    loadUserMarkers().forEach((marker) => {
      addDemoMarker(map, marker, true);
    });
  }

  await refreshLatestUpdates();

  let pendingLatLng = null;

  map.on("click", (e) => {
    pendingLatLng = e.latlng;
    L.popup({ className: "map-add-popup", maxWidth: 260 })
      .setLatLng(e.latlng)
      .setContent(buildAddMarkerFormHtml())
      .openOn(map);
  });

  map.on("popupopen", (e) => {
    const container = e.popup.getElement();
    const form = container && container.querySelector(".add-marker-form:not(.station-status-form)");
    if (!form || form.dataset.stationId) return;

    form.addEventListener("submit", async (submitEvent) => {
      submitEvent.preventDefault();
      if (!pendingLatLng) return;

      const nameInput = form.querySelector('[name="name"]');
      const statusSelect = form.querySelector('[name="status"]');
      const commentInput = form.querySelector('[name="comment"]');
      const authorInput = form.querySelector('[name="author"]');

      const name = nameInput.value.trim();
      if (!name) return;

      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;

      if (usingBackend) {
        try {
          const created = await apiFetch("/stations", {
            method: "POST",
            body: JSON.stringify({
              name,
              lat: pendingLatLng.lat,
              lng: pendingLatLng.lng,
              status: statusSelect.value,
              comment: commentInput.value.trim() || null,
              author: authorInput.value.trim() || null,
            }),
          });
          addStationMarker({
            id: created.id,
            name: created.name,
            lat: created.lat,
            lng: created.lng,
            status: created.latestStatus ? created.latestStatus.status : null,
            statusAt: created.latestStatus ? created.latestStatus.createdAt : null,
          });
          await refreshLatestUpdates();
          map.closePopup();
        } catch (err) {
          console.warn("Не удалось создать заправку на backend, сохраняю локально:", err);
          const newMarker = {
            id: `user-${Date.now()}`,
            name,
            status: statusSelect.value,
            comment: commentInput.value.trim(),
            lat: pendingLatLng.lat,
            lng: pendingLatLng.lng,
            updatedAt: Date.now(),
          };
          persistUserMarker(newMarker);
          addDemoMarker(map, newMarker, true);
          map.closePopup();
        } finally {
          submitBtn.disabled = false;
        }
      } else {
        const newMarker = {
          id: `user-${Date.now()}`,
          name,
          status: statusSelect.value,
          comment: commentInput.value.trim(),
          lat: pendingLatLng.lat,
          lng: pendingLatLng.lng,
          updatedAt: Date.now(),
        };
        persistUserMarker(newMarker);
        addDemoMarker(map, newMarker, true);
        map.closePopup();
        submitBtn.disabled = false;
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", initFuelMap);
