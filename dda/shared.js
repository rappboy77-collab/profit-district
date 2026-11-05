(function () {
  var D = window.DDA;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function portrait(sp, cls) {
    var box = el('div', 'portrait ' + cls);
    if (sp.photo) {
      var img = el('img');
      img.src = sp.photo;
      img.alt = sp.photoAlt || sp.name;
      img.loading = 'lazy';
      box.appendChild(img);
    } else {
      var initials = el('span', 'portrait-empty', sp.name.split(/\s+/).map(function (w) { return w.charAt(0); }).join(''));
      initials.setAttribute('aria-hidden', 'true');
      box.appendChild(initials);
    }
    return box;
  }

  /* Căsuța de acces */
  var book = document.getElementById('book');
  var unset = [];
  book.innerHTML =
    '<div class="book-top"><span>ACCES LA EVENIMENT</span><span>29.11.2026</span></div>' +
    '<button type="button" class="book-close" aria-label="Închide"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
    '<p class="book-price">10<span>€</span></p><p class="book-sub">PREȚ / PERSOANĂ</p>' +
    '<ul class="book-list"><li>Acces la prezentările evenimentului</li><li>Sesiuni de întrebări și răspunsuri</li><li>Networking cu participanții</li><li>Coffee break și gustări</li></ul>' +
    '<label class="book-consent"><input type="checkbox"><span>Sunt de acord cu prelucrarea datelor mele personale conform <span data-privacy></span> și sunt de acord să fiu filmat(ă) și fotografiat(ă) în timpul evenimentului, iar materialele să fie folosite de Profit District în scop promoțional.</span></label>' +
    '<div data-cta></div>';

  var privacySlot = book.querySelector('[data-privacy]');
  if (D.links.privacy) {
    var pl = el('a', '', 'Politicii de Confidențialitate');
    pl.href = D.links.privacy;
    pl.target = '_blank';
    pl.rel = 'noopener';
    privacySlot.appendChild(pl);
  } else {
    privacySlot.appendChild(el('span', 'book-unset', 'Politicii de Confidențialitate'));
    unset.push('linkul politicii');
  }

  var consent = book.querySelector('input');
  var consentBox = book.querySelector('.book-consent');
  var cta;
  var hint = el('p', 'book-hint', 'Bifează căsuța de mai sus ca să continui.');
  hint.hidden = true;
  hint.setAttribute('role', 'status');
  consentBox.parentNode.insertBefore(hint, consentBox.nextSibling);
  if (D.links.checkout) {
    cta = el('a', 'btn', 'Rezervă-ți locul');
    cta.href = D.links.checkout;
    cta.target = '_blank';
    cta.rel = 'noopener noreferrer';
    cta.addEventListener('click', function (e) {
      if (consent.checked) {
        if (typeof window.fbq === 'function') {
          window.fbq('track', 'InitiateCheckout', { value: 10, currency: 'EUR', content_name: 'Dincolo de aparențe', num_items: 1 });
        }
        return;
      }
      e.preventDefault();
      consentBox.classList.add('err');
      hint.hidden = false;
      consent.focus();
    });
    consent.addEventListener('change', function () {
      consentBox.classList.remove('err');
      hint.hidden = true;
    });
  } else {
    cta = el('button', 'btn', 'Rezervă-ți locul');
    cta.type = 'button';
    cta.disabled = true;
    unset.unshift('linkul de checkout');
  }
  book.querySelector('[data-cta]').appendChild(cta);
  if (unset.length) book.appendChild(el('p', 'book-config', 'Neconfigurat: ' + unset.join(', ') + '.'));

  /* Pe desktop e card fix, pe mobil panou deschis din bara de jos */
  var backdrop = document.getElementById('book-backdrop');
  var mobile = window.matchMedia('(max-width: 1179px)');
  var returnTo = null;

  function isOpen() { return book.classList.contains('open'); }
  function syncMode() {
    if (mobile.matches) {
      book.setAttribute('role', 'dialog');
      book.setAttribute('aria-modal', 'true');
    } else {
      book.removeAttribute('role');
      book.removeAttribute('aria-modal');
      if (isOpen()) closeBook();
    }
  }
  function openBook() {
    if (!mobile.matches) {
      book.classList.remove('pulse');
      void book.offsetWidth;
      book.classList.add('pulse');
      consent.focus();
      return;
    }
    returnTo = document.activeElement;
    book.classList.add('open');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    book.querySelector('.book-close').focus();
  }
  function closeBook() {
    book.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
    if (returnTo) returnTo.focus();
  }
  document.querySelectorAll('[data-open-book]').forEach(function (b) { b.addEventListener('click', openBook); });
  book.querySelector('.book-close').addEventListener('click', closeBook);
  backdrop.addEventListener('click', closeBook);
  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') { closeBook(); return; }
    if (e.key !== 'Tab') return;
    var f = book.querySelectorAll('a[href], button:not([disabled]), input');
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  mobile.addEventListener('change', syncMode);
  syncMode();

  /* Program */
  var prog = document.getElementById('program');
  if (prog) {
    if (D.program.schedule.length) {
      var table = el('table', 'schedule');
      var head = el('thead');
      var hr = el('tr');
      ['Ora', 'Invitat', 'Sesiune'].forEach(function (h) { var th = el('th', '', h); th.scope = 'col'; hr.appendChild(th); });
      head.appendChild(hr);
      table.appendChild(head);
      var body = el('tbody');
      D.program.schedule.forEach(function (row) {
        var tr = el('tr', row.pause ? 'is-pause' : '');
        tr.appendChild(el('td', 'schedule-time', row.time));
        var guest = el('td', 'schedule-guest');
        guest.appendChild(el('strong', '', row.guest));
        if (row.role) guest.appendChild(el('span', '', row.role));
        tr.appendChild(guest);
        var session = el('td', 'schedule-session');
        if (row.title) session.appendChild(el('strong', '', row.title));
        if (row.text) session.appendChild(el('span', '', row.text));
        tr.appendChild(session);
        body.appendChild(tr);
      });
      table.appendChild(body);
      prog.appendChild(table);
    } else {
      prog.appendChild(el('p', 'program-start', D.program.intro[0]));
      prog.appendChild(el('p', 'program-note', D.program.intro[1]));
    }
    if (D.program.themes.length) {
      var themes = el('ul', 'themes');
      D.program.themes.forEach(function (t) {
        var li = el('li');
        li.appendChild(el('strong', '', t.title));
        li.appendChild(el('span', '', t.text));
        themes.appendChild(li);
      });
      prog.appendChild(themes);
    }
  }

  /* Preview speakeri */
  var prev = document.getElementById('speaker-preview');
  if (prev) {
    D.speakers.forEach(function (sp) {
      var li = el('li', 'preview');
      li.appendChild(portrait(sp, 'preview-photo'));
      li.appendChild(el('p', 'preview-name', sp.name));
      if (sp.role) li.appendChild(el('p', 'preview-role', sp.role));
      if (sp.topic) li.appendChild(el('p', 'preview-topic', sp.topic));
      if (sp.bio) li.appendChild(el('p', 'preview-bio', sp.bio));
      prev.appendChild(li);
    });
  }

  /* Profiluri speakeri */
  var list = document.getElementById('speakers');
  if (list) {
    D.speakers.forEach(function (sp) {
      var card = el('article', 'speaker');
      card.appendChild(portrait(sp, 'speaker-photo'));
      var body = el('div', 'speaker-body');
      body.appendChild(el('h2', 'speaker-name', sp.name));
      if (sp.role) body.appendChild(el('p', 'speaker-role', sp.role));
      if (sp.topic) body.appendChild(el('p', 'speaker-topic', sp.topic));
      if (sp.bio) body.appendChild(el('p', 'speaker-bio', sp.bio));
      card.appendChild(body);
      list.appendChild(card);
    });

    if (window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) {
      list.addEventListener('pointermove', function (e) {
        var card = e.target.closest('.speaker');
        if (!card) return;
        var r = card.getBoundingClientRect();
        card.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 7).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((0.5 - (e.clientY - r.top) / r.height) * 7).toFixed(2) + 'deg');
      });
      list.addEventListener('pointerout', function (e) {
        var card = e.target.closest('.speaker');
        if (card && !card.contains(e.relatedTarget)) {
          card.style.removeProperty('--rx');
          card.style.removeProperty('--ry');
        }
      });
    }
  }

  /* Broker */
  var broker = document.getElementById('broker');
  if (broker) {
    broker.querySelector('h2').textContent = D.broker.title;
    if (D.broker.text) broker.querySelector('[data-broker-text]').textContent = D.broker.text;
    if (D.broker.image) {
      var bi = el('img');
      bi.src = D.broker.image;
      bi.alt = D.broker.imageAlt || '';
      var slot = broker.querySelector('[data-broker-visual]');
      slot.innerHTML = '';
      slot.appendChild(bi);
    }
  }
})();
