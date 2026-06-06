#!/usr/bin/env python3
"""PDF 시험지를 고해상도로 렌더링하고 2단 레이아웃을 컬럼/사분면으로 크롭한다.

한국어 2단 시험 PDF는 180dpi 전체 페이지로는 부울식의 보수선(overbar)·아래첨자·
진리표 값을 신뢰성 있게 판독하기 어렵다. 이 스크립트는 300dpi로 렌더링한 뒤 각
페이지를 좌/우 컬럼 × 상/하로 잘라 판독 가능한 크롭을 만든다.

필요 도구:
  - pdftoppm (poppler)
  - Pillow (`pip install pillow`; PEP 668 환경이면 `python3 -m venv .venv && .venv/bin/pip install pillow`)

사용:
  python3 render_crops.py <pdf> [--dpi 300] [--out <dir>]

출력: <out>/p-<page>.png (전체)  및  <out>/p<page>-<Lt|Lb|Rt|Rb>.png (크롭)
"""
import argparse
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - 안내용
    sys.exit(
        "Pillow가 필요합니다. 예: python3 -m venv /tmp/qbvenv && "
        "/tmp/qbvenv/bin/pip install pillow 후 /tmp/qbvenv/bin/python3 로 실행"
    )


def render(pdf: Path, dpi: int, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    prefix = out / "p"
    subprocess.run(
        ["pdftoppm", "-png", "-r", str(dpi), str(pdf), str(prefix)],
        check=True,
    )
    pages = sorted(out.glob("p-*.png"))
    if not pages:
        sys.exit(f"렌더링 실패: {pdf}")
    return pages


def crop_columns(page_png: Path):
    im = Image.open(page_png)
    width, height = im.size
    mid = width // 2
    # 머리글(상단)·꼬리글(하단) 여백은 적당히 포함해 경계 문항이 잘리지 않게 한다.
    boxes = {
        "Lt": (0, int(height * 0.07), mid + 30, int(height * 0.55)),
        "Lb": (0, int(height * 0.53), mid + 30, height),
        "Rt": (mid - 30, int(height * 0.07), width, int(height * 0.55)),
        "Rb": (mid - 30, int(height * 0.53), width, height),
    }
    stem = page_png.stem  # p-1
    page_no = stem.split("-")[-1]
    for name, box in boxes.items():
        im.crop(box).save(page_png.with_name(f"p{page_no}-{name}.png"))


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--dpi", type=int, default=300)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args(argv)

    out = args.out or args.pdf.parent / "_render" / args.pdf.stem
    pages = render(args.pdf, args.dpi, out)
    for page in pages:
        crop_columns(page)
    print(f"rendered {len(pages)} page(s) → {out} (full + Lt/Lb/Rt/Rb crops)")
    print("판독이 모호하면 해당 영역을 더 잘게 다시 크롭해 보수선/첨자를 확인하라.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
