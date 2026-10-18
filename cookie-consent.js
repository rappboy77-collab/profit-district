/* ═══════════════════════════════════════
   COOKIE CONSENT + GOOGLE TAG MANAGER + META PIXEL
   Încărcat sus în <head> pe toate paginile.
   GTM și pixelul Meta pornesc doar după acordul
   pentru cookies de marketing.
════════════════════════════════════════ */
(function () {
  var CONSENT_KEY = 'pd_cookie_consent';
  var GTM_ID = 'GTM-56C8N9K7';
  var META_PIXEL_ID = '1137498052083068';
  var marketingLoaded = false;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  function readConsent() {
    try { return JSON.parse(localStorage.getItem(CONSENT_KEY)); } catch (e) { return null; }
  }

  function applyConsent(c) {
    gtag('consent', 'update', {
      analytics_storage: c.analytics ? 'granted' : 'denied',
      ad_storage: c.marketing ? 'granted' : 'denied',
      ad_user_data: c.marketing ? 'granted' : 'denied',
      ad_personalization: c.marketing ? 'granted' : 'denied'
    });
    if (c.marketing) loadMarketing();
  }

  function loadMarketing() {
    if (marketingLoaded) return;
    marketingLoaded = true;
    loadGTM();
    loadMetaPixel();
  }

  function loadGTM() {
    /* Google Tag Manager */
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer',GTM_ID);
    /* End Google Tag Manager */
  }

  function loadMetaPixel() {
    /* Meta Pixel Code */
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', META_PIXEL_ID);
    fbq('track', 'PageView');
    /* End Meta Pixel Code */
  }

  gtag('consent', 'default', {
    analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'
  });

  var stored = readConsent();
  /* Consimțămintele vechi (dinainte de categoria Marketing) nu au câmpul „marketing” — cerem din nou acordul. */
  var hasValidConsent = stored && typeof stored.marketing === 'boolean';
  if (hasValidConsent) applyConsent(stored);

  /* ── Banner + modal ─────────────────────── */
  var CSS =
    '#cookie-banner{position:fixed;bottom:0;left:0;right:0;z-index:9000;background:rgba(17,17,19,0.97);border-top:1px solid rgba(201,168,76,0.22);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);padding:1.1rem 2rem;display:flex;align-items:center;justify-content:space-between;gap:1.25rem;flex-wrap:wrap;transform:translateY(110%);transition:transform .45s cubic-bezier(0.16,1,0.3,1)}' +
    '#cookie-banner.visible{transform:translateY(0)}' +
    '@media (max-width:620px){#cookie-banner{padding:1rem 1rem}}' +
    '.cookie-text{flex:1;min-width:200px;font-family:"Outfit",sans-serif;font-weight:300;font-size:.8rem;color:#a09880;line-height:1.6;margin:0}' +
    '.cookie-text a{color:#c9a84c;text-decoration:none}' +
    '.cookie-text a:hover{text-decoration:underline}' +
    '.cookie-actions{display:flex;gap:.5rem;flex-wrap:wrap;flex-shrink:0}' +
    '.cookie-btn{font-family:"Outfit",sans-serif;font-size:.78rem;font-weight:500;padding:.48rem .95rem;border-radius:4px;cursor:pointer;border:1px solid transparent;transition:background .2s ease,color .2s ease,border-color .2s ease,transform .15s ease;white-space:nowrap}' +
    '.cookie-btn:focus-visible{outline:2px solid #c9a84c;outline-offset:2px}' +
    '.cookie-btn:active{transform:scale(0.97)}' +
    '.cookie-btn-accept{background:#c9a84c;color:#0a0a0b}' +
    '.cookie-btn-accept:hover{background:#e2bf6a}' +
    '.cookie-btn-refuse{background:transparent;color:#a09880;border-color:rgba(201,168,76,0.22)}' +
    '.cookie-btn-refuse:hover{color:#f0ece0;border-color:rgba(201,168,76,0.45)}' +
    '.cookie-btn-customize{background:transparent;color:#5c5848;border-color:transparent;text-decoration:underline;font-weight:300}' +
    '.cookie-btn-customize:hover{color:#a09880}' +
    '#cookie-modal{display:none;position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,0.72);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:1.5rem}' +
    '#cookie-modal.open{display:flex}' +
    '.cookie-modal-box{background:#18181b;border:1px solid rgba(201,168,76,0.22);border-radius:10px;padding:2rem;max-width:460px;width:100%;max-height:100%;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.65)}' +
    '.cookie-modal-title{font-family:"Syne","Outfit",sans-serif;font-weight:700;font-size:1.1rem;color:#f0ece0;margin:0 0 .5rem}' +
    '.cookie-modal-sub{font-family:"Outfit",sans-serif;font-weight:300;font-size:.8rem;color:#5c5848;margin:0 0 1.25rem;line-height:1.6}' +
    '.cookie-toggle-row{display:flex;justify-content:space-between;align-items:center;padding:.875rem 0;border-top:1px solid rgba(201,168,76,0.10);gap:1rem}' +
    '.cookie-toggle-info h4{font-family:"Outfit",sans-serif;font-weight:500;font-size:.85rem;color:#f0ece0;margin:0 0 .15rem}' +
    '.cookie-toggle-info p{font-family:"Outfit",sans-serif;font-weight:300;font-size:.73rem;color:#5c5848;line-height:1.5;margin:0}' +
    '.cookie-toggle{position:relative;width:40px;height:22px;flex-shrink:0}' +
    '.cookie-toggle input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:1}' +
    '.cookie-toggle input:disabled{cursor:not-allowed}' +
    '.cookie-toggle-slider{position:absolute;inset:0;background:#1f1f23;border:1px solid rgba(201,168,76,0.22);border-radius:11px;transition:background .2s ease}' +
    '.cookie-toggle-slider::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;background:#5c5848;border-radius:50%;transition:transform .2s ease,background .2s ease}' +
    '.cookie-toggle input:checked+.cookie-toggle-slider{background:#c9a84c;border-color:#c9a84c}' +
    '.cookie-toggle input:checked+.cookie-toggle-slider::after{transform:translateX(18px);background:#0a0a0b}' +
    '.cookie-toggle input:disabled+.cookie-toggle-slider{opacity:.55}' +
    '.cookie-toggle input:focus-visible+.cookie-toggle-slider{outline:2px solid #c9a84c;outline-offset:2px}' +
    '.cookie-modal-actions{display:flex;gap:.6rem;margin-top:1.5rem;flex-wrap:wrap}';

  var HTML =
    '<div id="cookie-banner" role="region" aria-label="Consimțământ cookies">' +
      '<p class="cookie-text">Folosim cookies esențiale pentru funcționarea site-ului. Cu acordul tău, folosim și cookies analitice și de marketing (Google, Meta) pentru a măsura vizitele și reclamele. ' +
      '<a href="politica-cookies.html">Politica Cookies</a> &nbsp;·&nbsp; <a href="politica-confidentialitate.html">Confidențialitate</a></p>' +
      '<div class="cookie-actions">' +
        '<button type="button" class="cookie-btn cookie-btn-accept" id="cookie-accept">Accept toate</button>' +
        '<button type="button" class="cookie-btn cookie-btn-refuse" id="cookie-refuse">Refuz</button>' +
        '<button type="button" class="cookie-btn cookie-btn-customize" id="cookie-customize">Personalizează</button>' +
      '</div>' +
    '</div>' +
    '<div id="cookie-modal" role="dialog" aria-modal="true" aria-labelledby="cookie-modal-title">' +
      '<div class="cookie-modal-box">' +
        '<p class="cookie-modal-title" id="cookie-modal-title">Setări Cookies</p>' +
        '<p class="cookie-modal-sub">Alege ce categorii de cookies accepți. Cookies esențiale nu pot fi dezactivate — sunt necesare pentru funcționarea site-ului.</p>' +
        '<div class="cookie-toggle-row"><div class="cookie-toggle-info"><h4>Esențiale</h4><p>Necesare pentru funcționarea site-ului. Nu pot fi dezactivate.</p></div>' +
          '<label class="cookie-toggle"><input type="checkbox" checked disabled aria-label="Cookies esențiale"><span class="cookie-toggle-slider"></span></label></div>' +
        '<div class="cookie-toggle-row"><div class="cookie-toggle-info"><h4>Analitice</h4><p>Ne ajută să înțelegem cum este utilizat site-ul (ex: Google Analytics).</p></div>' +
          '<label class="cookie-toggle"><input type="checkbox" id="cookie-analytics" aria-label="Cookies analitice"><span class="cookie-toggle-slider"></span></label></div>' +
        '<div class="cookie-toggle-row"><div class="cookie-toggle-info"><h4>Marketing</h4><p>Măsoară eficiența reclamelor noastre pe Facebook și Instagram (Meta Pixel, Google Tag Manager).</p></div>' +
          '<label class="cookie-toggle"><input type="checkbox" id="cookie-marketing" aria-label="Cookies de marketing"><span class="cookie-toggle-slider"></span></label></div>' +
        '<div class="cookie-modal-actions">' +
          '<button type="button" class="cookie-btn cookie-btn-accept" id="cookie-save-pref">Salvează preferințele</button>' +
          '<button type="button" class="cookie-btn cookie-btn-refuse" id="cookie-modal-close">Închide</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  function initBanner() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    var wrap = document.createElement('div');
    wrap.innerHTML = HTML;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

    var banner = document.getElementById('cookie-banner');
    var modal = document.getElementById('cookie-modal');
    var analyticsBox = document.getElementById('cookie-analytics');
    var marketingBox = document.getElementById('cookie-marketing');

    function saveConsent(analytics, marketing) {
      var c = { analytics: !!analytics, marketing: !!marketing, ts: new Date().toISOString() };
      try { localStorage.setItem(CONSENT_KEY, JSON.stringify(c)); } catch (e) {}
      /* GTM și pixelul nu pot fi descărcate din pagină — la retragerea acordului reîncărcăm pagina fără ele. */
      if (marketingLoaded && !c.marketing) { window.location.reload(); return; }
      applyConsent(c);
      banner.classList.remove('visible');
      modal.classList.remove('open');
    }

    function openSettings() {
      var c = readConsent() || {};
      analyticsBox.checked = !!c.analytics;
      marketingBox.checked = !!c.marketing;
      modal.classList.add('open');
    }
    window.pdOpenCookieSettings = openSettings;

    document.getElementById('cookie-accept').addEventListener('click', function () { saveConsent(true, true); });
    document.getElementById('cookie-refuse').addEventListener('click', function () { saveConsent(false, false); });
    document.getElementById('cookie-customize').addEventListener('click', openSettings);
    document.getElementById('cookie-save-pref').addEventListener('click', function () {
      saveConsent(analyticsBox.checked, marketingBox.checked);
    });
    document.getElementById('cookie-modal-close').addEventListener('click', function () { modal.classList.remove('open'); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.remove('open'); });

    if (!hasValidConsent) {
      setTimeout(function () { banner.classList.add('visible'); }, 900);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBanner);
  else initBanner();
})();
