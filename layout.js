/* =========================================================================
   layout.js — 모바일판(mobile.html) / 데스크톱판(desktop.html) 전용 동작
   · 지금 보고 있는 판을 표시하고, 한 번에 다른 판으로 옮겨 줍니다.
   · 직접 고른 판은 localStorage('ob-layout')에 기억되어 index.html이 그 판으로 보냅니다.
   ========================================================================= */
(function () {
  var html = document.documentElement;
  var mode = html.getAttribute('data-layout');
  if (mode !== 'mobile' && mode !== 'desktop') return;

  var META = {
    mobile: { label: '모바일판', icon: '📱', other: 'desktop', otherLabel: '데스크톱판', otherIcon: '🖥️' },
    desktop: { label: '데스크톱판', icon: '🖥️', other: 'mobile', otherLabel: '모바일판', otherIcon: '📱' }
  };
  var me = META[mode], them = META[me.other];

  function remember(page) {
    try { localStorage.setItem('ob-layout', page); } catch (e) { /* 사생활 보호 모드 등 */ }
  }
  function link(page) {
    return page + '.html' + (location.hash || '');
  }
  function go(page) {
    remember(page);
    location.href = link(page);
  }

  /* 1) 헤더에 판 전환 버튼 ------------------------------------------------ */
  var tools = document.querySelector('.header-tools');
  if (tools && !document.getElementById('btnVersion')) {
    var wrap = document.querySelector('.more-wrap');
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-btn ver-btn';
    b.id = 'btnVersion';
    b.title = them.label + '으로 보기';
    b.setAttribute('aria-label', them.label + '으로 보기');
    var ico = me.other === 'desktop'
      ? '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="2.8" y="4" width="18.4" height="12.4" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 20h7M12 16.4V20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="7" y="2.4" width="10" height="19.2" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10.6 18.4h2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    b.innerHTML = ico + '<span class="tool-label">' + them.label.replace('판', '') + '</span>';
    b.addEventListener('click', function () { go(me.other); });
    if (wrap && wrap.parentNode === tools) tools.insertBefore(b, wrap);
    else tools.appendChild(b);
  }

  /* 2) ☰ 더보기 메뉴 맨 위에 '화면 버전' -------------------------------- */
  var menu = document.getElementById('moreMenu');
  if (menu && !menu.querySelector('.more-version')) {
    var g = document.createElement('div');
    g.className = 'more-group more-version';
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', '화면 버전');
    g.innerHTML =
      '<p class="more-title"><span aria-hidden="true">🖥️</span> 화면 버전</p>' +
      '<a href="' + link('mobile') + '" class="more-item" role="menuitem" data-ver="mobile">' +
      '  <span class="mi-ico" aria-hidden="true">📱</span>' +
      '  <span class="mi-txt"><b>모바일판</b><small>한 손 조작 · 세로 화면 최적화</small></span>' +
      (mode === 'mobile' ? '<span class="ver-now">현재</span>' : '') +
      '</a>' +
      '<a href="' + link('desktop') + '" class="more-item" role="menuitem" data-ver="desktop">' +
      '  <span class="mi-ico" aria-hidden="true">🖥️</span>' +
      '  <span class="mi-txt"><b>데스크톱판</b><small>와이드 화면 · 다단 대시보드</small></span>' +
      (mode === 'desktop' ? '<span class="ver-now">현재</span>' : '') +
      '</a>' +
      '<a href="index.html?view=auto" class="more-item" role="menuitem" data-ver="auto">' +
      '  <span class="mi-ico" aria-hidden="true">🔄</span>' +
      '  <span class="mi-txt"><b>자동 선택</b><small>지금 화면에 맞는 판으로</small></span>' +
      '</a>';
    menu.insertBefore(g, menu.firstChild);

    g.addEventListener('click', function (ev) {
      var a = ev.target.closest('[data-ver]');
      if (!a) return;
      if (a.getAttribute('data-ver') === 'auto') {
        try { localStorage.removeItem('ob-layout'); } catch (e) {}
      } else {
        remember(a.getAttribute('data-ver'));
      }
      a.href = a.getAttribute('data-ver') === 'auto'
        ? 'index.html?view=auto' + (location.hash || '')
        : link(a.getAttribute('data-ver'));
    });
  }

  /* 3) 푸터에 판 전환 ------------------------------------------------------ */
  var footer = document.querySelector('.footer-inner');
  if (footer && !footer.querySelector('.footer-version')) {
    var fv = document.createElement('div');
    fv.className = 'footer-version';
    fv.innerHTML =
      '<span class="fv-label">화면 버전</span>' +
      '<a href="' + link('mobile') + '"' + (mode === 'mobile' ? ' aria-current="page"' : '') + '>📱 모바일판</a>' +
      '<a href="' + link('desktop') + '"' + (mode === 'desktop' ? ' aria-current="page"' : '') + '>🖥️ 데스크톱판</a>' +
      '<a href="index.html?view=auto">🔄 자동 선택</a>';
    var note = footer.querySelector('.footer-note');
    footer.insertBefore(fv, note || null);
    fv.addEventListener('click', function (ev) {
      var a = ev.target.closest('a');
      if (!a || /view=auto/.test(a.getAttribute('href') || '')) return;
      var page = /mobile\.html/.test(a.getAttribute('href')) ? 'mobile' : 'desktop';
      remember(page);
      a.href = link(page);
    });
  }

  /* 4) 플로팅 독 — 아이콘만 남기는 데스크톱판에서도 이름이 보이게 ---------- */
  var dock = document.getElementById('spaceDock');
  if (dock) {
    Array.prototype.forEach.call(dock.querySelectorAll('.sd-btn'), function (btn) {
      var label = btn.getAttribute('aria-label') || '';
      if (label && !btn.title) btn.title = label;
    });
  }

  /* 7) 모바일 상단 바 제거 — 화면·공유 기능을 ☰ 더보기로 옴깁니다 ------- */
  if (mode === 'mobile' && menu && !menu.querySelector('.more-screen')) {
    var btnMoreM = document.getElementById('btnMore');
    var moreTabM = document.getElementById('tabMore');
    var scr = document.createElement('div');
    scr.className = 'more-group more-screen';
    scr.setAttribute('role', 'group');
    scr.setAttribute('aria-label', '화면과 공유');
    scr.innerHTML =
      '<p class="more-title"><span aria-hidden="true">🎛️</span> 화면 · 공유</p>' +
      '<button type="button" class="more-item" data-trigger="btnRed" role="menuitem">' +
      '  <span class="mi-ico" aria-hidden="true">🔴</span>' +
      '  <span class="mi-txt"><b class="ms-red">레드라이트 모드</b><small>암순응 보호 · 붉은 화면으로 전환</small></span>' +
      '</button>' +
      '<button type="button" class="more-item" data-trigger="btnShareTop" role="menuitem">' +
      '  <span class="mi-ico" aria-hidden="true">🔗</span>' +
      '  <span class="mi-txt"><b>오늘 밤 플랜 공유</b><small>카카오톡·문자에 복사</small></span>' +
      '</button>' +
      '<div class="more-fs" role="group" aria-label="글자 크기">' +
      '  <span>글자 크기</span>' +
      '  <button type="button" data-trigger="fsDown" aria-label="글자 작게">A−</button>' +
      '  <button type="button" data-trigger="fsUp" aria-label="글자 크게">A+</button>' +
      '</div>';
    // 상단 바가 없어진 만큼 레드라이트·공유는 메뉴 위쪽(화면 버전 다음)에 둡니다.
    menu.insertBefore(scr, menu.children[1] || null);

    var syncRed = function () {
      var on = document.body.classList.contains('red');
      var lb = scr.querySelector('.ms-red');
      if (lb) lb.textContent = on ? '레드라이트 모드 끄기' : '레드라이트 모드 켜기';
    };
    scr.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-trigger]');
      if (!b) return;
      var id = b.getAttribute('data-trigger');
      var target = document.getElementById(id);
      if (target) target.click();
      if (id === 'btnRed' || id === 'btnShareTop') {
        if (btnMoreM) btnMoreM.setAttribute('aria-expanded', 'false');
        menu.hidden = true;
        if (moreTabM) moreTabM.setAttribute('aria-expanded', 'false');
      }
      syncRed();
    });
    syncRed();
    // 저장된 레드라이트 상태는 app.js가 화면 초기화 때 적용하므로, 로드가 끝난 뒤와
    // 레드 버튼을 누를 때마다 메뉴 문구를 실제 상태에 맞춥니다.
    window.addEventListener('load', function () { setTimeout(syncRed, 80); });
    document.addEventListener('click', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('#btnRed')) setTimeout(syncRed, 0);
    }, true);
  }

  /* 5) 인쇄할 때는 지금 판 이름을 남깁니다 -------------------------------- */
  document.body.setAttribute('data-version', me.label);

  /* 6) 하단 탭 바 — ☰ 더보기 연결 + 현재 섹션 강조 ------------------------- */
  var tabBar = document.getElementById('tabBar');
  if (tabBar) {
    var moreTab = document.getElementById('tabMore');
    var btnMore = document.getElementById('btnMore');
    if (moreTab && btnMore) {
      moreTab.addEventListener('click', function () { btnMore.click(); });
      // 메뉴가 열리고 닫힐 때 탭의 aria-expanded 도 함께 맞춥니다
      var syncMore = function () {
        moreTab.setAttribute('aria-expanded', btnMore.getAttribute('aria-expanded') === 'true' ? 'true' : 'false');
      };
      if (window.MutationObserver) {
        new MutationObserver(syncMore).observe(btnMore, { attributes: true, attributeFilter: ['aria-expanded'] });
      }
      syncMore();
    }
    var nav = document.getElementById('mainNav');
    var items = Array.prototype.slice.call(tabBar.querySelectorAll('[data-nav]'));
    var syncTabs = function () {
      var act = nav ? nav.querySelector('.nav-link.is-active') : null;
      var key = act ? act.getAttribute('data-nav') : null;
      items.forEach(function (it) { it.classList.toggle('is-active', it.getAttribute('data-nav') === key); });
      if (moreTab) moreTab.setAttribute('aria-expanded', btnMore && btnMore.getAttribute('aria-expanded') === 'true' ? 'true' : 'false');
    };
    if (nav && window.MutationObserver) {
      new MutationObserver(syncTabs).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('hashchange', function () { setTimeout(syncTabs, 60); });
    syncTabs();
  }
})();
