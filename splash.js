/* =========================================================================
   splash.js — 별너울 도입화면 (2026-11-27)
   · 첫 화면: 밤하늘 별빛 + '너울' 별자리 선이 그려지고 로고가 떠오릅니다.
   · 약 1.5초 뒤 스스로 사라지고, 화면을 누르면 바로 건너뜁니다.
   · 처음 온 사람에게는 한 장짜리 환영 안내를 한 번만 보여 줍니다.
   외부 라이브러리 없이 canvas 2D 로만 그립니다.
   ========================================================================= */
(function () {
  'use strict';

  var el = document.getElementById('bwSplash');
  if (!el) return;

  var canvas = document.getElementById('bwSplashCanvas');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;

  var reduced = false;
  try {
    reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { reduced = false; }

  var KEY_WELCOME = 'bw.welcome.seen';
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { } }

  /* ------------------------------------------------------------ 밤하늘 그림 */
  var W = 0, H = 0, dpr = 1, raf = 0, t0 = 0, leaving = false;
  var stars = [];
  var NODES = [
    [0.10, 0.745], [0.20, 0.700], [0.31, 0.738], [0.42, 0.694],
    [0.53, 0.732], [0.64, 0.688], [0.75, 0.726], [0.86, 0.690], [0.95, 0.726]
  ];

  function seedStars() {
    stars = [];
    var n = 130, s = 7;
    function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    for (var i = 0; i < n; i++) {
      stars.push({
        x: rnd(), y: rnd(),
        r: 0.5 + rnd() * (rnd() > 0.9 ? 1.7 : 0.9),
        a: 0.28 + rnd() * 0.6,
        ph: rnd() * Math.PI * 2,
        sp: 0.7 + rnd() * 1.5,
        big: rnd() > 0.93
      });
    }
  }

  function resize() {
    if (!canvas || !ctx) return;
    var r = canvas.getBoundingClientRect();
    W = Math.max(280, Math.round(r.width || window.innerWidth));
    H = Math.max(320, Math.round(r.height || window.innerHeight));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(ts) {
    if (!ctx) return;
    // 같은 프레임을 두 번 그리지 않도록 시작 시각을 기록합니다.
    if (!t0) t0 = ts;
    var t = (ts - t0) / 1000;

    ctx.clearRect(0, 0, W, H);

    // 은하수 결 — 아주 옅은 빛의 띠
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(90,130,220,0.00)');
    g.addColorStop(0.42, 'rgba(120,160,235,0.055)');
    g.addColorStop(0.62, 'rgba(126,224,192,0.035)');
    g.addColorStop(1, 'rgba(90,130,220,0.00)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.92);
    ctx.quadraticCurveTo(W * 0.36, H * 0.30, W, H * 0.12);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    // 별
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      var tw = reduced ? 1 : (0.72 + 0.28 * Math.sin(st.ph + t * st.sp * 1.6));
      var x = st.x * W, y = st.y * H;
      var a = st.a * tw;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      ctx.arc(x, y, st.r, 0, Math.PI * 2);
      ctx.fill();
      if (st.big) {
        ctx.beginPath();
        var gg = ctx.createRadialGradient(x, y, 0, x, y, st.r * 7);
        gg.addColorStop(0, 'rgba(200,220,255,' + (0.22 * tw).toFixed(3) + ')');
        gg.addColorStop(1, 'rgba(160,190,255,0)');
        ctx.fillStyle = gg;
        ctx.arc(x, y, st.r * 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // '너울' 별자리 선 — 왼쪽에서 오른쪽으로 천천히 이어집니다
    var prog = reduced ? 1 : Math.min(1, Math.max(0, (t - 0.15) / 1.05));
    var total = NODES.length - 1;
    var done = prog * total;
    var baseY = H * 0.62;
    ctx.lineWidth = 1.1;
    for (var k = 0; k < total; k++) {
      var seg = Math.min(1, Math.max(0, done - k));
      if (seg <= 0) break;
      var a1 = NODES[k], b1 = NODES[k + 1];
      var x1 = a1[0] * W, y1 = baseY + (a1[1] - 0.71) * H;
      var x2 = b1[0] * W, y2 = baseY + (b1[1] - 0.71) * H;
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + (k % 2 ? 3 : -3);
      ctx.strokeStyle = 'rgba(174,203,255,' + (0.42 * Math.min(1, 0.4 + prog)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      var ex = x1 + (x2 - x1) * seg, ey = y1 + (y2 - y1) * seg;
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
    }
    // 별자리 별
    for (var n = 0; n < NODES.length; n++) {
      if (done < n) break;
      var nd = NODES[n];
      var nx = nd[0] * W, ny = baseY + (nd[1] - 0.71) * H;
      var glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, 13);
      glow.addColorStop(0, 'rgba(255,238,190,0.55)');
      glow.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(nx, ny, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,246,220,0.95)';
      ctx.beginPath(); ctx.arc(nx, ny, 1.9, 0, Math.PI * 2); ctx.fill();
    }

    // 별똥별 한 줄 — 0.95초쯤 스쳐 지나갑니다
    if (!reduced && t > 0.95 && t < 1.6) {
      var p = (t - 0.95) / 0.65;
      var sx = W * (0.78 - 0.22 * p), sy = H * (0.12 + 0.18 * p);
      // 머리는 왼쪽 아래로 흐릅니다(dx = -0.22W, dy = +0.18H).
      // 꼬리는 진행 방향의 정반대 — 즉 오른쪽 위로, 진행 벡터와 '같은 기울기'로 뻗어야 합니다.
      var vx = -0.22 * W, vy = 0.18 * H;
      var vl = Math.sqrt(vx * vx + vy * vy) || 1;
      var tailLen = Math.min(W, H) * 0.22;              // 화면 크기에 비례한 꼬리 길이
      var lx = sx - (vx / vl) * tailLen, ly = sy - (vy / vl) * tailLen;
      var fade = Math.sin(Math.PI * p);                  // 0 → 1 → 0
      var mg = ctx.createLinearGradient(sx, sy, lx, ly);
      mg.addColorStop(0, 'rgba(255,255,255,' + (0.85 * fade).toFixed(3) + ')');
      mg.addColorStop(0.35, 'rgba(214,232,255,' + (0.32 * fade).toFixed(3) + ')');
      mg.addColorStop(1, 'rgba(186,208,255,0)');
      ctx.strokeStyle = mg; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(lx, ly); ctx.stroke();
      // 머리 끝의 은은한 빛점 — 꼬리 축의 끝에 아주 작게
      var hg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 6.5);
      hg.addColorStop(0, 'rgba(255,255,255,' + (0.9 * fade).toFixed(3) + ')');
      hg.addColorStop(0.32, 'rgba(210,228,255,' + (0.34 * fade).toFixed(3) + ')');
      hg.addColorStop(1, 'rgba(170,200,255,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, Math.PI * 2); ctx.fill();
    }

    if (!leaving) raf = window.requestAnimationFrame(draw);
  }

  if (canvas && ctx) {
    seedStars();
    resize();
    window.addEventListener('resize', function () { resize(); if (reduced) draw(1); });
    if (reduced) draw(1);
    else raf = window.requestAnimationFrame(draw);
  }

  /* --------------------------------------------------------- 사라지기 · 건너뛰기 */
  var finished = false, timer = 0;

  function leave() {
    if (finished) return;
    finished = true;
    leaving = true;
    if (raf) window.cancelAnimationFrame(raf);
    clearTimeout(timer);
    el.classList.add('is-out');
    el.setAttribute('aria-hidden', 'true');
    window.removeEventListener('keydown', onKey);
    el.removeEventListener('pointerdown', leave);
    el.removeEventListener('touchstart', leave);
    el.removeEventListener('wheel', leave);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      maybeWelcome();
    }, reduced ? 240 : 640);
  }

  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') leave();
  }

  timer = setTimeout(leave, reduced ? 800 : 1500);
  el.addEventListener('pointerdown', leave);
  el.addEventListener('touchstart', leave, { passive: true });
  el.addEventListener('wheel', leave, { passive: true });
  window.addEventListener('keydown', onKey);

  /* ------------------------------------------------------------- 환영 안내 */
  function maybeWelcome() {
    if (lsGet(KEY_WELCOME)) return;
    if (document.getElementById('bwWelcome')) return;

    var d = document.createElement('div');
    d.id = 'bwWelcome';
    d.className = 'bww';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-labelledby', 'bwwTitle');
    d.innerHTML =
      '<div class="bww-back" data-bww-close="1"></div>' +
      '<div class="bww-card">' +
      '  <button type="button" class="bww-x" data-bww-close="1" aria-label="닫기">×</button>' +
      '  <p class="bww-eyebrow">별너울에 처음 오셨네요</p>' +
      '  <h2 id="bwwTitle">오늘 밤 하늘, 여기서 시작하세요</h2>' +
      '  <p class="bww-sub">지금 이 자리에서 보이는 하늘을 계산해 두었습니다.</p>' +
      '  <ul class="bww-list">' +
      '    <li><span aria-hidden="true">🌌</span><div><b>오늘 밤 10초 요약</b><small>관측 지수·달 밝기·지금 뜬 행성과 시간</small></div></li>' +
      '    <li><span aria-hidden="true">🔭</span><div><b>손끝으로 돌려 보는 라이브 하늘</b><small>별·행성·성운을 눌러 그 자리의 정보를 확인</small></div></li>' +
      '    <li><span aria-hidden="true">📚</span><div><b>도감과 천문 학습관</b><small>2만 3천여 천체, 초등부터 대학까지 천문 수업</small></div></li>' +
      '  </ul>' +
      '  <div class="bww-actions"><button type="button" class="btn btn-primary" id="bwwGo">하늘 보러 가기</button></div>' +
      '</div>';
    document.body.appendChild(d);

    var go = document.getElementById('bwwGo');
    var closed = false;
    function close(goToday) {
      if (closed) return;
      closed = true;
      lsSet(KEY_WELCOME, '1');
      window.removeEventListener('keydown', onEsc);
      d.classList.add('is-out');
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 340);
      if (goToday) {
        var target = document.getElementById('today');
        if (target && target.scrollIntoView) target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }
    }
    function onEsc(e) { if (e.key === 'Escape') close(false); }

    d.addEventListener('click', function (e) {
      if (e.target.closest('[data-bww-close]')) { close(false); return; }
      if (e.target.closest('#bwwGo')) close(true);
    });
    window.addEventListener('keydown', onEsc);
    setTimeout(function () { if (go) { try { go.focus({ preventScroll: true }); } catch (e) { go.focus(); } } }, 120);
  }
})();
