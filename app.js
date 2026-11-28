/* =========================================================================
   별너울 — app.js (UI · 계산 · 저장)
   의존: data.js (SKY_DATA), astro.js (Astro)
   ========================================================================= */
(function () {
  'use strict';

  const D = window.SKY_DATA;
  const A = window.Astro;

  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  const esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  const nf = function (v, d) { return Number(v).toFixed(d == null ? 0 : d); };

  /* ------------------------------------------------------------- 저장소 */
  const store = {
    // 저장 값이 깨졌거나(JSON 아님·null) 예전 버전과 모양이 다르면 기본값으로 되돌립니다.
    // 한 키가 이상하다고 화면 전체가 멈추지 않게 하는 방어선입니다.
    get: function (k, fallback) {
      try {
        const it = localStorage.getItem('ob.' + k);
        if (it == null) return fallback;
        const v = JSON.parse(it);
        if (v === null || v === undefined) return fallback;
        if (Array.isArray(fallback) && !Array.isArray(v)) return fallback;
        if (fallback && typeof fallback === 'object' && !Array.isArray(fallback) &&
            (typeof v !== 'object' || Array.isArray(v))) return fallback;
        return v;
      } catch (e) { return fallback; }
    },
    set: function (k, v) {
      try { localStorage.setItem('ob.' + k, JSON.stringify(v)); } catch (e) { /* file:// 제한 무시 */ }
    }
  };

  function todayKST() {
    const d = new Date(Date.now() + 9 * 3600000);
    return d.toISOString().slice(0, 10);
  }
  function weekdayKR(dateStr) {
    const p = dateStr.split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
  }
  function addDays(dateStr, n) {
    const p = dateStr.split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.toISOString().slice(0, 10);
  }
  function dirName(az) {
    const dirs = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
    return dirs[Math.round(A.mod(az, 360) / 45) % 8];
  }
  function hoursToHM(h) {
    const total = Math.round(Math.abs(h) * 60);
    const hh = Math.floor(total / 60), mm = total % 60;
    return (hh > 0 ? hh + '시간 ' : '') + (mm > 0 ? mm + '분' : (hh === 0 ? '0분' : ''));
  }

  /* --------------------------------------------------------------- 상태 */
  const savedSite = store.get('site', null);
  function usableSite(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
    const la = Number(s.lat), lo = Number(s.lon);
    return isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180;
  }
  const baseSite = Object.assign({}, D.meta.defaultSite);
  if (usableSite(savedSite)) {
    Object.keys(savedSite).forEach(function (k) { baseSite[k] = savedSite[k]; });
    baseSite.lat = Number(savedSite.lat);
    baseSite.lon = Number(savedSite.lon);
    if (savedSite.bortle != null && isFinite(Number(savedSite.bortle))) baseSite.bortle = Number(savedSite.bortle);
  }
  const state = {
    site: baseSite,
    dateStr: todayKST(),
    timeStr: '',
    equip: 1,
    filter: { type: 'all', equip: 'all', season: 'all', q: '' },
    siteRegion: '전체',
    siteBortle: 'all',
    conSeason: '전체',
    conQuery: '',
    siteSortNear: false,
    eventType: '전체',
    glossQ: '',
    glossGroup: '전체',
    fovMode: 'scope',
    fovTarget: 'moon',
    simJd: null,
    tmFrac: 0,
    tmSpeed: 5,
    follow: null,
    last: null
  };

  /* -------------------------------------------------------------- 공통 UI */
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (!ok) toast('복사가 차단되었습니다. 아래 미리보기를 길게 눌러 복사하세요.');
    return ok;
  }

  /* ------------------------------------------------------------- 시간 계산 */
  function selectedJD() {
    if (state.simJd != null) return state.simJd;
    if (!state.timeStr) {
      if (state.dateStr === todayKST()) return A.jdFromDate(new Date());
      return A.jdFromDate(A.localToDate(state.dateStr, '22:00'));
    }
    return A.jdFromDate(A.localToDate(state.dateStr, state.timeStr));
  }

  function computeNight() {
    const lat = state.site.lat, lon = state.site.lon;
    const night = A.scanDay(lat, lon, state.dateStr);
    const jd = selectedJD();

    const sun = A.sunPos(jd);
    const sunHor = A.equatorialToHorizontal(sun.raH, sun.decD, lat, lon, jd);
    const moonP = A.moonPos(jd);
    const moonH = A.equatorialToHorizontal(moonP.raH, moonP.decD, lat, lon, jd);
    const phase = A.moonPhase(jd);

    const planets = A.allPlanets(jd).map(function (p) {
      const hor = A.equatorialToHorizontal(p.raH, p.decD, lat, lon, jd);
      const night_ = A.objectNight(p.raH, p.decD, lat, lon, state.dateStr);
      return Object.assign({}, p, { hor: hor, nightInfo: night_ });
    });

    const darkStart = night.astro.dusk || night.nautical.dusk || night.civil.dusk;
    const darkEnd = night.astro.dawn || night.nautical.dawn || night.civil.dawn;
    const darkHours = (darkStart && darkEnd) ? (darkEnd - darkStart) * 24 : 0;

    // 시간별 구름양·강수(Open-Meteo) — 캐시된 값만 동기로 읽는다. 없으면 다음 틱에 받아 다시 그린다.
    const wx = (window.SkyWeather ? SkyWeather.cached(lat, lon, state.dateStr) : null);
    let cloud = null, cloudAt = null, rain = null, rainAt = null;
    if (wx && wx.status === 'ok') {
      cloudAt = SkyWeather.cloudFor(wx, { hour: selectedHour() });
      rainAt = SkyWeather.precipFor(wx, { hour: selectedHour() });
      if (state.timeStr || state.simJd != null) cloud = cloudAt;
      if (cloud == null) {
        const win = darkWindowHours(darkStart, darkEnd);
        cloud = SkyWeather.cloudFor(wx, { startH: win.start, endH: win.end });
        rain = SkyWeather.precipFor(wx, { startH: win.start, endH: win.end });
      }
      if (cloud == null) cloud = cloudAt;
      if (!rain) rain = rainAt;
    }
    const score = A.observingScore(phase.illum, state.site.bortle, darkHours, cloud, rain);

    return {
      night: night, jd: jd, sun: sun, sunHor: sunHor, moonPos: moonP, moonHor: moonH,
      phase: phase, planets: planets, darkStart: darkStart, darkEnd: darkEnd,
      darkHours: darkHours, score: score, lst: A.lstHours(jd, lon),
      wx: wx, cloud: cloud, cloudAt: cloudAt, rain: rain, rainAt: rainAt
    };
  }

  // 선택 시각(0~23). 시각을 비우면 오늘은 지금, 다른 날은 22시.
  function selectedHour() {
    if (state.timeStr) return parseInt(state.timeStr, 10);
    if (state.simJd != null) return parseInt(A.fmtClock(state.simJd), 10);
    if (state.dateStr === todayKST()) return new Date(Date.now() + 9 * 3600000).getUTCHours();
    return 22;
  }

  /* ------------------------------------------------------- 시각 칸 표시값
     시각 칸(input[type=time])을 비워 두면 iOS Safari에서는 아무 숫자도 보이지 않아
     '지금' 버튼을 눌러도 시각이 사라진 것처럼 보입니다. 그래서 화면에는 실제로 쓰이는
     시각(HH:MM)을 늘 채워 두고, state.timeStr · state.simJd 의 의미는 그대로 둡니다.
     · state.timeStr === ''  → 오늘은 지금 추적(분이 바뀌면 칸도 함께 갱신), 다른 날은 22:00
     · state.simJd != null   → 타임랩스·시간 조정 카드로 고른 시각 */
  function nowClockStr() {
    // JD 반올림(fmtClock)은 23:59:30을 00:00으로 보여 주므로, '지금'은 시계에서 바로 읽는다.
    const d = new Date(Date.now() + 9 * 3600000);
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  }

  function timeFieldValue() {
    if (state.simJd != null) return A.fmtClock(state.simJd);
    if (state.timeStr) return state.timeStr;
    return state.dateStr === todayKST() ? nowClockStr() : '22:00';
  }

  // 시각 칸에 표시값을 채운다. 사용자가 칸을 만지고 있는 동안에는 건드리지 않는다.
  function syncTimeField(force) {
    const ti = $('#timeInput');
    if (!ti) return;
    if (!force && document.activeElement === ti) return;
    const v = timeFieldValue();
    if (ti.value !== v) ti.value = v;
    updateNowBtn();
  }

  // '지금' 버튼이 지금 추적 중임을 색으로도 알린다.
  function updateNowBtn() {
    const b = $('#btnNow');
    if (!b) return;
    const live = !state.timeStr && state.simJd == null && state.dateStr === todayKST();
    b.setAttribute('aria-pressed', live ? 'true' : 'false');
  }

  /* --------------------------------------------- '지금' 시각 분 단위 자동 갱신
     시각 칸과 요약에 보이는 현재 시각을 분이 바뀔 때 함께 갱신합니다.
     state.timeStr 는 계속 ''로 두므로 계산(selectedJD)은 그대로 '지금'을 씁니다. */
  let liveDay = todayKST(), liveClock = nowClockStr();
  function tickLiveClock() {
    if (document.hidden) return;   // 화면을 보고 있을 때만 그린다(돌아오면 visibilitychange가 부릅니다)
    const t = todayKST();
    // 따라가던 '오늘'이 자정을 넘겨 새 날짜가 된 경우 — 날짜만 새 오늘로 옮긴다.
    if (!state.timeStr && state.simJd == null && state.dateStr === liveDay && t !== liveDay) {
      state.dateStr = t;
      state.tmFrac = 0;
      const di = $('#dateInput');
      if (di) di.value = t;
      liveDay = t;
      liveClock = '';
      renderAll({ fast: true });
      return;
    }
    liveDay = t;
    if (state.timeStr || state.simJd != null || state.dateStr !== t) return;
    const clock = nowClockStr();
    if (clock === liveClock) return;
    liveClock = clock;
    if (state.playing) { syncTimeField(true); return; }
    renderAll({ fast: true });   // 시각 칸·요약·하늘을 같은 시각으로 맞춘다
  }

  // 밤(어두운) 구간을 18~30시 정수 hour 범위로 (자정 넘김은 24+)
  function darkWindowHours(startJd, endJd) {
    if (startJd == null || endJd == null) return { start: 18, end: 30 };
    const a = parseInt(A.fmtClock(startJd), 10);
    const b0 = parseInt(A.fmtClock(endJd), 10);
    if (!isFinite(a) || !isFinite(b0)) return { start: 18, end: 30 };
    let b = b0 <= a ? b0 + 24 : b0;
    return { start: Math.max(18, a), end: Math.max(a + 1, b) };
  }

  /* ------------------------------------------------------------ 객체 위치 */
  function objectPosition(obj, jd, lat, lon) {
    if (obj.dynamic) {
      const p = A.planetPos(obj.dynamic, jd);
      return {
        raH: p.raH, decD: p.decD,
        hor: A.equatorialToHorizontal(p.raH, p.decD, lat, lon, jd),
        mag: p.mag, extra: p
      };
    }
    return {
      raH: obj.raH, decD: obj.decD,
      hor: A.equatorialToHorizontal(obj.raH, obj.decD, lat, lon, jd),
      mag: obj.mag, extra: null
    };
  }

  function objectNightInfo(obj, lat, lon) {
    if (obj.dynamic) {
      const p = A.planetPos(obj.dynamic, A.jdFromDate(A.localToDate(state.dateStr, '22:00')));
      return A.objectNight(p.raH, p.decD, lat, lon, state.dateStr);
    }
    return A.objectNight(obj.raH, obj.decD, lat, lon, state.dateStr);
  }

  /* ------------------------------------------------------ 달 SVG 렌더 */
  let moonGradSeq = 0;
  function moonSvg(illum, waxing) {
    const gid = 'moonG' + (++moonGradSeq);
    const r = 46, cx = 50, cy = 50;
    const signed = 1 - 2 * illum;            // +면 삭 쪽(초승), -면 망 쪽(보름)
    const rx = Math.max(0.6, r * Math.abs(signed));
    const sweep = signed >= 0 ? 0 : 1;
    const term = waxing ? sweep : 1 - sweep;
    const path = waxing
      ? 'M ' + cx + ' ' + (cy - r) + ' A ' + r + ' ' + r + ' 0 0 1 ' + cx + ' ' + (cy + r) +
        ' A ' + rx + ' ' + r + ' 0 0 ' + term + ' ' + cx + ' ' + (cy - r)
      : 'M ' + cx + ' ' + (cy - r) + ' A ' + r + ' ' + r + ' 0 0 0 ' + cx + ' ' + (cy + r) +
        ' A ' + rx + ' ' + r + ' 0 0 ' + term + ' ' + cx + ' ' + (cy - r);
    return '<svg viewBox="0 0 100 100" role="img" aria-label="달 위상">' +
      '<defs><radialGradient id="' + gid + '" cx="38%" cy="34%" r="70%">' +
      '<stop offset="0%" stop-color="#fff6da"/><stop offset="70%" stop-color="#ffe3a2"/><stop offset="100%" stop-color="#e8c47a"/></radialGradient></defs>' +
      '<circle cx="50" cy="50" r="46" fill="#151d30" stroke="rgba(255,255,255,.14)" stroke-width="1"/>' +
      '<path d="' + path + '" fill="url(#' + gid + ')" class="moon-lit"/>' +
      '<circle cx="39" cy="42" r="4.2" fill="rgba(180,150,90,.20)"/>' +
      '<circle cx="58" cy="62" r="5.6" fill="rgba(180,150,90,.16)"/>' +
      '<circle cx="62" cy="36" r="2.6" fill="rgba(180,150,90,.18)"/>' +
      '</svg>';
  }

  /* --------------------------------------------------------------- 히어로 */
  function renderHero(c) {
    const n = c.night, site = state.site;
    const timeLabel = state.simJd != null
      ? A.fmtClock(state.simJd) + ' (타임랩스)'
      : (state.timeStr || (state.dateStr === todayKST() ? nowClockStr() + ' (지금)' : '22:00 기준'));
    $('#summaryDate').textContent = (Number(state.dateStr.slice(5, 7))) + '월 ' +
      Number(state.dateStr.slice(8, 10)) + '일 (' + weekdayKR(state.dateStr) + ') ' + timeLabel;
    $('#summaryPlace').textContent = site.name + ' · Bortle ' + (site.bortle || '?');

    // 지금이 낮이면 아래 값들이 '지금 하늘' 기준임을 알리고, 한 번에 밤 22:00 기준으로 바꿀 수 있게 한다.
    const dayNote = $('#dayNote');
    if (dayNote) {
      const liveNow = !state.timeStr && state.simJd == null && state.dateStr === todayKST();
      dayNote.hidden = !(liveNow && c.sunHor.alt > 0);
    }

    $('#heroMoonSvg').innerHTML = moonSvg(c.phase.illum, c.phase.waxing);
    $('#heroMoonName').textContent = c.phase.name;
    $('#heroMoonPct').textContent = '밝기 ' + nf(c.phase.illum * 100) + '% · ' + nf(c.phase.age, 1) + '일';

    const start = c.darkStart, end = c.darkEnd;
    $('#heroDarkWindow').textContent = (start && end)
      ? A.fmtClock(start) + ' → ' + A.fmtClock(end)
      : (n.astro.dusk ? '—' : '천문박명 없음');
    const noMoon = noMoonDarkHours(c);
    $('#heroDarkHours').textContent = (start && end)
      ? '약 ' + hoursToHM(c.darkHours) + ' · ' + (noMoon < 0.34
          ? (c.night.moonUpAtSunset ? '달이 밤새 떠 있습니다' : '달 없는 시간 거의 없음')
          : '달 없는 시간 ' + hoursToHM(noMoon))
      : '박명 조건을 확인하세요';

    const score = c.score;
    $('#heroScoreNum').textContent = score;
    const arc = $('#scoreArc');
    arc.style.strokeDashoffset = String(264 - 264 * score / 100);
    arc.style.stroke = score >= 70 ? 'url(#scoreGrad)' : score >= 40 ? '#ffd479' : '#ff8a6a';
    let scoreLabel = score >= 80 ? '최고의 밤' : score >= 65 ? '아주 좋은 밤' : score >= 45 ? '볼 만한 밤' : score >= 25 ? '아쉬운 밤' : '관측 불리';
    if (c.cloud != null && c.cloud >= 85) scoreLabel = '구름 많아 관측 어려움';
    if (c.rain && (c.rain.mmMax >= 0.5 || (c.rain.prob || 0) >= 60)) scoreLabel = '비·눈 예보로 관측 어려움';
    $('#heroScoreNum').title = scoreLabel;

    // 점수 산출 근거 배지 — 구름 · 강수 · 달 · Bortle
    const basis = $('#heroScoreBasis');
    if (basis) {
      const bits = [];
      if (c.cloud != null) bits.push('<span class="sb-cloud">구름 ' + Math.round(c.cloud) + '%</span>');
      else if (c.wx) bits.push('<span class="sb-none">구름 예보 없음</span>');
      else bits.push('<span class="sb-loading">구름 확인 중</span>');
      if (c.rain && ((c.rain.mmMax || 0) > 0 || (c.rain.prob || 0) >= 30)) {
        bits.push('<span class="sb-rain">☔ ' + (c.rain.mmMax > 0 ? nf(c.rain.mmMax, 1) + 'mm/시' : '') +
          (c.rain.prob != null ? ((c.rain.mmMax > 0 ? ' · ' : '') + Math.round(c.rain.prob) + '%') : '') + '</span>');
      }
      bits.push('<span>달 ' + Math.round(c.phase.illum * 100) + '%</span>');
      bits.push('<span>Bortle ' + (site.bortle || '?') + '</span>');
      basis.innerHTML = bits.join('<i aria-hidden="true">·</i>');
      basis.title = c.cloud != null
        ? '구름 ' + Math.round(c.cloud) + '%는 관측 지수에 가장 크게 반영됩니다(85% 이상은 관측이 어렵습니다). 강수량·강수확률이 높으면 추가로 감점합니다.'
        : '구름 예보가 없어 맑은 하늘(구름 0%)을 가정했습니다.';
    }

    const hc = $('#heroCloud');
    if (hc) {
      if (c.wx && c.wx.status === 'ok') {
        const win = darkWindowHours(c.darkStart, c.darkEnd);
        const nv = SkyWeather.cloudFor(c.wx, { startH: win.start, endH: win.end });
        const rv = SkyWeather.precipFor(c.wx, { startH: win.start, endH: win.end });
        hc.textContent = (nv == null ? '—' : Math.round(nv) + '% · ' + SkyWeather.labelOf(nv)) +
          (rv && rv.prob != null && rv.prob >= 20
            ? ' · ☔ ' + Math.round(rv.prob) + '%' + (rv.mm >= 0.05 ? ' ' + nf(rv.mm, 1) + 'mm' : '')
            : '');
      } else if (c.wx) hc.textContent = '예보 없음';
      else hc.textContent = '확인 중…';
    }

    // 사이드
    $('#heroSunset').textContent = A.fmtClock(n.sunset);
    $('#heroDusk').textContent = A.fmtClock(n.astro.dusk || n.nautical.dusk);
    $('#heroDawn').textContent = A.fmtClock(n.astro.dawn || n.nautical.dawn);
    $('#heroMoonRS').textContent = A.fmtClock(n.moonRise) + ' / ' + A.fmtClock(n.moonSet);
    $('#heroLst').textContent = nf(c.lst, 1) + 'h';

    // TOP 3 (맨눈)
    const recs = recommend(c, 1, 3);
    const top = $('#heroTop3');
    if (!recs.length) {
      top.innerHTML = '<div class="top3-item">지금 이 시간대에 맨눈으로 볼 만한 대상이 없습니다. 시각을 22시로 바꿔 보세요.</div>';
    } else {
      top.innerHTML = recs.map(function (r, i) {
        return '<div class="top3-item" data-obj="' + esc(r.obj.id) + '">' +
          '<span class="top3-rank">' + (i + 1) + '</span>' +
          '<strong>' + esc(r.obj.name) + '</strong>' +
          '<span class="top3-why">' + esc(r.why) + '</span></div>';
      }).join('');
      $$('.top3-item[data-obj]').forEach(function (el) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', function () { openObject(el.getAttribute('data-obj')); });
      });
    }
  }

  /* ------------------------------------------------- 시간별 구름양 패널 */
  let wxSeq = 0;

  function kstClock(ts) {
    const d = new Date(ts + 9 * 3600000);
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  }
  function hh(h) {
    const n = ((h % 24) + 24) % 24;
    return (n < 10 ? '0' : '') + n;
  }

  function refreshWeather() {
    if (!window.SkyWeather) return;
    const lat = state.site.lat, lon = state.site.lon, date = state.dateStr;
    const seq = ++wxSeq;
    SkyWeather.fetch(lat, lon, date, function (snap) {
      if (seq !== wxSeq) return;
      if (state.dateStr !== date) return;
      if (Math.abs(state.site.lat - lat) > 1e-6 || Math.abs(state.site.lon - lon) > 1e-6) return;
      const c = computeNight();
      state.last = c;
      renderHero(c);
      renderCloudPanel(c);
    });
  }

  function renderCloudPanel(c) {
    const chart = $('#cloudChart');
    if (!chart) return;
    const pill = $('#cloudPill'), note = $('#cloudNote'), foot = $('#cloudFoot');
    const win = darkWindowHours(c.darkStart, c.darkEnd);
    const wx = c.wx;

    if (!wx) {
      chart.innerHTML = '<div class="cc-skel" aria-hidden="true">' +
        Array.apply(null, Array(13)).map(function () { return '<span></span>'; }).join('') + '</div>';
      if (pill) { pill.textContent = '확인 중'; pill.className = 'cloud-pill'; }
      if (note) note.textContent = 'Open-Meteo 시간별 예보 · 오늘 18시 → 내일 06시';
      if (foot) foot.textContent = '관측 지점의 시간별 구름양을 불러오는 중입니다.';
      return;
    }

    if (wx.status !== 'ok') {
      const why = wx.reason === 'range' ? '이 날짜는 기상 예보 제공 범위(16일) 밖입니다.'
        : wx.reason === 'timeout' ? '예보를 받아오는 데 시간이 걸리고 있습니다.'
          : wx.reason === 'network' ? '지금은 날씨 예보에 연결할 수 없습니다.'
            : '이 날짜·지점의 시간별 예보가 없습니다.';
      chart.innerHTML = '<div class="cc-empty"><b>기상 예보를 받지 못했어요</b>' +
        '<span>' + esc(why) + ' 관측 지수는 <b>맑음 기준(구름 0%)</b>으로 계산했습니다.</span>' +
        '<button class="mini-btn cc-retry" type="button" id="cloudRetry">↻ 다시 시도</button></div>';
      if (pill) { pill.textContent = '예보 없음'; pill.className = 'cloud-pill is-none'; }
      if (note) note.textContent = 'Open-Meteo · ' + (wx.reason === 'range' ? '예보 범위 밖' : '연결 실패');
      if (foot) foot.textContent = '인터넷 연결을 확인한 뒤 다시 시도해 보세요. 예보가 없는 날은 구름을 0%로 두고 계산합니다.';
      const rb = $('#cloudRetry');
      if (rb) rb.addEventListener('click', function () {
        try {
          Object.keys(window.localStorage).forEach(function (k) {
            if (k.indexOf('skywx.') === 0) localStorage.removeItem(k);
          });
        } catch (e) { /* 저장소 접근 제한 무시 */ }
        state.last = computeNight();
        renderHero(state.last);
        renderCloudPanel(state.last);
        refreshWeather();
        toast('시간별 구름양을 다시 불러옵니다.');
      });
      return;
    }

    const best = SkyWeather.bestWindow(wx);
    const showBest = !!best && best.hours < wx.series.length;
    const avg = SkyWeather.cloudFor(wx, { startH: win.start, endH: win.end });
    const rainAgg = SkyWeather.precipFor(wx, { startH: win.start, endH: win.end });
    let html = '<div class="cc-cols">';
    wx.series.forEach(function (s) {
      const v = s.cloud == null ? null : Math.round(s.cloud);
      const mm = s.mm == null ? 0 : s.mm;
      const prob = s.prob == null ? null : s.prob;
      const wet = mm > 0 || (prob != null && prob >= 50);
      let cls = 'cc-col';
      if (v == null) cls += ' is-na';
      else if (v <= 25) cls += ' is-clear';
      else if (v <= 50) cls += ' is-some';
      else if (v <= 85) cls += ' is-many';
      else cls += ' is-over';
      if (wet) cls += ' is-wet';
      if (showBest && s.abs >= best.from && s.abs <= best.to) cls += ' is-best';
      if (s.hour === 0) cls += ' is-midnight';
      const hPct = v == null ? 0 : Math.max(3, v);
      const rainPct = mm > 0 ? Math.min(100, 12 + mm * 18) : 0;
      const tip = hh(s.hour) + '시 · 구름 ' + (v == null ? '정보 없음' : v + '%') +
        (prob != null ? ' · 강수확률 ' + Math.round(prob) + '%' : '') +
        (mm > 0 ? ' · 강수량 ' + nf(mm, 1) + 'mm' : '');
      html += '<div class="' + cls + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
        '<span class="cc-val">' + (v == null ? '–' : v) + '</span>' +
        '<div class="cc-bar"><i style="height:' + hPct + '%"></i>' +
        (mm > 0 ? '<b class="cc-rain" style="height:' + rainPct + '%"></b>' : '') + '</div>' +
        '<span class="cc-h">' + hh(s.hour) + (wet ? '<i class="cc-wet" aria-hidden="true">💧</i>' : '') + '</span>' +
        '</div>';
    });
    html += '</div>';
    const wetSlots = wx.series.filter(function (s) { return (s.mm || 0) > 0 || (s.prob || 0) >= 60; });
    if (wetSlots.length) {
      html += '<p class="cc-rainline">☔ 비·눈 예보 ' + wetSlots.map(function (s) {
        return hh(s.hour) + '시 ' + ((s.mm || 0) > 0 ? nf(s.mm, 1) + 'mm' : '') +
          (s.prob != null ? ' ' + Math.round(s.prob) + '%' : '');
      }).join(' · ') + '</p>';
    } else {
      html += '<p class="cc-rainline is-dry">☔ 강수 예보 없음' +
        (rainAgg && rainAgg.prob != null ? ' · 밤 평균 강수확률 ' + Math.round(rainAgg.prob) + '%' : '') + '</p>';
    }
    if (showBest && best) {
      html += '<p class="cc-recommend">🎯 가장 맑은 관측 시간 <b>' +
        (best.from === best.to ? hh(best.from) + '시' : hh(best.from) + '시 – ' + hh(best.to) + '시') + '</b>' +
        '<span>평균 구름 ' + Math.round(best.mean) + '%</span></p>';
    } else if (best) {
      const firstH = wx.series.length ? wx.series[0].hour : 18;
      const lastH = wx.series.length ? wx.series[wx.series.length - 1].hour : 6;
      html += '<p class="cc-recommend">🌙 밤새 구름이 적습니다 <b>' + hh(firstH) + '시 – ' + hh(lastH) + '시</b>' +
        '<span>평균 구름 ' + Math.round(best.mean) + '%</span></p>';
    }
    chart.innerHTML = html;

    const shown = avg == null ? '—' : Math.round(avg) + '%';
    if (pill) {
      pill.textContent = shown + ' · ' + SkyWeather.labelOf(avg) + (wetSlots.length ? ' · ☔' : '');
      pill.className = 'cloud-pill ' + cloudClass(avg);
    }
    if (note) note.textContent = 'Open-Meteo · ' + kstClock(wx.fetchedAt) + ' 갱신 · 오늘 18시 → 내일 06시';
    if (foot) {
      const rainTxt = rainAgg && rainAgg.prob != null
        ? (rainAgg.mm > 0.05
          ? '강수확률 <b>' + Math.round(rainAgg.prob) + '%</b> · 밤 합계 <b>' + nf(rainAgg.mm, 1) + 'mm</b>'
          : '강수확률 <b>' + Math.round(rainAgg.prob) + '%</b>')
        : '강수 정보 없음';
      // 손가락 화면에는 마우스 호버가 없으니 안내 문구를 화면에 맞춥니다.
      const hintTxt = document.documentElement.getAttribute('data-layout') === 'mobile'
        ? '막대 위 숫자가 그 시각 구름양(%)이고, 파란 막대가 강수량입니다.'
        : '막대에 마우스를 올리면 그 시각 구름양·강수량·강수확률이 보입니다. 파란 막대가 강수량입니다.';
      foot.innerHTML = '밤 평균 구름 <b>' + shown + '</b> · ' + rainTxt + ' — 달·광공해와 함께 관측 지수에 반영됩니다. ' +
        '<span class="cc-hint">' + hintTxt + '</span> ' +
        '<button class="mini-btn cc-refresh" type="button" id="cloudRefresh">예보 새로고침</button>';
      const rb = $('#cloudRefresh');
      if (rb) rb.addEventListener('click', function () {
        try {
          Object.keys(window.localStorage).forEach(function (k) {
            if (k.indexOf('skywx.') === 0) localStorage.removeItem(k);
          });
        } catch (e) { /* ignore */ }
        state.last = computeNight();
        renderHero(state.last);
        renderCloudPanel(state.last);
        refreshWeather();
        toast('시간별 구름양을 다시 불러옵니다.');
      });
    }
  }

  function cloudClass(v) {
    if (v == null) return 'is-none';
    if (v <= 25) return 'is-clear';
    if (v <= 50) return 'is-some';
    if (v <= 85) return 'is-many';
    return 'is-over';
  }

  function noMoonDarkHours(c) {
    const n = c.night;
    if (!c.darkStart || !c.darkEnd) return 0;
    // 달이 떠 있는 구간을 어두운 시간에서 제거
    let moonStart = n.moonRise, moonEnd = n.moonSet;
    if (!moonStart && !moonEnd) {
      // 달이 밤새 떠 있거나 밤새 없음
      return (c.moonHor.alt > 0) ? 0 : c.darkHours;
    }
    let overlap = 0;
    if (moonStart && moonEnd && moonEnd > moonStart) {
      const s = Math.max(moonStart, c.darkStart), e = Math.min(moonEnd, c.darkEnd);
      if (e > s) overlap = (e - s) * 24;
    }
    return Math.max(0, c.darkHours - overlap);
  }

  /* ------------------------------------------------------------ 추천 엔진 */
  // 천체별 야간 정보 캐시 (같은 렌더 안에서 반복 계산 방지)
  function nightInfoCache(c, o) {
    if (!c._ni) c._ni = {};
    if (c._ni[o.id]) return c._ni[o.id];
    let ni;
    if (o.dynamic) {
      const p = c.planets.find(function (x) { return x.key === o.dynamic; }) || A.planetPos(o.dynamic, c.jd);
      ni = A.objectNight(p.raH, p.decD, state.site.lat, state.site.lon, state.dateStr);
    } else {
      ni = A.objectNight(o.raH, o.decD, state.site.lat, state.site.lon, state.dateStr);
    }
    c._ni[o.id] = ni;
    return ni;
  }

  function isDeepSky(o) {
    return /성운|은하|잔해|산개성단|구상성단|이중성/.test(o.type);
  }

  /** 유성우 활성 상태: 극대까지 남은 일수 */
  function meteorInfo(o, dateStr) {
    if (!o.meteor) return null;
    const p = dateStr.split('-').map(Number);
    const base = Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
    function nearest(mm, dd) {
      let best = null;
      for (let yy = p[0] - 1; yy <= p[0] + 2; yy++) {
        const t = Math.floor(Date.UTC(yy, mm - 1, dd) / 86400000);
        if (best === null || Math.abs(t - base) < Math.abs(best - base)) best = t;
      }
      return best;
    }
    const peak = nearest(o.meteor.peak[0], o.meteor.peak[1]);
    const from = nearest(o.meteor.from[0], o.meteor.from[1]);
    const to = nearest(o.meteor.to[0], o.meteor.to[1]);
    let toAdj = to;
    if (toAdj < from) toAdj += 365;
    return {
      active: base >= from && base <= toAdj,
      daysToPeak: peak - base,
      peakDoy: peak, zhr: o.meteor.zhr
    };
  }

  /**
   * recommend: 시각 jd 기준 정렬된 추천 목록
   * opts.tier  : 필요한 장비 단계 상한
   * opts.count : 반환 개수
   * opts.jd    : 기준 시각(기본 c.jd)
   * opts.ignoreMoon : 달빛 감점 무시(시간대별 계획용)
   */
  function recommend(c, tier, count, opts) {
    opts = opts || {};
    const lat = state.site.lat, lon = state.site.lon;
    const jd = opts.jd == null ? c.jd : opts.jd;
    const sunAlt = A.equatorialToHorizontal(c.sun.raH, c.sun.decD, lat, lon, jd).alt;
    const moonAlt = A.equatorialToHorizontal(c.moonPos.raH, c.moonPos.decD, lat, lon, jd).alt;
    const moonBright = c.phase.illum > 0.55 && moonAlt > 0;
    const items = [];

    D.catalog.forEach(function (o) {
      const lvl = o.dynamic ? 1 : o.equip;
      if (lvl > tier) return;
      if (o.group === 'meteor') {
        const mi = meteorInfo(o, state.dateStr);
        if (!mi || !mi.active) return;
      }
      if (o.dynamic) {
        const p = c.planets.find(function (x) { return x.key === o.dynamic; });
        if (!p || p.mag > 2.5) return;
      } else if (o.mag > 6.2) return;

      const ni = nightInfoCache(c, o);
      if (ni.neverUp || ni.maxAlt < 8) return;
      const pos = objectPosition(o, jd, lat, lon);

      let value = pos.hor.alt >= 8
        ? pos.hor.alt * 1.1 + (10 - clamp(pos.mag, -2, 8)) * 3
        : ni.maxAlt * 0.6 + (10 - clamp(pos.mag, -2, 8)) * 2 - 12;
      if (o.dynamic && pos.mag <= 0) value += 10;
      if (o.id === 'm42' || o.id === 'm45' || o.id === 'm31') value += 4;
      if (o.group === 'meteor') {
        const mi = meteorInfo(o, state.dateStr);
        value += 34 - Math.abs(mi.daysToPeak) * 7;
        if (Math.abs(mi.daysToPeak) <= 1) value += 26;   // 극대 당일·전날은 적극 추천
        if (ni.maxAlt < 20) value -= 18;
        if (pos.hor.alt < 15) value -= 45;               // 복사점이 낮으면 유성이 거의 안 보임
      }

      // 이유 표시
      const flags = [];
      if (pos.hor.alt >= 0 && pos.hor.alt < 15) flags.push('지평선 근처');
      // 해가 떠 있으면 '박명 중'이 아니라 '낮'입니다. (정오에 모든 대상이 '박명 중'으로 표시되던 문제)
      // 지평선 위(alt ≥ 8°·25°) 대상은 상태 배지가 이미 '낮 하늘'이라 '낮'을 또 붙이지 않습니다.
      if (sunAlt > 0) { if (pos.hor.alt < 8) flags.push('낮'); }
      else if (sunAlt > -12) flags.push('박명 중');
      if (moonBright && isDeepSky(o)) { flags.push('달빛 주의'); if (!opts.ignoreMoon) value -= 14; }
      if (o.group === 'meteor') {
        const mi = meteorInfo(o, state.dateStr);
        flags.push(mi.daysToPeak === 0 ? '오늘 극대' : (mi.daysToPeak > 0 ? '극대 D-' + mi.daysToPeak : '극대 지남'));
        if (c.phase.illum > 0.5) { flags.push('달빛 주의'); if (!opts.ignoreMoon) value -= 16; }
      }
      if (moonBright && o.dynamic && pos.mag > 1) value -= 3;

      let why, stateLabel;
      if (pos.hor.alt >= 25) { why = dirName(pos.hor.az) + ' ' + Math.round(pos.hor.alt) + '°'; stateLabel = sunAlt > 0 ? '낮 하늘' : '지금 좋음'; }
      else if (pos.hor.alt >= 8) { why = dirName(pos.hor.az) + ' ' + Math.round(pos.hor.alt) + '°'; stateLabel = sunAlt > 0 ? '낮 하늘' : '낮은 하늘'; }
      else if (pos.hor.alt >= 0) { why = dirName(pos.hor.az) + ' ' + Math.round(pos.hor.alt) + '°'; stateLabel = '지평선'; }
      else if (ni.riseJd && ni.riseJd > jd) { why = A.fmtClock(ni.riseJd) + ' 뜸'; stateLabel = '곧 뜸'; }
      else { why = '최고 ' + Math.round(ni.maxAlt) + '° · ' + A.fmtClock(ni.maxJd); stateLabel = '밤중'; }
      if (o.group === 'meteor') why = '복사점 ' + why;

      items.push({ obj: o, value: value, why: why, pos: pos, ni: ni, flags: flags, state: stateLabel });
    });

    items.sort(function (a, b) { return b.value - a.value; });
    return items.slice(0, count);
  }

  /* ------------------------------------------------------------- 타임라인 */
  function renderTimeline(c) {
    const n = c.night;
    const bar = $('#nightBar');
    const t0 = (n.sunset || c.jd) - 0.5 / 24;
    const t1 = (n.sunrise || (n.sunset ? n.sunset + 0.5 : c.jd + 0.5)) + 0.5 / 24;
    const span = t1 - t0;
    function pct(jd) { return clamp((jd - t0) / span * 100, 0, 100); }
    function seg(a, b, cls, label) {
      if (!a || !b || b <= a) return '';
      const left = pct(a), width = pct(b) - pct(a);
      return '<div class="night-seg ' + cls + '" style="width:' + width.toFixed(2) + '%" title="' +
        A.fmtClock(a) + '–' + A.fmtClock(b) + '">' +
        (label && width > 12 ? '<span>' + label + '</span>' : '') + '</div>';
    }
    const civilDusk = n.civil.dusk, nautDusk = n.nautical.dusk, astroDusk = n.astro.dusk;
    const astroDawn = n.astro.dawn, nautDawn = n.nautical.dawn, civilDawn = n.civil.dawn;

    let html = '';
    html += seg(t0, n.sunset, 'seg-day', '');
    if (astroDusk) {
      html += seg(n.sunset, civilDusk, 'seg-civil', '');
      html += seg(civilDusk, nautDusk, 'seg-naut', '');
      html += seg(nautDusk, astroDusk, 'seg-astro', '');
      html += seg(astroDusk, astroDawn, 'seg-dark', '완전한 어둠');
      html += seg(astroDawn, nautDawn, 'seg-astro', '');
      html += seg(nautDawn, civilDawn, 'seg-naut', '');
      html += seg(civilDawn, n.sunrise, 'seg-civil', '');
    } else {
      html += seg(n.sunset, civilDusk, 'seg-civil', '');
      html += seg(civilDusk, civilDawn, 'seg-naut', '밝은 밤');
      html += seg(civilDawn, n.sunrise, 'seg-civil', '');
    }
    html += seg(n.sunrise, t1, 'seg-day', '');

    // 달 떠 있는 시간
    if (n.moonRise && n.moonSet && n.moonSet > n.moonRise) {
      const a = Math.max(n.moonRise, t0), b = Math.min(n.moonSet, t1);
      if (b > a) {
        html += '<div class="moon-overlay" style="left:' + pct(a).toFixed(2) + '%;width:' +
          (pct(b) - pct(a)).toFixed(2) + '%" title="달이 떠 있는 시간"></div>';
      }
    }
    // 선택 시각 마커
    html += '<div class="night-marker" style="left:' + pct(c.jd).toFixed(2) + '%" data-label="' +
      (state.timeStr ? state.timeStr : '지금') + '"></div>';
    bar.innerHTML = html;

    const note = [];
    if (n.sunset) note.push('일몰 ' + A.fmtClock(n.sunset));
    if (astroDusk) note.push('천문박명 ' + A.fmtClock(astroDusk) + '~' + A.fmtClock(astroDawn));
    $('#timelineNote').textContent = note.join(' · ');
  }

  /* ------------------------------------------------------------- 달·태양 */
  function renderMoonSun(c) {
    $('#moonDetailSvg').innerHTML = moonSvg(c.phase.illum, c.phase.waxing);
    const n = c.night;
    const facts = [
      ['위상', c.phase.name],
      ['밝기', nf(c.phase.illum * 100) + '%'],
      ['월령', nf(c.phase.age, 1) + '일'],
      ['거리', Math.round(c.phase.distanceKm).toLocaleString() + ' km'],
      ['현재 고도', (c.moonHor.alt > 0 ? Math.round(c.moonHor.alt) + '° ' + dirName(c.moonHor.az) : '지평선 아래')],
      ['월출 / 월몰', A.fmtClock(n.moonRise) + ' / ' + A.fmtClock(n.moonSet)]
    ];
    $('#moonFacts').innerHTML = facts.map(function (f) {
      return '<div><span>' + f[0] + '</span><strong>' + esc(f[1]) + '</strong></div>';
    }).join('');

    const sunFacts = [
      ['일출 / 일몰', A.fmtClock(n.sunrise) + ' / ' + A.fmtClock(n.sunset)],
      ['시민박명', A.fmtClock(n.civil.dusk) + ' ~ ' + A.fmtClock(n.civil.dawn)],
      ['항해박명', A.fmtClock(n.nautical.dusk) + ' ~ ' + A.fmtClock(n.nautical.dawn)],
      ['천문박명', A.fmtClock(n.astro.dusk) + ' ~ ' + A.fmtClock(n.astro.dawn)],
      ['태양 고도(선택 시각)', Math.round(c.sunHor.alt) + '°'],
      ['태양 적위', nf(c.sun.decD, 1) + '°']
    ];
    $('#sunFacts').innerHTML = sunFacts.map(function (f) {
      return '<div><span>' + f[0] + '</span><strong>' + esc(f[1]) + '</strong></div>';
    }).join('');

    renderMoonStrip();
  }

  /* ------------------------------------------- 앞으로 14일 달 위상 */
  function renderMoonStrip() {
    const box = $('#moonStrip');
    if (!box) return;
    const cells = [];
    for (let i = 0; i < 14; i++) {
      const dstr = addDays(state.dateStr, i);
      const jd = A.jdFromDate(A.localToDate(dstr, '23:00'));
      const ph = A.moonPhase(jd);
      cells.push('<div class="ms-cell' + (i === 0 ? ' is-today' : '') + '" title="' + dstr + ' · ' + esc(ph.name) + ' ' + nf(ph.illum * 100) + '%">' +
        '<div class="ms-moon">' + moonSvg(ph.illum, ph.waxing) + '</div>' +
        '<div class="ms-date">' + Number(dstr.slice(5, 7)) + '/' + Number(dstr.slice(8, 10)) + '</div>' +
        '<div class="ms-pct">' + nf(ph.illum * 100) + '%</div></div>');
    }
    box.innerHTML = cells.join('');
  }

  /* --------------------------------------------------------------- 행성표 */
  function renderPlanets(c) {
    const tb = $('#planetTable tbody');
    const sunUp = c.sunHor && c.sunHor.alt > 0;
    const rows = c.planets.map(function (p) {
      const hor = p.hor, ni = p.nightInfo;
      let vis, cls;
      const riseHour = ni.riseJd ? Number(A.fmtClock(ni.riseJd).slice(0, 2)) : null;
      const setHour = ni.setJd ? Number(A.fmtClock(ni.setJd).slice(0, 2)) : null;
      if (ni.neverUp) { vis = '관측 불가'; cls = 'badge-bad'; }
      // 해가 떠 있으면 '좋음'이 아니라 '낮'(맨눈으로는 안 보임)으로 표시합니다.
      else if (sunUp && hor.alt >= 8) { vis = '낮'; cls = 'badge-mid'; }
      else if (hor.alt >= 20) { vis = '좋음'; cls = 'badge-good'; }
      else if (hor.alt >= 8) { vis = '낮음'; cls = 'badge-mid'; }
      else if (ni.maxAlt >= 15) {
        // 아직 안 떴지만 밤중에 볼 수 있음 → 어느 시간대인지 구분
        if (riseHour !== null && riseHour >= 1 && riseHour < 12) { vis = '새벽'; cls = 'badge-mid'; }
        else if (setHour !== null && setHour >= 15) { vis = '초저녁'; cls = 'badge-mid'; }
        else { vis = '밤중'; cls = 'badge-mid'; }
      }
      else { vis = '어려움'; cls = 'badge-bad'; }
      const color = {
        mercury: '#c9c9c9', venus: '#ffeab0', mars: '#ff8a6a', jupiter: '#ffd9a0',
        saturn: '#f0e2ad', uranus: '#9fe8e0', neptune: '#9db8ff'
      }[p.key];
      return '<tr>' +
        '<td class="pname"><i class="dot-color" style="background:' + color + '"></i>' + esc(p.name) + '</td>' +
        '<td>' + (p.mag > 0 ? '+' : '') + nf(p.mag, 1) + '</td>' +
        '<td>' + (hor.alt > 0 ? Math.round(hor.alt) + '°' : '—') + '</td>' +
        '<td>' + (hor.alt > 0 ? dirName(hor.az) : '—') + '</td>' +
        '<td>' + nf(p.diamArcsec, 1) + '″</td>' +
        '<td>' + A.fmtClock(ni.riseJd) + '</td>' +
        '<td>' + A.fmtClock(ni.maxJd) + '</td>' +
        '<td>' + A.fmtClock(ni.setJd) + '</td>' +
        '<td><span class="badge ' + cls + '"' + (vis === '낮' ? ' title="지금은 해가 떠 있어 맨눈으로는 보기 어렵습니다. 시각을 밤으로 바꾸면 밤 기준으로 보여 드립니다."' : '') + '>' + vis + '</span></td>' +
        '<td><button class="aim-btn" data-aim-planet="' + p.key + '" title="라이브 하늘 뷰에서 이 방향으로 조준">🎯</button></td>' +
        '</tr>';
    });
    tb.innerHTML = rows.join('');
  }

  /* ------------------------------------------------------------- 전천 지도 */
  // B−V 색지수 → 별빛 색 (푸름 ↔ 붉음). 값을 모르면 흰색.
  function bvColor(bv) {
    if (bv == null) return '#eef3ff';
    if (bv < -0.1) return '#b9d0ff';
    if (bv < 0.3) return '#d8e4ff';
    if (bv < 0.7) return '#f4f6ff';
    if (bv < 1.1) return '#fff3df';
    if (bv < 1.5) return '#ffe2be';
    return '#ffc79b';
  }
  function isWarm(bv) { return bv != null && bv > 0.7; }

  // ---------------------------------------------------- 전천 지도 터치 판정
  // 대표 별 18개의 투명 원만 두던 예전 방식과 달리, 지도에 그려진 모든 별을
  // 누를 수 있게 한다. 별은 등급별로 한 묶음 path 로 그려져 개별 요소가 없으므로,
  // 화면 좌표에서 가장 가까운 별을 찾아 고른다(밝을수록 그려진 점도 판정 반경도 크다).
  // 지도가 작아 별 800여 개가 빽빽하므로 반경은 라이브 뷰보다 좀게 잡는다(단위: CSS px).
  function skyMapStarRadius(mag) {
    return mag <= 2.5 ? 18 : mag <= 4 ? 14 : mag <= 5.2 ? 11 : 9;
  }
  // scale: CSS px → SVG 사용자 좌표 배율(도형이 화면에 작게 그려질수록 커진다)
  function skyMapPickStar(x, y, hits, count, scale) {
    const exact = 6 * scale;      // 손가락·마우스로 별을 정확히 짚은 경우
    let exactHit = null, exactD = Infinity, near = null, nearScore = Infinity;
    for (let i = 0; i < count; i++) {
      const h = hits[i];
      const dx = h.x - x, dy = h.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > h.r * scale) continue;
      if (d <= exact && d < exactD) { exactD = d; exactHit = h; }
      // 조금 빗나갔을 때는 '가까운 별 → 밝은 별' 순(어두운 별은 조금 불리하게)
      const score = d + (h.mag + 1.5) * 1.6;
      if (score < nearScore) { nearScore = score; near = h; }
    }
    return exactHit || near;
  }
  function skyMapTap(ev) {
    if (Date.now() < (smz.suppressUntil || 0)) return;   // 확대·이동 제스처 뒤의 click 은 무시
    const svg = ev.currentTarget;
    const count = svg._skyHitCount || 0;
    const hits = svg._skyHits;
    const rect = svg.getBoundingClientRect();
    if (!hits || !count || !rect.width || !rect.height) return;
    if (ev.clientX == null || ev.clientY == null) return;
    if (ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY < rect.top || ev.clientY > rect.bottom) return;
    const vb = 420;   // viewBox 0 0 420 420
    const sx = vb / rect.width, sy = vb / rect.height;
    const x = (ev.clientX - rect.left) * sx;
    const y = (ev.clientY - rect.top) * sy;
    const scale = Math.max(sx, sy);
    const star = skyMapPickStar(x, y, hits, count, scale);
    const starD = star ? Math.sqrt((star.x - x) * (star.x - x) + (star.y - y) * (star.y - y)) : Infinity;
    const el = ev.target && ev.target.closest ? ev.target.closest('[data-sky]') : null;
    if (el) {
      const v = el.getAttribute('data-sky').split(':');
      const kind = v[0], key = v.slice(1).join(':');
      // 대표 별의 투명 원(반경 11)은 옆 별을 덮으므로, 좌표로 찾은 별을 우선한다.
      if (kind === 'star') { showInspector('star', star ? star.name : key); return; }
      // 별자리 선은 별 위를 지나므로, 별을 정확히 짚었을 때만 별이 우선한다.
      if (kind === 'con') {
        if (star && starD <= 8 * scale) { showInspector('star', star.name); return; }
        showInspector('con', key);
        return;
      }
      // 달·행성·딥스카이는 기존대로 우선하되, 별 점 위를 5px 이내로 정확히 짚었으면 그 별.
      if (star && starD <= 5 * scale) { showInspector('star', star.name); return; }
      showInspector(kind, key);
      return;
    }
    if (star) showInspector('star', star.name);
  }

  /* ======================================================================
     전천 지도 — 두 손가락 핀치 확대·축소 (1× ~ 3.5×) + 한 손가락 이동
     · 지도(svg)에 CSS transform(translate·scale)만 겁니다. getBoundingClientRect 가
       변환된 크기를 돌려주므로, 기존 skyMapTap 의 좌표 계산도 확대 상태에서 그대로 맞습니다.
     · 확대한 뒤 한 손가락으로 끌면 지도를 옮기고, 그때는 탭(정보 열기)으로 보지 않습니다.
     · 1× 아래로는 줄지 않고, 「원래대로」 버튼으로 언제든 되돌립니다.
     ====================================================================== */
  const SKYMAP_ZOOM_MAX = 3.5;
  const smz = {
    s: 1, applied: 1, tx: 0, ty: 0, ptrs: new Map(), on: false, d0: 0, s0: 1,
    pan: null, B: null, u: { x: 0, y: 0 }, suppressUntil: 0
  };

  function skyMapEl() { return $('#skyMap'); }
  function skyMapBaseCenter() {
    const el = skyMapEl();
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    // 중심은 확대해도 제자리이므로, 지금 중심에서 이동분을 빼면 '변환 전' 지도 중심입니다.
    return { x: r.left + r.width / 2 - smz.tx, y: r.top + r.height / 2 - smz.ty };
  }
  function skyMapClampT() {
    const el = skyMapEl();
    if (!el) return;
    const r = el.getBoundingClientRect();
    const bw = r.width / (smz.applied || 1), bh = r.height / (smz.applied || 1);
    const mx = Math.max(0, (bw * smz.s - bw) / 2), my = Math.max(0, (bh * smz.s - bh) / 2);
    smz.tx = mx ? clamp(smz.tx, -mx, mx) : 0;
    smz.ty = my ? clamp(smz.ty, -my, my) : 0;
  }
  function skyMapApply() {
    const el = skyMapEl();
    if (!el) return;
    if (smz.s <= 1.001) { smz.s = 1; smz.tx = 0; smz.ty = 0; }
    el.style.transform = (smz.s === 1 && !smz.tx && !smz.ty) ? ''
      : 'translate(' + smz.tx.toFixed(1) + 'px,' + smz.ty.toFixed(1) + 'px) scale(' + smz.s.toFixed(3) + ')';
    smz.applied = smz.s;
    const wrap = el.parentNode;
    if (wrap && wrap.classList) wrap.classList.toggle('is-zoomed', smz.s > 1.001);
    el.style.touchAction = smz.s > 1.001 ? 'none' : 'pan-y';
    const btn = $('#skyMapReset');
    if (btn) {
      btn.hidden = smz.s <= 1.001;
      btn.textContent = smz.s.toFixed(1) + '× · 원래대로';
    }
  }
  function skyMapReset(animate) {
    const el = skyMapEl();
    if (!el) return;
    if (animate) {
      el.style.transition = 'transform .2s ease';
      setTimeout(function () { el.style.transition = ''; }, 230);
    }
    smz.s = 1; smz.tx = 0; smz.ty = 0;
    skyMapApply();
  }
  function skyMapZoomTo(newS, mid) {
    const s = clamp(newS, 1, SKYMAP_ZOOM_MAX);
    if (!smz.B) smz.B = skyMapBaseCenter();
    smz.s = s;
    if (mid) {
      // 손가락 사이 지점(mid) 아래의 지도 내용이 그 자리에 머물게 이동을 맞춥니다.
      smz.tx = (mid.x - smz.B.x) - s * smz.u.x;
      smz.ty = (mid.y - smz.B.y) - s * smz.u.y;
    }
    skyMapClampT();
    skyMapApply();
  }
  function skyMapZoomAtPoint(cx, cy, newS) {
    smz.B = skyMapBaseCenter();
    smz.u = { x: (cx - smz.B.x - smz.tx) / smz.s, y: (cy - smz.B.y - smz.ty) / smz.s };
    skyMapZoomTo(newS, { x: cx, y: cy });
  }

  function initSkyMapZoom() {
    const el = skyMapEl();
    if (!el || el._zoomInit) return;
    el._zoomInit = true;
    smz.applied = 1;
    skyMapApply();
    const wrap = el.parentNode;
    const btn = $('#skyMapReset');
    if (btn) btn.addEventListener('click', function () { skyMapReset(true); });
    if (!wrap) return;
    // iOS 사파리의 페이지 확대 제스처를 지도 위에서만 막습니다.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
      wrap.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false });
    });
    // 트랙패드·마우스 핀치(ctrl+휠)도 같은 확대·축소로 (평소 휠 스크롤은 그대로).
    wrap.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const s = clamp(smz.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, SKYMAP_ZOOM_MAX);
      skyMapZoomAtPoint(e.clientX, e.clientY, s);
    }, { passive: false });

    wrap.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      smz.ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (smz.ptrs.size === 2) {
        const a = Array.from(smz.ptrs.values());
        smz.on = true;
        smz.pan = null;
        smz.d0 = Math.max(12, Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y));
        smz.s0 = smz.s;
        smz.B = skyMapBaseCenter();
        const mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
        smz.u = { x: (mid.x - smz.B.x - smz.tx) / smz.s, y: (mid.y - smz.B.y - smz.ty) / smz.s };
        return;
      }
      if (smz.ptrs.size > 2) return;
      smz.pan = { x: ev.clientX, y: ev.clientY, tx: smz.tx, ty: smz.ty, moved: false };
    });

    window.addEventListener('pointermove', function (ev) {
      if (!smz.ptrs.has(ev.pointerId)) return;
      smz.ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (smz.on && smz.ptrs.size >= 2) {
        const a = Array.from(smz.ptrs.values());
        const d = Math.max(12, Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y));
        const mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
        skyMapZoomTo(smz.s0 * (d / smz.d0), mid);
        return;
      }
      if (!smz.pan || smz.s <= 1.001) return;
      const dx = ev.clientX - smz.pan.x, dy = ev.clientY - smz.pan.y;
      if (!smz.pan.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      smz.pan.moved = true;
      smz.tx = smz.pan.tx + dx;
      smz.ty = smz.pan.ty + dy;
      skyMapClampT();
      skyMapApply();
    });

    const up = function (ev) {
      if (!smz.ptrs.has(ev.pointerId)) return;
      smz.ptrs.delete(ev.pointerId);
      if (smz.on) {
        if (smz.ptrs.size < 2) smz.on = false;
        // 핀치/이동 뒤의 click 은 '탭'이 아니므로 잠깐 막습니다(정보 창이 엉뚱하게 열리지 않게).
        smz.suppressUntil = Date.now() + 400;
        if (smz.ptrs.size === 0) smz.pan = null;
        return;
      }
      if (smz.pan && smz.pan.moved) smz.suppressUntil = Date.now() + 400;
      if (smz.ptrs.size === 0) smz.pan = null;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function renderSkyMap(c) {
    const svg = $('#skyMap');
    const lat = state.site.lat, lon = state.site.lon, jd = c.jd;
    // 레드라이트 모드: 파란 성도 색이 그대로 남으면 암순응이 깨지므로 그리는 색 자체를 적색 팔레트로 바꿉니다.
    const red = isRed();
    const RC = red ? {
      sky0: 'rgba(74, 18, 11, .6)', sky1: 'rgba(9, 2, 1, .92)',
      ring: 'rgba(255, 120, 90, .22)', grid: 'rgba(255, 120, 90, .09)', tick: 'rgba(255, 120, 90, .24)',
      brightStar: '#ffb59a', dotCool: '#ff9d80', dotWarm: '#ffc0a0',
      con: 'rgba(255, 120, 90,', dso: 'rgba(255, 140, 110, .8)',
      planet: '#ffb08a', moon: 'rgba(255, 168, 132,', moonLabel: '#ffc0a4',
      zenith: 'rgba(255, 140, 110, .55)'
    } : null;
    const W = 420, cx = 210, cy = 206, R = 184;
    function proj(alt, az) {
      const r = R * (90 - alt) / 90;
      const th = az * Math.PI / 180;
      return { x: cx - r * Math.sin(th), y: cy - r * Math.cos(th) };
    }
    let s = '';
    s += '<defs><radialGradient id="skyG" cx="50%" cy="45%" r="60%">' +
      '<stop offset="0%" stop-color="' + (red ? RC.sky0 : 'rgba(30,48,90,.55)') + '"/>' +
      '<stop offset="100%" stop-color="' + (red ? RC.sky1 : 'rgba(6,10,20,.9)') + '"/>' +
      '</radialGradient></defs>';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#skyG)" stroke="' + (red ? RC.ring : 'rgba(255,255,255,.18)') + '" stroke-width="1"/>';
    [30, 60].forEach(function (alt) {
      const r = R * (90 - alt) / 90;
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r.toFixed(1) + '" fill="none" stroke="' + (red ? RC.grid : 'rgba(255,255,255,.07)') + '" stroke-dasharray="3 5"/>';
      s += '<text x="' + (cx + 3) + '" y="' + (cy - r + 11) + '" class="sky-label" opacity=".55">' + alt + '°</text>';
    });
    // 방위 눈금
    for (let az = 0; az < 360; az += 30) {
      const p1 = proj(0, az), p2 = proj(3, az);
      s += '<line x1="' + p1.x.toFixed(1) + '" y1="' + p1.y.toFixed(1) + '" x2="' + p2.x.toFixed(1) + '" y2="' + p2.y.toFixed(1) + '" stroke="' + (red ? RC.tick : 'rgba(255,255,255,.22)') + '" stroke-width="1"/>';
    }
    [['북', 0], ['동', 90], ['남', 180], ['서', 270]].forEach(function (d) {
      const p = proj(-4.5, d[1]);
      s += '<text x="' + p.x.toFixed(1) + '" y="' + p.y.toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" class="sky-cardinal">' + d[0] + '</text>';
    });

    // 별 — 1,600여 개. 밝은 별은 하나씩, 나머지는 등급·색 묶음별 path 하나로 그려 DOM을 줄인다.
    const visibleStars = {};
    const pos = new Array(D.stars.length);
    const dots = {};
    // 터치·클릭 판정용 — 지평선 위로 실제로 그려진 모든 별의 좌표(화면 좌표)와 등급.
    // 매 렌더마다 1,600여 개 객체를 새로 만들지 않도록 svg 에 붙인 풀을 재사용한다.
    const hitPool = svg._starHitPool || (svg._starHitPool = []);
    let hitN = 0;
    D.stars.forEach(function (st, i) {
      const h = A.equatorialToHorizontal(st[1], st[2], lat, lon, jd);
      if (h.alt <= 0) return;
      const p = proj(h.alt, h.az);
      pos[i] = p;
      visibleStars[st[0]] = p;
      const hit = hitPool[hitN] || (hitPool[hitN] = { x: 0, y: 0, name: '', mag: 0, r: 9 });
      hit.x = p.x; hit.y = p.y; hit.name = st[0]; hit.mag = st[3]; hit.r = skyMapStarRadius(st[3]);
      hitN++;
      const mag = st[3];
      if (mag <= 2.0) {
        const size = mag < 0.4 ? 3.4 : mag < 1.4 ? 2.8 : 2.3;
        s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + size +
          '" fill="' + (red ? RC.brightStar : bvColor(st[4])) + '" opacity="1"/>';
        return;
      }
      const key = (mag <= 3.5 ? 'mid' : mag <= 4.5 ? 'faint' : 'dim') + (isWarm(st[4]) ? 'Warm' : 'Cool');
      (dots[key] = dots[key] || []).push(p);
    });
    const DOT_STYLE = red ? {
      midCool: [RC.dotCool, 2.2, 0.95], midWarm: [RC.dotWarm, 2.2, 0.95],
      faintCool: [RC.dotCool, 1.7, 0.8], faintWarm: [RC.dotWarm, 1.7, 0.8],
      dimCool: [RC.dotCool, 1.3, 0.62], dimWarm: [RC.dotWarm, 1.3, 0.62]
    } : {
      midCool: ['#dbe6ff', 2.2, 0.95], midWarm: ['#fff0d8', 2.2, 0.95],
      faintCool: ['#cddcff', 1.7, 0.8], faintWarm: ['#ffe9cc', 1.7, 0.8],
      dimCool: ['#c3d4f5', 1.3, 0.62], dimWarm: ['#ffe0c4', 1.3, 0.62]
    };
    Object.keys(dots).forEach(function (key) {
      const stl = DOT_STYLE[key];
      const d = dots[key].map(function (p) { return 'M' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + 'h.1'; }).join('');
      s += '<path d="' + d + '" fill="none" stroke="' + stl[0] + '" stroke-width="' + stl[1] +
        '" stroke-linecap="round" opacity="' + stl[2] + '"/>';
    });

    // 별자리 선 88종 — 보이는 비율·중요도(rank)에 따라 진하기와 굵기를 조절
    const conCand = [];
    D.constellations.forEach(function (con) {
      let d = '', total = 0, shown = 0, sx = 0, sy = 0, n = 0;
      con.lines.forEach(function (pair) {
        total++;
        const a = pos[pair[0]], b = pos[pair[1]];
        if (!a || !b) return;
        shown++;
        d += 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + 'L' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
        sx += a.x + b.x; sy += a.y + b.y; n += 2;
      });
      if (!shown) return;
      const frac = shown / total;
      const op = (0.16 + 0.16 * frac) * (con.rank === 1 ? 1.5 : con.rank === 2 ? 1.18 : 0.95);
      s += '<g data-sky="con:' + esc(con.abbr) + '" style="cursor:pointer">' +
        '<path d="' + d + '" fill="none" stroke="' + (red ? RC.con + Math.min(0.6, op * 1.1).toFixed(2) + ')' : 'rgba(150,188,255,' + Math.min(0.62, op).toFixed(2) + ')') + '" stroke-width="' +
        (con.rank === 1 ? 1.5 : 1.15) + '" stroke-linecap="round"/>' +
        '<path d="' + d + '" fill="none" stroke="transparent" stroke-width="9"/></g>';
      const hor = A.equatorialToHorizontal(con.raH, con.decD, lat, lon, jd);
      let lx = n ? sx / n : cx, ly = n ? sy / n : cy, lalt = hor.alt;
      if (hor.alt > 6) { const lp = proj(hor.alt, hor.az); lx = lp.x; ly = lp.y; }
      conCand.push({ con: con, x: lx, y: ly, alt: lalt, frac: frac });
    });

    // 이름은 겹치지 않게 — 중요도(rank) → 하늘에 보이는 비율 → 고도 순으로 자리를 잡는다
    const boxes = [];
    function overlaps(x, y, w, h) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return true;
      }
      return false;
    }
    function putLabel(txt, x, y, size, color, cls, weight) {
      const w = txt.length * size * 0.98, h = size + 1.5;
      if (x - w / 2 < 4 || x + w / 2 > W - 4 || y - h < 2 || y > 414) return false;
      if (overlaps(x - w / 2 - 1, y - h, w + 2, h + 1)) return false;
      boxes.push({ x: x - w / 2 - 1, y: y - h, w: w + 2, h: h + 1 });
      s += '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle" class="' + (cls || 'sky-con-name') +
        '"' + (weight ? ' font-weight="' + weight + '"' : '') +
        ' style="fill:' + color + ';font-size:' + size + 'px">' + esc(txt) + '</text>';
      return true;
    }

    // 딥스카이 마커(심볼) — 이름표는 나중에 겹치지 않게 배치
    const dsoPts = [];
    D.catalog.filter(function (o) { return o.group === 'dso' && o.mag <= 6.5; }).forEach(function (o) {
      const h = A.equatorialToHorizontal(o.raH, o.decD, lat, lon, jd);
      if (h.alt < 3) return;
      const p = proj(h.alt, h.az);
      dsoPts.push({ o: o, p: p, alt: h.alt });
      s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4.2" fill="none" stroke="' + (red ? RC.dso : 'rgba(126,224,192,.75)') + '" stroke-width="1" stroke-dasharray="1.5 1.5"/>';
    });

    // ── 이름표 배치: 밝은 별 → 딥스카이 → 별자리. 겹치면 뒤 순위는 포기한다.
    ['시리우스', '베텔게우스', '리겔', '베가', '데네브', '알타이르', '카펠라', '폴룩스', '아르크투루스', '안타레스',
      '스피카', '레굴루스', '폴라리스', '알데바란', '프로키온', '포말하우트', '카노푸스', '아케르나르'].forEach(function (nm) {
      const p = visibleStars[nm];
      if (!p) return;
      const w = nm.length * 9.5 * 0.98;
      if (p.x + 5 + w > W - 3 || overlaps(p.x + 3, p.y - 11, w, 10)) return;
      boxes.push({ x: p.x + 3, y: p.y - 11, w: w, h: 10 });
      s += '<text x="' + (p.x + 5).toFixed(1) + '" y="' + (p.y - 4).toFixed(1) + '" class="sky-star-label">' + nm + '</text>';
    });

    dsoPts.sort(function (a, b) { return a.o.mag - b.o.mag; }).slice(0, 10).forEach(function (it) {
      const txt = it.o.name.replace(' 성단', '').replace(' 대성운', '');
      const w = txt.length * 7.6 * 0.98;
      if (it.p.x + 7 + w > W - 3 || overlaps(it.p.x + 5, it.p.y - 5, w, 10)) return;
      boxes.push({ x: it.p.x + 5, y: it.p.y - 5, w: w, h: 10 });
      s += '<text x="' + (it.p.x + 6).toFixed(1) + '" y="' + (it.p.y + 3).toFixed(1) + '" class="sky-dso-label">' + esc(txt) + '</text>';
    });

    conCand.sort(function (a, b) { return a.con.rank - b.con.rank || b.frac - a.frac || b.alt - a.alt; });
    let drawn = 0;
    conCand.forEach(function (it) {
      if (drawn >= 24) return;
      if (it.frac < 0.34) return;
      if (it.con.rank === 3 && drawn >= 10) return;
      const size = it.con.rank === 1 ? 10.5 : it.con.rank === 2 ? 9.2 : 8.2;
      const op = it.con.rank === 1 ? 0.9 : it.con.rank === 2 ? 0.74 : 0.6;
      if (putLabel(it.con.name, it.x, it.y, size, red ? 'rgba(255,170,140,' + op + ')' : 'rgba(190,212,255,' + op + ')', 'sky-con-name')) drawn++;
    });

    // 행성
    c.planets.forEach(function (p) {
      if (p.hor.alt <= 0) return;
      const pnt = proj(p.hor.alt, p.hor.az);
      const color = red ? RC.planet : {
        mercury: '#dcdcdc', venus: '#ffeab0', mars: '#ff8a6a', jupiter: '#ffd9a0',
        saturn: '#f0e2ad', uranus: '#9fe8e0', neptune: '#9db8ff'
      }[p.key];
      s += '<circle cx="' + pnt.x.toFixed(1) + '" cy="' + pnt.y.toFixed(1) + '" r="3.4" fill="' + color + '"/>';
      s += '<text x="' + (pnt.x + 6).toFixed(1) + '" y="' + (pnt.y - 3).toFixed(1) + '" class="sky-planet-label" fill="' + color + '">' + p.name + '</text>';
    });

    // 달
    if (c.moonHor.alt > 0) {
      const p = proj(c.moonHor.alt, c.moonHor.az);
      s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="7" fill="' + (red ? RC.moon : 'rgba(255,240,200,') + (0.3 + c.phase.illum * 0.7).toFixed(2) + ')"/>';
      s += '<text x="' + (p.x + 9).toFixed(1) + '" y="' + (p.y + 4).toFixed(1) + '" class="sky-planet-label" fill="' + (red ? RC.moonLabel : '#ffeec8') + '">달</text>';
    }

    // 천정
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="1.6" fill="' + (red ? RC.zenith : 'rgba(255,255,255,.5)') + '"/>';

    // --- 클릭·탭 히트 영역(투명) ---
    ['시리우스', '베텔게우스', '리겔', '베가', '데네브', '알타이르', '카펠라', '폴룩스', '아르크투루스',
      '안타레스', '스피카', '레굴루스', '폴라리스', '알데바란', '프로키온', '포말하우트', '카스토르', '미라크'].forEach(function (nm) {
      const p = visibleStars[nm];
      if (!p) return;
      s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="11" fill="transparent" data-sky="star:' + esc(nm) + '" style="cursor:pointer"/>';
    });
    D.catalog.filter(function (o) { return o.group === 'dso' && o.mag <= 6.5; }).forEach(function (o) {
      const h = A.equatorialToHorizontal(o.raH, o.decD, lat, lon, jd);
      if (h.alt < 3) return;
      const p = proj(h.alt, h.az);
      s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="11" fill="transparent" data-sky="dso:' + esc(o.id) + '" style="cursor:pointer"/>';
    });
    c.planets.forEach(function (p) {
      if (p.hor.alt <= 0) return;
      const q = proj(p.hor.alt, p.hor.az);
      s += '<circle cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="12" fill="transparent" data-sky="planet:' + p.key + '" style="cursor:pointer"/>';
    });
    if (c.moonHor.alt > 0) {
      const q = proj(c.moonHor.alt, c.moonHor.az);
      s += '<circle cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="14" fill="transparent" data-sky="moon:" style="cursor:pointer"/>';
    }
    svg.innerHTML = s;
    // 그려진 별 전체를 터치 판정 대상으로 넘긴다(위임 리스너는 한 번만 붙인다).
    svg._skyHits = hitPool;
    svg._skyHitCount = hitN;
    if (!svg._skyTapBound) {
      svg._skyTapBound = true;
      svg.addEventListener('click', skyMapTap);
    }
    $('#skyMapNote').textContent = state.simJd != null
      ? A.fmtClock(state.simJd) + ' KST (타임랩스)'
      : (state.timeStr ? state.timeStr + ' KST'
        : (state.dateStr === todayKST() ? nowClockStr() + ' KST (지금)' : '22:00 KST'));
  }

  /* ------------------------------------------------------ 오늘 밤 추천 목록 */
  function renderTargets(c) {
    const tiers = D.equipmentTiers;
    $('#tierTabs').innerHTML = tiers.map(function (t) {
      return '<button class="tier-tab' + (t.level === state.equip ? ' is-active' : '') + '" data-tier="' + t.level +
        '" role="tab" aria-selected="' + (t.level === state.equip) + '">' + esc(t.name) + '</button>';
    }).join('');
    $$('#tierTabs .tier-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        state.equip = Number(b.getAttribute('data-tier'));
        renderTargets(state.last);
      });
    });

    const recs = recommend(c, state.equip, 10);
    const box = $('#tonightTargets');
    if (!recs.length) {
      box.innerHTML = '<p class="muted small">이 장비 단계에서 지금 볼 수 있는 대상이 없습니다. 시각을 바꾸거나 장비 단계를 올려 보세요.</p>';
      return;
    }
    box.innerHTML = recs.map(function (r) {
      const o = r.obj;
      const flags = (r.flags || []).map(function (f) {
        return '<span class="flag' + (f === '달빛 주의' ? ' flag-warn' : '') + '">' + esc(f) + '</span>';
      }).join('');
      return '<div class="target-item" data-obj="' + esc(o.id) + '" role="button" tabindex="0">' +
        '<div><strong>' + esc(o.name) + '</strong> <span class="type-tag t-' + esc(o.type.replace(/ /g, '-')) + '">' + esc(o.type) + '</span>' +
        '<span class="state-tag">' + esc(r.state) + '</span>' +
        '<div class="t-sub">' + esc(o.brief) + '</div>' +
        (flags ? '<div class="t-flags">' + flags + '</div>' : '') + '</div>' +
        '<div class="t-geo">' + esc(r.why) + '<br><span class="small">' + (o.mag > 0 ? '+' : '') + nf(o.mag, 1) + '등</span>' +
        '<br><button class="aim-btn" data-aim="' + esc(o.id) + '" type="button">🎯 조준</button></div>' +
        '</div>';
    }).join('');
    $$('#tonightTargets .target-item').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        const aim = ev.target.closest ? ev.target.closest('[data-aim]') : null;
        if (aim) { ev.stopPropagation(); aimObject(aim.getAttribute('data-aim')); return; }
        openObject(el.getAttribute('data-obj'));
      });
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openObject(el.getAttribute('data-obj')); }
      });
    });
  }

  /* ------------------------------------------------ 시간대별 관측 계획 */
  function renderHourlyPlan(c) {
    const n = c.night;
    const box = $('#hourlyPlan');
    if (!n.sunset || !n.sunrise) {
      box.innerHTML = '<p class="muted small">이 날짜·지역에서는 밤 시간을 계산할 수 없습니다.</p>';
      return;
    }
    // 박명이 끝난 뒤부터 새벽 박명 전까지
    const darkFrom = n.astro.dusk || n.nautical.dusk || n.civil.dusk || (n.sunset + 0.5 / 24);
    const darkTo = n.astro.dawn || n.nautical.dawn || n.civil.dawn || (n.sunrise - 0.5 / 24);
    const midnight = A.jdFromDate(A.localMidnight(state.dateStr));
    const startH = midnight + Math.ceil((darkFrom - midnight) * 24) / 24;
    const endH = midnight + Math.floor((darkTo - midnight) * 24 - 0.2) / 24;
    const rows = [];
    // 1시간 간격, 최대 9개
    for (let jd = startH, k = 0; jd <= endH && k < 9; jd += 1 / 24, k++) {
      const list = recommend(c, 2, 1, { jd: jd, ignoreMoon: false });
      const r = list[0];
      if (!r) continue;
      const moonUp = A.equatorialToHorizontal(c.moonPos.raH, c.moonPos.decD, state.site.lat, state.site.lon, jd).alt > 0;
      rows.push(
        '<div class="hour-cell">' +
        '<div class="hour-time">' + A.fmtClock(jd) + '</div>' +
        '<div class="hour-obj" data-obj="' + esc(r.obj.id) + '">' + esc(r.obj.name) + '</div>' +
        '<div class="hour-meta">' + esc(r.why) + ' · ' + (r.obj.mag > 0 ? '+' : '') + nf(r.obj.mag, 1) + '등</div>' +
        '<div class="hour-moon">' + (moonUp ? '달 떠 있음 ' + nf(c.phase.illum * 100) + '%' : '달 없음') + '</div>' +
        '</div>'
      );
    }
    box.innerHTML = rows.length ? rows.join('') : '<p class="muted small">계산할 시간대가 없습니다.</p>';
    $$('#hourlyPlan .hour-obj').forEach(function (el) {
      el.addEventListener('click', function () { openObject(el.getAttribute('data-obj')); });
    });
  }

  /* ------------------------------------------------ 이번 달 어두운 밤 */
  function renderBestNights(c) {
    const box = $('#bestNights');
    const out = [];
    for (let i = 0; i < 30; i++) {
      const dstr = addDays(state.dateStr, i);
      const night = A.scanDay(state.site.lat, state.site.lon, dstr, true);
      const darkStart = night.astro.dusk || night.nautical.dusk;
      const darkEnd = night.astro.dawn || night.nautical.dawn;
      const darkH = (darkStart && darkEnd) ? (darkEnd - darkStart) * 24 : 0;
      const jdMid = A.jdFromDate(A.localToDate(dstr, '23:00'));
      const ph = A.moonPhase(jdMid);
      const score = A.observingScore(ph.illum, state.site.bortle, darkH);
      out.push({ date: dstr, score: score, illum: ph.illum, darkH: darkH, phase: ph.name });
    }
    const best = out.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
    best.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    box.innerHTML = best.map(function (b) {
      const isToday = b.date === todayKST();
      return '<div class="best-night">' +
        '<div class="bn-date">' + Number(b.date.slice(5, 7)) + '/' + Number(b.date.slice(8, 10)) +
        ' <small>(' + weekdayKR(b.date) + ')</small>' + (isToday ? ' <span class="bn-now">오늘</span>' : '') + '</div>' +
        '<div class="bn-score">' + b.score + '점</div>' +
        '<div class="bn-meta">달 ' + nf(b.illum * 100) + '% · ' + b.phase + ' · 어두운 시간 ' + nf(b.darkH, 1) + '시간</div>' +
        '<button class="mini-btn bn-btn" data-date="' + esc(b.date) + '">이 밤으로 보기</button>' +
        '</div>';
    }).join('');
    $$('#bestNights .bn-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.dateStr = b.getAttribute('data-date');
        state.timeStr = '';
        $('#dateInput').value = state.dateStr;
        syncTimeField(true);
        renderAll();
        toast(b.getAttribute('data-date') + ' 밤으로 날짜를 바꿨습니다.');
      });
    });
  }

  /* ------------------------------------------------------------- 도감 */
  function coarseType(o) {
    if (o.group === 'meteor') return '유성우';
    if (o.group === 'planet') return '행성';
    if (o.group === 'exo') return '외계행성';
    if (o.group === 'star') return '항성';
    if (o.type.indexOf('성단') >= 0) return '성단';
    if (o.type.indexOf('은하') >= 0) return '은하';
    return '성운';
  }
  function seasonOf(o) {
    if (!o.months || !o.months.length) return '사철';
    const m = o.months;
    if (m.length >= 9) return '사철';
    const seasons = [];
    if (m.some(function (x) { return x === 12 || x <= 2; })) seasons.push('겨울');
    if (m.some(function (x) { return x >= 3 && x <= 5; })) seasons.push('봄');
    if (m.some(function (x) { return x >= 6 && x <= 8; })) seasons.push('여름');
    if (m.some(function (x) { return x >= 9 && x <= 11; })) seasons.push('가을');
    return seasons.join(',');
  }

  function fmtRA(raH) {
    const h = Math.floor(raH);
    const m = Math.floor((raH - h) * 60);
    return (h < 10 ? '0' : '') + h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
  }
  function fmtDec(decD) {
    const sign = decD < 0 ? '−' : '+';
    const a = Math.abs(decD);
    const d = Math.floor(a);
    const m = Math.round((a - d) * 60);
    return sign + d + '° ' + (m < 10 ? '0' : '') + m + '′';
  }

  function buildChips() {
    const typeChips = [['all', '전체'], ['항성', '항성'], ['성운', '성운'], ['성단', '성단'], ['은하', '은하'], ['유성우', '유성우'], ['행성', '행성'], ['외계행성', '외계행성']];
    $('#typeFilters').innerHTML = typeChips.map(function (c) {
      return '<button class="chip' + (state.filter.type === c[0] ? ' is-active' : '') + '" data-v="' + c[0] + '">' + c[1] + '</button>';
    }).join('');
    const eqChips = [['all', '전체 장비'], ['1', '맨눈'], ['2', '쌍안경'], ['3', '망원경'], ['4', '사진·고급']];
    $('#equipFilters').innerHTML = eqChips.map(function (c) {
      return '<button class="chip' + (state.filter.equip === c[0] ? ' is-active' : '') + '" data-v="' + c[0] + '">' + c[1] + '</button>';
    }).join('');
    const seChips = [['all', '전체 계절'], ['봄', '봄'], ['여름', '여름'], ['가을', '가을'], ['겨울', '겨울'], ['사철', '사철']];
    $('#seasonFilters').innerHTML = seChips.map(function (c) {
      return '<button class="chip' + (state.filter.season === c[0] ? ' is-active' : '') + '" data-v="' + c[0] + '">' + c[1] + '</button>';
    }).join('');

    bindChipRow('#typeFilters', 'type');
    bindChipRow('#equipFilters', 'equip');
    bindChipRow('#seasonFilters', 'season');
  }
  function bindChipRow(sel, key) {
    $$(sel + ' .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        state.filter[key] = b.getAttribute('data-v');
        $$(sel + ' .chip').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
        renderCatalog(state.last);
      });
    });
  }

  function filteredCatalog() {
    const q = state.filter.q.trim().toLowerCase();
    return D.catalog.filter(function (o) {
      if (state.filter.type !== 'all' && coarseType(o) !== state.filter.type) return false;
      if (state.filter.equip !== 'all' && (o.dynamic ? 1 : o.equip) > Number(state.filter.equip)) return false;
      if (state.filter.season !== 'all' && seasonOf(o).indexOf(state.filter.season) < 0) return false;
      if (q) {
        const hay = [o.name, o.sub, o.con, o.type, o.brief, o.detail].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function renderCatalog(c) {
    if (!c) { c = computeNight(); }
    buildChips();
    const list = filteredCatalog();
    const grid = $('#catalogGrid');
    $('#catalogCount').textContent = list.length + '개 천체 · 등급이 밝은 순';
    if (!list.length) {
      grid.innerHTML = '<p class="muted">조건에 맞는 천체가 없습니다. 검색어나 필터를 바꿔 보세요.</p>';
      return;
    }
    const sortMode = ($('#sortSelect') && $('#sortSelect').value) || 'mag';
    const onlyVis = !!($('#onlyVisible') && $('#onlyVisible').checked);
    let working = list.slice();
    if (onlyVis) {
      working = working.filter(function (o) { return nightInfoCache(c, o).maxAlt > 5; });
      $('#catalogCount').textContent = working.length + '개 천체 · 오늘 밤 지평선 위에 뜨는 것만';
    }
    const sorted = working.sort(function (a, b) {
      if (sortMode === 'name') return a.name.localeCompare(b.name, 'ko');
      if (sortMode === 'diff') return (a.diff - b.diff) || (a.mag - b.mag);
      if (sortMode === 'alt') {
        const aa = objectPosition(a, c.jd, state.site.lat, state.site.lon).hor.alt;
        const bb = objectPosition(b, c.jd, state.site.lat, state.site.lon).hor.alt;
        return bb - aa;
      }
      const am = a.dynamic ? (A.planetPos(a.dynamic, c.jd).mag) : a.mag;
      const bm = b.dynamic ? (A.planetPos(b.dynamic, c.jd).mag) : b.mag;
      return am - bm;
    });
    grid.innerHTML = sorted.map(function (o) {
      const pos = objectPosition(o, c.jd, state.site.lat, state.site.lon);
      let geo;
      if (o.group === 'meteor') {
        const mi = meteorInfo(o, state.dateStr);
        const st = !mi.active ? '활동 시기 아님' : mi.daysToPeak === 0 ? '오늘 극대' : mi.daysToPeak > 0 ? '극대 D-' + mi.daysToPeak : '극대 지남';
        geo = st + ' · 복사점 ' + (pos.hor.alt > 0 ? dirName(pos.hor.az) + ' ' + Math.round(pos.hor.alt) + '°' : '지평선 아래');
      } else if (pos.hor.alt > 0) geo = '지금 ' + dirName(pos.hor.az) + ' ' + Math.round(pos.hor.alt) + '°';
      else {
        const ni = nightInfoCache(c, o);
        geo = ni.neverUp ? '한국에서 안 보임' : (ni.maxAlt > 8 ? '최고 ' + Math.round(ni.maxAlt) + '°' : '낮음');
      }
      const moonRisk = c.phase.illum > 0.55 && c.moonHor.alt > 0 && isDeepSky(o) && o.mag > 5;
      if (moonRisk) geo = '달빛 주의 · ' + geo;
      return '<div class="obj-card" role="button" tabindex="0" data-obj="' + esc(o.id) + '">' +
        '<div class="obj-card-top"><div><div class="obj-name">' + esc(o.name) + '</div>' +
        '<div class="obj-sub">' + esc(o.sub) + '</div></div>' +
        '<span class="type-tag t-' + esc(o.type.replace(/ /g, '-')) + '">' + esc(o.type) + '</span></div>' +
        '<p class="obj-brief">' + esc(o.brief) + '</p>' +
        '<div class="obj-meta">' + (o.group === 'meteor'
          ? '<span>ZHR <b>' + o.meteor.zhr + '</b></span><span>모천체 <b>' + esc(o.meteor.parent) + '</b></span>'
          : '<span>등급 <b>' + (pos.mag > 0 ? '+' : '') + nf(pos.mag, 1) + '</b></span><span>거리 <b>' + esc(o.dist) + '</b></span>') +
        '<span><b>' + esc(o.con) + '</b></span></div>' +
        '<div class="obj-card-foot"><span class="diff">' +
        [1, 2, 3, 4, 5].map(function (i) { return '<i class="' + (i <= o.diff ? 'on' : '') + '"></i>'; }).join('') +
        '</span><span class="geo-now">' + esc(geo) + '</span></div>' +
        '<div class="aim-row"><button class="aim-btn" data-aim="' + esc(o.id) + '" type="button">🎯 하늘에서 조준</button></div>' +
        '</div>';
    }).join('');

    $$('#catalogGrid .obj-card').forEach(function (el) {
      el.addEventListener('mouseenter', function () {
        if (!window.SkyPhoto) return;
        const o = D.catalog.find(function (x) { return x.id === el.getAttribute('data-obj'); });
        if (o) SkyPhoto.prefetch(o);
      });
      el.addEventListener('click', function (ev) {
        const aim = ev.target.closest ? ev.target.closest('[data-aim]') : null;
        if (aim) { ev.stopPropagation(); aimObject(aim.getAttribute('data-aim')); return; }
        openObject(el.getAttribute('data-obj'));
      });
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openObject(el.getAttribute('data-obj')); }
      });
    });
  }

  /* ------------------------------------------------------------- 모달 */
  function openObject(id) {
    const o = D.catalog.find(function (x) { return x.id === id; });
    if (!o) return;
    const c = state.last || computeNight();
    const pos = objectPosition(o, c.jd, state.site.lat, state.site.lon);
    const ni = objectNightInfo(o, state.site.lat, state.site.lon);
    const eq = D.equipmentTiers.find(function (t) { return t.level === o.equip; });

    let nowLine;
    if (ni.neverUp) nowLine = '<span>이 위도에서는 지평선 위로 올라오지 않습니다.</span>';
    else {
      nowLine = '<span>선택 시각: ' + (pos.hor.alt > 0 ? dirName(pos.hor.az) + ' ' + Math.round(pos.hor.alt) + '°' : '지평선 아래') + '</span>' +
        '<span>오늘 밤 최고: ' + Math.round(ni.maxAlt) + '° (' + A.fmtClock(ni.maxJd) + ')</span>' +
        '<span>출/몰: ' + A.fmtClock(ni.riseJd) + ' / ' + A.fmtClock(ni.setJd) + '</span>';
    }

    $('#modalBody').innerHTML =
      '<div class="md-head"><h2 id="modalTitle">' + esc(o.name) + '</h2>' +
      '<div class="md-sub">' + esc(o.sub) + ' · ' + esc(o.type) + ' · ' + esc(o.con) + '</div></div>' +
      '<div class="md-stats">' +
      (o.group === 'meteor' ? (
        stat('ZHR', o.meteor.zhr + '개/시간', '완벽한 조건에서 시간당 유성 수(이론값). 실제는 훨씬 적습니다.') +
        stat('활성 기간', o.meteor.from[0] + '/' + o.meteor.from[1] + ' ~ ' + o.meteor.to[0] + '/' + o.meteor.to[1]) +
        stat('모천체', o.meteor.parent) +
        stat('유속', o.meteor.speed + ' km/s') +
        stat('복사점 적경', fmtRA(pos.raH), '유성이 퍼져 나오는 것처럼 보이는 하늘의 점.') +
        stat('복사점 적위', fmtDec(pos.decD), '복사점 고도가 높을수록 유성이 많이 보입니다.') +
        stat('관측 난이도', '★'.repeat(o.diff) + '☆'.repeat(Math.max(0, 5 - o.diff))) +
        stat('필요 장비', '맨눈')
      ) : (
        stat('겉보기 등급', (pos.mag > 0 ? '+' : '') + nf(pos.mag, 1) + '등', '지구에서 본 밝기. 숫자가 작을수록 밝습니다.') +
        stat('거리', o.dist) +
        stat('크기', o.size, '하늘에서 차지하는 각도 크기. 달이 약 0.5°(30′)입니다.') +
        stat('적경', fmtRA(pos.raH), '하늘의 가로 좌표(경도 같은 것). 24시간이 360°입니다.') +
        stat('적위', fmtDec(pos.decD), '하늘의 세로 좌표(위도 같은 것). +90°가 북극성 방향입니다.') +
        stat('관측 난이도', '★'.repeat(o.diff) + '☆'.repeat(Math.max(0, 5 - o.diff))) +
        stat('필요 장비', eq ? eq.name : '—') +
        stat('최적 시기', o.months.length >= 12 ? '사철(행성)' : o.months.length ? o.months.map(function (m) { return m + '월'; }).join(' ') : '—')
      )) +
      '</div>' +
      '<div class="md-now">' + nowLine + '</div>' +
      (o.find ? '<div class="md-section md-find"><h3>찾는 방법 (별자리 길잡이)</h3><p>' + esc(o.find) + '</p></div>' : '') +
      '<div class="md-section"><h3>관측 포인트</h3><p>' + esc(o.detail) + '</p></div>' +
      (o.views ? '<div class="md-section"><h3>장비별로 실제 어떻게 보이나</h3>' + viewsTable(o) + '</div>' : '') +
      '<div class="md-section"><h3>과학적 배경</h3><p>' + esc(o.science) + '</p></div>' +
      (o.photo ? '<div class="md-section"><h3>촬영 팁</h3><p>' + esc(o.photo) + '</p></div>' : '') +
      (o.myth ? '<div class="md-section"><h3>이야기 · 신화</h3><p>' + esc(o.myth) + '</p></div>' : '') +
      '<div class="md-section"><h3>실전 팁</h3><p class="md-tip">' + esc(o.tips) + '</p></div>' +
      (o.bestNote ? '<div class="md-section"><h3>최적 시기 메모</h3><p>' + esc(o.bestNote) + '</p></div>' : '') +
      '<details class="explain md-principle"><summary>원리로 이해하기 — 이 천체는 왜 그렇게 보이나</summary>' +
      '<p>' + esc(o.science) + ' ' + esc(o.detail) + '</p>' +
      '<p class="small">겉보기 등급은 거리와 실제 광도가 함께 만든 결과입니다. 같은 밝기라도 거리가 2배면 5등급 어두워집니다(거리 지수). <a href="#lab" data-close="1">등급·거리 계산기</a>에서 직접 확인해 보세요.</p>' +
      '</details>';

    // 상단 사진 갤러리 — NASA·허블·제임스웹 + 실제 하늘 탐사 사진 5~6장
    if (window.SkyGallery || window.SkyPhoto) {
      const body = $('#modalBody');
      const fig = window.SkyGallery
        ? SkyGallery.create(o, { variant: 'modal' })
        : SkyPhoto.figure(o, { variant: 'modal' });
      const head = body.querySelector('.md-head');
      if (head && head.nextSibling) body.insertBefore(fig, head.nextSibling);
      else body.appendChild(fig);
    }

    const modal = $('#modal');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    state._lastFocus = document.activeElement;
    $('#modalClose').focus();
  }

  function viewsTable(o) {
    const rows = [
      ['맨눈', o.views.naked],
      ['쌍안경', o.views.bino],
      ['망원경', o.views.scope],
      ['촬영', o.views.photo]
    ].filter(function (r) { return r[1]; });
    return '<div class="views-table">' + rows.map(function (r) {
      return '<div class="views-row"><span>' + esc(r[0]) + '</span><p>' + esc(r[1]) + '</p></div>';
    }).join('') + '</div>';
  }
  function stat(label, value, tip) {
    const lab = tip
      ? '<span class="term" data-tip="' + esc(tip) + '">' + esc(label) + '</span>'
      : esc(label);
    return '<div class="md-stat"><span>' + lab + '</span><strong>' + esc(value) + '</strong></div>';
  }
  function closeModal() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
    if (state._lastFocus && state._lastFocus.focus) {
      try { state._lastFocus.focus(); } catch (e) { /* ignore */ }
    }
  }

  /* ------------------------------------------------------------ 계산기 */
  // 숫자 입력칸의 min/max 범위로 값을 다듬습니다 — 0·음수·빈칸을 직접 입력해도 계산이 깨지지 않게.
  function inputNum(el, fallback) {
    if (!el) return fallback;
    let v = Number(el.value);
    if (!isFinite(v) || v === 0) return fallback;
    const mn = el.min !== '' ? Number(el.min) : NaN;
    const mx = el.max !== '' ? Number(el.max) : NaN;
    if (isFinite(mn) && v < mn) v = mn;
    if (isFinite(mx) && v > mx) v = mx;
    return v;
  }

  function calcExposure() {
    const f = inputNum($('#exFocal'), 24);
    const N = inputNum($('#exAperture'), 2.8);
    const sensor = ($('#exSensor').value || '9.6,7.2').split(',').map(Number);
    if (!sensor[0] || !sensor[1]) { sensor[0] = 9.6; sensor[1] = 7.2; }
    const w = sensor[0], h = sensor[1];
    const mp = inputNum($('#exMp'), 12);
    const dec = clamp(Number($('#exDec').value) || 0, -90, 90);

    const hPix = Math.sqrt(mp * 1e6 * (w / h));   // 가로 화소 수
    const pitch = (w / hPix) * 1000;              // µm
    const diag = Math.sqrt(w * w + h * h);
    const crop = 43.27 / diag;
    const rule500 = 500 / (f * crop);
    const cosD = Math.max(0.08, Math.cos(dec * Math.PI / 180));
    const npf = (35 * N + 30 * pitch) / (f * cosD);
    const scale = 206265 * (pitch / 1000) / f; // ″/px
    const trailPx = (15 * cosD * rule500) / scale;

    $('#exNpf').textContent = nf(npf, 1) + '초';
    $('#exRule500').textContent = nf(rule500, 1) + '초';
    $('#exPitch').textContent = nf(pitch, 2) + ' µm';
    $('#exScale').textContent = nf(scale, 1) + '″';
    $('#exTrail').textContent = nf(trailPx, 1) + ' px';
    $('#exTrailBar').style.width = clamp(trailPx / 8 * 100, 2, 100) + '%';
    $('#exTrailBar').style.background = trailPx > 2 ? 'linear-gradient(90deg,#ffd479,#ff7a6e)' : 'linear-gradient(90deg,#7ee0c0,#ffd479)';

    const drift = 15 * cosD;                 // ″/초
    const pxPerSec = drift / scale;
    const npfPx = npf * pxPerSec;
    const safe = Math.min(npf, rule500);
    $('#exExplain').innerHTML =
      '<strong>왜 이 값인가</strong> — 초점거리 ' + nf(f, 0) + 'mm·픽셀 ' + nf(pitch, 2) + 'µm이면 한 픽셀이 하늘의 ' +
      nf(scale, 1) + '″를 덮습니다. 적위 ' + nf(dec, 0) + '°의 별은 지구 자전으로 초당 ' + nf(drift, 1) +
      '″(화소 기준 ' + nf(pxPerSec, 2) + 'px) 움직입니다. 그래서 NPF ' + nf(npf, 1) + '초면 약 ' + nf(npfPx, 1) +
      '픽셀 번지고, 500 법칙 ' + nf(rule500, 1) + '초면 약 ' + nf(trailPx, 1) + '픽셀 번집니다.' +
      '<br><strong>실패하는 조건</strong> — 삼각대가 바람에 흔들리거나, 셔터를 손으로 누르거나, 극축이 어긋나면 계산값보다 짧게 찍어도 줄이 생깁니다. 렌즈 주변부의 코마·비네팅도 별을 늘립니다. ' +
      '반대로 적위가 높은 대상(북두칠성·카시오페이아)은 같은 시간에 덜 움직여 더 길게 찍을 수 있습니다. ' +
      '<br><strong>추천</strong> — 점상 촬영은 ' + nf(safe, 1) + '초 이하, 별 궤적은 300초 이상으로 완전히 다르게 찍으세요.';
  }

  function calcOptics() {
    const Dm = inputNum($('#opAperture'), 130);
    const F = inputNum($('#opFocal'), 650);
    const eFL = inputNum($('#opEyepiece'), 25);
    const afov = inputNum($('#opAfov'), 50);

    const mag = F / eFL;
    const tfov = afov / mag;
    const exit = Dm / mag;
    const fr = F / Dm;
    const limit = 2.7 + 5 * Math.log10(Dm);
    const dawes = 116 / Dm;
    const light = Math.pow(Dm / 7, 2);
    const maxMag = Dm * 2;

    $('#opMag').textContent = nf(mag, 0) + '배';
    $('#opTfov').textContent = nf(tfov, 2) + '°';
    $('#opExit').textContent = nf(exit, 2) + ' mm';
    $('#opFratio').textContent = 'f/' + nf(fr, 1);
    $('#opLimit').textContent = '+' + nf(limit, 1) + '등';
    $('#opDawes').textContent = nf(dawes, 2) + '″';
    $('#opLight').textContent = nf(light, 0) + '배';
    $('#opMaxMag').textContent = nf(maxMag, 0) + '배';

    let verdict, note, cls = 'opVerdict';
    if (exit > 7) {
      verdict = '배율이 너무 낮습니다';
      note = '사출동공 ' + nf(exit, 1) + 'mm는 눈동자(약 7mm)보다 커서 빛이 낭비됩니다. 더 짧은 초점거리 접안렌즈를 쓰세요.';
    } else if (exit < 0.5) {
      verdict = '과배율입니다';
      note = '사출동공이 0.5mm 아래라 상이 흐리고 눈의 부유물이 보입니다. ' + nf(Dm, 0) + 'mm 구경의 실용 최대는 약 ' + nf(maxMag, 0) + '배입니다.';
    } else if (mag > maxMag) {
      verdict = '과배율 경고';
      note = '구경×2(' + nf(maxMag, 0) + '배)를 넘었습니다. 회절 때문에 오히려 흐려지고, 대기 시상이 나쁜 날엔 더 심합니다.';
    } else if (exit >= 4) {
      verdict = '저배율 · 넓은 시야';
      note = '은하수·성단·성운 찾기에 좋습니다. 사출동공 ' + nf(exit, 1) + 'mm로 밝고 편안합니다.';
    } else if (exit >= 1.5) {
      verdict = '적정 배율';
      note = '달·행성·구상성단에 균형이 좋습니다. 사출동공 ' + nf(exit, 1) + 'mm.';
    } else {
      verdict = '고배율 · 행성용';
      note = '이중성·행성 표면 관측용. 시상이 좋은 밤에만 효과가 있습니다.';
    }
    $('#opVerdict').textContent = verdict;
    $('#opVerdictNote').textContent = note;

    const moonRatio = clamp(0.5 / tfov * 100, 0, 100);
    $('#opMoonBar').style.width = moonRatio + '%';
    $('#opMoonNote').textContent = '달 지름 0.5°가 시야의 ' + nf(moonRatio, 0) + '%를 차지합니다.' +
      (moonRatio > 100 ? ' 달이 시야에 다 들어오지 않습니다.' : moonRatio > 60 ? ' 달을 가득 담기 좋습니다.' : ' 달이 작게 보입니다.');

    $('#opExplain').innerHTML =
      '<strong>왜 이 값인가</strong> — ' + nf(Dm, 0) + 'mm 구경·' + nf(F, 0) + 'mm 초점거리(f/' + nf(fr, 1) + ')에 ' +
      nf(eFL, 0) + 'mm 접안렌즈(겉보기 시야 ' + nf(afov, 0) + '°)를 끼우면 배율은 ' + nf(mag, 0) + '배, 실시야는 ' +
      nf(tfov, 2) + '°입니다. 사출동공은 구경÷배율이라 ' + nf(exit, 2) + 'mm — ' +
      (exit >= 5 ? '어두운 대상 찾기에 유리한 밝은 상' : exit >= 2 ? '밝기와 배율이 균형 잡힌 값' : '행성·이중성 같은 밝은 대상용') + '입니다.' +
      '<br><strong>한계</strong> — 이론 분해능 ' + nf(dawes, 2) + '″는 대기 시상(보통 2~3″)이 나쁘면 실현되지 않습니다. 한계등급 +' + nf(limit, 1) + '등도 하늘 밝기와 투명도에 따라 ±1~2등급 달라집니다. ' +
      '<br><strong>실패하는 조건</strong> — 사출동공이 7mm를 넘으면 빛이 눈동자 밖으로 새고, 0.7mm 아래면 먼지·부유물이 보입니다. 배율이 구경×2(' + nf(maxMag, 0) + '배)를 넘으면 회절로 상이 부드러워집니다.';
  }

  function calcMagnitude() {
    const mRaw = $('#mgApparent').value;
    const MRaw = $('#mgAbsolute').value;
    const dRaw = $('#mgDistance').value;
    const unit = $('#mgUnit').value;
    const m = mRaw === '' ? null : Number(mRaw);
    const M = MRaw === '' ? null : Number(MRaw);
    const dIn = dRaw === '' ? null : (Number(dRaw) > 0 ? Number(dRaw) : null);

    let toPc = 1;
    if (unit === 'ly') toPc = 1 / 3.26156;
    else if (unit === 'kly') toPc = 1000 / 3.26156;
    else if (unit === 'mly') toPc = 1e6 / 3.26156;
    else if (unit === 'au') toPc = 1 / 206264.8;
    const dPc = dIn == null ? null : dIn * toPc;

    let out = null;
    if (m != null && M != null && dPc == null) {
      const d = Math.pow(10, (m - M + 5) / 5);
      out = { m: m, M: M, pc: d };
    } else if (m != null && dPc != null && MRaw === '') {
      out = { m: m, M: m - 5 * Math.log10(Math.max(dPc, 1e-9)) + 5, pc: dPc };
    } else if (M != null && dPc != null && mRaw === '') {
      out = { m: M + 5 * Math.log10(Math.max(dPc, 1e-9)) - 5, M: M, pc: dPc };
    }

    if (!out) {
      $('#mgOutNote').textContent = '두 값을 입력하세요. (m·M, m·거리, M·거리 중 하나)';
      return;
    }
    const lumRatio = Math.pow(10, (4.83 - out.M) / 2.5);
    $('#mgOutM').textContent = (out.m > 0 ? '+' : '') + nf(out.m, 2);
    $('#mgOutAbs').textContent = (out.M > 0 ? '+' : '') + nf(out.M, 2);
    const lyOut = out.pc * 3.26156;
    $('#mgOutDist').textContent = lyOut >= 1e6 ? nf(lyOut / 1e6, 2) + '백만 광년'
      : lyOut >= 1000 ? nf(lyOut / 1000, 2) + '천 광년'
      : nf(lyOut, 2) + ' 광년';
    $('#mgOutLum').textContent = lumRatio >= 1000 ? nf(lumRatio, 0) + '배'
      : lumRatio >= 0.01 ? nf(lumRatio, 2) + '배' : nf(lumRatio, 4) + '배';
    $('#mgOutNote').textContent = out.M < -10
      ? '은하 규모의 밝기입니다. 태양(절대등급 +4.83)보다 ' + (lumRatio > 1e9 ? '10억 배 이상' : nf(lumRatio, 0) + '배') + ' 밝습니다.'
      : out.M < 0 ? '태양보다 밝은 거성·초거성입니다.' : '태양과 비슷하거나 어두운 별입니다.';

    $('#mgExplain').innerHTML =
      '<strong>계산에 쓴 식</strong> — m − M = 5 log₁₀(d) − 5 (d는 파섹). ' + nf(out.pc, 4) + 'pc = ' + nf(out.pc * 3.26156, 2) + '광년입니다. ' +
      '겉보기 등급 ' + nf(out.m, 2) + ', 절대 등급 ' + nf(out.M, 2) + '이면 거리 지수는 ' + nf(out.m - out.M, 2) + '등급입니다.' +
      '<br><strong>주의</strong> — 이 식은 성간 먼지에 의한 소광을 무시합니다. 은하수 평면 근처(예: M42)에서는 실제보다 가깝게 나올 수 있고, ' +
      '아주 먼 은하에서는 우주론적 효과(적색편이)를 별도로 보정해야 합니다. 또한 겉보기 등급은 파장대(눈·V필터·CCD)에 따라 다릅니다.';
  }

  /* ------------------------------------------------------- 체크리스트 */
  let checklistWired = false;
  function paintChecklistCount() {
    const saved = store.get('checklist', {});
    let total = 0, done = 0;
    D.checklist.forEach(function (group, gi) {
      group.items.forEach(function (item, ii) {
        total++;
        if (saved[gi + '-' + ii]) done++;
      });
    });
    $('#checkCount').textContent = done + ' / ' + total;
    $('#checkProgress').style.width = (total ? done / total * 100 : 0) + '%';
  }
  function renderChecklist() {
    const saved = store.get('checklist', {});
    let html = '';
    D.checklist.forEach(function (group, gi) {
      html += '<div class="check-group"><h4>' + esc(group.group) + '</h4>';
      group.items.forEach(function (item, ii) {
        const key = gi + '-' + ii;
        const checked = !!saved[key];
        html += '<label class="check-item' + (checked ? ' checked' : '') + '">' +
          '<input type="checkbox" data-key="' + key + '"' + (checked ? ' checked' : '') + '>' +
          '<span>' + esc(item) + '</span></label>';
      });
      html += '</div>';
    });
    $('#checklistList').innerHTML = html;
    paintChecklistCount();
    // 항목을 누를 때마다 목록을 다시 그리면 키보드 포커스가 사라지므로,
    // 한 번만 이벤트를 걸고 체크 표시·진행률만 그 자리에서 갱신합니다.
    if (!checklistWired) {
      checklistWired = true;
      $('#checklistList').addEventListener('change', function (ev) {
        const cb = ev.target;
        if (!cb || cb.type !== 'checkbox') return;
        const s = store.get('checklist', {});
        s[cb.getAttribute('data-key')] = cb.checked;
        store.set('checklist', s);
        const row = cb.closest('.check-item');
        if (row) row.classList.toggle('checked', cb.checked);
        paintChecklistCount();
      });
    }
  }

  /* ------------------------------------------------------------- 로그 */
  function renderLogs() {
    const logs = store.get('logs', []);
    const box = $('#logList');
    if (!logs.length) {
      box.innerHTML = '<p class="muted small">아직 기록이 없습니다. 첫 관측을 남겨 보세요.</p>';
      return;
    }
    box.innerHTML = '<p class="panel-note">기록 ' + logs.length + '건 · 최신순</p>' +
      logs.slice().reverse().map(function (l, idx) {
      const i = logs.length - 1 - idx;
      const res = l.result || '성공';
      const cls = res === '성공' ? 'badge-good' : res === '실패' ? 'badge-bad' : 'badge-mid';
      return '<div class="log-entry"><div class="log-entry-top"><span>' + esc(l.date) + ' · ' + esc(l.place || '—') + '</span>' +
        '<span><span class="badge ' + cls + '">' + esc(res) + '</span> ' +
        '<button class="edit" data-i="' + i + '" aria-label="이 기록 수정">✎</button> ' +
        '<button class="del" data-i="' + i + '" aria-label="이 기록 삭제">×</button></span></div>' +
        '<div class="small muted">' + esc(l.equip) + ' · ' + esc(l.target || '—') + ' · 시상 ' + l.seeing + '/5 · 투명도 ' + l.trans + '/5</div>' +
        (l.memo ? '<p>' + esc(l.memo) + '</p>' : '') + '</div>';
    }).join('');
    $$('#logList .edit').forEach(function (b) {
      b.addEventListener('click', function () { beginLogEdit(Number(b.getAttribute('data-i'))); });
    });
    $$('#logList .del').forEach(function (b) {
      b.addEventListener('click', function () {
        const i = Number(b.getAttribute('data-i'));
        const logs2 = store.get('logs', []);
        logs2.splice(i, 1);
        store.set('logs', logs2);
        if (logEditing === i) endLogEdit();
        else if (logEditing != null && logEditing > i) logEditing--;
        renderLogs();
        toast('기록을 삭제했습니다.');
      });
    });
  }

  /* 로그 수정 — 목록의 ✎를 누르면 그 기록을 폼에 채우고, 저장하면 새 줄을 만들지 않고 고칩니다. */
  let logEditing = null;
  const LOG_EQUIPS = ['맨눈', '쌍안경', '망원경', '스마트폰', '카메라'];
  function setLogFormMode(on) {
    const btn = $('#logSubmit'), cancel = $('#logCancelEdit'), form = $('#logForm');
    if (btn) btn.textContent = on ? '수정 저장' : '기록 저장';
    if (cancel) cancel.hidden = !on;
    if (form) form.classList.toggle('is-editing', on);
  }
  function beginLogEdit(i) {
    const logs = store.get('logs', []);
    const l = logs[i];
    if (!l) return;
    logEditing = i;
    $('#logDate').value = String(l.date || todayKST()).slice(0, 10);
    $('#logPlace').value = l.place || '';
    $('#logEquip').value = LOG_EQUIPS.indexOf(l.equip) >= 0 ? l.equip : '맨눈';
    $('#logTarget').value = l.target || '';
    $('#logSeeing').value = l.seeing || 3;
    $('#logTrans').value = l.trans || 3;
    $('#logResult').value = ['성공', '부분 성공', '실패'].indexOf(l.result) >= 0 ? l.result : '성공';
    $('#logMemo').value = l.memo || '';
    setLogFormMode(true);
    if ($('#logForm')) $('#logForm').scrollIntoView({ block: 'center' });
    toast('기록을 수정합니다. 고친 뒤 「수정 저장」을 누르세요.');
  }
  function endLogEdit() {
    logEditing = null;
    setLogFormMode(false);
    $('#logTarget').value = '';
    $('#logMemo').value = '';
    $('#logSeeing').value = 3;
    $('#logTrans').value = 3;
    $('#logResult').value = '성공';
  }

  /* ------------------------------------------------------- 캘린더 */
  function renderEvents() {
    const types = ['전체', '유성우', '월식', '일식', '행성', '달', '계절'];
    $('#eventFilters').innerHTML = types.map(function (t) {
      return '<button class="chip' + (state.eventType === t ? ' is-active' : '') + '" data-v="' + t + '">' + t + '</button>';
    }).join('');
    $$('#eventFilters .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        state.eventType = b.getAttribute('data-v');
        renderEvents();
      });
    });

    const todayNum = Number(todayKST().replace(/-/g, ''));
    const hidePast = $('#hidePast') ? $('#hidePast').checked : true;
    let list = D.events.filter(function (e) {
      if (state.eventType !== '전체' && e.type !== state.eventType) return false;
      if (hidePast && e.sort < todayNum) return false;
      return true;
    }).sort(function (a, b) { return a.sort - b.sort; });
    if (!list.length) list = D.events.filter(function (e) { return state.eventType === '전체' || e.type === state.eventType; })
      .sort(function (a, b) { return a.sort - b.sort; });
    const nextIdx = list.findIndex(function (e) { return e.sort >= todayNum; });
    const neBox = $('#nextEvent');
    if (neBox) {
      const nx = nextIdx >= 0 ? list[nextIdx] : null;
      if (nx) {
        const tp = todayKST().split('-').map(Number);
        const np = nx.date.split('-').map(Number);
        const dd = Math.max(0, Math.round((Date.UTC(np[0], np[1] - 1, np[2]) - Date.UTC(tp[0], tp[1] - 1, tp[2])) / 86400000));
        const when = dd === 0 ? '오늘' : dd === 1 ? '내일' : dd + '일 뒤';
        neBox.innerHTML = '<span class="ne-ico" aria-hidden="true">' + (nx.type === '유성우' ? '☄️' : nx.type === '월식' ? '🌙' : nx.type === '일식' ? '🌞' : '✨') + '</span>' +
          '<div class="ne-txt"><small>다음 천문 이벤트 · ' + when + '</small><b>' + esc(nx.title) + '</b>' +
          '<span>' + nx.date + ' (' + weekdayKR(nx.date) + ') · ' + esc(nx.moon) + '</span></div>' +
          '<button type="button" class="mini-btn" id="neJump">목록에서 보기</button>';
        const jb = $('#neJump');
        if (jb) jb.addEventListener('click', function () {
          const el = document.querySelectorAll('#eventList .event-item')[nextIdx];
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('is-flash');
            setTimeout(function () { el.classList.remove('is-flash'); }, 1600);
          }
        });
      } else {
        neBox.innerHTML = '<span class="ne-ico" aria-hidden="true">✨</span><div class="ne-txt"><small>다음 천문 이벤트</small><b>예정된 일정을 모두 지나 지난 일정을 보여 드리고 있습니다.</b><span>위의 ‘지난 일정 숨기기’를 끄면 전체 목록을 볼 수 있습니다.</span></div>';
      }
    }

    $('#eventList').innerHTML = list.map(function (e, i) {
      const p = e.date.split('-');
      return '<div class="event-item' + (e.sort < todayNum ? ' is-past' : '') + (i === nextIdx ? ' is-next' : '') + '">' +
        '<div class="event-date">' + p[0] + '.' + p[1] + '.' + p[2] + '<small>' + weekdayKR(e.date) + '요일</small></div>' +
        '<div class="event-body"><strong>' + esc(e.title) + '</strong><p>' + esc(e.body) + '</p></div>' +
        '<div class="event-meta"><span class="event-type t-' + esc(e.type) + '">' + esc(e.type) + '</span>' +
        '<span class="badge ' + (e.visible ? 'badge-good' : 'badge-bad') + '">' + (e.visible ? '한국 관측 가능' : '한국에서 안 보임') + '</span>' +
        '<span class="small">달 ' + esc(e.moon) + '</span></div>' +
        '</div>';
    }).join('');
  }

  /* -------------------------------------------------- 적위 한계 계산기 */
  function calcDeclination() {
    const el = $('#decResult');
    if (!el) return;
    const raw = $('#decCheck').value;
    if (raw === '') { el.innerHTML = '<p class="muted small">적위를 입력하면 최고 고도와 관측 가능 여부를 계산합니다.</p>'; return; }
    const dec = Number(raw);
    if (!isFinite(dec) || Math.abs(dec) > 90) { el.innerHTML = '<p class="muted small">적위는 -90°~+90° 사이로 입력하세요.</p>'; return; }
    const lat = state.site.lat;
    const maxAlt = 90 - Math.abs(lat - dec);
    const circumpolar = dec > 90 - lat;
    const never = dec < lat - 90;
    const horizonLimit = lat - 90;
    let verdict, cls;
    if (never) { verdict = '이 위치에서는 절대 보이지 않습니다'; cls = 'badge-bad'; }
    else if (maxAlt < 10) { verdict = '이론상 지평선 위지만 실제로는 거의 불가'; cls = 'badge-bad'; }
    else if (maxAlt < 25) { verdict = '낮은 하늘에서만 잠깐 보입니다'; cls = 'badge-mid'; }
    else if (circumpolar) { verdict = '주극성 · 지평선 아래로 지지 않습니다'; cls = 'badge-good'; }
    else { verdict = '충분히 높게 떠서 잘 보입니다'; cls = 'badge-good'; }
    el.innerHTML =
      '<div class="decl-big">최고 고도 <strong>' + (never ? '—' : nf(maxAlt, 1) + '°') + '</strong></div>' +
      '<span class="badge ' + cls + '">' + verdict + '</span>' +
      '<div class="decl-meta">' + esc(state.site.name) + ' (위도 ' + nf(lat, 2) + '°) · 보이지 않는 한계 적위 ' +
      nf(horizonLimit, 1) + '° · 주극성 한계 적위 ' + nf(90 - lat, 1) + '°</div>' +
      (never ? '<p class="small muted">프록시마·알파 센타우리·남십자자리는 한국에서 이렇게 사라집니다. 제주(33.3°N)에서도 프록시마(−62.7°)는 뜨지 않습니다.</p>' :
        '<p class="small muted">적위 ' + nf(dec, 1) + '°는 이 위도에서 시간당 약 ' + nf(15 * Math.cos(dec * Math.PI / 180), 1) + '°씩 움직입니다(별 궤적 노출 계산에 쓰입니다).</p>');
  }

  /* ------------------------------------------------------------- 명소 */
  // 광공해(Bortle) 등급 구간 — data.js의 34곳 분포(2:1 · 3:7 · 4:9 · 4.5:2 · 5:5 · 6:6 · 7:1 · 8:3)에 맞춘 구간입니다.
  const SITE_BORTLE = [
    { key: 'all', label: '전체', note: '', test: function () { return true; } },
    { key: 'b2-3', label: '2~3등급', note: '최상', test: function (b) { return b <= 3; } },
    { key: 'b4', label: '4~4.5등급', note: '어두움', test: function (b) { return b > 3 && b < 5; } },
    { key: 'b5', label: '5등급', note: '보통', test: function (b) { return b === 5; } },
    { key: 'b6+', label: '6등급+', note: '도심권', test: function (b) { return b > 5; } }
  ];
  function siteBortleRule(key) {
    return SITE_BORTLE.filter(function (g) { return g.key === key; })[0] || SITE_BORTLE[0];
  }

  function renderSites() {
    const regions = ['전체'].concat(Array.from(new Set(D.sites.map(function (s) { return s.region; }))));
    $('#siteRegions').innerHTML = regions.map(function (r) {
      return '<button class="chip' + (state.siteRegion === r ? ' is-active' : '') + '" data-v="' + r + '">' + r + '</button>';
    }).join('');
    $$('#siteRegions .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        state.siteRegion = b.getAttribute('data-v');
        renderSites();
      });
    });

    // 권역·예약 필터를 먼저 적용한 목록으로 등급별 건수를 셈니다.
    let pool = D.sites.filter(function (s) { return state.siteRegion === '전체' || s.region === state.siteRegion; });
    if ($('#onlyNoBooking') && $('#onlyNoBooking').checked) {
      pool = pool.filter(function (s) { return !s.booking || /불필요|없/.test(s.booking); });
    }

    const rule = siteBortleRule(state.siteBortle);
    const box = $('#siteBortles');
    if (box) {
      box.innerHTML = SITE_BORTLE.map(function (g) {
        const n = pool.filter(function (s) { return g.test(Number(s.bortle) || 9); }).length;
        return '<button class="chip bortle-chip' + (state.siteBortle === g.key ? ' is-active' : '') +
          (n ? '' : ' is-empty') + '" type="button" data-bortle="' + g.key + '" aria-pressed="' +
          (state.siteBortle === g.key) + '">' + g.label +
          (g.note ? ' <em>' + g.note + '</em>' : '') +
          ' <b class="chip-num">' + n + '</b></button>';
      }).join('');
      $$('#siteBortles .chip').forEach(function (b) {
        b.addEventListener('click', function () {
          state.siteBortle = b.getAttribute('data-bortle');
          renderSites();
        });
      });
    }

    let list = pool.filter(function (s) { return rule.test(Number(s.bortle) || 9); });
    if (state.siteSortNear) {
      list = list.slice().sort(function (a, b) { return distanceKm(a) - distanceKm(b); });
    }
    const cnt = $('#siteCount');
    if (cnt) {
      cnt.textContent = (rule.key === 'all' ? '전체 ' : 'Bortle ' + rule.label + ' · ') + list.length + '곳' +
        (state.siteRegion !== '전체' ? ' · ' + state.siteRegion : '');
    }
    $('#siteGrid').innerHTML = list.length ? list.map(function (s, i) {
      const dk = distanceKm(s);
      const facts = [['교통', esc(s.access)]];
      if (s.fromOsan) facts.push(['오산에서', '<span class="site-dist">' + esc(s.fromOsan) + '</span>']);
      if (s.hours) facts.push(['운영', esc(s.hours)]);
      if (s.booking) facts.push(['예약', /불필요|없/.test(s.booking) ? '<span class="site-book-no">' + esc(s.booking) + '</span>' : '<span class="site-book-yes">' + esc(s.booking) + '</span>']);
      if (s.fare) facts.push(['요금', esc(s.fare)]);
      facts.push(['시설', esc(s.facility)]);
      facts.push(['추천 시기', esc(s.season)]);
      return '<article class="site-card">' +
        '<div class="site-top"><div><h3>' + esc(s.name) + '</h3><div class="site-region-tag">' + esc(s.region) + '</div></div>' +
        '<span class="site-bortle">Bortle ' + nf(s.bortle, 1) + ' 추정</span></div>' +
        '<div class="site-stats">' + (s.elev ? '<span>해발 ' + s.elev + 'm</span>' : '') +
        '<span>' + nf(s.lat, 2) + '°N ' + nf(s.lon, 2) + '°E</span>' +
        (state.siteSortNear ? '<span class="site-dist">' + nf(dk, 0) + 'km</span>' : '') + '</div>' +
        '<div class="site-facts">' + facts.map(function (f) { return '<div><b>' + f[0] + '</b><span>' + f[1] + '</span></div>'; }).join('') + '</div>' +
        (s.warn ? '<div class="site-warn">' + esc(s.warn) + '</div>' : '') +
        '<div class="site-tip">' + esc(s.tip) + '</div>' +
        '<div class="site-tags">' + s.tags.map(function (t) { return '<span class="site-tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
        '</article>';
    }).join('') : '<p class="muted small">조건에 맞는 관측지가 없습니다. 필터를 바꿔 보세요.</p>';
  }

  function distanceKm(s) {
    const R = 6371;
    const dLat = (s.lat - state.site.lat) * Math.PI / 180;
    const dLon = (s.lon - state.site.lon) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(state.site.lat * Math.PI / 180) * Math.cos(s.lat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function renderBortle() {
    $('#bortleGrid').innerHTML = D.bortle.map(function (b) {
      return '<div class="bortle-item"><div class="bortle-item-top">' +
        '<span class="bortle-swatch" style="background:' + b.color + '"></span>' +
        '<strong>' + b.grade + '등급 · ' + esc(b.name) + '</strong>' +
        '<span class="b-meta">' + b.nelm + '등성</span></div>' +
        '<p>' + esc(b.desc) + '</p><span class="b-targets">볼 수 있는 것: ' + esc(b.targets) + '</span></div>';
    }).join('');
  }

  /* ------------------------------------------------------- 가이드·원리 */
  function renderGuide() {
    $('#equipLadder').innerHTML = D.equipmentTiers.map(function (t) {
      const icon = t.level === 1 ? 'eye' : t.level === 2 ? 'bino' : t.level === 3 ? 'scope' : 'cam';
      const svg = {
        eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/>',
        bino: '<circle cx="7.5" cy="14" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="16.5" cy="14" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 10l1-5h1l1 5M14 10l1-5h1l1 5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
        scope: '<path d="M3 16l14-9 3 5-14 9z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 17l-2 4M12 14l4 6" stroke="currentColor" stroke-width="1.5"/>',
        cam: '<rect x="3" y="7" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="13" r="3.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 7l1.5-2.5h5L16 7" fill="none" stroke="currentColor" stroke-width="1.6"/>'
      }[icon];
      return '<div class="ladder-item"><div class="ladder-top"><svg viewBox="0 0 24 24">' + svg + '</svg><strong>' + esc(t.name) + '</strong></div>' +
        '<p>' + esc(t.desc) + '</p><div class="ladder-targets">' + esc(t.targets) + '</div></div>';
    }).join('');

    renderGlossary();

    if ($('#failureTable')) {
      $('#failureTable').innerHTML = D.failures.map(function (f, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(f.cause) + '</td><td>' + esc(f.what) + '</td><td>' + esc(f.fix) + '</td></tr>';
      }).join('');
    }
    if ($('#twilightList')) {
      const bars = ['linear-gradient(90deg,#7c5c34,#4a3b28)', 'linear-gradient(90deg,#22315a,#182743)', 'linear-gradient(90deg,#0d1b3c,#0a1226)'];
      $('#twilightList').innerHTML = D.twilight.map(function (t, i) {
        return '<div class="tw-item"><strong>' + esc(t.name) + '</strong><span class="tw-sun">태양 고도 ' + esc(t.sun) + '</span>' +
          '<p>' + esc(t.note) + '</p><div class="tw-bar" style="background:' + (bars[i] || bars[2]) + '"></div></div>';
      }).join('');
    }

    $('#principlesList').innerHTML = D.principles.map(function (p, i) {
      return '<details class="principle"><summary>' + esc(p.title) + '</summary>' +
        '<div class="p-summary">' + esc(p.summary) + '</div>' +
        '<div class="p-body">' + p.body.map(function (b) { return '<p>' + esc(b) + '</p>'; }).join('') +
        '<code class="p-formula">' + esc(p.formula) + '</code></div></details>';
    }).join('');
  }


  /* ======================================================================
     ① 천체 인스펙터 — 클릭·탭한 천체의 실시간 고도·방위·출몰·해설
     ====================================================================== */
  const RAD = Math.PI / 180;

  function isRed() { return document.body.classList.contains('red'); }

  function fmtRA_(raH) { return fmtRA(raH); }

  function skyInfo(kind, key, jd) {
    const lat = state.site.lat, lon = state.site.lon;
    let raH = null, decD = null, mag = null, name = '', sub = '', note = '', objId = null, cells = null;
    let conAbbr = '', members = null, fovDeg = null;
    if (kind === 'planet') {
      const p = A.planetPos(key, jd);
      raH = p.raH; decD = p.decD; mag = p.mag; name = p.name;
      sub = '행성 · 시지름 ' + nf(p.diamArcsec, 1) + '″ · 위상 ' + nf(p.phaseD, 0) + '° · 거리 ' + nf(p.distAU, 2) + ' AU';
      const o = D.catalog.find(function (x) { return x.dynamic === key; });
      if (o) { note = o.brief; objId = o.id; }
    } else if (kind === 'moon') {
      const mp = A.moonPos(jd), ph = A.moonPhase(jd);
      raH = mp.raH; decD = mp.decD; name = '달';
      sub = '위상 ' + ph.name + ' · ' + nf(ph.illum * 100) + '% · 삭부터 ' + nf(ph.age, 1) + '일 · 거리 ' + Math.round(ph.distanceKm).toLocaleString('en-US') + 'km';
      note = '달은 하늘에서 가장 밝은 대상이라 암순응을 크게 방해합니다. 달이 뜬 밤에는 은하수·성운 대신 달 크레이터와 행성에 집중하세요.';
    } else if (kind === 'star') {
      const st = D.stars.find(function (x) { return x[0] === key; });
      if (!st) return null;
      raH = st[1]; decD = st[2]; mag = st[3]; name = st[0];
      sub = '항성 · 적경 ' + fmtRA(raH) + ' · 적위 ' + fmtDec(decD) + ' · 등급 ' + (mag > 0 ? '+' : '') + nf(mag, 2);
      note = '겉보기 등급은 지구에서 본 밝기입니다. 실제 광도는 거리에 따라 크게 달라집니다 — 등급·거리 계산기에서 확인해 보세요.';
    } else if (kind === 'dso') {
      const o = D.catalog.find(function (x) { return x.id === key; });
      if (!o) return null;
      if (o.dynamic) return skyInfo('planet', o.dynamic, jd);
      raH = o.raH; decD = o.decD; mag = o.mag; name = o.name;
      sub = o.type + ' · ' + o.sub + (o.con && o.con !== '—' ? ' · ' + o.con : '') + (o.dist && o.dist !== '—' ? ' · ' + o.dist : '');
      note = o.brief;
      objId = o.id;
    } else if (kind === 'con') {
      const con = D.constellations.find(function (x) { return x.abbr === key; });
      if (!con) return null;
      raH = con.raH; decD = con.decD; name = con.name;
      sub = '별자리 · ' + con.en + ' (' + con.abbr + ') · IAU 88별자리 · 면적 ' + con.areaRank + '위';
      note = con.desc + (con.bestMonth ? ' 가장 잘 보이는 때는 ' + con.bestMonth + '월(' + con.season + ')입니다.' : '');
      cells = [
        ['가장 밝은 별', con.bright ? con.bright + ' (' + (con.brightMag > 0 ? '+' : '') + nf(con.brightMag, 2) + '등)' : '—'],
        ['면적', con.area.toLocaleString('en-US') + ' deg² · ' + con.areaRank + '위'],
        ['잘 보이는 때', con.bestMonth + '월 · ' + con.season],
        ['연결선 별', con.lines.length + '구간']
      ];
      conAbbr = con.abbr; members = conMembers(con); fovDeg = conFov(con);
    } else if (kind === 'sun') {
      const sp = A.sunPos(jd);
      raH = sp.raH; decD = sp.decD; name = '태양'; mag = -26.7;
      sub = '항성 · 지름 139만 km(지구의 109배) · 지구까지 ' + nf(sp.distAU, 3) + ' AU · 시지름 약 32′';
      note = '태양을 맨눈으로 직접 보거나 망원경·쌍안경·카메라 뷰파인더로 들여다보면 즉시 눈이 상해 실명할 수 있습니다. 태양 관측은 태양 전용 필터(ISO 12312-2 안경, 망원경 앞쪽 태양 필터)를 갖춘 장비로만 하고, 필터를 접안부 쪽에 끼우는 방식은 열로 깨질 수 있어 쓰지 않습니다.';
    }
    if (raH == null) return null;
    const hor = A.equatorialToHorizontal(raH, decD, lat, lon, jd);
    const ni = A.objectNight(raH, decD, lat, lon, state.dateStr);
    return {
      kind: kind, key: key, name: name, sub: sub, note: note, objId: objId, cells: cells,
      mag: mag, raH: raH, decD: decD, alt: hor.alt, az: hor.az, ni: ni,
      conAbbr: conAbbr, members: members, fovDeg: fovDeg
    };
  }

  let inspectorRef = null, inspectorTs = 0;

  function showInspector(kind, key) {
    const box = $('#skyInspector');
    if (!box) return;
    const c = state.last || computeNight();
    const info = skyInfo(kind, key, c.jd);
    if (!info) return;
    inspectorRef = { kind: kind, key: key };
    inspectorTs = Date.now();
    const altTxt = info.alt > 0 ? nf(info.alt, 0) + '°' : '지평선 아래 (' + nf(info.alt, 0) + '°)';
    const cells = (info.cells || [
      ['지금 고도', altTxt],
      ['지금 방위', nf(info.az, 0) + '° ' + dirName(info.az)],
      ['겉보기 등급', info.mag == null ? '—' : (info.mag > 0 ? '+' : '') + nf(info.mag, 1)],
      ['출 / 남중 / 몰', A.fmtClock(info.ni.riseJd) + ' / ' + A.fmtClock(info.ni.maxJd) + ' / ' + A.fmtClock(info.ni.setJd)],
      ['오늘 밤 최고', info.ni.neverUp ? '지평선 위로 안 오름' : nf(info.ni.maxAlt, 0) + '° (' + A.fmtClock(info.ni.maxJd) + ')']
    ]).concat(kind === 'con' ? [['지금 하늘', altTxt + ' · ' + dirName(info.az) + ' ' + nf(info.az, 0) + '°']] : []);
    box.innerHTML =
      '<div class="si-head"><div><div class="si-name">' + esc(info.name) + '</div>' +
      '<div class="si-sub">' + esc(info.sub) + '</div></div>' +
      '<button class="si-close" type="button" data-si-close="1" aria-label="닫기">×</button></div>' +
      '<div class="si-grid">' + cells.map(function (x) {
        return '<div class="si-cell"><span>' + esc(x[0]) + '</span><strong>' + esc(x[1]) + '</strong></div>';
      }).join('') + '</div>' +
      (info.note ? '<p class="si-note">' + esc(info.note) + '</p>' : '') +
      '<div class="si-actions">' +
      '<button class="aim-btn" type="button" data-si-aim="1">🎯 라이브 뷰로 조준</button>' +
      (info.objId ? '<button class="mini-btn" type="button" data-si-obj="' + esc(info.objId) + '">도감 상세 보기</button>' : '') +
      (info.conAbbr ? '<button class="mini-btn" type="button" data-si-con="' + esc(info.conAbbr) + '">📷 사진 · 상세</button>' : '') +
      '<button class="mini-btn" type="button" data-si-close="1">닫기</button></div>';
  }

  function renderInspector() {
    if (!inspectorRef || Date.now() - inspectorTs < 350) return;
    showInspector(inspectorRef.kind, inspectorRef.key);
  }

  function aimObject(id) {
    const o = D.catalog.find(function (x) { return x.id === id; });
    if (!o) return;
    if (o.dynamic) aimAt('planet', o.dynamic);
    else aimAt('dso', id);
  }

  // 받침 유무로 조사를 고른다 (오리온자리 → 는, 오리온 → 은)
  function josa(word, withJong, withoutJong) {
    const ch = (word || '').charCodeAt((word || '').length - 1);
    if (ch < 0xac00 || ch > 0xd7a3) return withJong + '(' + withoutJong + ')';
    return (ch - 0xac00) % 28 === 0 ? withoutJong : withJong;
  }

  function aimAt(kind, key) {
    inertCancel();            // 조준이 시선의 주인이 되면 관성은 즉시 멈춥니다
    const c = state.last || computeNight();
    const info = skyInfo(kind, key, c.jd);
    if (!info) return;
    state.follow = { kind: kind, key: key };
    live.targetAz = info.az;
    live.targetAlt = clamp(info.alt, ALT_MIN, ALT_MAX);
    liveDirty = true;
    kickLive();
    aimSet({ kind: kind, key: key, name: info.name });   // ✕ 로 끝낼 때까지 유지되는 목표
    showInspector(kind, key);
    // 조준한 시선은 라이브 하늘 화면에서만 보입니다 — 다른 화면에서 눌렀으면 그 화면으로 넘어갑니다.
    if (window.__VIEWS_MODE__ && window.__views && window.__views.current() !== 'live') {
      jumpTo('live');
    } else {
      const sec = $('#live');
      if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (info.alt < -1) toast(info.name + josa(info.name, '은', '는') + ' 지금 지평선 아래(' + nf(info.alt, 0) + '°)입니다. 땅 너머 발밑 하늘에서 보여 드립니다.');
    else if (info.alt < 12) toast(info.name + josa(info.name, '은', '는') + ' 낮은 하늘 ' + dirName(info.az) + ' ' + nf(info.alt, 0) + '°에 있습니다.');
    else toast(info.name + ' 방향으로 시선을 맞췄습니다 — ' + dirName(info.az) + ' ' + nf(info.alt, 0) + '°.');
  }

  /* ======================================================================
     ② 라이브 하늘 뷰 (스텔라리움 모드) — Canvas 투영 + 센서
     ====================================================================== */
  const live = {
    az: 180, alt: 32, fov: 65, targetAz: 180, targetAlt: 32,
    labels: true, deep: true, sensor: false, gotEvent: false,
    grid: true, gridA: 0.55, gridLast: 0.55,   // 격자 표시 · 진하기(0~1) · 끄기 전 값
    w: 0, h: 0, dpr: 1, canvas: null, ctx: null,
    raf: null, hits: [], starHitPool: [], lastIv: 0, lastCenter: '', selected: null
  };
  let liveDirty = true;

  /* ----------------------------------------------------------------------
     센서 추적 엔진 — 스텔라리움식 융합
     · devicemotion 의 rotationRate(자이로)를 쿼터니언으로 적분 = 부드럽고 지연 없는 주축
     · deviceorientation 의 나침반(webkitCompassHeading)은 아주 느린 비율로만 당겨 주는 보정
       → 나침반이 90° 튀어도 화면은 프레임당 1.2° 이상 움직이지 못합니다
     · 나침반은 최근 5개 중앙값 + 이상치 차단(45° 점프는 4연속 일치 전까지 무시)
     · 0/360 경계는 항상 최단 경로(shortestDelta)로 계산
     ---------------------------------------------------------------------- */
  const Q = {
    mul: function (a, b) {
      return [
        a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
        a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
        a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
        a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
      ];
    },
    norm: function (q) {
      const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
      return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
    },
    conj: function (q) { return [q[0], -q[1], -q[2], -q[3]]; },
    rot: function (q, v) {
      const p = Q.mul(Q.mul(q, [0, v[0], v[1], v[2]]), Q.conj(q));
      return [p[1], p[2], p[3]];
    },
    axis: function (ax, deg) {
      const len = Math.hypot(ax[0], ax[1], ax[2]);
      const h = deg * RAD / 2;
      if (!len) return [1, 0, 0, 0];
      const s = Math.sin(h) / len;
      return [Math.cos(h), ax[0] * s, ax[1] * s, ax[2] * s];
    },
    mix: function (a, b, t) {
      if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0) b = [-b[0], -b[1], -b[2], -b[3]];
      return Q.norm([
        a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t
      ]);
    }
  };

  // W3C 규약: 기기→지구 좌표(X 동, Y 북, Z 위) R = Rz(alpha)·Rx(beta)·Ry(gamma)
  function qFromEuler(alpha, beta, gamma) {
    return Q.mul(Q.mul(Q.axis([0, 0, 1], alpha), Q.axis([1, 0, 0], beta)), Q.axis([0, 1, 0], gamma));
  }
  // 기기 후면 카메라(-Z)가 가리키는 하늘의 방위·고도
  function camDir(q) {
    const v = Q.rot(q, [0, 0, -1]);
    const alt = Math.asin(clamp(v[2], -1, 1)) / RAD;
    let az = Math.atan2(v[0], v[1]) / RAD;
    if (az < 0) az += 360;
    return { az: az, alt: alt };
  }

  /* 라이브 뷰가 다루는 고도 범위 — 발밑(지평선 아래 85°)부터 천정 89°까지.
     지평선 아래로 내려가 발밑 하늘을 볼 수 있게 한계를 -30° → -85°로 넓혔습니다.
     -88°까지 내리면 발밑에서 방위축이 흐려지는 짐벌락에 가까워지므로(방위가 튐)
     -85°에서 멈춥니다. 천정 쪽 89°도 같은 이유의 여유입니다. */
  const ALT_MIN = -85, ALT_MAX = 89;   // 짐벌락 여유를 남긴 지평선 아래 한계

  /* 천정·천저 근처 — 시선이 수직에 가까워지면 방위는 (고도 오차)/cos(고도) 만큼 증폭됩니다.
     고도 85°에서 cos 0.087 → 0.3° 손떨림이 방위 3.4°, 89°에서는 17°로 보입니다.
     그래서 68° 넘으면 방위를 나침반·오일러로 끌어당기는 힘을 부드럽게 0으로 줄이고,
     방위 손떨림 판정폭(azTol)도 같은 비율로 키워 자이로 자세만으로 매끄럽게 유지합니다. */
  const POLAR_SOFT = 68, POLAR_HARD = 84;
  function polarGain(altDeg) {
    const a = Math.abs(altDeg || 0);
    return clamp((POLAR_HARD - a) / (POLAR_HARD - POLAR_SOFT), 0, 1);
  }
  // 방위 손떨림 판정폭 — 고도가 높을수록 cos 비율로 넓어집니다(0.25° ÷ cos).
  function azTol(altDeg) {
    const c = Math.max(0.0174, Math.cos(clamp(Math.abs(altDeg), 0, 89.5) * RAD));
    return clamp(0.25 / c, 0.25, 14);
  }

  /* ── 스텔라리움식 관성 드래그 회전 ────────────────────────────────────────
     실시간 트래킹(센서)이 꺼져 있을 때, 손으로 하늘을 밀고 뗀 힘(속도)만큼
     조금 더 부드럽게 감속하며 돌아갑니다. 스텔라리움에서 하늘을 끌어 던진 느낌.

     · 속도는 드래그 중 최근 120ms 표본의 방위·고도 변화량으로 잽니다(도/ms).
       방위는 드래그가 이미 쓰는 degPerPx(live.fov ÷ 화면 높이)로 계산된 값이라
       시작 감도가 손가락과 정확히 같습니다.
     · 손을 뗀 뒤 110ms 넘게 멈춰 있었으면(단순 탭·대고 있다가 뗌) 관성이 생기지 않습니다.
     · 감쇠는 지수 — 시간상수 110ms 면 빠른 스와이프가 0.5~0.8초에 자연히 멈춥니다.
     · 고도는 ALT_MIN~ALT_MAX 를 지키고, 경계에 닿으면 고도 속도만 0으로 둡니다.
     · 트래킹 켜짐 · 핀치 · 방위 버튼·슬라이더 · 조준 · 화면 이동 · 새 터치에서 즉시 취소합니다. */
  const INERT = {
    tau: 120,      // 감쇠 시간상수(ms) — 클수록 오래 미끄러집니다
    stop: 0.004,   // 이 속도(도/ms = 4°/s) 아래로 줄면 멈춤
    vMax: 0.9,     // 시작 속도 상한(도/ms = 900°/s) — 손이 튀어도 화면이 감당할 만큼
    hold: 110,     // 이 시간(ms) 넘게 손가락이 멈춰 있었으면 관성 없음
    win: 120,      // 속도를 재는 최근 표본 구간(ms)
    minMove: 0.02, // 이보다 작은 속도는 '던진 것'으로 보지 않음
    maxT: 1600     // 안전 상한(ms) — 어떤 경우에도 이 시간 안에 끝납니다
  };
  const inertia = { on: false, raf: null, vAz: 0, vAlt: 0, t: 0, last: 0, moved: 0 };

  /* 천정에 가까울수록 방위 회전은 화면에서 '돌기'로 보입니다 — 관성의 방위 성분만
     68° 위에서 부드럽게 줄여(90°에서 40%) 과하게 튕기지 않게 합니다. */
  function inertAzGain(altDeg) {
    const a = Math.abs(altDeg || 0);
    if (a <= POLAR_SOFT) return 1;
    return clamp(1 - ((a - POLAR_SOFT) / (90 - POLAR_SOFT)) * 0.6, 0.4, 1);
  }

  function inertCancel() {
    const was = inertia.on;
    inertia.on = false;
    inertia.vAz = 0; inertia.vAlt = 0; inertia.t = 0; inertia.moved = 0;
    if (inertia.raf) { cancelAnimationFrame(inertia.raf); inertia.raf = null; }
    return was;
  }

  function inertStart(vAz, vAlt) {
    inertCancel();
    if (live.sensor) return false;              // 실시간 트래킹 중 — 폰이 시선의 주인
    let a = Number(vAz) || 0, b = Number(vAlt) || 0;
    if (!isFinite(a) || !isFinite(b)) return false;
    a *= inertAzGain(live.alt);
    const sp = Math.hypot(a, b);
    if (sp < INERT.minMove) return false;
    if (sp > INERT.vMax) { const k = INERT.vMax / sp; a *= k; b *= k; }
    inertia.on = true; inertia.vAz = a; inertia.vAlt = b;
    inertia.t = 0; inertia.moved = 0; inertia.last = performance.now();
    const step = function (ts) {
      inertia.raf = null;
      if (!inertia.on) return;
      if (live.sensor) { inertCancel(); return; }          // 트래킹이 켜지면 즉시 양보
      let dt = ts - inertia.last;
      inertia.last = ts;
      if (!(dt > 0)) dt = 16;
      if (dt > 64) dt = 64;                                // 탭 전환 등 큰 틈은 건너뜀
      inertia.t += dt;
      const prevAz = live.az, prevAlt = live.alt;
      const gz = inertAzGain(live.alt);
      let alt = live.alt + inertia.vAlt * dt;
      if (alt <= ALT_MIN) { alt = ALT_MIN; inertia.vAlt = 0; }
      else if (alt >= ALT_MAX) { alt = ALT_MAX; inertia.vAlt = 0; }
      const az = A.mod(live.az + inertia.vAz * gz * dt, 360);
      live.az = live.targetAz = az;
      live.alt = live.targetAlt = alt;
      state.follow = null;
      inertia.moved += Math.hypot(shortestDelta(prevAz, az), alt - prevAlt);
      const k = Math.exp(-dt / INERT.tau);
      inertia.vAz *= k; inertia.vAlt *= k;
      liveDirty = true;
      kickLive();                                          // 하늘·유도등이 같은 프레임에 그려집니다
      if (Math.hypot(inertia.vAz, inertia.vAlt) < INERT.stop || inertia.t > INERT.maxT) { inertCancel(); return; }
      inertia.raf = requestAnimationFrame(step);
    };
    inertia.raf = requestAnimationFrame(step);
    return true;
  }

  /* 드래그 표본에서 손을 떼는 순간의 속도(도/ms).
     마지막 표본이 110ms 넘게 낡았으면 = 손가락을 멈춘 채 뗀 것 → stale(관성 없음). */
  function dragVel(d) {
    const s = (d && d.samples) || [];
    if (s.length < 1) return { az: 0, alt: 0, stale: true };
    const now = performance.now();
    const last = s[s.length - 1];
    if (now - last.t > INERT.hold) return { az: 0, alt: 0, stale: true };
    if (s.length < 2) return { az: 0, alt: 0, stale: false };
    let i = s.length - 1;
    while (i > 0 && last.t - s[i - 1].t <= INERT.win) i--;
    const first = s[i];
    const dt = last.t - first.t;
    if (dt < 4) return { az: 0, alt: 0, stale: false };
    return { az: shortestDelta(first.az, last.az) / dt, alt: (last.alt - first.alt) / dt, stale: false };
  }

  /* 시선(q)의 고도를 원하는 값으로 정확히 돌려놓습니다 — 방위는 그대로 두고 고도만 바꿉니다.
     · 목표 방향(dir_target)을 계산하고, 지금 시선과 목표 사이의 최소 회전축(dir × target)과
       각도를 써서 월드 좌표계에서 회전합니다(부호를 따로 다룰 필요가 없음).
     · 예전에는 up × 시선 축으로 돌렸는데, 발밑(−85° 아래)처럼 시선이 극점에 가까우면
       그 축이 거의 0이 되어 기기 x축(끄덕임 축)으로 대체했고, 그 대체 축은 시선과 수직이
       아니어서 고도가 제대로 바뀌지 않았습니다(−89° 자세를 −85°로 붙이지 못하던 원인).
       목표 방향에서 축을 만들면 극점에서도 축이 또렷합니다. */
  function setCamAlt(q, altDeg) {
    const d = camDir(q);
    const diff = altDeg - d.alt;
    if (Math.abs(diff) < 1e-4) return q;
    const dir = Q.rot(q, [0, 0, -1]);
    const al = altDeg * RAD, az = d.az * RAD;
    const target = [Math.cos(al) * Math.sin(az), Math.cos(al) * Math.cos(az), Math.sin(al)];
    let ax = [
      dir[1] * target[2] - dir[2] * target[1],
      dir[2] * target[0] - dir[0] * target[2],
      dir[0] * target[1] - dir[1] * target[0]
    ];
    const n = Math.hypot(ax[0], ax[1], ax[2]);
    if (n < 1e-9) {
      // 두 방향이 같거나 정반대 — 같으면 위에서 돌아갔고, 정반대(천저↔천정)면 아무 수평축이나 씁니다.
      ax = [0, 1, 0];
      return Q.norm(Q.mul(Q.axis(ax, 180), q));
    }
    const ang = Math.acos(clamp((dir[0] * target[0] + dir[1] * target[1] + dir[2] * target[2]), -1, 1)) / RAD;
    return Q.norm(Q.mul(Q.axis([ax[0] / n, ax[1] / n, ax[2] / n], ang), q));
  }
  /* 화면 기준틀 — 시선(방위·고도)에서 오른쪽·위 벡터를 만듭니다.
     · 오른쪽 벡터는 언제나 '방위가 정하는 수평 방향'=(cosA, −sinA, 0) 입니다.
       (fwd × [0,0,1] 을 정규화한 값과 같고, 고도가 ±90°에 가도 방향이 흔들리지 않습니다.)
     · 예전에는 고도가 87.4°(|fwd.z| > 0.999)를 넘는 순간 기준 벡터를 [0,0,1] → [0,1,0]
       으로 바꿔 오른쪽 벡터를 다시 만들었습니다. 그 전환 자체가 방위축 둘레로 90° 가까운
       회전이라, 천정을 보려고 고도를 올리면 하늘 전체가 홱 돌아 보였습니다
       (남현님 제보 '최고 각도 높이로 올라가면 각도가 자꾸 급변'). 그래서 전환을 없앴습니다. */
  function camBasis(azDeg, altDeg) {
    const a = clamp(altDeg, -90, 90) * RAD, z = azDeg * RAD;
    const fwd = [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
    const right = [Math.cos(z), -Math.sin(z), 0];
    const up = [
      right[1] * fwd[2] - right[2] * fwd[1],
      right[2] * fwd[0] - right[0] * fwd[2],
      right[0] * fwd[1] - right[1] * fwd[0]
    ];
    return { fwd: fwd, right: right, up: up };
  }

  // 시야(화각) 범위 — 두 손가락 핀치와 ＋/－ 버튼이 함께 지키는 한계
  const LIVE_FOV_MIN = 15, LIVE_FOV_MAX = 115;

  // deviceorientation 의 beta·gamma 만으로 카메라(-Z)의 고도를 계산합니다.
  //   카메라의 지구 z성분 = −cosβ·cosγ  →  고도 = asin(−cosβ·cosγ)
  //   beta가 ±180에서 뒤집혀도 값이 끊기지 않습니다.
  //   (예전의 'beta−90, −90보다 작으면 +360' 산술은 beta가 음수인 구간에서
  //    −60° 자리를 240°로 만들어 보정이 통째로 막혔습니다.)
  function altFromTilt(beta, gamma) {
    const cb = Math.cos(beta * RAD), cg = Math.cos((gamma == null ? 0 : gamma) * RAD);
    return Math.asin(clamp(-cb * cg, -1, 1)) / RAD;
  }
  /* 시선의 방위를 heading 으로 맞춥니다(지구 Z축 둘레 회전).
     주의 — 이 좌표계(X 동·Y 북·Z 위)에서 +Z 회전은 방위를 '줄입니다'
     (북(0,1,0)을 +10° 돌리면 동쪽으로 10° = 방위 −10°). 그래서 회전량은 (현재 − 목표)입니다.
     예전에는 (목표 − 현재)를 썼는데, 그러면 방위가 목표에서 같은 만큼 '반대쪽'으로 밀려
     (100°에서 130°로 맞추려는데 70°가 되는 식) 초기 정렬이 거울처럼 뒤집혔습니다. */
  function qAlignNorth(q, heading) {
    const d = camDir(q);
    return Q.norm(Q.mul(Q.axis([0, 0, 1], d.az - heading), q));
  }
  function circMedian(list, ref) {
    if (!list.length) return ref;
    const vals = list.map(function (v) { return ref + shortestDelta(ref, v); }).sort(function (a, b) { return a - b; });
    return A.mod(vals[Math.floor(vals.length / 2)], 360);
  }

  const track = {
    q: null, ready: false,
    rot: [0, 0, 0],                 // 아직 반영하지 않은 자이로 회전(도)
    motionSeen: false, lastMotEv: 0, lastOriEv: 0, lastApply: 0,
    comp: null, compBuf: [], spike: 0, acc: null, compT: 0,
    lastBeta: null,
    angVel: 0,                     // 지수평활한 최근 각속도 크기(°/초) — '움직이는 중' 판정
    movingUntil: 0,                // 이 시각까지는 움직이는 중 — 드리프트 보정 이득 0
    gate: 0,                       // 보정 이득 게이트(0 = 멈춤 ↔ 1 = 정지·수렴 중)
    resync: false,                 // 자이로 표본이 크게 끊긴 뒤 한 번 다시 맞출 표시
    calAz: 0,                      // '방향 맞추기'로 잡은 나침반 오차
    altTarget: null,               // 경계에 맞춰 자른 고도 목표(보정용)
    rawAlt: null,                  // beta·gamma 로 계산한 '실제' 기기 고도(자르기 전)
    eulerQ: null, eulerT: 0,      // 마지막 오일러 자세 — 경계에서 돌아올 때 롤·고도를 다시 맞춤
    pinned: false,                 // 기기가 고도 경계 밖이라 자세를 경계에 붙들어 둔 상태
    realign: false, realignUntil: 0,  // 창 복귀·센서 재개 — 다음 표본에서 실제 기기 자세로 한 번에 맞춤
    realignT: 0,                   // 그 정렬 직후 이 시각까지는 오일러 자세를 그대로 따라감
    compReset: false,              // 다음 나침반을 이상치 차단 없이 새 기준으로 받을 표시
    az: 180, alt: 30,
    sens: 1,                       // 0.6 민감 / 1 보통 / 1.6 부드럽게
    clock: null, feedT: null,      // 검증 훅(feed)의 가상 시계 — 실기기에서는 null
    suspendUntil: 0,
    raf: null, lastTs: 0, drawAt: 0
  };

  function trackReset() {
    track.q = null; track.ready = false; track.rot = [0, 0, 0];
    track.comp = null; track.compBuf = []; track.spike = 0; track.compT = 0;
    track.acc = null; track.altTarget = null; track.rawAlt = null; track.calAz = 0;
    track.eulerQ = null; track.eulerT = 0; track.pinned = false;
    track.realign = false; track.realignUntil = 0; track.realignT = 0; track.compReset = false;
    track.lastBeta = null;
    track.angVel = 0; track.movingUntil = 0; track.gate = 0; track.resync = false;
    track.clock = null; track.feedT = null;
    track.az = live.az; track.alt = live.alt;
    track.motionSeen = false; track.lastMotEv = 0; track.lastTs = 0; track.suspendUntil = 0;
  }

  /* 창을 내렸다 돌아오거나(백그라운드 → 복귀) 센서 표본이 오래 끊겼을 때 —
     자이로 적분을 이전 각도에서 이어 붙이면, 그사이 폰을 돌려 둔 만큼 화면이 어긋난 채로 남습니다.
     (자이로는 화면을 보고 있는 동안만 표본이 오므로, 백그라운드에서 돈 회전은 통째로 사라집니다.)
     여기서는 '복귀했다'는 표시만 해 두고, 실제 정렬은 복귀 직후 들어오는 
     오일러 표본(alpha·beta·gamma)·나침반으로 onOrientation 이 한 번에 합니다.
     미리 움직임 게이트·낡은 자이로 델타를 비워 두어 정렬이 게이트에 막히지 않게 합니다. */
  function trackRealign(reason) {
    if (!live.sensor) return;
    track.realign = true;
    track.realignUntil = sNow() + 2000;   // 2초 안에 자세 표본이 없으면 표시를 버립니다
    track.realignT = 0;
    track.compReset = true;               // 나침반도 새 기준으로 — 90°/180° 회전이 '튐'으로 버려지지 않게
    track.resync = false;                 // 조건부 재조정은 아래 한 번의 정렬이 대신합니다
    track.rot = [0, 0, 0];                // 복귀 전에 쌓인 낡은 자이로 델타 버리기
    track.angVel = 0;
    track.movingUntil = 0;                // 움직임 게이트가 재정렬을 붙잡지 않게
    track.gate = 0;
    track.suspendUntil = 0;
    track.lastTs = 0;
    track.lastBeta = null;                // ±180° 뒤집힘 판정 기준도 새로
    liveDirty = true;
  }

  /* 센서 표본이 이만큼 끊겼는지 — 창 복귀·focus 에서 재정렬이 필요한지 판단합니다. */
  function sensorStale(ms) {
    return !track.ready || !track.lastOriEv || (sNow() - track.lastOriEv) > (ms || 500);
  }

  /* 드리프트 보정 — '폰이 멈춰 있을 때만' 아주 완만하게 잡습니다.
     나침반(방위)과 중력(고도)은 자이로보다 늦게·흔들려 도착합니다. 폰을 돌리는 중에
     보정을 걸면 자이로가 그린 궤적을 되돌려 화면이 출렁이므로, 움직이는 동안은
     이득을 0으로 끕니다. 멈춘 뒤 0.35초가 지나면 아주 느린 드리프트 보정만 다시 켭니다.
       오차 ≤20° : 게이트·τ초에 걸쳐 따라잡기(프레임당 최대 0.25°, 자이로가 주축)
       20~35°    : 이득이 20→35°에서 1→0으로 줄어듦(나침반 튐·중력 값의 순간 오류 차단)
       35° 초과  : 자동으로 당기지 않음 — 큰 방향 오차는 🎯 방향 맞추기로 맞춥니다
     예전에는 45°를 넘는 오차를 1.2초 뒤 0.55°씩 '툭' 당겨(redo) 재조정이 눈에 띄었습니다. */
  const COR = {
    tau: 7.0,        // 정지 중 드리프트 시간상수(초) — 길수록 티가 덜 남
    free: 20,        // 이 안쪽 오차만 자동 보정
    fade: 35,        // 20→35°에서 이득 1→0
    stepMax: 0.25,   // 프레임당 최대 보정(도)
    moveOn: 7,       // °/초 — 이보다 빠르게 돌면 '움직이는 중'
    settle: 0.35,    // 멈춘 뒤 안정화 시간(초)
    easeIn: 0.45,    // 정지 후 보정 이득이 1까지 차오르는 시간(초)
    easeOut: 0.04    // 움직임이 시작되면 보정을 즉시(≈3프레임) 끔
  };

  /* 센서 경로의 시계 — 검증 훅(feed)이 가상 시계를 넣으면 그쪽을 씁니다. */
  function sNow() { return track.clock != null ? track.clock : performance.now(); }

  /* 각속도(°/초)로 '지금 폰이 돌고 있는지'를 판정합니다.
     7°/s 를 넘으면 움직이는 중으로 보고, 마지막 움직임에서 0.35초까지는 그대로 둡니다. */
  function noteMotion(rate, now) {
    const v = (typeof rate === 'number' && isFinite(rate)) ? Math.abs(rate) : 0;
    track.angVel += (v - track.angVel) * 0.35;
    if (track.angVel > COR.moveOn) track.movingUntil = now + COR.settle * 1000;
  }

  /* 보정 이득 게이트 — 움직이는 동안 0, 멈춘 뒤 easeIn 에 걸쳐 1로 차오릅니다. */
  function driftGate(dt) {
    const want = sNow() < track.movingUntil ? 0 : 1;
    const k = clamp(dt / (want ? COR.easeIn : COR.easeOut), 0, 1);
    track.gate += (want - track.gate) * k;
    if (track.gate < 0.003) track.gate = 0;
    return track.gate;
  }

  /* 한 걸음 보정량 — 게이트가 0이면 아무것도 하지 않습니다. */
  function corStep(err, dt) {
    const a = Math.abs(err);
    if (a < 1e-3 || a >= COR.fade) return 0;
    const g = (a <= COR.free ? 1 : (COR.fade - a) / (COR.fade - COR.free)) * track.gate;
    if (g <= 0.003) return 0;
    const frac = clamp(dt / (COR.tau * track.sens), 0, 0.05);
    return clamp(err * frac * g, -COR.stepMax, COR.stepMax);
  }

  // 프레임마다: 자이로 적분 → 나침반(방위)·중력(고도) 같은 비율의 느린 보정
  function trackCorrect(dt) {
    if (!track.q) return;
    if (track.rot[0] || track.rot[1] || track.rot[2]) {
      const r = track.rot;
      const ang = Math.hypot(r[0], r[1], r[2]);
      if (ang > 1e-6 && ang < 120) track.q = Q.norm(Q.mul(track.q, Q.axis(r, ang)));
      track.rot = [0, 0, 0];
    }
    const now = sNow();
    const d = camDir(track.q);
    driftGate(dt);        // 움직이는 동안 0 — 이 값이 아래 두 보정의 이득을 통째로 곱합니다

    // 1) 나침반 → 방위. 움직이는 동안(track.gate 0)은 손대지 않습니다.
    //    (자이로가 주축이므로 나침반은 멈춰 있을 때 분당 몇 도의 드리프트만 잡으면 됩니다)
    if (track.comp != null && now - track.compT < 1600 && track.gate > 0) {
      const bad = track.acc != null && (track.acc < 0 || track.acc > 25);
      if (!bad) {
        const err = shortestDelta(d.az, track.comp + track.calAz);
        const q = (track.acc != null && track.acc >= 0) ? clamp(1 - track.acc / 45, 0.35, 1) : 1;
        // 천정·천저 근처에서는 방위 기준이 흐려지므로 보정을 부드럽게 꺼 자이로 자세만 씁니다.
        const step = corStep(err, dt) * q * polarGain(d.alt);
        if (Math.abs(step) > 0.002) track.q = Q.norm(Q.mul(Q.axis([0, 0, 1], -step), track.q));
      }
    }

    // 2) 중력(beta) → 고도. 방위와 같은 시간 상수·게이트로 따라갑니다.
    if (track.altTarget != null) {
      const err = track.altTarget - camDir(track.q).alt;
      const step = corStep(err, dt);
      if (Math.abs(step) > 0.002) {
        // 고도를 바꾸는 회전축 = up × 시선 (지평선과 나란한 축).
        //   예전엔 [z,0,−x] 를 썼는데, 북쪽을 보면 축이 0이 되어 보정이 아예 죽고
        //   동쪽을 보면 수직축이 되어 방위를 돌려 버렸습니다.
        //   시선이 천정에 가까우면 그 축이 흐려지므로 기기 x축(끄덕임 축)으로 대체합니다.
        const dir = Q.rot(track.q, [0, 0, -1]);
        let ax = [-dir[1], dir[0], 0];
        let n = Math.hypot(ax[0], ax[1], ax[2]);
        if (n < 0.08) { ax = Q.rot(track.q, [1, 0, 0]); n = Math.hypot(ax[0], ax[1], ax[2]); }
        if (n > 1e-4) track.q = Q.norm(Q.mul(Q.axis([ax[0] / n, ax[1] / n, ax[2] / n], -step), track.q));
      }
    }

    /* 3) 고도 경계 고정 — 이게 '지평선 아래로 내렸다 올리면 각도가 틀어지는' 문제의 핵심입니다.
       화면 표시(track.alt)만 ALT_MIN 에 묶어 두고 자세(q)는 그 아래로 계속 내려가게 두면,
       다시 올릴 때 q 가 한참 아래에서부터 올라와야 해서 표시가 ALT_MIN 에 붙은 채로 멈춰 있고,
       경계를 되돌아올 때 보정과 자이로가 서로 당겨 각도가 틀어집니다.
       (예: 폰을 −80°까지 내렸다 올리면 표시는 −30°에서 멈춰 있다가 한참 뒤에야 따라옵니다)
       그래서 기기가 범위 밖을 보고 있는 동안에는 q 의 고도를 경계에 '고정'합니다.
       고정한 채로는 기기가 더 내려가도(올라가도) 자이로 회전이 q 에 쌓이지 않으므로,
       다시 경계를 지나 올라오는 순간부터 정확히 1:1 로 따라옵니다. */
    if (track.rawAlt != null) {
      const overLow = track.rawAlt < ALT_MIN - 0.05;                   // 기기는 경계보다 아래
      const overHigh = track.rawAlt > ALT_MAX + 0.05;                  // 기기는 천정 너머
      if (overLow || overHigh) {
        /* 기기가 범위 밖을 보고 있는 동안에는 고도를 경계에 붙입니다.
           이때 자세(q)는 마지막 오일러 자세에서 가져옵니다 — 자이로만으로 붙들면
           극점(−85°) 근처에서 롤이 뒤집혀, 다시 올라올 때 끄덕임 축이 반대로 작용해
           표시가 경계에 멈춰 버립니다. 방위는 지금 보는 값(자이로 적분)을 지킵니다. */
        const pin = overLow ? ALT_MIN : ALT_MAX;
        if (track.eulerQ && sNow() - track.eulerT < 400) {
          track.q = setCamAlt(qAlignNorth(track.eulerQ, camDir(track.q).az), pin);
        } else {
          track.q = setCamAlt(track.q, pin);
        }
        track.pinned = true;
      } else {
        if (track.pinned) {
          /* 기기가 경계 안으로 돌아옴 — 그 순간 한 번만 실제 기기 자세로 고도·롤을 맞춥니다.
             (방위는 지금 보는 값을 지켜 화면이 튀지 않게) */
          track.pinned = false;
          if (track.eulerQ && sNow() - track.eulerT < 400) {
            track.q = qAlignNorth(track.eulerQ, camDir(track.q).az);
          }
        }
        const cur = camDir(track.q).alt;   // 관성으로 넘어간 값만 되돌림(0.05° 여유)
        if (cur < ALT_MIN - 0.05) track.q = setCamAlt(track.q, ALT_MIN);
        else if (cur > ALT_MAX + 0.05) track.q = setCamAlt(track.q, ALT_MAX);
      }
    }
  }

  // 결과를 화면 값으로 — 손떨림 데드존 + 저역통과 + 최대 각속도 (좌우·상하 같은 값)
  function trackApply(dt) {
    if (!track.q) return false;
    const now = sNow();
    const gyroLive = track.motionSeen && (now - track.lastMotEv < 1200);
    const d = camDir(track.q);
    let dAz = shortestDelta(track.az, d.az);
    let dAlt = d.alt - track.alt;
    // 천정·천저 근처 — 방위는 고도 손떨림을 1/cos 만큼 증폭해 보여 줍니다.
    //   판정폭을 같은 비율로 넓히지 않으면, 폰을 안 돌렸는데 화면 방위만 흔들립니다.
    const dzA = azTol(d.alt);
    if (Math.abs(dAz) < dzA) dAz = 0;      // 데드존(손떨림)
    if (Math.abs(dAlt) < 0.25) dAlt = 0;
    // 자이로가 살아 있으면 τ 30ms(한 프레임 지체)로 거의 즉시, 끊겼을 때만 부드럽게
    const k = clamp(dt / (gyroLive ? 0.03 : 0.075), 0.22, 0.85);
    const cap = (gyroLive ? 300 : 140) * dt;
    const sAz = clamp(dAz * k, -cap, cap);
    const sAlt = clamp(dAlt * k, -cap, cap);
    if (!sAz && !sAlt) return false;
    track.az = A.mod(track.az + sAz, 360);
    track.alt = clamp(track.alt + sAlt, ALT_MIN, ALT_MAX);
    live.az = track.az;
    live.alt = track.alt;
    return true;
  }

  function trackLoop(ts) {
    track.raf = null;
    if (!live.sensor) return;
    const now = ts || performance.now();
    const dt = track.lastTs ? clamp((now - track.lastTs) / 1000, 0.004, 0.1) : 0.016;
    track.lastTs = now;
    let moved = false;
    if (now >= track.suspendUntil) {
      trackCorrect(dt);
      moved = trackApply(dt);
    }
    if (moved || liveDirty || now - track.drawAt > 400) {
      liveDraw();
      syncLiveInputs();
      liveDirty = false;
      track.drawAt = now;
    }
    track.raf = requestAnimationFrame(trackLoop);
  }

  function trackStart() {
    if (!track.raf) {
      track.lastTs = 0;
      track.raf = requestAnimationFrame(trackLoop);
    }
  }
  function trackStop() {
    if (track.raf) { cancelAnimationFrame(track.raf); track.raf = null; }
    track.rot = [0, 0, 0];
  }

  function shortestDelta(from, to) { return A.mod(to - from + 180, 360) - 180; }

  function liveResize() {
    const cv = $('#liveCanvas'), stage = $('#liveStage');
    if (!cv || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    live.canvas = cv;
    live.w = Math.round(rect.width);
    live.h = Math.round(rect.height);
    cv.width = Math.round(live.w * dpr);
    cv.height = Math.round(live.h * dpr);
    live.ctx = cv.getContext('2d');
    live.dpr = dpr;
    liveDirty = true;
    aimFit();          // 조준 유도 캔버스·안전 영역도 같은 크기로
    kickLive();
  }

  function kickLive() {
    if (live.sensor) { trackStart(); return; }
    if (live.raf) return;
    live.raf = requestAnimationFrame(liveTick);
  }

  function liveTick() {
    live.raf = null;
    let animating = false;
    const dAz = shortestDelta(live.az, live.targetAz);
    const dAlt = live.targetAlt - live.alt;
    if (Math.abs(dAz) > 0.12 || Math.abs(dAlt) > 0.12) {
      const k = 0.2;
      live.az = A.mod(live.az + dAz * k, 360);
      live.alt = clamp(live.alt + dAlt * k, ALT_MIN, ALT_MAX);
      animating = true;
      liveDirty = true;
    }
    if (liveDirty) {
      liveDraw();
      syncLiveInputs();
      liveDirty = false;
    }
    if (animating) kickLive();
  }

  function syncLiveInputs() {
    const azEl = $('#liveAz'), altEl = $('#liveAlt'), fovEl = $('#liveFov');
    const azR = Math.round(A.mod(live.az, 360));
    if (azEl && document.activeElement !== azEl) azEl.value = String(azR);
    if (altEl && document.activeElement !== altEl) altEl.value = String(Math.round(live.alt));
    if (fovEl && document.activeElement !== fovEl) fovEl.value = String(Math.round(live.fov));
    const set = function (sel, txt) { const e = $(sel); if (e) e.textContent = txt; };
    set('#liveAzVal', azR + '°');
    set('#liveAltVal', Math.round(live.alt) + '°');
    set('#liveFovVal', Math.round(live.fov) + '°');
    set('#liveFovVal2', Math.round(live.fov) + '°');
    set('#liveAzChip', '방위 ' + azR + '° ' + dirName(azR));
    set('#liveAltChip', '고도 ' + Math.round(live.alt) + '°');
  }

  function mixHex(a, b, t) {
    const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    const r = pa.map(function (v, i) { return Math.round(v + (pb[i] - v) * clamp(t, 0, 1)); });
    return 'rgb(' + r.join(',') + ')';
  }

  /* mixHex 와 같지만 알파를 붙입니다 — 낮 하늘 아래 땅을 반투명하게 깔 때 사용. */
  function mixRGBA(a, b, t, alpha) {
    const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    const r = pa.map(function (v, i) { return Math.round(v + (pb[i] - v) * clamp(t, 0, 1)); });
    return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + clamp(alpha, 0, 1).toFixed(2) + ')';
  }

  function livePalette() {
    if (isRed()) {
      return {
        bg1: '#1d0805', bg2: '#080101', grid: 'rgba(255,120,90,.13)', gridHi: 'rgba(255,150,110,.34)',
        gridMain: 'rgba(255,160,124,.94)', gridSub: 'rgba(255,146,110,.5)',
        label: '#e2a891', star: '#ffcbb8', con: 'rgba(255,120,90,.42)', dso: '#ff8a5c',
        horizon: 'rgba(255,150,112,.78)', ground: 'rgba(26,4,2,.55)', groundDeep: 'rgba(8,2,1,.88)', planet: '#ffd0b0'
      };
    }
    return {
      bg1: '#0d1c3e', bg2: '#010206', grid: 'rgba(150,180,255,.11)', gridHi: 'rgba(160,200,255,.34)',
      gridMain: 'rgba(182,214,255,.94)', gridSub: 'rgba(162,198,255,.52)',
      label: '#c3d4f5', star: '#ffffff', con: 'rgba(130,172,255,.45)', dso: '#7ee0c0',
      horizon: 'rgba(158,198,255,.8)', ground: 'rgba(3,6,14,.55)', groundDeep: 'rgba(1,2,6,.88)', planet: '#ffe8c0'
    };
  }

  /* 구면(입체, stereographic) 투영 — 모든 시야에서 기본으로 씁니다.
     · 화면 거리 = tan(θ/2) 이라 시야 가장자리에서도 늘어짐이 완만하고,
       지평선(대원)이 직선이 아니라 곡선으로 휘어 하늘 돔·지구의 둥근 느낌이 살아납니다.
     · 시야 절반(fov/2)이 화면 가장자리에 정확히 오도록 kS 를 잡습니다(예전 90° 이상 전용 식 그대로).
     · 시선 뒤(θ≳152°)는 값이 무한대로 발산하므로 그리지 않습니다(끊김 없이 사라짐).
     liveDraw(하늘)와 조준 유도(유도등·조준 링)가 같은 화면 좌표를 쓰도록 한 곳에 모았습니다. */
  function liveProjector() {
    const W = live.w, H = live.h, cx = W / 2, cy = H / 2;
    const fovDeg = clamp(live.fov, LIVE_FOV_MIN, 130);
    const fov = fovDeg * RAD;
    const basis = camBasis(live.az, live.alt);
    const fwd = basis.fwd, right = basis.right, up = basis.up;
    const kS = (H / 2) / Math.tan(fov / 4);
    function project(alt, az) {
      const al = alt * RAD, z = az * RAD;
      const d = [Math.cos(al) * Math.sin(z), Math.cos(al) * Math.cos(z), Math.sin(al)];
      const dy = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2];
      const dx = d[0] * right[0] + d[1] * right[1] + d[2] * right[2];
      const dz = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
      const den = 1 + dy;
      if (den < 0.12) return null;
      const k = kS / den;
      return { x: cx + dx * k, y: cy - dz * k };
    }
    return { W: W, H: H, cx: cx, cy: cy, fwd: fwd, right: right, up: up, kS: kS, fov: fov, fovDeg: fovDeg, project: project };
  }

  /* ======================================================================
     🎯 조준 유도 — 도감(대표 48종·전체 2,571종·88별자리)·기록관·퀴즈·행성표의
     「조준」이 라이브 하늘 뷰에 남기는 목표. 실시간 트래킹·드래그·시각 변경에도
     지워지지 않고, ✕ 를 직접 누를 때만 해제됩니다.
       · 시야 밖 — 화면 가장자리(HUD·버튼을 피한 안전 영역)에 방향 화살표(유도등,
         은은한 펄스) + 목표 이름 + 남은 각도(+ 지평선 아래 표시)
       · 시야 안 — 천체 자리에 조준 유도 링
       · 중앙(AIM_ARRIVE_DEG) 진입 — 도착 강조 링 + 🎯 찾았어요!
     ====================================================================== */
  const AIM_ARRIVE_DEG = 4;
  const aim = {
    on: false, kind: null, key: null, raH: null, decD: null, name: '',
    az: 0, alt: 0, angDist: 180, inView: false, arrived: false, below: false,
    theta: 0, sx: null, sy: null,
    raf: null, t: 0, fitAt: 0, insets: null, pw: 84, ph: 24, nameKey: null, belowKey: null, stateKey: null
  };

  /* 목표의 지금 방위·고도 — 행성·달·별자리는 이름/키로, 임의 좌표(적경·적위)는
     매 프레임 현재 시각으로 다시 계산합니다(시각을 바꿔도 목표가 하늘에 붙어 있습니다). */
  function aimPoint(jd) {
    if (!aim.on) return null;
    if (aim.kind) {
      const info = skyInfo(aim.kind, aim.key, jd);
      if (!info) return null;
      return { az: info.az, alt: info.alt, name: info.name || aim.name };
    }
    if (aim.raH == null || aim.decD == null) return null;
    const h = A.equatorialToHorizontal(aim.raH, aim.decD, state.site.lat, state.site.lon, jd);
    return { az: h.az, alt: h.alt, name: aim.name };
  }

  function aimSet(target) {
    if (!target) return;
    aim.on = true;
    aim.kind = target.kind || null;
    aim.key = (target.key == null ? null : target.key);
    aim.raH = (target.raH == null ? null : target.raH);
    aim.decD = (target.decD == null ? null : target.decD);
    aim.name = target.name || '';
    aim.nameKey = null; aim.belowKey = null; aim.stateKey = null;
    const c = state.last || computeNight();
    const pt = aimPoint(c.jd);
    if (pt) {
      if (!aim.name) aim.name = pt.name || '';
      aim.az = A.mod(pt.az, 360);
      aim.alt = pt.alt;
      /* 시선을 목표로 돌리는 일은 부르는 쪽(aimAt·aimRaDec)이 이미 했습니다 —
         여기서는 목표만 붙들어 두고, ✕ 로 해제할 때까지 유지합니다.
         (실시간 트래킹 중에는 폰이 시선의 주인입니다) */
    }
    aim.fitAt = 0;
    aimStart();
  }

  function aimClear(silent) {
    if (!aim.on) return;
    aim.on = false;
    aim.kind = null; aim.key = null; aim.raH = null; aim.decD = null; aim.name = '';
    aim.inView = false; aim.arrived = false; aim.below = false; aim.angDist = 180;
    aim.nameKey = null; aim.belowKey = null; aim.stateKey = null;
    aimStop();
    const wrap = $('#liveGuide');
    if (wrap) wrap.hidden = true;
    aimPaint(null);
    if (!silent) toast('조준 유도를 껐습니다. 다시 찾으려면 도감·기록관에서 🎯 조준을 누르세요.');
  }

  /* 화면 기준 계산 — 목표까지의 각거리, 화면에서의 방향(위=0°, 오른쪽=+90°), 시야 안 여부. */
  function aimGeom() {
    const c = state.last || computeNight();
    const pt = aimPoint(c.jd);
    if (!pt) return null;
    aim.az = A.mod(pt.az, 360);
    aim.alt = pt.alt;
    if (pt.name) aim.name = pt.name;
    const P = liveProjector();
    if (!P.W || !P.H) return null;
    const al = clamp(pt.alt, -90, 90) * RAD, z = aim.az * RAD;
    const d = [Math.cos(al) * Math.sin(z), Math.cos(al) * Math.cos(z), Math.sin(al)];
    const dot3 = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
    const dy = clamp(dot3(d, P.fwd), -1, 1), dx = dot3(d, P.right), dz = dot3(d, P.up);
    const angDist = Math.acos(dy) / RAD;
    const p = P.project(pt.alt, aim.az);
    const inView = !!p && p.x > 10 && p.x < P.W - 10 && p.y > 10 && p.y < P.H - 10;
    let theta = Math.atan2(dx, dz) / RAD;
    /* 정확히 등 뒤 — 투영이 무한대로 발산하는 자리라 좌우 방향 성분이 0 이 됩니다.
       방위 차의 부호로 좌우를 정해 화살표가 사라지지 않게 합니다. */
    if (Math.hypot(dx, dz) < 0.02) theta = shortestDelta(live.az, aim.az) >= 0 ? 90 : -90;
    return { P: P, p: p, inView: inView, angDist: angDist, theta: theta, below: pt.alt < 0 };
  }

  /* 안전 영역 — HUD 칩 줄·안내 바·하단 ⚙ 조작·확대 열을 피한 사각형. */
  function aimInsets(sr) {
    const stage = $('#liveStage');
    if (!stage || !sr || !sr.width || !sr.height) return null;
    let top = 44, bottom = 92;
    const rel = function (el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.height < 2 || r.width < 2) return null;
      return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height };
    };
    const hud = rel(stage.querySelector('.live-hud-top'));
    if (hud) top = Math.max(34, Math.round(hud.y + hud.h + 6));
    const bar = rel(stage.querySelector('#liveGuideBar'));
    top = Math.max(top, bar ? Math.round(bar.y + bar.h + 6) : 72);
    ['.live-quick', '.live-center-card', '.live-zoom'].forEach(function (sel) {
      const r = rel(stage.querySelector(sel));
      if (!r) return;
      if (r.y + r.h > sr.height * 0.45) bottom = Math.max(bottom, Math.round(sr.height - r.y + 14));
    });
    const avoid = ['#liveGuideBar', '.live-hud-top', '.live-quick', '.live-zoom', '.live-center-card']
      .map(function (sel) { return rel(stage.querySelector(sel)); })
      .filter(Boolean);
    return {
      w: sr.width, h: sr.height, left: 18, right: 18, avoid: avoid,
      top: Math.min(top, Math.round(sr.height * 0.4)),
      bottom: Math.min(bottom, Math.round(sr.height * 0.45))
    };
  }

  function rectOverlap(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return (w > 0 && h > 0) ? w * h : 0;
  }

  /* 이름·각도 알약 자리 — 유도등 옆(바깥쪽) 우선, 자리가 없으면 안/밖으로 옮깁니다.
     HUD·버튼·안내 바와 겹치는 넓이에 발점을 매기므로 좁은 폰에서도 침범이 없습니다. */
  function aimPlacePill(x, y, ins) {
    const pw = aim.pw, ph = aim.ph, gap = 26;
    const cands = [
      { x: x + gap, y: y - ph / 2, bend: x < ins.w / 2 ? 24 : 0 },
      { x: x - gap - pw, y: y - ph / 2, bend: x >= ins.w / 2 ? 24 : 0 },
      { x: x - pw / 2, y: y - gap - ph * 0.35, bend: 40 },
      { x: x - pw / 2, y: y + gap - ph * 0.65, bend: 40 }
    ];
    let best = { x: x + gap, y: y - ph / 2 }, bestScore = Infinity;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      const px = clamp(c.x, 6, Math.max(6, ins.w - pw - 6));
      const py = clamp(c.y, 6, Math.max(6, ins.h - ph - 6));
      const r = { x: px, y: py, w: pw, h: ph };
      let score = c.bend + (Math.abs(px - c.x) + Math.abs(py - c.y)) * 0.6;
      const av = ins.avoid || [];
      for (let k = 0; k < av.length; k++) score += rectOverlap(r, av[k]) * 6;
      if (score < bestScore) { bestScore = score; best = { x: px, y: py }; }
    }
    return best;
  }

  function aimFit() {
    const stage = $('#liveStage'), cv = $('#liveGuideCanvas');
    if (!stage || !cv) return;
    const r = stage.getBoundingClientRect();
    const dpr = live.dpr || Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w > 0 && h > 0) {
      const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    }
    aim.insets = aimInsets(r);
    aim.fitAt = Date.now();
  }

  /* 조준 링·도착 강조 — 하늘 캔버스 위에 겹친 전용 캔버스에 링만 다시 그립니다
     (별·은하수를 매 프레임 다시 그리지 않아 펄스가 부드럽고 배터리도 덜 씁니다). */
  function aimPaint(g) {
    const cv = $('#liveGuideCanvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!g || !g.inView || !g.p) return;
    const dpr = live.dpr || 1;
    const x = g.p.x * dpr, y = g.p.y * dpr;
    const col = isRed() ? '255,150,110' : '255,212,121';
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 430);
    const R = (aim.arrived ? 34 : 26) * dpr;
    ctx.save();
    if (aim.arrived) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, R + 16 * dpr);
      glow.addColorStop(0, 'rgba(' + col + ',.24)');
      glow.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, R + 16 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    // 바깥으로 퍼지는 펄스
    ctx.strokeStyle = 'rgba(' + col + ',' + (0.42 * (1 - pulse)).toFixed(3) + ')';
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath(); ctx.arc(x, y, R + (6 + pulse * 12) * dpr, 0, Math.PI * 2); ctx.stroke();
    // 조준 링
    ctx.strokeStyle = 'rgba(' + col + ',' + (aim.arrived ? '0.96' : '0.82') + ')';
    ctx.lineWidth = (aim.arrived ? 2.6 : 2) * dpr;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
    if (aim.arrived) {
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); ctx.arc(x, y, R - 9 * dpr, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 네 방향 눈금
    const tk = 6 * dpr;
    ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, y - R - tk); ctx.lineTo(x, y - R + tk * 0.4);
    ctx.moveTo(x, y + R + tk); ctx.lineTo(x, y + R - tk * 0.4);
    ctx.moveTo(x - R - tk, y); ctx.lineTo(x - R + tk * 0.4, y);
    ctx.moveTo(x + R + tk, y); ctx.lineTo(x + R - tk * 0.4, y);
    ctx.stroke();
    ctx.textAlign = 'center';
    if (aim.arrived) {
      ctx.font = '800 ' + Math.round(12 * dpr) + 'px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(' + col + ',.98)';
      ctx.fillText('🎯 찾았어요!', x, y - R - 12 * dpr);
    }
    if (aim.name) {
      ctx.font = '700 ' + Math.round(11 * dpr) + 'px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.86)';
      ctx.fillText(aim.name, x, y + R + 16 * dpr);
    }
    ctx.restore();
  }

  /* 목표 이름이 바뀌었을 때만 알약 크기를 잽니다(매 프레임 측정하지 않게). */
  function aimMeasure() {
    const pill = $('#liveGuidePill');
    if (!pill) return;
    const wasHidden = pill.hidden;
    pill.hidden = false;
    pill.style.visibility = 'hidden';
    const r = pill.getBoundingClientRect();
    if (r.width) aim.pw = Math.round(r.width);
    if (r.height) aim.ph = Math.round(r.height);
    pill.style.visibility = '';
    pill.hidden = wasHidden;
  }

  function aimUpdate() {
    const wrap = $('#liveGuide');
    if (!wrap) return null;
    if (!aim.on) {
      wrap.hidden = true;
      aimPaint(null);
      return null;
    }
    if (!aim.insets || Date.now() - aim.fitAt > 800) aimFit();
    const g = aimGeom();
    if (!g || !aim.insets) { wrap.hidden = true; aimPaint(null); return null; }
    wrap.hidden = false;
    aim.inView = g.inView;
    aim.angDist = g.angDist;
    aim.theta = g.theta;
    aim.below = g.below;
    aim.arrived = g.inView && g.angDist <= AIM_ARRIVE_DEG;
    aim.sx = g.p ? g.p.x : null;
    aim.sy = g.p ? g.p.y : null;

    const bar = $('#liveGuideBar'), beacon = $('#liveGuideBeacon'), pill = $('#liveGuidePill');
    if (bar) {
      bar.classList.toggle('is-inview', g.inView && !aim.arrived);
      bar.classList.toggle('is-arrived', aim.arrived);
    }
    const stateTxt = aim.arrived
      ? '찾았어요!'
      : (g.inView ? '시야 안 · 남은 ' : '시야 밖 · 남은 ') + nf(g.angDist, 0) + '°';
    if (aim.stateKey !== stateTxt) {
      aim.stateKey = stateTxt;
      const s = $('#liveGuideState');
      if (s) s.textContent = stateTxt + (g.below ? ' · 지평선 아래' : '');
    }
    if (aim.nameKey !== aim.name || aim.belowKey !== (g.below ? 1 : 0)) {
      aim.nameKey = aim.name;
      aim.belowKey = g.below ? 1 : 0;
      const n1 = $('#liveGuideName'), n2 = $('#liveGuideBeaconName');
      if (n1) n1.textContent = aim.name || '목표';
      if (n2) n2.textContent = aim.name || '목표';
      const belowEl = $('#liveGuideBelow');
      if (belowEl) belowEl.hidden = !g.below;
      aimMeasure();
    }

    if (g.inView) {
      if (beacon) beacon.hidden = true;
      if (pill) pill.hidden = true;
    } else {
      if (beacon) beacon.hidden = false;
      if (pill) pill.hidden = false;
      const ins = aim.insets;
      const R = 22;   // 유도등 반지름 — 상자 전체가 안전 영역 안에 들어오도록 반지름만큼 줄입니다
      const rx = Math.max(10, (ins.w - ins.left - ins.right) / 2 - R - 4);
      const ry = Math.max(10, (ins.h - ins.top - ins.bottom) / 2 - R - 4);
      const cxs = ins.left + R + 4 + rx, cys = ins.top + R + 4 + ry;
      const th = g.theta * RAD;
      const x = cxs + Math.sin(th) * rx;
      const y = cys - Math.cos(th) * ry;
      if (beacon) {
        beacon.style.transform = 'translate(' + Math.round(x - 22) + 'px,' + Math.round(y - 22) + 'px)';
        const ar = $('#liveGuideArrow');
        if (ar) ar.style.transform = 'rotate(' + g.theta.toFixed(1) + 'deg)';
      }
      if (pill) {
        const at = aimPlacePill(x, y, ins);
        pill.style.transform = 'translate(' + Math.round(at.x) + 'px,' + Math.round(at.y) + 'px)';
      }
      const angEl = $('#liveGuideBeaconAngle');
      if (angEl) angEl.textContent = nf(g.angDist, 0) + '°';
    }
    aimPaint(g);
    return {
      on: aim.on, name: aim.name, az: aim.az, alt: aim.alt, angDist: aim.angDist,
      inView: aim.inView, arrived: aim.arrived, below: aim.below, theta: aim.theta,
      sx: aim.sx, sy: aim.sy, insets: aim.insets
    };
  }

  function aimLoop(ts) {
    aim.raf = null;
    if (!aim.on) return;
    const now = ts || performance.now();
    if (!document.hidden && now - aim.t > 40) { aim.t = now; aimUpdate(); }
    aim.raf = requestAnimationFrame(aimLoop);
  }
  function aimStart() {
    if (aim.raf) return;
    aim.fitAt = 0;
    aim.raf = requestAnimationFrame(aimLoop);
    aimUpdate();
  }
  function aimStop() {
    if (aim.raf) { cancelAnimationFrame(aim.raf); aim.raf = null; }
  }

  function liveDraw() {
    const ctx = live.ctx;
    if (!ctx || !live.w || !live.h) return;
    const W = live.w, H = live.h, cx = W / 2, cy = H / 2;
    live.hits = [];                       // 프레임마다 새로 계산 (누적 방지)
    const c = state.last || computeNight();
    const jd = c.jd;
    const lat = state.site.lat, lon = state.site.lon;
    const pal = livePalette();
    const fovDeg = clamp(live.fov, LIVE_FOV_MIN, 130);
    const fov = fovDeg * RAD;
    /* 지평선 아래로도 이만큼은 그립니다 — 반투명 땅 너머로 별·별자리·태양이 이어져 보이게.
       발밑(-85°)까지 내려다볼 수 있게 되었으므로 -90°(천저)까지 그립니다.
       시선 뒤쪽(den<0.12)은 project()가 null 을 주므로 화면에 없는 점은 그려지지 않습니다. */
    const UNDER = -90;

    ctx.setTransform(live.dpr, 0, 0, live.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 태양 고도 → 주간 하늘 밝기 (0 밤, 1 낮). 박명도 반영해 정직하게 그립니다.
    const sunAlt = c.sunHor.alt;
    const dayF = clamp((sunAlt + 18) / 18, 0, 1);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    if (dayF > 0.001) {
      bg.addColorStop(0, mixHex(isRed() ? pal.bg1 : '#0d1c3e', isRed() ? '#2a0b05' : '#123a72', dayF));
      bg.addColorStop(0.55, mixHex(pal.bg2, isRed() ? '#3a1209' : '#3f6f9c', dayF));
      bg.addColorStop(1, mixHex('#000000', isRed() ? '#5a2010' : '#7d95a8', dayF * 0.85));
    } else {
      bg.addColorStop(0, pal.bg1);
      bg.addColorStop(0.62, pal.bg2);
      bg.addColorStop(1, '#000000');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* 투영기·기준틀은 조준 유도(유도등·링)와 같은 식을 써야 해서 liveProjector() 하나로 모았습니다. */
    const P = liveProjector();
    const fwd = P.fwd;
    const cross = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
    const dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
    const norm = function (a) { const l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const right = P.right;
    const up = P.up;
    const kS = P.kS;
    const project = P.project;
    function inBox(p, m) { return p && p.x > -(m || 40) && p.x < W + (m || 40) && p.y > -(m || 40) && p.y < H + (m || 40); }

    function strokePts(pts, style, width, dash) {
      ctx.save();
      ctx.strokeStyle = style;
      ctx.lineWidth = width || 1;
      if (dash) ctx.setLineDash(dash);
      let started = false;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (!p) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    /* 땅(지평선 아래) — 화면 '행'마다 지평선(고도 0°)과 만나는 x 를 정확히 풀어 그 아래를 칠합니다.
       · u=(x−cx)/kS, w=(cy−y)/kS 로 두면 고도 0° 조건이 u 에 대한 2차식이 됩니다.
         (입체 투영의 역변환 dx=2u/(1+t), dy=(1−t)/(1+t), dz=2w/(1+t), t=u²+w²)
       · 그래서 지평선이 곡선이 되고, 보는 방향에 따라 아래쪽 호·위쪽 호 어느 쪽에 와도,
         위를 보아 화면 한 행이 지평선을 두 번 지나는 경우까지 빠짐없이 맞습니다.
       · 천체를 먼저 그린 뒤 반투명하게 덮어 지평선 아래 별·별자리가 땅 너머로 은은히 비칩니다. */
    /* 지평선 고리 — 방위 0°부터 360°까지(끝점을 0°로 닫아 북쪽에서 끊기지 않게) 이어 그립니다.
       화면 뒤쪽(den<0.12)은 project() 가 null 을 주는데, 예전에는 그 점을 그냥 버려서
       잘려 나간 자리의 양 끝이 화면을 가로지르는 '긴 직선'(=상단 파란 가로선)으로 이어졌습니다.
       null 을 그대로 넘겨 strokePts 가 선을 끊게 합니다. */
    const hzPts = [];
    for (let a = 0; a <= 360; a += 2) hzPts.push(project(0, a % 360));
    function groundSpans(y) {
      const w = (cy - y) / kS;
      const a2 = -fwd[2], b2 = 2 * right[2], c2 = fwd[2] * (1 - w * w) + 2 * up[2] * w;
      const toX = function (u) { return cx + u * kS; };
      if (Math.abs(a2) < 1e-9) {              // 지평선 높이를 정확히 보고 있을 때(2차항 소멸)
        if (Math.abs(b2) < 1e-9) return c2 < 0 ? [[-Infinity, Infinity]] : [];
        const u = -c2 / b2;
        return b2 > 0 ? [[-Infinity, toX(u)]] : [[toX(u), Infinity]];
      }
      const disc = b2 * b2 - 4 * a2 * c2;
      if (disc <= 0) return a2 < 0 ? [[-Infinity, Infinity]] : [];   // 행 전체가 땅 또는 하늘
      const sq = Math.sqrt(disc);
      const r1 = (-b2 - sq) / (2 * a2), r2 = (-b2 + sq) / (2 * a2);
      const lo = Math.min(r1, r2), hi = Math.max(r1, r2);           // a2 부호에 따라 근의 순서가 뒤집힘
      if (a2 > 0) return [[toX(lo), toX(hi)]];                       // 두 근 사이가 땅
      return [[-Infinity, toX(lo)], [toX(hi), Infinity]];            // 두 근 바깥이 땅
    }
    let groundRows = null, groundTop = Infinity;
    const GROUND_STEP_Y = 3;
    function buildGroundRows() {
      const stepY = GROUND_STEP_Y;
      const rows = [];
      let top = Infinity;
      for (let y = -stepY; y <= H + stepY; y += stepY) {
        const sp = groundSpans(y);
        const keep = [];
        for (let i = 0; i < sp.length; i++) {
          const x1 = Math.max(-2, sp[i][0]), x2 = Math.min(W + 2, sp[i][1]);
          if (x2 - x1 > 0.3) keep.push([x1, x2]);
        }
        if (keep.length) {
          rows.push({ y: y, sp: keep });
          if (y < top) top = y;
        }
      }
      groundRows = rows; groundTop = top;
      return rows;
    }
    function fillRows(rows, top, gTop, gBot) {
      const gr = ctx.createLinearGradient(0, clamp(top, -H, H), 0, H);
      gr.addColorStop(0, gTop);
      gr.addColorStop(1, gBot);
      /* 행마다 fillRect 를 따로 하면 겹치는 1px 이 두 번 칠해져 가로줄이 생깁니다.
         한 경로에 모아 한 번에 채우면 알파가 균일합니다. */
      ctx.save();
      ctx.fillStyle = gr;
      ctx.beginPath();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        for (let k = 0; k < r.sp.length; k++) {
          ctx.rect(r.sp[k][0], r.y - 0.5, r.sp[k][1] - r.sp[k][0], GROUND_STEP_Y + 1);   // 줄 사이 틈 방지
        }
      }
      ctx.fill();
      ctx.restore();
    }
    /* 낮에는 땅 아래를 *먼저* 어둡게 깔아 둡니다(천체를 그리기 전).
       그래야 지평선 아래 별·행성·격자가 어두운 바탕 위에서 또렷하게 보입니다.
       (밝은 하늘 그라디언트 위에 반투명 땅을 나중에 덮으면, 아래쪽이 회색 안개처럼
        밝아져 별이 묻혔습니다) */
    function drawGroundBase() {
      if (!(dayF > 0.02)) return;
      const rows = buildGroundRows();
      if (!rows.length) return;
      const dayMix = clamp(dayF * 0.7, 0, 1);
      fillRows(rows, groundTop,
        mixRGBA(isRed() ? '#120302' : '#04070c', isRed() ? '#2a0b05' : '#131c26', dayMix, 0.80),
        mixRGBA(isRed() ? '#0b0201' : '#02040a', isRed() ? '#2a0b05' : '#161f2a', dayMix, 0.88));
    }
    /* 땅 표면(반투명 베일) — 천체를 다 그린 뒤 덮어 '땅'임을 알립니다.
       낮에는 아주 옅게(0.10 → 0.20)만 깔아 지평선 아래 천체를 가리지 않고,
       밤에는 기존대로 은은하게(0.55 → 0.88) 깔아 별이 땅 너머로 비칩니다. */
    function drawGround() {
      const rows = groundRows || buildGroundRows();
      if (!rows.length) return;
      const dayMix = clamp(dayF * 0.7, 0, 1);
      const gTop = dayF > 0.02
        ? mixRGBA(isRed() ? '#1a0402' : '#03060e', isRed() ? '#43140b' : '#4a5a68', dayMix, 0.10)
        : pal.ground;
      const gBot = dayF > 0.02
        ? mixRGBA(isRed() ? '#1a0402' : '#02040a', isRed() ? '#43140b' : '#4a5a68', dayMix, 0.20)
        : pal.groundDeep;
      fillRows(rows, groundTop, gTop, gBot);
      // 지평선 경계는 또렷하게 — 위(하늘)·아래(땅) 구분이 한눈에 남습니다.
      strokePts(hzPts, pal.horizon, 2);
    }
    // 낮에는 땅 아래를 먼저 어둡게 깔고, 그 위에 격자·은하수·별·행성·태양을 그립니다.
    drawGroundBase();

    // 라벨 충돌 방지용
    const labelBoxes = [];
    function drawLabel(text, x, y, color, font, align) {
      ctx.font = font || '600 11px system-ui, sans-serif';
      const w = ctx.measureText(text).width;
      const bx = align === 'center' ? { x: x - w / 2, y: y - 9, w: w, h: 13 } : { x: x, y: y - 9, w: w, h: 13 };
      for (let i = 0; i < labelBoxes.length; i++) {
        const b = labelBoxes[i];
        if (bx.x < b.x + b.w && bx.x + bx.w > b.x && bx.y < b.y + b.h && bx.y + bx.h > b.y) return false;
      }
      labelBoxes.push(bx);
      ctx.textAlign = align === 'center' ? 'center' : 'left';
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.textAlign = 'left';
      return true;
    }

    /* 고도·방위 격자 — 켜면 구면 투영을 따라 휘어진 선과 각도 레이블이 또렷하게,
       끄면(진하기 0%) 완전히 사라집니다. 진하기는 ⚙ 조작의 「격자 진하기」로 조절합니다. */
    if (live.grid && live.gridA > 0.01) {
      const ga = clamp(live.gridA, 0, 1);
      ctx.save();
      ctx.globalAlpha = ga;
      // 고도 30° · 60° 고리
      [30, 60].forEach(function (alt) {
        const pts = [];
        for (let a = 0; a <= 360; a += 2) pts.push(project(alt, a % 360));
        strokePts(pts, pal.gridMain, 1.3 + ga * 0.9);
      });
      // 진할 때는 15°·45°·75° 보조선도 (점선)
      if (ga >= 0.4) {
        [15, 45, 75].forEach(function (alt) {
          const pts = [];
          for (let a = 0; a <= 360; a += 4) pts.push(project(alt, a % 360));
          strokePts(pts, pal.gridSub, 1, [3, 5]);
        });
      }
      /* 지평선 아래로 내려다볼 때의 고도 고리 — −30° · −60° · −80°.
         땅 너머로도 격자가 끊기지 않아, 발밑이 하늘의 연장임을 눈으로 확인할 수 있습니다. */
      if (live.alt < 5) {
        [-30, -60, -80].forEach(function (alt) {
          const pts = [];
          for (let a = 0; a <= 360; a += 2) pts.push(project(alt, a % 360));
          strokePts(pts, alt === -30 ? pal.gridMain : pal.gridSub, 1.1 + ga * 0.6, alt === -30 ? null : [3, 5]);
        });
      }
      // 방위 30° 간격 세로선 (북·동·남·서는 더 밝게) — 지평선 아래 −88°까지 이어 그립니다
      for (let a = 0; a < 360; a += 30) {
        const pts = [];
        for (let alt = -88; alt <= 88; alt += 2) pts.push(project(alt, a));
        strokePts(pts, a % 90 === 0 ? pal.gridMain : pal.gridSub, a % 90 === 0 ? 1.3 + ga * 0.7 : 1 + ga * 0.4);
      }
      ctx.restore();
      // 고도 각도 레이블 (30° · 60° · 아래 −30° · −60°) — 화면 가운데를 지나는 자리에 하나씩
      if (ga >= 0.15) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, ga + 0.15);
        const rings = live.alt < 5 ? [-60, -30, 30, 60] : [30, 60];
        rings.forEach(function (alt) {
          const p = project(alt, live.az);
          if (!inBox(p, 8)) return;
          drawLabel(alt + '°', p.x + 7, p.y - 5, pal.gridMain, '700 10px system-ui, sans-serif');
        });
        ctx.restore();
      }
    }

    /* 방위 글자 — 격자와 상관없이 늘 또렷하게(방위 각도 함께) */
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    [['북', 0], ['동', 90], ['남', 180], ['서', 270]].forEach(function (d) {
      const p = project(1.2, d[1]);
      if (!inBox(p, 6)) return;
      ctx.fillStyle = pal.gridHi;
      ctx.fillText(d[0] + ' ' + d[1] + '°', p.x + 4, p.y - 8);
    });

    /* 은하수 — IAU 은하좌표계 극·중심으로 계산한 실제 은하면 경로 */
    (function drawMilkyWay() {
      const gPole = { ra: 192.85948 / 15, dec: 27.12825 };
      const gCen = { ra: 266.40499 / 15, dec: -28.93617 };
      function eqVec(raH, decD) {
        const a = raH * 15 * RAD, d = decD * RAD;
        return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
      }
      const gp = eqVec(gPole.ra, gPole.dec);
      const gc = eqVec(gCen.ra, gCen.dec);
      const side = norm(cross(gp, gc));
      const pts_n = [], pts_c = [], pts_s = [];
      for (let l = 0; l <= 360; l += 3) {
        const cl = Math.cos(l * RAD), sl = Math.sin(l * RAD);
        const base = [0, 1, 2].map(function (i) { return gc[i] * cl + side[i] * sl; });
        const lat2 = Math.abs(Math.asin(clamp(gp[0] * base[0] + gp[1] * base[1] + gp[2] * base[2], -1, 1)) * 180 / Math.PI);
        [pts_n, pts_c, pts_s].forEach(function (arr, k) {
          const b = (k - 1) * 9; // -9, 0, +9도
          const off = [0, 1, 2].map(function (i) { return base[i] * Math.cos(b * RAD) + gp[i] * Math.sin(b * RAD); });
          const ra = Math.atan2(off[1], off[0]) * 180 / Math.PI;
          const dec = Math.asin(clamp(off[2], -1, 1)) * 180 / Math.PI;
          const h = A.equatorialToHorizontal(A.mod(ra, 360) / 15, dec, lat, lon, jd);
          arr.push(h.alt > -3 ? project(h.alt, h.az) : null);
          void lat2;
        });
      }
      // 밴드: 아주 옅게 여러 겹으로 겹쳐 부드러운 띠처럼
      const mwFade = 1 - dayF * 0.95;
      if (mwFade > 0.05) {
        const base = isRed() ? [255, 150, 110] : [198, 214, 255];
        const rgba = function (a) { return 'rgba(' + base[0] + ',' + base[1] + ',' + base[2] + ',' + (a * mwFade).toFixed(3) + ')'; };
        ctx.save();
        for (let i = 0; i < pts_n.length - 1; i++) {
          const a = pts_n[i], b2 = pts_n[i + 1], c2 = pts_s[i + 1], d2 = pts_s[i];
          if (!a || !b2 || !c2 || !d2) continue;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y);
          ctx.closePath();
          ctx.fillStyle = rgba(0.012);
          ctx.fill();
        }
        strokePts(pts_c, rgba(0.028), 46);
        strokePts(pts_c, rgba(0.03), 20);
        strokePts(pts_c, rgba(0.032), 5);
        ctx.restore();
      }
      if (live.labels) {
        for (let i = 0; i < pts_c.length; i += 6) {
          const p0 = pts_c[i];
          if (p0 && p0.x > 30 && p0.x < W - 30 && p0.y > 20 && p0.y < H - 20) {
            drawLabel('은하수', p0.x + 6, p0.y - 8, isRed() ? 'rgba(255,170,140,.8)' : 'rgba(205,220,255,.75)', '600 10px system-ui, sans-serif');
            break;
          }
        }
      }
    })();

    /* 별 — 배경에 묻히지 않게 크기·밝기를 올렸습니다.
       · 낮에도 별이 0.28 수준으로 남아, 밝은 하늘에서도 별자리 모양이 읽힙니다.
       · 지평선 아래(반투명 땅 너머)의 별은 더 밝게(underFade) 그려 발밑 하늘을 또렷하게. */
    const starPts = new Array(D.stars.length);
    const starByName = {};
    const labelStars = ['시리우스', '베텔게우스', '리겔', '베가', '데네브', '알타이르', '카펠라', '폴룩스', '아르크투루스',
      '안타레스', '스피카', '레굴루스', '폴라리스', '알데바란', '프로키온', '포말하우트', '카스토르', '미라크', '카노푸스', '아케르나르'];
    const starBuckets = {};
    const starFade = 1 - dayF * 0.72;
    const underFade = clamp(starFade + 0.35, 0.55, 1);
    D.stars.forEach(function (st, i) {
      const h = A.equatorialToHorizontal(st[1], st[2], lat, lon, jd);
      if (h.alt < UNDER) return;
      const p = project(h.alt, h.az);
      if (!inBox(p, 10)) return;
      p.under = h.alt < 0;
      starPts[i] = p;
      if (h.alt >= 0) starByName[st[0]] = p;   // 이름표는 지평선 위 별만
      const mag = st[3];
      const r0 = mag <= 2.0 ? 3.0 : mag <= 3.2 ? 2.1 : mag <= 4.2 ? 1.5 : 1.05;
      // 지평선 아래 별은 한 단계 크게 — 반투명 땅 너머에서도 점이 뭉개지지 않게
      const r = h.alt < 0 ? Math.round(r0 * 1.35 * 100) / 100 : r0;
      const key = bvColor(st[4]) + '|' + r + (h.alt < 0 ? '|u' : '');
      (starBuckets[key] = starBuckets[key] || []).push(p);
      /* 화면에 그려지는 별은 모두 터치 대상입니다(예전에는 2.3등급 이하만).
         매 프레임 객체를 새로 만들지 않도록 D.stars 순번별로 하나씩 재사용합니다. */
      const hit = live.starHitPool[i] || (live.starHitPool[i] = { kind: 'star', x: 0, y: 0, key: '', name: '', mag: 0 });
      hit.x = p.x; hit.y = p.y; hit.key = st[0]; hit.name = st[0]; hit.mag = st[3];
      live.hits.push(hit);
    });
    /* 밝은 별의 은은한 광휘 — 점으로만 찍히던 별에 빛 번짐을 더해 또렷하게 */
    D.stars.forEach(function (st, i) {
      const p = starPts[i];
      if (!p || st[3] > 3.2) return;
      const glow = clamp((3.4 - st[3]) * 0.9, 0.4, 2.8);
      ctx.globalAlpha = 0.18 * (p.under ? underFade : starFade) + 0.05;
      ctx.fillStyle = isRed() ? pal.star : st[4] == null ? '#ffffff' : bvColor(st[4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2 + glow * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    Object.keys(starBuckets).forEach(function (key) {
      const parts = key.split('|');
      const r = Number(parts[1]);
      const fade = parts[2] === 'u' ? underFade : starFade;
      ctx.globalAlpha = clamp(1.08 - (r < 1.2 ? 0.38 : r < 1.7 ? 0.24 : r < 2.4 ? 0.12 : 0.02), 0.42, 1) * fade;
      ctx.fillStyle = isRed() ? pal.star : parts[0];
      ctx.beginPath();
      starBuckets[key].forEach(function (p) { ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); });
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    /* 별자리 선 88종 — 보이는 별의 고도와 중요도(rank)로 진하기를 조절 */
    const conCand = [];
    ctx.save();
    D.constellations.forEach(function (con) {
      const pts = [];
      let total = 0, shown = 0, sx = 0, sy = 0, n = 0;
      ctx.beginPath();
      con.lines.forEach(function (pair) {
        total++;
        const a = starPts[pair[0]], b = starPts[pair[1]];
        if (!a || !b) return;
        if (Math.hypot(a.x - b.x, a.y - b.y) > Math.max(W, H) * 1.4) return;
        shown++;
        pts.push(a, b);
        sx += a.x + b.x; sy += a.y + b.y; n += 2;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      });
      if (!shown) return;
      const frac = shown / total;
      ctx.strokeStyle = isRed() ? pal.con : 'rgba(130,172,255,' + Math.min(0.78, (0.28 + 0.26 * frac) * (con.rank === 1 ? 1.3 : con.rank === 2 ? 1.08 : 0.92) * (1 - dayF * 0.45)).toFixed(3) + ')';
      ctx.lineWidth = con.rank === 1 ? 1.7 : 1.3;
      ctx.stroke();
      const mx = n ? sx / n : cx, my = n ? sy / n : cy;
      const lhor = A.equatorialToHorizontal(con.raH, con.decD, lat, lon, jd);
      const lp = lhor.alt > 0 ? project(lhor.alt, lhor.az) : null;
      const hx = (lp && inBox(lp, 0)) ? lp.x : mx, hy = (lp && inBox(lp, 0)) ? lp.y : my;
      live.hits.push({ x: hx, y: hy, kind: 'con', key: con.abbr, name: con.name });
      conCand.push({ con: con, x: hx, y: hy, frac: frac });
    });
    ctx.restore();

    /* 별자리 이름 — 중요도 → 화면 중앙에 가까운 순. 좁은 시야(FOV)에서는 더 많이 */
    if (live.labels && fovDeg <= 110) {
      const maxLabels = fovDeg <= 45 ? 26 : fovDeg <= 70 ? 20 : 12;
      const ranked = conCand.slice().sort(function (a, b) {
        return a.con.rank - b.con.rank || b.frac - a.frac ||
          Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy);
      });
      let drawn = 0;
      ctx.textAlign = 'center';
      for (let i = 0; i < ranked.length && drawn < maxLabels; i++) {
        const it = ranked[i];
        if (it.frac < 0.34) continue;
        if (it.con.rank === 3 && fovDeg > 70) continue;
        const size = it.con.rank === 1 ? 12 : it.con.rank === 2 ? 10.5 : 9.5;
        ctx.font = (it.con.rank === 1 ? '700 ' : '600 ') + size + 'px system-ui, sans-serif';
        ctx.globalAlpha = it.con.rank === 1 ? 1 : it.con.rank === 2 ? 0.9 : 0.78;
        if (drawLabel(it.con.name, it.x, it.y, pal.label, ctx.font, 'center')) drawn++;
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left';
    }

    /* 별 이름 */
    if (live.labels) {
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      labelStars.forEach(function (nm) {
        const p = starByName[nm];
        if (!p) return;
        ctx.globalAlpha = 0.9;
        drawLabel(nm, p.x + 5, p.y + 13, pal.star);
        ctx.globalAlpha = 1;
      });
    }

    /* 딥스카이 */
    const inView = [];
    if (live.deep) {
      D.catalog.filter(function (o) { return o.group === 'dso' && o.mag != null && o.mag <= 7.5; }).forEach(function (o) {
        const h = A.equatorialToHorizontal(o.raH, o.decD, lat, lon, jd);
        if (h.alt < 0) return;
        const p = project(h.alt, h.az);
        if (!inBox(p, 12)) return;
        const r = o.mag <= 4 ? 4.4 : o.mag <= 6 ? 3.4 : 2.6;
        ctx.strokeStyle = pal.dso;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r);
        ctx.lineTo(p.x + r, p.y);
        ctx.lineTo(p.x, p.y + r);
        ctx.lineTo(p.x - r, p.y);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (live.labels && fovDeg <= 95 && o.mag <= 6.5) {
          ctx.globalAlpha = 0.85;
          drawLabel(o.name.replace(' 성단', '').replace(' 대성운', ''), p.x + 7, p.y + 12, pal.dso, '600 10px system-ui, sans-serif');
          ctx.globalAlpha = 1;
        }
        live.hits.push({ x: p.x, y: p.y, kind: 'dso', key: o.id, name: o.name, mag: o.mag });
        inView.push({ kind: 'dso', key: o.id, name: o.name, alt: h.alt, az: h.az, d: Math.hypot(p.x - cx, p.y - cy) });
      });
    }

    /* 행성 */
    const planetColor = {
      mercury: '#dcdcdc', venus: '#ffeab0', mars: '#ff8a6a', jupiter: '#ffd9a0',
      saturn: '#f0e2ad', uranus: '#9fe8e0', neptune: '#9db8ff'
    };
    c.planets.forEach(function (pl) {
      if (pl.hor.alt < UNDER) return;
      const p = project(pl.hor.alt, pl.hor.az);
      if (!inBox(p, 14)) return;
      const r = clamp(6.2 - pl.mag * 0.9, 3.2, 8);
      const col = planetColor[pl.key] || pal.planet;
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
      grd.addColorStop(0, col);
      grd.addColorStop(0.35, col);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (live.labels) {
        drawLabel(pl.name, p.x + r + 5, p.y - 3, col, '700 12px system-ui, sans-serif');
      }
      live.hits.push({ x: p.x, y: p.y, kind: 'planet', key: pl.key, name: pl.name, mag: pl.mag });
      inView.push({ kind: 'planet', key: pl.key, name: pl.name, alt: pl.hor.alt, az: pl.hor.az, d: Math.hypot(p.x - cx, p.y - cy) });
    });

    /* 달 (위상까지) */
    const moonP = A.moonPos(jd), moonPh = A.moonPhase(jd);
    const moonH = A.equatorialToHorizontal(moonP.raH, moonP.decD, lat, lon, jd);
    const moonPt = moonH.alt >= UNDER ? project(moonH.alt, moonH.az) : null;
    if (inBox(moonPt, 30)) {
      const pxDeg = H / fovDeg;
      const r = clamp(pxDeg * 0.26, 5, Math.min(W, H) * 0.22);
      const ill = clamp(moonPh.illum, 0, 1);
      ctx.save();
      ctx.beginPath();
      ctx.arc(moonPt.x, moonPt.y, r * 2.2, 0, Math.PI * 2);
      const halo = ctx.createRadialGradient(moonPt.x, moonPt.y, 0, moonPt.x, moonPt.y, r * 2.2);
      halo.addColorStop(0, 'rgba(255,240,205,' + (0.16 + ill * 0.22).toFixed(2) + ')');
      halo.addColorStop(1, 'rgba(255,240,205,0)');
      ctx.fillStyle = halo;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(moonPt.x, moonPt.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(70,70,76,.7)';
      ctx.fill();
      const rx = Math.max(0.4, r * Math.abs(1 - 2 * ill));
      ctx.beginPath();
      if (moonPh.waxing) {
        ctx.arc(moonPt.x, moonPt.y, r, -Math.PI / 2, Math.PI / 2, false);
        ctx.ellipse(moonPt.x, moonPt.y, rx, r, 0, Math.PI / 2, -Math.PI / 2, ill >= 0.5);
      } else {
        ctx.arc(moonPt.x, moonPt.y, r, Math.PI / 2, -Math.PI / 2, false);
        ctx.ellipse(moonPt.x, moonPt.y, rx, r, 0, -Math.PI / 2, Math.PI / 2, ill < 0.5);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,242,210,' + (0.35 + ill * 0.65).toFixed(2) + ')';
      ctx.fill();
      ctx.restore();
      if (live.labels) {
        drawLabel('달 ' + Math.round(ill * 100) + '%', moonPt.x + r + 6, moonPt.y + 4, '#ffeec8', '700 12px system-ui, sans-serif');
      }
      live.hits.push({ x: moonPt.x, y: moonPt.y, kind: 'moon', key: '', name: '달', mag: -12.7 });
      inView.push({ kind: 'moon', key: '', name: '달', alt: moonH.alt, az: moonH.az, d: Math.hypot(moonPt.x - cx, moonPt.y - cy) });
    }

    /* 태양 — 지평선 위든 아래든(반투명 땅 너머로) 그립니다.
       지평선 아래로 깊이 내려갈수록 빛무리를 줄여(0.28 하한) 땅속 태양이 화면을 압도하지 않게 하고,
       원반은 어느 고도에서든 또렷하게 남겨 눌러서 정보를 볼 수 있게 합니다. */
    const sunH = { alt: c.sunHor.alt, az: c.sunHor.az };
    if (sunH.alt >= UNDER) {
      const p = project(sunH.alt, sunH.az);
      if (inBox(p, 60)) {
        const pxDeg2 = H / live.fov;
        const sr = Math.max(4.5, pxDeg2 * 0.27);
        const depth = sunH.alt >= 0 ? 1 : clamp(1 + sunH.alt / 70, 0.28, 1);
        ctx.save();
        ctx.globalAlpha = depth;
        const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sr * 7);
        g2.addColorStop(0, 'rgba(255,244,200,.98)');
        g2.addColorStop(0.18, 'rgba(255,220,140,.55)');
        g2.addColorStop(0.5, 'rgba(255,180,90,.16)');
        g2.addColorStop(1, 'rgba(255,160,70,0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sr * 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,246,214,.98)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, sr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,220,150,.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sr + 1.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        if (live.labels) {
          drawLabel(sunH.alt < 0 ? '태양 (지평선 아래)' : '태양', p.x + sr + 6, p.y - 3,
            '#ffe9a8', '700 12px system-ui, sans-serif');
        }
        live.hits.push({ x: p.x, y: p.y, kind: 'sun', key: '', name: '태양', mag: -26.7 });
        inView.push({ kind: 'sun', key: '', name: '태양', alt: sunH.alt, az: sunH.az, d: Math.hypot(p.x - cx, p.y - cy) });
      }
    }

    /* 땅과 지평선은 천체를 다 그린 뒤에 덮습니다 — 지평선 아래 천체가 반투명 땅 너머로
       은은하게 비치고, 지평선 경계선은 그 위에 또렷하게 그어집니다. */
    drawGround();

    /* 선택한 천체 표시 링 */
    if (live.selected) {
      const sel = live.hits.find(function (h) {
        return h.kind === live.selected.kind && String(h.key) === String(live.selected.key);
      });
      if (sel) {
        const pulse = 1 + Math.sin(Date.now() / 320) * 0.12;
        ctx.strokeStyle = 'rgba(255,212,121,.95)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sel.x, sel.y, 15 * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,212,121,.35)';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(sel.x, sel.y, 15 * pulse, 0, Math.PI * 2); ctx.stroke();
      }
    }

    /* 중앙 조준점 */
    ctx.strokeStyle = 'rgba(126,224,192,.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy); ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 15, cy);
    ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy - 5);
    ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 15);
    ctx.stroke();

    /* 시야 안내 */
    inView.sort(function (a, b) { return a.d - b.d; });
    const nearest = inView.length ? inView[0] : null;
    const card = $('#liveCenterCard');
    if (card) {
      const txt = nearest && nearest.d < Math.min(W, H) * 0.42
        ? '시야 중앙 <b>' + esc(nearest.name) + '</b> · ' + dirName(nearest.az) + ' ' + nf(nearest.alt, 0) + '°'
        : '시야 중앙 — ' + dirName(live.az) + ' ' + nf(live.alt, 0) + '° (천체를 눌러 보세요)';
      if (txt !== live.lastCenter) { card.innerHTML = txt; live.lastCenter = txt; }
    }
    const hint = $('#liveDayHint');
    if (hint) hint.hidden = !(dayF > 0.02);
    const now = Date.now();
    if (now - live.lastIv > 350) {
      live.lastIv = now;
      const box = $('#liveInView');
      if (box) {
        const top = inView.slice(0, 8);
        box.innerHTML = top.length
          ? top.map(function (o) {
            return '<span class="iv-item" data-iv="' + o.kind + ':' + esc(o.key) + '">' + esc(o.name) + ' <b>' + dirName(o.az) + ' ' + nf(o.alt, 0) + '°</b></span>';
          }).join('')
          : '<span class="iv-empty">이 방향 시야에 밝은 천체가 없습니다. 방위를 돌려 보세요.</span>';
      }
    }
  }

  /* 터치 판정 반경 — 화면에 그려진 별의 크기(등급)에 맞춰 줄입니다(밝은 별은 기존 32px 그대로). */
  function liveHitRadius(h) {
    if (h.kind !== 'star') return 32;
    const m = typeof h.mag === 'number' ? h.mag : 4;
    if (m <= 2.5) return 32;
    if (m <= 4) return 27;
    if (m <= 5.2) return 21;
    return 16;
  }

  function liveHandleClick(ev) {
    const stage = $('#liveStage');
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    // 손가락 크기 고려: 별은 등급에 따라 반경을 줄여(밝은 별 32px → 6등급 16px),
    // 별이 빽빽한 곳에서 엉뚱한 별이 잡히지 않게 합니다. 가까우면 밝은(등급 낮은) 쪽 우선.
    let best = null, bestScore = Infinity;
    live.hits.forEach(function (h) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d > liveHitRadius(h)) return;
      // 별을 정확히 눌렀을 때(7px 이내)는 밝기와 상관없이 그 별이 잡히게
      const score = d <= 7 ? d * 0.4 : d + (typeof h.mag === 'number' ? Math.max(0, h.mag + 1) * 1.5 : 0);
      if (score < bestScore) { bestScore = score; best = h; }
    });
    if (best) openLiveInfo(best);
    else { live.selected = null; liveDirty = true; kickLive(); }
  }


  /* ======================================================================
     라이브 하늘 천체 정보 창 — 이름·방위/고도·사진 갤러리(여러 장)
     ====================================================================== */
  const li = { items: [], idx: 0, info: null, busy: false };

  function skyviewUrl(raH, decD, survey, sizeDeg, px) {
    const ra = ((raH * 15 % 360) + 360) % 360;
    return 'https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl' +
      '?Survey=' + encodeURIComponent(survey) +
      '&Position=' + ra.toFixed(4) + ',' + Number(decD).toFixed(4) +
      '&Size=' + Number(sizeDeg).toFixed(2) + '&Pixels=' + (px || 600) + '&Return=JPEG';
  }

  function photoSetFor(info) {
    const out = [];
    const cur = window.PHOTO_SETS && window.PHOTO_SETS[info.name];
    if (cur && cur.length) {
      cur.forEach(function (p) {
        out.push({ src: p.src, thumb: p.src, title: p.title, credit: p.credit, link: p.link });
      });
      return out;
    }
    if (info.raH != null && info.decD != null && isFinite(info.raH) && isFinite(info.decD)) {
      const size = info.kind === 'dso' ? 1.2 : 2.6;   // 별은 넓게 잡아 주변 은하수까지
      // SkyView는 요청마다 새로 계산해 2MASS/WISE는 20초 넘게 걸리는 경우가 있어
      // 실제로 안정적으로 오는 DSS2 적색·청색 두 장만 씁니다.
      [
        ['DSS2 Red', '가시광 · DSS2 적색'],
        ['DSS2 Blue', '가시광 · DSS2 청색']
      ].forEach(function (sv) {
        const u = skyviewUrl(info.raH, info.decD, sv[0], size, 560);
        out.push({
          src: u, thumb: u,
          title: info.name + ' · ' + sv[1],
          credit: 'NASA SkyView · ' + sv[0],
          link: u
        });
      });
    }
    return out;
  }

  function factRow(label, value) {
    return '<div class="li-fact"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }

  function openLiveInfo(hit) {
    const box = $('#liveInfo');
    if (!box) return;
    const jd = (state.last || computeNight()).jd;
    const info = skyInfo(hit.kind, hit.key, jd);
    if (!info) return;
    live.selected = { kind: hit.kind, key: hit.key };
    liveDirty = true; kickLive();

    const obj = info.objId ? D.catalog.find(function (x) { return x.id === info.objId; }) : null;
    const facts = [];
    facts.push(factRow('지금', dirName(info.az) + ' ' + nf(info.alt, 0) + '° (방위 ' + nf(info.az, 0) + '°)'));
    if (typeof info.mag === 'number') facts.push(factRow('겉보기 등급', (info.mag > 0 ? '+' : '') + nf(info.mag, Math.abs(info.mag) >= 10 ? 1 : 2) + '등'));
    /* 태양은 일출·일몰·남중 고도·거리처럼 관측에 바로 쓰는 값을 카드에 함께 보여 줍니다. */
    if (info.kind === 'sun') {
      const cn = state.last || computeNight();
      const nt = cn.night || {};
      const maxSun = (nt.samples && nt.samples.length)
        ? nt.samples.reduce(function (m, s) { return Math.max(m, s.sun); }, -90)
        : info.alt;
      const sp = A.sunPos(jd);
      facts.push(factRow('오늘 일출', A.fmtClock(nt.sunrise)));
      facts.push(factRow('오늘 일몰', A.fmtClock(nt.sunset)));
      facts.push(factRow('남중(정오) 고도', nf(maxSun, 0) + '°'));
      facts.push(factRow('지구까지', nf(sp.distAU, 3) + ' AU'));
      facts.push(factRow('시지름', '약 32′ (0.53°)'));
      facts.push(factRow('표면 온도', '약 5,800 K'));
    }
    if (obj && obj.con && obj.con !== '—') facts.push(factRow('별자리', obj.con));
    if (obj && obj.dist && obj.dist !== '—') facts.push(factRow('거리', obj.dist));
    if (info.kind === 'con' && info.cells) info.cells.slice(0, 3).forEach(function (c) { facts.push(factRow(c[0], c[1])); });

    li.items = photoSetFor(info);
    li.idx = 0;
    li.info = info;

    box.innerHTML =
      '<div class="li-backdrop" data-li-close></div>' +
      '<div class="li-card" role="dialog" aria-label="' + esc(info.name) + ' 정보">' +
      '  <button class="li-close" type="button" data-li-close aria-label="닫기">×</button>' +
      '  <div class="li-head"><h3>' + esc(info.name) + '</h3><p>' + esc(info.sub) + '</p></div>' +
      '  <div class="li-facts">' + facts.join('') + '</div>' +
      (info.note ? '<p class="li-note">' + esc(info.note) + '</p>' : '') +
      (info.kind === 'sun' ? '<p class="li-sun-warn"><b>⚠️ 태양은 반드시 필터로만</b> — 맨눈 직시도 금지이고, 망원경·쌍안경·카메라로 필터 없이 보면 즉시 실명합니다. 태양 전용 필터(ISO 12312-2)를 끼운 장비로만 관측하고, 접안부 필터는 열로 깨질 수 있어 쓰지 않습니다. 사진은 NASA SDO·GSFC가 찍은 실제 태양입니다.</p>' : '') +
      '  <div class="li-gallery" id="liGallery"></div>' +
      '  <div class="li-actions">' +
      (info.objId ? '<button class="btn btn-primary btn-sm" type="button" data-li-obj="' + esc(info.objId) + '">도감에서 보기</button>' : '') +
      '    <button class="mini-btn" type="button" data-li-aim>🎯 라이브 뷰로 조준</button>' +
      '  </div>' +
      '</div>';
    box.hidden = false;
    document.body.classList.add('li-open');
    const gal = $('#liGallery');
    if (gal && window.SkyGallery) gal.appendChild(SkyGallery.create(info, { variant: 'sheet' }));
  }

  function closeLiveInfo() {
    const box = $('#liveInfo');
    if (!box || box.hidden) return;
    box.hidden = true;
    box.innerHTML = '';
    document.body.classList.remove('li-open');
    live.selected = null;
    liveDirty = true; kickLive();
  }

  function renderLivePhoto(i) {
    const img = $('#liImg'), count = $('#liCount'), title = $('#liTitle'),
      credit = $('#liCredit'), link = $('#liLink'), thumbs = $('#liThumbs'),
      shot = $('#liShot'), fb = $('#liFallback');
    if (!img || !li.items.length) return;
    i = ((i % li.items.length) + li.items.length) % li.items.length;
    li.idx = i;
    const it = li.items[i];
    shot.classList.remove('is-broken');
    fb.hidden = true;
    img.hidden = true;
    shot.classList.add('is-loading');
    const done = function () { shot.classList.remove('is-loading'); img.hidden = false; };
    img.onload = done;
    img.onerror = function () {
      shot.classList.remove('is-loading');
      shot.classList.add('is-broken');
      img.hidden = true;
      fb.hidden = false;
    };
    // SkyView는 계산에 수 초 걸릴 수 있어 12초 넘으면 성도 폴백
    if (li.timer) clearTimeout(li.timer);
    li.timer = setTimeout(function () {
      if (!img.complete || !img.naturalWidth) {
        shot.classList.remove('is-loading');
        shot.classList.add('is-broken');
        img.hidden = true;
        fb.hidden = false;
      }
    }, 12000);
    img.src = it.src;
    count.textContent = (i + 1) + '/' + li.items.length;
    title.textContent = it.title || li.info.name;
    credit.textContent = it.credit || '';
    if (it.link) { link.hidden = false; link.href = it.link; } else link.hidden = true;
    if (thumbs) {
      thumbs.innerHTML = li.items.map(function (t, k) {
        return '<button type="button" class="li-thumb' + (k === i ? ' is-active' : '') + '" data-li-i="' + k + '" aria-label="사진 ' + (k + 1) + '">' +
          '<img src="' + esc(t.thumb || t.src) + '" alt="" loading="lazy" decoding="async"></button>';
      }).join('');
    }
    const nx = li.items[(i + 1) % li.items.length];
    if (nx) { const pre = new Image(); pre.src = nx.src; }
    const prev = $('#liImg');
    if (prev) prev.setAttribute('data-i', String(i));
  }

  function wireLiveInfo() {
    const box = $('#liveInfo');
    if (!box || box.dataset.wired) return;
    box.dataset.wired = '1';
    box.addEventListener('click', function (ev) {
      const t = ev.target;
      if (t.closest('[data-li-close]')) { closeLiveInfo(); return; }
      if (t.closest('.li-prev')) { renderLivePhoto(li.idx - 1); return; }
      if (t.closest('.li-next')) { renderLivePhoto(li.idx + 1); return; }
      const th = t.closest('[data-li-i]');
      if (th) { renderLivePhoto(Number(th.getAttribute('data-li-i'))); return; }
      const objBtn = t.closest('[data-li-obj]');
      if (objBtn) { closeLiveInfo(); openObject(objBtn.getAttribute('data-li-obj')); return; }
      const aim = t.closest('[data-li-aim]');
      if (aim && li.info) { const i = li.info; closeLiveInfo(); aimAt(i.kind, i.key); }
    });
    // 손가락 스와이프
    const shot = function () { return $('#liShot'); };
    let sx = null, sy = null;
    box.addEventListener('pointerdown', function (ev) {
      const s = shot(); if (!s || !s.contains(ev.target)) return;
      sx = ev.clientX; sy = ev.clientY;
    });
    box.addEventListener('pointerup', function (ev) {
      if (sx == null) return;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) renderLivePhoto(li.idx + (dx < 0 ? 1 : -1));
    });
    document.addEventListener('keydown', function (ev) {
      if (box.hidden) return;
      if (ev.key === 'Escape') closeLiveInfo();
      else if (ev.key === 'ArrowRight') renderLivePhoto(li.idx + 1);
      else if (ev.key === 'ArrowLeft') renderLivePhoto(li.idx - 1);
    });
  }

  function setSensorUi(on, cls, txt) {
    const chip = $('#liveSensorChip');
    if (chip) {
      chip.textContent = txt;
      chip.classList.toggle('is-on', cls === 'on');
      chip.classList.toggle('is-error', cls === 'error');
    }
    const btn = $('#liveSensorBtn');
    if (btn) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? '🧭 센서 사용 중 (탭하면 끔)' : '🧭 센서로 하늘 비추기';
    }
    /* ⚙ 조작 밖의 빠른 트래킹 버튼 — 위 버튼과 같은 상태(aria-pressed·활성·오류)를 그대로 따릅니다.
       둘 다 리얼타임 센서 흐름(enableSensor·disableSensor)을 거치므로 iOS 권한 요청도 같습니다. */
    const q = $('#liveTrackBtnQ');
    if (q) {
      q.setAttribute('aria-pressed', on ? 'true' : 'false');
      q.classList.toggle('is-on', !!on);
      q.classList.toggle('is-error', cls === 'error');
      q.setAttribute('aria-label', on ? '실시간 트래킹 끄기' : '실시간 트래킹 켜기');
      q.title = on ? '실시간 트래킹을 끕니다' : '실시간 트래킹(센서)을 켭니다';
    }
  }

  function sensorFail(msg) {
    live.sensor = false;
    trackStop();
    window.removeEventListener('deviceorientation', onOrientation, true);
    window.removeEventListener('deviceorientationabsolute', onOrientation, true);
    window.removeEventListener('devicemotion', onMotion, true);
    setSensorUi(false, 'error', '센서 차단됨');
    const help = $('#liveHelp');
    if (help) {
      help.innerHTML = '<b>' + esc(msg) + '.</b> 센서는 보안 연결에서만 쓸 수 있고, 아이폰은 <b>권한 허용</b>이 필요합니다. ' +
        '지금은 <b>드래그·터치</b> 또는 <b>북/동/남/서/천정</b> 버튼과 방위·고도 슬라이더로 하늘을 둘러보세요.';
    }
    toast(msg + ' — 드래그·버튼으로 둘러볼 수 있습니다.');
  }

  /* 나침반 값 한 점을 중앙값 버퍼에 넣고, 90° 튐은 차단 */
  function pushCompass(heading, now) {
    if (!isFinite(heading)) return;
    if (track.compReset || track.realign || (track.realignT && now <= track.realignT)) {
      /* 창 복귀·센서 재개 — 그사이 폰을 90°/180° 돌렸다면 나침반이 '45° 넘는 튐'으로 보이지만
         실제 방향입니다. 이상치 차단·중앙값 버퍼를 비우고 이 값을 새 기준으로 받습니다.
         복귀 직후 정렬 창(realignT) 동안은 매 표본을 그대로 받아, 낡은 나침반이 한 번 더
         기준을 잡아 버리는 일이 없게 합니다. */
      track.comp = A.mod(heading, 360);
      track.compBuf = [A.mod(heading, 360)];
      track.spike = 0;
      track.compT = now;
      track.compReset = false;
      return;
    }
    const ref = track.comp != null && isFinite(track.comp) ? track.comp : heading;
    const dev = shortestDelta(ref, heading);
    if (track.comp != null && Math.abs(dev) > 45) {
      track.spike++;
      if (track.spike < 12) return;             // 이상치 — 약 0.2~0.4초 지속되는 튐은 버립니다
      track.comp = A.mod(heading, 360);         // 오래 지속되면 실제 회전/재보정으로 인정
      track.compBuf = [heading];
      track.spike = 0;
    } else {
      track.spike = 0;
      track.compBuf.push(heading);
      if (track.compBuf.length > 5) track.compBuf.shift();
      const med = circMedian(track.compBuf, ref);
      track.comp = track.comp == null ? med : A.mod(track.comp + shortestDelta(track.comp, med) * 0.35, 360);
    }
    track.compT = now;
  }

  function onOrientation(ev) {
    if (!live.sensor) return;
    if (document.hidden) return;                 // 백그라운드에서는 표본을 쌓지 않습니다(복귀 후 정렬이 기준)
    const now = sNow();
    if (now - track.lastOriEv < 6) return;       // ≤ 160Hz
    track.lastOriEv = now;
    live.gotEvent = true;
    const absolute = ev.type === 'deviceorientationabsolute' || ev.absolute === true;
    track.acc = (typeof ev.webkitCompassAccuracy === 'number') ? ev.webkitCompassAccuracy : null;

    let heading = null;
    if (typeof ev.webkitCompassHeading === 'number' && ev.webkitCompassHeading >= 0) {
      heading = ev.webkitCompassHeading;         // iOS: 자기/진북 기준 방위
    } else if (absolute && ev.alpha != null) {
      heading = 360 - ev.alpha;                  // Android: 절대 alpha
    } else if (ev.alpha != null && !track.motionSeen) {
      heading = 360 - ev.alpha;                  // 자이로가 없을 때만 상대 alpha 사용
    }
    if (heading != null) pushCompass(A.mod(heading, 360), now);

    const usingGyro = track.motionSeen && (now - track.lastMotEv < 1500);

    if (!track.ready) {
      if (ev.alpha == null || ev.beta == null) return;
      let q = qFromEuler(ev.alpha, ev.beta, ev.gamma == null ? 0 : ev.gamma);
      if (track.comp != null) q = qAlignNorth(q, track.comp + track.calAz);
      track.q = q;
      const d = camDir(q);
      track.az = live.az = d.az;
      track.alt = live.alt = clamp(d.alt, ALT_MIN, ALT_MAX);
      track.q = setCamAlt(track.q, track.alt);   // 자세도 같은 경계에서 시작
      track.ready = true;
      track.realign = false; track.realignUntil = 0; track.realignT = 0; track.compReset = false;
      setSensorUi(true, 'on', track.motionSeen ? '센서 연결됨' : '나침반 모드');
      trackStart();
      return;
    }

    const prevBeta = track.lastBeta;
    if (ev.beta != null) {
      track.lastBeta = ev.beta;
      // 고도 목표는 beta만으로 계산합니다(±180 뒤집힘에서도 연속).
      //   beta≈90이 지평선, 180이 천정, 0이 바로 아래입니다.
      //   rawAlt 는 '자르기 전' 기기 고도 — 경계 고정(trackCorrect)이 이 값을 씁니다.
      track.rawAlt = altFromTilt(ev.beta, ev.gamma);
      track.altTarget = clamp(track.rawAlt, ALT_MIN, ALT_MAX);
    }

    let eulerQ = null;
    if (ev.alpha != null && ev.beta != null) {
      eulerQ = qFromEuler(ev.alpha, ev.beta, ev.gamma == null ? 0 : ev.gamma);
      if (track.comp != null) eulerQ = qAlignNorth(eulerQ, track.comp + track.calAz);
      track.eulerQ = eulerQ;
      track.eulerT = now;
    }

    /* 창 복귀 정렬 — 숨겼다 돌아온 직후(또는 표본이 길게 끊긴 뒤)에는 이전 각도에서 이어
       적분하지 않고, 지금 폰이 실제로 향한 방향으로 track.q 를 한 번에 맞춥니다.
       방위·고도·롤을 모두 오일러 자세에서 가져오고, 화면 값(track.az·alt)도 그 자리에서 옮겨
       예전 각도에서 미끄러져 오는 동안이 없게 합니다(지평선 경계는 그대로 존중).
       정렬한 뒤 0.9초는 오일러·나침반 자세를 그대로 따라가(그동안은 나침반을 새 기준으로), 
       복귀 직후 백그라운드 큐에서 몰려온 낡은 표본이나 낡은 나침반 기준이 섞여도
       마지막 실제 자세로 수렴합니다. */
    if (track.realign && now > track.realignUntil) track.realign = false;
    if (eulerQ && (track.realign || (track.realignT && now <= track.realignT))) {
      const d = camDir(eulerQ);
      const alt = clamp(d.alt, ALT_MIN, ALT_MAX);
      track.q = setCamAlt(eulerQ, alt);
      // 화면 값도 같은 자리로 — 큰 차이는 한 번에(90°·180°), 작은 차이는 몇 프레임에 걸쳐
      //   (천정·천저 근처에서는 방위를 건드리지 않습니다 — 특이점이라 오일러의 방위가 믿을 수 없습니다)
      const daz = shortestDelta(track.az, d.az);
      const keepAz = polarGain(alt) <= 0.001;
      const thz = Math.max(5, azTol(alt));
      track.az = A.mod(track.az + (keepAz ? 0 : (Math.abs(daz) > thz ? daz : daz * 0.5)), 360);
      const dalt = alt - track.alt;
      track.alt = clamp(track.alt + (Math.abs(dalt) > 5 ? dalt : dalt * 0.5), ALT_MIN, ALT_MAX);
      live.az = track.az; live.alt = track.alt;
      if (track.realign) {
        track.realign = false;
        track.realignT = now + 900;
        track.pinned = false;
        track.rot = [0, 0, 0];
        track.gate = 0;
      }
    } else if (track.realignT && now > track.realignT) {
      track.realignT = 0;
    }

    /* 자이로가 오래(0.6초 넘게) 끊겼다 돌아오면 — 화면을 다시 열었거나 다른 앱을 다녀왔을 때 —
       그 사이 회전이 통째로 사라져 자세가 크게 어긋납니다. 그때만 오일러 자세로 한 번 다시
       맞춥니다(움직이는 중의 재조정이 아니라, 자이로가 없던 구간을 메우는 한 번의 정렬). */
    if (track.resync && eulerQ) {
      const cur = camDir(track.q), nxt = camDir(eulerQ);
      if (polarGain(nxt.alt) > 0.001 &&
          (Math.abs(shortestDelta(cur.az, nxt.az)) > 25 || Math.abs(nxt.alt - cur.alt) > 25)) {
        track.q = eulerQ;
        track.alt = clamp(nxt.alt, ALT_MIN, ALT_MAX);
        track.q = setCamAlt(track.q, track.alt);
      }
      track.resync = false;
    }

    // 자이로가 없거나 끊긴 경우: 오일러 자세를 목표로 부드럽게 따라갑니다(방위·고도 같은 비율)
    if (!usingGyro && eulerQ) {
      if (polarGain(camDir(eulerQ).alt) <= 0.001) {
        /* 천정·천저 근처는 오일러가 특이점(β≈0·180)이라 방위·롤이 믿을 수 없습니다.
           방위는 지금 보는 값을 지키고 고도만 따라갑니다. */
        track.q = setCamAlt(track.q, clamp(camDir(eulerQ).alt, ALT_MIN, ALT_MAX));
      } else {
        // beta가 ±180에서 뒤집히는 순간은 섞지 않고 새 자세로 바로 넘어갑니다
        const flip = prevBeta != null && Math.abs(shortestDelta(prevBeta, ev.beta)) > 90;
        track.q = flip ? eulerQ : Q.mix(track.q, eulerQ, 0.16);
      }
    }
    liveDirty = true;
    trackStart();
  }

  function onMotion(ev) {
    if (!live.sensor) return;
    if (document.hidden) return;                 // 백그라운드 표본은 적분하지 않습니다
    const rr = ev.rotationRate;
    const now = sNow();
    if (!rr) return;
    const gap = track.lastMotEv ? (now - track.lastMotEv) / 1000 : 0.016;
    if (gap > 0.25) {
      track.lastMotEv = now;
      if (gap > 0.6) trackRealign('gyro-gap');   // 그 사이 회전은 사라졌습니다 — 실제 자세로 다시 맞춤
      return;                              // 끊겼다가 돌아온 값은 버림
    }
    const dt = clamp(gap, 0.004, 0.08);
    track.lastMotEv = now;
    if (!track.motionSeen) {
      track.motionSeen = true;
      if (setSensorUi) setSensorUi(true, 'on', '센서 연결됨');
    }
    // 정렬 중(복귀 직후)의 자이로 델타는 버립니다 — 자세는 오일러 표본이 정합니다.
    if (track.realign || (track.realignT && now <= track.realignT)) return;
    const rate = function (v) { return clamp(v == null || isNaN(v) ? 0 : v, -600, 600); };
    /* 회전속도의 축 — 브라우저 구현 공통으로 '기기 축' 기준입니다.
         alpha = X축(화면 오른쪽),  beta = Y축(화면 위쪽),  gamma = Z축(화면 바깥)
       (W3C 옛 표기는 beta=X, gamma=Y, alpha=Z 였지만, 사파리·크롬 모두 alpha=X, beta=Y, gamma=Z 로 줍니다.)
       기기를 세로로 세워 든 상태에서
         X축 회전 = 위아래로 끄덕이기(pitch) → 고도,   Y축 회전 = 좌우 돌리기(yaw) → 방위,
         Z축 회전 = 화면 비트는 롤 — 따라서 alpha를 Z축에 넣으면 위아래 끄덕임이
         '화면 비틀기'로 들어가 고도가 거의 움직이지 않습니다. */
    track.rot[0] += rate(rr.alpha) * dt;    // X축 — 위아래 끄덕임 → 고도
    track.rot[1] += rate(rr.beta) * dt;     // Y축 — 좌우 돌리기 → 방위
    track.rot[2] += rate(rr.gamma) * dt;    // Z축 — 화면 비틀기(롤)
    // 움직임 판정 — 세 축 각속도의 크기(°/초). 이 값이 7°/s 를 넘으면 드리프트 보정을 끕니다.
    noteMotion(Math.hypot(rate(rr.alpha), rate(rr.beta), rate(rr.gamma)), now);
    liveDirty = true;
    trackStart();
  }

  function calibrateLive() {
    if (!live.sensor) { toast('먼저 🧭 센서로 하늘 비추기를 켜 주세요.'); return; }
    if (track.comp == null) { toast('나침반 값을 기다리는 중입니다. 1~2초 뒤 다시 눌러 주세요.'); return; }
    track.calAz = A.mod(track.az - track.comp, 360);
    toast('지금 보는 방향(' + Math.round(track.az) + '°)을 기준으로 맞췄습니다.');
  }

  function enableSensor() {
    inertCancel();            // 실시간 트래킹이 켜지면 관성은 즉시 양보합니다
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) { sensorFail('이 기기에서는 방향 센서를 쓸 수 없습니다'); return; }
    const DME = window.DeviceMotionEvent;
    const jobs = [];
    if (typeof DOE.requestPermission === 'function') {
      jobs.push(Promise.resolve().then(function () { return DOE.requestPermission(); }));
    }
    if (DME && typeof DME.requestPermission === 'function') {
      jobs.push(Promise.resolve().then(function () { return DME.requestPermission(); }).catch(function () { return 'granted'; }));
    }
    const proceed = function () {
      live.sensor = true;
      live.gotEvent = false;
      trackReset();
      track.az = live.az;
      track.alt = live.alt;
      window.addEventListener('deviceorientation', onOrientation, true);
      window.addEventListener('deviceorientationabsolute', onOrientation, true);
      window.addEventListener('devicemotion', onMotion, true);
      setSensorUi(true, 'on', '센서 연결 중…');
      if (live.raf) { cancelAnimationFrame(live.raf); live.raf = null; }
      trackStart();
      setTimeout(function () {
        if (!live.sensor) return;
        if (!live.gotEvent) { sensorFail('센서 값을 받지 못했습니다. 보안 연결과 권한을 확인해 주세요'); return; }
        if (!track.motionSeen) setSensorUi(true, 'on', '나침반 모드');
      }, 2400);
    };
    if (jobs.length) {
      Promise.all(jobs).then(function (res) {
        if (res[0] === 'granted') proceed();
        else sensorFail('센서 권한을 허용하지 않았습니다');
      }).catch(function () { sensorFail('권한을 묻는 창이 차단되었습니다'); });
    } else {
      proceed();
    }
  }

  function disableSensor(silent) {
    if (!live.sensor) return;
    live.sensor = false;
    trackStop();
    window.removeEventListener('deviceorientation', onOrientation, true);
    window.removeEventListener('deviceorientationabsolute', onOrientation, true);
    window.removeEventListener('devicemotion', onMotion, true);
    setSensorUi(false, 'off', '센서 꺼짐');
    if (!silent) toast('센서를 껐습니다. 드래그·버튼으로 둘러보세요.');
    kickLive();
  }

  // 화면 구조 개편·테스트에서 쓰는 공개 API
  window.LiveSky = {
    state: function () {
      return {
        az: live.az, alt: live.alt, fov: live.fov, sensor: live.sensor, gyro: track.motionSeen,
        compass: track.comp, cal: track.calAz,
        moving: sNow() < track.movingUntil, gate: track.gate, angVel: track.angVel
      };
    },
    pause: function () { inertCancel(); if (track.raf) trackStop(); if (live.raf) { cancelAnimationFrame(live.raf); live.raf = null; } liveDirty = true; },
    resume: function () { liveResize(); liveDirty = true; kickLive(); },
    /* 창 복귀 정렬을 직접 부릅니다(검증·외부 재개용). 실기기에서는 visibilitychange·pageshow·focus 가 부릅니다. */
    realign: function (reason) { trackRealign(reason || 'manual'); },
    calibrate: calibrateLive,
    hits: function () { return live.hits.map(function (h) { return { x: h.x, y: h.y, kind: h.kind, key: h.key, name: h.name, mag: h.mag }; }); },
    info: function (kind, key) { openLiveInfo({ kind: kind, key: key }); },
    aim: function (kind, key) { aimAt(kind, key); },
    /* -- 검증용 — 조준 유도의 지금 상태(목표·남은 각도·화면 위치·안전 영역).
       aimTick() 은 rAF 없이도 한 번 계산·배치하고 그 값을 돌려줍니다. */
    aimState: function () {
      return {
        on: aim.on, name: aim.name, kind: aim.kind, key: aim.key,
        az: aim.az, alt: aim.alt, angDist: aim.angDist, inView: aim.inView,
        arrived: aim.arrived, below: aim.below, theta: aim.theta,
        sx: aim.sx, sy: aim.sy, insets: aim.insets
      };
    },
    aimTick: function () { aim.fitAt = 0; return aimUpdate(); },
    aimClear: function (silent) { aimClear(silent === undefined ? true : silent); },
    /* 검증용 — 센서 없이 시선을 옮깁니다(드래그와 같은 경로: targetAz/Alt 도 함께). */
    setView: function (az, alt, fov) {
      if (az != null) { live.az = live.targetAz = A.mod(az, 360); }
      if (alt != null) { live.alt = live.targetAlt = clamp(alt, ALT_MIN, ALT_MAX); }
      if (fov != null) live.fov = clamp(fov, LIVE_FOV_MIN, LIVE_FOV_MAX);
      liveDirty = true;
      if (live.raf) { cancelAnimationFrame(live.raf); live.raf = null; }
      liveDraw(); syncLiveInputs();
      return aimUpdate();
    },
    sensorOn: function () { return live.sensor; },
    /* -- 검증용 — 관성 드래그 회전의 지금 상태(진행 중·방위/고도 속도 도/ms·경과 ms). */
    inertia: function () {
      return { on: inertia.on, vAz: inertia.vAz, vAlt: inertia.vAlt, t: inertia.t, moved: inertia.moved };
    },
    cancelInertia: function () { return inertCancel(); },
    grid: function () { return { on: live.grid, a: live.gridA, last: live.gridLast }; },
    fov: function () { return live.fov; },
    /* -- 검증용 — 화면을 그릴 때 쓰는 기준틀(fwd·right·up)을 그대로 돌려줍니다.
       천정·천저를 지날 때 이 기준틀이 끊김 없이 이어지는지 수치로 확인합니다. */
    basis: function () {
      const b = camBasis(live.az, clamp(live.alt, ALT_MIN, ALT_MAX));
      return { fwd: b.fwd.slice(), right: b.right.slice(), up: b.up.slice(), az: live.az, alt: live.alt };
    },
    enableSensor: enableSensor,
    disableSensor: disableSensor,
    /* -- 검증용 — 합성 센서 표본을 '실제' 처리 경로(onOrientation·onMotion)에 넣고
       그 자리에서 한 프레임(dt초)을 진행합니다. 도구 검사가 이 훅으로 리얼 타이머 없이
       '지평선 아래로 내렸다 올리기'·'움직이는 중 나침반 잡음' 시퀀스를 같은 순서로 재현합니다.
       (가상 시계와 두 스로틀만 되감습니다. 그 외에는 실제 코드 경로 그대로) */
    feed: function (s, dt) {
      const step = dt || 0.016;
      // 가상 시계 — 한 걸음(step)씩만 흐르게 해, 리얼 타이머 없이 같은 경로를 씁니다.
      if (track.feedT == null) track.feedT = performance.now();
      track.feedT += step * 1000;
      const vnow = track.feedT;
      track.clock = vnow;
      try {
        if (s.beta != null) {
          track.lastOriEv = 0;                      // 6ms 스로틀 통과
          onOrientation({
            type: 'deviceorientation', absolute: true,
            alpha: s.alpha == null ? 0 : s.alpha,
            beta: s.beta, gamma: s.gamma == null ? 0 : s.gamma,
            webkitCompassHeading: s.heading, webkitCompassAccuracy: s.acc == null ? 6 : s.acc
          });
        }
        if (s.rate) {
          if (track.lastMotEv) track.lastMotEv = vnow - step * 1000;
          onMotion({ rotationRate: s.rate });
        }
        trackCorrect(step);
        if (trackApply(step)) liveDraw();
        const cam = track.q ? camDir(track.q) : null;
        return {
          alt: track.alt, az: track.az, cam: cam ? { az: cam.az, alt: cam.alt } : null,
          raw: track.rawAlt, target: track.altTarget,
          gate: track.gate, angVel: track.angVel, moving: vnow < track.movingUntil,
          rot: track.rot.slice(), pinned: track.pinned,
          eulerAlt: track.eulerQ ? camDir(track.eulerQ).alt : null
        };
      } finally {
        track.clock = null;
      }
    },
  };

  function pickStartView() {
    const c = state.last || computeNight();
    const cand = [];
    if (c.moonHor.alt > 12) cand.push({ az: c.moonHor.az, alt: c.moonHor.alt, w: 30 });
    c.planets.forEach(function (pl) {
      if (pl.hor.alt > 12 && pl.mag <= 0.5) cand.push({ az: pl.hor.az, alt: pl.hor.alt, w: 20 - pl.mag * 4 });
    });
    ['시리우스', '베텔게우스', '베가', '아르크투루스', '카펠라', '안타레스'].forEach(function (nm) {
      const h = A.equatorialToHorizontal(D.stars.find(function (x) { return x[0] === nm; })[1],
        D.stars.find(function (x) { return x[0] === nm; })[2], state.site.lat, state.site.lon, c.jd);
      if (h.alt > 22) cand.push({ az: h.az, alt: h.alt, w: 8 });
    });
    cand.sort(function (a, b) { return b.w - a.w; });
    const pick = cand[0];
    if (pick) {
      live.az = live.targetAz = pick.az;
      live.alt = live.targetAlt = clamp(pick.alt, 15, 70);
    } else {
      live.az = live.targetAz = 180;
      live.alt = live.targetAlt = 32;
    }
    live.fov = 70;
  }

  /* ======================================================================
     라이브 하늘 — 원하는 날짜·시각으로 바로 가는 시간 카드
     · state.simJd(실제 관측 시각)를 바꾸고, 상단 카드·전천 지도·행성표·라이브
       캔버스가 모두 같은 계산 경로(selectedJD)로 함께 갱신됩니다.
     · 0~11시는 '그 밤의 다음 날 새벽'으로 계산합니다 — 일몰→일출 한 밤의
       흐름과 같게 만들어, 새벽 2시를 골라도 바로 그 밤 새벽 하늘이 나옵니다.
     ====================================================================== */
  const ltc = { open: false };
  function p2(n) { return String(n).padStart(2, '0'); }
  function clockMinutes(jd) {
    const s = A.fmtClock(jd);
    if (!s || s === '—') return 0;
    return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  }
  function ltcDateFor(hour, base) {
    return hour < 12 ? addDays(base, 1) : base;
  }
  function applyLiveTime(minutes, opts) {
    const mm = clamp(Math.round(minutes / 5) * 5, 0, 1435);
    const h = Math.floor(mm / 60), m = mm % 60;
    const dateStr = ltcDateFor(h, state.dateStr);
    const jd = A.jdFromDate(A.localToDate(dateStr, p2(h) + ':' + p2(m)));
    const w = nightWindow();
    stopPlay();
    state.simJd = jd;
    state.tmFrac = clamp((jd - w.start) / (w.end - w.start), 0, 1);
    renderAll(opts && opts.fast ? { fast: true } : undefined);
  }
  function paintLtcRange() {
    const el = $('#ltcRange');
    if (!el) return;
    el.style.setProperty('--ltc-fill', ((Number(el.value) / 1435) * 100).toFixed(1) + '%');
  }
  function ltcClockLabel(mm) {
    const h = Math.floor(mm / 60), m = mm % 60;
    return p2(h) + ':' + p2(m);
  }
  function syncLiveTimeCard() {
    const card = $('#liveTimeCard');
    const c = state.last || (card ? computeNight() : null);
    if (!c) return;
    const jd = c.jd;
    const mins = clockMinutes(jd);
    const sim = state.simJd != null;
    const btn = $('#liveTimeBtn');
    if (btn) {
      const lbl = '🕒 ' + A.fmtClock(jd);
      if (btn.textContent !== lbl) btn.textContent = lbl;
      btn.classList.toggle('is-on', !!ltc.open);
      btn.setAttribute('aria-expanded', String(!!ltc.open));
      btn.title = sim ? '하늘 시각 바꾸기 — ' + A.fmtClock(jd) + ' 기준' : '하늘 시각 바꾸기 (지금)';
    }
    if (!card) return;
    const now = $('#ltcNow');
    if (now) {
      const txt = sim
        ? A.fmtDateKorean(jd) + ' ' + A.fmtClock(jd) + ' · 시뮬레이션'
        : '지금 · ' + A.fmtClock(jd);
      if (now.textContent !== txt) now.textContent = txt;
    }
    const range = $('#ltcRange');
    if (range && document.activeElement !== range) { range.value = String(mins); paintLtcRange(); }
    if (ltc.dial && document.activeElement !== ltc.dial.el) ltc.dial.set(mins);
    const dateIn = $('#ltcDate');
    // 날짜 칸은 '실제 시뮬레이션 날짜' — 자정을 지나면 다음 날로 바뀝니다.
    const simDate = ltcDateFor(Math.floor(mins / 60), state.dateStr);
    if (dateIn && document.activeElement !== dateIn) dateIn.value = simDate;
    const timeIn = $('#ltcTime');
    if (timeIn && document.activeElement !== timeIn) timeIn.value = A.fmtClock(jd);
    $$('#ltcPresets [data-ltc]').forEach(function (b) {
      const v = b.getAttribute('data-ltc');
      let on = false;
      if (v === 'now') on = !sim && state.dateStr === todayKST() && !state.timeStr;
      else if (v === 'sunset') on = Math.abs(mins - clockMinutes(nightWindow().start + 0.25 / 24)) <= 5;
      else on = Math.abs(mins - Number(v) * 60) <= 5;
      b.classList.toggle('is-active', on);
    });
  }
  function setLiveTimeCard(open) {
    const card = $('#liveTimeCard');
    if (!card) return;
    ltc.open = !!open;
    card.hidden = !ltc.open;
    if (ltc.open) syncLiveTimeCard();
    const btn = $('#liveTimeBtn');
    if (btn) {
      btn.setAttribute('aria-expanded', String(ltc.open));
      btn.classList.toggle('is-on', ltc.open);
    }
  }
  function initLiveTime() {
    const card = $('#liveTimeCard');
    if (!card) return;
    const btn = $('#liveTimeBtn');
    if (btn) btn.addEventListener('click', function () { setLiveTimeCard(card.hidden); });
    const close = $('#ltcClose');
    if (close) close.addEventListener('click', function () { setLiveTimeCard(false); });
    const range = $('#ltcRange');
    if (range) {
      range.addEventListener('input', function () { applyLiveTime(Number(this.value), { fast: true }); paintLtcRange(); });
      range.addEventListener('change', function () { applyLiveTime(Number(this.value)); });
    }
    const dialHost = $('#ltcDial');
    if (dialHost && window.Dial) {
      const cur = state.last || computeNight();
      ltc.dial = window.Dial.create(dialHost, {
        min: 0, max: 1435, step: 5, size: 178,
        value: clockMinutes(cur.jd),
        label: '하늘 시각 (0시~24시)',
        fmt: ltcClockLabel,
        sub: '한 바퀴 = 24시간',
        labels: [{ v: 0, text: '0시' }, { v: 360, text: '6시' }, { v: 720, text: '12시' }, { v: 1080, text: '18시' }],
        onChange: function (v) { applyLiveTime(v, { fast: true }); },
        onCommit: function (v) { applyLiveTime(v); }
      });
    }
    const presets = $('#ltcPresets');
    if (presets) presets.addEventListener('click', function (ev) {
      const b = ev.target.closest('[data-ltc]');
      if (!b) return;
      const v = b.getAttribute('data-ltc');
      if (v === 'now') {
        setViewDate(todayKST(), '');
        toast('지금 시각 하늘로 돌아왔습니다.');
        return;
      }
      if (v === 'sunset') {
        const w = nightWindow();
        applyLiveTime(clockMinutes(w.start + 0.25 / 24));
        toast('그 밤의 일몰 시각으로 옮겼습니다.');
        return;
      }
      applyLiveTime(Number(v) * 60);
      toast(v + '시 하늘로 옮겼습니다.');
    });
    const timeIn = $('#ltcTime');
    if (timeIn) timeIn.addEventListener('change', function () {
      const val = this.value;
      if (!val) return;
      const p = val.split(':').map(Number);
      applyLiveTime((p[0] || 0) * 60 + (p[1] || 0));
    });
    const dateIn = $('#ltcDate');
    if (dateIn) dateIn.addEventListener('change', function () {
      const val = this.value;
      if (!val) return;
      const keep = clockMinutes((state.last || computeNight()).jd);
      // 고른 날짜는 '실제 시뮬레이션 날짜'입니다. 0~11시는 그날 새벽 = 앞선 밤에서 시작합니다.
      state.dateStr = Math.floor(keep / 60) < 12 ? addDays(val, -1) : val;
      state.timeStr = '';
      state.simJd = null;
      stopPlay();
      const di = $('#dateInput');
      if (di) di.value = state.dateStr;
      syncTimeField(true);
      applyLiveTime(keep);   // 같은 시각을 새 날짜의 밤으로
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ltc.open) setLiveTimeCard(false);
    });
    syncLiveTimeCard();
  }

  /* ======================================================================
     격자 표시·진하기 — ⚙ 조작의 「🌐 격자」 버튼 + 「격자 진하기」 슬라이더
     · 0%면 완전히 가리고 100%면 아주 선명합니다. 기기(localStorage)에 저장됩니다.
     ====================================================================== */
  function applyLiveGrid(pref) {
    const p = pref || { on: live.grid, a: live.gridA };
    const a = clamp(typeof p.a === 'number' && isFinite(p.a) ? p.a : 0.55, 0, 1);
    live.gridA = a;
    live.grid = p.on !== false && a > 0.001;
    if (a > 0.001) live.gridLast = a;
    const btn = $('#liveGridBtn'), rng = $('#liveGrid'), val = $('#liveGridVal');
    if (rng && document.activeElement !== rng) rng.value = String(Math.round(a * 100));
    if (val) val.textContent = Math.round(a * 100) + '%';
    if (btn) {
      btn.textContent = live.grid ? '🌐 격자 숨기기' : '🌐 격자 보이기';
      btn.setAttribute('aria-pressed', String(live.grid));
      if (btn.parentNode && btn.parentNode.classList) btn.parentNode.classList.toggle('is-off', !live.grid);
    }
  }
  function saveLiveGrid() {
    store.set('liveGrid', { on: live.grid, a: live.gridA, last: live.gridLast });
  }

  function initLive() {
    if (!$('#liveStage')) return;
    wireLiveInfo();
    initLiveTime();
    (function initLiveGrid() {
      const pref = store.get('liveGrid', { on: true, a: 0.55, last: 0.55 });
      live.gridLast = clamp(Number(pref && pref.last) || 0.55, 0.05, 1);
      applyLiveGrid(pref);
      const btn = $('#liveGridBtn'), rng = $('#liveGrid');
      if (btn) btn.addEventListener('click', function () {
        if (live.grid) {
          if (live.gridA > 0.001) live.gridLast = live.gridA;
          live.grid = false; live.gridA = 0;
          toast('격자를 가렸습니다 — 「🌐 격자 보이기」로 다시 켤 수 있어요.');
        } else {
          live.gridA = clamp(live.gridLast || 0.55, 0.05, 1);
          live.grid = true;
        }
        applyLiveGrid({ on: live.grid, a: live.gridA });
        saveLiveGrid();
        liveDirty = true; kickLive();
      });
      if (rng) {
        rng.addEventListener('input', function () {
          const a = clamp(Number(rng.value) / 100, 0, 1);
          live.gridA = a;
          live.grid = a > 0.001;
          applyLiveGrid({ on: live.grid, a: a });
          liveDirty = true; kickLive();
        });
        rng.addEventListener('change', saveLiveGrid);
      }
    })();
    liveResize();
    pickStartView();
    window.addEventListener('resize', function () { liveResize(); });
    if (window.ResizeObserver) {
      try { new ResizeObserver(function () { liveResize(); }).observe($('#liveStage')); } catch (e) { }
    }
    setSensorUi(false, 'off', '센서 꺼짐');
    syncLiveInputs();
    // 🎯 조준 유도 해제 — 이 버튼 하나로만 목표가 풀립니다(트래킹·드래그·시각 변경에는 유지).
    const guideX = $('#liveGuideX');
    if (guideX) guideX.addEventListener('click', function (ev) {
      ev.stopPropagation();
      aimClear();
    });
    liveDirty = true;
    kickLive();

    const stage = $('#liveStage');
    let drag = null;
    /* 두 손가락 핀치 — 손가락 사이 거리로 시야(화각)를 바꿉니다.
       · 벌리면 확대(시야 좁힘), 오므리면 축소(시야 넓힘).
       · 핀치 중에는 한 손가락 드래그 회전을 멈추고, 끝나도 화각(LIVE_FOV_MIN~MAX)은 그대로 유지합니다.
       · 핀치가 끝난 터치를 '탭'으로 보지 않으므로 엉뚱한 천체 정보가 열리지 않습니다. */
    const ptrs = new Map();
    const pinch = { on: false, d0: 0, fov0: 0 };
    function pinchDist() {
      const a = Array.from(ptrs.values());
      return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
    }
    stage.addEventListener('pointerdown', function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      inertCancel();          // 새로 잡는 순간 진행 중인 관성을 멈춥니다(스텔라리움과 같은 '손이 이김')
      // 확대/축소·HUD 등 스테이지 위 버튼은 드래그 캡처에서 제외 (클릭이 죽지 않게)
      if (ev.target && ev.target.closest && ev.target.closest('button, a, input, .live-zoom, .live-hud-top, .live-center-card, .live-time-card, .live-guide')) return;
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      try { stage.setPointerCapture(ev.pointerId); } catch (e) { }
      if (ptrs.size === 2) {
        drag = null;
        stage.classList.remove('is-dragging');
        stage.classList.add('is-pinching');
        pinch.on = true;
        pinch.d0 = Math.max(12, pinchDist());
        pinch.fov0 = live.fov;
        return;
      }
      if (ptrs.size > 2) return;
      drag = {
        x: ev.clientX, y: ev.clientY, az: live.az, alt: live.alt, moved: false, t: performance.now(),
        vAz: 0, vAlt: 0,
        // 관성용 속도 표본 — 시작 위치도 넣어 두어 아주 짧은 플릭도 속도를 잡습니다
        samples: [{ t: performance.now(), az: live.az, alt: live.alt }]
      };
      stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', function (ev) {
      if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinch.on && ptrs.size >= 2) {
        const d = Math.max(12, pinchDist());
        const fov = clamp(pinch.fov0 * (pinch.d0 / d), LIVE_FOV_MIN, LIVE_FOV_MAX);
        if (Math.abs(fov - live.fov) > 0.01) {
          live.fov = fov;
          liveDirty = true;
          kickLive();
        }
        return;
      }
      if (!drag) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 8) {
        drag.moved = true;
        if (live.sensor) { disableSensor(true); toast('터치로 둘러보는 중 — 🧭 센서를 다시 켜면 하늘을 따라갑니다.'); }
      }
      if (!drag.moved) return;
      const degPerPx = live.fov / Math.max(220, live.h);
      const az = A.mod(drag.az - dx * degPerPx, 360);
      const alt = clamp(drag.alt + dy * degPerPx, ALT_MIN, ALT_MAX);
      live.az = az; live.targetAz = az;
      live.alt = alt; live.targetAlt = alt;
      state.follow = null;
      liveDirty = true;
      kickLive();
      /* 관성용 속도 — 최근 120ms 표본만 남기고 그 변화량으로 속도를 잽니다.
         손을 멈추면 새 표본이 같은 자리에 쌓여 속도가 자연히 0 으로 줄어듭니다. */
      const tnow = performance.now();
      drag.samples.push({ t: tnow, az: az, alt: alt });
      while (drag.samples.length > 2 && tnow - drag.samples[0].t > INERT.win) drag.samples.shift();
      const v = dragVel(drag);
      drag.vAz += (v.az - drag.vAz) * 0.6;
      drag.vAlt += (v.alt - drag.vAlt) * 0.6;
    });
    const end = function (ev) {
      if (ev && ev.pointerId != null) ptrs.delete(ev.pointerId);
      if (pinch.on) {
        if (ptrs.size < 2) { pinch.on = false; stage.classList.remove('is-pinching'); }
        drag = null;
        stage.classList.remove('is-dragging');
        syncLiveInputs();      // 핀치로 바뀐 시야(화각)를 슬라이더·값에 바로 반영
        return;                // 핀치 뒤에는 탭으로 보지 않습니다
      }
      if (!drag) return;
      const moved = drag.moved;
      /* 손을 뗀 순간의 속도 — 방금 표본(0.7)과 이동 평균(0.3)을 섞어 손떨림을 덜어냅니다.
         멈춘 채 뗐거나 단순 탭이면 dragVel 이 0 을 주어 관성이 생기지 않습니다. */
      let vAz = 0, vAlt = 0;
      if (moved) {
        const v = dragVel(drag);
        if (!v.stale) {
          vAz = v.az * 0.7 + drag.vAz * 0.3;
          vAlt = v.alt * 0.7 + drag.vAlt * 0.3;
        }
      }
      drag = null;
      stage.classList.remove('is-dragging');
      if (!moved) { liveHandleClick(ev); return; }
      inertStart(vAz, vAlt);
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', function (ev) {
      if (ev && ev.pointerId != null) ptrs.delete(ev.pointerId);
      drag = null;
      if (ptrs.size < 2) { pinch.on = false; stage.classList.remove('is-pinching'); }
      stage.classList.remove('is-dragging');
    });
    stage.addEventListener('pointerleave', function (ev) {
      if (ev && ev.pointerId != null) ptrs.delete(ev.pointerId);
      if (pinch.on && ptrs.size < 2) { pinch.on = false; stage.classList.remove('is-pinching'); }
      if (drag) { drag = null; stage.classList.remove('is-dragging'); }
    });

    $$('.pad-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        inertCancel();
        disableSensor(true);
        state.follow = null;
        live.targetAz = Number(b.getAttribute('data-az'));
        live.targetAlt = Number(b.getAttribute('data-alt'));
        liveDirty = true;
        kickLive();
      });
    });
    const bindRange = function (sel, fn) {
      const el = $(sel);
      if (!el) return;
      el.addEventListener('input', function () {
        inertCancel();
        disableSensor(true);
        state.follow = null;
        fn(Number(el.value));
        liveDirty = true;
        kickLive();
      });
    };
    bindRange('#liveAz', function (v) { live.az = v; live.targetAz = v; });
    bindRange('#liveAlt', function (v) { live.alt = v; live.targetAlt = v; });
    bindRange('#liveFov', function (v) { live.fov = v; });
    $('#liveZoomIn').addEventListener('click', function () {
      inertCancel();
      live.fov = clamp(live.fov - 10, LIVE_FOV_MIN, LIVE_FOV_MAX);
      liveDirty = true; kickLive();
    });
    $('#liveZoomOut').addEventListener('click', function () {
      inertCancel();
      live.fov = clamp(live.fov + 10, LIVE_FOV_MIN, LIVE_FOV_MAX);
      liveDirty = true; kickLive();
    });
    $('#liveLabelsBtn').addEventListener('click', function () {
      live.labels = !live.labels;
      this.setAttribute('aria-pressed', String(live.labels));
      liveDirty = true; kickLive();
    });
    $('#liveDeepBtn').addEventListener('click', function () {
      live.deep = !live.deep;
      this.setAttribute('aria-pressed', String(live.deep));
      liveDirty = true; kickLive();
    });
    $('#liveResetBtn').addEventListener('click', function () {
      disableSensor(true);
      state.follow = null;
      live.targetAz = 180; live.targetAlt = 32; live.fov = 65;
      liveDirty = true; kickLive();
      toast('시선을 남쪽 32°, 시야 65°로 되돌렸습니다.');
    });
    const calBtn = $('#liveCalBtn');
    if (calBtn) calBtn.addEventListener('click', calibrateLive);
    $$('.sens-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        track.sens = Number(b.getAttribute('data-sens')) || 1;
        $$('.sens-btn').forEach(function (x) { x.classList.toggle('is-on', x === b); });
        toast(b.textContent + ' 모드 — ' + (track.sens < 1 ? '빠르게 따라옵니다.' : track.sens > 1.2 ? '나침반 보정을 천천히 합니다.' : '기본 추적입니다.'));
      });
    });
    /* 「🌙 밤 22시」 빠른 버튼은 뺐습니다 — 원하는 시각은 🕒 시각 카드(지금·일몰·20시·22시·자정·새벽 2시)에서
       고르고, 지금 시각으로 돌아오는 길도 그 카드의 「지금」이 맡습니다. */
    $('#liveSensorBtn').addEventListener('click', function () {
      if (live.sensor) disableSensor(false);
      else enableSensor();
    });
    // ⚙ 조작 밖 빠른 트래킹 버튼 — 같은 토글(켜짐/꺼짐)을 그대로 부릅니다.
    const trackQ = $('#liveTrackBtnQ');
    if (trackQ) trackQ.addEventListener('click', function () {
      if (live.sensor) disableSensor(false);
      else enableSensor();
    });
    const iv = $('#liveInView');
    if (iv) {
      iv.addEventListener('click', function (ev) {
        const el = ev.target.closest ? ev.target.closest('[data-iv]') : null;
        if (!el) return;
        const v = el.getAttribute('data-iv').split(':');
        aimAt(v[0], v.slice(1).join(':'));
      });
    }
    const insp = $('#skyInspector');
    if (insp) {
      insp.addEventListener('click', function (ev) {
        const t = ev.target.closest ? ev.target.closest('button') : null;
        if (!t) return;
        if (t.getAttribute('data-si-close')) {
          insp.innerHTML = '';
          inspectorRef = null;
          return;
        }
        if (t.getAttribute('data-si-aim') && inspectorRef) {
          aimAt(inspectorRef.kind, inspectorRef.key);
          return;
        }
        if (t.getAttribute('data-si-con')) {
          openConstellation(t.getAttribute('data-si-con'));
          return;
        }
        const obj = t.getAttribute('data-si-obj');
        if (obj) openObject(obj);
      });
    }
  }

  function renderLiveSync(c) {
    if (state.follow) {
      const info = skyInfo(state.follow.kind, state.follow.key, c.jd);
      if (info) {
        live.targetAz = info.az;
        live.targetAlt = clamp(info.alt, -10, 88);
      }
    }
    liveDirty = true;
    if (!live.raf) kickLive();
  }

  /* ======================================================================
     ③ 밤하늘 타임랩스 (일몰 → 일출)
     ====================================================================== */
  let playRaf = null, playLast = 0, playRenderTs = 0;
  state.playing = false;

  function nightWindow() {
    const c = state.last || computeNight();
    const n = c.night;
    const start = (n.sunset != null ? n.sunset : c.jd) - 0.25 / 24;
    const end = (n.sunrise != null ? n.sunrise : start + 0.5) + 0.25 / 24;
    return { start: start, end: end > start ? end : start + 0.5 };
  }

  function updateTmBar() {
    const w = nightWindow();
    const baseJd = state.simJd != null ? state.simJd : (state.last ? state.last.jd : null);
    const sim = state.simJd != null;
    const clockTxt = (baseJd != null ? A.fmtClock(baseJd) : '--:--') + (sim ? ' · 시뮬레이션' : '');
    const frac = sim ? clamp((state.simJd - w.start) / (w.end - w.start), 0, 1) : 0;
    tmDocks().forEach(function (dock) {
      const clock = dock.querySelector('[data-tm-clock]');
      if (clock) clock.textContent = clockTxt;
      const sLbl = dock.querySelector('[data-tm-start]'), eLbl = dock.querySelector('[data-tm-end]');
      if (sLbl) sLbl.textContent = '일몰 ' + A.fmtClock(w.start);
      if (eLbl) eLbl.textContent = '일출 ' + A.fmtClock(w.end);
      const slider = dock.querySelector('[data-tm-slider]');
      if (slider && document.activeElement !== slider) {
        slider.value = String(Math.round(frac * 1000));
        paintSlider(slider);
      }
      if (dock._timeDial && document.activeElement !== dock._timeDial.el) {
        dock._timeDial.set(Math.round(frac * 1000));
      }
      paintDial(dock);
    });
    // 관측 시각 입력칸도 실제로 쓰이는 시각을 그대로 보여 준다(시뮬레이션 중이면 그 시각).
    syncTimeField();
  }

  /* ------------------------------------------------------------ 속도 다이얼 */
  const TM_SPEEDS = [0.5, 1, 2, 3, 5, 8, 10, 15, 20, 30];
  const TM_MIN = 0.5, TM_MAX = 30;

  function tmDocks() { return $$('[data-tm]'); }
  function tmSpeedText(v) { return (v < 1 ? '0.5' : String(Math.round(v))) + '분/초'; }
  function tmAngle(v) {
    const t = Math.log(clamp(v, TM_MIN, TM_MAX) / TM_MIN) / Math.log(TM_MAX / TM_MIN);
    return -135 + 270 * clamp(t, 0, 1);
  }
  function tmSpeedFromAngle(a) {
    const t = (clamp(a, -135, 135) + 135) / 270;
    const v = TM_MIN * Math.pow(TM_MAX / TM_MIN, t);
    return v < 2 ? Math.round(v * 4) / 4 : Math.round(v);
  }
  function paintSlider(el) {
    const pct = (Number(el.value) / 1000) * 100;
    el.style.setProperty('--tm-fill', pct.toFixed(1) + '%');
  }
  function paintDial(dock) {
    const dial = dock.querySelector('[data-tm-dial]');
    if (!dial) return;
    const ang = tmAngle(state.tmSpeed);
    const needle = dial.querySelector('[data-tm-needle]');
    if (needle) needle.setAttribute('transform', 'rotate(' + ang.toFixed(1) + ' 27 25)');
    const arc = dial.querySelector('.tm-dial-arc');
    if (arc) {
      const circ = 2 * Math.PI * 16, span = (ang + 135) / 270 * (circ * 0.75);
      arc.setAttribute('stroke-dasharray', (span < 0.5 ? 0.5 : span).toFixed(1) + ' ' + (circ + 2).toFixed(1));
    }
    const val = dial.querySelector('[data-tm-speed]');
    if (val) val.textContent = tmSpeedText(state.tmSpeed);
    dial.setAttribute('aria-valuenow', String(state.tmSpeed));
    dial.setAttribute('aria-valuetext', tmSpeedText(state.tmSpeed));
  }
  function setTmSpeed(v) {
    state.tmSpeed = clamp(Math.round(v * 10) / 10, TM_MIN, TM_MAX);
    tmDocks().forEach(paintDial);
  }

  function bindDial(dial) {
    let dragging = false;
    function apply(ev) {
      const box = dial.querySelector('svg').getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height * (25 / 42);
      const dx = ev.clientX - cx, dy = ev.clientY - cy;
      if (Math.hypot(dx, dy) < 5) return;
      let ang = Math.atan2(dx, -dy) * 180 / Math.PI;   // 0° = 위, 시계방향 +
      if (ang > 135 || ang < -135) ang = dx >= 0 ? 135 : -135;
      setTmSpeed(tmSpeedFromAngle(ang));
    }
    dial.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      dragging = true;
      try { dial.setPointerCapture(ev.pointerId); } catch (e) {}
      apply(ev);
    });
    dial.addEventListener('pointermove', function (ev) { if (dragging) apply(ev); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
      dial.addEventListener(t, function () { dragging = false; });
    });
    dial.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      const i = TM_SPEEDS.indexOf(state.tmSpeed);
      const step = ev.deltaY > 0 ? 1 : -1;
      const next = i >= 0 ? TM_SPEEDS[clamp(i + step, 0, TM_SPEEDS.length - 1)]
        : state.tmSpeed > 5 ? 5 : 10;
      setTmSpeed(next);
    }, { passive: false });
    dial.addEventListener('keydown', function (ev) {
      const i = TM_SPEEDS.indexOf(state.tmSpeed);
      const near = i >= 0 ? i : TM_SPEEDS.reduce(function (best, v, k) {
        return Math.abs(v - state.tmSpeed) < Math.abs(TM_SPEEDS[best] - state.tmSpeed) ? k : best;
      }, 0);
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { setTmSpeed(TM_SPEEDS[clamp(near + 1, 0, TM_SPEEDS.length - 1)]); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { setTmSpeed(TM_SPEEDS[clamp(near - 1, 0, TM_SPEEDS.length - 1)]); ev.preventDefault(); }
      else if (ev.key === 'Home') { setTmSpeed(TM_MIN); ev.preventDefault(); }
      else if (ev.key === 'End') { setTmSpeed(TM_MAX); ev.preventDefault(); }
    });
  }

  function initTm() {
    const docks = tmDocks();
    if (!docks.length) return;
    docks.forEach(function (dock) {
      const play = dock.querySelector('[data-tm-play]');
      if (play) play.addEventListener('click', function () { if (state.playing) stopPlay(); else startPlay(); });
      const slider = dock.querySelector('[data-tm-slider]');
      if (slider) {
        paintSlider(slider);
        slider.addEventListener('input', function () {
          stopPlay();
          paintSlider(this);
          setSimFrac(Number(this.value) / 1000);
        });
      }
      const tHost = dock.querySelector('[data-tm-time]');
      if (tHost && window.Dial) {
        dock._timeDial = window.Dial.create(tHost, {
          min: 0, max: 1000, step: 1, size: 96,
          value: Math.round((state.tmFrac || 0) * 1000),
          label: '밤 시간 이동 (일몰~일출)',
          fmt: function (v) {
            try {
              const w = nightWindow();
              return A.fmtClock(w.start + (w.end - w.start) * (v / 1000));
            } catch (e) { return '—'; }
          },
          sub: '한 바퀴 = 한 밤',
          onChange: function (v) { stopPlay(); setSimFrac(v / 1000); }
        });
      }
      const sunset = dock.querySelector('[data-tm-sunset]');
      if (sunset) sunset.addEventListener('click', function () { stopPlay(); setSimFrac(0); });
      const now = dock.querySelector('[data-tm-now]');
      if (now) now.addEventListener('click', function () { clearSim(); setViewDate(todayKST(), ''); });
      const dial = dock.querySelector('[data-tm-dial]');
      if (dial) {
        const ticks = dial.querySelector('[data-tm-ticks]');
        if (ticks) {
          let html = '';
          for (let k = 0; k <= 8; k++) {
            const a = (-135 + k * 33.75) * Math.PI / 180;
            const x1 = 27 + 12.4 * Math.sin(a), y1 = 25 - 12.4 * Math.cos(a);
            const x2 = 27 + 15.0 * Math.sin(a), y2 = 25 - 15.0 * Math.cos(a);
            html += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
          }
          ticks.innerHTML = html;
        }
        bindDial(dial);
      }
    });
    paintDial(docks[0]);
    updateTmBar();
  }

  function setSimFrac(frac) {
    const w = nightWindow();
    state.tmFrac = clamp(frac, 0, 1);
    state.simJd = w.start + (w.end - w.start) * state.tmFrac;
    renderAll({ fast: true });
  }

  function clearSim(skipRender) {
    const had = state.simJd != null;
    state.simJd = null;
    state.tmFrac = 0;
    stopPlay();
    if (had && !skipRender) renderAll();
    updateTmBar();
  }

  // 사용자가 날짜·시각을 직접 고르면 시뮬레이션 상태를 버리고 그 시각으로 돌아간다.
  function dropSim() {
    state.simJd = null;
    state.tmFrac = 0;
    stopPlay();
    syncTimeField(true);
  }

  function playStep(ts) {
    if (!state.playing) return;
    const dt = Math.min(0.3, Math.max(0, (ts - playLast) / 1000));
    playLast = ts;
    const w = nightWindow();
    const speedMin = state.tmSpeed || 5;
    const totalMin = Math.max(1, (w.end - w.start) * 1440);
    state.tmFrac = clamp(state.tmFrac + (speedMin * dt) / totalMin, 0, 1);
    state.simJd = w.start + (w.end - w.start) * state.tmFrac;
    const now = performance.now();
    if (now - playRenderTs > 140) {
      playRenderTs = now;
      renderAll({ fast: true });
    }
    if (state.tmFrac >= 0.999) { stopPlay(); renderAll({ fast: true }); return; }
    playRaf = requestAnimationFrame(playStep);
  }

  function paintPlayBtns() {
    tmDocks().forEach(function (dock) {
      const btn = dock.querySelector('[data-tm-play]');
      if (!btn) return;
      btn.textContent = state.playing ? '⏸' : '▶';
      btn.setAttribute('aria-pressed', String(state.playing));
      btn.classList.toggle('is-playing', state.playing);
      btn.setAttribute('aria-label', state.playing ? '밤하늘 타임랩스 일시정지' : '밤하늘 타임랩스 재생');
    });
  }

  function startPlay() {
    if (state.simJd == null) {
      const w = nightWindow();
      state.tmFrac = 0.02;
      state.simJd = w.start + (w.end - w.start) * state.tmFrac;
    }
    state.playing = true;
    paintPlayBtns();
    playLast = performance.now();
    if (playRaf) cancelAnimationFrame(playRaf);
    playRaf = requestAnimationFrame(playStep);
    renderAll({ fast: true });
  }

  function stopPlay() {
    state.playing = false;
    if (playRaf) { cancelAnimationFrame(playRaf); playRaf = null; }
    paintPlayBtns();
  }

  /* ======================================================================
     ④ 시야(FOV) 시뮬레이터 — 보름달·목성·M42·M31 크기 비교
     ====================================================================== */
  const FOV_TARGETS = [
    { id: 'moon', name: '보름달', w: 0.52, h: 0.52, color: '#fff3cf', kind: 'circle' },
    { id: 'jupiter', name: '목성', w: null, h: null, color: '#ffb27a', kind: 'circle' },
    { id: 'm42', name: 'M42 오리온 대성운', w: 85 / 60, h: 60 / 60, color: '#7ee0c0', kind: 'ellipse' },
    { id: 'm31', name: 'M31 안드로메다은하', w: 178 / 60, h: 63 / 60, color: '#8ab6ff', kind: 'ellipse' }
  ];

  function calcFov() {
    const cv = $('#fovCanvas');
    if (!cv) return;
    const W = cv.width, H = cv.height;
    const ctx = cv.getContext('2d');
    const red = isRed();
    const scope = state.fovMode === 'scope';
    let tfovW, tfovH, sizeLabel, sizeNote, frameText;
    if (scope) {
      const f = inputNum($('#fovFocal'), 1300);
      const ep = inputNum($('#fovEyepiece'), 25);
      const afov = inputNum($('#fovAfov'), 52);
      const mag = f / ep;
      const tfov = afov / mag;
      tfovW = tfov; tfovH = tfov;
      sizeLabel = nf(mag, 0) + '배';
      sizeNote = '초점거리 ÷ 아이피스';
      frameText = '원형 시야 ' + nf(tfov, 2) + '°';
    } else {
      const f = inputNum($('#fovCamFocal'), 200);
      const sensor = ($('#fovSensor').value || '9.6,7.2').split(',').map(Number);
      const sw = sensor[0], sh = sensor[1];
      tfovW = 2 * Math.atan(sw / (2 * f)) * 180 / Math.PI;
      tfovH = 2 * Math.atan(sh / (2 * f)) * 180 / Math.PI;
      sizeLabel = nf(f, 0) + 'mm';
      sizeNote = '센서 ' + sw + '×' + sh + 'mm';
      frameText = '사각 시야 ' + nf(tfovW, 1) + '° × ' + nf(tfovH, 1) + '°';
    }
    if ($('#fovOutTfov')) $('#fovOutTfov').textContent = frameText.replace(' 시야 ', ' ');
    if ($('#fovOutTfovNote')) $('#fovOutTfovNote').textContent = scope ? '아이피스 겉보기 시야 ÷ 배율' : '2·atan(센서/2f)';
    if ($('#fovOutMag')) $('#fovOutMag').textContent = sizeLabel;
    if ($('#fovOutMagNote')) $('#fovOutMagNote').textContent = sizeNote;

    const c = state.last || computeNight();
    const jp = A.planetPos('jupiter', c.jd);
    const jupDeg = jp.diamArcsec / 3600;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = red ? '#0b0201' : '#03060d';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const maxW = W * 0.82, maxH = H * 0.82;
    const scale = Math.min(maxW / tfovW, maxH / tfovH);
    const fw = tfovW * scale, fh = tfovH * scale;

    ctx.save();
    ctx.strokeStyle = red ? 'rgba(255,120,90,.5)' : 'rgba(140,180,255,.55)';
    ctx.lineWidth = 1.6;
    if (scope) {
      ctx.beginPath();
      ctx.arc(cx, cy, fw / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.clip();
    } else {
      ctx.strokeRect(cx - fw / 2, cy - fh / 2, fw, fh);
      ctx.beginPath();
      ctx.rect(cx - fw / 2, cy - fh / 2, fw, fh);
      ctx.clip();
    }
    let stepDeg = 1;
    if (Math.max(tfovW, tfovH) > 12) stepDeg = 5;
    if (Math.max(tfovW, tfovH) > 40) stepDeg = 10;
    if (Math.max(tfovW, tfovH) < 0.6) stepDeg = 0.1;
    ctx.strokeStyle = red ? 'rgba(255,120,90,.13)' : 'rgba(150,180,255,.12)';
    ctx.lineWidth = 1;
    for (let x = -Math.floor(tfovW / 2 / stepDeg) * stepDeg; x <= tfovW / 2; x += stepDeg) {
      ctx.beginPath();
      ctx.moveTo(cx + x * scale, cy - fh / 2);
      ctx.lineTo(cx + x * scale, cy + fh / 2);
      ctx.stroke();
    }
    for (let y = -Math.floor(tfovH / 2 / stepDeg) * stepDeg; y <= tfovH / 2; y += stepDeg) {
      ctx.beginPath();
      ctx.moveTo(cx - fw / 2, cy + y * scale);
      ctx.lineTo(cx + fw / 2, cy + y * scale);
      ctx.stroke();
    }
    ctx.restore();

    const labelSlots = [];
    const drawTarget = function (t, wDeg, hDeg, ox, oy) {
      const w = wDeg * scale, h = hDeg * scale;
      ctx.save();
      ctx.beginPath();
      if (scope) ctx.arc(cx, cy, fw / 2, 0, Math.PI * 2);
      else ctx.rect(cx - fw / 2, cy - fh / 2, fw, fh);
      ctx.clip();
      ctx.strokeStyle = t.color;
      ctx.fillStyle = t.color;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.6;
      const x = cx + (ox || 0) * scale, y = cy + (oy || 0) * scale;
      if (t.kind === 'circle') {
        const rr = Math.max(1.8, w / 2);
        const gr = ctx.createRadialGradient(x - rr * 0.3, y - rr * 0.35, rr * 0.1, x, y, rr);
        gr.addColorStop(0, t.color);
        gr.addColorStop(1, 'rgba(255,235,190,.25)');
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.globalAlpha = t.id === 'jupiter' ? 0.95 : 0.55;
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = t.color;
        ctx.stroke();
        if (t.id === 'jupiter') {
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(2.4, rr), 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,178,122,.9)';
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.ellipse(x, y, Math.max(2, w / 2), Math.max(2, h / 2), 0, 0, Math.PI * 2);
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
      }
      ctx.restore();
      const fsNote = wDeg >= 1 ? nf(wDeg, 2) + '°' : nf(wDeg * 60, 1) + '′';
      const tooBig = (wDeg > tfovW * 1.03 || hDeg > tfovH * 1.03);
      const text = t.name + ' ' + fsNote + (tooBig ? ' (시야보다 큼)' : '');
      ctx.font = '600 11px system-ui, sans-serif';
      const tw = ctx.measureText(text).width;
      let lx = clamp(x + Math.max(4, w / 2) + 6, 8, W - tw - 8);
      let ly = clamp(y - Math.max(4, h / 2) - 4, 18, H - 10);
      for (let i = 0; i < 6; i++) {
        let hit = false;
        for (let j = 0; j < labelSlots.length; j++) {
          const sl = labelSlots[j];
          if (Math.abs(sl.y - ly) < 15 && Math.abs(sl.x - lx) < tw * 0.9) { hit = true; break; }
        }
        if (!hit) break;
        ly += 15;
        if (ly > H - 12) { ly = 18 + i * 15; }
      }
      labelSlots.push({ x: lx, y: ly });
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = 'rgba(2,4,10,.65)';
      ctx.fillRect(lx - 3, ly - 11, tw + 6, 14);
      ctx.fillStyle = t.color;
      ctx.textAlign = 'left';
      ctx.fillText(text, lx, ly);
      ctx.globalAlpha = 1;
    };

    // 선택한 대상 1개를 프레임 정중앙에 실제 크기로
    const sel = FOV_TARGETS.find(function (t) { return t.id === state.fovTarget; }) || FOV_TARGETS[0];
    const selW = sel.id === 'jupiter' ? jupDeg : sel.w;
    const selH = sel.id === 'jupiter' ? jupDeg : sel.h;
    drawTarget(sel, selW, selH, 0, 0);

    // 네 대상의 상대 크기 비교 바
    if ($('#fovBars')) {
      const ref = Math.max(tfovW, 0.0001);
      $('#fovBars').innerHTML = FOV_TARGETS.map(function (t) {
        const w = t.id === 'jupiter' ? jupDeg : t.w;
        const pct = w / ref * 100;
        const barW = clamp(pct, 0.6, 100);
        const txt = w * 60 >= 1 ? nf(w * 60, 0) + '′' : nf(w * 3600, 0) + '″';
        return '<div class="fov-bar-row' + (t.id === sel.id ? ' is-active' : '') + '" data-fovtarget="' + t.id + '">' +
          '<span>' + esc(t.name) + '</span>' +
          '<div class="fov-bar-track"><div class="fov-bar-fill" style="width:' + barW.toFixed(1) + '%;background:' + t.color + '"></div></div>' +
          '<b>' + txt + ' · ' + nf(pct, 1) + '%</b></div>';
      }).join('');
      $$('#fovBars .fov-bar-row').forEach(function (row) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', function () {
          state.fovTarget = row.getAttribute('data-fovtarget');
          syncFovTargetChips();
          calcFov();
        });
      });
    }

    if ($('#fovExplain')) {
      const pct = (0.52 / Math.max(tfovW, tfovH)) * 100;
      $('#fovExplain').innerHTML = '<strong>읽는 법</strong> 이 시야(' + nf(tfovW, 2) + '°' + (scope ? '' : ' × ' + nf(tfovH, 2) + '°') + ')에서 ' +
        '보름달은 폭의 <b>' + nf(pct, 1) + '%</b>, 목성(' + nf(jupDeg * 3600, 1) + '″)은 폭의 <b>' + nf(jupDeg / Math.max(tfovW, tfovH) * 100, 2) + '%</b>를 차지합니다. ' +
        'M42(1.4°)는 ' + (1.42 > Math.max(tfovW, tfovH) ? '시야보다 커서 일부만 보입니다' : '폭의 ' + nf(1.42 / Math.max(tfovW, tfovH) * 100, 0) + '%') + '. ' +
        '시야가 좁을수록 달의 크레이터·목성 표면은 잘 보이지만, 대상 찾기는 어려워집니다.';
    }
  }

  function syncFovTargetChips() {
    $$('#fovTargets .seg-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-fovtarget') === state.fovTarget);
    });
  }

  function initFov() {
    if (!$('#fovCanvas')) return;
    $$('#fovTargets .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.fovTarget = b.getAttribute('data-fovtarget');
        syncFovTargetChips();
        calcFov();
      });
    });
    syncFovTargetChips();
    $$('.seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.fovMode = b.getAttribute('data-fovmode');
        $$('.seg-btn').forEach(function (x) { x.classList.toggle('is-active', x === b); });
        $('#fovScopeFields').hidden = state.fovMode !== 'scope';
        $('#fovCameraFields').hidden = state.fovMode !== 'camera';
        calcFov();
      });
    });
    ['fovFocal', 'fovEyepiece', 'fovAfov', 'fovCamFocal', 'fovSensor'].forEach(function (id) {
      const el = $('#' + id);
      if (!el) return;
      el.addEventListener('input', calcFov);
      el.addEventListener('change', calcFov);
    });
    calcFov();
  }

  /* ======================================================================
     ⑤ 날짜 프리셋 · 검색/필터 도구
     ====================================================================== */
  function setViewDate(dateStr, timeStr) {
    state.dateStr = dateStr;
    state.timeStr = timeStr || '';
    state.simJd = null;
    state.tmFrac = 0;
    state.follow = null;
    stopPlay();
    const di = $('#dateInput');
    if (di) di.value = dateStr;
    syncTimeField(true);
    renderAll();
    updateTmBar();
  }

  function applyPreset(name) {
    let dateStr = todayKST(), timeStr = '';
    if (name === 'weekend') {
      const t = todayKST().split('-').map(Number);
      const dow = new Date(Date.UTC(t[0], t[1] - 1, t[2])).getUTCDay();
      let add = (6 - dow + 7) % 7;
      const kstHour = new Date(Date.now() + 9 * 3600000).getUTCHours();
      if (add === 0 && kstHour >= 20) add = 7;
      dateStr = addDays(todayKST(), add);
      timeStr = '22:00';
    } else if (name === 'dark') {
      let best = null;
      for (let i = 0; i < 30; i++) {
        const d = addDays(todayKST(), i);
        const ph = A.moonPhase(A.jdFromDate(A.localToDate(d, '23:00')));
        if (!best || ph.illum < best.illum) best = { date: d, illum: ph.illum };
      }
      dateStr = best.date;
      timeStr = '23:00';
      toast('앞으로 30일 중 달이 가장 어두운 밤은 ' + Number(best.date.slice(5, 7)) + '월 ' + Number(best.date.slice(8, 10)) + '일 (달 ' + nf(best.illum * 100, 0) + '%)입니다.');
    } else if (name === 'gem') {
      dateStr = '2026-12-14'; timeStr = '22:00';
    } else if (name === 'qua') {
      dateStr = '2027-01-04'; timeStr = '03:00';
    }
    setViewDate(dateStr, timeStr);
    $$('#quickActions .qa-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-preset') === name);
    });
    if (name !== 'dark') {
      toast(Number(dateStr.slice(5, 7)) + '월 ' + Number(dateStr.slice(8, 10)) + '일 ' + (timeStr || '지금') + ' 기준으로 바꿨습니다.');
    }
  }

  function initExtra() {
    initLive();
    initTm();
    initFov();

    $$('#quickActions .qa-btn').forEach(function (b) {
      b.addEventListener('click', function () { applyPreset(b.getAttribute('data-preset')); });
    });
    ['dateInput', 'timeInput'].forEach(function (id) {
      const el = $('#' + id);
      if (el) el.addEventListener('change', function () {
        clearSim(true);
        $$('#quickActions .qa-btn').forEach(function (x) { x.classList.remove('is-active'); });
        renderAll();
      });
    });
    const nowBtn = $('#btnNow');
    if (nowBtn) nowBtn.addEventListener('click', function () {
      clearSim(true);
      $$('#quickActions .qa-btn').forEach(function (x) { x.classList.toggle('is-active', x.getAttribute('data-preset') === 'tonight'); });
    });
    const geoBtn = $('#btnGeo');
    if (geoBtn) geoBtn.addEventListener('click', function () { clearSim(true); });


    // 도감 검색 지우기
    const sc = $('#searchClear');
    if (sc && $('#searchInput')) {
      const sync = function () { sc.hidden = !$('#searchInput').value; };
      $('#searchInput').addEventListener('input', sync);
      sync();
      sc.addEventListener('click', function () {
        $('#searchInput').value = '';
        state.filter.q = '';
        sc.hidden = true;
        renderCatalog(state.last || computeNight());
        $('#searchInput').focus();
      });
    }
    // 필터 초기화
    const fr = $('#filterReset');
    if (fr) fr.addEventListener('click', function () {
      state.filter = { type: 'all', equip: 'all', season: 'all', q: '' };
      if ($('#searchInput')) $('#searchInput').value = '';
      if ($('#searchClear')) $('#searchClear').hidden = true;
      if ($('#onlyVisible')) $('#onlyVisible').checked = false;
      if ($('#sortSelect')) $('#sortSelect').value = 'mag';
      renderCatalog(state.last || computeNight());
      toast('도감 필터를 초기화했습니다.');
    });
    // 용어사전 검색
    const gi = $('#glossSearch'), gc = $('#glossClear');
    if (gi) {
      const sync = function () { if (gc) gc.hidden = !gi.value; };
      gi.addEventListener('input', function () { state.glossQ = gi.value; renderGlossary(); sync(); });
      sync();
    }
    if (gc) gc.addEventListener('click', function () {
      if (gi) gi.value = '';
      state.glossQ = '';
      gc.hidden = true;
      renderGlossary();
      if (gi) gi.focus();
    });
    // 명소: 예약 불필요만
    const nb = $('#onlyNoBooking');
    if (nb) nb.addEventListener('change', function () { renderSites(); });
    // 행성표 조준
    const pt = $('#planetTable');
    if (pt) pt.addEventListener('click', function (ev) {
      const b = ev.target.closest ? ev.target.closest('[data-aim-planet]') : null;
      if (!b) return;
      aimAt('planet', b.getAttribute('data-aim-planet'));
    });
    // 레드라이트 전환 시 캔버스 다시 그리기
    const redBtn = $('#btnRed');
    if (redBtn) redBtn.addEventListener('click', function () {
      setTimeout(function () {
        liveDirty = true; kickLive(); calcFov();
        // 전천 지도는 색을 직접 그리므로 레드라이트 전환 때 다시 그립니다.
        if ($('#skyMap')) renderSkyMap(state.last || computeNight());
      }, 30);
    });
    // 화면 회전·크기 변경
    window.addEventListener('resize', function () { calcFov(); });
  }

  /* ---------------------------------------------------------- 공유 텍스트 */

  /* ---------------------------------------------------------------- 용어사전 */
  function renderGlossary() {
    if (!$('#glossaryList')) return;
    const groups = ['전체'].concat(Array.from(new Set(D.glossary.map(function (g) { return g.group; }).filter(Boolean))));
    if ($('#glossGroups')) {
      $('#glossGroups').innerHTML = groups.map(function (g) {
        return '<button class="chip' + (state.glossGroup === g ? ' is-active' : '') + '" data-g="' + esc(g) + '" type="button">' + esc(g) + '</button>';
      }).join('');
      $$('#glossGroups .chip').forEach(function (b) {
        b.addEventListener('click', function () {
          state.glossGroup = b.getAttribute('data-g');
          renderGlossary();
        });
      });
    }
    const q = state.glossQ.trim().toLowerCase();
    const list = D.glossary.filter(function (g) {
      if (state.glossGroup !== '전체' && g.group !== state.glossGroup) return false;
      if (!q) return true;
      return (g.term + ' ' + g.easy + ' ' + g.detail).toLowerCase().indexOf(q) >= 0;
    });
    if ($('#glossCount')) {
      $('#glossCount').textContent = list.length === D.glossary.length ? D.glossary.length : list.length + ' / ' + D.glossary.length;
    }
    $('#glossaryList').innerHTML = list.length ? list.map(function (g) {
      return '<details class="gloss-item"><summary><span>' + esc(g.term) + '</span>' +
        (g.group ? '<span class="gloss-group-tag">' + esc(g.group) + '</span>' : '') + '</summary>' +
        '<div class="gloss-easy">' + esc(g.easy) + '</div>' +
        (g.detail ? g.detail.split('\n').map(function (line) { return '<p>' + esc(line) + '</p>'; }).join('') : '') +
        '</details>';
    }).join('') : '<p class="muted small">검색 결과가 없습니다. 다른 낱말로 찾아보세요.</p>';
  }

  /* ---------------------------------------------------------- 공유 텍스트 */
  function buildShareText(c) {
    const n = c.night;
    const site = state.site;
    const recs = recommend(c, 1, 3);
    const lines = [];
    lines.push('🔭 별너울 — ' + Number(state.dateStr.slice(5, 7)) + '월 ' + Number(state.dateStr.slice(8, 10)) + '일 (' + weekdayKR(state.dateStr) + ') · ' + site.name);
    lines.push('🌙 달: ' + nf(c.phase.illum * 100) + '% · ' + c.phase.name + (n.moonSet ? ' (월몰 ' + A.fmtClock(n.moonSet) + ')' : ''));
    if (c.cloud != null) lines.push('☁️ 구름: 밤 평균 ' + Math.round(c.cloud) + '% · ' + SkyWeather.labelOf(c.cloud));
    if (c.rain && ((c.rain.prob || 0) >= 20 || (c.rain.mm || 0) > 0.05)) {
      lines.push('☔ 강수: 확률 ' + Math.round(c.rain.prob || 0) + '%' +
        ((c.rain.mm || 0) > 0.05 ? ' · 밤 합계 ' + nf(c.rain.mm, 1) + 'mm' : '') +
        (c.rain.mmMax >= 0.5 ? ' (한때 ' + nf(c.rain.mmMax, 1) + 'mm/시)' : ''));
    }
    lines.push('🌇 일몰 ' + A.fmtClock(n.sunset) + ' → 천문박명 ' + A.fmtClock(n.astro.dusk) + (c.darkEnd ? ' → 새벽 ' + A.fmtClock(c.darkEnd) : ''));
    if (recs.length) {
      lines.push('⭐ 추천: ' + recs.map(function (r, i) {
        return (i + 1) + ') ' + r.obj.name + ' (' + r.why + ')';
      }).join(' / '));
    }
    lines.push('📊 관측 지수 ' + c.score + '/100 · Bortle ' + (site.bortle || '?') + (c.cloud != null ? ' · 구름 ' + Math.round(c.cloud) + '%' : ''));
    lines.push('🧣 준비물: 방한복·적색 손전등·돗자리·보조배터리');
    const planetUp = c.planets.filter(function (p) { return p.hor.alt > 10 && p.mag <= 2; })
      .map(function (p) { return p.name + ' ' + nf(p.mag, 1) + '등 ' + dirName(p.hor.az) + ' ' + Math.round(p.hor.alt) + '°'; });
    if (planetUp.length) lines.push('🪐 행성: ' + planetUp.join(', '));
    lines.push('');
    lines.push('전국 관측 명소·촬영 계산기·2026~2027 천문 캘린더 → 별너울');
    return lines.join('\n');
  }

  function sharePlan() {
    const c = state.last || computeNight();
    const text = buildShareText(c);
    copyText(text).then(function (ok) {
      if (ok !== false) toast('오늘 밤 플랜을 복사했습니다. 카카오톡에 붙여넣으세요.');
    });
  }

  /* ------------------------------------------------- 앱 공유 (더보기 메뉴) */
  const SHARE_URL = 'https://byeolneoul.vercel.app/';
  function shareApp() {
    const copyLink = function () {
      return copyText(SHARE_URL).then(function (ok) {
        if (ok !== false) toast('공유 링크를 복사했어요!');
      });
    };
    if (navigator.share) {
      try {
        navigator.share({
          title: '별너울 — 대한민국 밤하늘 관측 지도',
          text: '오늘 밤 관측 지수·별자리·천체 도감·천문 학습관을 한곳에서 볼 수 있어요.',
          url: SHARE_URL
        }).catch(function (err) {
          if (err && err.name === 'AbortError') return;   // 사용자가 공유 시트를 닫음 — 조용히 무시
          copyLink();
        });
        return;
      } catch (e) { /* 아래 복사로 넘어감 */ }
    }
    copyLink();
  }

  /* ------------------------------------------------------------- 툴팁 */
  function initTermTips() {
    let tip = null;
    document.addEventListener('click', function (ev) {
      const t = ev.target.closest ? ev.target.closest('.term') : null;
      if (tip) { tip.remove(); tip = null; }
      if (!t) return;
      const text = t.getAttribute('data-tip');
      if (!text) return;
      tip = document.createElement('div');
      tip.className = 'term-tip';
      tip.textContent = text;
      document.body.appendChild(tip);
      const r = t.getBoundingClientRect();
      tip.style.left = Math.min(window.innerWidth - 300, Math.max(8, r.left)) + 'px';
      tip.style.top = (r.bottom + 8) + 'px';
      ev.stopPropagation();
    });
  }

  /* ------------------------------------------------------------ 히어로 별 */
  function drawHeroStars() {
    const cv = $('#heroStars');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h * 0.95;
      const r = Math.random() * 1.3 + 0.2;
      const a = Math.random() * 0.7 + 0.15;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
      ctx.fill();
    }
  }

  /* ------------------------------------------------------------- 전체 렌더 */
  function renderAll(opts) {
    const fast = !!(opts && opts.fast);
    const c = computeNight();
    state.last = c;
    renderHero(c);
    renderTimeline(c);
    renderCloudPanel(c);
    renderMoonSun(c);
    renderPlanets(c);
    renderSkyMap(c);
    renderLiveSync(c);
    renderInspector();
    updateTmBar();
    syncLiveTimeCard();
    if (fast) return;
    renderTargets(c);
    renderHourlyPlan(c);
    renderBestNights(c);
    renderCatalog(c);
    if (state.siteSortNear) renderSites();
    calcDeclination();
    $('#coordNote').textContent = nf(state.site.lat, 4) + '°N · ' + nf(state.site.lon, 4) + '°E · Bortle ' + (state.site.bortle || '?');
    $('#latInput').value = state.site.lat;
    $('#lonInput').value = state.site.lon;
    refreshWeather();
  }

  /* ====================================================================== 지역 선택 — 시·도 → 시·군·구 2단계
     · 1단계(시·도)에서 좁히면 2단계(시·군·구) 목록이 그 시·도 것만 남습니다.
     · '전국 관측 명소'를 고르면 2단계가 기존 34곳 목록으로 바뀝니다.
     · 내 위치(GPS)·위경도 직접 입력은 그대로 두고, 고른 뒤에는 가장 가까운
       시·군·구 이름을 함께 보여 줍니다.
     ====================================================================== */
  const KR = window.KR_REGIONS || null;

  function krPairs() {
    const out = [];
    if (!KR) return out;
    KR.provinces.forEach(function (p) {
      p.districts.forEach(function (d) { out.push({ prov: p, dist: d }); });
    });
    return out;
  }

  function kmBetween(lat1, lon1, lat2, lon2) {
    const dy = (lat2 - lat1) * 111.32;
    const dx = (lon2 - lon1) * 111.32 * Math.cos(lat1 * Math.PI / 180);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 좌표에서 가장 가까운 시·군·구 */
  function nearestRegion(lat, lon) {
    let best = null, bestKm = Infinity;
    krPairs().forEach(function (x) {
      const km = kmBetween(lat, lon, x.dist.lat, x.dist.lon);
      if (km < bestKm) { bestKm = km; best = { prov: x.prov, dist: x.dist, km: km }; }
    });
    return best;
  }

  function siteFromDistrict(prov, d) {
    return {
      name: prov.short + ' ' + d.name, lat: d.lat, lon: d.lon, bortle: d.bortle,
      region: prov.id, district: d.name
    };
  }
  function siteFromProvince(prov) {
    return { name: prov.name, lat: prov.lat, lon: prov.lon, bortle: prov.bortle, region: prov.id, district: '' };
  }
  function siteFromSpot(s) {
    return { name: s.name, lat: s.lat, lon: s.lon, bortle: s.bortle, spot: true };
  }

  function provById(id) {
    return KR ? (KR.provinces.filter(function (p) { return p.id === id; })[0] || null) : null;
  }

  function buildProvinceOptions() {
    const sel = $('#provinceSelect');
    if (!sel || !KR) return;
    let html = KR.provinces.map(function (p) {
      return '<option value="p:' + p.id + '">' + esc(p.name) + '</option>';
    }).join('');
    html += '<option value="spots">🏕️ 전국 관측 명소 (' + D.sites.length + '곳)</option>';
    sel.innerHTML = html;
  }

  /** 2단계 목록을 그 시·도의 시·군·구만으로 다시 채웁니다. */
  function fillDistrictOptions(provinceId, customLabel) {
    const sel = $('#districtSelect');
    if (!sel) return;
    let html = '';
    const custom = customLabel
      ? '<option value="custom">✏️ ' + esc(customLabel) + '</option>'
      : '';

    if (provinceId === 'spots') {
      const groups = {};
      D.sites.forEach(function (s, i) { (groups[s.region] = groups[s.region] || []).push(i); });
      html = custom || '<option value="">명소를 고르세요</option>';
      Object.keys(groups).forEach(function (g) {
        html += '<optgroup label="' + esc(g) + '">' + groups[g].map(function (i) {
          return '<option value="site:' + i + '">' + esc(D.sites[i].name) + '</option>';
        }).join('') + '</optgroup>';
      });
      sel.innerHTML = html;
      return;
    }

    const prov = provById(provinceId);
    if (!prov) { sel.innerHTML = '<option value="">시·도를 먼저 고르세요</option>'; return; }
    html = custom || '<option value="">' + esc(prov.short) + ' 시·군·구 선택</option>';

    const byKind = { 시: [], 군: [], 구: [] };
    prov.districts.forEach(function (d) { (byKind[d.kind] || byKind['시']).push(d); });
    const opts = function (arr) {
      return arr.map(function (d) {
        return '<option value="d:' + esc(d.name) + '">' + esc(d.name) + ' · Bortle ' + d.bortle + '</option>';
      }).join('');
    };

    if (provinceId === 'jeonnam') {
      // 통합특별시: 광주권 자치구와 전남 시·군을 나눠 보여 줍니다.
      if (byKind.구.length) html += '<optgroup label="광주권 자치구">' + opts(byKind.구) + '</optgroup>';
      const rest = byKind.시.concat(byKind.군);
      if (rest.length) html += '<optgroup label="전남 시·군">' + opts(rest) + '</optgroup>';
    } else {
      // 부산·대구·인천·울산처럼 자치구와 군이 함께 있는 경우도 빠뜨리지 않습니다.
      if (byKind.구.length) html += '<optgroup label="자치구">' + opts(byKind.구) + '</optgroup>';
      if (byKind.시.length) html += '<optgroup label="시">' + opts(byKind.시) + '</optgroup>';
      if (byKind.군.length) html += '<optgroup label="군">' + opts(byKind.군) + '</optgroup>';
    }
    sel.innerHTML = html;
  }

  /** 현재 관측지에 맞춰 1·2단계 선택 상자를 맞춥니다. */
  function syncRegionSelects() {
    const selP = $('#provinceSelect'), selD = $('#districtSelect');
    if (!selP || !selD || !KR) return;
    const s = state.site;

    const si = D.sites.findIndex(function (x) {
      return Math.abs(x.lat - s.lat) < 0.0008 && Math.abs(x.lon - s.lon) < 0.0008;
    });
    if (si >= 0) {
      selP.value = 'spots';
      fillDistrictOptions('spots');
      selD.value = 'site:' + si;
      return;
    }

    const hit = krPairs().filter(function (x) {
      return Math.abs(x.dist.lat - s.lat) < 0.002 && Math.abs(x.dist.lon - s.lon) < 0.002;
    })[0];
    if (hit) {
      selP.value = 'p:' + hit.prov.id;
      fillDistrictOptions(hit.prov.id);
      selD.value = 'd:' + hit.dist.name;
      return;
    }

    const hp = KR.provinces.filter(function (p) {
      return Math.abs(p.lat - s.lat) < 0.002 && Math.abs(p.lon - s.lon) < 0.002;
    })[0];
    if (hp) {
      selP.value = 'p:' + hp.id;
      fillDistrictOptions(hp.id);
      selD.value = '';
      return;
    }

    // 내 위치·직접 입력 — 가장 가까운 시·도의 목록을 보여 주고 '직접 입력'을 남깁니다.
    const near = nearestRegion(s.lat, s.lon);
    if (near) {
      selP.value = 'p:' + near.prov.id;
      fillDistrictOptions(near.prov.id, s.name || '직접 입력한 위치');
      selD.value = 'custom';
    }
  }

  function applySite(site, note) {
    state.site = site;
    store.set('site', site);
    clearSim(true);
    renderAll();
    syncRegionSelects();
    if (note) toast(note);
  }

  function initSiteSelect() {
    const selP = $('#provinceSelect'), selD = $('#districtSelect');
    if (!selP || !selD) return;
    if (!KR) {
      selP.innerHTML = '<option>지역 목록을 불러오지 못했습니다</option>';
      selP.disabled = true; selD.disabled = true;
      return;
    }
    buildProvinceOptions();
    syncRegionSelects();

    selP.addEventListener('change', function () {
      const v = selP.value;
      if (v === 'spots') {
        fillDistrictOptions('spots');
        selD.value = '';
        selD.focus && selD.focus();
        return;
      }
      const prov = provById(v.replace(/^p:/, ''));
      if (!prov) return;
      fillDistrictOptions(prov.id);
      selD.value = '';
      applySite(siteFromProvince(prov));
    });

    selD.addEventListener('change', function () {
      const v = selD.value;
      if (v === 'custom' || v === '') return;
      if (v.indexOf('site:') === 0) {
        const s = D.sites[Number(v.slice(5))];
        if (s) applySite(siteFromSpot(s), s.name + '로 관측지를 바꿨습니다.');
        return;
      }
      if (v.indexOf('d:') === 0) {
        const prov = provById(selP.value.replace(/^p:/, ''));
        const name = v.slice(2);
        const d = prov && prov.districts.filter(function (x) { return x.name === name; })[0];
        if (prov && d) applySite(siteFromDistrict(prov, d), prov.short + ' ' + d.name + ' 기준으로 계산합니다.');
      }
    });
  }

  function initControls() {
    $('#dateInput').value = state.dateStr;
    syncTimeField(true);
    $('#dateInput').addEventListener('change', function () {
      state.dateStr = $('#dateInput').value || todayKST();
      dropSim();
      renderAll();
    });
    $('#timeInput').addEventListener('change', function () {
      state.timeStr = $('#timeInput').value || '';
      dropSim();
      renderAll();
    });
    $('#btnNow').addEventListener('click', function () {
      state.dateStr = todayKST();      state.timeStr = '';
      state.simJd = null;
      state.tmFrac = 0;
      state.follow = null;
      stopPlay();
      $('#dateInput').value = state.dateStr;
      syncTimeField(true);
      renderAll();
      toast('현재 시각으로 돌아왔습니다.');
    });

    // 낮에 열었을 때 "오늘 밤 22:00 기준으로 보기" — 시각 선택과 같은 경로로 계산한다.
    const btn22 = $('#btnNight22');
    if (btn22) btn22.addEventListener('click', function () {
      state.dateStr = todayKST();
      state.timeStr = '22:00';
      state.simJd = null;
      dropSim();
      $('#dateInput').value = state.dateStr;
      $('#timeInput').value = '22:00';
      renderAll();
      toast('오늘 밤 22:00 기준으로 바꿨습니다.');
    });

    $('#btnCustom').addEventListener('click', function () {
      const box = $('#customCoords');
      box.hidden = !box.hidden;
      $('#btnCustom').setAttribute('aria-expanded', String(!box.hidden));
    });
    $('#btnApplyCoords').addEventListener('click', function () {
      const lat = Number($('#latInput').value), lon = Number($('#lonInput').value);
      if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        toast('위도(-90~90)와 경도(-180~180)를 확인하세요.');
        return;
      }
      state.site = { name: '사용자 지정', lat: lat, lon: lon, bortle: 5 };
      store.set('site', state.site);
      renderAll();
      syncRegionSelects();
      toast('관측지 좌표를 적용했습니다.');
    });

    $('#btnGeo').addEventListener('click', function () {
      if (!navigator.geolocation) { toast('이 브라우저는 위치 기능을 지원하지 않습니다.'); return; }
      toast('현재 위치를 확인하는 중…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        const near = nearestRegion(lat, lon);
        state.site = {
          name: near ? near.dist.name + ' 근처 · 내 위치' : '내 위치',
          lat: lat, lon: lon,
          bortle: near ? near.dist.bortle : (state.site.bortle || 6),
          region: near ? near.prov.id : undefined,
          district: near ? near.dist.name : undefined,
          gps: true
        };
        store.set('site', state.site);
        renderAll();
        syncRegionSelects();
        toast(near
          ? '가장 가까운 시·군·구는 ' + near.prov.short + ' ' + near.dist.name + '입니다. GPS 좌표로 계산했습니다.'
          : '현재 위치로 계산했습니다.');
      }, function (err) {
        toast('위치를 가져오지 못했습니다(' + (err && err.code === 1 ? '권한 거부' : '시간 초과') + '). 위경도를 직접 입력하거나 관측지를 고르세요.');
      }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
    });

    $('#btnSharePlan').addEventListener('click', sharePlan);
    $('#btnShareTop').addEventListener('click', sharePlan);

    // 레드라이트
    const red = store.get('red', false);
    document.body.classList.toggle('red', !!red);
    $('#btnRed').setAttribute('aria-pressed', String(!!red));
    $('#btnRed').addEventListener('click', function () {
      const on = !document.body.classList.contains('red');
      document.body.classList.toggle('red', on);
      $('#btnRed').setAttribute('aria-pressed', String(on));
      store.set('red', on);
      toast(on ? '레드라이트 모드 — 암순응을 보호합니다.' : '일반 모드로 돌아왔습니다.');
    });

    // 글자 크기 (접근성)
    let fs = Number(store.get('fs', 16)) || 16;
    function applyFs() {
      fs = clamp(fs, 14, 21);
      document.documentElement.style.fontSize = fs + 'px';
      store.set('fs', fs);
      const d = $('#fsDown'), u = $('#fsUp');
      if (d) d.setAttribute('aria-disabled', String(fs <= 14));
      if (u) u.setAttribute('aria-disabled', String(fs >= 21));
    }
    applyFs();
    $('#fsDown').addEventListener('click', function () { fs -= 1; applyFs(); });
    $('#fsUp').addEventListener('click', function () { fs += 1; applyFs(); });
    const inline = $('#redModeInline');
    if (inline) inline.addEventListener('click', function () { $('#btnRed').click(); });

    // 목차·더보기 메뉴 · 도감 탭
    initNav();

    // 도감 정렬·필터
    if ($('#sortSelect')) $('#sortSelect').addEventListener('change', function () { renderCatalog(state.last); });
    if ($('#onlyVisible')) $('#onlyVisible').addEventListener('change', function () { renderCatalog(state.last); });
    // 명소 거리 정렬
    if ($('#btnSortSites')) $('#btnSortSites').addEventListener('click', function () {
      state.siteSortNear = !state.siteSortNear;
      const btn = $('#btnSortSites');
      btn.textContent = state.siteSortNear ? '권역 순으로 보기' : '현재 관측지에서 가까운 순';
      btn.classList.toggle('is-on', state.siteSortNear);
      renderSites();
    });
    // 캘린더 지난 일정
    if ($('#hidePast')) $('#hidePast').addEventListener('change', renderEvents);
    if ($('#decCheck')) $('#decCheck').addEventListener('input', calcDeclination);
    // 플랜 인쇄
    if ($('#btnPrintPlan')) $('#btnPrintPlan').addEventListener('click', function () { window.print(); });

    // 도감 검색
    let searchTimer = null;
    $('#searchInput').addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      const v = e.target.value;
      searchTimer = setTimeout(function () {
        state.filter.q = v;
        renderCatalog(state.last);
      }, 140);
    });

    // 랩 탭
    $$('.lab-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        $$('.lab-tab').forEach(function (x) { x.classList.remove('is-active'); x.setAttribute('aria-selected', 'false'); });
        t.classList.add('is-active');
        t.setAttribute('aria-selected', 'true');
        $$('.lab-panel').forEach(function (p) { p.classList.remove('is-active'); });
        $('#tab-' + t.getAttribute('data-tab')).classList.add('is-active');
      });
    });

    // 계산기 입력
    ['exFocal', 'exAperture', 'exSensor', 'exMp', 'exDec'].forEach(function (id) {
      $('#' + id).addEventListener('input', calcExposure);
      $('#' + id).addEventListener('change', calcExposure);
    });
    ['opAperture', 'opFocal', 'opEyepiece', 'opAfov'].forEach(function (id) {
      $('#' + id).addEventListener('input', calcOptics);
    });
    $('#mgCalc').addEventListener('click', calcMagnitude);
    $('#mgClear').addEventListener('click', function () {
      $('#mgApparent').value = ''; $('#mgAbsolute').value = ''; $('#mgDistance').value = '';
      $('#mgOutM').textContent = '—'; $('#mgOutAbs').textContent = '—';
      $('#mgOutDist').textContent = '—'; $('#mgOutLum').textContent = '—';
      $('#mgOutNote').textContent = '값을 입력해 보세요.';
    });

    // 체크리스트 초기화
    $('#btnResetCheck').addEventListener('click', function () {
      store.set('checklist', {});
      renderChecklist();
      toast('체크리스트를 초기화했습니다.');
    });

    // 로그
    $('#logDate').value = todayKST();
    $('#logForm').addEventListener('submit', function (e) {
      e.preventDefault();
      const logs = store.get('logs', []);
      const rec = {
        date: $('#logDate').value || todayKST(),
        place: $('#logPlace').value.trim(),
        equip: $('#logEquip').value,
        target: $('#logTarget').value.trim(),
        seeing: Number($('#logSeeing').value) || 3,
        trans: Number($('#logTrans').value) || 3,
        result: $('#logResult').value,
        memo: $('#logMemo').value.trim(),
        ts: Date.now()
      };
      if (logEditing != null && logs[logEditing]) {
        const prev = logs[logEditing];
        rec.ts = prev && prev.ts ? prev.ts : rec.ts;
        logs[logEditing] = Object.assign({}, prev, rec);
        store.set('logs', logs);
        endLogEdit();
        renderLogs();
        toast('관측 기록을 수정했습니다.');
        return;
      }
      logs.push(rec);
      store.set('logs', logs);
      $('#logTarget').value = ''; $('#logMemo').value = '';
      renderLogs();
      toast('관측 기록을 저장했습니다.');
    });
    $('#logCancelEdit').addEventListener('click', function () { endLogEdit(); toast('수정을 취소했습니다.'); });
    // 전체 삭제 — 실수로 지우지 않도록 두 번 눌러야 지웁니다(4초 안에 다시 누르지 않으면 원래대로).
    let clearLogTimer = null;
    $('#btnClearLog').addEventListener('click', function () {
      const btn = this;
      if (btn.getAttribute('data-armed') !== '1') {
        if (!store.get('logs', []).length) { toast('지울 기록이 없습니다.'); return; }
        btn.setAttribute('data-armed', '1');
        btn.textContent = '정말 전체 삭제?';
        clearTimeout(clearLogTimer);
        clearLogTimer = setTimeout(function () {
          btn.removeAttribute('data-armed');
          btn.textContent = '전체 삭제';
        }, 4000);
        return;
      }
      clearTimeout(clearLogTimer);
      btn.removeAttribute('data-armed');
      btn.textContent = '전체 삭제';
      store.set('logs', []);
      endLogEdit();
      renderLogs();
      toast('관측 기록을 모두 지웠습니다.');
    });

    // 로그 가져오기 (JSON)
    $('#btnImportLog').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function (ev) {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const parsed = JSON.parse(String(reader.result));
          const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.logs) ? parsed.logs : null);
          if (!arr) throw new Error('logs 배열을 찾을 수 없습니다');
          const clean = arr.filter(function (l) { return l && l.date; }).map(function (l) {
            return {
              date: String(l.date), place: String(l.place || ''), equip: String(l.equip || '맨눈'),
              target: String(l.target || ''), seeing: Number(l.seeing) || 3, trans: Number(l.trans) || 3,
              result: ['성공', '부분 성공', '실패'].indexOf(l.result) >= 0 ? l.result : '성공',
              memo: String(l.memo || ''), ts: Number(l.ts) || Date.now()
            };
          });
          const logs = store.get('logs', []).concat(clean);
          store.set('logs', logs);
          renderLogs();
          toast(clean.length + '건을 가져왔습니다.');
        } catch (err) {
          toast('가져오기 실패: ' + err.message);
        }
        ev.target.value = '';
      };
      reader.readAsText(file);
    });
    $('#btnExportLog').addEventListener('click', function () {
      const logs = store.get('logs', []);
      const blob = new Blob([JSON.stringify({ site: '별너울', exportedAt: new Date().toISOString(), logs: logs }, null, 2)],
        { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'oneulbam-log-' + todayKST().replace(/-/g, '') + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('로그 ' + logs.length + '건을 내보냈습니다.');
    });

    // 모달 닫기 + 포커스 트랩
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalBody').addEventListener('click', function (ev) {
      const t = ev.target.closest ? ev.target.closest('[data-close]') : null;
      if (t) { closeModal(); return; }
      const conAim = ev.target.closest ? ev.target.closest('[data-con-aim]') : null;
      if (conAim) { closeModal(); aimAt('con', conAim.getAttribute('data-con-aim')); return; }
      const objOpen = ev.target.closest ? ev.target.closest('[data-obj-open]') : null;
      if (objOpen) { openObject(objOpen.getAttribute('data-obj-open')); return; }
    });
    $$('#modal [data-close]').forEach(function (el) { el.addEventListener('click', closeModal); });
    document.addEventListener('keydown', function (e) {
      const modalOpen = !$('#modal').hidden;
      if (e.key === 'Escape' && modalOpen) { closeModal(); return; }
      if (e.key === 'Tab' && modalOpen) {
        const focusables = $$('#modal button, #modal a[href], #modal summary, #modal input, #modal select, #modal textarea')
          .filter(function (el) { return el.offsetParent !== null; });
        if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // 키보드 단축키: R = 레드라이트, / = 검색, ? = 도움말 토스트
    document.addEventListener('keydown', function (e) {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'r' || e.key === 'R') { $('#btnRed').click(); }
      else if (e.key === '/') { e.preventDefault(); const s = $('#searchInput'); if (s) { s.focus(); s.scrollIntoView({ block: 'center' }); } }
      else if (e.key === '?') { toast('단축키 — R: 레드라이트 · /: 천체 검색 · Esc: 창 닫기'); }
    });

    // 섹션 활성 표시는 initNav 의 단일 스크롤 스파이에서 처리한다.
    // (예전 IntersectionObserver 방식은 #constellations 처럼 숨겨진 패널이
    //  뷰포트 중앙 띠에 걸리면 도감이 계속 강조되는 문제가 있어 제거했다.)
  }

  /* ---------------------------------------------------------- 별자리 88종 도감 */
  /* 별자리 안 대표 천체 — 사진 갤러리와 상세 모달이 함께 씁니다.
     · 대표 도감(40여 종)은 한글 별자리 이름(con)으로, 하늘 전체 도감(2,571종)은 IAU 약자(c)로 묶여 있습니다.
     · 밝은 순으로 정리해, 사진이 있는 천체(메시에·NGC·밝은 별)가 앞에 오게 합니다. */
  function conMembers(con) {
    const out = [], seen = {};
    function add(o) {
      const k = String(o.id || o.i || o.name || '').toLowerCase();
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push(o);
    }
    D.catalog.forEach(function (o) {
      if (!o.dynamic && o.con === con.name) add(o);
    });
    const items = (window.SPACE_CATALOG && window.SPACE_CATALOG.items) || [];
    items.forEach(function (it) {
      if (it.c !== con.abbr) return;
      if (typeof it.ra !== 'number' || typeof it.dec !== 'number') return;
      add({ id: String(it.i), name: it.ko || it.i, sub: it.i, type: it.t, ra: it.ra, dec: it.dec, mag: it.m, size: it.s });
    });
    // 성운·성단·은하 같은 뚜렷한 대상(실제 망원경 사진이 있는 천체)을 먼저, 그다음 밝은 별.
    function isDeep(o) {
      const t = String(o.type || '');
      if (/항성|변광|이중성|star|var|dstar/i.test(t)) return false;
      if (/성운|성단|은하|초신성|Neb|OCl|GCl|Cl\+N|HII|SNR|PN|RfN|\*Ass|^G$/i.test(t)) return true;
      return /(^|[^A-Za-z])(M|NGC|IC)\s*-?\d+/i.test(String(o.sub || '') + ' ' + String(o.id || ''));
    }
    const magOf = function (o) { return (typeof o.mag === 'number') ? o.mag : 99; };
    const deep = out.filter(isDeep).sort(function (a, b) { return magOf(a) - magOf(b); });
    const stars = out.filter(function (o) { return !isDeep(o); }).sort(function (a, b) { return magOf(a) - magOf(b); });
    return deep.concat(stars).slice(0, 6);
  }

  // 별자리 크기(면적)에 맞춘 사진 시야 — 작은 별자리는 좁게, 큰 별자리는 넓게
  function conFov(con) {
    return Math.min(22, Math.max(8, Math.sqrt(con.area || 300) * 1.4));
  }

  function openConstellation(abbr) {
    const con = D.constellations.find(function (x) { return x.abbr === abbr; });
    if (!con) return;
    const c = state.last || computeNight();
    const hor = A.equatorialToHorizontal(con.raH, con.decD, state.site.lat, state.site.lon, c.jd);
    const ni = A.objectNight(con.raH, con.decD, state.site.lat, state.site.lon, state.dateStr);
    const members = conMembers(con);
    const altTxt = hor.alt > 0 ? dirName(hor.az) + ' ' + nf(hor.alt, 0) + '°' : '지평선 아래 (' + nf(hor.alt, 0) + '°)';
    const memberHtml = members.length ? '<ul class="con-member-list">' + members.map(function (m) {
      const magTxt = (typeof m.mag === 'number') ? ((m.mag > 0 ? '+' : '') + nf(m.mag, 1) + '등') : '—';
      const objId = D.catalog.some(function (o) { return o.id === m.id; }) ? m.id : '';
      const inner = '<b>' + esc(m.name || m.id) + '</b>' +
        (m.sub && m.sub !== m.name ? ' <span>' + esc(m.sub) + '</span>' : '') +
        ' · ' + esc(magTxt);
      return '<li>' + (objId
        ? '<button type="button" class="con-member" data-obj-open="' + esc(objId) + '">' + inner + '</button>'
        : '<span class="con-member is-plain">' + inner + '</span>') + '</li>';
    }).join('') + '</ul>' : '<p class="small muted">이 별자리에 등록된 대표 천체가 없습니다.</p>';

    $('#modalBody').innerHTML =
      '<div class="md-head"><h2 id="modalTitle">' + esc(con.name) + '</h2>' +
      '<div class="md-sub">' + esc(con.en) + ' (' + esc(con.abbr) + ') · IAU 88별자리 · ' + esc(con.season) + '</div></div>' +
      '<div class="md-stats">' +
      stat('가장 밝은 별', con.bright ? esc(con.bright) + ' (' + (con.brightMag > 0 ? '+' : '') + nf(con.brightMag, 2) + '등)' : '—', '별자리에서 가장 밝은 별입니다.') +
      stat('면적', con.area.toLocaleString('en-US') + ' deg²', '하늘 전체에서 차지하는 넓이. 88개 중 ' + con.areaRank + '위입니다.') +
      stat('중심 적경', fmtRA(con.raH), '별자리 중심의 가로 좌표(24시간 = 360°).') +
      stat('중심 적위', fmtDec(con.decD), '별자리 중심의 세로 좌표. +90°가 북극성 방향입니다.') +
      stat('잘 보이는 때', con.bestMonth + '월 · ' + con.season) +
      stat('지금 하늘', altTxt, '선택한 관측지·시각 기준입니다. 시간 조정 카드로 바꿀 수 있습니다.') +
      '</div>' +
      '<div class="md-now"><span>연결선 ' + con.lines.length + '구간</span>' +
      '<span>오늘 밤 최고: ' + (ni.neverUp ? '지평선 위로 안 오름' : nf(ni.maxAlt, 0) + '° (' + A.fmtClock(ni.maxJd) + ')') + '</span>' +
      '<span>출/몰: ' + A.fmtClock(ni.riseJd) + ' / ' + A.fmtClock(ni.setJd) + '</span></div>' +
      '<div class="md-section"><h3>별자리</h3><p>' + esc(con.desc) + '</p></div>' +
      '<div class="md-section"><h3>이 별자리의 대표 천체</h3>' + memberHtml +
      '<p class="small muted">천체 이름을 누르면 그 천체의 상세 정보가 열립니다.</p></div>' +
      '<div class="md-section"><h3>사진</h3><p class="small muted">사진은 별자리 중심 좌표의 NASA SkyView 실제 하늘 탐사 사진(DSS2 등)과, 이 별자리에 속한 대표 천체의 NASA·허블·제임스웹 촬영본입니다. 일러스트·아티스트 컨셉·다른 이름의 천체 사진은 넣지 않습니다.</p></div>' +
      '<div class="con-actions">' +
      '<button class="btn btn-primary btn-sm" type="button" data-con-aim="' + esc(con.abbr) + '">🎯 라이브 뷰로 조준</button>' +
      '<button class="mini-btn" type="button" data-close="1">닫기</button></div>';

    // 상단 사진 갤러리 — 별자리 중심 실제 하늘 + 대표 천체 사진 5~8장
    if (window.SkyGallery) {
      const body = $('#modalBody');
      const fig = SkyGallery.create({
        kind: 'con', name: con.name, en: con.en, abbr: con.abbr,
        raH: con.raH, decD: con.decD, members: members, fovDeg: conFov(con)
      }, { variant: 'modal' });
      const head = body.querySelector('.md-head');
      if (head && head.nextSibling) body.insertBefore(fig, head.nextSibling);
      else body.appendChild(fig);
    }

    const modal = $('#modal');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    state._lastFocus = document.activeElement;
    $('#modalClose').focus();
  }

  function renderConGrid() {
    const grid = $('#conGrid');
    if (!grid) return;
    const q = (state.conQuery || '').trim().toLowerCase();
    const season = state.conSeason || '전체';
    const list = D.constellations.filter(function (c) {
      if (season !== '전체' && c.season !== season) return false;
      if (!q) return true;
      return (c.name + ' ' + c.en + ' ' + c.abbr).toLowerCase().indexOf(q) >= 0;
    });
    grid.innerHTML = list.length ? list.map(function (c) {
      const mag = c.brightMag == null ? '' : ' ' + (c.brightMag > 0 ? '+' : '') + nf(c.brightMag, 2) + '등';
      return '<article class="con-card" data-con="' + esc(c.abbr) + '" tabindex="0" role="button" aria-expanded="false">' +
        '<div class="con-head"><b>' + esc(c.name) + '</b><span class="con-abbr">' + esc(c.abbr) + '</span>' +
        '<span class="con-aim" role="button" tabindex="0" data-aim="' + esc(c.abbr) + '" title="라이브 하늘에서 보기" aria-label="' + esc(c.name) + ' 라이브 하늘에서 보기">🎯</span></div>' +
        '<span class="con-meta">' + esc(c.season) + ' · ' + (c.bestMonth || '—') + '월 · ' + esc(c.bright || '—') + mag + '</span>' +
        '<span class="con-open-hint">📷 실제 사진 · 상세 보기 →</span>' +
        '<p class="con-desc">' + esc(c.desc) + '<br><span class="con-facts">영문 ' + esc(c.en) + ' · 면적 ' + c.areaRank + '위 · 연결선 ' + c.lines.length + '구간</span></p>' +
        '</article>';
    }).join('') : '<p class="con-empty">조건에 맞는 별자리가 없습니다. 검색어를 지워 보세요.</p>';
    const cnt = $('#conCount');
    if (cnt) cnt.textContent = list.length + ' / ' + D.constellations.length + '개';
  }

  function initConGrid() {
    const grid = $('#conGrid');
    if (!grid) return;
    const seasons = ['전체', '봄', '여름', '가을', '겨울'];
    const row = $('#conSeason');
    if (row) {
      row.innerHTML = seasons.map(function (s) {
        return '<button class="chip' + (s === '전체' ? ' is-active' : '') + '" type="button" data-season="' + s + '">' + s + '</button>';
      }).join('');
      row.addEventListener('click', function (ev) {
        const b = ev.target.closest('[data-season]');
        if (!b) return;
        state.conSeason = b.getAttribute('data-season');
        $$('#conSeason .chip').forEach(function (x) { x.classList.toggle('is-active', x === b); });
        renderConGrid();
      });
    }
    const search = $('#conSearch');
    if (search) search.addEventListener('input', function () { state.conQuery = this.value; renderConGrid(); });
    function toggle(card) {
      openConstellation(card.getAttribute('data-con'));
    }
    grid.addEventListener('click', function (ev) {
      const aim = ev.target.closest('[data-aim]');
      if (aim) {
        ev.stopPropagation();
        aimAt('con', aim.getAttribute('data-aim'));
        return;
      }
      const card = ev.target.closest('.con-card');
      if (card) toggle(card);
    });
    grid.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const aim = ev.target.closest('[data-aim]');
      if (aim) { ev.preventDefault(); aimAt('con', aim.getAttribute('data-aim')); return; }
      const card = ev.target.closest('.con-card');
      if (card) { ev.preventDefault(); toggle(card); }
    });
    renderConGrid();
  }

  /* ------------------------------------------------- 목차 · 도감 탭 내비 */
  function activateCatTab(key, scroll) {
    const tabs = $$('.cat-tab');
    if (!tabs.length) return;
    tabs.forEach(function (t) {
      const on = t.getAttribute('data-cat-tab') === key;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    const po = $('#panelObjects'), pc = $('#panelConstellations'), pq = $('#panelQuiz');
    if (po) po.hidden = key !== 'objects';
    if (pc) pc.hidden = key !== 'const';
    if (pq) pq.hidden = key !== 'quiz';
    const cc = $('#catalogCount');
    if (cc) cc.hidden = key === 'quiz';
    if (scroll && !window.__VIEWS_MODE__) {
      const sec = $('#catalog');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      lockActiveNav('catalog');
    }
  }

  /* ------------------------------------------------- 상단 내비 활성 표시 */
  // 내비 4개 항목과 그 대상 요소. #skymap 은 #today 안의 패널이고,
  // 도감 탭(#constellations)은 #catalog 안의 패널이라 둘 다 카탈로그에 묶는다.
  const NAV_TARGETS = ['today', 'skymap', 'live', 'catalog'];
  const NAV_KEYS = { today: 'today', skymap: 'skymap', live: 'live', catalog: 'catalog', constellations: 'catalog' };

  let navLockKey = null;   // 클릭·해시 이동 직후 강제로 유지할 내비 키
  let navLockAt = 0;       // 잠금 시작 시각
  let navLockTimer = 0;    // 스크롤이 멈춘 것을 감지하는 타이머

  function setActiveNav(id) {
    const key = NAV_KEYS[id];
    $$('.main-nav .nav-link').forEach(function (a) {
      const on = !!key && a.getAttribute('data-nav') === key;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  // 스티키 헤더 높이와 scroll-padding-top 을 반영한 판정선.
  // 섹션 상단이 이 선을 지나면 그 섹션이 현재 섹션이다.
  function navLine() {
    let pad = 0, head = 0;
    try { pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0; } catch (e) {}
    const h = document.getElementById('siteHeader');
    if (h) head = h.getBoundingClientRect().height;
    return Math.min(Math.max(pad, head) + 8, window.innerHeight * 0.4);
  }

  // 화면에 실제로 그려진 요소만 보고, 판정선을 지난 마지막 대상 섹션을 고른다.
  // (숨겨진 탭 패널처럼 rect.top 이 0 이 되는 요소는 건너뛴다 — 도감 오표시의 원인)
  // 상단 목차 범위를 벗어나면(도감 다음 섹션=실험실부터) null 로 강조를 해제한다.
  function navSectionAt() {
    const line = navLine();
    const after = document.getElementById('lab');   // 도감 다음 섹션 — 상단 목차 범위 밖
    if (after && after.getClientRects().length && after.getBoundingClientRect().top <= line) return null;
    let cur = NAV_TARGETS[0];
    NAV_TARGETS.forEach(function (id) {
      const el = document.getElementById(id);
      if (!el || !el.getClientRects().length) return;
      if (el.getBoundingClientRect().top <= line) cur = id;
    });
    return cur;
  }

  function navUnlock() {
    navLockKey = null;
    if (navLockTimer) { clearTimeout(navLockTimer); navLockTimer = 0; }
  }

  // 잠금 유지 타이머: 스크롤 이벤트가 이어지는 동안 재장전하고,
  // 스크롤이 멈추면(160ms) 목표 위치에 닿았거나 너무 오래 걸렸을 때 풀어 실제 위치로 재계산한다.
  function navHoldLock() {
    if (!navLockKey) return;
    if (navLockTimer) clearTimeout(navLockTimer);
    navLockTimer = setTimeout(function () {
      navLockTimer = 0;
      if (!navLockKey) return;
      const el = document.getElementById(navLockKey);
      const settled = !el || Math.abs(el.getBoundingClientRect().top - navLine()) <= 32;
      if (settled || performance.now() - navLockAt > 1200) {
        navLockKey = null;
        setActiveNav(navSectionAt());
      } else {
        navHoldLock();
      }
    }, 160);
  }

  // 클릭·해시 이동에서 클릭한 항목을 즉시 칠하고, 부드러운 스크롤이 끝날 때까지
  // 스크롤 스파이가 중간 섹션으로 덮어쓰지 않도록 잠근다.
  function lockActiveNav(id) {
    if (window.__VIEWS_MODE__) return;
    const key = NAV_KEYS[id];
    if (!key) { navUnlock(); return; }
    navLockKey = key;
    navLockAt = performance.now();
    setActiveNav(key);
    navHoldLock();
  }

  function syncActiveNav() {
    if (window.__VIEWS_MODE__) return;          // 화면(view) 구조에서는 views.js가 담당
    if (navLockKey) { setActiveNav(navLockKey); navHoldLock(); return; }
    setActiveNav(navSectionAt());
  }

  function jumpTo(id) {
    if (!id) return;
    inertCancel();            // 화면을 옮기면 관성 회전도 끝냅니다
    if (window.__VIEWS_MODE__ && window.__views) { window.__views.go(id); return; }
    if (id === 'constellations') activateCatTab('const', false);
    else if (id === 'catalog') activateCatTab('objects', false);
    const target = id === 'glossary' ? 'glossaryPanel' : id;
    const el = document.getElementById(target);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// 에서 생길 수 있음 */ }
    if (NAV_KEYS[id]) lockActiveNav(id);
    else navUnlock();
  }

  function handleHash(id) {
    if (!id) return;
    if (window.__VIEWS_MODE__ && window.__views) { window.__views.go(id); return; }
    if (id === 'constellations') activateCatTab('const', false);
    else if (id === 'catalog') activateCatTab('objects', false);
    const target = id === 'glossary' ? 'glossaryPanel' : id;
    const el = document.getElementById(target);
    if (el) setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 40);
    if (NAV_KEYS[id]) lockActiveNav(id);
    else navUnlock();
  }

  function initNav() {
    /* 1) ☰ 더보기 드롭다운 */
    const btn = $('#btnMore'), menu = $('#moreMenu');
    if (btn && menu) {
      const closeMenu = function (focus) {
        if (menu.hidden) return;
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        if (focus) btn.focus();
      };
      const openMenu = function () {
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      };
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (menu.hidden) openMenu(); else closeMenu();
      });
      document.addEventListener('click', function (e) {
        if (menu.hidden || !e.target.closest) return;
        // ☰ 버튼과 하단 탭 '더보기'는 자기 핸들러가 열고 닫습니다.
        // (탭의 클릭이 그대로 문서까지 올라와 여기서 닫아 버리면, 열리자마자 사라져 '작동 안 됨'처럼 보입니다.)
        if (e.target.closest('#moreMenu') || e.target.closest('#btnMore') || e.target.closest('#tabMore')) return;
        closeMenu();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !menu.hidden) closeMenu(true);
      });
      menu.addEventListener('click', function (e) {
        const item = e.target.closest('a,button');
        if (!item) return;
        const act = item.getAttribute('data-open');
        if (act) {
          e.preventDefault();
          closeMenu();
          if (act === 'feedback' && window.Feedback) { window.Feedback.open(); return; }
          if (act === 'share') { shareApp(); return; }
          if (window.SpaceUI) {
            if (act === 'cookie') SpaceUI.openCookie();
            else if (act === 'ai') SpaceUI.openAI();
          }
          return;
        }
        const href = item.getAttribute('href');
        closeMenu();
        if (href && href.charAt(0) === '#') {
          e.preventDefault();
          jumpTo(href.slice(1));
        }
      });
    }

    /* 2) 주 내비 — 스무스 이동 */
    $$('.main-nav .nav-link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        const href = a.getAttribute('href');
        if (!href || href.charAt(0) !== '#') return;
        e.preventDefault();
        jumpTo(href.slice(1));
      });
    });

    /* 3) 도감 탭 */
    const tabs = $$('.cat-tab');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        const key = t.getAttribute('data-cat-tab');
        activateCatTab(key, false);
        try { history.replaceState(null, '', key === 'const' ? '#constellations' : '#catalog'); } catch (e) {}
      });
      t.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const i = tabs.indexOf(t);
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        next.click();
      });
    });

    /* 4) 스크롤 위치로 활성 메뉴 표시 (헤더 높이 보정 + 클릭 잠금) */
    let ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        syncActiveNav();
      });
    }, { passive: true });

    // 사용자가 직접 스크롤을 시작하면 클릭 잠금을 즉시 풀어 항상 실제 위치를 따른다.
    ['wheel', 'touchstart'].forEach(function (t) {
      window.addEventListener(t, navUnlock, { passive: true });
    });
    window.addEventListener('keydown', function (e) {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].indexOf(e.key) >= 0) navUnlock();
    });
    window.addEventListener('resize', function () { syncActiveNav(); });
    window.addEventListener('load', function () { syncActiveNav(); });
    requestAnimationFrame(function () { syncActiveNav(); });

    /* 5) 해시로 들어온 링크(#constellations·#catalog 등) 자동 탭 전환 */
    window.addEventListener('hashchange', function () { handleHash(location.hash.slice(1)); });
    if (location.hash) setTimeout(function () { handleHash(location.hash.slice(1)); }, 80);
  }

  /* ------------------------------------------------------------- 실행 */
  function init() {
    initSiteSelect();
    initControls();
    buildChips();
    renderGuide();
    renderBortle();
    calcDeclination();
    renderSites();
    renderEvents();
    initConGrid();
    initSkyMapZoom();
    renderChecklist();
    renderLogs();
    renderAll();
    calcExposure();
    calcOptics();
    drawHeroStars();
    initTermTips();
    initExtra();
    // '지금' 시각을 분 단위로 따라갑니다(탭으로 돌아오면 바로 한 번).
    setInterval(tickLiveClock, 5000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        // 창을 내리는 순간 — 돌아왔을 때 이전 각도에서 이어 적분하지 않도록 정렬 표시만 해 둡니다.
        inertCancel();          // 관성 회전도 함께 멈춥니다(안 보이는 동안 돌지 않게)
        trackRealign('hidden');
        return;
      }
      tickLiveClock();
      // 화면을 다시 열면 센서 표본이 끊긴 사이의 회전이 사라졌습니다 — 지금 폰이 향한 방향으로 즉시 재정렬.
      trackRealign('visible');
      liveResize();          // 백그라운드에서 화면을 돌렸으면 캔버스 크기도 새로
      kickLive();
    });
    // 뒤로 가기 캐시로 되살아난 경우(폰에서 다른 앱을 다녀온 경우 포함)
    window.addEventListener('pageshow', function () { trackRealign('pageshow'); });
    // 창이 다시 앞으로 나왔고 그새 표본이 끊겼을 때만 — 화면을 누르기만 해서 focus 된 경우는 그대로 둡니다.
    window.addEventListener('focus', function () {
      if (sensorStale(500)) trackRealign('focus');
    });
    window.addEventListener('resize', function () {
      if ($('#skyMap')) {
        try { renderSkyMap(state.last); } catch (e) {}
      }
    });
  }

  // 다른 페이지·스크립트에서 쓸 수 있는 최소 공개 API
  // 임의 좌표(적경·적위)로 라이브 하늘 뷰를 조준한다 — 확장 도감·관측 자료관에서 사용
  function aimRaDec(raDeg, decDeg, name) {
    if (raDeg == null || decDeg == null || !isFinite(raDeg) || !isFinite(decDeg)) return false;
    inertCancel();
    const c = state.last || computeNight();
    const h = A.equatorialToHorizontal(A.mod(raDeg, 360) / 15, decDeg, state.site.lat, state.site.lon, c.jd);
    state.follow = null;
    live.targetAz = A.mod(h.az, 360);
    live.targetAlt = clamp(h.alt, -8, 88);
    aimSet({ raH: A.mod(raDeg, 360) / 15, decD: decDeg, name: name || '천체' });
    liveDirty = true;
    kickLive();
    // aimAt과 같은 이유로, 다른 화면에서 부르면 라이브 하늘 화면으로 전환합니다.
    if (window.__VIEWS_MODE__ && window.__views && window.__views.current() !== 'live') {
      jumpTo('live');
    } else {
      const sec = $('#live');
      if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (h.alt < 0) toast((name || '천체') + josa(name || '천체', '은', '는') + ' 지금 지평선 아래(' + nf(h.alt, 0) + '°)입니다. 지평선 쪽으로 맞췄습니다.');
    else toast((name || '천체') + ' 방향으로 시선을 맞췄습니다 — ' + dirName(h.az) + ' ' + nf(h.alt, 0) + '°.');
    return true;
  }

  window.OneulBam = {
    openObject: openObject,
    openConstellation: openConstellation,
    computeNight: computeNight,
    aimAt: aimAt,
    aimRaDec: aimRaDec,
    aimObject: aimObject,
    showInspector: showInspector,
    setViewDate: setViewDate,
    applyPreset: applyPreset,
    state: state,
    live: live,
    version: D.meta.version
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
