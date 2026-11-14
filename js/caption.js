// caption.js — Instagram / Threads용 캡션 패키지 생성
import { hostnameOf } from './util.js';

export function buildCaption(project) {
  const cards = project.cards;
  const c1 = cards[0] || { title: [], body: [] };
  const hook = c1.title.filter((l) => l.trim()).join(' ');

  const lines = [];
  lines.push(`${hook || project.title}`);
  lines.push('');
  const middle = cards.slice(1, -1);
  for (const c of middle) {
    const t = c.title.filter((l) => l.trim()).join(' ');
    if (t) lines.push(`• ${t}`);
  }
  const last = cards[cards.length - 1];
  if (last) {
    const t = last.title.filter((l) => l.trim()).join(' ');
    if (t) {
      lines.push('');
      lines.push(t);
    }
    const action = last.items && last.items[0] && last.items[0].action;
    if (action) lines.push(`👉 ${action}`);
  }
  if (project.sourceUrl) {
    lines.push('');
    lines.push(`${project.sourceLabel || '출처'}: ${project.sourceUrl}`);
  }
  if (project.handle) lines.push(`· ${project.handle}`);
  const tags = (project.hashtags || []).join(' ');
  if (tags) {
    lines.push('');
    lines.push(tags);
  }
  return lines.join('\n');
}
