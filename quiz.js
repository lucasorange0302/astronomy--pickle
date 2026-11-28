/* =========================================================================
   별너울 — 도감 퀴즈 · 하늘 탐험 (quiz.js)
   · 문제는 도감(SKY_DATA.catalog · SPACE_CATALOG 2,571종)과 별자리 88종의
     실제 값에서 자동으로 만들어집니다. 따로 외운 정답표가 없습니다.
   · **문제 범위(대표 도감 / 도감+88별자리 / 전체 도감)** 와
     **문제 난이도(쉬움 / 보통 / 어려움)** 를 따로 고릅니다. 8문제.
   · 난이도가 올라갈수록 색다른 유형이 섞입니다 —
     카탈로그 번호 매칭, 소거형(다른 하나), 맨눈 한계, 밝기 배수,
     적위 기반 한국 관측 가능성, 관측 계절, 천체–별자리/종류 짝짓기.
   · 정확성 안전장치
     ① 설명→이름 유형은 한국어 설명이 있는 항목에서만,
     ② 등급 문제(가장 밝은·어두운·맨눈 한계·배수)는 손으로 검수한
        대표 도감(48종)의 등급에서만(전체 도감의 근사·대체 등급 배제),
     ③ 보기 4개는 항상 서로 다르고, 서로를 포함하는 이름은 오답에서 제외,
     ④ 좌표·등급은 데이터 값 그대로 계산하고 해설에 근거를 적습니다.
   · 결과 화면의 도감 카드·별자리 카드·🎯 조준은 대표 도감 카드 id,
     전체 도감 항목 id·적경/적위, 별자리 약자로 각각 이어집니다.
   ========================================================================= */
