#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path


ANSWER_IDS = {
    "①": "A",
    "②": "B",
    "③": "C",
    "④": "D",
}


def read_field(section, name):
    match = re.search(rf"^- {re.escape(name)}:\s*(.*)$", section, re.MULTILINE)
    return match.group(1).strip() if match else ""


def parse_choices(section):
    choices = []
    for symbol, text in re.findall(r"^- ([①②③④])\s+(.+)$", section, re.MULTILINE):
        choices.append({"id": ANSWER_IDS[symbol], "text": text.strip()})
    return choices


def source_code(source_pdf):
    match = re.match(r"(\d+)", source_pdf)
    if match:
        return match.group(1).zfill(3)
    return re.sub(r"[^a-zA-Z0-9]+", "-", Path(source_pdf).stem).strip("-").lower()


def parse_markdown(path):
    text = path.read_text(encoding="utf-8")
    source_pdf = read_field(text, "sourcePdf") or path.with_suffix(".pdf").name
    source = source_code(source_pdf)
    pattern = re.compile(r"^##\s+(\d+)\.\s+(.+)$", re.MULTILINE)
    matches = list(pattern.finditer(text))
    questions = []
    skipped = []

    for index, match in enumerate(matches):
        number = int(match.group(1))
        stem = match.group(2).strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        section = text[start:end]

        # 헤더(`## N.`)와 첫 필드/선택지 사이의 설명줄(진리표·회로·수식·빈칸 지문 등)을
        # stem에 접합한다. 그렇지 않으면 JSON stem만으로는 문항을 풀 수 없다.
        stimulus = []
        for raw_line in section.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("- ") or line.startswith("#"):
                break
            stimulus.append(line)
        if stimulus:
            stem = stem + "\n" + "\n".join(stimulus)

        status = read_field(section, "status")
        qtype = read_field(section, "유형")
        answer_symbols = re.findall(r"[①②③④]", read_field(section, "정답"))
        choices = parse_choices(section)

        if status != "complete":
            skipped.append((source_pdf, number, status or "missing_status"))
            continue
        if qtype != "single_choice":
            raise ValueError(f"{path}:{number}: unsupported type {qtype!r}")
        if len(choices) != 4:
            raise ValueError(f"{path}:{number}: complete single_choice requires 4 choices")
        if not answer_symbols:
            raise ValueError(f"{path}:{number}: complete single_choice requires answer")

        question = {
            "id": f"digital-logic-{source}-q{number:03d}",
            "type": "single_choice",
            "subject": "디지털논리회로",
            "unit": Path(source_pdf).stem,
            "stem": stem,
            "choices": choices,
            "answer": [ANSWER_IDS[symbol] for symbol in answer_symbols],
            "explanation": read_field(section, "해설"),
            "tags": ["디지털논리회로", Path(source_pdf).stem],
            "source": {
                "sourceType": "pdf",
                "sourceFile": source_pdf,
                "page": int(read_field(section, "sourcePage") or 0),
            },
            "status": "published",
        }
        # 선택적 그림: `- image: data:image/...` (base64 data URI) 또는 http(s) URL.
        image = read_field(section, "image")
        if image:
            question["image"] = image
            image_alt = read_field(section, "imageAlt")
            if image_alt:
                question["imageAlt"] = image_alt
        questions.append(question)

    return questions, skipped


def build_bank(markdown_paths):
    questions = []
    skipped = []
    for path in markdown_paths:
        parsed_questions, parsed_skipped = parse_markdown(path)
        questions.extend(parsed_questions)
        skipped.extend(parsed_skipped)

    return {
        "schemaVersion": "1.0.0",
        "bankId": "digital-logic-circuits",
        "title": "디지털논리회로 문제은행",
        "version": "v1",
        "subject": "디지털논리회로",
        "description": "원문 PDF에서 선택지와 정답을 확인한 객관식 문항만 포함한 문제은행입니다. 원문 판독이 필요한 문항은 제외했습니다.",
        "questions": questions,
    }, skipped


def main(argv):
    parser = argparse.ArgumentParser(description="Build question bank JSON from validated extraction Markdown files.")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("markdown", nargs="+", type=Path)
    args = parser.parse_args(argv)

    bank, skipped = build_bank(sorted(args.markdown, key=lambda item: item.name))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.output} with {len(bank['questions'])} questions")
    if skipped:
        print(f"skipped {len(skipped)} needs-review questions:")
        for source_pdf, number, status in skipped:
            print(f"  - {source_pdf} #{number}: {status}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
