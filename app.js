/* =========================================================================
   오늘밤별 — app.js (UI · 계산 · 저장)
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
    get: function (k, fallback) {
      try {
        const v = localStorage.getItem('ob.' + k);
        return v == null ? fallback : JSON.parse(v);
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
  const state = {
    site: savedSite && savedSite.lat != null ? savedSite : Object.assign({}, D.meta.defaultSite),
    dateStr: todayKST(),
    timeStr: '',
    equip: 1,
    filter: { type: 'all', equip: 'all', season: 'all', q: '' },
    siteRegion: '전체',
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

    // 시간별 구름양(Open-Meteo) — 캐시된 값만 동기로 읽는다. 없으면 다음 틱에 받아 다시 그린다.
    const wx = (window.SkyWeather ? SkyWeather.cached(lat, lon, state.dateStr) : null);
    let cloud = null, cloudAt = null;
    if (wx && wx.status === 'ok') {
      cloudAt = SkyWeather.cloudFor(wx, { hour: selectedHour() });
      if (state.timeStr || state.simJd != null) cloud = cloudAt;
      if (cloud == null) {
        const win = darkWindowHours(darkStart, darkEnd);
        cloud = SkyWeather.cloudFor(wx, { startH: win.start, endH: win.end });
      }
      if (cloud == null) cloud = cloudAt;
    }
    const score = A.observingScore(phase.illum, state.site.bortle, darkHours, cloud);

    return {
      night: night, jd: jd, sun: sun, sunHor: sunHor, moonPos: moonP, moonHor: moonH,
      phase: phase, planets: planets, darkStart: darkStart, darkEnd: darkEnd,
      darkHours: darkHours, score: score, lst: A.lstHours(jd, lon),
      wx: wx, cloud: cloud, cloudAt: cloudAt
    };
  }

  // 선택 시각(0~23). 시각을 비우면 오늘은 지금, 다른 날은 22시.
  function selectedHour() {
    if (state.timeStr) return parseInt(state.timeStr, 10);
    if (state.simJd != null) return parseInt(A.fmtClock(state.simJd), 10);
    if (state.dateStr === todayKST()) return new Date(Date.now() + 9 * 3600000).getUTCHours();
    return 22;
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
      : (state.timeStr || (state.dateStr === todayKST() ? '지금' : '22:00 기준'));
    $('#summaryDate').textContent = (Number(state.dateStr.slice(5, 7))) + '월 ' +
      Number(state.dateStr.slice(8, 10)) + '일 (' + weekdayKR(state.dateStr) + ') ' + timeLabel;
    $('#summaryPlace').textContent = site.name + ' · Bortle ' + (site.bortle || '?');

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
    $('#heroScoreNum').title = scoreLabel;

    // 점수 산출 근거 배지 — 구름 · 달 · Bortle
    const basis = $('#heroScoreBasis');
    if (basis) {
      const bits = [];
      if (c.cloud != null) bits.push('<span class="sb-cloud">구름 ' + Math.round(c.cloud) + '%</span>');
      else if (c.wx) bits.push('<span class="sb-none">구름 예보 없음</span>');
      else bits.push('<span class="sb-loading">구름 확인 중</span>');
      bits.push('<span>달 ' + Math.round(c.phase.illum * 100) + '%</span>');
      bits.push('<span>Bortle ' + (site.bortle || '?') + '</span>');
      basis.innerHTML = bits.join('<i aria-hidden="true">·</i>');
      basis.title = c.cloud != null
        ? '구름 ' + Math.round(c.cloud) + '%는 관측 지수에 가장 크게 반영됩니다(85% 이상은 관측이 어렵습니다).'
        : '구름 예보가 없어 맑은 하늘(구름 0%)을 가정했습니다.';
    }

    const hc = $('#heroCloud');
    if (hc) {
      if (c.wx && c.wx.status === 'ok') {
        const win = darkWindowHours(c.darkStart, c.darkEnd);
        const nv = SkyWeather.cloudFor(c.wx, { startH: win.start, endH: win.end });
        hc.textContent = nv == null ? '—' : Math.round(nv) + '% · ' + SkyWeather.labelOf(nv);
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
        : wx.reason === 'timeout' ? '기상 예보 응답이 늦어 시간 초과했습니다.'
          : wx.reason === 'network' ? '기상 서버에 연결하지 못했습니다.'
            : '이 날짜·지점의 시간별 예보가 없습니다.';
      chart.innerHTML = '<div class="cc-empty"><b>기상 예보 미제공</b>' +
        '<span>' + esc(why) + ' 관측 지수는 <b>맑음 기준(구름 0%)</b>으로 계산했습니다.</span></div>';
      if (pill) { pill.textContent = '예보 없음'; pill.className = 'cloud-pill is-none'; }
      if (note) note.textContent = 'Open-Meteo · ' + (wx.reason === 'range' ? '예보 범위 밖' : '연결 실패');
      if (foot) foot.textContent = '예보가 없는 날은 구름을 0%로 두고 계산합니다. 당일 다시 확인하면 정확해집니다.';
      return;
    }

    const best = SkyWeather.bestWindow(wx);
    const showBest = !!best && best.hours < wx.series.length;
    const avg = SkyWeather.cloudFor(wx, { startH: win.start, endH: win.end });
    let html = '<div class="cc-cols">';
    wx.series.forEach(function (s) {
      const v = s.cloud == null ? null : Math.round(s.cloud);
      let cls = 'cc-col';
      if (v == null) cls += ' is-na';
      else if (v <= 25) cls += ' is-clear';
      else if (v <= 50) cls += ' is-some';
      else if (v <= 85) cls += ' is-many';
      else cls += ' is-over';
      if (showBest && s.abs >= best.from && s.abs <= best.to) cls += ' is-best';
      if (s.hour === 0) cls += ' is-midnight';
      const hPct = v == null ? 0 : Math.max(3, v);
      const tip = hh(s.hour) + '시 · 구름 ' + (v == null ? '정보 없음' : v + '%') +
        (s.precip != null ? ' · 강수확률 ' + Math.round(s.precip) + '%' : '');
      html += '<div class="' + cls + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
        '<span class="cc-val">' + (v == null ? '–' : v) + '</span>' +
        '<div class="cc-bar"><i style="height:' + hPct + '%"></i></div>' +
        '<span class="cc-h">' + hh(s.hour) + '</span>' +
        '</div>';
    });
    html += '</div>';
    if (showBest && best) {
      html += '<p class="cc-recommend">🎯 가장 맑은 관측 시간 <b>' + hh(best.from) + '시 – ' + hh(best.to) + '시</b>' +
        '<span>평균 구름 ' + Math.round(best.mean) + '%</span></p>';
    } else if (best) {
      html += '<p class="cc-recommend">🌙 밤새 구름이 적습니다 <b>18시 – 06시</b>' +
        '<span>평균 구름 ' + Math.round(best.mean) + '%</span></p>';
    }
    chart.innerHTML = html;

    const shown = avg == null ? '—' : Math.round(avg) + '%';
    if (pill) { pill.textContent = shown + ' · ' + SkyWeather.labelOf(avg); pill.className = 'cloud-pill ' + cloudClass(avg); }
    if (note) note.textContent = 'Open-Meteo · ' + kstClock(wx.fetchedAt) + ' 갱신 · 오늘 18시 → 내일 06시';
    if (foot) {
      foot.innerHTML = '밤 평균 구름 <b>' + shown + '</b> — 달·광공해와 함께 관측 지수에 반영됩니다. ' +
        '<span class="cc-hint">막대에 마우스를 올리면 그 시각 강수확률까지 보입니다.</span> ' +
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
      if (sunAlt > -12) flags.push('박명 중');
      if (moonBright && isDeepSky(o)) { flags.push('달빛 주의'); if (!opts.ignoreMoon) value -= 14; }
      if (o.group === 'meteor') {
        const mi = meteorInfo(o, state.dateStr);
        flags.push(mi.daysToPeak === 0 ? '오늘 극대' : (mi.daysToPeak > 0 ? '극대 D-' + mi.daysToPeak : '극대 지남'));
        if (c.phase.illum > 0.5) { flags.push('달빛 주의'); if (!opts.ignoreMoon) value -= 16; }
      }
      if (moonBright && o.dynamic && pos.mag > 1) value -= 3;

      let why, stateLabel;
      if (pos.hor.alt >= 25) { why = dirName(pos.hor.az) + ' ' + Math.round(pos.hor.alt) + '°'; stateLabel = '지금 좋음'; }
      else if (pos.hor.alt >= 8) { why = dirName(pos.hor.az) + ' ' + Math.round(pos.hor.alt) + '°'; stateLabel = '낮은 하늘'; }
      else if (pos.hor.alt >= 0) { why = dirName(pos.hor.az) + ' ' + Math.round(pos.hor.alt) + '°'; stateLabel = '지평선'; }
      else if (ni.riseJd && ni.riseJd > jd) { why = A.fmtClock(ni.riseJd) + ' 월출/출'; stateLabel = '곧 뜸'; }
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
    const rows = c.planets.map(function (p) {
      const hor = p.hor, ni = p.nightInfo;
      let vis, cls;
      const riseHour = ni.riseJd ? Number(A.fmtClock(ni.riseJd).slice(0, 2)) : null;
      const setHour = ni.setJd ? Number(A.fmtClock(ni.setJd).slice(0, 2)) : null;
      if (ni.neverUp) { vis = '관측 불가'; cls = 'badge-bad'; }
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
        '<td><span class="badge ' + cls + '">' + vis + '</span></td>' +
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

  function renderSkyMap(c) {
    const svg = $('#skyMap');
    const lat = state.site.lat, lon = state.site.lon, jd = c.jd;
    const W = 420, cx = 210, cy = 206, R = 184;
    function proj(alt, az) {
      const r = R * (90 - alt) / 90;
      const th = az * Math.PI / 180;
      return { x: cx - r * Math.sin(th), y: cy - r * Math.cos(th) };
    }
    let s = '';
    s += '<defs><radialGradient id="skyG" cx="50%" cy="45%" r="60%">' +
      '<stop offset="0%" stop-color="rgba(30,48,90,.55)"/><stop offset="100%" stop-color="rgba(6,10,20,.9)"/>' +
      '</radialGradient></defs>';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#skyG)" stroke="rgba(255,255,255,.18)" stroke-width="1"/>';
    [30, 60].forEach(function (alt) {
      const r = R * (90 - alt) / 90;
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r.toFixed(1) + '" fill="none" stroke="rgba(255,255,255,.07)" stroke-dasharray="3 5"/>';
      s += '<text x="' + (cx + 3) + '" y="' + (cy - r + 11) + '" class="sky-label" opacity=".55">' + alt + '°</text>';
    });
    // 방위 눈금
    for (let az = 0; az < 360; az += 30) {
      const p1 = proj(0, az), p2 = proj(3, az);
      s += '<line x1="' + p1.x.toFixed(1) + '" y1="' + p1.y.toFixed(1) + '" x2="' + p2.x.toFixed(1) + '" y2="' + p2.y.toFixed(1) + '" stroke="rgba(255,255,255,.22)" stroke-width="1"/>';
    }
    [['북', 0], ['동', 90], ['남', 180], ['서', 270]].forEach(function (d) {
      const p = proj(-4.5, d[1]);
      s += '<text x="' + p.x.toFixed(1) + '" y="' + p.y.toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" class="sky-cardinal">' + d[0] + '</text>';
    });

    // 별 — 1,600여 개. 밝은 별은 하나씩, 나머지는 등급·색 묶음별 path 하나로 그려 DOM을 줄인다.
    const visibleStars = {};
    const pos = new Array(D.stars.length);
    const dots = {};
    D.stars.forEach(function (st, i) {
      const h = A.equatorialToHorizontal(st[1], st[2], lat, lon, jd);
      if (h.alt <= 0) return;
      const p = proj(h.alt, h.az);
      pos[i] = p;
      visibleStars[st[0]] = p;
      const mag = st[3];
      if (mag <= 2.0) {
        const size = mag < 0.4 ? 2.9 : mag < 1.4 ? 2.3 : 1.9;
        s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + size +
          '" fill="' + bvColor(st[4]) + '" opacity=".96"/>';
        return;
      }
      const key = (mag <= 3.5 ? 'mid' : mag <= 4.5 ? 'faint' : 'dim') + (isWarm(st[4]) ? 'Warm' : 'Cool');
      (dots[key] = dots[key] || []).push(p);
    });
    const DOT_STYLE = {
      midCool: ['#dbe6ff', 1.8, 0.82], midWarm: ['#fff0d8', 1.8, 0.82],
      faintCool: ['#cddcff', 1.35, 0.6], faintWarm: ['#ffe9cc', 1.35, 0.6],
      dimCool: ['#bccdf0', 1, 0.4], dimWarm: ['#ffdcbc', 1, 0.4]
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
      const op = (0.08 + 0.12 * frac) * (con.rank === 1 ? 1.45 : con.rank === 2 ? 1.12 : 0.9);
      s += '<g data-sky="con:' + esc(con.abbr) + '" style="cursor:pointer">' +
        '<path d="' + d + '" fill="none" stroke="rgba(140,175,255,' + Math.min(0.42, op).toFixed(2) + '" stroke-width="' +
        (con.rank === 1 ? 1.15 : 0.85) + '" stroke-linecap="round"/>' +
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
      s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4.2" fill="none" stroke="rgba(126,224,192,.75)" stroke-width="1" stroke-dasharray="1.5 1.5"/>';
    });

    // ── 이름표 배치: 밝은 별 → 딥스카이 → 별자리. 겹치면 뒤 순위는 포기한다.
    ['시리우스', '베텔게우스', '리겔', '베가', '데네브', '알타이르', '카펠라', '폴룩스', '아르크투루스', '안타레스',
      '스피카', '레굴루스', '폴라리스', '알데바란', '프로키온', '포말하우트', '카노푸스', '아케르나르'].forEach(function (nm) {
      const p = visibleStars[nm];
      if (!p) return;
      const w = nm.length * 8.5 * 0.98;
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
      const size = it.con.rank === 1 ? 9.2 : it.con.rank === 2 ? 7.8 : 6.9;
      const op = it.con.rank === 1 ? 0.66 : it.con.rank === 2 ? 0.48 : 0.36;
      if (putLabel(it.con.name, it.x, it.y, size, 'rgba(150,180,255,' + op + ')', 'sky-con-name')) drawn++;
    });

    // 행성
    c.planets.forEach(function (p) {
      if (p.hor.alt <= 0) return;
      const pnt = proj(p.hor.alt, p.hor.az);
      const color = {
        mercury: '#dcdcdc', venus: '#ffeab0', mars: '#ff8a6a', jupiter: '#ffd9a0',
        saturn: '#f0e2ad', uranus: '#9fe8e0', neptune: '#9db8ff'
      }[p.key];
      s += '<circle cx="' + pnt.x.toFixed(1) + '" cy="' + pnt.y.toFixed(1) + '" r="3.4" fill="' + color + '"/>';
      s += '<text x="' + (pnt.x + 6).toFixed(1) + '" y="' + (pnt.y - 3).toFixed(1) + '" class="sky-planet-label" fill="' + color + '">' + p.name + '</text>';
    });

    // 달
    if (c.moonHor.alt > 0) {
      const p = proj(c.moonHor.alt, c.moonHor.az);
      s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="7" fill="rgba(255,240,200,' + (0.3 + c.phase.illum * 0.7).toFixed(2) + ')"/>';
      s += '<text x="' + (p.x + 9).toFixed(1) + '" y="' + (p.y + 4).toFixed(1) + '" class="sky-planet-label" fill="#ffeec8">달</text>';
    }

    // 천정
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="1.6" fill="rgba(255,255,255,.5)"/>';

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
    svg.style.touchAction = 'manipulation';
    $$('#skyMap [data-sky]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        const v = el.getAttribute('data-sky').split(':');
        showInspector(v[0], v.slice(1).join(':'));
      });
    });
    $('#skyMapNote').textContent = state.simJd != null
      ? A.fmtClock(state.simJd) + ' KST (타임랩스)'
      : (state.timeStr ? state.timeStr + ' KST' : (state.dateStr === todayKST() ? '현재 시각' : '22:00 KST'));
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
        $('#timeInput').value = '';
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

    // 상단 사진 카드 — NASA·허블·제임스웹 또는 실제 하늘 탐사 사진
    if (window.SkyPhoto) {
      const body = $('#modalBody');
      const fig = SkyPhoto.figure(o, { variant: 'modal' });
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
  function calcExposure() {
    const f = Number($('#exFocal').value) || 24;
    const N = Number($('#exAperture').value) || 2.8;
    const sensor = ($('#exSensor').value || '9.6,7.2').split(',').map(Number);
    if (!sensor[0] || !sensor[1]) { sensor[0] = 9.6; sensor[1] = 7.2; }
    const w = sensor[0], h = sensor[1];
    const mp = Number($('#exMp').value) || 12;
    const dec = Number($('#exDec').value) || 0;

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
    const Dm = Number($('#opAperture').value) || 130;
    const F = Number($('#opFocal').value) || 650;
    const eFL = Number($('#opEyepiece').value) || 25;
    const afov = Number($('#opAfov').value) || 50;

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
    const dIn = dRaw === '' ? null : Number(dRaw);

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
  function renderChecklist() {
    const saved = store.get('checklist', {});
    let total = 0, done = 0;
    let html = '';
    D.checklist.forEach(function (group, gi) {
      html += '<div class="check-group"><h4>' + esc(group.group) + '</h4>';
      group.items.forEach(function (item, ii) {
        const key = gi + '-' + ii;
        total++;
        const checked = !!saved[key];
        if (checked) done++;
        html += '<label class="check-item' + (checked ? ' checked' : '') + '">' +
          '<input type="checkbox" data-key="' + key + '"' + (checked ? ' checked' : '') + '>' +
          '<span>' + esc(item) + '</span></label>';
      });
      html += '</div>';
    });
    $('#checklistList').innerHTML = html;
    $('#checkCount').textContent = done + ' / ' + total;
    $('#checkProgress').style.width = (total ? done / total * 100 : 0) + '%';

    $$('#checklistList input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        const s = store.get('checklist', {});
        s[cb.getAttribute('data-key')] = cb.checked;
        store.set('checklist', s);
        cb.closest('.check-item').classList.toggle('checked', cb.checked);
        renderChecklist();
      });
    });
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
        '<button class="del" data-i="' + i + '" aria-label="이 기록 삭제">×</button></span></div>' +
        '<div class="small muted">' + esc(l.equip) + ' · ' + esc(l.target || '—') + ' · 시상 ' + l.seeing + '/5 · 투명도 ' + l.trans + '/5</div>' +
        (l.memo ? '<p>' + esc(l.memo) + '</p>' : '') + '</div>';
    }).join('');
    $$('#logList .del').forEach(function (b) {
      b.addEventListener('click', function () {
        const i = Number(b.getAttribute('data-i'));
        const logs2 = store.get('logs', []);
        logs2.splice(i, 1);
        store.set('logs', logs2);
        renderLogs();
        toast('기록을 삭제했습니다.');
      });
    });
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

    let list = D.sites.filter(function (s) { return state.siteRegion === '전체' || s.region === state.siteRegion; });
    if ($('#onlyNoBooking') && $('#onlyNoBooking').checked) {
      list = list.filter(function (s) { return !s.booking || /불필요|없/.test(s.booking); });
    }
    if (state.siteSortNear) {
      list = list.slice().sort(function (a, b) { return distanceKm(a) - distanceKm(b); });
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
      return '<details class="principle"' + (i === 0 ? ' open' : '') + '><summary>' + esc(p.title) + '</summary>' +
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
    } else if (kind === 'sun') {
      const sp = A.sunPos(jd);
      raH = sp.raH; decD = sp.decD; name = '태양';
      sub = '항성 · 절대 맨눈·광학기기 직접 관측 금지';
      note = '태양을 망원경·쌍안경으로 직접 보면 즉시 실명할 수 있습니다. 태양 전용 필터를 갖춘 장비로만 관측하세요.';
    }
    if (raH == null) return null;
    const hor = A.equatorialToHorizontal(raH, decD, lat, lon, jd);
    const ni = A.objectNight(raH, decD, lat, lon, state.dateStr);
    return {
      kind: kind, key: key, name: name, sub: sub, note: note, objId: objId, cells: cells,
      mag: mag, raH: raH, decD: decD, alt: hor.alt, az: hor.az, ni: ni
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
    const c = state.last || computeNight();
    const info = skyInfo(kind, key, c.jd);
    if (!info) return;
    state.follow = { kind: kind, key: key };
    live.targetAz = info.az;
    live.targetAlt = clamp(info.alt, -8, 88);
    liveDirty = true;
    kickLive();
    showInspector(kind, key);
    const sec = $('#live');
    if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (info.alt < 0) toast(info.name + josa(info.name, '은', '는') + ' 지금 지평선 아래(' + nf(info.alt, 0) + '°)입니다. 지평선 쪽으로 맞췄습니다.');
    else if (info.alt < 12) toast(info.name + josa(info.name, '은', '는') + ' 낮은 하늘 ' + dirName(info.az) + ' ' + nf(info.alt, 0) + '°에 있습니다.');
    else toast(info.name + ' 방향으로 시선을 맞췄습니다 — ' + dirName(info.az) + ' ' + nf(info.alt, 0) + '°.');
  }

  /* ======================================================================
     ② 라이브 하늘 뷰 (스텔라리움 모드) — Canvas 투영 + 센서
     ====================================================================== */
  const live = {
    az: 180, alt: 32, fov: 65, targetAz: 180, targetAlt: 32,
    labels: true, deep: true, sensor: false, gotEvent: false,
    w: 0, h: 0, dpr: 1, canvas: null, ctx: null,
    raf: null, hits: [], lastIv: 0, lastCenter: ''
  };
  let liveDirty = true;

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
    kickLive();
  }

  function kickLive() {
    if (live.raf) return;
    live.raf = requestAnimationFrame(liveTick);
  }

  function liveTick() {
    live.raf = null;
    let animating = false;
    const dAz = shortestDelta(live.az, live.targetAz);
    const dAlt = live.targetAlt - live.alt;
    if (Math.abs(dAz) > 0.12 || Math.abs(dAlt) > 0.12) {
      const k = live.sensor ? 0.28 : 0.2;
      live.az = A.mod(live.az + dAz * k, 360);
      live.alt = clamp(live.alt + dAlt * k, -18, 89);
      animating = true;
      liveDirty = true;
    }
    if (liveDirty) {
      liveDraw();
      syncLiveInputs();
      liveDirty = false;
    }
    if (animating || live.sensor) kickLive();
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

  function livePalette() {
    if (isRed()) {
      return {
        bg1: '#1d0805', bg2: '#080101', grid: 'rgba(255,120,90,.13)', gridHi: 'rgba(255,150,110,.34)',
        label: '#c1644a', star: '#ffb9a2', con: 'rgba(255,110,80,.22)', dso: '#ff8a5c',
        horizon: 'rgba(255,130,95,.55)', ground: 'rgba(26,4,2,.88)', planet: '#ffd0b0'
      };
    }
    return {
      bg1: '#0d1c3e', bg2: '#010206', grid: 'rgba(150,180,255,.11)', gridHi: 'rgba(160,200,255,.34)',
      label: '#93a9d4', star: '#ffffff', con: 'rgba(120,160,255,.24)', dso: '#7ee0c0',
      horizon: 'rgba(150,190,255,.5)', ground: 'rgba(3,6,14,.92)', planet: '#ffe8c0'
    };
  }

  function liveDraw() {
    const ctx = live.ctx;
    if (!ctx || !live.w || !live.h) return;
    const W = live.w, H = live.h, cx = W / 2, cy = H / 2;
    const c = state.last || computeNight();
    const jd = c.jd;
    const lat = state.site.lat, lon = state.site.lon;
    const pal = livePalette();
    const fovDeg = clamp(live.fov, 20, 130);
    const fov = fovDeg * RAD;
    const stereo = fovDeg >= 90;

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

    const cAlt = clamp(live.alt, -18, 89) * RAD, cAz = live.az * RAD;
    const fwd = [Math.cos(cAlt) * Math.sin(cAz), Math.cos(cAlt) * Math.cos(cAz), Math.sin(cAlt)];
    const upRef = Math.abs(fwd[2]) > 0.999 ? [0, 1, 0] : [0, 0, 1];
    const cross = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
    const dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
    const norm = function (a) { const l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const right = norm(cross(fwd, upRef));
    const up = cross(right, fwd);
    const kG = (H / 2) / Math.tan(fov / 2);
    const kS = (H / 2) / Math.tan(fov / 4);

    function project(alt, az) {
      const al = alt * RAD, z = az * RAD;
      const d = [Math.cos(al) * Math.sin(z), Math.cos(al) * Math.cos(z), Math.sin(al)];
      const dy = dot(d, fwd);
      const dx = dot(d, right), dz = dot(d, up);
      if (stereo) {
        const den = 1 + dy;
        if (den < 0.12) return null;
        const k = kS / den;
        return { x: cx + dx * k, y: cy - dz * k };
      }
      if (dy <= 0.08) return null;
      const k = kG / dy;
      return { x: cx + dx * k, y: cy - dz * k };
    }
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

    /* 땅(지평선 아래) */
    const horizon = [];
    for (let az = 0; az <= 360; az += 3) horizon.push(project(0, az % 360));
    const hValid = horizon.filter(function (p) { return !!p; });
    if (hValid.length > 1) {
      ctx.beginPath();
      ctx.moveTo(hValid[0].x, hValid[0].y);
      for (let i = 1; i < hValid.length; i++) ctx.lineTo(hValid[i].x, hValid[i].y);
      ctx.lineTo(hValid[hValid.length - 1].x, H + 20);
      ctx.lineTo(hValid[0].x, H + 20);
      ctx.closePath();
      ctx.fillStyle = dayF > 0.02 ? mixHex(isRed() ? '#1a0402' : '#03060e', isRed() ? '#43140b' : '#5b6f7c', dayF * 0.7) : pal.ground;
      ctx.fill();
    }
    strokePts(horizon, pal.horizon, 1.6);

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

    /* 고도·방위 눈금 */
    [15, 30, 45, 60, 75].forEach(function (alt) {
      const pts = [];
      for (let az = 0; az <= 360; az += 4) pts.push(project(alt, az % 360));
      strokePts(pts, pal.grid, 1, alt % 30 === 0 ? null : [3, 5]);
    });
    for (let az = 0; az < 360; az += 30) {
      const pts = [];
      for (let alt = 0; alt <= 88; alt += 3) pts.push(project(alt, az));
      strokePts(pts, az % 90 === 0 ? pal.gridHi : pal.grid, 1);
    }

    /* 방위 글자 */
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    [['북', 0], ['동', 90], ['남', 180], ['서', 270]].forEach(function (d) {
      const p = project(1.2, d[1]);
      if (!inBox(p, 6)) return;
      ctx.fillStyle = pal.gridHi;
      ctx.fillText(d[0], p.x + 4, p.y - 8);
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

    /* 별 */
    const starPts = new Array(D.stars.length);
    const starByName = {};
    const labelStars = ['시리우스', '베텔게우스', '리겔', '베가', '데네브', '알타이르', '카펠라', '폴룩스', '아르크투루스',
      '안타레스', '스피카', '레굴루스', '폴라리스', '알데바란', '프로키온', '포말하우트', '카스토르', '미라크', '카노푸스', '아케르나르'];
    const starBuckets = {};
    const starFade = 1 - dayF * 0.92;
    D.stars.forEach(function (st, i) {
      const h = A.equatorialToHorizontal(st[1], st[2], lat, lon, jd);
      if (h.alt < -2) return;
      const p = project(h.alt, h.az);
      if (!inBox(p, 10)) return;
      starPts[i] = p;
      starByName[st[0]] = p;
      if (starFade < 0.06) return;
      const mag = st[3];
      const r = mag <= 2.0 ? 2.6 : mag <= 3.2 ? 1.8 : mag <= 4.2 ? 1.3 : 0.9;
      const key = bvColor(st[4]) + '|' + r;
      (starBuckets[key] = starBuckets[key] || []).push(p);
      if (mag <= 2.3) live.hits.push({ x: p.x, y: p.y, kind: 'star', key: st[0], name: st[0] });
    });
    Object.keys(starBuckets).forEach(function (key) {
      const parts = key.split('|');
      const r = Number(parts[1]);
      ctx.globalAlpha = clamp(1.05 - (r < 1 ? 0.52 : r < 1.5 ? 0.34 : r < 2 ? 0.2 : 0.06), 0.25, 1) * starFade;
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
      ctx.strokeStyle = isRed() ? pal.con : 'rgba(120,160,255,' + Math.min(0.46, (0.10 + 0.20 * frac) * (con.rank === 1 ? 1.25 : con.rank === 2 ? 1 : 0.86) * (1 - dayF * 0.7)).toFixed(3) + ')';
      ctx.lineWidth = con.rank === 1 ? 1.15 : 0.85;
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
        ctx.globalAlpha = it.con.rank === 1 ? 0.85 : it.con.rank === 2 ? 0.68 : 0.52;
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
        live.hits.push({ x: p.x, y: p.y, kind: 'dso', key: o.id, name: o.name });
        inView.push({ kind: 'dso', key: o.id, name: o.name, alt: h.alt, az: h.az, d: Math.hypot(p.x - cx, p.y - cy) });
      });
    }

    /* 행성 */
    const planetColor = {
      mercury: '#dcdcdc', venus: '#ffeab0', mars: '#ff8a6a', jupiter: '#ffd9a0',
      saturn: '#f0e2ad', uranus: '#9fe8e0', neptune: '#9db8ff'
    };
    c.planets.forEach(function (pl) {
      if (pl.hor.alt < -1) return;
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
      live.hits.push({ x: p.x, y: p.y, kind: 'planet', key: pl.key, name: pl.name });
      inView.push({ kind: 'planet', key: pl.key, name: pl.name, alt: pl.hor.alt, az: pl.hor.az, d: Math.hypot(p.x - cx, p.y - cy) });
    });

    /* 달 (위상까지) */
    const moonP = A.moonPos(jd), moonPh = A.moonPhase(jd);
    const moonH = A.equatorialToHorizontal(moonP.raH, moonP.decD, lat, lon, jd);
    const moonPt = moonH.alt > -1 ? project(moonH.alt, moonH.az) : null;
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
      live.hits.push({ x: moonPt.x, y: moonPt.y, kind: 'moon', key: '', name: '달' });
      inView.push({ kind: 'moon', key: '', name: '달', alt: moonH.alt, az: moonH.az, d: Math.hypot(moonPt.x - cx, moonPt.y - cy) });
    }

    /* 태양 */
    const sunH = { alt: c.sunHor.alt, az: c.sunHor.az };
    if (sunH.alt > -8) {
      const p = project(sunH.alt, sunH.az);
      if (inBox(p, 50)) {
        const pxDeg2 = H / live.fov;
        const sr = Math.max(5, pxDeg2 * 0.27);
        const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sr * 7);
        g2.addColorStop(0, 'rgba(255,244,200,.98)');
        g2.addColorStop(0.18, 'rgba(255,220,140,.55)');
        g2.addColorStop(0.5, 'rgba(255,180,90,.16)');
        g2.addColorStop(1, 'rgba(255,160,70,0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sr * 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,246,214,.98)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, sr, 0, Math.PI * 2);
        ctx.fill();
        if (live.labels) drawLabel('태양', p.x + sr + 5, p.y - 3, '#ffe9a8', '700 12px system-ui, sans-serif');
        live.hits.push({ x: p.x, y: p.y, kind: 'sun', key: '', name: '태양' });
        inView.push({ kind: 'sun', key: '', name: '태양', alt: sunH.alt, az: sunH.az, d: Math.hypot(p.x - cx, p.y - cy) });
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

  function liveHandleClick(ev) {
    const stage = $('#liveStage');
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    let best = null, bestD = 28;
    live.hits.forEach(function (h) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bestD) { bestD = d; best = h; }
    });
    if (best) showInspector(best.kind, best.key);
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
  }

  function sensorFail(msg) {
    live.sensor = false;
    window.removeEventListener('deviceorientation', onOrientation, true);
    setSensorUi(false, 'error', '센서 차단됨');
    const help = $('#liveHelp');
    if (help) {
      help.innerHTML = '<b>' + esc(msg) + '.</b> 센서는 HTTPS(보안 연결)에서만 허용되며 iOS는 권한 허용이 필요합니다. ' +
        '지금은 <b>드래그·터치</b> 또는 <b>북/동/남/서/천정</b> 버튼과 방위·고도 슬라이더로 하늘을 둘러보세요.';
    }
    toast(msg + ' — 드래그·버튼으로 둘러볼 수 있습니다.');
  }

  function onOrientation(ev) {
    if (!live.sensor) return;
    const hasHeading = typeof ev.webkitCompassHeading === 'number' && !isNaN(ev.webkitCompassHeading);
    if (!hasHeading && ev.alpha == null) return;
    live.gotEvent = true;
    let heading;
    if (hasHeading) heading = ev.webkitCompassHeading;
    else heading = 360 - ev.alpha;
    live.targetAz = A.mod(heading, 360);
    let beta = (ev.beta == null ? 90 : ev.beta);
    let altRaw = beta - 90;
    if (altRaw < -90) altRaw += 360;
    live.targetAlt = clamp(altRaw, -12, 89);
    if (!live.raf) setSensorUi(true, 'on', '센서 연결됨');
    liveDirty = true;
    kickLive();
  }

  function enableSensor() {
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) { sensorFail('이 브라우저에는 방향 센서 API가 없습니다'); return; }
    const proceed = function () {
      live.sensor = true;
      live.gotEvent = false;
      window.addEventListener('deviceorientation', onOrientation, true);
      setSensorUi(true, 'on', '센서 연결 중…');
      setTimeout(function () {
        if (live.sensor && !live.gotEvent) sensorFail('센서 값을 받지 못했습니다(HTTPS·권한 확인)');
      }, 2400);
      kickLive();
    };
    if (typeof DOE.requestPermission === 'function') {
      let p;
      try { p = DOE.requestPermission(); } catch (e) { sensorFail('센서 권한 요청을 시작할 수 없습니다'); return; }
      Promise.resolve(p).then(function (res) {
        if (res === 'granted') proceed();
        else sensorFail('센서 권한이 거부되었습니다');
      }).catch(function () { sensorFail('센서 권한 요청이 차단되었습니다'); });
    } else {
      proceed();
    }
  }

  function disableSensor(silent) {
    if (!live.sensor) return;
    live.sensor = false;
    window.removeEventListener('deviceorientation', onOrientation, true);
    setSensorUi(false, 'off', '센서 꺼짐');
    if (!silent) toast('센서를 껐습니다. 드래그·버튼으로 둘러보세요.');
  }

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

  function initLive() {
    if (!$('#liveStage')) return;
    liveResize();
    pickStartView();
    window.addEventListener('resize', function () { liveResize(); });
    if (window.ResizeObserver) {
      try { new ResizeObserver(function () { liveResize(); }).observe($('#liveStage')); } catch (e) { }
    }
    setSensorUi(false, 'off', '센서 꺼짐');
    syncLiveInputs();
    liveDirty = true;
    kickLive();

    const stage = $('#liveStage');
    let drag = null;
    stage.addEventListener('pointerdown', function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      if (live.sensor) disableSensor(true);
      drag = { x: ev.clientX, y: ev.clientY, az: live.az, alt: live.alt, moved: false };
      stage.classList.add('is-dragging');
      try { stage.setPointerCapture(ev.pointerId); } catch (e) { }
    });
    stage.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      const degPerPx = live.fov / Math.max(220, live.h);
      const az = A.mod(drag.az - dx * degPerPx, 360);
      const alt = clamp(drag.alt + dy * degPerPx, -15, 89);
      live.az = az; live.targetAz = az;
      live.alt = alt; live.targetAlt = alt;
      state.follow = null;
      liveDirty = true;
      kickLive();
    });
    const end = function (ev) {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      stage.classList.remove('is-dragging');
      if (!moved) liveHandleClick(ev);
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', function () { drag = null; stage.classList.remove('is-dragging'); });
    stage.addEventListener('pointerleave', function () { if (drag) { drag = null; stage.classList.remove('is-dragging'); } });

    $$('.pad-btn').forEach(function (b) {
      b.addEventListener('click', function () {
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
      live.fov = clamp(live.fov - 10, 25, 120);
      liveDirty = true; kickLive();
    });
    $('#liveZoomOut').addEventListener('click', function () {
      live.fov = clamp(live.fov + 10, 25, 120);
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
    const nightBtn = $('#liveNightBtn');
    if (nightBtn) nightBtn.addEventListener('click', function () {
      const w = nightWindow();
      const jd22 = A.jdFromDate(A.localToDate(state.dateStr, '22:00'));
      const frac = (jd22 > w.start && jd22 < w.end) ? (jd22 - w.start) / (w.end - w.start) : 0.55;
      stopPlay();
      setSimFrac(frac);
      toast('밤 22시 하늘로 이동했습니다. ▶ 재생으로 밤새 움직임을 볼 수 있습니다.');
    });
    $('#liveSensorBtn').addEventListener('click', function () {
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
      paintDial(dock);
    });
    // 관측 시각 입력칸도 실제로 쓰이는 시각을 그대로 보여 준다(시뮬레이션 중이면 그 시각).
    const ti = $('#timeInput');
    if (ti && document.activeElement !== ti) {
      if (sim && baseJd != null) ti.value = A.fmtClock(baseJd);
      else ti.value = state.timeStr || (state.dateStr === todayKST() ? '' : '22:00');
    }
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
    const ti = $('#timeInput');
    if (ti) ti.value = state.timeStr;
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
      const f = Number($('#fovFocal').value) || 1300;
      const ep = Number($('#fovEyepiece').value) || 25;
      const afov = Number($('#fovAfov').value) || 52;
      const mag = f / ep;
      const tfov = afov / mag;
      tfovW = tfov; tfovH = tfov;
      sizeLabel = nf(mag, 0) + '배';
      sizeNote = '초점거리 ÷ 아이피스';
      frameText = '원형 시야 ' + nf(tfov, 2) + '°';
    } else {
      const f = Number($('#fovCamFocal').value) || 200;
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
    const di = $('#dateInput'), ti = $('#timeInput');
    if (di) di.value = dateStr;
    if (ti) ti.value = state.timeStr;
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

    const st = $('#siteSelect');
    if (st) st.addEventListener('change', function () { clearSim(true); });

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
      setTimeout(function () { liveDirty = true; kickLive(); calcFov(); }, 30);
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
    lines.push('🔭 오늘밤별 — ' + Number(state.dateStr.slice(5, 7)) + '월 ' + Number(state.dateStr.slice(8, 10)) + '일 (' + weekdayKR(state.dateStr) + ') · ' + site.name);
    lines.push('🌙 달: ' + nf(c.phase.illum * 100) + '% · ' + c.phase.name + (n.moonSet ? ' (월몰 ' + A.fmtClock(n.moonSet) + ')' : ''));
    if (c.cloud != null) lines.push('☁️ 구름: 밤 평균 ' + Math.round(c.cloud) + '% · ' + SkyWeather.labelOf(c.cloud));
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
    lines.push('전국 관측 명소·촬영 계산기·2026~2027 천문 캘린더 → 오늘밤별');
    return lines.join('\n');
  }

  function sharePlan() {
    const c = state.last || computeNight();
    const text = buildShareText(c);
    copyText(text).then(function (ok) {
      if (ok !== false) toast('오늘 밤 플랜을 복사했습니다. 카카오톡에 붙여넣으세요.');
    });
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

  /* ------------------------------------------------------------- 초기화 */
  function initSiteSelect() {
    const sel = $('#siteSelect');
    let html = '<optgroup label="주요 도시">';
    D.locations.forEach(function (l) { html += '<option value="loc:' + l.id + '">' + esc(l.name) + '</option>'; });
    html += '</optgroup><optgroup label="전국 관측 명소">';
    D.sites.forEach(function (s, i) { html += '<option value="site:' + i + '">' + esc(s.name) + '</option>'; });
    html += '</optgroup>';
    sel.innerHTML = html;

    const matchId = D.locations.find(function (l) { return Math.abs(l.lat - state.site.lat) < 0.001 && Math.abs(l.lon - state.site.lon) < 0.001; });
    if (matchId) sel.value = 'loc:' + matchId.id;
    else {
      const si = D.sites.findIndex(function (s) { return Math.abs(s.lat - state.site.lat) < 0.001 && Math.abs(s.lon - state.site.lon) < 0.001; });
      if (si >= 0) sel.value = 'site:' + si;
    }

    sel.addEventListener('change', function () {
      const v = sel.value;
      if (v.indexOf('loc:') === 0) {
        const l = D.locations.find(function (x) { return x.id === v.slice(4); });
        if (l) state.site = { name: l.name, lat: l.lat, lon: l.lon, bortle: l.bortle };
      } else if (v.indexOf('site:') === 0) {
        const s = D.sites[Number(v.slice(5))];
        if (s) state.site = { name: s.name, lat: s.lat, lon: s.lon, bortle: s.bortle };
      }
      store.set('site', state.site);
      renderAll();
    });
  }

  function initControls() {
    $('#dateInput').value = state.dateStr;
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
      state.dateStr = todayKST();
      state.timeStr = '';
      state.simJd = null;
      state.tmFrac = 0;
      state.follow = null;
      stopPlay();
      $('#dateInput').value = state.dateStr;
      $('#timeInput').value = '';
      renderAll();
      toast('현재 시각으로 돌아왔습니다.');
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
      $('#siteSelect').value = '';
      renderAll();
      toast('관측지 좌표를 적용했습니다.');
    });

    $('#btnGeo').addEventListener('click', function () {
      if (!navigator.geolocation) { toast('이 브라우저는 위치 기능을 지원하지 않습니다.'); return; }
      toast('현재 위치를 확인하는 중…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        state.site = {
          name: '내 위치', lat: pos.coords.latitude, lon: pos.coords.longitude,
          bortle: state.site.bortle || 6
        };
        store.set('site', state.site);
        $('#siteSelect').value = '';
        renderAll();
        toast('현재 위치로 계산했습니다.');
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
      logs.push({
        date: $('#logDate').value || todayKST(),
        place: $('#logPlace').value.trim(),
        equip: $('#logEquip').value,
        target: $('#logTarget').value.trim(),
        seeing: Number($('#logSeeing').value) || 3,
        trans: Number($('#logTrans').value) || 3,
        result: $('#logResult').value,
        memo: $('#logMemo').value.trim(),
        ts: Date.now()
      });
      store.set('logs', logs);
      $('#logTarget').value = ''; $('#logMemo').value = '';
      renderLogs();
      toast('관측 기록을 저장했습니다.');
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
      const blob = new Blob([JSON.stringify({ site: '오늘밤별', exportedAt: new Date().toISOString(), logs: logs }, null, 2)],
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
      if (t) closeModal();
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
      const open = !card.classList.contains('is-open');
      card.classList.toggle('is-open', open);
      card.setAttribute('aria-expanded', String(open));
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
    const po = $('#panelObjects'), pc = $('#panelConstellations');
    if (po) po.hidden = key !== 'objects';
    if (pc) pc.hidden = key !== 'const';
    if (scroll) {
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
    const key = NAV_KEYS[id];
    if (!key) { navUnlock(); return; }
    navLockKey = key;
    navLockAt = performance.now();
    setActiveNav(key);
    navHoldLock();
  }

  function syncActiveNav() {
    if (navLockKey) { setActiveNav(navLockKey); navHoldLock(); return; }
    setActiveNav(navSectionAt());
  }

  function jumpTo(id) {
    if (!id) return;
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
        if (e.target.closest('#moreMenu') || e.target.closest('#btnMore')) return;
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
    renderChecklist();
    renderLogs();
    renderAll();
    calcExposure();
    calcOptics();
    drawHeroStars();
    initTermTips();
    initExtra();
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
    const c = state.last || computeNight();
    const h = A.equatorialToHorizontal(A.mod(raDeg, 360) / 15, decDeg, state.site.lat, state.site.lon, c.jd);
    state.follow = null;
    live.targetAz = A.mod(h.az, 360);
    live.targetAlt = clamp(h.alt, -8, 88);
    liveDirty = true;
    kickLive();
    const sec = $('#live');
    if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (h.alt < 0) toast((name || '천체') + josa(name || '천체', '은', '는') + ' 지금 지평선 아래(' + nf(h.alt, 0) + '°)입니다. 지평선 쪽으로 맞췄습니다.');
    else toast((name || '천체') + ' 방향으로 시선을 맞췄습니다 — ' + dirName(h.az) + ' ' + nf(h.alt, 0) + '°.');
    return true;
  }

  window.OneulBam = {
    openObject: openObject,
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
