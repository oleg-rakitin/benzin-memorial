/**
 * Карта скорби: статус заправок.
 *
 * ТЕХНИЧЕСКИЙ ПОДХОД (важно для тех, кто будет это поддерживать):
 * Открытого бесплатного API с данными о реальном наличии топлива на АЗС в РФ
 * в реальном времени не существует — это либо платные партнёрские API
 * (Бензап, Бензубер и т.п.), либо закрытые данные крупных агрегаторов
 * (2ГИС+Сбер), доступные только по соглашению. Сайт при этом полностью
 * статический и без бэкенда (GitHub Pages), поэтому реализован вариант,
 * который работает "из коробки" без единого сервера, ключа API или аккаунта:
 *
 *   — Демонстрационные метки (несколько городов) захардкожены ниже
 *     в DEMO_STATIONS — это витрина того, как это должно выглядеть.
 *   — Метки, которые добавляет пользователь, кликнув по карте,
 *     сохраняются в localStorage браузера (ключ MARKERS_STORAGE_KEY).
 *     Это значит: метки видны только этому пользователю, в этом браузере,
 *     на этом устройстве. Никакого кросс-браузерного крауд-сорсинга нет —
 *     и сайт честно предупреждает об этом в интерфейсе.
 *
 * КАК ПОДКЛЮЧИТЬ НАСТОЯЩИЙ КРАУД-СОРСИНГ ПОЗЖЕ (без своего сервера):
 * Если однажды понадобится, чтобы метки одного пользователя видели все —
 * можно завести бесплатный serverless backend и просто подменить функции
 * loadUserMarkers()/persistUserMarker() ниже на запросы к нему. Варианты:
 *
 *   1) JSONBin.io (https://jsonbin.io) — бесплатный "облачный JSON",
 *      создаётся один "бин", в него можно писать/читать по HTTP с
 *      X-Master-Key. Псевдокод замены persistUserMarker():
 *
 *        async function persistUserMarker(marker) {
 *          const bin = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
 *            headers: { "X-Master-Key": "<ваш ключ>" }
 *          }).then(r => r.json());
 *          const markers = bin.record.markers || [];
 *          markers.push(marker);
 *          await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
 *            method: "PUT",
 *            headers: { "Content-Type": "application/json", "X-Master-Key": "<ваш ключ>" },
 *            body: JSON.stringify({ markers })
 *          });
 *        }
 *
 *   2) Supabase (бесплатный tier) — настоящая Postgres-таблица `markers`
 *      с публичным anon-ключом и Row Level Security на insert/select.
 *      Тогда loadUserMarkers()/persistUserMarker() превращаются в вызовы
 *      supabase.from('markers').select() / .insert().
 *
 *   3) Firebase Realtime Database / Firestore (бесплатный Spark-план) —
 *      аналогично, читать/писать в коллекцию `markers` через Firebase SDK.
 *
 * Во всех трёх случаях ключи/токены НЕЛЬЗЯ просто хранить открытым текстом
 * в публичном JS-файле на GitHub Pages без ограничений доступа (правил
 * безопасности/квот) — иначе кто угодно сможет испортить данные всем.
 * Поэтому в этой версии сайта выбран безопасный и рабочий по умолчанию
 * вариант — localStorage — а интеграция реального backend оставлена как
 * документированный, но не подключённый путь на будущее.
 */

const MARKERS_STORAGE_KEY = "benzin-map-markers";

const STATUS_CONFIG = {
  ok: { label: "Топливо есть", color: "#5cb85c", short: "есть" },
  deficit92: { label: "Дефицит АИ-92", color: "#e6c778", short: "деф. 92" },
  deficit95: { label: "Дефицит АИ-95", color: "#d68a3c", short: "деф. 95" },
  queue: { label: "Только очередь", color: "#6a8fd6", short: "очередь" },
  closed: { label: "Закрыта", color: "#d64f4f", short: "закрыта" },
};

