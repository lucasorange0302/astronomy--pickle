/* =========================================================================
   learn.js — 🎓 천문 학습관 (2026-11-27)
   · 탭 1: 교육과정 · 단계별 실험실 (초등 → 중등 → 고등(공통과학·지구과학) → 대학 심화)
     - 단원별 원리·핵심 수식·오개념·탐구 질문
     - 직접 조작하는 캔버스 실험 10종
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
    var controls = (cfg.controls || []).filter(function (c) { return !c.cycle; }).map(function (c) {
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
    // 한 바퀴 도는 값(계절·달·공전 위치)은 직선 슬라이더 대신 원형 다이얼로 만집니다.
    var dials = (cfg.controls || []).filter(function (c) { return c.cycle; }).map(function (c) {
      return '<div class="sim-ctrl is-dial">' +
        '<span class="sim-ctrl-label">' + esc(c.label) +
        (c.sub ? '<small class="sim-ctrl-sub">' + esc(c.sub) + '</small>' : '') + '</span>' +
        '<div class="sim-dial" data-dial="' + c.k + '"></div>' +
        '<output class="sim-ctrl-val" data-out="' + c.k + '"></output></div>';
    }).join('');
    wrap.innerHTML =
      '<div class="sim-head"><h4>' + esc(cfg.title) + '</h4>' +
      (buttons ? '<div class="sim-btns">' + buttons + '</div>' : '') + '</div>' +
      '<div class="sim-canvas"><canvas aria-label="' + esc(cfg.title) + ' 실험 그림"></canvas></div>' +
      '<div class="sim-readout" aria-live="polite"></div>' +
      (dials ? '<div class="sim-dial-grid">' + dials + '</div>' : '') +
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
      if (S[c.k] == null) S[c.k] = +c.value;
      var out = $('[data-out="' + c.k + '"]', wrap);
      function sync() {
        if (out) out.textContent = c.fmt ? c.fmt(S[c.k]) : S[c.k];
      }
      if (c.cycle) {
        var dhost = $('[data-dial="' + c.k + '"]', wrap);
        sync();
        if (dhost && window.Dial) {
          c._dial = window.Dial.create(dhost, {
            min: c.min, max: c.max, step: c.step || 1,
            value: S[c.k], size: c.size || 126,
            label: c.label, fmt: c.fmt, sub: c.sub,
            onChange: function (v) { S[c.k] = v; sync(); render(); },
            onCommit: function () { sync(); render(); }
          });
        }
        c._sync = sync;
        return;
      }
      var input = $('input[data-k="' + c.k + '"]', wrap);
      if (input) {
        input.value = S[c.k];
        input.addEventListener('input', function () {
          S[c.k] = +input.value;
          sync();
          render();
        });
      }
      sync();
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
      var W = Math.max(200, Math.round(rect.width));
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
          if (c._dial) c._dial.set(S[c.k]);
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
          if (c._dial) c._dial.set(c.value);
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
  /** 긴 안내 문구가 캔버스 밖으로 잘리지 않도록 폭에 맞춰 글자를 줄입니다. */
  function labelFit(ctx, text, x, y, color, size, maxW, align) {
    var s = size || 11;
    var fam = 'px "Pretendard", system-ui, sans-serif';
    var lim = Math.max(60, (maxW || 280) - 8);
    ctx.font = s + fam;
    while (s > 8 && ctx.measureText(text).width > lim) {
      s -= 0.5;
      ctx.font = s + fam;
    }
    label(ctx, text, x, y, color, s, align);
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
     실험 1 — 달의 위상과 일·월식 (초등)
        삭망월 29.53일, 달 궤도 기울기 → 황위 β = i · sin(교점에서의 각)
     ====================================================================== */
  var SYNODIC = 29.530589;

  function simMoon(host) {
    createSim(host, {
      id: 'moon', title: '🌙 달의 위상과 일·월식', height: 300,
      controls: [
        { k: 'day', label: '삭망 주기', min: 0, max: 29.5, step: 0.1, value: 7.4, cycle: true, sub: '삭망월 29.53일', fmt: function (v) { return v.toFixed(1) + '일'; } },
        { k: 'tilt', label: '달 궤도 기울기', min: 0, max: 8, step: 0.145, value: 5.1, fmt: function (v) { return v.toFixed(2) + '°'; } }
      ],
      buttons: [{ k: 'play', label: '▶ 재생' }, { k: 'reset', label: '초기화' }],
      state: { orbit: 0, node: 18 },
      tick: function (S, dt) {
        S.day = (S.day + dt * 2.2) % 29.5;
        return true;
      },
      draw: function (ctx, W, H, S, T) {
        var node = S.node;                         // 이번 달 교점과 태양 방향의 각(도)
        var cx = W * 0.29, cy = H * 0.40, R = Math.min(W * 0.23, 92);
        // 태양빛 (왼쪽에서)
        label(ctx, '☀ 태양빛', 10, 16, T.accent, 12, 'left');
        for (var i = 0; i < 3; i++) arrow(ctx, 14, 38 + i * 15, cx - R - 20, 38 + i * 15, 'rgba(255,212,121,0.30)', 1);
        // 궤도
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
        // 지구
        circle(ctx, cx, cy, 13, T.accent3, null);
        label(ctx, '지구', cx, cy + 27, T.muted, 11);
        // 달 위치: day 0 = 태양 쪽(왼쪽)
        var ang = Math.PI + (S.day / SYNODIC) * Math.PI * 2;
        var u = (S.day / SYNODIC) * 360 + node;      // 교점에서 잰 각
        var beta = S.tilt * Math.sin(u * Math.PI / 180);
        var mx = cx + Math.cos(ang) * R, my = cy + Math.sin(ang) * R * 0.9;
        // 황도면(수평 기준선)
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(cx - R - 18, cy); ctx.lineTo(cx + R + 18, cy); ctx.stroke();
        ctx.setLineDash([]);
        label(ctx, '황도면', cx + R + 16, cy - 6, T.faint, 9, 'right');
        // 달 (기울기만큼 화면 위아래로)
        var dy = beta * 2.4;
        if (Math.abs(dy) > 1) {
          // 황도면 위로 떠 있는 달 — 기준 위치는 흐린 원, 실제 달은 그 위
          circle(ctx, mx, my, 9, 'rgba(207,214,228,0.22)', null);
          ctx.strokeStyle = 'rgba(126,224,192,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, my - dy); ctx.stroke(); ctx.setLineDash([]);
          circle(ctx, mx, my - dy, 9, '#cfd6e4', null);
          label(ctx, '위 ' + Math.abs(beta).toFixed(1) + '°', mx, my - dy - 17, T.accent2, 9);
        } else {
          circle(ctx, mx, my, 9, '#cfd6e4', null);
        }
        // 빛을 받는 쪽(왼쪽) 표시
        ctx.fillStyle = 'rgba(16,18,26,0.70)';
        ctx.beginPath(); ctx.arc(mx, my - dy, 9, -Math.PI / 2, Math.PI / 2, false); ctx.fill();
        // 그림자: 삭 무렵에만 지구 쪽으로
        var elong = (S.day / SYNODIC) * 360;
        var nearNew = elong < 13 || elong > 347;
        var nearFull = Math.abs(elong - 180) < 13;
        if (nearNew || nearFull) {
          var k8 = 13 / 1.5;                        // 1.5° = 지구 반지름(그리기 배율)
          var off = beta * k8;
          var hit = Math.abs(beta) < 1.5;
          ctx.strokeStyle = hit ? 'rgba(255,212,121,0.85)' : 'rgba(255,255,255,0.28)';
          ctx.lineWidth = hit ? 2 : 1.2;
          ctx.setLineDash(hit ? [] : [4, 4]);
          ctx.beginPath();
          ctx.moveTo(mx + (nearNew ? 6 : -6), my - dy);
          ctx.lineTo(cx + (nearNew ? 0 : 0) + 26, cy - off);
          ctx.stroke(); ctx.setLineDash([]);
          label(ctx, hit ? '그림자가 지구를 맞음 → 식' : '그림자가 빗나감 (β ' + Math.abs(beta).toFixed(1) + '° > 1.5°)',
            cx + 4, cy + 34, hit ? T.accent : T.muted, 9.5, 'left');
        }
        // 지구에서 본 모양
        var vx = W * 0.73, vy = H * 0.36, vr = Math.min(W * 0.14, 58);
        var k = (1 - Math.cos(S.day / SYNODIC * Math.PI * 2)) / 2;
        var waxing = S.day < 14.75;
        label(ctx, '지구에서 본 모양', vx, vy - vr - 16, T.text, 11.5);
        circle(ctx, vx, vy, vr, '#0a0f1c', T.grid);
        ctx.save();
        ctx.beginPath(); ctx.arc(vx, vy, vr, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = '#e8e4d6';
        var rx = Math.abs(1 - 2 * k) * vr;
        if (k > 0.001) {
          ctx.beginPath();
          if (waxing) {
            ctx.arc(vx, vy, vr, -Math.PI / 2, Math.PI / 2, false);
            ctx.ellipse(vx, vy, Math.max(0.01, rx), vr, 0, Math.PI / 2, -Math.PI / 2, k > 0.5);
          } else {
            ctx.arc(vx, vy, vr, Math.PI / 2, -Math.PI / 2, false);
            ctx.ellipse(vx, vy, Math.max(0.01, rx), vr, 0, -Math.PI / 2, Math.PI / 2, k > 0.5);
          }
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        circle(ctx, vx, vy, vr, null, T.grid);
        var names = ['삭(신월)', '초승달', '상현달', '차오르는 달', '보름달', '기우는 달', '하현달', '그믐달'];
        var idx = Math.round((S.day / 29.5) * 8) % 8;
        label(ctx, names[idx], vx, vy + vr + 18, T.accent2, 12.5);
        // 아래 안내
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(8, H - 44, W - 16, 36);
        labelFit(ctx, '기울기 0° → 매달 식 · 5.1° → 교점 근처에서만 (이번 달 교점은 태양에서 ' + node + '°)',
          14, H - 26, S.tilt < 5 ? T.accent : T.muted, 10.5, W - 24, 'left');
      },
      readout: function (S) {
        var k = (1 - Math.cos(S.day / SYNODIC * Math.PI * 2)) / 2;
        var elong = (S.day / SYNODIC) * 360;
        var phase = (180 - elong + 360) % 360;      // 태양–달–지구 각(위상각): 삭에서 180°
        var u = (S.day / SYNODIC) * 360 + (S.node || 18);
        var beta = S.tilt * Math.sin(u * Math.PI / 180);
        return [
          ['삭망 주기', '삭에서 ' + S.day.toFixed(1) + '일 지남 · 29.53일 주기'],
          ['지구에서 보이는 밝은 비율', Math.round(k * 100) + '%'],
          ['위상각(태양–달–지구)', phase.toFixed(0) + '°'],
          ['달의 황위 β', beta.toFixed(2) + '°'],
          ['한 달(삭망월)', '29.53일']
        ];
      },
      hint: '달은 스스로 빛나지 않고 태양빛을 반사합니다. 지구에서 보는 각도가 달라지면서 밝은 부분의 모양이 바뀝니다. 달 궤도가 기울어져 있어 그림자가 지구를 빗나가는 달이 훨씬 많고, 교점 근처에서 기울기가 작을 때만 식이 일어납니다.'
    });
  }

  /* ======================================================================
     실험 2 — 계절과 태양 고도
        태양 적위는 월 중순의 황경으로 계산: δ = asin(sin ε · sin λ)
        오른쪽 그림은 위도에 따른 하루 태양 고도 곡선(낮 길이·정오 고도)
     ====================================================================== */
  var MONTH_DAY = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

  /** 그 달 15일의 태양 적위(도) — ε = 23.4393°, λ = 0 은 춘분(3월 20일경) */
  function solarDec(month) {
    var day = MONTH_DAY[Math.max(1, Math.min(12, month)) - 1] + 15;
    var lam = (day - 80) / 365.2422 * 2 * Math.PI;
    var e = 23.4393 * Math.PI / 180;
    return Math.asin(Math.sin(e) * Math.sin(lam)) * 180 / Math.PI;
  }
  /** 태양 고도(도) — 시각 t(시), 위도 lat, 적위 dec */
  function sunAlt(t, lat, dec) {
    var H = (t - 12) * 15 * Math.PI / 180;
    var p = lat * Math.PI / 180, d = dec * Math.PI / 180;
    var s = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H);
    return Math.asin(Math.max(-1, Math.min(1, s))) * 180 / Math.PI;
  }
  /** 낮 길이(시간). cos H0 = −tan φ tan δ */
  function dayLength(lat, dec) {
    var p = lat * Math.PI / 180, d = dec * Math.PI / 180;
    var c = -Math.tan(p) * Math.tan(d);
    if (c <= -1) return 24;
    if (c >= 1) return 0;
    return Math.acos(c) / Math.PI * 24;
  }

  function simSeasons(host) {
    createSim(host, {
      id: 'seasons', title: '🌍 계절은 지구의 기울기 때문에 생깁니다', height: 312,
      controls: [
        { k: 'month', label: '지구의 공전 위치', min: 1, max: 12, step: 1, value: 6, cycle: true, sub: '12개월', fmt: function (v) { return v + '월'; } },
        { k: 'lat', label: '관측 위도', min: -66, max: 66, step: 1, value: 37, fmt: function (v) { return (v >= 0 ? '북위 ' : '남위 ') + Math.abs(v) + '°'; } }
      ],
      draw: function (ctx, W, H, S, T) {
        var dec = solarDec(S.month);
        // ---------- 왼쪽: 공전 궤도와 자전축
        var cx = W * 0.21, cy = H * 0.33;
        circle(ctx, cx, cy, 17, T.accent, null);
        label(ctx, '태양', cx, cy + 30, T.muted, 10.5);
        var R = Math.min(W * 0.17, H * 0.23);
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.52, 0, 0, Math.PI * 2); ctx.stroke();
        var ang = Math.PI + ((S.month - 1) / 12) * Math.PI * 2;
        var ex = cx + Math.cos(ang) * R, ey = cy + Math.sin(ang) * R * 0.52;
        var tilt = 23.44 * Math.PI / 180;
        var ax = Math.sin(tilt) * 16, ay = -Math.cos(tilt) * 16;
        ctx.strokeStyle = T.text; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(ex - ax, ey - ay); ctx.lineTo(ex + ax, ey + ay); ctx.stroke();
        circle(ctx, ex + ax, ey + ay, 2.6, T.accent3, null);
        circle(ctx, ex, ey, 10, T.accent3, null);
        label(ctx, S.month + '월', ex, ey + 24, T.text, 11, 'center');
        labelFit(ctx, '자전축은 23.44° 기울어진 채 방향 일정', 6, H * 0.90, T.muted, 10, W * 0.46, 'left');

        // ---------- 오른쪽: 그 위도에서 하루 동안의 태양 고도
        var bx = W * 0.50, bw = W * 0.47, by = H * 0.12, bh = H * 0.66;
        function px(t) { return bx + t / 24 * bw; }
        function py(a) { return by + bh - (a + 30) / 120 * bh; }
        // 밤 영역(고도 0 아래)
        ctx.fillStyle = 'rgba(10,16,30,0.55)';
        ctx.fillRect(bx, py(0), bw, bh - (py(0) - by));
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
        [0, 30, 60, 90].forEach(function (a) {
          ctx.beginPath(); ctx.moveTo(bx, py(a)); ctx.lineTo(bx + bw, py(a)); ctx.stroke();
          label(ctx, a + '°', bx - 4, py(a), T.faint, 8.5, 'right');
        });
        [0, 6, 12, 18, 24].forEach(function (t) {
          label(ctx, t + '시', Math.max(bx + 8, Math.min(bx + bw - 8, px(t))), by + bh + 12, T.faint, 8.5);
        });
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(bx, py(0)); ctx.lineTo(bx + bw, py(0)); ctx.stroke();
        label(ctx, '지평선', bx + bw - 2, py(0) - 5, T.faint, 8.5, 'right');
        // 태양 고도 곡선
        ctx.strokeStyle = T.accent; ctx.lineWidth = 2;
        ctx.beginPath();
        var started = false;
        for (var t = 0; t <= 24.001; t += 0.25) {
          var a = sunAlt(t, S.lat, dec);
          var y = py(Math.max(-30, a));
          if (!started) { ctx.moveTo(px(t), y); started = true; } else ctx.lineTo(px(t), y);
        }
        ctx.stroke();
        // 정오 표시
        var noon = sunAlt(12, S.lat, dec);
        ctx.strokeStyle = 'rgba(255,212,121,0.35)'; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(px(12), py(0)); ctx.lineTo(px(12), py(noon)); ctx.stroke();
        ctx.setLineDash([]);
        circle(ctx, px(12), py(noon), 5, T.accent, null);
        label(ctx, '정오 ' + Math.round(noon) + '°', px(12), py(noon) - 12, T.text, 10);
        // 낮 길이
        var dl = dayLength(S.lat, dec);
        var dlTxt = dl >= 24 ? '백야 (24시간)' : dl <= 0 ? '극야 (0시간)' :
          Math.floor(dl) + '시간 ' + Math.round((dl % 1) * 60) + '분';
        label(ctx, '낮 ' + dlTxt, bx + bw / 2, by - 10, T.accent2, 10.5, 'center');
        label(ctx, (S.lat >= 0 ? '북위 ' : '남위 ') + Math.abs(S.lat) + '°에서 본 태양의 하루', bx + bw / 2, by + bh + 26, T.muted, 9.5);
      },
      readout: function (S) {
        var dec = solarDec(S.month);
        var dl = dayLength(S.lat, dec);
        var alt = 90 - Math.abs(S.lat - dec);
        var season;
        if (S.lat >= 0) season = dec > 15 ? '북반구 여름' : dec < -15 ? '북반구 겨울' : (S.month >= 4 && S.month <= 8 ? '북반구 봄~여름 사이' : '북반구 가을~겨울 사이');
        else season = dec > 15 ? '남반구 겨울' : dec < -15 ? '남반구 여름' : (S.month >= 4 && S.month <= 8 ? '남반구 가을~겨울 사이' : '남반구 봄~여름 사이');
        return [
          ['태양 적위', (dec >= 0 ? '+' : '') + dec.toFixed(1) + '°'],
          ['정오 태양 고도', Math.round(alt) + '°'],
          ['낮 길이', dl >= 24 ? '24시간 (백야)' : dl <= 0 ? '0시간 (극야)' : Math.floor(dl) + '시간 ' + Math.round((dl % 1) * 60) + '분'],
          ['계절', season]
        ];
      },
      hint: '계절이 생기는 까닭은 지구와 태양 사이 거리가 아니라 자전축의 기울기입니다. 축이 기울어 태양빛이 비스듬히 들어오는 곳은 같은 빛을 넓게 받아 덜 데워집니다. 위도를 바꾸면 정오 고도와 낮 길이가 함께 달라집니다.'
    });
  }

  /* ======================================================================
     실험 3 — 연주시차 (중학교 '별과 우주')
        6개월 사이 지구 이동 = 2 AU, 별에서 두 시선이 만드는 각 = 2p
     ====================================================================== */
  function simParallax(host) {
    createSim(host, {
      id: 'parallax', title: '📐 연주시차로 별까지 거리 재기', height: 356,
      controls: [
        { k: 'dpc', label: '별까지 거리', min: 0.2, max: 10, step: 0.05, value: 1.3, fmt: function (v) { return v.toFixed(2) + ' pc'; } },
        { k: 'month', label: '지구의 공전 위치', min: 0, max: 12, step: 0.5, value: 0, cycle: true, sub: '1년 12개월', fmt: function (v) {
          if (v === 0 || v === 12) return '1월';
          if (v === 6) return '7월';
          return (v < 6 ? '1월+' : '7월+') + Math.abs(v - (v < 6 ? 0 : 6)).toFixed(1) + '개월';
        } }
      ],
      buttons: [{ k: 'play', label: '▶ 6개월 이동' }, { k: 'reset', label: '1월로' }],
      tick: function (S, dt) {
        S.month = (S.month + dt * 3) % 12;
        return true;
      },
      draw: function (ctx, W, H, S, T) {
        var p = 1 / S.dpc;                            // 각초
        var cx = W * 0.24, cy = H * 0.40, R = Math.min(W * 0.15, 62);
        circle(ctx, cx, cy, R, null, T.grid);
        circle(ctx, cx, cy, 10, T.accent, null);
        label(ctx, '태양', cx, cy + 22, T.muted, 10.5);
        var a = (S.month / 12) * Math.PI * 2;
        var ex = cx + Math.cos(a) * R, ey = cy + Math.sin(a) * R;
        var a2 = a + Math.PI;
        var e2x = cx + Math.cos(a2) * R, e2y = cy + Math.sin(a2) * R;
        // 기선 2 AU
        ctx.strokeStyle = 'rgba(126,224,192,0.55)'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(e2x, e2y); ctx.stroke(); ctx.setLineDash([]);
        label(ctx, '6개월 사이 이동 = 2 AU', cx, cy + R + 30, T.accent2, 9.5);
        circle(ctx, e2x, e2y, 5, 'rgba(138,182,255,0.40)', null);
        circle(ctx, ex, ey, 7, T.accent3, null);
        label(ctx, '지구', ex, ey - 14, T.accent3, 9.5);

        // 별
        var sx = W * 0.60 + Math.log10(S.dpc / 0.2) * (W * 0.09);
        var sy = H * 0.40;
        // 배경 별
        var seed = 7;
        function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
        for (var i = 0; i < 24; i++) {
          var bxp = W * 0.50 + rnd() * W * 0.46, byp = 30 + rnd() * (H * 0.52);
          if (Math.abs(bxp - sx) < 16 && Math.abs(byp - sy) < 16) continue;
          circle(ctx, bxp, byp, 1.3, 'rgba(200,210,230,0.55)', null);
        }
        star(ctx, sx, sy, 9, T.accent);
        label(ctx, '가까운 별', sx + 12, sy - 12, T.accent, 10.5, 'left');
        // 두 시선
        arrow(ctx, ex, ey, sx, sy, 'rgba(126,224,192,0.75)', 1.2);
        arrow(ctx, e2x, e2y, sx, sy, 'rgba(255,212,121,0.55)', 1.2);
        // 별에서의 각 2p
        var a1 = Math.atan2(ey - sy, ex - sx), a2b = Math.atan2(e2y - sy, e2x - sx);
        var r0 = 52;
        ctx.strokeStyle = T.accent2; ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(sx, sy, r0, a1, a2b, false);
        ctx.stroke();
        label(ctx, '2p = ' + (2 * p).toFixed(2) + '″', sx - 26, sy + r0 + 12, T.accent2, 10.5);
        label(ctx, '(과장)', sx - 26, sy + r0 + 24, T.faint, 8.5);

        // 망원경 시야: 배경에 대한 별의 이동
        var vx = W * 0.20, vy = H - 54, vr = 36;
        circle(ctx, vx, vy, vr, 'rgba(5,10,20,0.75)', T.grid);
        ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(vx - vr, vy); ctx.lineTo(vx + vr, vy);
        ctx.moveTo(vx, vy - vr); ctx.lineTo(vx, vy + vr); ctx.stroke();
        var shiftX = Math.cos(a) * vr * 0.55, shiftY = -Math.sin(a) * vr * 0.55;
        circle(ctx, vx - shiftX / 2, vy - shiftY / 2, 2.4, 'rgba(255,212,121,0.45)', null);
        circle(ctx, vx + shiftX / 2, vy + shiftY / 2, 3.2, T.accent, null);
        labelFit(ctx, '6개월 간격으로 본 별의 위치(과장)', W * 0.24, vy + vr + 14, T.faint, 8.5, W * 0.40);

        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(8, 6, W - 16, 34);
        labelFit(ctx, '지구가 6개월 동안 2 AU 움직여 생기는 시선 차이의 절반이 p입니다',
          W / 2, 18, T.muted, 10, W - 20);
        labelFit(ctx, 'd[pc] = 1 / p[″] · 1 pc = 3.26광년 = 206,265 AU', W / 2, 32, T.accent, 10, W - 24);
      },
      readout: function (S) {
        var p = 1 / S.dpc;
        return [
          ['연주시차 p', p.toFixed(2) + '″ (각초)'],
          ['거리 d = 1 / p', S.dpc.toFixed(2) + ' pc (파섹)'],
          ['광년으로', (S.dpc * 3.26156).toFixed(2) + '광년'],
          ['관측된 시선 이동', (2 * p).toFixed(2) + '″ (6개월 사이, 2p)'],
          ['1 pc의 정의', '1 AU를 1″로 보는 거리 = 206,265 AU = 3.26광년']
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
      id: 'kepler', title: '🪐 케플러 3법칙 — 궤도와 공전 주기', height: 300,
      controls: [
        { k: 'a', label: '궤도 장반경 a', min: 0.3, max: 40, step: 0.1, value: 1, fmt: function (v) { return v.toFixed(1) + ' AU'; } },
        { k: 'e', label: '이심률 e', min: 0, max: 0.85, step: 0.01, value: 0.25, fmt: function (v) { return v.toFixed(2); } },
        { k: 'Mdeg', label: '공전 위치', min: 0, max: 360, step: 2, value: 30, cycle: true, sub: '한 바퀴 = 한 공전', fmt: function (v) { return Math.round(v) + '°'; } }
      ],
      buttons: [{ k: 'play', label: '▶ 재생' }, { k: 'reset', label: '초기화' }],
      state: { Mdeg: 30 },
      tick: function (S, dt) {
        var T = Math.pow(S.a, 1.5);
        S.Mdeg = (S.Mdeg + dt * 360 / Math.max(0.2, T * 0.35)) % 360;
        return true;
      },
      draw: function (ctx, W, H, S, T) {
        var cx = W / 2, cy = H / 2;
        var A = Math.min(W * 0.40, H * 0.40) * (0.55 + 0.45 * Math.min(1, Math.log10(S.a + 1) / 1.6));
        var b = A * Math.sqrt(1 - S.e * S.e);
        var c = A * S.e;
        // 궤도
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(cx, cy, A, b, 0, 0, Math.PI * 2); ctx.stroke();
        // 태양(초점)
        circle(ctx, cx - c, cy, 9, T.accent, null);
        label(ctx, '태양(초점)', cx - c, cy - 18, T.accent, 10);
        // 행성
        var E = solveKepler(S.Mdeg * Math.PI / 180, S.e);
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
        labelFit(ctx, '케플러 1법칙: 행성은 태양을 한 초점으로 하는 타원 궤도를 돕니다.', W / 2, 21, T.muted, 11, W - 24);
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
        질량–광도: M<0.43 → L=0.23M^2.3 / M<2 → L=M^4 / M≥2 → L=1.4M^3.5
        반지름: R = M^0.8 (M<1), M^0.6 (M≥1) → T = 5772 (L/R²)^0.25
     ====================================================================== */
  function msModel(M) {
    var L = M < 0.43 ? 0.23 * Math.pow(M, 2.3) : (M < 2 ? Math.pow(M, 4) : 1.4 * Math.pow(M, 3.5));
    var R = M < 1 ? Math.pow(M, 0.8) : Math.pow(M, 0.6);
    var T = 5772 * Math.pow(L / (R * R), 0.25);
    return { L: L, R: R, T: T, life: 1e10 * Math.pow(M, -2.5) };
  }
  function lifeText(yr) {
    if (yr >= 1e12) return (yr / 1e12).toFixed(1) + '조 년';
    if (yr >= 1e8) return Math.round(yr / 1e8) + '억 년';
    return (yr / 1e6).toFixed(0) + '백만 년';
  }

  function simHR(host) {
    createSim(host, {
      id: 'hr', title: '⭐ H-R도 — 별의 밝기와 표면 온도', height: 366,
      controls: [
        { k: 'mass', label: '별의 질량', min: 0.1, max: 30, step: 0.1, value: 1, fmt: function (v) { return v.toFixed(1) + ' × 태양'; } }
      ],
      draw: function (ctx, W, H, S, T) {
        var L0 = 46, R1 = W - 14, TOP = 26, BOT = H - 36;
        var x0 = L0, x1 = R1, y0 = TOP, y1 = BOT;
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.stroke();
        var temps = [30000, 10000, 6000, 3000];
        temps.forEach(function (t) {
          var x = x0 + (Math.log10(40000 / t) / Math.log10(40000 / 2500)) * (x1 - x0);
          ctx.strokeStyle = 'rgba(255,255,255,0.07)';
          ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
          label(ctx, (t / 1000) + 'k', x, y1 + 12, T.faint, 9.5);
        });
        label(ctx, '표면 온도 (K) — 왼쪽이 뜨겁습니다', (x0 + x1) / 2, H - 12, T.muted, 10.5);
        [1e-3, 1, 1e3, 1e6].forEach(function (l) {
          var y = y1 - (Math.log10(l) + 4) / 10 * (y1 - y0);
          ctx.strokeStyle = 'rgba(255,255,255,0.07)';
          ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
          label(ctx, l === 1 ? '1' : (l === 1e-3 ? '10⁻³' : l === 1e3 ? '10³' : '10⁶'), x0 - 6, y, T.faint, 9, 'right');
        });
        label(ctx, '광도 (태양=1)', x0 + 2, y0 - 10, T.muted, 9.5, 'left');

        function pos(Tk, Lg) {
          var x = x0 + (Math.log10(40000 / Math.max(2500, Tk)) / Math.log10(40000 / 2500)) * (x1 - x0);
          var y = y1 - (Math.log10(Math.max(1e-4, Lg)) + 4) / 10 * (y1 - y0);
          return { x: x, y: y };
        }
        // 주계열
        ctx.strokeStyle = 'rgba(255,212,121,0.55)'; ctx.lineWidth = 3;
        ctx.beginPath();
        var first = true;
        for (var m = 0.08; m <= 40; m *= 1.1) {
          var md = msModel(m);
          var q = pos(md.T, md.L);
          if (first) { ctx.moveTo(q.x, q.y); first = false; } else ctx.lineTo(q.x, q.y);
        }
        ctx.stroke();
        // 거성·백색왜성 무리
        ctx.fillStyle = 'rgba(255,140,90,0.35)';
        for (var i = 0; i < 26; i++) {
          var gx = x0 + 0.50 * (x1 - x0) + (i % 7) * 9, gy = y0 + 0.14 * (y1 - y0) + Math.floor(i / 7) * 10;
          ctx.beginPath(); ctx.arc(gx, gy, 3, 0, 6.28); ctx.fill();
        }
        label(ctx, '거성 · 초거성', x0 + 0.56 * (x1 - x0), y0 + 0.08 * (y1 - y0), 'rgba(255,150,110,0.9)', 9.5);
        ctx.fillStyle = 'rgba(140,200,255,0.35)';
        for (var j = 0; j < 12; j++) {
          var wx = x0 + 0.22 * (x1 - x0) + (j % 6) * 9, wy = y1 - 0.13 * (y1 - y0) + Math.floor(j / 6) * -10;
          ctx.beginPath(); ctx.arc(wx, wy, 2.4, 0, 6.28); ctx.fill();
        }
        label(ctx, '백색왜성', x0 + 0.30 * (x1 - x0), y1 - 0.26 * (y1 - y0), 'rgba(150,205,255,0.9)', 9.5);
        label(ctx, '주계열', x0 + 0.30 * (x1 - x0), y1 - 0.62 * (y1 - y0), T.accent, 10.5);

        var md2 = msModel(S.mass);
        var p2 = pos(md2.T, md2.L);
        circle(ctx, p2.x, p2.y, 8, 'rgba(126,224,192,0.25)', T.accent2);
        circle(ctx, p2.x, p2.y, 3.4, T.accent2, null);
        var tag = S.mass < 0.5 ? '적색왜성' : S.mass < 1.5 ? '태양형' : S.mass < 4 ? '청색 주계열성' : '거대 청색별';
        label(ctx, tag, p2.x, p2.y - 14, T.accent2, 10);
      },
      readout: function (S) {
        var md = msModel(S.mass);
        return [
          ['광도', nf(md.L, 3) + ' × 태양'],
          ['표면 온도', nf(md.T, 0) + ' K'],
          ['반지름', nf(md.R, 2) + ' × 태양'],
          ['주계열 수명', lifeText(md.life)]
        ];
      },
      hint: '주계열성은 질량이 클수록 훨씬 밝고 뜨겁습니다(L ≈ M^3.5). 그래서 수명은 짧습니다. 별의 위치를 바꾸면 광도·온도·반지름이 함께 어떻게 변하는지 보세요.'
    });
  }

  /* ======================================================================
     실험 6 — 적색편이와 허블-르메트르 법칙
        v ≈ cz (작은 z), 거리는 평탄 ΛCDM(Ωm 0.3, ΩΛ 0.7, H₀ 70)로 계산
     ====================================================================== */
  var C_KMS = 299792.458;
  function comovingMpc(z) {
    var N = 160, s = 0;
    function E(zz) { return Math.sqrt(0.3 * Math.pow(1 + zz, 3) + 0.7); }
    for (var i = 0; i < N; i++) {
      var z1 = z * i / N, z2 = z * (i + 1) / N;
      s += (1 / E(z1) + 1 / E(z2)) / 2 * (z2 - z1);
    }
    return 4282.749 * s;                 // c / H₀ (H₀ = 70 km/s/Mpc)
  }
  function redshiftInfo(z) {
    var v = z < 0.3 ? z * C_KMS : C_KMS * ((1 + z) * (1 + z) - 1) / ((1 + z) * (1 + z) + 1);
    var dL = (1 + z) * comovingMpc(z);
    return { v: v, dMpc: dL };
  }

  function simRedshift(host) {
    createSim(host, {
      id: 'redshift', title: '🌈 적색편이와 허블-르메트르 법칙', height: 268,
      controls: [
        { k: 'z', label: '적색편이 z', min: 0, max: 1, step: 0.005, value: 0.05, fmt: function (v) { return v.toFixed(3); } }
      ],
      draw: function (ctx, W, H, S, T) {
        var x0 = 22, x1 = W - 22, y = H * 0.40;
        var NM0 = 400, NM1 = 1400;
        function px(nm) { return x0 + (nm - NM0) / (NM1 - NM0) * (x1 - x0); }
        // 스펙트럼 띠 (가시광 400~700 만 색으로, 그 밖은 회색)
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(px(700), y - 22, px(NM1) - px(700), 44);
        var grad = ctx.createLinearGradient(px(400), 0, px(700), 0);
        grad.addColorStop(0, '#4b1f8a'); grad.addColorStop(0.22, '#2244cc');
        grad.addColorStop(0.42, '#22bbdd'); grad.addColorStop(0.55, '#44dd77');
        grad.addColorStop(0.68, '#dde033'); grad.addColorStop(0.84, '#e08a22'); grad.addColorStop(1, '#b02a1a');
        ctx.fillStyle = grad; ctx.fillRect(px(400), y - 22, px(700) - px(400), 44);
        label(ctx, '가시광', (px(400) + px(700)) / 2, y - 30, T.faint, 9);
        label(ctx, '적외선', (px(700) + px(NM1)) / 2, y - 30, T.faint, 9);
        [400, 700, 1000, 1400].forEach(function (nm) {
          label(ctx, nm + 'nm', px(nm), y + 32, T.faint, 8.5);
        });
        // 수소 발머선: 기준선(검정) → 관측선(흰색)
        [434, 486, 656].forEach(function (nm) {
          ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(px(nm), y - 22); ctx.lineTo(px(nm), y + 22); ctx.stroke();
          var obs = nm * (1 + S.z);
          if (obs <= NM1) {
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(px(obs), y - 22); ctx.lineTo(px(obs), y + 22); ctx.stroke();
            if (S.z > 0.06) {
              ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
              ctx.beginPath(); ctx.moveTo(px(nm) + 2, y - 26); ctx.lineTo(px(obs) - 2, y - 26); ctx.stroke(); ctx.setLineDash([]);
            }
          }
        });
        label(ctx, '검은 선 = 실험실 기준선(수소)', x0, y - 44, T.muted, 10, 'left');
        label(ctx, '흰 선 = 관측된 선 (오른쪽으로 이동 = 적색편이)', x0 + 4, y + 46, T.text, 10, 'left');
        // 거리·속도
        var info = redshiftInfo(S.z);
        label(ctx, 'z = ' + S.z.toFixed(3) + '   ·   후퇴 속도 ≈ ' + nf(info.v, 0) + ' km/s',
          W / 2, H - 34, T.accent2, 11.5);
        label(ctx, '거리 ≈ ' + nf(info.dMpc, 0) + ' Mpc = ' + nf(info.dMpc * 3.2616 / 100, 1) + '억 광년',
          W / 2, H - 16, T.text, 11);
      },
      readout: function (S) {
        var info = redshiftInfo(S.z);
        return [
          ['적색편이 z', S.z.toFixed(3)],
          ['후퇴 속도 (v ≈ cz)', nf(info.v, 0) + ' km/s'],
          ['거리 (평탄 ΛCDM)', nf(info.dMpc, 0) + ' Mpc = ' + nf(info.dMpc * 3.2616 / 100, 1) + '억 광년'],
          ['수소 발머선 Hα', '656.3nm → ' + nf(656.3 * (1 + S.z), 1) + 'nm'],
          ['작은 z에서', 'v/H₀ ≈ ' + nf(info.v / 70, 0) + ' Mpc (허블 법칙 근사)']
        ];
      },
      hint: '멀리 있는 은하일수록 스펙트럼 선이 더 붉은 쪽으로 치우칩니다. 허블-르메트르 법칙 v = H₀d 는 우주가 팽창한다는 가장 직접적인 증거입니다. 가까운 은하에서는 v/H₀ 로 거리를 어림할 수 있습니다.'
    });
  }

  /* ======================================================================
     실험 7 — 플랑크 흑체복사
        Bλ(T) = 2hc²/λ⁵ · 1/(e^(hc/λkT) − 1), 최대 파장 λmax = 2.898×10⁻³/T
     ====================================================================== */
  function planck(lambdaNm, Tk) {
    var l = lambdaNm * 1e-9;
    var h = 6.62607015e-34, c = 2.99792458e8, k = 1.380649e-23;
    return (2 * h * c * c) / (Math.pow(l, 5) * (Math.exp(h * c / (l * k * Tk)) - 1));
  }

  function simPlanck(host) {
    createSim(host, {
      id: 'planck', title: '🔥 플랑크 흑체복사 곡선', height: 324,
      controls: [
        { k: 'temp', label: '별의 표면 온도', min: 1000, max: 30000, step: 100, value: 5772, fmt: function (v) { return nf(v, 0) + ' K'; } }
      ],
      draw: function (ctx, W, H, S, T) {
        var L = 48, R = W - 14, TOP = 24, BOT = H - 36;
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(L, BOT); ctx.lineTo(R, BOT); ctx.moveTo(L, TOP); ctx.lineTo(L, BOT); ctx.stroke();
        var peakNm = 2.898e6 / S.temp;
        var maxL = Math.max(900, peakNm * 2.3);
        if (maxL > 20000) maxL = 20000;
        function px(nm) { return L + nm / maxL * (R - L); }
        var peakB = planck(peakNm, S.temp);
        function py(b) { return BOT - (b / peakB) * (BOT - TOP) * 0.94; }
        // 가시광 영역
        if (px(750) > L) {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(px(380), TOP, Math.max(0, px(750) - px(380)), BOT - TOP);
          label(ctx, '가시광', (px(380) + px(750)) / 2, TOP + 10, T.faint, 9);
        }
        // 곡선
        ctx.strokeStyle = T.accent; ctx.lineWidth = 2.4; ctx.beginPath();
        var started = false;
        for (var i = 0; i <= 220; i++) {
          var nm = 5 + (maxL - 5) * i / 220;
          var b = planck(nm, S.temp);
          if (!started) { ctx.moveTo(px(nm), py(b)); started = true; } else ctx.lineTo(px(nm), py(b));
        }
        ctx.lineTo(px(maxL), BOT); ctx.lineTo(px(5), BOT); ctx.closePath();
        ctx.fillStyle = 'rgba(255,212,121,0.10)'; ctx.fill();
        ctx.strokeStyle = T.accent; ctx.lineWidth = 2.4; ctx.beginPath();
        started = false;
        for (var j = 0; j <= 220; j++) {
          var nm2 = 5 + (maxL - 5) * j / 220;
          if (!started) { ctx.moveTo(px(nm2), py(planck(nm2, S.temp))); started = true; }
          else ctx.lineTo(px(nm2), py(planck(nm2, S.temp)));
        }
        ctx.stroke();
        // 최대 파장
        var pk = px(peakNm);
        ctx.strokeStyle = T.accent2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(pk, TOP); ctx.lineTo(pk, BOT); ctx.stroke(); ctx.setLineDash([]);
        label(ctx, '최대 ' + nf(peakNm, 0) + 'nm', pk + 6, TOP + 34, T.accent2, 10, 'left');
        label(ctx, '파장 (nm)', (L + R) / 2, H - 12, T.muted, 10.5);
        label(ctx, '복사 세기 (최대값=1)', L + 4, TOP - 10, T.muted, 9.5, 'left');
        var step = maxL / 4, mag = Math.pow(10, Math.floor(Math.log10(step)));
        step = Math.ceil(step / mag) * mag;
        for (var tk = 0; tk <= maxL + 1; tk += step) {
          label(ctx, nf(tk, 0), px(tk), BOT + 12, T.faint, 8.5);
        }
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
      hint: '온도가 높아질수록 곡선 전체가 위로 올라가고(σT⁴), 최대 지점은 짧은 파장 쪽으로 이동합니다(빈의 법칙 λmax = 2.898×10⁶/T nm). 태양(5,772 K)의 최대는 초록빛 근처(502 nm)입니다.'
    });
  }

  /* ======================================================================
     실험 8 — 외계행성 트랜짓
        깊이 = 겹친 면적/πR² (그레이징이면 (Rp/Rs)² 보다 작음)
        지속 = P/π · asin(√((1+k)²−b²)/(a/Rs))
     ====================================================================== */
  function circleOverlap(r1, r2, d) {
    if (d >= r1 + r2) return 0;
    if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) * Math.min(r1, r2);
    var a1 = Math.acos(Math.max(-1, Math.min(1, (d * d + r1 * r1 - r2 * r2) / (2 * d * r1))));
    var a2 = Math.acos(Math.max(-1, Math.min(1, (d * d + r2 * r2 - r1 * r1) / (2 * d * r2))));
    return r1 * r1 * (a1 - Math.sin(2 * a1) / 2) + r2 * r2 * (a2 - Math.sin(2 * a2) / 2);
  }
  function transitGeom(k, b, P) {
    var aRs = 215.032 * Math.pow(P / 365.256, 2 / 3);      // 별 반지름 = 1 R☉ 가정
    var dur = P / Math.PI * Math.asin(Math.min(1, Math.sqrt(Math.pow(1 + k, 2) - b * b) / aRs));
    var depth = circleOverlap(1, k, b) / Math.PI;
    return { aRs: aRs, dur: dur, depth: depth };
  }

  function simTransit(host) {
    createSim(host, {
      id: 'transit', title: '🪐 외계행성 트랜짓 광도곡선', height: 300,
      controls: [
        { k: 'rp', label: '행성/항성 반지름 비 (Rp/Rs)', min: 0.01, max: 0.2, step: 0.005, value: 0.06, fmt: function (v) { return v.toFixed(3); } },
        { k: 'b', label: '충돌 계수 b', min: 0, max: 1, step: 0.01, value: 0.2, fmt: function (v) { return v.toFixed(2); } },
        { k: 'P', label: '공전 주기', min: 1, max: 60, step: 0.5, value: 10, fmt: function (v) { return v.toFixed(1) + '일'; } }
      ],
      draw: function (ctx, W, H, S, T) {
        var g = transitGeom(S.rp, S.b, S.P);
        var L = 46, R = W - 14, TOP = 30, BOT = H - 44;
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(L, BOT); ctx.lineTo(R, BOT); ctx.moveTo(L, TOP); ctx.lineTo(L, BOT); ctx.stroke();
        var win = Math.max(0.01, g.dur * 1.85);            // 보이는 시간 폭(일) — 입출을 함께
        function px(t) { return L + (t + win) / (2 * win) * (R - L); }
        var dipFrac = 0.20 + 0.45 * Math.min(1, Math.max(0, (Math.log10(g.depth) + 5) / (Math.log10(0.04) + 5)));
        var full = TOP + (BOT - TOP) * 0.12;
        function py(flux) { return full + (1 - flux) / Math.max(g.depth, 1e-9) * (BOT - TOP) * dipFrac; }
        // 기준선
        ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(L, full); ctx.lineTo(R, full); ctx.stroke(); ctx.setLineDash([]);
        label(ctx, '광도 100%', L + 4, full - 8, T.faint, 9, 'left');
        // 곡선
        ctx.strokeStyle = T.accent3; ctx.lineWidth = 2.2; ctx.beginPath();
        for (var i = 0; i <= 240; i++) {
          var t = -win + 2 * win * i / 240;
          var x = g.aRs * Math.sin(2 * Math.PI * t / S.P);
          var sep = Math.sqrt(S.b * S.b + x * x);
          var flux = 1 - circleOverlap(1, S.rp, sep) / Math.PI;
          var y = py(flux);
          if (i) ctx.lineTo(px(t), y); else ctx.moveTo(px(t), y);
        }
        ctx.stroke();
        // 깊이 표시
        ctx.strokeStyle = 'rgba(255,122,110,0.6)'; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(px(0), full); ctx.lineTo(px(0), py(1 - g.depth)); ctx.stroke(); ctx.setLineDash([]);
        label(ctx, '−' + nf(g.depth * 100, 3) + '%', px(0) + 6, (full + py(1 - g.depth)) / 2 + 3, T.danger, 10, 'left');
        label(ctx, '시간 (공전 위상)', (L + R) / 2, H - 12, T.muted, 10.5);
        label(ctx, '세로 과장(로그 눈금)', L + 4, TOP - 10, T.muted, 9, 'left');
        label(ctx, '식 ' + nf(g.dur * 24, 1) + '시간', R - 4, TOP - 10, T.accent2, 10, 'right');
      },
      readout: function (S) {
        var g = transitGeom(S.rp, S.b, S.P);
        return [
          ['광도 감소 깊이', nf(g.depth * 100, 3) + '% (' + nf(g.depth * 1e6, 0) + ' ppm)'],
          ['(Rp/Rs)² 근사값', nf(S.rp * S.rp * 100, 3) + '%'],
          ['식 지속 시간', nf(g.dur * 24, 2) + '시간'],
          ['행성 반지름', nf(S.rp * 696340 / 6371, 1) + ' × 지구 (태양형 별 기준)'],
          ['공전 주기', nf(S.P, 1) + '일']
        ];
      },
      hint: '행성이 별 앞을 지나면 별빛이 아주 조금 줄어듭니다. 감소 폭은 (Rp/Rs)², 지속 시간은 궤도 크기와 경로에 따라 달라집니다. 충돌 계수 b가 커지면(스치듯 지나면) 깊이가 얕아지고 지속 시간도 짧아집니다. 케플러·TESS가 이 방법으로 수천 개의 행성을 찾았습니다.'
    });
  }

  /* ======================================================================
     실험 9 — 시선속도법
        v_r = K[cos(ν+ω) + e cos ω],  K = 28.4329 m/s · (Mp/MJ)(P/yr)^(−1/3)(M_star/M☉)^(−2/3)/√(1−e²)
     ====================================================================== */
  function keplerNu(Mrad, e) {
    var E = Mrad;
    for (var i = 0; i < 8; i++) E = E - (E - e * Math.sin(E) - Mrad) / (1 - e * Math.cos(E));
    return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  }
  function rvK(mp, P, e) {
    var a = Math.pow(P / 365.256, 2 / 3);
    return 28.4329 * mp * Math.pow(a, -0.5) / Math.sqrt(1 - e * e);
  }

  function simRV(host) {
    createSim(host, {
      id: 'rv', title: '📈 시선속도법 — 별이 흔들리는 정도', height: 320,
      controls: [
        { k: 'mp', label: '행성 질량', min: 0.05, max: 10, step: 0.05, value: 1, fmt: function (v) { return v.toFixed(2) + ' × 목성'; } },
        { k: 'P', label: '공전 주기', min: 1, max: 1000, step: 1, value: 365, fmt: function (v) { return v.toFixed(0) + '일'; } },
        { k: 'e', label: '이심률', min: 0, max: 0.8, step: 0.01, value: 0.05, fmt: function (v) { return v.toFixed(2); } }
      ],
      draw: function (ctx, W, H, S, T) {
        var a = Math.pow(S.P / 365.256, 2 / 3);
        var K = rvK(S.mp, S.P, S.e);
        var L = 46, R = W - 16, TOP = 30, BOT = H - 40;
        var mid = (TOP + BOT) / 2;
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(L, mid); ctx.lineTo(R, mid); ctx.moveTo(L, TOP); ctx.lineTo(L, BOT); ctx.stroke();
        // ±K 눈금
        ctx.strokeStyle = 'rgba(126,224,192,0.28)'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(L, TOP + 8); ctx.lineTo(R, TOP + 8);
        ctx.moveTo(L, BOT - 8); ctx.lineTo(R, BOT - 8); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = T.accent2; ctx.lineWidth = 2.2; ctx.beginPath();
        var N = 240;
        for (var i = 0; i <= N; i++) {
          var ph = i / N;
          var Mrad = ph * Math.PI * 2;
          var nu = keplerNu(Mrad, S.e);
          var rv = -K * Math.sin(nu);          // ω = 90°
          var x = L + ph * (R - L);
          var y = mid - rv / Math.max(K, 1e-6) * (BOT - TOP) / 2 * 0.92;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
        label(ctx, '+' + nf(K, nf(K, 1) < 1 ? 2 : 1) + ' m/s', R - 2, TOP + 14, T.accent2, 10, 'right');
        label(ctx, '−' + nf(K, nf(K, 1) < 1 ? 2 : 1) + ' m/s', R - 2, BOT - 2, T.accent2, 10, 'right');
        label(ctx, '0', L - 6, mid + 3, T.faint, 9, 'right');
        label(ctx, '한 공전 주기 (' + nf(S.P, 0) + '일) →', (L + R) / 2, H - 12, T.muted, 10.5);
        label(ctx, '별의 시선속도 (도플러 이동)', L + 4, TOP - 10, T.muted, 9.5, 'left');
      },
      readout: function (S) {
        var a = Math.pow(S.P / 365.256, 2 / 3);
        var K = rvK(S.mp, S.P, S.e);
        return [
          ['시선속도 반진폭 K', nf(K, K < 1 ? 3 : 1) + ' m/s'],
          ['궤도 장반경 a', nf(a, 3) + ' AU'],
          ['행성 최소 질량 (M sin i)', nf(S.mp, 2) + ' × 목성 = ' + nf(S.mp * 317.8, 1) + ' × 지구'],
          ['도플러 이동 Δλ/λ', '≈ ' + (K / 299792458).toExponential(1)]
        ];
      },
      hint: '행성이 별을 끌어당기면 별도 질량중심 둘레를 작은 원으로 돕니다. 별빛의 스펙트럼 선이 주기적으로 움직이는 것을 재면 행성의 질량과 궤도를 알 수 있습니다. 지구를 도는 태양의 흔들림은 약 0.09 m/s로, 현재 기술의 한계에 가깝습니다.'
    });
  }

  /* ======================================================================
     실험 10 — 성운의 수축과 태양계·지구의 형성 (고등 공통과학)
     ====================================================================== */
  function simNebula(host) {
    createSim(host, {
      id: 'nebula', title: '☁️ 성운의 수축 — 태양계와 지구의 형성', height: 340,
      controls: [
        { k: 't', label: '형성 단계', min: 0, max: 100, step: 1, value: 18, fmt: function (v) { return v + '%'; } },
        { k: 'spin', label: '성운의 회전', min: 0, max: 2, step: 0.1, value: 1, fmt: function (v) { return v === 0 ? '거의 없음' : v.toFixed(1) + '배'; } }
      ],
      buttons: [{ k: 'play', label: '▶ 재생' }, { k: 'reset', label: '초기화' }],
      state: { _hold: 0 },
      onPlay: function (S) { S._hold = 0; if (S.t >= 99.5) S.t = 0; },
      tick: function (S, dt) {
        S.t = Math.min(100, S.t + dt * 15);
        if (S.t >= 100) { S._hold = (S._hold || 0) + 1; if (S._hold > 1) return false; }
        return true;
      },
      draw: function (ctx, W, H, S, T) {
        var t = S.t / 100;
        var cx = W * 0.5, cy = H * 0.47;
        var Rmax = Math.min(W * 0.40, (H - 96) * 0.74);
        var flat = 0.30;                                  // 원반을 비스듬히 본 정도
        var vscale = 1 - 0.96 * Math.pow(t, 1.25);        // 구름(두꺼움) → 원반(얇음)

        // 원반 궤도 안내선
        ctx.strokeStyle = 'rgba(138,182,255,0.10)'; ctx.lineWidth = 1;
        for (var k = 1; k <= 3; k++) {
          ctx.beginPath();
          ctx.ellipse(cx, cy, Rmax * k / 3, Rmax * k / 3 * flat, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // 성간 가스·먼지 입자 (고정 난수 → 매 프레임 같은 배치)
        var seed = 2026;
        function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
        var N = 190;
        for (var i = 0; i < N; i++) {
          var rf = 0.26 + 0.74 * Math.pow(rnd(), 0.8);
          var phi0 = rnd() * Math.PI * 2;
          var z0 = rnd() * 2 - 1;
          var rr = Rmax * rf * (1 - 0.26 * t * (1 - rf));
          var ang = phi0 + S.spin * t * 2.6 / Math.pow(rf, 0.5);
          var x = cx + Math.cos(ang) * rr;
          var y = cy + Math.sin(ang) * rr * flat + z0 * Rmax * 0.52 * vscale;
          var al = 0.16 + 0.44 * rnd();
          circle(ctx, x, y, 0.8 + 1.5 * rnd(), 'rgba(200,220,255,' + al.toFixed(2) + ')', null);
        }

        // 원시 태양 — 수축할수록 밝고 커짐
        var sr = 4 + 24 * Math.pow(t, 2);
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr * 2.6);
        g.addColorStop(0, 'rgba(255,236,170,' + (0.55 + 0.4 * t).toFixed(2) + ')');
        g.addColorStop(0.45, 'rgba(255,190,90,' + (0.22 + 0.28 * t).toFixed(2) + ')');
        g.addColorStop(1, 'rgba(255,150,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, sr * 2.6, 0, Math.PI * 2); ctx.fill();
        circle(ctx, cx, cy, sr, T.accent, null);
        if (t > 0.82) label(ctx, '원시 태양', cx, cy - sr - 12, T.accent, 11);

        // 미행성 충돌 → 원시 행성
        if (t > 0.48) {
          var pf = Math.min(1, (t - 0.48) / 0.42);
          var planets = [
            { r: 0.34, s: 1.7, c: '#c9a27a' }, { r: 0.44, s: 3.0, c: '#e3c58c' },
            { r: 0.55, s: 3.2, c: '#6fa8ff' }, { r: 0.65, s: 2.1, c: '#d97757' },
            { r: 0.80, s: 6.4, c: '#d8b48a' }, { r: 0.95, s: 5.4, c: '#e6d3a3' }
          ];
          planets.forEach(function (p, idx) {
            var a = idx * 1.1 + S.spin * t * 2.2 / Math.pow(p.r, 0.5);
            var px = cx + Math.cos(a) * Rmax * p.r;
            var py = cy + Math.sin(a) * Rmax * p.r * flat;
            circle(ctx, px, py, p.s * pf, p.c, 'rgba(0,0,0,0.35)');
          });
        }

        // 각운동량(회전) 표시
        if (S.spin > 0.05 && t > 0.05) {
          var ax = Rmax * 1.06;
          ctx.strokeStyle = 'rgba(126,224,192,0.55)'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.ellipse(cx, cy, ax, ax * flat, 0, -0.9, 0.9); ctx.stroke();
          arrow(ctx, cx + ax * Math.cos(0.9), cy + ax * flat * Math.sin(0.9) - 2,
            cx + ax * Math.cos(1.15), cy + ax * flat * Math.sin(1.15) + 2, 'rgba(126,224,192,0.75)', 1.3);
          label(ctx, '회전', cx + ax * 0.72, cy + ax * flat * 0.78 + 12, T.accent2, 10);
        }

        // 아래 설명 띠
        var note = t < 0.16
          ? '차갑고 밀도 높은 성간 분자운이 중력으로 스스로 무너집니다.'
          : t < 0.46
            ? '각운동량 보존 → 회전이 빨라지고 원심력 때문에 납작한 원반이 됩니다.'
            : t < 0.80
              ? '원반의 미행성(수 km)이 충돌·합체하며 원시 행성이 자랍니다.'
              : '중심은 핵융합이 점화된 원시 태양, 원반은 원시 행성으로 나뉩니다.';
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(8, H - 44, W - 16, 36);
        labelFit(ctx, note, 16, H - 26, t > 0.46 ? T.accent : T.muted, 11, W - 32, 'left');
        label(ctx, '안쪽 = 암석·금속 행성 · 바깥 = 얼음·가스 행성', W - 16, H - 58, T.faint, 9.5, 'right');
      },
      readout: function (S) {
        var t = S.t / 100;
        var stage = t < 0.16 ? '① 성간 분자운의 수축'
          : t < 0.46 ? '② 회전하는 원반의 형성'
            : t < 0.80 ? '③ 미행성 충돌·합체'
              : '④ 원시 태양 + 원시 행성';
        return [
          ['형성 단계', stage],
          ['원반 편평도 (두께 : 지름)', '1 : ' + nf(1 / Math.max(0.04, 1 - 0.96 * Math.pow(t, 1.25)), 0)],
          ['중심으로 모인 질량', nf(Math.min(99.8, 99.8 * Math.pow(t, 0.35)), 1) + '% (태양계 전체 대비)'],
          ['중심 온도', nf(1000 + 1.57e7 * Math.pow(t, 6), 0) + ' K']
        ];
      },
      hint: '성운설: 회전하는 성간 가스·먼지 구름이 중력으로 수축하면 각운동량 보존 때문에 회전이 빨라지고 납작한 원반이 됩니다. 원반 안쪽은 뜨거워 암석·금속만 응축되고 바깥은 얼음까지 응축되어 암석 행성과 가스 행성으로 나뉩니다. 미행성이 충돌해 원시 행성이 자라고, 원시 지구는 충돌 에너지와 방사성 붕괴열로 녹아 철·니켈 핵과 규산염 맨틀로 분화했습니다.'
    });
  }

  /* ======================================================================
     실험 11 — 중학교 심화: 달의 위상과 일식·월식 (삭망월·항성월·교점·사로스)
        β = i · sin(교점에서의 각), 일식 한계 |β| < 1.5°, 월식 한계 |β| < 1.0°
     ====================================================================== */
  var SIDEREAL = 27.321661;
  var SAROS_DAY = 6585.321;

  function simMoonMid(host) {
    createSim(host, {
      id: 'moonMid', title: '🌗 달의 위상과 일식·월식 (중학 심화)', height: 316,
      controls: [
        { k: 'syn', label: '삭망월에서의 위치', min: 0, max: 29.5, step: 0.1, value: 2.0, cycle: true, sub: '삭망월 29.53일', fmt: function (v) { return v.toFixed(1) + '일'; } },
        { k: 'inc', label: '달 궤도 경사 i', min: 0, max: 10, step: 0.1, value: 5.1, fmt: function (v) { return v.toFixed(2) + '°'; } },
        { k: 'node', label: '교점과 태양 방향', min: 0, max: 90, step: 1, value: 25, fmt: function (v) { return v + '°'; } }
      ],
      buttons: [{ k: 'node0', label: '교점 맞추기' }, { k: 'reset', label: '초기화' }],
      onButton: function (k, S, render) {
        if (k === 'node0') { S.node = 2; render(); }
      },
      draw: function (ctx, W, H, S, T) {
        var SYN = 29.530589;
        // ---------- 1) 한 달 동안 달의 황위 β
        var x0 = 44, x1 = W - 16, y0 = 34, y1 = 138;
        var lim = Math.max(2, S.inc) * 1.25;
        function px(d) { return x0 + d / SYN * (x1 - x0); }
        function py(b) { return y0 + (lim - b) / (2 * lim) * (y1 - y0); }
        label(ctx, '달의 황위 β', x0 + 2, y0 - 12, T.muted, 9.5, 'left');
        label(ctx, '+' + nf(lim / 1.25, 1) + '°', x0 - 6, y0 + 4, T.faint, 9, 'right');
        label(ctx, '−', x0 - 6, y1 - 2, T.faint, 9, 'right');
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, py(0)); ctx.lineTo(x1, py(0)); ctx.stroke();
        // 식 한계 띠
        ctx.fillStyle = 'rgba(255,212,121,0.11)';
        ctx.fillRect(x0, py(1.5), x1 - x0, py(-1.5) - py(1.5));
        ctx.strokeStyle = 'rgba(255,212,121,0.45)'; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x0, py(1.5)); ctx.lineTo(x1, py(1.5));
        ctx.moveTo(x0, py(-1.5)); ctx.lineTo(x1, py(-1.5)); ctx.stroke(); ctx.setLineDash([]);
        label(ctx, '일식 한계 ±1.5°', x1, py(1.5) - 4, T.accent, 8.5, 'right');
        // β 곡선
        ctx.strokeStyle = T.accent2; ctx.lineWidth = 2; ctx.beginPath();
        for (var i = 0; i <= 120; i++) {
          var d = SYN * i / 120;
          var b = S.inc * Math.sin((d / SYN * 360 + S.node) * Math.PI / 180);
          if (i) ctx.lineTo(px(d), py(b)); else ctx.moveTo(px(d), py(b));
        }
        ctx.stroke();
        // 삭·망
        [[0, '삭'], [14.765, '망'], [SYN, '삭']].forEach(function (m) {
          var xx = px(Math.min(m[0], SYN));
          ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(xx, y0 - 4); ctx.lineTo(xx, y1); ctx.stroke();
          label(ctx, m[1], xx, y1 + 13, T.muted, 9);
        });
        // 현재 위치
        var beta = S.inc * Math.sin((S.syn / SYN * 360 + S.node) * Math.PI / 180);
        circle(ctx, px(S.syn), py(beta), 4.5, T.accent, null);
        var lx = Math.min(x1 - 52, Math.max(x0 + 52, px(S.syn)));
        label(ctx, 'β ' + beta.toFixed(2) + '°', lx, Math.max(y0 + 4, py(beta) - 10), T.accent, 9.5);

        // ---------- 2) 삭망월 vs 항성월
        var ty = 176;
        function tx(d) { return x0 + d / SYN * (x1 - x0); }
        ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(x1, ty); ctx.stroke();
        ctx.strokeStyle = T.accent3; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(tx(SIDEREAL), ty); ctx.stroke();
        ctx.strokeStyle = T.accent; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(tx(SIDEREAL), ty); ctx.lineTo(tx(SYN), ty); ctx.stroke();
        label(ctx, '항성월 27.32일', x0, ty - 9, T.accent3, 9, 'left');
        label(ctx, '삭망월 29.53일', x1, ty - 9, T.accent, 9, 'right');
        label(ctx, '2.21일 더', x1, ty + 16, T.accent, 8.5, 'right');
        labelFit(ctx, '지구가 공전해 태양 방향이 27° 움직이므로 달은 2.21일 더 돌아야 합니다',
          (x0 + x1) / 2, ty + 34, T.muted, 9, x1 - x0);

        // ---------- 3) 이번 달 식 여부
        var bNew = S.inc * Math.sin(S.node * Math.PI / 180);
        var solar = Math.abs(bNew) < 1.5, lunar = Math.abs(bNew) < 1.0;
        var msg = solar && lunar ? '이번 달 삭·망 모두 식이 가능합니다 (경사가 작은 특별한 달)'
          : solar ? '이번 달 삭에서 일식이 가능합니다 (교점 근처)'
            : lunar ? '이번 달 망에서 월식이 가능합니다 (교점 근처)'
              : '이번 달은 삭·망 모두 교점에서 ' + S.node + '° 벗어나 식이 없습니다';
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(10, H - 52, W - 20, 30);
        labelFit(ctx, msg, 16, H - 34, (solar || lunar) ? T.accent : T.muted, 10, W - 24, 'left');
        label(ctx, '사로스 18년 11일 · 개기일식 최대 7분 32초 · 금환일식은 달이 멀 때', 16, H - 8, T.faint, 8.5, 'left');
      },
      readout: function (S) {
        var SYN = 29.530589;
        var beta = S.inc * Math.sin((S.syn / SYN * 360 + S.node) * Math.PI / 180);
        var bNew = S.inc * Math.sin(S.node * Math.PI / 180);
        var sid = S.syn * SIDEREAL / SYN;
        return [
          ['삭망월 경과', S.syn.toFixed(1) + '일 / 29.53일'],
          ['항성월로 환산', sid.toFixed(1) + '일 / 27.32일'],
          ['달의 황위 β', beta.toFixed(2) + '°'],
          ['이번 삭의 식', Math.abs(bNew) < 1.5 ? '일식 가능 (|β| < 1.5°)' : '일식 없음 (|β| = ' + Math.abs(bNew).toFixed(1) + '°)'],
          ['이번 망의 식', Math.abs(bNew) < 1.0 ? '월식 가능 (|β| < 1.0°)' : '월식 없음 (|β| = ' + Math.abs(bNew).toFixed(1) + '°)'],
          ['사로스 주기', '18년 11일 = 6,585.3일']
        ];
      },
      hint: '삭망월(29.53일)이 항성월(27.32일)보다 2.21일 긴 것은 그동안 지구도 공전해 태양 방향이 움직이기 때문입니다. 달 궤도가 5.145° 기울어 있어 삭·망마다 달은 황도면에서 최대 5.1° 벗어나고, 교점 근처에서 |β|가 1.5°(일식)·1.0°(월식)보다 작을 때만 식이 일어납니다.'
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
          principle: '삭(신월)에는 달이 태양 쪽에 있어 보이지 않고, 망(보름달)에는 지구 반대쪽에 있습니다. 일식은 달이 태양을 가리는 현상, 월식은 달이 지구 그림자에 들어가는 현상입니다. 달 궤도가 5.145° 기울어 있어 삭·망마다 달은 황도면에서 최대 5.1° 벗어나고, 교점 근처에서만 식이 일어납니다. 삭망월(29.53일)이 항성월(27.32일)보다 2.21일 긴 것은 그동안 지구가 공전해 태양 방향이 약 27° 움직이기 때문입니다. 같은 식 계열은 사로스 주기 18년 11일(6,585.3일)마다 반복됩니다.',
          formula: '삭망월 29.53일 · 항성월 27.32일 · 경사 i = 5.145° · β = i·sin(교점에서의 각) · 일식 한계 |β| < 1.5° · 월식 한계 |β| < 1.0° · 사로스 6,585.3일',
          misconcept: ['일식은 달이 태양 앞을 지날 때, 월식은 달이 지구 그림자 속으로 들어갈 때 일어납니다.', '보름달마다 월식이 일어나지 않는 이유는 달 궤도가 기울어져 있기 때문입니다.', '삭망월과 항성월을 같은 값으로 쓰면 안 됩니다. 달이 별에 대해 한 바퀴 도는 데는 27.32일, 같은 위상으로 돌아오는 데는 29.53일이 걸립니다.'],
          question: ['일식은 왜 낮에만 볼 수 있나요?', '교점에서 90° 떨어진 달의 β는 얼마이며, 그때 식이 일어날 수 있나요?', '개기일식이 최대 7분 32초를 넘지 못하는 까닭은 무엇일까요?'],
          sim: 'moonMid'
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
      label: '고등(공통과학·지구과학)', icon: '🎓',
      sub: '고등 — 공통과학(통합과학) 천문 영역 4단원 + 지구과학Ⅰ·Ⅱ 4단원',
      groups: [
        {
          key: 'common',
          title: '공통과학(통합과학) · 천문 영역',
          badge: '4단원',
          note: '고등학교 공통과학에서 다루는 우주·별·태양계 — 증거와 원리 중심',
          units: [
            {
              title: '우주의 시작과 빅뱅 우주론',
              principle: '우주는 약 138억 년 전 아주 뜨겁고 빽빽한 상태에서 팽창을 시작했습니다(빅뱅). 멀리 있는 은하일수록 스펙트럼의 선이 더 붉은 쪽으로 치우치고(적색편이) 후퇴 속도가 거리에 비례한다는 허블-르메트르 법칙은 우주가 팽창한다는 직접 증거입니다. 팽창하며 식은 초기 우주가 남긴 빛이 우주배경복사(현재 2.725K)이고, 그 흑체 스펙트럼과 10만 분의 1 수준의 온도 요동이 빅뱅 우주론을 결정적으로 뒷받침합니다. 빅뱅 후 약 3분 동안의 원소 합성으로 수소와 헬륨이 질량비 약 3 : 1로 만들어졌고, 이는 오늘날 별과 성간 물질에서 측정한 값과 일치합니다.',
              formula: 'z = (λ관측 − λ기준) / λ기준 · v = H₀d (H₀ ≈ 70 km/s/Mpc) · T_CMB = 2.725 K · 원소 합성: 수소 : 헬륨 ≈ 3 : 1 (질량비, 개수비로는 약 12 : 1)',
              misconcept: [
                '빅뱅은 공간의 한 점에서 폭발해 파편이 퍼져 나간 사건이 아니라, 공간 자체가 모든 곳에서 늘어난 것입니다. 그래서 팽창의 중심도 가장자리도 없습니다.',
                '아주 먼 은하의 적색편이로 계산한 후퇴 속도가 광속을 넘는 것처럼 보이는 것은 은하가 공간 속을 그렇게 빨리 달리기 때문이 아니라, 빛이 오는 동안 그 사이의 공간이 늘어났기 때문입니다. 은하 자체는 국소적으로 광속보다 느립니다.'
              ],
              question: [
                'H₀ = 70 km/s/Mpc일 때 1 Mpc과 100 Mpc 떨어진 은하의 후퇴 속도를 각각 구해 보세요.',
                '재결합 당시 약 3,000K이던 우주배경복사가 오늘 2.7K로 식은 까닭을 우주 팽창과 연결해 설명해 보세요.'
              ],
              timeline: [{"t": "10⁻¹² ~ 10⁻⁶초", "temp": "약 10¹² K", "title": "쿼크 → 양성자·중성자", "text": "쿼크 세 개가 묶여 양성자(uud)와 중성자(udd)가 됩니다.", "eq": "u + u + d → p⁺ · u + d + d → n⁰"}, {"t": "3분", "temp": "약 10⁹ K", "title": "빅뱅 핵합성 — 수소 : 헬륨 ≈ 3 : 1", "text": "중수소를 거쳐 헬륨-4가 만들어지고, 극소량의 리튬-7이 남습니다.", "eq": "p + n → ²H + γ → ³He → ⁴He"}, {"t": "38만 년", "temp": "약 3,000 K", "title": "재결합 — 빛이 빠져나오다", "text": "전자가 원자핵에 붙어 중성 원자가 되고, 빛이 자유로워져 우주배경복사가 됩니다.", "eq": "p + e⁻ → H + γ · 오늘의 CMB 2.725 K"}, {"t": "1억 년 이후", "temp": "별 내부 10⁷ K", "title": "첫 별의 핵융합 → 무거운 원소", "text": "수소가 헬륨으로, 이어 탄소·산소·철로. 철보다 무거운 원소는 초신성 r-과정에서 만들어집니다.", "eq": "4¹H → ⁴He + 26.7 MeV"}],
              sim: 'redshift'
            },
            {
              title: '별의 진화와 무거운 원소의 생성',
              principle: '성간 성운이 중력으로 수축해 원시별이 되고, 중심 온도가 약 1,000만 K를 넘으면 수소 핵융합이 점화되어 주계열성이 됩니다. 중심의 수소가 줄면 핵이 수축하며 온도가 올라가 바깥층이 부풀어 적색거성·초거성이 되고, 헬륨을 탄소·산소로 태우는 단계로 이어집니다. 태양 정도 질량의 별은 행성상 성운을 남기고 백색왜성이 되며, 태양의 8배보다 무거운 별은 철 핵까지 만들어 초신성으로 폭발해 중성자별이나 블랙홀을 남깁니다. 탄소·산소·규소·철은 별 내부의 핵융합에서, 금·우라늄 같은 철보다 무거운 원소는 초신성 폭발과 중성자별 충돌의 급격한 중성자 포획에서 만들어집니다.',
              formula: 'L = 4πR²σT⁴ · 주계열 수명 t ≈ 10¹⁰ 년 × (M/M☉)^−2.5 · 철(Fe)은 핵자당 결합에너지가 최대 → 철 핵은 융합해도 에너지를 내지 않음',
              misconcept: [
                '별의 색이 변하는 것은 나이가 들어서가 아니라 표면 온도가 바뀌기 때문입니다. 적색거성은 핵이 수축하고 외피가 부풀어 식은 것이지, 불타 없어지는 것이 아닙니다.',
                '철보다 무거운 원소는 별 내부의 핵융합으로 만들어지지 않습니다. 철 핵은 융합해도 에너지를 내지 않으므로, 금이나 우라늄은 초신성 폭발·중성자별 충돌 같은 급격한 과정에서 만들어집니다.'
              ],
              question: [
                '태양 질량의 10배인 별의 주계열 수명을 위 식으로 어림해 보세요(태양 수명 100억 년).',
                '우리 몸을 이루는 탄소·산소·철은 각각 어떤 과정을 거쳐 만들어졌을까요?'
              ],
              sim: 'hr'
            },
            {
              title: '태양계와 지구의 형성',
              principle: '회전하는 성간 분자운이 중력으로 수축하면 각운동량이 보존되어 회전이 빨라지고, 그 원심력 때문에 구름이 납작한 원반으로 퍼집니다(성운설). 중심에는 원시 태양이 자라고, 원반의 먼지가 뭉친 미행성(수 km 규모)이 서로 충돌·합체하며 원시 행성이 됩니다. 원반 안쪽은 뜨거워 녹는점이 높은 암석·금속만 응축되어 수성~화성 같은 작은 암석 행성이, 바깥은 얼음까지 응축되고 가스를 붙잡아 목성~해왕성 같은 거대 행성이 만들어졌습니다. 원시 지구는 충돌 에너지와 방사성 붕괴열로 녹아 밀도가 큰 철·니켈이 중심핵으로, 규산염이 맨틀로 분리되었습니다(분화). 달은 화성 크기 천체의 충돌로 생긴 파편이 다시 모여 만들어졌다는 거대 충돌설이 유력합니다.',
              formula: '각운동량 L = mvr = 일정 · 운석 연대 ≈ 45.7억 년, 지구 나이 ≈ 46억 년 · 태양이 태양계 전체 질량의 99.8% 차지',
              misconcept: [
                '성운설은 “태양이 다른 별 곁을 지나며 물질을 끌어당겨 행성이 생겼다”는 조석설과 다릅니다. 현재 태양계 형성의 표준 설명은 회전하는 성운의 수축입니다.',
                '행성이 처음부터 지금 크기로 생긴 것이 아니라, 작은 미행성이 수천만 년 동안 충돌·합체해 자랐습니다. 충돌은 파괴만 한 것이 아니라 행성을 키운 주된 과정입니다.'
              ],
              question: [
                '왜 수성·금성·지구·화성은 작은 암석 행성이고, 목성·토성은 큰 가스 행성일까요?',
                '원시 지구가 녹아 분화했다는 증거를 지구 내부 구조와 운석에서 각각 찾아보세요.'
              ],
              sim: 'nebula'
            },
            {
              title: '별빛을 읽는 법 — 흑체복사와 스펙트럼',
              principle: '별은 거의 완벽한 흑체에 가깝게 빛을 냅니다. 온도가 높을수록 모든 파장에서 복사량이 커지고(T⁴), 가장 강하게 내는 파장은 짧아집니다(빈의 법칙). 그래서 푸른 별은 뜨겁고 붉은 별은 상대적으로 차갑습니다. 별 표면에서 나온 빛이 별 대기의 원자에 일부 파장을 흡수당하면 연속 스펙트럼 위에 어두운 흡수선이 생기고, 이 선의 위치로 원소의 종류를, 선의 이동(도플러 효과)으로 별이 다가오고 멀어지는 속도를 읽습니다.',
              formula: 'λmax = 2.898×10⁻³ m·K / T · L = 4πR²σT⁴ · z = Δλ / λ₀',
              misconcept: [
                '어두운 흡수선은 그 색의 빛이 별에 없다는 뜻이 아니라, 별이 낸 그 파장의 빛을 별 대기의 원자가 흡수했다는 뜻입니다.',
                '별의 색만 보고 온도를 정확히 알 수는 없습니다. 성간 먼지가 파란빛을 더 흡수해 별을 붉게 보이게(적색화) 하므로 보정이 필요합니다.'
              ],
              question: [
                '표면 온도가 5,800K인 별과 3,000K인 별의 최대 복사 파장을 각각 구해 보세요.',
                '스펙트럼의 같은 흡수선이 길게 늘어나 보이는 것은 무엇을 뜻할까요?'
              ],
              sim: 'planck'
            }
          ]
        },
        {
          key: 'earth',
          title: '지구과학Ⅰ·Ⅱ',
          badge: '6단원',
          note: '선택 과목 — 수식과 계산으로 우주의 구조를 읽는 단계',
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
          title: '태양계 소천체 — 소행성·카이퍼벨트·혜성',
          principle: '태양계 소천체는 행성도 위성도 아닌 작은 천체로, 소행성(암석·금속 덩어리), 왜소행성(세레스·명왕성·에리스 등), 카이퍼벨트 천체와 산란원반 천체, 오르트 구름의 혜성핵이 있습니다. 소행성대는 화성과 목성 사이 2.1~3.3 AU에 몰려 있고, 여기서도 목성과의 궤도 공명(주기비 3:1·5:2·7:3·2:1)이 만든 커크우드 간극으로 소행성이 거의 없는 띠가 생깁니다. 카이퍼벨트는 해왕성 밖 30~50 AU에서 태양계 초기의 얼음 잔해가 남은 곳이고, 혜성은 그 얼음 천체가 안쪽으로 들어와 태양열로 승화하며 핵·코마·꼬리를 만든 모습입니다. 혜성의 이온 꼬리는 태양풍에 실려 태양 반대쪽으로 곧게, 먼지 꼬리는 복사압에 밀리면서 궤도 뒤쪽으로 휘어 두 꼬리가 서로 다른 방향을 향합니다.',
          formula: '케플러 T² = a³ · 목성 3:1 공명 2.50 AU · 5:2 2.82 AU · 7:3 2.95 AU · 2:1 3.27 AU · 소행성 전체 질량 ≈ 달의 4%(세레스가 그 32%) · 혜성 핵 반사율 2~6%',
          detail: [
            { h: '커크우드 간극은 어떻게 생기나', p: '소행성 하나가 목성과 주기비 3:1(공전 3번에 목성 1번) 자리에 있으면, 같은 자리에서 목성의 인력을 반복해서 받습니다. 그 섭동이 누적되면 궤도 이심률이 커져 화성·목성 쪽으로 산란되거나 다른 소행성과 충돌해 자리를 뜹니다. 그래서 2.50 AU(3:1)·2.82 AU(5:2)·2.95 AU(7:3)에는 소행성이 드물고, 2.06 AU의 4:1과 3.27 AU의 2:1에도 넓은 틈이 있습니다. 반대로 3:2 공명 자리(3.97 AU)의 힐다군과 목성 앞뒤 60°의 트로이군(L4·L5)은 공명 덕분에 궤도가 안정해 오래 남습니다.' },
            { h: '소천체가 태양계의 화석인 이유', p: '행성은 충돌·분화·열변성으로 초기 기록을 잃었지만, 작은 소행성은 45.67억 년 전 태양계 성운의 물질을 거의 그대로 간직합니다. 탄소질 콘드라이트에서 물을 머금은 점토 광물과 아미노산 같은 유기분자가, 철운석에서 원시 핵의 성분이 발견됩니다. 지구의 물 상당 부분도 이런 얼음 소천체가 후기 폭격으로 가져왔다는 설명이 유력합니다.' },
            { h: '혜성 꼬리가 두 갈래인 까닭', p: '핵의 얼음이 승화한 가스는 태양의 자외선에 이온화되어 태양풍의 자기장에 실립니다. 그래서 이온 꼬리는 거의 태양 반대 방향으로 곧게 뻗고 파란빛을 띱니다. 먼지 입자는 복사압에 밀리지만 궤도 속도를 잃지 않아, 태양 반대쪽으로 밀리면서도 궤도 진행 방향의 운동을 유지해 결국 궤도 뒤쪽으로 휜 노란 먼지 꼬리가 됩니다. 혜성이 태양에서 멀어질 때는 앞서는 꼬리가 앞쪽에 보이는 것처럼 보이는 것도 이 때문입니다.' },
            { h: '명왕성은 왜 행성에서 빠졌나', p: '2006년 IAU는 행성의 조건을 ① 태양 둘레를 도는 것 ② 자체 중력으로 유체정역학 평형(거의 둥근 모양)을 이루는 것 ③ 궤도 주변의 다른 천체를 압도적으로 정리한 것 세 가지로 정했습니다. 명왕성은 카이퍼벨트의 수많은 이웃과 궤도를 공유하므로 ③을 만족하지 못해 왜소행성이 되었습니다. 크기가 기준이 아니라는 점이 핵심입니다. 2015년 뉴허라이즌스가 지름 2,377 km, 질소 얼음 평원(스푸트니크 평원)과 3,500 m 얼음 산을 보내 확인했습니다.' },
            { h: '지구를 향하는 소천체', p: '궤도가 지구 궤도에 0.05 AU 이내로 접근하는 천체를 지구접근천체(NEO)라고 합니다. 크기와 충돌 확률을 합쳐 토리노 척도로 위험을 0~10으로 표시하고, 140 m 이상은 모두 찾아 궤도를 추적하는 것이 국제 목표입니다. 2022년 DART 탐사선이 위성 디모르포스에 충돌해 공전 주기를 11시간 55분에서 11시간 23분으로 32분 줄여, 인류가 소천체 궤도를 바꿀 수 있음을 실제로 보였습니다.' }
          ],
          table: {
            title: '태양계 소천체 한눈에 보기',
            head: ['분류', '주된 위치', '크기·개수', '성질'],
            rows: [
              ['소행성대', '2.1~3.3 AU', '지름 수 m~수백 km · 100만 개 이상', '암석·금속. 전체 질량은 달의 4%뿐'],
              ['트로이군', '목성 궤도 L4·L5', '지름 수십 km · 1만 개 이상', '목성과 60° 앞뒤에서 궤도가 안정'],
              ['카이퍼벨트', '30~50 AU', '지름 100 km 이상 수천 개', '얼음·암석. 명왕성·에리스 등 왜소행성'],
              ['산란원반', '30~100 AU', '수백 개', '해왕성 중력에 튕겨 긴 타원 궤도'],
              ['오르트 구름', '2,000~10만 AU', '추정 1조 개', '혜성의 고향. 태양계를 구면으로 감쌈'],
              ['혜성', '타원·포물선 궤도', '핵 지름 1~50 km', '얼음+먼지. 태양 근처에서 코마·꼬리 생성']
            ],
            cap: '소행성대는 영화처럼 빽빽하지 않습니다. 소행성 사이 평균 간격은 수백만 km로, 탐사선이 충돌 없이 통과할 만큼 비어 있습니다.'
          },
          exam: [
            '커크우드 간극은 목성과의 궤도 공명으로 소행성이 밀려난 자리이며, 간극의 위치(2.50·2.82·2.95·3.27 AU)가 공명비와 대응한다는 것을 설명할 수 있어야 합니다.',
            '혜성 꼬리는 운동 방향으로 끌리는 것이 아니라, 이온 꼬리는 태양 반대 방향, 먼지 꼬리는 궤도 뒤쪽으로 휜다는 두 가지를 구분해 서술합니다.',
            '명왕성이 왜소행성으로 분류된 기준(궤도 주변 정리 실패)과, 소행성·혜성·유성의 차이를 구분합니다.'
          ],
          misconcept: [
            '혜성의 꼬리는 혜성이 움직이는 방향의 반대가 아니라 태양 반대 방향(이온 꼬리)과 궤도 뒤쪽(먼지 꼬리)입니다.',
            '소행성대를 지나는 탐사선이 소행성과 부딪힐 확률은 매우 낮습니다. 소행성 사이는 수백만 km씩 떨어져 있습니다.',
            '명왕성이 행성에서 빠진 것은 크기가 작아서가 아니라 궤도 주변을 정리하지 못했기 때문입니다. 수성보다 큰 위성도 있고, 명왕성보다 작은 행성은 없지만 기준은 크기가 아닙니다.',
            '유성(별똥별)은 별이 떨어지는 것이 아니라, 우주 먼지가 대기와 마찰해 타는 것입니다. 유성체·유성·운석은 각각 우주 공간의 물체·대기 중 빛의 줄기·지표에 떨어진 잔해입니다.',
            '카이퍼벨트와 오르트 구름은 다릅니다. 카이퍼벨트는 황도면 근처 30~50 AU의 납작한 띠이고, 오르트 구름은 훨씬 멀리 태양계를 구면으로 감싼 가상의 혜성 저장고입니다.'
          ],
          question: [
            '목성과 3:1 공명 자리에 있던 소행성의 궤도가 시간이 지나며 어떻게 변할지 단계로 설명해 보세요.',
            '혜성이 태양에 가까워질수록 꼬리가 길어지는데, 태양에서 멀어질 때 꼬리의 방향은 어떻게 보일까요?',
            '카이퍼벨트 천체와 오르트 구름의 차이를 궤도 모양·거리·태양계 형성과의 관계로 비교해 보세요.'
          ],
          observe: '쌍안경으로 소행성 4베스타(최대 6등급)를, 망원경으로 혜성의 코마와 꼬리를 볼 수 있습니다. 별너울의 전천 지도에서 행성 위치를 확인하고, 혜성이 밝아지면 뉴스 카드에 소식이 올라옵니다.',
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
          title: '성단과 나이 — 색등급도 전향점이 알려 주는 것',
          principle: '성단의 별들은 같은 성간운에서 거의 같은 시각에 태어나 나이·화학 조성·거리를 공유하고 질량만 다릅니다. 그래서 성단의 색등급도(색-등급도, CMD)를 그리면 질량이 큰 별부터 차례로 주계열을 떠나 오른쪽 위(적색거성 가지)로 올라가고, 주계열이 끊기는 자리인 전향점(turnoff)의 위치가 성단의 나이를 정합니다. 산개성단은 은하 원반의 젊은 성단(수백~수천 개, 1억~10억 년, 금속 많음)이고, 구상성단은 은하 헤일로의 늙은 성단(10만~100만 개, 100억 년 이상, 금속 적음)입니다. 개별 별은 나이를 알 수 없지만, 같은 나이의 별을 수천 개 모아 놓은 성단은 우주의 시계가 됩니다.',
          formula: '주계열 수명 t ≈ 10¹⁰ 년 × (M/M☉)^−2.5 · 전향점 질량 M_TO ≈ (t / 10¹⁰ 년)^(1/2.5) · 거리지수 m − M = 5 log₁₀(d/10pc) + A · 소광 A_V ≈ 3.1 E(B−V)',
          detail: [
            { h: '전향점이 나이를 재는 원리', p: '주계열성은 중심의 수소를 태우는 동안 광도와 온도가 거의 일정합니다. 수명은 질량이 클수록 급격히 짧아져 t ∝ M^−2.5이므로, 10 M☉은 약 300만 년, 2 M☉은 약 18억 년, 태양은 100억 년, 0.8 M☉은 약 175억 년입니다. 성단이 늙을수록 전향점은 왼쪽 위(뜨겁고 밝은)에서 오른쪽 아래(차갑고 어두운)로 내려갑니다. 전향점의 색과 밝기를 읽어 그 질량을 구하고, 질량-수명 식으로 나이를 계산합니다.' },
            { h: '산개성단과 구상성단의 색등급도', p: '플레이아데스(약 1억 년)는 전향점이 왼쪽 위에 있어 푸른 별이 많고 적색거성 가지가 짧습니다. M67(약 40억 년)은 태양과 비슷한 별까지 주계열에 남아 있고, 오메가 센타우리(약 120억 년) 같은 구상성단은 전향점이 태양보다 아래(어둡고 차가운)에 있어 주계열이 짧게 끊기고 적색거성 가지가 길게 뻗습니다. 구상성단의 별은 수소·헬륨보다 무거운 원소(금속)가 태양의 1/100~1/10 수준으로, 우주 초기 조성의 흔적을 간직합니다.' },
            { h: '나이를 읽기 전에 보정할 것', p: '색등급도는 겉보기 밝기와 색으로 그리므로, 성단까지의 거리(거리지수)와 성간 먼지에 의한 소광·적색화를 먼저 보정해야 모양이 제자리를 찾습니다. 소광 A_V ≈ 3.1 E(B−V)이고 적색화는 색지수 B−V를 붉은 쪽으로 밀어, 보정 없이 읽으면 성단이 실제보다 젊고 뜨겁게 보입니다. 또 쌍성 비율이 높은 성단에서는 두 별이 합쳐진 밝기로 전향점이 조금 밝아 보이는 효과도 보정합니다.' },
            { h: '성단 나이와 우주의 나이', p: '가장 오래된 구상성단의 나이는 약 120억~130억 년으로, 우주배경복사로 구한 우주 나이 138억 년보다 젊습니다. 이 일치는 별의 진화 모형과 우주론이 서로 모순되지 않는다는 중요한 검증입니다. 1990년대에는 구상성단 나이가 우주 나이보다 크게 계산되어 문제가 되었지만, 유럽우주국의 히파르코스 위성이 거리를 다시 재면서 성단 거리가 멀어져 나이가 줄었습니다.' },
            { h: '성단으로 재는 거리', p: '같은 성단의 별들은 거의 같은 거리에 있으므로, 주계열 맞추기로 거리를 잽니다. 가까운 성단(히아데스)의 주계열을 기준으로 먼 성단의 주계열을 수직으로 평행 이동시켜 겹치면, 그 이동량이 거리지수가 됩니다. 이 방법은 세페이드가 없는 가까운 은하까지의 거리를 재는 사다리의 한 칸입니다.' }
          ],
          table: {
            title: '산개성단 vs 구상성단',
            head: ['항목', '산개성단', '구상성단'],
            rows: [
              ['위치', '은하 원반·나선팔', '은하 헤일로·중심부 주변'],
              ['별 수', '수십~수천 개', '10만~100만 개'],
              ['나이', '1억~10억 년 (젊음)', '100억~130억 년 (늙음)'],
              ['금속량(Fe/H)', '태양과 비슷하거나 많음', '태양의 1/100~1/10'],
              ['색등급도', '전향점 왼쪽 위, 적색거성 가지 짧음', '전향점 오른쪽 아래, 적색거성 가지 김'],
              ['대표 예', '플레이아데스(M45), 히아데스, M67', '오메가 센타우리(NGC 5139), M13, M15'],
              ['모양', '느슨하고 별이 적음', '공 모양으로 빽빽함']
            ],
            cap: '성단의 나이는 전향점만으로 정해집니다. 전향점이 아래(어둡고 차가움)에 있을수록 늙은 성단입니다. 수치는 태양 금속량을 기준으로 한 대표값입니다.'
          },
          exam: [
            '색등급도에서 전향점이 오른쪽 아래로 내려간 것이 성단이 젊어졌다는 뜻인지 늙었다는 뜻인지, 주계열 수명 식과 함께 설명할 수 있어야 합니다.',
            '산개성단과 구상성단의 차이(위치·별 수·나이·금속량)를 표로 정리하고, 왜 구상성단의 금속량이 적은지 우주 초기 조성과 연결합니다.',
            '성단까지의 거리를 구하는 주계열 맞추기 원리를 거리지수와 관련지어 서술합니다.'
          ],
          misconcept: [
            '성단에서 푸른 별이 더 젊은 별이 아니라 질량이 커서 빨리 진화한 별입니다. 같은 성단의 별은 모두 같은 나이입니다.',
            '색등급도의 색은 나이가 아니라 표면 온도(분광형)입니다. 나이는 전향점의 위치가 알려 줍니다.',
            '산개성단이 구상성단보다 어둡게 보이는 것은 주로 거리 때문이며, 나이와 혼동하면 안 됩니다. 거리·소광을 보정한 뒤에 비교합니다.',
            '성단의 별이 모두 같은 시기에 태어난 것은 아닙니다. 실제로는 수백만 년에 걸쳐 태어나지만, 성단 나이(억 년 단위)에 비하면 거의 같은 시기로 봅니다.'
          ],
          question: [
            '전향점 질량이 2 M☉인 성단의 나이를 위 식으로 어림해 보세요(태양 수명 100억 년).',
            '플레이아데스에 적색거성이 거의 없는 까닭을 성단 나이와 별의 진화로 설명해 보세요.',
            '구상성단의 별에서 철이 적게 검출되는 사실은 우리은하의 어떤 역사를 말해 줄까요?'
          ],
          observe: '가을·겨울철 맑은 밤, 쌍안경으로 플레이아데스(M45)와 히아데스, 소구경 망원경으로 M13·M15를 찾아보세요. 성단의 색과 별의 촘촘함이 산개성단과 구상성단의 차이를 그대로 보여 줍니다.',
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
        }
      ]
    },
    fusion: {
      label: '물리·화학·생명 융합', icon: '⚛️',
      sub: '천문을 물리·화학·생명과학으로 읽는 단계 — 빛, 핵, 분자, 생명의 흔적',
      units: [
        {
          title: '빛과 원자의 스펙트럼 — 별의 원소를 읽다',
          principle: '원자의 전자는 정해진 에너지 준위 사이에서만 오갑니다. 낮은 준위의 전자가 빛을 흡수해 위로 올라가면 그 파장만큼 스펙트럼에 어두운 흡수선이 생기고, 반대로 내려오면 밝은 방출선이 생깁니다. 수소의 발머 계열(656nm Hα, 486nm Hβ …)은 별과 성운의 수소를 확인하는 대표적인 표식입니다. 별빛의 흡수선 위치로 원소의 종류를, 선의 이동으로 시선 속도를 읽고, 외계행성이 별 앞을 지날 때 대기를 통과한 빛의 흡수선으로 그 대기 성분까지 알아냅니다.',
          formula: 'ΔE = hc/λ = 13.6 eV × (1/n₁² − 1/n₂²) · 발머 계열 λ = 364.6 nm × n²/(n² − 4) · 1/λ = R(1/2² − 1/n²)',
          misconcept: [
            '흡수선은 별에 그 원소가 없다는 뜻이 아니라, 별 대기에 그 원소가 있어 특정 파장을 흡수했다는 뜻입니다. 같은 원소라도 온도가 다르면 나타나는 선이 달라집니다.',
            '스펙트럼 선의 색만 보고 원소를 단정할 수는 없습니다. 도플러 이동과 성간 먼지에 의한 적색화를 함께 보정해야 합니다.'
          ],
          question: [
            '수소의 n=3 → n=2 전이에서 나오는 빛의 파장을 계산해 보세요(ΔE = 1.89 eV).',
            '외계행성 대기에서 물의 흡수선이 보인다면 무엇을 알 수 있을까요?'
          ],
          sim: 'planck'
        },
        {
          title: '항성 핵융합과 원소의 탄생 — E=mc²',
          principle: '별은 질량 결손을 에너지로 바꿉니다. 태양 같은 별은 양성자-양성자 연쇄로 수소를 헬륨으로 만들고, 무거운 별은 CNO 순환을 거쳐 탄소·산소·네온·규소를 차례로 태웁니다. 철은 핵자당 결합에너지가 가장 커서 더 융합해도 에너지를 내지 않으므로, 철보다 무거운 원소는 초신성 폭발과 중성자별 충돌의 r-과정에서 만들어집니다.',
          formula: 'E = mc² · 4¹H → ⁴He + 2e⁺ + 2ν + 26.7 MeV (질량의 0.7%가 에너지로) · CNO 순환: ¹²C + 4¹H → ¹²C + ⁴He + 26.7 MeV',
          misconcept: [
            '핵융합은 원자핵이 무거워질수록 에너지가 많이 나오는 것이 아닙니다. 철을 지나면 오히려 에너지를 넣어야 융합할 수 있습니다.',
            '별이 타는 것은 산소와 결합하는 연소가 아니라 원자핵이 합쳐지는 핵반응입니다. 화학 연소와는 에너지 규모가 100만 배 이상 다릅니다.'
          ],
          question: [
            '태양이 1초에 잃는 질량(약 426만 톤)을 E=mc²로 확인해 보세요.',
            '금과 우라늄은 어떤 과정에서 만들어졌을까요?'
          ],
          sim: 'hr'
        },
        {
          title: '흑체복사·도플러 효과와 궤도 역학',
          principle: '별의 표면은 거의 흑체입니다. 슈테판-볼츠만 법칙으로 반지름과 온도에서 광도를, 빈의 법칙으로 최대 복사 파장을 구합니다. 별과 행성은 질량중심 둘레를 돌고, 별의 시선 속도는 스펙트럼 선의 도플러 이동으로 드러납니다. 만유인력과 원심력이 균형을 이루는 궤도에서는 케플러 법칙이 성립합니다.',
          formula: 'L = 4πR²σT⁴ · λmax = 2.898×10⁻³/T m · Δλ/λ₀ = v/c · v_esc = √(2GM/R)',
          misconcept: [
            '도플러 이동은 빛의 속도가 변하는 것이 아니라 파장이 늘고 줄어드는 현상입니다. 적색편이는 후퇴, 청색편이는 접근을 뜻합니다.',
            '행성이 별을 흔드는 정도는 행성 질량뿐 아니라 궤도 크기와 주기에도 좌우됩니다. 진폭이 크다고 반드시 무거운 행성은 아닙니다.'
          ],
          question: [
            '표면 온도 5,800K인 태양의 최대 복사 파장을 구해 보세요.',
            '지구가 태양을 흔드는 시선 속도(약 0.09 m/s)는 어떤 기술로 측정할까요?'
          ],
          sim: 'rv'
        },
        {
          title: '우주의 시작 — 입자·핵·원자가 만들어지기까지',
          principle: '빅뱅 우주론은 시간에 따라 우주의 온도와 밀도가 내려가며 입자와 원소가 만들어졌다고 설명합니다. 쿼크가 양성자·중성자가 되고, 3분 남짓의 빅뱅 핵합성으로 수소와 헬륨이 3 : 1로 만들어졌으며, 38만 년 뒤 전자가 원자핵에 붙으면서 빛이 빠져나와 우주배경복사가 되었습니다. 이어 첫 별의 핵융합과 초신성 폭발이 오늘의 원소를 만들었습니다.',
          formula: '온도는 팽창과 함께 내려갑니다(T ∝ 1/a) · 빅뱅 핵합성 결과: ¹H 75% : ⁴He 25%(질량비 3 : 1) · CMB 2.725 K',
          misconcept: [
            '빅뱅 핵합성에서 만들어진 것은 수소·헬륨·리튬까지입니다. 탄소·산소·철 같은 원소는 훨씬 뒤에 별 내부에서 만들어졌습니다.',
            '우주배경복사는 빅뱅 순간의 빛이 아니라, 38만 년 뒤 우주가 투명해지면서 처음 자유롭게 날아간 빛입니다.'
          ],
          question: [
            '3분 동안 만들어진 헬륨이 오늘의 별에서 관측되는 헬륨과 비슷한 까닭은 무엇일까요?',
            '온도가 3,000K에서 2.7K로 식는 동안 우주의 크기는 몇 배가 되었을까요?'
          ],
          timeline: [{"t": "10⁻¹² ~ 10⁻⁶초", "temp": "약 10¹² K 이상", "title": "쿼크가 결합해 양성자·중성자가 되다", "text": "우주가 아주 뜨거워 쿼크가 자유롭게 돌아다니다가, 식으면서 세 개씩 묶여 양성자(uud)와 중성자(udd)가 됩니다. 전자와 중성미자는 아직 빛과 열평형을 이루고 있습니다.", "eq": "u + u + d → p⁺ · u + d + d → n⁰"}, {"t": "약 1초", "temp": "약 10¹⁰ K", "title": "중성미자가 빠져나가고 양성자와 중성자의 비가 정해지다", "text": "약한 상호작용이 끊기면서 중성미자가 자유롭게 날아갑니다. 이때 양성자와 중성자의 수 비가 약 1 : 1이었다가, 중성자가 조금 더 빨리 붕괴해 약 7 : 1로 굳어집니다. 이 비가 뒤에 만들어지는 헬륨의 양을 결정합니다.", "eq": "n → p⁺ + e⁻ + ν̄ₑ (반감기 약 10분)"}, {"t": "3분 ~ 3분 45초", "temp": "약 10⁹ K", "title": "빅뱅 핵합성 — 수소와 헬륨, 극소량의 리튬", "text": "양성자와 중성자가 융합해 중수소가 되고, 중수소가 다시 융합해 헬륨-4가 됩니다. 3분 남짓 지나 온도가 더 내려가면 핵융합이 멈추고, 우주의 원소는 수소 약 75% · 헬륨 약 25%(질량비 3 : 1)와 극소량의 리튬-7로 남습니다.", "eq": "p + n → ²H + γ · ²H + p → ³He + γ · ³He + n → ⁴He + γ · ⁴He + ³H → ⁷Li + γ"}, {"t": "38만 년", "temp": "약 3,000 K", "title": "전자가 원자핵에 붙어 빛이 자유로워지다", "text": "온도가 3,000K까지 내려가면 전자가 양성자·헬륨 핵에 잡혀 중성 원자가 됩니다(재결합). 그때까지 물질에 막혀 있던 빛이 사방으로 빠져나가는데, 이것이 오늘 2.725K로 식어 온 하늘 전체를 채운 우주배경복사입니다.", "eq": "p + e⁻ → H + γ · 우주배경복사 T₀ = 2.725 K"}, {"t": "1억 ~ 2억 년", "temp": "별 내부 10⁷ K", "title": "첫 별의 핵융합으로 탄소·산소가 생기다", "text": "수소와 헬륨이 뭉쳐 첫 별이 켜지고, 별 중심에서 수소가 헬륨으로 바뀝니다. 무거운 별은 헬륨을 태워 탄소·산소·네온·규소를 만들고, 마지막에 철 핵을 남깁니다.", "eq": "4¹H → ⁴He + 2e⁺ + 2ν + 26.7 MeV (양성자-양성자 연쇄)"}, {"t": "지금까지", "temp": "초신성 폭발 순간 10⁹ K 이상", "title": "철보다 무거운 원소 — 금과 우라늄", "text": "철은 핵자당 결합에너지가 가장 커서 융합해도 에너지를 내지 않습니다. 금·백금·우라늄 같은 원소는 초신성 폭발이나 중성자별 충돌에서 중성자가 순식간에 붙는 r-과정으로 만들어집니다. 우리 몸의 탄소·산소·철도, 손목의 금도 모두 별에서 왔습니다.", "eq": "⁵⁶Fe + n → … → ¹⁹⁷Au (r-과정, 초신성·중성자별 합체)"}],
              sim: null
        },
        {
          title: '태양계와 성간분자운의 우주화학',
          principle: '우주는 비어 있지 않습니다. 성간 분자운에는 수소분자 H₂, 일산화탄소 CO, 물 H₂O, 암모니아 NH₃, 메탄올 CH₃OH 같은 분자가 있고, 일부는 생명의 재료가 되는 유기분자입니다. 태양계 행성의 색과 대기는 화학 반응이 만든 결과입니다. 화성의 붉은색은 산화철(Fe₂O₃) 먼지, 금성의 460℃ 표면은 CO₂ 온실효과, 타이탄에는 액체 메테인·에테인의 호수와 비 순환이 있습니다.',
          formula: 'H₂(성간)는 별이 없는 곳에서도 촉매 반응으로 생성 · 금성 대기 96% CO₂ → 온실효과로 표면 약 460℃ · Fe + O₂ → Fe₂O₃(산화철)',
          misconcept: [
            '성간 공간은 완전한 진공처럼 보이지만, 1cm³에 수백 개 수준의 입자와 먼지가 있어 화학 반응이 일어납니다.',
            '화성의 붉은색은 액체 물이 아니라 표면 먼지의 산화철 때문입니다. 물이 있다는 증거와는 구분해야 합니다.'
          ],
          question: [
            '금성과 지구는 크기가 비슷한데 표면 온도가 크게 다른 까닭은 무엇일까요?',
            '성간에서 발견된 유기분자는 생명과 어떤 관련이 있을까요?'
          ],
          sim: 'nebula'
        },
        {
          title: '생명가능지대와 액체 물의 생화학',
          principle: '생명가능지대는 중심별의 광도와 행성 거리 사이에서 액체 물이 존재할 수 있는 구간입니다. 물은 비열과 기화열이 커서 온도를 안정적으로 붙잡고, 극성 분자라 많은 물질을 녹이며, 얼면 위로 뜨는 밀도 특성 덕분에 호수 아래가 얼지 않습니다. 탄소는 전자 4개로 사슬·고리·이중결합을 만들 수 있어, 생명 분자의 뼈대가 되기에 가장 유리합니다. 별의 광도가 달라지면 생명가능지대의 거리도 함께 달라집니다.',
          formula: 'L = 4πR²σT⁴ → 행성 거리 d의 복사 플룩스 S = L/(4πd²) · 지구의 태양상수 1,361 W/m² · 물의 비열 4.18 J/(g·K)',
          misconcept: [
            '생명가능지대 안에 있다고 모두 생명이 사는 것은 아닙니다. 대기·자기장·물의 양 같은 조건이 함께 필요합니다.',
            '생명가능지대의 위치는 별의 광도에 따라 달라집니다. 어두운 적색왜성 주변에서는 훨씬 가까운 거리에 형성됩니다.'
          ],
          question: [
            '태양 광도의 4배인 별에서 생명가능지대는 몇 배 먼 곳에 있을까요?',
            '외계행성의 물 존재를 확인하려면 어떤 관측이 필요할까요?'
          ],
          sim: 'transit'
        },
        {
          title: '극한생물과 얼음 위성의 바다',
          principle: '지구의 극한환경 생물은 생명이 생각보다 넓은 조건에서 살 수 있음을 보여 줍니다. 심해 열수구에서는 화학합성 세균이 빛 없이 황화수소를 산화해 에너지를 얻고, 방사선 내성균은 강한 방사선 속에서도 DNA를 복구합니다. 이런 생물은 유로파·엔셀라두스의 얼음 아래 바다나 화성 지하수에서 생명을 찾는 과학적 근거가 됩니다. 다만 지금까지 확인된 생명은 모두 지구 생명이므로, 이는 가능성에 대한 추론입니다.',
          formula: '화학합성: H₂S + 2O₂ → SO₄²⁻ + 2H⁺ (에너지 획득) · 유로파 얼음 두께 수 km, 아래 바다 깊이 수십~수백 km',
          misconcept: [
            '얼음 위성의 바다에 생명이 있다고 확인된 것은 아닙니다. 물과 에너지원이 있다는 조건에서 가능성을 추론하는 단계입니다.',
            '생명은 반드시 햇빛이 필요한 것이 아닙니다. 화학합성처럼 무기물의 화학 반응으로 에너지를 얻는 생명도 있습니다.'
          ],
          question: [
            '열수구 생물이 햇빛 없이 살 수 있는 원리는 무엇일까요?',
            '유로파 바다를 조사하려면 어떤 탐사선과 장비가 필요할까요?'
          ]
        },
        {
          title: '자기장·오존층과 바이오시그니처',
          principle: '지구 자기장은 태양풍과 우주 방사선을 막아 대기와 DNA를 지킵니다. 오존층은 강한 자외선을 흡수해 지표 생명을 보호합니다. 외계행성에서는 대기 스펙트럼에서 산소 O₂와 메테인 CH₄가 동시에 검출되는 것처럼, 생명 활동이 있어야 유지되기 어려운 조합을 바이오시그니처로 찾습니다. 다만 이런 신호는 생명 없이도 만들어질 수 있는 경우가 있어 추가 확인이 필요합니다.',
          formula: '오존 생성: O₂ + hν(240nm 이하) → 2O · O + O₂ → O₃ · 바이오시그니처: O₂ + CH₄ 동시 검출, N₂O, 인공 오염물질(CFC)',
          misconcept: [
            '산소가 있다고 반드시 생명이 있는 것은 아닙니다. 물의 광분해 등 비생물적 과정으로도 산소가 생길 수 있습니다.',
            '바이오시그니처는 확정 증거가 아니라 후보 신호입니다. 여러 관측이 일치할 때 신뢰도가 올라갑니다.'
          ],
          question: [
            '지구 대기에서 산소와 메테인이 함께 있는 이유는 무엇일까요?',
            '외계행성 대기의 산소를 어떻게 관측할 수 있을까요?'
          ]
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
        },
        {
          title: '쌍성·항성계 — 별의 질량을 직접 재는 유일한 방법',
          principle: '별의 일생을 정하는 가장 중요한 값은 질량이지만, 홀로 있는 별의 질량은 직접 잴 수 없습니다. 서로를 도는 쌍성계에서는 질량중심과 케플러 제3법칙으로 질량을 직접 구합니다. 두 별을 망원경으로 분리해 궤도를 보는 시각쌍성, 스펙트럼 흡수선의 주기적 도플러 이동으로 속도를 재는 분광쌍성, 두 별이 서로를 가리는 식쌍성(광도곡선)이 있습니다. 식쌍성은 궤도면이 시선과 거의 나란해 경사각이 알려지므로 질량을 정확히 주고, 분광쌍성에서 두 별의 속도 진폭비가 질량비를 줍니다. 이렇게 얻은 질량과 광도의 관계(L ∝ M^3.5)가 별의 진화 모형 전체의 기준자가 됩니다.',
          formula: 'M₁ + M₂ = a³ / P² (a[AU], P[년], M[태양질량]) · q = M₁/M₂ = a₂/a₁ = K₁/K₂ · L ∝ M^3.5 (주계열) · 광도곡선 깊이 Δm = −2.5 log₁₀(1 − (R₂/R₁)²·(F₂/F₁))',
          detail: [
            { h: '질량-광도 관계가 기준자가 되는 이유', p: '주계열성은 질량이 2배면 광도가 약 5.7배(2^3.5), 10배면 약 3,000배가 됩니다. 수명은 L/M ∝ M^2.5로 줄어 10 M☉은 300만 년, 0.5 M☉은 약 5,700억 년을 삽니다. 이 관계는 별의 내부 구조·에너지 수송·불투명도가 질량에 어떻게 반응하는지를 담은 결과라, 쌍성으로 잰 질량과 광도가 별 진화 모형을 검증하는 자가 됩니다. 2000년대 이후에는 쌍성 100여 개의 정밀 질량·반지름 측정으로 모형이 크게 개선되었습니다.' },
            { h: '식쌍성의 광도곡선 읽기', p: '식쌍성의 광도곡선에는 주기마다 두 개의 극소가 있습니다. 별이 더 밝은 쪽 앞을 지날 때(주극소)와 어두운 쪽 앞을 지날 때(부극소)의 깊이가 다르고, 그 차이로 두 별의 표면 온도비를 구합니다. 알골(β Per)은 주기 2.87일의 대표적 식쌍성으로, 주극소 깊이 약 1.3등급·부극소 약 0.06등급입니다. 광도곡선의 모양(극소가 뾰족한지 둥근지, 식 사이에 밝기가 변하는지)으로 궤도 경사각·이심률·별의 모양(타원체 변형)·반사 효과를 읽습니다.' },
            { h: '분광쌍성의 시선속도 곡선', p: '두 별이 질량중심 둘레를 돌면 한 별은 다가오고 다른 별은 멀어지며, 흡수선이 주기적으로 좌우로 움직입니다. 두 별의 선이 교차하는 순간이 식(가장 가까이 겹쳐 보이는 때)이고, 최대로 벌어질 때가 시선속도 진폭 K₁·K₂가 됩니다. 질량비는 K₁/K₂로 바로 나오고, 경사각 i를 알면 각 별의 질량을 구합니다. i를 모르면 M·sin³i만 알 수 있어 최소 질량이 됩니다.' },
            { h: '알골 역설과 쌍성 진화', p: '알골에서 지금 질량이 작은 별이 더 진화한 모습(거성)으로 보입니다. 질량이 큰 별일수록 빨리 진화하므로 모순처럼 보이지만, 진화한 별이 거성이 되어 부풀면 로슈엽을 넘어 동반성에 질량을 빼앗긴 결과입니다. 처음에는 질량이 컸던 별이 지금은 작아진 것입니다. 이런 질량 이동은 신성·Ia형 초신성(백색왜성+동반성 강착), X선 쌍성, 블랙홀 쌍성의 중력파원까지 이어지는 쌍성 진화의 핵심 과정입니다.' },
            { h: '항성계는 흔한 것이지 예외가 아니다', p: '태양 같은 별도 전체의 절반 이상이 쌍성계나 다중성계에 속합니다. 알파 센타우리는 4.3광년 거리의 삼중성(센타우리 A·B·프록시마), 카스토르는 여섯 개의 별이 묶인 육중성계입니다. 최근 외계행성 탐사에서도 쌍성 주위 행성(환쌍성 행성)이 발견되어, 행성 형성이 쌍성계에서도 가능함을 보여 줍니다.' }
          ],
          table: {
            title: '쌍성의 종류와 관측으로 알 수 있는 것',
            head: ['종류', '관측 방법', '알 수 있는 것', '대표 예'],
            rows: [
              ['시각쌍성', '망원경으로 두 별을 분리해 궤도 측정', '궤도 장반경·주기·질량 합(거리를 알 때)', '미자르, 알비레오'],
              ['분광쌍성', '흡수선의 주기적 도플러 이동', '질량비·시선속도·최소 질량', '카펠라(SB2)'],
              ['식쌍성', '광도곡선의 주기적 극소', '궤도 경사·반지름 비·표면 온도비', '알골(β Per), 베타 리라'],
              ['분광식쌍성', '위 둘을 함께', '개별 질량·반지름·광도 전부', '항성 물리량의 기준'],
              ['광학적 쌍성', '겹쳐 보일 뿐', '물리적 관계 없음(단지 시선 방향)', '—']
            ],
            cap: '분광식쌍성은 별의 질량과 반지름을 가장 정확히 주는 유일한 대상입니다. 알골은 주기 2.87일, 두 별 질량 약 3.2 M☉과 0.8 M☉로, 질량 이동을 겪은 계입니다.'
          },
          exam: [
            '케플러 제3법칙 M₁+M₂ = a³/P²를 쌍성에 적용해 질량을 구하는 과정과, a를 시선속도·식 지속 시간으로 구하는 원리를 설명합니다.',
            '식쌍성 광도곡선의 주극소·부극소 깊이 차가 두 별의 표면 온도 차를 뜻하고, 극소의 모양이 궤도 경사각·이심률을 알려 준다는 것을 서술합니다.',
            '분광쌍성에서 속도 진폭비 K₁/K₂가 질량비와 같다는 것을 식으로 보이고, 경사각 i를 모를 때 최소 질량만 얻는 이유를 설명합니다.'
          ],
          misconcept: [
            '쌍성의 두 별이 항상 같은 질량은 아닙니다. 질량이 큰 별이 먼저 진화하고, 진화한 별이 동반성에 질량을 빼앗기면 지금의 질량 순서가 뒤바뀔 수 있습니다(알골 역설).',
            '식쌍성은 두 별이 실제로 서로를 가리는 것이고, 단순히 시선 방향으로 겹쳐 보이는 광학적 쌍성과는 다릅니다. 광학적 쌍성은 물리적으로 묶여 있지 않습니다.',
            '질량-광도 관계 L ∝ M^3.5는 주계열성에 적용되는 관계입니다. 거성·백색왜성·초거성에는 그대로 쓰지 않습니다.',
            '광도곡선에 극소가 두 번 나타나는 것은 행성이 두 개 있어서가 아니라, 공전 주기마다 두 별이 서로를 한 번씩 가리기 때문입니다.',
            '분광쌍성의 스펙트럼 선이 좌우로 움직이는 것은 별의 온도나 원소가 변해서가 아니라 도플러 효과로 파장이 이동하기 때문입니다.'
          ],
          question: [
            '주기 2.87일, 질량 합 4 M☉인 알골의 궤도 장반경을 M₁+M₂ = a³/P²로 구해 보세요(P를 년으로 바꿔 계산).',
            '분광쌍성에서 K₁ = 30 km/s, K₂ = 60 km/s이면 질량비는 얼마이며, 어느 별이 더 무거운가요?',
            '광도곡선에서 주극소와 부극소의 깊이가 거의 같다면 두 별의 표면 온도에 대해 무엇을 알 수 있을까요?',
            '알골 역설을 질량 이동과 로슈엽 개념으로 설명해 보세요.'
          ],
          observe: '망원경으로 알비레오(백조자리 β)를 보면 금색과 파란색 두 별이 뚜렷하게 나뉘어 보입니다. 알골은 2.87일마다 약 3시간 동안 밝기가 눈에 띄게 줄어들어 맨눈으로도 광도 변화를 확인할 수 있습니다.',
          sim: 'rv'
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
    { era: 'today', when: '2026년', title: '지금 이 순간의 천문학', text: '확정 외계행성 6,473개, 보이저 1호의 1광일 거리, TESS·케플러의 계속되는 발견, 그리고 한국천문연구원(KASI)의 관측 자료까지 — 이 사이트의 관측 자료도 그 기록 위에 서 있습니다.', tags: ['오늘', 'KASI'] }
  ];

  var ERA_LABEL = { cosmic: '🌌 우주 초기', ancient: '🏺 고대·중세', modern: '🔭 근대·현대', today: '✨ 오늘' };

  /* ======================================================================
     화면 만들기
     ====================================================================== */
  function buildCurriculum(root) {
    var levels = ['elementary', 'middle', 'high', 'fusion', 'college'];
    var currentLevel = 'elementary';
    root.innerHTML =
      '<div class="learn-tools">' +
      '<div class="lu-search"><label class="lu-search-label" for="luSearch">개념 검색</label>' +
      '<input type="search" id="luSearch" autocomplete="off" placeholder="예: 연주시차, 적색편이, v = H₀d, 흑점" aria-label="학습관 개념 검색">' +
      '<button type="button" class="mini-btn" id="luSearchClear" hidden>지우기</button></div>' +
      '<div class="lu-fonts" role="group" aria-label="글자 크기">' +
      '<span>글자</span><button type="button" data-luf="15" aria-pressed="false">작게</button>' +
      '<button type="button" data-luf="16" aria-pressed="true">보통</button>' +
      '<button type="button" data-luf="18" aria-pressed="false">크게</button></div>' +
      '<p class="lu-search-note" id="luSearchNote" role="status" aria-live="polite"></p>' +
      '</div>' +
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
      var host = $('#learnUnits');
      host.innerHTML = '';
      var groups = data.groups || [{ units: data.units || [] }];
      var seq = 0;
      groups.forEach(function (g) {
        if (g.title) {
          var ghead = document.createElement('div');
          ghead.className = 'learn-group';
          ghead.innerHTML = '<div class="lg-head"><h4>' + esc(g.title) + '</h4>' +
            (g.badge ? '<span class="lg-badge">' + esc(g.badge) + '</span>' : '') + '</div>' +
            (g.note ? '<p class="lg-note">' + esc(g.note) + '</p>' : '');
          host.appendChild(ghead);
        }
        g.units.forEach(function (u, i) {
        var card = document.createElement('article');
        card.className = 'learn-unit';
        card.id = 'lu-' + key + '-' + (++seq);
        var simHost = u.sim ? '<div class="learn-sim-host" data-sim-host="' + u.sim + '"></div>' : '';
        var figs = '';
        if (u.figs && u.figs.length && window.LearnFigs) {
          figs = '<div class="lu-block lu-figs">' + u.figs.map(function (f) {
            var html = window.LearnFigs.html(f);
            return html || '';
          }).join('') + '</div>';
        }
        card.innerHTML =
          '<button type="button" class="learn-unit-head" aria-expanded="false">' +
          '<span class="lu-num">' + (i + 1) + '</span>' +
          '<span class="lu-tit"><span class="lu-title">' + esc(u.title) + '</span>' +
          (u.badge ? '<span class="lu-badge">' + esc(u.badge) + '</span>' : '') + '</span>' +
          '<span class="lu-chev" aria-hidden="true">⌄</span></button>' +
          '<div class="learn-unit-body" hidden>' +
          (u.oneliner ? '<p class="lu-oneliner">' + esc(u.oneliner) + '</p>' : '') +
          figs +
          '<div class="lu-block"><h5>원리</h5><p>' + esc(u.principle) + '</p></div>' +
          '<div class="lu-block lu-formula"><h5>핵심 수식 · 비례 관계</h5><code>' + esc(u.formula) + '</code></div>' +
          (u.timeline ? '<div class="lu-block lu-timeline"><h5>시간대별로 보기</h5><ol>' + u.timeline.map(function (r) {
            return '<li><div class="lux-when"><b>' + esc(r.t) + '</b><span>' + esc(r.temp) + '</span></div>' +
              '<p class="lux-title">' + esc(r.title) + '</p>' +
              '<p class="lux-text">' + esc(r.text) + '</p>' +
              (r.eq ? '<code>' + esc(r.eq) + '</code>' : '') + '</li>';
          }).join('') + '</ol></div>' : '') +
          (u.detail ? '<div class="lu-block lu-deep"><h5>더 깊이 — 원리와 계산</h5>' +
            u.detail.map(function (d) { return '<div class="lux-deep"><p class="lux-h">' + esc(d.h) + '</p><p>' + esc(d.p) + '</p></div>'; }).join('') +
            '</div>' : '') +
          (u.table ? '<div class="lu-block lu-table"><h5>' + esc(u.table.title || '핵심 수치 비교') + '</h5>' +
            '<div class="lux-table-wrap"><table class="lux-table"><thead><tr>' +
            u.table.head.map(function (h) { return '<th scope="col">' + esc(h) + '</th>'; }).join('') +
            '</tr></thead><tbody>' +
            u.table.rows.map(function (r) { return '<tr>' + r.map(function (c, ci) { return (ci === 0 ? '<th scope="row">' : '<td>') + esc(c) + (ci === 0 ? '</th>' : '</td>'); }).join('') + '</tr>'; }).join('') +
            '</tbody></table></div>' + (u.table.cap ? '<p class="lux-cap">' + esc(u.table.cap) + '</p>' : '') +
            '</div>' : '') +
          (u.exam ? '<div class="lu-block lu-exam"><h5>내신·수능 포인트</h5><ul>' +
            (Array.isArray(u.exam) ? u.exam : [u.exam]).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>' : '') +
          (u.observe ? '<div class="lu-block lu-observe"><h5>관측·생활 연결</h5><p>' + esc(u.observe) + '</p></div>' : '') +
          '<div class="lu-grid">' +
          '<div class="lu-block"><h5>자주 하는 오개념</h5><ul>' + (u.misconcept || []).map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div>' +
          '<div class="lu-block"><h5>탐구 질문</h5><ul>' + (u.question || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div>' +
          '</div>' + simHost +
          '<p class="lu-share-row"><button type="button" class="mini-btn lu-share" data-share="' + card.id + '">🔗 이 단원 링크 복사</button>' +
          '<span class="lu-share-note">단원 주소 #' + esc(u.title) + '</span></p>' +
          '</div>';
        host.appendChild(card);
        var head = $('.learn-unit-head', card);
        head.addEventListener('click', function () {
          var body = $('.learn-unit-body', card);
          var open = body.hidden;
          body.hidden = !open;
          head.setAttribute('aria-expanded', String(open));
          card.classList.toggle('is-open', open);
          if (open && u.sim) ensureSim(u.sim, card);
        });
        card.classList.toggle('is-open', false);
        });
      });
      // 단원은 모두 접힌 채로 시작합니다. 펼칠 때 실험을 만듭니다.
    }

    function ensureSim(key, card) {
      var host = (card || document).querySelector('[data-sim-host="' + key + '"]');
      if (!host || host.getAttribute('data-made')) return;
      host.setAttribute('data-made', '1');
      if (key === 'moon') simMoon(host);
      else if (key === 'moonMid') simMoonMid(host);
      else if (key === 'seasons') simSeasons(host);
      else if (key === 'parallax') simParallax(host);
      else if (key === 'kepler') simKepler(host);
      else if (key === 'hr') simHR(host);
      else if (key === 'redshift') simRedshift(host);
      else if (key === 'planck') simPlanck(host);
      else if (key === 'transit') simTransit(host);
      else if (key === 'rv') simRV(host);
      else if (key === 'nebula') simNebula(host);
    }

    /* ---------- 개념 검색 색인 (제목·키워드·수식·본문) ---------- */
    var INDEX = [];
    levels.forEach(function (k) {
      var d = CURRICULUM[k], sq = 0;
      (d.groups || [{ units: d.units || [] }]).forEach(function (g) {
        (g.units || []).forEach(function (u) {
          sq++;
          INDEX.push({
            id: 'lu-' + k + '-' + sq, level: k, label: d.label, u: u,
            text: [u.title, u.oneliner || '', u.principle || '', u.formula || '',
              (u.keywords || []).join(' '),
              (u.detail || []).map(function (x) { return x.h + ' ' + x.p; }).join(' '),
              (u.misconcept || []).join(' '), (u.question || []).join(' '),
              (u.table ? u.table.title + ' ' + u.table.rows.map(function (r) { return r.join(' '); }).join(' ') : '')
            ].join(' ').toLowerCase()
          });
        });
      });
    });

    function openUnit(id, scroll) {
      var m = /^lu-([a-z]+)-\d+$/.exec(id || '');
      if (!m) return false;
      var lv = m[1];
      if (!document.getElementById(id)) { renderLevel(lv); }
      var card = document.getElementById(id);
      if (!card) return false;
      var body = $('.learn-unit-body', card);
      if (body && body.hidden) $('.learn-unit-head', card).click();
      if (scroll !== false) setTimeout(function () { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 80);
      return true;
    }

    /* ---------- 개념 검색 ---------- */
    var box = $('#luSearch', root), clearBtn = $('#luSearchClear', root), note = $('#luSearchNote', root);
    var levelsBar = $('.learn-levels', root), levelNote = $('#learnLevelNote');
    function snippet(it, q) {
      var src = it.u.oneliner || it.u.principle || '';
      var i = src.toLowerCase().indexOf(q);
      if (i < 0) return src.slice(0, 74) + (src.length > 74 ? '…' : '');
      var s = Math.max(0, i - 18);
      return (s > 0 ? '…' : '') + src.slice(s, s + 84) + '…';
    }
    function runSearch() {
      var raw = (box.value || '').trim();
      clearBtn.hidden = !raw;
      if (!raw) {
        note.textContent = '';
        levelsBar.hidden = false;
        levelNote.hidden = false;
        renderLevel(currentLevel || 'elementary');
        return;
      }
      var q = raw.toLowerCase();
      var terms = q.split(/\s+/).filter(Boolean);
      var hits = INDEX.filter(function (it) {
        return terms.every(function (t) { return it.text.indexOf(t) >= 0; });
      });
      levelsBar.hidden = true;
      levelNote.hidden = true;
      note.textContent = '검색 결과 ' + hits.length + '개' + (hits.length ? ' · 단원을 누르면 바로 열립니다' : ' — 다른 낱말로 찾아보세요');
      var host = $('#learnUnits');
      host.innerHTML = hits.length ? hits.map(function (h) {
        return '<button type="button" class="lu-result" data-open="' + h.id + '">' +
          '<span class="lu-res-lv">' + esc(h.label) + '</span>' +
          '<span class="lu-res-title">' + esc(h.u.title) + '</span>' +
          '<span class="lu-res-sub">' + esc(snippet(h, terms[0])) + '</span></button>';
      }).join('') : '<p class="lu-empty">찾는 개념이 없습니다. 예: "연주시차", "허블", "흑체", "트랜짓", "CMB".</p>';
    }
    box.addEventListener('input', function () { clearTimeout(box._t); box._t = setTimeout(runSearch, 140); });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
      if (e.key === 'Escape') { box.value = ''; runSearch(); }
    });
    clearBtn.addEventListener('click', function () { box.value = ''; runSearch(); box.focus(); });

    /* ---------- 글자 크기 · 링크 복사 · 단원 열기 ---------- */
    function setFont(px) {
      document.documentElement.style.setProperty('--lu-fs', px + 'px');
      try { localStorage.setItem('lu.font', String(px)); } catch (e) { }
      $$('[data-luf]', root).forEach(function (b) {
        b.setAttribute('aria-pressed', String(+b.getAttribute('data-luf') === px));
      });
    }
    function shareUnit(id, btn) {
      var url;
      try {
        var u = new URL(location.href);
        u.searchParams.set('lu', id);
        u.hash = '#learn';
        url = u.toString();
      } catch (e) {
        url = location.origin + location.pathname + '?lu=' + id + '#learn';
      }
      function done() {
        var old = btn.textContent;
        btn.textContent = '✓ 주소를 복사했습니다';
        setTimeout(function () { btn.textContent = old; }, 1800);
      }
      function fallback() {
        try {
          var ta = document.createElement('textarea');
          ta.value = url; ta.setAttribute('readonly', '');
          ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); done();
          document.body.removeChild(ta);
        } catch (e) { if (window.prompt) window.prompt('이 주소를 복사하세요', url); }
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback);
        else fallback();
      } catch (e) { fallback(); }
    }
    root.addEventListener('click', function (e) {
      var r = e.target.closest('[data-open]');
      if (r) {
        var id = r.getAttribute('data-open');
        box.value = ''; clearBtn.hidden = true; note.textContent = '';
        levelsBar.hidden = false; levelNote.hidden = false;
        renderLevel(id.split('-')[1]);
        openUnit(id);
        return;
      }
      var s = e.target.closest('[data-share]');
      if (s) { shareUnit(s.getAttribute('data-share'), s); return; }
      var f = e.target.closest('[data-luf]');
      if (f) { setFont(+f.getAttribute('data-luf')); }
    });

    var savedFont = 16;
    try { savedFont = +(localStorage.getItem('lu.font') || 16) || 16; } catch (e) { }
    setFont(savedFont);

    function fromHash() {
      var h = (location.hash || '').replace(/^#/, '');
      var unit = null;
      try {
        var q = new URLSearchParams(location.search);
        if (q.get('lu')) unit = q.get('lu');
      } catch (e) { }
      if (!unit && /^lu-[a-z]+-\d+$/.test(h)) unit = h;
      if (!unit || !/^lu-[a-z]+-\d+$/.test(unit)) return;
      levelsBar.hidden = false; levelNote.hidden = false;
      box.value = ''; clearBtn.hidden = true;
      if (window.__views && window.__views.go) window.__views.go('learn');
      renderLevel(unit.split('-')[1]);
      openUnit(unit);
    }
    window.addEventListener('hashchange', fromHash);

    chips.addEventListener('click', function (e) {
      var b = e.target.closest('.learn-level');
      if (!b) return;
      if (box.value) { box.value = ''; clearBtn.hidden = true; note.textContent = ''; }
      levelsBar.hidden = false; levelNote.hidden = false;
      renderLevel(b.getAttribute('data-level'));
    });
    renderLevel(currentLevel);
    fromHash();
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
    if (window.__LEARN_PLUS && !window.__LEARN_PLUS_DONE) {
      try { window.__LEARN_PLUS(CURRICULUM); window.__LEARN_PLUS_DONE = true; }
      catch (e) { if (window.console) console.warn('learn-plus', e); }
    }
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
