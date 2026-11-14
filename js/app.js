// app.js — 카드뉴스 스튜디오 메인 애플리케이션
import { loadFonts } from './fonts.js';
import { store } from './store.js?v=a2';
import { sampleProject } from './sample.js?v=a4';
import { renderCard, ensureImages, LAYOUTS } from './layouts.js?v=a2';
import { runQA } from './qa.js';
import { buildCaption } from './caption.js';
import { exportCardPNG, exportAllZip, exportProjectJSON } from './export.js';
import { normalizeImage, log } from './util.js';

// ---------- DOM 헬퍼 ----------
const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

// ---------- 상태 ----------
const railCanvases = new Map(); // cardId -> canvas
const railSigs = new Map();     // cardId -> 마지막 렌더 시그니처
let railKey = '';               // 카드 id 순서 (구조 변경 감지)
let qaResult = { cardWarnings: new Map(), global: [] };

// ---------- 토스트 ----------
function toast(message, { type = '', actionLabel = '', onAction = null, timeout = 3200 } = {}) {
  const area = $('#toast-area');
  const t = el('div', { class: `toast ${type}` },
    el('span', {}, message),
    actionLabel && onAction ? el('button', { onclick: () => { onAction(); t.remove(); } }, actionLabel) : null
  );
  area.append(t);
  if (timeout > 0) setTimeout(() => t.remove(), timeout);
  return t;
}

// ---------- 모달 ----------
function openModal(title, desc, buildContent) {
  const root = $('#modal-root');
  root.innerHTML = '';
  const content = el('div', { class: 'modal-body' });
  const modal = el('div', { class: 'modal', role: 'dialog', 'aria-label': title },
    el('button', { class: 'modal-close', title: '닫기', 'aria-label': '닫기', onclick: () => close() }, '✕'),
    el('h2', {}, title),
    desc ? el('p', { class: 'modal-desc' }, desc) : null,
    content
  );
  root.append(modal);
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  buildContent(content, close);
  return close;
}

// ---------- 렌더 파이프라인 ----------
// 순서 중요: 렌더(→ _overflow 플래그 확정) → QA 계산 → 레일 → QA 표시
async function repaint({ editor = false } = {}) {
  const P = store.project;
  await ensureImages(P);
  renderMain();
  qaResult = runQA(P);
  renderRail();
  if (editor) renderEditor();
  renderQA();
}

function renderMain() {
  const P = store.project;
  const cv = $('#preview-canvas');
  const ctx = cv.getContext('2d');
  if (!P.cards.length) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    return;
  }
  renderCard(ctx, P, P.cards[store.selected], store.selected);
}

// 카드 내용 + 공통 크롬에 영향 주는 값의 시그니처 — 변경된 카드만 다시 그린다
function cardSig(P, c) {
  return [
    P.handle, P.sourceLabel, P.sourceUrl, P.theme, P.accent, P.cards.length,
    c.layout, c.badge, c.title.join('\n'), c.body.join('\n'), c.footerNote,
    (c.items || []).map((i) => (typeof i === 'string' ? i : `${i.text || ''}|${i.sub || ''}|${i.action || ''}`)).join('\n'),
    JSON.stringify(c.compare || {}),
    c.media ? `${c.media.src.length}:${c.media.w || 0}` : '-',
  ].join('§');
}

