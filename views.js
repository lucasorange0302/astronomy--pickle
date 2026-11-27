/* =========================================================================
   views.js — 앱형 화면 구조 (2026-11)
   · 라이브 하늘을 기본 화면으로, 나머지 기능은 각각 독립된 화면(view)으로 전환
   · 해시 딥링크(#today #skymap #live #catalog #constellations #spacearchive
     #sites #glossary #lab #guide #calendar #science #plan)를 화면으로 매핑
   · 화면을 벗어나면 라이브 하늘 캔버스·센서 루프를 멈추고, 돌아오면 재개
   ========================================================================= */
(function () {
  var VIEWS = ['live', 'today', 'skymap', 'catalog', 'spacearchive', 'calendar',
    'sites', 'lab', 'guide', 'science', 'plan'];
  var META = {
    live: ['🧭', '라이브 하늘', '지금 이 방향의 하늘'],
    today: ['🌙', '오늘 밤', '관측 지수 · 구름 · 행성'],
    skymap: ['🗺', '전천 지도', '하늘 전체 한 장'],
    catalog: ['🔭', '도감', '천체 2,571 · 별자리 88'],
    spacearchive: ['🛰', '자료관', 'NASA · SpaceX 사진'],
    calendar: ['📅', '관측 일정', '2026~2027 천문 캘린더'],
    sites: ['🏕', '관측 명소', '전국 34곳'],
    lab: ['🧮', '계산기', '노출 · 배율 · 거리'],
    guide: ['📖', '가이드', '초보자 · 용어사전'],
    science: ['🔬', '원리', '암순응 · 광학 · 시상'],
    plan: ['✅', '체크리스트', '관측 준비 · 로그']
  };
  var MAP = {
    today: 'today', live: 'live', skymap: 'skymap', catalog: 'catalog',
    constellations: 'catalog', spacearchive: 'spacearchive', calendar: 'calendar',
    sites: 'sites', lab: 'lab', guide: 'guide', glossary: 'guide',
    science: 'science', plan: 'plan', plan_: 'plan'
  };
  var DEFAULT = 'live';

  function sections() {
    return Array.prototype.slice.call(document.querySelectorAll('main > section[data-view]'));
  }
  function viewOf(hash) {
    var h = String(hash || '').replace(/^#/, '');
    return MAP[h] || null;
  }
  function sectionFor(name) {
    return document.querySelector('main > section[data-view="' + name + '"]');
  }

  var current = null;
  var historyOK = true;

  function setActive(name) {
    var links = document.querySelectorAll('.main-nav .nav-link');
    Array.prototype.forEach.call(links, function (a) {
      var on = a.getAttribute('data-nav') === name ||
        (name === 'spacearchive' && false);
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    var side = document.querySelectorAll('.app-side [data-view]');
    Array.prototype.forEach.call(side, function (b) {
      var on = b.getAttribute('data-view') === name;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    var tabs = document.querySelectorAll('#tabBar [data-nav]');
    Array.prototype.forEach.call(tabs, function (t) {
      var on = t.getAttribute('data-nav') === name;
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
  }

  function scrollToTarget(hashKey) {
    if (!hashKey || hashKey === current) { window.scrollTo(0, 0); return; }
    var el = document.getElementById(hashKey === 'glossary' ? 'glossaryPanel' : hashKey);
    if (el && el.getClientRects().length) {
      var top = el.getBoundingClientRect().top + window.scrollY -
        (document.getElementById('siteHeader') ? document.getElementById('siteHeader').offsetHeight : 0) - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    } else {
      window.scrollTo(0, 0);
    }
  }

  function show(name, hashKey, push) {
    if (VIEWS.indexOf(name) < 0) name = DEFAULT;
    var list = sections();
    if (!list.length) return;
    var changed = name !== current;
    list.forEach(function (sec) {
      var on = sec.getAttribute('data-view') === name;
      sec.classList.toggle('is-active', on);
      sec.hidden = !on;
    });
    current = name;
    document.documentElement.setAttribute('data-screen', name);
    document.body.setAttribute('data-screen', name);
    setActive(name);
    if (changed) scrollToTarget(hashKey, true);
    else if (hashKey) scrollToTarget(hashKey, false);

    if (window.LiveSky) {
      if (name === 'live') window.LiveSky.resume();
      else window.LiveSky.pause();
    }
    if (push) {
      var key = hashKey || name;
      try { history.pushState({ view: name }, '', '#' + key); }
      catch (e) { historyOK = false; try { location.hash = key; } catch (e2) { } }
    }
    // 화면 전환 뒤 도감 탭 등이 자기 크기를 다시 재도록
    window.dispatchEvent(new Event('resize'));
  }

  function go(id) {
    var name = MAP[id] || DEFAULT;
    show(name, id, true);
  }
  window.__views = { go: go, show: show, current: function () { return current; } };
  window.__VIEWS_MODE__ = true;

  /* ---------------------------------------------------------- 딥링크/뒤로 */
  function fromLocation(push) {
    var key = (location.hash || '').replace('#', '');
    var name = MAP[key] || DEFAULT;
    show(name, key || null, push);
  }
  window.addEventListener('popstate', function () { fromLocation(false); });
  window.addEventListener('hashchange', function () {
    var key = (location.hash || '').replace('#', '');
    if (!key) return;
    var name = MAP[key];
    if (name && name !== current) show(name, key, false);
  });

  /* ------------------------------------------------------------- 클릭 가로채기 */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var target = a.getAttribute('href').slice(1);
    if (!target) return;
    // 화면 밖(다른 사이트) 링크는 그대로
    var name = MAP[target] || null;
    var el = document.getElementById(target);
    if (!name && !el) return;
    e.preventDefault();
    e.stopPropagation();
    if (name) {
      go(target);
      // 메뉴 닫기
      var menu = document.getElementById('moreMenu');
      if (menu && !menu.hidden) {
        menu.hidden = true;
        var btn = document.getElementById('btnMore');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    } else if (el) {
      var view = el.closest('section[data-view]');
      if (view) show(view.getAttribute('data-view'), target, true);
    }
  }, true);

  /* --------------------------------------------------- 데스크톱 좌측 레일 */
  function buildSideRail() {
    if (document.querySelector('.app-side')) return;
    var side = document.createElement('aside');
    side.className = 'app-side';
    side.id = 'appSide';
    side.setAttribute('aria-label', '화면 목록');
    var html = '<p class="as-title">화면</p>';
    VIEWS.forEach(function (v) {
      html += '<button type="button" class="as-item" data-view="' + v + '">' +
        '<span class="as-ico" aria-hidden="true">' + META[v][0] + '</span>' +
        '<span class="as-txt"><b>' + META[v][1] + '</b><small>' + META[v][2] + '</small></span></button>';
    });
    html += '<p class="as-title">바로 열기</p>' +
      '<button type="button" class="as-item as-quick" data-open="cookie"><span class="as-ico" aria-hidden="true">🍪</span><span class="as-txt"><b>우주 쿠키</b><small>오늘의 우주 사실</small></span></button>' +
      '<button type="button" class="as-item as-quick" data-view="spacearchive"><span class="as-ico" aria-hidden="true">🛰</span><span class="as-txt"><b>관측 자료관</b><small>NASA · SpaceX 사진</small></span></button>' +
      '<button type="button" class="as-item as-quick" data-open="ai"><span class="as-ico" aria-hidden="true">🤖</span><span class="as-txt"><b>AI 도우미</b><small>이 사이트 데이터로 답변</small></span></button>';
    side.innerHTML = html;
    var main = document.querySelector('main');
    main.parentNode.insertBefore(side, main);
    side.addEventListener('click', function (e) {
      var item = e.target.closest('[data-view]');
      if (item) { go(item.getAttribute('data-view')); return; }
      var q = e.target.closest('[data-open]');
      if (q) {
        var k = q.getAttribute('data-open');
        if (window.SpaceUI) { if (k === 'cookie') SpaceUI.openCookie(); else SpaceUI.openAI(); }
      }
    });
  }
  if (document.documentElement.getAttribute('data-layout') === 'desktop') buildSideRail();

  /* ------------------------------------------------- 라이브 하늘 조작 시트 */
  function wireLive() {
    var tools = document.getElementById('liveToolsBtn');
    var panel = document.querySelector('#live .live-panel');
    if (tools && panel && !tools.dataset.wired) {
      tools.dataset.wired = '1';
      tools.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = panel.classList.toggle('is-controls-open');
        tools.setAttribute('aria-expanded', open ? 'true' : 'false');
        tools.textContent = open ? '✕ 닫기' : '⚙ 조작';
      });
    }
    var ctrl = document.getElementById('liveControls');
    if (ctrl && !ctrl.querySelector('.lc-close')) {
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'lc-close';
      close.id = 'liveControlsClose';
      close.textContent = '✕ 조작 닫기';
      close.addEventListener('click', function () {
        if (panel) panel.classList.remove('is-controls-open');
        if (tools) { tools.setAttribute('aria-expanded', 'false'); tools.textContent = '⚙ 조작'; }
      });
      ctrl.insertBefore(close, ctrl.firstChild);
    }
    var cal2 = document.getElementById('liveCalBtnQ');
    if (cal2 && !cal2.dataset.wired) {
      cal2.dataset.wired = '1';
      cal2.addEventListener('click', function (e) {
        e.stopPropagation();
        var b = document.getElementById('liveCalBtn');
        if (b) b.click();
      });
    }
    var chip = document.getElementById('liveSensorChip');
    if (chip && !chip.dataset.wired) {
      chip.dataset.wired = '1';
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.title = '탭하면 센서를 켜거나 끕니다';
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        var b = document.getElementById('liveSensorBtn');
        if (b) b.click();
      });
      chip.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chip.click(); }
      });
    }
  }

  /* ------------------------------------------------------------- 초기화 */
  function init() {
    // space-ui가 만든 자료관 섹션도 하나의 화면으로
    var sa = document.getElementById('spacearchive');
    if (sa && !sa.getAttribute('data-view')) sa.setAttribute('data-view', 'spacearchive');
    // 화면 후보를 다시 모아 숨김 상태 정리
    var list = sections();
    list.forEach(function (s) { if (!s.classList.contains('is-active')) s.hidden = true; });
    document.documentElement.classList.add('has-views');
    wireLive();
    var key = (location.hash || '').replace('#', '');
    show(MAP[key] || DEFAULT, key || null, false);
    document.addEventListener('visibilitychange', function () {
      if (!window.LiveSky) return;
      if (document.hidden) window.LiveSky.pause();
      else if (current === 'live') window.LiveSky.resume();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }
})();
