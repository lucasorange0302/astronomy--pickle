/* =========================================================================
   records.js — 🏆 우주 최고 기록관 (2026-11-28)
   · 어린이(초등 고학년~중학생)가 읽기 쉬운 '우주 최고 기록' 카드 15장
   · 카테고리 필터(전체 · 별·블랙홀 · 태양계 · 은하·우주) + 아코디언 카드
   · 직접 그린 SVG 비교 도해 4종(블랙홀 지평선 / 별 크기 / 밝기 / 거리)
   · 모든 수치는 공개 논문·NASA·ESA·위키백과 원문에서 확인한 값.
     측정이 갈리는 값은 '논쟁 중'을 함께 적었습니다.
   · 시리우스·금성·화성·해왕성·목성·안드로메다·프록시마는
     도감 카드와 🎯 라이브 하늘 조준으로 바로 이어집니다.
   ========================================================================= */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var HOST = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var CATS = [
    { k: 'all', ico: '✨', label: '전체' },
    { k: 'star', ico: '⭐', label: '별 · 블랙홀' },
    { k: 'solar', ico: '🪐', label: '태양계' },
    { k: 'cosmos', ico: '🌌', label: '은하 · 우주' }
  ];

  /* ------------------------------------------------------- 직접 그린 도해 */
  /* 1) 블랙홀 지평선 vs 해왕성 궤도 — 같은 축척, 해왕성 궤도는 점만 해서 확대 */
  function figBH() {
    return '<svg viewBox="0 0 320 300" role="img" aria-label="TON 618의 사건의 지평선(지름 약 2,600 AU)과 해왕성 궤도(지름 60 AU)를 같은 축척으로 견준 그림. 해왕성 궤도는 가운데 점만 한 크기라 오른쪽 아래에 확대해 그렸습니다.">' +
      '<circle cx="126" cy="118" r="104" fill="#04050a" stroke="var(--accent)" stroke-width="2.2"/>' +
      '<circle cx="126" cy="118" r="104" fill="none" stroke="var(--accent)" stroke-width="9" opacity="0.12"/>' +
      '<circle cx="126" cy="118" r="4" fill="var(--accent-2)"/>' +
      '<text x="126" y="16" text-anchor="middle" font-size="12" font-weight="700" fill="var(--accent)">사건의 지평선 (지름 약 2,600 AU)</text>' +
      '<text x="126" y="298" text-anchor="middle" font-size="9.5" fill="var(--muted)">해왕성 궤도 지름(60 AU)의 약 43배</text>' +
      '<line x1="129" y1="122" x2="226" y2="200" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"/>' +
      '<circle cx="258" cy="246" r="42" fill="rgba(255,255,255,0.04)" stroke="var(--border-hi)" stroke-width="1"/>' +
      '<circle cx="258" cy="246" r="13" fill="none" stroke="var(--accent-3)" stroke-width="1.6" stroke-dasharray="2 2"/>' +
      '<circle cx="258" cy="246" r="2.4" fill="var(--accent)"/>' +
      '<text x="258" y="197" text-anchor="middle" font-size="9.5" fill="var(--accent-3)">해왕성 궤도 확대</text>' +
      '</svg>';
  }

  /* 2) 별 크기 — 태양 · UY 스쿠티(2023/예전) · 스티븐슨 2-18 과 행성 궤도 */
  function figStar() {
    return '<svg viewBox="0 0 320 316" role="img" aria-label="태양 자리에 UY 스쿠티(2023년 값 909 태양 반지름)와 스티븐슨 2-18(2,150 태양 반지름)을 놓았을 때의 크기를 행성 궤도와 함께 같은 축척으로 견준 그림. 스티븐슨 2-18의 표면은 토성 궤도 바로 밖까지 옵니다.">' +
      /* 행성 궤도(안쪽 → 바깥) */
      '<circle cx="150" cy="150" r="5.1" fill="none" stroke="var(--faint)" stroke-width="0.8" opacity="0.7"/>' +
      '<circle cx="150" cy="150" r="9.5" fill="none" stroke="var(--faint)" stroke-width="0.8" opacity="0.7"/>' +
      '<circle cx="150" cy="150" r="13.2" fill="none" stroke="var(--faint)" stroke-width="0.8" opacity="0.7"/>' +
      '<circle cx="150" cy="150" r="20" fill="none" stroke="var(--faint)" stroke-width="0.8" opacity="0.7"/>' +
      '<circle cx="150" cy="150" r="68.6" fill="none" stroke="var(--border-hi)" stroke-width="0.9" stroke-dasharray="1 3"/>' +
      '<circle cx="150" cy="150" r="125.9" fill="none" stroke="var(--accent-3)" stroke-width="1.5" stroke-dasharray="4 3"/>' +
      /* 별 */
      '<circle cx="150" cy="150" r="104.8" fill="none" stroke="var(--muted)" stroke-width="1.3" stroke-dasharray="2 4"/>' +
      '<circle cx="150" cy="150" r="55.8" fill="rgba(126,224,192,0.10)" stroke="var(--accent-2)" stroke-width="1.6"/>' +
      '<circle cx="150" cy="150" r="132" fill="rgba(255,212,121,0.07)" stroke="var(--accent)" stroke-width="2.2"/>' +
      '<circle cx="150" cy="150" r="2.2" fill="var(--accent)"/>' +
      '<text x="158" y="146" font-size="8.5" fill="var(--accent)">태양</text>' +
      '<text x="150" y="112" text-anchor="middle" font-size="8.5" fill="var(--accent-2)">UY 스쿠티 909</text>' +
      '<text x="150" y="16" text-anchor="middle" font-size="12" font-weight="700" fill="var(--accent)">스티븐슨 2-18 (2,150 R☉)</text>' +
      '<text x="150" y="296" text-anchor="middle" font-size="9.5" fill="var(--accent-3)">토성 궤도 — 이 선 바로 밖까지 표면이 옵니다</text>' +
      '<text x="150" y="310" text-anchor="middle" font-size="9" fill="var(--muted)">회색 점선 = UY 스쿠티 예전 값 · 가운데 점 = 태양</text>' +
      '</svg>';
  }

  /* 3) 밝기 — 로그 눈금 막대 (태양 = 1) */
  function figLum() {
    var x0 = 26, span = 276, rows = [
      { y: 58, label: '태양 — 1배', l: 1 },
      { y: 104, label: '시리우스 — 약 25배', l: 25 },
      { y: 150, label: 'R136a1 — 약 500만 배', l: 5000000 }
    ];
    var bar = rows.map(function (r) {
      var w = Math.max(3, Math.log10(r.l) / 7 * span);
      return '<rect x="' + x0 + '" y="' + r.y + '" width="' + w.toFixed(1) + '" height="14" rx="4" fill="var(--accent-2)" opacity="0.85"/>' +
        '<text x="' + x0 + '" y="' + (r.y - 5) + '" font-size="9.5" fill="var(--muted)">' + esc(r.label) + '</text>';
    }).join('');
    var ticks = [[1, '1'], [100, '100'], [10000, '1만'], [1000000, '100만']].map(function (t) {
      var x = x0 + Math.log10(t[0]) / 7 * span;
      return '<line x1="' + x.toFixed(1) + '" y1="174" x2="' + x.toFixed(1) + '" y2="180" stroke="var(--border-hi)"/>' +
        '<text x="' + x.toFixed(1) + '" y="192" text-anchor="middle" font-size="8.5" fill="var(--faint)">' + t[1] + '</text>';
    }).join('');
    return '<svg viewBox="0 0 320 200" role="img" aria-label="태양을 1로 두었을 때 시리우스는 약 25배, R136a1은 약 500만 배 밝다는 것을 로그 눈금 막대로 나타낸 그림.">' +
      '<line x1="' + x0 + '" y1="174" x2="' + (x0 + span) + '" y2="174" stroke="var(--border-hi)"/>' +
      bar + ticks +
      '<text x="' + (x0 + span) + '" y="24" text-anchor="end" font-size="9" fill="var(--faint)">가로 = 밝기(태양 = 1, 로그 눈금)</text>' +
      '</svg>';
  }

  /* 4) 거리 — 로그 눈금 자 */
  function figDist() {
    var x0 = 22, span = 278, axis = 152;
    var marks = [
      { l: 4.24, name: '프록시마 4.24광년', y: 38 },
      { l: 8.6, name: '시리우스 8.6광년', y: 68 },
      { l: 163000, name: 'R136a1 16만 광년', y: 38 },
      { l: 2540000, name: '안드로메다 254만', y: 68 },
      { l: 1.34e10, name: 'JADES 134억 광년', y: 98, end: true }
    ].map(function (m) {
      var x = x0 + Math.min(1, Math.log10(m.l) / 10) * span;
      var tx = m.end ? x - 5 : x + 5;
      return '<line x1="' + x.toFixed(1) + '" y1="' + (m.y + 5) + '" x2="' + x.toFixed(1) + '" y2="' + (axis - 4) + '" stroke="var(--border-hi)" stroke-dasharray="2 3"/>' +
        '<circle cx="' + x.toFixed(1) + '" cy="' + axis + '" r="3" fill="var(--accent)"/>' +
        '<text x="' + tx.toFixed(1) + '" y="' + m.y + '" font-size="9" fill="var(--muted)"' + (m.end ? ' text-anchor="end"' : '') + '>' + esc(m.name) + '</text>';
    }).join('');
    var ticks = [[1, '1'], [100, '100'], [1e4, '1만'], [1e6, '100만'], [1e8, '1억'], [1e10, '100억']].map(function (t) {
      var x = x0 + Math.log10(t[0]) / 10 * span;
      return '<line x1="' + x.toFixed(1) + '" y1="' + axis + '" x2="' + x.toFixed(1) + '" y2="' + (axis + 6) + '" stroke="var(--border-hi)"/>' +
        '<text x="' + x.toFixed(1) + '" y="' + (axis + 20) + '" text-anchor="middle" font-size="8.5" fill="var(--faint)">' + t[1] + '</text>';
    }).join('');
    return '<svg viewBox="0 0 320 186" role="img" aria-label="지구에서 프록시마(4.24광년), 시리우스(8.6광년), R136a1(16만 광년), 안드로메다(254만 광년), JADES-GS-z14-0(134억 광년)까지의 거리를 로그 눈금 자 위에 표시한 그림.">' +
      '<line x1="' + x0 + '" y1="' + axis + '" x2="' + (x0 + span) + '" y2="' + axis + '" stroke="var(--border-hi)" stroke-width="1.4"/>' +
      marks + ticks +
      '<text x="' + x0 + '" y="14" font-size="9" fill="var(--faint)">가로 = 거리(광년, 로그 눈금)</text>' +
      '</svg>';
  }

  var FIGS = { bh: figBH, star: figStar, lum: figLum, dist: figDist };

  /* ---------------------------------------------------------------- 기록 */
  var RECORDS = [
    {
      id: 'ton618', cat: 'star', ico: '🕳️', tag: '제일 큰 블랙홀', name: 'TON 618',
      value: '660억', unit: '태양 질량 배',
      lead: '지금까지 알려진 블랙홀 가운데 가장 무거운 후보. 사냥개자리 방향, 빛이 108억 년 걸려 온 곳에 있습니다.',
      analogy: '태양 660억 개를 한데 뭉친 무게예요. 우리 은하의 별 전체 무게(약 640억 태양 질량)보다 무겁습니다. 이 블랙홀의 경계(사건의 지평선)는 태양계를 통째로 넣고도 한참 남을 만큼 넓어요.',
      fig: 'bh',
      figCap: '왼쪽 큰 원이 TON 618의 사건의 지평선, 오른쪽 작은 원이 확대한 해왕성 궤도예요. 실제로는 해왕성 궤도 전체가 가운데 점만 한 크기입니다.',
      facts: [
        ['태양 질량', '약 660억 배 (다른 측정 407억 배)'],
        ['사건의 지평선 반지름', '약 1,300 AU (1,950억 km)'],
        ['지평선 지름', '약 2,600 AU — 해왕성 궤도 지름의 약 43배'],
        ['빛이 지름을 지나는 시간', '약 15일'],
        ['거리', '빛이 108억 년 걸려 온 곳']
      ],
      qa: [
        ['블랙홀은 무거우면 커지나요?', '네. 무게가 2배가 되면 지평선 지름도 2배로 커져요. 태양 하나만 한 블랙홀이면 지름이 6 km쯤인데, 660억 개를 모으면 2,600 AU까지 커집니다.'],
        ['왜 400억과 660억으로 다르게 나와요?', '블랙홀은 직접 볼 수 없어서 주변 가스가 도는 속도로 무게를 계산해요. 어떤 스펙트럼 선으로 재느냐에 따라 값이 달라져서 아직 확실하지 않아요.']
      ],
      doubt: '무게는 재는 방법에 따라 약 407억~660억 배로 갈립니다. 2019년 다른 스펙트럼 선으로 잰 값이 407억 배였어요.',
      aim: { kind: 'radec', ra: 187.1, dec: 31.48, label: 'TON 618 조준' },
      src: 'Shemmer et al. 2004 (Hβ) · Ge et al. 2019 (C IV)'
    },
    {
      id: 'phoenixa', cat: 'star', ico: '🌀', tag: '초거대 블랙홀 후보', name: 'Phoenix A*',
      value: '약 1,000억', unit: '태양 질량 배(추정)',
      lead: '피닉스 은하단 한가운데에 있는 블랙홀. 여러 별이 합쳐지며 자란다는 모형에서 가장 큰 값으로 알려졌어요.',
      analogy: '숫자만 보면 TON 618보다도 무거워요. 하지만 이 값은 은하단 전체의 움직임을 통해 간접적으로 계산한 추정이라, 실제로 잴 수 있는 무게와는 차이가 있어요.',
      facts: [
        ['질량 추정', '약 1,000억 태양 질량'],
        ['위치', '피닉스 은하단 (약 58억 광년)'],
        ['지평선 지름(계산값)', '약 3,900 AU'],
        ['성격', '은하단 중심의 초거대 블랙홀']
      ],
      qa: [
        ['그럼 우주에서 제일 무거운 블랙홀은 뭐예요?', '아직 정해지지 않았어요. TON 618처럼 스펙트럼으로 잰 값과, 은하단 운동으로 계산한 값을 같은 자로 비교할 수 없기 때문이에요. 그래서 두 후보를 함께 소개합니다.']
      ],
      doubt: '추정치의 오차가 커서 2024년 연구에서는 더 작을 가능성도 제기됐어요. "가장 무겁다"고 단정하지 않습니다.',
      src: 'Brockamp et al. 2016 · 은하단 중심 블랙홀 질량 추정'
    },
    {
      id: 'stephenson', cat: 'star', ico: '🔴', tag: '제일 큰 별', name: '스티븐슨 2-18',
      value: '2,150', unit: '태양 반지름 배',
      lead: '지금까지 알려진 별 가운데 반지름이 가장 큰 후보. 방패자리 방향, 약 1만 9천 광년 떨어져 있어요.',
      analogy: '태양 자리에 두면 표면이 토성 궤도(9.5 AU) 바로 밖까지 와요. 여객기로 표면을 한 바퀴 도는 데 1,200년이 걸리고, 부피로는 태양 100억 개가 들어갑니다.',
      fig: 'star',
      figCap: '노란 큰 원이 스티븐슨 2-18, 청록색 원이 UY 스쿠티(2023년 값)예요. 파란 점선이 토성 궤도입니다.',
      facts: [
        ['반지름', '약 2,150 태양 반지름 (약 15억 km)'],
        ['태양 자리에 두면', '표면이 토성 궤도 바로 너머'],
        ['부피', '태양의 약 100억 배'],
        ['거리', '약 1만 9천 광년 (방패자리)'],
        ['평균 밀도', '공기의 약 50만 분의 1']
      ],
      qa: [
        ['왜 이렇게 커요?', '무거운 별이 나이가 들면 겉껍질이 아주 묽게 부풀어 오르는 적색초거성이 돼요. 그래서 크기는 엄청나지만 무게는 태양의 15~20배 정도예요.'],
        ['정말 1등이에요?', '거리 오차가 50%가 넘고, 이론이 말하는 별 최대 크기(약 1,500 태양 반지름)를 넘어서서 "측정이 틀렸을 수도 있다"는 논쟁이 계속되고 있어요.']
      ],
      doubt: '거리와 온도 추정에 따라 값이 크게 달라집니다. 이론 한계를 넘는 값이라 학계에서 논쟁 중이에요.',
      aim: { kind: 'radec', ra: 279.76, dec: -6.1, label: '스티븐슨 2-18 조준' },
      src: 'Fok et al. 2012 · Arroyo-Torres et al. · Gaia 거리 측정'
    },
    {
      id: 'uyscuti', cat: 'star', ico: '🌟', tag: '예전 1등, 지금은 후보', name: 'UY 스쿠티',
      value: '909', unit: '태양 반지름 배 (예전 1,708)',
      lead: '2012년에 1,708 태양 반지름으로 "우주에서 가장 큰 별"이었어요. 그런데 2023년 값이 909로 줄었습니다.',
      analogy: '별이 작아진 게 아니에요. 멀리 있는 별의 크기는 거리로 계산하는데, 우리가 잰 거리가 틀렸던 거예요. 지금 값으로도 태양 자리에 두면 수성·금성·지구·화성을 모두 삼키고 화성과 목성 사이까지 와요.',
      fig: 'star',
      figCap: '청록색 원이 2023년 값(909), 회색 점선 원이 2012년 값(1,708)이에요. 같은 별인데 재는 방법이 바뀌며 값이 달라졌어요.',
      facts: [
        ['반지름 (2023)', '약 909 태양 반지름 (약 4.2 AU)'],
        ['예전 값 (2012)', '1,708 태양 반지름'],
        ['태양 자리에 두면', '화성과 목성 사이까지'],
        ['거리', '약 5,900 광년 (방패자리)']
      ],
      qa: [
        ['별이 줄어들 수 있어요?', '아니요. 가까운 별은 각도로 직접 재지만, 먼 별은 밝기와 온도로 크기를 계산해요. 거리를 잘못 알면 크기도 틀리게 나와요. Gaia 위성이 거리를 다시 재면서 값이 바뀌었습니다.']
      ],
      src: 'AMBER/VLT 2012 · Gaia DR3 기반 2023 재측정'
    },
    {
      id: 'sirius', cat: 'star', ico: '💎', tag: '밤하늘에서 제일 밝은 별', name: '시리우스',
      value: '−1.46', unit: '겉보기 등급',
      lead: '우리 하늘에서 가장 밝은 별. 큰개자리 α, 지구에서 8.6광년. 겨울철 남쪽 하늘에서 가장 눈에 띄는 점이에요.',
      analogy: '지금 보는 시리우스의 빛은 2018년에 출발했어요. 맨눈으로 볼 수 있는 가장 어두운 별(6등급)보다 약 950배 밝습니다. 지평선 가까이 있을 때 색이 무지개처럼 흔들리는 건 대기 때문이에요.',
      fig: 'lum',
      figCap: '시리우스는 실제로 내는 빛도 태양의 약 25배로 밝은 편이지만, R136a1처럼 수백만 배는 아니에요. 가까워서 1등으로 보이는 것입니다.',
      facts: [
        ['겉보기 등급', '−1.46 (하늘 전체 1위)'],
        ['거리', '8.6 광년'],
        ['밝기', '태양의 약 25배'],
        ['표면 온도', '약 9,900 K (청백색)'],
        ['짝별', '백색왜성 시리우스 B']
      ],
      qa: [
        ['제일 밝은데 왜 실제로는 R136a1보다 어두워요?', '겉보기 등급은 거리까지 포함한 "내 눈에 보이는 밝기"예요. 시리우스는 가까워서 밝게 보이고, 실제로 내는 빛은 태양의 25배 정도입니다.'],
        ['한국에서 언제 보여요?', '12월부터 3월까지 저녁 남쪽 하늘에서 잘 보여요. 오리온자리 삼태성에서 남동쪽으로 선을 따라가면 닿습니다.']
      ],
      aim: { kind: 'catalog', id: 'sirius', ra: 101.29, dec: -16.72, label: '시리우스 조준' },
      catalog: 'sirius',
      src: 'Hipparcos·Gaia 거리 · IAU 항성 목록'
    },
    {
      id: 'r136a1', cat: 'star', ico: '💥', tag: '실제로 가장 밝고 무거운 별', name: 'R136a1',
      value: '약 500만', unit: '태양 밝기 배 (광도)',
      lead: '이웃 은하 대마젤란운의 거미성운 한가운데. 지금까지 알려진 별 가운데 가장 무겁고 가장 밝아요.',
      analogy: '태양 470만~720만 개를 한꺼번에 켠 밝기예요. 4초 동안 내는 빛이 태양이 1년 동안 내는 빛과 같습니다. 하지만 16만 광년 떨어져 12등급이라 맨눈으로는 보이지 않아요.',
      fig: 'lum',
      figCap: '로그 눈금이라 막대 길이가 "몇 배"를 그대로 뜻하지는 않아요. R136a1의 막대가 태양보다 얼마나 긴지 보세요.',
      facts: [
        ['질량', '약 200~300 태양 질량'],
        ['광도', '약 470만~720만 태양 광도'],
        ['거리', '약 16만 3천 광년 (대마젤란운)'],
        ['겉보기 등급', '12.23 — 맨눈 불가'],
        ['표면 온도', '약 46,000 K']
      ],
      qa: [
        ['가장 큰 별이에요?', '아니요, 가장 "무거운" 별이에요. 반지름은 태양의 약 43배뿐이라 스티븐슨 2-18보다 훨씬 작아요. 무겁고 뜨거운 별은 밝지만 꼭 크지는 않아요.'],
        ['언제 폭발해요?', '수백만 년 안에 초신성으로 폭발할 것으로 봐요. 태양이 100억 년 사는 것과 비교하면 아주 짧은 삶이에요.']
      ],
      doubt: '무게 추정은 196~315 태양 질량 사이에서 연구마다 달라요. 이웃 별빛이 섞여 보여서 재기 어렵기 때문이에요.',
      aim: { kind: 'radec', ra: 84.68, dec: -69.1, label: 'R136a1 조준' },
      src: 'Crowther et al. 2010 · Kalari et al. 2022 · 2025 분광 연구'
    },
    {
      id: 'proxima', cat: 'star', ico: '🔭', tag: '가장 가까운 별', name: '프록시마 센타우리',
      value: '4.24', unit: '광년',
      lead: '태양에서 가장 가까운 별. 센타우루스자리의 적색왜성으로, 태양 질량의 약 12%밖에 안 돼요.',
      analogy: '빛으로 4년 3개월. 지금 보는 빛은 2022년 가을에 출발했어요. 그런데 적위가 −62.7°라 한국에서는 지평선 위로 절대 떠오르지 않아요(최고 고도 약 −10°).',
      fig: 'dist',
      figCap: '가장 가까운 별도 빛으로 4년이 넘게 걸려요. 은하 밖 천체는 얼마나 멀지 자 위에서 비교해 보세요.',
      facts: [
        ['거리', '4.24 광년 (약 40조 km)'],
        ['겉보기 등급', '11.1 — 망원경 필요'],
        ['질량', '태양의 약 12%'],
        ['한국에서', '지평선 위로 안 올라옴 (최고 고도 약 −10°)'],
        ['행성', '프록시마 b (2016), 프록시마 d (2022)']
      ],
      qa: [
        ['가장 가까운 별인데 왜 안 보여요?', '아주 어둡고(태양의 약 1/600) 남반구 하늘에 있기 때문이에요. 북위 27°보다 북쪽에서는 지평선 아래로만 지나갑니다.']
      ],
      aim: { kind: 'catalog', id: 'proxima', ra: 217.44, dec: -62.68, label: '프록시마 조준' },
      catalog: 'proxima',
      src: 'Gaia DR3 · ESO 2016/2022 행성 발견'
    },
    {
      id: 'pulsar', cat: 'star', ico: '⏱️', tag: '가장 빨리 도는 천체', name: 'PSR J1748−2446ad',
      value: '초당 716', unit: '바퀴',
      lead: '테르잔 5라는 별의 무리 안에 있는 밀리초 펄서. 지금까지 알려진 천체 가운데 가장 빨리 돕니다.',
      analogy: '1초에 716바퀴예요. 주방 믹서기(초당 4~8바퀴)의 100배쯤 됩니다. 적도는 빛의 24% 속도(초속 7만 km)로 돌아요.',
      facts: [
        ['회전', '초당 716.36바퀴 (1.396 ms에 한 바퀴)'],
        ['지름', '16 km 이하'],
        ['거리', '약 1만 8천 광년 (테르잔 5)'],
        ['적도 속도', '광속의 약 24%'],
        ['무게', '태양의 2배 이하']
      ],
      qa: [
        ['이렇게 빨리 돌아도 안 부서져요?', '중성자별은 태양보다 무거운 질량이 지름 20 km 안에 들어간 아주 단단한 천체예요. 이보다 빨리 돌면 표면 물질이 날아가 버려서 이 속도가 거의 한계입니다.'],
        ['펄서가 뭐예요?', '빠르게 도는 중성자별이 내는 전파 다발이 등대 불빛처럼 지구를 스칠 때마다 "똑딱" 규칙적인 신호가 잡히는 천체예요.']
      ],
      aim: { kind: 'radec', ra: 267.02, dec: -24.77, label: 'PSR 조준' },
      src: 'Hessels et al. 2006, Science 311, 1901'
    },
    {
      id: 'olympus', cat: 'solar', ico: '🌋', tag: '태양계에서 가장 높은 산', name: '올림푸스 몬스',
      value: '약 22', unit: 'km (화성)',
      lead: '화성의 거대 화산. 태양계에서 가장 높은 산이에요.',
      analogy: '에베레스트(8.85 km)의 약 2.5배 높이예요. 밑면 지름이 약 600 km로 서울에서 부산까지 거리의 두 배쯤 되고, 밑면 넓이는 남한 넓이의 약 2.8배(28만 km²)입니다.',
      facts: [
        ['높이', '약 22 km'],
        ['에베레스트와 비교', '약 2.5배'],
        ['밑면 지름', '약 600 km'],
        ['경사', '아주 완만함 (막대한 방패형 화산)'],
        ['위치', '화성 타르시스 화산 지대']
      ],
      qa: [
        ['왜 이렇게 클 수 있어요?', '화성은 중력이 지구의 0.38배이고, 지구처럼 판이 움직이지 않아요. 그래서 화산이 한자리에서 계속 자랄 수 있었어요. 지구는 판이 움직여 화산이 흩어집니다.'],
        ['꼭대기에서 보면 어때요?', '경사가 완만해서 산꼭대기에 서도 "산 위"라는 느낌이 잘 안 들고, 사방이 지평선처럼 보인다고 해요.']
      ],
      aim: { kind: 'planet', key: 'mars', label: '화성 조준' },
      catalog: 'mars',
      src: 'NASA MGS/MOLA 지형 측정'
    },
    {
      id: 'venus', cat: 'solar', ico: '♨️', tag: '가장 뜨거운 행성', name: '금성',
      value: '약 464', unit: '°C (표면)',
      lead: '태양에서 두 번째 행성이지만 표면이 가장 뜨거운 행성이에요.',
      analogy: '납(327°C)도 녹는 온도예요. 수성보다 태양에서 멀리 있는데도 더 뜨거운 이유는, 두꺼운 이산화탄소 대기가 열을 가두는 온실 효과 때문이에요.',
      facts: [
        ['표면 온도', '약 464 °C'],
        ['기압', '지구의 약 92배'],
        ['대기', '96% 이산화탄소'],
        ['태양까지 거리', '0.72 AU (수성은 0.39 AU)'],
        ['자전', '243일 (거꾸로 아주 느리게)']
      ],
      qa: [
        ['수성이 더 가까운데 왜 금성이 더 더워요?', '수성은 대기가 거의 없어 열을 붙잡지 못해요. 금성은 두꺼운 대기가 열을 가두는 온실 효과가 아주 강해서 464°C까지 올라갑니다.'],
        ['금성에 생명이 살 수 있어요?', '표면은 너무 뜨겁고 산성이 강해 불가능해요. 다만 높은 구름층(약 50 km)은 온도와 기압이 지구와 비슷해 연구가 이어지고 있어요.']
      ],
      aim: { kind: 'planet', key: 'venus', label: '금성 조준' },
      catalog: 'venus',
      src: 'NASA 행성 팩트시트 · Magellan/VERITAS 관측'
    },
    {
      id: 'neptunewind', cat: 'solar', ico: '🌬️', tag: '가장 빠른 바람', name: '해왕성',
      value: '시속 약 2,100', unit: 'km',
      lead: '태양계에서 바람이 가장 센 행성. 태양에서 가장 먼 행성이에요.',
      analogy: '가장 센 태풍(약 250 km/h)의 8배, 여객기 순항 속도(900 km/h)의 두 배가 넘어요. 지구 같으면 건물이 전부 날아갈 속도입니다.',
      facts: [
        ['최고 풍속', '약 2,100 km/h'],
        ['태양까지 거리', '약 30 AU'],
        ['한 바퀴 공전', '약 165 지구 년'],
        ['발견', '1846년 — 계산으로 먼저 찾아낸 행성'],
        ['색', '메탄이 붉은빛을 흡수해 파랗게 보임']
      ],
      qa: [
        ['왜 이렇게 바람이 세요?', '해왕성은 스스로 내는 열이 태양에게 받는 빛보다 많아요. 그 열이 대기를 세게 움직이는 원인으로 보지만 아직 다 밝혀지지는 않았어요.'],
        ['해왕성에도 고리가 있어요?', '네, 아주 희미한 고리가 5개 있어요. 토성 고리처럼 밝지는 않아 망원경으로 보기 어렵습니다.']
      ],
      aim: { kind: 'planet', key: 'neptune', label: '해왕성 조준' },
      catalog: 'neptune',
      src: 'NASA 보이저 2호 · 허블 관측'
    },
    {
      id: 'ganymede', cat: 'solar', ico: '🌕', tag: '가장 큰 달', name: '가니메데',
      value: '5,268', unit: 'km (지름)',
      lead: '목성의 달 가운데 가장 큰 달. 태양계의 달 중에서도 가장 커요.',
      analogy: '수성(4,879 km)보다 커요. 행성보다 큰 달은 태양계에서 가니메데 하나뿐이에요. 다만 절반이 얼음이라 무게는 수성의 45% 정도입니다.',
      facts: [
        ['지름', '5,268 km'],
        ['수성과 비교', '수성(4,879 km)보다 큼'],
        ['목성 둘레', '약 7일에 한 바퀴'],
        ['표면', '얼음과 암석, 표면 아래 바다 추정'],
        ['특징', '달 중 유일하게 자기장을 가짐']
      ],
      qa: [
        ['달인데 왜 행성보다 커요?', '"행성"과 "달"은 크기로 나누지 않아요. 태양 둘레를 도는 것이 행성, 행성 둘레를 도는 것이 위성이에요. 그래서 큰 달도 얼마든지 있습니다.'],
        ['가니메데는 어떻게 봐요?', '목성을 망원경으로 보면 옆에 점 네 개가 보이는데, 그중 가장 큰 것이 가니메데예요. 쌍안경으로도 목성 옆 점으로 확인할 수 있어요.']
      ],
      aim: { kind: 'planet', key: 'jupiter', label: '목성 조준 (가니메데의 주인)' },
      catalog: 'jupiter',
      src: 'NASA 갈릴레오 · 주노 관측'
    },
    {
      id: 'j1407b', cat: 'cosmos', ico: '💫', tag: '가장 큰 고리', name: 'J1407b',
      value: '반지름 0.6', unit: 'AU (약 9,000만 km)',
      lead: '토성보다 훨씬 거대한 고리를 가진 것으로 알려진 천체. 지구에서 약 434광년, 센타우루스자리 방향이에요.',
      analogy: '고리 반지름이 약 9,000만 km로, 토성 고리보다 수백 배 넓어요(연구마다 200~640배로 다르게 말합니다). 이 고리를 토성 자리에 두면 지구 하늘에서 보름달보다 훨씬 크게 보여요.',
      facts: [
        ['고리 반지름', '약 9,000만 km (0.6 AU)'],
        ['고리 수', '37개 이상'],
        ['지구에서', '약 434 광년'],
        ['고리 질량', '달 100개쯤 (지구 질량의 1.2배)'],
        ['발견', '2007년 별이 가려진 기록을 2012년에 해석']
      ],
      qa: [
        ['토성 고리보다 큰데 왜 토성이 유명해요?', '토성 고리는 우리 태양계 안이라 망원경으로 직접 볼 수 있어요. J1407b는 너무 멀어서 별빛이 가려지는 모양만으로 짐작합니다.'],
        ['고리 틈은 뭐예요?', '고리 사이의 빈틈은 작은 위성(엑소문)이 지나가며 파낸 것으로 보여요. 달이 만들어지는 순간을 보는 셈이에요.']
      ],
      doubt: '이 천체는 아직 직접 사진이 없어요. 2025년 다시 관측했을 때 발견되지 않아, 별 앞을 지나간 떠돌이 천체였을 가능성도 제기됐습니다.',
      src: 'Mamajek et al. 2012 · Kenworthy & Mamajek 2015 · ALMA 2025'
    },
    {
      id: 'andromeda', cat: 'cosmos', ico: '🌌', tag: '가장 가까운 큰 은하', name: '안드로메다 은하',
      value: '254만', unit: '광년',
      lead: '우리 은하와 같은 크기의 은하 가운데 가장 가까운 이웃. 안드로메다자리 M31이에요.',
      analogy: '아주 어두운 곳에서는 맨눈으로도 흐린 얼룩으로 보여요. 지금 보는 빛은 254만 년 전, 인류가 아직 돌도구를 쓰기 전에 출발했어요. 약 40억 년 뒤 우리 은하와 합쳐질 것으로 계산됩니다.',
      fig: 'dist',
      figCap: '안드로메다는 254만 광년 — 우주 규모에서 보면 아주 가까운 이웃이에요.',
      facts: [
        ['거리', '약 254만 광년'],
        ['지름', '약 22만 광년'],
        ['별 수', '약 1조 개'],
        ['겉보기 등급', '3.4 (아주 어두운 곳에서 맨눈)'],
        ['미래', '약 40억 년 뒤 우리 은하와 충돌·합체']
      ],
      qa: [
        ['맨눈으로 정말 보여요?', '빛공해가 없는 시골의 가을·겨울 밤에 흐린 연기 같은 얼룩으로 보여요. 도시에서는 쌍안경이나 망원경이 필요합니다.'],
        ['은하가 부딪히면 별이 다 없어져요?', '아니요. 별 사이 거리가 워낙 넓어서 실제로 부딪히는 별은 거의 없어요. 두 은하가 합쳐져 더 큰 은하 하나가 됩니다.']
      ],
      aim: { kind: 'catalog', id: 'm31', ra: 10.68, dec: 41.27, label: '안드로메다 은하 조준' },
      catalog: 'm31',
      src: 'Hubble·Gaia 거리 측정 · NASA/ESA'
    },
    {
      id: 'jades', cat: 'cosmos', ico: '🕰️', tag: '가장 멀고 오래된 은하', name: 'JADES-GS-z14-0',
      value: 'z = 14.18', unit: '적색편이',
      lead: '지금까지 확인된 은하 가운데 가장 멀리 있는 은하. 제임스 웹 우주망원경이 2024년에 찾았어요.',
      analogy: '빛이 134억 년 동안 날아왔어요. 우주 나이(138억 년)의 2%도 안 됐을 때의 모습입니다. 그사이 우주가 팽창해서 지금은 338억 광년 떨어져 있어요.',
      fig: 'dist',
      figCap: '오른쪽 끝이 JADES-GS-z14-0. 로그 눈금이라 오른쪽으로 갈수록 거리가 급격히 멀어져요.',
      facts: [
        ['적색편이', '14.18 (2025년 ALMA 정밀 측정)'],
        ['빛이 온 시간', '약 134억 년'],
        ['우주 나이', '약 3억 년밖에 안 됐을 때'],
        ['지금 거리', '약 338억 광년 (공변 거리)'],
        ['크기', '약 1,600 광년 폭']
      ],
      qa: [
        ['134억 년 전 빛을 어떻게 봐요?', '아주 먼 은하의 빛은 우주 팽창으로 늘어나(적색편이) 적외선이 돼요. 제임스 웹 망원경은 이 적외선을 볼 수 있어요.'],
        ['적색편이 14는 무슨 뜻이에요?', '빛의 파장이 원래보다 15배(1+14) 늘어났다는 뜻이에요. 많이 늘어날수록 더 멀고 더 오래된 빛입니다.']
      ],
      doubt: '더 먼 후보 은하가 계속 발견되고 있어서 "가장 멀다"는 기록은 몇 달마다 바뀔 수 있어요.',
      aim: { kind: 'radec', ra: 53.08, dec: -27.86, label: 'JADES 조준' },
      src: 'Carniani et al. 2024 (JWST) · ALMA 2025'
    }
  ];

  /* ---------------------------------------------------------------- 그리기 */
  var order = RECORDS.slice();
  var openId = RECORDS[0].id;
  var cat = 'all';

  function card(r) {
    var isOpen = r.id === openId;
    var fig = r.fig && FIGS[r.fig] ? '<figure class="rec-fig">' + FIGS[r.fig]() +
      '<figcaption>' + esc(r.figCap || '') + '</figcaption></figure>' : '';
    var facts = (r.facts || []).length ?
      '<ul class="rec-facts">' + r.facts.map(function (f) {
        return '<li><span>' + esc(f[0]) + '</span><b>' + esc(f[1]) + '</b></li>';
      }).join('') + '</ul>' : '';
    var qa = (r.qa || []).length ?
      '<div class="rec-qa">' + r.qa.map(function (q) {
        return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>';
      }).join('') + '</div>' : '';
    var doubt = r.doubt ?
      '<p class="rec-doubt"><b>확실히 알아 두세요</b> ' + esc(r.doubt) + '</p>' : '';
    var acts = [];
    if (r.aim) {
      acts.push('<button type="button" class="rec-btn rec-btn-aim" data-rec-aim="' + esc(r.id) + '">🎯 ' + esc(r.aim.label || '하늘에서 조준') + '</button>');
    }
    if (r.catalog) {
      acts.push('<button type="button" class="rec-btn" data-rec-cat="' + esc(r.catalog) + '">📖 도감 카드</button>');
    }
    var see = (r.aim && r.aim.kind === 'radec' && !r.catalog)
      ? '<p class="rec-see">🔭 이 천체는 맨눈으로 보이지 않아요. 조준은 하늘에서 그 방향을 알려 줍니다.</p>' : '';
    return '<article class="rec-card' + (isOpen ? ' is-open' : '') + '" data-rec="' + esc(r.id) + '" data-cat="' + esc(r.cat) + '">' +
      '<button class="rec-head" type="button" data-rec-toggle="' + esc(r.id) + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '" aria-controls="recb-' + esc(r.id) + '">' +
        '<span class="rec-ico" aria-hidden="true">' + esc(r.ico) + '</span>' +
        '<span class="rec-title"><span class="rec-tag">' + esc(r.tag) + '</span><span class="rec-name">' + esc(r.name) + '</span></span>' +
        '<span class="rec-value">' + esc(r.value) + '<em>' + esc(r.unit) + '</em></span>' +
        '<span class="rec-chev" aria-hidden="true">▾</span>' +
      '</button>' +
      '<div class="rec-body" id="recb-' + esc(r.id) + '"' + (isOpen ? '' : ' hidden') + '>' +
        '<p class="rec-lead">' + esc(r.lead) + '</p>' +
        '<div class="rec-analogy"><span class="rec-aico" aria-hidden="true">🤯</span><p><b>얼마나 대단할까?</b> ' + esc(r.analogy) + '</p></div>' +
        fig + facts + qa + doubt + see +
        (acts.length ? '<div class="rec-actions">' + acts.join('') + '</div>' : '') +
        (r.src ? '<p class="rec-src">자료: ' + esc(r.src) + '</p>' : '') +
      '</div>' +
    '</article>';
  }

  function renderList() {
    var list = $('#recList');
    if (!list) return;
    list.innerHTML = order.map(card).join('');
    $('#recCount').textContent = '기록 ' + order.length + '개';
  }

  function applyFilter(next) {
    cat = next;
    var chips = document.querySelectorAll('#recFilters .rec-chip');
    Array.prototype.forEach.call(chips, function (b) {
      var on = b.getAttribute('data-cat') === cat;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    order = RECORDS.filter(function (r) { return cat === 'all' || r.cat === cat; });
    // 지금 펼친 카드가 걸러지면 첫 카드를 펼칩니다.
    if (!order.some(function (r) { return r.id === openId; }) && order.length) openId = order[0].id;
    renderList();
  }

  function setOpen(id, scroll) {
    openId = id;
    var cards = document.querySelectorAll('#recList .rec-card');
    Array.prototype.forEach.call(cards, function (c) {
      var on = c.getAttribute('data-rec') === id;
      c.classList.toggle('is-open', on);
      var head = c.querySelector('.rec-head');
      var body = c.querySelector('.rec-body');
      if (head) head.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (body) body.hidden = !on;
    });
    if (scroll) {
      var el = document.querySelector('#recList .rec-card[data-rec="' + id + '"]');
      if (el) {
        var top = el.getBoundingClientRect().top + window.scrollY - 70;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    }
  }

  function findRec(id) {
    for (var i = 0; i < RECORDS.length; i++) if (RECORDS[i].id === id) return RECORDS[i];
    return null;
  }

  function aimRecord(r) {
    var B = window.OneulBam;
    if (!B) return;
    if (r.aim.kind === 'planet' && B.aimAt) B.aimAt('planet', r.aim.key);
    else if (r.aim.kind === 'catalog' && B.aimObject) B.aimObject(r.aim.id);
    else if (r.aim.kind === 'radec' && B.aimRaDec) B.aimRaDec(r.aim.ra, r.aim.dec, r.name);
  }

  function openCatalog(id) {
    if (window.OneulBam && window.OneulBam.openObject) window.OneulBam.openObject(id);
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('is-show'); }, 2600);
  }

  function build() {
    HOST = document.getElementById('recordsApp');
    if (!HOST) return;
    HOST.innerHTML =
      '<div class="rec-top">' +
        '<div class="rec-filters" id="recFilters" role="group" aria-label="기록 분류">' +
          CATS.map(function (c) {
            return '<button type="button" class="rec-chip' + (c.k === 'all' ? ' is-active' : '') + '" data-cat="' + c.k + '" aria-pressed="' + (c.k === 'all' ? 'true' : 'false') + '">' +
              '<span aria-hidden="true">' + c.ico + '</span> ' + esc(c.label) + '</button>';
          }).join('') +
        '</div>' +
        '<button type="button" class="rec-lucky" id="recLucky">🎲 오늘의 기록 뽑기</button>' +
      '</div>' +
      '<p class="rec-guide">카드를 누르면 펼쳐져요. <b>🎯 조준</b>을 누르면 라이브 하늘 화면이 그 방향으로 돌아가요. <span class="rec-count" id="recCount" aria-live="polite"></span></p>' +
      '<div class="rec-list" id="recList"></div>' +
      '<p class="rec-foot">수치는 공개 논문·NASA·ESA 자료에서 확인한 값이고, 측정이 갈리는 값은 <b>확실히 알아 두세요</b>에 함께 적었습니다.</p>';
    renderList();

    HOST.addEventListener('click', function (e) {
      var chip = e.target.closest ? e.target.closest('.rec-chip') : null;
      if (chip) { applyFilter(chip.getAttribute('data-cat')); return; }
      var luck = e.target.closest ? e.target.closest('#recLucky') : null;
      if (luck) {
        if (!order.length) return;
        var pick = order[Math.floor(Math.random() * order.length)];
        setOpen(pick.id, true);
        return;
      }
      var toggle = e.target.closest ? e.target.closest('[data-rec-toggle]') : null;
      if (toggle) {
        var id = toggle.getAttribute('data-rec-toggle');
        setOpen(openId === id ? '' : id, false);
        return;
      }
      var aim = e.target.closest ? e.target.closest('[data-rec-aim]') : null;
      if (aim) {
        var r = findRec(aim.getAttribute('data-rec-aim'));
        if (r) aimRecord(r);
        return;
      }
      var catBtn = e.target.closest ? e.target.closest('[data-rec-cat]') : null;
      if (catBtn) { openCatalog(catBtn.getAttribute('data-rec-cat')); return; }
    });
  }

  window.Records = {
    count: function () { return RECORDS.length; },
    list: function () { return RECORDS.slice(); },
    filter: applyFilter,
    open: setOpen
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
