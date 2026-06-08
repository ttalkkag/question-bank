---
name: extract-question-bank
description: Build Korean question banks (Markdown → JSON) by EXTRACTING existing exam questions from PDFs/images, or by GENERATING new multiple-choice questions from lecture notes/study material. Use when converting Korean exam PDFs, scanned pages, or lecture-data into a question bank (preserving stems, all choices, answers, explanations, source page, validation), and also when generating grounded 4-choice questions with distractors from 강의록/slides.
---

# Question Bank (Extract or Generate)

This skill has two modes that share the same build/validate/render tooling and the same Markdown→JSON format:

- **Mode A — Extraction**: faithfully transcribe questions that already exist in a source (exam PDFs, scanned pages). See "Core Rule (Extraction)" + "Workflow (Extraction)".
- **Mode B — Generation**: author new questions from study material that contains no questions (강의록/lecture slides, textbooks). See "Generation Mode". Distractors are created, but every answer must be grounded in the source.

Pick the mode by the source: if the source already contains questions+choices, extract; if it is explanatory material, generate.

## Core Rule (Extraction)

Never create a final question bank from summarized notes alone. For a multiple-choice exam, every extracted question must include the original stem and exactly four choices unless the source visibly has a different count.

If the source choices cannot be read, mark the question `needs_review` in Markdown and do not emit it as a complete `single_choice` JSON item.

## Workflow (Extraction)

1. Inventory sources.
   - Pair each PDF with the same-name Markdown only as a prior attempt or aid.
   - Treat the PDF/page image as the source of truth.

2. Render PDF pages to images before extraction.
   - Prefer the helper: `python3 .skills/extract-question-bank/scripts/render_crops.py <pdf>` (needs Pillow; on PEP 668 macOS use a venv, e.g. `/tmp/qbvenv/bin/python3`). It renders at **300 dpi** and writes left/right × top/bottom column crops.
   - 180 dpi full pages are too small to read Boolean **overbars (보수선)**, subscripts (진법 ₁₀/₁₆/₈), and truth-table values reliably. Always read the column crops, and re-crop tighter at the question level when a formula or diagram is ambiguous.
   - Use `pdftotext` only as a secondary aid. Korean two-column exam PDFs are usually image-only, so `pdftotext` returns almost nothing — do not rely on it for final stems or choices.
   - On macOS, `swift .skills/extract-question-bank/scripts/vision_ocr.swift <image>` gives OCR text as an aid; always verify against the page image.

3. Extract into document-level Markdown using the required format in `references/markdown-format.md`.
   - One Markdown file per PDF. One section per question. Include all `①`-`④` choice lines, answer, explanation, source PDF, source page, and status.
   - **Stimulus lines** (truth tables, circuits, K-maps, state diagrams, fill-in-the-blank passages, formulas like `F=Σm(...)`) go on their own line(s) **directly under the `## N.` header and before the field bullets**. The build script folds these into the JSON `stem`, so a table/circuit question is unanswerable from JSON if its stimulus is missing.
   - Transcribe Boolean NOT as a prime: `X̄ → X'`. Keep subscripts literal (`6.25₁₀`, `E.4₁₆`).
   - **Choose the representation by fidelity** (the app renders all three — `app.js` `parseRichBlocks`):
     - Truth tables / K-maps → write a real **Markdown table** in the stimulus area (folds into the stem; renders as `<table>`). Prose (`진리표: …`) is an acceptable fallback for tiny/simple tables.
     - Circuit/state/waveform diagrams that prose cannot capture faithfully → inline the cropped image as a **base64 `- image:` field**. Generate the paste-ready line with `python3 .skills/extract-question-bank/scripts/encode_image.py <image> --crop x,y,w,h --max-width 600 --alt "회로 설명"`. Keep crops tight and downscaled (a circuit ≈ 30–60 KB); for many/large images prefer an `http(s)` URL.
     - Simple cases → prose stimulus line as before.
     - See `references/markdown-format.md` for exact syntax.
   - **Shared stimulus**: when a question says "위 진리표/회로…" referring to a table given on an earlier question, the JSON stem will not carry that table. If questions may be filtered/shuffled independently (this app does), duplicate the shared stimulus line under each dependent question.

4. Verify answers and explanations — do not trust the source's marked answer blindly.
   - **Solve every question yourself** (Boolean algebra, radix conversion, K-maps, flip-flops, counters, MUX/decoder sizing). If your result disagrees with the marked answer, re-check carefully and correct the Markdown.
   - **Cross-verify concept/definition questions with WebSearch** (e.g., decoder/encoder/MUX definitions, parity, flip-flop characteristics). WebSearch any computational answer you are not certain about.
   - **Defective source question** (no option matches the correct result): keep `status: needs_review` and explain why in 해설. Do not invent or force an answer.
   - **Printed typo in an option** (e.g., a minterm index `8` for 3 variables): keep the printed text faithful and note the typo + intended answer in 해설.

5. Validate Markdown before JSON.
   - Run `python3 .skills/extract-question-bank/scripts/validate_question_markdown.py var/lecture-data/*.md`.
   - Fix every `FAIL`. Review every `!` warning — a "지문 줄 없음" warning means a table/circuit question is missing its stimulus (or is a shared-stimulus reference that should be duplicated).

