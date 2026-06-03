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
const qaForm = document.querySelector("#qa-form");
const qaInput = document.querySelector("#qa-input");
const qaLog = document.querySelector("#qa-log");
const qaSuggestionButtons = Array.from(document.querySelectorAll("[data-question]"));

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

const manualKnowledge = [
  {
    title: "投稿渠道",
    keywords: ["投稿", "渠道", "邮箱", "中国中铁", "中铁四局", "四局", "影像四局", "公司网站", "ctce8", "一周快讯", "先锋周视界", "融媒体", "公众号"],
    answer: [
      "中国中铁：报纸、新媒体，投稿邮箱为 crecg@vip.163.com。",
      "中铁四局：四局资讯、铁道建设报、四局电视台、微信公众号、网站以及融媒体矩阵账号，投稿集合链接为 https://ding.cjfx.cn/f/jyddug97。",
      "影像四局：https://crec4.vcgvip.com/。向局里报送稿件前，图片作品需要先上传至该网站审核。",
      "公司：网站 www.ctce8.com。《一周快讯》《先锋周视界》素材报送可 e 通联系赵元坤。",
    ],
  },
  {
    title: "必报素材",
    keywords: ["必报", "上报", "领导检查", "节点事件", "重要活动", "素材", "新闻通稿", "图片", "视频"],
    answer: [
      "领导检查、节点事件、重要活动等须上报三类素材：新闻通稿、图片、视频。",
      "建议现场同步准备文字、图片和视频，避免后期补材料。",
    ],
  },
  {
    title: "图片素材要求",
    keywords: ["图片", "照片", "摄影", "几张", "多少张", "2m", "空镜", "作业", "竣工", "大景", "中景", "近景", "特写", "清晰", "模糊"],
    answer: [
      "图片需要 3 张以上。",
      "内容应包含施工现场空镜、一线人员作业情况、竣工后现场情况等。",
      "画面要求清晰不模糊，覆盖大景、中景、近景和特写，大小在 2M 以上。",
      "员工摄影板块照片要清晰、多角度，最好使用相机或手机高清摄影；有主要领导在场的照片尤其要保证质量。",
      "摄影作品需要附加文本介绍，注明拍摄时间、地点、作品简介及创作意图，做到有内容、有意义。",
    ],
  },
  {
    title: "视频素材要求",
    keywords: ["视频", "拍摄", "怎么拍", "横屏", "1080", "1080p", "高清", "15秒", "十五秒", "远景", "中景", "近景", "特写", "航拍", "匀速", "稳定", "清晰"],
    answer: [
      "视频素材需要 8 个以上远景、中景、近景和特写的稳定、清晰静态视频。",
      "每个视频不超过 15 秒，航拍等特殊画面除外。",
      "如果是航拍等需要镜头移动的特殊画面，要注意匀速移动，不可忽快忽慢。",
      "相机横屏录制，也可手机横屏录制，画面分辨率要在 1080p 以上。",
    ],
  },
  {
    title: "视频投稿渠道",
    keywords: ["视频投稿", "局视频新闻", "先锋周视界", "百度网盘", "jerryzhao1998", "邮箱", "赵元坤"],
    answer: [
      "局视频新闻：使用四局投稿集合链接 https://ding.cjfx.cn/f/jyddug97。",
      "公司《先锋周视界》：素材可通过百度网盘发送给赵元坤，或直接发送至邮箱 jerryzhao1998@163.com。",
    ],
  },
  {
    title: "审核流程",
    keywords: ["审核", "流程", "谁审核", "报送前", "项目部", "主要领导", "上级单位", "局指", "业主", "宣传部"],
    answer: [
      "素材报送前需经过项目部主要领导、上级单位/局指、业主审核。",
      "最后经公司宣传部审核后再报送或发布。",
    ],
  },
  {
    title: "新闻通稿结构",
    keywords: ["新闻通稿", "通稿", "稿件", "怎么写", "标题", "讯头", "导语", "首段", "项目概况", "重点段落", "背景", "意义", "落款"],
    answer: [
      "标题应直接表述事件情况，不宜过长。",
      "首段要写清新闻发生地、时间、地点等事实信息。",
      "中间可介绍项目概况，例如线路、站点、建设任务等。",
      "重点段落要写清参与人数、节点开始时间、重难点、解决措施、创新方法、成效和完成任务量。",
      "尾段可写项目整体概况与意义，可结合当地政策、以往报道和项目开通后的区域影响。",
      "落款格式示例为：（中铁四局八分公司 投稿人姓名 电话）。",
    ],
  },
  {
    title: "新闻稿语言注意事项",
    keywords: ["注意事项", "写作", "虚话", "空话", "修饰", "专业化", "dk", "时间", "统一用词", "项目名称", "套话", "施组方案", "安全文明施工方案"],
    answer: [
      "不要用虚话、空话，语言不需过度修饰；如“欢快的步伐”“明媚的阳光”等表述不要出现在新闻稿中。",
      "避免过度专业化。工程部等部门提供的专业表述，例如 DKxxx-DKxxx，要转化成普通读者能理解的话。",
      "如无特殊要求，避免过度细节化；例如可写“5 月 15 日”或“5 月 15 日上午”，不必写成“早晨 8:30”。",
      "项目部名称和“施工人员”“技术人员”等用词要准确且前后一致。",
      "尽量不套用施组方案、安全文明施工方案中的套话，要结合项目部优势和特色行文。",
      "如果文章写成后，把主语换成另一个项目仍然成立，就没有达到写稿要求。",
    ],
  },
  {
    title: "公司网站投稿格式",
    keywords: ["公司网站", "网站投稿", "格式", "16px", "微软雅黑", "首行缩进", "行间距", "2.0", "图片居中", "650"],
    answer: [
      "公司网站投稿格式规范为：文本 16px、微软雅黑，设置首行缩进，行间距 2.0。",
      "图片居中，宽度调整为 650。",
    ],
  },
  {
    title: "日常素材积累",
    keywords: ["日常", "积累", "党团活动", "小改小革", "人物故事", "专题", "回顾"],
    answer: [
      "除领导检查、节点事件、重要活动等必须上报的素材外，日常也要注意积累党团活动、项目部小改小革、人物故事等内容。",
      "宣传部会不定期策划特定内容，为项目积攒可供回顾的专题。",
    ],
  },
];

