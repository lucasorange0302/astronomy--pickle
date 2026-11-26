/* =========================================================================
   별너울 — 홈 화면 설치(PWA) 연결
   · https/http 에서만 서비스 워커를 등록합니다(file:// 로 연 단일 파일판은 설치 개념이 없음).
   · ☰ 더보기 메뉴의 [📲 앱으로 설치] 버튼 하나로 세 갈래를 처리합니다.
       1) 이미 앱(standalone)으로 실행 중   → "앱으로 실행 중" 표시
       2) Chrome/Edge가 설치 프롬프트를 잡아 둔 경우 → 누르는 즉시 설치 창
       3) 그 외(iOS Safari·프롬프트 없는 브라우저)  → 기기별 설치 방법 안내 시트
   ========================================================================= */
(function () {
  'use strict';

  var isHttp = location.protocol === 'https:' || location.protocol === 'http:';
  var deferred = null;          // beforeinstallprompt 이벤트
  var installed = false;
  var sheet = null;
  var toastTimer = null;

  /* ---------------------------------------------------------- 작은 도우미 */
  function $(sel) { return document.querySelector(sel); }

  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }

  function isStandalone() {
    try {
      if (navigator.standalone === true) return true;                       // iOS 홈 화면
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
      if (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    } catch (e) { /* 구형 브라우저 */ }
    return false;
  }

  function platform() {
    var ua = navigator.userAgent || '';
    var iOS = /iPad|iPhone|iPod/.test(ua) ||
              (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
    if (iOS) return 'ios';
    if (/Android/.test(ua)) return /SamsungBrowser/.test(ua) ? 'samsung' : 'android';
    if (/Macintosh|Windows|Linux|CrOS/.test(ua)) return 'desktop';
    return 'other';
  }

  /* --------------------------------------------------- 서비스 워커 등록 */
  function registerWorker() {
    if (!isHttp) return;                                  // file:// 에서는 등록하지 않습니다
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function (reg) {
        // 새 워커가 대기하면 바로 넘겨받아, 다음 새로고침이 새 판을 쓰게 합니다.
        reg.addEventListener('updatefound', function () {
          var w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', function () {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              w.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      }).catch(function (err) {
        // 등록 실패(사생활 보호 모드·구형 브라우저)는 사이트 동작에 영향이 없습니다.
        if (window.console && console.info) console.info('[별너울] 오프라인 캐시를 켜지 못했습니다:', err && err.message);
      });
    });
  }

  /* ------------------------------------------------------- 버튼 상태 갱신 */
  function label(text, note) {
    var b = document.getElementById('pwaInstallLabel');
    var s = document.getElementById('pwaInstallNote');
    var badge = document.getElementById('pwaInstallBadge');
    var item = document.getElementById('btnInstall');
    if (b) b.textContent = text;
    if (s) s.textContent = note;
    if (badge) badge.hidden = !installed;
    if (item) {
      item.setAttribute('aria-label', text + ' — ' + note);
      item.classList.toggle('is-running', installed);
    }
  }

  function refresh() {
    var p = platform();
    if (installed || isStandalone()) {
      installed = true;
      label('앱으로 실행 중', '홈 화면에서 주소창 없이 열렸습니다');
      return;
    }
    if (deferred) {
      label('앱으로 설치', '지금 누르면 설치 창이 열립니다');
      return;
    }
    if (!isHttp) {
      label('앱으로 설치', '파일로 연 경우 설치는 https 주소에서');
      return;
    }
    if (p === 'ios') label('앱으로 설치', 'Safari 공유 → 홈 화면에 추가');
    else if (p === 'android') label('앱으로 설치', 'Chrome 메뉴 → 앱 설치');
    else if (p === 'samsung') label('앱으로 설치', '메뉴 → 페이지 추가 → 홈 화면');
    else label('앱으로 설치', '주소창 설치 아이콘 · 앱처럼 열기');
  }

  /* ------------------------------------------------------------ 안내 시트 */
  var STEPS = {
    ios: {
      title: 'Safari에서 홈 화면에 추가',
      lead: '아이폰·아이패드는 Safari의 공유 버튼으로 설치합니다. 설치하면 주소창 없이 앱처럼 열립니다.',
      steps: [
        'Safari로 <b>byeolneoul.vercel.app</b> 을 엽니다. (크롬·네이버 앱 안에서는 홈 화면 추가가 안 됩니다.)',
        '화면 아래(또는 위) 가운데의 <b>공유 버튼 □↑</b> 을 누릅니다.',
        '목록을 내려 <b>‘홈 화면에 추가’</b> 를 누릅니다.',
        '오른쪽 위 <b>‘추가’</b> 를 누르면 홈 화면에 <b>별너울</b> 아이콘이 생깁니다.'
      ]
    },
    android: {
      title: 'Chrome에서 앱으로 설치',
      lead: '설치하면 주소창 없이 전체 화면으로 열리고, 방문 기록 없이 바로 시작합니다.',
      steps: [
        'Chrome 오른쪽 위 <b>⋮</b> 메뉴를 누릅니다.',
        '<b>‘앱 설치’</b> 또는 <b>‘홈 화면에 추가’</b> 를 누릅니다.',
        '<b>‘설치’</b> 를 눌러 확인하면 앱 서랍과 홈 화면에 <b>별너울</b> 이 생깁니다.'
      ]
    },
    samsung: {
      title: '삼성 인터넷에서 홈 화면에 추가',
      lead: '삼성 인터넷은 메뉴의 ‘페이지 추가’로 설치합니다.',
      steps: [
        '오른쪽 아래 <b>≡</b> 메뉴를 누릅니다.',
        '<b>‘페이지 추가’ → ‘홈 화면’</b> 을 고릅니다.',
        '<b>‘추가’</b> 를 누르면 홈 화면에 <b>별너울</b> 아이콘이 생깁니다.'
      ]
    },
    desktop: {
      title: 'PC 브라우저에 앱으로 설치',
      lead: 'Chrome·Edge는 주소창의 설치 아이콘으로 앱처럼 띄울 수 있습니다.',
      steps: [
        '주소창 오른쪽의 <b>설치 아이콘</b>(모니터에 ↓) 또는 <b>⋮ → ‘저장 및 공유’ → ‘앱 설치’</b> 를 고릅니다.',
        '<b>‘설치’</b> 를 누르면 별도의 창으로 열립니다.',
        'Windows 시작 메뉴·macOS 런치패드에서도 실행할 수 있습니다.'
      ]
    },
    other: {
      title: '홈 화면에 추가',
      lead: '브라우저 메뉴에서 홈 화면 추가를 찾아 주세요.',
      steps: [
        '브라우저의 <b>메뉴</b>를 엽니다.',
        '<b>‘홈 화면에 추가’</b> 를 고릅니다.',
        '<b>‘추가’</b> 를 누르면 홈 화면에 <b>별너울</b> 아이콘이 생깁니다.'
      ]
    }
  };

  function buildSheet() {
    if (sheet) return sheet;
    var el = document.createElement('div');
    el.className = 'pwa-sheet';
    el.id = 'pwaSheet';
    el.hidden = true;
    el.innerHTML =
      '<div class="pwa-sheet-back" data-pwa-close></div>' +
      '<div class="pwa-sheet-card" role="dialog" aria-modal="true" aria-labelledby="pwaSheetTitle">' +
      '  <button type="button" class="pwa-sheet-x" data-pwa-close aria-label="닫기">×</button>' +
      '  <p class="pwa-sheet-kicker"><span aria-hidden="true">📲</span> 앱으로 설치</p>' +
      '  <h2 id="pwaSheetTitle">홈 화면에 별너울을 두세요</h2>' +
      '  <p class="pwa-sheet-lead" id="pwaSheetLead"></p>' +
      '  <ol class="pwa-steps" id="pwaSteps"></ol>' +
      '  <p class="pwa-sheet-foot">설치해도 즐겨찾기와 같습니다. 저장한 관측 기록은 이 기기에 그대로 남고, 앱을 지우면 함께 지워집니다.</p>' +
      '  <button type="button" class="btn btn-primary btn-block" data-pwa-close>알겠습니다</button>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-pwa-close]')) hideSheet();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.hidden) hideSheet();
    });
    sheet = el;
    return el;
  }

  function showSheet(kind) {
    var data = STEPS[kind] || STEPS.other;
    var el = buildSheet();
    el.querySelector('#pwaSheetTitle').textContent = data.title;
    el.querySelector('#pwaSheetLead').innerHTML = data.lead;
    el.querySelector('#pwaSteps').innerHTML = data.steps.map(function (s) {
      return '<li>' + s + '</li>';
    }).join('');
    el.hidden = false;
    document.body.classList.add('pwa-sheet-open');
    var first = el.querySelector('[data-pwa-close]');
    if (first && first.focus) first.focus();
  }

  function hideSheet() {
    if (!sheet) return;
    sheet.hidden = true;
    document.body.classList.remove('pwa-sheet-open');
    var item = document.getElementById('btnInstall');
    if (item && item.focus) item.focus();
  }

  /* -------------------------------------------------------------- 버튼 동작 */
  function onInstallClick() {
    if (installed || isStandalone()) {
      toast('이미 앱으로 실행 중입니다 — 주소창 없는 화면입니다.');
      return;
    }
    if (!isHttp) {
      toast('파일로 열었습니다. 설치하려면 https 주소(byeolneoul.vercel.app)로 여세요.');
      return;
    }
    if (deferred) {
      var ev = deferred;
      deferred = null;
      try {
        ev.prompt();
        if (ev.userChoice && ev.userChoice.then) {
          ev.userChoice.then(function (choice) {
            if (choice && choice.outcome === 'accepted') {
              installed = true;
              refresh();
              toast('설치를 시작했습니다. 홈 화면의 별너울 아이콘으로 열 수 있습니다.');
            } else {
              refresh();
              toast('설치를 취소했습니다. 언제든 ☰ 더보기 → 앱으로 설치로 다시 할 수 있습니다.');
            }
          }).catch(function () { refresh(); });
        }
      } catch (e) {
        refresh();
        showSheet(platform());
      }
      return;
    }
    // 프롬프트를 잡아 두지 못한 브라우저 → 기기별 안내
    showSheet(platform());
  }

  function bind() {
    var item = document.getElementById('btnInstall');
    if (!item) return;
    item.addEventListener('click', function (e) {
      e.preventDefault();
      onInstallClick();
    });
    refresh();
  }

  /* --------------------------------------------------------------- 이벤트 */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();               // 자동 미니 배너 대신 우리 버튼에서 띄웁니다
    deferred = e;
    refresh();
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    installed = true;
    refresh();
    toast('별너울을 설치했습니다. 홈 화면에서 바로 열 수 있습니다.');
  });

  try {
    var mq = window.matchMedia('(display-mode: standalone)');
    if (mq && mq.addEventListener) mq.addEventListener('change', function () { installed = isStandalone(); refresh(); });
  } catch (e) { /* 구형 브라우저 */ }

  registerWorker();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  // layout.js 가 메뉴에 그룹을 더 넣은 뒤에도 상태를 다시 맞춥니다.
  window.addEventListener('load', function () { setTimeout(refresh, 300); });

  window.ByeolneoulPWA = {
    isStandalone: isStandalone,
    isInstalled: function () { return installed; },
    hasPrompt: function () { return !!deferred; },
    platform: platform,
    showGuide: function (kind) { showSheet(kind || platform()); },
    refresh: refresh
  };
})();
