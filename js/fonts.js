// fonts.js — GmarketSans 번들 폰트 로딩 (FontFace API). 캔버스 렌더 전 반드시 완료해야 한다.
import { log } from './util.js';

const FACES = [
  { url: new URL('../assets/fonts/GmarketSansLight.woff', import.meta.url), weight: '300' },
  { url: new URL('../assets/fonts/GmarketSansMedium.woff', import.meta.url), weight: '500' },
  { url: new URL('../assets/fonts/GmarketSansBold.woff', import.meta.url), weight: '700' },
];

export const FAMILY = 'GmarketSans';
export const FONT_STACK = `"${FAMILY}","Malgun Gothic","맑은 고딕",sans-serif`;

let loaded = false;

export function font(weight, size) {
  return `${weight} ${Math.round(size * 2) / 2}px ${FONT_STACK}`;
}

export async function loadFonts() {
  if (loaded) return true;
  let ok = 0;
  await Promise.all(
    FACES.map(async (f) => {
      try {
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const face = new FontFace(FAMILY, buf, { weight: f.weight, display: 'swap' });
        await face.load();
        document.fonts.add(face);
        ok++;
      } catch (e) {
        log.warn(`폰트 로드 실패 (${f.weight}):`, e.message);
      }
    })
  );
  // 폰트가 준비될 때까지 최대 3초 대기 (실패 시 시스템 폰트로 폴백 렌더)
  await Promise.race([
    document.fonts.ready,
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  loaded = ok > 0;
  return loaded;
}