function renderRail() {
  const P = store.project;
  const rail = $('#card-rail');
  const key = P.cards.map((c) => c.id).join(',');

  if (key !== railKey) {
    // 구조(순서·개수)가 바뀌면 레일 전체 재구성
    railKey = key;
    rail.innerHTML = '';
    railCanvases.clear();
    railSigs.clear();

    P.cards.forEach((card, i) => {
      const cv = document.createElement('canvas');
      cv.width = 1080;
      cv.height = 1350;
      railCanvases.set(card.id, cv);
      const item = el('div', {
        class: `rail-item ${i === store.selected ? 'active' : ''}`,
        dataset: { index: String(i), id: card.id },
        onclick: () => store.select(i),
      },
        cv,
        el('div', { class: 'rail-actions' },
          el('button', { title: '위로', onclick: (e) => { e.stopPropagation(); store.moveCard(i, -1); } }, '↑'),
          el('button', { title: '아래로', onclick: (e) => { e.stopPropagation(); store.moveCard(i, 1); } }, '↓'),
          el('button', { title: '복제', onclick: (e) => { e.stopPropagation(); store.duplicateCard(i); toast('카드를 복제했습니다.'); } }, '⧉'),
          el('button', { title: '삭제', onclick: (e) => { e.stopPropagation(); deleteCard(i); } }, '✕'),
        ),
        el('div', { class: 'rail-item-meta' },
          el('span', { class: 'num' }, String(i + 1).padStart(2, '0')),
          el('span', { class: 'layout-name' }, layoutName(card.layout)),
        ),
      );
      rail.append(item);
    });
    rail.append(el('button', { id: 'btn-add-card', class: 'btn', onclick: () => {
      store.addCard('media-top');
      toast('카드를 추가했습니다. 오른쪽에서 레이아웃을 고르세요.');
    } }, '+ 카드 추가'));
  }

  // 변경된 카드만 캔버스 재렌더
  P.cards.forEach((card, i) => {
    const cv = railCanvases.get(card.id);
    const item = rail.querySelector(`.rail-item[data-id="${card.id}"]`);
    if (!cv || !item) return;
    if (Number(item.dataset.index) !== i) item.dataset.index = String(i);
    const numEl = item.querySelector('.num');
    const numText = String(i + 1).padStart(2, '0');
    if (numEl.textContent !== numText) numEl.textContent = numText;
    item.classList.toggle('active', i === store.selected);

    const sig = cardSig(P, card);
    if (railSigs.get(card.id) !== sig) {
      renderCard(cv.getContext('2d'), P, card, i);
      railSigs.set(card.id, sig);
      const nameEl = item.querySelector('.layout-name');
      if (nameEl.textContent !== layoutName(card.layout)) nameEl.textContent = layoutName(card.layout);
    }
  });
}

function renderQA() {
  const P = store.project;
  const strip = $('#qa-strip');
  strip.innerHTML = '';

  const rows = [];
  const cur = P.cards[store.selected];
  if (cur) {
    if (cur._overflow) rows.push({ tag: '넘침', msg: '이 카드에서 텍스트가 영역보다 길어 축소·말줄임되었습니다. 문장을 줄여보세요.', cls: '' });
    for (const w of qaResult.cardWarnings.get(cur.id) || []) rows.push({ tag: 'QA', msg: w, cls: '' });
  }
  for (const g of qaResult.global) rows.push({ tag: 'INFO', msg: g, cls: 'info' });
  if (!rows.length) {
    rows.push({ tag: 'OK', msg: '선택한 카드에 경고가 없습니다. 7장 흐름: 공감 → 문제 → 설명 → 근거 → 사용법 → 전후비교 → CTA', cls: 'ok' });
  }
  for (const r of rows.slice(0, 8)) {
    strip.append(el('div', { class: `qa-row ${r.cls}` }, el('span', { class: 'qa-tag' }, r.tag), el('span', {}, r.msg)));
  }

  // 내비게이션 도트 + 레일 경고점 갱신
  const dots = $('#nav-dots');
  dots.innerHTML = '';
  P.cards.forEach((c, i) => {
    const warn = qaResult.cardWarnings.has(c.id) || c._overflow;
    dots.append(el('button', {
      class: `nav-dot ${i === store.selected ? 'active' : ''} ${warn ? 'has-warn' : ''}`,
      title: `${i + 1}번 카드`,
      onclick: () => store.select(i),
    }));
  });
  document.querySelectorAll('.rail-item').forEach((n) => {
    const card = P.cards.find((c) => c.id === n.dataset.id);
    if (!card) return;
    const meta = n.querySelector('.rail-item-meta');
    if (!meta) return;
    const hasWarn = qaResult.cardWarnings.has(card.id) || card._overflow;
    let dot = meta.querySelector('.warn-dot');
    if (hasWarn && !dot) meta.append(el('span', { class: 'warn-dot', title: 'QA 경고 있음' }));
    if (!hasWarn && dot) dot.remove();
  });
}

