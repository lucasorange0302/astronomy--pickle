/* =========================================================================
   별너울 — 도감 퀴즈 · 하늘 탐험 (quiz.js)
   · 도감(SKY_DATA.catalog · SPACE_CATALOG)의 실제 값을 문제로 바꿔 냅니다.
     문제·정답·해설이 모두 데이터에서 나오므로 따로 외운 정답표가 없습니다.
   · 난이도 3단계(초급·중급·도전), 8문제, 최고 기록은 이 브라우저에 저장합니다.
   · 틀린 천체는 결과 화면에서 바로 도감 카드·라이브 하늘 조준으로 이어집니다.
   ========================================================================= */
(function () {
  'use strict';

  var TYPE_KO = {
    'OCl': '산개성단', 'GCl': '구상성단', 'G': '은하', 'Neb': '성운',
    'PN': '행성상성운', 'SNR': '초신성잔해', 'HII': '전리수소영역',
    'RfN': '반사성운', 'Cl+N': '성단+성운', '*Ass': '별무리'
  };
  var TYPE_LIST = ['성운', '은하', '항성', '산개성단', '구상성단', '행성상성운', '초신성잔해'];
  var TOTAL = 8;

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
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  // 받침 유무에 따라 조사를 골라 '은(는)' 같은 괄호 표기를 없앱니다.
  function josa(word, withBatchim, without) {
    var s = String(word || '');
    var c = s.charCodeAt(s.length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) return ((c - 0xAC00) % 28) ? withBatchim : without;
    return withBatchim;
  }

  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('bw.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem('bw.' + k, JSON.stringify(v)); } catch (e) {}
    }
  };

  /* ------------------------------------------------------------ 문제 재료 */

  function fromCatalog(list) {
    return list.map(function (o) {
      return {
        name: o.name, sub: o.sub || '', type: o.type, con: o.con || '',
        brief: o.brief || '', mag: (typeof o.mag === 'number' ? o.mag : null),
        id: o.id, src: 'catalog'
      };
    });
  }

  // 하늘 전체 도감(2,571종) 가운데 한국어 이름과 한 줄 설명이 있는 천체만 씁니다.
  function fromWide() {
    var items = (window.SPACE_CATALOG && window.SPACE_CATALOG.items) || [];
    var conKo = {};
    (D().constellations || []).forEach(function (c) { conKo[c.abbr] = c.name; });
    // 같은 천체가 대표 도감(카드·사진·설명)에도 있으면 그 카드로, 없으면 전체 도감 카드로 연결합니다.
    var rep = {};
    (D().catalog || []).forEach(function (o) {
      if (!o || !o.id) return;
      rep[String(o.id).toUpperCase()] = o.id;
      var mm = String(o.sub || '').match(/M\s*\d+/);
      if (mm) rep[mm[0].replace(/\s+/g, '').toUpperCase()] = o.id;
    });
    return items.filter(function (it) {
      if (!(it.k === 'd' && it.t && TYPE_KO[it.t] && it.x && it.ko)) return false;
      if (/^(NGC|IC)/.test(it.ko) || it.ko.length < 2) return false;
      // 카탈로그 안내문(좌표·출처 안내)은 문제로 쓰지 않습니다.
      if (/카탈로그|좌표|출처|데이터|목록의 천체|자동 생성/.test(it.x)) return false;
      return it.x.trim().length >= 15;
    }).map(function (it) {
      var repId = rep[String(it.i).toUpperCase()] ||
        (it.M ? rep[String(it.M).replace(/\s+/g, '').toUpperCase()] : null) || null;
      return {
        name: it.ko + (it.M && it.ko.indexOf(it.M) < 0 ? ' (' + it.M + ')' : ''),
        type: TYPE_KO[it.t], con: conKo[it.c] || '',
        brief: it.x, mag: (typeof it.m === 'number' ? it.m : null),
        id: repId, wide: repId ? null : it.i,
        ra: (typeof it.ra === 'number' ? it.ra : null),
        dec: (typeof it.dec === 'number' ? it.dec : null),
        src: repId ? 'catalog' : 'wide'
      };
    });
  }

  function basePool(level) {
    var cat = (D().catalog || []).filter(function (o) {
      return (o.group === 'dso' || o.group === 'star') && o.type && o.brief;
    });
    if (level === 1) {
      cat = cat.filter(function (o) { return o.diff <= 2 && o.equip <= 2; });
    }
    var out = fromCatalog(cat);
    if (level === 3) out = out.concat(fromWide());
    return out.filter(function (o) { return o.name && o.type; });
  }

  /* ------------------------------------------------------------ 문제 만들기 */

  function qType(o) {
    var others = shuffle(TYPE_LIST.filter(function (t) { return t !== o.type; })).slice(0, 3);
    if (others.length < 3) return null;
    return {
      kind: 'type', obj: o,
      q: '‘' + o.name + '’' + josa(o.name, '은', '는') + ' 어떤 종류의 천체일까요?',
      choices: shuffle([o.type].concat(others)),
      answer: o.type,
      why: o.name + '은(는) ' + (o.con ? o.con + '에 있는 ' : '') + o.type + '입니다. ' + o.brief
    };
  }

  function qCon(o, cons) {
    if (!o.con || cons.indexOf(o.con) < 0) return null;
    var others = shuffle(cons.filter(function (c) { return c !== o.con; })).slice(0, 3);
    if (others.length < 3) return null;
    return {
      kind: 'con', obj: o,
      q: '‘' + o.name + '’' + josa(o.name, '을', '를') + ' 찾아갈 수 있는 별자리는?',
      choices: shuffle([o.con].concat(others)),
      answer: o.con,
      why: o.name + '은(는) ' + o.con + '에 있습니다. ' + o.brief
    };
  }

  function qBrief(o) {
    var b = String(o.brief || '').replace(/\s+/g, ' ').trim();
    if (!b || b.length < 12 || b.length > 110) return null;
    if (b.indexOf(o.name) >= 0) return null;
    return {
      kind: 'brief', obj: o,
      q: '“' + b + '” — 이 설명에 해당하는 천체는?',
      choices: null, answer: o.name,
      why: '정답은 ' + o.name + '입니다. ' + b
    };
  }

  function qMag(objs) {
    // 밝기 문제는 손으로 검수한 대표 도감(48종)에서만 냅니다.
    // (하늘 전체 도감에는 원본 카탈로그의 근사·대체 등급이 섞여 있습니다.)
    var withMag = objs.filter(function (o) {
      return o.src === 'catalog' && typeof o.mag === 'number' && isFinite(o.mag);
    });
    if (withMag.length < 4) return null;
    var four = shuffle(withMag).slice(0, 4);
    var min = Math.min.apply(null, four.map(function (o) { return o.mag; }));
    var tops = four.filter(function (o) { return o.mag === min; });
    if (tops.length !== 1) return null;
    var ans = tops[0];
    return {
      kind: 'mag', obj: ans,
      q: '다음 중 겉보기 등급이 가장 밝은(숫자가 가장 작은) 천체는?',
      choices: shuffle(four.map(function (o) { return o.name; })),
      answer: ans.name,
      why: four.map(function (o) {
        return o.name + ' ' + (o.mag > 0 ? '+' : '') + o.mag.toFixed(1) + '등';
      }).join(' · ') + ' — 등급 숫자가 작을수록 밝습니다.'
    };
  }

  function buildQuestions(level) {
    var pool = basePool(level);
    var cons = (D().constellations || []).map(function (c) { return c.name; }).filter(Boolean);
    var plan = level === 1
      ? ['brief', 'type', 'con', 'brief', 'type', 'con', 'mag', 'brief']
      : ['brief', 'type', 'con', 'mag', 'brief', 'type', 'con', 'mag'];
    var used = {};
    var out = [];
    var guard = 0;
    while (out.length < TOTAL && guard < 6000) {
      guard++;
      var kind = plan[out.length];
      var o = pick(pool);
      if (!o || used[o.name]) continue;
      var q = null;
      if (kind === 'type') q = qType(o);
      else if (kind === 'con') q = qCon(o, cons);
      else if (kind === 'brief') q = qBrief(o);
      else if (kind === 'mag') q = qMag(pool);
      // 설명 문제의 보기는 같은 도감의 다른 천체 이름에서 가져옵니다.
      if (q && q.kind === 'brief' && !q.choices) {
        var others = shuffle(pool.filter(function (x) {
          if (x.name === o.name) return false;
          // '헤르쿨레스 구상성단'과 '헤르쿨레스 구상성단 (M13)'처럼 한쪽이 다른 쪽을 품으면 보기에서 뺍니다.
          if (x.name.indexOf(o.name) >= 0 || o.name.indexOf(x.name) >= 0) return false;
          return true;
        })).slice(0, 3).map(function (x) { return x.name; });
        if (others.length < 3) continue;
        q.choices = shuffle([o.name].concat(others));
      }
      if (!q || !q.choices || q.choices.length !== 4) continue;
      if (uniq(q.choices).length !== 4) continue;
      if (q.kind !== 'mag' && used[q.answer]) continue;
      used[o.name] = 1;
      q.choices.forEach(function (n) { used[n] = 1; });
      out.push(q);
    }
    return out;
  }

  function uniq(a) {
    var seen = {};
    return a.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
  }

  /* ------------------------------------------------------------ 상태 */

  var st = { level: 1, qs: [], i: 0, score: 0, answered: false, wrong: [] };

  function best(level) {
    var b = store.get('quiz.best', {}) || {};
    return Number(b[level] || 0);
  }
  function saveBest(level, score) {
    var b = store.get('quiz.best', {}) || {};
    if (!b[level] || score > b[level]) { b[level] = score; store.set('quiz.best', b); return true; }
    return false;
  }

  /* ------------------------------------------------------------ 화면 */

  function levelBtn(v, name, sub) {
    var on = st.level === v;
    return '<button type="button" class="quiz-level' + (on ? ' is-active' : '') + '" data-level="' + v + '" aria-pressed="' + on + '">' +
      '<b>' + name + '</b><small>' + sub + '</small></button>';
  }
  function bestLine() {
    var b = best(st.level);
    if (!b) return '아직 기록이 없습니다 — ' + TOTAL + '문제 중 몇 개를 맞히는지 확인해 보세요.';
    return '이 난이도 내 최고 기록 · ' + TOTAL + '문제 중 <b>' + b + '개</b>';
  }

  function renderIntro() {
    var shell = $('#quizShell');
    if (!shell) return;
    shell.innerHTML =
      '<div class="quiz-intro">' +
        '<div class="quiz-hero">' +
          '<p class="quiz-eyebrow">🎯 오늘 밤 하늘 탐험</p>' +
          '<h3>도감에서 배운 것을 <span class="grad">8문제</span>로 확인해 보세요</h3>' +
          '<p class="quiz-lead">문제는 지금 도감에 들어 있는 실제 천체에서 만들어집니다. ' +
            '틀려도 괜찮습니다. 해설을 읽고, 결과 화면에서 그 천체를 바로 찾아가 볼 수 있습니다.</p>' +
          '<div class="quiz-levels" role="group" aria-label="난이도 선택">' +
            levelBtn(1, '초급', '맨눈·쌍안경 천체') +
            levelBtn(2, '중급', '도감 전체 + 별자리') +
            levelBtn(3, '도전', '2,571종 하늘 전체 도감') +
          '</div>' +
          '<button type="button" class="btn-primary quiz-start" id="quizStart">퀴즈 시작</button>' +
          '<p class="quiz-best" id="quizBest">' + bestLine() + '</p>' +
        '</div>' +
        '<ul class="quiz-how">' +
          '<li><b>별자리</b> — 이 천체는 어느 별자리에서 찾을까요?</li>' +
          '<li><b>종류</b> — 성운 · 은하 · 성단 · 항성 구분하기</li>' +
          '<li><b>설명</b> — 한 줄 소개만 보고 이름 맞히기</li>' +
          '<li><b>밝기</b> — 겉보기 등급이 작을수록 밝다는 것</li>' +
        '</ul>' +
      '</div>';
    shell.querySelectorAll('.quiz-level').forEach(function (b) {
      b.addEventListener('click', function () {
        st.level = Number(b.getAttribute('data-level')) || 1;
        renderIntro();
      });
    });
    $('#quizStart').addEventListener('click', start);
  }

  function start() {
    st.qs = buildQuestions(st.level);
    st.i = 0; st.score = 0; st.answered = false; st.wrong = [];
    if (!st.qs.length) { renderIntro(); return; }
    renderQuestion();
  }

  function renderQuestion() {
    var shell = $('#quizShell');
    var q = st.qs[st.i];
    st.answered = false;
    var pct = Math.round(((st.i + 1) / st.qs.length) * 100);
    shell.innerHTML =
      '<div class="quiz-play">' +
        '<div class="quiz-bar">' +
          '<div class="quiz-prog" role="progressbar" aria-valuemin="0" aria-valuemax="' + st.qs.length + '" aria-valuenow="' + (st.i + 1) + '" aria-label="문제 진행">' +
            '<span style="width:' + pct + '%"></span>' +
          '</div>' +
          '<div class="quiz-bar-row"><span class="quiz-step">문제 <b>' + (st.i + 1) + '</b> / ' + st.qs.length + '</span>' +
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
    if (k === 'type') return '천체 종류';
    if (k === 'con') return '별자리 찾기';
    if (k === 'brief') return '설명 보고 맞히기';
    return '밝기 비교';
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
    fb.innerHTML =
      '<p class="qf-head">' + (ok ? '✅ 맞았습니다' : '❌ 아쉽습니다 — 정답은 <b>' + esc(q.answer) + '</b>') + '</p>' +
      '<p class="qf-why">' + esc(q.why) + '</p>' +
      '<div class="qf-row">' +
        (q.obj && q.obj.id ? '<button type="button" class="mini-btn" id="qfOpen">도감에서 보기</button>' : '') +
        '<button type="button" class="btn-primary qf-next" id="qfNext">' + (last ? '결과 보기' : '다음 문제') + '</button>' +
      '</div>';
    if (q.obj && q.obj.id) {
      $('#qfOpen').addEventListener('click', function () {
        if (window.OneulBam && window.OneulBam.openObject) window.OneulBam.openObject(q.obj.id);
      });
    }
    $('#qfNext').addEventListener('click', function () {
      st.i++;
      if (st.i >= st.qs.length) renderDone(); else renderQuestion();
    });
    var nb = $('#qfNext');
    if (nb && nb.focus) nb.focus();
  }

  // 결과 화면의 '도감·조준' — 대표 도감은 카드 id, 전체 도감 항목은 전체 도감 id와 좌표로 잇습니다.
  function linksFor(o) {
    if (!o) return '';
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

  function renderDone() {
    var shell = $('#quizShell');
    var s = st.score, n = st.qs.length;
    var newRecord = saveBest(st.level, s);
    var msg, star;
    if (s === n) { msg = '전부 맞혔습니다. 하늘 지도 없이도 오늘 밤 별을 찾아갈 수 있겠어요.'; star = '🏆'; }
    else if (s >= n - 2) { msg = '아주 좋습니다. 틀린 문제만 다시 보면 완성입니다.'; star = '🌟'; }
    else if (s >= Math.ceil(n / 2)) { msg = '기본은 잡혔습니다. 틀린 천체를 도감에서 한 번씩 열어 보세요.'; star = '✨'; }
    else { msg = '처음이면 충분합니다. 초급부터 다시 하면 금방 늘어요.'; star = '🌱'; }

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
          '<p class="quiz-msg">' + msg + '</p>' +
          (newRecord ? '<p class="quiz-new">새 최고 기록입니다!</p>' : '<p class="quiz-best">이 난이도 최고 기록 · ' + best(st.level) + ' / ' + n + '</p>') +
          '<div class="quiz-actions">' +
            '<button type="button" class="btn-primary" id="quizRetry">같은 난이도 다시</button>' +
            '<button type="button" class="btn-ghost" id="quizOther">난이도 바꾸기</button>' +
          '</div>' +
        '</div>' +
        wrongHtml +
      '</div>';
    $('#quizRetry').addEventListener('click', start);
    $('#quizOther').addEventListener('click', function () { renderIntro(); });
    shell.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.OneulBam && window.OneulBam.openObject) window.OneulBam.openObject(b.getAttribute('data-open'));
      });
    });
    shell.querySelectorAll('[data-aim]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.OneulBam && window.OneulBam.aimObject) window.OneulBam.aimObject(b.getAttribute('data-aim'));
      });
    });
    shell.querySelectorAll('[data-open-wide]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.SpaceUI && window.SpaceUI.openCatalogObject) {
          window.SpaceUI.openCatalogObject(b.getAttribute('data-open-wide'));
        }
      });
    });
    shell.querySelectorAll('[data-aim-radec]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = String(b.getAttribute('data-aim-radec')).split(',');
        if (window.OneulBam && window.OneulBam.aimRaDec) {
          window.OneulBam.aimRaDec(Number(p[0]), Number(p[1]), b.getAttribute('data-name') || '천체');
        }
      });
    });
  }

  /* ------------------------------------------------------------ 시작 */

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
    total: function () { return TOTAL; }
  };
})();
