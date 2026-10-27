#!/usr/bin/env python3
"""content/index.json 및 모든 단원 파일을 검증한다. (표준 라이브러리만 사용)

사용법: python3 tools/validate.py
오류가 있으면 종료 코드 1, 경고만 있으면 0.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KINDS = {"fill_blank", "case", "mcq"}
BLANK_RE = re.compile(r"\{(빈칸|[㉠-㉭])\}")  # {빈칸}, {㉠}..{㉭}
BLOCK_TYPES = {"bullets", "table", "text", "note"}


def _load(path, errors):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        errors.append(f"파일이 없습니다: {path}")
    except json.JSONDecodeError as e:
        errors.append(f"JSON 파싱 오류 {path}: {e}")
    return None


def _check_items(items, where, errors):
    if not isinstance(items, list):
        errors.append(f"{where}: bullets.items 는 배열이어야 합니다")
        return
    for it in items:
        if isinstance(it, str):
            continue
        if isinstance(it, dict) and isinstance(it.get("text"), str):
            if "children" in it:
                _check_items(it["children"], where, errors)
        else:
            errors.append(f"{where}: 잘못된 bullets 항목 {str(it)[:40]!r}")


def _check_block(b, where, errors):
    t = b.get("type") if isinstance(b, dict) else None
    if t not in BLOCK_TYPES:
        errors.append(f"{where}: 알 수 없는 블록 type {t!r}")
    elif t == "bullets":
        _check_items(b.get("items"), where, errors)
    elif t == "table":
        h, rows = b.get("header"), b.get("rows")
        if not isinstance(h, list) or not isinstance(rows, list):
            errors.append(f"{where}: table 은 header/rows 배열이 필요합니다")
        else:
            for i, r in enumerate(rows):
                if not isinstance(r, list) or len(r) != len(h):
                    errors.append(f"{where}: table {i + 1}번째 행의 열 수가 header 와 다릅니다")
    elif t in ("text", "note"):
        if not isinstance(b.get("text"), str):
            errors.append(f"{where}: {t} 블록에 text 문자열이 필요합니다")


def _walk_sections(secs, ids, where, errors):
    if not isinstance(secs, list):
        errors.append(f"{where}: sections/summary 는 배열이어야 합니다")
        return
    for s in secs:
        sid = s.get("id") if isinstance(s, dict) else None
        if not isinstance(sid, str) or not sid:
            errors.append(f"{where}: 섹션 id 누락")
            continue
        if sid in ids:
            errors.append(f"{where}: 섹션 id 중복 {sid!r}")
        ids.add(sid)
        if not s.get("title"):
            errors.append(f"{where}: 섹션 {sid} 에 title 없음")
        for b in s.get("blocks", []):
            _check_block(b, f"{where} 섹션 {sid}", errors)
        _walk_sections(s.get("sections", []), ids, where, errors)


def validate_unit(path, expect_id, errors, warnings):
    name = str(path.relative_to(ROOT)) if path.is_absolute() and ROOT in path.parents else str(path)
    u = _load(path, errors)
    if u is None:
        return
    if u.get("id") != expect_id:
        errors.append(f"{name}: id {u.get('id')!r} 가 매니페스트의 {expect_id!r} 와 다릅니다")
    if not u.get("title"):
        errors.append(f"{name}: title 누락")
    if "sources" in u and not isinstance(u["sources"], list):
        errors.append(f"{name}: sources 는 배열이어야 합니다")
    sec_ids = set()
    if not u.get("summary"):
        errors.append(f"{name}: summary 가 비어 있습니다")
    _walk_sections(u.get("summary", []), sec_ids, name, errors)

    set_ids, q_ids = set(), set()
    for st in u.get("sets", []):
        sid = st.get("id")
        if not sid:
            errors.append(f"{name}: 문제 세트 id 누락")
            continue
        if sid in set_ids:
            errors.append(f"{name}: 세트 id 중복 {sid!r}")
        set_ids.add(sid)
        kind = st.get("kind")
        if kind not in KINDS:
            errors.append(f"{name} 세트 {sid}: kind {kind!r} 는 {sorted(KINDS)} 중 하나여야 합니다")
        if not st.get("title"):
            errors.append(f"{name} 세트 {sid}: title 누락")
        qs = st.get("questions", [])
        if not qs:
            errors.append(f"{name} 세트 {sid}: 문제가 없습니다")
        pos = {}
        for q in qs:
            qid = q.get("id")
            w = f"{name} 문제 {qid}"
            if not qid:
                errors.append(f"{name} 세트 {sid}: 문제 id 누락")
                continue
            if qid in q_ids:
                errors.append(f"{w}: 문제 id 중복")
            q_ids.add(qid)
            stem, ch, ans = q.get("stem"), q.get("choices"), q.get("answer")
            if not isinstance(stem, str) or not stem.strip():
                errors.append(f"{w}: stem 누락")
                stem = ""
            if not q.get("explanation"):
                errors.append(f"{w}: explanation 누락")
            if q.get("ref") not in sec_ids:
                errors.append(f"{w}: ref {q.get('ref')!r} 가 존재하는 섹션 id 가 아닙니다")
            if kind == "fill_blank" and not BLANK_RE.search(stem):
                errors.append(f"{w}: fill_blank 문제의 stem 에 {{빈칸}} 또는 {{㉠}} 표기가 없습니다")
            if not isinstance(ch, list) or not (2 <= len(ch) <= 6):
                errors.append(f"{w}: choices 는 2~6개 배열이어야 합니다")
                continue
            if len(set(ch)) != len(ch):
                errors.append(f"{w}: 중복된 선지가 있습니다")
            if not isinstance(ans, int) or isinstance(ans, bool) or not (1 <= ans <= len(ch)):
                errors.append(f"{w}: answer {ans!r} 는 1~{len(ch)} 범위의 정수여야 합니다")
                continue
            pos[ans] = pos.get(ans, 0) + 1
            correct = ch[ans - 1]
            if isinstance(correct, str) and correct and correct in stem:
                warnings.append(f"{w}: 정답 선지 {correct!r} 가 지문(stem)에 그대로 나옵니다")
        if qs and pos:
            n = sum(pos.values())
            top, cnt = max(pos.items(), key=lambda kv: kv[1])
            if cnt / n > 0.4:
                warnings.append(f"{name} 세트 {sid}: 정답 {top}번이 {cnt}/{n} ({cnt * 100 // n}%) 로 40% 초과")
    return len(q_ids)


def validate(root=ROOT):
    """(errors, warnings, stats) 반환."""
    errors, warnings = [], []
    content = Path(root) / "content"
    manifest = _load(content / "index.json", errors)
    units = questions = 0
    if manifest is not None:
        if not isinstance(manifest.get("courses"), list):
            errors.append("index.json: courses 배열이 없습니다")
        seen_c = set()
        for c in manifest.get("courses", []):
            cid = c.get("id")
            if not cid or not c.get("title"):
                errors.append(f"index.json: 과목에 id/title 누락 {c}")
                continue
            if cid in seen_c:
                errors.append(f"index.json: 과목 id 중복 {cid!r}")
            seen_c.add(cid)
            seen_u = set()
            for u in c.get("units", []):
                uid = u.get("id")
                if not uid or not u.get("title") or not u.get("file"):
                    errors.append(f"index.json: {cid} 단원에 id/title/file 누락 {u}")
                    continue
                if uid in seen_u:
                    errors.append(f"index.json: {cid} 단원 id 중복 {uid!r}")
                seen_u.add(uid)
                units += 1
                n = validate_unit(content / u["file"], uid, errors, warnings)
                questions += n or 0
    return errors, warnings, {"units": units, "questions": questions}


def report(errors, warnings, stats):
    print(f"검사한 단원 {stats['units']}개 / 문제 {stats['questions']}개")
    for w in warnings:
        print(f"  경고: {w}")
    for e in errors:
        print(f"  오류: {e}")
    print(f"결과: 오류 {len(errors)}건, 경고 {len(warnings)}건")
    return 1 if errors else 0


def main():
    sys.exit(report(*validate()))


if __name__ == "__main__":
    main()
