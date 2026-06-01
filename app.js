const DEFAULT_CATALOG_URL = "./public/data/catalog.json";

const state = {
  catalog: null,
  activeBankMeta: null,
  activeManifest: null,
  allQuestions: [],
  filteredQuestions: [],
  quizQuestions: [],
  answers: {},
  currentIndex: 0,
};

const el = {
  homeSection: document.getElementById("home-section"),
  bankSection: document.getElementById("bank-section"),
  quizSection: document.getElementById("quiz-section"),
  resultSection: document.getElementById("result-section"),
  homeError: document.getElementById("home-error"),
  bankList: document.getElementById("bank-list"),
  recentProgress: document.getElementById("recent-progress"),
  catalogUrl: document.getElementById("catalog-url"),
  loadCatalogUrl: document.getElementById("load-catalog-url"),
  localJsonInput: document.getElementById("local-json-input"),
  bankTitle: document.getElementById("bank-title"),
  bankDescription: document.getElementById("bank-description"),
  filterSubject: document.getElementById("filter-subject"),
  filterUnit: document.getElementById("filter-unit"),
  filterTag: document.getElementById("filter-tag"),
  filterType: document.getElementById("filter-type"),
  filterDifficulty: document.getElementById("filter-difficulty"),
  filteredCount: document.getElementById("filtered-count"),
  startRandom: document.getElementById("start-random"),
  startAll: document.getElementById("start-all"),
  startWrongOnly: document.getElementById("start-wrong-only"),
  resetFilters: document.getElementById("reset-filters"),
  backHome: document.getElementById("back-home"),
  quizProgress: document.getElementById("quiz-progress"),
  quizMeta: document.getElementById("quiz-meta"),
  questionStem: document.getElementById("question-stem"),
  questionInput: document.getElementById("question-input"),
  gradeBtn: document.getElementById("grade-btn"),
  gradeResult: document.getElementById("grade-result"),
  explanation: document.getElementById("explanation"),
  prevQuestion: document.getElementById("prev-question"),
  nextQuestion: document.getElementById("next-question"),
  finishQuiz: document.getElementById("finish-quiz"),
  quitQuiz: document.getElementById("quit-quiz"),
  resultSummary: document.getElementById("result-summary"),
  wrongList: document.getElementById("wrong-list"),
  retryWrong: document.getElementById("retry-wrong"),
  resultHome: document.getElementById("result-home"),
};

function showSection(section) {
  [el.homeSection, el.bankSection, el.quizSection, el.resultSection].forEach((s) => (s.hidden = true));
  section.hidden = false;
}

function storageKey(prefix) {
  return `${prefix}:${state.activeManifest.bankId}:${state.activeManifest.version}`;
}

