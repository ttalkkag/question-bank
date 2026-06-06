(function initQuestionBank(root) {
  const QUESTION_TYPES = ["single_choice", "short_answer"];
  const SESSION_BANK_STORAGE_KEY = "question-bank:session-bank";

  function normalizeAnswerText(input, normalization = {}) {
    const options = {
      trim: true,
      lowercase: true,
      removeSpaces: false,
      removePunctuation: false,
      ...normalization,
    };
    let value = String(input ?? "");
    if (options.trim) value = value.trim();
    if (options.lowercase) value = value.toLowerCase();
    value = options.removeSpaces ? value.replace(/\s+/g, "") : value.replace(/\s+/g, " ");
    if (options.removePunctuation) {
      value = value.replace(/[.,!?;:'"“”‘’()[\]{}<>\-_/\\]/g, "");
    }
    return value;
  }

  function normalizeAnswerArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }

  function sameAnswerSet(left, right) {
    const a = normalizeAnswerArray(left).sort();
    const b = normalizeAnswerArray(right).sort();
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }

  function gradeSingleChoice(question, selectedAnswer) {
    const selected = Array.isArray(selectedAnswer) ? selectedAnswer : [selectedAnswer];
    return {
      isCorrect: sameAnswerSet(selected, question.answer),
      selectedAnswer: normalizeAnswerArray(selected),
      correctAnswer: normalizeAnswerArray(question.answer),
    };
  }

  function getShortAnswerGroups(question) {
    if (Array.isArray(question.grading?.keywordGroups) && question.grading.keywordGroups.length) {
      return question.grading.keywordGroups.map(normalizeAnswerArray).filter((group) => group.length);
    }
    const accepted = normalizeAnswerArray(question.acceptedKeywords);
    if (accepted.length) return [accepted];
    const answers = normalizeAnswerArray(question.answer);
    if (answers.length) return [answers];
    const answerText = normalizeAnswerArray([question.answerText]);
    return answerText.length ? [answerText] : [];
  }

  function getShortAnswerCandidates(question) {
    return getShortAnswerGroups(question).flat();
  }

  function gradeShortAnswer(question, textAnswer) {
    const normalization = question.grading?.normalization || {};
    const normalizedInput = normalizeAnswerText(textAnswer, normalization);
    const groups = getShortAnswerGroups(question);

    if (!normalizedInput) {
      return {
        isCorrect: false,
        textAnswer: String(textAnswer ?? ""),
        matchedKeywords: [],
        missingKeywords: groups.map((group) => group.join(" 또는 ")),
        correctAnswer: normalizeAnswerArray(question.answer),
      };
    }

    const matchedKeywords = [];
    const missingKeywords = [];

    groups.forEach((group) => {
      const matched = group.find((keyword) => {
        const normalizedKeyword = normalizeAnswerText(keyword, normalization);
        return normalizedKeyword && normalizedInput.includes(normalizedKeyword);
      });
      if (matched) {
        matchedKeywords.push(matched);
      } else {
        missingKeywords.push(group.join(" 또는 "));
      }
    });

    return {
      isCorrect: groups.length > 0 && missingKeywords.length === 0,
      textAnswer: String(textAnswer ?? ""),
      matchedKeywords,
      missingKeywords,
      correctAnswer: normalizeAnswerArray(question.answer),
    };
  }

  function hasText(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function validateChoice(choice, label, errors) {
    if (!choice || typeof choice !== "object") {
      errors.push(`${label}: 보기는 객체여야 합니다.`);
      return;
    }
    if (!hasText(choice.id)) errors.push(`${label}: 보기 id가 필요합니다.`);
    if (!hasText(choice.text)) errors.push(`${label}: 보기 text가 필요합니다.`);
  }

  function validateQuestion(question, index = 0) {
    const errors = [];
    const label = question?.id || `questions[${index}]`;

    if (!question || typeof question !== "object" || Array.isArray(question)) {
      return [`${label}: 문제는 객체여야 합니다.`];
    }
    if (!hasText(question.id)) errors.push(`${label}: id가 필요합니다.`);
    if (!hasText(question.type)) errors.push(`${label}: type이 필요합니다.`);
    if (!QUESTION_TYPES.includes(question.type)) errors.push(`${label}: type은 single_choice 또는 short_answer여야 합니다.`);
    if (!hasText(question.stem)) errors.push(`${label}: stem이 필요합니다.`);

    const hasLegacyShortAnswer =
      question.type === "short_answer" && hasText(question.answerText) && Array.isArray(question.grading?.keywordGroups);
    if (!Array.isArray(question.answer) && !hasLegacyShortAnswer) {
      errors.push(`${label}: answer 배열이 필요합니다.`);
    }

    if (question.type === "single_choice") {
      if (!Array.isArray(question.choices) || question.choices.length !== 4) {
        errors.push(`${label}: single_choice 문제는 4개의 choices가 필요합니다.`);
      } else {
        question.choices.forEach((choice, choiceIndex) => validateChoice(choice, `${label}.choices[${choiceIndex}]`, errors));
      }

      const choiceIds = Array.isArray(question.choices) ? question.choices.map((choice) => choice.id) : [];
      const answers = normalizeAnswerArray(question.answer);
      if (!answers.length) errors.push(`${label}: single_choice 정답이 필요합니다.`);
      answers.forEach((answer) => {
        if (!choiceIds.includes(answer)) errors.push(`${label}: 정답 ${answer}이 choices id와 일치하지 않습니다.`);
      });
    }

    if (question.type === "short_answer") {
      if (question.answer !== undefined && !Array.isArray(question.answer)) {
        errors.push(`${label}: answer는 배열이어야 합니다.`);
      }
      if (question.acceptedKeywords !== undefined && !Array.isArray(question.acceptedKeywords)) {
        errors.push(`${label}: acceptedKeywords는 배열이어야 합니다.`);
      }
      if (question.grading?.keywordGroups !== undefined && !Array.isArray(question.grading.keywordGroups)) {
        errors.push(`${label}: grading.keywordGroups는 배열이어야 합니다.`);
      }
      if (!getShortAnswerCandidates(question).length) {
        errors.push(`${label}: short_answer 문제는 answer 또는 acceptedKeywords 값이 필요합니다.`);
      }
    }

    return errors;
  }

  function validateBank(bank) {
    const errors = [];
    if (!bank || typeof bank !== "object" || Array.isArray(bank)) {
      return { valid: false, errors: ["문제은행 JSON은 객체여야 합니다."] };
    }
    if (!hasText(bank.bankId)) errors.push("bankId가 필요합니다.");
    if (!hasText(bank.title)) errors.push("title이 필요합니다.");
    if (!Array.isArray(bank.questions)) {
      errors.push("questions 배열이 필요합니다.");
    } else {
      bank.questions.forEach((question, index) => errors.push(...validateQuestion(question, index)));
    }
    return { valid: errors.length === 0, errors };
  }

  function bankVersion(bank) {
    return hasText(bank?.version) ? bank.version : "v1";
  }

  function parseBankJson(raw) {
    let bank;
    try {
      bank = JSON.parse(raw);
    } catch {
      throw new Error("JSON 문법이 올바르지 않습니다.");
    }
    const validation = validateBank(bank);
    if (!validation.valid) throw new Error(validation.errors.slice(0, 6).join("\n"));
    return { ...bank, version: bankVersion(bank) };
  }

  function encodeBankForUrl(bank) {
    return encodeURIComponent(JSON.stringify(bank));
  }

  function decodeBankFromUrl(encoded) {
    let raw;
    try {
      raw = decodeURIComponent(encoded);
    } catch {
      throw new Error("URL에 저장된 JSON을 복원하지 못했습니다.");
    }
    return parseBankJson(raw);
  }

  function buildInlineBankHash(bank) {
    return `#bank=${encodeBankForUrl(bank)}`;
  }

  function buildRemoteBankHash(url) {
    return `#bankUrl=${encodeURIComponent(String(url).trim())}`;
  }

  function rawParamFromLocationPart(value, name) {
    const text = String(value || "").replace(/^[#?]/, "");
    if (!text) return null;
    for (const pair of text.split("&")) {
      const [rawKey, ...rawValueParts] = pair.split("=");
      if (decodeURIComponent(rawKey.replace(/\+/g, " ")) === name) {
        return rawValueParts.join("=");
      }
    }
    return null;
  }

  function readBankSourceFromUrl(locationLike) {
    const hash = locationLike?.hash || "";
    const search = locationLike?.search || "";
    const hashHasSource = rawParamFromLocationPart(hash, "bank") !== null || rawParamFromLocationPart(hash, "bankUrl") !== null;
    const sourcePart = hashHasSource ? hash : search;
    const encodedBank = rawParamFromLocationPart(sourcePart, "bank");

    if (encodedBank !== null) {
      return { kind: "inline", bank: decodeBankFromUrl(encodedBank) };
    }

    const encodedUrl = rawParamFromLocationPart(sourcePart, "bankUrl");
    if (encodedUrl !== null) {
      let url;
      try {
        url = decodeURIComponent(encodedUrl);
      } catch {
        throw new Error("문제은행 JSON URL을 복원하지 못했습니다.");
      }
      if (!hasText(url)) throw new Error("문제은행 JSON URL이 비어 있습니다.");
      return { kind: "url", url };
    }

    return null;
  }

  function saveBankToSessionStorage(storage, bank) {
    if (!storage) return false;
    try {
      storage.setItem(SESSION_BANK_STORAGE_KEY, JSON.stringify(bank));
      return true;
    } catch {
      return false;
    }
  }

  function readBankSourceFromSessionStorage(storage) {
    if (!storage) return null;
    let raw;
    try {
      raw = storage.getItem(SESSION_BANK_STORAGE_KEY);
    } catch {
      return null;
    }
    if (!hasText(raw)) return null;
    return { kind: "session", bank: parseBankJson(raw) };
  }

  function clearBankFromSessionStorage(storage) {
    if (!storage) return false;
    try {
      storage.removeItem(SESSION_BANK_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  function formatQuestionType(type) {
    return type === "single_choice" ? "사지선다" : "주관식";
  }

  function formatCorrectAnswer(question) {
    if (question.type === "single_choice") return normalizeAnswerArray(question.answer).join(", ");
    return normalizeAnswerArray(question.answer).join(", ") || getShortAnswerCandidates(question).join(", ");
  }

  function splitTableRow(line) {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  function isTableSeparatorRow(line) {
    if (line == null || line.indexOf("|") === -1) return false;
    const cells = splitTableRow(line);
    return cells.length >= 1 && cells.every((cell) => /^:?-{1,}:?$/.test(cell));
  }

  function isTableContentRow(line) {
    // 단일 열 표(`| 직장주소 |`)도 허용한다. 표 인식은 다음 줄이 구분선(`|---|`)인지로
    // 가드되므로(parseRichBlocks), 파이프가 하나뿐인 평문이 표로 오인되지 않는다.
    return line != null && line.indexOf("|") !== -1 && splitTableRow(line).length >= 1;
  }

  // stem/보기 텍스트를 텍스트·마크다운 표·이미지 블록으로 분해한다(순수 함수).
  // 표:  | X | Y | 헤더 다음 줄이 |---| 구분선.   이미지:  ![alt](data:image/...; 또는 http(s) URL)
  function parseRichBlocks(text) {
    const lines = String(text == null ? "" : text).split("\n");
    const blocks = [];
    let buffer = [];
    const flush = () => {
      if (!buffer.length) return;
      const joined = buffer.join("\n").replace(/\s+$/, "");
      if (joined.trim()) blocks.push({ type: "text", text: joined });
      buffer = [];
    };
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const image = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (image) {
        flush();
        blocks.push({ type: "image", alt: image[1], url: image[2].trim() });
        continue;
      }
      if (isTableContentRow(line) && isTableSeparatorRow(lines[i + 1])) {
        flush();
        const headers = splitTableRow(line);
        const rows = [];
        let j = i + 2;
        while (j < lines.length && isTableContentRow(lines[j])) {
          rows.push(splitTableRow(lines[j]));
          j += 1;
        }
        blocks.push({ type: "table", headers, rows });
        i = j - 1;
        continue;
      }
      buffer.push(line);
    }
    flush();
    return blocks;
  }

  // data:image/... 와 http(s)만 허용. javascript:/기타 스킴은 거부(널 반환).
  function sanitizeMediaUrl(url) {
    const value = String(url == null ? "" : url).trim();
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) return value;
    return null;
  }

  // 목록/요약용: 표·이미지 블록을 걷어낸 평문(없으면 [표/그림 포함] 표시).
  function plainTextSummary(text) {
    const blocks = parseRichBlocks(text);
    const summary = blocks
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (summary) return summary;
    if (blocks.some((block) => block.type === "table")) return "[표 포함 문제]";
    if (blocks.some((block) => block.type === "image")) return "[그림 포함 문제]";
    return "";
  }

  const core = {
    normalizeAnswerText,
    parseRichBlocks,
    sanitizeMediaUrl,
    plainTextSummary,
    gradeSingleChoice,
    gradeShortAnswer,
    getShortAnswerCandidates,
    validateQuestion,
    validateBank,
    parseBankJson,
    encodeBankForUrl,
    decodeBankFromUrl,
    buildInlineBankHash,
    buildRemoteBankHash,
    readBankSourceFromUrl,
    saveBankToSessionStorage,
    readBankSourceFromSessionStorage,
    clearBankFromSessionStorage,
    formatQuestionType,
    formatCorrectAnswer,
    bankVersion,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = core;
  }

  if (typeof root !== "undefined") {
    root.QuestionBankCore = core;
  }

  if (typeof document === "undefined") return;

  const state = {
    activeBank: null,
    allQuestions: [],
    filteredQuestions: [],
    quizQuestions: [],
    answersById: {},
    sessionAnsweredIds: new Set(),
    currentIndex: 0,
  };

  const el = {
    homeSection: document.getElementById("home-section"),
    bankSection: document.getElementById("bank-section"),
    quizSection: document.getElementById("quiz-section"),
    resultSection: document.getElementById("result-section"),
    homeError: document.getElementById("home-error"),
    localJsonInput: document.getElementById("local-json-input"),
    jsonUrlInput: document.getElementById("json-url-input"),
    loadJsonUrl: document.getElementById("load-json-url"),
    directJsonInput: document.getElementById("direct-json-input"),
    loadDirectJson: document.getElementById("load-direct-json"),
    urlStateStatus: document.getElementById("url-state-status"),
    bankTitle: document.getElementById("bank-title"),
    bankDescription: document.getElementById("bank-description"),
    bankStats: document.getElementById("bank-stats"),
    filterSubject: document.getElementById("filter-subject"),
    filterUnit: document.getElementById("filter-unit"),
    filterTag: document.getElementById("filter-tag"),
    filterType: document.getElementById("filter-type"),
    filterDifficulty: document.getElementById("filter-difficulty"),
    filteredCount: document.getElementById("filtered-count"),
    startAll: document.getElementById("start-all"),
    startRandom: document.getElementById("start-random"),
    resetFilters: document.getElementById("reset-filters"),
    backHome: document.getElementById("back-home"),
    quizProgress: document.getElementById("quiz-progress"),
    questionMeta: document.getElementById("question-meta"),
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
    [el.homeSection, el.bankSection, el.quizSection, el.resultSection].forEach((node) => {
      node.hidden = true;
    });
    section.hidden = false;
  }

  function createNode(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function buildTableNode(block) {
    const table = createNode("table", "q-table");
    if (block.headers && block.headers.length) {
      const head = document.createElement("thead");
      const row = document.createElement("tr");
      block.headers.forEach((cell) => row.append(createNode("th", "", cell)));
      head.append(row);
      table.append(head);
    }
    const body = document.createElement("tbody");
    block.rows.forEach((cells) => {
      const row = document.createElement("tr");
      cells.forEach((cell) => row.append(createNode("td", "", cell)));
      body.append(row);
    });
    table.append(body);
    return table;
  }

  function buildImageNode(url, alt) {
    const safe = core.sanitizeMediaUrl(url);
    if (!safe) return null;
    const img = document.createElement("img");
    img.src = safe;
    img.alt = alt || "";
    img.className = "q-image";
    img.loading = "lazy";
    return img;
  }

  // 텍스트/마크다운 표/이미지 블록을 DOM으로 렌더(컨테이너 비우고 채움).
  // 인용 텍스트는 createNode(textContent)로만 넣으므로 임의 JSON에도 XSS 안전.
  function renderRich(container, text) {
    container.replaceChildren();
    core.parseRichBlocks(text).forEach((block) => {
      if (block.type === "table") {
        container.append(buildTableNode(block));
      } else if (block.type === "image") {
        const img = buildImageNode(block.url, block.alt);
        if (img) container.append(img);
      } else {
        container.append(createNode("p", "rich-text", block.text));
      }
    });
  }

  function choiceHasRichContent(choice) {
    return core.parseRichBlocks(choice.text).some((block) => block.type !== "text");
  }

  function setError(message) {
    el.homeError.textContent = message;
    el.homeError.hidden = !message;
  }

  function setUrlStateStatus(message) {
    el.urlStateStatus.textContent = message;
  }

  function loadProgress() {
    state.answersById = {};
  }

  function saveAnswerRecord(record) {
    state.answersById[record.questionId] = record;
  }

  function statNode(label, value) {
    const node = createNode("div", "stat");
    node.append(createNode("strong", "", String(value)));
    node.append(createNode("span", "", label));
    return node;
  }

  function renderBankStats() {
    const records = Object.values(state.answersById);
    const correct = records.filter((record) => record.isCorrect).length;
    const answered = records.length;
    const rate = answered ? `${Math.round((correct / answered) * 100)}%` : "0%";

    el.bankStats.replaceChildren(
      statNode("문항", state.allQuestions.length),
      statNode("풀이", answered),
      statNode("정답률", rate),
    );
  }

  function setOptions(selectEl, values) {
    const unique = [...new Set(values.filter((value) => value !== undefined && value !== null && String(value).trim() !== ""))];
    selectEl.replaceChildren();
    selectEl.append(new Option("전체", ""));
    unique.sort((a, b) => String(a).localeCompare(String(b), "ko")).forEach((value) => {
      selectEl.append(new Option(String(value), String(value)));
    });
  }

  function applyFilters() {
    const subject = el.filterSubject.value;
    const unit = el.filterUnit.value;
    const tag = el.filterTag.value;
    const type = el.filterType.value;
    const difficulty = el.filterDifficulty.value;

    state.filteredQuestions = state.allQuestions.filter((question) => {
      if (subject && question.subject !== subject) return false;
      if (unit && (question.unit || "") !== unit) return false;
      if (tag && !(question.tags || []).includes(tag)) return false;
      if (type && question.type !== type) return false;
      if (difficulty && String(question.difficulty || "") !== difficulty) return false;
      return true;
    });

    el.filteredCount.textContent = `${state.filteredQuestions.length}문항 선택됨`;
  }

  function renderBankFilters() {
    setOptions(el.filterSubject, state.allQuestions.map((question) => question.subject));
    setOptions(el.filterUnit, state.allQuestions.map((question) => question.unit));
    setOptions(el.filterTag, state.allQuestions.flatMap((question) => question.tags || []));
    setOptions(el.filterType, state.allQuestions.map((question) => question.type));
    setOptions(el.filterDifficulty, state.allQuestions.map((question) => question.difficulty));
    applyFilters();
  }

  function activateBank(bank, options = {}) {
    const validation = validateBank(bank);
    if (!validation.valid) {
      throw new Error(validation.errors.slice(0, 6).join("\n"));
    }

    state.activeBank = { ...bank, version: bankVersion(bank) };
    state.allQuestions = bank.questions.filter((question) => (question.status || "published") === "published");
    state.filteredQuestions = [...state.allQuestions];
    loadProgress();

    el.bankTitle.textContent = state.activeBank.title;
    el.bankDescription.textContent = state.activeBank.description || `${state.activeBank.subject || "공통"} / ${bankVersion(state.activeBank)}`;
    renderBankStats();
    renderBankFilters();

    if (options.show !== false) showSection(el.bankSection);
  }

  async function fetchText(url, errorLabel) {
    let response;
    try {
      response = await fetch(url);
    } catch {
      throw new Error(`${errorLabel}을 불러오지 못했습니다. URL 또는 CORS 설정을 확인하세요.`);
    }
    if (!response.ok) throw new Error(`${errorLabel}을 불러오지 못했습니다. HTTP ${response.status}`);
    return response.text();
  }

  function replaceUrlHash(hash) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
  }

  function currentSessionStorage() {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }

  function saveCurrentBankSession(bank) {
    return saveBankToSessionStorage(currentSessionStorage(), bank);
  }

  function persistInlineBankSource(bank) {
    const hash = buildInlineBankHash(bank);
    replaceUrlHash(hash);
    setUrlStateStatus("현재 문제은행 JSON을 URL에 저장했습니다.");
  }

  function persistRemoteBankSource(url) {
    replaceUrlHash(buildRemoteBankHash(url));
    setUrlStateStatus("문제은행 JSON URL을 현재 주소에 저장했습니다.");
  }

  function loadBankFromText(raw, options = {}) {
    const bank = parseBankJson(raw);
    activateBank(bank);
    saveCurrentBankSession(bank);
    if (options.persist !== false) persistInlineBankSource(bank);
  }

  function loadBankFromLocalFileText(raw) {
    const bank = parseBankJson(raw);
    activateBank(bank);
    saveCurrentBankSession(bank);
    replaceUrlHash("");
    setUrlStateStatus("현재 탭에서 새로고침 후 문제은행을 복원합니다.");
  }

  async function loadBankFromJsonUrl(url, options = {}) {
    const sourceUrl = String(url || "").trim();
    if (!sourceUrl) throw new Error("문제은행 JSON URL을 입력하세요.");
    const resolvedUrl = new URL(sourceUrl, window.location.href).href;
    const bank = parseBankJson(await fetchText(resolvedUrl, "문제은행 JSON"));
    activateBank(bank);
    saveCurrentBankSession(bank);
    if (options.persist !== false) persistRemoteBankSource(sourceUrl);
  }

  function buildMetaPills(question) {
    const values = [
      question.id,
      question.subject,
      question.unit,
      formatQuestionType(question.type),
      question.difficulty ? `난이도 ${question.difficulty}` : "",
      ...(question.tags || []),
    ].filter(Boolean);

    el.questionMeta.replaceChildren(...values.map((value) => createNode("span", "pill", value)));
  }

  function renderFeedback(question, answerRecord) {
    if (!answerRecord || typeof answerRecord.isCorrect !== "boolean") {
      el.gradeResult.className = "";
      el.gradeResult.textContent = "";
      el.explanation.textContent = "";
      return;
    }

    el.gradeResult.className = answerRecord.isCorrect ? "correct" : "wrong";
    if (question.type === "short_answer") {
      const grade = gradeShortAnswer(question, answerRecord.textAnswer);
      const matched = grade.matchedKeywords.join(", ") || "없음";
      const missing = grade.missingKeywords.join(", ") || "없음";
      el.gradeResult.textContent = `${answerRecord.isCorrect ? "정답" : "오답"} · 매칭: ${matched} · 누락: ${missing}`;
    } else if (answerRecord.isCorrect) {
      el.gradeResult.textContent = "정답";
    } else {
      el.gradeResult.textContent = `오답 · 정답: ${formatCorrectAnswer(question)}`;
    }
    el.explanation.textContent = `해설: ${question.explanation || "등록된 해설이 없습니다."}`;
  }

  function renderQuestion() {
    const question = state.quizQuestions[state.currentIndex];
    const saved = state.answersById[question.id];

    el.quizProgress.textContent = `문제 ${state.currentIndex + 1} / ${state.quizQuestions.length}`;
    renderRich(el.questionStem, question.stem);
    const stemImage = buildImageNode(question.image, question.imageAlt || "문제 그림");
    if (stemImage) el.questionStem.append(stemImage);
    buildMetaPills(question);
    el.questionInput.replaceChildren();

    if (question.type === "single_choice") {
      question.choices.forEach((choice) => {
        const label = createNode("label", "choice");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "choice";
        input.value = choice.id;
        input.checked = saved?.selectedAnswer?.includes(choice.id) || false;
        if (choiceHasRichContent(choice)) {
          const wrap = createNode("span", "choice-rich");
          wrap.append(createNode("strong", "choice-label", `${choice.id}.`));
          renderRich(wrap, choice.text);
          label.append(input, wrap);
        } else {
          label.append(input, createNode("span", "", `${choice.id}. ${choice.text}`));
        }
        el.questionInput.append(label);
      });
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.id = "short-answer";
      input.autocomplete = "off";
      input.placeholder = "답안 입력";
      input.setAttribute("aria-label", "주관식 답안");
      input.value = saved?.textAnswer || "";
      el.questionInput.append(input);
    }

    el.prevQuestion.disabled = state.currentIndex === 0;
    el.nextQuestion.disabled = state.currentIndex === state.quizQuestions.length - 1;
    renderFeedback(question, saved);
  }

  function startQuiz(questions) {
    if (!questions.length) {
      alert("풀이할 문제가 없습니다.");
      return;
    }
    state.quizQuestions = [...questions];
    state.currentIndex = 0;
    state.sessionAnsweredIds = new Set();
    loadProgress();
    showSection(el.quizSection);
    renderQuestion();
  }

  function gradeCurrentQuestion() {
    const question = state.quizQuestions[state.currentIndex];
    const answeredAt = new Date().toISOString();
    let grade;
    let record;

    if (question.type === "single_choice") {
      const checked = document.querySelector('input[name="choice"]:checked');
      if (!checked) {
        el.gradeResult.className = "wrong";
        el.gradeResult.textContent = "보기를 선택하세요.";
        el.explanation.textContent = "";
        return;
      }
      grade = gradeSingleChoice(question, [checked.value]);
      record = {
        bankId: state.activeBank.bankId,
        bankVersion: bankVersion(state.activeBank),
        questionId: question.id,
        selectedAnswer: grade.selectedAnswer,
        isCorrect: grade.isCorrect,
        answeredAt,
      };
    } else {
      const input = document.getElementById("short-answer");
      grade = gradeShortAnswer(question, input.value);
      record = {
        bankId: state.activeBank.bankId,
        bankVersion: bankVersion(state.activeBank),
        questionId: question.id,
        textAnswer: grade.textAnswer,
        isCorrect: grade.isCorrect,
        answeredAt,
      };
    }

    saveAnswerRecord(record);
    state.sessionAnsweredIds.add(question.id);
    renderBankStats();
    renderFeedback(question, record);
  }

  function isSessionCorrect(question) {
    return state.sessionAnsweredIds.has(question.id) && state.answersById[question.id]?.isCorrect === true;
  }

  function currentWrongQuestions() {
    return state.quizQuestions.filter((question) => !isSessionCorrect(question));
  }

  function renderResult() {
    const total = state.quizQuestions.length;
    const correct = state.quizQuestions.filter(isSessionCorrect).length;
    const wrong = total - correct;
    const rate = total ? `${Math.round((correct / total) * 100)}%` : "0%";

    el.resultSummary.replaceChildren(
      statNode("총 문항 수", total),
      statNode("정답 수", correct),
      statNode("오답 수", wrong),
      statNode("정답률", rate),
    );

    const wrongQuestions = currentWrongQuestions();
    el.wrongList.replaceChildren();
    if (!wrongQuestions.length) {
      el.wrongList.append(createNode("p", "muted", "틀린 문제가 없습니다."));
    } else {
      wrongQuestions.forEach((question) => {
        const item = createNode("article", "wrong-item");
        item.append(createNode("h4", "", core.plainTextSummary(question.stem) || question.stem));
        item.append(createNode("p", "muted", `${question.id} · ${formatQuestionType(question.type)} · 정답 ${formatCorrectAnswer(question)}`));
        el.wrongList.append(item);
      });
    }
    el.retryWrong.disabled = wrongQuestions.length === 0;
  }

  function resetFilters() {
    [el.filterSubject, el.filterUnit, el.filterTag, el.filterType, el.filterDifficulty].forEach((select) => {
      select.value = "";
    });
    applyFilters();
  }

  el.localJsonInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setError("");
      loadBankFromLocalFileText(await file.text());
    } catch (error) {
      setError(`로컬 JSON 오류: ${error.message}`);
      showSection(el.homeSection);
    } finally {
      event.target.value = "";
    }
  });

  el.loadJsonUrl.addEventListener("click", async () => {
    try {
      setError("");
      await loadBankFromJsonUrl(el.jsonUrlInput.value);
    } catch (error) {
      setError(`JSON URL 오류: ${error.message}`);
      showSection(el.homeSection);
    }
  });

  el.jsonUrlInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    el.loadJsonUrl.click();
  });

  el.loadDirectJson.addEventListener("click", () => {
    try {
      setError("");
      loadBankFromText(el.directJsonInput.value);
    } catch (error) {
      setError(`직접 입력 JSON 오류: ${error.message}`);
      showSection(el.homeSection);
    }
  });

  [el.filterSubject, el.filterUnit, el.filterTag, el.filterType, el.filterDifficulty].forEach((select) => {
    select.addEventListener("change", applyFilters);
  });

  el.resetFilters.addEventListener("click", resetFilters);
  el.startAll.addEventListener("click", () => startQuiz(state.filteredQuestions));
  el.startRandom.addEventListener("click", () => startQuiz([...state.filteredQuestions].sort(() => Math.random() - 0.5)));
  el.backHome.addEventListener("click", () => {
    showSection(el.homeSection);
  });
  el.gradeBtn.addEventListener("click", gradeCurrentQuestion);
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
  el.quitQuiz.addEventListener("click", () => {
    renderBankStats();
    showSection(el.bankSection);
  });
  el.retryWrong.addEventListener("click", () => startQuiz(currentWrongQuestions()));
  el.resultHome.addEventListener("click", () => {
    showSection(el.homeSection);
  });

  async function restoreBankSourceFromUrl() {
    const source = readBankSourceFromUrl(window.location);
    if (!source) return;
    if (source.kind === "inline") {
      activateBank(source.bank);
      saveCurrentBankSession(source.bank);
      setUrlStateStatus("URL에 저장된 문제은행 JSON을 복원했습니다.");
      return;
    }
    await loadBankFromJsonUrl(source.url, { persist: false });
    setUrlStateStatus("URL에 저장된 문제은행 JSON 링크를 복원했습니다.");
  }

  (async function init() {
    try {
      await restoreBankSourceFromUrl();
      if (!state.activeBank) {
        const sessionSource = readBankSourceFromSessionStorage(currentSessionStorage());
        if (sessionSource) {
          activateBank(sessionSource.bank);
          setUrlStateStatus("현재 탭에 저장된 문제은행 JSON을 복원했습니다.");
        }
      }
    } catch (error) {
      setError(`복원 오류: ${error.message}`);
      showSection(el.homeSection);
    }
  })();
})(typeof globalThis !== "undefined" ? globalThis : window);
