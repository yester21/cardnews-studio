// layouts.js — 7종 고정 레이아웃 카드 렌더러 (1080x1350, 4:5)
// 설계 원칙(레퍼런스 Auto-card-news 계승):
//  - 레이아웃은 코드가 고정한다. 좌표를 외부에서 넣지 않는다.
//  - 카피는 "의미 단위 줄 배열"로 받고 자동 줄바꿈을 하지 않는다.
//  - 넘칠 경우 블록 폰트를 축소(하한 68%)하고, 그래도 넘치면 QA 경고 대상이 된다.
import { font } from './fonts.js';
import { clamp, rgba, hostnameOf } from './util.js';

export const CARD_W = 1080;
export const CARD_H = 1350;
const MX = 72; // 좌우 안전 여백
const CONTENT_TOP = 190; // 브랜드 바 아래 콘텐츠 시작 y
const CONTENT_BOTTOM = 1210; // 푸터 위 콘텐츠 하한 y
const MIN_FONT_SCALE = 0.68;

export const LAYOUTS = [
  { id: 'cover-media', name: '표지', desc: '큰 이미지 + 후크 문구 (첫 장)' },
  { id: 'media-top', name: '상단 이미지', desc: '위 이미지, 아래 설명' },
  { id: 'media-full', name: '풀 이미지', desc: '증거 화면 전체 + 캡션' },
  { id: 'compare', name: '비교', desc: '전 / 후 두 패널 비교' },
  { id: 'checklist', name: '체크리스트', desc: '항목 점검 목록' },
  { id: 'steps', name: '단계', desc: '번호가 붙은 실행 순서' },
  { id: 'cta', name: 'CTA', desc: '행동 유도 마무리 장' },
];

// Apple Reference Design System 팔레트:
// Fog Canvas #f5f5f7 / Surface #ffffff / Foreground #1d1d1f / Muted #6e6e73 / Dark Canvas #000000
const THEMES = {
  light: {
    isDark: false,
    bg: '#F5F5F7', ink: '#1D1D1F', sub: '#6E6E73', faint: 'rgba(110,110,115,0.65)',
    hair: 'rgba(29,29,31,0.10)', panel: 'rgba(29,29,31,0.045)', panelBorder: 'rgba(29,29,31,0.08)',
  },
  dark: {
    isDark: true,
    bg: '#000000', ink: '#F5F5F7', sub: 'rgba(245,245,247,0.64)', faint: 'rgba(245,245,247,0.42)',
    hair: 'rgba(245,245,247,0.14)', panel: 'rgba(245,245,247,0.07)', panelBorder: 'rgba(245,245,247,0.10)',
  },
};

// ---------- 이미지 캐시 ----------
const imgCache = new Map(); // src -> Image
const imgWaiting = new Set();

export async function ensureImages(project) {
  const jobs = [];
  for (const c of project.cards) {
    const src = c.media && c.media.src;
    if (!src || imgCache.has(src) || imgWaiting.has(src)) continue;
    imgWaiting.add(src);
    jobs.push(
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          imgCache.set(src, img);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src;
      }).finally(() => imgWaiting.delete(src))
    );
  }
  if (jobs.length) await Promise.all(jobs);
}

