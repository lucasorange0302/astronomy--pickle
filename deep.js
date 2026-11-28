/* =========================================================================
   별너울 · 딥스카이 확장 (하이브리드 카탈로그)                    2026-11-28
   -------------------------------------------------------------------------
   한 개의 스위치(DeepSky.on)로 두 단계를 함께 켜고 끕니다.

   1단계 · 로컬 확장 성도 (지연 로딩 타일)
     assets/data/deep/manifest.json  +  d-<RA칸>-<적위띠>.json (72칸)
     HYG v4.1 원본에서 5.0~8.5등급 별 6만여 개. 현재 화면(적경·적위 반경)에
     걸치는 타일만 fetch 합니다. 오프라인·PWA 에서도 한 번 받은 타일은 다시
     쓰이므로 확대할수록 부드러워집니다.

   2단계 · Gaia DR3 실시간 조회 (약 18억 개 전체 카탈로그)
     CORS 를 허용하는 VizieR asu-tsv(I/355/gaiadr3)를 먼저 쓰고, 실패하면
     ESA Gaia TAP(ADQL, JSON) → ARI Heidelberg TAP 순서로 넘어갑니다.
     디바운스 420ms · 이전 요청 AbortController 취소 · 구역 LRU 캐시(24) ·
     실패하면 조용히 로컬 타일만 남깁니다(앱은 멈추지 않습니다).

   OFF 이면 위 두 단계의 네트워크 요청을 **한 건도** 보내지 않습니다.
   ========================================================================= */
