# question-bank

정적 문제은행 웹앱입니다. GitHub Pages에서 `index.html`, `styles.css`, `app.js`, `public/data/*.json`만으로 동작합니다.

## 기능

- `public/data/catalog.json` 로드
- `catalog → manifest → questions-*` 순서 문제 로드
- 객관식/주관식(키워드 그룹) 즉시 채점
- 해설 표시 및 결과 요약
- 과목/단원/태그/유형/난이도 필터
- 랜덤 시작, 오답만 다시 풀기
- 로컬 JSON 파일 import
- 브라우저 진행기록 저장 (`qb:progress:*`, `qb:wrong-notes:*`)

## 실행

별도 빌드 없이 정적 서버에서 실행하면 됩니다.

```bash
cd /tmp/workspace/ttalkkag/question-bank
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173` 접속 후 사용하세요.
