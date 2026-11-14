// export.js — PNG / ZIP 내보내기, 프로젝트 JSON 저장
import { CARD_W, CARD_H, renderCard, ensureImages, LAYOUTS } from './layouts.js?v=a2';
import { makeZip } from './zip.js';
import { buildCaption } from './caption.js';
import { download, slugify } from './util.js';

function renderToCanvas(project, index) {
  const cv = document.createElement('canvas');
  cv.width = CARD_W;
  cv.height = CARD_H;
  const ctx = cv.getContext('2d');
  renderCard(ctx, project, project.cards[index], index);
  return cv;
}

function canvasBlob(cv) {
  return new Promise((resolve, reject) => {
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 변환 실패'))), 'image/png');
  });
}

function fileBase(project, index) {
  const card = project.cards[index];
  const layoutName = (LAYOUTS.find((l) => l.id === card.layout) || { name: 'card' }).name;
  return `${String(index + 1).padStart(2, '0')}_${sanitize(layoutName)}`;
}

function sanitize(s) {
  return s.replace(/[\\/:*?"<>|\s]+/g, '-');
}

export async function exportCardPNG(project, index) {
  await ensureImages(project);
  const cv = renderToCanvas(project, index);
  const blob = await canvasBlob(cv);
  download(blob, `${slugify(project.title)}-${fileBase(project, index)}.png`);
  return true;
}

export async function exportAllZip(project, onProgress) {
  await ensureImages(project);
  const files = [];
  for (let i = 0; i < project.cards.length; i++) {
    const cv = renderToCanvas(project, i);
    const blob = await canvasBlob(cv);
    const buf = new Uint8Array(await blob.arrayBuffer());
    files.push({ name: `${fileBase(project, i)}.png`, data: buf });
    if (onProgress) onProgress(i + 1, project.cards.length);
  }
  // 캡션 패키지 + 프로젝트 원본도 함께
  files.push({ name: 'caption.txt', data: new TextEncoder().encode(buildCaption(project)) });
  files.push({ name: 'project.json', data: new TextEncoder().encode(JSON.stringify(project, null, 2)) });

  const zip = makeZip(files);
  const blob = new Blob([zip], { type: 'application/zip' });
  download(blob, `${slugify(project.title)}-cardnews.zip`);
  return true;
}

export function exportProjectJSON(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  download(blob, `${slugify(project.title)}-project.json`);
}
