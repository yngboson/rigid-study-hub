# Rigid Study Hub — 작업 규칙

사용자(yngboson)의 공부 자료 플랫폼. 사용자가 강의록·공부자료를 주면 Claude가 가공해 이 레포에 올리고, GitHub Pages(`https://yngboson.github.io/rigid-study-hub/`)에서 개념 리더·문제풀이로 본다.

## 새 자료를 올릴 때
1. 형광펜 강의록이면 `lecture-highlight-quiz` 스킬로 요약+문제를 만든 뒤 `content.json`(스킬 형식)을 얻는다.
2. `python3 tools/import_highlight_quiz.py SRC.json --course <과목id> --course-title <과목명> --unit <단원id> --title ... --subtitle ... --tags ... --sources ... --date YYYY-MM-DD`
3. `python3 tools/validate.py` 로 오류 0건 확인 (CI도 같은 검사를 한다).
4. 커밋 메시지 형식: `content(<과목id>): <내용>` 후 `main`에 push → Actions가 자동 배포.
5. 데이터 형식 상세: `docs/AUTHORING.md`.

## 지켜야 할 것
- **강의 원본 PDF는 절대 커밋하지 않는다.** 요약·문제(가공물)만 올린다. `sources`에는 파일명 문자열만 적는다.
- 한국어로 소통한다. 사용자는 아이패드로 보는 일이 많다 → 가볍게 유지, 큰 이미지·폰트 파일 추가 금지.
- 프런트(`index.html`, `assets/`)는 의존성 없는 순수 JS/CSS. 빌드 단계를 추가하지 않는다.
- 변경 후 로컬 확인: `python3 -m http.server` 후 `http://localhost:8000`.
- 진도·오답은 사용자 브라우저 localStorage(`rsh:v1`)에만 저장된다. 서버 저장 기능을 임의로 추가하지 않는다.
- GitHub GraphQL은 세션에서 막혀 있다. `gh api repos/...` REST만 쓴다.
- `assets/` 를 고치면 `index.html`의 `app.css?v=N`, `app.js?v=N`의 N을 올린다 (Pages 캐시 때문에 옛 파일이 남는 걸 방지).
