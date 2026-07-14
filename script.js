const STORAGE_KEY = "benzin-condolences";

const defaultCondolences = [
  { name: "Автомобилист со стажем", text: "Помню тебя по 26 рублей за литр. Тогда я был счастлив и не знал об этом." },
  { name: "Дальнобойщик Виктор", text: "Ты был мне как брат. А теперь брат стоит как крыло от иномарки." },
  { name: "Аноним у заправки", text: "Стоял в очереди в твою честь два часа. Это была не очередь, а поминальная служба." },
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
    container.innerHTML = '<p class="condolence-empty">Пока никто не зажёг свечу. Будьте первым.</p>';
    return;
  }
  container.innerHTML = list
    .slice()
    .reverse()
    .map(
      (c) => `
      <div class="condolence-item">
        <div class="c-name">🕯️ ${escapeHtml(c.name)}</div>
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

document.addEventListener("DOMContentLoaded", () => {
  initBurgerMenu();
  initScrollReveal();

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
