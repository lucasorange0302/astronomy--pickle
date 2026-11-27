/* =========================================================================
   learn.js — 🎓 천문 학습관 (2026-11-27)
   · 탭 1: 교육과정 · 단계별 실험실 (초등 → 중등 → 고등 → 대학 심화)
     - 단원별 원리·핵심 수식·오개념·탐구 질문
     - 직접 조작하는 캔버스 실험 9종
   · 탭 2: 빅뱅부터 지금까지 · 천문학사 타임라인 (일반인용)
   외부 라이브러리 없이 canvas 2D 로만 그립니다.
   ========================================================================= */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nf(v, d) { return (v == null || !isFinite(v)) ? '—' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d == null ? 1 : d, minimumFractionDigits: 0 }); }

  /* ======================================================================
     실험(시뮬레이터) 공통 틀
     ====================================================================== */
  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.body).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  function theme() {
    return {
      text: cssVar('--text', '#eef2fb'),
      muted: cssVar('--muted', '#9aa6c0'),
      faint: cssVar('--faint', '#7c88a3'),
      accent: cssVar('--accent', '#ffd479'),
      accent2: cssVar('--accent-2', '#7ee0c0'),
      accent3: cssVar('--accent-3', '#8ab6ff'),
      danger: cssVar('--danger', '#ff7a6e'),
      grid: 'rgba(255,255,255,0.10)',
      panel: 'rgba(10,16,30,0.55)'
    };
  }

  /**
   * cfg = {
   *   id, title, hint,
   *   height: 320,
   *   controls: [{k, label, min, max, step, value, fmt(v)}],
   *   buttons: [{k, label}],
   *   state: {...},
   *   draw(ctx, W, H, S, T),
   *   readout(S) -> [[label, value], ...],
   *   tick(S, dt) -> bool (다시 그릴지)
   * }
   */
  var SIMS = [];

  function createSim(host, cfg) {
    var wrap = document.createElement('div');
    wrap.className = 'sim';
    wrap.setAttribute('data-sim', cfg.id);
    var controls = (cfg.controls || []).map(function (c) {
      var id = 'sim-' + cfg.id + '-' + c.k;
      return '<label class="sim-ctrl" for="' + id + '">' +
        '<span class="sim-ctrl-label">' + esc(c.label) + '</span>' +
        '<input type="range" id="' + id + '" data-k="' + c.k + '" min="' + c.min + '" max="' + c.max +
        '" step="' + (c.step || 1) + '" value="' + c.value + '" aria-label="' + esc(c.label) + '">' +
        '<output class="sim-ctrl-val" data-out="' + c.k + '"></output>' +
        '</label>';
    }).join('');
    var buttons = (cfg.buttons || []).map(function (b) {
      return '<button type="button" class="mini-btn sim-btn" data-b="' + b.k + '">' + esc(b.label) + '</button>';
    }).join('');
    wrap.innerHTML =
      '<div class="sim-head"><h4>' + esc(cfg.title) + '</h4>' +
      (buttons ? '<div class="sim-btns">' + buttons + '</div>' : '') + '</div>' +
      '<div class="sim-canvas"><canvas aria-label="' + esc(cfg.title) + ' 실험 그림"></canvas></div>' +
      '<div class="sim-readout" aria-live="polite"></div>' +
      (controls ? '<div class="sim-controls">' + controls + '</div>' : '') +
      (cfg.hint ? '<p class="sim-hint">' + cfg.hint + '</p>' : '');
    host.appendChild(wrap);

    var canvas = $('canvas', wrap);
    var ctx = canvas.getContext('2d');
    var S = cfg.state || {};
    var playing = false;
    var raf = 0;
    var last = 0;

    (cfg.controls || []).forEach(function (c) {
      var input = $('input[data-k="' + c.k + '"]', wrap);
      if (S[c.k] == null) S[c.k] = +c.value;
      var out = $('[data-out="' + c.k + '"]', wrap);
      function sync() {
        out.textContent = c.fmt ? c.fmt(S[c.k]) : S[c.k];
      }
      input.value = S[c.k];
      sync();
      input.addEventListener('input', function () {
        S[c.k] = +input.value;
        sync();
        render();
      });
      c._sync = sync;
    });

    function updateReadout() {
      var box = $('.sim-readout', wrap);
      if (!box) return;
      var rows = cfg.readout ? cfg.readout(S) : [];
      box.innerHTML = rows.map(function (r) {
        return '<div class="sim-ro' + (r[2] ? ' is-key' : '') + '"><span>' + r[0] + '</span><strong>' + r[1] + '</strong></div>';
      }).join('');
    }

    function sizeCanvas() {
      var rect = canvas.parentNode.getBoundingClientRect();
      var W = Math.max(260, Math.round(rect.width));
      var H = cfg.height || 320;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { W: W, H: H };
    }

    var dims = { W: 300, H: cfg.height || 320 };

    function render() {
      var d = sizeCanvas();
      dims = d;
      var T = theme();
      ctx.clearRect(0, 0, d.W, d.H);
      try { cfg.draw(ctx, d.W, d.H, S, T); } catch (e) { /* 그리기 오류로 화면이 멈추지 않게 */ }
      updateReadout();
    }

    function loop(ts) {
      if (!playing) return;
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      if (cfg.tick && cfg.tick(S, dt)) {
        (cfg.controls || []).forEach(function (c) {
          var input = $('input[data-k="' + c.k + '"]', wrap);
          if (input) input.value = S[c.k];
          if (c._sync) c._sync();
        });
        render();
        raf = requestAnimationFrame(loop);
      } else {
        playing = false;
        updatePlayBtn();
      }
    }

    function updatePlayBtn() {
      var b = $('[data-b="play"]', wrap);
      if (b) b.textContent = playing ? '⏸ 멈춤' : '▶ 재생';
    }

    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('[data-b]');
      if (!b) return;
      var k = b.getAttribute('data-b');
      if (k === 'play') {
        if (playing) { playing = false; cancelAnimationFrame(raf); updatePlayBtn(); return; }
        if (cfg.onPlay) cfg.onPlay(S);
        playing = true;
        last = 0;
        updatePlayBtn();
        raf = requestAnimationFrame(loop);
      } else if (k === 'reset') {
        (cfg.controls || []).forEach(function (c) {
          S[c.k] = +c.value;
          var input = $('input[data-k="' + c.k + '"]', wrap);
          if (input) input.value = c.value;
          if (c._sync) c._sync();
        });
        if (cfg.onReset) cfg.onReset(S);
        render();
      } else if (cfg.onButton) {
        cfg.onButton(k, S, render);
      }
    });

    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () { render(); });
      ro.observe(canvas.parentNode);
    }
    window.addEventListener('resize', render);
    render();
    SIMS.push({ id: cfg.id, wrap: wrap, S: S, render: render });
    return wrap;
  }

  /* ------------------------------------------------------------ 그리기 도구 */
  function arrow(ctx, x1, y1, x2, y2, color, w) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w || 1.4;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    var a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 8 * Math.cos(a - 0.4), y2 - 8 * Math.sin(a - 0.4));
    ctx.lineTo(x2 - 8 * Math.cos(a + 0.4), y2 - 8 * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill();
  }
  function label(ctx, text, x, y, color, size, align) {
    ctx.fillStyle = color;
    ctx.font = (size || 12) + 'px "Pretendard", system-ui, sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }
  function circle(ctx, x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); }
  }
  function star(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      var rr = i % 2 ? r * 0.38 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }

  /* ======================================================================
     실험 1 — 달의 위상과 일·월식
     ====================================================================== */
  function simMoon(host) {
    createSim(host, {
      id: 'moon', title: '🌙 달의 위상과 일·월식', height: 340,
      controls: [
        { k: 'day', label: '달의 나이', min: 0, max: 29.5, step: 0.1, value: 7.4, fmt: function (v) { return v.toFixed(1) + '일'; } },
        { k: 'tilt', label: '달 궤도 기울기', min: 0, max: 12, step: 0.5, value: 5.1, fmt: function (v) { return v.toFixed(1) + '°'; } }
      ],
      buttons: [{ k: 'play', label: '▶ 재생' }, { k: 'reset', label: '초기화' }],
      state: { orbit: 0 },
      onPlay: function () { },
      tick: function (S, dt) {
        S.day = (S.day + dt * 2.2) % 29.5;
        return true;
      },
      draw: function (ctx, W, H, S, T) {
        var cx = W * 0.30, cy = H * 0.52;
        var R = Math.min(W * 0.24, H * 0.36);
        // 궤도
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
        // 태양 방향 (왼쪽)
        label(ctx, '☀ 태양빛', 12, 16, T.accent, 12, 'left');
        for (var i = 0; i < 3; i++) arrow(ctx, 16, 40 + i * 16, W * 0.30 - R - 26, 40 + i * 16, 'rgba(255,212,121,0.35)', 1);
        // 지구
        circle(ctx, cx, cy, 13, T.accent3, null);
        label(ctx, '지구', cx, cy + 26, T.muted, 11);
        // 달 위치: day 0 = 태양 쪽(왼쪽)
        var ang = Math.PI + (S.day / 29.5) * Math.PI * 2;
        var mx = cx + Math.cos(ang) * R, my = cy + Math.sin(ang) * R * 0.92;
        // 기울기만큼 위아래로 (식이 드물게 일어나는 이유)
        var ty = Math.sin(ang) * (S.tilt / 12) * R * 0.30;
        my += ty * 0;
        circle(ctx, mx, my, 9, '#cfd6e4', null);
        // 빛을 받는 쪽 표시
        ctx.fillStyle = 'rgba(20,20,30,0.72)';
        ctx.beginPath();
        ctx.arc(mx, my, 9, -Math.PI / 2, Math.PI / 2, false);
        ctx.fill();
        label(ctx, '달', mx, my - 18, T.muted, 11);

        // 지구에서 본 달
        var vx = W * 0.70, vy = H * 0.44, vr = Math.min(W * 0.15, 60);
        var k = (1 - Math.cos(S.day / 29.5 * Math.PI * 2)) / 2;
        var waxing = S.day < 14.75;
        label(ctx, '지구에서 본 모양', vx, vy - vr - 18, T.text, 12);
        circle(ctx, vx, vy, vr, '#0a0f1c', T.grid);
        // 밝은 부분
        ctx.save();
        ctx.beginPath();
        ctx.arc(vx, vy, vr, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = '#e8e4d6';
        ctx.beginPath();
        var start = -Math.PI / 2, end = Math.PI / 2;
        if (waxing) { ctx.arc(vx, vy, vr, start, end, false); }
        else { ctx.arc(vx, vy, vr, end, start, false); }
        var rx = Math.abs(1 - 2 * k) * vr;
        if (waxing) {
          ctx.ellipse(vx, vy, Math.max(0.01, rx), vr, 0, Math.PI / 2, -Math.PI / 2, k > 0.5);
        } else {
          ctx.ellipse(vx, vy, Math.max(0.01, rx), vr, 0, -Math.PI / 2, Math.PI / 2, k > 0.5);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        circle(ctx, vx, vy, vr, null, T.grid);

        // 이름
        var names = ['삭(신월)', '초승달', '상현달', '차오르는 달', '보름달', '기우는 달', '하현달', '그믐달'];
        var idx = Math.round((S.day / 29.5) * 8) % 8;
        label(ctx, names[idx], vx, vy + vr + 20, T.accent2, 13);

        // 일·월식 조건
        var nearNode = (S.day < 1.6 || S.day > 27.9 || Math.abs(S.day - 14.75) < 1.6);
        var canEclipse = nearNode && S.tilt < 1.5;
        var note = S.tilt >= 1.5
          ? '달 궤도가 5.1° 기울어 있어 대부분의 삭·망에서 그림자가 빗나갑니다.'
          : (canEclipse ? '교점 근처 + 기울기 0° → 이때 일식·월식이 가능합니다.' : '기울기가 0이어도 달이 교점 근처에 있어야 식이 일어납니다.');
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(10, H - 46, W - 20, 36);
        label(ctx, note, 18, H - 28, S.tilt < 1.5 && nearNode ? T.accent : T.muted, 11, 'left');
      },
      readout: function (S) {
        var k = (1 - Math.cos(S.day / 29.5 * Math.PI * 2)) / 2;
        var phase = (S.day / 29.5 * 360);
        return [
          ['달의 나이', S.day.toFixed(1) + '일 / 29.5일'],
          ['지구에서 보이는 밝은 비율', Math.round(k * 100) + '%'],
          ['위상각(태양–달–지구)', phase.toFixed(0) + '°'],
          ['한 달(삭망월)', '29.53일']
        ];
      },
      hint: '달은 스스로 빛나지 않고 태양빛을 반사합니다. 지구에서 보는 각도가 달라지면서 밝은 부분의 모양이 바뀝니다. 기울기를 0으로 줄여도 달이 교점(궤도가 만나는 곳) 근처에 있을 때만 식이 일어납니다.'
    });
  }

  /* ======================================================================
     실험 2 — 계절과 태양 고도
     ====================================================================== */
  function simSeasons(host) {
    createSim(host, {
      id: 'seasons', title: '🌍 계절은 지구의 기울기 때문에 생깁니다', height: 330,
      controls: [
        { k: 'month', label: '지구의 공전 위치', min: 1, max: 12, step: 1, value: 6, fmt: function (v) { return v + '월'; } },
        { k: 'lat', label: '관측 위도', min: -66, max: 66, step: 1, value: 37, fmt: function (v) { return (v >= 0 ? '북위 ' : '남위 ') + Math.abs(v) + '°'; } }
      ],
      draw: function (ctx, W, H, S, T) {
        var cx = W * 0.26, cy = H * 0.5;
        circle(ctx, cx, cy, 22, T.accent, null);
        label(ctx, '태양', cx, cy + 38, T.muted, 11);
        var R = Math.min(W * 0.19, H * 0.34);
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
        var ang = Math.PI + ((S.month - 1) / 12) * Math.PI * 2;
        var ex = cx + Math.cos(ang) * R, ey = cy + Math.sin(ang) * R * 0.55;
        // 자전축 (23.5° 기울어짐, 방향 고정)
        var tilt = 23.44 * Math.PI / 180;
        var ax = Math.sin(tilt) * 22, ay = -Math.cos(tilt) * 22;
        ctx.strokeStyle = T.text; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(ex - ax, ey - ay); ctx.lineTo(ex + ax, ey + ay); ctx.stroke();
        circle(ctx, ex + ax, ey + ay, 3, T.accent3, null);   // 북극
        circle(ctx, ex - ax, ey - ay, 3, T.accent2, null);
        circle(ctx, ex, ey, 11, T.accent3, null);
        label(ctx, '지구', ex, ey + 30, T.muted, 11);

        // 태양 적위: δ = -23.44° × cos(2π(month-6.5)/12) 근사 (6월 하지 +23.4)
        var dec = 23.44 * Math.cos((S.month - 6.5) / 12 * Math.PI * 2);
        var phi = S.lat * Math.PI / 180, d = dec * Math.PI / 180;
        var cosH = -Math.tan(phi) * Math.tan(d);
        var dayLen;
        if (cosH <= -1) dayLen = 24;
        else if (cosH >= 1) dayLen = 0;
        else dayLen = Math.acos(cosH) / Math.PI * 24;

        // 오른쪽: 지평선과 태양 고도
        var bx = W * 0.62, by = H - 52, bw = W * 0.33, bh = H * 0.58;
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx - 10, by); ctx.lineTo(bx + bw, by); ctx.stroke();
        label(ctx, '지평선', bx + bw - 4, by + 14, T.faint, 10, 'right');
        var noonAlt = 90 - Math.abs(S.lat - dec);
        var hx = bx + bw * 0.5, hy = by - Math.max(0, noonAlt) / 90 * bh;
        ctx.strokeStyle = 'rgba(255,212,121,0.4)'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(hx, by); ctx.lineTo(hx, hy); ctx.stroke(); ctx.setLineDash([]);
        circle(ctx, hx, hy, 9, T.accent, null);
        label(ctx, '정오 태양', hx, hy - 18, T.accent, 11);
        label(ctx, '고도 ' + Math.round(noonAlt) + '°', hx, by + 14, T.text, 11);
        label(ctx, '북쪽', bx - 3, by + 14, T.faint, 10, 'left');

        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(10, 8, W - 20, 30);
        label(ctx, '지구 자전축은 공전 궤도에 대해 23.44° 기울어진 채 방향이 일정합니다.', W / 2, 23, T.muted, 11);
      },
      readout: function (S) {
        var dec = 23.44 * Math.cos((S.month - 6.5) / 12 * Math.PI * 2);
        var phi = S.lat * Math.PI / 180, d = dec * Math.PI / 180;
        var cosH = -Math.tan(phi) * Math.tan(d);
        var dayLen = cosH <= -1 ? 24 : cosH >= 1 ? 0 : Math.acos(cosH) / Math.PI * 24;
        var alt = 90 - Math.abs(S.lat - dec);
        return [
          ['태양 적위', (dec >= 0 ? '+' : '') + dec.toFixed(1) + '°'],
          ['정오 태양 고도', Math.round(alt) + '°'],
          ['낮 길이', Math.floor(dayLen) + '시간 ' + Math.round((dayLen % 1) * 60) + '분'],
          ['계절', dec > 15 ? '북반구 여름 (남반구 겨울)' : dec < -15 ? '북반구 겨울 (남반구 여름)' : (S.month > 6 ? '북반구 가을' : '북반구 봄')]
        ];
      },
      hint: '계절이 생기는 까닭은 지구와 태양 사이 거리가 아니라 자전축의 기울기입니다. 축이 기울어 태양빛이 비스듬히 들어오는 곳은 같은 빛을 넓게 받아 덜 데워집니다.'
    });
  }

  /* ======================================================================
     실험 3 — 연주시차 (중학교 2-2 '별과 우주')
     ====================================================================== */
  function simParallax(host) {
    createSim(host, {
      id: 'parallax', title: '📐 연주시차로 별까지 거리 재기', height: 350,
      controls: [
        { k: 'dpc', label: '별까지 거리', min: 0.2, max: 10, step: 0.05, value: 1.3, fmt: function (v) { return v.toFixed(2) + ' pc'; } },
        { k: 'month', label: '지구의 공전 위치', min: 0, max: 12, step: 0.5, value: 0, fmt: function (v) { return (v === 0 || v === 12 ? '1월' : v === 6 ? '7월' : (v < 6 ? '1월 +' : '7월 +') + Math.abs(v - (v < 6 ? 0 : 6)).toFixed(1) + '개월'); } }
      ],
      buttons: [{ k: 'play', label: '▶ 6개월 이동' }, { k: 'reset', label: '1월로' }],
      onPlay: function (S) { S._dir = 1; },
      tick: function (S, dt) {
        S.month = (S.month + dt * 3) % 12;
        return true;
      },
      draw: function (ctx, W, H, S, T) {
        var p = 1 / S.dpc;                    // 각초
        var cx = W * 0.26, cy = H * 0.55, R = Math.min(W * 0.16, 70);
        // 태양과 지구 궤도
        circle(ctx, cx, cy, R, null, T.grid);
        circle(ctx, cx, cy, 12, T.accent, null);
        label(ctx, '태양', cx, cy + 26, T.muted, 11);
        // 지구 (1월 = 오른쪽, 7월 = 왼쪽)
        var a = (S.month / 12) * Math.PI * 2;
        var ex = cx + Math.cos(a) * R, ey = cy + Math.sin(a) * R;
        circle(ctx, ex, ey, 8, T.accent3, null);
        label(ctx, '지구', ex, ey - 16, T.accent3, 10);
        // 6개월 전 위치
        var a2 = a + Math.PI;
        var e2x = cx + Math.cos(a2) * R, e2y = cy + Math.sin(a2) * R;
        circle(ctx, e2x, e2y, 6, 'rgba(138,182,255,0.4)', null);

        // 별 위치 (화면 오른쪽) — 거리는 로그로 압축
        var sx = W * 0.62 + Math.log10(S.dpc / 0.2) * (W * 0.10);
        var sy = cy;
        star(ctx, sx, sy, 9, T.accent);
        label(ctx, '가까운 별', sx, sy - 20, T.accent, 11);
        // 배경 별
        var seed = 7;
        function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
        for (var i = 0; i < 26; i++) {
          var bx = W * 0.58 + rnd() * W * 0.40, by = 30 + rnd() * (H - 80);
          if (Math.abs(bx - sx) < 14 && Math.abs(by - sy) < 14) continue;
          circle(ctx, bx, by, 1.4, 'rgba(200,210,230,0.7)', null);
        }

        // 시선: 지구 → 별 (과장)
        arrow(ctx, ex, ey, sx, sy, 'rgba(126,224,192,0.55)', 1);
        arrow(ctx, e2x, e2y, sx, sy, 'rgba(255,180,120,0.35)', 1);
        // 시차각 표시
        label(ctx, '시선 방향 차이 = 연주시차 p', W * 0.60, H - 26, T.muted, 11);
        label(ctx, 'p = ' + p.toFixed(2) + '″', sx + 4, sy + 22, T.accent2, 12);

        // 망원경 시야: 배경에 대한 별의 이동 (과장)
        var vx = W * 0.22, vy = H - 60, vr = 34;
        circle(ctx, vx, vy, vr, 'rgba(5,10,20,0.8)', T.grid);
        var shift = Math.sin(a) * vr * 0.55;    // 과장
        circle(ctx, vx + shift, vy, 3, T.accent, null);
        label(ctx, '망원경으로 본 별의 흔들림(과장)', vx, vy + vr + 16, T.faint, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(10, 8, W - 20, 26);
        label(ctx, '그림은 이해를 위해 거리·각도를 과장했습니다. 실제 시차각은 아주 작습니다.', W / 2, 21, T.muted, 11);
      },
      readout: function (S) {
        var p = 1 / S.dpc;
        return [
          ['연주시차 p', p.toFixed(2) + '″ (각초)'],
          ['거리 d = 1 / p', S.dpc.toFixed(2) + ' pc (파섹)'],
          ['광년으로', (S.dpc * 3.2616).toFixed(2) + '광년'],
          ['1 pc의 정의', '1 AU를 1″로 보는 거리 ≈ 3.26광년']
        ];
      },
      hint: '지구가 6개월 동안 3억 km를 이동하기 때문에 가까운 별이 먼 배경 별에 대해 조금 움직여 보입니다. 이 각도(연주시차 p)의 역수가 거리입니다. p가 1각초이면 거리는 1파섹(3.26광년)입니다.'
    });
  }

  /* ======================================================================
     실험 4 — 케플러 3법칙
     ====================================================================== */
  function solveKepler(M, e) {
    var E = M;
    for (var i = 0; i < 6; i++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    return E;
  }

  function simKepler(host) {
    createSim(host, {
      id: 'kepler', title: '🪐 케플러 3법칙 — 궤도와 공전 주기', height: 330,
      controls: [
        { k: 'a', label: '궤도 장반경 a', min: 0.3, max: 40, step: 0.1, value: 1, fmt: function (v) { return v.toFixed(1) + ' AU'; } },
        { k: 'e', label: '이심률 e', min: 0, max: 0.85, step: 0.01, value: 0.25, fmt: function (v) { return v.toFixed(2); } }
      ],
      buttons: [{ k: 'play', label: '▶ 재생' }, { k: 'reset', label: '초기화' }],
      state: { M: 0 },
      tick: function (S, dt) {
        var T = Math.pow(S.a, 1.5);
        S.M = (S.M + dt * 2 * Math.PI / Math.max(0.2, T * 0.35)) % (Math.PI * 2);
        return true;
      },
      draw: function (ctx, W, H, S, T) {
        var cx = W / 2, cy = H / 2;
        var A = Math.min(W * 0.36, H * 0.40) * (0.35 + 0.65 * Math.min(1, Math.log10(S.a + 1) / 1.6));
        var b = A * Math.sqrt(1 - S.e * S.e);
        var c = A * S.e;
        // 궤도
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(cx, cy, A, b, 0, 0, Math.PI * 2); ctx.stroke();
        // 태양(초점)
        circle(ctx, cx - c, cy, 9, T.accent, null);
        label(ctx, '태양(초점)', cx - c, cy - 18, T.accent, 10);
        // 행성
        var E = solveKepler(S.M, S.e);
        var px = cx + A * (Math.cos(E) - S.e);
        var py = cy + b * Math.sin(E);
        circle(ctx, px, py, 6, T.accent3, null);
        // 반지름 선
        ctx.strokeStyle = 'rgba(138,182,255,0.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - c, cy); ctx.lineTo(px, py); ctx.stroke();
        // 속도 벡터 (면적 속도 일정 시각화)
        var vx = -(A * Math.sin(E)) * (1 / (1 - S.e * Math.cos(E)));
        var vy = b * Math.cos(E) * (1 / (1 - S.e * Math.cos(E)));
        var len = Math.hypot(vx, vy) || 1;
        arrow(ctx, px, py, px + vx / len * 30, py + vy / len * 30, 'rgba(126,224,192,0.7)', 1.2);
        label(ctx, '속도', px + vx / len * 44, py + vy / len * 44, T.accent2, 10);
        // 초점 표시
        circle(ctx, cx + c, cy, 2.5, T.faint, null);
        label(ctx, '빈 초점', cx + c, cy + 16, T.faint, 9);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(10, 8, W - 20, 26);
        label(ctx, '케플러 1법칙: 행성은 태양을 한 초점으로 하는 타원 궤도를 돕니다.', W / 2, 21, T.muted, 11);
      },
      readout: function (S) {
        var T = Math.pow(S.a, 1.5);
        var vp = Math.sqrt((1 + S.e) / (1 - S.e));
        return [
          ['공전 주기 T = a^1.5', T.toFixed(2) + '년'],
          ['지구 기준', 'a = 1 AU → T = 1년'],
          ['근일점/원일점 속도비', vp.toFixed(2) + '배'],
          ['케플러 2법칙', '같은 시간에 같은 면적을 지나갑니다']
        ];
      },
      hint: 'T² = a³ (T는 년, a는 AU)은 태양계 모든 행성에서 성립합니다. 이심률이 커지면 근일점에서 빠르게, 원일점에서 느리게 움직입니다.'
    });
  }

  /* ======================================================================
     실험 5 — H-R도
     ====================================================================== */
  function simHR(host) {
    createSim(host, {
      id: 'hr', title: '⭐ H-R도 — 별의 밝기와 표면 온도', height: 360,
      controls: [
        { k: 'mass', label: '별의 질량', min: 0.1, max: 30, step: 0.1, value: 1, fmt: function (v) { return v.toFixed(1) + ' × 태양'; } }
      ],
      draw: function (ctx, W, H, S, T) {
        var L = 44, R = W - 16, TOP = 26, BOT = H - 34;
        var x0 = L, x1 = R, y0 = TOP, y1 = BOT;
        // 축
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.stroke();
        // 온도 축 (왼쪽 뜨겁고 오른쪽 차갑게)
        var temps = [30000, 10000, 6000, 3000];
        temps.forEach(function (t) {
          var x = x0 + (Math.log10(40000 / t) / Math.log10(40000 / 2500)) * (x1 - x0);
          ctx.strokeStyle = 'rgba(255,255,255,0.07)';
          ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
          label(ctx, t >= 1000 ? (t / 1000) + 'k' : t, x, y1 + 12, T.faint, 10);
        });
        label(ctx, '표면 온도 (K)', (x0 + x1) / 2, H - 12, T.muted, 11);
        // 광도 축
        [1e-3, 1, 1e3, 1e6].forEach(function (l) {
          var y = y1 - (Math.log10(l) - (-4)) / 10 * (y1 - y0);
          ctx.strokeStyle = 'rgba(255,255,255,0.07)';
          ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
          label(ctx, '10' + (l === 1 ? '⁰' : '^' + Math.log10(l)), x0 - 8, y, T.faint, 9, 'right');
        });
        label(ctx, '광도 (태양=1)', x0 + 6, y0 - 10, T.muted, 10, 'left');

        function pos(Tk, Lg) {
          var x = x0 + (Math.log10(40000 / Math.max(2500, Tk)) / Math.log10(40000 / 2500)) * (x1 - x0);
          var y = y1 - (Math.log10(Math.max(1e-4, Lg)) + 4) / 10 * (y1 - y0);
          return { x: x, y: y };
        }
        // 주계열
        ctx.strokeStyle = 'rgba(255,212,121,0.55)'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (var m = 0.08; m <= 40; m *= 1.18) {
          var Lg = Math.pow(m, 3.5);
          var Tk = 5772 * Math.pow(m, 0.55);
          var q = pos(Tk, Lg);
          if (m === 0.08) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
        }
        ctx.stroke();
        // 거성·백색왜성 무리
        ctx.fillStyle = 'rgba(255,140,90,0.35)';
        for (var i = 0; i < 26; i++) {
          var gx = x0 + 0.18 * (x1 - x0) + (i % 7) * 9, gy = y0 + 0.18 * (y1 - y0) + Math.floor(i / 7) * 10;
          ctx.beginPath(); ctx.arc(gx, gy, 3, 0, 6.28); ctx.fill();
        }
        label(ctx, '거성', x0 + 0.24 * (x1 - x0), y0 + 0.12 * (y1 - y0), 'rgba(255,150,110,0.8)', 10);
        ctx.fillStyle = 'rgba(140,200,255,0.35)';
        for (var j = 0; j < 12; j++) {
          var wx = x0 + 0.30 * (x1 - x0) + (j % 6) * 9, wy = y1 - 0.12 * (y1 - y0) + Math.floor(j / 6) * -10;
          ctx.beginPath(); ctx.arc(wx, wy, 2.4, 0, 6.28); ctx.fill();
        }
        label(ctx, '백색왜성', x0 + 0.40 * (x1 - x0), y1 - 0.16 * (y1 - y0), 'rgba(150,205,255,0.8)', 10);
        label(ctx, '주계열', x0 + 0.30 * (x1 - x0), y1 - 0.62 * (y1 - y0), T.accent, 11);

        // 선택한 별
        var mass = S.mass;
        var lum = Math.pow(mass, 3.5);
        var temp = 5772 * Math.pow(mass, 0.55);
        var p = pos(temp, lum);
        circle(ctx, p.x, p.y, 8, 'rgba(126,224,192,0.25)', T.accent2);
        circle(ctx, p.x, p.y, 3.4, T.accent2, null);
        var tag = mass < 0.5 ? '적색왜성' : mass < 1.5 ? '태양형' : mass < 4 ? '청색 주계열성' : '거대 청색별';
        label(ctx, tag, p.x, p.y - 14, T.accent2, 10);
      },
      readout: function (S) {
        var lum = Math.pow(S.mass, 3.5);
        var temp = 5772 * Math.pow(S.mass, 0.55);
        var rad = Math.sqrt(lum) / Math.pow(temp / 5772, 2);
        return [
          ['광도', nf(lum, 3) + ' × 태양'],
          ['표면 온도', nf(temp, 0) + ' K'],
          ['반지름', nf(rad, 2) + ' × 태양'],
          ['수명(대략)', nf(10 / Math.pow(S.mass, 2.5), 1) + ' × 100억 년']
        ];
      },
      hint: '주계열성은 질량이 클수록 훨씬 밝고 뜨겁습니다(L ≈ M^3.5). 그래서 수명은 짧습니다. 별의 위치를 바꾸면 광도·온도·반지름이 함께 어떻게 변하는지 보세요.'
    });
  }

  /* ======================================================================
     실험 6 — 적색편이와 허블-르메트르 법칙
     ====================================================================== */
  function simRedshift(host) {
    createSim(host, {
      id: 'redshift', title: '🌈 적색편이와 허블-르메트르 법칙', height: 300,
      controls: [
        { k: 'z', label: '적색편이 z', min: 0, max: 1, step: 0.005, value: 0.05, fmt: function (v) { return v.toFixed(3); } }
      ],
      draw: function (ctx, W, H, S, T) {
        var x0 = 20, x1 = W - 20, y = H * 0.42;
        var grad = ctx.createLinearGradient(x0, 0, x1, 0);
        grad.addColorStop(0, '#4b1f8a'); grad.addColorStop(0.18, '#2244cc');
        grad.addColorStop(0.36, '#22bbdd'); grad.addColorStop(0.5, '#44dd77');
        grad.addColorStop(0.64, '#dde033'); grad.addColorStop(0.8, '#e08a22'); grad.addColorStop(1, '#b02a1a');
        ctx.fillStyle = grad; ctx.fillRect(x0, y - 26, x1 - x0, 52);
        // 파장 축 400~700nm
        var lines = [434, 486, 656];  // 수소 발머선
        ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2;
        lines.forEach(function (nm) {
          var rest = (nm - 400) / 300;
          var obs = (nm * (1 + S.z) - 400) / 300;
          if (rest >= 0 && rest <= 1) {
            ctx.beginPath(); ctx.moveTo(x0 + rest * (x1 - x0), y - 26); ctx.lineTo(x0 + rest * (x1 - x0), y + 26); ctx.stroke();
          }
          if (obs >= 0 && obs <= 1) {
            ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x0 + obs * (x1 - x0), y - 26); ctx.lineTo(x0 + obs * (x1 - x0), y + 26); ctx.stroke();
            ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2;
          }
        });
        label(ctx, '400nm', x0, y + 40, T.faint, 10, 'left');
        label(ctx, '700nm', x1, y + 40, T.faint, 10, 'right');
        label(ctx, '검은 선 = 실험실에서 잰 기준선', x0, y - 40, T.muted, 11, 'left');
        label(ctx, '흰 선 = 멀리서 온 빛(오른쪽으로 이동)', x0 + 6, y + 62, T.text, 11, 'left');
        // 속도·거리
        var v = S.z < 0.1 ? S.z * 299792.458 : 299792.458 * ((1 + S.z) ** 2 - 1) / ((1 + S.z) ** 2 + 1);
        var d = v / 70;    // Mpc
        label(ctx, '후퇴 속도 약 ' + nf(v, 0) + ' km/s  ·  거리 약 ' + nf(d, 1) + ' Mpc', W / 2, H - 18, T.accent2, 12);
      },
      readout: function (S) {
        var v = S.z < 0.1 ? S.z * 299792.458 : 299792.458 * (Math.pow(1 + S.z, 2) - 1) / (Math.pow(1 + S.z, 2) + 1);
        var d = v / 70;
        return [
          ['적색편이 z', S.z.toFixed(3)],
          ['후퇴 속도', nf(v, 0) + ' km/s'],
          ['거리 (H₀=70)', nf(d, 1) + ' Mpc = ' + nf(d * 3.2616, 0) + '백만 광년'],
          ['수소 발머선 Hα', '656.3nm → ' + nf(656.3 * (1 + S.z), 1) + 'nm']
        ];
      },
      hint: '멀리 있는 은하일수록 스펙트럼 선이 더 붉은 쪽으로 치우칩니다. 허블-르메트르 법칙 v = H₀d 는 우주가 팽창한다는 가장 직접적인 증거입니다.'
    });
  }

  /* ======================================================================
     실험 7 — 플랑크 흑체복사
     ====================================================================== */
  function planck(lambdaNm, Tk) {
    var l = lambdaNm * 1e-9;
    var h = 6.62607015e-34, c = 2.99792458e8, k = 1.380649e-23;
    return (2 * h * c * c) / (Math.pow(l, 5) * (Math.exp(h * c / (l * k * Tk)) - 1));
  }

  function simPlanck(host) {
    createSim(host, {
      id: 'planck', title: '🔥 플랑크 흑체복사 곡선', height: 320,
      controls: [
        { k: 'temp', label: '별의 표면 온도', min: 1000, max: 30000, step: 100, value: 5772, fmt: function (v) { return nf(v, 0) + ' K'; } }
      ],
      draw: function (ctx, W, H, S, T) {
        var L = 46, R = W - 14, TOP = 24, BOT = H - 34;
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(L, BOT); ctx.lineTo(R, BOT); ctx.moveTo(L, TOP); ctx.lineTo(L, BOT); ctx.stroke();
        var maxL = 2000;
        var n = 160, pts = [], peak = 0;
        for (var i = 0; i <= n; i++) {
          var nm = 1 + (maxL - 1) * i / n;
          var b = planck(nm, S.temp);
          if (b > peak) peak = b;
          pts.push([nm, b]);
        }
        var peakNm = 2.898e6 / S.temp;
        function px(nm) { return L + (nm / maxL) * (R - L); }
        function py(b) { return BOT - (b / peak) * (BOT - TOP) * 0.92; }
        // 가시광 영역
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(px(380), TOP, px(750) - px(380), BOT - TOP);
        label(ctx, '가시광', (px(380) + px(750)) / 2, TOP + 10, T.faint, 10);
        // 곡선
        ctx.strokeStyle = T.accent; ctx.lineWidth = 2.4; ctx.beginPath();
        pts.forEach(function (p, i) { if (i) ctx.lineTo(px(p[0]), py(p[1])); else ctx.moveTo(px(p[0]), py(p[1])); });
        ctx.stroke();
        // 채우기
        ctx.lineTo(px(maxL), BOT); ctx.lineTo(px(1), BOT); ctx.closePath();
        ctx.fillStyle = 'rgba(255,212,121,0.10)'; ctx.fill();
        // 최대 파장
        var pk = px(peakNm);
        ctx.strokeStyle = T.accent2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(pk, TOP); ctx.lineTo(pk, BOT); ctx.stroke(); ctx.setLineDash([]);
        label(ctx, '최대 ' + nf(peakNm, 0) + 'nm', Math.min(R - 40, pk + 6), TOP + 20, T.accent2, 11, 'left');
        label(ctx, '파장 (nm)', (L + R) / 2, H - 12, T.muted, 11);
        label(ctx, '복사 세기 (상대값)', L + 6, TOP - 10, T.muted, 10, 'left');
        [0, 500, 1000, 1500, 2000].forEach(function (nm) { label(ctx, nm, px(nm), BOT + 12, T.faint, 9); });
      },
      readout: function (S) {
        var peakNm = 2.898e6 / S.temp;
        var total = 5.670374419e-8 * Math.pow(S.temp, 4);
        return [
          ['표면 온도', nf(S.temp, 0) + ' K'],
          ['최대 복사 파장 (빈의 법칙)', nf(peakNm, 0) + ' nm'],
          ['빛의 색', peakNm < 450 ? '푸르고 뜨거움' : peakNm < 600 ? '흰색에 가까움' : peakNm < 800 ? '주황색' : '붉고 차가움'],
          ['단위면적당 복사 에너지 (σT⁴)', nf(total / 1e6, 1) + ' × 10⁶ W/m²']
        ];
      },
      hint: '온도가 높아질수록 곡선 전체가 위로 올라가고(σT⁴), 최대 지점은 짧은 파장 쪽으로 이동합니다(빈의 법칙 λmax = 2.898×10⁶/T nm). 태양(5,772K)의 최대는 초록빛 근처입니다.'
    });
  }

  /* ======================================================================
     실험 8 — 외계행성 트랜짓
     ====================================================================== */
  function simTransit(host) {
    createSim(host, {
      id: 'transit', title: '🪐 외계행성 트랜짓 광도곡선', height: 330,
      controls: [
        { k: 'rp', label: '행성/항성 반지름 비 (Rp/Rs)', min: 0.01, max: 0.2, step: 0.005, value: 0.06, fmt: function (v) { return v.toFixed(3); } },
        { k: 'b', label: '충돌 계수 b', min: 0, max: 1, step: 0.01, value: 0.2, fmt: function (v) { return v.toFixed(2); } },
        { k: 'P', label: '공전 주기', min: 1, max: 60, step: 0.5, value: 10, fmt: function (v) { return v.toFixed(1) + '일'; } }
      ],
      draw: function (ctx, W, H, S, T) {
        var k = S.rp, b = S.b, P = S.P;
        // 태양형 별: a/Rs ≈ 215 (P/365)^(2/3)
        var aRs = 215 * Math.pow(P / 365.25, 2 / 3) / (1);
        var durDays = P / Math.PI * Math.asin(Math.min(1, Math.sqrt(Math.pow(1 + k, 2) - b * b) / aRs));
        var depth = k * k;
        // 곡선 영역
        var L = 44, R = W - 14, TOP = 26, BOT = H - 46;
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(L, BOT); ctx.lineTo(R, BOT); ctx.moveTo(L, TOP); ctx.lineTo(L, BOT); ctx.stroke();
        var half = Math.max(0.02, durDays / P * 2.2);   // 화면에 보이는 위상 폭
        function px(ph) { return L + ((ph + half) / (2 * half)) * (R - L); }
        var y0 = BOT - (BOT - TOP) * 0.18;
        var yDepth = BOT - (BOT - TOP) * (0.18 + 0.78 * (depth / 0.04));
        ctx.strokeStyle = T.accent3; ctx.lineWidth = 2.2;
        ctx.beginPath();
        var N = 200;
        for (var i = 0; i <= N; i++) {
          var ph = -0.6 + 1.2 * i / N;
          var t = Math.abs(ph) * P;            // 중심에서 떨어진 시간(일)
          var inside = Math.abs(t) < durDays / 2;
          var overlap = 1;
          if (inside) {
            var x = (t / (durDays / 2));       // -1..1
            overlap = Math.min(1, Math.sqrt(Math.max(0, 1 - x * x)) * 1.05);
            overlap = 1 - (1 - overlap) * 0.9;
          }
          var flux = 1 - depth * (inside ? overlap : 0);
          var y = BOT - (BOT - TOP) * (0.18 + 0.78 * flux / Math.max(0.96, 1));
          if (i) ctx.lineTo(px(ph), y); else ctx.moveTo(px(ph), y);
        }
        ctx.stroke();
        // 깊이 표시
        ctx.strokeStyle = 'rgba(255,122,110,0.7)'; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(L, y0); ctx.lineTo(R, y0); ctx.stroke(); ctx.setLineDash([]);
        label(ctx, '광도 100%', L + 4, y0 - 8, T.faint, 9, 'left');
        label(ctx, '−' + nf(depth * 100, 2) + '%', px(0) + 8, (y0 + yDepth) / 2, T.danger, 11, 'left');
        label(ctx, '시간 (공전 위상)', (L + R) / 2, H - 12, T.muted, 11);
        label(ctx, '식 지속 시간 ' + nf(durDays * 24, 1) + '시간', px(0), TOP + 10, T.accent2, 11);
      },
      readout: function (S) {
        var k = S.rp, b = S.b, P = S.P;
        var aRs = 215 * Math.pow(P / 365.25, 2 / 3);
        var dur = P / Math.PI * Math.asin(Math.min(1, Math.sqrt(Math.pow(1 + k, 2) - b * b) / aRs));
        var depth = k * k;
        return [
          ['광도 감소 깊이 (Rp/Rs)²', nf(depth * 100, 2) + '% (' + nf(depth * 1e6, 0) + ' ppm)'],
          ['식 지속 시간', nf(dur * 24, 2) + '시간'],
          ['행성 반지름', nf(k * 696340 / 6371, 1) + ' × 지구 (태양형 별 기준)'],
          ['공전 주기', nf(P, 1) + '일']
        ];
      },
      hint: '행성이 별 앞을 지나면 별빛이 아주 조금 줄어듭니다. 감소 폭은 (Rp/Rs)², 지속 시간은 궤도 크기와 경로에 따라 달라집니다. 케플러·TESS가 이 방법으로 수천 개의 행성을 찾았습니다.'
    });
  }

  /* ======================================================================
     실험 9 — 시선속도법
     ====================================================================== */
  function simRV(host) {
    createSim(host, {
      id: 'rv', title: '📈 시선속도법 — 별이 흔들리는 정도', height: 320,
      controls: [
        { k: 'mp', label: '행성 질량', min: 0.05, max: 10, step: 0.05, value: 1, fmt: function (v) { return v.toFixed(2) + ' × 목성'; } },
        { k: 'P', label: '공전 주기', min: 1, max: 1000, step: 1, value: 365, fmt: function (v) { return v.toFixed(0) + '일'; } },
        { k: 'e', label: '이심률', min: 0, max: 0.8, step: 0.01, value: 0.05, fmt: function (v) { return v.toFixed(2); } }
      ],
      draw: function (ctx, W, H, S, T) {
        var a = Math.pow(S.P / 365.25, 2 / 3);           // AU
        var K = 28.4329 * S.mp * Math.pow(a, -0.5) / Math.sqrt(1 - S.e * S.e);
        var L = 44, R = W - 14, TOP = 30, BOT = H - 40;
        var mid = (TOP + BOT) / 2;
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(L, mid); ctx.lineTo(R, mid); ctx.moveTo(L, TOP); ctx.lineTo(L, BOT); ctx.stroke();
        var scale = Math.min(1, 60 / Math.max(1, K));
        ctx.strokeStyle = T.accent2; ctx.lineWidth = 2.2; ctx.beginPath();
        var N = 200;
        for (var i = 0; i <= N; i++) {
          var ph = i / N * Math.PI * 2;
          var rv = K * (Math.cos(ph + S.e * Math.sin(ph)));
          var x = L + i / N * (R - L);
          var y = mid - (rv / Math.max(K, 1)) * (BOT - TOP) / 2 * (K / Math.max(K, 1));
          y = mid - (rv / Math.max(1, 60)) * (BOT - TOP) / 2 * 1;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
        label(ctx, '+' + nf(K, 1) + ' m/s', R - 4, mid - (K / Math.max(1, 60)) * (BOT - TOP) / 2 - 8, T.accent2, 10, 'right');
        label(ctx, '−' + nf(K, 1) + ' m/s', R - 4, mid + (K / Math.max(1, 60)) * (BOT - TOP) / 2 + 10, T.accent2, 10, 'right');
        label(ctx, '한 공전 주기', (L + R) / 2, H - 12, T.muted, 11);
        label(ctx, '시선속도 곡선 (도플러 이동)', L + 6, TOP - 12, T.muted, 10, 'left');
      },
      readout: function (S) {
        var a = Math.pow(S.P / 365.25, 2 / 3);
        var K = 28.4329 * S.mp * Math.pow(a, -0.5) / Math.sqrt(1 - S.e * S.e);
        return [
          ['시선속도 반진폭 K', nf(K, 2) + ' m/s'],
          ['궤도 장반경 a', nf(a, 3) + ' AU'],
          ['행성 질량 (최소)', nf(S.mp, 2) + ' × 목성'],
          ['도플러 이동', 'Δλ/λ = v/c ≈ ' + nf(K / 299792458, 8)]
        ];
      },
      hint: '행성이 별을 끌어당기면 별도 작은 원을 그리며 흔들립니다. 별빛의 스펙트럼 선이 주기적으로 움직이는 것을 재면 행성의 질량과 궤도를 알 수 있습니다. 지구를 도는 태양의 흔들림은 약 0.09 m/s입니다.'
    });
  }

  /* ======================================================================
     교육과정 데이터
     ====================================================================== */
  var CURRICULUM = {
    elementary: {
      label: '초등', icon: '🌱', sub: '밤하늘을 처음 만나는 단계 · 그림과 손으로 익히기',
      units: [
        {
          title: '낮과 밤은 지구가 돌기 때문에 생깁니다',
          principle: '지구는 서에서 동으로 24시간에 한 바퀴 자전합니다. 그래서 태양이 비치는 쪽은 낮, 등지는 쪽은 밤이 됩니다. 해가 뜨고 지는 것은 태양이 지구를 도는 것처럼 보이지만, 실제로는 지구가 도는 것입니다.',
          formula: '자전 주기 1일 = 24시간 · 360° ÷ 24시간 = 1시간에 15°',
          misconcept: ['해가 하늘을 가로질러 가는 것처럼 보이지만, 실제로 움직이는 것은 지구입니다.', '낮과 밤의 길이는 계절에 따라 달라집니다. 여름에는 낮이 길고 겨울에는 짧습니다.'],
          question: ['동쪽이 먼저 밝아지는 까닭은 무엇일까요?', '하루 중 그림자가 가장 짧은 때는 언제인가요?'],
          sim: 'seasons'
        },
        {
          title: '달의 모양은 왜 매일 달라질까',
          principle: '달은 스스로 빛을 내지 않고 태양빛을 반사합니다. 달이 지구 둘레를 돌면서 우리가 보는 밝은 면의 각도가 달라지기 때문에 초승달, 보름달, 그믐달로 모양이 바뀝니다.',
          formula: '삭망월(모양이 한 바퀴 도는 주기) ≈ 29.53일 · 항성월 ≈ 27.32일',
          misconcept: ['달의 모양이 바뀌는 것은 지구의 그림자가 달을 가리기 때문이 아닙니다. 지구 그림자에 들어가는 것은 월식뿐입니다.', '달의 같은 면만 보이는 것은 달의 자전 주기와 공전 주기가 같기 때문입니다.'],
          question: ['보름달은 해가 진 뒤 어느 방향에서 떠오를까요?', '한 달 동안 달이 뜨는 시각은 어떻게 변할까요?'],
          sim: 'moon'
        },
        {
          title: '계절이 생기는 까닭',
          principle: '지구의 자전축이 공전 궤도에 대해 약 23.5° 기울어져 있고, 그 방향이 우주 공간에서 일정합니다. 그래서 여름에는 태양빛이 더 곧게 들어오고 낮이 길어지며, 겨울에는 반대가 됩니다.',
          formula: '정오 태양 고도 ≈ 90° − |위도 − 태양 적위|',
          misconcept: ['계절은 지구와 태양 사이 거리가 가까워지고 멀어져서 생기는 것이 아닙니다. 실제로 지구는 1월 초에 태양에 가장 가깝습니다.', '북반구가 여름일 때 남반구는 겨울입니다.'],
          question: ['우리나라에서 여름 낮이 겨울보다 긴 이유를 설명해 보세요.', '적도 근처에는 왜 계절 변화가 작을까요?'],
          sim: 'seasons'
        },
        {
          title: '태양계 가족 여행',
          principle: '태양 둘레를 도는 행성은 수성·금성·지구·화성·목성·토성·천왕성·해왕성 8개입니다. 수성·금성·지구·화성은 암석 행성, 목성·토성·천왕성·해왕성은 거대 가스·얼음 행성입니다.',
          formula: '태양 지름 ≈ 지구의 109배 · 목성 지름 ≈ 지구의 11배',
          misconcept: ['명왕성은 2006년 국제천문연맹(IAU)에서 왜소행성으로 분류되었습니다.', '행성의 순서를 태양에서부터 세면 수성 → 금성 → 지구 → 화성 → 목성 → 토성 → 천왕성 → 해왕성입니다.'],
          question: ['목성과 토성이 왜 가장 큰 행성인지 생각해 보세요.', '밤하늘에서 행성과 별을 어떻게 구별할 수 있을까요?']
        }
      ]
    },
    middle: {
      label: '중등', icon: '🔭', sub: '중학교 과학 「별과 우주」 — 관측과 계산으로 확인하는 단계',
      units: [
        {
          title: '별의 연주 운동은 지구의 공전 때문입니다',
          principle: '같은 시각에 같은 별을 계속 관찰하면 계절에 따라 위치가 조금씩 달라집니다. 지구가 태양 둘레를 공전하기 때문에 생기는 겉보기 운동을 연주 운동이라고 합니다. 북극성 주변 별들은 북극성을 중심으로 원을 그리며 돌아갑니다.',
          formula: '지구 공전 속도 ≈ 29.8 km/s · 1년에 약 9.4억 km 이동',
          misconcept: ['별이 실제로 그 자리에서 크게 움직이는 것이 아닙니다. 아주 가까운 별을 빼면 별의 고유 운동은 1년 동안 눈에 띄지 않습니다.', '북극성은 하늘에서 가장 밝은 별이 아니라, 북쪽 하늘에서 거의 움직이지 않는 별입니다.'],
          question: ['여름과 겨울에 같은 시각 보이는 별자리가 다른 이유는 무엇일까요?', '북극성의 고도가 관측지의 위도와 같은 이유를 설명해 보세요.']
        },
        {
          title: '연주시차로 별까지의 거리를 잽니다',
          principle: '지구가 공전하면서 6개월 사이에 3억 km를 이동하면, 가까운 별은 먼 배경 별에 대해 조금 움직여 보입니다. 이 각도의 절반이 연주시차 p입니다. p가 클수록 별은 가깝습니다.',
          formula: 'd(pc) = 1 / p(″) · 1 pc ≈ 3.26광년 ≈ 3.09×10¹³ km',
          misconcept: ['연주시차는 별의 실제 크기가 아니라 거리를 재는 방법입니다.', '가까운 별일수록 시차가 크고, 아주 먼 별은 시차가 너무 작아 지구에서는 잘 보이지 않습니다.'],
          question: ['p = 0.1″인 별까지의 거리는 몇 pc, 몇 광년인가요?', '왜 인공위성(가이아)으로 시차를 재면 더 먼 별까지 잴 수 있을까요?'],
          sim: 'parallax'
        },
        {
          title: '달의 위상과 일식·월식',
          principle: '삭(신월)에는 달이 태양 쪽에 있어 보이지 않고, 망(보름달)에는 지구 반대쪽에 있습니다. 일식은 달이 태양을 가리는 현상, 월식은 달이 지구 그림자에 들어가는 현상입니다. 달 궤도가 5.1° 기울어 있어 매달 일어나지는 않습니다.',
          formula: '삭망월 29.53일 · 달 궤도 경사 5.1° · 개기일식은 지구 어딘가에서 약 1~2년에 한 번',
          misconcept: ['일식은 달이 태양 앞을 지날 때, 월식은 달이 지구 그림자 속으로 들어갈 때 일어납니다.', '보름달마다 월식이 일어나지 않는 이유는 달 궤도가 기울어져 있기 때문입니다.'],
          question: ['일식은 왜 낮에만 볼 수 있나요?', '개기일식 동안 코로나가 보이는 이유는 무엇일까요?'],
          sim: 'moon'
        },
        {
          title: '별의 밝기와 등급',
          principle: '별의 밝기는 등급으로 나타냅니다. 숫자가 작을수록 밝고, 1등급 차이는 약 2.512배 밝기 차이입니다. 1등성은 6등성보다 약 100배 밝습니다. 겉보기 등급은 거리와 실제 밝기가 섞인 값입니다.',
          formula: 'm₁ − m₂ = −2.5 log₁₀(F₁/F₂) · 5등급 = 100배',
          misconcept: ['겉보기 등급이 밝다고 실제로 더 밝은 별은 아닙니다. 거리가 가까우면 실제로 어두운 별도 밝게 보입니다.', '태양의 겉보기 등급은 약 −26.7등으로, 가장 밝은 별 시리우스(−1.44등)보다 훨씬 밝습니다.'],
          question: ['1등성과 6등성의 밝기 차이는 몇 배인가요?', '절대 등급을 쓰면 무엇이 편리해질까요?']
        }
      ]
    },
    high: {
      label: '고등(지구과학Ⅰ·Ⅱ)', icon: '🎓', sub: '지구과학Ⅰ·Ⅱ — 수식으로 우주의 구조를 읽는 단계',
      units: [
        {
          title: '케플러 법칙과 행성의 운동',
          principle: '행성은 태양을 한 초점으로 하는 타원 궤도를 돌고(1법칙), 태양과 행성을 잇는 선은 같은 시간에 같은 면적을 지나가며(2법칙), 공전 주기의 제곱은 장반경의 세제곱에 비례합니다(3법칙).',
          formula: 'T²(년²) = a³(AU³) · v근일점/v원일점 = (1+e)/(1−e)',
          misconcept: ['타원의 중심에는 태양이 아니라 초점 중 하나에 태양이 있습니다.', '케플러 3법칙은 태양계뿐 아니라 쌍성계와 외계행성계에도 (질량을 넣어) 적용됩니다.'],
          question: ['a = 4 AU인 행성의 공전 주기는?', '이심률이 커지면 근일점 속도는 어떻게 변할까요?'],
          sim: 'kepler'
        },
        {
          title: 'H-R도와 별의 진화',
          principle: '별의 표면 온도와 광도를 점으로 찍으면 대부분이 왼쪽 위(뜨겁고 밝음)에서 오른쪽 아래(차갑고 어두움)로 이어지는 주계열에 모입니다. 별은 수소를 태우는 주계열 단계를 지나 거성·초거성으로 부풀었다가, 질량에 따라 백색왜성·중성자별·블랙홀로 생을 마칩니다.',
          formula: 'L = 4πR²σT⁴ · 주계열: L ≈ M^3.5',
          misconcept: ['H-R도의 색은 별의 나이가 아니라 표면 온도입니다.', '모든 별이 같은 순서로 진화하지 않습니다. 질량이 큰 별은 수명이 짧고 폭발로 끝납니다.'],
          question: ['태양보다 질량이 10배 큰 별의 수명은 대략 몇 배 짧을까요?', 'H-R도에서 백색왜성은 어디에 위치할까요?'],
          sim: 'hr'
        },
        {
          title: '허블-르메트르 법칙과 우주 팽창',
          principle: '멀리 있는 은하일수록 스펙트럼의 선이 더 붉은 쪽으로 치우칩니다(적색편이). 후퇴 속도는 거리에 비례합니다. 이것은 은하가 공간 속을 달려가는 것이 아니라, 은하 사이의 공간 자체가 팽창하기 때문입니다.',
          formula: 'v = H₀ d · H₀ ≈ 70 km/s/Mpc · z = (λ관측 − λ기준)/λ기준',
          misconcept: ['우주 팽창의 중심이 지구라는 뜻이 아닙니다. 어느 은하에서 보아도 다른 은하가 멀어지는 것처럼 보입니다.', '적색편이는 은하의 나이가 아니라 거리의 지표입니다.'],
          question: ['z = 0.05인 은하의 후퇴 속도는?', '허블 상수를 크게 잡으면 같은 은하의 거리는 어떻게 변할까요?'],
          sim: 'redshift'
        },
        {
          title: '우주 거리 사다리',
          principle: '가까운 거리는 연주시차로, 그보다 먼 거리는 세페이드 변광성의 주기-광도 관계로, 더 먼 은하는 적색편이로 잽니다. 각 방법은 다음 단계의 기준을 세우는 사다리처럼 이어집니다.',
          formula: '세페이드: 주기 P가 길수록 광도 L이 큼 · 거리지수 m − M = 5 log₁₀(d/10pc)',
          misconcept: ['한 가지 방법으로 우주의 모든 거리를 잴 수는 없습니다. 각 방법은 유효한 거리 범위가 있습니다.', '세페이드의 주기-광도 관계는 1908년 헨리에타 리비트가 발견했습니다.'],
          question: ['세페이드가 왜 표준 광원(standard candle)으로 쓰일까요?', '거리지수로 거리를 구하는 과정을 설명해 보세요.']
        }
      ]
    },
    college: {
      label: '대학 심화', icon: '🧪', sub: '천문학 개론·관측 — 물리 법칙으로 별과 행성을 읽는 단계',
      units: [
        {
          title: '플랑크 흑체복사와 빈의 법칙',
          principle: '별은 거의 완벽한 흑체에 가깝게 복사합니다. 복사 에너지 분포는 플랑크 함수를 따르며, 온도가 높을수록 총복사량은 T⁴에 비례해 커지고 최대 파장은 짧아집니다.',
          formula: 'Bλ(T) = 2hc²/λ⁵ · 1/(e^(hc/λkT) − 1) · λmax = 2.898×10⁻³/T m',
          misconcept: ['별의 색만 보고 온도를 정확히 알 수는 없습니다. 성간 먼지에 의한 적색화(reddening)를 보정해야 합니다.', '흑체복사 곡선의 높이는 온도가 높을수록 모든 파장에서 커지지만, 최대 지점의 파장은 짧아집니다.'],
          question: ['표면 온도 3,000K인 별의 최대 복사 파장은?', '태양의 최대 복사 파장이 가시광인 이유를 계산해 보세요.'],
          sim: 'planck'
        },
        {
          title: '외계행성 트랜짓 광도곡선',
          principle: '행성이 별 앞을 지나면 별빛이 (Rp/Rs)² 만큼 줄어듭니다. 광도곡선의 깊이로 행성 크기를, 지속 시간과 주기로 궤도 크기를, 모양으로 충돌 계수 b를 구합니다.',
          formula: '깊이 = (Rp/Rs)² · 지속 시간 ≈ P/π · arcsin(√((1+k)²−b²)/(a/Rs))',
          misconcept: ['트랜짓이 관측되는 것은 행성 궤도가 시선 방향과 거의 일치할 때뿐입니다.', '광도 감소 폭이 작아도 행성이 작다는 뜻일 뿐, 질량을 바로 알 수는 없습니다.'],
          question: ['깊이 1%인 트랜짓에서 행성 반지름은 별의 몇 배인가요?', '충돌 계수 b가 커지면 식 지속 시간은 어떻게 변할까요?'],
          sim: 'transit'
        },
        {
          title: '시선속도법과 도플러 효과',
          principle: '행성이 별을 끌어당기면 별도 질량중심 둘레를 작은 원으로 돕니다. 별의 시선 속도 변화는 스펙트럼 선의 도플러 이동으로 나타나며, 그 진폭 K로 행성의 최소 질량을 구합니다.',
          formula: 'K = 28.43 m/s · (Mp sin i / MJ) · (a/AU)^−1/2 · (Ms/Msun)^−1/2',
          misconcept: ['시선속도법은 sin i를 모르기 때문에 질량의 최솟값만 줍니다.', '진폭이 크다고 반드시 무거운 행성은 아닙니다. 주기가 짧으면 더 작은 행성도 큰 신호를 만듭니다.'],
          question: ['지구가 태양을 흔드는 시선속도 진폭은 약 얼마일까요?', '이심률이 커지면 시선속도 곡선 모양은 어떻게 변할까요?'],
          sim: 'rv'
        },
        {
          title: '분광 관측과 별의 물리량',
          principle: '스펙트럼의 흡수선으로 표면 온도·중력·화학 조성을 읽습니다. 분광형 OBAFGKM은 온도 순서이며, 주계열성의 질량-광도 관계와 함께 쓰면 별의 반지름과 진화 단계를 추정할 수 있습니다.',
          formula: '분광형 O > B > A > F > G > K > M (뜨거움 → 차가움) · R = √L / (T/5772)²',
          misconcept: ['분광형 순서는 알파벳 순서가 아니라 온도 순서입니다.', '같은 분광형이라도 광도 계급(주계열·거성·초거성)이 다르면 반지름이 크게 다릅니다.'],
          question: ['분광형 G2V인 태양의 V는 무엇을 뜻할까요?', '흡수선 폭이 넓어지는 것은 무엇을 의미할까요?']
        }
      ]
    }
  };

  /* ======================================================================
     천문학사 타임라인
     ====================================================================== */
  var HISTORY = [
    { era: 'cosmic', when: '138억 년 전', title: '빅뱅 — 시간과 공간의 시작', text: '우주는 뜨겁고 빽빽한 한 점에서 시작해 팽창했습니다. 오늘 관측되는 은하의 후퇴와 우주배경복사가 이 시작을 가리킵니다.', tags: ['플랑크 시대', '팽창'] },
    { era: 'cosmic', when: '138억 년 전 + 38만 년', title: '우주배경복사가 처음 빛을 냈습니다', text: '전자가 원자핵과 결합해 빛이 자유롭게 날아다닐 수 있게 되었습니다. 이 빛이 오늘 2.7K의 마이크로파로 온 하늘을 채웁니다.', tags: ['재결합', 'CMB'] },
    { era: 'cosmic', when: '138억 년 전 + 1~2억 년', title: '최초의 별과 은하', text: '수소와 헬륨이 뭉쳐 첫 별이 켜졌습니다. 제임스 웹은 이 시기의 희미한 은하를 적외선으로 찾아내고 있습니다.', tags: ['우주 최초의 별', 'JWST'] },
    { era: 'cosmic', when: '46억 년 전', title: '태양계의 탄생', text: '성간 가스와 먼지 구름이 중력으로 수축해 태양과 행성이 되었습니다. 태양계에서 가장 오래된 운석의 나이가 약 45.7억 년입니다.', tags: ['태양계', '원시행성계'] },
    { era: 'ancient', when: '기원전 3000년~', title: '하늘을 기록한 첫 문명들', text: '메소포타미아·이집트·중국에서 일식과 행성의 움직임을 기록했습니다. 하늘은 농사와 달력의 기준이었습니다.', tags: ['고대 천문학'] },
    { era: 'ancient', when: '기원전 7세기', title: '바빌로니아의 행성 기록', text: '점토판에 행성의 위치와 주기를 체계적으로 남겼습니다. 이후 그리스 천문학의 자료가 되었습니다.', tags: ['바빌로니아'] },
    { era: 'ancient', when: '기원전 3세기', title: '에라토스테네스, 지구 둘레를 재다', text: '두 도시의 태양 그림자 각도 차이로 지구 둘레를 계산했습니다. 실제 값과 몇 % 안쪽으로 맞았습니다.', tags: ['지구 둘레'] },
    { era: 'ancient', when: '2세기', title: '프톨레마이오스의 《알마게스트》', text: '지구를 중심에 두고 주전원으로 행성의 역행을 설명했습니다. 1,400년 동안 서양 천문학의 교과서였습니다.', tags: ['지구중심설'] },
    { era: 'ancient', when: '1054년', title: '게성운을 만든 초신성', text: '낮에도 보인 밝은 별이 폭발했습니다. 그 잔해가 오늘의 게성운이며, 중심에는 초당 30번 도는 펄서가 있습니다.', tags: ['초신성', 'M1'] },
    { era: 'modern', when: '1543년', title: '코페르니쿠스, 태양을 중심에 놓다', text: '《천구의 회전에 관하여》에서 지구가 아니라 태양이 중심에서 우주를 이끈다고 주장했습니다. 행성의 역행이 자연스럽게 설명됐습니다.', tags: ['태양중심설'] },
    { era: 'modern', when: '1609~1619년', title: '케플러의 세 가지 법칙', text: '화성의 관측 기록을 분석해 타원 궤도, 면적 속도 일정, 주기-장반경 관계를 밝혔습니다.', tags: ['케플러'] },
    { era: 'modern', when: '1610년', title: '갈릴레이, 목성의 위성을 보다', text: '갈릴레이가 망원경을 하늘로 돌려 목성 곁의 위성 4개와 달의 산, 금성의 위상을 확인했습니다.', tags: ['갈릴레이', '망원경'] },
    { era: 'modern', when: '1687년', title: '뉴턴의 《프린키피아》', text: '만유인력과 운동 법칙으로 행성의 궤도와 조석, 달의 운동을 하나의 원리로 설명했습니다.', tags: ['만유인력'] },
    { era: 'modern', when: '1781년', title: '허셜, 천왕성을 발견하다', text: '망원경으로 처음 발견된 행성입니다. 태양계의 크기가 갑자기 두 배로 넓어졌습니다.', tags: ['천왕성'] },
    { era: 'modern', when: '1814년', title: '프라운호퍼의 스펙트럼 연구', text: '태양빛을 프리즘으로 나누어 흡수선을 기록했습니다. 별의 색과 성분을 재는 분광 천문학의 출발점입니다.', tags: ['분광학'] },
    { era: 'modern', when: '1908년', title: '리비트, 세페이드의 주기-광도 관계', text: '변광성의 밝기 변화 주기가 길수록 실제 밝기가 크다는 것을 발견했습니다. 우주 거리를 재는 자가 생겼습니다.', tags: ['세페이드'] },
    { era: 'modern', when: '1915년', title: '아인슈타인의 일반상대성이론', text: '중력을 시공간의 휘어짐으로 설명했습니다. 이후 중력렌즈, 블랙홀, 중력파의 이론적 토대가 되었습니다.', tags: ['일반상대성'] },
    { era: 'modern', when: '1924~1929년', title: '허블, 우주가 팽창함을 보이다', text: '안드로메다가 우리은하 밖에 있음을 밝히고, 은하의 후퇴 속도가 거리에 비례함을 보였습니다.', tags: ['허블', '팽창'] },
    { era: 'modern', when: '1965년', title: '펜지어스와 윌슨, 우주배경복사를 찾다', text: '설명되지 않는 잡음이 온 하늘에서 똑같이 들어오는 것을 발견했습니다. 빅뱅의 결정적 증거였습니다.', tags: ['CMB'] },
    { era: 'modern', when: '1969년', title: '아폴로 11호, 사람이 달에 서다', text: '인류가 처음으로 다른 천체의 표면을 밟았습니다. 달의 암석은 태양계 초기의 기록을 담고 있었습니다.', tags: ['아폴로'] },
    { era: 'modern', when: '1977년', title: '보이저 1·2호의 대여행', text: '목성·토성·천왕성·해왕성을 지나 성간공간으로 나아갔습니다. 보이저 1호는 2026년 11월 인류 물체로 처음 1광일 거리를 넘었습니다.', tags: ['보이저', '성간공간'] },
    { era: 'modern', when: '1990년', title: '허블 우주망원경 발사', text: '대기 위 560km 궤도에서 우주를 관측하며 은하의 나이와 팽창률을 정밀하게 쟀습니다.', tags: ['허블'] },
    { era: 'modern', when: '1995년', title: '첫 외계행성, 51 Pegasi b', text: '태양 같은 별을 도는 행성이 처음 확인되었습니다. 이후 30년 만에 확정 행성은 6,000개를 넘었습니다.', tags: ['외계행성'] },
    { era: 'modern', when: '2015년', title: 'LIGO, 중력파를 처음 검출', text: '두 블랙홀이 합쳐질 때 생긴 시공간의 물결을 지구에서 감지했습니다. 중력을 보는 새로운 창이 열렸습니다.', tags: ['중력파'] },
    { era: 'modern', when: '2019년', title: '사건의 지평선 망원경, 블랙홀을 찍다', text: '지구 크기의 가상 망원경으로 M87 은하 중심 블랙홀의 그림자를 촬영했습니다.', tags: ['EHT', '블랙홀'] },
    { era: 'modern', when: '2022년', title: '제임스 웹, 첫 이미지를 공개하다', text: '6.5m 거울과 적외선으로 우주 최초의 은하와 별이 태어나는 구름을 관측합니다. 지구에서 150만 km 떨어진 L2에 있습니다.', tags: ['JWST'] },
    { era: 'today', when: '2026년', title: '지금 이 순간의 천문학', text: '확정 외계행성 6,473개, 보이저 1호의 1광일 거리, TESS·케플러의 계속되는 발견, 그리고 한국천문연구원(KASI)의 관측 자료까지 — 이 사이트의 데이터도 그 기록 위에 서 있습니다.', tags: ['오늘', 'KASI'] }
  ];

  var ERA_LABEL = { cosmic: '🌌 우주 초기', ancient: '🏺 고대·중세', modern: '🔭 근대·현대', today: '✨ 오늘' };

  /* ======================================================================
     화면 만들기
     ====================================================================== */
  function buildCurriculum(root) {
    var levels = ['elementary', 'middle', 'high', 'college'];
    var currentLevel = 'elementary';
    root.innerHTML =
      '<div class="learn-levels" role="tablist" aria-label="교육 단계"></div>' +
      '<div class="learn-level-note" id="learnLevelNote"></div>' +
      '<div class="learn-units" id="learnUnits"></div>';

    var chips = $('.learn-levels', root);
    levels.forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip learn-level' + (k === currentLevel ? ' is-active' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('data-level', k);
      b.innerHTML = '<span aria-hidden="true">' + CURRICULUM[k].icon + '</span> ' + CURRICULUM[k].label;
      chips.appendChild(b);
    });

    function renderLevel(key) {
      currentLevel = key;
      $$('.learn-level', chips).forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-level') === key);
        b.setAttribute('aria-selected', String(b.getAttribute('data-level') === key));
      });
      var data = CURRICULUM[key];
      $('#learnLevelNote').textContent = data.sub;
      var units = $('#learnUnits');
      units.innerHTML = '';
      data.units.forEach(function (u, i) {
        var card = document.createElement('article');
        card.className = 'learn-unit';
        var simHost = u.sim ? '<div class="learn-sim-host" data-sim-host="' + u.sim + '"></div>' : '';
        card.innerHTML =
          '<button type="button" class="learn-unit-head" aria-expanded="' + (i === 0 ? 'true' : 'false') + '">' +
          '<span class="lu-num">' + (i + 1) + '</span>' +
          '<span class="lu-title">' + esc(u.title) + '</span>' +
          '<span class="lu-chev" aria-hidden="true">⌄</span></button>' +
          '<div class="learn-unit-body"' + (i === 0 ? '' : ' hidden') + '>' +
          '<div class="lu-block"><h5>원리</h5><p>' + esc(u.principle) + '</p></div>' +
          '<div class="lu-block lu-formula"><h5>핵심 수식 · 비례 관계</h5><code>' + esc(u.formula) + '</code></div>' +
          '<div class="lu-grid">' +
          '<div class="lu-block"><h5>자주 하는 오개념</h5><ul>' + u.misconcept.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div>' +
          '<div class="lu-block"><h5>탐구 질문</h5><ul>' + u.question.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div>' +
          '</div>' + simHost + '</div>';
        units.appendChild(card);
        var head = $('.learn-unit-head', card);
        head.addEventListener('click', function () {
          var body = $('.learn-unit-body', card);
          var open = body.hidden;
          body.hidden = !open;
          head.setAttribute('aria-expanded', String(open));
          card.classList.toggle('is-open', open);
          if (open && u.sim) ensureSim(u.sim);
        });
        card.classList.toggle('is-open', i === 0);
      });
      if (data.units[0] && data.units[0].sim) ensureSim(data.units[0].sim);
    }

    function ensureSim(key) {
      var host = $('[data-sim-host="' + key + '"]');
      if (!host || host.getAttribute('data-made')) return;
      host.setAttribute('data-made', '1');
      if (key === 'moon') simMoon(host);
      else if (key === 'seasons') simSeasons(host);
      else if (key === 'parallax') simParallax(host);
      else if (key === 'kepler') simKepler(host);
      else if (key === 'hr') simHR(host);
      else if (key === 'redshift') simRedshift(host);
      else if (key === 'planck') simPlanck(host);
      else if (key === 'transit') simTransit(host);
      else if (key === 'rv') simRV(host);
    }

    chips.addEventListener('click', function (e) {
      var b = e.target.closest('.learn-level');
      if (!b) return;
      renderLevel(b.getAttribute('data-level'));
    });
    renderLevel(currentLevel);
  }

  function buildHistory(root) {
    root.innerHTML =
      '<div class="learn-eras chip-row" role="group" aria-label="시대 선택">' +
      '<button class="chip is-active" data-era="">전체</button>' +
      Object.keys(ERA_LABEL).map(function (k) {
        return '<button class="chip" data-era="' + k + '">' + ERA_LABEL[k] + '</button>';
      }).join('') + '</div>' +
      '<div class="timeline" id="historyTimeline"></div>';

    function render(era) {
      var list = HISTORY.filter(function (h) { return !era || h.era === era; });
      $('#historyTimeline').innerHTML = list.map(function (h, i) {
        return '<article class="tl-item" data-era="' + h.era + '">' +
          '<div class="tl-dot" aria-hidden="true"></div>' +
          '<div class="tl-body">' +
          '<div class="tl-meta"><span class="tl-era">' + ERA_LABEL[h.era] + '</span><span class="tl-when">' + esc(h.when) + '</span></div>' +
          '<h4>' + esc(h.title) + '</h4><p>' + esc(h.text) + '</p>' +
          '<div class="tl-tags">' + h.tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' +
          '</div></article>';
      }).join('');
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-era]');
      if (!b) return;
      $$('.chip', root).forEach(function (x) { x.classList.toggle('is-active', x === b); });
      render(b.getAttribute('data-era'));
    });
    render('');
  }

  /* ======================================================================
     탭 · 시작
     ====================================================================== */
  function initTabs() {
    var tabs = $$('.learn-tab');
    if (!tabs.length) return;
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        var key = t.getAttribute('data-learn-tab');
        tabs.forEach(function (x) {
          var on = x === t;
          x.classList.toggle('is-active', on);
          x.setAttribute('aria-selected', String(on));
        });
        $('#learnCurriculum').hidden = key !== 'curriculum';
        $('#learnHistory').hidden = key !== 'history';
      });
    });
  }

  function init() {
    var cur = $('#learnCurriculumBody');
    var his = $('#learnHistoryBody');
    if (cur) buildCurriculum(cur);
    if (his) buildHistory(his);
    initTabs();
    window.dispatchEvent(new Event('resize'));
  }

  window.Learn = { init: init, sims: SIMS };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
