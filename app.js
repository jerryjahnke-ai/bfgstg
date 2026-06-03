const searchInput = document.querySelector("#site-search");
const clearButton = document.querySelector("#clear-search");
const resultsSection = document.querySelector("#search-results");
const resultCount = document.querySelector("#result-count");
const resultList = document.querySelector("#result-list");
const searchableItems = Array.from(document.querySelectorAll("[data-searchable]"));
const navLinks = Array.from(document.querySelectorAll(".top-nav a"));
const sections = Array.from(document.querySelectorAll("[data-search-section]"));
const backTop = document.querySelector("#back-top");
const searchRoot = document.querySelector("#main");

const normalize = (value) =>
  value
    .replace(/\s+/g, "")
    .replace(/[，。、“”！：；（）《》【】,.!?;:()[\]{}'"`~|/\\_-]/g, "")
    .trim()
    .toLowerCase();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const unique = (items) => Array.from(new Set(items.filter(Boolean)));

const containsCjk = (value) => /[\u4e00-\u9fff]/.test(value);

const splitQuery = (query) =>
  unique(query.trim().split(/[\s，。、“”！：；（）《》【】,.!?;:()[\]{}'"`~|/\\_-]+/).filter(Boolean));

function splitTokenForSearch(token) {
  const parts = token.match(/[\u4e00-\u9fff]+|[a-z0-9@.]+/gi) || [token];
  const terms = [];

  parts.forEach((part) => {
    if (!part) return;
    if (/^[\u4e00-\u9fff]+$/.test(part)) {
      if (part.length <= 3) {
        terms.push(part);
        return;
      }

      for (let i = 0; i < part.length; i += 2) {
        const chunk = part.slice(i, i + 2);
        if (chunk.length >= 2) terms.push(chunk);
      }
      return;
    }

    terms.push(part.toLowerCase());
  });

  return terms;
}

function buildSearchTerms(query) {
  const rawTerms = splitQuery(query);
  const terms = rawTerms.flatMap(splitTokenForSearch);
  return unique(terms.map(normalize).filter(Boolean));
}

function buildHighlightTerms(query) {
  const rawTerms = splitQuery(query);
  const terms = [];

  rawTerms.forEach((term) => {
    terms.push(term);

    const parts = term.match(/[\u4e00-\u9fff]+|[a-z0-9@.]+/gi) || [];
    parts.forEach((part) => {
      if (part !== term) terms.push(part);
      if (/^[\u4e00-\u9fff]+$/.test(part) && part.length >= 4) {
        for (let i = 0; i < part.length; i += 2) {
          const chunk = part.slice(i, i + 2);
          if (chunk.length >= 2) terms.push(chunk);
        }
      }
    });
  });

  return unique(terms)
    .filter((term) => term.length > 0)
    .sort((a, b) => b.length - a.length)
    .slice(0, 24);
}

const index = searchableItems.map((item) => {
  const title = item.dataset.title || item.querySelector("h2,h3,strong")?.textContent || "手册内容";
  const rawText = item.textContent.replace(/\s+/g, " ").trim();
  const section = item.closest("[data-search-section]");

  return {
    item,
    title,
    rawText,
    text: normalize(`${title} ${rawText}`),
    words: unique(`${title} ${rawText}`.toLowerCase().match(/[a-z0-9@.]+/g) || []),
    sectionTitle: section?.dataset.title || "手册",
  };
});

function isSubsequence(needle, haystack) {
  let cursor = 0;
  for (const char of haystack) {
    if (char === needle[cursor]) cursor += 1;
    if (cursor === needle.length) return true;
  }
  return false;
}

function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }

  return rows[a.length][b.length];
}

function fuzzyScore(entry, term) {
  if (!term) return 0;
  if (entry.text.includes(term)) return 8 + Math.min(term.length, 8);

  if (containsCjk(term) && term.length >= 2) {
    if (isSubsequence(term, entry.text)) return 4;

    const chars = unique([...term]);
    const matched = chars.filter((char) => entry.text.includes(char)).length;
    if (matched / chars.length >= 0.75) return 2;
  }

  if (/^[a-z0-9@.]+$/i.test(term) && term.length >= 3) {
    const limit = term.length >= 7 ? 2 : 1;
    if (entry.words.some((word) => word.includes(term) || distance(term, word) <= limit)) return 3;
  }

  return 0;
}

function excerpt(text, terms) {
  const clean = text.replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  const term = terms.find((item) => lower.includes(item.toLowerCase()));
  const pos = term ? lower.indexOf(term.toLowerCase()) : -1;

  if (pos < 0) return clean.slice(0, 92);

  const start = Math.max(0, pos - 34);
  return `${start > 0 ? "..." : ""}${clean.slice(start, start + 112)}${start + 112 < clean.length ? "..." : ""}`;
}

function restoreHighlights() {
  document.querySelectorAll("mark.search-highlight").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent || ""));
  });
  searchRoot.normalize();
}