function layoutName(id) {
  return (LAYOUTS.find((l) => l.id === id) || { name: id }).name;
}

// ---------- 편집기 ----------
function renderEditor() {
  const P = store.project;
  const pane = $('#editor-pane');
  pane.innerHTML = '';
  const card = P.cards[store.selected];
  if (!card) {
    pane.append(el('p', { style: 'color:var(--ui-sub)' }, '카드를 추가해 주세요.'));
    return;
  }

  const upd = (fn) => store.updateCard(store.selected, fn); // 'project' 이벤트가 화면 갱신을 담당

  // ── 레이아웃
  const grid = el('div', { class: 'layout-grid' });
  for (const L of LAYOUTS) {
    grid.append(el('button', {
      class: `layout-btn ${card.layout === L.id ? 'active' : ''}`,
      title: L.desc,
      onclick: () => {
        upd((c) => { c.layout = L.id; });
        renderEditor();
      },
    }, layoutIcon(L.id), el('span', { class: 'name' }, L.name)));
  }
  pane.append(section('레이아웃', grid));

  // ── 콘텐츠
  pane.append(section('콘텐츠', el('div', {},
    textField('배지 (작은 알약 문구)', card.badge, '예: 업무 생산성', (v) => upd((c) => { c.badge = v; })),
    linesField('제목 — 의미 단위로 줄을 나눠 주세요 (권장 3줄)', card.title, '한 줄이 하나의 의미 단위입니다', (lines) => upd((c) => { c.title = lines; }), 4),
    linesField('본문 (권장 3줄)', card.body, '', (lines) => upd((c) => { c.body = lines; }), 4),
  )));

  // ── 레이아웃별 항목
  const specific = el('div', {});
  if (card.layout === 'checklist') {
    specific.append(linesField('체크 항목 (최대 5개)', stringsOf(card.items), '', (lines) => upd((c) => { c.items = lines; }), 5));
  } else if (card.layout === 'steps') {
    specific.append(stepsField(card));
  } else if (card.layout === 'compare') {
    const cmp = card.compare || { labelA: '', labelB: '', itemsA: [''], itemsB: [''] };
    specific.append(
      el('div', { class: 'form-grid' },
        textField('A 라벨', cmp.labelA, '예: 쓰기 전', (v) => upd((c) => { c.compare.labelA = v; })),
        textField('B 라벨', cmp.labelB, '예: 쓴 후', (v) => upd((c) => { c.compare.labelB = v; })),
      ),
      linesField('A 항목 (최대 4개)', cmp.itemsA, '', (lines) => upd((c) => { c.compare.itemsA = lines; }), 4),
      linesField('B 항목 (최대 4개)', cmp.itemsB, '', (lines) => upd((c) => { c.compare.itemsB = lines; }), 4),
    );
  } else if (card.layout === 'cta') {
    const action = (card.items && card.items[0] && card.items[0].action) || '';
    specific.append(textField('액션 버튼 문구', action, '예: 지금 저장하기', (v) => upd((c) => {
      c.items = [{ text: '', action: v }];
    })));
  }
  if (specific.childElementCount) pane.append(section('항목', specific));

  // ── 미디어
  const mediaLayouts = ['cover-media', 'media-top', 'media-full', 'cta'];
  if (mediaLayouts.includes(card.layout)) {
    pane.append(section('미디어', mediaField(card)));
  }

  // ── 기타
  pane.append(section('기타', textField('푸터 노트 (출처 등, 비우면 전역 설정 사용)', card.footerNote, '', (v) => upd((c) => { c.footerNote = v; }))));
}

