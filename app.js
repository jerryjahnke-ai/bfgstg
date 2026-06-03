const searchInput = document.querySelector("#site-search");
const clearButton = document.querySelector("#clear-search");
const resultsSection = document.querySelector("#search-results");
const resultCount = document.querySelector("#result-count");
const resultList = document.querySelector("#result-list");
const searchableItems = Array.from(document.querySelectorAll("[data-searchable]"));
const navLinks = Array.from(document.querySelectorAll(".top-nav a"));
const sections = Array.from(document.querySelectorAll("[data-search-section]"));
const backTop = document.querySelector("#back-top");

const normalize = (value) =>
  value
    .replace(/\s+/g, " ")
    .replace(/[，。、“”！：；（）《》]/g, " ")
    .trim()
    .toLowerCase();

const index = searchableItems.map((item) => {
  const title = item.dataset.title || item.querySelector("h2,h3,strong")?.textContent || "手册内容";
  const text = normalize(`${title} ${item.textContent}`);
  const section = item.closest("[data-search-section]");
  return {
    item,
    title,
    text,
    sectionTitle: section?.dataset.title || "手册",
  };
});

function excerpt(text, query) {
  const clean = text.replace(/\s+/g, " ").trim();
  const pos = clean.toLowerCase().indexOf(query.toLowerCase());
  if (pos < 0) return clean.slice(0, 92);
  const start = Math.max(0, pos - 34);
  return `${start > 0 ? "..." : ""}${clean.slice(start, start + 112)}${start + 112 < clean.length ? "..." : ""}`;
}

function renderResults(query) {
  const terms = normalize(query).split(" ").filter(Boolean);
  searchableItems.forEach((item) => item.classList.remove("is-match"));

  if (!terms.length) {
    resultsSection.hidden = true;
    resultList.replaceChildren();
    resultCount.textContent = "0 条匹配";
    return;
  }

  const matches = index
    .map((entry) => ({
      ...entry,
      score: terms.reduce((sum, term) => sum + (entry.text.includes(term) ? 1 : 0), 0),
    }))
    .filter((entry) => entry.score === terms.length)
    .slice(0, 12);

  resultCount.textContent = `${matches.length} 条匹配`;
  resultsSection.hidden = false;
  resultList.replaceChildren();

  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "result-empty";
    empty.textContent = "没有找到匹配内容";
    resultList.append(empty);
    return;
  }

  matches.forEach((entry) => {
    entry.item.classList.add("is-match");

    const button = document.createElement("button");
    button.className = "result-card";
    button.type = "button";
    button.innerHTML = `
      <strong>${entry.title}</strong>
      <p>${entry.sectionTitle}</p>
      <p>${excerpt(entry.item.textContent, terms[0])}</p>
    `;
    button.addEventListener("click", () => {
      entry.item.scrollIntoView({ behavior: "smooth", block: "center" });
      entry.item.classList.add("is-match");
    });
    resultList.append(button);
  });
}

searchInput.addEventListener("input", (event) => renderResults(event.target.value));

clearButton.addEventListener("click", () => {
  searchInput.value = "";
  renderResults("");
  searchInput.focus();
});

backTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("scroll", () => {
  backTop.classList.toggle("is-visible", window.scrollY > 520);
});

const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;

    navLinks.forEach((link) => {
      const target = link.getAttribute("href")?.slice(1);
      link.classList.toggle("is-active", target === visible.target.id);
    });
  },
  { rootMargin: "-20% 0px -65% 0px", threshold: [0.1, 0.35, 0.6] },
);

sections.forEach((section) => {
  if (section.id) observer.observe(section);
});
