# 카드뉴스 스튜디오 · CardNews Studio

인스타그램·스레드에 올릴 **4:5 카드뉴스(1080×1350)**를 브라우저에서 만들고 PNG로 내려받는
정적 웹 서비스. 빌드 도구·서버·외부 의존성 없이 동작한다.

**UI는 Apple Reference Design System을 따른다**: Fog Canvas `#f5f5f7` / Surface `#ffffff` /
Foreground `#1d1d1f` / Muted `#6e6e73`, 프라이머리 필 버튼 `#0071e3`(980px pill), 링크 `#0066cc`,
카드 라디우스 18px, 플랫 지면. SF Pro 시스템 폰트 스택(역할별 크기 17/14/12, 디스플레이 600).
카드 기본 테마도 같은 팔레트를 공유한다(라이트=Fog Canvas, 다크=Black `#000000`, 액센트 기본 `#0071e3`).
문서에 없는 값(경고/성공 색, 모달 그림자 등)은 최소한의 로컬 확장이다.

[AIjunja/Auto-card-news](https://github.com/AIjunja/Auto-card-news)의 설계 철학을 웹서비스로 옮겼다:

> **AI(또는 사람)은 콘텐츠만 쓰고, 레이아웃은 코드가 고정한다.**
> 매번 HTML/CSS를 새로 짜지 않기 때문에 결과물이 항상 일관되고, 토큰과 시간이 낭비되지 않는다.

- 카피는 **의미 단위 줄 배열**로 입력한다 (자동 줄바꿈 금지 — 레퍼런스와 동일한 계약)
- 7종 **고정 레이아웃**을 CSS 격자가 아니라 캔버스 렌더러로 결정적으로 그린다 → 프리뷰 = 출력물 (WYSIWYG 보장)
- 렌더 후 **QA 경고**(줄 수 초과, 텍스트 넘침, 이미지 누락, 7장 흐름 준수)를 표시한다

## 실행 방법

정적 사이트이므로 아무 정적 서버로 루트를 서빙하면 된다:

```bash
# 방법 1: 파이썬
python -m http.server 8000 --directory cardnews-studio

# 방법 2: 노드
npx serve cardnews-studio
```

→ http://localhost:8000 젍속. 첫 화면은 7장 샘플 프로젝트(모든 레이아웃 포함)가 로드된다.
GitHub Pages / Netlify / Vercel / CloudBase 정적 호스팅에 `cardnews-studio` 폴더째 올려도 그대로 동작한다.

## 기능

| 기능 | 설명 |
|---|---|
| 7종 고정 레이아웃 | 표지(cover-media), 상단 이미지(media-top), 풀 이미지(media-full), 비교(compare), 체크리스트(checklist), 단계(steps), CTA(cta) |
| 7장 카드 흐름 가이드 | 공감 → 문제 → 설명 → 근거 → 사용법 → 전후비교 → CTA (레퍼런스의 카드 흐름) |
| 카드 편집 | 줄 단위 제목·본문, 배지, 레이아웃별 항목(체크/단계/비교/액션), 이미지 업로드(자동 리사이즈), 카드 추가·복제·삭제·순서변경(삭제 실행취소 포함) |
| 브랜드 설정 | 핸들, 태그/출처 라벨, 출처 URL, 라이트/다크 테마, 액센트 색(프리셋 제공), 해시태그 |
| QA 검사 | 줄 수 권장 초과, 텍스트 넘침(렌더러가 축소·말줄임한 카드), 이미지 누락, CTA 누락 등 경고 |
| PNG 내보내기 | 카드 1장 PNG 또는 전체 ZIP (PNG 전 장 + `caption.txt` + `project.json`) |
| 캡션 생성 | 카드 내용에서 Instagram/Threads용 캡션 자동 조립 + 클립보드 복사 |
| AI 초안 연동 | "AI 프롬프트 복사" → ChatGPT/Claude에 붙여넣 → 나온 JSON을 그대로 가져오기 (레퍼런스의 content.draft.json 계약을 웹에서 재현) |
| 자동저장 | localStorage에 자동 저장, 새로고침해도 작업 유지. JSON 내보내기/불러오기로 백업·이동 |

## 프로젝트 JSON 스키마

```jsonc
{
  "title": "프로젝트명",
  "handle": "@your_handle",
  "sourceLabel": "CARD NEWS",       // 카드 우측 상단 태그
  "sourceUrl": "https://...",       // 푸터 출처
  "theme": "light" | "dark",
  "accent": "#0071e3",
  "hashtags": ["#카드뉴스"],
  "cards": [
    {
      "layout": "cover-media",      // 7종 중 하나
      "badge": "짧은 배지",
      "title": ["줄1", "줄2"],      // 의미 단위 줄 배열 (권장 3줄)
      "body": ["줄1", "줄2"],       // 권장 3줄
      "media": { "src": "dataURL 또는 URL", "w": 1080, "h": 1350 },
      "footerNote": "카드별 푸터 노트 (선택)",
      "items": [],                  // checklist: 문자열 배열 / steps: [{text,sub}] / cta: [{action}]
      "compare": { "labelA": "쓰기 전", "itemsA": ["..."], "labelB": "쓴 후", "itemsB": ["..."] }
    }
  ]
}
```

## 폰트

GmarketSans(Light/Medium/Bold, SIL OFL)를 `assets/fonts/`에 번들한다 — 오프라인에서도 동일하게 렌더링된다.
FontFace API로 로드하며 실패 시 시스템 한글 폰트로 폴백한다.

## 구조

```
cardnews-studio/
├── index.html          # UI 골격
├── assets/
│   ├── app.css         # 툴 크롬 스타일 (다크)
│   └── fonts/          # GmarketSans 3종 (번들)
└── js/
    ├── app.js          # UI 구성·이벤트·모달
    ├── store.js        # 상태 관리 + localStorage 자동저장 + 프로젝트 정규화
    ├── layouts.js      # ★ 7종 고정 레이아웃 캔버스 렌더러 (결정적 렌더의 핵심)
    ├── fonts.js        # 폰트 로딩
    ├── qa.js           # 카피 계약 검사 (경고 방식)
    ├── caption.js      # 캡션 패키지 생성
    ├── export.js       # PNG / ZIP 내보내기
    ├── zip.js          # 무의존 ZIP 라이터 (store 방식, UTF-8 파일명)
    ├── sample.js       # 샘플 프로젝트 (절차적 플레이스홀더 이미지 생성)
    └── util.js         # 공용 유틸
```

## 레이아웃별 카피 규격 (렌더러가 강제하는 값)

- 카드: 1080×1350 (4:5), 좌우 여백 72px
- 제목: 최대 3줄 표시 / 본문: 최대 3줄 표시 (cover는 본문 2줄)
- 넘칠 경우 블록 폰트를 68%까지 축소하고, 그래도 넘치면 말줄임 + QA 경고
- 체크리스트 5항목, 단계 5개, 비교 항목 각 4개까지

## 폰트

UI는 Pretendard(변수 폰트, 자체호스팅, SIL OFL 1.1)를 사용하며 자간 -0.02em 보정을 적용했다.

## 라이선스

- 코드: MIT
- GmarketSans: SIL Open Font License 1.1 (번들 폰트)