function canHighlightNode(node) {
  const parent = node.parentElement;
  if (!parent) return false;
  if (!node.nodeValue?.trim()) return false;
  return !parent.closest(".search-shell, .search-results, script, style, mark.search-highlight");
}

function highlightPage(terms) {
  restoreHighlights();
  if (!terms.length) return 0;

  const matcher = new RegExp(terms.map(escapeRegExp).join("|"), "gi");
  const walker = document.createTreeWalker(searchRoot, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return canHighlightNode(node) && matcher.test(node.nodeValue)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  let count = 0;
  nodes.forEach((node) => {
    const text = node.nodeValue;
    const fragment = document.createDocumentFragment();
    matcher.lastIndex = 0;
    let cursor = 0;
    let match;

    while ((match = matcher.exec(text)) !== null) {
      if (match.index > cursor) fragment.append(document.createTextNode(text.slice(cursor, match.index)));

      const mark = document.createElement("mark");
      mark.className = "search-highlight";
      mark.textContent = match[0];
      fragment.append(mark);
      count += 1;
      cursor = match.index + match[0].length;
    }

    if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
    node.replaceWith(fragment);
  });

  return count;
}

function makeResultCard(entry, terms) {
  const button = document.createElement("button");
  button.className = "result-card";
  button.type = "button";

  const title = document.createElement("strong");
  title.textContent = entry.title;
  const section = document.createElement("p");
  section.textContent = entry.sectionTitle;
  const summary = document.createElement("p");
  summary.textContent = excerpt(entry.rawText, terms);

  button.append(title, section, summary);
  button.addEventListener("click", () => {
    entry.item.scrollIntoView({ behavior: "smooth", block: "center" });
    entry.item.classList.add("is-match");
  });

  return button;
}

function renderResults(query) {
  const searchTerms = buildSearchTerms(query);
  const highlightTerms = buildHighlightTerms(query);
  searchableItems.forEach((item) => item.classList.remove("is-match"));
  const highlightCount = highlightPage(highlightTerms);

  if (!searchTerms.length) {
    resultsSection.hidden = true;
    resultList.replaceChildren();
    resultCount.textContent = "0 条匹配";
    return;
  }

  const matches = index
    .map((entry) => ({
      ...entry,
      score: searchTerms.reduce((sum, term) => sum + fuzzyScore(entry, term), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  resultCount.textContent = `找到 ${matches.length} 个相关内容，已高亮 ${highlightCount} 处`;
  resultsSection.hidden = false;
  resultList.replaceChildren();

  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "result-empty";
    empty.textContent = highlightCount ? "页面已高亮关键词，但没有找到更完整的内容块。" : "没有找到匹配内容";
    resultList.append(empty);
    return;
  }

  matches.forEach((entry) => {
    entry.item.classList.add("is-match");
    resultList.append(makeResultCard(entry, highlightTerms));
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
