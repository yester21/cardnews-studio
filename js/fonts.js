// fonts.js — 카드 렌더용 폰트 레지스트리
// 모든 폰트는 SIL Open Font License (상업적 이용 가능).
// 부팅 시 코어(Gmarket Sans·Pretendard)만 로드하고, 나머지는 프로젝트에서 선택될 때 지연 로드한다.
import { log } from './util.js';

export const FAMILIES = {
  gmarket: {
    label: 'Gmarket Sans (기본)',
    files: [
      { url: new URL('../assets/fonts/GmarketSansLight.woff', import.meta.url), weight: '300' },
      { url: new URL('../assets/fonts/GmarketSansMedium.woff', import.meta.url), weight: '500' },
      { url: new URL('../assets/fonts/GmarketSansBold.woff', import.meta.url), weight: '700' },
    ],
    stack: `'GmarketSans','Malgun Gothic','맑은 고딕',sans-serif`,
  },
  pretendard: {
    label: 'Pretendard',
    files: [{ url: new URL('../assets/fonts/PretendardVariable.woff2', import.meta.url), weight: '45 920' }],
    stack: `'Pretendard',-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif`,
  },
  noto: {
    label: 'Noto Sans KR',
    files: [{ url: new URL('../assets/fonts/NotoSansKR-Variable.ttf', import.meta.url), weight: '100 900' }],
    stack: `'NotoSansKR','Noto Sans KR','Malgun Gothic','맑은 고딕',sans-serif`,
  },
  myeongjo: {
    label: '나눔명조 (세리프)',
    files: [
      { url: new URL('../assets/fonts/NanumMyeongjo-Regular.ttf', import.meta.url), weight: '400' },
      { url: new URL('../assets/fonts/NanumMyeongjo-Bold.ttf', import.meta.url), weight: '700' },
    ],
    stack: `'NanumMyeongjo','Malgun Gothic',serif`,
  },
  system: {
    label: '시스템 기본',
    files: [],
    stack: `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Malgun Gothic','맑은 고딕',sans-serif`,
  },
};

export const FONT_KEYS = Object.keys(FAMILIES);
const DEFAULT_KEY = 'gmarket';
const loaded = new Set(['system']); // system은 다운로드 불필요

async function ensureFontFamily(key) {
  const fam = FAMILIES[key];
  if (!fam || loaded.has(key)) return true;
  let ok = 0;
  await Promise.all(fam.files.map(async (f) => {
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const familyName = fam.stack.split(',')[0].replace(/'/g, '');
      const face = new FontFace(familyName, buf, { weight: f.weight, display: 'swap' });
      await face.load();
      document.fonts.add(face);
      ok++;
    } catch (e) {
      log.warn(`폰트 로드 실패 (${key}):`, e.message);
    }
  }));
  if (ok) loaded.add(key);
  return ok > 0;
}

// 부팅 시 코어 폰트 로드 (기존 loadFonts와 동일 역할)
export async function loadFonts() {
  await Promise.all([ensureFontFamily('gmarket'), ensureFontFamily('pretendard')]);
  await Promise.race([
    document.fonts.ready,
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  return true;
}

// 프로젝트에서 선택한 폰트 1종을 지연 로드 (렌더 전 ensureImages에서 호출)
export function ensureFontFamilyByKey(key) {
  return ensureFontFamily(key);
}

export function stackFor(key) {
  const fam = FAMILIES[key] || FAMILIES[DEFAULT_KEY];
  return fam.stack;
}

export function font(weight, size, stack = stackFor(DEFAULT_KEY)) {
  return `${weight} ${Math.round(size * 2) / 2}px ${stack}`;
}