function section(title, ...children) {
  return el('div', { class: 'editor-section' }, el('h3', {}, title), ...children);
}

function stringsOf(items) {
  return (items || []).map((i) => (typeof i === 'string' ? i : i.text || ''));
}

function textField(labelText, value, placeholder, onChange) {
  const input = el('input', { type: 'text', value: value || '', placeholder: placeholder || '' });
  input.addEventListener('input', () => onChange(input.value));
  return el('div', { class: 'field' }, el('label', {}, labelText), input);
}

function linesField(labelText, lines, placeholder, onChange, max = 99) {
  const wrap = el('div', { class: 'field' });
  wrap.append(el('label', {}, labelText));
  const editor = el('div', { class: 'lines-editor' });
  const arr = lines && lines.length ? lines.slice() : [''];
  const rebuild = () => {
    editor.innerHTML = '';
    arr.forEach((line, i) => {
      const input = el('input', { type: 'text', value: line, placeholder: placeholder || '' });
      input.addEventListener('input', () => {
        arr[i] = input.value;
        onChange(arr.slice());
      });
      const x = el('button', { class: 'row-x', title: '줄 삭제', onclick: () => {
        arr.splice(i, 1);
        if (!arr.length) arr.push('');
        onChange(arr.slice());
        rebuild();
      } }, '✕');
      editor.append(el('div', { class: 'line-row' }, input, x));
    });
    if (arr.length < max) {
      editor.append(el('button', { class: 'lines-add', onclick: () => {
        arr.push('');
        onChange(arr.slice());
        rebuild();
      } }, '+ 줄 추가'));
    }
  };
  rebuild();
  wrap.append(editor);
  return wrap;
}

function stepsField(card) {
  const wrap = el('div', { class: 'field' });
  wrap.append(el('label', {}, '단계 (최대 5개) — 단계명과 짧은 설명'));
  const list = el('div', {});
  const rebuild = () => {
    list.innerHTML = '';
    (card.items || []).forEach((it, i) => {
      const textInput = el('input', { type: 'text', value: it.text || '', placeholder: '단계명' });
      const subInput = el('input', { type: 'text', value: it.sub || '', placeholder: '짧은 설명 (선택)' });
      textInput.addEventListener('input', () => { it.text = textInput.value; store.updateCard(store.selected, () => {}); });
      subInput.addEventListener('input', () => { it.sub = subInput.value; store.updateCard(store.selected, () => {}); });
      list.append(el('div', { class: 'step-row' },
        el('span', { class: 'step-no' }, String(i + 1)),
        el('div', { class: 'step-fields' }, textInput, subInput),
        el('button', { class: 'row-x', title: '단계 삭제', onclick: () => {
          store.updateCard(store.selected, (c) => {
            c.items = c.items.filter((_, j) => j !== i);
            if (!c.items.length) c.items = [{ text: '', sub: '' }];
          });
          renderEditor();
        } }, '✕'),
      ));
    });
    if ((card.items || []).length < 5) {
      list.append(el('button', { class: 'lines-add', onclick: () => {
        store.updateCard(store.selected, (c) => {
          if (!Array.isArray(c.items)) c.items = [];
          c.items.push({ text: '', sub: '' });
        });
        renderEditor();
      } }, '+ 단계 추가'));
    }
  };
  rebuild();
  wrap.append(list);
  return wrap;
}