(function () {
  'use strict';

  var KEY = 'bw.deepExt';
  var on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) { /* 사생활 보호 모드 */ }

  var TILE_DIR = 'assets/data/deep/';
  var TILE_MAG = 12;           // 로컬 타일 한계 등급(12등까지 11만 6천여 개)
  var LIVE_LOCAL_FOV = 60;     // 라이브 뷰: 이 시야(도) 이하에서 로컬 타일을 그립니다
  var LIVE_GAIA_FOV = 20;      // 라이브 뷰: 이 시야 이하에서 Gaia 실시간 조회
  var SKY_LOCAL_ZOOM = 1.5;    // 전천 지도: 이 배율 이상에서 로컬 타일
  var SKY_GAIA_ZOOM = 3.2;     // 전천 지도: 이 배율 이상에서 Gaia
  var GAIA_MAX = 400;          // 한 번에 받을 별 수
  var GAIA_MAG_MIN = 6.0, GAIA_MAG_MAX = 18.0;
  var GAIA_DEBOUNCE = 420;
  var GAIA_TIMEOUT = 9000;
  var EP_KEY = 'bw.gaia.ep';   // 어떤 Gaia 서버가 이 기기에서 실제로 응답했는지 기억(6시간)
  var TILE_MAX = 36;           // 메모리에 들고 있을 타일 수(LRU)
  var GAIA_MAX_CACHE = 20;

  /* VizieR asu-tsv 미러 — 앞에서부터 시도합니다. (Access-Control-Allow-Origin: * 확인) */
  var VIZIER = [
    'https://vizier.cfa.harvard.edu',
    'https://vizier.cds.unistra.fr'
  ];
  var TAP = [
    { url: 'https://gea.esac.esa.int/tap-server/tap/sync', kind: 'json', table: 'gaiadr3.gaia_source' },
    { url: 'https://gaia.ari.uni-heidelberg.de/tap/sync', kind: 'json', table: 'gaiadr3.gaia_source' }
  ];

  var manifest = null, manifestP = null, manifestErr = null;
  var tiles = {};              // key -> {ra0,ra1,d0,d1,s:[]}
  var tileState = {};          // key -> 'loading' | 'error'
  var tileOrder = [];          // LRU
  var gaiaCache = {};          // key -> {list, ra, dec, r, at, endpoint}
  var gaiaOrder = [];
  var gaiaTried = {};          // key -> 마지막 시도 시각(실패 쿨다운)
  var gi = { key: null, ctrl: null, timer: null, list: [], ra: 0, dec: 0, r: 0, at: 0, endpoint: '', busy: false, err: null };
  var stats = { tileReq: 0, tileOk: 0, tileErr: 0, gaiaReq: 0, gaiaOk: 0, gaiaFail: 0, stars: 0, lastEndpoint: '', lastErr: null };
  var subs = [];

  var RAD = Math.PI / 180;

  function mod(a, n) { return ((a % n) + n) % n; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------------------------------------------------------------- 구독 */
  function emit() {
    for (var i = 0; i < subs.length; i++) { try { subs[i](on); } catch (e) { /* 화면 하나가 실패해도 나머지는 */ } }
  }

  /* --------------------------------------------------------------- 상태 */
  function set(next, silent) {
    var want = !!next;
    if (want === on) { if (!silent) emit(); return on; }
    on = want;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* 저장이 막혀도 이번 세션은 적용 */ }
    if (!on) {
      /* OFF — 진행 중인 요청을 즉시 끊고, 메모리 캐시는 그대로 두되 그리지 않습니다. */
      abortGaia();
      clearTimeout(gi.timer); gi.timer = null; gi.key = null;
      gi.list = [];
    }
    if (!silent) emit();
    return on;
  }
  function toggle() { return set(!on); }

  /* ------------------------------------------------------- 로컬 타일 I/O */
  function loadManifest() {
    if (manifest) return Promise.resolve(manifest);
    if (manifestP) return manifestP;
    manifestP = fetch(TILE_DIR + 'manifest.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
      .then(function (m) { manifest = m; manifestErr = null; return m; })
      .catch(function (e) { manifestP = null; manifestErr = String(e && e.message || e); stats.lastErr = manifestErr; throw e; });
    return manifestP;
  }

  /** 타일 사각형과 (ra, dec) 사이의 대략적인 최단 각거리(도). */
  function tileDist(t, raDeg, decDeg) {
    var decNear = clamp(decDeg, t.d0, t.d1);
    var dDec = Math.abs(decNear - decDeg);
    var dRa = 180;
    for (var k = -1; k <= 1; k++) {
      var ra = raDeg + k * 360;
      if (ra >= t.ra0 && ra <= t.ra1) { dRa = 0; break; }
      dRa = Math.min(dRa, Math.min(Math.abs(ra - t.ra0), Math.abs(ra - t.ra1)));
    }
    var dRaArc = dRa * Math.cos(((decNear + decDeg) / 2) * RAD);
    return Math.sqrt(dRaArc * dRaArc + dDec * dDec);
  }

  function tilesNear(raDeg, decDeg, radiusDeg) {
    if (!manifest) return [];
    var out = [];
    for (var i = 0; i < manifest.tiles.length; i++) {
      var t = manifest.tiles[i];
      if (tileDist(t, raDeg, decDeg) <= radiusDeg) out.push(t);
    }
    return out;
  }

  function loadTile(key) {
    if (tiles[key] || tileState[key] === 'loading') return;
    tileState[key] = 'loading';
    stats.tileReq++;
    fetch(TILE_DIR + key + '.json', { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error(key + ' ' + r.status); return r.json(); })
      .then(function (doc) {
        tiles[key] = doc;
        stats.tileOk++;
        stats.stars += doc.n || doc.s.length;
        tileOrder.push(key);
        while (tileOrder.length > TILE_MAX) {
          var old = tileOrder.shift();
          if (old !== key) { delete tiles[old]; delete tileState[old]; }
        }
        delete tileState[key];
        emit();
      })
      .catch(function (e) {
        tileState[key] = 'error';
        stats.tileErr++;
        stats.lastErr = String(e && e.message || e);
        emit();
      });
  }

  /**
   * 화면에 걸치는 타일을 확보합니다. 이미 받은 타일은 건드리지 않습니다.
   * @returns {number} 새로 요청한 타일 수
   */
  function ensure(raDeg, decDeg, radiusDeg) {
    if (!on) return 0;
    var known = manifest ? tilesNear(raDeg, decDeg, radiusDeg) : [];
    var need = known.filter(function (t) { return !tiles[t.k] && tileState[t.k] !== 'loading'; });
    if (!manifest) {
      loadManifest().then(function () { ensure(raDeg, decDeg, radiusDeg); }).catch(function () { /* 조용히 */ });
      return 0;
    }
    var n = 0;
    for (var i = 0; i < need.length && i < 8; i++) { loadTile(need[i].k); n++; }
    return n;
  }

  /** 지금 받아 둔 타일에서 (ra, dec) 반경 안의 별 — 등급 오름차순 */
  function starsIn(raDeg, decDeg, radiusDeg, magLimit) {
    if (!on) return [];
    var lim = magLimit == null ? TILE_MAG : magLimit;
    var out = [];
    var near = manifest ? tilesNear(raDeg, decDeg, radiusDeg) : [];
    for (var i = 0; i < near.length; i++) {
      var doc = tiles[near[i].k];
      if (!doc) continue;
      var cosD = Math.cos(decDeg * RAD);
      for (var j = 0; j < doc.s.length; j++) {
        var s = doc.s[j];
        if (s[2] > lim) continue;
        var dRa = mod(s[0] - raDeg + 180, 360) - 180;
        var dDec = s[1] - decDeg;
        if (Math.abs(dDec) > radiusDeg) continue;
        if (Math.abs(dRa) * cosD > radiusDeg) continue;
        var a = dRa * cosD;
        if (a * a + dDec * dDec > radiusDeg * radiusDeg) continue;
        out.push({ ra: s[0], dec: s[1], mag: s[2], ci: s[3], name: s[4] || '', tile: near[i].k });
      }
    }
    out.sort(function (a, b) { return a.mag - b.mag; });
    return out;
  }

  /* ------------------------------------------------------------ Gaia I/O */
  function gaiaKey(raDeg, decDeg, rDeg) {
    return (Math.round(raDeg * 4) / 4) + '|' + (Math.round(decDeg * 4) / 4) + '|' + (Math.round(rDeg * 10) / 10);
  }

  function abortGaia() {
    if (gi.ctrl) { try { gi.ctrl.abort(); } catch (e) { /* 이미 끝난 요청 */ } gi.ctrl = null; }
  }

  /* ---------------------------------------------- Gaia 서버 기억(CORS) */
  function loadEp() { try { return JSON.parse(localStorage.getItem(EP_KEY) || '{}'); } catch (e) { return {}; } }
  function saveEp(o) { try { localStorage.setItem(EP_KEY, JSON.stringify(o)); } catch (e) { /* 저장 불가 */ } }
  function epUsable(name) {
    var e = loadEp()[name];
    if (!e || e.ok) return true;
    return (Date.now() - e.t) > 6 * 3600 * 1000;   // 6시간 뒤 다시 시도(오프라인이었을 수 있음)
  }
  function epMark(name, ok) {
    if (!ok && typeof navigator !== 'undefined' && navigator.onLine === false) return;   // 오프라인은 기억하지 않음
    var o = loadEp(); o[name] = { ok: !!ok, t: Date.now() }; saveEp(o);
  }

  /** 한 요청에 시간 제한을 겁니다. 바깥 신호(구역 이동·OFF)가 끊기면 즉시 취소됩니다. */
  function withTimeout(url, opts, sig) {
    var ctrl = new AbortController();
    if (sig) {
      if (sig.aborted) { try { ctrl.abort(); } catch (e) {} }
      else sig.addEventListener('abort', function () { try { ctrl.abort(); } catch (e) {} });
    }
    var t = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, GAIA_TIMEOUT);
    var o = { signal: ctrl.signal, cache: 'no-store', mode: 'cors', credentials: 'omit' };
    if (opts) for (var k in opts) o[k] = opts[k];
    return {
      ctrl: ctrl,
      done: fetch(url, o).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; })
    };
  }

  function vizierUrl(base, raDeg, decDeg, rDeg, max, magMin, magMax) {
    const lo = magMin == null ? GAIA_MAG_MIN : magMin;
    const hi = magMax == null ? GAIA_MAG_MAX : magMax;
    return base + '/viz-bin/asu-tsv?-source=I/355/gaiadr3'
      + '&-c=' + encodeURIComponent(raDeg.toFixed(6) + ' ' + decDeg.toFixed(6))
      + '&-c.rs=' + rDeg.toFixed(3)
      + '&-out=Source,RA_ICRS,DE_ICRS,Gmag,BP-RP,Plx'
      + '&-out.max=' + max
      + '&Gmag=' + lo.toFixed(1) + '..' + hi.toFixed(1)
      + '&-out.form=%7C';
  }

  /** VizieR asu-tsv 응답 → [{id, ra, dec, mag, bp_rp, plx}] */
  function parseVizier(text, magMin, magMax) {
    const lo = magMin == null ? GAIA_MAG_MIN : magMin;
    const hi = magMax == null ? GAIA_MAG_MAX : magMax;
    var lines = String(text || '').split(/\r?\n/);
    var rows = [], head = null;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (!ln || ln.charAt(0) === '#') continue;
      if (!head) {
        if (ln.indexOf('Source') === 0 && ln.indexOf('|') > 0) { head = ln.split('|'); }
        continue;
      }
      if (/^[-|\s]+$/.test(ln)) continue;                 // 단위·구분선
      var f = ln.split('|');
      if (f.length < 4) continue;
      var id = (f[0] || '').trim();
      if (!/^\d{6,}$/.test(id)) continue;
      var ra = parseFloat(f[1]), dec = parseFloat(f[2]), mag = parseFloat(f[3]);
      if (!isFinite(ra) || !isFinite(dec) || !isFinite(mag)) continue;
      if (mag < lo || mag > hi) continue;
      rows.push({
        id: id, ra: ra, dec: dec, mag: mag,
        bp_rp: isFinite(parseFloat(f[4])) ? parseFloat(f[4]) : null,
        plx: isFinite(parseFloat(f[5])) ? parseFloat(f[5]) : null,
        src: 'vizier'
      });
    }
    return rows;
  }

  /** TAP(ADQL) JSON 응답 → 같은 모양 */
  function parseTapJson(obj, magMin, magMax) {
    const lo = magMin == null ? GAIA_MAG_MIN : magMin;
    const hi = magMax == null ? GAIA_MAG_MAX : magMax;
    var out = [];
    var data = (obj && obj.data) || [];
    for (var i = 0; i < data.length; i++) {
      var d = data[i];
      var id = String(d.source_id || '');
      var mag = Number(d.phot_g_mean_mag);
      if (!/^\d{6,}$/.test(id) || !isFinite(mag)) continue;
      if (mag < lo || mag > hi) continue;
      out.push({
        id: id, ra: Number(d.ra), dec: Number(d.dec), mag: mag,
        bp_rp: isFinite(Number(d.bp_rp)) ? Number(d.bp_rp) : null,
        plx: isFinite(Number(d.parallax)) ? Number(d.parallax) : null,
        src: 'tap'
      });
    }
    return out;
  }

  function adql(raDeg, decDeg, rDeg, max, byId, magMin, magMax) {
    const lo = magMin == null ? GAIA_MAG_MIN : magMin;
    const hi = magMax == null ? GAIA_MAG_MAX : magMax;
    if (byId) {
      return "SELECT TOP 1 source_id, ra, dec, phot_g_mean_mag, bp_rp, parallax FROM gaiadr3.gaia_source WHERE source_id = " + byId;
    }
    return "SELECT TOP " + max + " source_id, ra, dec, phot_g_mean_mag, bp_rp, parallax FROM gaiadr3.gaia_source"
      + " WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS'," + raDeg.toFixed(5) + ',' + decDeg.toFixed(5) + ',' + rDeg.toFixed(4) + '))'
      + " AND phot_g_mean_mag BETWEEN " + lo + ' AND ' + hi
      + " ORDER BY phot_g_mean_mag";
  }

  function tapBody(query) {
    var b = new URLSearchParams();
    b.set('REQUEST', 'doQuery');
    b.set('LANG', 'ADQL');
    b.set('FORMAT', 'json');
    b.set('QUERY', query);
    return b.toString();
  }

  /** 한 구역을 실제로 조회합니다(미러·TAP 순차 시도). 실패하면 빈 배열. */
  function queryCone(raDeg, decDeg, rDeg, max, sig, magMin, magMax) {
    var jobs = [];
    VIZIER.forEach(function (base) {
      var name = base.replace(/^https?:\/\//, '');
      if (!epUsable(name)) return;
      jobs.push({
        name: name,
        run: function () {
          var w = withTimeout(vizierUrl(base, raDeg, decDeg, rDeg, max, magMin, magMax), null, sig);
          return w.done.then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
          }).then(function (txt) {
            /* 서버가 정상 응답했는데 별이 0개면 '이 구역에 없다'는 정답입니다 —
               다른 서버로 넘어가지 않습니다(불필요한 요청·콘솔 경고 방지). */
            return parseVizier(txt, magMin, magMax);
          });
        }
      });
    });
    TAP.forEach(function (t) {
      var name = t.url.replace(/^https?:\/\//, '');
      if (!epUsable(name)) return;
      jobs.push({
        name: name,
        run: function () {
          var w = withTimeout(t.url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tapBody(adql(raDeg, decDeg, rDeg, max, false, magMin, magMax)) }, sig);
          return w.done.then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
          }).then(function (txt) {
            var obj;
            try { obj = JSON.parse(txt); } catch (e) { throw new Error('JSON 아님'); }
            return parseTapJson(obj, magMin, magMax);
          });
        }
      });
    });

    var i = 0;
    function next() {
      if (i >= jobs.length) return Promise.resolve({ rows: [], endpoint: '' });
      var job = jobs[i++];
      return job.run().then(function (rows) {
        epMark(job.name, true);
        return { rows: rows, endpoint: job.name };
      }, function () { epMark(job.name, false); return next(); });
    }
    return next();
  }

  /** 디바운스된 Gaia 조회 — 같은 구역은 다시 묻지 않고, 이전 요청은 취소합니다. */
  function ensureGaia(raDeg, decDeg, rDeg, magMax) {
    if (!on) return;
    var r = clamp(rDeg, 0.5, 4);
    var hi = clamp(magMax == null ? GAIA_MAG_MAX : magMax, 10, GAIA_MAG_MAX);
    var key = gaiaKey(raDeg, decDeg, r) + '|' + hi.toFixed(1);
    /* 같은 구역은 성공·실패와 상관없이 한 번만 묻습니다(실패하면 조용히 로컬 타일만). */
    if (gi.key === key && (gi.busy || gi.list.length || gi.err)) return;
    var last = gaiaTried[key];
    if (last && Date.now() - last < 120000) return;      // 2분 안에 실패한 구역은 다시 묻지 않음
    var hit = gaiaCache[key];
    if (hit) {
      gi.key = key; gi.list = hit.list; gi.ra = hit.ra; gi.dec = hit.dec; gi.r = hit.r;
      gi.at = hit.at; gi.endpoint = hit.endpoint; gi.err = null;
      emit();
      return;
    }
    gi.key = key;
    clearTimeout(gi.timer);
    gi.timer = setTimeout(function () { runGaia(key, raDeg, decDeg, r, hi); }, GAIA_DEBOUNCE);
  }

  function runGaia(key, raDeg, decDeg, rDeg, magMax) {
    if (!on || gi.key !== key) return;
    abortGaia();
    var ctrl = new AbortController();
    gi.ctrl = ctrl;
    gi.busy = true; gi.err = null;
    stats.gaiaReq++;
    queryCone(raDeg, decDeg, rDeg, GAIA_MAX, ctrl.signal, 11.5, magMax).then(function (res) {
      if (gi.key !== key) return;                 // 그 사이 다른 구역으로 이동
      gi.ctrl = null;
      gi.busy = false;
      gaiaTried[key] = Date.now();
      if (res.rows.length) {
        stats.gaiaOk++;
        stats.lastEndpoint = res.endpoint;
        gi.list = res.rows; gi.ra = raDeg; gi.dec = decDeg; gi.r = rDeg; gi.at = Date.now();
        gi.endpoint = res.endpoint;
        gaiaCache[key] = { list: res.rows, ra: raDeg, dec: decDeg, r: rDeg, at: gi.at, endpoint: res.endpoint };
        gaiaOrder.push(key);
        while (gaiaOrder.length > GAIA_MAX_CACHE) { var old = gaiaOrder.shift(); if (old !== key) delete gaiaCache[old]; }
      } else {
        stats.gaiaFail++;
        gi.list = []; gi.at = Date.now(); gi.endpoint = '';
        gi.err = 'Gaia 응답 없음';
        stats.lastErr = 'Gaia 응답 없음';
      }
      emit();
    });
  }

  /** Gaia DR3 ID 하나 조회 — 확장 도감 검색용 */
  function gaiaById(id) {
    if (!on) return Promise.resolve({ rows: [], endpoint: '' });
    var clean = String(id).replace(/[^0-9]/g, '');
    if (!/^\d{6,}$/.test(clean)) return Promise.resolve({ rows: [], endpoint: '' });
    stats.gaiaReq++;
    var jobs = VIZIER.filter(function (base) { return epUsable(base.replace(/^https?:\/\//, '')); }).map(function (base) {
      return function () {
        var url = base + '/viz-bin/asu-tsv?-source=I/355/gaiadr3'
          + '&-out=Source,RA_ICRS,DE_ICRS,Gmag,BP-RP,Plx&-out.form=%7C&Source=' + clean;
        var w = withTimeout(url);
        return w.done.then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
          .then(function (txt) { return parseVizier(txt); });
      };
    });
    TAP.forEach(function (t) {
      if (!epUsable(t.url.replace(/^https?:\/\//, ''))) return;
      jobs.push(function () {
        var w = withTimeout(t.url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tapBody(adql(0, 0, 0, 1, clean)) });
        return w.done.then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
          .then(function (txt) { return parseTapJson(JSON.parse(txt)); });
      });
    });
    var i = 0;
    function next() {
      if (i >= jobs.length) return Promise.resolve({ rows: [], endpoint: '' });
      var job = jobs[i++];
      return job().then(function (rows) { return { rows: rows, endpoint: 'id' }; }, function () { return next(); });
    }
    return next();
  }

  function gaiaStars() { return on ? (gi.list || []) : []; }
  function gaiaMeta() { return { ra: gi.ra, dec: gi.dec, r: gi.r, at: gi.at, endpoint: gi.endpoint, busy: gi.busy, err: gi.err, n: (gi.list || []).length }; }

  /* --------------------------------------------------------- 이름 색인 */
  var namesP = null, namesDoc = null;
  function loadNames() {
    if (namesDoc) return Promise.resolve(namesDoc);
    if (namesP) return namesP;
    if (!on) return Promise.resolve(null);
    namesP = fetch(TILE_DIR + 'names.json', { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error('names ' + r.status); return r.json(); })
      .then(function (d) { namesDoc = d; return d; })
      .catch(function () { namesP = null; return null; });
    return namesP;
  }

  function searchNames(q, limit) {
    var n = String(q || '').toLowerCase().replace(/\s+/g, '');
    if (n.length < 2) return Promise.resolve([]);
    return loadNames().then(function (d) {
      if (!d) return [];
      var out = [];
      for (var i = 0; i < d.items.length; i++) {
        var it = d.items[i];
        if (String(it.n).toLowerCase().replace(/\s+/g, '').indexOf(n) >= 0) out.push(it);
        if (out.length >= (limit || 12)) break;
      }
      return out;
    });
  }

  /* ------------------------------------------------------------- 공개 API */
  window.DeepSky = {
    on: function () { return on; },
    set: set,
    toggle: toggle,
    subscribe: function (fn) { subs.push(fn); try { fn(on); } catch (e) {} },
    ensure: ensure,
    starsIn: starsIn,
    ensureGaia: ensureGaia,
    gaiaCone: function (raDeg, decDeg, rDeg, max) {
      if (!on) return Promise.resolve({ rows: [], endpoint: '' });
      return queryCone(raDeg, decDeg, clamp(rDeg, 0.5, 8), max || GAIA_MAX);
    },
    gaiaStars: gaiaStars,
    gaiaMeta: gaiaMeta,
    gaiaById: gaiaById,
    searchNames: searchNames,
    loadManifest: loadManifest,
    manifest: function () { return manifest; },
    recenterGaia: function () { gi.key = null; },
    tileMag: TILE_MAG,
    thresholds: {
      liveLocalFov: LIVE_LOCAL_FOV, liveGaiaFov: LIVE_GAIA_FOV,
      skyLocalZoom: SKY_LOCAL_ZOOM, skyGaiaZoom: SKY_GAIA_ZOOM
    },
    stats: function () {
      return {
        on: on, tileReq: stats.tileReq, tileOk: stats.tileOk, tileErr: stats.tileErr,
        gaiaReq: stats.gaiaReq, gaiaOk: stats.gaiaOk, gaiaFail: stats.gaiaFail,
        tilesHeld: Object.keys(tiles).length, starsLoaded: stats.stars,
        manifestCount: manifest ? manifest.count : 0, manifestError: manifestErr,
        lastEndpoint: stats.lastEndpoint, lastErr: stats.lastErr,
        gaiaBusy: gi.busy, gaiaCount: (gi.list || []).length
      };
    },
    /* 검증용 — 네트워크를 타지 않고 캐시를 비웁니다 */
    _reset: function () {
      abortGaia();
      clearTimeout(gi.timer); gi.timer = null; gi.key = null; gi.list = []; gi.busy = false;
      tiles = {}; tileState = {}; tileOrder = []; gaiaCache = {}; gaiaOrder = []; gaiaTried = {};
      stats.tileReq = stats.tileOk = stats.tileErr = stats.gaiaReq = stats.gaiaOk = stats.gaiaFail = 0;
    }
  };
})();
