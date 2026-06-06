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


FIELD_LINE = re.compile(r"^- (유형|정답|해설|sourcePage|status|image|imageAlt):", re.IGNORECASE)
CHOICE_MARKER = re.compile(r"^- ([①②③④])\s+(.*)$")


def parse_choices(section):
    """선택지를 파싱한다. 한 선택지가 여러 줄(예: 마크다운 표)일 수 있다.

    `- ① ...` 마커 줄에서 시작해 다음 마커/필드/헤더 전까지의 줄을 본문에 합친다.
    표 선택지는 마커 줄에 표의 첫 행을 두고 이후 행을 다음 줄에 잇는다.
    """
    idx = section.find("### 선택지")
    body = section[idx:] if idx != -1 else section
    parsed = []
    current = None
    for line in body.splitlines():
        marker = CHOICE_MARKER.match(line)
        if marker:
            if current:
                parsed.append(current)
            current = {"id": ANSWER_IDS[marker.group(1)], "lines": [marker.group(2).rstrip()]}
        elif current is not None:
            stripped = line.strip()
            if stripped.startswith("##") or FIELD_LINE.match(line):
                break
            current["lines"].append(line.rstrip())
    if current:
        parsed.append(current)

    choices = []
    for item in parsed:
        lines = item["lines"]
        while lines and not lines[-1].strip():
            lines.pop()
        choices.append({"id": item["id"], "text": "\n".join(lines).strip()})
    return choices


def source_code(source_name):
    match = re.match(r"(\d+)", source_name)
    if match:
        return match.group(1).zfill(3)
    return re.sub(r"[^a-zA-Z0-9]+", "-", Path(source_name).stem).strip("-").lower()


def parse_markdown(path, *, subject, id_prefix, source_type):
    text = path.read_text(encoding="utf-8")
    source_pdf = read_field(text, "sourcePdf") or path.with_suffix(".pdf").name
    source = source_code(source_pdf) or source_code(path.stem) or "main"
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

        question = {
            "id": f"{id_prefix}-{source}-q{number:03d}",
            "type": qtype,
            "subject": subject,
            "unit": Path(source_pdf).stem,
            "stem": stem,
            "explanation": read_field(section, "해설"),
            "tags": [subject, Path(source_pdf).stem],
            "source": {
                "sourceType": source_type,
                "sourceFile": source_pdf,
                "page": int(read_field(section, "sourcePage") or 0),
            },
            "status": "published",
        }

        if qtype == "single_choice":
            if len(choices) != 4:
                raise ValueError(f"{path}:{number}: complete single_choice requires 4 choices")
            if not answer_symbols:
                raise ValueError(f"{path}:{number}: complete single_choice requires answer")
            question["choices"] = choices
            question["answer"] = [ANSWER_IDS[symbol] for symbol in answer_symbols]
        elif qtype == "short_answer":
            answer_text = read_field(section, "정답")
            if not answer_text:
                raise ValueError(f"{path}:{number}: complete short_answer requires 정답")
            keywords = [k.strip() for k in read_field(section, "acceptedKeywords").split(",") if k.strip()]
            question["answer"] = [answer_text]
            if keywords:
                question["acceptedKeywords"] = keywords
        else:
            raise ValueError(f"{path}:{number}: unsupported type {qtype!r}")
        # 선택적 그림: `- image: data:image/...` (base64 data URI) 또는 http(s) URL.
        image = read_field(section, "image")
        if image:
            question["image"] = image
            image_alt = read_field(section, "imageAlt")
            if image_alt:
                question["imageAlt"] = image_alt
        questions.append(question)

    return questions, skipped


def build_bank(markdown_paths, *, bank_id, title, subject, description, id_prefix, source_type):
    questions = []
    skipped = []
    for path in markdown_paths:
        parsed_questions, parsed_skipped = parse_markdown(
            path, subject=subject, id_prefix=id_prefix, source_type=source_type
        )
        questions.extend(parsed_questions)
        skipped.extend(parsed_skipped)

    return {
        "schemaVersion": "1.0.0",
        "bankId": bank_id,
        "title": title,
        "version": "v1",
        "subject": subject,
        "description": description,
        "questions": questions,
    }, skipped


def main(argv):
    parser = argparse.ArgumentParser(description="Build question bank JSON from validated extraction Markdown files.")
    parser.add_argument("--output", required=True, type=Path)
    # 과목별 메타데이터(기본값은 디지털논리회로 — 기존 동작 보존).
    parser.add_argument("--bank-id", default="digital-logic-circuits")
    parser.add_argument("--title", default="디지털논리회로 문제은행")
    parser.add_argument("--subject", default="디지털논리회로")
    parser.add_argument("--id-prefix", default="digital-logic")
    parser.add_argument("--source-type", default="pdf")
    parser.add_argument(
        "--description",
        default="원문 PDF에서 선택지와 정답을 확인한 객관식 문항만 포함한 문제은행입니다. 원문 판독이 필요한 문항은 제외했습니다.",
    )
    parser.add_argument("markdown", nargs="+", type=Path)
    args = parser.parse_args(argv)

    bank, skipped = build_bank(
        sorted(args.markdown, key=lambda item: item.name),
        bank_id=args.bank_id,
        title=args.title,
        subject=args.subject,
        description=args.description,
        id_prefix=args.id_prefix,
        source_type=args.source_type,
    )
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