function mediaField(card) {
  const box = el('div', { class: `media-box ${card.media ? 'has-image' : ''}` });
  const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: '' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const norm = await normalizeImage(file);
      store.updateCard(store.selected, (c) => { c.media = norm; });
      renderEditor();
      toast('이미지를 추가했습니다.');
    } catch (e) {
      toast('이미지를 불러오지 못했습니다: ' + e.message, { type: 'warn' });
    }
  });
  if (card.media) {
    box.append(el('img', { src: card.media.src, alt: '카드 이미지' }));
  } else {
    box.append(el('div', { class: 'media-empty' }, '이미지가 없습니다.\n플레이스홀더로 표시됩니다.'));
  }
  box.append(el('div', { class: 'media-actions' },
    el('button', { class: 'btn btn-small', onclick: () => fileInput.click() }, card.media ? '이미지 교체' : '이미지 추가'),
    card.media ? el('button', { class: 'btn btn-small btn-danger-ghost', onclick: () => {
      store.updateCard(store.selected, (c) => { c.media = null; });
      renderEditor();
    } }, '제거') : null,
  ), fileInput);
  return box;
}

// 레이아웃 미니 아이콘 (SVG)
function layoutIcon(id) {
  const s = `<svg width="22" height="28" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg">`;
  const stroke = `stroke="currentColor" stroke-width="1.6"`;
  const icons = {
    'cover-media': `<rect x="1.5" y="1.5" width="19" height="25" rx="2.5" ${stroke}/><path d="M1.5 17 C7 15 15 20 20.5 18 V24 a2 2 0 0 1 -2 2 H3.5 a2 2 0 0 1 -2 -2 Z" fill="currentColor" opacity="0.75"/>`,
    'media-top': `<rect x="1.5" y="1.5" width="19" height="12" rx="2" ${stroke}/><path d="M4 18h14M4 21.5h11M4 25h9" ${stroke} stroke-linecap="round"/>`,
    'media-full': `<rect x="1.5" y="1.5" width="19" height="25" rx="2.5" ${stroke}/><path d="M3 19h16v5a1.5 1.5 0 0 1 -1.5 1.5h-13A1.5 1.5 0 0 1 3 24Z" fill="currentColor" opacity="0.7"/>`,
    compare: `<rect x="1.5" y="4" width="8.5" height="20" rx="2" ${stroke}/><rect x="12" y="4" width="8.5" height="20" rx="2" ${stroke} fill="currentColor" fill-opacity="0.25"/>`,
    checklist: `<path d="M4 6.5l2 2 3.5-3.5" ${stroke}/><path d="M4 14l2 2 3.5-3.5" ${stroke}/><path d="M4 21.5l2 2 3.5-3.5" ${stroke}/><path d="M13 7h6M13 14.5h6M13 22h6" ${stroke} stroke-linecap="round"/>`,
    steps: `<rect x="1.5" y="2.5" width="7" height="6" rx="1.5" ${stroke} fill="currentColor" fill-opacity="0.25"/><rect x="1.5" y="11" width="7" height="6" rx="1.5" ${stroke}/><rect x="1.5" y="19.5" width="7" height="6" rx="1.5" ${stroke} fill="currentColor" fill-opacity="0.25"/><path d="M12 5.5h8M12 14h8M12 22.5h8" ${stroke} stroke-linecap="round"/>`,
    cta: `<circle cx="11" cy="14" r="6.5" ${stroke} fill="currentColor" fill-opacity="0.3"/><path d="M5 25h12" ${stroke} stroke-linecap="round"/>`,
  };
  return el('span', { html: s + (icons[id] || '') + '</svg>' });
}

// ---------- 카드 삭제 ----------
function deleteCard(i) {
  if (store.project.cards.length <= 1) {
    toast('마지막 카드는 삭제할 수 없습니다.', { type: 'warn' });
    return;
  }
  store.deleteCard(i);
  toast('카드를 삭제했습니다.', {
    actionLabel: '실행 취소',
    onAction: () => store.restoreDeleted(),
    timeout: 6000,
  });
}