function normalizeAnswerText(input, normalization) {
  let value = String(input ?? "");
  if (normalization?.trim ?? true) value = value.trim();
  if (normalization?.lowercase ?? true) value = value.toLowerCase();
  if (normalization?.removeSpaces ?? true) value = value.replace(/\s+/g, "");
  if (normalization?.removePunctuation ?? true) {
    value = value.replace(/[.,!?;:'"“”‘’()\[\]{}<>\-_/\\]/g, "");
  }
  return value;
}

function gradeSingleChoice(question, selectedChoiceId) {
  return {
    isCorrect: question.answer?.[0] === selectedChoiceId,
    matchedKeywords: [],
    missingKeywordGroups: [],
  };
}

function gradeShortAnswer(question, answerText) {
  const grading = question.grading || { mode: "contains_all_groups", keywordGroups: [[question.answerText || ""]] };
  const normalizedInput = normalizeAnswerText(answerText, grading.normalization);
  const matchedKeywords = [];
  const missingKeywordGroups = [];

  for (const group of grading.keywordGroups || []) {
    const matched = group.find((kw) => normalizedInput.includes(normalizeAnswerText(kw, grading.normalization)));
    if (matched) {
      matchedKeywords.push(matched);
    } else {
      missingKeywordGroups.push(group);
    }
  }

  return {
    isCorrect: grading.mode === "contains_all_groups" && missingKeywordGroups.length === 0,
    matchedKeywords,
    missingKeywordGroups,
  };
}

function validateQuestion(question) {
  if (!question?.id || !question?.type || !question?.stem) return "질문 공통 필드가 누락되었습니다.";
  if (!["single_choice", "short_answer"].includes(question.type)) return "허용되지 않은 문제 타입입니다.";
  if (question.type === "single_choice") {
    if (!Array.isArray(question.choices) || question.choices.length !== 4) return "객관식 보기는 4개여야 합니다.";
    const ids = question.choices.map((c) => c.id);
    if (!Array.isArray(question.answer) || !ids.includes(question.answer[0])) return "객관식 정답이 보기 id와 일치하지 않습니다.";
  }
  if (question.type === "short_answer") {
    if (!question.grading?.keywordGroups?.length) return "주관식 keywordGroups가 비어 있습니다.";
  }
  return null;
}

function setOptions(selectEl, values, includeAll = true) {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  selectEl.innerHTML = "";
  if (includeAll) {
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "전체";
    selectEl.appendChild(allOpt);
  }
  uniqueValues.sort().forEach((value) => {
    const opt = document.createElement("option");
    opt.value = String(value);
    opt.textContent = String(value);
    selectEl.appendChild(opt);
  });
}

function applyFilters() {
  const subject = el.filterSubject.value;
  const unit = el.filterUnit.value;
  const tag = el.filterTag.value;
  const type = el.filterType.value;
  const difficulty = el.filterDifficulty.value;

  state.filteredQuestions = state.allQuestions.filter((q) => {
    if (subject && q.subject !== subject) return false;
    if (unit && (q.unit || "") !== unit) return false;
    if (tag && !(q.tags || []).includes(tag)) return false;
    if (type && q.type !== type) return false;
    if (difficulty && String(q.difficulty || "") !== difficulty) return false;
    return true;
  });

  el.filteredCount.textContent = `필터 적용 문제 수: ${state.filteredQuestions.length}`;
}

function renderBank() {
  const questions = state.allQuestions;
  setOptions(el.filterSubject, questions.map((q) => q.subject));
  setOptions(el.filterUnit, questions.map((q) => q.unit || ""));
  setOptions(el.filterTag, questions.flatMap((q) => q.tags || []));
  setOptions(el.filterType, questions.map((q) => q.type));
  setOptions(el.filterDifficulty, questions.map((q) => (q.difficulty ? String(q.difficulty) : "")));
  applyFilters();
}

function renderQuestion() {
  const question = state.quizQuestions[state.currentIndex];
  const saved = state.answers[question.id] || {};
  el.quizProgress.textContent = `${state.currentIndex + 1} / ${state.quizQuestions.length}`;
  el.quizMeta.textContent = `유형: ${question.type} | 난이도: ${question.difficulty || "-"}`;
  el.questionStem.textContent = question.stem;
  el.questionInput.innerHTML = "";

  if (question.type === "single_choice") {
    question.choices.forEach((choice) => {
      const label = document.createElement("label");
      label.className = "choice";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "choice";
      input.value = choice.id;
      input.checked = saved.answer?.[0] === choice.id;
      label.appendChild(input);
      label.append(` ${choice.id}. ${choice.text}`);
      el.questionInput.appendChild(label);
    });
  } else {
    const input = document.createElement("input");
    input.type = "text";
    input.id = "short-answer";
    input.placeholder = "답안을 입력하세요";
    input.value = saved.answerText || "";
    el.questionInput.appendChild(input);
  }

  el.gradeResult.textContent = "";
  el.explanation.textContent = "";
}

function saveProgress() {
  const payload = {
    bankId: state.activeManifest.bankId,
    version: state.activeManifest.version,
    updatedAt: new Date().toISOString(),
    answers: state.answers,
  };
  localStorage.setItem(storageKey("qb:progress"), JSON.stringify(payload));

  const wrongQuestionIds = Object.entries(state.answers)
    .filter(([, v]) => v.isCorrect === false)
    .map(([id]) => id);
  localStorage.setItem(storageKey("qb:wrong-notes"), JSON.stringify({ wrongQuestionIds, updatedAt: payload.updatedAt }));
}

function loadProgress() {
  try {
    const stored = localStorage.getItem(storageKey("qb:progress"));
    state.answers = stored ? JSON.parse(stored).answers || {} : {};
  } catch {
    state.answers = {};
  }
}

function renderResult() {
  const total = state.quizQuestions.length;
  const entries = state.quizQuestions.map((q) => state.answers[q.id]).filter(Boolean);
  const correct = entries.filter((a) => a.isCorrect).length;
  const rate = total ? ((correct / total) * 100).toFixed(1) : "0.0";

  const byType = ["single_choice", "short_answer"].map((type) => {
    const group = state.quizQuestions.filter((q) => q.type === type);
    const c = group.filter((q) => state.answers[q.id]?.isCorrect).length;
    return { type, total: group.length, correct: c };
  });

  el.resultSummary.innerHTML = `
    <p>총 문제 수: ${total}</p>
    <p>정답 수: ${correct}</p>
    <p>정답률: ${rate}%</p>
    ${byType
      .map((g) => `<p>${g.type}: ${g.total ? ((g.correct / g.total) * 100).toFixed(1) : "0.0"}% (${g.correct}/${g.total})</p>`)
      .join("")}
  `;

  const wrong = state.quizQuestions.filter((q) => state.answers[q.id] && state.answers[q.id].isCorrect === false);
  el.wrongList.innerHTML = "";
  wrong.forEach((q) => {
    const li = document.createElement("li");
    li.textContent = `${q.id} - ${q.stem}`;
    el.wrongList.appendChild(li);
  });
  el.retryWrong.disabled = wrong.length === 0;
}

function startQuiz(questions) {
  if (!questions.length) {
    alert("풀이할 문제가 없습니다.");
    return;
  }
  state.quizQuestions = questions;
  state.currentIndex = 0;
  loadProgress();
  showSection(el.quizSection);
  renderQuestion();
}

async function loadBankFromMeta(meta) {
  const manifestRes = await fetch(meta.manifestUrl);
  if (!manifestRes.ok) throw new Error("manifest.json을 불러오지 못했습니다.");
  const manifest = await manifestRes.json();

  if (!Array.isArray(manifest.questionFiles)) throw new Error("manifest.questionFiles 형식이 잘못되었습니다.");

  const base = meta.manifestUrl.slice(0, meta.manifestUrl.lastIndexOf("/") + 1);
  const allQuestions = [];

  for (const filename of manifest.questionFiles) {
    const fileRes = await fetch(`${base}${filename}`);
    if (!fileRes.ok) throw new Error(`${filename} 파일을 불러오지 못했습니다.`);
    const chunk = await fileRes.json();
    if (!Array.isArray(chunk.questions)) throw new Error(`${filename} questions 형식 오류`);
    allQuestions.push(...chunk.questions);
  }

  const published = allQuestions.filter((q) => (q.status || "published") === "published");
  for (const question of published) {
    const validationError = validateQuestion(question);
    if (validationError) throw new Error(`${question.id || "unknown"}: ${validationError}`);
  }

  state.activeBankMeta = meta;
  state.activeManifest = manifest;
  state.allQuestions = published;
  state.filteredQuestions = published;
  loadProgress();

  el.bankTitle.textContent = manifest.title;
  el.bankDescription.textContent = manifest.description || "";
  renderBank();
  showSection(el.bankSection);
}

function renderCatalog() {
  el.bankList.innerHTML = "";
  (state.catalog?.banks || []).forEach((bank) => {
    const div = document.createElement("div");
    div.className = "bank-item";
    div.innerHTML = `
      <strong>${bank.title}</strong>
      <p>${bank.subject} / ${bank.version} / ${bank.questionCount}문항</p>
      <p>${bank.description || ""}</p>
      <button>이 문제은행 시작</button>
    `;
    div.querySelector("button").addEventListener("click", async () => {
      try {
        await loadBankFromMeta(bank);
      } catch (error) {
        alert(error.message);
      }
    });
    el.bankList.appendChild(div);
  });
}

function renderRecentProgress() {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith("qb:progress:"));
  if (!keys.length) {
    el.recentProgress.textContent = "최근 진행 기록이 없습니다.";
    return;
  }
  const items = keys
    .map((k) => {
      try {
        return JSON.parse(localStorage.getItem(k));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  el.recentProgress.innerHTML = items
    .slice(0, 5)
    .map((item) => `<p>${item.bankId}/${item.version} - ${item.updatedAt}</p>`)
    .join("");
}

async function loadCatalog(url = DEFAULT_CATALOG_URL) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("catalog.json을 불러오지 못했습니다.");
  const json = await res.json();
  if (!Array.isArray(json.banks)) throw new Error("catalog.json 형식이 잘못되었습니다.");
  state.catalog = json;
  renderCatalog();
  renderRecentProgress();
}

function parseLocalBankJSON(raw) {
  const json = JSON.parse(raw);
  if (!json || !Array.isArray(json.questions)) {
    throw new Error("로컬 JSON은 questions 배열이 필요합니다.");
  }
  const bankId = json.bankId || "local-bank";
  const version = json.version || "local";
  state.activeBankMeta = { bankId, version };
  state.activeManifest = {
    bankId,
    version,
    title: json.title || `Local ${bankId}`,
    description: json.description || "로컬 업로드 문제은행",
  };

  const published = json.questions.filter((q) => (q.status || "published") === "published");
  for (const question of published) {
    const validationError = validateQuestion(question);
    if (validationError) throw new Error(`${question.id || "unknown"}: ${validationError}`);
  }

  state.allQuestions = published;
  state.filteredQuestions = published;
  loadProgress();
  el.bankTitle.textContent = state.activeManifest.title;
  el.bankDescription.textContent = state.activeManifest.description;
  renderBank();
  showSection(el.bankSection);
}

el.loadCatalogUrl.addEventListener("click", async () => {
  const url = el.catalogUrl.value.trim();
  if (!url) return;
  try {
    await loadCatalog(url);
    el.homeError.hidden = true;
  } catch (error) {
    el.homeError.textContent = error.message;
    el.homeError.hidden = false;
  }
});

el.localJsonInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    parseLocalBankJSON(await file.text());
  } catch (error) {
    alert(`로컬 JSON 오류: ${error.message}`);
  } finally {
    event.target.value = "";
  }
});

