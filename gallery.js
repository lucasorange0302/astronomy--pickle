/* =========================================================================
   gallery.js — 천체 사진 갤러리 (도감 · 라이브 하늘 공통)
   · 도감 상세 모달, 메시에/NGC 도감 모달, 라이브 하늘 정보 시트가 모두 이
     컴포넌트 하나를 씁니다. 천체 하나를 열면 사진이 1장이 아니라 5~8장 나옵니다.
   · 사진 순서(우선순위)
       1) assets/space/ 에 미리 받아 둔 NASA·허블·제임스웹 사진
          (photo-sets.js 의 천체별 여러 장 + catalog-photos.js 의 대표 사진)
       2) NASA Image and Video Library (images-api.nasa.gov, CORS 허용)
          — 천체 이름/메시에 번호로 검색하되, 아래 엄격한 필터를 통과한 실사진만
       3) NASA SkyView 실제 하늘 탐사 사진 (DSS2 적색·청색·적외선,
          2MASS-K, WISE 3.4, ROSAT X선) — 좌표만 있으면 어떤 천체든 나옵니다
   · 항성(별)은 NASA 텍스트 검색을 아예 쓰지 않습니다. 'Vega'로 검색하면
     라스베가스(Vegas)·록히드 베가 비행기·베가 로켓이, 'Sirius'로 검색하면
     위성이, 'Orion'으로 검색하면 오리온 우주선 사진이 섞여 나오기 때문입니다.
     별은 실제 전천 탐사 사진(DSS2·2MASS·WISE·ROSAT)으로만 채웁니다.
   · NASA 검색 결과는 제목+설명+키워드를 모두 검사해 비실사/비천문 항목
     (아티스트 컨셉·일러스트·도해·포스터·로켓·우주선·도시/라스베가스 등)을
     버리고, 천문 근거와 천체 이름이 확인된 항목만 채택합니다.
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

  /* ------------------------------------------------------ 항성 이름 색인 */
  // 이름이 겹치는 천체(Vega=라스베가스/비행기, Sirius=위성, Orion=우주선,
  // Atlas=로켓 …)의 NASA 텍스트 검색을 막기 위한 목록입니다.
  var STAR_NAME = {};
  function markStar(s) {
    var k = norm(s);
    if (k && k.length > 1) STAR_NAME[k] = 1;
  }
  (function buildStarIndex() {
    var D = window.SKY_DATA || {};
    (D.stars || []).forEach(function (st) { if (st && st[0]) markStar(st[0]); });
    (D.catalog || []).forEach(function (o) {
      if (!/star|항성|변광|이중성/.test(String(o.type || ''))) return;
      [o.name, o.ko, o.en, o.sub, o.id].forEach(function (x) { if (x) markStar(x); });
    });
    CAT.forEach(function (e) {
      if (e.star) (e.keys || []).forEach(markStar);
    });
    [
      'Vega', 'Sirius', 'Betelgeuse', 'Rigel', 'Deneb', 'Altair', 'Capella', 'Pollux',
      'Procyon', 'Arcturus', 'Antares', 'Spica', 'Regulus', 'Polaris', 'Aldebaran',
      'Fomalhaut', 'Castor', 'Mirach', 'Canopus', 'Achernar', 'Albireo', 'Proxima Centauri',
      'Bellatrix', 'Alnilam', 'Alnitak', 'Mintaka', 'Saiph', 'Wezen', 'Adhara', 'Alhena',
      'Dubhe', 'Merak', 'Phecda', 'Megrez', 'Alioth', 'Mizar', 'Alkaid', 'Schedar', 'Caph',
      'Enif', 'Markab', 'Scheat', 'Alpheratz', 'Mira', 'Algol', 'Thuban', 'Rasalhague',
      'Alphard', 'Zubenelgenubi', 'Nunki', 'Kaus Australis', 'Shaula', 'Peacock', 'Alphecca',
      'Almach', 'Menkalinan', 'Mahasim', 'Wasat', 'Alzirr', 'Mebsuta', 'Tejat', 'Sadalmelik',
      'Sadalsuud', 'Homam', 'Matar', 'Biham', 'Skat', 'Sadalbari', 'Alrescha', 'Acamar',
      'Zaurak', 'Beid', 'Keid', 'Cursa', 'Acrab', 'Dschubba', 'Graffias', 'Lesath',
      'Larawag', 'Rukbat', 'Ascella', 'Albaldah', 'Facies', 'Polis', 'Kaus Borealis',
      'Kaus Media', 'Alnasl', 'Vindemiatrix', 'Porrima', 'Auva', 'Heze', 'Syrma', 'Zaniah',
      'Zavijava', 'Chertan', 'Denebola', 'Algieba', 'Adhafera', 'Subra', 'Rasalas',
      'Alderamin', 'Errai', 'Muliphein', 'Tarazed', 'Alshain', 'Sargas', 'Atria', 'Larawag'
    ].forEach(markStar);
  })();

  var BAYER = /^(?:α|β|γ|δ|ε|ζ|η|θ|ι|κ|λ|μ|ν|ξ|ο|π|ρ|σ|τ|υ|φ|χ|ψ|ω|alf|bet|gam|del|eps|zet|eta|the|iot|kap|lam|mu|nu|xi|omi|pi|rho|sig|tau|ups|phi|chi|psi|ome)\s*[A-Z][a-z]{2}\b/;
  var STAR_CATALOG = /^(HIP|HD|HR|SAO|GJ|TYC)\s*\d/;

  function starNameHit(list) {
    for (var i = 0; i < list.length; i++) {
      var raw = String(list[i] == null ? '' : list[i]).trim();
      if (!raw) continue;
      if (STAR_NAME[norm(raw)]) return true;
      if (BAYER.test(raw) || STAR_CATALOG.test(raw)) return true;
    }
    return false;
  }

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
    // 항성 여부 — type 이 비어 있는 라이브 하늘 객체(kind:'star')까지 잡습니다.
    var isStar = !!(o.kind === 'star' || o.group === 'star') || isStarType(type) ||
      starNameHit(keys) || starNameHit([base.name, base.ko, base.en, base.sub, base.id]);
    // 별자리(kind:'con')는 별자리 자체를 NASA 텍스트 검색하지 않습니다.
    // 'Orion'→오리온 우주선, 'Cygnus'→시그너스 화물선처럼 이름이 겹치는 자료가 섞입니다.
    // 대신 별자리 안 대표 천체(members)의 사진과 중심 좌표의 SkyView 실제 하늘 사진을 씁니다.
    if (o.kind === 'con') isStar = false;
    return {
      ko: ko, en: en, M: M, id: id, type: type, setKey: setKey,
      ra: ra, dec: dec, sizeArcmin: sizeArcmin, mag: mag, isStar: isStar, kind: o.kind || '',
      con: o.kind === 'con',
      fovDeg: typeof o.fovDeg === 'number' ? o.fovDeg : null,
      members: Array.isArray(o.members) ? o.members : [],
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
    var t = String(d.type || '');
    // '행성상성운'은 행성이 아니라 성운입니다 (M57·M27 등).
    if (/성운|성단|은하|초신성|외계행성|nebula|cluster|galaxy/i.test(t)) return false;
    if (/planet|행성|위성|달|태양|moon|sun/i.test(t)) return true;
    return /^(지구|달|태양)$/.test(String(d.ko || '')) ||
      /목성|토성|화성|금성|수성|천왕성|해왕성|명왕성|달|태양/.test(String(d.ko || ''));
  }
  function isStarType(t) { return /star|항성|변광|이중성/.test(String(t || '')); }
  function isBlueType(t) { return isStarType(t) || /OCl|GCl|Cl\+N|\*Ass|성단/.test(String(t || '')); }

  function fovFor(d) {
    // 별자리는 중심 좌표에서 넓게(기본 16°) 잡아 별자리 모양이 한 장에 들어오게 합니다.
    if (d.kind === 'con') return d.fovDeg ? Math.min(24, Math.max(6, d.fovDeg)) : 16;
    if (d.isStar || isStarType(d.type)) {
      if (d.mag != null && d.mag <= 1.6) return 3.0;
      if (d.mag != null && d.mag <= 3) return 1.6;
      return 0.9;
    }
    if (d.sizeArcmin) return Math.min(4, Math.max(0.16, (d.sizeArcmin / 60) * 2.4));
    return 0.7;
  }

  // [탐사 이름, 설명, 느림, 밝기 보정] — 2MASS-K 는 기본 스케일에서 거의 까맣게 나와
  // 빈 사진처럼 보이므로 히스토그램 평탄화로 별을 살립니다.
  var SURVEYS = [
    ['DSS2 Red', '가시광 · DSS2 적색', false, ''],
    ['DSS2 Blue', '가시광 · DSS2 청색', false, ''],
    ['DSS2 IR', '근적외선 · DSS2 IR', false, ''],
    ['2MASS-K', '근적외선 · 2MASS K', true, '&Scaling=HistEq'],
    ['WISE 3.4', '중적외선 · WISE 3.4µm', true, ''],
    ['RASS', 'X선 · ROSAT', false, '']
  ];

  function surveyUrl(d, survey, size, px, extra) {
    if (d.ra == null || d.dec == null || !isFinite(d.ra) || !isFinite(d.dec)) return null;
    var ra = ((d.ra % 360) + 360) % 360;
    return 'https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl' +
      '?Survey=' + encodeURIComponent(survey) +
      '&Position=' + ra.toFixed(4) + ',' + Number(d.dec).toFixed(4) +
      '&Size=' + Number(size).toFixed(2) + '&Pixels=' + (px || 480) + '&Return=JPEG' +
      (extra || '');
  }

  /* ---------------------------------- 광시야 실제 하늘 (CDS HiPS) — 별자리용 */
  // DSS2 컬러·Mellinger 광시야·DSS2 적색 판을 좌표로 잘라 옵니다.
  // NASA SkyView 가 "Too Many Processes" 로 막혀도 별자리 사진이 나오도록 하는 두 번째 경로입니다.
  function hipsUrl(d, hips, size, w, h) {
    if (d.ra == null || d.dec == null || !isFinite(d.ra) || !isFinite(d.dec)) return null;
    var ra = ((d.ra % 360) + 360) % 360;
    return 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits' +
      '?hips=' + encodeURIComponent(hips) +
      '&width=' + (w || 480) + '&height=' + (h || 480) +
      '&fov=' + Number(size).toFixed(2) + '&projection=TAN&coordsys=icrs' +
      '&ra=' + ra.toFixed(4) + '&dec=' + Number(d.dec).toFixed(4) + '&format=jpg';
  }

  var HIPS = [
    ['Mellinger/color', '은하수 광시야 · Mellinger', 'Mellinger All-Sky Panorama'],
    ['DSS2/color', '가시광 컬러 · DSS2', 'Digitized Sky Survey 2 (STScI)'],
    ['2MASS/K', '근적외선 · 2MASS K', '2MASS (UMass/IPAC)'],
    ['DSS2/red', '가시광 적색판 · DSS2', 'Digitized Sky Survey 2 (STScI)'],
    ['DSS2/blue', '가시광 청색판 · DSS2', 'Digitized Sky Survey 2 (STScI)']
  ];

  function hipsCandidates(d) {
    if (d.kind !== 'con' || d.ra == null || d.dec == null) return [];
    var size = fovFor(d);
    var out = [];
    HIPS.forEach(function (h, i) {
      var u = hipsUrl(d, h[0], size, 480, 480);
      if (!u) return;
      out.push({
        src: u, thumb: u,
        title: d.label + ' · 실제 하늘 (' + h[1] + ')',
        credit: 'CDS HiPS · ' + h[2] + ' · 좌표 기반 실제 촬영 이미지',
        link: 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=' + encodeURIComponent(h[0]) +
          '&ra=' + (((d.ra % 360) + 360) % 360).toFixed(3) + '&dec=' + Number(d.dec).toFixed(3) +
          '&fov=' + size.toFixed(2) + '&projection=TAN&coordsys=icrs&format=jpg',
        rank: 150 + i, hips: true, to: 16000
      });
    });
    return out;
  }

  function surveyCandidates(d) {
    if (isSolarSystem(d) || d.ra == null || d.dec == null) return [];
    var size = fovFor(d);
    var out = [];
    SURVEYS.forEach(function (s) {
      var u = surveyUrl(d, s[0], size, 480, s[3]);
      if (!u) return;
      out.push({
        src: u, thumb: u,
        title: d.label + ' · 실제 하늘 (' + s[1] + ')',
        credit: 'NASA SkyView · ' + s[0] + ' · 좌표 기반 실제 관측 사진',
        link: u.replace('&Return=JPEG', ''),
        rank: 200, slow: s[2], survey: true, to: s[2] ? 50000 : 30000
      });
    });
    return out;
  }

  /* ------------------------------------------------------ NASA 사진 라이브러리 */
  // 실사진만 남기는 1차 관문 — 제목·설명·키워드에 하나라도 걸리면 버립니다.
  // 'Vega' 검색이 Las Vegas 를, '… Artist Concept' 이 일러스트를 물고 오던 문제를 막습니다.
  var BAD_WORDS = new RegExp(
    '(las\\s*vegas|nevada|casino|downtown|city\\b|aerial|airport|aircraft|airplane|bomber|' +
    'fighter|turret|missile|rocket|launch|liftoff|hangar|clean\\s*room|facility|museum|' +
    'exhibit|library|booth|crew\\b|astronaut|spacecraft|capsule\\b|space\\s*station|' +
    'history\\s*of|artist|illustration|concept|artwork|painting|drawing|sketch|diagram|' +
    'chart\\b|infographic|poster|logo|banner|emblem|rendering|simulated|simulation|' +
    'computer[- ]generated|selfie|press\\b|briefing|conference|ceremony|award|' +
    'headquarters|celebration|festival|parade|pennsylvania|houston|florida|california|' +
    'texas\\b|virginia|maryland|ohio\\b|alabama)', 'i');

  // 실사진이라도 천문 근거가 있어야 채택합니다 (도시·항공·인물 사진 배제).
  var ASTRO_WORDS = new RegExp(
    '(nebula|galaxy|galaxies|cluster|star\\b|stars\\b|stellar|supernova|remnant|pulsar|' +
    'quasar|comet|asteroid|meteor|planet|moon\\b|cosmic|universe|astronom|telescope|' +
    'hubble|webb|jwst|spitzer|chandra|galex|herschel|observatory|infrared|ultraviolet|' +
    'x-ray|light-year|parsec|deep field|sky\\b|eclipse|occultation|photosphere|corona|' +
    'messier|ngc|magellanic|milky way|jupiter|saturn|mars\\b|venus|mercury|uranus|' +
    'neptune|pluto|ceres|europa|ganymede|callisto|titan|enceladus|triton)', 'i');

  // 실제 망원경·관측소 촬영 근거 (있으면 앞쪽에 배치).
  var TELESCOPE = /(hubble|webb|jwst|spitzer|chandra|galex|herschel|observatory|telescope|stsc|eso\b)/i;

  // 'nebula' 처럼 어디에나 붙는 단어만으로는 그 천체 사진이라고 볼 수 없습니다.
  var GENERIC_WORD = /^(nebula|galaxy|galaxies|cluster|star|stars|stellar|planetary|supernova|remnant|infrared|ultraviolet|light|cosmic|deep|field|sky)$/i;

  function ascii(s) { return /^[\x20-\x7e]+$/.test(String(s || '')); }

  function typeWord(d) {
    var t = String(d.type || '');
    if (/성운|Neb|HII|PN\b|RfN|Cl\+N/.test(t)) return 'nebula';
    if (/초신성|SNR/.test(t)) return 'supernova';
    if (/은하|^G$/.test(t)) return 'galaxy';
    if (/성단|OCl|GCl|\*Ass/.test(t)) return 'cluster';
    return '';
  }

  function isDesignation(s) { return /^(m|ngc|ic)\s*-?\s*\d+$/i.test(String(s || '').trim()); }

  function asciiNames(d) {
    var out = [];
    function push(s) {
      s = String(s || '').replace(/\s+/g, ' ').trim();
      if (!s || !ascii(s) || s.length < 3) return;
      if (isDesignation(s) || BAYER.test(s) || STAR_CATALOG.test(s)) return;
      if (!/^[A-Za-z][A-Za-z' .-]*$/.test(s)) return;
      if (s.split(' ').every(function (w) { return w.length < 3; })) return;
      if (out.some(function (x) { return x.toLowerCase() === s.toLowerCase(); })) return;
      out.push(s);
    }
    var entry = lookupPhotoEntry(d);
    if (entry) (entry.keys || []).forEach(push);
    (d.keys || []).forEach(push);
    return out;
  }

  function nasaQueries(d) {
    var qs = [];
    function push(q) {
      q = String(q || '').replace(/\s+/g, ' ').trim();
      if (!q || !ascii(q) || q.length < 3) return;
      if (qs.some(function (x) { return x.toLowerCase() === q.toLowerCase(); })) return;
      qs.push(q);
    }
    var tw = typeWord(d);
    var names = asciiNames(d);
    if (names.length) {
      // 유형 단어가 이미 들어 있는 이름('Orion Nebula')을 가장 먼저 씁니다.
      var typed = names.filter(function (n) { return tw && new RegExp('\\b' + tw, 'i').test(n); });
      var plain = names.filter(function (n) { return typed.indexOf(n) < 0; });
      typed.concat(plain).slice(0, 2).forEach(function (n) {
        push(tw && !new RegExp('\\b' + tw, 'i').test(n) ? n + ' ' + tw : n);
      });
    }
    var M = String(d.M || '').match(/^M\s*(\d+)$/i) ||
      (d.keys || []).map(function (k) { return String(k).match(/^M\s*(\d+)$/i); })
        .filter(Boolean)[0];
    if (M) push('Messier ' + M[1]);
    return qs.slice(0, 2);
  }

  // 같은 이름의 다른 천체(예: 'Southern Ring Nebula'=NGC 3132, 'Messier 51')를 걸러 냅니다.
  function findDesignations(text) {
    var out = {}, re = /\b(Messier|M|NGC|IC)\s*-?\s*(\d{1,4})\b/gi, m;
    while ((m = re.exec(String(text || '')))) {
      var p = m[1].toUpperCase();
      out[(p === 'MESSIER' ? 'M' : p) + String(parseInt(m[2], 10))] = 1;
    }
    return Object.keys(out);
  }

  function designationSet(list) {
    var out = {};
    (list || []).forEach(function (s) { findDesignations(s).forEach(function (k) { out[k] = 1; }); });
    return Object.keys(out);
  }

  function titleKey(t) {
    return String(t || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
  }

  function wordHit(text, token) {
    var t = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + t + '([^a-z0-9]|$)', 'i').test(text);
  }

  function relevant(item, d, q) {
    if (d && d.isStar) return false;         // 항성은 텍스트 검색 자체를 쓰지 않습니다
    var md = (item.data && item.data[0]) || {};
    var title = String(md.title || '');
    var desc = String(md.description || '');
    var kw = (md.keywords || []).join(' ');
    var text = title + ' ' + desc + ' ' + kw;
    if (!title) return false;
    if (BAD_WORDS.test(text)) return false;
    if (/^[A-Z]{0,4}[-\d][\w-]*$/.test(title)) return false;   // 'ARC-1990-AC79-7127' 같은 관리번호
    if (/^(ARC|HQ|KSC|JSC|LRC|SSC|DFRC|AFRC|GRC|LaRC)-/i.test(String(md.nasa_id || ''))) return false;
    if (!ASTRO_WORDS.test(text)) return false;

    var tokens = q.toLowerCase().split(/\s+/).filter(function (t) { return t.length > 2; });
    if (!tokens.length) return false;
    for (var i = 0; i < tokens.length; i++) if (!wordHit(text, tokens[i])) return false;
    var anchors = tokens.filter(function (t) { return !GENERIC_WORD.test(t); });
    if (!anchors.length) anchors = tokens;

    // 다른 천체 번호가 적혀 있으면 그 사진은 다른 천체입니다.
    var mine = designationSet(d && d.keys);
    var found = findDesignations(text);
    var match = found.some(function (x) { return mine.indexOf(x) >= 0; });
    if (mine.length && found.length && !match) return false;

    // 천체 이름이 제목에 있어야 그 천체 사진이라고 볼 수 있습니다.
    if (anchors.some(function (t) { return wordHit(title, t); })) return true;
    // 제목에 없으면 키워드 + 번호가 함께 맞아야 합니다.
    return match && anchors.some(function (t) { return wordHit(kw, t); });
  }

  function nasaSearch(q, n, d) {
    if (typeof window.fetch !== 'function') return Promise.resolve([]);
    var url = 'https://images-api.nasa.gov/search?media_type=image&page_size=' + n + '&q=' + encodeURIComponent(q);
    return window.fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('nasa ' + r.status);
      return r.json();
    }).then(function (j) {
      var items = (j && j.collection && j.collection.items) || [];
      var out = [];
      var seenTitle = {};
      items.forEach(function (it, idx) {
        if (!relevant(it, d, q)) return;
        var md = (it.data && it.data[0]) || {};
        var key = titleKey(md.title);
        if (!key || seenTitle[key]) return;
        var href = (it.links && it.links[0] && it.links[0].href) || '';
        if (!href) return;
        seenTitle[key] = 1;
        var thumb = href;
        var big = href.replace(/~thumb\.jpg$/i, '~medium.jpg').replace(/~small\.jpg$/i, '~medium.jpg')
          .replace(/~orig\.jpg$/i, '~medium.jpg');
        var body = String(md.title || '') + ' ' + String(md.description || '') + ' ' +
          (md.keywords || []).join(' ');
        out.push({
          src: big, thumb: thumb,
          title: md.title || q,
          credit: 'NASA Image Library' + (md.center ? ' · ' + md.center : '') +
            (md.date_created ? ' · ' + String(md.date_created).slice(0, 10) : ''),
          link: md.nasa_id ? 'https://images.nasa.gov/details/' + encodeURIComponent(md.nasa_id) : '',
          nasa: md.nasa_id || '', rank: 100,
          score: (TELESCOPE.test(body) ? 2 : 0) + (idx < 3 ? 1 : 0)
        });
      });
      out.sort(function (a, b) { return b.score - a.score; });
      return out;
    }).catch(function () { return []; });
  }

  /* ------------------------------------------------------------ 후보 모으기 */
  function localCandidates(d) {
    var out = [];
    // 별자리 — 별자리 안 대표 천체의 실제 사진(로컬 NASA·허블·제임스웹)을 먼저 모읍니다.
    if (d.kind === 'con' && d.members.length) {
      d.members.forEach(function (m) {
        var md = describe(m);
        localCandidates(md).slice(0, 2).forEach(function (c) {
          out.push({
            src: c.src, thumb: c.thumb,
            title: (c.title && String(c.title).indexOf(md.label) === 0)
              ? c.title : (md.label + ' — ' + (c.title || '사진')),
            credit: c.credit, link: c.link, rank: 0
          });
        });
      });
      if (out.length) return out;
    }
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
      var timer = setTimeout(function () { if (!done) { done = true; resolve(false); } }, c.to || (c.slow ? 32000 : 15000));
      im.onload = function () {
        if (done) return;
        if (im.naturalWidth > 0) { done = true; clearTimeout(timer); resolve(true); }
        else { im.onerror && im.onerror(); }
      };
      im.onerror = function () {
        if (done) return;
        if (c.thumb && c.thumb !== c.src) { c.src = c.thumb; im.src = c.thumb; return; }
        // SkyView 는 가끔 한 번 실패합니다. 탐사 사진은 한 번만 다시 시도합니다.
        if (c.survey && !c.retried) {
          c.retried = 1;
          setTimeout(function () { if (!done) im.src = c.src + '&_r=' + Date.now(); }, 1200);
          return;
        }
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
      if (!fig.isConnected) { S.alive = false; return; }   // 창을 닫았으면 그만 받습니다
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
        // 별자리 — 별자리 이름 대신, 별자리 안 대표 천체 이름으로만 NASA를 검색합니다.
        if (d.kind === 'con' && d.members.length) {
          var mems = d.members.slice(0, 2);
          var chain = Promise.resolve();
          mems.forEach(function (m) {
            chain = chain.then(function () {
              if (stop()) return null;
              var md = describe(m);
              if (md.isStar || md.ra == null) return null;   // 항성은 텍스트 검색 제외(이름 충돌)
              var qs = nasaQueries(md);
              if (!qs.length) return null;
              return nasaSearch(qs[0], 6, md).then(function (list) {
                var seen2 = {}, fresh = [];
                list.forEach(function (c) {
                  if (!c.src || seen2[c.src]) return;
                  seen2[c.src] = 1; fresh.push(c);
                });
                fresh.forEach(function (c, i) { c.rank = 100 + i; });
                return runQueue(fresh, 4, stop, addItem);
              });
            });
          });
          // NASA 검색이 느리거나 막혀도 6초 뒤에는 광시야 실제 하늘 사진을 이어서 받습니다.
          return Promise.race([
            chain,
            new Promise(function (res) { setTimeout(function () { res(null); }, 6000); })
          ]);
        }
        // 항성은 NASA 텍스트 검색을 완전히 차단합니다. 'Vega' → 라스베가스,
        // 'Sirius' → 위성, 'Orion' → 오리온 우주선처럼 이름이 겹치는 자료가
        // 섞여 들어오기 때문입니다. 별은 실제 하늘 탐사 사진으로만 채웁니다.
        if (d.isStar) return null;
        var qs = nasaQueries(d);
        if (!qs.length) return null;
        return nasaSearch(qs[0], 8, d).then(function (list) {
          if (!list.length && qs[1]) return nasaSearch(qs[1], 6, d);
          if (qs[1] && list.length < 5) {
            return nasaSearch(qs[1], 6, d).then(function (more) {
              var seenSrc = {}, seenTitle = {};
              list.forEach(function (c) {
                seenSrc[c.src] = 1;
                seenTitle[titleKey(c.title)] = 1;
              });
              return list.concat(more.filter(function (c) {
                var t = titleKey(c.title);
                if (!c.src || seenSrc[c.src] || seenTitle[t]) return false;
                seenSrc[c.src] = 1; seenTitle[t] = 1;
                return true;
              }));
            });
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
        if (d.kind === 'con') {
          var hc = hipsCandidates(d);
          return runQueue(hc, 3, stop, addItem);
        }
        return null;
      }).then(function () {
        if (stop()) return null;
        // 별자리는 이미 5장 이상이면 SkyView(느리고 가끔 막힘)를 건너뜁니다.
        if (d.kind === 'con' && S.items.length >= 5) return null;
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
      // 화살표를 누른 손가락은 스와이프로 보지 않습니다 (한 번에 두 칸 이동 방지)
      if (e.target && e.target.closest && e.target.closest('.sg-arrow')) { sx = null; return; }
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