// ---------- 모달: 설정 ----------
function openSettings() {
  const P = store.project;
  openModal('프로젝트 설정', '카드 공통 브랜드·테마·출처를 지정합니다. 모든 카드에 즉시 반영됩니다.', (box, close) => {
    const handle = inputRow(P.handle, '@your_handle');
    const sourceLabel = inputRow(P.sourceLabel, 'CARD NEWS');
    const sourceUrl = inputRow(P.sourceUrl, 'https://...');
    const themeSel = el('select', {},
      el('option', { value: 'light' }, '라이트'),
      el('option', { value: 'dark' }, '다크'),
    );
    themeSel.value = P.theme;

    const colorInput = el('input', { type: 'color', value: P.accent });
    const swatches = el('div', { class: 'swatches' });
    const PRESETS = ['#0071e3', '#2997ff', '#0066cc', '#1D1D1F', '#FF5A36', '#8B5CF6', '#34A853'];
    const rebuildSwatches = () => {
      swatches.innerHTML = '';
      for (const c of PRESETS) {
        swatches.append(el('button', {
          class: `swatch ${P.accent.toLowerCase() === c.toLowerCase() ? 'active' : ''}`,
          style: `background:${c}`,
          title: c,
          onclick: () => { P.accent = c; colorInput.value = c; apply(); rebuildSwatches(); },
        }));
      }
    };

    const hashtags = inputRow(P.hashtags.join(', '), '#카드뉴스, #정보디자인');

    function apply() {
      store.update((p) => {
        p.handle = handle.input.value;
        p.sourceLabel = sourceLabel.input.value;
        p.sourceUrl = sourceUrl.input.value;
        p.theme = themeSel.value;
        p.accent = colorInput.value;
        p.hashtags = hashtags.input.value.split(',').map((s) => s.trim()).filter(Boolean);
      });
    }
    for (const r of [handle, sourceLabel, sourceUrl, hashtags]) r.input.addEventListener('input', apply);
    themeSel.addEventListener('change', apply);
    colorInput.addEventListener('input', () => { apply(); rebuildSwatches(); });
    rebuildSwatches();

    box.append(
      el('div', { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, '핸들 (카드 상단)'), handle.input),
        el('div', { class: 'field' }, el('label', {}, '태그/출처 라벨'), sourceLabel.input),
        el('div', { class: 'field' }, el('label', {}, '출처 URL'), sourceUrl.input),
        el('div', { class: 'field' }, el('label', {}, '카드 테마'), themeSel),
        el('div', { class: 'field' }, el('label', {}, '액센트 색'), colorInput),
        el('div', { class: 'field' }, el('label', {}, '해시태그 (쉼표 구분)'), hashtags.input),
      ),
      el('div', { class: 'field' }, el('label', {}, '색상 프리셋'), swatches),
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn btn-danger-ghost', onclick: () => {
          if (!confirm('샘플 프로젝트로 초기화합니다. 현재 작업은 사라집니다. 계속할까요?')) return;
          store.setProject(sampleProject());
          renderEditor();
          close();
          toast('샘플 프로젝트로 초기화했습니다.');
        } }, '샘플로 초기화'),
        el('button', { class: 'btn btn-primary', onclick: close }, '완료'),
      ),
    );
  });
}

function inputRow(value, placeholder) {
  const input = el('input', { type: 'text', value: value || '', placeholder });
  return { input };
}

// ---------- 모달: 캡션 ----------
function openCaption() {
  openModal('게시 캡션', '카드 내용으로부터 Instagram·Threads용 캡션을 만듭니다. 자유롭게 손본 뒤 복사해 사용하세요.', (box) => {
    const ta = el('textarea', { class: 'big', spellcheck: 'false' });
    ta.value = buildCaption(store.project);
    box.append(ta);
    box.append(el('div', { class: 'modal-actions' },
      el('button', { class: 'btn', onclick: () => { ta.value = buildCaption(store.project); } }, '다시 생성'),
      el('button', { class: 'btn btn-primary', onclick: async () => {
        try {
          await navigator.clipboard.writeText(ta.value);
          toast('캡션을 클립보드에 복사했습니다.');
        } catch {
          ta.select();
          document.execCommand('copy');
          toast('캡션을 복사했습니다.');
        }
      } }, '복사'),
    ));
  });
}

