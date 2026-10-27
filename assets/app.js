// Rigid Study Hub — 해시 라우터 기반 단일 페이지 앱 (의존성 없음)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const main = $('#main');

/* ───────── 저장소 (진도는 이 브라우저에만 저장) ───────── */
const KEY = 'rsh:v1';
const defaults = { answers: {}, flags: {}, retry: {}, last: null, settings: { theme: 'auto', fs: 1, instant: true, shuffle: false } };
let store;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function normalize(raw) {
  const s = structuredClone(defaults); if (!isObj(raw)) return s;
  for (const k of ['answers', 'flags', 'retry']) if (isObj(raw[k])) s[k] = raw[k];
  if (isObj(raw.last)) s.last = raw.last;
  if (isObj(raw.settings)) s.settings = { ...defaults.settings, ...raw.settings };
  return s;
}
try { store = normalize(JSON.parse(localStorage.getItem(KEY) || '{}')); }
catch { store = structuredClone(defaults); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };
const ansOf = (u, qid) => store.answers[`${u}|${qid}`];
const setAns = (u, qid, v) => { if (v == null) delete store.answers[`${u}|${qid}`]; else store.answers[`${u}|${qid}`] = v; save(); };

/* ───────── 텍스트 처리 ───────── */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function md(text) {
  return esc(text)
    .replace(/==(.+?)==/g, '<mark>$1</mark>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\{빈칸\}/g, '<span class="blank" aria-label="빈칸"></span>')
    .replace(/\{([㉠-㉭])\}/g, '<span class="blank lab">$1</span>')
    .replace(/\n/g, '<br>');
}
const plain = s => String(s).replace(/==|\*\*/g, '');
const CIRC = ['①', '②', '③', '④', '⑤', '⑥'];
const pad = n => String(n).padStart(2, '0');
const kindLabel = { fill_blank: '빈칸 채우기', case: '사례 적용', mcq: '문제' };

/* ───────── 데이터 로딩 ───────── */
let manifest = null; const unitCache = new Map();
async function getManifest() {
  if (!manifest) { const r = await fetch('content/index.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('목록을 불러오지 못했습니다'); manifest = await r.json(); }
  return manifest;
}
async function getUnit(cid, uid) {
  const key = `${cid}/${uid}`;
  if (unitCache.has(key)) return unitCache.get(key);
  const m = await getManifest();
  const c = m.courses.find(x => x.id === cid); const meta = c?.units.find(x => x.id === uid);
  if (!meta) throw new Error('없는 단원입니다');
  const r = await fetch('content/' + meta.file, { cache: 'no-cache' });
  if (!r.ok) throw new Error('단원 파일을 불러오지 못했습니다');
  const data = await r.json();
  const sections = new Map(); const flat = [];
  (function walk(list, depth, parent) { for (const s of list) { const o = { ...s, depth, parent }; sections.set(String(s.id), o); flat.push(o); walk(s.sections || [], depth + 1, o); } })(data.summary, 0, null);
  const qs = new Map(); let i = 0;
  for (const set of data.sets) { set.questions.forEach((q, n) => { q._set = set; q._n = n + 1; q._i = i++; qs.set(q.id, q); }); }
  const u = { cid, uid, meta, data, sections, flat, qs, key: key, course: c };
  unitCache.set(key, u); return u;
}

/* ───────── 설정 / 토스트 ───────── */
function applySettings() {
  const s = store.settings, root = document.documentElement;
  if (s.theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', s.theme);
  root.style.setProperty('--fs', s.fs);
}
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800); }

/* ───────── 시트(개념 서랍) ───────── */
let lastFocus = null;
const bgLock = on => { document.documentElement.style.overflow = on ? 'hidden' : ''; for (const el of [$('.topbar'), main]) if (el) el.inert = on; };
function openSheet(title, html) {
  if ($('#sheet').hidden) lastFocus = document.activeElement;
  $('#sheetTitle').textContent = title; $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false; $('#sheet .sheet-panel').scrollTop = 0; $('#sheetBody').scrollTop = 0;
  bgLock(true);
  $('#sheet [data-close].icon-btn').focus();
}
function closeSheet(restore = true) { $('#sheet').hidden = true; bgLock(false); if (restore) lastFocus?.focus?.(); }
$('#sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });

/* ───────── 렌더링 조각 ───────── */
function renderItems(items) {
  return '<ul>' + items.map(it => typeof it === 'string' ? `<li>${md(it)}</li>`
    : `<li>${md(it.text)}${it.children?.length ? renderItems(it.children) : ''}</li>`).join('') + '</ul>';
}
function renderBlock(b) {
  switch (b.type) {
    case 'bullets': return renderItems(b.items || []);
    case 'text': return `<p>${md(b.text)}</p>`;
    case 'note': return `<div class="note">${md(b.text)}</div>`;
    case 'table': return `<div class="tbl"><table>${b.caption ? `<caption>${md(b.caption)}</caption>` : ''}<thead><tr>${b.header.map(h => `<th>${md(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${md(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    default: return '';
  }
}
function qsForSection(u, sid) { return [...u.qs.values()].filter(q => String(q.ref) === String(sid) || String(q.ref).startsWith(sid + '.')); }
function badOf(u, sid) { let n = 0; for (const q of qsForSection(u, sid)) { const a = ansOf(u.key, q.id); if (a != null && a !== q.answer) n++; } return n; }
const weakBadge = (n, cls = '') => n ? `<span class="weak ${n >= 2 ? 'hot' : ''} ${cls}" title="이 개념 관련 오답 ${n}개">${n >= 2 ? '약점 ' : ''}오답 ${n}</span>` : '';
function renderSection(u, s, depth = 0, withBtn = true) {
  const tag = depth === 0 ? 'h2' : depth === 1 ? 'h3' : 'h4';
  const nq = withBtn ? qsForSection(u, s.id).filter(q => String(q.ref) === String(s.id)).length : 0;
  const head = `<${tag}><span class="sec-id">§${esc(s.id)}</span> <span>${esc(s.title)}</span>${weakBadge(badOf(u, s.id))}${nq ? `<a class="btn sm ghost sec-qs" href="#/${u.cid}/${u.uid}/quiz?ref=${encodeURIComponent(s.id)}">관련 문제 ${nq}개</a>` : ''}</${tag}>`;
  return `<section id="s-${esc(s.id)}" data-sid="${esc(s.id)}">${head}${(s.blocks || []).map(renderBlock).join('')}${(s.sections || []).map(c => renderSection(u, c, depth + 1, withBtn)).join('')}</section>`;
}
function conceptHTML(u, sid) {
  const s = u.sections.get(String(sid)); if (!s) return '<p class="empty">연결된 개념을 찾지 못했습니다.</p>';
  const trail = []; for (let p = s.parent; p; p = p.parent) trail.unshift(`§${p.id} ${p.title}`);
  return `<div class="doc">${trail.length ? `<p class="kbd">${esc(trail.join(' › '))}</p>` : ''}${renderSection(u, s, 1, false).replace(/<h3>/, '<h3>')}
  <div class="sheet-foot"><a class="btn primary" href="#/${u.cid}/${u.uid}/read?s=${encodeURIComponent(s.id)}" data-close>리더에서 이어서 보기</a></div></div>`;
}

/* ───────── 상단 크럼 ───────── */
function setCrumbs(parts) {
  $('#crumbs').innerHTML = parts.map((p, i) => (i ? '<span class="sep">/</span>' : '') + (p.href ? `<a href="${p.href}">${esc(p.t)}</a>` : `<span>${esc(p.t)}</span>`)).join('');
}
function unitStats(u) {
  let ok = 0, bad = 0; for (const q of u.qs.values()) { const a = ansOf(u.key, q.id); if (a == null) continue; a === q.answer ? ok++ : bad++; }
  return { ok, bad, total: u.qs.size, done: ok + bad };
}
function updateBadge(units) {
  let n = 0; for (const u of units) for (const q of u.qs.values()) { const a = ansOf(u.key, q.id); if (a != null && a !== q.answer) n++; }
  const b = $('#wrongBadge'); b.hidden = !n; b.textContent = n;
}

/* ───────── 화면: 홈 ───────── */
async function loadAllUnits() {
  const m = await getManifest();
  const rs = await Promise.allSettled(m.courses.flatMap(c => c.units.map(x => getUnit(c.id, x.id))));
  return rs.filter(r => r.status === 'fulfilled').map(r => r.value);
}
const refreshBadge = () => loadAllUnits().then(updateBadge).catch(() => {});
let routeSeq = 0;
async function viewHome() {
  setCrumbs([]); const seq = routeSeq;
  const m = await getManifest();
  const all = await loadAllUnits(); if (seq !== routeSeq) return;
  updateBadge(all);
  const totalQ = all.reduce((a, u) => a + u.qs.size, 0);
  const doneQ = all.reduce((a, u) => a + unitStats(u).done, 0);
  const last = store.last && store.last.href && all.some(u => u.key === store.last.unit) ? store.last : null;
  main.innerHTML = `<div class="wrap">
    <div class="hero"><div><h1>${esc(m.site?.title || 'Study Hub')}</h1><p>형광펜 친 강의록을 개념 요약과 문제로 바꿔 둔 공부방. 읽다가 막히면 문제로, 틀리면 개념으로 바로 이동합니다.</p></div>
    <div class="hero-stats"><div><b>${all.length}</b><span>단원</span></div><div><b>${totalQ}</b><span>문제</span></div><div><b>${doneQ}</b><span>푼 문제</span></div></div></div>
    ${last ? `<a class="resume" href="${esc(last.href)}"><div><b>이어서 공부하기</b><small>${esc(last.title || '')}</small></div><span class="go">계속 ›</span></a>` : ''}
    ${m.courses.map(c => `<section class="course"><h2>${esc(c.title)}</h2><div class="units">${c.units.map(meta => {
      const u = unitCache.get(`${c.id}/${meta.id}`); if (!u) return ''; const st = unitStats(u); const pct = x => (x / st.total * 100).toFixed(1);
      return `<article class="unit"><div><h3>${esc(meta.title)}</h3>${meta.subtitle ? `<p class="sub">${esc(meta.subtitle)}</p>` : ''}</div>
      <div class="meta"><span class="chip">문제 ${st.total}</span><span class="chip">요약 ${u.flat.length}절</span>${(meta.tags || []).map(t => `<span class="chip">${esc(t)}</span>`).join('')}<span class="chip">${esc(meta.updated || '')}</span></div>
      <div><div class="meter" role="img" aria-label="정답 ${st.ok}, 오답 ${st.bad}, 전체 ${st.total}"><i class="m-ok" style="width:${pct(st.ok)}%"></i><i class="m-bad" style="width:${pct(st.bad)}%"></i></div>
      <div class="meter-label"><span>${st.done}/${st.total} 풀이</span><span>${st.done ? `정답 ${st.ok} · 오답 ${st.bad}` : '아직 안 풀었어요'}</span></div></div>
      <div class="unit-actions"><a class="btn primary" href="#/${c.id}/${meta.id}/read">개념 읽기</a><a class="btn omr" href="#/${c.id}/${meta.id}/quiz">문제 풀기</a>${st.bad ? `<a class="btn" href="#/${c.id}/${meta.id}/review">오답 ${st.bad}</a>` : ''}</div></article>`;
    }).join('')}</div></section>`).join('')}
  </div>`;
  document.title = m.site?.title || 'Study Hub';
}

/* ───────── 단원 공통 헤더 ───────── */
function unitHead(u, tab) {
  const base = `#/${u.cid}/${u.uid}`;
  const st = unitStats(u);
  const wrong = st.bad;
  return `<div class="unit-head"><div><h1>${esc(u.data.title)}</h1>${u.data.subtitle ? `<p>${esc(u.data.subtitle)}</p>` : ''}</div></div>
  <nav class="tabs" aria-label="단원 메뉴">
    <a href="${base}/read" ${tab === 'read' ? 'aria-current="page"' : ''}>개념 리더</a>
    <a href="${base}/quiz" ${tab === 'quiz' ? 'aria-current="page"' : ''}>문제풀이<span class="count">${st.done}/${st.total}</span></a>
    <a href="${base}/key" ${tab === 'key' ? 'aria-current="page"' : ''}>답지·해설</a>
    <a href="${base}/review" ${tab === 'review' ? 'aria-current="page"' : ''}>오답노트${wrong ? `<span class="count">${wrong}</span>` : ''}</a>
  </nav>`;
}
function remember(u, tab, href) { store.last = { unit: u.key, title: u.data.title + ' · ' + ({ read: '개념 리더', quiz: '문제풀이', key: '답지', review: '오답노트' }[tab]), href }; save(); }

/* ───────── 화면: 개념 리더 ───────── */
async function viewRead(u, params) {
  setCrumbs([{ t: u.course.title, href: '#/' }, { t: u.data.title }]);
  remember(u, 'read', `#/${u.cid}/${u.uid}/read`);
  document.title = u.data.title + ' · 개념';
  const toc = (list) => '<ol>' + list.map(s => `<li><a href="#/${u.cid}/${u.uid}/read?s=${encodeURIComponent(s.id)}" data-toc="${esc(s.id)}"><span class="sid">§${esc(s.id)}</span>${esc(s.title)}${weakBadge(badOf(u, s.id), 'sm')}</a>${s.sections?.length ? toc(s.sections) : ''}</li>`).join('') + '</ol>';
  main.innerHTML = `<div class="wrap">${unitHead(u, 'read')}
    <div class="toolbar">
      <button class="btn toc-toggle" id="tocBtn" aria-expanded="false" aria-controls="toc">☰ 목차</button>
      <input class="search" id="q" type="search" placeholder="개념 검색 (용어, 키워드)" aria-label="개념 검색">
      <div class="seg" role="group" aria-label="형광펜 보기"><button data-m="show" aria-pressed="true">형광펜 보기</button><button data-m="hide" aria-pressed="false">가리기(암기)</button></div>
      <span class="grow"></span><span class="kbd" id="hitInfo"></span></div>
    <div class="toc-backdrop" id="tocBd"></div><div class="reader" id="reader"><nav class="toc" id="toc" aria-label="목차">${toc(u.data.summary)}</nav>
    <article class="doc" id="doc">${u.data.summary.map(s => renderSection(u, s)).join('')}</article></div></div>`;
  const doc = $('#doc');
  // 형광펜 가리기 모드: 눌러서 잠깐 확인
  $$('.seg button').forEach(b => b.onclick = () => {
    $$('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b)); doc.classList.toggle('hide-marks', b.dataset.m === 'hide');
    if (b.dataset.m === 'hide') toast('형광펜 부분을 눌러 확인하세요');
  });
  doc.addEventListener('click', e => { const m = e.target.closest('mark'); if (m && doc.classList.contains('hide-marks')) m.classList.toggle('peek'); });
  const mobile = () => matchMedia('(max-width:960px)').matches;
  const rd = $('#reader'), tocEl = $('#toc'), bd = $('#tocBd'), tb = $('#tocBtn');
  let hid = false; try { hid = localStorage.getItem('rsh:toc') === 'hidden'; } catch {}
  const sync = () => { const open = mobile() ? tocEl.classList.contains('open') : !rd.classList.contains('toc-hidden'); tb.setAttribute('aria-expanded', open); bd.classList.toggle('open', mobile() && open); };
  if (hid && !mobile()) rd.classList.add('toc-hidden');
  tb.onclick = () => {
    if (mobile()) tocEl.classList.toggle('open');
    else { const h = rd.classList.toggle('toc-hidden'); try { localStorage.setItem('rsh:toc', h ? 'hidden' : 'shown'); } catch {} }
    sync();
  };
  bd.onclick = () => { tocEl.classList.remove('open'); sync(); };
  sync();
  // 목차 현재 위치
  const links = new Map($$('#toc a').map(a => [a.dataset.toc, a]));
  const io = new IntersectionObserver(es => { for (const en of es) if (en.isIntersecting) { $$('#toc a.active').forEach(a => a.classList.remove('active')); links.get(en.target.dataset.sid)?.classList.add('active'); } }, { rootMargin: '-80px 0px -75% 0px' });
  $$('#doc section').forEach(s => io.observe(s));
  $('#toc').addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); jumpTo(a.dataset.toc); if (mobile()) { tocEl.classList.remove('open'); sync(); } });
  // 검색
  const input = $('#q');
  input.addEventListener('input', () => {
    $$('.found', doc).forEach(n => n.replaceWith(document.createTextNode(n.textContent))); doc.normalize();
    const term = input.value.trim(); const info = $('#hitInfo'); if (!term) { info.textContent = ''; return; }
    let hits = 0; const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT); const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    const lt = term.toLowerCase();
    for (const n of nodes) {
      if (n.parentElement.closest('.sec-qs')) continue;
      const low = n.data.toLowerCase(), idxs = []; let i = -1;
      while ((i = low.indexOf(lt, i + 1)) >= 0) { idxs.push(i); i += lt.length - 1; }
      for (const idx of idxs.reverse()) { const r = document.createRange(); r.setStart(n, idx); r.setEnd(n, idx + term.length); const span = document.createElement('span'); span.className = 'found'; r.surroundContents(span); hits++; }
    }
    $('.found', doc)?.scrollIntoView({ block: 'center' });
    info.textContent = hits ? `${hits}곳` : '결과 없음';
  });
  if (params.get('s')) setTimeout(() => jumpTo(params.get('s')), 60);
}
function jumpTo(sid) {
  const el = document.getElementById('s-' + sid); if (!el) return;
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  const h = el.querySelector(':scope > h2, :scope > h3, :scope > h4'); if (h) { h.classList.remove('flash'); void h.offsetWidth; h.classList.add('flash'); }
}

/* ───────── 화면: 문제풀이 ───────── */
function choiceMap(q) { return q.choices.map((c, i) => ({ c, i: i + 1 })); }
function qCard(u, q, mode) {
  const a = ansOf(u.key, q.id); const answered = a != null; const show = answered && store.settings.instant && mode !== 'exam';
  const ok = a === q.answer;
  const flagged = !!store.flags[`${u.base || u.key}|${q.id}`];
  return `<article class="q" id="q-${esc(q.id)}" data-qid="${esc(q.id)}" tabindex="-1">
    <div class="q-top"><span class="q-no">${q._n}.</span>
      <span class="q-state ${show ? (ok ? 'ok' : 'bad') : 'pending'}">${show ? (ok ? '정답' : '오답') : answered ? '선택함' : '미응답'}</span>
      <button class="btn sm ghost q-flag" data-act="flag" aria-pressed="${flagged}" aria-label="나중에 다시 보기 표시" title="나중에 다시">${flagged ? '★' : '☆'}</button></div>
    <p class="stem">${md(q.stem)}</p>
    <ol class="choices" role="radiogroup" aria-label="${q._n}번 보기">${q.choices.map((c, i) => {
      const n = i + 1; let cls = 'choice';
      if (answered && a === n) cls += ' picked';
      if (show && n === q.answer) cls += ' right'; else if (show && a === n) cls += ' wrong';
      return `<li><button class="${cls}" data-act="pick" data-n="${n}" role="radio" aria-checked="${a === n}" ${show ? 'disabled' : ''}><span class="bubble">${CIRC[i]}</span><span class="ctext">${md(c)}</span></button></li>`;
    }).join('')}</ol>
    <div class="q-actions">
      <button class="btn sm" data-act="concept">개념 보기 §${esc(q.ref)}</button>
      <a class="btn sm" href="#/${u.cid}/${u.uid}/key?q=${encodeURIComponent(q.id)}">답지로</a>
      ${show && !ok ? `<button class="btn sm explain-cta" data-act="explain">해설 보기</button>` : ''}
      ${show && ok ? `<button class="btn sm" data-act="explain">해설</button>` : ''}
      ${answered && mode !== 'exam' ? `<button class="btn sm ghost" data-act="reset">다시 풀기</button>` : ''}
    </div>
    <div class="explain" hidden></div></article>`;
}
function explainHTML(u, q) {
  const s = u.sections.get(String(q.ref));
  return `<b class="ans">정답 ${CIRC[q.answer - 1]} ${md(q.choices[q.answer - 1])}</b><p>${md(q.explanation)}</p>
  <div class="ref">근거: <a href="#/${u.cid}/${u.uid}/read?s=${encodeURIComponent(q.ref)}">§${esc(q.ref)} ${esc(s?.title || '')}</a></div>`;
}
let quizState = null;
async function viewQuiz(u0, params) {
  let u = u0;
  if (params.get('only') === 'retry') u = { ...u0, key: u0.key + '#retry', base: u0.key, retry: true };
  setCrumbs([{ t: u.course.title, href: '#/' }, { t: u.data.title, href: `#/${u.cid}/${u.uid}/read` }, { t: '문제풀이' }]);
  document.title = u.data.title + ' · 문제풀이';
  const setId = params.get('set') || u.data.sets[0].id; const refF = params.get('ref'); const only = params.get('only'); const mode = params.get('mode') === 'exam' ? 'exam' : 'study';
  let set = u.data.sets.find(s => s.id === setId) || u.data.sets[0];
  let list = set.questions;
  if (refF) { list = [...u.qs.values()].filter(q => String(q.ref) === refF || String(q.ref).startsWith(refF + '.')); }
  if (only === 'wrong') list = [...u.qs.values()].filter(q => { const a = ansOf(u.key, q.id); return a != null && a !== q.answer; });
  if (only === 'flag') list = [...u.qs.values()].filter(q => store.flags[`${u.key}|${q.id}`]);
  if (only === 'todo') list = set.questions.filter(q => ansOf(u.key, q.id) == null);
  if (only === 'retry') list = (store.retry[u0.key] || []).map(id => u0.qs.get(id)).filter(Boolean);
  const filtered = !!(refF || only);
  remember(u0, 'quiz', only === 'retry' ? `#/${u.cid}/${u.uid}/quiz?only=retry` : `#/${u.cid}/${u.uid}/quiz?set=${set.id}`);
  quizState = { u, list, mode, set, filtered, cur: 0 };
  const base = `#/${u.cid}/${u.uid}/quiz`;
  const sc = list.reduce((a, q) => { const x = ansOf(u.key, q.id); return a + (x === q.answer ? 1 : 0); }, 0);
  const done = list.filter(q => ansOf(u.key, q.id) != null).length;
  main.innerHTML = `<div class="wrap">${unitHead(u0, 'quiz')}
    <div class="set-pick" role="tablist" aria-label="문제 세트">${u.data.sets.map(s => { const d = s.questions.filter(q => ansOf(u.key, q.id) != null).length; return `<a class="btn ${!filtered && s.id === set.id ? 'primary' : ''}" href="${base}?set=${s.id}${mode === 'exam' ? '&mode=exam' : ''}">${esc(s.title)} <small>${d}/${s.questions.length}</small></a>`; }).join('')}</div>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="풀이 방식"><a class="btn sm ghost" style="display:none"></a>
        <button data-mode="study" aria-pressed="${mode === 'study'}">학습 모드 <small>(바로 채점)</small></button><button data-mode="exam" aria-pressed="${mode === 'exam'}">시험 모드 <small>(마지막에 채점 · 답안 카드)</small></button></div>
      ${filtered ? `<span class="chip">${refF ? `§${esc(refF)} 관련` : only === 'retry' ? '오답 새로 풀기' : only === 'wrong' ? '틀린 문제만' : only === 'flag' ? '★ 표시한 문제' : '안 푼 문제'} · ${list.length}문제</span><a class="btn sm" href="${base}?set=${set.id}">전체 보기</a>` : `<a class="btn sm" href="${base}?set=${set.id}&only=todo">안 푼 문제만</a>`}
      <span class="grow"></span><span class="kbd"><kbd>1</kbd>–<kbd>5</kbd> 선택 · <kbd>J</kbd>/<kbd>K</kbd> 이동 · <kbd>E</kbd> 해설 · <kbd>C</kbd> 개념</span></div>
    ${list.length ? `<div class="quiz-layout${mode === 'exam' ? '' : ' solo'}"><div class="qlist" id="qlist">${list.map(q => qCard(u, q, mode)).join('')}</div>
    ${mode === 'exam' ? '<aside class="omr-card" id="omr" aria-label="답안 카드"></aside>' : '<nav class="studybar" id="sbar" aria-label="풀이 현황"></nav>'}</div>` : `<p class="empty">${only === 'wrong' ? '틀린 문제가 없어요. 잘하고 있어요!' : only === 'flag' ? '★ 표시한 문제가 없어요.' : '풀 문제가 없어요.'}</p>`}</div>`;
  if (!list.length) return;
  $$('.seg [data-mode]').forEach(b => b.onclick = () => { const p = new URLSearchParams(location.hash.split('?')[1] || ''); p.set('mode', b.dataset.mode); location.hash = location.hash.split('?')[0] + '?' + p; });
  const qi = params.get('q') ? list.findIndex(q => q.id === params.get('q')) : -1;
  renderOMR(); setCur(Math.max(0, qi), false);
  $('#qlist').addEventListener('click', onQuizClick);
  $('#omr')?.addEventListener('click', onOmrClick);
  $('#sbar')?.addEventListener('click', onBarClick);
  if (params.get('q')) { const el = document.getElementById('q-' + params.get('q')); el?.scrollIntoView({ block: 'center' }); }
}
function onQuizClick(e) {
  const btn = e.target.closest('[data-act]'); if (!btn) return; const card = btn.closest('.q'); const { u, mode } = quizState; const q = u.qs.get(card.dataset.qid);
  const act = btn.dataset.act;
  const ci = quizState.list.indexOf(q); if (ci >= 0 && ci !== quizState.cur) setCur(ci, false);
  if (act === 'pick') pick(card, q, +btn.dataset.n);
  else if (act === 'concept') openSheet(`§${q.ref} ${u.sections.get(String(q.ref))?.title || ''}`, conceptHTML(u, q.ref));
  else if (act === 'explain') { const ex = $('.explain', card); ex.innerHTML = explainHTML(u, q); ex.hidden = !ex.hidden; }
  else if (act === 'reset') { setAns(u.key, q.id, null); rerenderCard(card, q); renderOMR(); }
  else if (act === 'flag') { const k = `${u.base || u.key}|${q.id}`; if (store.flags[k]) delete store.flags[k]; else store.flags[k] = 1; save(); btn.setAttribute('aria-pressed', !!store.flags[k]); btn.textContent = store.flags[k] ? '★' : '☆'; }
}
function pick(card, q, n) {
  const { u, mode } = quizState; setAns(u.key, q.id, n);
  if (u.retry && n === q.answer) setAns(u.base, q.id, null);   // 새로 풀어서 맞히면 오답노트에서 졸업
  rerenderCard(card, q);
  if (store.settings.instant && mode !== 'exam' && n !== q.answer) { const ex = $('.explain', document.getElementById('q-' + q.id)); ex.innerHTML = explainHTML(u, q); ex.hidden = false; }
  renderOMR(); refreshHeaderCount();
  refreshBadge();
}
function rerenderCard(card, q) {
  const { u, mode } = quizState; const wasOpen = !$('.explain', card).hidden;
  const t = document.createElement('div'); t.innerHTML = qCard(u, q, mode); const nc = t.firstElementChild;
  if (card.classList.contains('active')) nc.classList.add('active'); card.replaceWith(nc);
  if (wasOpen) { const ex = $('.explain', nc); ex.innerHTML = explainHTML(u, q); ex.hidden = false; }
}
function refreshHeaderCount() { const { u } = quizState; const st = unitStats(u.base ? { ...u, key: u.base } : u); const c = $('.tabs a[aria-current] .count'); if (c) c.textContent = `${st.done}/${st.total}`; }
function renderBar() {
  const el = $('#sbar'); if (!el) return; const { u, list, cur } = quizState;
  const n = list.length; let ok = 0, bad = 0;
  for (const q of list) { const a = ansOf(u.key, q.id); if (a == null) continue; a === q.answer ? ok++ : bad++; }
  const done = ok + bad; const pct = done ? Math.round(ok / done * 100) : 0;
  el.innerHTML = `<div class="sb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${done}"><i class="ok" style="width:${ok / n * 100}%"></i><i class="no" style="width:${bad / n * 100}%"></i></div>
    <div class="sb-row">
      <div class="sb-stats"><span><small>푼 문제</small><b>${done}<em>/${n}</em></b></span><span class="ok"><small>정답</small><b>${ok}</b></span><span class="no"><small>오답</small><b>${bad}</b></span><span><small>정답률</small><b>${done ? pct + '%' : '–'}</b></span></div>
      <div class="sb-nav"><button class="btn sm" data-sb="prev" aria-label="이전 문제">‹</button><span class="sb-cur">${cur + 1}<em>/${n}</em></span><button class="btn sm" data-sb="next" aria-label="다음 문제">›</button><button class="btn sm sb-todo" data-sb="todo">안 푼 문제로</button></div>
    </div>`;
}
function onBarClick(e) {
  const a = e.target.closest('[data-sb]')?.dataset.sb; if (!a) return; const { u, list, cur } = quizState;
  if (a === 'prev') setCur(cur - 1, true); else if (a === 'next') setCur(cur + 1, true);
  else { const i = list.findIndex((q, k) => ansOf(u.key, q.id) == null && k !== cur); const j = i < 0 ? list.findIndex(q => ansOf(u.key, q.id) == null) : i; if (j < 0) toast('모두 풀었어요'); else setCur(j, true); }
}
function renderOMR() {
  renderBar();
  const { u, list, mode } = quizState; const el = $('#omr'); if (!el) return;
  const done = list.filter(q => ansOf(u.key, q.id) != null).length;
  const exam = mode === 'exam';
  const graded = !exam || done === list.length;
  const score = list.filter(q => ansOf(u.key, q.id) === q.answer).length;
  const wrong = list.filter(q => { const a = ansOf(u.key, q.id); return a != null && a !== q.answer; }).length;
  const cols = Math.max(...list.map(q => q.choices.length), 5);
  el.innerHTML = `<h2><span>답안 카드</span><span class="omr-toggle" id="omrT">${done}/${list.length} ▴</span></h2>
    <p class="omr-sub">번호를 누르면 그 문제로 이동해요</p>
    <div class="omr-grid" style="grid-template-columns:2.2em repeat(${cols},1fr)">${list.map((q, i) => { const a = ansOf(u.key, q.id); const show = a != null && (!exam || done === list.length);
      return `<div class="omr-row"><button class="omr-n ${i === quizState.cur ? 'cur' : ''}" data-go="${i}" aria-label="${q._n}번으로 이동">${q._n}</button>${Array.from({ length: cols }, (_, k) => { const n = k + 1; if (n > q.choices.length) return '<span class="omr-c"></span>'; let c = 'omr-b'; if (a === n) c += show ? (n === q.answer ? ' ok' : ' no') : ' on'; if (show && a !== q.answer && n === q.answer && !exam) c += ' key'; return `<span class="omr-c"><span class="${c}"></span></span>`; }).join('')}</div>`; }).join('')}</div>
    <div class="omr-score"><span>${exam && !graded ? '채점 전' : '점수'}</span><b>${graded ? `${score}<small> / ${list.length}</small>` : `${done}<small> / ${list.length}</small>`}</b></div>
    <div class="omr-actions">
      ${exam ? `<button class="btn omr solid" data-omr="grade">${graded ? '채점하고 해설 보기' : `남은 ${list.length - done}문제 건너뛰고 채점`}</button>` : ''}
      ${wrong ? `<a class="btn omr more" href="#/${u.cid}/${u.uid}/review">오답노트 (${wrong})</a>` : ''}
      <button class="btn more" data-omr="next-todo">안 푼 문제로</button>
      <button class="btn more" data-omr="reset">이 세트 초기화</button></div>`;
  el.classList.toggle('open', el.classList.contains('open'));
}
function onOmrClick(e) {
  const { u, list } = quizState;
  if (e.target.closest('h2')) { $('#omr').classList.toggle('open'); return; }
  const go = e.target.closest('[data-go]'); if (go) { setCur(+go.dataset.go, true); return; }
  const a = e.target.closest('[data-omr]')?.dataset.omr;
  if (a === 'next-todo') { const i = list.findIndex(q => ansOf(u.key, q.id) == null); if (i < 0) toast('모두 풀었어요'); else setCur(i, true); }
  if (a === 'reset') { if (!confirm('이 세트의 풀이 기록을 지울까요?')) return; list.forEach(q => setAns(u.key, q.id, null)); location.reload(); }
  if (a === 'grade') { quizState.mode = 'study'; $$('.seg [data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === 'study')); list.forEach(q => { const c = document.getElementById('q-' + q.id); rerenderCard(c, q); }); renderOMR(); }
}
function setCur(i, scroll) {
  const { list } = quizState; i = Math.max(0, Math.min(list.length - 1, i)); quizState.cur = i;
  $$('.q.active').forEach(x => x.classList.remove('active'));
  const el = document.getElementById('q-' + list[i].id); el.classList.add('active');
  if (scroll) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $$('.omr-n').forEach((b, k) => b.classList.toggle('cur', k === i));
  renderBar();
}
document.addEventListener('keydown', e => {
  if (!quizState || !$('#qlist') || !$('#sheet').hidden || e.target.matches('input,textarea,select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const { list, u, cur } = quizState; const q = list[cur]; const card = document.getElementById('q-' + q.id);
  if (/^[1-6]$/.test(e.key)) { if (+e.key <= q.choices.length && !(store.settings.instant && quizState.mode !== 'exam' && ansOf(u.key, q.id) != null)) { pick(card, q, +e.key); } }
  else if (e.key === 'j' || e.key === 'ArrowRight' || e.key === 'ArrowDown' && e.shiftKey) setCur(cur + 1, true);
  else if (e.key === 'k' || e.key === 'ArrowLeft') setCur(cur - 1, true);
  else if (e.key === 'e') { const c = document.getElementById('q-' + q.id); $('[data-act=explain]', c)?.click(); }
  else if (e.key === 'c') openSheet(`§${q.ref} ${u.sections.get(String(q.ref))?.title || ''}`, conceptHTML(u, q.ref));
  else return;
  e.preventDefault();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

/* ───────── 화면: 답지·해설 ───────── */
async function viewKey(u, params) {
  setCrumbs([{ t: u.course.title, href: '#/' }, { t: u.data.title, href: `#/${u.cid}/${u.uid}/read` }, { t: '답지·해설' }]);
  document.title = u.data.title + ' · 답지';
  remember(u, 'key', `#/${u.cid}/${u.uid}/key`);
  const covered = params.get('show') !== '1';
  const base = `#/${u.cid}/${u.uid}`;
  main.innerHTML = `<div class="wrap">${unitHead(u, 'key')}
    <div class="toolbar"><button class="btn" id="cover" aria-pressed="${covered}">${covered ? '정답 가려둠 — 눌러서 보기' : '정답 보이는 중 — 눌러서 가리기'}</button><span class="kbd">가려둔 정답은 눌러서 하나씩 확인할 수 있어요</span></div>
    <div id="keywrap" class="${covered ? 'covered' : ''}">${u.data.sets.map(set => `<h2 class="key-set-title">${esc(set.title)}</h2>
      <div class="key-grid">${set.questions.map(q => { const a = ansOf(u.key, q.id); const cls = a == null ? '' : a === q.answer ? 'ok' : 'no'; return `<a class="key-cell ${cls}" href="#k-${esc(q.id)}" data-kq="${esc(q.id)}"><span>${q._n}</span><b>${CIRC[q.answer - 1]}</b></a>`; }).join('')}</div>
      <div class="key-list">${set.questions.map(q => `<article class="key-item" id="k-${esc(q.id)}"><h3><span>${q._n}.</span><span class="key-ans">${CIRC[q.answer - 1]} ${md(q.choices[q.answer - 1])}</span></h3>
        <p>${md(q.stem)}</p><p>${md(q.explanation)}</p>
        <div class="links"><a class="btn sm" href="${base}/quiz?set=${set.id}&q=${encodeURIComponent(q.id)}">문제로</a><button class="btn sm" data-concept="${esc(q.id)}">개념 §${esc(q.ref)}</button></div></article>`).join('')}</div>`).join('')}</div></div>`;
  $('#cover').onclick = () => { const p = new URLSearchParams(location.hash.split('?')[1] || ''); p.set('show', covered ? '1' : '0'); p.delete('q'); history.replaceState(null, '', location.hash.split('?')[0] + '?' + p); viewKey(u, p); };
  const kw = $('#keywrap');
  kw.addEventListener('click', e => {
    const peek = e.target.closest('b, .key-ans'); if (kw.classList.contains('covered') && peek) { peek.classList.toggle('peek'); e.preventDefault(); return; }
    const cb = e.target.closest('[data-concept]'); if (cb) { const q = u.qs.get(cb.dataset.concept); openSheet(`§${q.ref} ${u.sections.get(String(q.ref))?.title || ''}`, conceptHTML(u, q.ref)); }
    const cell = e.target.closest('.key-cell'); if (cell) { e.preventDefault(); document.getElementById('k-' + cell.dataset.kq).scrollIntoView({ block: 'center' }); }
  });
  if (params.get('q')) { const el = document.getElementById('k-' + params.get('q')); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); const b = $('.key-ans', el); if (covered) b?.classList.add('peek'); } }
}

/* ───────── 화면: 오답노트 ───────── */
function reviewCard(u, q) {
  const a = ansOf(u.key, q.id);
  return `<article class="q" data-qid="${esc(q.id)}" data-ukey="${esc(u.key)}"><div class="q-top"><span class="q-no">${esc(q._set.title)} ${q._n}번</span><span class="q-state bad">내 답 ${CIRC[a - 1]}</span></div>
  <p class="stem">${md(q.stem)}</p>
  <div class="explain"><b class="ans">정답 ${CIRC[q.answer - 1]} ${md(q.choices[q.answer - 1])}</b><p>내가 고른 답: ${CIRC[a - 1]} ${md(q.choices[a - 1])}</p><p>${md(q.explanation)}</p></div>
  <div class="q-actions"><button class="btn sm" data-r="concept">개념 보기 §${esc(q.ref)}</button><a class="btn sm" href="#/${u.cid}/${u.uid}/quiz?set=${q._set.id}&q=${encodeURIComponent(q.id)}">다시 풀기</a><button class="btn sm ghost" data-r="clear">오답에서 지우기</button></div></article>`;
}
async function viewReview(u) {
  setCrumbs([{ t: u.course.title, href: '#/' }, { t: u.data.title, href: `#/${u.cid}/${u.uid}/read` }, { t: '오답노트' }]);
  document.title = u.data.title + ' · 오답노트'; remember(u, 'review', `#/${u.cid}/${u.uid}/review`);
  const wrong = [...u.qs.values()].filter(q => { const a = ansOf(u.key, q.id); return a != null && a !== q.answer; });
  const rl = (store.retry[u.key] || []).filter(id => u.qs.has(id)); const resumeDone = rl.filter(id => ansOf(u.key + '#retry', id) != null).length; const resume = rl.length > 0 && resumeDone < rl.length;
  main.innerHTML = `<div class="wrap">${unitHead(u, 'review')}
    <div class="toolbar">${wrong.length ? `<button class="btn primary" id="retryNew">새로 풀기 · ${wrong.length}문제 <small>(풀이 칸 비움)</small></button>` : ''}${resume ? `<a class="btn" href="#/${u.cid}/${u.uid}/quiz?only=retry">이어서 풀기 <small>${resumeDone}/${rl.length}</small></a>` : ''}${wrong.length ? `<a class="btn ghost" href="#/${u.cid}/${u.uid}/quiz?only=wrong">풀이 기록 보며 다시 풀기</a>` : ''}</div>
    <div class="qlist" id="rv">${wrong.length ? wrong.map(q => reviewCard(u, q)).join('') : '<p class="empty">틀린 문제가 없어요. 문제풀이에서 풀어 보면 여기에 쌓입니다.</p>'}</div></div>`;
  bindReview(u);
  $('#retryNew')?.addEventListener('click', () => {
    const ids = wrong.map(q => q.id); store.retry[u.key] = ids; ids.forEach(id => delete store.answers[`${u.key}#retry|${id}`]); save();
    location.hash = `#/${u.cid}/${u.uid}/quiz?only=retry`;
  });
}
function bindReview(u) {
  $('#rv')?.addEventListener('click', e => {
    const b = e.target.closest('[data-r]'); if (!b) return; const card = b.closest('.q'); const uu = unitCache.get(card.dataset.ukey) || u; const q = uu.qs.get(card.dataset.qid);
    if (b.dataset.r === 'concept') openSheet(`§${q.ref} ${uu.sections.get(String(q.ref))?.title || ''}`, conceptHTML(uu, q.ref));
    if (b.dataset.r === 'clear') {
      setAns(uu.key, q.id, null);
      if (store.retry[uu.key]) store.retry[uu.key] = store.retry[uu.key].filter(id => id !== q.id);
      save(); const y = scrollY; route().then(() => scrollTo(0, y)); toast('오답노트에서 지웠어요');
    }
  });
}
async function viewAllReview() {
  setCrumbs([{ t: '홈', href: '#/' }, { t: '전체 오답노트' }]); document.title = '전체 오답노트';
  const seq = routeSeq; const all = await loadAllUnits(); if (seq !== routeSeq) return;
  updateBadge(all);
  const groups = all.map(u => ({ u, w: [...u.qs.values()].filter(q => { const a = ansOf(u.key, q.id); return a != null && a !== q.answer; }) })).filter(g => g.w.length);
  main.innerHTML = `<div class="wrap"><div class="hero"><div><h1>전체 오답노트</h1><p>모든 단원에서 틀린 문제를 모았어요.</p></div></div>
    <div id="rv" class="review-group">${groups.length ? groups.map(g => `<h2>${esc(g.u.data.title)} · ${g.w.length}문제</h2><div class="qlist">${g.w.map(q => reviewCard(g.u, q)).join('')}</div>`).join('') : '<p class="empty">틀린 문제가 없어요.</p>'}</div></div>`;
  bindReview();
}

/* ───────── 설정 ───────── */
$('#settingsBtn').onclick = () => {
  const s = store.settings;
  openSheet('설정', `<div class="set-row"><div><p><b>화면 테마</b></p></div><div class="seg" id="sTheme">${[['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']].map(([v, t]) => `<button data-v="${v}" aria-pressed="${s.theme === v}">${t}</button>`).join('')}</div></div>
  <div class="set-row"><div><p><b>글자 크기</b></p></div><div class="seg" id="sFs">${[[.92, '작게'], [1, '보통'], [1.12, '크게'], [1.25, '더 크게']].map(([v, t]) => `<button data-v="${v}" aria-pressed="${s.fs === v}">${t}</button>`).join('')}</div></div>
  <div class="set-row"><div><p><b>학습 모드에서 바로 채점</b><small>끄면 선택만 하고 답지·오답노트에서 확인해요</small></p></div><div class="seg" id="sIn">${[[true, '켜기'], [false, '끄기']].map(([v, t]) => `<button data-v="${v}" aria-pressed="${s.instant === v}">${t}</button>`).join('')}</div></div>
  <div class="set-row"><div><p><b>학습 기록</b><small>이 브라우저에만 저장돼요. 기기를 바꾸면 따로 쌓입니다.</small></p></div><div><button class="btn sm" id="sExp">내보내기</button> <button class="btn sm" id="sRst">모두 지우기</button></div></div>`);
  const bind = (id, key, parse) => $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; store.settings[key] = parse(b.dataset.v); save(); applySettings(); $$('button', $(id)).forEach(x => x.setAttribute('aria-pressed', x === b)); if (key === 'instant') toast('다음 문제부터 적용돼요'); });
  bind('#sTheme', 'theme', v => v); bind('#sFs', 'fs', Number); bind('#sIn', 'instant', v => v === 'true');
  $('#sExp').onclick = () => { const blob = new Blob([JSON.stringify(store, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'study-hub-progress.json'; a.click(); };
  $('#sRst').onclick = () => { if (confirm('풀이 기록, 오답, ★ 표시를 모두 지웁니다. 설정은 유지돼요.')) { store.answers = {}; store.flags = {}; store.retry = {}; store.last = null; save(); closeSheet(); route(); toast('기록을 지웠어요'); } };
};

/* ───────── 라우터 ───────── */
async function route() {
  const my = ++routeSeq;
  const [path, qs] = (location.hash.slice(1) || '/').split('?'); const params = new URLSearchParams(qs || '');
  const seg = path.split('/').filter(Boolean);
  main.innerHTML = '<p class="loading">불러오는 중…</p>';
  try {
    if (!seg.length) await viewHome();
    else if (seg[0] === 'review') await viewAllReview();
    else {
      const u = await getUnit(seg[0], seg[1]); if (my !== routeSeq) return; const tab = seg[2] || 'read';
      if (tab === 'read') await viewRead(u, params);
      else if (tab === 'quiz') await viewQuiz(u, params);
      else if (tab === 'key') await viewKey(u, params);
      else if (tab === 'review') await viewReview(u);
      else await viewRead(u, params);
      refreshBadge();
    }
    if (!params.get('s') && !params.get('q')) window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  } catch (err) {
    if (my !== routeSeq) return;
    main.innerHTML = `<div class="wrap"><p class="empty">${esc(err.message)}<br><br><a class="btn" href="#/">홈으로</a></p></div>`;
  }
}
window.addEventListener('hashchange', () => { if (!$('#sheet').hidden) closeSheet(false); route(); });
addEventListener('storage', e => { if (e.key !== KEY || !e.newValue) return; try { store = normalize(JSON.parse(e.newValue)); applySettings(); } catch {} });
applySettings();
route();