// ---------- 그리기 프리미티브 ----------
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCoverImage(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// 줄 배열 블록: 최대 폭에 맞춰 블록 전체 폰트를 축소한다.
// returns { size, overflow, height }
export function fitBlock(ctx, lines, weight, size, maxW) {
  ctx.font = font(weight, size);
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
  let finalSize = size;
  let overflow = false;
  if (widest > maxW) {
    const scale = maxW / widest;
    if (scale < MIN_FONT_SCALE) {
      finalSize = size * MIN_FONT_SCALE;
      overflow = true;
    } else {
      finalSize = size * scale;
    }
  }
  return { size: finalSize, overflow };
}

function clipLine(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// 줄 배열 그리기. opts: {x, y, weight, size, color, lh, maxW, align, maxLines}
// returns { bottom, overflow, linesDrawn }
function drawLines(ctx, lines, opts) {
  const {
    x, y, weight, size, color, lh = 1.42, maxW = CARD_W - 2 * MX,
    align = 'left', maxLines = 99,
  } = opts;
  const shown = lines.slice(0, maxLines);
  const fit = fitBlock(ctx, shown, weight, size, maxW);
  ctx.font = font(weight, fit.size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const step = fit.size * lh;
  let cx = align === 'center' ? CARD_W / 2 : align === 'right' ? CARD_W - MX : x;
  shown.forEach((l, i) => {
    let text = l;
    if (fit.overflow) text = clipLine(ctx, text, maxW);
    ctx.fillText(text, cx, y + i * step + (step - fit.size) / 2);
  });
  ctx.textAlign = 'left';
  return { bottom: y + shown.length * step, overflow: fit.overflow, linesDrawn: shown.length, size: fit.size, step };
}

function drawSpaced(ctx, text, x, y, spacing) {
  // 수동 자간 텍스트 (오른쪽 끝 x에서 끝나도록)
  ctx.textBaseline = 'top';
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + spacing;
  total -= spacing;
  let cx = x - total;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

// 배지(알약). anchor: {x, y}(top-left) 또는 center. returns { bottom, height }
function drawBadge(ctx, text, accent, opt = {}) {
  if (!text) return { bottom: opt.y || 0, height: 0, skipped: true };
  const size = opt.size || 30;
  ctx.font = font(500, size);
  const tw = ctx.measureText(text).width;
  const padX = opt.padX || 26;
  const h = (opt.h || 60);
  const w = tw + padX * 2;
  let x = opt.x;
  if (opt.center) x = CARD_W / 2 - w / 2;
  ctx.fillStyle = opt.outline ? 'transparent' : accent;
  roundRect(ctx, x, opt.y, w, h, h / 2);
  if (opt.outline) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.fill();
  }
  ctx.fillStyle = opt.outline ? accent : '#FFFFFF';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + padX, opt.y + (h - size) / 2 + 1);
  return { bottom: opt.y + h, height: h };
}

// ---------- 공통 크롬(브랜드 바 + 푸터) ----------
function drawChrome(ctx, P, card, idx, total, T, onDark) {
  const ink = onDark ? 'rgba(255,255,255,0.96)' : T.ink;
  const sub = onDark ? 'rgba(255,255,255,0.62)' : T.sub;
  const faint = onDark ? 'rgba(255,255,255,0.45)' : T.faint;
  const accent = P.accent;

  // 상단 브랜드: 액센트 점 + 핸들 (좌), 태그 (우)
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(MX + 7, 76, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = font(500, 33);
  ctx.fillStyle = ink;
  ctx.textBaseline = 'top';
  ctx.fillText(P.handle || '@your_handle', MX + 28, 60);

  const tag = (P.sourceLabel || 'CARD NEWS').toUpperCase();
  ctx.font = font(500, 25);
  ctx.fillStyle = faint;
  drawSpaced(ctx, tag, CARD_W - MX, 66, 4);

  // 푸터: 구분선 + 좌측 노트 / 우츠 페이지 번호
  const hairY = 1244;
  ctx.strokeStyle = onDark ? 'rgba(255,255,255,0.22)' : T.hair;
  ctx.lineWidth = onDark ? 1.5 : 1;
  ctx.beginPath();
  ctx.moveTo(MX, hairY + 0.5);
  ctx.lineTo(CARD_W - MX, hairY + 0.5);
  ctx.stroke();

  const note = card.footerNote || (P.sourceUrl ? `${P.sourceLabel || '출처'}: ${hostnameOf(P.sourceUrl)}` : '');
  if (note) {
    ctx.font = font(300, 25);
    ctx.fillStyle = sub;
    ctx.textBaseline = 'top';
    ctx.fillText(clipLine(ctx, note, CARD_W - 2 * MX - 160), MX, 1268);
  }
  const pageStr = `${idx + 1} / ${total}`;
  ctx.font = font(500, 27);
  ctx.fillStyle = sub;
  const pw = ctx.measureText(pageStr).width;
  ctx.fillText(pageStr, CARD_W - MX - pw, 1266);
}

// 이미지 없을 때 플레이스홀더 (사선 패턴 + 카메라 글리프)
function drawPlaceholder(ctx, accent, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = '#E8E8EA';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(accent, 0.14);
  ctx.lineWidth = 3;
  for (let d = -h; d < w; d += 44) {
    ctx.beginPath();
    ctx.moveTo(x + d, y + h);
    ctx.lineTo(x + d + h, y);
    ctx.stroke();
  }
  // 중앙 카메라 글리프
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.strokeStyle = 'rgba(26,27,30,0.35)';
  ctx.fillStyle = 'rgba(26,27,30,0.35)';
  ctx.lineWidth = 5;
  roundRect(ctx, cx - 62, cy - 40, 124, 88, 16);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + 4, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + 4, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = font(500, 28);
  ctx.textBaseline = 'top';
  const t = '이미지를 추가하세요';
  ctx.fillText(t, cx - ctx.measureText(t).width / 2, cy + 66);
  ctx.restore();
}

function drawMedia(ctx, card, accent, x, y, w, h) {
  const img = card.media && card.media.src ? imgCache.get(card.media.src) : null;
  if (img) drawCoverImage(ctx, img, x, y, w, h);
  else drawPlaceholder(ctx, accent, x, y, w, h);
  return !!img;
}

function verticalScrim(ctx, from, alphaStart, alphaEnd) {
  const g = ctx.createLinearGradient(0, from, 0, CARD_H);
  g.addColorStop(0, `rgba(0,0,0,${alphaStart})`);
  g.addColorStop(1, `rgba(0,0,0,${alphaEnd})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, from, CARD_W, CARD_H - from);
}

// ---------- 개별 레이아웃 ----------
function layCoverMedia(ctx, P, card, T) {
  const accent = P.accent;
  const hasImg = drawMedia(ctx, card, accent, 0, 0, CARD_W, CARD_H);
  if (hasImg) verticalScrim(ctx, CARD_H * 0.3, 0, 0.86);
  else {
    // 플레이스홀더 위 은은한 액센트 링 장식
    ctx.strokeStyle = rgba(accent, 0.35);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CARD_W - 140, 330, 150, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawChrome(ctx, P, card, card._index, card._total, T, true);

  // 하단 앵커 스택: 배지 → 제목 → 본문(최대 2줄)
  const blocks = [];
  if (card.badge) blocks.push({ kind: 'badge', h: 60 });
  const titleN = Math.min(card.title.length, 3);
  if (titleN) blocks.push({ kind: 'title', h: titleN * 88 * 1.16 });
  const bodyN = Math.min(card.body.length, 2);
  if (bodyN) blocks.push({ kind: 'body', h: bodyN * 38 * 1.5 });

  const gaps = 30;
  const totalH = blocks.reduce((s, b) => s + b.h, 0) + gaps * Math.max(0, blocks.length - 1);
  let y = 1150 - totalH;
  for (const b of blocks) {
    if (b.kind === 'badge') {
      drawBadge(ctx, card.badge, accent, { x: MX, y, size: 30, h: 60 });
      y += b.h + gaps;
    } else if (b.kind === 'title') {
      const r = drawLines(ctx, card.title, { x: MX, y, weight: 700, size: 88, color: '#FFFFFF', lh: 1.16, maxLines: 3 });
      card._overflow = card._overflow || r.overflow;
      y += b.h + gaps;
    } else {
      const r = drawLines(ctx, card.body, { x: MX, y, weight: 500, size: 38, color: 'rgba(255,255,255,0.88)', lh: 1.5, maxLines: 2 });
      card._overflow = card._overflow || r.overflow;
      y += b.h + gaps;
    }
  }
}

function layMediaTop(ctx, P, card, T) {
  const accent = P.accent;
  const mediaH = 736;
  const hasImg = drawMedia(ctx, card, accent, 0, 0, CARD_W, mediaH);
  // 브랜드 바는 미디어 위에 (플레이스홀더일 땐 어두운 텍스트)
  drawChromeTopOnly(ctx, P, card, T, hasImg);
  // 미디어 하단 액센트 라인
  ctx.fillStyle = accent;
  ctx.fillRect(0, mediaH, CARD_W, 5);

  let y = mediaH + 62;
  if (card.badge) {
    const r = drawBadge(ctx, card.badge, accent, { x: MX, y, size: 28, h: 54 });
    y = r.bottom + 30;
  }
  if (card.title.length) {
    const r = drawLines(ctx, card.title, { x: MX, y, weight: 700, size: 62, color: T.ink, lh: 1.22, maxLines: 3 });
    card._overflow = card._overflow || r.overflow;
    y = r.bottom + 30;
  }
  if (card.body.length) {
    const r = drawLines(ctx, card.body, { x: MX, y, weight: 500, size: 38, color: T.sub, lh: 1.55, maxLines: 3 });
    card._overflow = card._overflow || r.overflow;
  }
  drawChromeFooterOnly(ctx, P, card, T, false);
}

function layMediaFull(ctx, P, card, T) {
  const accent = P.accent;
  const hasImg = drawMedia(ctx, card, accent, 0, 0, CARD_W, CARD_H);
  if (hasImg) verticalScrim(ctx, CARD_H * 0.5, 0, 0.85);
  drawChrome(ctx, P, card, card._index, card._total, T, true);

  // 하단 앵커: 배지 → 제목(최대3) → 본문(최대2)
  const blocks = [];
  if (card.badge) blocks.push({ kind: 'badge', h: 58 });
  const titleN = Math.min(card.title.length, 3);
  if (titleN) blocks.push({ kind: 'title', h: titleN * 74 * 1.18 });
  const bodyN = Math.min(card.body.length, 2);
  if (bodyN) blocks.push({ kind: 'body', h: bodyN * 34 * 1.5 });
  const gaps = 28;
  const totalH = blocks.reduce((s, b) => s + b.h, 0) + gaps * Math.max(0, blocks.length - 1);
  let y = 1160 - totalH;
  for (const b of blocks) {
    if (b.kind === 'badge') {
      drawBadge(ctx, card.badge, accent, { x: MX, y, size: 28, h: 58 });
    } else if (b.kind === 'title') {
      const r = drawLines(ctx, card.title, { x: MX, y, weight: 700, size: 74, color: '#FFFFFF', lh: 1.18, maxLines: 3 });
      card._overflow = card._overflow || r.overflow;
    } else {
      const r = drawLines(ctx, card.body, { x: MX, y, weight: 500, size: 34, color: 'rgba(255,255,255,0.86)', lh: 1.5, maxLines: 2 });
      card._overflow = card._overflow || r.overflow;
    }
    y += b.h + gaps;
  }
}

// 헤더(제목+본문 1줄)를 그리고 패널 시작 y 반환
function drawHeader(ctx, card, T) {
  let y = CONTENT_TOP;
  let overflow = false;
  if (card.title.length) {
    const r = drawLines(ctx, card.title, { x: MX, y, weight: 700, size: 58, color: T.ink, lh: 1.24, maxLines: 2 });
    overflow = overflow || r.overflow;
    y = r.bottom + 22;
  }
  if (card.body.length) {
    const r = drawLines(ctx, card.body, { x: MX, y, weight: 500, size: 35, color: T.sub, lh: 1.5, maxLines: 1 });
    overflow = overflow || r.overflow;
    y = r.bottom + 34;
  }
  return { y: Math.max(y, 360), overflow };
}

function layCompare(ctx, P, card, T) {
  const accent = P.accent;
  drawChrome(ctx, P, card, card._index, card._total, T, false);
  const head = drawHeader(ctx, card, T);
  card._overflow = head.overflow;

  const y0 = head.y;
  const y1 = CONTENT_BOTTOM + 30;
  const gap = 28;
  const pw = (CARD_W - 2 * MX - gap) / 2;
  const ph = y1 - y0;

  const panels = [
    { x: MX, label: (card.compare && card.compare.labelA) || 'BEFORE', items: (card.compare && card.compare.itemsA) || [], isA: true },
    { x: MX + pw + gap, label: (card.compare && card.compare.labelB) || 'AFTER', items: (card.compare && card.compare.itemsB) || [], isA: false },
  ];

  for (const p of panels) {
    roundRect(ctx, p.x, y0, pw, ph, 26);
    ctx.fillStyle = p.isA ? T.panel : rgba(accent, 0.10);
    ctx.fill();
    if (!p.isA) {
      ctx.strokeStyle = rgba(accent, 0.55);
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    // 라벨 알약
    const label = p.label.toUpperCase();
    ctx.font = font(700, 24);
    const lw = ctx.measureText(label).width + 40;
    ctx.fillStyle = p.isA ? (T.isDark ? 'rgba(245,245,247,0.16)' : 'rgba(29,29,31,0.10)') : accent;
    roundRect(ctx, p.x + 28, y0 + 28, lw, 50, 25);
    ctx.fill();
    ctx.fillStyle = p.isA ? T.sub : '#FFFFFF';
    ctx.textBaseline = 'top';
    ctx.fillText(label, p.x + 48, y0 + 41);

    // 항목 (최대 4) — 넘칠 때는 항목별로 축소 후, 그래도 길면 말줄임
    const items = p.items.slice(0, 4);
    let iy = y0 + 118;
    const innerW = pw - 56 - 44;
    for (const it of items) {
      // 아이콘: A패널 ×, B패널 ✓
      const cy = iy + 17;
      if (p.isA) {
        ctx.strokeStyle = T.faint;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(p.x + 34, cy - 8);
        ctx.lineTo(p.x + 50, cy + 8);
        ctx.moveTo(p.x + 50, cy - 8);
        ctx.lineTo(p.x + 34, cy + 8);
        ctx.stroke();
      } else {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(p.x + 42, cy, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(p.x + 34, cy + 1);
        ctx.lineTo(p.x + 40, cy + 8);
        ctx.lineTo(p.x + 51, cy - 7);
        ctx.stroke();
      }
      const fit = fitBlock(ctx, [it], 500, 32, innerW);
      ctx.font = font(500, fit.size);
      if (fit.overflow) card._overflow = true;
      ctx.fillStyle = T.ink;
      ctx.textBaseline = 'top';
      ctx.fillText(fit.overflow ? clipLine(ctx, it, innerW) : it, p.x + 74, iy + (32 - fit.size) / 2);
      iy += 66;
    }
  }
}

function layChecklist(ctx, P, card, T) {
  const accent = P.accent;
  drawChrome(ctx, P, card, card._index, card._total, T, false);
  const head = drawHeader(ctx, card, T);
  card._overflow = head.overflow;

  const items = (card.items || []).slice(0, 5);
  const y0 = head.y;
  const y1 = CONTENT_BOTTOM + 20;
  const gap = 22;
  const rowH = clamp((y1 - y0 - gap * (items.length - 1)) / Math.max(items.length, 1), 96, 158);
  let y = y0;
  for (const it of items) {
    roundRect(ctx, MX, y, CARD_W - 2 * MX, rowH, 24);
    ctx.fillStyle = T.panel;
    ctx.fill();
    // ✓ 칩
    const cy = y + rowH / 2;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(MX + 62, cy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(MX + 51, cy + 1);
    ctx.lineTo(MX + 59, cy + 10);
    ctx.lineTo(MX + 74, cy - 9);
    ctx.stroke();
    ctx.font = font(500, 37);
    ctx.fillStyle = T.ink;
    ctx.textBaseline = 'top';
    ctx.fillText(clipLine(ctx, it, CARD_W - 2 * MX - 140), MX + 116, cy - 19);
    y += rowH + gap;
  }
}

function laySteps(ctx, P, card, T) {
  const accent = P.accent;
  drawChrome(ctx, P, card, card._index, card._total, T, false);
  const head = drawHeader(ctx, card, T);
  card._overflow = head.overflow;

  const items = (card.items || []).slice(0, 5); // items: [{text, sub}] 또는 문자열
  const y0 = head.y;
  const y1 = CONTENT_BOTTOM + 20;
  const n = Math.max(items.length, 1);
  const gap = 26;
  const rowH = Math.max((y1 - y0 - gap * (n - 1)) / n, 100);
  let y = y0;
  items.forEach((it, i) => {
    const text = typeof it === 'string' ? it : it.text || '';
    const sub = typeof it === 'string' ? '' : it.sub || '';
    // 번호 칩
    const chip = 62;
    roundRect(ctx, MX, y + (rowH - chip) / 2, chip, chip, 16);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.font = font(700, 32);
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';
    const numStr = String(i + 1);
    ctx.fillText(numStr, MX + (chip - ctx.measureText(numStr).width) / 2, y + (rowH - chip) / 2 + 15);
    // 텍스트
    const tx = MX + chip + 32;
    const tw = CARD_W - MX - tx;
    ctx.font = font(700, 38);
    ctx.fillStyle = T.ink;
    ctx.fillText(clipLine(ctx, text, tw), tx, y + (rowH - chip) / 2 - (sub ? 2 : -14));
    if (sub) {
      ctx.font = font(400, 29);
      ctx.fillStyle = T.sub;
      if (ctx.measureText(sub).width > tw) card._overflow = true;
      ctx.fillText(clipLine(ctx, sub, tw), tx, y + (rowH - chip) / 2 + 44);
    }
    y += rowH + gap;
  });
}

function layCta(ctx, P, card, T) {
  const accent = P.accent;
  const hasImg = card.media && card.media.src && imgCache.get(card.media.src);
  if (hasImg) {
    drawCoverImage(ctx, imgCache.get(card.media.src), 0, 0, CARD_W, CARD_H);
    verticalScrim(ctx, 0, 0.55, 0.85);
  } else {
    // 이미지가 없으면 테마와 무관하게 다크 캔버스(#000000)로 마무리 장을 잡는다 (흰 텍스트 가독성)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.strokeStyle = rgba(accent, 0.5);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CARD_W - 60, 250, 210, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.25);
    ctx.beginPath();
    ctx.arc(120, CARD_H - 320, 140, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawChrome(ctx, P, card, card._index, card._total, T, true);

  // 중앙 스택: 배지 → 제목(최대3) → 본문(최대3) → 액션 알약 → 핸들
  const ink = '#FFFFFF';
  const parts = [];
  const titleN = Math.min(card.title.length, 3);
  const bodyN = Math.min(card.body.length, 3);
  if (card.badge) parts.push({ h: 58, gap: 34 });
  if (titleN) parts.push({ h: titleN * 78 * 1.18, gap: 34 });
  if (bodyN) parts.push({ h: bodyN * 36 * 1.5, gap: 46 });
  const action = (card.items && card.items.length && typeof card.items[0] === 'object' && card.items[0].action) || '';
  if (card.items && card.items.length && !action) parts.push({ h: Math.min(card.items.length, 3) * 44, gap: 46 }); // 보조 액션 줄
  if (action) parts.push({ h: 92, gap: 44, kind: 'action' });
  parts.push({ h: 40, kind: 'handle' });

  const totalH = parts.reduce((s, p) => s + p.h + (p.gap || 0), 0);
  let y = (CARD_H - totalH) / 2 - 40;

  if (card.badge) {
    drawBadge(ctx, card.badge, accent, { y, center: true, size: 28, h: 58 });
    y += 58 + 34;
  }
  if (titleN) {
    const r = drawLines(ctx, card.title, { x: MX, y, weight: 700, size: 78, color: ink, lh: 1.18, maxLines: 3, align: 'center' });
    card._overflow = card._overflow || r.overflow;
    y += titleN * 78 * 1.18 + 34;
  }
  if (bodyN) {
    const r = drawLines(ctx, card.body, { x: MX, y, weight: 500, size: 36, color: 'rgba(255,255,255,0.85)', lh: 1.5, maxLines: 3, align: 'center' });
    card._overflow = card._overflow || r.overflow;
    y += bodyN * 36 * 1.5 + 46;
  }
  if (card.items && card.items.length && !action) {
    const subs = card.items.slice(0, 3).map((i) => (typeof i === 'string' ? i : i.text));
    const r = drawLines(ctx, subs, { x: MX, y, weight: 500, size: 32, color: 'rgba(255,255,255,0.9)', lh: 1.4, maxLines: 3, align: 'center' });
    card._overflow = card._overflow || r.overflow;
    y += Math.min(subs.length, 3) * 44 + 46;
  }
  if (action) {
    ctx.font = font(700, 40);
    const tw = ctx.measureText(action).width;
    const w = tw + 112;
    roundRect(ctx, CARD_W / 2 - w / 2, y, w, 92, 46);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';
    ctx.fillText(action, CARD_W / 2 - tw / 2, y + 26);
    y += 92 + 44;
  }
  ctx.font = font(500, 33);
  ctx.fillStyle = 'rgba(255,255,255,0.66)';
  ctx.textBaseline = 'top';
  const handle = P.handle || '@your_handle';
  ctx.fillText(handle, CARD_W / 2 - ctx.measureText(handle).width / 2, y + 6);
}

// 크롬 분할 (media-top처럼 브랜드/푸터 시점이 다를 때)
function drawChromeTopOnly(ctx, P, card, T, onDark) {
  const ink = onDark ? 'rgba(255,255,255,0.96)' : T.ink;
  const faint = onDark ? 'rgba(255,255,255,0.5)' : T.faint;
  ctx.fillStyle = P.accent;
  ctx.beginPath();
  ctx.arc(MX + 7, 76, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = font(500, 33);
  ctx.fillStyle = ink;
  ctx.textBaseline = 'top';
  ctx.fillText(P.handle || '@your_handle', MX + 28, 60);
  const tag = (P.sourceLabel || 'CARD NEWS').toUpperCase();
  ctx.font = font(500, 25);
  ctx.fillStyle = faint;
  drawSpaced(ctx, tag, CARD_W - MX, 66, 4);
}

function drawChromeFooterOnly(ctx, P, card, T, onDark) {
  const sub = onDark ? 'rgba(255,255,255,0.62)' : T.sub;
  ctx.strokeStyle = onDark ? 'rgba(255,255,255,0.22)' : T.hair;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MX, 1244.5);
  ctx.lineTo(CARD_W - MX, 1244.5);
  ctx.stroke();
  const note = card.footerNote || (P.sourceUrl ? `${P.sourceLabel || '출처'}: ${hostnameOf(P.sourceUrl)}` : '');
  if (note) {
    ctx.font = font(300, 25);
    ctx.fillStyle = sub;
    ctx.textBaseline = 'top';
    ctx.fillText(clipLine(ctx, note, CARD_W - 2 * MX - 160), MX, 1268);
  }
  const pageStr = `${card._index + 1} / ${card._total}`;
  ctx.font = font(500, 27);
  ctx.fillStyle = sub;
  const pw = ctx.measureText(pageStr).width;
  ctx.fillText(pageStr, CARD_W - MX - pw, 1266);
}

// ---------- 메인 진입점 ----------
const RENDERERS = {
  'cover-media': layCoverMedia,
  'media-top': layMediaTop,
  'media-full': layMediaFull,
  compare: layCompare,
  checklist: layChecklist,
  steps: laySteps,
  cta: layCta,
};

/**
 * 카드 1장을 캔버스에 렌더링. 미리 ensureImages(project)을 완료해야 한다.
 * @returns {boolean} overflow 발생 여부 (QA용)
 */
export function renderCard(ctx, project, card, index) {
  const T = THEMES[project.theme === 'dark' ? 'dark' : 'light'] || THEMES.light;
  card._index = index;
  card._total = project.cards.length;
  card._overflow = false;

  ctx.save();
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const fn = RENDERERS[card.layout] || RENDERERS['media-top'];
  fn(ctx, project, card, T);

  // 공통 크롬은 각 레이아웃에서 처리 (미디어 위 여부가 다르므로)
  ctx.restore();
  return card._overflow;
}