const DEMO_STATIONS = [
  {
    id: "demo-msk",
    name: "АЗС у МКАД, Москва",
    lat: 55.751244,
    lng: 37.618423,
    status: "deficit95",
    comment: "АИ-95 привозят раз в сутки и разбирают за двадцать минут, как театральные билеты.",
    minutesAgo: 35,
  },
  {
    id: "demo-spb",
    name: "АЗС на КАД, Санкт-Петербург",
    lat: 59.93428,
    lng: 30.335098,
    status: "queue",
    comment: "Топливо формально есть, но очередь заняла соседнюю полосу движения ещё вчера.",
    minutesAgo: 120,
  },
  {
    id: "demo-krasnodar",
    name: "АЗС на въезде, Краснодар",
    lat: 45.035470,
    lng: 38.975313,
    status: "closed",
    comment: "Закрыта «по техническим причинам». Технические причины — это отсутствие бензина.",
    minutesAgo: 400,
  },
  {
    id: "demo-omsk",
    name: "АЗС у путепровода, Омск",
    lat: 54.989342,
    lng: 73.368221,
    status: "deficit92",
    comment: "После атаки на Омский НПЗ АИ-92 выдают по чуть-чуть — «чтоб всем досталось».",
    minutesAgo: 260,
  },
  {
    id: "demo-sochi",
    name: "АЗС на трассе А-147, Сочи",
    lat: 43.585472,
    lng: 39.723098,
    status: "queue",
    comment: "Очередь стала местной достопримечательностью — уже отмечена на паре туристических карт.",
    minutesAgo: 60,
  },
  {
    id: "demo-novosibirsk",
    name: "АЗС в центре, Новосибирск",
    lat: 55.030204,
    lng: 82.920430,
    status: "ok",
    comment: "Топливо есть и без очереди — редкий вид, наблюдайте, пока не улетело.",
    minutesAgo: 15,
  },
  {
    id: "demo-vladivostok",
    name: "АЗС в порту, Владивосток",
    lat: 43.115536,
    lng: 131.885485,
    status: "ok",
    comment: "Дальний Восток пока держится — географическая удача, не заслуга.",
    minutesAgo: 50,
  },
];

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

function buildPopupContent({ name, status, comment, updatedAt, isUser }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ok;
  const originLabel = isUser
    ? "ваша метка, видна только вам"
    : "демонстрационная метка";
  return `
    <div class="fuel-popup">
      <div class="fuel-popup-title">${escapeHtmlMap(name)}</div>
      <div class="fuel-popup-status" style="color:${cfg.color}">${escapeHtmlMap(cfg.label)}</div>
      ${comment ? `<div class="fuel-popup-comment">«${escapeHtmlMap(comment)}»</div>` : ""}
      <div class="fuel-popup-meta">Обновлено: ${escapeHtmlMap(formatRelativeTime(updatedAt))}</div>
      <div class="fuel-popup-origin">${originLabel}</div>
    </div>
  `;
}

function addStationMarker(map, station, isUser) {
  const cfg = STATUS_CONFIG[station.status] || STATUS_CONFIG.ok;
  const marker = L.marker([station.lat, station.lng], {
    icon: makeStationIcon(cfg.color),
  });
  marker.bindPopup(
    buildPopupContent({
      name: station.name,
      status: station.status,
      comment: station.comment,
      updatedAt: station.updatedAt,
      isUser,
    })
  );
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
      <button type="submit">Отметить на карте 🕯️</button>
      <p class="add-marker-note">Метка сохранится только в этом браузере.</p>
    </form>
  `;
}

function initFuelMap() {
  const mapEl = document.getElementById("fuelMap");
  if (!mapEl || typeof L === "undefined") return;

  buildLegend();

  const map = L.map(mapEl, {
    center: [61, 90],
    zoom: 3,
    minZoom: 2,
    maxZoom: 12,
    worldCopyJump: true,
    attributionControl: false,
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  const now = Date.now();
  DEMO_STATIONS.forEach((station) => {
    addStationMarker(
      map,
      { ...station, updatedAt: now - station.minutesAgo * 60000 },
      false
    );
  });

  loadUserMarkers().forEach((marker) => {
    addStationMarker(map, marker, true);
  });

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
    const form = container && container.querySelector(".add-marker-form");
    if (!form) return;

    form.addEventListener("submit", (submitEvent) => {
      submitEvent.preventDefault();
      if (!pendingLatLng) return;

      const nameInput = form.querySelector('[name="name"]');
      const statusSelect = form.querySelector('[name="status"]');
      const commentInput = form.querySelector('[name="comment"]');

      const name = nameInput.value.trim();
      if (!name) return;

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
      addStationMarker(map, newMarker, true);
      map.closePopup();
    });
  });
}

document.addEventListener("DOMContentLoaded", initFuelMap);
