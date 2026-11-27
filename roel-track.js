/* 로엘 법무법인 이혼 랜딩 — 방문 기록 + 상담 신청 전송
 * 구조는 지노블 파티 랜딩(gnoble-track.js)과 같다. 기록은 구글 Apps Script 「수집」 웹앱으로만 간다.
 * 방문 기록에는 IP·이름·연락처를 남기지 않는다. 날짜·경로·광고 이름·기기만 남긴다.
 */
(function () {
  // ▼ 구글 Apps Script 「수집」 웹앱 주소. 비어 있으면 상담 신청은 「접수 실패 + 전화 안내」로 끝난다.
  //   저장되지 않는 신청을 접수됐다고 보여 주지 않는다.
  var ENDPOINT = '';

  var LS = {
    get: function (s, k) { try { return window[s].getItem(k); } catch (e) { return null; } },
    set: function (s, k, v) { try { window[s].setItem(k, v); } catch (e) {} }
  };
  var q = new URLSearchParams(location.search);
  var g = function (k) { return (q.get(k) || '').slice(0, 100); };
  var refHost = '';
  try { refHost = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) {}

  // ---- 이번 방문의 유입 경로 ----
  var src = g('utm_source').toLowerCase(), med = g('utm_medium').toLowerCase();
  var camp = g('utm_campaign'), cont = g('utm_content'), term = g('utm_term') || g('n_keyword') || g('n_query');
  var paid = /^(cpc|ppc|paid|ad|ads|paid_?social|display|sa|da)$/.test(med);
  var ch;
  if (q.has('n_media') || q.has('NaPm') || q.has('n_ad_group')) { ch = '네이버 광고'; if (!camp) camp = g('n_campaign') || g('n_ad_group') || '네이버 자동 추적'; }
  else if (src && paid) {
    ch = /naver/.test(src) ? '네이버 광고' : /google|gdn|youtube/.test(src) ? '구글 광고'
       : /insta|facebook|meta|^ig$|^fb$/.test(src) ? '메타 광고 (인스타·페북)' : /kakao/.test(src) ? '카카오 광고' : src + ' 광고';
  }
  else if (q.has('gclid') || q.has('gbraid') || q.has('wbraid')) { ch = '구글 광고'; if (!camp) camp = '구글 자동 태그'; }
  else if (src) { ch = /insta|facebook|meta|kakao|threads|band/.test(src) ? 'SNS' : '링크 (' + src + ')'; }
  else if (!refHost) ch = '직접 접속';
  else if (/search\.naver\.com/.test(refHost)) ch = '네이버 검색';
  else if (/(^|\.)google\./.test(refHost)) ch = '구글 검색';
  else if (/daum\.net|bing\.com/.test(refHost)) ch = '다른 검색';
  else if (/blog\.naver|cafe\.naver/.test(refHost)) ch = '네이버 블로그·카페';
  else if (/chatgpt|openai|perplexity|gemini|copilot|claude\.ai/.test(refHost)) ch = 'AI 답변';
  else if (/instagram|facebook|kakao|threads|t\.co|x\.com|band\.us/.test(refHost)) ch = 'SNS';
  else if (/lawl/.test(refHost)) ch = '로엘 사이트';
  else ch = '다른 사이트';

  var touch = { ch: ch, src: src, camp: camp, cont: cont, term: term };
  // 직접 접속이 아니면 30일 동안 기억한다 → 나중에 다시 와서 신청해도 처음 광고가 남는다
  if (ch !== '직접 접속' && ch !== '로엘 사이트') LS.set('localStorage', 'rl_touch', JSON.stringify({ t: Date.now(), v: touch }));
  var saved = null;
  try { saved = JSON.parse(LS.get('localStorage', 'rl_touch') || 'null'); } catch (e) {}
  var credit = (saved && Date.now() - saved.t < 30 * 864e5) ? saved.v : touch;

  var vid = LS.get('sessionStorage', 'rl_vid');
  if (!vid) { vid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); LS.set('sessionStorage', 'rl_vid', vid); }
  var dev = /iPad|Tablet/i.test(navigator.userAgent) ? '태블릿' : /Mobi|Android|iPhone/i.test(navigator.userAgent) ? '휴대폰' : 'PC';

  function payload(type, extra) {
    var t = (type === 'apply' || (extra && /클릭/.test(extra.stage || ''))) ? credit : touch;
    var p = { type: type, vid: vid, page: location.pathname, ch: t.ch, src: t.src, camp: t.camp, cont: t.cont, term: t.term, ref: refHost, dev: dev };
    for (var k in extra) p[k] = extra[k];
    return JSON.stringify(p);
  }

  // text/plain 으로 보내야 브라우저가 사전 확인 요청 없이 바로 보낸다 (Apps Script 가 받는 방식)
  function send(type, extra) {
    if (!ENDPOINT) return Promise.resolve({ ok: false, error: 'no endpoint' });
    var body = payload(type, extra || {});
    if (type === 'apply') {
      return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, redirect: 'follow' })
        .then(function (r) { return r.json(); });
    }
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return Promise.resolve({ ok: true });
    } catch (e) {}
    return fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body })
      .then(function () { return { ok: true }; }, function () { return { ok: false }; });
  }

  // 같은 방문(탭) 안에서는 한 번씩만 남긴다
  function once(key, fn) { if (LS.get('sessionStorage', key)) return; LS.set('sessionStorage', key, '1'); fn(); }
  window.RL = { send: function (type, extra) {
    if (type === 'stage') { once('rl_st_' + extra.stage, function () { send('stage', extra); }); return Promise.resolve({ ok: true }); }
    return send(type, extra);
  } };

  once('rl_visit', function () { send('visit'); });

  // 전화·카카오 버튼 누름 → 「방문」 탭에 「전화 클릭」/「카카오 클릭」 + 버튼 자리. 같은 자리 10초 안 재클릭은 한 번만
  var SPOTS = [['#call-bar', '하단 고정 바'], ['.form-done', '신청 완료 화면'], ['#hero', '첫 화면'], ['#consult', '상담 신청 영역'],
    ['#faq', '자주 묻는 질문'], ['#terms', '동의 전문'], ['footer', '푸터'], ['header', '상단'], ['#quick-side', '오른쪽 빠른 메뉴']];
  var lastTap = {};
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="tel:"], a[href*="pf.kakao.com"]');
    if (!a) return;
    var kind = /^tel:/.test(a.getAttribute('href')) ? '전화 클릭' : '카카오 클릭';
    var spot = '본문';
    for (var i = 0; i < SPOTS.length; i++) if (a.closest(SPOTS[i][0])) { spot = SPOTS[i][1]; break; }
    var key = kind + spot;
    if (lastTap[key] && Date.now() - lastTap[key] < 10000) return;
    lastTap[key] = Date.now();
    send('stage', { stage: kind, spot: spot });
  }, true);

  var target = document.getElementById('consult-form');
  if (target && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { window.RL.send('stage', { stage: '상담 폼 도달' }); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(target);
  }
})();
