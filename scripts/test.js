const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../app.js");

const root = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function testGrading() {
  const single = {
    id: "q1",
    type: "single_choice",
    stem: "stem",
    choices: [
      { id: "A", text: "a" },
      { id: "B", text: "b" },
      { id: "C", text: "c" },
      { id: "D", text: "d" },
    ],
    answer: ["B"],
  };

  assert.equal(core.gradeSingleChoice(single, ["B"]).isCorrect, true);
  assert.equal(core.gradeSingleChoice(single, ["A"]).isCorrect, false);
  assert.deepEqual(core.gradeSingleChoice(single, ["B"]).correctAnswer, ["B"]);

  const short = {
    id: "q2",
    type: "short_answer",
    stem: "stem",
    answer: ["공정력"],
    acceptedKeywords: ["공정력", "구성요건적 효력"],
  };
  assert.equal(core.gradeShortAnswer(short, "  행정행위의 공정력 ").isCorrect, true);
  assert.equal(core.gradeShortAnswer(short, "구성요건적   효력").isCorrect, true);
  assert.equal(core.gradeShortAnswer(short, "").isCorrect, false);
  assert.equal(core.normalizeAnswerText(" A   B "), "a b");

  const grouped = {
    id: "q3",
    type: "short_answer",
    stem: "stem",
    answerText: "공정력",
    grading: {
      mode: "contains_all_groups",
      keywordGroups: [["공정력"], ["취소 전", "취소전"]],
    },
  };
  assert.equal(core.gradeShortAnswer(grouped, "공정력은 취소 전까지 통용된다").isCorrect, true);
  assert.equal(core.gradeShortAnswer(grouped, "공정력").isCorrect, false);

  const normalized = {
    id: "q4",
    type: "short_answer",
    stem: "stem",
    answerText: "localStorage",
    grading: {
      mode: "contains_all_groups",
      keywordGroups: [["localstorage"]],
      normalization: {
        trim: true,
        lowercase: true,
        removeSpaces: true,
        removePunctuation: true,
      },
    },
  };
  assert.equal(core.gradeShortAnswer(normalized, "  Local Storage!!  ").isCorrect, true);
}