6. Generate JSON only from validated Markdown.
   - `python3 .skills/extract-question-bank/scripts/build_question_bank_json.py --output var/디지털논리회로.json var/lecture-data/*.md`.
   - The builder maps choices to `A`-`D`, answer symbols `①`-`④` to `A`-`D`, folds stimulus lines into the stem, and skips `needs_review` questions (reported at the end).

7. Validate JSON.
   - `python3 .skills/extract-question-bank/scripts/validate_question_bank_json.py var/디지털논리회로.json`.
   - Then run project checks: `npm test` and `npm run lint`. Also validate with the app's own validator: `node -e "const c=require('./app.js');console.log(c.validateBank(require('./var/디지털논리회로.json')).valid)"`.

8. Browser-test the generated JSON in the app.
   - Serve (`python3 -m http.server 4173`), load the JSON via the URL field, click 전체 풀기.
   - Confirm a question shows four choices, a **table/circuit question's stem includes its stimulus text**, and grading shows 정답/오답 + 해설.
   - If you used Markdown tables or `- image:` fields, confirm they render as an `<table>` / `<img>` (not raw `| … |` text or a giant base64 string).

## Generation Mode (강의록 → 새 문제 생성)

Use this when the source is study material with **no questions** (lecture slides/강의록, textbook chapters). You author the questions and distractors; the discipline is **grounding**, not transcription.

### Core Rule (Generation)

Every generated question must be answerable **from the source material**. The keyed answer must be directly supported by a specific slide/page (record it in `sourcePage` and reference the lecture in `unit`/tags). Never introduce facts the material does not teach. Distractors are plausible but must be **verifiably wrong** for that question. When unsure the source supports a claim, drop the question — do not guess.

See `references/question-generation-playbook.md` for question-type templates, distractor recipes, and the grounding/difficulty rubric.

### Workflow (Generation)

1. Analyze content per lecture.
   - Extract text: `pdftotext -layout "<강의>.pdf" -` (lecture PDFs are usually text-selectable). Render diagram pages for figures: `pdftoppm -png -r 150 -f <p> -l <p> "<강의>.pdf" <out>`.
   - Note that slide decks often "build" one idea across several pages — read a section as a whole, not page-by-page.

2. Build a concept inventory.
   - List every **testable knowledge unit** in the lecture: definitions, classifications, properties/특징, comparisons, procedures/원리, numeric/계산 facts, and figures. Record the source page for each.
   - This inventory — not your memory — is the question source. If a concept is not in the slides, it is out of scope.

3. Generate questions — **two per concept unit**, no overall cap (cover every testable concept; count varies per lecture).
   - Vary the angle/type across the two (e.g., one recall "~란?/특징으로 옳은 것은?" and one application/비교/"옳지 않은 것은?"/계산). Avoid two near-identical items.
   - All `single_choice` (4 choices) per project convention. Ground each in a slide (`sourcePage`).

4. Generate choices (1 correct + 3 distractors).
   - Correct option: faithful to the slide (verbatim or tight paraphrase).
   - Distractors: real terms from the **same lecture/domain** or common confusions; clearly wrong; parallel in length/form; mutually exclusive; no "위 모두/정답 없음"; vary the correct position across questions (the app also shuffles at runtime).

5. Verify before keying.
   - Solve it yourself; confirm exactly one option is correct and it is supported by the slide. **WebSearch** to confirm the concept and that distractors are wrong.
   - Dedup against other questions; tag difficulty (`- 난이도: 1|2|3`) and topic (`- tags: 단원,키워드`).

6. Figures.
   - Simple tables/charts → Markdown table. Diagrams that prose cannot capture faithfully (network topology, scheduling Gantt, memory/state diagrams) → crop the slide and inline as base64 via `encode_image.py` (`- image:`), per the Extraction step-3 rules.

7. Build / validate / browser-test — reuse the Extraction pipeline (steps 5–8):
   - `build_question_bank_json.py --subject 운영체제 --id-prefix os --source-type lecture --bank-id operating-systems --title "운영체제 문제은행" <md...>`, then JSON validation, `npm test`/`lint`, and a browser render check.

### Anti-Hallucination Checks (Generation)

- A question whose answer is not on a cited slide is invalid — cut it or fix the grounding.
- If you cannot point to the slide that makes the keyed option correct (and the others wrong), do not ship the question.
- Do not let a distractor be arguably correct; if two options can be defended, rewrite.

## Anti-Regression Checks

- Reject Markdown tables that contain only “문항 요약 / 정답 가안”. That format loses choices.
- Reject JSON with `originalQuestionType: "single_choice"` and no `choices`.
- Reject JSON tagged `원문선택지미수록`.
- Report unresolved source-reading issues separately instead of inventing choices.
- A table/circuit/diagram question whose JSON `stem` has no stimulus text is a regression: the stimulus line was dropped or never extracted (see the markdown validator's `!` warnings).
- Do not keep the source's marked answer without solving the question; a marked answer that contradicts the truth table/computation is a regression.
- A `- image:` value must pass the app's sanitizer (`data:image/...` or `http(s)` only); other schemes will not render. Do not paste oversized base64 (crop/downscale via `encode_image.py`).