(function () {
  'use strict';

  var TOTAL = 8;
  var LAT = 37.2;               // 한국(오산) 기준 위도 — 적위 문제의 기준
  var SEASONS = ['봄', '여름', '가을', '겨울'];

  var SCOPES = [
    { v: 1, name: '대표 도감', sub: '48종 · 사진·설명 카드' },
    { v: 2, name: '도감 + 88별자리', sub: '48종 + IAU 별자리 88' },
    { v: 3, name: '전체 도감', sub: '2,571종 전체' }
  ];
  var LEVELS = [
    { v: 1, name: '쉬움', sub: '기본 4유형' },
    { v: 2, name: '보통', sub: '+ 번호·소거형' },
    { v: 3, name: '어려움', sub: '색다른 유형 다수' }
  ];

  /* ------------------------------------------------------------- 자료형 표 */
  // 전체 도감의 원본 종류 코드 → 퀴즈에서 쓰는 우리말 종류 이름
  var WIDE_TYPE = {
    G: '은하', GPair: '은하', GTrpl: '은하', GGroup: '은하',
    OCl: '산개성단', GCl: '구상성단',
    PN: '행성상성운',
    Neb: '성운', EmN: '성운', RfN: '성운', HII: '성운', DrkN: '성운',
    SNR: '초신성 잔해', 'Cl+N': '성단+성운',
    star: '항성', var: '항성', sun: '항성',
    dstar: '이중성',
    planet: '행성', dwarf: '왜소행성', moon: '위성',
    bh: '블랙홀', pulsar: '펄서', exo: '외계행성'
  };
  // 보기로 쓸 수 있는 종류. (한쪽이 다른 쪽을 품는 종류는 TYPE_BLOCK 으로 막습니다)
  var TYPE_CHOICES = ['성운', '은하', '항성', '산개성단', '구상성단', '행성상성운',
    '초신성 잔해', '이중성', '행성', '왜소행성', '위성', '블랙홀', '펄서', '변광성',
    '외계행성', '성단+성운', '유성우'];
  // 정답 종류 → 오답으로 쓰면 애매한 종류
  var TYPE_BLOCK = {
    '초신성 잔해': ['성운', '행성상성운'],
    '행성상성운': ['성운'],
    '성단+성운': ['성운', '산개성단'],
    '이중성': ['항성', '변광성'],
    '항성': ['변광성', '이중성'],
    '행성': ['왜소행성', '위성'],
    '왜소행성': ['행성'],
    '위성': ['행성', '왜소행성'],
    '외계행성': ['행성'],
    '은하': [], '성운': [], '산개성단': [], '구상성단': [],
    '블랙홀': [], '펄서': [], '변광성': [], '유성우': []
  };
  var TYPE_FIX = { '항성(적색왜성)': '항성', '초신성잔해': '초신성 잔해' };

  /* ------------------------------------------------------------- 도구 */
  function D() { return window.SKY_DATA || {}; }
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pick(a) { return a && a.length ? a[Math.floor(Math.random() * a.length)] : null; }
  function uniq(a) {
    var seen = {};
    return a.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
  }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function hasHangul(s) { return /[가-힣]/.test(String(s || '')); }
  // 받침 유무에 따라 조사를 골라 '은(는)' 같은 괄호 표기를 없앱니다.
  // 숫자로 끝나는 이름('M59')은 마지막 숫자의 우리말 소리(구·일·이…)로 판단합니다.
  var DIGIT_BATCHIM = { '0': false, '1': true, '2': false, '3': true, '4': false,
    '5': false, '6': true, '7': true, '8': true, '9': false };
  function josa(word, withBatchim, without) {
    var s = String(word || '');
    if (!s) return withBatchim;
    var c = s.charCodeAt(s.length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) return ((c - 0xAC00) % 28) ? withBatchim : without;
    var ch = s.charAt(s.length - 1);
    if (ch >= '0' && ch <= '9') return DIGIT_BATCHIM[ch] ? withBatchim : without;
    return withBatchim;
  }
  function fmtMag(v) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    var s = v.toFixed(1);
    if (s === '0.0' || s === '-0.0') return '0.0';
    return (v > 0 ? '+' : '') + s;
  }
  // 해설에 붙일 때 이미 이름에 들어 있는 번호는 빼고 적습니다('검은눈은하 (M64) (M64)' 방지)
  function catNote(o) {
    var bits = [];
    if (o.m && String(o.name || '').indexOf(o.m) < 0) bits.push('메시에 ' + o.m);
    if (o.ngc && String(o.name || '').indexOf(o.ngc) < 0 && String(o.name || '').indexOf(o.ngc.replace(' ', '')) < 0) bits.push(o.ngc);
    return bits.join(' · ');
  }
  // 'NGC7000' → 'NGC 7000', 'NGC0224' → 'NGC 224'
  function dispCat(s) {
    var m = String(s || '').toUpperCase().replace(/\s+/g, '').match(/^(NGC|IC)(\d+)$/);
    if (m) return m[1] + ' ' + String(parseInt(m[2], 10));
    return String(s || '');
  }
  function normCat(s) {
    var m = String(s || '').toUpperCase().replace(/\s+/g, '').match(/^(NGC|IC|M)(\d+)$/);
    if (m) return m[1] + String(parseInt(m[2], 10));
    return String(s || '').toUpperCase().replace(/\s+/g, '');
  }
  // 이름이 서로를 품는 경우('헤르쿨레스 구상성단' vs '…(M13)')를 걸러 냅니다.
  function namesClash(a, b) {
    a = String(a || ''); b = String(b || '');
    if (!a || !b) return true;
    return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }

  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('bw.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem('bw.' + k, JSON.stringify(v)); } catch (e) {}
    }
  };

  /* ------------------------------------------------------------- 문제 재료 */
  var CACHE = {};

  // 대표 도감 48종 — 손으로 검수한 이름·설명·등급·관측 시기.
  function repPool() {
    if (CACHE.rep) return CACHE.rep;
    var out = (D().catalog || []).filter(function (o) {
      return o && o.name && o.type;
    }).map(function (o) {
      var type = TYPE_FIX[o.type] || o.type;
      var m = null, ngc = null;
      String(o.sub || '').split('/').forEach(function (part) {
        part = part.trim();
        var mm = part.match(/^M\s*0*(\d+)$/i);
        if (mm) { m = 'M' + String(parseInt(mm[1], 10)); return; }
        var nn = part.match(/^(NGC|IC)\s*0*(\d+)$/i);
        if (nn) ngc = nn[1].toUpperCase() + ' ' + String(parseInt(nn[2], 10));
      });
      return {
        name: o.name, sub: o.sub || '', type: type, con: o.con || '',
        brief: o.brief || '', mag: num(o.mag), id: o.id,
        months: o.months || null,
        ra: (typeof o.raH === 'number' ? o.raH * 15 : null),
        dec: num(o.decD), group: o.group || '', diff: o.diff || 3, equip: o.equip || 3,
        m: m, ngc: ngc, src: 'catalog', wide: null
      };
    });
    CACHE.rep = out;
    return out;
  }

  function conNameMap() {
    if (CACHE.conMap) return CACHE.conMap;
    var map = {};
    conPool().forEach(function (c) { map[c.abbr] = c.name; });
    CACHE.conMap = map;
    return map;
  }
  function conPool() {
    if (CACHE.cons) return CACHE.cons;
    CACHE.cons = (D().constellations || []).filter(function (c) { return c && c.name && c.abbr; });
    return CACHE.cons;
  }

  // 전체 도감 2,571종 — 한국어 이름이 없어도 카탈로그 번호로 문제 재료가 됩니다.
  function widePool() {
    if (CACHE.wide) return CACHE.wide;
    var items = (window.SPACE_CATALOG && window.SPACE_CATALOG.items) || [];
    var conMap = conNameMap();
    var repBy = {};
    repPool().forEach(function (o) {
      if (o.id) repBy[normCat(o.id)] = o;
      if (o.m) repBy[normCat(o.m)] = o;
      if (o.ngc) repBy[normCat(o.ngc)] = o;
    });
    var out = [];
    items.forEach(function (it) {
      var rep = repBy[normCat(it.i)] || (it.M ? repBy[normCat(it.M)] : null);
      var ko = String(it.ko || '').trim();
      var korean = hasHangul(ko) && !/^(NGC|IC|M\d|Sun$|Moon$)/.test(ko);
      var M = /^M\d+$/.test(String(it.M || '')) ? String(it.M) : '';
      var ngc = null;
      [it.ko, it.en].forEach(function (v) {
        var m = String(v || '').replace(/\s+/g, '').match(/^(NGC|IC)0*(\d+)$/i);
        if (m && !ngc) ngc = m[1].toUpperCase() + ' ' + String(parseInt(m[2], 10));
      });
      if (rep) {
        // 대표 도감 카드가 있으면 그 이름·설명·검수 등급을 그대로 씁니다.
        out.push({
          name: rep.name, sub: rep.sub, type: rep.type, con: rep.con,
          brief: rep.brief, mag: rep.mag, id: rep.id, months: rep.months,
          ra: rep.ra, dec: rep.dec, group: rep.group, diff: rep.diff, equip: rep.equip,
          m: rep.m || M, ngc: rep.ngc || ngc, src: 'catalog', wide: it.i
        });
        return;
      }
      var name;
      if (korean) name = ko + (M && ko.indexOf(M) < 0 ? ' (' + M + ')' : '');
      else if (M) name = M;
      else name = dispCat(it.i);
      var group = it.k === 'd' ? 'dso' : (it.k === 's' ? 'star' : (it.k === 'p' ? 'solar' : 'exotic'));
      out.push({
        name: name, sub: '', type: WIDE_TYPE[it.t] || '', con: conMap[it.c] || '',
        brief: korean ? String(it.x || '') : '',
        mag: num(it.m), id: null, months: null,
        ra: num(it.ra), dec: num(it.dec), group: group,
        m: M, ngc: ngc, src: 'wide', wide: it.i, wtype: it.t
      });
    });
    CACHE.wide = out;
    return out;
  }

  // 전체 도감 범위 = 전체 도감 2,571종 + 대표 도감에만 있는 항목(행성·유성우 등)
  function allPool() {
    if (CACHE.all) return CACHE.all;
    var out = [], seen = {};
    widePool().forEach(function (o) {
      out.push(o);
      if (o.id) seen['id:' + o.id] = 1;
      if (o.wide) seen['w:' + o.wide] = 1;
    });
    repPool().forEach(function (o) {
      if (o.id && !seen['id:' + o.id]) out.push(o);
    });
    CACHE.all = out;
    return out;
  }

  function objPool(scope) {
    if (scope <= 2) return repPool();
    return allPool();
  }

  // 쉬움 — 눈에 익은 밝은 천체 위주(범위는 유지)
  function poolFor(scope, level) {
    var full = objPool(scope);
    if (level !== 1) return full;
    if (scope === 1) {
      var a = full.filter(function (o) { return o.diff <= 2 && o.equip <= 2; });
      return a.length >= 12 ? a : full;
    }
    if (scope === 2) return full;
    var b = full.filter(function (o) {
      if (o.src === 'catalog') return true;
      if (o.group === 'star') return true;
      return o.mag != null && o.mag <= 7.5 && o.dec != null && o.dec > -30;
    });
    return b.length >= 20 ? b : full;
  }

  /* ------------------------------------------------------------- 공통 보기 */
  function nameChoices(pool, o, n) {
    var out = [];
    shuffle(pool).forEach(function (x) {
      if (out.length >= n) return;
      if (!x || !x.name) return;
      if (namesClash(x.name, o.name)) return;
      if (out.indexOf(x.name) >= 0) return;
      out.push(x.name);
    });
    return out;
  }
  function valueChoices(list, skip, n) {
    var out = [];
    shuffle(list).forEach(function (v) {
      if (out.length >= n) return;
      if (!v || v === skip || out.indexOf(v) >= 0) return;
      out.push(v);
    });
    return out;
  }

  function mk(kind, obj, q, choices, answer, why, key) {
    return {
      kind: kind, obj: obj, q: q, choices: choices, answer: answer, why: why,
      key: key || (obj && obj.name) || answer
    };
  }
  function valid(q) {
    if (!q || !q.q || !q.why || !q.answer) return false;
    if (!q.choices || q.choices.length !== 4) return false;
    if (uniq(q.choices).length !== 4) return false;
    return q.choices.indexOf(q.answer) >= 0;
  }
  // 천체 해설의 공통 꼬리 — 별자리·카탈로그 번호·검수 등급
  function whyObj(o, head) {
    var bits = [];
    if (o.con && o.con.indexOf('자리') >= 0 && head.indexOf(o.con) < 0) bits.push(o.con);
    if (o.ngc && String(o.ngc).indexOf('NGC') === 0) bits.push(o.ngc);
    if (o.m) bits.push('메시에 ' + o.m);
    if (o.src === 'catalog' && o.mag != null) bits.push('겉보기 등급 ' + fmtMag(o.mag));
    var tail = bits.length ? ' (' + bits.join(' · ') + ')' : '';
    var brief = String(o.brief || '').trim();
    return head + tail + (brief && brief.indexOf(o.name) < 0 ? ' ' + brief : '');
  }

  /* ------------------------------------------------------------- 유형별 문제 */

  // 이름에 답(별자리)이 그대로 들어 있는 천체를 걸러 냅니다.
  //  예: '오리온 대성운' → 별자리 문제의 답이 이름에 있음, 'Zet Oph' → 약자 Oph 노출
  var CON_ABBR = null;
  function conAbbr(name) {
    if (!CON_ABBR) {
      CON_ABBR = {};
      conPool().forEach(function (c) { CON_ABBR[c.name] = c.abbr; });
    }
    return CON_ABBR[name] || '';
  }
  function conLeak(o) {
    if (!o || !o.con) return true;
    var nm = String(o.name || '');
    if (nm.indexOf(o.con) >= 0) return true;            // '쌍둥이자리 산개성단', '사냥개자리 구상성단'
    var stem = o.con.replace(/자리$/, '');
    if (stem.length >= 3 && nm.indexOf(stem) >= 0) return true;   // '오리온 대성운', '헤르쿨레스 구상성단'
    var ab = conAbbr(o.con);
    if (ab && new RegExp('(^|[^A-Za-z])' + ab + '($|[^A-Za-z])').test(nm)) return true;
    return false;
  }

  // 1) 천체 종류
  function qType(pool) {
    var cands = pool.filter(function (o) { return o.type && TYPE_CHOICES.indexOf(o.type) >= 0; });
    var o = pick(cands);
    if (!o) return null;
    var block = TYPE_BLOCK[o.type] || [];
    var others = shuffle(TYPE_CHOICES.filter(function (t) {
      return t !== o.type && block.indexOf(t) < 0;
    })).slice(0, 3);
    if (others.length < 3) return null;
    return mk('type', o,
      '‘' + o.name + '’' + josa(o.name, '은', '는') + ' 어떤 종류의 천체일까요?',
      shuffle([o.type].concat(others)), o.type,
      whyObj(o, o.name + josa(o.name, '은', '는') + ' ' + o.type + '입니다.'));
  }

  // 2) 별자리 찾기
  function qCon(pool) {
    var names = conPool().map(function (c) { return c.name; });
    var cands = pool.filter(function (o) { return o.con && names.indexOf(o.con) >= 0; });
    var clean = cands.filter(function (o) { return !conLeak(o); });
    if (clean.length >= 6) cands = clean;
    var o = pick(cands);
    if (!o) return null;
    var others = shuffle(names.filter(function (c) { return c !== o.con; })).slice(0, 3);
    if (others.length < 3) return null;
    return mk('con', o,
      '‘' + o.name + '’' + josa(o.name, '을', '를') + ' 찾아갈 수 있는 별자리는?',
      shuffle([o.con].concat(others)), o.con,
      whyObj(o, o.name + josa(o.name, '은', '는') + ' ' + o.con + '에 있습니다.'));
  }

  // 3) 한 줄 설명 → 이름 (한국어 설명이 있는 항목에서만)
  function briefText(o) {
    var b = String(o.brief || '').replace(/\s+/g, ' ').trim();
    if (!b || b.indexOf(o.name) >= 0) return '';
    if (b.length < 14 || b.length > 110) return '';
    if (/카탈로그|좌표|출처|데이터|목록의 천체|자동 생성/.test(b)) return '';
    if (/^겉보기 등급/.test(b)) return '';   // 항성의 기계적 설명은 이름 맞히기 재료로 약합니다
    return b;
  }
  function qBrief(pool) {
    var cands = pool.filter(function (o) {
      return hasHangul(o.name) && briefText(o);
    });
    var o = pick(cands);
    if (!o) return null;
    var b = briefText(o);
    var others = nameChoices(pool.filter(function (x) { return hasHangul(x.name); }), o, 3);
    if (others.length < 3) return null;
    return mk('brief', o,
      '“' + b + '” — 이 설명에 해당하는 천체는?',
      shuffle([o.name].concat(others)), o.name,
      '정답은 ' + o.name + '입니다. ' + b);
  }

  // 4) 가장 밝은 것 (검수 등급 = 대표 도감만)
  function magPool() {
    // 등급은 손으로 검수한 대표 도감(48종)에서만 — 전체 도감에는 근사·대체 등급이 섞여 있습니다.
    return repPool().filter(function (o) {
      return o.mag != null && (o.group === 'dso' || o.group === 'star');
    });
  }
  function qMag(pool, level) {
    var withMag = magPool();
    if (withMag.length < 8) return null;
    var four = shuffle(withMag).slice(0, 4);
    var sorted = four.slice().sort(function (a, b) { return a.mag - b.mag; });
    var ans = sorted[0];
    if (sorted.filter(function (o) { return o.mag === ans.mag; }).length !== 1) return null;
    var gap = sorted[1].mag - ans.mag;
    if (gap < (level === 1 ? 0.9 : 0.2)) return null;
    return mk('mag', ans,
      '다음 중 겉보기 등급이 가장 밝은(숫자가 가장 작은) 천체는?',
      shuffle(four.map(function (o) { return o.name; })), ans.name,
      sorted.map(function (o) { return o.name + ' ' + fmtMag(o.mag) + '등'; }).join(' · ') +
      ' — 등급 숫자가 작을수록 밝습니다.');
  }

  // 5) 맨눈 관측 한계 · 가장 어두운 천체
  function qDim(pool) {
    var withMag = magPool();
    if (withMag.length < 8) return null;
    var mode = Math.random() < 0.5 ? 'limit' : 'faint';
    if (mode === 'limit') {
      var faint = shuffle(withMag.filter(function (o) { return o.mag >= 7.2; })).slice(0, 1);
      var bright = shuffle(withMag.filter(function (o) { return o.mag <= 5.4; })).slice(0, 3);
      if (!faint.length || bright.length < 3) return null;
      var ans = faint[0];
      var names = [ans.name].concat(bright.map(function (o) { return o.name; }));
      if (uniq(names).length !== 4) return null;
      return mk('dim', ans,
        '맨눈으로 볼 수 있는 한계를 6등급이라고 할 때, 다음 중 맨눈으로 볼 수 없는 천체는?',
        shuffle(names), ans.name,
        names.map(function (n) {
          var o = (n === ans.name ? ans : bright.filter(function (x) { return x.name === n; })[0]);
          return n + ' ' + fmtMag(o.mag) + '등';
        }).join(' · ') +
        ' — 6등급보다 어두운(숫자가 큰) 천체는 맨눈에 보이지 않습니다. 도시 하늘에서는 4등급 정도가 한계입니다.');
    }
    var four = shuffle(withMag).slice(0, 4);
    var sorted = four.slice().sort(function (a, b) { return b.mag - a.mag; });
    var dimmest = sorted[0];
    if (sorted.filter(function (o) { return o.mag === dimmest.mag; }).length !== 1) return null;
    if (dimmest.mag - sorted[1].mag < 0.4) return null;
    return mk('dim', dimmest,
      '다음 중 겉보기 등급이 가장 어두운(숫자가 가장 큰) 천체는?',
      shuffle(four.map(function (o) { return o.name; })), dimmest.name,
      sorted.map(function (o) { return o.name + ' ' + fmtMag(o.mag) + '등'; }).join(' · ') +
      ' — 등급 숫자가 클수록 어둡습니다.');
  }

  // 6) 등급 차이 → 밝기 배수 (2.512^Δm)
  function qRatio(pool) {
    var withMag = magPool();
    if (withMag.length < 10) return null;
    var RATIO = [2.5, 6.3, 16, 40, 100, 250];   // Δm = 1 … 6
    for (var t = 0; t < 60; t++) {
      var pair = shuffle(withMag).slice(0, 2);
      if (pair.length < 2) return null;
      var d = Math.abs(pair[0].mag - pair[1].mag);
      var n = Math.round(d);
      if (n < 2 || n > 5 || Math.abs(d - n) > 0.15) continue;
      var bright = pair[0].mag < pair[1].mag ? pair[0] : pair[1];
      var faint = bright === pair[0] ? pair[1] : pair[0];
      if (namesClash(bright.name, faint.name)) continue;
      var ansTxt = '약 ' + RATIO[n - 1] + '배';
      var wrongPool = [];
      [n - 2, n - 1, n + 1, n + 2].forEach(function (k) {
        if (k >= 1 && k <= 6 && k !== n) wrongPool.push('약 ' + RATIO[k - 1] + '배');
      });
      var wrongs = shuffle(uniq(wrongPool)).slice(0, 3);
      if (wrongs.length < 3) continue;
      return mk('ratio', bright,
        '겉보기 등급이 ' + fmtMag(bright.mag) + '등인 ' + bright.name + josa(bright.name, '은', '는') +
        ' ' + fmtMag(faint.mag) + '등인 ' + faint.name + '보다 약 몇 배 밝을까요?',
        shuffle([ansTxt].concat(wrongs)), ansTxt,
        '등급 차 ' + d.toFixed(1) + ' → 2.512^' + n + ' ≈ ' + RATIO[n - 1] + '배. ' +
        '(1등급 차 = 약 2.512배, 5등급 차 = 정확히 100배. 등급 차 ' + d.toFixed(1) +
        '은 ' + n + '등급 차이로 봅니다.) ' +
        bright.name + ' ' + fmtMag(bright.mag) + '등 · ' + faint.name + ' ' + fmtMag(faint.mag) + '등.');
    }
    return null;
  }

  // 7) 적위 → 한국 관측 가능성 (주극성 / 볼 수 없음)
  function coordPool(pool) {
    return pool.filter(function (o) {
      return o.dec != null && (o.group === 'dso' || o.group === 'star');
    });
  }
  function maxAlt(dec) { return 90 - Math.abs(LAT - dec); }
  function qDec(pool) {
    var cands = coordPool(pool);
    if (cands.length < 8) return null;
    var mode = Math.random() < 0.5 ? 'never' : 'circ';
    if (mode === 'never') {
      var far = shuffle(cands.filter(function (o) { return o.dec < -58; })).slice(0, 1);
      var near = shuffle(cands.filter(function (o) { return o.dec > -40; })).slice(0, 3);
      if (!far.length || near.length < 3) return null;
      var ans = far[0];
      if (near.some(function (o) { return namesClash(o.name, ans.name); })) return null;
      var list = [ans].concat(near);
      if (uniq(list.map(function (o) { return o.name; })).length !== 4) return null;
      return mk('dec', ans,
        '한국(북위 약 37°)에서는 한 번도 지평선 위로 올라오지 않는 천체는?',
        shuffle(list.map(function (o) { return o.name; })), ans.name,
        list.map(function (o) {
          return o.name + ' 적위 ' + fmtMag(o.dec) + '° · 최고 고도 약 ' + Math.round(maxAlt(o.dec)) + '°';
        }).join(' · ') +
        ' — 적위가 약 −53°보다 남쪽이면 한국에서는 최고 고도가 0° 아래라 볼 수 없습니다.');
    }
    var circ = shuffle(cands.filter(function (o) { return o.dec > 58; })).slice(0, 1);
    var mid = shuffle(cands.filter(function (o) { return o.dec > -35 && o.dec < 45; })).slice(0, 3);
    if (!circ.length || mid.length < 3) return null;
    var ans2 = circ[0];
    if (mid.some(function (o) { return namesClash(o.name, ans2.name); })) return null;
    var list2 = [ans2].concat(mid);
    if (uniq(list2.map(function (o) { return o.name; })).length !== 4) return null;
    return mk('dec', ans2,
      '한국에서 밤이면 언제든 볼 수 있는(지는 일이 없는) 주극성 천체는?',
      shuffle(list2.map(function (o) { return o.name; })), ans2.name,
      list2.map(function (o) {
        var minAlt = o.dec + LAT - 90;
        return o.name + ' 적위 ' + fmtMag(o.dec) + '° · 최저 고도 약 ' + Math.round(minAlt) + '°';
      }).join(' · ') +
      ' — 북위 37°에서는 적위가 약 +53°보다 크면 지평선 아래로 내려가지 않습니다.');
  }

  // 8) 관측 계절 — 대표 도감은 도감의 관측 시기, 전체 도감은 적경으로 계산
  function seasonOfMonth(m) {
    if (m >= 3 && m <= 5) return '봄';
    if (m >= 6 && m <= 8) return '여름';
    if (m >= 9 && m <= 11) return '가을';
    return '겨울';
  }
  function seasonOfMonths(months) {
    var cnt = { '봄': 0, '여름': 0, '가을': 0, '겨울': 0 };
    months.forEach(function (m) { if (m >= 1 && m <= 12) cnt[seasonOfMonth(m)]++; });
    var best = null, bestN = 0, second = 0;
    SEASONS.forEach(function (s) {
      if (cnt[s] > bestN) { second = bestN; bestN = cnt[s]; best = s; }
      else if (cnt[s] > second) second = cnt[s];
    });
    if (!best || bestN < 2 || bestN - second < 1) return null;
    return { season: best, count: bestN };
  }
  function seasonOfRa(raDeg) {
    var h = (((raDeg / 15) - 10) % 24 + 24) % 24;
    return SEASONS[Math.floor(h / 4)];
  }
  function qSeason(pool) {
    var cands = pool.filter(function (o) {
      if (o.months && o.months.length) return !!seasonOfMonths(o.months);
      if (o.src !== 'wide') return false;
      return o.ra != null && o.dec != null && o.dec > -30 && (o.group === 'dso' || o.group === 'star');
    });
    var o = pick(cands);
    if (!o) return null;
    var res, why;
    if (o.months && o.months.length) {
      res = seasonOfMonths(o.months);
      if (!res) return null;
      why = '도감의 관측 시기 ' + o.months.join('·') + '월 기준 — ' + res.season + '이 가장 좋습니다. ' +
        o.name + josa(o.name, '은', '는') + ' ' + o.months.join('·') + '월에 밤하늘에서 잘 보입니다.';
    } else {
      res = { season: seasonOfRa(o.ra) };
      why = '적경 ' + (o.ra / 15).toFixed(1) + 'h — 자정 무렵 남중하는 때가 ' + res.season + '입니다. ' +
        '(별이 태양 반대편에 오는 계절에 밤새 잘 보입니다.)';
    }
    var others = SEASONS.filter(function (s) { return s !== res.season; });
    return mk('season', o,
      '‘' + o.name + '’' + josa(o.name, '을', '를') + ' 가장 잘 볼 수 있는 계절은?',
      shuffle([res.season].concat(others)), res.season, why);
  }

  // 9) 카탈로그 번호 ↔ 이름 (M · NGC · IC)
  function qCat(pool, level) {
    var modes = level <= 1 ? ['name2m', 'm2ngc'] : ['name2m', 'ngc2name', 'm2ngc', 'ngc2m'];
    var mode = pick(modes);
    var withM = pool.filter(function (o) { return o.m; });
    var withBoth = pool.filter(function (o) { return o.m && o.ngc; });
    if (mode === 'name2m') {
      var a = pick(withM.filter(function (o) {
        // 이름에 메시에 번호가 들어 있으면('벌집성단 (M44)') 정답을 미리 알려 주는 셈입니다.
        return hasHangul(o.name) && o.name.indexOf(o.m) < 0;
      }));
      if (!a) return null;
      var wrongs = valueChoices(withM.map(function (o) { return o.m; }), a.m, 3);
      if (wrongs.length < 3) return null;
      return mk('cat', a,
        '‘' + a.name + '’의 메시에(Messier) 번호는?',
        shuffle([a.m].concat(wrongs)), a.m,
        a.name + josa(a.name, '은', '는') + ' 메시에 목록 ' + a.m.replace('M', '') + '번(' + a.m + ')' +
        (a.ngc ? ', ' + a.ngc : '') + '입니다.' + (a.con ? ' ' + a.con + '에 있습니다.' : ''));
    }
    if (mode === 'ngc2name') {
      var b = pick(pool.filter(function (o) { return o.ngc && hasHangul(o.name); }));
      if (!b) return null;
      var others = nameChoices(pool.filter(function (x) { return hasHangul(x.name); }), b, 3);
      if (others.length < 3) return null;
      return mk('cat', b,
        '‘' + b.ngc + '’에 해당하는 천체는?',
        shuffle([b.name].concat(others)), b.name,
        b.ngc + josa(b.ngc, '은', '는') + ' ' + b.name +
        (b.m && b.name.indexOf(b.m) < 0 ? ' (' + b.m + ')' : '') + '입니다.' +
        (b.con ? ' ' + b.con + '에 있습니다.' : ''));
    }
    if (mode === 'm2ngc') {
      var c = pick(withBoth);
      if (!c) return null;
      var wrongs2 = valueChoices(withBoth.map(function (o) { return o.ngc; }), c.ngc, 3);
      if (wrongs2.length < 3) return null;
      return mk('cat', c,
        '‘' + c.m + '’에 해당하는 NGC·IC 번호는?',
        shuffle([c.ngc].concat(wrongs2)), c.ngc,
        c.m + ' = ' + c.ngc + (hasHangul(c.name) ? ' (' + c.name + ')' : '') + '입니다.' +
        (c.con ? ' ' + c.con + '에 있습니다.' : ''));
    }
    var d = pick(withBoth.filter(function (o) { return hasHangul(o.name); }));
    if (!d) return null;
    var wrongs3 = valueChoices(withBoth.map(function (o) { return o.m; }), d.m, 3);
    if (wrongs3.length < 3) return null;
    return mk('cat', d,
      '‘' + d.ngc + '’에 해당하는 메시에 번호는?',
      shuffle([d.m].concat(wrongs3)), d.m,
      d.ngc + josa(d.ngc, '은', '는') + ' ' + d.name + ', 메시에 ' + d.m.replace('M', '') + '번(' + d.m + ')입니다.');
  }

  // 10) 소거형 — 별자리가 다른 하나
  function qOddCon(pool) {
    var byCon = {};
    pool.forEach(function (o) {
      if (!o.con) return;
      (byCon[o.con] = byCon[o.con] || []).push(o);
    });
    var keys = Object.keys(byCon).filter(function (k) { return byCon[k].length >= 3; });
    if (!keys.length) return null;
    var key = pick(keys);
    var three = shuffle(byCon[key]).slice(0, 3);
    if (uniq(three.map(function (o) { return o.name; })).length !== 3) return null;
    var oddCons = Object.keys(byCon).filter(function (k) { return k !== key; });
    var odd = null;
    for (var t = 0; t < 12 && !odd; t++) {
      var cand = pick(byCon[pick(oddCons)] || []);
      if (!cand) continue;
      if (three.some(function (o) { return namesClash(o.name, cand.name); })) continue;
      if (cand.con === key) continue;
      odd = cand;
    }
    if (!odd) return null;
    var names = three.map(function (o) { return o.name; }).concat(odd.name);
    if (uniq(names).length !== 4) return null;
      return mk('oddcon', odd,
      '다음 중 속한 별자리가 다른 하나는?',
      shuffle(names), odd.name,
      three.map(function (o) { return o.name; }).join(' · ') +
      josa(three[three.length - 1].name, '은', '는') + ' 모두 ' + key +
      ', ' + odd.name + josa(odd.name, '은', '는') + ' ' + odd.con + '입니다.');
  }

  // 11) 소거형 — 천체 종류가 다른 하나
  function qOddType(pool) {
    var byType = {};
    pool.forEach(function (o) {
      if (!o.type || TYPE_CHOICES.indexOf(o.type) < 0) return;
      (byType[o.type] = byType[o.type] || []).push(o);
    });
    var keys = Object.keys(byType).filter(function (k) {
      return byType[k].length >= 3 && !(TYPE_BLOCK[k] || []).length;
    });
    if (!keys.length) return null;
    var key = pick(keys);
    var three = shuffle(byType[key]).slice(0, 3);
    if (uniq(three.map(function (o) { return o.name; })).length !== 3) return null;
    var oddTypes = Object.keys(byType).filter(function (t) {
      if (t === key) return false;
      if ((TYPE_BLOCK[key] || []).indexOf(t) >= 0) return false;
      if ((TYPE_BLOCK[t] || []).indexOf(key) >= 0) return false;
      return byType[t].length > 0;
    });
    if (!oddTypes.length) return null;
    var odd = null;
    for (var i = 0; i < 12 && !odd; i++) {
      var cand = pick(byType[pick(oddTypes)]);
      if (!cand) continue;
      if (three.some(function (o) { return namesClash(o.name, cand.name); })) continue;
      odd = cand;
    }
    if (!odd) return null;
    var names = three.map(function (o) { return o.name; }).concat(odd.name);
    if (uniq(names).length !== 4) return null;
    return mk('oddtype', odd,
      '다음 중 천체 종류가 다른 하나는?',
      shuffle(names), odd.name,
      three.map(function (o) { return o.name; }).join(' · ') +
      josa(three[three.length - 1].name, '은', '는') + ' 모두 ' + key +
      ', ' + odd.name + josa(odd.name, '은', '는') + ' ' + odd.type + '입니다.');
  }

  // 12) 짝짓기 — 천체 ↔ 별자리
  function qPair(pool) {
    var names = conPool().map(function (c) { return c.name; });
    var cands = pool.filter(function (o) {
      return o.con && names.indexOf(o.con) >= 0 && hasHangul(o.name) && !conLeak(o);
    });
    if (cands.length < 8) {
      cands = pool.filter(function (o) { return o.con && names.indexOf(o.con) >= 0 && hasHangul(o.name); });
    }
    if (cands.length < 8) return null;
    var four = shuffle(cands).slice(0, 4);
    if (four.length < 4 || uniq(four.map(function (o) { return o.name; })).length !== 4) return null;
    var ans = four[0];
    var opts = [ans.name + ' — ' + ans.con];
    four.slice(1).forEach(function (o) {
      var wrongCon = pick(names.filter(function (c) { return c !== o.con; }));
      opts.push(o.name + ' — ' + wrongCon);
    });
    if (uniq(opts).length !== 4) return null;
    return mk('pair', ans,
      '천체와 별자리를 바르게 짝지은 것은?',
      shuffle(opts), ans.name + ' — ' + ans.con,
      '정답은 ' + ans.name + ' — ' + ans.con + '. ' +
      four.slice(1).map(function (o) { return o.name + josa(o.name, '은', '는') + ' ' + o.con; }).join(', ') + '입니다.');
  }

  // 13) 짝짓기 — 천체 ↔ 종류
  function qTypePair(pool) {
    var cands = pool.filter(function (o) {
      return o.type && TYPE_CHOICES.indexOf(o.type) >= 0 && hasHangul(o.name);
    });
    if (cands.length < 8) return null;
    var four = shuffle(cands).slice(0, 4);
    if (four.length < 4 || uniq(four.map(function (o) { return o.name; })).length !== 4) return null;
    var ans = four[0];
    var opts = [ans.name + ' — ' + ans.type];
    four.slice(1).forEach(function (o) {
      var block = (TYPE_BLOCK[o.type] || []).concat([o.type]);
      var cand = shuffle(TYPE_CHOICES.filter(function (t) { return block.indexOf(t) < 0; }));
      opts.push(o.name + ' — ' + (cand[0] || '은하'));
    });
    if (uniq(opts).length !== 4) return null;
    return mk('typepair', ans,
      '천체와 종류를 바르게 짝지은 것은?',
      shuffle(opts), ans.name + ' — ' + ans.type,
      '정답은 ' + ans.name + ' — ' + ans.type + '. ' +
      four.slice(1).map(function (o) { return o.name + josa(o.name, '은', '는') + ' ' + o.type; }).join(', ') + '입니다.');
  }

  /* ------------------------------------------- 별자리 88종 문제 (범위 ②③) */
  function conObj(c) { return { name: c.name, conAbbr: c.abbr, con: '', wide: null, id: null }; }

  function qConName() {
    var c = pick(conPool());
    if (!c) return null;
    if (Math.random() < 0.5) {
      var others = [];
      shuffle(conPool()).forEach(function (x) {
        if (others.length >= 3) return;
        if (x.abbr === c.abbr || !x.name || x.name === c.name) return;
        if (others.indexOf(x.name) >= 0) return;
        others.push(x.name);
      });
      if (others.length < 3) return null;
      return mk('conname', conObj(c),
        '‘' + c.abbr + '’' + josa(c.abbr, '은', '는') + ' 어떤 별자리의 IAU 약자일까요?',
        shuffle([c.name].concat(others)), c.name,
        c.abbr + ' = ' + c.name + ' (' + c.en + '). ' + (c.desc || ''),
        '별자리:' + c.abbr);
    }
    var wrongs = [];
    shuffle(conPool()).forEach(function (x) {
      if (wrongs.length >= 3) return;
      if (x.abbr === c.abbr || !x.abbr) return;
      if (wrongs.indexOf(x.abbr) >= 0) return;
      wrongs.push(x.abbr);
    });
    if (wrongs.length < 3) return null;
    return mk('conname', conObj(c),
      '‘' + c.name + '’의 IAU 약자는?',
      shuffle([c.abbr].concat(wrongs)), c.abbr,
      c.name + ' = ' + c.abbr + ' (' + c.en + '). ' + (c.desc || ''),
      '별자리:' + c.abbr);
  }

  function qConBright() {
    var cands = conPool().filter(function (c) { return c.bright; });
    var c = pick(cands);
    if (!c) return null;
    var wrongs = [];
    shuffle(cands).forEach(function (x) {
      if (wrongs.length >= 3) return;
      if (x.abbr === c.abbr || !x.bright) return;
      if (namesClash(x.bright, c.bright)) return;
      if (wrongs.indexOf(x.bright) >= 0) return;
      wrongs.push(x.bright);
    });
    if (wrongs.length < 3) return null;
    return mk('conbright', conObj(c),
      '‘' + c.name + '’에서 가장 밝은 별은?',
      shuffle([c.bright].concat(wrongs)), c.bright,
      c.name + '에서 가장 밝은 별은 ' + c.bright + ' (' + fmtMag(c.brightMag) + '등)입니다. ' + (c.desc || ''),
      '별자리:' + c.abbr);
  }

  function qConSeason() {
    var c = pick(conPool().filter(function (x) { return x.season && SEASONS.indexOf(x.season) >= 0; }));
    if (!c) return null;
    return mk('conseason', conObj(c),
      '‘' + c.name + '’' + josa(c.name, '을', '를') + ' 가장 잘 볼 수 있는 계절은?',
      shuffle([c.season].concat(SEASONS.filter(function (s) { return s !== c.season; }))), c.season,
      c.name + josa(c.name, '은', '는') + ' ' + c.bestMonth + '월 무렵 밤에 남중하는 ' + c.season + ' 별자리입니다. ' + (c.desc || ''),
      '별자리:' + c.abbr);
  }

  function qConArea() {
    var four = shuffle(conPool().filter(function (c) { return c.areaRank > 0; })).slice(0, 4);
    if (four.length < 4) return null;
    var sorted = four.slice().sort(function (a, b) { return a.areaRank - b.areaRank; });
    var ans = sorted[0];
    if (sorted[1].areaRank === ans.areaRank) return null;
    return mk('conarea', conObj(ans),
      '다음 중 하늘에서 차지하는 면적이 가장 넓은 별자리는?',
      shuffle(four.map(function (c) { return c.name; })), ans.name,
      sorted.map(function (c) {
        return c.name + ' ' + c.area.toLocaleString('en-US') + 'deg²(88개 중 ' + c.areaRank + '위)';
      }).join(' · ') + ' — 88개 별자리 가운데 면적 순위로 비교했습니다.',
      '별자리:' + ans.abbr);
  }

  /* ------------------------------------------------------------- 문제 조립 */

  var PLANS = {
    // 범위 ①대표 도감
    '1:1': ['brief', 'type', 'con', 'mag', 'brief', 'type', 'con', 'mag'],
    '1:2': ['brief', 'type', 'con', 'mcat', 'oddcon', 'season', 'mag', 'type'],
    '1:3': ['cat', 'ratio', 'oddtype', 'dim', 'dec', 'season', 'pair', 'type'],
    // 범위 ②도감 + 88별자리
    '2:1': ['brief', 'type', 'con', 'conname', 'brief', 'type', 'con', 'mag'],
    '2:2': ['brief', 'conname', 'con', 'mcat', 'oddcon', 'season', 'conbright', 'type'],
    '2:3': ['cat', 'ratio', 'oddtype', 'dim', 'dec', 'conarea', 'pair', 'season'],
    // 범위 ③전체 도감
    '3:1': ['brief', 'type', 'con', 'conname', 'brief', 'type', 'con', 'mag'],
    '3:2': ['brief', 'conname', 'con', 'mcat', 'oddtype', 'season', 'conbright', 'type'],
    '3:3': ['cat', 'ratio', 'oddcon', 'dim', 'dec', 'conarea', 'pair', 'season']
  };
  var FALLBACK = {
    brief: 'type', type: 'con', con: 'type', mag: 'type', mcat: 'mag',
    cat: 'mcat', oddcon: 'oddtype', oddtype: 'oddcon', dim: 'mag',
    ratio: 'mag', dec: 'con', season: 'con', pair: 'oddcon', typepair: 'oddtype',
    conname: 'conseason', conbright: 'conseason', conseason: 'con', conarea: 'conbright'
  };

  var GENS = {
    type: qType, con: qCon, brief: qBrief, mag: qMag, dim: qDim, ratio: qRatio,
    dec: qDec, season: qSeason, cat: qCat, mcat: function (pool, level) { return qCat(pool, 1); },
    oddcon: qOddCon, oddtype: qOddType, pair: qPair, typepair: qTypePair,
    conname: qConName, conbright: qConBright, conseason: qConSeason, conarea: qConArea
  };

  function buildOne(kind, scope, level) {
    var gen = GENS[kind];
    if (!gen) return null;
    var narrow = poolFor(scope, level);
    var q = gen(narrow, level, scope);
    if (!q && narrow !== objPool(scope)) q = gen(objPool(scope), level, scope);
    return q;
  }

  function buildQuestions(scope, level) {
    scope = scope || 1; level = level || 1;
    var plan = (PLANS[scope + ':' + level] || PLANS['1:' + level] || []).slice();
    var out = [], used = {}, tries = {}, guard = 0;
    while (out.length < TOTAL && guard < 8000) {
      guard++;
      var kind = plan[out.length] || 'type';
      var q = buildOne(kind, scope, level);
      if (!q || !valid(q) || used[q.key]) {
        tries[kind] = (tries[kind] || 0) + 1;
        if (tries[kind] > 8) plan[out.length] = FALLBACK[kind] || 'type';
        continue;
      }
      used[q.key] = 1;
      out.push(q);
    }
    // 마지막 안전장치 — 어떤 이유로든 8문제가 안 차면 기본 유형으로 채웁니다.
    var g2 = 0;
    while (out.length < TOTAL && g2 < 4000) {
      g2++;
      var k2 = pick(['type', 'con', 'brief', 'mag']);
      var q2 = buildOne(k2, scope, level);
      if (q2 && valid(q2) && !used[q2.key]) { used[q2.key] = 1; out.push(q2); }
    }
    return out;
  }

  /* ------------------------------------------------------------- 상태 */
  var st = { scope: 1, level: 1, qs: [], i: 0, score: 0, answered: false, wrong: [] };

  function bestKey(scope, level) { return (scope || st.scope) + ':' + (level || st.level); }
  function best(scope, level) {
    var b = store.get('quiz.best', {}) || {};
    return Number(b[bestKey(scope, level)] || 0);
  }
  function saveBest(scope, level, score) {
    var b = store.get('quiz.best', {}) || {};
    var k = bestKey(scope, level);
    if (!b[k] || score > b[k]) { b[k] = score; store.set('quiz.best', b); return true; }
    return false;
  }
  function scopeMeta(v) { return SCOPES[(v || st.scope) - 1] || SCOPES[0]; }
  function levelMeta(v) { return LEVELS[(v || st.level) - 1] || LEVELS[0]; }

  /* ------------------------------------------------------------- 화면 */

  function scopeBtn(s) {
    var on = st.scope === s.v;
    return '<button type="button" class="quiz-level' + (on ? ' is-active' : '') + '" data-scope="' + s.v +
      '" aria-pressed="' + on + '"><b>' + esc(s.name) + '</b><small>' + esc(s.sub) + '</small></button>';
  }
  function levelBtn(l) {
    var on = st.level === l.v;
    return '<button type="button" class="quiz-level' + (on ? ' is-active' : '') + '" data-level="' + l.v +
      '" aria-pressed="' + on + '"><b>' + esc(l.name) + '</b><small>' + esc(l.sub) + '</small></button>';
  }

  function bestLine() {
    var b = best();
    var head = '‘' + scopeMeta().name + ' · ' + levelMeta().name + '’ 최고 기록';
    if (!b) return head + ' · 아직 없음 — ' + TOTAL + '문제 중 몇 개를 맞히는지 확인해 보세요.';
    return head + ' · ' + TOTAL + '문제 중 <b>' + b + '개</b>';
  }

  function howList() {
    var items;
    if (st.level === 1) {
      items = [
        ['별자리', '이 천체는 어느 별자리에서 찾을까요?'],
        ['종류', '성운 · 은하 · 성단 · 항성 구분하기'],
        ['설명', '한 줄 소개만 보고 이름 맞히기'],
        ['밝기', '겉보기 등급이 작을수록 밝다는 것']
      ];
    } else if (st.level === 2) {
      items = [
        ['별자리 · 종류 · 설명', '기본 유형'],
        ['카탈로그 번호', 'M42 ↔ NGC 1976처럼 메시에·NGC 번호 연결'],
        ['소거형', '“속한 별자리가 다른 하나는?”'],
        ['관측 계절', '가장 잘 보이는 계절 고르기'],
        ['밝기', '가장 밝은 천체 고르기']
      ];
    } else {
      items = [
        ['카탈로그 번호', 'M · NGC · IC 번호와 이름을 서로 바꾸기'],
        ['소거형', '별자리나 천체 종류가 다른 하나 찾기'],
        ['맨눈 한계', '6등급 한계로 볼 수 없는 천체 가려내기'],
        ['밝기 배수', '등급 차이 → 약 2.512^Δm배 추론'],
        ['한국 관측 가능성', '적위로 주극성·볼 수 없는 천체 판별'],
        ['계절 · 짝짓기', '남중 계절과 천체–별자리 짝 맞히기']
      ];
    }
    return '<p class="quiz-how-title">이 난이도에서 나오는 유형 · ' + esc(levelMeta().name) + '</p>' +
      '<ul class="quiz-how">' + items.map(function (it) {
        return '<li><b>' + esc(it[0]) + '</b> — ' + esc(it[1]) + '</li>';
      }).join('') + '</ul>';
  }

  function renderIntro() {
    var shell = $('#quizShell');
    if (!shell) return;
    shell.innerHTML =
      '<div class="quiz-intro">' +
        '<div class="quiz-hero">' +
          '<p class="quiz-eyebrow">🎯 오늘 밤 하늘 탐험</p>' +
          '<h3>도감에서 배운 것을 <span class="grad">8문제</span>로 확인해 보세요</h3>' +
          '<p class="quiz-lead">문제 범위와 난이도를 따로 고릅니다. 문제는 지금 도감에 들어 있는 실제 ' +
            '천체에서 만들어지고, 틀려도 결과 화면에서 그 천체를 바로 찾아가 볼 수 있습니다.</p>' +
          '<div class="quiz-setup">' +
            '<p class="quiz-step-label"><b>①</b> 문제 범위</p>' +
            '<div class="quiz-scopes" role="group" aria-label="문제 범위">' +
              SCOPES.map(scopeBtn).join('') +
            '</div>' +
            '<p class="quiz-step-label"><b>②</b> 문제 난이도</p>' +
            '<div class="quiz-diffs" role="group" aria-label="문제 난이도">' +
              LEVELS.map(levelBtn).join('') +
            '</div>' +
          '</div>' +
          '<button type="button" class="btn-primary quiz-start" id="quizStart">퀴즈 시작</button>' +
          '<p class="quiz-best" id="quizBest">' + bestLine() + '</p>' +
        '</div>' +
        '<div class="quiz-how-wrap">' + howList() + '</div>' +
      '</div>';
    shell.querySelectorAll('.quiz-level').forEach(function (b) {
      b.addEventListener('click', function () {
        var sc = Number(b.getAttribute('data-scope'));
        var lv = Number(b.getAttribute('data-level'));
        if (sc) st.scope = sc;
        if (lv) st.level = lv;
        renderIntro();
      });
    });
    var startBtn = $('#quizStart');
    if (startBtn) startBtn.addEventListener('click', start);
  }

  function start() {
    st.qs = buildQuestions(st.scope, st.level);
    st.i = 0; st.score = 0; st.answered = false; st.wrong = [];
    if (!st.qs.length) { renderIntro(); return; }
    renderQuestion();
  }

  function renderQuestion() {
    var shell = $('#quizShell');
    var q = st.qs[st.i];
    if (!q) { renderDone(); return; }
    st.answered = false;
    var pct = Math.round(((st.i + 1) / st.qs.length) * 100);
    shell.innerHTML =
      '<div class="quiz-play">' +
        '<div class="quiz-bar">' +
          '<div class="quiz-prog" role="progressbar" aria-valuemin="0" aria-valuemax="' + st.qs.length +
            '" aria-valuenow="' + (st.i + 1) + '" aria-label="문제 진행">' +
            '<span style="width:' + pct + '%"></span>' +
          '</div>' +
          '<div class="quiz-bar-row"><span class="quiz-step">문제 <b>' + (st.i + 1) + '</b> / ' + st.qs.length + '</span>' +
            '<span class="quiz-ctx">' + esc(scopeMeta().name) + ' · ' + esc(levelMeta().name) + '</span>' +
            '<span class="quiz-score">맞힌 문제 <b>' + st.score + '</b></span></div>' +
        '</div>' +
        '<p class="quiz-kind">' + kindLabel(q.kind) + '</p>' +
        '<h3 class="quiz-q" id="quizQ">' + esc(q.q) + '</h3>' +
        '<div class="quiz-opts" role="group" aria-labelledby="quizQ">' +
          q.choices.map(function (c, idx) {
            return '<button type="button" class="quiz-opt" data-choice="' + esc(c) + '">' +
              '<span class="quiz-opt-num">' + (idx + 1) + '</span><span>' + esc(c) + '</span></button>';
          }).join('') +
        '</div>' +
        '<div class="quiz-feedback" id="quizFeedback" aria-live="polite" hidden></div>' +
      '</div>';
    shell.querySelectorAll('.quiz-opt').forEach(function (b) {
      b.addEventListener('click', function () { answer(b.getAttribute('data-choice')); });
    });
    var bar = shell.querySelector('.quiz-bar');
    if (bar && bar.scrollIntoView) {
      try { bar.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { bar.scrollIntoView(); }
    }
    var h = shell.querySelector('.quiz-q');
    if (h && h.focus) h.focus();
  }

  function kindLabel(k) {
    var map = {
      type: '천체 종류', con: '별자리 찾기', brief: '설명 보고 맞히기', mag: '밝기 비교',
      dim: '맨눈 관측 한계', ratio: '밝기 배수', dec: '한국 관측 가능성', season: '관측 계절',
      cat: '카탈로그 번호', oddcon: '소거형 · 별자리', oddtype: '소거형 · 종류',
      pair: '짝짓기 · 별자리', typepair: '짝짓기 · 종류',
      conname: '별자리 이름·약자', conbright: '별자리의 밝은 별',
      conseason: '별자리 계절', conarea: '별자리 면적'
    };
    return map[k] || '오늘의 문제';
  }

  function answer(choice) {
    if (st.answered) return;
    st.answered = true;
    var q = st.qs[st.i];
    var ok = choice === q.answer;
    if (ok) st.score++; else st.wrong.push({ q: q, picked: choice });
    $('#quizShell').querySelectorAll('.quiz-opt').forEach(function (b) {
      var v = b.getAttribute('data-choice');
      b.disabled = true;
      if (v === q.answer) b.classList.add('is-correct');
      else if (v === choice) b.classList.add('is-wrong');
    });
    var fb = $('#quizFeedback');
    fb.hidden = false;
    fb.className = 'quiz-feedback ' + (ok ? 'is-ok' : 'is-no');
    var last = st.i === st.qs.length - 1;
    var links = linksFor(q.obj);
    fb.innerHTML =
      '<p class="qf-head">' + (ok ? '✅ 맞았습니다' : '❌ 아쉽습니다 — 정답은 <b>' + esc(q.answer) + '</b>') + '</p>' +
      '<p class="qf-why">' + esc(q.why) + '</p>' +
      '<div class="qf-row">' +
        links +
        '<button type="button" class="btn-primary qf-next" id="qfNext">' + (last ? '결과 보기' : '다음 문제') + '</button>' +
      '</div>';
    bindLinks(fb);
    $('#qfNext').addEventListener('click', function () {
      st.i++;
      if (st.i >= st.qs.length) renderDone(); else renderQuestion();
    });
    var nb = $('#qfNext');
    if (nb && nb.focus) nb.focus();
  }

  // 문제의 대상 천체(또는 별자리)로 이어지는 버튼
  function linksFor(o) {
    if (!o) return '';
    if (o.conAbbr) {
      return '<button type="button" class="mini-btn" data-con-open="' + esc(o.conAbbr) + '">별자리</button>' +
        '<button type="button" class="mini-btn" data-con-aim="' + esc(o.conAbbr) + '">🎯 조준</button>';
    }
    if (o.id) {
      return '<button type="button" class="mini-btn" data-open="' + esc(o.id) + '">도감</button>' +
        '<button type="button" class="mini-btn" data-aim="' + esc(o.id) + '">🎯 조준</button>';
    }
    if (!o.wide) return '';
    var out = '<button type="button" class="mini-btn" data-open-wide="' + esc(o.wide) + '">도감</button>';
    if (o.ra != null && o.dec != null) {
      out += '<button type="button" class="mini-btn" data-aim-radec="' + o.ra + ',' + o.dec +
        '" data-name="' + esc(o.name) + '">🎯 조준</button>';
    }
    return out;
  }

  function bindLinks(root) {
    if (!root) return;
    root.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.OneulBam && window.OneulBam.openObject) window.OneulBam.openObject(b.getAttribute('data-open'));
      });
    });
    root.querySelectorAll('[data-aim]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.OneulBam && window.OneulBam.aimObject) window.OneulBam.aimObject(b.getAttribute('data-aim'));
      });
    });
    root.querySelectorAll('[data-open-wide]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.SpaceUI && window.SpaceUI.openCatalogObject) {
          window.SpaceUI.openCatalogObject(b.getAttribute('data-open-wide'));
        }
      });
    });
    root.querySelectorAll('[data-aim-radec]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = String(b.getAttribute('data-aim-radec')).split(',');
        if (window.OneulBam && window.OneulBam.aimRaDec) {
          window.OneulBam.aimRaDec(Number(p[0]), Number(p[1]), b.getAttribute('data-name') || '천체');
        }
      });
    });
    root.querySelectorAll('[data-con-open]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.OneulBam && window.OneulBam.openConstellation) {
          window.OneulBam.openConstellation(b.getAttribute('data-con-open'));
        }
      });
    });
    root.querySelectorAll('[data-con-aim]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.OneulBam && window.OneulBam.aimAt) window.OneulBam.aimAt('con', b.getAttribute('data-con-aim'));
      });
    });
  }

  function renderDone() {
    var shell = $('#quizShell');
    var s = st.score, n = st.qs.length;
    var newRecord = saveBest(st.scope, st.level, s);
    var msg, star;
    if (s === n) { msg = '전부 맞혔습니다. 하늘 지도 없이도 오늘 밤 별을 찾아갈 수 있겠어요.'; star = '🏆'; }
    else if (s >= n - 2) { msg = '아주 좋습니다. 틀린 문제만 다시 보면 완성입니다.'; star = '🌟'; }
    else if (s >= Math.ceil(n / 2)) { msg = '기본은 잡혔습니다. 틀린 천체를 도감에서 한 번씩 열어 보세요.'; star = '✨'; }
    else { msg = '처음이면 충분합니다. 쉬움부터 다시 하면 금방 늘어요.'; star = '🌱'; }

    var wrongHtml = '';
    if (st.wrong.length) {
      wrongHtml = '<div class="quiz-wrong"><h4>다시 볼 천체</h4><ul>' +
        st.wrong.map(function (w) {
          var o = w.q.obj;
          return '<li><div class="qw-txt"><b>' + esc(o ? o.name : w.q.answer) + '</b>' +
            '<small>정답 · ' + esc(w.q.answer) + (o && o.con && o.con !== w.q.answer ? ' · ' + esc(o.con) : '') + '</small></div>' +
            '<div class="qw-btns">' + linksFor(o) + '</div></li>';
        }).join('') + '</ul></div>';
    }
    shell.innerHTML =
      '<div class="quiz-done">' +
        '<div class="quiz-result">' +
          '<span class="quiz-star" aria-hidden="true">' + star + '</span>' +
          '<p class="quiz-scorebig"><b>' + s + '</b> / ' + n + '</p>' +
          '<p class="quiz-ctx-line">' + esc(scopeMeta().name) + ' · ' + esc(levelMeta().name) + '</p>' +
          '<p class="quiz-msg">' + msg + '</p>' +
          (newRecord ? '<p class="quiz-new">새 최고 기록입니다!</p>'
            : '<p class="quiz-best">이 설정의 최고 기록 · ' + best() + ' / ' + n + '</p>') +
          '<div class="quiz-actions">' +
            '<button type="button" class="btn-primary" id="quizRetry">같은 설정 다시</button>' +
            '<button type="button" class="btn-ghost" id="quizOther">범위·난이도 바꾸기</button>' +
          '</div>' +
        '</div>' +
        wrongHtml +
      '</div>';
    $('#quizRetry').addEventListener('click', start);
    $('#quizOther').addEventListener('click', function () { renderIntro(); });
    bindLinks(shell);
  }

  /* ------------------------------------------------------------- 시작 */

  function init() {
    var shell = $('#quizShell');
    if (!shell) return;
    renderIntro();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // 검증용(헤드리스 테스트에서 문제 생성을 확인)
  window.ByeolQuiz = {
    build: buildQuestions,
    start: start,
    state: st,
    total: function () { return TOTAL; },
    scopes: SCOPES,
    levels: LEVELS,
    bestKey: bestKey,
    kinds: function () { return Object.keys(GENS); }
  };
})();
