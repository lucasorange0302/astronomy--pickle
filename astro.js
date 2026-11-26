/* =========================================================================
   별너울 — 천문 계산 엔진 (astro.js)
   근거:
   · 태양 위치: NOAA Solar Calculator 방식(저정밀, 오차 약 ±0.01°)
   · 달·행성 위치: Paul Schlyter, "Computing planetary positions" (저정밀, 행성 오차 약 1~2′)
   · 좌표 변환·항성시: Meeus, Astronomical Algorithms 표준식
   · 일출·일몰·박명·월출·월몰: 고도를 2분 간격으로 표본화해 해(根)를 보간
   정밀도: 시각 ±1~2분, 위치 ±0.1~0.3°. 계획용 근사값이며 정밀 관측 계획에는
   Stellarium / KASI 자료를 함께 쓰세요.
   ========================================================================= */
window.Astro = (function () {
  'use strict';

  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const J2000 = 2451545.0;
  const AU_KM = 149597870.7;

  /* ------------------------------------------------------------- 유틸 */
  function mod(x, m) { return ((x % m) + m) % m; }
  function sinD(x) { return Math.sin(x * RAD); }
  function cosD(x) { return Math.cos(x * RAD); }
  function tanD(x) { return Math.tan(x * RAD); }

  function jdFromDate(date) { return date.getTime() / 86400000 + 2440587.5; }
  function dateFromJd(jd) { return new Date((jd - 2440587.5) * 86400000); }

  /** 'YYYY-MM-DD' + 'HH:MM' (KST) → Date(UTC 기준 절대시각) */
  function localToDate(dateStr, timeStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    let hh = 0, mm = 0;
    if (timeStr) { const p = timeStr.split(':').map(Number); hh = p[0] || 0; mm = p[1] || 0; }
    return new Date(Date.UTC(y, m - 1, d, hh, mm) - 9 * 3600000);
  }
  /** 그 날짜(KST)의 0시 */
  function localMidnight(dateStr) { return localToDate(dateStr, '00:00'); }
  function localNoon(dateStr) { return localToDate(dateStr, '12:00'); }

  function fmtClock(jd) {
    if (jd == null || isNaN(jd)) return '—';
    const d = dateFromJd(jd);
    const kst = new Date(d.getTime() + 9 * 3600000);
    // 분 단위로 반올림 (JD 부동소수 오차로 18:59:59가 18:59로 보이는 것 방지)
    const total = Math.round(kst.getUTCHours() * 60 + kst.getUTCMinutes() + kst.getUTCSeconds() / 60);
    const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    return hh + ':' + mm;
  }
  function fmtDateKorean(jd) {
    const d = dateFromJd(jd);
    const kst = new Date(d.getTime() + 9 * 3600000);
    return (kst.getUTCMonth() + 1) + '월 ' + kst.getUTCDate() + '일';
  }

  /* ------------------------------------------------------------- 태양 */
  function sunPos(jd) {
    const n = jd - J2000;
    const L = mod(280.460 + 0.9856474 * n, 360);
    const g = mod(357.528 + 0.9856003 * n, 360) * RAD;
    const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
    const eps = (23.439 - 0.0000004 * n) * RAD;
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
    const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
    const dist = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
    return {
      raH: mod(ra * DEG, 360) / 15,
      decD: dec * DEG,
      distAU: dist,
      lambdaD: mod(lambda * DEG, 360)
    };
  }

  /* --------------------------------------------------------------- 달 */
  function moonPos(jd) {
    const d = jd - 2451543.5;
    const N = 125.1228 - 0.0529538083 * d;
    const inc = 5.1454;
    const w = 318.0634 + 0.1643573223 * d;
    const a = 60.2666;
    const e = 0.054900;
    const M = mod(115.3654 + 13.0649929509 * d, 360);

    // 케플러 방정식
    let E = M + e * DEG * Math.sin(M * RAD) * (1 + e * Math.cos(M * RAD));
    for (let k = 0; k < 6; k++) {
      E = E - (E - e * DEG * Math.sin(E * RAD) - M) / (1 - e * Math.cos(E * RAD));
    }
    const xv = a * (Math.cos(E * RAD) - e);
    const yv = a * Math.sqrt(1 - e * e) * Math.sin(E * RAD);
    const r0 = Math.sqrt(xv * xv + yv * yv);
    const v = Math.atan2(yv, xv) * DEG;

    // 궤도면 → 황도 좌표 (표준 회전)
    const vw = (v + w) * RAD;
    const cosVW = Math.cos(vw), sinVW = Math.sin(vw);
    const cosN = cosD(N), sinN = sinD(N), cosI = cosD(inc);
    const xh = cosN * cosVW - sinN * sinVW * cosI;
    const yh = sinN * cosVW + cosN * sinVW * cosI;
    const zh = sinVW * sinD(inc);
    let lon = Math.atan2(yh, xh) * DEG;
    let lat = Math.asin(zh) * DEG;
    let r = r0;

    // 태양 평균 요소
    const Ls = mod(280.460 + 0.9856474 * d, 360);
    const Ms = mod(357.528 + 0.9856003 * d, 360);
    const Lm = mod(N + w + M, 360);
    const D = mod(Lm - Ls, 360);
    const F = mod(Lm - N, 360);
    const Mm = M;

    // 주요 섭동항
    lon += -1.274 * sinD(Mm - 2 * D)
         + 0.658 * sinD(2 * D)
         - 0.186 * sinD(Ms)
         - 0.059 * sinD(2 * Mm - 2 * D)
         - 0.057 * sinD(Mm - 2 * D + Ms)
         + 0.053 * sinD(Mm + 2 * D)
         + 0.046 * sinD(2 * D - Ms)
         + 0.041 * sinD(Mm - Ms)
         - 0.035 * sinD(D)
         - 0.031 * sinD(Mm + Ms)
         - 0.015 * sinD(2 * F - 2 * D)
         + 0.011 * sinD(Mm - 4 * D);
    lat += -0.173 * sinD(F - 2 * D)
         - 0.055 * sinD(Mm - F - 2 * D)
         - 0.046 * sinD(Mm + F - 2 * D)
         + 0.033 * sinD(F + 2 * D)
         + 0.017 * sinD(2 * Mm + F);
    r += -0.58 * cosD(Mm - 2 * D)
       - 0.46 * cosD(2 * D);

    // 황도 → 적도
    const eps = (23.4393 - 3.563e-7 * d) * RAD;
    const xe = r * cosD(lat) * cosD(lon);
    const ye = r * cosD(lat) * sinD(lon);
    const ze = r * sinD(lat);
    const xe2 = xe;
    const ye2 = ye * Math.cos(eps) - ze * Math.sin(eps);
    const ze2 = ye * Math.sin(eps) + ze * Math.cos(eps);
    const ra = Math.atan2(ye2, xe2) * DEG;
    const dec = Math.atan2(ze2, Math.sqrt(xe2 * xe2 + ye2 * ye2)) * DEG;

    return {
      raH: mod(ra, 360) / 15,
      decD: dec,
      distKm: r * 6378.14,
      lambdaD: mod(lon, 360),
      betaD: lat
    };
  }

  /* ------------------------------------------------------------- 행성 */
  // Schlyter 궤도 요소 (d = JD - 2451543.5 기준)
  const PLANET_ELEMENTS = {
    mercury: { N: [48.3313, 3.24587e-5], i: [7.0047, 5.0e-8], w: [29.1241, 1.01444e-5], a: [0.387098, 0], e: [0.205635, 5.59e-10], M: [168.6562, 4.0923344368] },
    venus:   { N: [76.6799, 2.46590e-5], i: [3.3946, 2.75e-8],  w: [54.8910, 1.38374e-5], a: [0.723330, 0], e: [0.006773, -1.302e-9], M: [48.0052, 1.6021302244] },
    mars:    { N: [49.5574, 2.11081e-5], i: [1.8497, -1.78e-8], w: [286.5016, 2.92961e-5], a: [1.523688, 0], e: [0.093405, 2.516e-9], M: [18.6021, 0.5240207766] },
    jupiter: { N: [100.4542, 2.76854e-5], i: [1.3030, -1.557e-7], w: [273.8777, 1.64505e-5], a: [5.20256, 0], e: [0.048498, 4.469e-9], M: [19.8950, 0.0830853001] },
    saturn:  { N: [113.6634, 2.38980e-5], i: [2.4886, -1.081e-7], w: [339.3939, 2.97661e-5], a: [9.55475, 0], e: [0.055546, -9.499e-9], M: [316.9670, 0.0334442282] },
    uranus:  { N: [74.0005, 1.3978e-5], i: [0.7733, 1.9e-8],   w: [96.6612, 3.0565e-5], a: [19.18171, -1.55e-8], e: [0.047318, 7.45e-9], M: [142.5905, 0.011725806] },
    neptune: { N: [131.7806, 3.0173e-5], i: [1.7700, -2.55e-7], w: [272.8461, -6.027e-6], a: [30.05826, 3.313e-8], e: [0.008606, 2.15e-9], M: [260.2471, 0.005995147] }
  };
  const PLANET_DIAM_KM = { mercury: 4879, venus: 12104, mars: 6792, jupiter: 142984, saturn: 120536, uranus: 51118, neptune: 49528 };
  const PLANET_KR = { mercury: '수성', venus: '금성', mars: '화성', jupiter: '목성', saturn: '토성', uranus: '천왕성', neptune: '해왕성' };

  function planetPos(key, jd) {
    const d = jd - 2451543.5;
    const el = PLANET_ELEMENTS[key];
    const N = mod(el.N[0] + el.N[1] * d, 360);
    const inc = el.i[0] + el.i[1] * d;
    const w = mod(el.w[0] + el.w[1] * d, 360);
    const a = el.a[0] + el.a[1] * d;
    const e = el.e[0] + el.e[1] * d;
    const M = mod(el.M[0] + el.M[1] * d, 360);

    let E = M + e * DEG * Math.sin(M * RAD) * (1 + e * Math.cos(M * RAD));
    for (let k = 0; k < 8; k++) {
      E = E - (E - e * DEG * Math.sin(E * RAD) - M) / (1 - e * Math.cos(E * RAD));
    }
    const xv = a * (Math.cos(E * RAD) - e);
    const yv = a * Math.sqrt(1 - e * e) * Math.sin(E * RAD);
    const v = Math.atan2(yv, xv) * DEG;
    const r = Math.sqrt(xv * xv + yv * yv);

    // 황도 직교좌표 (태양 중심)
    let xh = r * (cosD(N) * cosD(v + w) - sinD(N) * sinD(v + w) * cosD(inc));
    let yh = r * (sinD(N) * cosD(v + w) + cosD(N) * sinD(v + w) * cosD(inc));
    let zh = r * (sinD(v + w) * sinD(inc));

    // 목성·토성·천왕성 섭동 (간략)
    const Mj = mod(19.8950 + 0.0830853001 * d, 360);
    const Ms = mod(316.9670 + 0.0334442282 * d, 360);
    const Mu = mod(142.5905 + 0.011725806 * d, 360);
    let lon = Math.atan2(yh, xh) * DEG;
    let lat = Math.atan2(zh, Math.sqrt(xh * xh + yh * yh)) * DEG;

    if (key === 'jupiter') {
      lon += -0.332 * sinD(2 * Mj - 5 * Ms - 67.6) - 0.056 * sinD(2 * Mj - 2 * Ms + 21)
           + 0.042 * sinD(3 * Mj - 5 * Ms + 21) - 0.036 * sinD(Mj - 2 * Ms)
           + 0.022 * cosD(Mj - Ms) + 0.023 * sinD(2 * Mj - 3 * Ms + 52)
           - 0.016 * sinD(Mj - 5 * Ms - 69);
    } else if (key === 'saturn') {
      lon += 0.812 * sinD(2 * Mj - 5 * Ms - 67.6) - 0.229 * cosD(2 * Mj - 4 * Ms - 2)
           + 0.119 * sinD(Mj - 2 * Ms - 3) + 0.046 * sinD(2 * Mj - 6 * Ms - 69)
           + 0.014 * sinD(Mj - 3 * Ms + 32);
      lat += -0.020 * cosD(2 * Mj - 4 * Ms - 2) + 0.018 * sinD(2 * Mj - 6 * Ms - 49);
    } else if (key === 'uranus') {
      lon += 0.040 * sinD(Ms - 2 * Mu + 6) + 0.035 * sinD(Ms - 3 * Mu + 33) - 0.015 * sinD(Mj - Mu + 20);
    }
    if (key === 'jupiter' || key === 'saturn' || key === 'uranus') {
      xh = r * cosD(lat) * cosD(lon);
      yh = r * cosD(lat) * sinD(lon);
      zh = r * sinD(lat);
    }

    // 태양 위치(지구에서 본) → 지구 중심 행성 좌표
    const sun = sunPos(jd);
    const xs = sun.distAU * cosD(sun.lambdaD);
    const ys = sun.distAU * sinD(sun.lambdaD);
    const xg = xh + xs;
    const yg = yh + ys;
    const zg = zh;

    const eps = (23.4393 - 3.563e-7 * d) * RAD;
    const xe = xg;
    const ye = yg * Math.cos(eps) - zg * Math.sin(eps);
    const ze = yg * Math.sin(eps) + zg * Math.cos(eps);
    const ra = mod(Math.atan2(ye, xe) * DEG, 360);
    const dec = Math.atan2(ze, Math.sqrt(xe * xe + ye * ye)) * DEG;
    const delta = Math.sqrt(xg * xg + yg * yg + zg * zg);

    // 이각·위상각
    const dot = xg * xs + yg * ys + zg * 0;
    const elong = Math.acos(Math.max(-1, Math.min(1, dot / (delta * sun.distAU)))) * DEG;
    const cosPh = (r * r + delta * delta - sun.distAU * sun.distAU) / (2 * r * delta);
    const phase = Math.acos(Math.max(-1, Math.min(1, cosPh))) * DEG;

    // 겉보기 등급 (Meeus 계열 근사식)
    let mag;
    const base = 5 * Math.log10(r * delta);
    switch (key) {
      case 'mercury': mag = -0.42 + base + 0.0380 * phase - 0.000273 * phase * phase + 0.000002 * phase * phase * phase; break;
      case 'venus':   mag = -4.40 + base + 0.0009 * phase + 0.000239 * phase * phase - 0.00000065 * phase * phase * phase; break;
      case 'mars':    mag = -1.52 + base + 0.016 * phase; break;
      case 'jupiter': mag = -9.40 + base + 0.005 * phase; break;
      case 'saturn': {
        // 고리 벌어짐 B: 2025년 고리면 통과, 2032년 최대 → 주기 29.46년
        const years = 2000.0 + (jd - 2451545.0) / 365.25;
        const B = 27.0 * Math.sin(2 * Math.PI * (years - 2025.75) / 29.4571);
        mag = -8.88 + base - 2.60 * Math.abs(Math.sin(B * RAD)) + 1.25 * Math.pow(Math.sin(B * RAD), 2);
        break;
      }
      case 'uranus':  mag = -7.19 + base; break;
      case 'neptune': mag = -6.87 + base; break;
      default: mag = 0;
    }

    return {
      key, name: PLANET_KR[key], raH: ra / 15, decD: dec,
      rAU: r, distAU: delta, elongD: elong, phaseD: phase,
      mag: Math.round(mag * 10) / 10,
      illum: (1 + Math.cos(phase * RAD)) / 2,
      diamArcsec: (PLANET_DIAM_KM[key] / (delta * AU_KM)) * 206264.8
    };
  }

  function allPlanets(jd) {
    return Object.keys(PLANET_ELEMENTS).map(function (k) { return planetPos(k, jd); });
  }

  /* --------------------------------------------------- 항성시 · 좌표 변환 */
  function gmstHours(jd) {
    const n = jd - J2000;
    return mod(18.697374558 + 24.06570982441908 * n, 24);
  }
  function lstHours(jd, lonDeg) {
    return mod(gmstHours(jd) + lonDeg / 15, 24);
  }

  function equatorialToHorizontal(raH, decD, latDeg, lonDeg, jd) {
    const H = mod(lstHours(jd, lonDeg) - raH, 24) * 15 * RAD;
    const dec = decD * RAD;
    const lat = latDeg * RAD;
    const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(H);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;
    let az = Math.acos(Math.max(-1, Math.min(1,
      (Math.sin(dec) - Math.sin(alt * RAD) * Math.sin(lat)) / (Math.cos(alt * RAD) * Math.cos(lat))
    ))) * DEG;
    if (Math.sin(H) > 0) az = 360 - az;
    return { alt: alt, az: az };
  }

  /* ----------------------------------------------------------- 달 위상 */
  function moonPhase(jd) {
    const sun = sunPos(jd);
    const moon = moonPos(jd);
    // 황경차
    let phase = mod(moon.lambdaD - sun.lambdaD, 360) / 360; // 0=삭, 0.5=망
    const age = phase * 29.530588853;
    const illum = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
    // 달-지구 거리에 따른 밝기 보정(간단)
    let name;
    if (age < 1.0 || age > 28.5) name = '삭 (신월)';
    else if (age < 6.4) name = '초승달';
    else if (age < 8.4) name = '상현달';
    else if (age < 13.8) name = '차오르는 달';
    else if (age < 15.8) name = '보름달 (망)';
    else if (age < 21.1) name = '기우는 달';
    else if (age < 23.1) name = '하현달';
    else name = '그믐달';
    return {
      phase: phase,          // 0~1 (0 삭, 0.25 상현, 0.5 망, 0.75 하현)
      age: age,
      illum: illum,
      name: name,
      waxing: phase < 0.5,
      distanceKm: moon.distKm,
      raH: moon.raH,
      decD: moon.decD
    };
  }

  /* ------------------------------------------ 고도 교차점(일출·일몰 등) 탐색 */
  function altitudeOf(body, jd, lat, lon) {
    if (body === 'sun') { const s = sunPos(jd); return equatorialToHorizontal(s.raH, s.decD, lat, lon, jd).alt; }
    if (body === 'moon') { const m = moonPos(jd); return equatorialToHorizontal(m.raH, m.decD, lat, lon, jd).alt; }
    const p = planetPos(body, jd);
    return equatorialToHorizontal(p.raH, p.decD, lat, lon, jd).alt;
  }

  /**
   * nightWindow: 로컬 정오부터 24시간 표본화.
   * 반환: 각 임계 고도(h0)의 상승/하강 교차 시각
   */
  function scanDay(lat, lon, dateStr, coarse) {
    const start = jdFromDate(localNoon(dateStr));
    const stepMin = coarse ? 8 : 2;   // coarse: 30일 스캔용(빠름, 박명 ±4분 오차)
    const step = stepMin / 1440;
    const n = Math.ceil(1 / step);
    const samples = [];
    for (let k = 0; k <= n; k++) {
      const jd = start + k * step;
      samples.push({
        jd: jd,
        sun: altitudeOf('sun', jd, lat, lon),
        moon: altitudeOf('moon', jd, lat, lon)
      });
    }
    function crossings(key, h0) {
      const out = [];
      for (let k = 1; k < samples.length; k++) {
        const a = samples[k - 1][key] - h0;
        const b = samples[k][key] - h0;
        if (a === 0 || (a < 0 && b >= 0) || (a > 0 && b <= 0)) {
          const f = a / (a - b);
          out.push({ jd: samples[k - 1].jd + f * step, dir: b > a ? 'rise' : 'set' });
        }
      }
      return out;
    }
    const sunEvents = {
      rise: crossings('sun', -0.833)[0] || null,
      set: crossings('sun', -0.833)[0] || null
    };
    const sunCross = crossings('sun', -0.833);
    const riseC = sunCross.filter(function (c) { return c.dir === 'rise'; });
    const setC = sunCross.filter(function (c) { return c.dir === 'set'; });
    // 정오 이후 첫 하강 = 오늘 일몰, 다음 상승 = 내일 일출
    const sunset = setC.length ? setC[setC.length - 1] : null;
    const sunrise = riseC.length ? riseC[0] : null;

    function duskDawn(h0) {
      const c = crossings('sun', h0);
      const sets = c.filter(function (x) { return x.dir === 'set'; });
      const rises = c.filter(function (x) { return x.dir === 'rise'; });
      return { dusk: sets.length ? sets[sets.length - 1].jd : null, dawn: rises.length ? rises[0].jd : null };
    }
    const civil = duskDawn(-6);
    const nautical = duskDawn(-12);
    const astro = duskDawn(-18);
    // ---- 달 출몰: "오늘 밤" 기준으로 정리 ----
    // 해 질 때 달이 떠 있으면 직전 월출 + 이후 월몰, 아니면 이후 월출 + 그 뒤 월몰
    let moonRise = null, moonSet = null, moonUpAtSunset = false;
    if (sunset) {
      const base = sunset.jd;
      const stepM = 2 / 1440;
      const upAtBase = altitudeOf('moon', base, lat, lon) > 0;
      moonUpAtSunset = upAtBase;
      // 앞으로 최대 30시간
      let prev = altitudeOf('moon', base, lat, lon);
      let riseAfter = null, setAfter = null;
      for (let k = 1; k <= 900; k++) {
        const jd2 = base + k * stepM;
        const h = altitudeOf('moon', jd2, lat, lon);
        if (prev < 0 && h >= 0 && !riseAfter) riseAfter = jd2;
        if (prev >= 0 && h < 0 && !setAfter) setAfter = jd2;
        if (riseAfter && setAfter) break;
        prev = h;
      }
      // 뒤로 최대 20시간 (이미 떠 있을 때 직전 월출)
      let riseBefore = null;
      let prevBack = altitudeOf('moon', base, lat, lon);
      if (upAtBase) {
        for (let k = 1; k <= 600; k++) {
          const jd0 = base - k * stepM;
          const h0 = altitudeOf('moon', jd0, lat, lon);
          if (h0 < 0 && prevBack >= 0) { riseBefore = base - (k - 1) * stepM; break; }
          prevBack = h0;
        }
      }
      moonRise = upAtBase ? (riseBefore || riseAfter) : riseAfter;
      moonSet = setAfter;
    }

    return {
      start: start,
      end: start + 1,
      sunset: sunset ? sunset.jd : null,
      sunrise: sunrise ? sunrise.jd : null,
      civil: civil, nautical: nautical, astro: astro,
      moonRise: moonRise,
      moonSet: moonSet,
      moonUpAtSunset: moonUpAtSunset,
      samples: samples
    };
  }

  /** 특정 적경/적위 천체의 밤 사이 최대 고도·남중·출몰 */
  function objectNight(raH, decD, lat, lon, dateStr) {
    const start = jdFromDate(localNoon(dateStr));
    const step = 4 / 1440;
    const n = Math.round(1.25 / step);   // 30시간: 아침 행성의 몰 시각까지 포함
    let maxAlt = -99, maxJd = start, minAlt = 99, minJd = start;
    let prev = null, riseJd = null, setJd = null;
    for (let k = 0; k <= n; k++) {
      const jd = start + k * step;
      const h = equatorialToHorizontal(raH, decD, lat, lon, jd).alt;
      if (h > maxAlt) { maxAlt = h; maxJd = jd; }
      if (h < minAlt) { minAlt = h; minJd = jd; }
      if (prev !== null) {
        if (prev < 0 && h >= 0 && riseJd === null) riseJd = jd;
        if (prev >= 0 && h < 0 && riseJd !== null && setJd === null) setJd = jd;
      }
      prev = h;
    }
    return {
      maxAlt: maxAlt, maxJd: maxJd, minAlt: minAlt,
      riseJd: riseJd, setJd: setJd,
      circumpolar: minAlt > 0,
      neverUp: maxAlt < 0
    };
  }

  /* --------------------------------------------------- 관측 가능성 지수 */
  function observingScore(moonIllum, bortle, darkHours, cloud) {
    // 달 영향(0~1), 광공해(0~1), 어두운 시간(0~1)
    const moonFactor = 1 - Math.pow(moonIllum, 1.3) * 0.72;
    const bortleFactor = 1 - (Math.max(1, bortle) - 1) / 9 * 0.85;
    const timeFactor = Math.min(1, darkHours / 6);
    const cloudFactor = cloud == null ? 1 : (1 - cloud / 100 * 0.8);
    const score = Math.round(100 * moonFactor * (0.62 + 0.38 * bortleFactor) * (0.7 + 0.3 * timeFactor) * cloudFactor);
    return Math.max(0, Math.min(100, score));
  }

  /* ------------------------------------------------------------- 공개 API */
  return {
    RAD: RAD, DEG: DEG,
    jdFromDate: jdFromDate, dateFromJd: dateFromJd,
    localToDate: localToDate, localMidnight: localMidnight, localNoon: localNoon,
    fmtClock: fmtClock, fmtDateKorean: fmtDateKorean,
    sunPos: sunPos, moonPos: moonPos, planetPos: planetPos, allPlanets: allPlanets,
    PLANET_KR: PLANET_KR,
    gmstHours: gmstHours, lstHours: lstHours,
    equatorialToHorizontal: equatorialToHorizontal,
    moonPhase: moonPhase,
    altitudeOf: altitudeOf, scanDay: scanDay, objectNight: objectNight,
    observingScore: observingScore,
    mod: mod
  };
})();
