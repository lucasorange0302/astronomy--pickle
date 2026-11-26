/* =========================================================================
   gallery.js — 천체 사진 갤러리 (도감 · 라이브 하늘 공통)
   · 도감 상세 모달, 메시에/NGC 도감 모달, 라이브 하늘 정보 시트가 모두 이
     컴포넌트 하나를 씁니다. 천체 하나를 열면 사진이 1장이 아니라 5~6장 이상
     나옵니다.
   · 사진 순서(우선순위)
       1) assets/space/ 에 미리 받아 둔 NASA·허블·제임스웹 사진
          (photo-sets.js 의 천체별 여러 장 + catalog-photos.js 의 대표 사진)
       2) NASA Image and Video Library (images-api.nasa.gov, CORS 허용)
          — 천체 이름으로 검색한 관련 사진 상위 몇 장
       3) NASA SkyView 실제 하늘 탐사 사진 (DSS2 적색·청색·적외선,
          2MASS-K, WISE 3.4, ROSAT X선) — 좌표만 있으면 어떤 천체든 나옵니다
   · 실제로 로드된 사진(naturalWidth > 0)만 셉니다. 깨진 URL·중복 URL은 버리고,
     모두 실패하면 성도(별지도) SVG로 대신 표시합니다.
   · 1/6 카운터 · 썸네일 · 좌우 화살표 · 손가락 스와이프 · 키보드 ←/→ 지원
   ========================================================================= */
