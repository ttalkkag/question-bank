#!/usr/bin/env python3
import re
import sys
from pathlib import Path

QUESTION_RE = re.compile(r"^##\s+(\d+)\.\s+(.+?)\s*$", re.MULTILINE)
CHOICE_RE = re.compile(r"^-\s+([①②③④])\s+(.+?)\s*$", re.MULTILINE)
ANSWER_RE = re.compile(r"^-\s*정답:\s*([①②③④])\s*$", re.MULTILINE)
ANSWER_TEXT_RE = re.compile(r"^-\s*정답:\s*(.+?)\s*$", re.MULTILINE)
STATUS_RE = re.compile(r"^-\s*status:\s*(\S+)\s*$", re.MULTILINE)
TYPE_RE = re.compile(r"^-\s*유형:\s*(\S+)\s*$", re.MULTILINE)
FIELD_RE = re.compile(r"^-\s*(유형|정답|해설|sourcePage|status)\s*:", re.MULTILINE)

# 헤더 stem이 이런 단어를 포함하면 진리표/그림 등 지문(stimulus)이 따라와야 한다.
# 지문이 없으면 JSON stem만으로 문항을 풀 수 없으므로 경고한다.
STIMULUS_KEYWORDS = (
    "진리표",
    "카노",
    "카르노",
    "회로도",
    "논리회로",
    "상태도",
    "다음 그림",
    "다음 회로",
    "도표",
    "블록도",
)


def sections(text):
    matches = list(QUESTION_RE.finditer(text))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        yield match.group(1), match.group(2).strip(), text[match.end():end]


def stimulus_lines(body):
    """헤더와 첫 필드/선택지 사이의 설명줄(진리표·회로·수식 등)."""
    lines = []
    for raw in body.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("- ") or line.startswith("#"):
            break
        lines.append(line)
    return lines


def validate_file(path):
    text = path.read_text(encoding="utf-8")
    errors = []
    warnings = []
    if "| 번호 |" in text and "보기/정답 가안" in text:
        errors.append("summary table format is not allowed as final extraction")

    found = False
    for number, stem, body in sections(text):
        found = True
        status_match = STATUS_RE.search(body)
        status = status_match.group(1) if status_match else "complete"
        type_match = TYPE_RE.search(body)
        qtype = type_match.group(1) if type_match else "single_choice"
        choices = CHOICE_RE.findall(body)
        answer = ANSWER_RE.search(body)
        answer_text = ANSWER_TEXT_RE.search(body)
        stim = stimulus_lines(body)

        if not stem:
            errors.append(f"q{number}: missing stem")
        if status == "complete" and qtype == "short_answer":
            if not (answer_text and answer_text.group(1).strip()):
                errors.append(f"q{number}: complete short_answer requires 정답 text")
        elif status == "complete":
            symbols = [symbol for symbol, _ in choices]
            if symbols != ["①", "②", "③", "④"]:
                errors.append(f"q{number}: complete single_choice requires choices ①-④ in order")
            if not answer:
                errors.append(f"q{number}: missing answer")
            elif answer.group(1) not in symbols:
                errors.append(f"q{number}: answer is not one of the choices")

            # 지문이 필요한 문항인데 stimulus 줄이 없으면 경고(JSON stem 불완전 가능성).
            if not stim and any(keyword in stem for keyword in STIMULUS_KEYWORDS):
                shared = stem.startswith("위") or "위 " in stem or "위의" in stem
                hint = (
                    "앞 문항과 공유된 '위 진리표/회로'를 참조 중일 수 있음. 문항을 독립 출제하려면 "
                    "해당 지문을 이 문항 헤더 아래에도 복제하라."
                    if shared
                    else "헤더 아래에 '진리표: ...' / '회로: ...' 지문 줄을 추가하라."
                )
                warnings.append(
                    f"q{number}: stem이 진리표/회로/그림을 가리키지만 지문(stimulus) 줄이 없음 "
                    f"→ JSON stem이 불완전할 수 있음. {hint}"
                )
    if not found:
        errors.append("no question sections found")
    return errors, warnings


def main(argv):
    if len(argv) < 2:
        print("usage: validate_question_markdown.py <markdown> [<markdown>...]", file=sys.stderr)
        return 2

    failed = False
    for raw in argv[1:]:
        path = Path(raw)
        errors, warnings = validate_file(path)
        if errors:
            failed = True
            print(f"{path}: FAIL")
            for error in errors:
                print(f"  - {error}")
        else:
            print(f"{path}: OK")
        for warning in warnings:
            print(f"  ! {warning}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
