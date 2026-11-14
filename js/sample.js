// sample.js — 기본 로드되는 7장 샘플 카드뉴스 (세트 주제: 견적·계약 문서화 가이드)
// 이미지는 저작권 문제 없는 절차적 그라디언트 플레이스홀더를 생성해 사용한다.
function gradientDataUrl(w, h, stops, angle = 'diag', seed = 1) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  let g;
  if (angle === 'diag') g = ctx.createLinearGradient(0, 0, w, h);
  else if (angle === 'v') g = ctx.createLinearGradient(0, 0, 0, h);
  else g = ctx.createLinearGradient(0, h, w, 0);
  stops.forEach(([pos, color]) => g.addColorStop(pos, color));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 시드 기반 도트 패턴
  let s = seed * 9301;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 140; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 2 + rand() * 5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 중앙 문서 목업 프레임
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 5;
  const bw = w * 0.46;
  const bh = h * 0.4;
  ctx.strokeRect((w - bw) / 2, (h - bh) / 2, bw, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect((w - bw) / 2 + 26, (h - bh) / 2 + 36 + i * 58, bw - 52 - i * 70 * rand(), 20);
  }
  return { src: cv.toDataURL('image/jpeg', 0.85), w, h };
}

export function sampleProject() {
  const coverImg = gradientDataUrl(1080, 1350, [[0, '#0F3B57'], [0.55, '#175E77'], [1, '#2E9CA6']], 'diag', 5);
  const problemImg = gradientDataUrl(1080, 900, [[0, '#4A4A52'], [1, '#8A8A94']], 'h', 13);
  const tipImg = gradientDataUrl(1080, 1350, [[0, '#1D3A5F'], [0.6, '#33638C'], [1, '#7FA6C9']], 'v', 21);

  return {
    version: 1,
    title: '[샘플] 견적·계약 전에 꼭 확인할 것들',
    handle: '@your_handle',
    sourceLabel: 'CARD NEWS',
    sourceUrl: 'https://example.com/sample-post',
    theme: 'light',
    accent: '#0071e3',
    hashtags: ['#견적서', '#프리랜서', '#계약서'],
    cards: [
      {
        id: 'c1',
        layout: 'cover-media',
        badge: '프리랜서 가이드',
        title: ['견적·계약 전에', '꼭 확인하세요'],
        body: ['문서 한 장이', '나중에 큰 차이를 만듭니다 [샘플]'],
        media: coverImg,
        footerNote: '',
        items: [],
      },
      {
        id: 'c2',
        layout: 'media-top',
        badge: '문제',
        title: ['구두 합의의 함정'],
        body: ['범위·기한·가격이 말로만 정해지면', '수정 경계가 무너지고', '대금 협상이 매번 반복돼요.'],
        media: problemImg,
        footerNote: '',
        items: [],
      },
      {
        id: 'c3',
        layout: 'checklist',
        badge: '',
        title: ['계약 전에 이것만 확인'],
        body: ['순서대로 딱 3분'],
        media: null,
        footerNote: '',
        items: ['작업 범위와 산출물 목록', '일정과 중간 확인 시점', '수정 요청 횟수와 범위', '최종 파일과 소유권 규정'],
      },
      {
        id: 'c4',
        layout: 'media-full',
        badge: '실무 팁',
        title: ['견적서는 숫자보다', '기준이 먼저'],
        body: ['단가·수량·포함 범위를', '항목별로 나눠 적으세요 [샘플]'],
        media: tipImg,
        footerNote: '',
        items: [],
      },
      {
        id: 'c5',
        layout: 'steps',
        badge: '',
        title: ['문서화, 이 순서로'],
        body: ['하루면 끝나요'],
        media: null,
        footerNote: '',
        items: [
          { text: '요구사항을 서면으로 받기', sub: '대화라도 요약해 보내세요' },
          { text: '견적서에 가정과 조건 명시', sub: '수정 횟수·납품 범위까지' },
          { text: '계약서·인보이스로 이어 붙이기', sub: '문서 번호를 맞춰 관리' },
        ],
      },
      {
        id: 'c6',
        layout: 'compare',
        badge: '',
        title: ['문서화 전 vs 후'],
        body: ['2주 만에 차이가 보여요'],
        media: null,
        footerNote: '',
        items: [],
        compare: {
          labelA: '문서화 전',
          itemsA: ['범위가 계속 늘어남', '수정 경계가 모호함', '협상이 매번 반복됨'],
          labelB: '문서화 후',
          itemsB: ['범위·기한이 기록됨', '추가 요청은 별도 견적', '정산까지 한 번에'],
        },
      },
      {
        id: 'c7',
        layout: 'cta',
        badge: '',
        title: ['견적서·인보이스', '바로 만들어보세요'],
        body: ['인보이스 스튜디오에서', '안내문구를 따라 입력만 하면', '문서가 완성됩니다.'],
        media: null,
        footerNote: '',
        items: [{ text: '', action: '견적서 만들러 가기' }],
      },
    ],
  };
}