// ---------- 모달: AI 초안 ----------
const AI_PROMPT = `인스타그램/스레드에 올릴 한국어 카드뉴스 7장을 기획해 JSON으로만 출력해줘. 설명은 붙이지 말고 JSON 코드블록 하나만.

카드 흐름(순서 준수):
1) 독자가 겪는 상황이나 강한 결과 (표지)
2) 지금 방식의 문제
3) 기능/방법을 쉬운 말로 설명
4) 실제 화면·수치·사례 근거
5) 오늘 바로 해볼 사용법
6) 쓰기 전/후 비교
7) 저장·댓글·팔로우 유도 CTA

카피 규칙:
- 제목(title)은 의미 단위 줄 배열, 최대 3줄, 한 줄은 짧게
- 본문(body)은 최대 3줄, 기능명보다 결과를 먼저, 번역투 금지
- 모든 문장은 구체적인 행동 중심으로

JSON 형식:
{"title":"프로젝트명","handle":"@핸들","sourceUrl":"출처 URL","cards":[
 {"layout":"cover-media","badge":"짧은 배지","title":["줄1","줄2"],"body":["줄1","줄2"]},
 {"layout":"media-top","badge":"","title":["..."],"body":["...","..."]},
 {"layout":"checklist","title":["..."],"body":["..."],"items":["항목1","항목2","항목3","항목4"]},
 {"layout":"media-full","badge":"실제 화면","title":["..."],"body":["..."]},
 {"layout":"steps","title":["..."],"body":["..."],"items":[{"text":"단계명","sub":"짧은 설명"}]},
 {"layout":"compare","title":["..."],"body":["..."],"compare":{"labelA":"쓰기 전","itemsA":["..."],"labelB":"쓴 후","itemsB":["..."]}},
 {"layout":"cta","title":["...","..."],"body":["..."],"items":[{"action":"액션 버튼 문구"}]}
]}

layout은 cover-media / media-top / media-full / compare / checklist / steps / cta 중 하나만 사용.
주제: 【여기에 주제나 참고할 원문·URL을 붙여넣기】`;

function openAI() {
  openModal('✨ AI 초안 만들기', '이 서비스는 "AI는 기획만, 레이아웃은 코드가" 담당하는 구조입니다. 아래 프롬프트를 ChatGPT/Claude 등에 붙여넣어 JSON 초안을 받아오세요.', (box) => {
    const pre = el('pre', {}, AI_PROMPT);
    const ta = el('textarea', { class: 'big', placeholder: 'AI가 만들어준 JSON을 여기에 붙여넣고 [프로젝트로 가져오기]를 누르세요.' });

    box.append(
      el('div', { class: 'field' }, el('label', {}, '1. 프롬프트 복사 (주제 칸 교체)'), pre,
        el('button', { class: 'btn', onclick: async () => {
          try { await navigator.clipboard.writeText(AI_PROMPT); toast('프롬프트를 복사했습니다.'); }
          catch { toast('복사 실패 — 직접 선택해 복사해 주세요.', { type: 'warn' }); }
        } }, '프롬프트 복사')),
      el('div', { class: 'field' }, el('label', {}, '2. 결과 JSON 붙여넣기'), ta),
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn btn-primary', onclick: () => {
          let raw = ta.value.trim();
          if (!raw) { toast('JSON을 붙여넣어 주세요.', { type: 'warn' }); return; }
          const m = raw.match(/\{[\s\S]*\}/);
          if (m) raw = m[0];
          try {
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.cards) || !parsed.cards.length) throw new Error('cards 배열이 없습니다.');
            if (!confirm('현재 프로젝트를 AI 초안으로 교체할까요?')) return;
            store.setProject(parsed);
            renderEditor();
            $('#modal-root').innerHTML = '';
            toast('AI 초안을 가져왔습니다. 이미지는 직접 넣어주세요.');
          } catch (e) {
            toast('JSON 해석 실패: ' + e.message, { type: 'warn', timeout: 5000 });
          }
        } }, '프로젝트로 가져오기'),
      ),
    );
  });
}

