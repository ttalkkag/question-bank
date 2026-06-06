#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def validate(path):
    bank = json.loads(path.read_text(encoding="utf-8"))
    errors = []
    questions = bank.get("questions")
    if not isinstance(questions, list):
        return ["questions must be an array"]

    for index, question in enumerate(questions, start=1):
        label = question.get("id") or f"questions[{index - 1}]"
        qtype = question.get("type")
        choices = question.get("choices")
        tags = question.get("tags") or []

        if "원문선택지미수록" in tags:
            errors.append(f"{label}: forbidden tag 원문선택지미수록")
        if question.get("originalQuestionType") == "single_choice" and not choices:
            errors.append(f"{label}: original single_choice is missing choices")
        if qtype == "single_choice":
            if not isinstance(choices, list) or len(choices) != 4:
                errors.append(f"{label}: single_choice requires exactly 4 choices")
                continue
            choice_ids = [choice.get("id") for choice in choices if isinstance(choice, dict)]
            if len(choice_ids) != 4 or any(not item for item in choice_ids):
                errors.append(f"{label}: every choice needs an id")
            for answer in question.get("answer") or []:
                if answer not in choice_ids:
                    errors.append(f"{label}: answer {answer!r} is not in choice ids {choice_ids!r}")

    return errors


def main(argv):
    if len(argv) != 2:
        print("usage: validate_question_bank_json.py <question-bank.json>", file=sys.stderr)
        return 2

    path = Path(argv[1])
    errors = validate(path)
    if errors:
        print(f"{path}: FAIL")
        for error in errors:
            print(f"  - {error}")
        return 1
    print(f"{path}: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
