/* =========================================================================
   learn-figs.js — 학습관 「개념 도해」 (2026-11-28)
   · 교과서·자습서에 없는 눈으로 보는 설명을 직접 그린 인라인 SVG 로 넣습니다.
     (외부 이미지 없음 → 오프라인·저작권 안전, SW 캐시는 JS 파일만 받으면 됨)
   · 모든 그림은 role="img" + aria-label, 아래에 figcaption.
   · 색은 CSS 변수(var(--text) 등)를 쓰므로 레드라이트 모드에서도 대비가 유지됩니다.
   · 수치는 tools/sky_motion_check.py·gen_figs_data.py 로 독립 검증했습니다.
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
      ' text-anchor="' + (o.a || 'middle') + '"' + (o.r ? ' transform="rotate(' + o.r + ' ' + n(x) + ' ' + n(y) + ')"' : '') + '>' + esc(s) + '</text>';
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
  function starPath(x, y, r, c) {
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
    var S = { x: 160, y: 26 };            // 별
    var sun = { x: 160, y: 176 };
    var jan = { x: 258, y: 176 }, jul = { x: 62, y: 176 };
    var g = '';
    // 지구 궤도
    g += P('M62 176A98 34 0 0 0 258 176', { c: C.grid, w: 1, d: '3 4' });
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
    // 기선 표시
    g += L(sun.x, 196, jan.x, 196, { c: C.acc2, w: 1.4 });
    g += L(sun.x, 192, sun.x, 200, { c: C.acc2, w: 1.4 });
    g += L(jan.x, 192, jan.x, 200, { c: C.acc2, w: 1.4 });
    g += T((sun.x + jan.x) / 2, 209, '기선 1 AU', { c: C.acc2, s: 9.5, w: 700 });
    // p 각
    g += ARC(S.x, S.y, 54, 78, 90, { c: C.acc2, w: 1.4 });
    g += T(S.x - 8, S.y + 62, 'p', { c: C.acc2, s: 12, w: 800 });
    // 2p 안내
    g += T(S.x, 128, '두 시선이 이루는 각 = 2p', { c: C.mut, s: 9.5 });
    g += BOX(6, 6, 148, 40);
    g += T(14, 22, 'd[pc] = 1 / p[″]', { c: C.acc, a: 'start', s: 11, w: 700 });
    g += T(14, 37, '1 pc = 3.26광년 = 206,265 AU', { c: C.mut, a: 'start', s: 9 });
    return wrap('parallax', 320, 216,
      '연주시차 도해. 태양을 가운데 두고 1월과 7월의 지구 위치가 1 AU 기선을 이루며, 별에서 두 시선이 만드는 각의 절반이 연주시차 p 입니다.',
      '<b>연주시차의 정의</b> — 지구에서 별을 보는 방향의 차이를 1 AU 기선으로 잰 각. 지구가 6개월 동안 2 AU(약 3억 km)를 움직이므로 별은 1년에 <b>2p</b> 만큼 왕복합니다. 그림의 각도는 아주 크게 과장했습니다(실제 p는 1″ 이하).',
      g);
  }

  /* ====================================================================
     2. 일·월식이 드문 까닭 — 궤도 경사 5.145° 와 교점
     ==================================================================== */
  function figEclipse() {
    var g = '';
    var ey = 118, ex = 190;
    // 황도면(지구 공전면) — 옆에서 본 수평선
    g += L(14, ey, 306, ey, { c: C.grid, w: 1.2, d: '5 4' });
    g += T(306, ey + 12, '황도면', { c: C.faint, a: 'end', s: 9 });
    // 태양
    g += CIR(28, ey, 12, { f: C.acc });
    g += T(28, ey + 26, '태양', { c: C.mut, s: 9.5 });
    // 달 궤도 (5.145° 기울어진 선)
    var tilt = 5.145 * Math.PI / 180, L2 = 120;
    var mx1 = ex - L2 * Math.cos(tilt), my1 = ey + L2 * Math.sin(tilt);
    var mx2 = ex + L2 * Math.cos(tilt), my2 = ey - L2 * Math.sin(tilt);
    g += L(mx1, my1, mx2, my2, { c: C.acc2, w: 1.6 });
    g += T(mx2 + 2, my2 - 6, '달 궤도 5.145°', { c: C.acc2, a: 'end', s: 9, w: 700 });
    // 교점
    g += CIR(ex, ey, 2.6, { f: C.acc2 });
    g += T(ex + 6, ey - 7, '교점(승교점·강교점)', { c: C.acc2, a: 'start', s: 8.5 });
    // 지구
    g += CIR(ex, ey, 9, { f: C.acc3 });
    g += T(ex, ey - 14, '지구', { c: C.acc3, s: 9.5 });
    // 삭: 달이 태양 쪽(왼쪽). 교점에서 벗어난 경우 그림자가 위/아래로 빗나감
    var dn = { x: ex - 62, y: ey - 62 * Math.tan(tilt) };
    g += CIR(dn.x, dn.y, 5.5, { f: C.white });
    g += T(dn.x, dn.y - 10, '삭의 달', { c: C.white, s: 8.5 });
    g += L(dn.x, dn.y, dn.x - 34, dn.y - 34 * Math.tan(tilt), { c: 'rgba(233,238,248,.45)', w: 1, d: '3 3' });
    g += T(dn.x - 6, dn.y - 30, '그림자가 지구를 빗나감', { c: C.mut, a: 'end', s: 8.5 });
    // 교점 위치의 달은 그림자가 지구를 맞음
    g += CIR(ex - 2, ey, 5, { f: C.white, s: C.acc2, w: 1.4 });
    g += T(ex - 26, ey + 16, '교점의 삭 → 개기일식', { c: C.acc2, a: 'middle', s: 8.5, w: 700 });
    // 월식: 지구 그림자
    g += P('M' + ex + ' ' + (ey - 9) + 'L' + (ex + 60) + ' ' + (ey - 20) + 'L' + (ex + 60) + ' ' + (ey + 20) + 'L' + ex + ' ' + (ey + 9) + 'Z',
      { f: 'rgba(120,140,190,.16)', c: 'rgba(150,170,210,.35)', w: 1 });
    g += T(ex + 40, ey + 30, '지구 그림자', { c: C.mut, s: 8.5 });
    g += T(ex + 76, ey - 14, '망의 달이', { c: C.white, a: 'start', s: 8.5 });
    g += CIR(ex + 74, ey - 2, 4.5, { f: C.white });
    g += T(ex + 76, ey + 8, '여기 들어가면 월식', { c: C.mut, a: 'start', s: 8.5 });
    // 각도 표시
    g += ARC(ex, ey, 34, 180, 180 + 5.145, { c: C.warm, w: 1.4 });
    g += T(ex - 44, ey + 40, 'β = 5.145° × sin(교점에서의 각)', { c: C.warm, a: 'start', s: 8.5 });
    g += T(160, 210, 'β가 약 1.5°보다 작을 때만 식이 일어납니다 → 교점 근처의 삭·망에서만', { c: C.mut, s: 9 });

    return wrap('eclipse', 320, 220,
      '일식과 월식이 드문 이유 도해. 달 궤도가 황도면에 대해 5.145도 기울어 있어 대부분의 삭과 망에서는 달 그림자가 지구를 빗나가고, 교점 근처에서만 식이 일어납니다.',
      '<b>왜 매달 식이 생기지 않을까</b> — 달 궤도는 황도면에서 5.145° 기울어져 있습니다. 삭·망마다 달은 황도면 위나 아래로 최대 5.1°(지구에서 본 달 지름의 약 10배) 떨어져 있어 그림자가 빗나갑니다. 달이 교점(승교점·강교점) 근처를 지날 때만 태양–지구–달이 거의 일직선이 되어 일식·월식이 생깁니다.',
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
      { a: 180, m: '6월 하지', dec: '+23.44°', up: true, x: cx - R, y: cy },
      { a: 0, m: '12월 동지', dec: '−23.44°', up: false, x: cx + R, y: cy },
      { a: 90, m: '3월 춘분', dec: '0°', up: null, x: cx, y: cy + R * 0.42 },
      { a: 270, m: '9월 추분', dec: '0°', up: null, x: cx, y: cy - R * 0.42 }
    ];
    pos.forEach(function (p) {
      // 자전축: 방향 고정(오른쪽으로 23.44° 기움)
      var ax = Math.sin(23.44 * Math.PI / 180) * 15, ay = -Math.cos(23.44 * Math.PI / 180) * 15;
      g += L(p.x - ax, p.y - ay, p.x + ax, p.y + ay, { c: C.text, w: 1.3 });
      g += CIR(p.x + ax, p.y + ay, 2.4, { f: C.acc3 });
      g += CIR(p.x, p.y, 7, { f: 'rgba(138,182,255,.28)', s: C.acc3, w: 1 });
      var dy = p.m === '6월 하지' ? 30 : p.m === '12월 동지' ? 34 : 30;
      g += T(p.x, p.y + (p.y > cy ? dy : -16), p.m, { c: C.text, s: 9.5, w: 700 });
      g += T(p.x, p.y + (p.y > cy ? dy + 11 : -5), '태양 적위 ' + p.dec, { c: C.acc2, s: 8.5 });
    });
    g += T(cx, 12, '지구 자전축은 우주 공간에서 방향이 일정 (23.44° 기울어짐)', { c: C.mut, s: 9 });
    // 아래: 위도 37°에서 낮 길이
    var bars = [['6월 하지', 14.6], ['춘·추분', 12.0], ['12월 동지', 9.6]];
    var bx = 16, by = 178, bw = 288;
    g += T(bx, by - 6, '북위 37°(오산)의 낮 길이', { c: C.faint, a: 'start', s: 8.5 });
    bars.forEach(function (b, i) {
      var y = by + i * 13, w = b[1] / 24 * (bw - 62);
      g += T(bx, y + 7, b[0], { c: C.mut, a: 'start', s: 8.5 });
      g += '<rect x="' + (bx + 54) + '" y="' + y + '" width="' + n(w) + '" height="7" rx="3.5" fill="' + (i === 0 ? C.acc : i === 1 ? C.acc2 : C.acc3) + '" opacity=".55"/>';
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
    var W = 320, H = 236, x0 = 40, x1 = 306, y0 = 22, y1 = 200;
    var g = '';
    g += L(x0, y1, x1, y1, { c: C.line, w: 1 });
    g += L(x0, y0, x0, y1, { c: C.line, w: 1 });
    // 온도 축(왼쪽 뜨겁고 오른쪽 차갑게)
    function px(T) { return x0 + (Math.log10(40000 / Math.max(2500, T)) / Math.log10(40000 / 2500)) * (x1 - x0); }
    function py(Lg) { return y1 - (Math.log10(Math.max(1e-4, Lg)) + 4) / 10 * (y1 - y0); }
    [30000, 10000, 6000, 3000].forEach(function (t) {
      g += L(px(t), y0, px(t), y1, { c: 'rgba(255,255,255,.06)', w: 1 });
      g += T(px(t), y1 + 11, t >= 1000 ? (t / 1000) + 'k' : t, { c: C.faint, s: 8.5 });
    });
    g += T((x0 + x1) / 2, 226, '표면 온도 (K) — 왼쪽이 뜨겁고 오른쪽이 차갑습니다', { c: C.mut, s: 9 });
    [1e-3, 1, 1e3, 1e6].forEach(function (l) {
      g += L(x0, py(l), x1, py(l), { c: 'rgba(255,255,255,.06)', w: 1 });
      g += T(x0 - 4, py(l) + 3, l === 1 ? '1' : (l === 1e-3 ? '10⁻³' : l === 1e3 ? '10³' : '10⁶'), { c: C.faint, s: 8.5, a: 'end' });
    });
    g += T(4, y0 - 8, '광도(태양=1)', { c: C.mut, a: 'start', s: 9 });
    // 주계열
    var ms = '';
    for (var m = 0.1; m <= 32; m *= 1.15) {
      var q = px(5772 * Math.pow(m, 0.55)), r = py(Math.pow(m, 3.5));
      ms += (ms ? 'L' : 'M') + n(q) + ' ' + n(r);
    }
    g += P(ms, { c: C.acc, w: 3.4 });
    g += T(px(9000), py(120), '주계열', { c: C.acc, s: 9.5, w: 700, a: 'start' });
    // 1 M☉ 진화
    var sun = [px(5772), py(1)];
    g += CIR(sun[0], sun[1], 3.4, { f: C.white });
    g += T(sun[0] + 4, sun[1] + 12, '태양 5,772K', { c: C.text, a: 'start', s: 8.5 });
    var rg = [px(3500), py(1200)];
    g += CIR(rg[0], rg[1], 3.4, { f: C.warm });
    g += ARR(sun[0] + 3, sun[1] - 2, rg[0] + 2, rg[1] + 6, { c: C.warm, w: 1.2, h: 4.5 });
    g += T(rg[0] - 6, rg[1] - 6, '적색거성', { c: C.warm, a: 'end', s: 8.5, w: 700 });
    var wd = [px(15000), py(0.004)];
    g += ARR(rg[0] - 8, rg[1] + 2, wd[0] + 12, wd[1] - 6, { c: C.acc3, w: 1.2, h: 4.5, });
    g += CIR(wd[0], wd[1], 3, { f: C.acc3 });
    g += T(wd[0] + 6, wd[1] - 4, '백색왜성', { c: C.acc3, a: 'start', s: 8.5 });
    g += T(px(9000), py(0.02), '행성상 성운', { c: C.faint, s: 7.5 });
    // 15 M☉
    var big = [px(30000), py(2e4)];
    g += CIR(big[0], big[1], 3.4, { f: C.acc2 });
    g += T(big[0] + 5, big[1] + 3, '15 M☉ 별', { c: C.acc2, a: 'start', s: 8.5, w: 700 });
    var sg = [px(3800), py(1.2e5)];
    g += ARR(big[0] - 2, big[1] - 3, sg[0] + 6, sg[1] + 4, { c: C.acc2, w: 1.2, h: 4.5 });
    g += CIR(sg[0], sg[1], 3.4, { f: C.warm });
    g += T(sg[0] - 5, sg[1] - 5, '초거성', { c: C.warm, a: 'end', s: 8.5 });
    g += T(px(2200), py(1.2e5) + 14, '→ 초신성 → 중성자별·블랙홀', { c: C.acc2, a: 'end', s: 8 });
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
    var dmax = 500, vmax = 35000;
    function px(d) { return x0 + d / dmax * (x1 - x0); }
    function py(v) { return y1 - v / vmax * (y1 - y0); }
    [0, 100, 200, 300, 400, 500].forEach(function (d) {
      g += T(px(d), y1 + 11, d, { c: C.faint, s: 8.5 });
      g += L(px(d), y1, px(d), y1 + 3, { c: C.line, w: 1 });
    });
    [0, 10000, 20000, 30000].forEach(function (v) {
      g += T(x0 - 4, py(v) + 3, (v / 1000) + '천', { c: C.faint, s: 8.5, a: 'end' });
    });
    g += T((x0 + x1) / 2, 202, '거리 d (Mpc)', { c: C.mut, s: 9 });
    g += T(4, y0 - 6, '후퇴 속도 (km/s)', { c: C.mut, a: 'start', s: 9 });
    // v = 70 d
    g += L(px(0), py(0), px(dmax), py(70 * dmax), { c: C.acc, w: 2 });
    g += T(px(430), py(70 * 430) - 7, 'v = H₀d  (H₀ = 70)', { c: C.acc, a: 'end', s: 9, w: 700 });
    // 은하 표본(근사값)
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
      g += '<rect x="' + n(x) + '" y="18" width="' + n(bw - 1.5) + '" height="34" rx="4" fill="' + cols[i] + '" opacity="' + (nm === 'G' ? '.98' : '.85') + '"/>';
      g += T(x + bw / 2, 40, nm, { c: '#141a28', s: 15, w: 800 });
      g += T(x + bw / 2, 66, temps[i], { c: C.mut, s: 7.5 });
      g += T(x + bw / 2, 80, ex[i], { c: C.faint, s: 7.5 });
    });
    g += T(14, 12, '뜨거움 (파랑)', { c: C.acc3, a: 'start', s: 8.5, w: 700 });
    g += T(W - 14, 12, '차가움 (빨강)', { c: C.warm, a: 'end', s: 8.5, w: 700 });
    g += T(14, 100, '표면 온도(K)', { c: C.faint, a: 'start', s: 8 });
    g += T(14, 114, '태양은 G2V — 최대 복사 파장 502 nm(초록빛)이지만 눈에는 흰색으로 보입니다.', { c: C.mut, a: 'start', s: 8.5 });
    // 흑체 곡선 3개 (각 곡선의 최대값을 같게 맞춰 색만 비교)
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
     내보내기
     ==================================================================== */
  var FIG = {
    parallax: figParallax,
    eclipse: figEclipse,
    seasons: figSeasons,
    'hr-evolution': figHrEvolution,
    hubble: figHubble,
    spectral: figSpectral
  };
  window.LearnFigs = {
    has: function (k) { return !!FIG[k]; },
    html: function (k) { try { return FIG[k] ? FIG[k]() : ''; } catch (e) { return ''; } },
    keys: Object.keys(FIG)
  };
})();
