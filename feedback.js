/* =========================================================================
   feedback.js — 💬 사용자 피드백 (2026-11-27)
   · 카테고리(버그 제보 / 기능 제안 / 칭찬·기타) + 내용 + 화면 상황 + 연락처(선택)
   · FORMSPREE_ENDPOINT 가 설정되어 있으면 실제로 전송합니다.
   · 아직 비어 있으면 '보낸 척'하지 않고, 이 기기에만 임시 저장한 뒤
     복사·내보내기 버튼을 드립니다. (코드에 어떤 이메일 주소도 넣지 않습니다)
   ========================================================================= */
(function () {
  'use strict';

  // 접수 창구 주소. Formspree 폼을 만든 뒤 아래에 'https://formspree.io/f/코드'를 넣으면
  // 그때부터 실제 전송으로 바뀝니다. 비어 있으면 이 기기 저장만 합니다.
  var FORMSPREE_ENDPOINT = 'https://formspree.io/f/xeagdddj';

  var STORE_KEY = 'ob.feedback.queue';
  var MAX_LOCAL = 50;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var SCREEN_KO = {
    today: '오늘 밤', live: '라이브 하늘', skymap: '전천 지도', catalog: '도감',
    spacearchive: '관측 자료관', calendar: '관측 일정', sites: '관측 명소', lab: '계산기',
    guide: '가이드', science: '원리', learn: '천문 학습관', news: '우주·천문 뉴스', plan: '체크리스트'
  };
  var CATS = [['bug', '🐞 버그 제보'], ['idea', '💡 기능 제안'], ['praise', '👏 칭찬·기타']];

  var FB = { cat: 'bug', busy: false };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function nowText() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function currentScreen() {
    var id = document.documentElement.getAttribute('data-screen') || document.body.getAttribute('data-screen') || '';
    return { id: id, label: SCREEN_KO[id] || '첫 화면' };
  }

  function loadQueue() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveQueue(arr) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(arr.slice(-MAX_LOCAL))); } catch (e) { }
  }

  function build() {
    var d = document.createElement('div');
    d.className = 'space-drawer fb-drawer';
    d.id = 'feedbackDrawer';
    d.hidden = true;
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-labelledby', 'fbTitle');
    d.innerHTML =
      '<div class="sd-backdrop" data-fb-close="1"></div>' +
      '<div class="sd-panel fb-panel">' +
      '  <header class="sd-head">' +
      '    <div><p class="sd-eyebrow">별너울 의견함</p><h3 id="fbTitle">💬 사용자 피드백</h3></div>' +
      '    <button class="sd-close" type="button" data-fb-close="1" aria-label="닫기">×</button>' +
      '  </header>' +
      '  <div class="fb-body" id="fbBody">' +
      '    <p class="fb-intro">불편한 점이나 있었으면 하는 기능을 알려 주세요. 지금 보고 있는 화면이 함께 전달되어 더 정확히 살펴볼 수 있습니다.</p>' +
      '    <div class="chip-row fb-cats" role="group" aria-label="피드백 종류">' +
             CATS.map(function (c, i) {
               return '<button type="button" class="chip' + (i === 0 ? ' is-active' : '') + '" data-fb-cat="' + c[0] + '">' + c[1] + '</button>';
             }).join('') +
      '    </div>' +
      '    <label class="fb-field" for="fbText"><span>내용 <b>필수</b></span>' +
      '      <textarea id="fbText" rows="6" maxlength="2000" placeholder="예) 관측 명소에서 제주를 고르면 목록이 비어 보여요. / 다음에는 달 위상 달력을 넣어 주세요."></textarea>' +
      '      <small id="fbCount">0 / 2000</small></label>' +
      '    <label class="fb-field" for="fbContext"><span>참고할 상황 <em>선택</em></span>' +
      '      <input id="fbContext" type="text" maxlength="200" placeholder="덧붙이고 싶은 상황이 있으면 적어 주세요"></label>' +
      '    <label class="fb-field" for="fbContact"><span>회신받을 연락처 <em>선택</em></span>' +
      '      <input id="fbContact" type="text" maxlength="120" placeholder="이메일이나 연락처 (답변을 원할 때만)"></label>' +
      '    <p class="fb-privacy">연락처를 적으면 답변을 위해 접수 창구로 함께 전달됩니다. 적지 않아도 괜찮습니다.</p>' +
      '    <div class="fb-actions">' +
      '      <button type="button" class="btn btn-primary" id="fbSend">의견 보내기</button>' +
      '      <button type="button" class="btn btn-ghost" data-fb-close="1">닫기</button>' +
      '    </div>' +
      '    <div class="fb-status" id="fbStatus" role="status" aria-live="polite"></div>' +
      '    <div class="fb-saved" id="fbSaved" hidden></div>' +
      '    <p class="fb-foot" id="fbFoot"></p>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(d);

    var body = d;
    body.addEventListener('click', function (e) {
      if (e.target.closest('[data-fb-close]')) { close(); return; }
      var chip = e.target.closest('[data-fb-cat]');
      if (chip) {
        FB.cat = chip.getAttribute('data-fb-cat');
        $$('[data-fb-cat]', d).forEach(function (x) { x.classList.toggle('is-active', x === chip); });
        return;
      }
      if (e.target.closest('#fbSend')) { send(); return; }
      if (e.target.closest('[data-fb-copy]')) { copySaved(); return; }
      if (e.target.closest('[data-fb-resend]')) { resendSaved(); return; }
      if (e.target.closest('[data-fb-export]')) { exportSaved(); return; }
    });

    var ta = $('#fbText', d);
    ta.addEventListener('input', function () {
      $('#fbCount').textContent = ta.value.length + ' / 2000';
      if (ta.value.trim()) ta.classList.remove('is-invalid');
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    updateFoot();
  }

  function updateFoot() {
    var foot = $('#fbFoot');
    if (!foot) return;
    var n = loadQueue().length;
    foot.textContent = (FORMSPREE_ENDPOINT
      ? '보낸 의견은 접수 창구로 전달됩니다.'
      : '지금은 바로 보내지 못해, 보낸 의견을 이 기기에 남겨 둡니다.') +
      (n ? ' · 남겨 둔 의견 ' + n + '건' : '');
  }

  function payload() {
    var sc = currentScreen();
    var ctx = $('#fbContext');
    return {
      category: FB.cat,
      message: ($('#fbText').value || '').trim(),
      screen: sc.id || 'unknown',
      screen_label: sc.label,
      context: ((ctx && ctx.value) || '').trim(),
      contact: (($('#fbContact').value || '').trim()),
      page: location.origin + location.pathname + location.hash,
      user_agent: navigator.userAgent,
      at: nowText()
    };
  }

  function setStatus(kind, html) {
    var s = $('#fbStatus');
    if (!s) return;
    s.className = 'fb-status' + (kind ? ' is-' + kind : '');
    s.innerHTML = html;
  }

  function send() {
    if (FB.busy) return;
    var p = payload();
    if (p.message.length < 5) {
      setStatus('error', '내용을 5자 이상 적어 주세요. 어떤 화면에서 무엇이 불편했는지 적어 주시면 큰 도움이 됩니다.');
      var ta = $('#fbText');
      if (ta) { ta.classList.add('is-invalid'); ta.focus(); }
      return;
    }
    if (!FORMSPREE_ENDPOINT) {
      storeLocal(p);
      setStatus('saved', '<b>지금은 바로 보내지 못해, 적어 주신 내용을 이 기기에 남겨 두었습니다.</b><br>' +
        '보낸 내용은 이 기기 밖으로 나가지 않았습니다. 아래에서 복사해 직접 전달하시거나, 잠시 뒤 다시 눌러 주세요.');
      return;
    }
    FB.busy = true;
    var btn = $('#fbSend');
    if (btn) { btn.disabled = true; btn.textContent = '보내는 중…'; }
    setStatus('', '의견을 보내고 있습니다…');
    fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json().catch(function () { return {}; });
    }).then(function () {
      setStatus('ok', '<b>의견이 접수되었습니다. 감사합니다!</b><br>적어 주신 화면과 상황을 함께 보내 드렸습니다.');
      var ta = $('#fbText'); if (ta) ta.value = '';
      var c = $('#fbCount'); if (c) c.textContent = '0 / 2000';
    }).catch(function () {
      storeLocal(p);
      setStatus('error', '<b>지금은 보내지 못했습니다.</b> 인터넷 연결을 확인한 뒤 다시 시도해 주세요.<br>' +
        '대신 적어 주신 내용을 이 기기에 남겨 두었습니다. 복사해 직접 전달하실 수 있습니다.');
    }).then(function () {
      FB.busy = false;
      if (btn) { btn.disabled = false; btn.textContent = '의견 보내기'; }
      showSaved();
      updateFoot();
    });
  }

  function storeLocal(p) {
    var arr = loadQueue();
    arr.push(p);
    saveQueue(arr);
    showSaved();
    updateFoot();
  }

  function showSaved() {
    var box = $('#fbSaved');
    if (!box) return;
    var arr = loadQueue();
    if (!arr.length) { box.hidden = true; return; }
    box.hidden = false;
    var last = arr[arr.length - 1];
    box.innerHTML = '<p class="fb-saved-title">이 기기에 남겨 둔 의견 ' + arr.length + '건 (최근: ' + esc(last.at) + ')</p>' +
      '<pre class="fb-saved-text">' + esc(formatOne(last)) + '</pre>' +
      '<div class="fb-saved-actions">' +
      (FORMSPREE_ENDPOINT ? '<button type="button" class="mini-btn" data-fb-resend="1">보관한 의견 다시 보내기</button>' : '') +
      '<button type="button" class="mini-btn" data-fb-copy="1">내용 복사</button>' +
      '<button type="button" class="mini-btn" data-fb-export="1">파일로 내보내기</button>' +
      '</div>';
  }

  function formatOne(p) {
    var cat = (CATS.filter(function (c) { return c[0] === p.category; })[0] || ['', '기타'])[1];
    return '[별너울 의견] ' + p.at + '\n' +
      '종류: ' + cat + '\n' +
      '화면: ' + (p.screen_label || p.screen) + (p.context ? ' · ' + p.context : '') + '\n' +
      '내용: ' + p.message + '\n' +
      (p.contact ? '연락처: ' + p.contact + '\n' : '') +
      '주소: ' + p.page;
  }

  function resendSaved() {
    var arr = loadQueue();
    if (!arr.length || !FORMSPREE_ENDPOINT) return;
    var btn = $('[data-fb-resend]');
    if (btn) { btn.disabled = true; btn.textContent = '보내는 중…'; }
    var sent = 0, failed = 0;
    var seq = Promise.resolve();
    arr.forEach(function (p) {
      seq = seq.then(function () {
        return fetch(FORMSPREE_ENDPOINT, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(p)
        }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          sent += 1;
          var q = loadQueue().filter(function (x) { return x.at !== p.at || x.message !== p.message; });
          saveQueue(q);
        }).catch(function () { failed += 1; });
      });
    });
    seq.then(function () {
      if (btn) { btn.disabled = false; btn.textContent = '보관한 의견 다시 보내기'; }
      if (sent && !failed) setStatus('ok', '보관해 둔 의견 ' + sent + '건을 모두 보냈습니다. 감사합니다!');
      else if (sent) setStatus('saved', sent + '건은 보냈고 ' + failed + '건은 아직 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
      else setStatus('error', '아직 보내지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요. (적은 내용은 그대로 남아 있습니다)');
      showSaved(); updateFoot();
    });
  }

  function copySaved() {
    var arr = loadQueue();
    if (!arr.length) return;
    var text = arr.map(formatOne).join('\n\n');
    var done = function () { setStatus('ok', '복사했습니다. 원하는 곳에 붙여넣어 주세요.'); };
    var fail = function () { setStatus('error', '복사가 막혔습니다. 아래 내용을 길게 눌러 직접 선택해 주세요.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fail);
    } else {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta); done();
      } catch (e) { fail(); }
    }
  }

  function exportSaved() {
    var arr = loadQueue();
    if (!arr.length) return;
    try {
      var text = arr.map(formatOne).join('\n\n');
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '별너울-의견-' + nowText().replace(/[: ]/g, '') + '.txt';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
      setStatus('ok', '파일로 내보냈습니다. 다운로드 폴더를 확인해 주세요.');
    } catch (e) {
      setStatus('error', '내보내기가 막혔습니다. 위의 내용 복사를 이용해 주세요.');
    }
  }

  function open() {
    var d = $('#feedbackDrawer');
    if (!d) { build(); d = $('#feedbackDrawer'); }
    d.hidden = false;
    document.body.classList.add('space-lock');
    var sc = currentScreen();
    var ctx = $('#fbContext');
    if (ctx && !ctx.value) ctx.value = sc.label + ' 화면';
    setStatus('', '');
    showSaved();
    updateFoot();
    var ta = $('#fbText');
    if (ta) setTimeout(function () { ta.focus(); }, 80);
  }

  function close() {
    var d = $('#feedbackDrawer');
    if (!d) return;
    d.hidden = true;
    document.body.classList.remove('space-lock');
  }

  window.Feedback = { open: open, close: close, endpoint: FORMSPREE_ENDPOINT };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
