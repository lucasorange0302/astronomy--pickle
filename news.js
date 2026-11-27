/* =========================================================================
   news.js — 📰 우주·천문 뉴스 (2026-11-27)
   · Spaceflight News API v4 (CORS 허용 공개 API)로 최신 기사를 불러옵니다.
   · 오프라인·API 실패 시에도 바로 읽을 수 있는 '검증된 한국어 소식' 폴백을 둡니다.
   · 기사를 누르면 요약과 원문 링크가 담긴 상세 창이 열립니다.
   ========================================================================= */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var API = 'https://api.spaceflightnewsapi.net/v4/articles/';
  var CACHE_KEY = 'ob.news.cache.v1';
  var TTL = 15 * 60 * 1000;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    var now = new Date();
    var diff = (now - d) / 1000;
    var kst = new Date(d.getTime() + 9 * 3600 * 1000);
    var y = kst.getUTCFullYear(), m = kst.getUTCMonth() + 1, day = kst.getUTCDate();
    var hh = kst.getUTCHours(), mm = String(kst.getUTCMinutes()).padStart(2, '0');
    var label = y + '.' + m + '.' + day + '. ' + String(hh).padStart(2, '0') + ':' + mm;
    if (diff < 3600) return Math.max(1, Math.round(diff / 60)) + '분 전 · ' + label;
    if (diff < 86400 * 2) return Math.round(diff / 3600) + '시간 전 · ' + label;
    return label;
  }

  /* ------------------------------------------------------------- 분류 */
  var ASTRO = ['telescope', 'astronom', 'james webb', 'jwst', 'hubble', 'nebula', 'galaxy', 'galaxies',
    'star', 'stellar', 'exoplanet', 'planet', 'asteroid', 'comet', 'eclipse', 'supernova', 'black hole',
    'cosmic', 'cosmos', 'milky way', 'apod', 'astro', 'observatory', 'sky', 'moon', 'mars', 'jupiter',
    'saturn', 'venus', 'mercury', 'neptune', 'uranus', 'solar system', 'dark matter', 'dark energy',
    'gravitational wave', 'pulsar', 'quasar', 'meteor', 'aurora', 'heliophysics', 'sun', 'solar wind',
    'spectrum', 'infrared', 'radio telescope', 'lunar', 'venus', 'pluto', 'kuiper', 'interstellar'];
  var SPACE = ['launch', 'rocket', 'falcon', 'starship', 'soyuz', 'ariane', 'long march', 'electron',
    'spacex', 'nasa', 'esa', 'jaxa', 'roscosmos', 'iss', 'space station', 'satellite', 'starlink',
    'crew', 'dragon', 'orion', 'sls', 'artemis', 'cargo', 'docking', 'mission', 'probe', 'lander',
    'rover', 'spaceflight', 'space force', 'faa', 'fcc', 'orbit', 'reentry', 'booster', 'payload',
    'astronaut', 'cosmonaut', 'blue origin', 'rocket lab', 'ula', 'firefly', 'isro', 'cnes', 'dlr'];

  function classify(a) {
    var text = ((a.title || '') + ' ' + (a.summary || '') + ' ' + (a.news_site || '')).toLowerCase();
    var astro = 0, space = 0;
    ASTRO.forEach(function (k) { if (text.indexOf(k) >= 0) astro += 1; });
    SPACE.forEach(function (k) { if (text.indexOf(k) >= 0) space += 1; });
    // NASA APOD 은 천문 사진 소식으로 봅니다.
    if (/apod/i.test(a.title || '')) astro += 3;
    return astro > space ? 'astro' : 'space';
  }

  var CAT_LABEL = { astro: '🔭 천문학·관측', space: '🚀 로켓·우주탐사' };

  /* ------------------------------------------------ 검증된 한국어 폴백 */
  var FALLBACK = [
    {
      date: '2026-11-18', cat: 'space', site: 'NASA 보이저 미션',
      title: '보이저 1호, 인류 물체로 처음 ‘1광일’ 거리를 넘었다',
      ko: '1977년 발사된 보이저 1호가 2026년 11월 18일 지구에서 빛이 하루 동안 가는 거리(약 259억 km)를 넘어섰습니다. 49년 넘는 비행 끝의 기록입니다.',
      url: 'https://science.nasa.gov/mission/voyager/'
    },
    {
      date: '2026-11-27', cat: 'astro', site: 'NASA APOD',
      title: '오늘의 천문사진 — The Moon Watchers',
      ko: 'NASA의 오늘의 천문사진(APOD) 2026년 11월 27일 자는 달을 지켜보는 장면을 담았습니다. APOD는 1995년부터 매일 천문 사진과 해설을 올리고 있습니다.',
      url: 'https://science.nasa.gov/apod/'
    },
    {
      date: '2026-11-26', cat: 'space', site: 'NASASpaceflight · SpaceNews',
      title: 'FCC, SpaceX의 ‘스타마인드’ 데이터센터 위성 최대 100만기 배치 승인',
      ko: '미국 연방통신위원회(FCC)가 SpaceX가 2040년까지 최대 100만기의 ‘스타마인드’ AI 데이터센터 위성을 배치하도록 승인했습니다. 대규모 위성 군집 시대의 규제 기준이 될 전망입니다.',
      url: 'https://www.nasaspaceflight.com/'
    },
    {
      date: '2026-11-26', cat: 'space', site: 'European Spaceflight',
      title: '탈레스 알레니아 스페이스, 화물 귀환 전담 법인 설립',
      ko: '탈레스 알레니아 스페이스가 우주 화물의 지구 귀환 서비스를 전담하는 회사를 세웁니다. 우주정거장 이후의 상업 화물 수송 시장을 겨냥한 움직임입니다.',
      url: 'https://europeanspaceflight.com/'
    },
    {
      date: '2026-11-26', cat: 'astro', site: 'NASA/IPAC 외계행성 아카이브',
      title: '확정된 외계행성 6,473개 — 30년 만의 기록',
      ko: 'NASA/IPAC 외계행성 아카이브의 확정 행성 수는 2026년 11월 26일 기준 6,473개입니다. 1995년 첫 외계행성 확인 이후 30여 년 만에 6,000개를 넘어섰습니다.',
      url: 'https://exoplanetarchive.ipac.caltech.edu/'
    },
    {
      date: '2026-11-13', cat: 'space', site: 'SpaceX',
      title: '스타십 15차 시험비행 성공',
      ko: '스타십이 2026년 11월 13일 15번째 시험비행을 성공으로 마쳤습니다. 세계에서 가장 큰 로켓을 반복 재사용하는 시험이 이어지고 있습니다.',
      url: 'https://www.spacex.com/'
    },
    {
      date: '2026-11-26', cat: 'astro', site: 'NASA APOD',
      title: '오늘의 천문사진 — Eye in the Sky: The Milky Way over Lençóis',
      ko: '브라질 렌소이스의 밤하늘을 가로지르는 은하수를 담은 사진입니다. 은하수는 우리은하를 안쪽에서 바라본 모습입니다.',
      url: 'https://science.nasa.gov/apod/'
    },
    {
      date: '2026-10-01', cat: 'space', site: 'NASA',
      title: '크루-13, 팰컨 9으로 ISS로 향하다',
      ko: 'NASA 크루-13 임무가 2026년 10월 1일 팰컨 9과 크루 드래곤으로 발사되었습니다. 국제우주정거장(ISS) 장기 체류 임무입니다.',
      url: 'https://www.nasa.gov/spacex/'
    },
    {
      date: '2026-11-26', cat: 'astro', site: 'IMO 국제유성기구',
      title: '2026년 유성우 — 페르세우스·쌍둥이자리 극대는 달 없는 밤',
      ko: 'IMO 2026 유성우 달력에 따르면 페르세우스자리(8월 12일)와 쌍둥이자리(12월 14일) 유성우 극대는 달빛 방해가 없는 밤입니다. 사분의자리 유성우는 보름달과 겹칩니다.',
      url: 'https://www.imo.net/files/meteor-shower/cal2026.pdf'
    },
    {
      date: '2026-11-26', cat: 'space', site: 'NASA 파커 태양탐사선',
      title: '파커 태양탐사선, 태양 표면 620만 km까지 접근',
      ko: '파커 태양탐사선은 7년 동안 태양 주위를 24바퀴 돌며 가장 가까울 때 태양 표면에서 약 620만 km까지 접근합니다. 어떤 우주선보다 가까운 거리입니다.',
      url: 'https://science.nasa.gov/mission/parker-solar-probe/'
    },
    {
      date: '2026-11-26', cat: 'space', site: 'NASA 아르테미스',
      title: '아르테미스 II — 사람이 다시 달로',
      ko: 'NASA 아르테미스 프로그램은 우주비행사를 달에 보내는 계획입니다. 아르테미스 I(2022)은 무인으로 달 궤도를 돌았고, 아르테미스 II는 우주비행사가 달 궤도를 도는 임무입니다.',
      url: 'https://science.nasa.gov/mission/artemis/'
    },
    {
      date: '2026-11-26', cat: 'astro', site: '한국천문연구원(KASI)',
      title: 'KASI 천문우주지식정보 — 매일의 천문현상',
      ko: '한국천문연구원은 음양력, 일출·일몰, 월별 천문현상, 관측 정보를 공개합니다. 이 사이트의 박명·달 위상 계산도 KASI 값과 맞춰 검증했습니다.',
      url: 'https://astro.kasi.re.kr/'
    }
  ];

  /* ------------------------------------------------------------- 상태 */
  var N = { items: [], cat: '', fallback: false, loaded: false, error: '', offset: 0 };

  function getCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !d.at || !d.items) return null;
      if (Date.now() - d.at > TTL) return null;
      return d;
    } catch (e) { return null; }
  }
  function setCache(items) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items: items })); } catch (e) { }
  }

  function goodImage(u) {
    if (!u) return '';
    if (/\.(png|svg|gif)(\?|$)/i.test(u)) return '';      // 로고·아이콘은 카드 사진으로 쓰지 않습니다
    if (/logo/i.test(u)) return '';
    return u;
  }

  function normalize(a) {
    return {
      id: a.id, title: a.title || '', summary: a.summary || '', url: a.url || '',
      image: goodImage(a.image_url), site: a.news_site || '', date: a.published_at || '',
      cat: classify(a)
    };
  }

  function fetchNews(force) {
    if (!force) {
      var c = getCache();
      if (c) { N.items = c.items; N.loaded = true; N.fallback = false; render(); return; }
    }
    N.error = '';
    render();
    var ctrl = null;
    var t = setTimeout(function () {
      try { if (ctrl) ctrl.abort(); } catch (e) { }
    }, 9000);
    var opts = { headers: { Accept: 'application/json' } };
    if (window.AbortController) { ctrl = new AbortController(); opts.signal = ctrl.signal; }
    fetch(API + '?limit=30', opts).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      clearTimeout(t);
      var items = (d.results || []).map(normalize).filter(function (x) { return x.title; });
      if (!items.length) throw new Error('빈 목록');
      N.items = items;
      N.loaded = true;
      N.fallback = false;
      setCache(items);
      render();
    }).catch(function (err) {
      clearTimeout(t);
      N.loaded = true;
      N.fallback = true;
      N.error = (err && err.name === 'AbortError') ? '시간 초과' : (err && err.message ? err.message : '연결 실패');
      N.items = FALLBACK.map(function (f, i) {
        return { id: 'fb-' + i, title: f.title, summary: f.ko, url: f.url, image: '',
          site: f.site, date: f.date + 'T00:00:00Z', cat: f.cat, ko: true };
      });
      render();
    });
  }

  /* ------------------------------------------------------------- 번역 */
  /* Google 번역의 무료 공개 엔드포인트(키 없이 쓰는 경로)로 제목·요약을 한국어로 바꿉니다.
     · 기사 객체에 번역 결과를 붙여 두어, 분류 칩을 눌러 다시 그려도 번역이 유지됩니다.
     · 네트워크·CORS·한도 문제로 실패하면 Google 번역 페이지를 새 창으로 열게 안내합니다. */
  var TR_API = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=';

  function hasHangul(s) { return /[가-힣]/.test(String(s || '')); }
  function needsTranslation(a) {
    if (!a || a.ko) return false;                 // 이미 한국어로 정리한 소식
    var t = a.title || '';
    return !(hasHangul(t) && hasHangul(a.summary || ''));
  }

  function gtranslate(text) {
    var q = String(text || '').replace(/\s+/g, ' ').trim();
    if (!q) return Promise.resolve('');
    return fetch(TR_API + encodeURIComponent(q.slice(0, 1800)), { mode: 'cors' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        var out = '';
        var seg = (d && d[0]) || [];
        for (var i = 0; i < seg.length; i++) if (seg[i] && seg[i][0]) out += seg[i][0];
        out = out.trim();
        if (!out || !hasHangul(out)) throw new Error('빈 번역');
        return out;
      });
  }

  function translateUrl(a) {
    return 'https://translate.google.com/translate?sl=en&tl=ko&u=' + encodeURIComponent(a.url || '');
  }

  function translateCard(a) {
    if (!a) return;
    if (a.koTitle) {            // 이미 번역됨 → 원문/번역 토글
      a.showKo = a.showKo === false;
      render();
      return;
    }
    if (a.trBusy) return;
    a.trBusy = true;
    a.trFail = false;
    render();
    Promise.all([
      gtranslate(a.title),
      a.summary ? gtranslate(a.summary) : Promise.resolve('')
    ]).then(function (res) {
      a.trBusy = false;
      a.koTitle = res[0] || a.title;
      a.koSum = res[1] || '';
      a.showKo = true;
      render();
    }).catch(function () {
      a.trBusy = false;
      a.trFail = true;
      render();
      var w = null;
      try { w = window.open(translateUrl(a), '_blank', 'noopener'); } catch (e) { w = null; }
      // 팝업이 막혔으면 카드에 '새 창에서 번역' 링크가 남습니다(render 가 그려 줍니다).
      void w;
    });
  }

  function trButtonHtml(a, i) {
    if (!needsTranslation(a)) return '';
    if (a.koTitle) {
      return '<button class="nc-tr" type="button" data-news-tr="' + i + '" aria-pressed="' + (a.showKo !== false) + '">' +
        (a.showKo !== false ? '🌐 원문 보기' : '🌐 한국어로 보기') + '</button>';
    }
    if (a.trFail) {
      return '<a class="nc-tr nc-tr-link" href="' + esc(translateUrl(a)) + '" target="_blank" rel="noopener noreferrer">🌐 새 창에서 번역 ↗</a>';
    }
    return '<button class="nc-tr" type="button" data-news-tr="' + i + '"' + (a.trBusy ? ' disabled' : '') + '>' +
      (a.trBusy ? '번역 중…' : '🌐 번역') + '</button>';
  }

  function listFor() {
    var list = N.items;
    if (N.cat) list = list.filter(function (x) { return x.cat === N.cat; });
    return list;
  }

  function render() {
    var app = $('#newsApp');
    if (!app) return;
    var grid = $('#newsGrid');
    var status = $('#newsStatus');
    if (!grid) return;

    if (status) {
      if (!N.loaded) {
        status.className = 'news-status';
        status.innerHTML = '<span class="dot"></span>최신 소식을 불러오는 중…';
      } else if (N.fallback) {
        status.className = 'news-status is-fallback';
        status.innerHTML = '<span class="dot"></span>지금은 새 소식을 받아오지 못해 <b>확인된 한국어 소식</b>을 보여 드립니다';
      } else {
        status.className = 'news-status';
        status.innerHTML = '<span class="dot"></span>Spaceflight News · ' + N.items.length + '건 · 최신순 (한국 시간)';
      }
    }

    var list = listFor();
    if (!N.loaded) {
      grid.innerHTML = '<p class="news-status">불러오는 중…</p>';
      return;
    }
    if (!list.length) {
      grid.innerHTML = '<p class="news-status">이 분류의 기사가 없습니다. 다른 분류를 골라 보세요.</p>';
      return;
    }
    grid.innerHTML = list.map(function (a, i) {
      var img = a.image
        ? '<img class="nc-img" src="' + esc(a.image) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">'
        : '';
      var ko = !!a.koTitle && a.showKo !== false;    // 지금 한국어 번역을 보여 주는 중
      var title = ko ? a.koTitle : a.title;
      var sum = ko ? (a.koSum || a.summary) : a.summary;
      var badge = a.ko ? '<span class="nc-ko">한국어 요약</span>'
        : (ko ? '<span class="nc-ko nc-ko-mt">🌐 기계 번역</span>' : '');
      return '<div class="news-card" role="button" tabindex="0" data-news="' + i + '" aria-label="' + esc(title) + ' 상세 보기">' +
        img +
        '<span class="nc-body">' +
        '<span class="nc-meta"><span class="nc-cat">' + (CAT_LABEL[a.cat] || '') + '</span>' +
        '<span>' + esc(a.site) + '</span><span>' + esc(fmtDate(a.date)) + '</span></span>' +
        '<span class="nc-title">' + esc(title) + '</span>' +
        badge +
        (sum ? '<span class="nc-sum">' + esc(sum) + '</span>' : '') +
        '</span>' +
        '<span class="nc-actions">' + trButtonHtml(a, i) +
        '<span class="nc-open">자세히 ›</span></span>' +
        '</div>';
    }).join('');
    grid.querySelectorAll('.news-card').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        var tr = ev.target && ev.target.closest ? ev.target.closest('[data-news-tr]') : null;
        if (tr) { ev.preventDefault(); ev.stopPropagation(); translateCard(list[+tr.getAttribute('data-news-tr')]); return; }
        if (ev.target && ev.target.closest && ev.target.closest('a')) return;   // 번역 실패 링크는 그대로 엽니다
        var idx = +b.getAttribute('data-news');
        openDetail(list[idx]);
      });
      b.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
        if (ev.target !== b) return;      // 안쪽 번역 버튼은 자기 키 입력을 쓺니다
        ev.preventDefault();
        openDetail(list[+b.getAttribute('data-news')]);
      });
    });
  }

  function openDetail(a) {
    if (!a) return;
    var m = $('#newsModal');
    if (!m) return;
    m.hidden = false;
    document.body.classList.add('space-lock');
    var ko = !!a.koTitle && a.showKo !== false;
    $('#newsModalBody').innerHTML =
      '<p class="nd-meta"><span class="nc-cat">' + (CAT_LABEL[a.cat] || '') + '</span>' +
      '<span>' + esc(a.site) + '</span><span>' + esc(fmtDate(a.date)) + '</span></p>' +
      '<h3 id="newsModalTitle">' + esc(ko ? a.koTitle : a.title) + '</h3>' +
      '<p class="nd-sum">' + esc(ko ? (a.koSum || a.summary) : (a.summary || '이 기사에는 요약이 없습니다. 원문에서 확인해 주세요.')) + '</p>' +
      (a.ko ? '<p class="nd-note">한국어 요약은 공식 자료를 바탕으로 이 사이트에서 정리한 것입니다.</p>'
        : ko ? '<p class="nd-note">제목·요약의 한국어는 Google 번역의 기계 번역입니다. 정확한 내용은 원문에서 확인하세요.</p>'
          : '<p class="nd-note">요약은 Spaceflight News가 제공한 원문 요약(영어)입니다. 자세한 내용은 원문에서 확인하세요.</p>') +
      '<div class="nd-links"><a class="btn btn-primary btn-sm" href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-news-close="1">닫기</button></div>';
    var c = $('.modal-close', m);
    if (c) c.focus();
  }

  function closeDetail() {
    var m = $('#newsModal');
    if (!m) return;
    m.hidden = true;
    document.body.classList.remove('space-lock');
  }

  function init() {
    var app = $('#newsApp');
    if (!app) return;
    app.innerHTML =
      '<div class="news-head">' +
      '  <div class="chip-row" id="newsChips">' +
      '    <button class="chip is-active" data-news-cat="">전체</button>' +
      '    <button class="chip" data-news-cat="astro">🔭 천문학·관측</button>' +
      '    <button class="chip" data-news-cat="space">🚀 로켓·우주탐사</button>' +
      '  </div>' +
      '  <button class="mini-btn" type="button" id="newsRefresh">↻ 새로고침</button>' +
      '</div>' +
      '<p class="news-status" id="newsStatus"><span class="dot"></span>최신 소식을 불러오는 중…</p>' +
      '<div class="news-grid" id="newsGrid"></div>' +
      '<p class="news-sub-note">기사는 Spaceflight News에서 실시간으로 받아옵니다. 카드의 <b>🌐 번역</b>을 누르면 제목·요약을 한국어로 바로 볼 수 있습니다(원문 보기로 되돌리기). 한국어 소식은 공식 기관 자료를 바탕으로 정리했습니다.</p>';

    var chips = $('#newsChips');
    chips.addEventListener('click', function (e) {
      var b = e.target.closest('[data-news-cat]');
      if (!b) return;
      $$('.chip', chips).forEach(function (x) { x.classList.toggle('is-active', x === b); });
      N.cat = b.getAttribute('data-news-cat');
      render();
    });
    $('#newsRefresh').addEventListener('click', function () { fetchNews(true); });

    var m = $('#newsModal');
    if (m) {
      m.addEventListener('click', function (e) {
        if (e.target.closest('[data-news-close]') || e.target.classList.contains('modal-backdrop')) closeDetail();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !m.hidden) closeDetail();
      });
    }
    fetchNews(false);
  }

  window.NewsUI = { init: init, refresh: function () { fetchNews(true); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