// ---------- 헤더 / 키보드 ----------
function wireHeader() {
  const titleInput = $('#project-title');
  titleInput.value = store.project.title;
  titleInput.addEventListener('input', () => {
    store.project.title = titleInput.value;
    store.save();
  });

  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-caption').addEventListener('click', openCaption);
  $('#btn-ai').addEventListener('click', openAI);

  $('#btn-json-save').addEventListener('click', () => {
    exportProjectJSON(store.project);
    toast('프로젝트 JSON을 저장했습니다.');
  });

  $('#btn-json-load').addEventListener('click', () => $('#file-json').click());
  $('#file-json').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.cards)) throw new Error('cards 배열이 없습니다.');
      store.setProject(parsed);
      renderEditor();
      toast('프로젝트를 불러왔습니다.');
    } catch (err) {
      toast('불러오기 실패: ' + err.message, { type: 'warn', timeout: 5000 });
    }
    e.target.value = '';
  });

  $('#btn-png').addEventListener('click', async () => {
    try {
      await exportCardPNG(store.project, store.selected);
      toast(`${store.selected + 1}번 카드 PNG를 저장했습니다.`);
    } catch (e) {
      toast('PNG 저장 실패: ' + e.message, { type: 'warn' });
    }
  });

  const zipBtn = $('#btn-zip');
  zipBtn.addEventListener('click', async () => {
    const original = zipBtn.innerHTML;
    try {
      zipBtn.disabled = true;
      zipBtn.textContent = '카드 만드는 중…';
      await exportAllZip(store.project, (i, n) => { zipBtn.textContent = `카드 만드는 중… (${i}/${n})`; });
      toast('ZIP 다운로드를 시작했습니다. PNG + 캡션 + 프로젝트 JSON이 들어 있습니다.');
    } catch (e) {
      log.error(e);
      toast('ZIP 생성 실패: ' + e.message, { type: 'warn', timeout: 5000 });
    } finally {
      zipBtn.disabled = false;
      zipBtn.innerHTML = original;
    }
  });

  $('#nav-prev').addEventListener('click', () => store.select(store.selected - 1));
  $('#nav-next').addEventListener('click', () => store.select(store.selected + 1));
}

function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'ArrowLeft' && !typing) { e.preventDefault(); store.select(store.selected - 1); }
    else if (e.key === 'ArrowRight' && !typing) { e.preventDefault(); store.select(store.selected + 1); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      $('#btn-zip').click();
    }
  });
}

// ---------- 스토어 이벤트 ----------
function wireStore() {
  store.on('project', async () => {
    const P = store.project;
    await ensureImages(P);
    renderMain();
    qaResult = runQA(P);
    renderRail();
    renderQA();
    const t = $('#project-title');
    if (t.value !== P.title) t.value = P.title;
  });
  store.on('selection', () => {
    renderMain();
    renderEditor();
    renderQA();
    document.querySelectorAll('.rail-item').forEach((n) => {
      n.classList.toggle('active', Number(n.dataset.index) === store.selected);
    });
  });
  store.on('quota-exceeded', () => {
    toast('브라우저 저장 공간이 부족해 자동저장에 실패했습니다. 이미지를 줄이거나 JSON으로 백업해 주세요.', { type: 'warn', timeout: 6000 });
  });
}

// ---------- 부트 ----------
(async function boot() {
  try {
    await loadFonts();
  } catch (e) {
    log.warn('폰트 로드 실패, 시스템 폰트로 진행:', e);
  }
  const restored = store.load();
  if (!restored) {
    store.setProject(sampleProject(), { silent: true });
    store.save(); // 새 사용자도 새로고침 시 작업이 유지되도록
  }

  wireHeader();
  wireStore();
  wireKeyboard();

  await repaint({ editor: true });

  if (restored) toast('마지막 작업을 복원했습니다.', { timeout: 2200 });
  log.info('카드뉴스 스튜디오 시작');
})();