function testRichContent() {
  // 평문은 단일 text 블록.
  assert.deepEqual(core.parseRichBlocks("그냥 텍스트"), [{ type: "text", text: "그냥 텍스트" }]);

  // 마크다운 표 → table 블록.
  const tableStem = ["다음 진리표:", "", "| X | Y | F |", "|---|---|---|", "| 0 | 0 | 0 |", "| 1 | 1 | 0 |"].join("\n");
  const blocks = core.parseRichBlocks(tableStem);
  assert.equal(blocks[0].type, "text");
  const table = blocks.find((block) => block.type === "table");
  assert.deepEqual(table.headers, ["X", "Y", "F"]);
  assert.deepEqual(table.rows, [["0", "0", "0"], ["1", "1", "0"]]);

  // 이미지 마크다운 → image 블록.
  const imageBlocks = core.parseRichBlocks("![회로](data:image/png;base64,AAAA)");
  assert.deepEqual(imageBlocks, [{ type: "image", alt: "회로", url: "data:image/png;base64,AAAA" }]);

  // 파이프 한 개뿐이고 구분선이 없으면 표가 아니다(평문 유지).
  assert.deepEqual(core.parseRichBlocks("F = X | Y"), [{ type: "text", text: "F = X | Y" }]);

  // 단일 열 표(SQL 실행결과 보기 등)도 표로 인식한다.
  const oneCol = core.parseRichBlocks("| 직장주소 |\n| --- |\n| 서울시 종로구 |\n| 부산시 북구 |");
  assert.equal(oneCol.length, 1);
  assert.equal(oneCol[0].type, "table");
  assert.deepEqual(oneCol[0].headers, ["직장주소"]);
  assert.deepEqual(oneCol[0].rows, [["서울시 종로구"], ["부산시 북구"]]);

  // URL 살균: data:image/http(s)만 허용.
  assert.equal(core.sanitizeMediaUrl("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(core.sanitizeMediaUrl("https://example.com/a.png"), "https://example.com/a.png");
  assert.equal(core.sanitizeMediaUrl("javascript:alert(1)"), null);
  assert.equal(core.sanitizeMediaUrl("data:text/html;base64,AAAA"), null);

  // 요약: 표/이미지는 걷어내고 평문만, 없으면 표시.
  assert.equal(core.plainTextSummary(tableStem), "다음 진리표:");
  assert.equal(core.plainTextSummary("| X | Y |\n|---|---|\n| 0 | 1 |"), "[표 포함 문제]");
  assert.equal(core.plainTextSummary("![c](data:image/png;base64,AAAA)"), "[그림 포함 문제]");
}

function testChoiceShuffle() {
  // 위치 라벨
  assert.equal(core.positionLabel(0), "A");
  assert.equal(core.positionLabel(3), "D");

  // Fisher–Yates: rng=()=>0 이면 결정적 순열
  assert.deepEqual(core.shuffleChoiceIds(["A", "B", "C", "D"], () => 0), ["B", "C", "D", "A"]);

  // 어떤 rng든 원소 집합은 보존(순열)
  const ids = ["A", "B", "C", "D"];
  for (const rng of [() => 0, () => 0.5, () => 0.999]) {
    const out = core.shuffleChoiceIds(ids, rng);
    assert.deepEqual([...out].sort(), [...ids].sort());
    assert.notEqual(out, ids); // 원본 비변경(복사본 반환)
  }
  assert.deepEqual(ids, ["A", "B", "C", "D"]);

  // 정답 라벨은 표시 순서를 따른다(채점은 id 기준이라 불변)
  const q = { type: "single_choice", answer: ["A"], choices: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }] };
  assert.deepEqual(core.correctAnswerLabels(q, ["B", "C", "D", "A"]), ["D"]); // A가 4번째 위치 → D
  assert.deepEqual(core.correctAnswerLabels(q, ["A", "B", "C", "D"]), ["A"]);
  assert.deepEqual(core.correctAnswerLabels(q, null), ["A"]); // 순서 없으면 choices 순서

  // 셔플해도 채점은 id 기준으로 정답 유지
  const order = core.shuffleChoiceIds(q.choices.map((c) => c.id), () => 0);
  assert.equal(core.gradeSingleChoice(q, ["A"]).isCorrect, true);
  assert.ok(order.includes("A"));
}

function testValidation() {
  const validBank = readJson("public/data/sample_question_bank.json");
  assert.equal(core.validateBank(validBank).valid, true);

  const legacyShortAnswerBank = {
    schemaVersion: "1.0.0",
    bankId: "legacy-sample",
    title: "구형 샘플 호환",
    version: "v1",
    questions: [
      {
        id: "legacy-q1",
        type: "short_answer",
        stem: "행정행위가 취소되기 전까지 유효한 것으로 통용되는 효력은?",
        answerText: "공정력",
        grading: { mode: "contains_all_groups", keywordGroups: [["공정력"]] },
      },
    ],
  };
  assert.equal(core.validateBank(legacyShortAnswerBank).valid, true);

  const invalidBank = { bankId: "x", questions: [] };
  const invalidResult = core.validateBank(invalidBank);
  assert.equal(invalidResult.valid, false);
  assert.ok(invalidResult.errors.some((error) => error.includes("title")));

  const acceptedOnlyShortAnswer = {
    bankId: "x",
    title: "x",
    questions: [{ id: "q", type: "short_answer", stem: "stem", acceptedKeywords: ["키워드"] }],
  };
  const acceptedOnlyResult = core.validateBank(acceptedOnlyShortAnswer);
  assert.equal(acceptedOnlyResult.valid, false);
  assert.ok(acceptedOnlyResult.errors.some((error) => error.includes("answer 배열")));
}

