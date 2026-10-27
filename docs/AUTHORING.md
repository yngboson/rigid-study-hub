# 콘텐츠 작성 규격 (AUTHORING)

새 자료를 추가하기 전에 반드시 읽을 것. 검증기(`tools/validate.py`)는 이 문서의 규칙을 그대로 검사한다.

## 1. 파일 구성

```
content/index.json            # 매니페스트
content/<course>/<unit>.json  # 단원 파일
```

### 매니페스트 `content/index.json`

```json
{
  "site": {"title": "Rigid Study Hub"},
  "courses": [
    {"id": "psych", "title": "심리학", "units": [
      {"id": "midterm-2-6", "title": "...", "subtitle": "...",
       "file": "psych/midterm-2-6.json", "updated": "2026-10-27", "tags": ["중간고사"]}
    ]}
  ]
}
```

- 과목 `id`는 전체에서 유일, 단원 `id`는 과목 안에서 유일. 영문 소문자·숫자·하이픈 권장.
- `file`은 `content/` 기준 상대 경로. `updated`는 `YYYY-MM-DD`.
- 단원 순서 = 표시 순서(새 단원은 뒤에 추가).

### 단원 파일

```json
{
  "id": "midterm-2-6",
  "title": "...", "subtitle": "...",
  "sources": ["2강-심리학의 본질과 연구방법.pdf"],
  "summary": [ Section, ... ],
  "sets": [
    {"id": "fill-A", "title": "빈칸 채우기 A", "kind": "fill_blank", "questions": [ Question, ... ]}
  ]
}
```

- `id`는 매니페스트의 단원 `id`와 같아야 한다.
- `sources`는 원본 파일명 표기용일 뿐이며 PDF 자체는 올리지 않는다.

## 2. Section (요약)

```json
{"id": "1.2", "title": "연구방법의 분류", "blocks": [Block, ...], "sections": [Section, ...]}
```

- `id`는 **단원 전체에서 유일** (`"1"`, `"1.1"`, `"1.1.1"` 식). `sections`는 선택.
- 문제의 `ref`가 이 id를 가리킨다.

### Block 종류

| type | 필드 | 설명 |
|---|---|---|
| `bullets` | `items`: 문자열 또는 `{"text": "...", "children": [같은 형식...]}` | 불릿 목록(중첩 가능) |
| `table` | `caption`(선택), `header`: [문자열], `rows`: [[문자열]] | 모든 행의 열 수 = header 열 수 |
| `text` | `text` | 일반 문단 |
| `note` | `text` | 참고/주의 상자 |

## 3. Question / Set

```json
{"id": "fill-A-01", "stem": "...{빈칸}...", "choices": ["...", "..."],
 "answer": 3, "explanation": "...", "ref": "1.2"}
```

- `id`: 단원 안에서 유일. 관례 `<세트id>-NN` (2자리).
- `choices`: 2~6개(보통 5개), 중복 금지. `answer`: **1부터 시작**하는 정답 번호.
- `explanation`: 필수. `ref`: 존재하는 섹션 id (문자열).
- 세트 `kind`: `fill_blank`(빈칸 채우기), `case`(사례 적용), `mcq`(일반). `fill_blank`의 stem에는 `{빈칸}` 또는 `{㉠}`가 반드시 있어야 한다.
- 세트 id 관례: `fill-A`, `fill-B`, `case-A`, `case-B` (제목 `빈칸 채우기 A`, `사례 적용 A`).

## 4. 인라인 마크업 (모든 텍스트 필드)

| 표기 | 의미 |
|---|---|
| `==글==` | 형광펜 (리더에서 가리기 모드 대상) |
| `**글**` | 굵게 |
| `{빈칸}` | 빈칸 |
| `{㉠}` ~ `{㉭}` | 번호 매긴 빈칸 (한 지문에 여러 개) |
| `\n` | 줄바꿈 |

## 5. 작성 원칙

1. **요약은 형광펜 위주**: 시험에 나올 핵심어·정의를 `==...==`로 표시하고 문장은 압축한다. 강의록을 그대로 옮기지 않는다.
2. **문제 보기는 같은 범주의 형제 개념**: 오답 선지는 정답과 같은 층위(같은 이론의 다른 단계, 같은 분류의 다른 항목)에서 고른다. 뻔히 틀린 선지 금지.
3. **정답 위치 균등**: 세트 안에서 1~5번이 고르게 나오게 한다. 한 번호가 40%를 넘으면 경고.
4. **사례 지문에 정답 단어 금지**: `case` 세트의 지문에 정답 개념의 이름을 쓰지 않는다. 정답 선지 문구가 stem에 그대로 있으면 경고가 뜬다.
5. **`ref`는 근거 섹션**: 해설 근거가 되는 가장 구체적인(깊은) 섹션 id를 가리킨다. '개념 보기' 버튼이 이 섹션으로 이동한다.
6. 원본 PDF·이미지는 저장소에 넣지 않는다(저작권).

## 6. 단원 추가 명령

스킬 출력 JSON이 있을 때:

```bash
python3 tools/import_highlight_quiz.py SRC.json \
  --course psych --course-title 심리학 --unit midterm-2-6 \
  [--title "..."] [--subtitle "..."] [--tags 중간고사,1부] \
  [--sources a.pdf,b.pdf] [--date YYYY-MM-DD]
```

- 입력 형식: `{"title","subtitle","summary":[Section...],"fill_blank":{"A":[q...],"B":[...]},"case":{"A":[...],"B":[...]}}` (q에는 id 없음 — 자동 부여).
- 같은 `--unit` id가 이미 있으면 그 항목을 교체하고, 없으면 뒤에 추가한다. 과목이 없으면 새로 만든다.

직접 작성했다면 매니페스트에 항목을 추가한 뒤:

```bash
python3 tools/validate.py
```

오류(종료 코드 1)는 반드시 고치고, 경고는 의도한 것인지 확인한다. 배포 워크플로도 같은 검증을 먼저 돌린다.

## 7. 커밋 메시지 관례

```
content(<과목id>): <내용>
```

예: `content(psych): 2~6강 중간고사 범위 추가`, `content(psych): 3강 문제 해설 보강`. 도구·사이트 변경은 `tools:`, `site:`, `docs:` 접두어를 쓴다.
