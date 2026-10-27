#!/usr/bin/env python3
"""lecture-highlight-quiz 스킬 출력(JSON)을 사이트 단원 파일로 변환하고 매니페스트에 등록한다.

예)
  python3 tools/import_highlight_quiz.py SRC.json --course psych --course-title 심리학 \
      --unit midterm-2-6 --tags 중간고사 --sources a.pdf,b.pdf --date 2026-10-27
"""
import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate as V  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SET_DEFS = [("fill_blank", "fill", "빈칸 채우기"), ("case", "case", "사례 적용")]


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")


def convert(src, args):
    sets = []
    for key, prefix, label in SET_DEFS:
        for letter, qs in (src.get(key) or {}).items():
            sid = f"{prefix}-{letter}"
            questions = []
            for i, q in enumerate(qs, 1):
                questions.append({
                    "id": f"{sid}-{i:02d}",
                    "stem": q["stem"],
                    "choices": q["choices"],
                    "answer": q["answer"],
                    "explanation": q.get("explanation", ""),
                    "ref": str(q["ref"]),
                })
            sets.append({"id": sid, "title": f"{label} {letter}", "kind": key, "questions": questions})
    return {
        "id": args.unit,
        "title": args.title or src.get("title", args.unit),
        "subtitle": args.subtitle if args.subtitle is not None else src.get("subtitle", ""),
        "sources": [s.strip() for s in args.sources.split(",") if s.strip()] if args.sources else [],
        "summary": src["summary"],
        "sets": sets,
    }


def upsert_manifest(unit, args):
    path = ROOT / "content" / "index.json"
    if path.exists():
        with open(path, encoding="utf-8") as f:
            m = json.load(f)
    else:
        m = {"site": {"title": "Rigid Study Hub"}, "courses": []}
    m.setdefault("courses", [])
    course = next((c for c in m["courses"] if c["id"] == args.course), None)
    if course is None:
        course = {"id": args.course, "title": args.course_title or args.course, "units": []}
        m["courses"].append(course)
    elif args.course_title:
        course["title"] = args.course_title
    entry = {
        "id": unit["id"],
        "title": unit["title"],
        "subtitle": unit["subtitle"],
        "file": f"{args.course}/{unit['id']}.json",
        "updated": args.date,
        "tags": [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else [],
    }
    for i, u in enumerate(course["units"]):
        if u["id"] == unit["id"]:
            course["units"][i] = entry
            break
    else:
        course["units"].append(entry)
    dump(path, m)


def main():
    p = argparse.ArgumentParser(description="형광펜 퀴즈 JSON 을 단원 파일로 가져옵니다.")
    p.add_argument("src", help="스킬이 만든 JSON 파일")
    p.add_argument("--course", required=True, help="과목 id (예: psych)")
    p.add_argument("--course-title", help="과목 표시 이름 (새 과목일 때 필수 권장)")
    p.add_argument("--unit", required=True, help="단원 id (예: midterm-2-6)")
    p.add_argument("--title")
    p.add_argument("--subtitle")
    p.add_argument("--tags", help="쉼표 구분 (예: 중간고사,1부)")
    p.add_argument("--sources", help="원본 자료 파일명, 쉼표 구분")
    p.add_argument("--date", default=date.today().isoformat(), help="YYYY-MM-DD (기본: 오늘)")
    args = p.parse_args()

    try:
        with open(args.src, encoding="utf-8") as f:
            src = json.load(f)
        unit = convert(src, args)
    except (OSError, json.JSONDecodeError, KeyError) as e:
        print(f"오류: 입력 파일을 읽거나 변환하지 못했습니다: {e!r}", file=sys.stderr)
        sys.exit(1)

    out = ROOT / "content" / args.course / f"{args.unit}.json"
    dump(out, unit)
    upsert_manifest(unit, args)
    n = sum(len(s["questions"]) for s in unit["sets"])
    print(f"단원 파일 저장: {out.relative_to(ROOT)} (세트 {len(unit['sets'])}개, 문제 {n}개)")
    print("매니페스트 갱신: content/index.json")
    sys.exit(V.report(*V.validate()))


if __name__ == "__main__":
    main()