function testSampleDataFiles() {
  for (const filePath of ["public/data/sample_question_bank.json", "sample.json"]) {
    const bank = readJson(filePath);
    const validation = core.validateBank(bank);
    assert.equal(validation.valid, true, `${filePath}\n${validation.errors.join("\n")}`);
    assert.ok(bank.questions.length > 0, `${filePath}에 최소 1개 이상의 문제가 필요합니다.`);
  }
}

function testJsonSourceUrlState() {
  const bank = readJson("public/data/sample_question_bank.json");
  const encoded = core.encodeBankForUrl(bank);
  assert.equal(decodeURIComponent(encoded), JSON.stringify(bank));
  assert.deepEqual(core.decodeBankFromUrl(encoded), { ...bank, version: "v1" });

  const inlineHash = core.buildInlineBankHash(bank);
  assert.ok(inlineHash.startsWith("#bank="));
  assert.equal(core.readBankSourceFromUrl({ hash: inlineHash, search: "" }).kind, "inline");
  assert.equal(core.readBankSourceFromUrl({ hash: inlineHash, search: "" }).bank.bankId, bank.bankId);

  const percentBank = { ...bank, description: "100% 준비된 샘플" };
  const percentHash = core.buildInlineBankHash(percentBank);
  assert.equal(core.readBankSourceFromUrl({ hash: percentHash, search: "" }).bank.description, percentBank.description);

  const sourceUrl = "https://example.com/sample_question_bank.json";
  const remoteHash = core.buildRemoteBankHash(sourceUrl);
  assert.equal(core.readBankSourceFromUrl({ hash: remoteHash, search: "" }).kind, "url");
  assert.equal(core.readBankSourceFromUrl({ hash: remoteHash, search: "" }).url, sourceUrl);

  assert.throws(() => core.decodeBankFromUrl("%7Bbad-json"), /JSON 문법/);
}

function testSessionStorageBankSource() {
  const bank = readJson("public/data/sample_question_bank.json");
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };

  assert.equal(core.saveBankToSessionStorage(storage, bank), true);

  const source = core.readBankSourceFromSessionStorage(storage);
  assert.equal(source.kind, "session");
  assert.equal(source.bank.bankId, bank.bankId);

  core.clearBankFromSessionStorage(storage);
  assert.equal(core.readBankSourceFromSessionStorage(storage), null);
}

function testSchemaFile() {
  const schema = readJson("question_bank.schema.json");
  assert.equal(schema.title, "Question Bank");
  assert.ok(schema.required.includes("bankId"));
  assert.ok(schema.required.includes("title"));
  assert.ok(schema.required.includes("questions"));
  assert.ok(schema.$defs.question.required.includes("id"));
  assert.ok(schema.$defs.question.required.includes("type"));
  assert.ok(schema.$defs.question.required.includes("stem"));
  assert.ok(schema.$defs.question.required.includes("answer"));
}

function testOneTimeUiOnly() {
  const html = readText("index.html");
  const app = readText("app.js");
  assert.equal(html.includes('id="home-button"'), false);
  assert.equal(html.includes('id="home-wrong-notes"'), false);
  assert.equal(html.includes("샘플 행정법 문제은행"), false);
  assert.equal(html.includes("최근 풀이 현황"), false);
  assert.equal(html.includes("오답노트"), false);
  assert.equal(html.includes('id="bank-list"'), false);
  assert.equal(html.includes('id="catalog-status"'), false);
  assert.equal(app.includes("URL_STATE_WARNING_LENGTH"), false);
  assert.equal(app.includes("warnLongUrlState"), false);
  assert.equal(app.includes("브라우저의 길이 제한"), false);
  assert.ok(html.includes('id="local-json-input"'));
  assert.ok(html.includes('id="json-url-input"'));
  assert.ok(html.includes('id="direct-json-input"'));
}

testGrading();
testRichContent();
testChoiceShuffle();
testValidation();
testSampleDataFiles();
testJsonSourceUrlState();
testSessionStorageBankSource();
testSchemaFile();
testOneTimeUiOnly();

console.log("검증 완료");