const qaIndex = manualKnowledge.map((entry) => ({
  ...entry,
  corpus: normalize(`${entry.title} ${entry.keywords.join(" ")} ${entry.answer.join(" ")}`),
}));

function scoreKnowledgeEntry(question, entry) {
  const cleanQuestion = normalize(question);
  const terms = buildSearchTerms(question).filter((term) => !["怎么", "什么", "哪些", "多少", "要求", "一下", "需要"].includes(term));
  let score = 0;

  if (cleanQuestion && entry.corpus.includes(cleanQuestion)) score += 16;

  terms.forEach((term) => {
    if (entry.corpus.includes(term)) {
      score += 8 + Math.min(term.length, 6);
    } else if (containsCjk(term) && term.length >= 2 && isSubsequence(term, entry.corpus)) {
      score += 3;
    }
  });

  entry.keywords.forEach((keyword) => {
    const cleanKeyword = normalize(keyword);
    if (cleanKeyword && cleanQuestion.includes(cleanKeyword)) score += 10;
  });

  return score;
}

function getManualAnswer(question) {
  const matches = qaIndex
    .map((entry) => ({ ...entry, score: scoreKnowledgeEntry(question, entry) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (!matches.length) {
    return {
      title: "手册里没有明确对应内容",
      lines: [
        "我没有在这份手册里找到可以直接回答这个问题的依据。",
        "你可以换成更具体的问法，比如“图片素材有什么要求”“视频素材怎么拍”“投稿渠道有哪些”“新闻通稿怎么写”。",
      ],
      source: "回答范围：仅限本手册已整理内容。",
    };
  }

  const [best, second] = matches;
  const lines = [...best.answer];
  if (second && second.score >= Math.max(12, best.score * 0.72)) {
    lines.push(`相关补充：${second.title}`);
    lines.push(...second.answer);
  }

  return {
    title: best.title,
    lines,
    source: "依据：手册原文整理。",
  };
}

function appendQaMessage(role, title, lines, source) {
  if (!qaLog) return;

  const message = document.createElement("article");
  message.className = `qa-message ${role}`;

  const heading = document.createElement("strong");
  heading.textContent = title;
  message.append(heading);

  if (lines.length === 1) {
    const paragraph = document.createElement("p");
    paragraph.textContent = lines[0];
    message.append(paragraph);
  } else {
    const list = document.createElement("ul");
    lines.forEach((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      list.append(item);
    });
    message.append(list);
  }

  if (source) {
    const note = document.createElement("p");
    note.className = "source-note";
    note.textContent = source;
    message.append(note);
  }

  qaLog.append(message);
  qaLog.scrollTop = qaLog.scrollHeight;
}

function askManual(question) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion) return;

  appendQaMessage("user", "你", [cleanQuestion]);
  const answer = getManualAnswer(cleanQuestion);
  appendQaMessage("bot", answer.title, answer.lines, answer.source);
}

if (qaForm && qaInput) {
  qaForm.addEventListener("submit", (event) => {
    event.preventDefault();
    askManual(qaInput.value);
    qaInput.value = "";
    qaInput.focus();
  });

  qaInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      qaForm.requestSubmit();
    }
  });
}

qaSuggestionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const question = button.dataset.question || button.textContent || "";
    if (qaInput) qaInput.value = question;
    askManual(question);
  });
});

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
