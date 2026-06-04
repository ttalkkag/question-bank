# question-bank

GitHub Pages에서 동작하는 일회성 정적 문제은행 웹앱입니다. 서버 DB, 로그인, 관리자 기능 없이 사용자가 선택하거나 입력한 JSON을 브라우저에서만 읽어 문제 풀이에 사용합니다.

## 기능

- 로컬 JSON 파일 선택 및 브라우저 내부 파싱
- JSON URL 입력 및 브라우저 내부 파싱
- JSON 직접 입력 및 브라우저 내부 파싱
- 로컬 파일 JSON은 `sessionStorage`에 저장해 같은 탭 새로고침 후 복원
- JSON URL은 `#bankUrl=`로 저장해 링크 공유와 새로고침 복원
- 직접 입력 JSON은 `#bank=`에 encode해 링크 공유와 새로고침 복원
- 사지선다형/주관식 키워드형 문제 풀이
- 즉시 채점, 정답/오답 피드백, 해설 표시
- 과목/단원/태그/유형/난이도 필터
- 현재 세션 결과 요약과 틀린 문제 다시 풀기

## 데이터 형식

문제은행 JSON은 `bankId`, `title`, `questions`를 포함해야 합니다. 각 문제는 `id`, `type`, `stem`을 포함해야 합니다. 사지선다는 `answer` 배열과 4개의 `choices`가 필요하고, 주관식은 `answer`, `acceptedKeywords`, `answerText`, `grading.keywordGroups` 중 하나를 기준으로 채점할 수 있습니다. 기준 스키마는 `question_bank.schema.json`입니다.

파일 선택으로 불러온 JSON은 현재 탭의 `sessionStorage`에 저장합니다. JSON URL로 불러온 경우에는 현재 URL의 `#bankUrl=` 값으로 원본 URL을 저장합니다. 직접 입력으로 불러온 JSON은 현재 URL의 `#bank=` 값에 `encodeURIComponent(JSON.stringify(json))` 형태로 저장합니다.

풀이 기록과 오답 목록은 서버나 브라우저 저장소에 누적하지 않고 현재 풀이 세션에서만 사용합니다.

## 실행

```bash
npm test
npm run lint
npm run build
npm run serve
```

브라우저에서 `http://localhost:4173`에 접속합니다.

의존성 없이 정적 서버만 필요하면 다음 명령만 실행해도 됩니다.

```bash
python3 -m http.server 4173
```

## 배포

`main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 `npm test`와 `npm run build`를 실행하고, 생성된 `dist/`를 GitHub Pages artifact로 배포합니다. 저장소 Pages 설정의 source는 GitHub Actions로 지정하세요.
