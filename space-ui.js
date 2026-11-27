/* 🍪 우주 쿠키 · 🛰️ NASA·SpaceX 관측 자료관 · 🌌 전체 하늘 도감 · 🤖 AI 천문 도우미
   space-data.js / data-catalog.js 를 읽어 화면을 만든다. */
(function () {
  'use strict';

  var SD = window.SPACE_DATA || { COOKIES: [], GALLERY: [], CAT: {}, SRC: {} };
  var SC = window.SPACE_CATALOG || { items: [], meta: {} };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 사진이 없을 때 <img> 에 남겨 두는 1×1 투명 GIF — 빈 src(깨진 이미지) 대신 씁니다.
  var BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nf(v, d) { return (v == null || !isFinite(v)) ? '—' : Number(v).toFixed(d == null ? 0 : d); }
  function store(k, v) {
    try {
      if (v === undefined) {
        var s = localStorage.getItem('ob.' + k);
        if (s == null) return null;
        var parsed = JSON.parse(s);
        // 이 저장소의 키(ai.provider·ai.model·ai.endpoint·ai.key.*)는 모두 문자열입니다.
        // 손상되어 객체·배열이 들어 있으면 없는 값으로 봅니다.
        if (parsed !== null && typeof parsed === 'object') return null;
        return parsed;
      }
      localStorage.setItem('ob.' + k, JSON.stringify(v));
    } catch (e) { }
    return null;
  }
  function josa(word, a, b) {
    var ch = String(word || '').charCodeAt(String(word || '').length - 1);
    if (ch < 0xac00 || ch > 0xd7a3) return a + '(' + b + ')';
    return (ch - 0xac00) % 28 === 0 ? b : a;
  }

  var STATE = { cookie: 0, cookieSeen: store('ck.seen') || [], catPage: 0, catPer: 40, lightbox: null, lbIndex: 0, lbList: [] };

  /* ======================================================================
     공통: 하늘 조준
     ====================================================================== */
  function aimAt(o) {
    if (!window.OneulBam) return;
    if (o.planet) { window.OneulBam.aimAt('planet', o.planet); closeAll(); return; }
    if (o.moon) { window.OneulBam.aimAt('moon', ''); closeAll(); return; }
    if (o.ra != null && o.dec != null) { window.OneulBam.aimRaDec(o.ra, o.dec, o.name || '천체'); closeAll(); return; }
    toastLocal('이 천체는 좌표가 없어 조준할 수 없습니다.');
  }
  function toastLocal(msg) {
    var t = $('#spaceToast');
    if (!t) { t = document.createElement('div'); t.id = 'spaceToast'; t.className = 'space-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove('is-on'); }, 2600);
  }

  /* ======================================================================
     플로팅 독 (모바일에서는 하단 바)
     ====================================================================== */
  function buildDock() {
    var dock = document.createElement('div');
    dock.className = 'space-dock';
    dock.id = 'spaceDock';
    dock.setAttribute('role', 'group');
    dock.setAttribute('aria-label', '우주 쿠키 · 관측 자료관 · AI 도우미');
    dock.innerHTML =
      '<button class="sd-btn" data-dock="cookie" aria-label="오늘의 우주 쿠키 열기"><span class="sd-ico" aria-hidden="true">🍪</span><span class="sd-txt">우주 쿠키</span></button>' +
      '<button class="sd-btn" data-dock="gallery" aria-label="NASA·SpaceX 관측 자료관으로 이동"><span class="sd-ico" aria-hidden="true">🛰️</span><span class="sd-txt">자료관</span></button>' +
      '<button class="sd-btn" data-dock="ai" aria-label="AI 천문 도우미 열기"><span class="sd-ico" aria-hidden="true">🤖</span><span class="sd-txt">AI 질문</span></button>';
    document.body.appendChild(dock);
    dock.addEventListener('click', function (e) {
      var b = e.target.closest('[data-dock]');
      if (!b) return;
      var k = b.getAttribute('data-dock');
      if (k === 'cookie') openCookie();
      else if (k === 'gallery') { closeAll(); var s = $('#spacearchive'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else openAI();
    });
  }

  /* ======================================================================
     🍪 우주 쿠키 드로어
     ====================================================================== */
  var CK = {
    view: 'draw', manifest: null, total: 0, per: 200, lazy: false,
    chunks: {}, loading: {}, state: 'idle', cat: ''
  };

  function buildCookie() {
    var d = document.createElement('div');
    d.className = 'space-drawer ck-drawer';
    d.id = 'cookieDrawer';
    d.hidden = true;
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-labelledby', 'ckTitle');
    d.innerHTML =
      '<div class="sd-backdrop" data-close="1"></div>' +
      '<div class="sd-panel ck-panel">' +
      '  <header class="sd-head">' +
      '    <div><p class="sd-eyebrow">NASA · SpaceX · 태양계 · 심우주</p><h3 id="ckTitle">🍪 오늘의 우주 쿠키</h3></div>' +
      '    <button class="sd-close" data-close="1" aria-label="닫기">×</button>' +
      '  </header>' +
      '  <div class="ck-body" id="ckBody"></div>' +
      '  <footer class="sd-foot"><span id="ckFoot">출처는 각 쿠키에 표시됩니다 · 수집 2026-11-26</span>' +
      '    <button class="mini-btn" data-ck="all">전체 쿠키 모아보기</button></footer>' +
      '</div>';
    document.body.appendChild(d);

    d.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { closeAll(); return; }
      var act = e.target.closest('[data-ck]');
      if (!act) return;
      var a = act.getAttribute('data-ck');
      if (a === 'crack') crackCookie();
      else if (a === 'again') { CK.view = 'draw'; STATE.cookie = pickCookie(); renderCookie(); crackCookie(); }
      else if (a === 'all') { CK.view = 'list'; renderCookie(); }
      else if (a === 'back') { CK.view = 'draw'; renderCookie(); }
      else if (a === 'aim') aimAtCookie(currentCookie());
      else if (a === 'item') { STATE.cookie = +act.getAttribute('data-i'); CK.view = 'draw'; renderCookie(); }
      else if (a === 'cat') { CK.cat = act.getAttribute('data-cat') || ''; CK.view = 'list'; renderCookie(); }
      else if (a === 'more') loadMoreCookieChunks();
      else if (a === 'allchunks') loadAllCookieChunks();
    });
    renderCookie();
    loadCookieManifest();
  }

  /* ---------- 쿠키 지연 로딩: 2,000개를 200개씩 나눠 필요한 묶음만 받습니다 ---------- */
  function loadCookieManifest() {
    if (CK.state !== 'idle') return;
    CK.state = 'loading';
    fetchJSON(CK_BASE + 'manifest.json').then(function (m) {
      CK.manifest = m;
      CK.total = m.total || 0;
      CK.per = m.perChunk || 200;
      CK.lazy = CK.total > SD.COOKIES.length;
      CK.state = 'ready';
      var foot = $('#ckFoot');
      if (foot) foot.textContent = '출처는 각 쿠키에 표시됩니다 · 우주 쿠키 ' + CK.total.toLocaleString('en-US') + '개 · 200개씩 나눠 불러옴';
      if (CK.view === 'draw') renderCookie();
    }).catch(function () {
      CK.state = 'error';
      var foot = $('#ckFoot');
      if (foot) foot.textContent = '오프라인 · 내장 쿠키 ' + SD.COOKIES.length + '개로 뜯습니다';
    });
  }

  function cookieCount() { return CK.lazy ? CK.total : SD.COOKIES.length; }

  function chunkOf(i) { return Math.floor(i / CK.per); }

  function cookieAt(i) {
    if (!CK.lazy) return SD.COOKIES[i] || null;
    var n = chunkOf(i);
    var list = CK.chunks[n];
    return (list && list[i % CK.per]) || null;
  }

  function currentCookie() {
    if (!CK.lazy) return SD.COOKIES[STATE.cookie] || SD.COOKIES[0] || null;
    return cookieAt(STATE.cookie);
  }

  function loadCookieChunk(n) {
    if (CK.chunks[n]) return Promise.resolve(CK.chunks[n]);
    if (CK.loading[n]) return CK.loading[n];
    var file = (CK.manifest && CK.manifest.chunks && CK.manifest.chunks[n])
      ? CK.manifest.chunks[n].file
      : 'k' + (n < 10 ? '0' + n : n) + '.json';
    CK.loading[n] = fetchJSON(CK_BASE + file).then(function (d) {
      CK.chunks[n] = (d && d.items) || [];
      delete CK.loading[n];
      return CK.chunks[n];
    }).catch(function (e) { delete CK.loading[n]; throw e; });
    return CK.loading[n];
  }

  function loadedCookieCount() {
    var n = 0;
    Object.keys(CK.chunks).forEach(function (k) { n += CK.chunks[k].length; });
    return n;
  }

  function loadMoreCookieChunks() {
    if (!CK.lazy) return;
    var next = -1;
    for (var i = 0; i < Math.ceil(CK.total / CK.per); i++) if (!CK.chunks[i]) { next = i; break; }
    if (next < 0) return;
    var body = $('#ckBody');
    var note = body && $('.ck-list-more', body);
    if (note) note.innerHTML = '<span class="ck-total">더 불러오는 중…</span>';
    loadCookieChunk(next).then(function () { renderCookie(); }).catch(function () { renderCookie(); });
  }

  function loadAllCookieChunks() {
    if (!CK.lazy) return;
    var total = Math.ceil(CK.total / CK.per);
    var seq = Promise.resolve();
    for (var i = 0; i < total; i++) {
      (function (n) {
        seq = seq.then(function () {
          if (CK.chunks[n]) return null;
          var body = $('#ckBody');
          var note = body && $('#ckLoadNote');
          if (note) note.textContent = '쿠키를 모으는 중… ' + loadedCookieCount().toLocaleString('en-US') + ' / ' + CK.total.toLocaleString('en-US');
          return loadCookieChunk(n).then(function () { if (CK.view === 'list') renderCookie(); }).catch(function () { });
        });
      })(i);
    }
    seq.then(function () { renderCookie(); });
  }

  function pickCookie() {
    var n = cookieCount();
    if (!n) return 0;
    var seen = (STATE.cookieSeen || []).filter(function (i) { return i < n; });
    var left = [];
    for (var i = 0; i < n; i++) if (seen.indexOf(i) < 0) left.push(i);
    if (!left.length) { left = []; for (var j = 0; j < n; j++) left.push(j); }
    var pick = left[Math.floor(Math.random() * left.length)];
    seen.push(pick);
    if (seen.length > n) seen = [pick];
    STATE.cookieSeen = seen; store('ck.seen', seen);
    return pick;
  }

  function aimAtCookie(c) {
    if (!c || !c.aim) { toastLocal('이 쿠키에는 연결된 천체가 없습니다.'); return; }
    var a = c.aim;
    if (a.key === 'moon') return aimAt({ moon: true });
    if (a.key && !a.ra) return aimAt({ planet: String(a.key).toLowerCase(), name: a.name });
    return aimAt({ ra: a.ra, dec: a.dec, name: a.name });
  }

  function crackCookie() {
    var shell = $('#ckShell');
    if (!shell || reduced) { showCookieResult(); return; }
    shell.classList.add('is-cracking');
    setTimeout(showCookieResult, 620);
  }

  function showCookieResult() {
    var r = $('#ckResult'), s = $('#ckShell');
    if (s) { s.classList.add('is-open'); s.classList.add('is-done'); }
    if (r) {
      r.hidden = false; r.classList.add('is-on');
      if (r.scrollIntoView) setTimeout(function () { r.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' }); }, 40);
    }
    var c = currentCookie();
    if (c && c.aim) {
      var b = $('[data-ck="aim"]', r || document);
      if (b) b.hidden = false;
    }
  }

  function renderCookie() {
    var body = $('#ckBody');
    if (!body) return;
    if (CK.view === 'list') { renderCookieList(body); return; }
    var n = cookieCount();
    if (!n) { body.innerHTML = '<p class="ck-empty">쿠키 데이터를 불러오지 못했습니다.</p>'; return; }
    if (STATE.cookie == null || STATE.cookie >= n) STATE.cookie = pickCookie();
    var c = currentCookie();
    if (!c) {
      // 고른 쿠키가 든 묶음만 받아 옵니다.
      body.innerHTML = '<div class="ck-loading"><span class="spin"></span>쿠키를 불러오는 중…</div>';
      loadCookieChunk(chunkOf(STATE.cookie)).then(function () { renderCookie(); })
        .catch(function () {
          CK.lazy = false;
          STATE.cookie = pickCookie();
          renderCookie();
        });
      return;
    }
    var cat = (SD.CAT[c.c] || { label: c.c, icon: '🍪' });
    var src = (SD.SRC[c.src] || { name: c.src, url: '#' });
    body.innerHTML =
      '<div class="ck-stage" id="ckShell">' +
      '  <div class="ck-halves" aria-hidden="true"><span class="ck-half l"></span><span class="ck-half r"></span></div>' +
      '  <button class="ck-btn" data-ck="crack" aria-label="쿠키를 뜯어 오늘의 우주 사실 보기">' +
      '    <span class="ck-emoji" aria-hidden="true">🍪</span>' +
      '    <span class="ck-btn-txt">쿠키 뜯기</span>' +
      '  </button>' +
      '  <p class="ck-hint">누르면 오늘의 우주 사실이 하나 나옵니다 — ' + n.toLocaleString('en-US') + '개 중 하나</p>' +
      '</div>' +
      '' +
      '<article class="ck-result" id="ckResult" hidden>' +
      '  <div class="ck-meta"><span class="ck-cat" data-c="' + esc(c.c) + '">' + cat.icon + ' ' + esc(cat.label) + '</span>' +
      '    <span class="ck-idx">#' + (STATE.cookie + 1) + ' / ' + n.toLocaleString('en-US') + '</span></div>' +
      '  <h4 class="ck-title">' + esc(c.t) + '</h4>' +
      '  <div class="ck-stat">' + esc(c.s) + '</div>' +
      '  <p class="ck-desc">' + esc(c.d) + '</p>' +
      '  <a class="ck-src" href="' + esc(src.url) + '" target="_blank" rel="noopener noreferrer">출처 · ' + esc(src.name) + ' ↗</a>' +
      '  <div class="ck-actions">' +
      '    <button class="btn btn-primary btn-sm" data-ck="again">🍪 다른 쿠키 뜯기</button>' +
      '    <button class="btn btn-ghost btn-sm" data-ck="all">전체 모아보기</button>' +
      '    <button class="btn btn-ghost btn-sm" data-ck="aim" hidden>🎯 관련 천체 조준</button>' +
      '  </div>' +
      '</article>' +
      '<div class="ck-sky" id="ckSky"></div>' +
      '<div class="ck-recent" id="ckRecent"></div>';
    if (!reduced) {
      var shell = $('#ckShell');
      if (shell) { shell.classList.remove('is-open'); }
    }
    renderRecent(); renderSkyMini();
    var foot = $('#ckFoot');
    if (foot) foot.textContent = CK.lazy
      ? '출처는 각 쿠키에 표시됩니다 · 우주 쿠키 ' + n.toLocaleString('en-US') + '개 · 200개씩 나눠 불러옴'
      : '출처는 각 쿠키에 표시됩니다 · 수집 2026-11-26';
  }

  function renderRecent() {
    var box = $('#ckRecent');
    if (!box) return;
    var seen = (STATE.cookieSeen || []).slice(0, -1).slice(-3).reverse();
    var shown = [];
    seen.forEach(function (i) {
      var c = cookieAt(i);
      if (c) shown.push({ c: c, i: i });
    });
    if (shown.length) {
      box.innerHTML = '<p class="ck-recent-title">방금 뜯은 쿠키</p><div class="ck-recent-list">' + shown.map(function (x) {
        return '<button class="ck-recent-item" data-ck="item" data-i="' + x.i + '"><span>' + esc(x.c.t) + '</span><em>' + esc(x.c.s) + '</em></button>';
      }).join('') + '</div>';
      return;
    }
    box.innerHTML = '<p class="ck-recent-title">카테고리별로 모아보기</p><div class="ck-cat-row">' +
      '<button class="ck-cat" data-ck="cat" data-cat="" data-list="1">🍪 전체</button>' +
      Object.keys(SD.CAT).map(function (k) { return '<button class="ck-cat" data-c="' + k + '" data-ck="cat" data-cat="' + k + '" data-list="1">' + SD.CAT[k].icon + ' ' + esc(SD.CAT[k].label) + '</button>'; }).join('') + '</div>';
  }

  function renderSkyMini() {
    var box = $('#ckSky');
    if (!box) return;
    try {
      var st = window.OneulBam.state, c = st.last || window.OneulBam.computeNight();
      var pl = (c.planets || []).filter(function (p) { return p.hor && p.hor.alt > 10 && p.mag != null && p.mag < 6.5; }).sort(function (a, b) { return a.mag - b.mag; })[0];
      box.innerHTML = '<p class="ck-recent-title">지금 하늘</p><div class="ck-sky-row">' +
        '<div><span>관측지</span><strong>' + esc(st.site.name) + '</strong></div>' +
        '<div><span>달</span><strong>' + esc(c.phase.name) + ' ' + Math.round(c.phase.illum * 100) + '%</strong></div>' +
        '<div><span>관측지수</span><strong>' + c.score + '/100</strong></div>' +
        (pl ? '<div><span>뜬 행성</span><strong>' + esc(pl.name) + ' ' + pl.hor.alt.toFixed(0) + '°</strong></div>' : '') +
        '</div>';
    } catch (e) { box.innerHTML = ''; }
  }

  function renderCookieList(body) {
    var cats = [['', '전체']].concat(Object.keys(SD.CAT).map(function (k) { return [k, SD.CAT[k].label]; }));
    var cur = CK.cat || '';
    var rows = [];
    var max = CK.lazy ? CK.total : SD.COOKIES.length;
    for (var i = 0; i < max; i++) {
      var c = cookieAt(i);
      if (!c) continue;
      if (cur && c.c !== cur) continue;
      rows.push({ c: c, i: i });
    }
    var loaded = CK.lazy ? loadedCookieCount() : SD.COOKIES.length;
    body.innerHTML =
      '<div class="ck-list-head"><button class="mini-btn" data-ck="back">← 뽑기로</button>' +
      '<span class="ck-list-count">' + rows.length.toLocaleString('en-US') + '개</span></div>' +
      '<div class="chip-row ck-chips">' + cats.map(function (p) {
        return '<button class="chip' + (cur === p[0] ? ' is-active' : '') + '" data-ck="cat" data-cat="' + esc(p[0]) + '">' + esc(p[1]) + '</button>';
      }).join('') + '</div>' +
      (CK.lazy
        ? '<p class="ck-total" id="ckLoadNote">불러온 쿠키 ' + loaded.toLocaleString('en-US') + ' / ' + max.toLocaleString('en-US') + ' · 200개씩 나눠 받습니다</p>'
        : '') +
      '<div class="ck-list">' + rows.map(function (x) {
        var cat = SD.CAT[x.c.c] || { label: x.c.c, icon: '🍪' };
        return '<button class="ck-item" data-ck="item" data-i="' + x.i + '">' +
          '<span class="ck-item-cat">' + cat.icon + ' ' + esc(cat.label) + '</span>' +
          '<strong>' + esc(x.c.t) + '</strong>' +
          '<span class="ck-item-stat">' + esc(x.c.s) + '</span></button>';
      }).join('') + '</div>' +
      (CK.lazy && loaded < max
        ? '<div class="ck-list-more"><button class="mini-btn" data-ck="more">다음 200개 불러오기</button>' +
          '<button class="mini-btn" data-ck="allchunks">2,000개 모두 불러오기</button></div>'
        : '');
    var foot = $('#ckFoot');
    if (foot && CK.lazy) foot.textContent = '출처는 각 쿠키에 표시됩니다 · 우주 쿠키 ' + max.toLocaleString('en-US') + '개 · 200개씩 나눠 불러옴';
  }

  function openCookie() {
    closeAll();
    var d = $('#cookieDrawer');
    if (!d) return;
    d.hidden = false;
    document.body.classList.add('space-lock');
    var ck = $('.sd-close', d); if (ck) ck.focus();
    if (CK.state === 'idle') loadCookieManifest();
    if (CK.view === 'draw' && STATE.cookie == null) renderCookie();
    else renderCookie();
  }

  /* ======================================================================
     🛰️ NASA·SpaceX 관측 자료관 섹션
     ====================================================================== */
  function buildGallerySection() {
    var main = $('main');
    if (!main) return;
    var sec = document.createElement('section');
    sec.className = 'section space-archive';
    sec.id = 'spacearchive';
    var tags = [['', '전체'], ['nasa', 'NASA'], ['spacex', 'SpaceX'], ['moon', '달·행성'], ['sun', '태양'], ['earth', '지구']];
    sec.innerHTML =
      '<div class="wrap">' +
      '  <div class="section-head">' +
      '    <p class="eyebrow">관측 자료관 · 실제 사진</p>' +
      '    <h2>NASA·SpaceX가 보낸 <span class="grad">진짜 사진</span>으로 보는 우주</h2>' +
      '    <p class="section-sub">제임스 웹·허블·SDO·카시니·주노·퍼서비어런스와 SpaceX 팰컨 9·크루 드래곤. 2026-11-26에 공식 공개 자료에서 내려받은 원본을 카드로 모았습니다. 카드를 누르면 큰 사진과 촬영 정보가 함께 열립니다.</p>' +
      '  </div>' +
      '  <div class="chip-row" id="saChips">' + tags.map(function (t) {
        return '<button class="chip' + (t[0] === '' ? ' is-active' : '') + '" data-sa="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '  <p class="result-count" id="saCount">—</p>' +
      '  <div class="sa-grid" id="saGrid"></div>' +
      '  <p class="sa-note">사진은 NASA 공개 이미지(퍼블릭 도메인)·SpaceX/NASA 공동 촬영본입니다. 각 카드의 원본 링크에서 고해상도 파일을 받을 수 있습니다. 전체 목록과 데이터는 <code>downloads/space-archive/</code>에 정리했습니다.</p>' +
      '</div>';
    var cal = $('#calendar');
    if (cal && cal.parentNode) cal.parentNode.insertBefore(sec, cal);
    else main.appendChild(sec);

    sec.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-sa]');
      if (chip) {
        $$('#saChips .chip').forEach(function (b) { b.classList.toggle('is-active', b === chip); });
        renderGallery(chip.getAttribute('data-sa'));
        return;
      }
      var card = e.target.closest('[data-gal]');
      if (card) {
        var i = +card.getAttribute('data-gal');
        var vis = STATE.galVis || SD.GALLERY.map(function (g, k) { return k; });
        STATE.lbList = vis; STATE.lbIndex = Math.max(0, vis.indexOf(i));
        openLightbox();
      }
    });
    renderGallery('');
  }

  function galTag(g) {
    if (/falcon|crew|dragon|spacex/i.test(g.mission + g.title)) return 'spacex';
    if (/SDO|SOHO|태양/.test(g.mission + g.obj)) return 'sun';
    if (/EPIC|지구/.test(g.mission + g.obj)) return 'earth';
    return 'nasa';
  }

  function renderGallery(tag) {
    var grid = $('#saGrid');
    if (!grid) return;
    var vis = [];
    SD.GALLERY.forEach(function (g, i) { if (!tag || galTag(g) === tag) vis.push(i); });
    STATE.galVis = vis;
    grid.innerHTML = vis.map(function (i) {
      var g = SD.GALLERY[i];
      return '<button class="sa-card" data-gal="' + i + '" aria-label="' + esc(g.title) + ' 크게 보기">' +
        '<span class="sa-thumb"><img src="assets/space/' + esc(g.file) + '" alt="' + esc(g.title) + '" loading="lazy" decoding="async" data-full="' + esc(g.file) + '"></span>' +
        '<span class="sa-body"><span class="sa-tag">' + esc(g.mission) + '</span>' +
        '<strong>' + esc(g.title) + '</strong>' +
        '<span class="sa-meta">' + esc(g.date) + ' · ' + esc(g.obj) + '</span></span></button>';
    }).join('');
    var cnt = $('#saCount');
    if (cnt) cnt.textContent = vis.length + '장 · 눌러서 사진과 정보 보기';
    $$('#saGrid img').forEach(function (img) {
      img.addEventListener('error', function () {
        var g = SD.GALLERY[+img.closest('[data-gal]').getAttribute('data-gal')];
        if (g && g.nasa && !img.dataset.fb) {
          img.dataset.fb = '1';
          img.src = 'https://images-assets.nasa.gov/image/' + g.nasa + '/' + g.nasa + '~medium.jpg';
        }
      });
    });
  }

  /* ======================================================================
     🖼 사진 + 정보 라이트박스
     ====================================================================== */
  function buildLightbox() {
    var m = document.createElement('div');
    m.className = 'space-modal';
    m.id = 'spaceModal';
    m.hidden = true;
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', 'smTitle');
    m.innerHTML =
      '<div class="sm-backdrop" data-close="1"></div>' +
      '<div class="sm-card">' +
      '  <button class="sm-close" data-close="1" aria-label="닫기">×</button>' +
      '  <button class="sm-nav prev" data-lb="prev" aria-label="이전 사진">‹</button>' +
      '  <button class="sm-nav next" data-lb="next" aria-label="다음 사진">›</button>' +
      '  <div class="sm-media"><div class="sm-photo" id="smPhoto"></div><img id="smImg" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" hidden><p class="sm-credit" id="smCredit"></p></div>' +
      '  <div class="sm-info">' +
      '    <span class="sm-kind" id="smKind">NASA</span>' +
      '    <h3 id="smTitle">—</h3>' +
      '    <dl class="sm-facts" id="smFacts"></dl>' +
      '    <p class="sm-desc" id="smDesc"></p>' +
      '    <div class="sm-actions" id="smActions"></div>' +
      '    <p class="sm-src" id="smSrc"></p>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { closeAll(); return; }
      var nav = e.target.closest('[data-lb]');
      if (nav) { moveLightbox(nav.getAttribute('data-lb') === 'next' ? 1 : -1); return; }
      var aim = e.target.closest('[data-lb-aim]');
      if (aim) aimAt(JSON.parse(aim.getAttribute('data-lb-aim')));
    });
    /* 사진 영역을 좌우로 밀어도 이동 — 버튼이 가려지는 화면에서도 같은 동작 */
    var media = m.querySelector('.sm-media');
    var sw = { x: null, y: null };
    if (media) {
      media.addEventListener('touchstart', function (e) {
        if (!e.touches || e.touches.length !== 1) return;
        sw.x = e.touches[0].clientX; sw.y = e.touches[0].clientY;
      }, { passive: true });
      media.addEventListener('touchend', function (e) {
        if (sw.x == null || !e.changedTouches || !e.changedTouches.length) { sw.x = null; return; }
        var dx = e.changedTouches[0].clientX - sw.x;
        var dy = e.changedTouches[0].clientY - sw.y;
        sw.x = null; sw.y = null;
        if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 1.3) moveLightbox(dx < 0 ? 1 : -1);
      }, { passive: true });
    }
  }

  function findCatalogByName(name) {
    if (!name) return null;
    var clean = String(name).replace(/\(.*?\)/g, '').trim();
    var m = String(name).match(/\((M\d+)\)/);
    if (m) { var byM = SC.items.find(function (o) { return o.i === m[1]; }); if (byM) return byM; }
    return SC.items.find(function (o) { return o.ko === clean || o.en === clean || o.i === clean; }) || null;
  }

  function openLightbox() {
    var m = $('#spaceModal');
    if (!m) return;
    lbPush();
    var list = STATE.lbList && STATE.lbList.length ? STATE.lbList : SD.GALLERY.map(function (g, i) { return i; });
    var gi = list[STATE.lbIndex];
    var g = SD.GALLERY[gi];
    if (!g) return;
    m.hidden = false;
    document.body.classList.add('space-lock');
    $('.sm-media', m).classList.remove('is-text');
    var pv = $('.sm-nav.prev', m), nx = $('.sm-nav.next', m);
    if (pv) pv.hidden = false;
    if (nx) nx.hidden = false;
    var img = $('#smImg');
    img.hidden = false;
    var ph0 = $('#smPhoto');
    if (ph0) { ph0.innerHTML = ''; ph0.hidden = true; }
    img.alt = g.title;
    img.src = 'assets/space/' + g.file;
    img.onerror = function () {
      if (g.nasa && !img.dataset.fb) { img.dataset.fb = '1'; img.src = 'https://images-assets.nasa.gov/image/' + g.nasa + '/' + g.nasa + '~large.jpg'; }
    };
    $('#smCredit').textContent = g.credit ? 'Credit: ' + g.credit : '';
    var isSp = galTag(g) === 'spacex';
    $('#smKind').textContent = isSp ? 'SpaceX' : (galTag(g) === 'sun' ? 'NASA · 태양' : (galTag(g) === 'earth' ? 'NASA · 지구' : 'NASA'));
    $('#smKind').className = 'sm-kind' + (isSp ? ' spx' : '');
    $('#smTitle').textContent = g.title;
    var rows = [['촬영 장비·미션', g.mission], ['촬영·공개일', g.date], ['대상', g.obj], ['거리', g.dist]];
    $('#smFacts').innerHTML = rows.map(function (r) {
      return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1] || '—') + '</dd></div>';
    }).join('');
    $('#smDesc').textContent = g.d;
    var cat = findCatalogByName(g.obj);
    var acts = '';
    if (cat && cat.ra != null) {
      acts += '<button class="btn btn-primary btn-sm" data-lb-aim=\'' + esc(JSON.stringify({ ra: cat.ra, dec: cat.dec, name: cat.ko })) + '\'>🎯 하늘에서 조준</button>';
    }
    if (g.nasa) acts += '<a class="btn btn-ghost btn-sm" href="https://images.nasa.gov/details/' + esc(g.nasa) + '" target="_blank" rel="noopener noreferrer">NASA 원본 페이지 ↗</a>';
    acts += '<a class="btn btn-ghost btn-sm" href="assets/space/' + esc(g.file) + '" target="_blank" rel="noopener noreferrer" download>사진 내려받기 ↓</a>';
    $('#smActions').innerHTML = acts;
    $('#smSrc').textContent = (STATE.lbIndex + 1) + ' / ' + list.length + ' · NASA 공개 이미지 라이브러리' + (g.nasa ? ' (' + g.nasa + ')' : '');
    var cl = $('.sm-close', m); if (cl) cl.focus();
  }

  function moveLightbox(dir) {
    var list = STATE.lbList;
    if (!list || list.length < 2) return;
    STATE.lbIndex = (STATE.lbIndex + dir + list.length) % list.length;
    openLightbox();
  }

  /* ======================================================================
     🌌 전체 하늘 도감 (내장 2,571종 + 온라인 2만 3천여 종 지연 로딩)
     ====================================================================== */
  var CAT_BASE = 'assets/data/catalog/';
  var CK_BASE = 'assets/data/cookies/';
  var C2 = {
    q: '', type: '', con: '', sort: 'm', page: 0, per: 40,
    rows: [], byId: {}, index: null, manifest: null, indexState: null,
    chunks: {}, loading: {}, conList: []
  };

  function fetchJSON(url) {
    return new Promise(function (resolve, reject) {
      if (!window.fetch) { reject(new Error('fetch 없음')); return; }
      var ctrl = null, timer = 0;
      var opts = {};
      if (window.AbortController) { ctrl = new AbortController(); opts.signal = ctrl.signal; }
      timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) { } }, 12000);
      fetch(url, opts).then(function (r) {
        clearTimeout(timer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(resolve).catch(function (e) { clearTimeout(timer); reject(e); });
    });
  }

  var TYPE_LABEL = {
    G: '은하', GPair: '은하쌍', GTrpl: '은하삼중', GGroup: '은하군', OCl: '산개성단', GCl: '구상성단',
    PN: '행성상성운', Neb: '성운', EmN: '방출성운', RfN: '반사성운', HII: '전리수소영역', SNR: '초신성잔해',
    'Cl+N': '성단+성운', DrkN: '암흑성운', '*Ass': '성협', star: '항성', var: '변광성', dstar: '이중성',
    Other: '기타 천체', exo: '외계행성계',
    planet: '행성', dwarf: '왜소행성', moon: '위성', sun: '항성', bh: '블랙홀', pulsar: '펄서'
  };
  var TYPE_GROUPS = [
    ['', '전체'], ['G', '은하'], ['Neb', '성운'], ['OCl', '산개성단'], ['GCl', '구상성단'],
    ['star', '항성'], ['var', '변광성'], ['solar', '태양계'], ['etc', '블랙홀·특이']
  ];

  function catTypeGroup(t) {
    if (t === 'solar') return ['planet', 'dwarf', 'moon', 'sun'];
    if (t === 'etc') return ['bh', 'pulsar', 'dstar', 'SNR'];
    if (t === 'Neb') return ['Neb', 'HII', 'RfN', 'EmN', 'DrkN', 'PN', 'SNR', 'Cl+N'];
    if (t === 'G') return ['G', 'GPair', 'GTrpl', 'GGroup'];
    if (t === 'star') return ['star', 'exo', 'dstar'];
    return [t];
  }

  function baseRow(o) {
    return { i: o.i, ko: o.ko || o.i, en: o.en || '', t: o.t, m: o.m, c: o.c, s: o.s,
             M: o.M || '', ch: -1, o: o };
  }

  function indexRow(r, pos, per) {
    return { i: r[0], ko: r[0], en: r[6] || '', t: r[1], m: r[2], c: r[3], s: r[4],
             M: r[5] || '', ch: Math.floor(pos / per), o: null };
  }

  function buildCatalogBlock() {
    var wrap = $('#panelObjects') || $('#catalog .wrap');
    if (!wrap || !SC.items.length) return;
    var box = document.createElement('div');
    box.className = 'cat2';
    box.id = 'cat2';
    box.innerHTML =
      '<div class="cat2-head">' +
      '  <div><h3>🌌 하늘 전체 도감 <span class="cat2-badge" id="c2total">' + SC.meta.count.toLocaleString('en-US') + '종</span></h3>' +
      '  <p>메시에 110종 전체 + NGC/IC 전체 + 6등급보다 밝은 별 + 외계행성계까지, 공개 카탈로그(OpenNGC·HYG·NASA/IPAC)의 좌표를 그대로 담았습니다. 카드를 누르면 상세 정보와 조준 버튼이 열립니다. <b>2만 3천여 종은 필요한 만큼만 나눠서 불러옵니다.</b></p></div>' +
      '</div>' +
      '<div class="cat2-controls">' +
      '  <input type="search" id="c2q" class="cat2-search" placeholder="이름·번호로 찾기 (M42, NGC 7000, 베가…)" aria-label="전체 도감 검색">' +
      '  <select id="c2con" aria-label="별자리 필터"><option value="">모든 별자리</option></select>' +
      '  <select id="c2sort" aria-label="정렬"><option value="m">메시에 우선</option><option value="mag">밝은 순</option><option value="name">이름 순</option><option value="size">큰 순</option></select>' +
      '</div>' +
      '<div class="chip-row" id="c2chips">' + TYPE_GROUPS.map(function (g) {
        return '<button class="chip' + (g[0] === '' ? ' is-active' : '') + '" data-c2t="' + g[0] + '">' + g[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="result-count" id="c2count">—</p>' +
      '<p class="lazy-note" id="c2lazy"><span class="lz-badge" id="c2lazyBadge">지연 로딩</span><span id="c2lazyTxt">전체 목록은 스크롤할 때 필요한 부분만 불러옵니다</span></p>' +
      '<p class="c2-loading" id="c2loading" hidden>목록을 불러오는 중…</p>' +
      '<div class="cat2-grid" id="c2grid"></div>' +
      '<div class="cat2-pager"><button class="mini-btn" id="c2prev">← 이전</button><span id="c2page">—</span><button class="mini-btn" id="c2next">다음 →</button></div>' +
      '<p class="cat2-src">좌표·등급 출처: OpenNGC (CC BY-SA 4.0), HYG Database v4.1 (CC BY-SA 2.5), NASA/IPAC 외계행성 아카이브, d3-celestial Messier. 적색편이로 계산한 거리는 추정값입니다.</p>';
    wrap.appendChild(box);

    // 내장 2,571종으로 즉시 시작합니다.
    C2.rows = SC.items.map(baseRow);
    C2.rows.forEach(function (r) { C2.byId[r.i] = r; });
    refreshConOptions();

    $('#c2q').addEventListener('input', debounce(function (e) { C2.q = e.target.value.trim().toLowerCase(); C2.page = 0; renderCat2(); }, 160));
    $('#c2q').addEventListener('focus', function () { loadCatalogIndex(); });
    $('#c2con').addEventListener('change', function (e) { C2.con = e.target.value; C2.page = 0; renderCat2(); });
    $('#c2sort').addEventListener('change', function (e) { C2.sort = e.target.value; C2.page = 0; renderCat2(); });
    $('#c2chips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-c2t]'); if (!b) return;
      $$('#c2chips .chip').forEach(function (x) { x.classList.toggle('is-active', x === b); });
      C2.type = b.getAttribute('data-c2t'); C2.page = 0; renderCat2();
    });
    $('#c2prev').addEventListener('click', function () { if (C2.page > 0) { C2.page--; renderCat2(); } });
    $('#c2next').addEventListener('click', function () {
      var pages = Math.max(1, Math.ceil(catFiltered().length / C2.per));
      if (C2.page < pages - 1) { C2.page++; renderCat2(); }
    });
    $('#c2grid').addEventListener('click', function (e) {
      var aim = e.target.closest('[data-c2aim]');
      if (aim) {
        var row = findRow(aim.getAttribute('data-c2aim'));
        if (!row) return;
        resolveObject(row, function (o) { if (o) aimAtCatalog(o); });
        return;
      }
      var card = e.target.closest('[data-c2]');
      if (!card) return;
      var r2 = findRow(card.getAttribute('data-c2'));
      if (!r2) return;
      resolveObject(r2, function (o) { if (o) openCatalogModal(o); });
    });
    renderCat2();
    bindPhotoPrefetch();

    // 도감이 화면에 가까워지면 확장 목록을 지연 로딩합니다.
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { loadCatalogIndex(); io.disconnect(); } });
      }, { rootMargin: '600px' });
      io.observe(box);
      var sec = $('#catalog');
      if (sec) io.observe(sec);      // 도감 화면을 열면 미리 목록을 받아 둡니다
    }
  }

  function findRow(id) {
    for (var i = 0; i < C2.rows.length; i++) if (C2.rows[i].i === id) return C2.rows[i];
    return null;
  }

  function refreshConOptions() {
    var sel = $('#c2con');
    if (!sel) return;
    var set = {};
    C2.rows.forEach(function (r) { if (r.c) set[r.c] = 1; });
    C2.conList = Object.keys(set).sort();
    var cur = C2.con;
    sel.innerHTML = '<option value="">모든 별자리</option>' + C2.conList.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === cur ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
  }

  function updateCatalogCount(n) {
    var badge = $('#c2total');
    if (badge) badge.textContent = n.toLocaleString('en-US') + '종';
    var tot = document.querySelector('.views-meta-catalog, #tabCatalogMeta');
    if (tot) tot.textContent = n.toLocaleString('en-US');
  }

  function mergeIndex(idx) {
    var per = (C2.manifest && C2.manifest.chunkSize) || 800;
    var added = 0;
    for (var p = 0; p < idx.items.length; p++) {
      var r = indexRow(idx.items[p], p, per);
      if (C2.byId[r.i]) continue;       // 내장 목록에 있으면 한국어 이름·설명을 그대로 씁니다.
      C2.rows.push(r);
      C2.byId[r.i] = r;
      added += 1;
    }
    refreshConOptions();
    updateCatalogCount(C2.rows.length);
    var badge = $('#c2lazyBadge');
    if (badge) { badge.textContent = '온라인 확장 완료'; badge.classList.add('is-on'); }
    var txt = $('#c2lazyTxt');
    if (txt) txt.textContent = C2.rows.length.toLocaleString('en-US') + '종 전체 목록 · 카드 상세는 그때그때 필요한 묶음만 불러옵니다';
    renderCat2();
  }

  function loadCatalogIndex() {
    if (C2.indexState) return C2.indexState;
    var ld = $('#c2loading');
    var badge = $('#c2lazyBadge');
    if (badge) badge.textContent = '목록 불러오는 중';
    if (ld) ld.hidden = false;
    C2.indexState = fetchJSON(CAT_BASE + 'manifest.json').then(function (man) {
      C2.manifest = man;
      return fetchJSON(CAT_BASE + 'index.json');
    }).then(function (idx) {
      C2.index = idx;
      if (ld) ld.hidden = true;
      mergeIndex(idx);
      return true;
    }).catch(function () {
      if (ld) ld.hidden = true;
      C2.indexState = null;
      if (badge) badge.textContent = '내장 ' + SC.items.length.toLocaleString('en-US') + '종';
      var txt = $('#c2lazyTxt');
      if (txt) txt.textContent = '지금은 확장 목록을 불러오지 못했습니다. 인터넷에 연결하면 2만 3천여 종이 열립니다. (내장 목록은 그대로 쓸 수 있습니다)';
      return false;
    });
    return C2.indexState;
  }

  function chunkFile(n) {
    if (C2.manifest && C2.manifest.chunks && C2.manifest.chunks[n]) return C2.manifest.chunks[n].file;
    return 'c' + (n < 10 ? '0' + n : n) + '.json';
  }

  function loadChunk(n) {
    if (C2.chunks[n]) return Promise.resolve(C2.chunks[n]);
    if (C2.loading[n]) return C2.loading[n];
    C2.loading[n] = fetchJSON(CAT_BASE + chunkFile(n)).then(function (d) {
      var items = (d && d.items) || [];
      C2.chunks[n] = items;
      items.forEach(function (o) {
        if (!SC.byId) SC.byId = {};
        if (!SC.byId[o.i]) { SC.byId[o.i] = o; SC.items.push(o); }
        var row = C2.byId[o.i];
        if (row) { row.o = o; row.ko = o.ko || row.ko; row.en = o.en || row.en; }
      });
      delete C2.loading[n];
      return items;
    }).catch(function (e) { delete C2.loading[n]; throw e; });
    return C2.loading[n];
  }

  function findInChunk(n, id) {
    var list = C2.chunks[n] || [];
    for (var i = 0; i < list.length; i++) if (list[i].i === id) return list[i];
    return null;
  }

  function resolveObject(row, cb) {
    if (row.o) { cb(row.o); return; }
    if (row.ch < 0) { cb(null); return; }
    if (C2.chunks[row.ch]) { cb(findInChunk(row.ch, row.i)); return; }
    toastLocal('상세 정보를 불러오는 중…');
    loadChunk(row.ch).then(function () { cb(findInChunk(row.ch, row.i)); })
      .catch(function () { toastLocal('상세 정보를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'); });
  }

  // 카드에 마우스를 올리면 실제 하늘 사진을 미리 받아 둔다(모달 열 때 바로 보임)
  function bindPhotoPrefetch() {
    var grid = $('#c2grid');
    if (!grid || !window.SkyPhoto) return;
    var tm = 0;
    function warm(e) {
      var card = e.target.closest ? e.target.closest('[data-c2]') : null;
      if (!card) return;
      clearTimeout(tm);
      tm = setTimeout(function () {
        var row = findRow(card.getAttribute('data-c2'));
        if (!row) return;
        resolveObject(row, function (o) { if (o) SkyPhoto.prefetch(o); });
      }, 120);
    }
    grid.addEventListener('mouseover', warm);
    grid.addEventListener('focusin', warm);
  }

  function debounce(fn, ms) {
    var t; return function (e) { clearTimeout(t); t = setTimeout(function () { fn(e); }, ms); };
  }

  function magOf(r) { return (r.m == null || r.m >= 90) ? 99 : r.m; }

  function catFiltered() {
    var groups = C2.type ? catTypeGroup(C2.type) : null;
    var q = C2.q;
    var out = C2.rows.filter(function (o) {
      if (groups && groups.indexOf(o.t) < 0) return false;
      if (C2.con && o.c !== C2.con) return false;
      if (q) {
        var hay = (o.i + ' ' + (o.ko || '') + ' ' + (o.en || '') + ' ' + (o.M || '')).toLowerCase().replace(/\s+/g, '');
        if (hay.indexOf(q.replace(/\s+/g, '')) < 0) return false;
      }
      return true;
    });
    if (C2.sort === 'm') out.sort(function (a, b) { return (a.M ? 0 : 1) - (b.M ? 0 : 1) || magOf(a) - magOf(b); });
    else if (C2.sort === 'mag') out.sort(function (a, b) { return magOf(a) - magOf(b); });
    else if (C2.sort === 'name') out.sort(function (a, b) { return a.i.localeCompare(b.i, 'ko'); });
    else out.sort(function (a, b) { return (b.s || 0) - (a.s || 0); });
    return out;
  }

  function canAim(o) {
    if (o.ch != null && o.ch >= 0) return o.t !== 'sun';
    var x = o.o || o;
    if (x.t === 'sun') return false;
    if (x.t === 'moon') return true;
    if (x.t === 'planet' || x.t === 'dwarf') return !!({ Mercury: 1, Venus: 1, Mars: 1, Jupiter: 1, Saturn: 1, Uranus: 1, Neptune: 1 })[x.en];
    return x.ra != null && x.dec != null;
  }

  function renderCat2() {
    var list = catFiltered();
    var pages = Math.max(1, Math.ceil(list.length / C2.per));
    if (C2.page >= pages) C2.page = pages - 1;
    if (C2.page < 0) C2.page = 0;
    var slice = list.slice(C2.page * C2.per, (C2.page + 1) * C2.per);
    var grid = $('#c2grid');
    if (!grid) return;
    grid.innerHTML = slice.map(function (o) {
      var t = TYPE_LABEL[o.t] || o.t;
      return '<article class="c2-card" data-c2="' + esc(o.i) + '" tabindex="0" role="button" aria-label="' + esc(o.ko) + ' 상세">' +
        '<div class="c2-top"><span class="c2-name">' + esc(o.ko) + '</span>' +
        (o.M ? '<span class="c2-m">' + esc(o.M) + '</span>' : '') + '</div>' +
        '<div class="c2-meta"><span class="c2-type">' + esc(t) + '</span>' +
        (o.c ? '<span>' + esc(o.c) + '</span>' : '') +
        '<span class="c2-mag">' + (o.m == null || o.m >= 90 ? '—' : (o.m > 0 ? '+' : '') + Number(o.m).toFixed(1) + '등') + '</span></div>' +
        (o.s ? '<div class="c2-size">겉보기 ' + (o.s >= 60 ? (o.s / 60).toFixed(1) + '°' : o.s.toFixed(0) + '′') + '</div>' : '') +
        (canAim(o) ? '<button class="mini-btn c2-aim" data-c2aim="' + esc(o.i) + '" aria-label="' + esc(o.ko) + ' 조준">🎯</button>' : '') +
        '</article>';
    }).join('') || '<p class="cat2-empty">조건에 맞는 천체가 없습니다. 필터를 바꿔 보세요.</p>';
    $('#c2count').textContent = list.length
      ? list.length.toLocaleString('en-US') + '종 중 ' + (C2.page * C2.per + 1) + '–' + Math.min(list.length, (C2.page + 1) * C2.per) + ' 표시'
      : '조건에 맞는 천체가 없습니다';
    $('#c2page').textContent = (C2.page + 1) + ' / ' + pages;
    $('#c2prev').disabled = C2.page === 0;
    $('#c2next').disabled = C2.page >= pages - 1;
    $$('#c2grid .c2-card').forEach(function (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      });
    });
    // 다음 페이지의 묶음을 미리 받아 두면 페이지 이동이 매끄럽습니다.
    if (slice.length && slice[0].ch >= 0) loadChunk(slice[0].ch).catch(function () { });
  }

  function aimAtCatalog(o) {
    if (o.t === 'moon') return aimAt({ moon: true });
    if (o.t === 'sun') { toastLocal('태양은 라이브 조준 대신 ☀️ 태양 카드를 확인하세요. (직접 보면 위험합니다)'); return; }
    if (o.t === 'planet' || o.t === 'dwarf') {
      var pmap = { Mercury: 'mercury', Venus: 'venus', Mars: 'mars', Jupiter: 'jupiter', Saturn: 'saturn', Uranus: 'uranus', Neptune: 'neptune' };
      if (pmap[o.en]) return aimAt({ planet: pmap[o.en], name: o.ko });
    }
    if (o.ra == null || o.dec == null) { toastLocal('이 천체는 좌표가 없어 조준할 수 없습니다.'); return; }
    aimAt({ ra: o.ra, dec: o.dec, name: o.ko });
  }

  function altitudeOf(o) {
    try {
      var st = window.OneulBam.state, c = st.last || window.OneulBam.computeNight();
      var h = window.Astro.equatorialToHorizontal(o.ra / 15, o.dec, st.site.lat, st.site.lon, c.jd);
      return h;
    } catch (e) { return null; }
  }

  function openCatalogModal(o) {
    var m = $('#spaceModal');
    if (!m) return;
    STATE.lbList = []; STATE.lbIndex = 0;
    m.hidden = false;
    document.body.classList.add('space-lock');
    lbPush();
    var h = altitudeOf(o);
    $('.sm-media', m).classList.remove('is-text');
    var imgEl = $('#smImg');
    imgEl.hidden = true;
    imgEl.src = BLANK_IMG;   // 사진 자리를 비울 때도 빈 src(=깨진 이미지)를 남기지 않습니다
    var ph = $('#smPhoto');
    if (ph) {
      ph.hidden = false;
      ph.innerHTML = '';
      if (window.SkyGallery) ph.appendChild(SkyGallery.create(o, { variant: 'modal' }));
      else if (window.SkyPhoto) ph.appendChild(SkyPhoto.figure(o, { variant: 'modal' }));
    }
    var pv2 = $('.sm-nav.prev', m), nx2 = $('.sm-nav.next', m);
    if (pv2) pv2.hidden = true;
    if (nx2) nx2.hidden = true;
    $('#smCredit').textContent = '';
    $('#smKind').textContent = '천체 도감 · ' + (TYPE_LABEL[o.t] || o.t);
    $('#smKind').className = 'sm-kind';
    $('#smTitle').textContent = o.ko + (o.en && o.en !== o.ko ? ' · ' + o.en : '');
    var rows = [
      ['적경 (J2000)', o.ra != null ? fmtRA(o.ra) : '—'],
      ['적위 (J2000)', o.dec != null ? fmtDec(o.dec) : '—'],
      ['겉보기 등급', o.m == null || o.m >= 90 ? '—' : (o.m > 0 ? '+' : '') + o.m.toFixed(2) + '등'],
      ['별자리', o.c || '—'],
      ['거리', o.d ? (o.d >= 1000000 ? (o.d / 1000000).toFixed(2) + '백만 광년' : o.d >= 1000 ? Math.round(o.d).toLocaleString('en-US') + '광년' : o.d + '광년') : '알려진 값 없음'],
      ['겉보기 크기', o.s ? (o.s >= 60 ? (o.s / 60).toFixed(2) + '°' : o.s.toFixed(1) + '′') : '—'],
      ['지금 고도', h ? (h.alt > 0 ? nf(h.alt, 0) + '° (' + dirName(h.az) + ')' : '지평선 아래 ' + nf(h.alt, 0) + '°') : '—']
    ];
    $('#smFacts').innerHTML = rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
    var desc = o.x || '';
    var tdesc = {
      G: '은하입니다. 수백만~수억 광년 밖의 거대한 별의 집합으로, 밝은 중심과 나선팔·먼지띠가 보입니다.',
      OCl: '산개성단입니다. 같은 가스云에서 태어난 젊은 별들이 느슨하게 모여 있습니다.',
      GCl: '구상성단입니다. 수십만 개의 늙은 별이 구형으로 빽빽하게 모여 있습니다.',
      PN: '행성상성운입니다. 태양 같은 별이 생애 끝에 뿜어낸 가스 껍질입니다.',
      HII: '전리수소영역입니다. 뜨거운 젊은 별이 수소 가스를 이온화해 붉게 빛납니다.',
      Neb: '성운입니다. 가스와 먼지가 모여 별이 태어나거나 별이 죽은 흔적을 보여 줍니다.',
      SNR: '초신성잔해입니다. 별이 폭발하고 남은 가스가 수천 년에 걸쳐 퍼지는 중입니다.',
      var: '변광성입니다. 밝기가 주기적으로 또는 불규칙하게 변합니다.',
      star: '항성입니다. 스스로 빛을 내는 별로, 겉보기 등급과 분광형을 함께 적었습니다.',
      moon: '위성입니다. 모행성 주위를 도는 천체입니다.',
      planet: '행성입니다. 위치가 매일 변하므로 이 도감에서는 이름과 특징을 기준으로 찾고, 조준은 실시간 위치로 합니다.',
      dwarf: '왜소행성입니다. 행성만큼 크지 않지만 자기 중력으로 둥근 모양을 유지합니다.',
      bh: '블랙홀입니다. 빛조차 빠져나오지 못하는 천체입니다.'
    };
    $('#smDesc').textContent = (desc ? desc + ' ' : '') + (tdesc[o.t] || '') + ' 좌표·등급은 공개 카탈로그 값을 그대로 씁니다.';
    var acts = '';
    if (o.ra != null && o.dec != null && o.t !== 'sun') {
      acts += '<button class="btn btn-primary btn-sm" data-lb-aim=\'' + esc(JSON.stringify({ ra: o.ra, dec: o.dec, name: o.ko })) + '\'>🎯 하늘에서 조준</button>';
    }
    if (o.M) acts += '<a class="btn btn-ghost btn-sm" href="https://images.nasa.gov/search?q=' + encodeURIComponent(o.i) + '" target="_blank" rel="noopener noreferrer">NASA 사진 찾기 ↗</a>';
    $('#smActions').innerHTML = acts;
    $('#smSrc').textContent = '출처: OpenNGC·HYG·d3-celestial 공개 카탈로그 · 좌표 J2000';
    var cl = $('.sm-close', m); if (cl) cl.focus();
  }

  function fmtRA(raDeg) {
    var h = raDeg / 15, hh = Math.floor(h), mm = Math.floor((h - hh) * 60), ss = Math.round((((h - hh) * 60) - mm) * 60);
    return hh + 'h ' + mm + 'm ' + ss + 's';
  }
  function fmtDec(dec) {
    var s = dec < 0 ? '−' : '+', a = Math.abs(dec), d = Math.floor(a), m = Math.round((a - d) * 60);
    return s + d + '° ' + m + '′';
  }
  function dirName(az) {
    var names = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
    return names[Math.round(((az % 360) / 22.5)) % 16];
  }

  /* ======================================================================
     🤖 AI 천문 도우미
     ====================================================================== */
  var AI = {
    provider: store('ai.provider') || 'local',
    model: store('ai.model') || '',
    endpoint: store('ai.endpoint') || '',
    msgs: [],
    busy: false
  };

  function aiKeyName(p) { return 'ai.key.' + p; }
  function aiKey(p) { return store(aiKeyName(p)) || ''; }

  function buildAI() {
    var d = document.createElement('div');
    d.className = 'space-drawer ai-drawer';
    d.id = 'aiDrawer';
    d.hidden = true;
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-labelledby', 'aiTitle');
    d.innerHTML =
      '<div class="sd-backdrop" data-close="1"></div>' +
      '<div class="sd-panel ai-panel">' +
      '  <header class="sd-head">' +
      '    <div><p class="sd-eyebrow">사이트 하늘 데이터 기반</p><h3 id="aiTitle">🤖 AI 천문 도우미</h3></div>' +
      '    <div class="ai-head-actions"><span class="ai-badge" id="aiBadge">로컬 도우미</span>' +
      '    <button class="sd-icon" id="aiGear" aria-label="API 연결 설정" aria-expanded="false">⚙️</button>' +
      '    <button class="sd-close" data-close="1" aria-label="닫기">×</button></div>' +
      '  </header>' +
      '  <div class="ai-settings" id="aiSettings" hidden>' +
      '    <label class="field"><span class="field-label">제공자</span>' +
      '      <select id="aiProvider"><option value="local">로컬 도우미 (키 필요 없음)</option><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="custom">OpenAI 호환 (Ollama·프록시)</option></select></label>' +
      '    <label class="field" id="aiModelWrap"><span class="field-label">모델</span><input id="aiModel" placeholder="gemini-2.5-flash / gpt-4.1-mini" autocomplete="off"></label>' +
      '    <label class="field" id="aiEndpointWrap" hidden><span class="field-label">엔드포인트 URL</span><input id="aiEndpoint" placeholder="http://localhost:11434/v1/chat/completions" autocomplete="off"></label>' +
      '    <label class="field" id="aiKeyWrap"><span class="field-label">API 키</span><input id="aiKey" type="password" placeholder="AIza… / sk-…" autocomplete="off"></label>' +
      '    <div class="ai-set-actions"><button class="btn btn-primary btn-sm" id="aiSave">저장</button>' +
      '      <button class="btn btn-ghost btn-sm" id="aiTest">연결 테스트</button>' +
      '      <button class="btn btn-ghost btn-sm" id="aiClear">키 삭제</button></div>' +
      '    <p class="ai-note">🔒 입력한 API 키는 <strong>이 브라우저의 localStorage에만</strong> 저장되며 공개 저장소·서버로 전송되지 않습니다. 질문을 보낼 때만 선택한 제공자의 API로 직접 전송됩니다. 공용 PC에서는 사용 후 삭제하세요.</p>' +
      '    <p class="ai-status" id="aiStatus" role="status"></p>' +
      '  </div>' +
      '  <div class="ai-log" id="aiLog" aria-live="polite"></div>' +
      '  <div class="ai-suggest" id="aiSuggest">' +
      '    <button data-q="오늘 밤 여기서 뭐 보면 좋아?">오늘 밤 뭐 보지?</button>' +
      '    <button data-q="M42 오리온대성운은 어떻게 찾아?">M42 찾는 법</button>' +
      '    <button data-q="지금 달 위상과 밝기는?">달 상태</button>' +
      '    <button data-q="이번 달 유성우 알려줘">유성우</button>' +
      '  </div>' +
      '  <form class="ai-form" id="aiForm">' +
      '    <textarea id="aiInput" rows="1" placeholder="천문 질문을 적어 주세요 (예: 토성이 지금 어디 있어?)" aria-label="질문 입력"></textarea>' +
      '    <button class="btn btn-primary" id="aiSend" type="submit">보내기</button>' +
      '  </form>' +
      '</div>';
    document.body.appendChild(d);

    d.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { closeAll(); return; }
      var sug = e.target.closest('[data-q]');
      if (sug) { $('#aiInput').value = sug.getAttribute('data-q'); sendAI(); }
    });
    $('#aiGear').addEventListener('click', function () {
      var s = $('#aiSettings');
      s.hidden = !s.hidden;
      $('#aiGear').setAttribute('aria-expanded', String(!s.hidden));
      if (!s.hidden) syncAISettings();
    });
    $('#aiProvider').addEventListener('change', function () {
      var p = $('#aiProvider').value;
      var mi = $('#aiModel');
      if (mi) {
        // 다른 제공자의 기본 모델이 남아 있으면 그대로 저장되어 엉뚱한 모델명으로 요청됩니다.
        var cur = mi.value.trim();
        var otherDefault = ['gemini', 'openai', 'custom'].some(function (q) { return defaultModel(q) === cur; });
        if (!cur || otherDefault) mi.value = defaultModel(p);
      }
      // 제공자를 바꾸면 그 제공자에 저장해 둔 키를 보여 줍니다(다른 제공자의 키가 남지 않도록).
      var ki = $('#aiKey');
      if (ki) ki.value = p === 'local' ? '' : (aiKey(p) || '');
      syncAIPanels();
    });
    $('#aiSave').addEventListener('click', saveAISettings);
    $('#aiClear').addEventListener('click', function () {
      var p = $('#aiProvider').value;
      var had = p !== 'local' && !!aiKey(p);
      try { localStorage.removeItem('ob.' + aiKeyName(p)); } catch (e) { }
      var others = ['gemini', 'openai', 'custom'].filter(function (q) { return q !== p && !!aiKey(q); });
      // 지금 제공자에 저장된 키가 없으면 '키 삭제'는 남아 있는 모든 키를 지우는 뜻으로 봅니다.
      if (!had) {
        ['gemini', 'openai', 'custom'].forEach(function (q) { try { localStorage.removeItem('ob.' + aiKeyName(q)); } catch (e) { } });
      }
      $('#aiKey').value = '';
      $('#aiStatus').textContent = had
        ? '키를 삭제했습니다. 로컬 도우미로 동작합니다.'
        : (others.length ? '저장된 API 키를 모두 삭제했습니다. 로컬 도우미로 동작합니다.' : '저장된 키가 없습니다. 로컬 도우미로 동작합니다.');
      AI.provider = 'local'; store('ai.provider', 'local');
      $('#aiProvider').value = 'local';
      syncAIPanels(); syncAI();
    });
    $('#aiTest').addEventListener('click', testAI);
    $('#aiForm').addEventListener('submit', function (e) { e.preventDefault(); sendAI(); });
    $('#aiInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); }
    });
    $('#aiInput').addEventListener('input', function (e) {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px';
    });
    syncAI();
    greetAI();
  }

  function syncAIPanels() {
    var p = $('#aiProvider').value;
    $('#aiKeyWrap').hidden = p === 'local';
    $('#aiEndpointWrap').hidden = p !== 'custom';
    $('#aiModelWrap').hidden = p === 'local';
  }
  function syncAISettings() {
    $('#aiProvider').value = AI.provider || 'local';
    $('#aiModel').value = AI.model || defaultModel(AI.provider);
    $('#aiEndpoint').value = AI.endpoint || '';
    $('#aiKey').value = AI.provider === 'local' ? '' : aiKey(AI.provider);
    syncAIPanels();
    $('#aiStatus').textContent = AI.provider === 'local' ? '로컬 도우미 모드 — 사이트 데이터만으로 답합니다.' : '키가 저장되어 있으면 질문이 제공자 API로 전송됩니다.';
  }
  function defaultModel(p) {
    if (p === 'gemini') return 'gemini-2.5-flash';
    if (p === 'openai') return 'gpt-4.1-mini';
    if (p === 'custom') return 'llama3.1';
    return '';
  }
  function syncAI() {
    var badge = $('#aiBadge');
    if (!badge) return;
    var on = AI.provider !== 'local' && !!aiKey(AI.provider);
    badge.textContent = on ? 'API 연결됨 · ' + (AI.provider === 'gemini' ? 'Gemini' : AI.provider === 'openai' ? 'OpenAI' : '커스텀') : '로컬 도우미';
    badge.classList.toggle('is-api', on);
    AI.provider = on ? AI.provider : 'local';
  }
  function saveAISettings() {
    var p = $('#aiProvider').value;
    AI.model = $('#aiModel').value.trim();
    AI.endpoint = $('#aiEndpoint').value.trim();
    var k = $('#aiKey').value.trim();
    if (k) store(aiKeyName(p), k);
    store('ai.provider', p); store('ai.model', AI.model); store('ai.endpoint', AI.endpoint);
    AI.provider = p;
    if (p !== 'local' && !aiKey(p)) {
      $('#aiStatus').textContent = '키가 비어 있어 로컬 도우미로 동작합니다.';
      AI.provider = 'local'; store('ai.provider', 'local');
      $('#aiProvider').value = 'local';
      syncAIPanels();
    } else {
      $('#aiStatus').textContent = '저장했습니다. 이 브라우저에만 보관됩니다.';
    }
    syncAI();
  }

  function testAI() {
    var p = $('#aiProvider').value;
    var k = $('#aiKey').value.trim() || aiKey(p);
    if (p === 'local') { $('#aiStatus').textContent = '로컬 도우미는 키 없이 항상 동작합니다.'; return; }
    if (!k) { $('#aiStatus').textContent = 'API 키를 입력하세요.'; return; }
    if (p === 'custom') {
      var ep = $('#aiEndpoint').value.trim();
      if (!ep) { $('#aiStatus').textContent = '엔드포인트 URL을 입력하세요.'; return; }
      if (!/^https?:\/\/[^\s]+$/i.test(ep)) {
        $('#aiStatus').textContent = '❌ 엔드포인트는 http:// 또는 https://로 시작하는 주소여야 합니다.';
        return;
      }
    }
    $('#aiStatus').textContent = '연결 확인 중…';
    apiChat(p, k, $('#aiModel').value.trim() || defaultModel(p), $('#aiEndpoint').value.trim(),
      [{ role: 'user', text: '연결 확인. "연결됨"이라고만 답하세요.' }], '간단히 답하세요.')
      .then(function (txt) { $('#aiStatus').textContent = '✅ 연결 성공 — ' + txt.slice(0, 60); })
      .catch(function (err) { $('#aiStatus').textContent = '❌ 실패 — ' + err.message; });
  }

  function greetAI() {
    var log = $('#aiLog');
    if (!log) return;
    log.innerHTML = '<div class="ai-msg bot"><div class="ai-bubble">안녕하세요! 이 사이트의 <strong>오늘 밤 하늘 데이터</strong>(관측지·시각·달·행성·도감 2,500여 종·우주 쿠키)를 알고 답하는 도우미입니다.<br>' +
      'API 키 없이도 <strong>로컬 도우미</strong>로 바로 쓸 수 있고, ⚙️에서 Gemini·OpenAI 키를 넣으면 더 자유로운 질문도 가능합니다.<br>' +
      '지금 상태: ' + esc(contextLine()) + '</div></div>';
  }

  function contextLine() {
    try {
      var st = window.OneulBam.state, c = st.last || window.OneulBam.computeNight();
      var ph = c.phase;
      return st.site.name + ' · ' + st.dateStr + ' ' + (st.timeStr || '지금') + ' · 달 ' + ph.name + ' ' + Math.round(ph.illum * 100) + '% · 관측지수 ' + c.score;
    } catch (e) { return '하늘 데이터 준비 중'; }
  }

  function buildContext() {
    var st = window.OneulBam.state;
    var c = st.last || window.OneulBam.computeNight();
    var lines = [];
    lines.push('관측지: ' + st.site.name + ' (위도 ' + st.site.lat.toFixed(4) + ', 경도 ' + st.site.lon.toFixed(4) + ', Bortle ' + (st.site.bortle || '?') + ')');
    lines.push('날짜·시각: ' + st.dateStr + ' ' + (st.timeStr || new Date().toTimeString().slice(0, 5)) + ' KST');
    lines.push('달: ' + c.phase.name + ', 조명률 ' + Math.round(c.phase.illum * 100) + '%, 삭부터 ' + c.phase.age.toFixed(1) + '일');
    lines.push('관측지수: ' + c.score + '/100, 완전한 어둠 ' + (c.darkHours ? c.darkHours.toFixed(1) : '?') + '시간');
    var pl = (c.planets || []).filter(function (p) { return p.hor && p.hor.alt > 0; }).sort(function (a, b) { return b.hor.alt - a.hor.alt; }).slice(0, 5);
    lines.push('지평선 위 행성: ' + (pl.length ? pl.map(function (p) { return p.name + ' 고도 ' + p.hor.alt.toFixed(0) + '° 방위 ' + p.hor.az.toFixed(0) + '° 등급 ' + (p.mag != null ? p.mag.toFixed(1) : '?'); }).join(' / ') : '없음'));
    var picks = [];
    ['M42', 'M31', 'M45', 'M13', 'M8', 'M27', 'M57', 'M81'].forEach(function (id) {
      var o = SC.items.find(function (x) { return x.i === id; });
      if (!o) return;
      var h = altitudeOf(o);
      if (h && h.alt > 15) picks.push(o.ko + '(' + id + ') 고도 ' + h.alt.toFixed(0) + '°');
    });
    lines.push('지금 높이 뜬 대표 천체: ' + (picks.join(', ') || '없음'));
    lines.push('도감: ' + SC.meta.count + '종(은하·성운·성단·항성·태양계), 우주 쿠키 ' + SD.COOKIES.length + '개');
    return lines.join('\n');
  }

  function sendAI() {
    var inp = $('#aiInput');
    var q = (inp.value || '').trim();
    if (!q || AI.busy) return;
    inp.value = ''; inp.style.height = 'auto';
    addMsg('user', esc(q));
    AI.busy = true;
    var sendBtn = $('#aiSend'); if (sendBtn) sendBtn.disabled = true;
    var typing = addMsg('bot', '<span class="ai-typing"><i></i><i></i><i></i></span>', true);

    if (AI.provider === 'local' || !aiKey(AI.provider)) {
      setTimeout(function () {
        var a = localAnswer(q);
        typing.innerHTML = a;
        wireAnswer(typing);
        AI.busy = false; if (sendBtn) sendBtn.disabled = false;
      }, reduced ? 60 : 420);
      return;
    }
    var history = AI.msgs.slice(-6).map(function (m) { return { role: m.role, text: m.text }; });
    history.push({ role: 'user', text: q });
    apiChat(AI.provider, aiKey(AI.provider), AI.model || defaultModel(AI.provider), AI.endpoint, history,
      '너는 대한민국 천체관측 사이트 "별너울"의 천문 도우미다. 아래 사이트 데이터를 근거로 한국어로 친절하고 정확하게 답한다. 주어진 수치를 우선 사용하고, 모르면 모른다고 말한다. 답은 3~6문장으로 간결하게.\n\n[사이트 데이터]\n' + buildContext())
      .then(function (txt) {
        typing.innerHTML = '<div class="ai-bubble">' + esc(txt).replace(/\n/g, '<br>') + '</div>';
        AI.msgs.push({ role: 'user', text: q }, { role: 'assistant', text: txt });
      })
      .catch(function (err) {
        typing.innerHTML = '<div class="ai-bubble err">API 호출에 실패했습니다: ' + esc(err.message) +
          '<br><span class="ai-small">키·모델·엔드포인트를 확인하거나, 아래 로컬 도우미 답변을 참고하세요.</span></div>' + localAnswer(q);
        wireAnswer(typing);
      })
      .then(function () { AI.busy = false; if (sendBtn) sendBtn.disabled = false; });
  }

  function addMsg(who, html, noPush) {
    var log = $('#aiLog');
    var div = document.createElement('div');
    div.className = 'ai-msg ' + who;
    div.innerHTML = '<div class="ai-bubble">' + html + '</div>';
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }
  function wireAnswer(root) {
    $$('[data-ai-aim]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var o = JSON.parse(b.getAttribute('data-ai-aim'));
        aimAt(o);
      });
    });
    $$('[data-ai-open]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-ai-open');
        var o = SC.items.find(function (x) { return x.i === id; });
        if (o) openCatalogModal(o);
      });
    });
    var log = $('#aiLog'); if (log) log.scrollTop = log.scrollHeight;
  }

  function apiChat(provider, key, model, endpoint, history, system) {
    return new Promise(function (resolve, reject) {
      var url, body, headers = { 'Content-Type': 'application/json' };
      if (provider === 'gemini') {
        url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model || 'gemini-2.5-flash') + ':generateContent?key=' + encodeURIComponent(key);
        body = {
          systemInstruction: { parts: [{ text: system }] },
          contents: history.map(function (m) { return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }; }),
          generationConfig: { temperature: 0.4, maxOutputTokens: 700 }
        };
      } else {
        url = provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : (endpoint || '');
        if (!url) { reject(new Error('엔드포인트 URL이 비어 있습니다')); return; }
        // 주소를 확인하지 않으면 'not-a-url' 같은 입력이 이 사이트 주소로 요청되어
        // API 키가 엉뚱한 곳으로 전송될 수 있습니다.
        if (!/^https?:\/\/[^\s]+$/i.test(url)) {
          reject(new Error('엔드포인트 주소가 올바르지 않습니다. http:// 또는 https://로 시작하는 주소를 넣어 주세요'));
          return;
        }
        if (location.protocol === 'https:' && url.indexOf('http://') === 0) {
          reject(new Error('HTTPS 페이지에서는 http:// 엔드포인트가 차단됩니다(혼합 콘텐츠). https 주소나 프록시를 쓰세요'));
          return;
        }
        headers.Authorization = 'Bearer ' + key;
        body = {
          model: model || 'gpt-4.1-mini',
          messages: [{ role: 'system', content: system }].concat(history.map(function (m) { return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }; })),
          temperature: 0.4, max_tokens: 700
        };
      }
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 45000);
      fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) {
          clearTimeout(timer);
          return r.text().then(function (t) {
            var j;
            try { j = JSON.parse(t); } catch (e) { j = null; }
            if (!r.ok) {
              var msg = (j && (j.error && (j.error.message || j.error))) ||
                (t ? '응답 본문: ' + t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) : '');
              throw new Error(r.status + (msg ? ' ' + msg : ''));
            }
            if (!j) throw new Error('응답을 해석할 수 없습니다');
            var out = '';
            if (provider === 'gemini') {
              out = ((j.candidates || [])[0] || {}).content ? j.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('') : '';
            } else {
              out = ((j.choices || [])[0] || {}).message ? j.choices[0].message.content : '';
            }
            if (!out) throw new Error('빈 응답');
            resolve(out.trim());
          });
        })
        .catch(function (e) {
          clearTimeout(timer);
          if (e.name === 'AbortError') reject(new Error('시간 초과(45초)'));
          else if (String(e.message).indexOf('Failed to fetch') >= 0) reject(new Error('네트워크/CORS 차단. 키·엔드포인트·브라우저 정책을 확인하세요'));
          else reject(e);
        });
    });
  }

  /* ------------------------------- 로컬 도우미 ------------------------------- */
  function localAnswer(q) {
    var s = q.toLowerCase();
    var parts = [];

    // 1) 행성 이름이 있으면 실시간 위치로 답한다
    var pk = planetMention(q);
    if (pk) return planetAnswer(pk);
    // 2) 천체 이름/번호가 있으면 먼저 찾아 준다
    var hitObj = objectMention(q);
    if (hitObj) return objectAnswer(hitObj, /어떻게|찾|어디|조준|보이/.test(q));

    var intent = detectIntent(s);

    if (intent === 'recommend') {
      var st = window.OneulBam.state, c = st.last || window.OneulBam.computeNight();
      var picks = [];
      SC.items.forEach(function (o) {
        if (o.m == null || o.m > 6.5 || o.ra == null || o.t === 'star') return;
        if (['M42', 'M31', 'M45', 'M8', 'M13', 'M27', 'M57', 'M81', 'M44', 'M11', 'M17', 'M16', 'M20'].indexOf(o.i) < 0) return;
        var h = altitudeOf(o); if (h && h.alt > 12) picks.push({ o: o, alt: h.alt, az: h.az });
      });
      picks.sort(function (a, b) { return b.alt - a.alt; });
      parts.push('<div class="ai-bubble"><strong>' + esc(st.site.name) + ' ' + esc(st.dateStr) + ' ' + esc(st.timeStr || '지금') + '</strong> 기준입니다.<br>달은 <strong>' + esc(c.phase.name) + ' ' + Math.round(c.phase.illum * 100) + '%</strong>, 관측지수 <strong>' + c.score + '/100</strong>입니다.');
      var pl = (c.planets || []).filter(function (p) { return p.hor && p.hor.alt > 5 && p.mag != null && p.mag < 6.5; }).sort(function (a, b) { return a.mag - b.mag; }).slice(0, 3);
      var sunUp = c.sunHor && c.sunHor.alt > 0;
      if (sunUp) parts.push('<span class="ai-small">☀️ 지금은 해가 떠 있어 맨눈 관측은 어렵습니다. 아래는 ‘지금 하늘’의 위치이고, 밤에 볼 대상은 화면 위 시각을 22:00으로 바꾸면 보입니다.</span>');
      if (pl.length) parts.push('지금 떠 있는 행성: ' + pl.map(function (p) { return '<strong>' + esc(p.name) + '</strong> ' + p.hor.alt.toFixed(0) + '°'; }).join(', ') + '.');
      if (picks.length) {
        parts.push('지금 높이 있는 대표 천체:<div class="ai-chips">' + picks.slice(0, 4).map(function (x) {
          return '<button class="ai-chip" data-ai-open="' + esc(x.o.i) + '">' + esc(x.o.ko) + ' ' + x.alt.toFixed(0) + '°</button>';
        }).join('') + '</div>');
      } else {
        parts.push('지금은 밝은 딥스카이가 낮게 떠 있습니다. 시각을 22시로 바꾸거나 라이브 하늘 뷰에서 남쪽을 확인해 보세요.');
      }
      var ck = SD.COOKIES[Math.floor(Math.random() * SD.COOKIES.length)];
      parts.push('<div class="ai-cookie">🍪 <strong>' + esc(ck.t) + '</strong> — ' + esc(ck.s) + '</div>');
      parts.push('</div>');
      return parts.join('');
    }
    if (intent === 'moon') {
      var st2 = window.OneulBam.state, c2 = st2.last || window.OneulBam.computeNight();
      var ph = c2.phase;
      return '<div class="ai-bubble">지금 달은 <strong>' + esc(ph.name) + '</strong>, 조명률 <strong>' + Math.round(ph.illum * 100) + '%</strong>, 삭부터 <strong>' + ph.age.toFixed(1) + '일</strong> 지났습니다. 거리 ' + Math.round(ph.distanceKm).toLocaleString('en-US') + ' km, 지금 고도 <strong>' + c2.moonHor.alt.toFixed(0) + '°</strong>(' + dirName(c2.moonHor.az) + ')입니다.' +
        '<br><span class="ai-small">달이 밝을수록 은하수·성운은 보기 어려워집니다. 대신 크레이터·달의 바다를 보거나 행성 관측을 하세요.</span></div>';
    }
    if (intent === 'meteor') {
      var mets = SD.COOKIES.filter(function (c) { return c.c === 'tip' && /유성우|ZHR/.test(c.t); });
      return '<div class="ai-bubble"><strong>IMO 2026 유성우 달력</strong>에서 정리한 내용입니다.<div class="ai-chips">' +
        mets.slice(0, 5).map(function (m) { return '<button class="ai-chip" data-ai-cookie="' + esc(m.t) + '">' + esc(m.t) + '</button>'; }).join('') +
        '</div><span class="ai-small">유성우는 복사점이 높이 뜬 새벽 1~4시가 가장 좋고, 달이 없는 밤을 골라야 합니다. 사이트의 🌠 유성우 카드에서 극대까지 남은 날짜를 확인하세요.</span></div>';
    }

    // 키워드 검색: 도감 → 쿠키 → 안내
    var key = q.replace(/[?？!。.]/g, ' ').trim();
    var hits = searchCatalog(key);
    if (hits.length) {
      return '<div class="ai-bubble"><strong>"' + esc(key) + '"</strong> 검색 결과 ' + hits.length + '건입니다.<div class="ai-results">' +
        hits.slice(0, 6).map(function (h) {
          var o = h.o, alt = altitudeOf(o);
          return '<div class="ai-result"><button class="ai-res-name" data-ai-open="' + esc(o.i) + '">' + esc(o.ko) + (o.M ? ' <em>' + esc(o.M) + '</em>' : '') + '</button>' +
            '<span class="ai-res-meta">' + esc(TYPE_LABEL[o.t] || o.t) + (o.c ? ' · ' + esc(o.c) : '') + (o.m != null && o.m < 90 ? ' · ' + o.m.toFixed(1) + '등' : '') +
            (alt ? ' · 지금 ' + alt.alt.toFixed(0) + '°' : '') + '</span>' +
            (o.ra != null ? '<button class="mini-btn" data-ai-aim=\'' + esc(JSON.stringify({ ra: o.ra, dec: o.dec, name: o.ko })) + '\'>🎯</button>' : '') + '</div>';
        }).join('') + '</div><span class="ai-small">카드를 누르면 상세 정보가 열립니다.</span></div>';
    }
    var ckHits = SD.COOKIES.filter(function (c) { return (c.t + ' ' + c.d + ' ' + c.s).toLowerCase().indexOf(key.toLowerCase()) >= 0; });
    if (ckHits.length) {
      return '<div class="ai-bubble">우주 쿠키에서 <strong>' + ckHits.length + '개</strong>를 찾았습니다.' +
        ckHits.slice(0, 4).map(function (c) { return '<div class="ai-cookie">🍪 <strong>' + esc(c.t) + '</strong> — ' + esc(c.s) + '<br><span class="ai-small">' + esc(c.d) + '</span></div>'; }).join('') + '</div>';
    }
    return '<div class="ai-bubble">로컬 도우미는 <strong>사이트 안의 데이터</strong>(도감 ' + SC.meta.count + '종, 우주 쿠키 ' + SD.COOKIES.length + '개, 오늘 밤 계산값)만으로 답합니다. "' + esc(q) + '"에 대한 자료를 찾지 못했습니다.<br>' +
      '<span class="ai-small">천체 이름(M42, 안드로메다, 베가…)이나 "오늘 뭐 보지", "달", "유성우"처럼 물어보세요. 더 자유로운 질문은 ⚙️에서 API 키를 넣으면 됩니다.</span></div>';
  }

  function searchCatalog(q) {
    var t = q.toLowerCase().replace(/\s+/g, '');
    if (t.length < 2) return [];
    var scored = [];
    SC.items.forEach(function (o) {
      var id = o.i.toLowerCase().replace(/\s+/g, '');
      var ko = o.ko.toLowerCase().replace(/\s+/g, '');
      var en = (o.en || '').toLowerCase().replace(/\s+/g, '');
      var sc = 0;
      if (id === t || ko === t) sc = 100;
      else if (id.indexOf(t) === 0 || ko.indexOf(t) === 0) sc = 80;
      else if (id.indexOf(t) >= 0 || ko.indexOf(t) >= 0 || en.indexOf(t) >= 0) sc = 50;
      if (sc) scored.push({ o: o, s: sc - (o.m == null ? 0 : Math.min(20, o.m)) });
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, 12);
  }

  function detectIntent(s) {
    if (/유성우|별똥별|페르세우스|쌍둥이자리\s*유성|리리드|사분의자리/.test(s)) return 'meteor';
    if (/추천|뭐\s*보|뭘\s*보|볼만|오늘\s*밤|지금.*(보|관측)|관측.*좋/.test(s)) return 'recommend';
    if (/(^|[^이번지난다음한])달(은|이|의|을|도|이\s|\s|$)|월령|위상|보름달|초승달|상현달|하현달/.test(s)) return 'moon';
    return '';
  }

  var PLANET_KO = { '수성': 'mercury', '금성': 'venus', '화성': 'mars', '목성': 'jupiter', '토성': 'saturn', '천왕성': 'uranus', '해왕성': 'neptune' };
  function planetMention(q) {
    for (var k in PLANET_KO) if (q.indexOf(k) >= 0) return PLANET_KO[k];
    var en = { mercury: 'mercury', venus: 'venus', mars: 'mars', jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus', neptune: 'neptune' };
    var low = q.toLowerCase();
    for (var e in en) if (new RegExp('\\b' + e + '\\b').test(low)) return en[e];
    return null;
  }

  function planetAnswer(key) {
    try {
      var st = window.OneulBam.state, c = st.last || window.OneulBam.computeNight();
      var p = window.Astro.planetPos(key, c.jd);
      var h = window.Astro.equatorialToHorizontal(p.raH, p.decD, st.site.lat, st.site.lon, c.jd);
      var ni = window.Astro.objectNight(p.raH, p.decD, st.site.lat, st.site.lon, st.dateStr);
      var A = window.Astro;
      var up = h.alt > 0;
      var dir = dirName(h.az);
      var line = up
        ? '<strong>' + esc(p.name) + '</strong>' + josa(p.name, '은', '는') + ' 지금 <strong>' + dir + ' ' + h.alt.toFixed(0) + '°</strong>에 떠 있습니다.'
        : '<strong>' + esc(p.name) + '</strong>' + josa(p.name, '은', '는') + ' 지금 지평선 아래(' + h.alt.toFixed(0) + '°)에 있습니다.';
      var when = ni && !ni.neverUp ? '<br>오늘 ' + esc(st.site.name) + ' 기준 <strong>' + A.fmtClock(ni.riseJd) + '에 뜨고 ' + A.fmtClock(ni.maxJd) + '에 가장 높이(' + ni.maxAlt.toFixed(0) + '°), ' + A.fmtClock(ni.setJd) + '에 집니다.' : '';
      return '<div class="ai-bubble">' + line + when +
        '<br>겉보기 등급 <strong>' + (p.mag != null ? p.mag.toFixed(1) : '—') + '등</strong>, 시지름 ' + (p.diamArcsec != null ? p.diamArcsec.toFixed(1) + '″' : '—') + ', 조명률 ' + (p.illum != null ? Math.round(p.illum * 100) + '%' : '—') + ' (위상각 ' + (p.phaseD != null ? p.phaseD.toFixed(0) + '°' : '—') + ').' +
        '<div class="ai-chips"><button class="ai-chip" data-ai-aim=\'' + esc(JSON.stringify({ planet: key, name: p.name })) + '\'>🎯 ' + esc(p.name) + ' 조준</button></div>' +
        '<span class="ai-small">라이브 하늘 뷰에서 그 방향으로 시선이 맞춰집니다.</span></div>';
    } catch (e) {
      return '<div class="ai-bubble">행성 위치를 계산하지 못했습니다. 페이지를 새로고침해 보세요.</div>';
    }
  }

  function objectMention(q) {
    var m = q.match(/\bM\s?(\d{1,3})\b/i);
    if (m) {
      var o = SC.items.find(function (x) { return x.i === 'M' + parseInt(m[1], 10); });
      if (o) return o;
    }
    var n = q.match(/\bNGC\s?(\d{1,4})\b/i);
    if (n) {
      var o2 = SC.items.find(function (x) { return x.i.replace(/\s/g, '') === 'NGC' + n[1]; });
      if (o2) return o2;
    }
    // 이름 부분 일치 — '안드로메다는'처럼 조사가 붙어도 찾는다
    var best = null, qq = q.replace(/\s/g, '').toLowerCase();
    var ALIAS = { '안드로메다': 'M31', '오리온성운': 'M42', '플레이아데스': 'M45', '게성운': 'M1', '솜브레로': 'M104', '소용돌이은하': 'M51' };
    for (var a in ALIAS) if (qq.indexOf(a) >= 0) { var ao = SC.items.find(function (x) { return x.i === ALIAS[a]; }); if (ao) return ao; }
    SC.items.forEach(function (o) {
      var ko = o.ko.replace(/\s/g, ''), en = (o.en || '').replace(/\s/g, '');
      if (ko.length < 2) return;
      var prefix = ko.length >= 5 ? ko.slice(0, ko.length - 2) : ko;
      if (qq.indexOf(ko.toLowerCase()) >= 0 || (prefix.length >= 3 && qq.indexOf(prefix.toLowerCase()) >= 0) ||
          (en.length > 2 && qq.indexOf(en.toLowerCase()) >= 0)) {
        if (!best || (o.M ? 1 : 0) > (best.M ? 1 : 0)) best = o;
      }
    });
    return best;
  }

  function objectAnswer(o, howto) {
    var h = altitudeOf(o);
    var alt = h ? (h.alt > 0 ? '지금 <strong>' + dirName(h.az) + ' ' + h.alt.toFixed(0) + '°</strong>에 떠 있습니다.' : '지금은 지평선 아래(' + h.alt.toFixed(0) + '°)입니다.') : '';
    var meta = esc(TYPE_LABEL[o.t] || o.t) + (o.c ? ' · ' + esc(o.c) + '자리' : '') + (o.m != null && o.m < 90 ? ' · ' + o.m.toFixed(1) + '등' : '') + (o.d ? ' · ' + (o.d >= 1e6 ? (o.d / 1e6).toFixed(1) + '백만 광년' : Math.round(o.d).toLocaleString('en-US') + '광년') : '');
    var tip = howto || /찾|어떻게|어디/.test('') ? findTip(o) : '';
    return '<div class="ai-bubble"><strong>' + esc(o.ko) + '</strong>' + (o.M ? ' (' + esc(o.M) + ')' : '') + ' — ' + meta + '.<br>' + alt +
      (o.x ? '<br>' + esc(o.x) : '') +
      (tip ? '<br><span class="ai-small">' + tip + '</span>' : '') +
      '<div class="ai-chips"><button class="ai-chip" data-ai-open="' + esc(o.i) + '">상세 정보</button>' +
      (o.ra != null ? '<button class="ai-chip" data-ai-aim=\'' + esc(JSON.stringify({ ra: o.ra, dec: o.dec, name: o.ko })) + '\'>🎯 조준</button>' : '') +
      '</div></div>';
  }

  var HOP = {
    M42: '오리온자리 세 별(삼태성) 아래로 늘어진 검(칼) 부분 한가운데에 흐릿한 빛덩어리가 M42입니다. 맨눈으로도 보입니다.',
    M31: '안드로메다자리 β(미라크)에서 μ·ν 별을 지나 두 단계 올라가면 흐릿한 타원이 보입니다. 맨눈으로도 가능한 어두운 곳에서 보세요.',
    M45: '황소자리 알데바란 오른쪽 위에 작은 국자 모양으로 모인 6~7개의 별이 플레이아데스입니다.',
    M13: '헤르쿨레스자리의 네 별(사각형) 중 하나인 η별과 ζ별 사이를 1/3쯤 따라가면 보입니다.',
    M8: '궁수자리 찻주전자 손잡이 위쪽, 은하수 띠 안에 흐릿한 빛덩어리로 보입니다.'
  };
  function findTip(o) {
    if (HOP[o.i]) return HOP[o.i];
    if (o.t === 'moon') return '달은 가장 밝아서 찾기 쉽습니다. 남쪽 하늘에서 밝은 원반을 찾으세요.';
    if (o.t === 'planet') return '행성은 깜빡이지 않고 일정한 밝기로 빛납니다. 그 별자리에서 가장 밝은 점을 찾으세요.';
    if (o.t === 'G' || o.t === 'GCl' || o.t === 'OCl') return '먼저 주변 별자리를 찾고, 카드의 좌표로 별을 따라가며 찾으세요. 쌍안경이면 충분한 대상도 많습니다.';
    if (o.t === 'star' || o.t === 'var') return '별자리 그림에서 가장 밝은 별을 기준으로 각거리를 따라가면 찾을 수 있습니다. 라이브 하늘 뷰의 조준 버튼을 쓰면 방향이 바로 나옵니다.';
    return '밝은 별을 길잡이로 삼아 조금씩 이동하며 찾으세요. 달이 없는 밤과 광공해가 적은 곳이 유리합니다.';
  }

  /* ======================================================================
     공통 닫기 / 키보드
     ====================================================================== */
  /* 사진 모달을 브라우저 기록에 한 칸 올려 둡니다.
     아이폰 앱(standalone)에서 화면 왼쪽 가장자리를 밀거나 뒤로 가기를 누르면
     페이지가 아니라 '보고 있던 사진 창'이 닫히게 됩니다. */
  var LB_HIST = false;
  function lbPush() {
    if (LB_HIST) return;
    try { history.pushState({ lb: 1 }, ''); LB_HIST = true; } catch (e) { }
  }
  function lbPop() {
    if (!LB_HIST) return;
    LB_HIST = false;
    try { history.back(); } catch (e) { }
  }
  window.addEventListener('popstate', function () {
    var m = document.getElementById('spaceModal');
    if (m && !m.hidden) {
      LB_HIST = false;
      m.hidden = true;
      document.body.classList.remove('space-lock');
    }
  });

  function closeAll() {
    ['cookieDrawer', 'aiDrawer', 'spaceModal'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    lbPop();
    document.body.classList.remove('space-lock');
    // 닫을 때 저장하지 않은 키가 입력칸에 남아 있지 않게 하고, 설정 패널·⚙ 상태를 접습니다.
    var key = document.getElementById('aiKey');
    if (key && AI.provider !== 'local') key.value = aiKey(AI.provider);
    else if (key) key.value = '';
    var settings = document.getElementById('aiSettings');
    if (settings) settings.hidden = true;
    var gear = document.getElementById('aiGear');
    if (gear) gear.setAttribute('aria-expanded', 'false');
    if (document.getElementById('aiStatus')) $('#aiStatus').textContent = '';
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!$('#spaceModal').hidden) { closeAll(); return; }
      if (!$('#cookieDrawer').hidden || !$('#aiDrawer').hidden) closeAll();
    }
    if (!$('#spaceModal').hidden) {
      if (e.key === 'ArrowRight') moveLightbox(1);
      if (e.key === 'ArrowLeft') moveLightbox(-1);
    }
  });

  function openAI() {
    closeAll();
    var d = $('#aiDrawer');
    if (!d) return;
    d.hidden = false;
    document.body.classList.add('space-lock');
    setTimeout(function () { var i = $('#aiInput'); if (i) i.focus(); }, 60);
  }

  /* ======================================================================
     시작
     ====================================================================== */
  function init() {
    if (!SD.COOKIES.length) return;
    buildDock();
    buildCookie();
    buildGallerySection();
    buildLightbox();
    buildCatalogBlock();
    buildAI();
    STATE.cookie = pickCookie();
    renderCookie();
  }

  window.SpaceUI = {
    openCookie: openCookie,
    openAI: openAI,
    openGallery: function () {
      closeAll();
      var s = $('#spacearchive');
      if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  else setTimeout(init, 0);
})();
