/* =========================================================================
   dial.js — 끝없이 도는 원형 회전 다이얼 (2026-11-27)
   · 24시간·12개월·0~360° 처럼 한 바퀴 돌면 처음으로 이어지는 값을 만집니다.
   · 포인터(마우스·터치)로 돌리고, 키보드(←→↑↓, PageUp/Down, Home/End)로도
     움직일 수 있습니다. touch-action: none 으로 스크롤과 충돌하지 않습니다.
   · window.Dial.create(host, {min,max,step,value,size,fmt,ticks,onChange})
     반환: { el, get(), set(v), destroy() }
   ========================================================================= */
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  function mod(v, m) { return ((v % m) + m) % m; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function create(host, opts) {
    if (!host) return null;
    var o = opts || {};
    var min = o.min != null ? o.min : 0;
    var max = o.max != null ? o.max : 360;
    var step = o.step || 1;
    var wrap = o.wrap !== false;
    var span = max - min + (wrap ? step : 0);   // wrap 이면 한 칸이 이어져 한 바퀴가 됩니다
    if (!wrap) span = max - min;
    var size = o.size || 150;
    var fmt = o.fmt || function (v) { return String(v); };
    var value = o.value != null ? o.value : min;
    var dragging = false;
    var moved = false;

    var el = document.createElement('div');
    el.className = 'dial' + (o.tone ? ' is-' + o.tone : '');
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.setAttribute('role', 'slider');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-valuemin', String(min));
    el.setAttribute('aria-valuemax', String(max));
    el.setAttribute('aria-label', o.label || '값 조절');
    el.setAttribute('aria-orientation', 'horizontal');
    el.innerHTML = '<canvas aria-hidden="true"></canvas>' +
      '<div class="dial-center"><b class="dial-val"></b><small class="dial-sub"></small></div>';
    host.appendChild(el);

    var canvas = el.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var valEl = el.querySelector('.dial-val');
    var subEl = el.querySelector('.dial-sub');

    function snap(v) {
      var s = min + Math.round((v - min) / step) * step;
      return +s.toFixed(6);
    }

    /** 값 → 12시 방향에서 시계 방향 각도(0~TAU) */
    function angleOf(v) {
      var f = wrap ? mod(v - min, span) / span : clamp((v - min) / (max - min || 1), 0, 1);
      return f * TAU;
    }

    function css(name, fb) {
      try {
        var v = getComputedStyle(document.body).getPropertyValue(name).trim();
        return v || fb;
      } catch (e) { return fb; }
    }

    var dpr = 1;
    function draw() {
      if (!canvas) return;
      var rect = el.getBoundingClientRect();
      var W = Math.max(80, Math.round(rect.width));
      var H = Math.max(80, Math.round(rect.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      var cx = W / 2, cy = H / 2;
      var r = Math.min(W, H) / 2 - 10;
      var accent = css('--accent', '#ffd479');
      var accent2 = css('--accent-2', '#7ee0c0');
      var border = 'rgba(255,255,255,0.13)';
      var faint = css('--faint', '#7c88a3');
      var text = css('--text', '#eef2fb');

      // 바탕 원
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fillStyle = 'rgba(8,13,24,0.72)';
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.stroke();

      // 눈금
      var tickStep = o.tickStep || (span / 24);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      for (var i = 0; i < 24; i++) {
        var a = (i / 24) * TAU;
        var r1 = r - 6, r2 = r - (i % 6 === 0 ? 13 : 10);
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
        ctx.lineTo(cx + Math.sin(a) * r2, cy - Math.cos(a) * r2);
        ctx.stroke();
      }

      // 진행 호
      var ang = angleOf(value);
      var start = -Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 3, start, start + ang, false);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();

      // 손잡이
      var kx = cx + Math.sin(ang) * (r - 3);
      var ky = cy - Math.cos(ang) * (r - 3);
      var g = ctx.createRadialGradient(kx, ky, 0, kx, ky, 15);
      g.addColorStop(0, 'rgba(255,236,180,0.55)');
      g.addColorStop(1, 'rgba(255,212,121,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(kx, ky, 15, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.arc(kx, ky, 7, 0, TAU);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 시계 방향 화살표 힌트 (한 바퀴 도는 값일 때)
      if (wrap && o.hint !== false) {
        var hx = cx + Math.sin(0.62) * (r + 0.5), hy = cy - Math.cos(0.62) * (r + 0.5);
        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(0.62);
        ctx.fillStyle = accent2;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(0, -6); ctx.lineTo(4.4, 3); ctx.lineTo(-4.4, 3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      // 글자
      if (o.labels && o.labels.length) {
        ctx.fillStyle = faint;
        ctx.font = '600 10px "Pretendard", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        o.labels.forEach(function (L) {
          var la = angleOf(L.v);
          var lr = r - 27;
          ctx.fillText(L.text, cx + Math.sin(la) * lr, cy - Math.cos(la) * lr);
        });
      }
      if (valEl) {
        valEl.textContent = fmt(value);
        valEl.style.color = text;
      }
      if (o.sub) subEl.textContent = typeof o.sub === 'function' ? o.sub(value) : o.sub;
    }

    function apply(v, opts2) {
      var nv = wrap ? min + mod(snap(v) - min, span) : clamp(snap(v), min, max);
      var prev = value;
      var changed = Math.abs(nv - prev) > 1e-9;
      value = nv;
      el.setAttribute('aria-valuenow', String(value));
      el.setAttribute('aria-valuetext', fmt(value));
      draw();
      if (changed && !(opts2 && opts2.silent) && typeof o.onChange === 'function') {
        var meta = { prev: prev, dir: 0, cross: null };
        var band = span * 0.25;
        if (wrap) {
          if (prev > max - band && nv < min + band) { meta.cross = 'up'; meta.dir = 1; }
          else if (prev < min + band && nv > max - band) { meta.cross = 'down'; meta.dir = -1; }
        }
        if (!meta.dir) meta.dir = nv >= prev ? 1 : -1;
        o.onChange(value, meta);
      }
    }

    /* ----------------------------------------------------- 포인터로 돌리기 */
    function angleAt(ev) {
      var rect = el.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = ev.clientX - cx;
      var dy = ev.clientY - cy;
      return { a: Math.atan2(dx, -dy), d: Math.sqrt(dx * dx + dy * dy), r: rect.width / 2 };
    }

    var lastAngle = 0, acc = 0;

    el.addEventListener('pointerdown', function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      var p = angleAt(ev);
      if (p.d < p.r * 0.32) return;          // 가운데 글자를 눌렀을 때는 무시
      dragging = true;
      moved = false;
      lastAngle = p.a;
      acc = value;
      el.classList.add('is-drag');
      try { el.setPointerCapture(ev.pointerId); } catch (e) { }
      ev.preventDefault();
    });

    el.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      var p = angleAt(ev);
      var d = p.a - lastAngle;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      if (Math.abs(d) > 0.0001) moved = true;
      lastAngle = p.a;
      if (moved) {
        acc += (d / TAU) * span;
        apply(acc);
      }
      ev.preventDefault();
    });

    function endDrag(ev) {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('is-drag');
      try { if (ev && ev.pointerId != null) el.releasePointerCapture(ev.pointerId); } catch (e) { }
      if (typeof o.onCommit === 'function') o.onCommit(value);
    }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    /* --------------------------------------------------------------- 키보드 */
    el.addEventListener('keydown', function (ev) {
      var k = ev.key, d = 0;
      if (k === 'ArrowRight' || k === 'ArrowUp') d = step;
      else if (k === 'ArrowLeft' || k === 'ArrowDown') d = -step;
      else if (k === 'PageUp') d = step * 10;
      else if (k === 'PageDown') d = -step * 10;
      else if (k === 'Home') { ev.preventDefault(); apply(wrap ? min : min); if (typeof o.onCommit === 'function') o.onCommit(value); return; }
      else if (k === 'End') { ev.preventDefault(); apply(wrap ? min + span - step : max); if (typeof o.onCommit === 'function') o.onCommit(value); return; }
      else return;
      ev.preventDefault();
      apply(value + d);
      if (typeof o.onCommit === 'function') o.onCommit(value);
    });

    // 더블 클릭·두 번 탭으로 가운데를 누르면 미세 조정이 아니라 기본값으로 되돌립니다.
    el.addEventListener('dblclick', function () {
      if (o.reset != null) { apply(o.reset); if (typeof o.onCommit === 'function') o.onCommit(value); }
    });

    if (window.ResizeObserver) {
      try { new ResizeObserver(function () { draw(); }).observe(el); } catch (e) { }
    }
    window.addEventListener('resize', draw);

    apply(value, { silent: true });
    return {
      el: el,
      get: function () { return value; },
      set: function (v) { apply(v, { silent: true }); },
      draw: draw
    };
  }

  window.Dial = { create: create };
})();
