# Question Generation Playbook (강의록 → 4지선다)

How to author grounded multiple-choice questions from study material. Pairs with the
SKILL.md "Generation Mode". The discipline is **grounding**: every keyed answer is
supported by a specific slide; distractors are invented but verifiably wrong.

## 1. Concept inventory (per lecture)

Before writing questions, list the testable units. One row per unit:

```
- [p.12] 정의: 교착상태 — 둘 이상의 프로세스가 서로 자원을 점유·대기하여 진행 불가
- [p.13] 특징: 교착상태 4대 필요조건 — 상호배제, 점유와 대기, 비선점, 환형 대기
- [p.15] 비교: 기아(starvation) vs 교착상태 — 차이
- [p.18] 절차: 은행원 알고리즘 안전상태 판정 단계
- [p.20] 계산: 자원할당 그래프/안전순서 예시
- [그림 p.10] 도식: 자원할당 그래프 (base64 후보)
```

Rules:
- The inventory comes from the slides, not memory. If it is not on a slide, it is out of scope.
- Mark figure-bearing units as base64 candidates.

## 2. Two questions per concept

For each unit, write **two** questions at different angles so they are not near-duplicates:

| Pair slot | Typical type | Example frame |
|---|---|---|
| A (recall) | 정의/특징 | "~의 정의로 옳은 것은?" / "~의 특징으로 옳지 않은 것은?" |
| B (use) | 비교/적용/절차/계산 | "~ 상황에서 옳은 것은?" / "다음 중 ~에 해당하는 것은?" / 계산 |

If a unit only supports one good question, write one strong item rather than a forced duplicate.

## 3. Question-type templates

- **정의형**: "다음 중 <개념>에 대한 설명으로 옳은 것은?" — 1 correct definition + 3 near-miss definitions (of sibling concepts).
- **특징/옳지 않은 것**: "<개념>의 특징으로 옳지 않은 것은?" — 3 true properties + 1 false (a property of a different concept, or a plausible-sounding falsehood the slide contradicts).
- **분류형**: "다음 중 <범주>에 속하는 것은?" / "속하지 않는 것은?".
- **비교형**: "<A>와 <B>의 차이로 옳은 것은?" — anchor on the slide's stated distinction.
- **절차/원리형**: "<알고리즘/메커니즘>의 동작으로 옳은 것은?" / 순서 나열.
- **적용/시나리오형**: short scenario → "이때 옳은 것은?" (still answerable from the slide's rule).
- **계산형** (스케줄링 평균대기시간, 페이지 폴트 수, 주소 변환 등): give the inputs in the stem (Markdown table if needed); the 4 options are numeric near-misses. Show the computation in 해설.

## 4. Distractor recipes

Good distractors are **plausible to someone who half-learned the material** and **clearly wrong to someone who learned it**:

- **Sibling term**: another real term from the same lecture (e.g., for 비선점 → 선점, 상호배제, 환형 대기).
- **Common confusion**: the classic mix-up (기아 vs 교착, 내부단편화 vs 외부단편화, 논리주소 vs 물리주소).
- **Scope/quantifier error**: true statement made false by "항상/모든/절대" or a swapped direction.
- **Numeric near-miss**: off-by-one, wrong formula step, swapped operands.

Distractor hygiene:
- 4 options mutually exclusive; exactly one defensible answer.
- Parallel length/grammar/specificity (don't make the correct one the longest/most detailed).
- No "위 보기 모두 옳다 / 정답 없음 / ①과 ②" position-referential options (the app shuffles choices).
- Don't reuse the exact slide sentence as the correct option while distractors are obviously off-topic (giveaway).

## 5. Difficulty rubric

- `난이도 1`: single-fact recall/definition.
- `난이도 2`: comparison, "옳지 않은 것", multi-fact understanding.
- `난이도 3`: application/scenario or calculation.

## 6. Markdown format for generated questions

Same section format as extraction, plus optional `- 난이도:` and `- tags:`. Ground with `sourcePage` = slide page; describe provenance in 해설.

```md
## 1. 다음 중 교착상태(deadlock)의 정의로 옳은 것은?
- 유형: single_choice
- 정답: ②
- 난이도: 1
- tags: 교착상태, 정의
- 해설: 강의 8강 p.12 — 교착상태는 둘 이상의 프로세스가 서로가 점유한 자원을 무한정 기다려 어느 쪽도 진행하지 못하는 상태다. ①은 기아, ③은 경쟁상태, ④는 문맥교환에 대한 설명이다.
- sourcePage: 12
- status: complete

### 선택지
- ① 우선순위가 낮아 자원을 계속 할당받지 못하는 상태
- ② 둘 이상의 프로세스가 서로 점유한 자원을 무한정 대기하여 진행하지 못하는 상태
- ③ 여러 프로세스의 동시 접근으로 결과가 실행 순서에 좌우되는 상태
- ④ 실행 중인 프로세스를 교체하며 상태를 저장·복원하는 동작
```

(`difficulty`/extra `tags` are optional; the build script maps them when present and is backward-compatible when absent.)

## 7. Anti-patterns (reject these)

- Facts not taught in the slides (외부 지식·트리비아).
- A question with two defensible answers, or none.
- Distractors that are off-topic or absurd (too easy) — or actually correct (broken).
- Two questions on one concept that are near-identical.
- "All of the above"/position-referential options.
- Keying without solving + WebSearch confirmation.
