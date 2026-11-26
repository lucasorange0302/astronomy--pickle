/* =========================================================================
   도감 사진 카드 (photo-ui.js)
   · 도감 상세 모달·카드에서 천체 사진을 불러와 보여 줍니다.
   · 1순위: assets/space/ 에 내려받은 NASA·허블·제임스웹·탐사선 공개 사진
   · 2순위: RA/Dec 좌표로 NASA SkyView(DSS2) 실제 하늘 탐사 사진
   · 실패·좌표 없음: 깨진 이미지 대신 성도(별지도) 미리보기 SVG
   ========================================================================= */
(function () {
  'use strict';

  var CAT = window.CATALOG_PHOTOS || [];
  var IDX = {};
  var DESIGNATION = /(?:^|[^A-Za-z0-9])(M|NGC|IC)\s*-?\s*(\d{1,4})/i;

  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[\s·・.\-_\u2013\u2014/()]/g, '')
      .replace(/[′'′]/g, '');
  }
  CAT.forEach(function (e) {
    (e.keys || []).forEach(function (k) { IDX[norm(k)] = e; });
  });

  /* ------------------------------------------------------------ 객체 해석 */
  function parseSizeArcmin(str) {
    if (!str || typeof str !== 'string') return null;
    var deg = str.match(/([\d.]+)\s*°/);
    if (deg) return parseFloat(deg[1]) * 60;
    var min = str.match(/([\d.]+)\s*[′']/);
    if (min) return parseFloat(min[1]);
    return null;
  }

  function describe(o) {
    o = o || {};
    var ra = null, dec = null;
    if (typeof o.ra === 'number' && typeof o.dec === 'number') { ra = o.ra; dec = o.dec; }
    else if (typeof o.raH === 'number' && typeof o.decD === 'number') { ra = o.raH * 15; dec = o.decD; }
    var sizeArcmin = typeof o.s === 'number' ? o.s : parseSizeArcmin(o.size);
    var keys = [o.id, o.i, o.name, o.ko, o.en, o.sub, o.M, o.dynamic].filter(Boolean);
    return {
      ra: ra, dec: dec, sizeArcmin: sizeArcmin,
      label: o.name || o.ko || o.en || '천체',
      type: o.type || o.t || '',
      mag: typeof o.mag === 'number' ? o.mag : (typeof o.m === 'number' ? o.m : null),
      keys: keys
    };
  }

  function lookup(d) {
    for (var i = 0; i < d.keys.length; i++) {
      var raw = d.keys[i];
      var e = IDX[norm(raw)];
      if (e) return e;
      var m = String(raw).match(DESIGNATION);
      if (m) {
        e = IDX[norm(m[1] + m[2])];
        if (e) return e;
      }
    }
    return null;
  }

  /* --------------------------------------------------- 실제 하늘 탐사 사진 */
  function isStarType(t) { return /star|항성|변광|이중성/.test(String(t || '')); }
  // 성단은 DSS2 청색 사진이 포화가 적어 별이 또렷합니다.
  function isBlueType(t) { return isStarType(t) || /OCl|GCl|Cl\+N|\*Ass|성단/.test(String(t || '')); }

  function fovFor(d) {
    if (isStarType(d.type)) {
      if (d.mag != null && d.mag <= 1.6) return 3.0;
      if (d.mag != null && d.mag <= 3) return 1.6;
      return 0.9;
    }
    if (d.sizeArcmin) {
      return Math.min(4, Math.max(0.16, (d.sizeArcmin / 60) * 2.4));
    }
    return 0.7;
  }

  function surveyUrl(d) {
    if (d.ra == null || d.dec == null || !isFinite(d.ra) || !isFinite(d.dec)) return null;
    var survey = isBlueType(d.type) ? 'DSS2%20Blue' : 'DSS2%20Red';
    var ra = ((d.ra % 360) + 360) % 360;
    return 'https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl' +
      '?Survey=' + survey +
      '&Position=' + ra.toFixed(4) + ',' + d.dec.toFixed(4) +
      '&Size=' + fovFor(d).toFixed(2) +
      '&Pixels=480&Return=JPEG';
  }

  /* ------------------------------------------------------------ 성도 대체 */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var s = seed || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function fmtRa(ra) {
    if (ra == null) return '—';
    var h = ra / 15, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return hh + 'h ' + (mm < 10 ? '0' : '') + mm + 'm';
  }
  function fmtDec(dec) {
    if (dec == null) return '—';
    var sign = dec < 0 ? '−' : '+', a = Math.abs(dec);
    var d = Math.floor(a), m = Math.round((a - d) * 60);
    return sign + d + '° ' + (m < 10 ? '0' : '') + m + '′';
  }

  function miniChartSvg(d) {
    var rand = rng(hash(d.label || 'sky'));
    var stars = '';
    for (var i = 0; i < 90; i++) {
      var x = (rand() * 320).toFixed(1), y = (rand() * 180).toFixed(1);
      var r = (rand() * 1.1 + 0.35).toFixed(2), o = (rand() * 0.7 + 0.25).toFixed(2);
      stars += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#dfe8ff" opacity="' + o + '"/>';
    }
    var rr = d.sizeArcmin ? Math.max(9, Math.min(46, d.sizeArcmin * 0.5)) : 15;
    return '<svg viewBox="0 0 320 180" role="img" aria-label="' + esc(d.label) + ' 성도 미리보기">' +
      '<rect width="320" height="180" fill="#05080f"/>' +
      '<g class="cp-grid">' +
      '<path d="M0 45h320M0 90h320M0 135h320M80 0v180M160 0v180M240 0v180"/>' +
      '</g>' +
      '<g>' + stars + '</g>' +
      '<circle class="cp-target-ring" cx="160" cy="90" r="' + rr.toFixed(1) + '"/>' +
      '<path class="cp-cross" d="M160 78v-10M160 102v10M148 90h-10M172 90h10"/>' +
      '<text class="cp-chart-name" x="160" y="150" text-anchor="middle">' + esc(d.label) + '</text>' +
      '<text class="cp-chart-meta" x="160" y="166" text-anchor="middle">RA ' + fmtRa(d.ra) + ' · Dec ' + fmtDec(d.dec) + '</text>' +
      '</svg>';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* --------------------------------------------------------------- 카드 생성 */
  function figure(o, opts) {
    opts = opts || {};
    var d = describe(o);
    var entry = lookup(d);
    var survey = surveyUrl(d);

    var fig = document.createElement('figure');
    fig.className = 'catphoto' + (opts.variant === 'modal' ? ' is-modal' : '');
    fig.innerHTML =
      '<div class="cp-media">' +
      '  <div class="cp-skel" aria-hidden="true"><span class="cp-shimmer"></span><span class="cp-skel-txt">실제 하늘 사진 불러오는 중…</span></div>' +
      '  <img alt="' + esc(d.label) + ' 사진" decoding="async">' +
      '  <div class="cp-fallback" hidden></div>' +
      '</div>' +
      '<figcaption class="cp-cap">' +
      '  <span class="cp-title">—</span>' +
      '  <span class="cp-credit">—</span>' +
      '  <a class="cp-link" target="_blank" rel="noopener noreferrer" hidden>원본 보기 ↗</a>' +
      '</figcaption>';

    var media = fig.querySelector('.cp-media');
    var img = fig.querySelector('img');
    var titleEl = fig.querySelector('.cp-title');
    var creditEl = fig.querySelector('.cp-credit');
    var linkEl = fig.querySelector('.cp-link');
    var fallbackEl = fig.querySelector('.cp-fallback');
    var timer = null;
    var settled = false;

    function setState(s) { fig.setAttribute('data-state', s); }

    function showFallback(note) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      img.removeAttribute('src');
      img.style.display = 'none';
      fallbackEl.hidden = false;
      fallbackEl.innerHTML = miniChartSvg(d);
      titleEl.textContent = d.label + ' · 성도 미리보기';
      creditEl.textContent = note || '사진을 불러오지 못해 성도로 대신 표시합니다.';
      var q = (d.keys[0] || d.label || '').toString();
      if (q) {
        linkEl.hidden = false;
        linkEl.href = 'https://images.nasa.gov/search?q=' + encodeURIComponent(q);
        linkEl.textContent = 'NASA 사진 찾기 ↗';
      }
      setState('fallback');
    }

    function ready() {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      setState('ready');
    }

    function withEntry(e) {
      img.src = 'assets/space/' + e.file;
      titleEl.textContent = e.title;
      creditEl.textContent = '사진: ' + e.mission + ' · ' + e.credit + (e.date && e.date !== '—' ? ' (' + e.date + ')' : '');
      if (e.nasa) {
        linkEl.hidden = false;
        linkEl.href = 'https://images.nasa.gov/details/' + encodeURIComponent(e.nasa);
        linkEl.textContent = 'NASA 원본 페이지 ↗';
      } else if (e.survey && d.ra != null) {
        linkEl.hidden = false;
        linkEl.href = 'https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?Survey=DSS2%20Blue&Position=' + d.ra.toFixed(4) + ',' + d.dec.toFixed(4) + '&Size=' + fovFor(d).toFixed(2);
        linkEl.textContent = 'NASA SkyView 원본 ↗';
      }
    }

    img.addEventListener('load', function () {
      if (img.naturalWidth > 0) ready();
      else img.dispatchEvent(new Event('error'));
    });
    img.addEventListener('error', function () {
      if (settled) return;
      if (fig.getAttribute('data-src') === 'local' && survey) {
        fig.setAttribute('data-src', 'survey');
        startSurvey();
        return;
      }
      showFallback('사진을 불러오지 못해 성도로 대신 표시합니다');
    });

    function startSurvey() {
      settled = false;
      img.style.display = '';
      img.src = survey;
      titleEl.textContent = d.label + ' · 실제 하늘 탐사 사진';
      creditEl.textContent = 'DSS2(Digitized Sky Survey 2) · NASA SkyView · RA/Dec 좌표 기반 · 보통 3~7초 걸립니다';
      linkEl.hidden = false;
      linkEl.href = survey.replace('&Return=JPEG', '');
      linkEl.textContent = 'NASA SkyView 원본 ↗';
      media.classList.add('is-survey');
      timer = setTimeout(function () {
        if (!settled) showFallback('탐사 사진 응답이 늦어 성도로 대신 표시합니다');
      }, 20000);
    }

    if (entry) {
      fig.setAttribute('data-src', 'local');
      withEntry(entry);
    } else if (survey) {
      fig.setAttribute('data-src', 'survey');
      startSurvey();
    } else {
      showFallback('이 천체는 공개 사진 좌표가 없습니다');
    }
    return fig;
  }

  /* ------------------------------------------------ 미리 받아 두기(호버) */
  var preloaded = {};
  function prefetch(o) {
    var d = describe(o);
    if (lookup(d)) return;
    var u = surveyUrl(d);
    if (!u || preloaded[u]) return;
    var im = new window.Image();
    im.decoding = 'async';
    im.src = u;
    preloaded[u] = im;
  }

  window.SkyPhoto = {
    figure: figure,
    describe: describe,
    prefetch: prefetch,
    chartSvg: miniChartSvg,
    lookup: function (o) { return lookup(describe(o)); },
    surveyUrl: function (o) { return surveyUrl(describe(o)); }
  };
})();
