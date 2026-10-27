# Rigid Study Hub

강의 자료를 **형광펜 위주 요약**과 **5지선다 문제**로 정리해 두고, 브라우저에서 읽고 풀 수 있게 만든 정적 학습 사이트입니다.

- 사이트: https://yngboson.github.io/rigid-study-hub/

## 기능

**개념 리더**
- 형광펜 표시 / 가리기 모드 (가려 놓고 떠올려 보기)
- 목차(섹션 이동)와 검색

**문제풀이**
- 선지를 고르면 즉시 채점, 또는 시험 모드(끝난 뒤 한꺼번에 채점)
- 문제별 '개념 보기'(근거 섹션으로 이동) / '답지로' / '해설 보기' 버튼
- 오답노트, 북마크, 틀린 문제만 다시 풀기
- 키보드 단축키: 숫자 `1`–`5`로 선지 선택, `←` `→`로 문제 이동

진도(풀이 기록, 북마크, 오답)는 **사용 중인 브라우저에만 저장**됩니다. 서버로 전송되지 않으며, 브라우저 데이터를 지우면 사라집니다.

## 폴더 구조

```
index.html              # 사이트 진입점
assets/                 # CSS / JS
content/
  index.json            # 과목·단원 목록(매니페스트)
  <과목id>/<단원id>.json  # 단원 데이터(요약 + 문제 세트)
tools/
  import_highlight_quiz.py  # 스킬 출력 -> 단원 파일 변환·등록
  validate.py               # 콘텐츠 검증
docs/AUTHORING.md       # 데이터 형식·작성 원칙 (자료 추가 전 필독)
.github/workflows/pages.yml  # 검증 후 GitHub Pages 배포
```

## 새 단원 추가하기

1. **가져오기 스크립트 사용** (lecture-highlight-quiz 스킬이 만든 JSON이 있을 때)

   ```bash
   python3 tools/import_highlight_quiz.py SRC.json \
     --course psych --course-title 심리학 --unit midterm-2-6 \
     --title "2~6강 · 중간고사 범위" --tags 중간고사 \
     --sources "2강.pdf,3강.pdf" --date 2026-10-27
   ```

   변환 후 자동으로 검증까지 실행됩니다.

2. **직접 작성**: `content/<과목>/<단원>.json`을 쓰고 `content/index.json`에 항목을 추가한 뒤 `python3 tools/validate.py`로 확인합니다. 형식은 [docs/AUTHORING.md](docs/AUTHORING.md)를 참고하세요.

## 로컬에서 실행

```bash
python3 -m http.server
```

그 다음 http://localhost:8000 을 엽니다. (`file://`로 직접 열면 JSON을 불러오지 못합니다.)

## 저작권 안내

원본 강의 PDF·강의록은 저작권 때문에 **저장소에 올리지 않습니다.** 저장소에는 직접 정리한 요약과 만든 문제만 들어 있습니다.

## 배포

`main` 브랜치에 푸시하면 GitHub Actions가 콘텐츠를 검증한 뒤 GitHub Pages로 배포합니다. (저장소 Settings > Pages > Source 를 'GitHub Actions'로 설정해야 합니다.)
