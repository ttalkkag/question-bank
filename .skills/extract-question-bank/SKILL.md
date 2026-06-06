---
name: extract-question-bank
description: Extract complete exam question banks from PDF/image sources into Markdown and JSON without dropping multiple-choice options. Use when Codex needs to convert Korean exam PDFs, scanned pages, lecture-data PDFs, or manually extracted question notes into a question bank and must preserve question stems, all choices, answers, explanations, source document/page, and validation evidence.
---

# Extract Question Bank

## Core Rule

Never create a final question bank from summarized notes alone. For a multiple-choice exam, every extracted question must include the original stem and exactly four choices unless the source visibly has a different count.

If the source choices cannot be read, mark the question `needs_review` in Markdown and do not emit it as a complete `single_choice` JSON item.

## Workflow

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

## Anti-Regression Checks

- Reject Markdown tables that contain only “문항 요약 / 정답 가안”. That format loses choices.
- Reject JSON with `originalQuestionType: "single_choice"` and no `choices`.
- Reject JSON tagged `원문선택지미수록`.
- Report unresolved source-reading issues separately instead of inventing choices.
- A table/circuit/diagram question whose JSON `stem` has no stimulus text is a regression: the stimulus line was dropped or never extracted (see the markdown validator's `!` warnings).
- Do not keep the source's marked answer without solving the question; a marked answer that contradicts the truth table/computation is a regression.
- A `- image:` value must pass the app's sanitizer (`data:image/...` or `http(s)` only); other schemes will not render. Do not paste oversized base64 (crop/downscale via `encode_image.py`).