(function () {
  'use strict';

  var SETS = window.PHOTO_SETS || {};
  var CAT = window.CATALOG_PHOTOS || [];
  var MEM = {};                       // 천체별 결과 캐시 (30분)
  var MEM_TTL = 30 * 60 * 1000;
  var TARGET = 8;                     // 최대 몇 장까지 보여 줄지 (최소 5~6장은 보장)

  /* ------------------------------------------------------------- 이름 색인 */
  var IDX = {};
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[\s·・.\-_–—/()]/g, '').replace(/[′'′]/g, '');
  }
  CAT.forEach(function (e) {
    (e.keys || []).forEach(function (k) { IDX[norm(k)] = e; });
  });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function parseSizeArcmin(str) {
    if (!str || typeof str !== 'string') return null;
    var deg = str.match(/([\d.]+)\s*°/);
    if (deg) return parseFloat(deg[1]) * 60;
    var min = str.match(/([\d.]+)\s*[′']/);
    if (min) return parseFloat(min[1]);
    return null;
  }

  /* ------------------------------------------------------- 천체 정보 정리 */
  function describe(o) {
    o = o || {};
    var cat = null;
    if (o.objId && window.SKY_DATA && window.SKY_DATA.catalog) {
      cat = window.SKY_DATA.catalog.filter(function (x) { return x.id === o.objId; })[0] || null;
    }
    if (!cat && o.id && window.SKY_DATA && window.SKY_DATA.catalog) {
      cat = window.SKY_DATA.catalog.filter(function (x) { return x.id === o.id; })[0] || null;
    }
    var base = cat || o;

    var ra = null, dec = null;
    if (typeof base.raH === 'number' && typeof base.decD === 'number') { ra = base.raH * 15; dec = base.decD; }
    else if (typeof base.ra === 'number' && typeof base.dec === 'number') { ra = base.ra; dec = base.dec; }
    else if (typeof o.raH === 'number' && typeof o.decD === 'number') { ra = o.raH * 15; dec = o.decD; }
    else if (typeof o.ra === 'number' && typeof o.dec === 'number') { ra = o.ra; dec = o.dec; }

    var sizeArcmin = typeof base.s === 'number' ? base.s
      : typeof o.s === 'number' ? o.s : parseSizeArcmin(base.size || o.size);
    var mag = typeof base.m === 'number' ? base.m
      : typeof base.mag === 'number' ? base.mag
        : typeof o.mag === 'number' ? o.mag : null;

    var ko = base.ko || o.ko || o.name || '';
    var en = base.en || o.en || o.sub || '';
    var M = base.M || o.M || '';
    var id = base.id || o.objId || o.i || o.id || '';
    var type = base.type || o.type || o.t || '';
    var keys = [o.name, o.sub, ko, en, M, id, o.i, o.key].filter(Boolean);
    // photo-sets.js 는 한글 이름으로 묶여 있습니다 (예: '목성').
    var setKey = null;
    [o.name, ko].forEach(function (k) {
      if (!setKey && k && SETS[k]) setKey = k;
    });
    return {
      ko: ko, en: en, M: M, id: id, type: type, setKey: setKey,
      ra: ra, dec: dec, sizeArcmin: sizeArcmin, mag: mag,
      label: o.name || ko || en || '천체',
      sub: o.sub || '',
      keys: keys,
      key: norm([id, ko, en, o.name].filter(Boolean).join('|'))
    };
  }

  function lookupPhotoEntry(d) {
    for (var i = 0; i < d.keys.length; i++) {
      var raw = d.keys[i];
      var e = IDX[norm(raw)];
      if (e) return e;
      var m = String(raw).match(/(?:^|[^A-Za-z0-9])(M|NGC|IC)\s*-?\s*(\d{1,4})/i);
      if (m) { e = IDX[norm(m[1] + m[2])]; if (e) return e; }
    }
    return null;
  }

  /* ------------------------------------------------ 하늘 탐사 사진(SkyView) */
  function isSolarSystem(d) {
    return /행성|위성|달|태양|planet|moon|sun/.test(String(d.type || '')) ||
      /목성|토성|화성|금성|수성|천왕성|해왕성|명왕성|달|태양/.test(d.ko || '');
  }
  function isStarType(t) { return /star|항성|변광|이중성/.test(String(t || '')); }
  function isBlueType(t) { return isStarType(t) || /OCl|GCl|Cl\+N|\*Ass|성단/.test(String(t || '')); }

  function fovFor(d) {
    if (isStarType(d.type)) {
      if (d.mag != null && d.mag <= 1.6) return 3.0;
      if (d.mag != null && d.mag <= 3) return 1.6;
      return 0.9;
    }
    if (d.sizeArcmin) return Math.min(4, Math.max(0.16, (d.sizeArcmin / 60) * 2.4));
    return 0.7;
  }

  var SURVEYS = [
    ['DSS2 Red', '가시광 · DSS2 적색', false],
    ['DSS2 Blue', '가시광 · DSS2 청색', false],
    ['DSS2 IR', '근적외선 · DSS2 IR', false],
    ['2MASS-K', '근적외선 · 2MASS K', true],
    ['WISE 3.4', '중적외선 · WISE 3.4µm', true],
    ['RASS', 'X선 · ROSAT', false]
  ];

  function surveyUrl(d, survey, size, px) {
    if (d.ra == null || d.dec == null || !isFinite(d.ra) || !isFinite(d.dec)) return null;
    var ra = ((d.ra % 360) + 360) % 360;
    return 'https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl' +
      '?Survey=' + encodeURIComponent(survey) +
      '&Position=' + ra.toFixed(4) + ',' + Number(d.dec).toFixed(4) +
      '&Size=' + Number(size).toFixed(2) + '&Pixels=' + (px || 480) + '&Return=JPEG';
  }

  function surveyCandidates(d) {
    if (isSolarSystem(d) || d.ra == null || d.dec == null) return [];
    var size = fovFor(d);
    var out = [];
    SURVEYS.forEach(function (s) {
      var u = surveyUrl(d, s[0], size, 480);
      if (!u) return;
      out.push({
        src: u, thumb: u,
        title: d.label + ' · 실제 하늘 (' + s[1] + ')',
        credit: 'NASA SkyView · ' + s[0] + ' · 좌표 기반 실제 관측 사진',
        link: u.replace('&Return=JPEG', ''),
        rank: 200, slow: s[2]
      });
    });
    return out;
  }

  /* ------------------------------------------------------ NASA 사진 라이브러리 */
  var BAD_WORDS = /(rocket|launch|launchpad|pad\b|liftoff|crew|astronaut|portrait|briefing|press|conference|hangar|facility|building|meeting|ceremony|award|headquarters|center director|poster|logo|patch|ticket|turret|aircraft|bomber|airplane|jet\b|wing\b|engine|museum|library|booth|exhibit|history of)/i;

  function ascii(s) { return /^[\x20-\x7e]+$/.test(String(s || '')); }

  function nasaQueries(d) {
    var qs = [];
    function push(q) {
      q = String(q || '').replace(/\s+/g, ' ').trim();
      if (!q || !ascii(q) || q.length < 3) return;
      if (qs.some(function (x) { return x.toLowerCase() === q.toLowerCase(); })) return;
      qs.push(q);
    }
    var entry = lookupPhotoEntry(d);
    if (entry) {
      (entry.keys || []).forEach(function (k) {
        if (!ascii(k)) return;
        if (/^(m|ngc|ic)\s*\d+$/i.test(k)) return;      // 번호만으로는 NASA 검색이 거의 비어 있습니다
        if (/^[a-z]{3,}(\s+[a-z]{2,})*$/i.test(k)) push(k);
      });
    }
    if (d.en) {
      var en = String(d.en).replace(/^(NGC|IC)(\d)/i, '$1 $2');
      push(en);
    }
    if (d.M && /^M\s*\d+$/i.test(d.M)) push('Messier ' + d.M.replace(/^M\s*/i, ''));
    return qs.slice(0, 2);
  }

  function relevant(item, q) {
    var md = (item.data && item.data[0]) || {};
    var title = String(md.title || '');
    var text = title + ' ' + String(md.description || '');
    if (BAD_WORDS.test(text)) return false;
    if (!title || /^[A-Z]{0,4}[-\d][\w-]*$/.test(title)) return false;   // 'ARC-1990-AC79-7127' 같은 관리번호
    if (/^(ARC|HQ|KSC|JSC|GRC|LRC|SSC)-/i.test(String(md.nasa_id || ''))) return false; // 항공·시설 기록 사진
    var tokens = q.toLowerCase().split(/\s+/).filter(function (t) { return t.length > 2; });
    var low = text.toLowerCase();
    return tokens.length === 0 || tokens.some(function (t) { return low.indexOf(t) >= 0; });
  }

  function nasaSearch(q, n) {
    if (typeof window.fetch !== 'function') return Promise.resolve([]);
    var url = 'https://images-api.nasa.gov/search?media_type=image&page_size=' + n + '&q=' + encodeURIComponent(q);
    return window.fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('nasa ' + r.status);
      return r.json();
    }).then(function (j) {
      var items = (j && j.collection && j.collection.items) || [];
      var out = [];
      var seenTitle = {};
      items.forEach(function (it) {
        if (!relevant(it, q)) return;
        var md = (it.data && it.data[0]) || {};
        var key = String(md.title || '').toLowerCase();
        if (!key || seenTitle[key]) return;
        var href = (it.links && it.links[0] && it.links[0].href) || '';
        if (!href) return;
        seenTitle[key] = 1;
        var thumb = href;
        var big = href.replace(/~thumb\.jpg$/i, '~medium.jpg').replace(/~small\.jpg$/i, '~medium.jpg')
          .replace(/~orig\.jpg$/i, '~medium.jpg');
        out.push({
          src: big, thumb: thumb,
          title: md.title || q,
          credit: 'NASA Image Library' + (md.center ? ' · ' + md.center : '') +
            (md.date_created ? ' · ' + String(md.date_created).slice(0, 10) : ''),
          link: md.nasa_id ? 'https://images.nasa.gov/details/' + encodeURIComponent(md.nasa_id) : '',
          nasa: md.nasa_id || '', rank: 100
        });
      });
      var toks = q.toLowerCase().split(/\s+/).filter(function (t) { return t.length > 2; });
      out.sort(function (a, b) {
        var ta = toks.some(function (t) { return String(a.title).toLowerCase().indexOf(t) >= 0; }) ? 0 : 1;
        var tb = toks.some(function (t) { return String(b.title).toLowerCase().indexOf(t) >= 0; }) ? 0 : 1;
        return ta - tb;
      });
      return out;
    }).catch(function () { return []; });
  }

  /* ------------------------------------------------------------ 후보 모으기 */
  function localCandidates(d) {
    var out = [];
    var set = d.setKey && SETS[d.setKey];
    if (set) {
      set.forEach(function (p) {
        out.push({
          src: p.src, thumb: p.src, title: p.title || d.label,
          credit: '사진: ' + (p.credit || 'NASA') + (p.date ? ' (' + p.date + ')' : ''),
          link: p.link || '', rank: 0
        });
      });
    }
    var e = lookupPhotoEntry(d);
    if (e) {
      out.push({
        src: 'assets/space/' + e.file, thumb: 'assets/space/' + e.file,
        title: e.title || d.label,
        credit: '사진: ' + (e.mission || 'NASA') + ' · ' + (e.credit || '') +
          (e.date && e.date !== '—' ? ' (' + e.date + ')' : ''),
        link: e.nasa ? 'https://images.nasa.gov/details/' + encodeURIComponent(e.nasa) : '',
        rank: 1
      });
    }
    return out;
  }

  /* ------------------------------------------------------------- 이미지 검사 */
  function loadOne(c) {
    return new Promise(function (resolve) {
      var im = new Image();
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(false); } }, c.slow ? 32000 : 15000);
      im.onload = function () {
        if (done) return;
        if (im.naturalWidth > 0) { done = true; clearTimeout(timer); resolve(true); }
        else { im.onerror && im.onerror(); }
      };
      im.onerror = function () {
        if (done) return;
        if (c.thumb && c.thumb !== c.src) { c.src = c.thumb; im.src = c.thumb; return; }
        done = true; clearTimeout(timer); resolve(false);
      };
      try { im.referrerPolicy = 'no-referrer'; } catch (e) { /* ignore */ }
      im.src = c.src;
    });
  }

  function runQueue(list, concurrency, shouldStop, onOk) {
    return new Promise(function (resolve) {
      if (!list.length) { resolve(); return; }
      var i = 0, active = 0, finished = false;
      function pump() {
        if (finished) return;
        if (shouldStop() || i >= list.length) {
          if (active === 0) { finished = true; resolve(); }
          return;
        }
        var c = list[i++];
        active++;
        loadOne(c).then(function (ok) { if (ok) onOk(c); }).then(function () {
          active--;
          if (shouldStop()) {
            if (active === 0) { finished = true; resolve(); }
            return;
          }
          pump();
        });
      }
      for (var k = 0; k < Math.min(concurrency, list.length); k++) pump();
    });
  }

  /* ------------------------------------------------------------------ 카드 */
  function create(o, opts) {
    opts = opts || {};
    var d = describe(o);
    var fig = document.createElement('figure');
    fig.className = 'sg' + (opts.variant === 'modal' ? ' is-modal' : '') + (opts.variant === 'sheet' ? ' is-sheet' : '');
    fig.setAttribute('role', 'group');
    fig.setAttribute('aria-label', d.label + ' 사진 갤러리');
    fig.innerHTML =
      '<div class="sg-shot" tabindex="0">' +
      '  <div class="sg-skel" aria-hidden="true"><span class="sg-shimmer"></span><span class="sg-skel-txt">사진 불러오는 중…</span></div>' +
      '  <img class="sg-img" alt="' + esc(d.label) + ' 사진" decoding="async" draggable="false" hidden>' +
      '  <div class="sg-fallback" hidden></div>' +
      '  <span class="sg-count">0/0</span>' +
      '  <button class="sg-arrow sg-prev" type="button" aria-label="이전 사진" hidden>‹</button>' +
      '  <button class="sg-arrow sg-next" type="button" aria-label="다음 사진" hidden>›</button>' +
      '</div>' +
      '<figcaption class="sg-cap">' +
      '  <b class="sg-title">—</b><span class="sg-credit">—</span>' +
      '  <a class="sg-link" target="_blank" rel="noopener noreferrer" hidden>원본 보기 ↗</a>' +
      '</figcaption>' +
      '<div class="sg-thumbs" role="tablist" aria-label="사진 목록"></div>';

    var shot = fig.querySelector('.sg-shot');
    var img = fig.querySelector('.sg-img');
    var skel = fig.querySelector('.sg-skel');
    var fb = fig.querySelector('.sg-fallback');
    var countEl = fig.querySelector('.sg-count');
    var prevBtn = fig.querySelector('.sg-prev');
    var nextBtn = fig.querySelector('.sg-next');
    var titleEl = fig.querySelector('.sg-title');
    var creditEl = fig.querySelector('.sg-credit');
    var linkEl = fig.querySelector('.sg-link');
    var thumbsEl = fig.querySelector('.sg-thumbs');

    var S = { items: [], idx: 0, alive: true, loading: true, urls: {} };
    fig.__gallery = S;

    function stop() { return S.items.length >= TARGET; }

    function addItem(c) {
      if (!S.alive || S.urls[c.src]) return;
      if (S.items.length >= TARGET) return;          // 너무 많으면 느려집니다
      S.urls[c.src] = 1;
      var item = {
        src: c.src, thumb: c.thumb || c.src, title: c.title, credit: c.credit,
        link: c.link, rank: c.rank || 0
      };
      var cur = S.items[S.idx] || null;               // 지금 보여 주는 사진은 그대로 유지
      var at = S.items.length;
      for (var i = 0; i < S.items.length; i++) {
        if (item.rank < S.items[i].rank) { at = i; break; }
      }
      S.items.splice(at, 0, item);
      if (cur && S.touched) {
        var keep = S.items.indexOf(cur);
        if (keep >= 0) S.idx = keep;
      } else {
        S.idx = 0;                                    // 사용자가 넘기기 전에는 가장 좋은 사진부터
      }
      draw();
    }

    function draw() {
      var n = S.items.length;
      fig.setAttribute('data-loaded', String(n));
      countEl.textContent = n ? (S.idx + 1) + '/' + n : '0/0';
      countEl.hidden = !n;
      prevBtn.hidden = n < 2;
      nextBtn.hidden = n < 2;

      if (!n) return;
      if (S.idx >= n) S.idx = n - 1;
      var it = S.items[S.idx];
      skel.hidden = true;
      fb.hidden = true;
      img.hidden = false;
      img.src = it.src;
      img.alt = (it.title || d.label) + ' 사진';
      titleEl.textContent = it.title || d.label;
      creditEl.textContent = it.credit || '';
      if (it.link) { linkEl.hidden = false; linkEl.href = it.link; }
      else linkEl.hidden = true;

      thumbsEl.innerHTML = S.items.map(function (t, k) {
        return '<button type="button" class="sg-thumb' + (k === S.idx ? ' is-active' : '') + '"' +
          ' data-i="' + k + '" role="tab" aria-selected="' + (k === S.idx) + '"' +
          ' aria-label="사진 ' + (k + 1) + '">' +
          '<img src="' + esc(t.thumb) + '" alt="" loading="lazy" decoding="async"></button>';
      }).join('');
      var nx = S.items[(S.idx + 1) % n];
      if (nx) { var pre = new Image(); pre.src = nx.src; }
    }

    function go(i) {
      var n = S.items.length;
      if (!n) return;
      S.touched = true;
      S.idx = ((i % n) + n) % n;
      draw();
    }

    function fallback(note) {
      S.loading = false;
      fig.setAttribute('data-state', 'fallback');
      skel.hidden = true;
      img.hidden = true;
      fb.hidden = false;
      var svg = (window.SkyPhoto && window.SkyPhoto.chartSvg) ? window.SkyPhoto.chartSvg(d) : '';
      fb.innerHTML = svg + '<small>' + esc(note || '사진을 불러오지 못해 성도로 대신 표시합니다.') + '</small>';
      titleEl.textContent = d.label + ' · 성도 미리보기';
      creditEl.textContent = note || '';
      linkEl.hidden = false;
      linkEl.href = 'https://images.nasa.gov/search?q=' + encodeURIComponent(d.en || d.ko || d.label);
      linkEl.textContent = 'NASA 사진 찾기 ↗';
    }

    function finish() {
      if (!S.alive) return;
      S.loading = false;
      if (!S.items.length) { fallback(); return; }
      fig.setAttribute('data-state', 'ready');
      var m = MEM[d.key];
      if (!m || m.items.length < S.items.length) MEM[d.key] = { ts: Date.now(), items: S.items.slice() };
    }

    /* 캐시가 있으면 즉시 표시 */
    var cached = MEM[d.key];
    if (cached && Date.now() - cached.ts < MEM_TTL && cached.items.length) {
      S.items = cached.items.slice();
      S.loading = false;
      draw();
      fig.setAttribute('data-state', 'ready');
      return fig;
    }

    function start() {
      var local = localCandidates(d);
      local.forEach(function (c, i) { c.rank = i; });

      runQueue(local, 5, stop, addItem).then(function () {
        if (stop()) return null;
        // 항성은 NASA 이미지 검색 결과에 로켓·항공기 같은 동명 자료가 섞여
        // 오히려 엉뚱한 사진이 나옵니다. 별은 실제 하늘 탐사 사진으로만 채웁니다.
        if (isStarType(d.type)) return null;
        var qs = nasaQueries(d);
        if (!qs.length) return null;
        return nasaSearch(qs[0], 8).then(function (list) {
          if (!list.length && qs[1]) return nasaSearch(qs[1], 6);
          if (qs[1] && list.length < 5) {
            return nasaSearch(qs[1], 6).then(function (more) { return list.concat(more); });
          }
          return list;
        }).then(function (list) {
          var seen = {};
          var fresh = [];
          list.forEach(function (c) {
            if (!c.src || seen[c.src]) return;
            seen[c.src] = 1;
            fresh.push(c);
          });
          fresh.forEach(function (c, i) { c.rank = 100 + i; });
          return runQueue(fresh, 5, stop, addItem);
        });
      }).then(function () {
        if (stop()) return null;
        var sv = surveyCandidates(d);
        sv.forEach(function (c, i) { c.rank = 200 + i; });
        return runQueue(sv, 3, stop, addItem);
      }).then(finish).catch(function () { finish(); });
    }
    start();

    /* 상호작용 */
    prevBtn.addEventListener('click', function (e) { e.stopPropagation(); go(S.idx - 1); });
    nextBtn.addEventListener('click', function (e) { e.stopPropagation(); go(S.idx + 1); });
    thumbsEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-i]') : null;
      if (b) go(Number(b.getAttribute('data-i')));
    });
    shot.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(S.idx + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(S.idx - 1); }
    });
    var sx = null, sy = null;
    shot.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    shot.addEventListener('touchend', function (e) {
      if (sx == null || !e.changedTouches || !e.changedTouches.length) { sx = null; return; }
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      sx = null; sy = null;
      if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.3) go(S.idx + (dx < 0 ? 1 : -1));
    }, { passive: true });

    return fig;
  }

  /* ------------------------------------------------- 미리 받아 두기(호버) */
  function prefetch(o) {
    var d = describe(o);
    if (MEM[d.key]) return;
    localCandidates(d).slice(0, 1).forEach(function (c) {
      var im = new Image(); im.src = c.src;
    });
  }

  window.SkyGallery = {
    create: create,
    prefetch: prefetch,
    describe: describe,
    nasaQueries: nasaQueries,
    surveyCandidates: surveyCandidates
  };
})();
