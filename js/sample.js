// sample.js — 기본 로드되는 7장 샘플 프로젝트 (레퍼런스의 7단 카드 흐름을 따른다)
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

  // 시드 기반 도트 패턴 — 플레이스홀더 느낌을 준다
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
  // 중앙 UI 목업 프레임 박스
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 5;
  const bw = w * 0.5;
  const bh = h * 0.42;
  ctx.strokeRect((w - bw) / 2, (h - bh) / 2, bw, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect((w - bw) / 2 + 28, (h - bh) / 2 + 40 + i * 64, bw - 56 - i * 60 * rand(), 22);
  }
  return { src: cv.toDataURL('image/jpeg', 0.85), w, h };
}

export function sampleProject() {
  const coverImg = gradientDataUrl(1080, 1350, [[0, '#2B2F55'], [0.55, '#4A3F75'], [1, '#B3578A']], 'diag', 3);
  const evidenceImg = gradientDataUrl(1080, 1350, [[0, '#173F5F'], [0.6, '#31649B'], [1, '#6EA4BF']], 'v', 7);
  const problemImg = gradientDataUrl(1080, 900, [[0, '#374151'], [1, '#6B7280']], 'h', 11);

  return {
    version: 1,
    title: '[샘플] 하루 업무 정리 카드뉴스',
    handle: '@your_handle',
    sourceLabel: 'CARD NEWS',
    sourceUrl: 'https://example.com/sample-post',
    theme: 'light',
    accent: '#0071e3',
    hashtags: ['#카드뉴스', '#정보디자인', '#업무꿀팁'],
    cards: [
      {
        id: 's1',
        layout: 'cover-media',
        badge: '업무 생산성',
        title: ['하루 업무가', '산으로 가요?'],
        body: ['매일 반복되는 정리,', '타이머 하나로 끝내보세요 [샘플]'],
        media: coverImg,
        footerNote: '',
        items: [],
      },
      {
        id: 's2',
        layout: 'media-top',
        badge: '문제',
        title: ['지금 방식의 문제'],
        body: ['할 일은 머릿속에만 있고', '우선순위는 매번 바뀌죠.', '기록 없이는 개선도 없어요.'],
        media: problemImg,
        footerNote: '',
        items: [],
      },
      {
        id: 's3',
        layout: 'checklist',
        badge: '',
        title: ['이 앱이 바꿔주는 것'],
        body: ['매일 3분이면 충분해요'],
        media: null,
        footerNote: '',
        items: ['할 일을 하루 단위로만 계획', '25분 타이머로 집중 구간 생성', '완료 체크가 자동으로 기록', '주간 리포트가 저절로 정리'],
      },
      {
        id: 's4',
        layout: 'media-full',
        badge: '실제 화면',
        title: ['눈으로 확인하는', '오늘의 작업 보드'],
        body: ['쓸어내기만 하면', '하루가 정리됩니다 [샘플]'],
        media: evidenceImg,
        footerNote: '',
        items: [],
      },
      {
        id: 's5',
        layout: 'steps',
        badge: '',
        title: ['오늘 바로 시작하는 법'],
        body: ['설치도 가입도 없어요'],
        media: null,
        footerNote: '',
        items: [
          { text: '아침에 할 일 3개만 적기', sub: '많이 적으면 실패합니다' },
          { text: '25분 타이머 돌리고 집중', sub: '알림은 꺼두세요' },
          { text: '끝나면 체크하고 기록', sub: '10초면 충분해요' },
        ],
      },
      {
        id: 's6',
        layout: 'compare',
        badge: '',
        title: ['쓰기 전 vs 쓴 후'],
        body: ['2주만 비교해 보세요'],
        media: null,
        footerNote: '',
        items: [],
        compare: {
          labelA: '쓰기 전',
          itemsA: ['할 일이 자꾸 새어 나감', '퇴근 전에 뭘 했는지 모름', '우선순위가 계속 흔들림'],
          labelB: '쓴 후',
          itemsB: ['할 일이 화면에 전부 보임', '기록이 자동으로 쌓임', '회고 5분으로 하루 마무리'],
        },
      },
      {
        id: 's7',
        layout: 'cta',
        badge: '',
        title: ['저장하고', '내일부터 해보세요'],
        body: ['궁금한 점은 댓글로 남겨주세요.', '다음 주에 사용 후기로 돌아옵니다.'],
        media: null,
        footerNote: '',
        items: [{ text: '', action: '지금 저장하기' }],
      },
    ],
  };
}
