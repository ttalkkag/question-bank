#!/usr/bin/env python3
"""다이어그램 크롭을 문제 MD의 `- image:` data URI 줄로 인코딩한다.

산문으로 충실히 옮기기 어려운 회로도·상태도·파형 같은 그림은 base64 data URI로 인라인하면
앱이 `<img>`로 렌더한다(app.js). 이 스크립트는 PNG/JPG(또는 그 일부 영역)를 적당히 축소·
인코딩해 바로 붙여 넣을 수 있는 MD 줄을 출력한다.

필요: Pillow (`pip install pillow`; PEP 668 환경은 venv 사용).

사용:
  python3 encode_image.py <image> [--crop x,y,w,h] [--max-width 900] [--alt "회로 설명"]

출력(표준출력):
  - image: data:image/png;base64,iVBORw0KGgo...
  - imageAlt: 회로 설명        # --alt를 준 경우에만

이 두 줄을 해당 문제의 `## N.` 헤더 아래(`- 유형:` 앞)에 붙여 넣으면 빌드 스크립트가
question.image / question.imageAlt 로 매핑한다.
"""
import argparse
import base64
import io
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow가 필요합니다. 예: /tmp/qbvenv/bin/python3 로 실행")

WARN_BYTES = 120_000  # base64 문자열이 이보다 크면 경고(축소/추가 크롭 권장).


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--crop", help="x,y,w,h (원본 픽셀 기준)")
    parser.add_argument("--max-width", type=int, default=900, help="이 폭보다 크면 축소(기본 900)")
    parser.add_argument("--alt", default="", help="imageAlt 텍스트")
    args = parser.parse_args(argv)

    im = Image.open(args.image)
    if args.crop:
        x, y, w, h = (int(v) for v in args.crop.split(","))
        im = im.crop((x, y, x + w, y + h))
    if im.width > args.max_width:
        ratio = args.max_width / im.width
        im = im.resize((args.max_width, max(1, round(im.height * ratio))))

    buffer = io.BytesIO()
    im.convert("RGB" if im.mode not in ("RGB", "L") else im.mode).save(
        buffer, format="PNG", optimize=True
    )
    b64 = base64.b64encode(buffer.getvalue()).decode()

    print(f"- image: data:image/png;base64,{b64}")
    if args.alt:
        print(f"- imageAlt: {args.alt}")

    if len(b64) > WARN_BYTES:
        print(
            f"# ⚠ base64 {len(b64):,}자 — 더 잘게 크롭하거나 --max-width를 줄여 용량을 낮추세요.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
