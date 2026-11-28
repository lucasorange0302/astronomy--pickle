/* =========================================================================
   별너울 · 딥스카이 확장 (하이브리드 카탈로그)                    2026-11-28
   -------------------------------------------------------------------------
   한 개의 스위치(DeepSky.on)로 두 단계를 함께 켜고 끕니다.

   1단계 · 로컬 확장 성도 (지연 로딩 타일)
     assets/data/deep/manifest.json  +  d-<RA칸>-<적위띠>.json (144칸)
     HYG v4.1 원본에서 5.0~12.0등급 별 11만 6천여 개. 현재 화면(적경·적위 반경)에
     걸치는 타일만 fetch 합니다. 오프라인·PWA 에서도 한 번 받은 타일은 다시
     쓰이므로 확대할수록 부드러워집니다.
     이름이 없는 별은 실제 카탈로그 번호(HIP/HD/HR/HYG)로 보여 줍니다.

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
  /* 타일 데이터 판 — 파일 이름이 예전(72칸) 판과 겹치므로(d-00-00.json …) 주소에
     판 번호를 붙여 브라우저 HTTP 디스크 캐시·서비스 워커 캐시가 옛 타일을
     돌려주지 못하게 합니다. 타일을 새로 만들면 이 값을 올리세요. */
  var TILE_VER = '20261128.18';
  var TILE_Q = '?v=' + TILE_VER;
  var TILE_MAG = 12;           // 로컬 타일 한계 등급(12등까지 11만 6천여 개)
  var LIVE_LOCAL_FOV = 60;     // 라이브 뷰: 이 시야(도) 이하에서 로컬 타일을 그립니다
  var LIVE_GAIA_FOV = 20;      // 라이브 뷰: 이 시야 이하에서 Gaia 실시간 조회
  var SKY_LOCAL_ZOOM = 1.5;    // 전천 지도: 이 배율 이상에서 로컬 타일
  var SKY_GAIA_ZOOM = 3.2;     // 전천 지도: 이 배율 이상에서 Gaia
  var GAIA_MAX = 400;          // 한 번에 받을 별 수
  var GAIA_MAG_MIN = 6.0, GAIA_MAG_MAX = 20.8;   // Gaia DR3 실관측 한계(20.7등)까지
  var GAIA_DEBOUNCE = 420;
  /* VizieR 원뿔 조회는 서버가 붐빔 때 2~13초로 흔들립니다(2026-11-28 09~13초 실측).
     9초로 끊으면 느린 날에 “응답 없음”이 다시 뜨므로 15초까지 기다립니다 —
     기다리는 동안에는 지난 목록을 그대로 보여 주고(gi.stale), 실패한 서버는 6시간 쉼니다. */
  var GAIA_TIMEOUT = 15000;
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
  var gi = { key: null, ctrl: null, timer: null, list: [], ra: 0, dec: 0, r: 0, at: 0, endpoint: '', busy: false, err: null, stale: false };
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
      gi.list = []; gi.stale = false;
    }
    if (!silent) emit();
    return on;
  }
  function toggle() { return set(!on); }

  /* ------------------------------------------------------- 로컬 타일 I/O */
  function loadManifest() {
    if (manifest) return Promise.resolve(manifest);
    if (manifestP) return manifestP;
    manifestP = fetch(TILE_DIR + 'manifest.json' + TILE_Q, { cache: 'no-cache' })
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
    fetch(TILE_DIR + key + '.json' + TILE_Q, { cache: 'default' })
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

  /** 타일의 짧은 카탈로그 토큰 → 사람이 읽는 이름 (H12345 → HIP 12345).
      이름(고유명·바이어/플램스티드)이 없는 별의 제목으로 씁니다. */
  function catalogName(tok) {
    if (!tok) return '';
    var t = String(tok);
    var head = t.charAt(0);
    var num = t.slice(1);
    if (head === 'H') return 'HIP ' + num;
    if (head === 'D') return 'HD ' + num;
    if (head === 'R') return 'HR ' + num;
    if (head === 'Y') return 'HYG ' + num;
    return t;
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
        out.push({ ra: s[0], dec: s[1], mag: s[2], ci: s[3],
                   name: s[4] || catalogName(s[5]) || '확장 성도 별', cat: s[5] || '', tile: near[i].k });
      }
    }
    out.sort(function (a, b) { return a.mag - b.mag; });
    return out;
  }

  /* ------------------------------------------------------------ Gaia I/O */
  /** 조회 구역 키 — 반경이 작을수록 중심을 더 촘촘히 나눔니다(1′ 시야에서 화면을 조금
      밀어도 새 별을 받아 오도록). 반경은 toFixed(2) — 0.03° 가 0.0 으로 뭉개지지 않게. */
  function gaiaKey(raDeg, decDeg, rDeg) {
    var step = rDeg >= 0.5 ? 0.25 : rDeg >= 0.12 ? 0.05 : 0.01;
    var q = function (v) { return (Math.round(v / step) * step).toFixed(3); };
    return q(raDeg) + '|' + q(decDeg) + '|' + rDeg.toFixed(2);
  }

  /** 두 좌표 사이 각거리(도) */
  function angDeg(ra1, dec1, ra2, dec2) {
    var c = Math.sin(dec1 * RAD) * Math.sin(dec2 * RAD) +
      Math.cos(dec1 * RAD) * Math.cos(dec2 * RAD) * Math.cos((ra1 - ra2) * RAD);
    return Math.acos(clamp(c, -1, 1)) / RAD;
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

  /* VizieR asu-tsv 원뿔 조회 주소.
     · `-c=` 는 중심 좌표(적경 적위, 도)
     · `-c.rd=` 는 **반경(도)** — 예전 코드의 `-c.rs=` 는 **반경(각분)** 이라
       0.35도 자리에 0.35각분(≈0.0058도)을 물어 보고 있었고, 그래서 늘 0건이 왔습니다.
     · `-sort=Gmag` — -out.max 에 걸릴 때 밝은 별부터 받습니다(화면에 보이는 별이 됩니다). */
  function vizierUrl(base, raDeg, decDeg, rDeg, max, magMin, magMax) {
    const lo = magMin == null ? GAIA_MAG_MIN : magMin;
    const hi = magMax == null ? GAIA_MAG_MAX : magMax;
    return base + '/viz-bin/asu-tsv?-source=I/355/gaiadr3'
      + '&-c=' + encodeURIComponent(raDeg.toFixed(6) + ' ' + decDeg.toFixed(6))
      + '&-c.rd=' + rDeg.toFixed(4)
      + '&-out=Source,RA_ICRS,DE_ICRS,Gmag,BP-RP,Plx'
      + '&-out.max=' + max
      + '&Gmag=' + lo.toFixed(1) + '..' + hi.toFixed(1)
      + '&-out.form=%7C'
      + '&-sort=Gmag';
  }

  /** VizieR asu-tsv 응답 → [{id, ra, dec, mag, bp_rp, plx}]
      점검·차단 HTML 이 HTTP 200 으로 오는 경우가 있어, 표(헤더)가 아니면 **예외**를 던져
      다음 서버로 넘어가게 합니다(0건과 구별). */
  function parseVizier(text, magMin, magMax) {
    const lo = magMin == null ? GAIA_MAG_MIN : magMin;
    const hi = magMax == null ? GAIA_MAG_MAX : magMax;
    var src = String(text || '');
    if (/^\s*</.test(src) || /<html[\s>]/i.test(src.slice(0, 600))) throw new Error('VizieR HTML 응답');
    var lines = src.split(/\r?\n/);
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
    if (!head) throw new Error('VizieR TSV 헤더 없음');
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
    var r = clamp(rDeg, 0.02, 4);        // 1′ 시야에서도 넓은 구역을 묻지 않게
    var hi = clamp(magMax == null ? GAIA_MAG_MAX : magMax, 10, GAIA_MAG_MAX);
    var key = gaiaKey(raDeg, decDeg, r) + '|' + hi.toFixed(1);
    /* 같은 구역은 성공·실패와 상관없이 한 번만 묻습니다(실패하면 조용히 로컬 타일만). */
    if (gi.key === key && (gi.busy || (gi.list.length && !gi.stale))) return;
    var last = gaiaTried[key];
    if (last && Date.now() - last < 120000) return;      // 2분 안에 실패한 구역은 다시 묻지 않음
    var hit = gaiaCache[key];
    if (hit) {
      gi.key = key; gi.list = hit.list; gi.ra = hit.ra; gi.dec = hit.dec; gi.r = hit.r;
      gi.at = hit.at; gi.endpoint = hit.endpoint; gi.err = null; gi.stale = false;
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
        gi.endpoint = res.endpoint; gi.stale = false;
        gaiaCache[key] = { list: res.rows, ra: raDeg, dec: decDeg, r: rDeg, at: gi.at, endpoint: res.endpoint };
        gaiaOrder.push(key);
        while (gaiaOrder.length > GAIA_MAX_CACHE) { var old = gaiaOrder.shift(); if (old !== key) delete gaiaCache[old]; }
      } else {
        stats.gaiaFail++;
        gi.at = Date.now(); gi.endpoint = '';
        /* 새 구역에서 0건·실패가 왔더라도, 지난 목록이 지금 중심에서 2° 안이면 그대로
           그립니다 — 확대·이동 중에 별이 갑자기 사라지지 않게. */
        if (gi.list.length && angDeg(gi.ra, gi.dec, raDeg, decDeg) <= 2) {
          gi.stale = true;                  // 지난 구역 목록을 보여 주는 중(잠시 뒤 다시 묻습니다)
        } else {
          gi.list = []; gi.stale = false;
        }
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
  function gaiaMeta() { return { ra: gi.ra, dec: gi.dec, r: gi.r, at: gi.at, endpoint: gi.endpoint, busy: gi.busy, err: gi.err, stale: gi.stale, n: (gi.list || []).length }; }

  /* --------------------------------------------------------- 이름 색인 */
  var namesP = null, namesDoc = null;
  function loadNames() {
    if (namesDoc) return Promise.resolve(namesDoc);
    if (namesP) return namesP;
    if (!on) return Promise.resolve(null);
    namesP = fetch(TILE_DIR + 'names.json' + TILE_Q, { cache: 'default' })
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
    catalogName: catalogName,
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
      clearTimeout(gi.timer); gi.timer = null; gi.key = null; gi.list = []; gi.busy = false; gi.stale = false;
      tiles = {}; tileState = {}; tileOrder = []; gaiaCache = {}; gaiaOrder = []; gaiaTried = {};
      stats.tileReq = stats.tileOk = stats.tileErr = stats.gaiaReq = stats.gaiaOk = stats.gaiaFail = 0;
    }
  };
})();