[el.filterSubject, el.filterUnit, el.filterTag, el.filterType, el.filterDifficulty].forEach((node) => {
  node.addEventListener("change", applyFilters);
});

el.resetFilters.addEventListener("click", () => {
  [el.filterSubject, el.filterUnit, el.filterTag, el.filterType, el.filterDifficulty].forEach((node) => {
    node.value = "";
  });
  applyFilters();
});

el.startAll.addEventListener("click", () => startQuiz([...state.filteredQuestions]));
el.startRandom.addEventListener("click", () => {
  const randomQuestions = [...state.filteredQuestions].sort(() => Math.random() - 0.5);
  startQuiz(randomQuestions);
});
el.startWrongOnly.addEventListener("click", () => {
  const wrong = state.filteredQuestions.filter((q) => state.answers[q.id]?.isCorrect === false);
  startQuiz(wrong);
});

el.gradeBtn.addEventListener("click", () => {
  const question = state.quizQuestions[state.currentIndex];
  let answerPayload;
  let grade;

  if (question.type === "single_choice") {
    const checked = document.querySelector('input[name="choice"]:checked');
    if (!checked) {
      alert("보기를 선택하세요.");
      return;
    }
    grade = gradeSingleChoice(question, checked.value);
    answerPayload = { answer: [checked.value], ...grade, answeredAt: new Date().toISOString() };
  } else {
    const input = document.getElementById("short-answer");
    const answerText = input.value || "";
    grade = gradeShortAnswer(question, answerText);
    answerPayload = { answerText, ...grade, answeredAt: new Date().toISOString() };
  }

  state.answers[question.id] = answerPayload;
  saveProgress();

  el.gradeResult.className = answerPayload.isCorrect ? "correct" : "wrong";
  if (question.type === "short_answer") {
    const missing = answerPayload.missingKeywordGroups.map((group) => `[${group.join("/")}]`).join(", ");
    el.gradeResult.textContent = `${answerPayload.isCorrect ? "정답" : "오답"} | 매칭: ${answerPayload.matchedKeywords.join(", ") || "없음"} | 누락: ${missing || "없음"}`;
  } else {
    el.gradeResult.textContent = answerPayload.isCorrect ? "정답" : "오답";
  }
  el.explanation.textContent = `해설: ${question.explanation || "(해설 없음)"}`;
});

el.prevQuestion.addEventListener("click", () => {
  if (state.currentIndex > 0) {
    state.currentIndex -= 1;
    renderQuestion();
  }
});

el.nextQuestion.addEventListener("click", () => {
  if (state.currentIndex < state.quizQuestions.length - 1) {
    state.currentIndex += 1;
    renderQuestion();
  }
});

el.finishQuiz.addEventListener("click", () => {
  renderResult();
  showSection(el.resultSection);
});

el.retryWrong.addEventListener("click", () => {
  const wrong = state.quizQuestions.filter((q) => state.answers[q.id]?.isCorrect === false);
  startQuiz(wrong);
});

el.backHome.addEventListener("click", () => {
  renderRecentProgress();
  showSection(el.homeSection);
});
el.quitQuiz.addEventListener("click", () => showSection(el.bankSection));
el.resultHome.addEventListener("click", () => {
  renderRecentProgress();
  showSection(el.homeSection);
});

(async function init() {
  try {
    await loadCatalog();
  } catch (error) {
    el.homeError.textContent = error.message;
    el.homeError.hidden = false;
  }
})();
