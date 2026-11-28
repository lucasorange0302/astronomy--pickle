/* =========================================================================
   시간별 구름양 (sky-weather.js)
   · Open-Meteo 공개 예보 API (키 필요 없음 · CORS 허용)에서
     선택한 관측지의 오늘 18시 ~ 내일 06시 구름양(%)·강수확률(%)을 가져옵니다.
   · 예보 범위(16일) 밖이거나 네트워크/호출 실패면 status='unavailable' 로
     돌려주고, 화면은 "기상 예보 미제공(맑음 기준 추정)"으로 표시합니다.
   · 같은 관측지·날짜는 30분(메모리)·3시간(localStorage) 캐시합니다.
   ========================================================================= */
(function () {
  'use strict';

  var TTL = 30 * 60 * 1000;
  var LS_TTL = 3 * 60 * 60 * 1000;
  var mem = {};
  var pending = {};
  var stampN = 0;          // 예보가 새로 들어올 때마다 +1 — 30일 계획 캐시를 무효화하는 신호

  function key(lat, lon, date) {
    return Number(lat).toFixed(2) + '|' + Number(lon).toFixed(2) + '|' + date;
  }
  function addDay(dateStr) {
    var p = String(dateStr).split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function readLS(k) {
    try {
      var raw = window.localStorage.getItem('skywx.' + k);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.ts || Date.now() - o.ts > LS_TTL) return null;
      return o.snap;
    } catch (e) { return null; }
  }
  function writeLS(k, snap) {
    try { window.localStorage.setItem('skywx.' + k, JSON.stringify({ ts: Date.now(), snap: snap })); } catch (e) {}
  }

  function buildSnap(json, date, lat, lon) {
    var h = (json && json.hourly) || {};
    var times = h.time || [];
    var cc = h.cloud_cover || [];
    var pp = h.precipitation_probability || [];
    var pm = h.precipitation || [];
    var map = {};
    for (var i = 0; i < times.length; i++) {
      map[times[i]] = {
        cloud: (typeof cc[i] === 'number' ? cc[i] : null),
        prob: (typeof pp[i] === 'number' ? pp[i] : null),
        mm: (typeof pm[i] === 'number' ? pm[i] : null)
      };
    }
    var next = addDay(date);
    var series = [];
    function push(day, hour, abs) {
      var t = day + 'T' + (hour < 10 ? '0' : '') + hour + ':00';
      var v = map[t] || {};
      series.push({
        abs: abs, hour: hour, day: day, clock: hour,
        cloud: v.cloud == null ? null : v.cloud,
        prob: v.prob == null ? null : v.prob,
        mm: v.mm == null ? 0 : v.mm
      });
    }
    for (var a = 18; a <= 23; a++) push(date, a, a);
    for (var b = 0; b <= 6; b++) push(next, b, 24 + b);

    var known = series.filter(function (s) { return s.cloud != null; });
    var status = known.length ? 'ok' : 'empty';
    return {
      status: status, date: date, lat: lat, lon: lon, series: series,
      fetchedAt: Date.now(), tz: json && json.timezone ? json.timezone : 'Asia/Seoul'
    };
  }

  function unavailable(date, lat, lon, reason) {
    return { status: 'unavailable', date: date, lat: lat, lon: lon, series: [], fetchedAt: Date.now(), reason: reason || 'forecast' };
  }

  function rawCached(lat, lon, date) {
    var k = key(lat, lon, date);
    var e = mem[k];
    if (e && Date.now() - e.ts < TTL) return e.snap;
    var ls = readLS(k);
    if (ls) { mem[k] = { ts: Date.now(), snap: ls }; return ls; }
    return null;
  }

  /** 캐시에 있는 값만 (네트워크 호출 없음). 없으면 null */
  function cached(lat, lon, date) { return rawCached(lat, lon, date); }

  /** 없으면 받아 온다. cb(snap) 은 캐시·성공·실패 모두에서 호출된다. */
  function fetchForecast(lat, lon, date, cb) {
    var k = key(lat, lon, date);
    var hit = rawCached(lat, lon, date);
    if (hit && hit.status !== 'empty') { cb(hit); return; }
    // 예보 범위(오늘 ~ 16일 뒤) 밖은 요청하지 않고 바로 "예보 미제공" — 불필요한 400 응답을 만들지 않는다.
    var now = Date.now() + 9 * 3600000;
    var today = new Date(now).toISOString().slice(0, 10);
    var limit = new Date(now + 15 * 86400000).toISOString().slice(0, 10);
    if (date < today || date > limit) {
      var snap0 = unavailable(date, lat, lon, 'range');
      mem[k] = { ts: Date.now(), snap: snap0 };
      cb(snap0);
      return;
    }
    if (pending[k]) { pending[k].push(cb); return; }
    pending[k] = [cb];

    var url = 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + Number(lat).toFixed(4) + '&longitude=' + Number(lon).toFixed(4) +
      '&hourly=cloud_cover,precipitation,precipitation_probability' +
      '&timezone=Asia%2FSeoul&start_date=' + date + '&end_date=' + addDay(date);

    function finish(snap) {
      mem[k] = { ts: Date.now(), snap: snap };
      if (snap.status === 'ok') { writeLS(k, snap); stampN++; }
      var list = pending[k] || [];
      delete pending[k];
      list.forEach(function (fn) { try { fn(snap); } catch (e) {} });
    }

    if (typeof window.fetch !== 'function') { finish(unavailable(date, lat, lon, 'unsupported')); return; }

    var done = false;
    var guard = setTimeout(function () { if (!done) { done = true; finish(unavailable(date, lat, lon, 'timeout')); } }, 12000);
    window.fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          throw new Error((j && j.reason) || ('HTTP ' + r.status));
        });
      }
      return r.json();
    }).then(function (json) {
      if (done) return;
      done = true; clearTimeout(guard);
      if (!json || json.error) { finish(unavailable(date, lat, lon, (json && json.reason) || 'error')); return; }
      var snap = buildSnap(json, date, lat, lon);
      if (snap.status !== 'ok') finish(unavailable(date, lat, lon, 'empty'));
      else finish(snap);
    }).catch(function (err) {
      if (done) return;
      done = true; clearTimeout(guard);
      finish(unavailable(date, lat, lon, /forecast|range|past/i.test(String(err && err.message)) ? 'range' : 'network'));
    });
  }

  /** 특정 시각(0~23) 또는 밤 구간(startH~endH, 자정 넘김은 24+) 평균 구름양(%) */
  function cloudFor(snap, opts) {
    if (!snap || snap.status !== 'ok' || !snap.series.length) return null;
    opts = opts || {};
    if (opts.hour != null) {
      var target = opts.hour < 12 ? opts.hour + 24 : opts.hour;
      var hit = snap.series.filter(function (s) { return s.abs === target; })[0];
      if (hit && hit.cloud != null) return hit.cloud;
      var near = snap.series.filter(function (s) { return s.cloud != null; })
        .sort(function (a, b) { return Math.abs(a.abs - target) - Math.abs(b.abs - target); })[0];
      return near ? near.cloud : null;
    }
    var startH = opts.startH, endH = opts.endH;
    var pool = snap.series.filter(function (s) {
      if (s.cloud == null) return false;
      if (startH == null || endH == null) return true;
      return s.abs >= startH && s.abs <= endH;
    });
    if (!pool.length) return null;
    return pool.reduce(function (sum, s) { return sum + s.cloud; }, 0) / pool.length;
  }

  /** 밤 구간(또는 특정 시각)의 강수량(mm)·강수확률(%) */
  function precipFor(snap, opts) {
    if (!snap || snap.status !== 'ok' || !snap.series.length) return null;
    opts = opts || {};
    var pool = snap.series.filter(function (s) {
      if (opts.hour != null) return s.abs === (opts.hour < 12 ? opts.hour + 24 : opts.hour);
      if (opts.startH == null || opts.endH == null) return true;
      return s.abs >= opts.startH && s.abs <= opts.endH;
    });
    if (!pool.length) return null;
    var sum = 0, max = 0, prob = 0, n = 0, wet = 0;
    pool.forEach(function (s) {
      var m = s.mm || 0;
      sum += m;
      if (m > max) max = m;
      if (s.prob != null) { prob += s.prob; n++; }
      if (m > 0 || (s.prob != null && s.prob >= 60)) wet++;
    });
    return {
      mm: sum, mmMax: max, prob: n ? prob / n : null,
      wetHours: wet, hours: pool.length
    };
  }

  /** 가장 맑은 연속 구간 찾기 — 비·눈 오는 시간은 먼저 제외합니다 */
  function bestWindow(snap) {
    if (!snap || snap.status !== 'ok') return null;
    var s = snap.series.filter(function (x) { return x.cloud != null; });
    if (!s.length) return null;
    var dry = s.filter(function (x) { return !(x.mm > 0) && !(x.prob != null && x.prob >= 70); });
    var pool = dry.length ? dry : s;
    var runs = [], cur = null;
    pool.forEach(function (x) {
      if (x.cloud <= 30) {
        if (!cur) cur = { from: x.abs, to: x.abs, vals: [x.cloud] };
        else { cur.to = x.abs; cur.vals.push(x.cloud); }
      } else if (cur) { runs.push(cur); cur = null; }
    });
    if (cur) runs.push(cur);
    var pick = runs.sort(function (a, b) {
      return (b.vals.length - a.vals.length) || (mean(a.vals) - mean(b.vals));
    })[0];
    if (!pick) {
      var sorted = pool.slice().sort(function (a, b) { return a.cloud - b.cloud; });
      pick = { from: sorted[0].abs, to: sorted[Math.min(1, sorted.length - 1)].abs, vals: sorted.slice(0, 2).map(function (x) { return x.cloud; }) };
    }
    return { from: pick.from, to: pick.to, mean: mean(pick.vals), hours: pick.vals.length };
  }
  function mean(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }

  /* ---------------------------------------------------------------- 범위 예보
     「가장 어두운 밤」처럼 여러 날을 한꺼번에 견줘야 할 때, 날짜마다 따로 10~16번
     부르지 않고 한 번의 요청(start_date~end_date)으로 받아 날짜별 스냅으로 나눕니다.
     캐시에 이미 있는 날짜는 그대로 쓰고, 없는 날짜만 요청합니다. */
  function fetchRangeForecast(lat, lon, startDate, endDate, cb) {
    var dates = [];
    var out = {};
    for (var d = startDate; d <= endDate; d = addDay(d)) {
      dates.push(d);
      var hit = rawCached(lat, lon, d);
      if (hit && hit.status === 'ok') out[d] = hit;
    }
    var miss = dates.filter(function (x) { return !out[x]; });
    var today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    if (!miss.length || typeof window.fetch !== 'function' || miss[0] < today) { cb(out, []); return; }

    var url = 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + Number(lat).toFixed(4) + '&longitude=' + Number(lon).toFixed(4) +
      '&hourly=cloud_cover,precipitation,precipitation_probability' +
      '&timezone=Asia%2FSeoul&start_date=' + miss[0] + '&end_date=' + addDay(endDate);

    var done = false;
    function finish(json) {
      if (done) return;
      done = true;
      clearTimeout(guard);
      dates.forEach(function (date) {
        if (out[date]) return;
        if (!json) { mem[key(lat, lon, date)] = { ts: Date.now(), snap: unavailable(date, lat, lon, 'network') }; return; }
        var snap = buildSnap(json, date, lat, lon);
        if (snap.status !== 'ok') { mem[key(lat, lon, date)] = { ts: Date.now(), snap: unavailable(date, lat, lon, 'empty') }; return; }
        mem[key(lat, lon, date)] = { ts: Date.now(), snap: snap };
        writeLS(key(lat, lon, date), snap);
        out[date] = snap;
        stampN++;
      });
      cb(out, miss);
    }
    var guard = setTimeout(function () { finish(null); }, 15000);
    window.fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (json) {
      if (!json || json.error) { finish(null); return; }
      finish(json);
    }).catch(function () { finish(null); });
  }

  function labelOf(cloud) {
    if (cloud == null) return '정보 없음';
    if (cloud <= 25) return '맑음';
    if (cloud <= 50) return '조금 구름';
    if (cloud <= 85) return '구름 많음';
    return '흐림';
  }

  window.SkyWeather = {
    cached: cached,
    fetch: fetchForecast,
    fetchRange: fetchRangeForecast,
    stamp: function () { return stampN; },
    cloudFor: cloudFor,
    precipFor: precipFor,
    bestWindow: bestWindow,
    labelOf: labelOf,
    hourKey: function (h) { return h < 12 ? h + 24 : h; }
  };
})();
