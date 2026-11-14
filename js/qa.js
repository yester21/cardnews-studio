// qa.js — 렌더 전 정적 QA 검사 (레퍼런스의 카피 계약 검사를 웹서비스용으로 축약)
// 원칙: 차단이 아니라 경고. 렌더러의 overflow 플래그와 함께 표시된다.

const LIMITS = {
  titleLines: 3,
  bodyLines: 3,
  compareItems: 4,
  checklistItems: 5,
  stepItems: 5,
};

export function runQA(project) {
  const cardWarnings = new Map();
  const global = [];

  const warn = (id, msg) => {
    if (!cardWarnings.has(id)) cardWarnings.set(id, []);
    cardWarnings.get(id).push(msg);
  };

  if (!project.handle || !project.handle.trim()) global.push('브랜드 핸들(@handle)이 비어 있습니다 — 설정에서 넣어주세요.');
  if (project.cards.length !== 7) global.push(`카드가 ${project.cards.length}장입니다. 인스타그램 카드뉴스 표준 흐름은 7장입니다. (그대로 사용해도 됩니다)`);
  if (!project.sourceUrl) global.push('출처 URL이 없습니다. 근거 있는 카드뉴스를 위해 출처를 남기는 걸 권장합니다.');

  const mediaLayouts = ['cover-media', 'media-top', 'media-full'];
  project.cards.forEach((c, i) => {
    if (c.title.filter((l) => l.trim()).length === 0) warn(c.id, '제목이 비어 있습니다.');
    if (c.title.length > LIMITS.titleLines) warn(c.id, `제목이 ${c.title.length}줄입니다 (권장 3줄 이내).`);
    if (c.body.length > LIMITS.bodyLines) warn(c.id, `본문이 ${c.body.length}줄입니다 (권장 3줄 이내).`);
    if (mediaLayouts.includes(c.layout) && !c.media) warn(c.id, '이미지 레이아웃인데 이미지가 없습니다.');
    if (c.layout === 'compare') {
      const cmp = c.compare || {};
      if ((cmp.itemsA || []).filter((x) => x.trim()).length < 2) warn(c.id, '비교 A 항목이 부족합니다 (2개 이상 권장).');
      if ((cmp.itemsB || []).filter((x) => x.trim()).length < 2) warn(c.id, '비교 B 항목이 부족합니다 (2개 이상 권장).');
      if ((cmp.itemsA || []).length > LIMITS.compareItems || (cmp.itemsB || []).length > LIMITS.compareItems)
        warn(c.id, `비교 항목은 각 ${LIMITS.compareItems}개까지 표시됩니다.`);
    }
    if (c.layout === 'checklist') {
      if ((c.items || []).filter((x) => (typeof x === 'string' ? x.trim() : (x.text || '').trim())).length < 2)
        warn(c.id, '체크 항목이 부족합니다 (2개 이상 권장).');
      if ((c.items || []).length > LIMITS.checklistItems) warn(c.id, `체크 항목은 ${LIMITS.checklistItems}개까지 표시됩니다.`);
    }
    if (c.layout === 'steps') {
      const t = (c.items || []).filter((x) => (x.text || '').trim());
      if (t.length < 2) warn(c.id, '단계가 부족합니다 (2개 이상 권장).');
      if ((c.items || []).length > LIMITS.stepItems) warn(c.id, `단계는 ${LIMITS.stepItems}개까지 표시됩니다.`);
    }
    if (i === project.cards.length - 1 && c.layout !== 'cta') global.push('마지막 카드 레이아웃이 CTA가 아닙니다 (권장 사항).');
  });

  return { cardWarnings, global };
}
