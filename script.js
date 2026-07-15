const STORAGE_KEY = "benzin-condolences";

const defaultCondolences = [
  { name: "Автомобилист со стажем", text: "Помню тебя по 26 рублей за литр. Тогда я был счастлив и не знал об этом." },
  { name: "Дальнобойщик Виктор", text: "Ты был мне как брат. А теперь брат стоит как крыло от иномарки." },
  { name: "Аноним у заправки", text: "Стоял в очереди два часа. Это была не очередь, а марафон на выносливость." },
];

function loadCondolences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...defaultCondolences];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : [...defaultCondolences];
  } catch {
    return [...defaultCondolences];
  }
}

function saveCondolences(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderCondolences(list) {
  const container = document.getElementById("condolenceList");
  if (!list.length) {
    container.innerHTML = '<p class="condolence-empty">Пока никто не оставил отзыв. Будьте первым.</p>';
    return;
  }
  container.innerHTML = list
    .slice()
    .reverse()
    .map(
      (c) => `
      <div class="condolence-item">
        <div class="c-name">💬 ${escapeHtml(c.name)}</div>
        <div class="c-text">${escapeHtml(c.text)}</div>
      </div>
    `
    )
    .join("");
}

function initBurgerMenu() {
  const burger = document.getElementById("burger");
  const navLinks = document.getElementById("navLinks");
  if (!burger || !navLinks) return;

  burger.addEventListener("click", () => {
    burger.classList.toggle("open");
    navLinks.classList.toggle("open");
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      burger.classList.remove("open");
      navLinks.classList.remove("open");
    });
  });
}

function initScrollReveal() {
  const sections = document.querySelectorAll(".section");
  if (!("IntersectionObserver" in window)) {
    sections.forEach((s) => s.classList.add("in-view"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
  );

  sections.forEach((section) => observer.observe(section));
}

function initScrollProgress() {
  const bar = document.getElementById("scrollProgressBar");
  if (!bar) return;

  function update() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const pct = scrollable > 0 ? Math.min(100, Math.max(0, (scrollTop / scrollable) * 100)) : 0;
    bar.style.width = pct + "%";
  }

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
}

function initDotNav() {
  const dotNav = document.getElementById("dotNav");
  const navAnchors = document.querySelectorAll("#navLinks a");
  if (!dotNav || !navAnchors.length) return;

  const sections = [];
  navAnchors.forEach((link) => {
    const id = (link.getAttribute("href") || "").replace("#", "");
    const section = id && document.getElementById(id);
    if (!section) return;

    sections.push(section);

    const dot = document.createElement("a");
    dot.href = "#" + id;
    dot.dataset.section = id;
    dot.setAttribute("aria-label", link.textContent.trim());

    const label = document.createElement("span");
    label.className = "dot-label";
    label.textContent = link.textContent.trim();
    dot.appendChild(label);

    dotNav.appendChild(dot);
  });

  const dotLinks = dotNav.querySelectorAll("a");

  function setActive(id) {
    dotLinks.forEach((a) => a.classList.toggle("active", a.dataset.section === id));
    navAnchors.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + id));
  }

  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    },
    { threshold: 0, rootMargin: "-35% 0px -55% 0px" }
  );

  sections.forEach((section) => observer.observe(section));
}

function initDayCounter() {
  const el = document.getElementById("dayCounterNum");
  if (!el) return;
  const crisisStart = new Date("2025-08-01T00:00:00");
  const now = new Date();
  const days = Math.max(1, Math.floor((now - crisisStart) / 86400000));
  el.textContent = days.toLocaleString("ru-RU");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function getScrollOffset() {
  const header = document.querySelector(".site-header");
  return header ? header.offsetHeight + 12 : 12;
}

function highlightMapSection(section) {
  if (!section || section.id !== "karta") return;
  section.classList.remove("map-highlight");
  void section.offsetWidth;
  section.classList.add("map-highlight");
  clearTimeout(section._highlightTimer);
  section._highlightTimer = setTimeout(() => section.classList.remove("map-highlight"), 2400);
  window.dispatchEvent(new CustomEvent("map-section-revealed"));
}

function scrollToSection(target, { highlight = true } = {}) {
  if (!target) return;
  const top = target.getBoundingClientRect().top + window.scrollY - getScrollOffset();
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  if (highlight) highlightMapSection(target);
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const hash = anchor.getAttribute("href");
      if (!hash || hash === "#") return;
      const target = document.getElementById(hash.slice(1));
      if (!target) return;
      e.preventDefault();
      scrollToSection(target);
    });
  });

  if (location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) {
      requestAnimationFrame(() => {
        scrollToSection(target, { highlight: true });
      });
    }
  }
}

function initMapFab() {
  const fab = document.getElementById("mapFab");
  const hero = document.querySelector(".hero");
  const mapSection = document.getElementById("karta");
  if (!fab || !hero || !mapSection) return;

  fab.hidden = false;

  let heroPassed = false;
  let mapVisible = false;

  function updateFab() {
    fab.classList.toggle("visible", heroPassed && !mapVisible);
  }

  if ("IntersectionObserver" in window) {
    const heroObserver = new IntersectionObserver(
      ([entry]) => {
        heroPassed = !entry.isIntersecting;
        updateFab();
      },
      { threshold: 0, rootMargin: "0px" }
    );
    heroObserver.observe(hero);

    const mapObserver = new IntersectionObserver(
      ([entry]) => {
        mapVisible = entry.isIntersecting && entry.intersectionRatio > 0.15;
        updateFab();
      },
      { threshold: [0, 0.15, 0.4], rootMargin: "-10% 0px -10% 0px" }
    );
    mapObserver.observe(mapSection);
  } else {
    fab.classList.add("visible");
  }
}

function initShareButtons() {
  const shareUrl = "https://benzinopedia.ru/#karta";
  const shareText =
    "Энциклопедия бензина ⛽ Карта АЗС и хроника топливного кризиса в РФ — benzinopedia.ru";
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

  document.querySelectorAll("[data-share-tg]").forEach((a) => (a.href = tgUrl));
  document.querySelectorAll("[data-share-x]").forEach((a) => (a.href = xUrl));

  document.querySelectorAll("[data-share-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareUrl);
        } else {
          const tmp = document.createElement("textarea");
          tmp.value = shareUrl;
          tmp.style.position = "fixed";
          tmp.style.opacity = "0";
          document.body.appendChild(tmp);
          tmp.select();
          document.execCommand("copy");
          document.body.removeChild(tmp);
        }
        showToast("Ссылка скопирована 📋");
      } catch {
        showToast("Не удалось скопировать — придётся вручную 🙃");
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initBurgerMenu();
  initScrollReveal();
  initScrollProgress();
  initDotNav();
  initDayCounter();
  initShareButtons();
  initSmoothScroll();
  initMapFab();

  const list = loadCondolences();
  renderCondolences(list);

  const form = document.getElementById("condolenceForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("condName");
    const textInput = document.getElementById("condText");

    const name = nameInput.value.trim();
    const text = textInput.value.trim();
    if (!name || !text) return;

    const current = loadCondolences();
    current.push({ name, text });
    saveCondolences(current);
    renderCondolences(current);

    nameInput.value = "";
    textInput.value = "";
  });
});
