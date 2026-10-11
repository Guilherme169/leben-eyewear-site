/* ════════════════════════════════════════════════════════════
   LEBEN — utilidades compartilhadas (home e catálogo)
   1. Métricas: visitas (Vercel Web Analytics) + eventos (cliques no
      WhatsApp, catálogo, PDF, seleção enviada, visita agendada…)
   2. "Agendar visita da mala": janela com 4 campos → WhatsApp
   ════════════════════════════════════════════════════════════ */
(function () {
  var WA = '5551920038264';

  /* Google Analytics 4 (opcional): cole aqui o ID "G-XXXXXXXXXX" para
     registrar os eventos também no GA4. Vazio = desligado. */
  var GA_ID = '';

  /* ── métricas ── */
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  if (GA_ID) {
    var g = document.createElement('script');
    g.async = true; g.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(g);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date()); window.gtag('config', GA_ID);
  }
  window.lebenTrack = function (name, data) {
    data = data || {};
    try { window.va('event', { name: name, data: data }); } catch (e) {}
    try { if (window.gtag) window.gtag('event', name, data); } catch (e) {}
  };
  var page = function () { return location.pathname.replace(/\.html$/, '') || '/'; };
  var label = function (el) { return (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48); };

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a,button');
    if (!el) return;
    var t = el.getAttribute('data-track'), h = el.getAttribute('href') || '';
    if (t) return window.lebenTrack(t, { label: label(el), page: page() });
    if (/wa\.me\//.test(h)) return window.lebenTrack('whatsapp_click', { label: label(el), page: page() });
    if (/\.pdf($|\?)/.test(h)) return window.lebenTrack('pdf_download', { page: page() });
    if (/(^|\/)catalogo(\.html)?($|[#?])/.test(h) && !/catalogo/.test(page())) return window.lebenTrack('catalog_open', { label: label(el), page: page() });
  }, true);

  /* ── agendar visita da mala ── */
  var CSS = '' +
    '.lv-scrim{position:fixed;inset:0;z-index:120;background:rgba(14,42,37,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:18px;opacity:0;visibility:hidden;transition:opacity .35s,visibility 0s .35s}' +
    '.lv-scrim.open{opacity:1;visibility:visible;transition:opacity .35s}' +
    '.lv-box{position:relative;width:min(460px,100%);max-height:92vh;overflow:auto;background:#F7F2E7;color:#16302A;border-radius:16px;padding:34px 28px 26px;box-shadow:0 30px 80px rgba(0,0,0,.35);transform:translateY(16px);transition:transform .45s cubic-bezier(.22,1,.36,1)}' +
    '.lv-scrim.open .lv-box{transform:none}' +
    '.lv-eyebrow{font:500 10.5px/1 Montserrat,Helvetica,Arial,sans-serif;letter-spacing:3.5px;text-transform:uppercase;color:#9C7238}' +
    '.lv-box h3{font-family:"Cormorant Garamond",Georgia,serif;font-weight:500;font-size:32px;line-height:1.08;margin:12px 0 8px}' +
    '.lv-box h3 em{font-style:italic;color:#A67A3E}' +
    '.lv-box p.lv-sub{font:400 13.5px/1.65 Montserrat,Helvetica,Arial,sans-serif;color:#46564F;margin:0 0 18px}' +
    '.lv-form{display:grid;gap:10px}' +
    '.lv-form input,.lv-form select{width:100%;padding:14px 15px;border:1px solid rgba(184,137,74,.4);border-radius:10px;background:#FFFDF6;font:400 16px Montserrat,Helvetica,Arial,sans-serif;color:#16302A;-webkit-appearance:none;appearance:none}' +
    '.lv-form select{background-image:linear-gradient(45deg,transparent 50%,#9C7238 50%),linear-gradient(135deg,#9C7238 50%,transparent 50%);background-position:calc(100% - 20px) 52%,calc(100% - 15px) 52%;background-size:5px 5px;background-repeat:no-repeat}' +
    '.lv-form input:focus,.lv-form select:focus{outline:none;border-color:#B8894A}' +
    '.lv-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
    '.lv-send{margin-top:6px;border:0;cursor:pointer;border-radius:999px;padding:1.5px;background:linear-gradient(to bottom,#8A6A2F,#EAD98F);box-shadow:0 3px 10px rgba(0,0,0,.2)}' +
    '.lv-send span{display:flex;align-items:center;justify-content:center;min-height:54px;border-radius:999px;background:linear-gradient(to bottom,#EED9A4,#C49A55 55%,#A87F3F);color:#221806;font:600 16px "Cormorant Garamond",Georgia,serif;letter-spacing:2.4px;text-transform:uppercase}' +
    '.lv-note{font:400 11.5px/1.6 Montserrat,Helvetica,Arial,sans-serif;color:#5F6F68;text-align:center;margin-top:10px}' +
    '.lv-x{position:absolute;top:14px;right:14px;width:40px;height:40px;border-radius:50%;border:1px solid rgba(184,137,74,.4);background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
    '.lv-x svg{width:14px;height:14px;stroke:#16302A;stroke-width:1.6;fill:none}' +
    '@media(max-width:520px){.lv-scrim{align-items:flex-end;padding:0}.lv-box{border-radius:18px 18px 0 0;padding:30px 20px max(22px,env(safe-area-inset-bottom))}.lv-two{grid-template-columns:1fr}}';

  var built = null;
  function build() {
    if (built) return built;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var d = document.createElement('div');
    d.className = 'lv-scrim'; d.setAttribute('aria-hidden', 'true');
    d.innerHTML =
      '<div class="lv-box" role="dialog" aria-modal="true" aria-labelledby="lvTitle">' +
      '<button class="lv-x" type="button" aria-label="Fechar"><svg viewBox="0 0 20 20"><path d="M4 4l12 12M16 4L4 16"/></svg></button>' +
      '<div class="lv-eyebrow">Mala de visita · +400 peças</div>' +
      '<h3 id="lvTitle">Agende a visita da <em>mala Leben</em></h3>' +
      '<p class="lv-sub">Levamos a mala completa até a sua ótica: você vê e toca cada peça e fica com as escolhidas na hora. Sem pedido mínimo.</p>' +
      '<form class="lv-form" novalidate>' +
      '<input name="nome" type="text" placeholder="Seu nome" autocomplete="name" autocapitalize="words" required>' +
      '<input name="otica" type="text" placeholder="Nome da ótica" autocapitalize="words" required>' +
      '<div class="lv-two"><input name="cidade" type="text" placeholder="Cidade" autocomplete="address-level2" autocapitalize="words" required>' +
      '<select name="quando" aria-label="Melhor período"><option>Qualquer dia</option><option>Esta semana</option><option>Próxima semana</option><option>De manhã</option><option>À tarde</option></select></div>' +
      '<button class="lv-send" type="submit"><span>Agendar pelo WhatsApp</span></button>' +
      '<div class="lv-note">Confirmamos dia e horário em até 24h.</div>' +
      '</form></div>';
    document.body.appendChild(d);
    var close = function () { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); document.documentElement.style.overflow = ''; };
    d.addEventListener('click', function (e) { if (e.target === d) close(); });
    d.querySelector('.lv-x').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && d.classList.contains('open')) close(); });
    var f = d.querySelector('form');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = function (n) { return (f.elements[n].value || '').trim(); };
      var miss = ['nome', 'otica', 'cidade'].filter(function (n) { return !v(n); });
      if (miss.length) { f.elements[miss[0]].focus(); f.elements[miss[0]].style.borderColor = '#B4553C'; return; }
      var msg = 'Olá! Quero agendar uma visita da mala Leben na minha ótica.\n\n' +
        'Nome: ' + v('nome') + '\nÓtica: ' + v('otica') + '\nCidade: ' + v('cidade') + '\nMelhor período: ' + v('quando');
      window.lebenTrack('visit_request', { cidade: v('cidade'), page: page() });
      window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(msg), '_blank');
      close();
    });
    built = { el: d, open: function () {
      d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); document.documentElement.style.overflow = 'hidden';
      setTimeout(function () { f.elements.nome.focus(); }, 300);
    } };
    return built;
  }
  window.lebenAgendar = function () { build().open(); };
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-agendar]');
    if (!el) return;
    e.preventDefault();
    window.lebenTrack('visit_open', { page: page() });
    window.lebenAgendar();
  });
  if (location.hash === '#agendar') {
    var go = function () { window.lebenAgendar(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})();
