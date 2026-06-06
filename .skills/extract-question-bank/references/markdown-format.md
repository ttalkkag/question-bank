# Question Extraction Markdown Format

Use this exact structure for each source PDF Markdown file.

```md
# <document title>

- sourcePdf: <file name.pdf>
- questionCount: <number>
- extractionStatus: complete|partial

## 1. <full question stem>
진리표: X,Y가 00,01,10,11일 때 F는 0,1,1,0이다.
- 유형: single_choice
- 정답: ④
- 해설: <short explanation>
- sourcePage: 1
- status: complete

### 선택지
- ① <choice text>
- ② <choice text>
- ③ <choice text>
- ④ <choice text>
```

Rules:

- Do not use a summary table as the final extraction format.
- Keep the stem as close to the PDF as possible.
- Keep all choices even when only one choice is the answer.
- Use `status: needs_review` only when the source is unreadable, a diagram/table needs manual confirmation, or no option matches the correct result (defective source question).
- For formulas, use plain text/Markdown math notation consistently. Write Boolean NOT as a prime (`X̄ → X'`).

Stimulus lines (the key rule):

- A **stimulus** is any table/circuit/K-map/state-diagram/fill-in-the-blank/formula text the question depends on.
- Put stimulus on its own line(s) **between the `## N.` header and the first `- ` field bullet**. The build script folds these lines into the JSON `stem`; anything elsewhere is lost from the stem.
- Describe image-only diagrams faithfully in prose, e.g. `회로: 2x4 디코더의 출력 m0, m2, m3가 OR 게이트에 연결된다.` or `진리표: X,Y,Z가 000~111일 때 F는 0,1,0,1,0,0,1,1이다.`
- If a question references a stimulus from an earlier question ("위 진리표…"), and questions may be served independently, duplicate that stimulus line here too.

Tables and images (the app renders these — `app.js` `parseRichBlocks`):

- **Truth tables / K-maps** can be written as a real **Markdown table** in the stimulus area (or inside a choice). The app renders it as an HTML `<table>`:
  ```md
  ## 4. 다음 진리표를 갖는 게이트는?
  | X | Y | F |
  |---|---|---|
  | 0 | 0 | 0 |
  | 0 | 1 | 1 |
  | 1 | 0 | 1 |
  | 1 | 1 | 0 |
  - 유형: single_choice
  ...
  ```
  The table lines (before the first `- ` field) fold into the JSON `stem`; the app shows a styled table. Prose (`진리표: …`) still works and is fine for simple cases.
- **Diagrams/photos** go in an optional `- image:` field as a base64 data URI (or http(s) URL). Add `- imageAlt:` for the alt text:
  ```md
  - image: data:image/png;base64,iVBORw0KGgo...
  - imageAlt: 3x8 디코더와 OR 게이트 회로
  ```
  The builder maps these to `question.image` / `question.imageAlt`; the app renders an `<img>`. Only `data:image/...` and `http(s)` URLs are allowed (sanitized).
- Inline image in stem/choice also works via Markdown: `![회로](data:image/png;base64,...)`.
- Size note: base64 inflates ~33% (a small circuit ≈ 30–60 KB string). Keep images cropped/downscaled, or use an `http(s)` URL, so the bank JSON stays manageable.
