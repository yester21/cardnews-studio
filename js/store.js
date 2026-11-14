// store.js — 프로젝트 상태 + 간단 이벤트 버스 + localStorage 자동저장
import { uid } from './util.js';

const STORAGE_KEY = 'cardnews-studio-v2';

class Store {
  constructor() {
    this.listeners = new Map(); // event -> Set(fn)
    this.project = null;
    this.selected = 0;
    this.lastDeleted = null; // { card, index } — 삭제 실행취소용
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event).delete(fn);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (set) for (const fn of set) fn(payload);
  }

  load() {
    let restored = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && Array.isArray(p.cards) && p.cards.length) {
          this.project = normalizeProject(p);
          this.selected = 0;
          restored = true;
        }
      }
    } catch (e) {
      console.warn('[cardnews] 저장본 복원 실패:', e);
    }
    return restored;
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
      this.emit('saved');
      return true;
    } catch (e) {
      this.emit('quota-exceeded');
      return false;
    }
  }

  setProject(p, { silent = false } = {}) {
    this.project = normalizeProject(p);
    this.selected = clampInt(this.selected, 0, this.project.cards.length - 1);
    if (!silent) this.emit('project');
  }

  update(mutator) {
    mutator(this.project);
    this.save();
    this.emit('project');
  }

  updateCard(index, mutator) {
    if (!this.project.cards[index]) return;
    mutator(this.project.cards[index]);
    this.save();
    this.emit('project');
  }

  get current() {
    return this.project.cards[this.selected] || null;
  }

  select(i) {
    this.selected = clampInt(i, 0, this.project.cards.length - 1);
    this.emit('selection');
  }

  addCard(layout = 'media-top', afterSelected = true) {
    const card = blankCard(layout);
    const at = afterSelected ? this.selected + 1 : this.project.cards.length;
    this.project.cards.splice(at, 0, card);
    this.selected = at;
    this.save();
    this.emit('project');
    this.emit('selection');
    return card;
  }

  duplicateCard(index) {
    const src = this.project.cards[index];
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid();
    this.project.cards.splice(index + 1, 0, copy);
    this.selected = index + 1;
    this.save();
    this.emit('project');
    this.emit('selection');
  }

  deleteCard(index) {
    const card = this.project.cards[index];
    if (!card) return;
    this.lastDeleted = { card, index };
    this.project.cards.splice(index, 1);
    this.selected = clampInt(index, 0, this.project.cards.length - 1);
    this.save();
    this.emit('project');
    this.emit('selection');
  }

  restoreDeleted() {
    if (!this.lastDeleted) return;
    const { card, index } = this.lastDeleted;
    this.project.cards.splice(Math.min(index, this.project.cards.length), 0, card);
    this.selected = Math.min(index, this.project.cards.length - 1);
    this.lastDeleted = null;
    this.save();
    this.emit('project');
    this.emit('selection');
  }

  moveCard(index, dir) {
    const to = index + dir;
    const cards = this.project.cards;
    if (index < 0 || index >= cards.length || to < 0 || to >= cards.length) return;
    [cards[index], cards[to]] = [cards[to], cards[index]];
    this.selected = to;
    this.save();
    this.emit('project');
    this.emit('selection');
  }
}

export function blankCard(layout = 'media-top') {
  const base = {
    id: uid(),
    layout,
    badge: '',
    title: [''],
    body: [''],
    media: null,
    footerNote: '',
    items: [],
    compare: { labelA: 'BEFORE', labelB: 'AFTER', itemsA: [''], itemsB: [''] },
  };
  if (layout === 'steps') base.items = [{ text: '', sub: '' }];
  if (layout === 'cta') base.items = [{ text: '', action: '' }];
  return base;
}

// 외부 JSON(레퍼런스 content.draft.json 계열)을 내부 스키마로 정규화
export function normalizeProject(input) {
  const p = typeof input === 'string' ? JSON.parse(input) : input;
  const out = {
    version: 1,
    title: str(p.title, '제목 없는 카드뉴스'),
    handle: str(p.handle || p.brand, '@your_handle'),
    sourceLabel: str(p.sourceLabel, 'CARD NEWS'),
    sourceUrl: str(p.sourceUrl, ''),
    theme: p.theme === 'dark' ? 'dark' : 'light',
    accent: /^#[0-9a-fA-F]{6}$/.test(p.accent || '') ? p.accent : '#0071e3',
    hashtags: Array.isArray(p.hashtags) ? p.hashtags.filter((h) => typeof h === 'string') : [],
    cards: [],
  };
  const cards = Array.isArray(p.cards) ? p.cards : [];
  const KNOWN = ['cover-media', 'media-top', 'media-full', 'compare', 'checklist', 'steps', 'cta'];
  for (const c of cards) {
    const card = blankCard(KNOWN.includes(c.layout) ? c.layout : 'media-top');
    card.id = str(c.id, card.id);
    card.badge = str(c.badge || c.eyebrow, '');
    card.title = toLines(c.title !== undefined ? c.title : c.headline);
    card.body = toLines(c.body !== undefined ? c.body : c.subtitle);
    card.footerNote = str(c.footerNote || c.note, '');
    if (c.media && typeof c.media === 'object' && c.media.src) card.media = { src: c.media.src, w: c.media.w || 0, h: c.media.h || 0 };
    else if (typeof c.media === 'string' && /^data:|^https?:/.test(c.media)) card.media = { src: c.media, w: 0, h: 0 };
    if (Array.isArray(c.items)) {
      card.items = c.items.map((i) => {
        if (typeof i === 'string') return i;
        return { text: str(i.text, ''), sub: str(i.sub || i.desc, ''), action: str(i.action, '') };
      });
    }
    if (c.compare && typeof c.compare === 'object') {
      card.compare = {
        labelA: str(c.compare.labelA, 'BEFORE'),
        labelB: str(c.compare.labelB, 'AFTER'),
        itemsA: toLines(c.compare.itemsA),
        itemsB: toLines(c.compare.itemsB),
      };
    }
    // 레이아웃 기본값 재정비
    if (card.layout === 'steps' && (!card.items || !card.items.length)) card.items = [{ text: '', sub: '' }];
    if (card.layout === 'cta' && Array.isArray(card.items) && card.items.length && typeof card.items[0] === 'string') {
      card.items = card.items.map((t) => ({ text: t }));
    }
    out.cards.push(card);
  }
  if (!out.cards.length) out.cards = [blankCard('cover-media')];
  return out;
}

function str(v, fallback) {
  return typeof v === 'string' ? v : fallback;
}

function toLines(v) {
  if (v === undefined || v === null) return [''];
  if (typeof v === 'string') return v.split('\n').filter((l, i, a) => l.trim() !== '' || a.length === 1);
  if (Array.isArray(v)) return v.map((l) => (typeof l === 'string' ? l : String(l ?? '')));
  return [''];
}

function clampInt(v, min, max) {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

export const store = new Store();
