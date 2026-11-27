/* =========================================================================
   learn-figs.js — 학습관 「개념 도해」 (2026-11-28)
   · 교과서·자습서에 없는 눈으로 보는 설명을 직접 그린 인라인 SVG 로 넣습니다.
     (외부 이미지 없음 → 오프라인·저작권 안전, SW 캐시는 JS 파일만 받으면 됨)
   · 모든 그림은 role="img" + aria-label, 아래에 figcaption.
   · 색은 CSS 변수(var(--text) 등)를 쓰므로 레드라이트 모드에서도 대비가 유지됩니다.
   · 수치는 tools/sky_motion_check.py · tools/audit_lab.py 로 독립 검증했습니다.
   ========================================================================= */
(function () {
  'use strict';

  var C = {
    text: 'var(--text, #eef2fb)',
    mut: 'var(--muted, #9aa6c0)',
    faint: 'var(--faint, #7c88a3)',
    acc: 'var(--accent, #ffd479)',
    acc2: 'var(--accent-2, #7ee0c0)',
    acc3: 'var(--accent-3, #8ab6ff)',
    line: 'rgba(255,255,255,.20)',
    grid: 'rgba(255,255,255,.10)',
    warm: '#ff8a5c',
    white: '#e9eef8'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function n(v) { return Math.round(v * 10) / 10; }

  /* ---------------------------------------------------------------- 그리기 */
  function T(x, y, s, o) {
    o = o || {};
    return '<text x="' + n(x) + '" y="' + n(y) + '" fill="' + (o.c || C.mut) + '"' +
      ' font-size="' + (o.s || 10.5) + '" font-weight="' + (o.w || 500) + '"' +
      ' text-anchor="' + (o.a || 'middle') + '"' +
      (o.r ? ' transform="rotate(' + o.r + ' ' + n(x) + ' ' + n(y) + ')"' : '') + '>' + esc(s) + '</text>';
  }
  function L(x1, y1, x2, y2, o) {
    o = o || {};
    return '<line x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '"' +
      ' stroke="' + (o.c || C.line) + '" stroke-width="' + (o.w || 1) + '"' +
      (o.d ? ' stroke-dasharray="' + o.d + '"' : '') + ' stroke-linecap="round"/>';
  }
  function CIR(x, y, r, o) {
    o = o || {};
    return '<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(r) + '" fill="' + (o.f || 'none') + '"' +
      (o.s ? ' stroke="' + o.s + '" stroke-width="' + (o.w || 1) + '"' : '') + '/>';
  }
  function P(d, o) {
    o = o || {};
    return '<path d="' + d + '" fill="' + (o.f || 'none') + '" stroke="' + (o.c || 'none') + '"' +
      ' stroke-width="' + (o.w || 1) + '"' + (o.d ? ' stroke-dasharray="' + o.d + '"' : '') +
      ' stroke-linejoin="round" stroke-linecap="round"/>';
  }
  function ARR(x1, y1, x2, y2, o) {
    o = o || {};
    var a = Math.atan2(y2 - y1, x2 - x1), h = o.h || 5.5, c = o.c || C.acc2;
    return L(x1, y1, x2, y2, { c: c, w: o.w || 1.4 }) +
      P('M' + n(x2) + ' ' + n(y2) + 'L' + n(x2 - h * Math.cos(a - 0.45)) + ' ' + n(y2 - h * Math.sin(a - 0.45)) +
        'L' + n(x2 - h * Math.cos(a + 0.45)) + ' ' + n(y2 - h * Math.sin(a + 0.45)) + 'Z', { f: c });
  }
  function ARC(cx, cy, r, a1, a2, o) {
    o = o || {};
    var r1 = a1 * Math.PI / 180, r2 = a2 * Math.PI / 180;
    var x1 = cx + r * Math.cos(r1), y1 = cy + r * Math.sin(r1);
    var x2 = cx + r * Math.cos(r2), y2 = cy + r * Math.sin(r2);
    var large = Math.abs(a2 - a1) > 180 ? 1 : 0;
    return P('M' + n(x1) + ' ' + n(y1) + 'A' + n(r) + ' ' + n(r) + ' 0 ' + large + ' 1 ' + n(x2) + ' ' + n(y2),
      { c: o.c || C.acc, w: o.w || 1.2, d: o.d });
  }
  function BOX(x, y, w, h, o) {
    o = o || {};
    return '<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" rx="' + (o.r || 6) +
      '" fill="' + (o.f || 'rgba(255,255,255,.035)') + '"' + (o.s ? ' stroke="' + o.s + '" stroke-width="1"' : '') + '/>';
  }
  function starPath(x, y, r) {
    var d = '';
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r;
      d += (i ? 'L' : 'M') + n(x + Math.cos(a) * rr) + ' ' + n(y + Math.sin(a) * rr);
    }
    return d + 'Z';
  }
  function STAR(x, y, r, c) { return P(starPath(x, y, r), { f: c || C.acc }); }

  function wrap(key, w, h, label, caption, inner, cls) {
    return '<figure class="lu-figure ' + (cls || '') + '" data-fig-key="' + key + '">' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label) + '"' +
      ' preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>' +
      (caption ? '<figcaption>' + caption + '</figcaption>' : '') + '</figure>';
  }
  /** 여러 장을 격자로 (모바일 1열 · 넓은 화면 2열) */
  function grid(cells, key, caption) {
    return '<div class="lu-fig-grid" data-fig-key="' + key + '">' + cells.join('') + '</div>' +
      (caption ? '<p class="lu-fig-cap">' + caption + '</p>' : '');
  }
  function mini(w, h, label, inner) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label) + '"' +
      ' preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  }

  /* ====================================================================
     1. 연주시차 — 1 AU 기선과 p 의 정의
     ==================================================================== */
  function figParallax() {
    var S = { x: 160, y: 30 };            // 별
    var sun = { x: 160, y: 172 };
    var jan = { x: 258, y: 172 }, jul = { x: 62, y: 172 };
    var g = '';
    // 지구 궤도
    g += P('M62 172A98 30 0 0 0 258 172', { c: C.grid, w: 1, d: '3 4' });
    g += P('M62 172A98 30 0 0 1 258 172', { c: 'rgba(255,255,255,.05)', w: 1 });
    // 시선
    g += L(S.x, S.y, sun.x, sun.y, { c: C.faint, w: 1, d: '4 4' });
    g += L(jan.x, jan.y, S.x, S.y, { c: C.acc3, w: 1.3 });
    g += L(jul.x, jul.y, S.x, S.y, { c: C.acc, w: 1.3 });
    // 별
    g += STAR(S.x, S.y, 8, C.white);
    g += T(S.x + 16, S.y - 2, '별', { c: C.text, a: 'start', w: 700 });
    g += T(S.x + 16, S.y + 11, '아주 멀리 있음', { c: C.faint, a: 'start', s: 9 });
    // 태양·지구
    g += CIR(sun.x, sun.y, 8, { f: C.acc });
    g += T(sun.x, sun.y + 20, '태양', { c: C.mut, s: 9.5 });
    g += CIR(jan.x, jan.y, 6, { f: C.acc3 });
    g += T(jan.x + 2, jan.y + 20, '1월의 지구', { c: C.acc3, s: 9.5 });
    g += CIR(jul.x, jul.y, 6, { f: C.acc });
    g += T(jul.x - 2, jul.y + 20, '7월의 지구', { c: C.acc, s: 9.5 });
    // 기선: 태양~1월 지구 = 1 AU (지구 지름 2 AU)
    g += L(sun.x, 196, jan.x, 196, { c: C.acc2, w: 1.4 });
    g += L(sun.x, 192, sun.x, 200, { c: C.acc2, w: 1.4 });
    g += L(jan.x, 192, jan.x, 200, { c: C.acc2, w: 1.4 });
    g += T((sun.x + jan.x) / 2, 209, '기선 1 AU', { c: C.acc2, s: 9.5, w: 700 });
    // 별에서 두 시선이 만드는 각 2p
    g += ARC(S.x, S.y, 58, 74, 106, { c: C.acc2, w: 1.3 });
    g += T(S.x + 2, S.y + 50, '2p', { c: C.acc2, s: 11, w: 800 });
    g += T(S.x, 132, '두 시선 사이 각 = 2p', { c: C.mut, s: 9.5 });
    // 수식 상자
    g += BOX(6, 6, 150, 40);
    g += T(13, 22, 'd[pc] = 1 / p[″]', { c: C.acc, a: 'start', s: 11, w: 700 });
    g += T(13, 37, '1 pc = 3.26광년 = 206,265 AU', { c: C.mut, a: 'start', s: 8.5 });
    g += T(160, 222, '각도는 크게 과장했습니다 (실제 p는 1″ 이하)', { c: C.faint, s: 8.5 });
    return wrap('parallax', 320, 230,
      '연주시차 도해. 태양을 가운데 두고 1월과 7월의 지구 위치가 1 AU 기선을 이루며, 별에서 두 시선이 만드는 각의 절반이 연주시차 p 입니다.',
      '<b>연주시차의 정의</b> — 6개월 간격으로 별을 보면 방향이 조금 달라집니다. 그 차이의 절반이 p이고, 기선은 1 AU(지구–태양 거리)입니다. 두 지구 사이는 2 AU(약 3억 km)라서 별은 1년에 <b>2p</b> 만큼 왕복합니다. p를 각초로 재면 거리는 d[pc] = 1/p[″]. 그림의 각도는 아주 크게 과장했습니다.',
      g);
  }

  /* ====================================================================
     2. 일·월식이 드문 까닭 — 궤도 경사 5.145° 와 교점
     ==================================================================== */
  function figEclipse() {
    var W = 320, H = 268;
    var g = '';
    // 세 장면을 가로 띠로: (1) 교점의 삭 → 일식 (2) 교점에서 벗어난 삭 → 식 없음 (3) 망 → 월식
    function strip(y0, kind) {
      var ex = 236, ey = y0 + 34;        // 지구 중심
      var sun = { x: 24, y: ey };
      var o = '';
      o += L(8, ey, 312, ey, { c: C.grid, w: 1, d: '5 4' });
      o += CIR(sun.x, sun.y, 9, { f: C.acc });
      o += T(sun.x, sun.y + 18, '태양', { c: C.mut, s: 8 });
      o += CIR(ex, ey, 7, { f: C.acc3 });
      o += T(ex, ey + 20, '지구', { c: C.acc3, s: 8.5 });
      if (kind !== 'lunar') {
        // 삭: 달이 태양 쪽(왼쪽)
        var mx = ex - 78, dy = kind === 'solar' ? 0 : -13;   // 5.1° 를 과장
        o += CIR(mx, ey + dy, 5, { f: C.white });
        o += T(mx, ey + dy - 9, '삭의 달', { c: C.white, s: 8 });
        // 그림자: 달에서 지구 쪽으로
        var hit = kind === 'solar';
        o += P('M' + (mx + 4) + ' ' + (ey + dy) + 'L' + (ex + 34) + ' ' + (ey + dy + (hit ? 0 : dy * 0.5)) +
          'L' + (ex + 34) + ' ' + (ey + dy + (hit ? 0 : dy * 0.5) + 9) + 'L' + (mx + 4) + ' ' + (ey + dy + 9) + 'Z',
          { f: hit ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.10)', c: 'rgba(255,255,255,.30)', w: 0.8 });
        if (hit) {
          o += T(300, ey - 30, '일식', { c: C.acc2, a: 'end', s: 10, w: 800 });
          o += T(300, ey - 18, '그림자가 지구를 덮음', { c: C.acc2, a: 'end', s: 8 });
        } else {
          o += T(300, ey - 30, '식 없음', { c: C.mut, a: 'end', s: 10, w: 800 });
          o += T(300, ey - 18, '그림자가 지구 위로 빗나감', { c: C.mut, a: 'end', s: 8 });
          o += L(mx + 4, ey + dy + 4, ex + 20, ey + dy * 0.5 + 4, { c: 'rgba(255,122,110,.6)', w: 1, d: '3 3' });
        }
      } else {
        // 망: 달이 지구 반대쪽(오른쪽) — 지구 그림자 속으로
        var mx2 = ex + 62;
        o += P('M' + (ex + 7) + ' ' + (ey - 3) + 'L' + (ex + 74) + ' ' + (ey - 12) + 'L' + (ex + 74) + ' ' + (ey + 12) + 'L' + (ex + 7) + ' ' + (ey + 3) + 'Z',
          { f: 'rgba(120,140,190,.20)', c: 'rgba(150,170,210,.35)', w: 0.8 });
        o += CIR(mx2, ey, 4.5, { f: C.white, s: C.acc2, w: 1 });
        o += T(300, ey - 30, '월식', { c: C.acc2, a: 'end', s: 10, w: 800 });
        o += T(300, ey - 18, '망의 달이 지구 그림자에 들어감', { c: C.acc2, a: 'end', s: 8 });
        o += T(mx2, ey - 14, '망의 달', { c: C.white, s: 8 });
      }
      return o;
    }
    g += T(8, 14, '① 교점 근처의 삭 — 세 천체가 거의 일직선', { c: C.text, a: 'start', s: 9, w: 700 });
    g += strip(22, 'solar');
    g += T(8, 106, '② 교점에서 벗어난 삭 — 달이 황도면 위로 5.1°(과장)', { c: C.text, a: 'start', s: 9, w: 700 });
    g += strip(114, 'none');
    g += T(8, 198, '③ 망 — 달이 지구 그림자 속으로 들어가면 월식', { c: C.text, a: 'start', s: 9, w: 700 });
    g += strip(206, 'lunar');
    g += T(160, 262, '달 궤도는 황도면에서 5.145° 기울어 → 교점의 삭·망에서만 식이 생깁니다', { c: C.mut, s: 8.5 });
    return wrap('eclipse', W, H,
      '일식과 월식이 드문 이유 도해. 교점 근처의 삭에서는 달 그림자가 지구를 덮어 일식이 되고, 교점에서 벗어난 삭에서는 그림자가 지구 위로 빗나갑니다. 망에는 달이 지구 그림자에 들어가면 월식이 됩니다.',
      '<b>왜 매달 식이 생기지 않을까</b> — 달 궤도는 황도면에서 5.145° 기울어져 있습니다. 그림의 1번처럼 교점 근처에서 삭이 되면 그림자가 지구를 덮어 일식이 되지만, 2번처럼 교점에서 벗어나면 달이 황도면 위나 아래로 최대 5.1° 떨어져 그림자가 빗나갑니다. 망에는 달이 지구 그림자 속으로 들어갈 때 월식이 됩니다. 그림의 기울기는 보기 쉽게 과장했습니다.',
      g);
  }

  /* ====================================================================
     3. 계절과 황도 경사 23.44°
     ==================================================================== */
  function figSeasons() {
    var g = '', cx = 160, cy = 104, R = 96;
    g += CIR(cx, cy, 10, { f: C.acc });
    g += T(cx, cy + 24, '태양', { c: C.mut, s: 9 });
    g += P('M' + (cx - R) + ' ' + cy + 'A' + R + ' ' + (R * 0.42) + ' 0 1 0 ' + (cx + R) + ' ' + cy +
      'A' + R + ' ' + (R * 0.42) + ' 0 1 0 ' + (cx - R) + ' ' + cy + 'Z', { c: C.grid, w: 1, d: '4 5' });
    var pos = [
      { m: '6월 하지', dec: '+23.44°', x: cx - R, y: cy },
      { m: '12월 동지', dec: '−23.44°', x: cx + R, y: cy },
      { m: '3월 춘분', dec: '0°', x: cx, y: cy + R * 0.42 },
      { m: '9월 추분', dec: '0°', x: cx, y: cy - R * 0.42 }
    ];
    pos.forEach(function (p) {
      var ax = Math.sin(23.44 * Math.PI / 180) * 15, ay = -Math.cos(23.44 * Math.PI / 180) * 15;
      g += L(p.x - ax, p.y - ay, p.x + ax, p.y + ay, { c: C.text, w: 1.3 });
      g += CIR(p.x + ax, p.y + ay, 2.4, { f: C.acc3 });
      g += CIR(p.x, p.y, 7, { f: 'rgba(138,182,255,.28)', s: C.acc3, w: 1 });
      var below = p.y >= cy;
      g += T(p.x, p.y + (below ? 30 : -16), p.m, { c: C.text, s: 9.5, w: 700 });
      g += T(p.x, p.y + (below ? 41 : -5), '태양 적위 ' + p.dec, { c: C.acc2, s: 8.5 });
    });
    g += T(cx, 12, '지구 자전축은 우주 공간에서 방향이 일정 (23.44° 기울어짐)', { c: C.mut, s: 9 });
    var bars = [['6월 하지', 14.6], ['춘·추분', 12.0], ['12월 동지', 9.6]];
    var bx = 16, by = 178, bw = 288;
    g += T(bx, by - 6, '북위 37°(오산)의 낮 길이 — 위도에 따라 이 값이 달라집니다', { c: C.faint, a: 'start', s: 8.5 });
    bars.forEach(function (b, i) {
      var y = by + i * 13, w = b[1] / 24 * (bw - 62);
      g += T(bx, y + 7, b[0], { c: C.mut, a: 'start', s: 8.5 });
      g += '<rect x="' + (bx + 54) + '" y="' + y + '" width="' + n(w) + '" height="7" rx="3.5" fill="' +
        (i === 0 ? C.acc : i === 1 ? C.acc2 : C.acc3) + '" opacity=".55"/>';
      g += T(bx + 58 + w, y + 7, b[1].toFixed(1) + '시간', { c: C.text, a: 'start', s: 8.5, w: 700 });
    });
    return wrap('seasons', 320, 224,
      '계절이 생기는 까닭 도해. 지구가 공전해도 자전축 방향은 일정해, 6월에는 북반구가 태양 쪽으로 기울어 태양 적위가 +23.44도, 12월에는 -23.44도가 됩니다.',
      '<b>축의 방향은 변하지 않습니다</b> — 지구가 공전해도 자전축은 같은 방향을 가리키므로, 6월에는 북반구가 태양 쪽으로 기울어 태양 적위가 +23.44°(정오 고도 최대), 12월에는 −23.44°가 됩니다. 낮 길이도 함께 달라집니다.',
      g);
  }

  /* ====================================================================
     4. H-R도 위의 별의 진화 경로
     ==================================================================== */
  function figHrEvolution() {
    var W = 320, H = 240, x0 = 40, x1 = 306, y0 = 22, y1 = 202;
    var g = '';
    g += L(x0, y1, x1, y1, { c: C.line, w: 1 });
    g += L(x0, y0, x0, y1, { c: C.line, w: 1 });
    function px(T) { return x0 + (Math.log10(40000 / Math.max(2500, T)) / Math.log10(40000 / 2500)) * (x1 - x0); }
    function py(Lg) { return y1 - (Math.log10(Math.max(1e-4, Lg)) + 4) / 10 * (y1 - y0); }
    [30000, 10000, 6000, 3000].forEach(function (t) {
      g += L(px(t), y0, px(t), y1, { c: 'rgba(255,255,255,.06)', w: 1 });
      g += T(px(t), y1 + 11, (t / 1000) + 'k', { c: C.faint, s: 8.5 });
    });
    g += T((x0 + x1) / 2, 230, '표면 온도 (K) — 왼쪽이 뜨겁고 오른쪽이 차갑습니다', { c: C.mut, s: 9 });
    [1e-3, 1, 1e3, 1e6].forEach(function (l) {
      g += L(x0, py(l), x1, py(l), { c: 'rgba(255,255,255,.06)', w: 1 });
      g += T(x0 - 4, py(l) + 3, l === 1 ? '1' : (l === 1e-3 ? '10⁻³' : l === 1e3 ? '10³' : '10⁶'), { c: C.faint, s: 8.5, a: 'end' });
    });
    g += T(4, y0 - 8, '광도(태양=1)', { c: C.mut, a: 'start', s: 9 });
    // 주계열 (L = M^3.5, T = 5772 M^0.55 와 같은 근사를 씁니다)
    var ms = '';
    for (var m = 0.1; m <= 32; m *= 1.12) {
      var q = px(5772 * Math.pow(m, 0.55)), r = py(Math.pow(m, 3.5));
      ms += (ms ? 'L' : 'M') + n(q) + ' ' + n(r);
    }
    g += P(ms, { c: C.acc, w: 3.4 });
    g += T(px(9000), py(120), '주계열', { c: C.acc, s: 9.5, w: 700, a: 'start' });
    var sun = [px(5772), py(1)];
    g += CIR(sun[0], sun[1], 3.4, { f: C.white });
    g += T(sun[0] + 4, sun[1] + 13, '태양 5,772K', { c: C.text, a: 'start', s: 8.5 });
    var rg = [px(3500), py(1200)];
    g += CIR(rg[0], rg[1], 3.4, { f: C.warm });
    g += ARR(sun[0] + 3, sun[1] - 3, rg[0] + 2, rg[1] + 6, { c: C.warm, w: 1.2, h: 4.5 });
    g += T(rg[0] - 6, rg[1] - 6, '적색거성', { c: C.warm, a: 'end', s: 8.5, w: 700 });
    var wd = [px(15000), py(0.004)];
    g += ARR(rg[0] - 8, rg[1] + 2, wd[0] + 12, wd[1] - 6, { c: C.acc3, w: 1.2, h: 4.5 });
    g += CIR(wd[0], wd[1], 3, { f: C.acc3 });
    g += T(wd[0] + 6, wd[1] - 4, '백색왜성', { c: C.acc3, a: 'start', s: 8.5 });
    g += T(px(9000), py(0.02), '행성상 성운', { c: C.faint, s: 7.5 });
    var big = [px(30000), py(2e4)];
    g += CIR(big[0], big[1], 3.4, { f: C.acc2 });
    g += T(big[0] + 5, big[1] + 3, '15 M☉ 별', { c: C.acc2, a: 'start', s: 8.5, w: 700 });
    var sg = [px(3800), py(1.2e5)];
    g += ARR(big[0] - 2, big[1] - 3, sg[0] + 6, sg[1] + 4, { c: C.acc2, w: 1.2, h: 4.5 });
    g += CIR(sg[0], sg[1], 3.4, { f: C.warm });
    g += T(sg[0] - 5, sg[1] - 5, '초거성', { c: C.warm, a: 'end', s: 8.5 });
    g += T(px(2200), py(1.2e5) + 15, '→ 초신성 → 중성자별·블랙홀', { c: C.acc2, a: 'end', s: 8 });
    return wrap('hr-evolution', W, H,
      'H-R도 위의 별의 진화 경로. 태양 같은 별은 주계열에서 적색거성, 행성상 성운, 백색왜성으로 가고, 15태양질량 별은 청색 주계열에서 초거성, 초신성, 중성자별이나 블랙홀로 갑니다.',
      '<b>별의 생은 질량이 정합니다</b> — 태양(1 M☉)은 주계열에서 100억 년을 보낸 뒤 적색거성 → 행성상 성운 → 백색왜성으로 조용히 끝납니다. 8 M☉보다 무거운 별은 철 핵까지 만들어 초신성으로 폭발하고 중성자별이나 블랙홀을 남깁니다.',
      g);
  }

  /* ====================================================================
     5. 허블-르메트르 법칙 그래프
     ==================================================================== */
  function figHubble() {
    var W = 320, H = 214, x0 = 44, x1 = 300, y0 = 20, y1 = 176;
    var g = '';
    g += L(x0, y1, x1, y1, { c: C.line, w: 1 });
    g += L(x0, y0, x0, y1, { c: C.line, w: 1 });
    var dmax = 500;
    function px(d) { return x0 + d / dmax * (x1 - x0); }
    function py(v) { return y1 - v / 35000 * (y1 - y0); }
    [0, 100, 200, 300, 400, 500].forEach(function (d) {
      g += T(px(d), y1 + 11, d, { c: C.faint, s: 8.5 });
      g += L(px(d), y1, px(d), y1 + 3, { c: C.line, w: 1 });
    });
    [0, 10000, 20000, 30000].forEach(function (v) {
      g += T(x0 - 4, py(v) + 3, (v / 1000) + '천', { c: C.faint, s: 8.5, a: 'end' });
    });
    g += T((x0 + x1) / 2, 202, '거리 d (Mpc)', { c: C.mut, s: 9 });
    g += T(4, y0 - 6, '후퇴 속도 (km/s)', { c: C.mut, a: 'start', s: 9 });
    g += L(px(0), py(0), px(dmax), py(70 * dmax), { c: C.acc, w: 2 });
    g += T(px(430), py(70 * 430) - 7, 'v = H₀d  (H₀ = 70)', { c: C.acc, a: 'end', s: 9, w: 700 });
    [[16, 1100, '처녀자리'], [60, 4000, '바다뱀자리'], [100, 6900, '머리털자리'], [250, 17500, ''], [400, 28500, '']].forEach(function (p) {
      g += CIR(px(p[0]), py(p[1]), 2.6, { f: C.acc2 });
      if (p[2]) g += T(px(p[0]) + 5, py(p[1]) - 5, p[2], { c: C.acc2, a: 'start', s: 8 });
    });
    g += T(px(120), py(70 * 120) + 16, '기울기 = 허블 상수 H₀', { c: C.acc, a: 'start', s: 9 });
    return wrap('hubble', W, H,
      '허블-르메트르 법칙 그래프. 가로축 거리, 세로축 후퇴 속도에서 은하들이 기울기 70킬로미터 매 초 매 메가파섹의 직선을 따라 놓입니다.',
      '<b>속도는 거리에 비례합니다</b> — 가까운 은하일수록 천천히, 먼 은하일수록 빠르게 멀어집니다. 직선의 기울기가 허블 상수 H₀이며, 100 Mpc 떨어진 은하의 후퇴 속도는 약 7,000 km/s입니다. 실제 은하들은 고유 운동 때문에 직선에서 조금씩 흩어집니다(그림의 점은 대표값).',
      g);
  }

  /* ====================================================================
     6. 분광형 OBAFGKM 색-온도 띠
     ==================================================================== */
  function figSpectral() {
    var g = '', W = 320;
    var cols = ['#9db4ff', '#aecaff', '#e8eefc', '#fff4e2', '#ffe9a8', '#ffc27a', '#ff9a6a'];
    var names = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
    var temps = ['≥30,000', '10,000~30,000', '7,500~10,000', '6,000~7,500', '5,200~6,000', '3,700~5,200', '2,400~3,700'];
    var ex = ['10 라켈타이', '리겔', '시리우스·베가', '프로키온', '태양·카펠라', '아르크투루스', '베텔게우스'];
    var bw = (W - 28) / 7;
    names.forEach(function (nm, i) {
      var x = 14 + i * bw;
      g += '<rect x="' + n(x) + '" y="18" width="' + n(bw - 1.5) + '" height="34" rx="4" fill="' + cols[i] +
        '" opacity="' + (nm === 'G' ? '.98' : '.85') + '"/>';
      g += T(x + bw / 2, 40, nm, { c: '#141a28', s: 15, w: 800 });
      g += T(x + bw / 2, 66, temps[i], { c: C.mut, s: 7.5 });
      g += T(x + bw / 2, 80, ex[i], { c: C.faint, s: 7.5 });
    });
    g += T(14, 12, '뜨거움 (파랑)', { c: C.acc3, a: 'start', s: 8.5, w: 700 });
    g += T(W - 14, 12, '차가움 (빨강)', { c: C.warm, a: 'end', s: 8.5, w: 700 });
    g += T(14, 100, '표면 온도(K)', { c: C.faint, a: 'start', s: 8 });
    g += T(14, 114, '태양은 G2V — 최대 복사 파장 502 nm(초록빛)이지만 눈에는 흰색으로 보입니다.', { c: C.mut, a: 'start', s: 8.5 });
    function planck(l, Tk) {
      var Lm = l * 1e-9, h = 6.62607015e-34, c = 2.99792458e8, k = 1.380649e-23;
      return (2 * h * c * c) / (Math.pow(Lm, 5) * (Math.exp(h * c / (Lm * k * Tk)) - 1));
    }
    var bx0 = 24, bx1 = W - 20, by0 = 128, by1 = 170;
    g += L(bx0, by1, bx1, by1, { c: C.line, w: 1 });
    g += L(bx0, by0, bx0, by1, { c: C.line, w: 1 });
    var nmMax = 1400;
    [[30000, C.acc3], [5800, C.white], [3000, C.warm]].forEach(function (it) {
      var Tk = it[0], col = it[1], pk = planck(2.898e6 / Tk, Tk), d = '';
      for (var nm = 20; nm <= nmMax; nm += 8) {
        var v = planck(nm, Tk) / pk;
        var x = bx0 + (nm - 20) / (nmMax - 20) * (bx1 - bx0);
        var y = by1 - v * (by1 - by0) * 0.94;
        d += (d ? 'L' : 'M') + n(x) + ' ' + n(y);
      }
      g += P(d, { c: col, w: 1.6 });
      g += T(bx0 + (2.898e6 / Tk - 20) / (nmMax - 20) * (bx1 - bx0), by1 + 10,
        n(2.898e6 / Tk) + 'nm', { c: col, s: 7.5 });
    });
    g += T(bx0 + 3, by0 + 8, '복사 세기(곡선마다 최대=1)', { c: C.faint, a: 'start', s: 7.5 });
    g += T(bx1, by1 + 10, '파장(nm) →', { c: C.faint, a: 'end', s: 7.5 });
    return wrap('spectral', W, 186,
      '분광형 OBAFGKM 색과 온도 띠, 그리고 30,000켈빈, 5,800켈빈, 3,000켈빈 흑체복사 곡선. 온도가 높을수록 최대 복사 파장이 짧아집니다.',
      '<b>색은 온도입니다</b> — 분광형 O·B·A·F·G·K·M은 알파벳 순서가 아니라 표면 온도 순서입니다. 온도가 높을수록 최대 복사 파장이 짧아져 파랗게, 낮을수록 길어져 붉게 보입니다(빈의 법칙).',
      g);
  }

  /* ====================================================================
     7. 세페이드 변광성의 주기-광도 관계
     ==================================================================== */
  function figCepheid() {
    var W = 320, H = 208, x0 = 46, x1 = 300, y0 = 24, y1 = 158;
    var g = '';
    g += L(x0, y1, x1, y1, { c: C.line, w: 1 });
    g += L(x0, y0, x0, y1, { c: C.line, w: 1 });
    var LP0 = 0.4, LP1 = 2.1;                       // log P 0.4 ~ 2.1 (2.5일 ~ 126일)
    function px(lp) { return x0 + (lp - LP0) / (LP1 - LP0) * (x1 - x0); }
    function py(M) { return y0 + (M + 7) / 5.5 * (y1 - y0); }   // M -7 ~ -1.5
    [[1, '1'], [3, '3'], [10, '10'], [30, '30'], [100, '100']].forEach(function (it) {
      var lp = Math.log10(it[0]);
      g += T(px(lp), y1 + 11, it[1], { c: C.faint, s: 8.5 });
      g += L(px(lp), y1, px(lp), y1 + 3, { c: C.line, w: 1 });
    });
    [-6, -5, -4, -3, -2].forEach(function (M) {
      g += T(x0 - 4, py(M) + 3, M, { c: C.faint, s: 8.5, a: 'end' });
      g += L(x0, py(M), x1, py(M), { c: 'rgba(255,255,255,.06)', w: 1 });
    });
    g += T((x0 + x1) / 2, 196, '변광 주기 P (일, 로그 눈금)', { c: C.mut, s: 9 });
    g += T(6, y0 - 9, '절대등급 M (작을수록 밝음)', { c: C.mut, a: 'start', s: 8.5 });
    // M_V = −2.81 log P − 1.43 (고전적 세페이드)
    var d = '';
    for (var lp = LP0; lp <= LP1; lp += 0.05) {
      var M = -2.81 * lp - 1.43;
      d += (d ? 'L' : 'M') + n(px(lp)) + ' ' + n(py(M));
    }
    g += P(d, { c: C.acc, w: 2.2 });
    g += T(px(1.95), py(-2.81 * 1.95 - 1.43) + 14, 'M = −2.81 log P − 1.43', { c: C.acc, a: 'end', s: 9, w: 700 });
    [[5.37, 'δ 세페이'], [35.5, 'l 용골']].forEach(function (p) {
      var M = -2.81 * Math.log10(p[0]) - 1.43;
      g += CIR(px(Math.log10(p[0])), py(M), 2.8, { f: C.acc2 });
      g += T(px(Math.log10(p[0])) + 5, py(M) - 5, p[1], { c: C.acc2, a: 'start', s: 8 });
    });
    g += T(16, 176, '주기가 길수록 실제 밝기가 큽니다 → 겉보기 등급만 재면 거리를 알 수 있습니다', { c: C.mut, a: 'start', s: 8 });
    return wrap('cepheid', W, H,
      '세페이드 변광성의 주기-광도 관계 그래프. 주기가 길수록 절대등급이 밝아지는 직선 관계를 보여 줍니다.',
      '<b>우주의 자(ruler)</b> — 세페이드의 밝기 변화 주기를 재면 절대등급 M을 알 수 있습니다. 겉보기 등급 m과 비교해 d = 10^((m−M+5)/5) pc 로 거리를 구합니다. 1908년 헨리에타 리비트가 발견했고, 허블이 안드로메다까지의 거리를 재는 데 썼습니다.',
      g);
  }

  /* ====================================================================
     8. 남·북·동·서 하늘의 별 이동 — 실제 계산으로 그립니다
        (위도 37°, 적경·적위 → 방위·고도 변환, 시간당 위치 변화)
     ==================================================================== */
  var LAT37 = 37.0;
  function altaz(ra, dec, lst) {
    var H = ((lst - ra) % 360 + 360) % 360 * Math.PI / 180;
    var d = dec * Math.PI / 180, p = LAT37 * Math.PI / 180;
    var sh = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(H);
    var h = Math.asin(Math.max(-1, Math.min(1, sh))) * 180 / Math.PI;
    var az = Math.atan2(-Math.cos(d) * Math.sin(H),
      Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(H)) * 180 / Math.PI;
    return { az: (az + 360) % 360, alt: h };
  }
  function skyPanel(o) {
    var W = 320, H = 158, HZ = 128, R = 104;    // 지평선 y, 천구 반지름(px)
    var g = '';
    // 지면
    g += '<rect x="0" y="' + HZ + '" width="' + W + '" height="' + (H - HZ) + '" fill="rgba(255,255,255,.035)"/>';
    // 천구 돔 반원
    g += P('M' + (160 - R) + ' ' + HZ + 'A' + R + ' ' + R + ' 0 0 1 ' + (160 + R) + ' ' + HZ,
      { c: 'rgba(255,255,255,.12)', w: 1, d: '3 5' });
    [30, 60].forEach(function (a2) {
      var y = HZ - R * Math.sin(a2 * Math.PI / 180);
      g += L(160 - R * Math.cos(a2 * Math.PI / 180), y, 160 + R * Math.cos(a2 * Math.PI / 180), y,
        { c: 'rgba(255,255,255,.06)', w: 1, d: '2 5' });
      g += T(160 + R * Math.cos(a2 * Math.PI / 180) + 4, y + 3, a2 + '°', { c: C.faint, a: 'start', s: 7 });
    });
    g += L(0, HZ, W, HZ, { c: C.line, w: 1.2 });
    o.labels.forEach(function (lb) {
      g += T(160 + R * Math.sin(lb[1] * Math.PI / 180), HZ + 13, lb[0], { c: C.mut, s: 9, w: 700 });
    });
    function proj(az, alt) {
      var daz = ((az - o.az0 + 540) % 360) - 180;
      var r = R * Math.cos(alt * Math.PI / 180);
      return { x: 160 + r * Math.sin(daz * Math.PI / 180), y: HZ - R * Math.sin(alt * Math.PI / 180), daz: daz };
    }
    o.tracks.forEach(function (tk) {
      var d = '', pts = [];
      for (var t = -780; t <= 780; t += 2.5) {
        var lst = t / 60 * 15.041;
        var v = altaz(tk.ra, tk.dec, lst);
        var q = (v.alt < 0.5 || v.alt > 88.5) ? null : proj(v.az, v.alt);
        if (q && Math.abs(q.daz) > 88) q = null;
        if (q) {
          d += (pts.length && pts[pts.length - 1] ? 'L' : 'M') + n(q.x) + ' ' + n(q.y);
          pts.push(q);
        } else pts.push(null);
      }
      g += P(d, { c: tk.c || 'rgba(200,215,240,.42)', w: 1.6 });
      // 시야 밖으로 이어지는 궤적은 점선으로 이어 줍니다 (잘린 느낌 방지)
      var real = pts.filter(function (q) { return !!q; });
      [[pts.indexOf(real[0]), -1], [pts.indexOf(real[real.length - 1]), 1]].forEach(function (pair) {
        var i0 = pair[0], dir = pair[1];
        if (i0 < 0 || real.length < 6) return;
        var q1 = pts[i0], q2 = pts[i0 + dir * 4];
        if (!q2) return;
        if (Math.abs(q1.y - HZ) < 6) return;             // 지평선에서 시작·종료한 궤적은 그대로
        var ang = Math.atan2(q1.y - q2.y, q1.x - q2.x);
        var ex2 = q1.x + Math.cos(ang) * 12, ey2 = q1.y + Math.sin(ang) * 12;
        g += L(q1.x, q1.y, ex2, ey2, { c: tk.c || C.mut, w: 1.1, d: '1 3' });
      });
      [0.12, 0.3, 0.5, 0.7, 0.88].forEach(function (f) {
        var i = Math.max(1, Math.floor(pts.length * f));
        var a1 = pts[i], b1 = pts[i + 5];
        if (!a1 || !b1) return;
        var ang = Math.atan2(b1.y - a1.y, b1.x - a1.x);
        g += ARR(a1.x - Math.cos(ang) * 4, a1.y - Math.sin(ang) * 4,
          a1.x + Math.cos(ang) * 10, a1.y + Math.sin(ang) * 10, { c: tk.c2 || C.acc2, w: 1.4, h: 5.2 });
      });
      if (tk.name) {
        var mid = pts[Math.floor(pts.length * 0.5)];
        if (mid) g += T(mid.x, mid.y - 9, tk.name, { c: tk.c || C.mut, s: 7.5, w: 700 });
      }
      if (tk.endLabel) {
        var lastQ = null;
        for (var z = pts.length - 1; z >= 0; z--) { if (pts[z]) { lastQ = pts[z]; break; } }
        if (lastQ) g += T(lastQ.x + (tk.endDx || 0), lastQ.y + (tk.endDy || -8), tk.endLabel,
          { c: tk.c2 || C.acc2, s: 7.5, w: 700, a: tk.endAnchor || 'middle' });
      }
    });
    if (o.polaris) {
      var q2 = proj(360, LAT37);
      g += STAR(q2.x, q2.y, 3.8, C.acc);
      g += T(8, 26, '★ 북극성 — 고도 37° (관측 위도와 같음)', { c: C.acc, a: 'start', s: 7.5, w: 700 });
    }
    g += T(8, 12, o.title, { c: C.text, a: 'start', s: 9.5, w: 800 });
    g += T(W - 8, 12, o.note || '', { c: C.acc2, a: 'end', s: 7.5, w: 700 });
    return mini(W, H, o.title + ' 하늘의 별 이동 도해 (위도 37도)', g);
  }
  function figSky4() {
    var panels = [
      { key: 'south', title: '남쪽 하늘 (방위 180°)', az0: 180,
        labels: [['동', -90], ['남', 0], ['서', 90]], note: '동 → 서 (왼 → 오)',
        tracks: [{ ra: 0, dec: 0, c: '#c9d6ef', c2: C.acc2 }, { ra: 0, dec: -22, c: '#8ab6ff', c2: C.acc3 }] },
      { key: 'north', title: '북쪽 하늘 (방위 0°)', az0: 0, polaris: true,
        labels: [['서', -90], ['북', 0], ['동', 90]], note: '북극성 둘레 반시계',
        tracks: [{ ra: 0, dec: 75, c: '#ffd479', c2: C.acc }, { ra: 180, dec: 66, c: '#8ab6ff', c2: C.acc3 }] },
      { key: 'east', title: '동쪽 하늘 (방위 90°)', az0: 90,
        labels: [['북', -90], ['동', 0], ['남', 90]], note: '떠올라 남(오른쪽)으로',
        tracks: [{ ra: 0, dec: 0, c: '#c9d6ef', c2: C.acc2, endLabel: '→ 남쪽 하늘로', endDx: 16, endDy: 2, endAnchor: 'start' }, { ra: 350, dec: -22, c: '#8ab6ff', c2: C.acc3 }] },
      { key: 'west', title: '서쪽 하늘 (방위 270°)', az0: 270,
        labels: [['남', -90], ['서', 0], ['북', 90]], note: '북(오른쪽)으로 지며',
        tracks: [{ ra: 0, dec: 0, c: '#c9d6ef', c2: C.acc2, endLabel: '→ 북쪽 하늘로', endDx: 16, endDy: -8, endAnchor: 'start' }, { ra: 10, dec: -22, c: '#8ab6ff', c2: C.acc3 }] }
    ];
    var cells = panels.map(skyPanel);
    return grid(cells, 'sky-motion',
      '<b>남쪽은 왼쪽(동)에서 오른쪽(서)으로, 북쪽은 북극성 둘레를 반시계로</b> — 모두 지구가 서에서 동으로 자전하기 때문에 생기는 겉보기 운동입니다. ' +
      '동쪽 하늘에서는 별이 지평선에서 떠올라 오른쪽(남쪽)으로 기울며 올라가고, 서쪽 하늘에서는 오른쪽(북쪽)으로 기울며 내려갑니다. ' +
      '화살표는 위도 37°(오산)에서 별의 적경·적위를 방위·고도로 바꿔 계산한 실제 이동 방향입니다.');
  }

  /* ====================================================================
     9. 우주배경복사 — 재결합과 지평선
     ==================================================================== */
  function figCmbRecomb() {
    var W = 320, H = 196;
    var g = '';
    g += T(8, 14, '빅뱅 뒤 우주는 뜨겁고 불투명 → 38만 년에 처음 투명해졌습니다', { c: C.mut, a: 'start', s: 8.5 });
    // 두 구간 상자
    g += BOX(10, 24, 130, 48, { f: 'rgba(255,138,92,.13)', s: 'rgba(255,138,92,.40)' });
    g += T(16, 40, '① 플라스마 우주 (불투명)', { c: C.warm, a: 'start', s: 8.5, w: 700 });
    g += T(16, 54, '자유 전자가 빛을 계속 튕겨', { c: C.mut, a: 'start', s: 7.5 });
    g += T(16, 65, '빛이 곧바로 나아가지 못함', { c: C.mut, a: 'start', s: 7.5 });
    g += BOX(170, 24, 140, 48, { f: 'rgba(126,224,192,.14)', s: 'rgba(126,224,192,.40)' });
    g += T(176, 40, '② 투명해진 우주', { c: C.acc2, a: 'start', s: 8.5, w: 700 });
    g += T(176, 54, '빛이 자유롭게 날아가', { c: C.mut, a: 'start', s: 7.5 });
    g += T(176, 65, '오늘 2.7255 K로 관측', { c: C.mut, a: 'start', s: 7.5 });
    g += ARR(142, 48, 168, 48, { c: C.acc, w: 1.4, h: 5 });
    g += T(155, 88, '재결합 — 38만 년 · z ≈ 1,100 · 약 3,000 K', { c: C.acc, s: 8.5, w: 700 });
    // 온도 곡선
    var x0 = 20, x1 = 306, y0 = 104, y1 = 142;
    g += L(x0, y1, x1, y1, { c: C.line, w: 1 });
    g += L(x0, y0, x0, y1, { c: C.line, w: 1 });
    var d = '';
    for (var i = 0; i <= 120; i++) {
      var f = i / 120;
      var temp = 3000 * Math.pow(1 / 1101, f);        // 크기가 1/a 로 늘며 T ∝ 1/a
      var y = y0 + (1 - Math.log(temp / 2.7255) / Math.log(3000 / 2.7255)) * (y1 - y0);
      var x = x0 + f * (x1 - x0);
      d += (i ? 'L' : 'M') + n(x) + ' ' + n(y);
    }
    g += P(d, { c: C.acc3, w: 1.6 });
    g += T(x0 + 3, y0 + 9, '3,000 K', { c: C.acc3, a: 'start', s: 8 });
    g += T(x1 - 2, y1 - 4, '2.7255 K', { c: C.acc3, a: 'end', s: 8, w: 700 });
    g += L(151, 96, 151, y1, { c: 'rgba(255,212,121,.5)', w: 1, d: '2 3' });
    // 시간축
    [[16, '빅뱅'], [70, '3분'], [151, '38만 년'], [222, '1억 년'], [302, '138억 년']].forEach(function (t) {
      g += L(t[0], y1, t[0], y1 + 4, { c: C.line, w: 1 });
      g += T(Math.max(20, Math.min(300, t[0])), y1 + 15, t[1], { c: C.text, s: 8, w: 700 });
    });
    g += T(160, 184, '우주가 식으면서(T ∝ 1/크기) 빛의 파장도 함께 늘어났습니다', { c: C.mut, s: 8 });
    return wrap('cmb-recomb', W, H,
      '우주배경복사가 생긴 순간 도해. 빅뱅 뒤 38만 년, 온도가 약 3000켈빈으로 내려가 전자가 원자핵에 붙자 빛이 처음 자유롭게 날아갔고, 그 빛이 팽창하며 파장이 늘어 오늘 2.7255켈빈의 마이크로파로 온 하늘을 채웁니다.',
      '<b>우주가 처음 투명해진 순간</b> — 재결합 전의 우주는 자유 전자가 빛을 계속 흩뿌리는 안개였습니다. 38만 년(적색편이 z≈1,100)에 전자가 양성자에 붙어 중성 수소가 되자 빛이 곧바로 날아갈 수 있게 되었고, 그 빛이 138억 년 동안 팽창하며 파장이 약 1,100배 늘어 오늘 2.7255 K로 관측됩니다. 이 빛이 오는 마지막 산란면이 우주배경복사의 “지평선”입니다.',
      g);
  }
  /* ====================================================================
     10. CMB 흑체 스펙트럼 — 2.7255 K 과 완벽한 일치
     ==================================================================== */
  function figCmbSpectrum() {
    var W = 320, H = 208, x0 = 44, x1 = 306, y0 = 26, y1 = 148;
    var g = '';
    function planck(mm, Tk) {
      var l = mm * 1e-3, h = 6.62607015e-34, c = 2.99792458e8, k = 1.380649e-23;
      return (2 * h * c * c) / (Math.pow(l, 5) * (Math.exp(h * c / (l * k * Tk)) - 1));
    }
    var Tk = 2.7255, peak = 2.897771955 / Tk;
    var pk = planck(peak, Tk);
    function px(mm) { return x0 + mm / 3 * (x1 - x0); }
    function py(v) { return y1 - v / pk / 1.08 * (y1 - y0); }
    g += L(x0, y1, x1, y1, { c: C.line, w: 1 });
    g += L(x0, y0, x0, y1, { c: C.line, w: 1 });
    [0, 1, 2, 3].forEach(function (mm) {
      g += T(px(mm), y1 + 12, mm, { c: C.faint, s: 8.5 });
    });
    g += T((x0 + x1) / 2, 176, '파장 (mm)', { c: C.mut, s: 9 });
    g += T(6, y0 - 8, '복사 세기', { c: C.mut, a: 'start', s: 8.5 });
    var d = '';
    for (var mm = 0.05; mm <= 3; mm += 0.02) {
      d += (d ? 'L' : 'M') + n(px(mm)) + ' ' + n(py(planck(mm, Tk)));
    }
    g += P(d, { c: C.acc, w: 2 });
    g += L(px(peak), y0, px(peak), y1, { c: C.acc2, w: 1, d: '3 3' });
    g += T(px(peak) + 7, y0 + 12, '최대 1.06 mm', { c: C.acc2, a: 'start', s: 8.5, w: 700 });
    g += T(px(peak) + 7, y0 + 23, '= 2.898 mm·K ÷ 2.7255 K', { c: C.mut, a: 'start', s: 7.5 });
    // 측정점 — 곡선 위에 찍습니다(흑체와 10⁻⁴ 까지 일치)
    [0.45, 0.65, 0.85, 1.06, 1.35, 1.7, 2.1, 2.55].forEach(function (mm) {
      g += CIR(px(mm), py(planck(mm, Tk)), 2.4, { f: C.acc2 });
    });
    g += T(8, 190, '● COBE/FIRAS 측정값 — 2.7255 K 흑체곡선과 1만 분의 1까지 일치', { c: C.acc2, a: 'start', s: 8 });
    return wrap('cmb-spectrum', W, H,
      '우주배경복사의 흑체 스펙트럼. 2.7255켈빈 흑체곡선의 최대가 1.06밀리미터에 있고, 측정점이 곡선 위에 정확히 놓입니다.',
      '<b>우주에서 가장 완벽한 흑체</b> — 우주배경복사의 스펙트럼은 2.7255 K 흑체복사와 10⁻⁴ 수준까지 일치합니다(COBE/FIRAS, 1990년). 최대 세기 파장은 빈의 법칙으로 2.898 mm·K ÷ 2.7255 K = 1.06 mm — 전파와 적외선 사이의 마이크로파 영역입니다.',
      g);
  }
  /* ====================================================================
     11. CMB 온도 요동의 음향 피크 — 우주가 평탄하다는 증거
     ==================================================================== */
  function figCmbPeaks() {
    var W = 320, H = 218, x0 = 40, x1 = 306, y0 = 24, y1 = 148;
    var g = '';
    g += L(x0, y1, x1, y1, { c: C.line, w: 1 });
    g += L(x0, y0, x0, y1, { c: C.line, w: 1 });
    function px(l) { return x0 + (Math.log10(l) - Math.log10(2)) / (Math.log10(2500) - Math.log10(2)) * (x1 - x0); }
    function py(d) { return y1 - d / 6200 * (y1 - y0); }
    [10, 100, 500, 1000, 2000].forEach(function (l) {
      g += T(px(l), y1 + 12, l, { c: C.faint, s: 8 });
      g += L(px(l), y1, px(l), y1 + 3, { c: C.line, w: 1 });
    });
    [2000, 4000, 6000].forEach(function (d) {
      g += T(x0 - 4, py(d) + 3, d, { c: C.faint, s: 8, a: 'end' });
      g += L(x0, py(d), x1, py(d), { c: 'rgba(255,255,255,.06)', w: 1 });
    });
    g += T((x0 + x1) / 2, 176, '하늘 위 각도의 크기 ℓ (클수록 작은 각)', { c: C.mut, s: 9 });
    g += T(6, y0 - 8, '온도 요동 (µK²)', { c: C.mut, a: 'start', s: 8.5 });
    var d = '';
    for (var l = 2; l <= 2500; l += 4) {
      function bump(c, w, a) { return a * Math.exp(-Math.pow((l - c) / w, 2)); }
      var v = 2400 + bump(2, 220, -2200) + bump(220, 95, 3400) + bump(540, 110, 500) +
        bump(810, 130, 400) + bump(1120, 160, 200) + bump(1420, 190, 120);
      v *= (1 - 0.25 * Math.exp(-Math.pow((l - 60) / 90, 2))) * (1 / (1 + Math.pow(l / 1400, 2)));
      if (v < 0) v = 0;
      d += (d ? 'L' : 'M') + n(px(l)) + ' ' + n(py(v));
    }
    g += P(d, { c: C.acc, w: 1.8 });
    g += CIR(px(220), py(5745), 2.8, { f: C.acc2 });
    g += T(px(220) + 6, py(5745) - 6, '1. 제1피크 ℓ≈220', { c: C.acc2, a: 'start', s: 7.5, w: 700 });
    g += CIR(px(540), py(2500), 2.4, { f: C.acc2 });
    g += CIR(px(810), py(2450), 2.4, { f: C.acc2 });
    g += T(px(810) + 5, py(2450) - 8, '2·3 피크', { c: C.acc2, a: 'start', s: 7.5, w: 700 });
    g += L(px(180), y0, px(180), y1, { c: C.acc3, w: 1, d: '3 3' });
    g += T(px(180), y0 - 8, '≈1°', { c: C.acc3, s: 8.5, w: 700 });
    g += T(8, 196, '첫 피크가 하늘의 약 1°(ℓ≈220) → 우주 공간이 평탄(곡률 0)', { c: C.mut, a: 'start', s: 8 });
    g += T(8, 208, '2·3 피크의 높이비 → 보통 물질과 암흑물질의 비', { c: C.mut, a: 'start', s: 8 });
    return wrap('cmb-peaks', W, H,
      '우주배경복사의 온도 요동 파워 스펙트럼. 첫 번째 음향 피크가 다중극 220 근처, 하늘의 약 1도 각도에 있습니다.',
      '<b>우주의 모양을 재는 자</b> — 재결합 당시 물질과 빛이 함께 만든 음파가 남긴 요동의 세기 분포입니다. 첫 피크가 하늘의 약 1°(ℓ≈220)에 있다는 것은, 그 음파가 지나온 우주 공간이 평탄(곡률 0)하다는 뜻입니다. 둘째·셋째 피크의 높이비는 보통 물질과 암흑물질의 비를 알려 줍니다.',
      g);
  }
  /* ====================================================================
     12. 우주 거리 사다리
     ==================================================================== */
  function figLadder() {
    var W = 320, H = 210;
    var g = '';
    var rows = [
      ['연주시차', '1 pc ~ 10 kpc', '가이아 위성', 0.22],
      ['세페이드 변광성', '1 kpc ~ 40 Mpc', '주기-광도 관계', 0.40],
      ['Ia형 초신성', '10 Mpc ~ 1 Gpc', '같은 밝기의 폭발', 0.58],
      ['적색편이 + H₀', '1 Gpc ~ 우주 끝', '우주 팽창', 0.76]
    ];
    g += L(24, 186, 300, 186, { c: C.grid, w: 1 });
    rows.forEach(function (r, i) {
      var y = 40 + i * 38;
      var w = 40 + i * 26;
      g += '<rect x="' + (24 + i * 12) + '" y="' + y + '" width="' + w + '" height="20" rx="4" fill="' +
        (i % 2 ? 'rgba(126,224,192,.18)' : 'rgba(255,212,121,.18)') + '" stroke="' +
        (i % 2 ? 'rgba(126,224,192,.5)' : 'rgba(255,212,121,.5)') + '"/>';
      g += T(28 + i * 12, y + 14, (i + 1) + '. ' + r[0], { c: C.text, a: 'start', s: 9, w: 700 });
      g += T(30 + i * 12 + w, y + 14, r[1], { c: C.mut, a: 'start', s: 8 });
      g += T(26 + i * 12, y - 4, r[2], { c: C.faint, a: 'start', s: 7.5 });
    });
    g += ARR(28, 178, 296, 178, { c: C.acc3, w: 1.2, h: 5 });
    g += T(160, 200, '아래 칸은 위 칸에서 잰 거리를 기준으로 삼습니다 — 사다리를 오르듯 먼 우주로', { c: C.mut, s: 8 });
    return wrap('ladder', W, H,
      '우주 거리 사다리 도해. 연주시차, 세페이드 변광성, Ia형 초신성, 적색편이 순으로 더 먼 거리를 재며 각 단계가 다음 단계의 기준이 됩니다.',
      '<b>한 자로는 우주를 다 잴 수 없습니다</b> — 연주시차는 가까운 별까지, 세페이드는 그보다 먼 은하까지, Ia형 초신성은 수십억 광년까지 잽니다. 각 단계는 앞 단계로 보정한 “표준 광원”을 디딤돌로 삼습니다.',
      g);
  }

  /* ====================================================================
     13. 태양 흑점 주기 — 11년 활동과 극소기
     ==================================================================== */
  function figSunspot() {
    var W = 320, H = 178, x0 = 44, x1 = 306, y0 = 26, y1 = 142;
    var g = '';
    g += L(x0, y1, x1, y1, { c: C.line, w: 1 });
    g += L(x0, y0, x0, y1, { c: C.line, w: 1 });
    function px(yr) { return x0 + (yr - 1975) / (2026 - 1975) * (x1 - x0); }
    function py(v) { return y1 - v / 260 * (y1 - y0); }
    [1980, 1990, 2000, 2010, 2020].forEach(function (yr) {
      g += T(px(yr), y1 + 11, yr, { c: C.faint, s: 8 });
      g += L(px(yr), y1, px(yr), y1 + 3, { c: C.line, w: 1 });
    });
    g += T(4, y0 - 9, '흑점 상대수 (연평균)', { c: C.mut, a: 'start', s: 8.5 });
    // 실제 태양 활동 주기의 모양(근사) — 주기 약 11년, 24-25주기 최대는 낮았습니다
    var d = '', v;
    for (var yr = 1975; yr <= 2026; yr += 0.25) {
      v = 150 * Math.pow(Math.max(0, Math.sin((yr - 1976.0) / 11.0 * Math.PI)), 2) + 6;
      if (yr > 2008 && yr < 2020) v *= 0.72;        // 24주기(극소기)
      d += (d ? 'L' : 'M') + n(px(yr)) + ' ' + n(py(v));
    }
    g += P(d, { c: C.acc, w: 1.6 });
    [[1989, '22주기'], [2000, '23주기'], [2013, '24주기'], [2024, '25주기']].forEach(function (p) {
      g += CIR(px(p[0]), py(150 * Math.pow(Math.max(0, Math.sin((p[0] - 1976.0) / 11.0 * Math.PI)), 2) * (p[0] > 2008 && p[0] < 2020 ? 0.72 : 1) + 6), 2.4, { f: C.acc2 });
      g += T(px(p[0]), py(150 * Math.pow(Math.max(0, Math.sin((p[0] - 1976.0) / 11.0 * Math.PI)), 2) * (p[0] > 2008 && p[0] < 2020 ? 0.72 : 1) + 6) - 7, p[1], { c: C.acc2, s: 7.5 });
    });
    g += T(160, 168, '흑점 수는 약 11년 주기로 늘고 줄며, 극소기에는 거의 사라집니다 (모양은 개략도)', { c: C.mut, s: 8 });
    return wrap('sunspot', W, H,
      '태양 흑점 수의 11년 주기 도해. 흑점 수가 늘었다 줄었다를 반복하고 극소기에는 거의 사라집니다.',
      '<b>태양은 일정하지 않습니다</b> — 흑점 수는 약 11년 주기로 늘고 줄며, 두 극소기를 거치면 자기장 극성이 뒤바뀝니다(22년 헤일 주기). 흑점이 많은 극대기에는 플레어·코로나 질량 방출이 잦아 오로라와 통신 장애가 늘어납니다. 흑점은 주변보다 약 1,500 K 낮아 어둡게 보이는 영역입니다.',
      g);
  }

  /* ====================================================================
     14. 중력렌즈 — 은하단이 만드는 확대 거울
     ==================================================================== */
  function figGravLens() {
    var W = 320, H = 186;
    var g = '';
    // 은하단(앞)
    g += CIR(160, 96, 26, { f: 'rgba(255,212,121,.12)', s: 'rgba(255,212,121,.4)', w: 1.2 });
    for (var i = 0; i < 9; i++) {
      var a = i / 9 * Math.PI * 2, rr = 8 + (i % 3) * 6;
      g += CIR(160 + Math.cos(a) * rr, 96 + Math.sin(a) * rr * 0.8, 2.6, { f: 'rgba(255,212,121,.55)' });
    }
    g += T(160, 136, '앞쪽 은하단(질량)', { c: C.acc, s: 8.5, w: 700 });
    // 먼 은하
    g += '<ellipse cx="288" cy="46" rx="9" ry="3" fill="rgba(138,182,255,.55)"/>';
    g += T(288, 34, '먼 은하', { c: C.acc3, s: 8 });
    // 휘어진 빛
    g += P('M288 46Q210 60 174 86', { c: 'rgba(138,182,255,.5)', w: 1.2, d: '3 3' });
    g += P('M288 46Q236 46 186 96', { c: 'rgba(138,182,255,.5)', w: 1.2, d: '3 3' });
    g += P('M288 46Q212 34 150 88', { c: 'rgba(138,182,255,.5)', w: 1.2, d: '3 3' });
    // 관측자
    g += CIR(28, 96, 7, { f: C.acc2 });
    g += T(28, 114, '지구', { c: C.acc2, s: 8.5 });
    g += ARR(36, 96, 130, 96, { c: 'rgba(126,224,192,.5)', w: 1.1 });
    // 휘어진 상
    g += P('M110 40A62 62 0 0 1 196 30', { c: C.warm, w: 1.6 });
    g += P('M116 150A62 62 0 0 0 200 152', { c: C.warm, w: 1.6 });
    g += T(120, 24, '휘어진 상(호)', { c: C.warm, a: 'start', s: 8 });
    g += T(160, 176, '은하단 질량이 시공간을 휘게 해 빛이 굽습니다 — 질량을 재는 방법', { c: C.mut, s: 8 });
    return wrap('gravlens', W, H,
      '중력렌즈 도해. 앞쪽 은하단의 질량이 시공간을 휘게 해 뒤쪽 은하의 빛이 굽어 호 모양의 상으로 보입니다.',
      '<b>질량이 만드는 거울</b> — 은하단처럼 큰 질량은 시공간을 휘게 하고, 그 뒤에서 오는 빛의 경로도 휩니다. 그래서 같은 은하의 상이 여러 개 또는 호 모양으로 보입니다(중력렌즈). 휘는 정도로 은하단의 질량을 재면, 보이는 별·가스보다 훨씬 큰 질량이 필요해 암흑물질의 증거가 됩니다.',
      g);
  }

  /* ====================================================================
     내보내기
     ==================================================================== */
  var FIG = {
    parallax: figParallax,
    eclipse: figEclipse,
    seasons: figSeasons,
    'hr-evolution': figHrEvolution,
    hubble: figHubble,
    spectral: figSpectral,
    cepheid: figCepheid,
    'sky-motion': figSky4,
    'cmb-recomb': figCmbRecomb,
    'cmb-spectrum': figCmbSpectrum,
    'cmb-peaks': figCmbPeaks,
    ladder: figLadder,
    sunspot: figSunspot,
    gravlens: figGravLens
  };
  window.LearnFigs = {
    has: function (k) { return !!FIG[k]; },
    html: function (k) { try { return FIG[k] ? FIG[k]() : ''; } catch (e) { return ''; } },
    keys: Object.keys(FIG)
  };
})();
