/* ════════════════════════════════════════════════════════════
   LEBEN — Provador virtual
   · Rastreamento facial: MediaPipe Face Landmarker (Google, Apache-2.0),
     hospedado no próprio site (/vto/engine) — roda 100% no aparelho,
     nenhuma imagem sai do celular.
   · Escala real: largura do rosto e distância pupilar medidas em 3D,
     convertidas para a medida da armação (DBC = lente + ponte, em mm).
   · Realismo 2.5D: inclinação, giro (com paralaxe no nariz), hastes
     que aparecem ao virar o rosto, sombra de contato e reflexo nas lentes.
   · Sem câmera? Modo foto (envia uma selfie, também processada no aparelho).
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var BASE = (document.currentScript && document.currentScript.src.replace(/js\/provador\.js.*$/, '')) || '/';
  var FRAME_MM = 140, FIT_FACE = 1.0, FIT_EYE = 1.52, FIT_IPD = 2.28;   // armação ≈ largura do rosto na altura dos olhos (adultos)
  var FR = null;           // catálogo de armações (frames.json)
  var S = {};              // estado
  try { S.adj = +localStorage.getItem('lebenVtoAdj') || 1; } catch (x) { S.adj = 1; }
  var vision = null, lm = null, lmMode = null;

  function track(n, d) { try { window.lebenTrack && window.lebenTrack(n, d || {}); } catch (e) {} }
  function $(s, r) { return (r || document).querySelector(s); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ── filtro One Euro: suaviza tremidas sem atrasar movimentos rápidos ── */
  function OneEuro(minCut, beta) { this.mc = minCut; this.b = beta; this.x = null; this.dx = 0; this.t = 0; }
  OneEuro.prototype.f = function (x, t) {
    if (this.x === null) { this.x = x; this.t = t; return x; }
    var dt = Math.max(1e-3, (t - this.t) / 1000); this.t = t;
    var a = function (c) { var r = 2 * Math.PI * c * dt; return r / (r + 1); };
    var dx = (x - this.x) / dt; this.dx = lerp(this.dx, dx, a(1));
    var c = this.mc + this.b * Math.abs(this.dx);
    this.x = lerp(this.x, x, a(c)); return this.x;
  };
  OneEuro.prototype.reset = function () { this.x = null; this.dx = 0; };
  var F = { x: new OneEuro(1.2, 0.02), y: new OneEuro(1.2, 0.02), s: new OneEuro(0.6, 0.004), r: new OneEuro(1.0, 0.3), yaw: new OneEuro(0.9, 0.3), tx: new OneEuro(1.0, 0.02) };
  function resetF() { for (var k in F) F[k].reset(); }

  /* ── estilos ── */
  var CSS = '' +
  '.vto{position:fixed;inset:0;z-index:300;background:#0B231F;color:#F3EDD3;font-family:Montserrat,Helvetica,Arial,sans-serif;display:flex;flex-direction:column;opacity:0;visibility:hidden;transition:opacity .45s,visibility 0s .45s;-webkit-user-select:none;user-select:none;touch-action:manipulation}' +
  '.vto.open{opacity:1;visibility:visible;transition:opacity .45s}' +
  '.vto-stage{position:absolute;inset:0;overflow:hidden;background:radial-gradient(120% 90% at 50% 30%,#163b33,#0B231F 70%)}' +
  '.vto-stage canvas{position:absolute;inset:0;width:100%;height:100%}' +
  '.vto-stage video{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}' +
  '.vto-vig{position:absolute;inset:0;pointer-events:none;background:linear-gradient(to bottom,rgba(11,35,31,.62),transparent 22%,transparent 62%,rgba(11,35,31,.86))}' +
  '.vto-top{position:relative;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:max(14px,env(safe-area-inset-top)) 16px 10px}' +
  '.vto-x,.vto-ib{width:46px;height:46px;border-radius:50%;border:1px solid rgba(232,200,134,.4);background:rgba(11,35,31,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;color:#F3EDD3;cursor:pointer;flex-shrink:0}' +
  '.vto-x svg,.vto-ib svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.5}' +
  '.vto-ttl{text-align:center;min-width:0}' +
  '.vto-ttl small{display:block;font-size:10px;letter-spacing:3.2px;text-transform:uppercase;color:#E8C886;font-weight:500}' +
  '.vto-ttl b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-weight:500;font-size:26px;line-height:1.1;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '.vto-ttl i{font-style:normal;font-size:10.5px;letter-spacing:2px;color:#B4C3BC}' +
  '.vto-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:4;width:min(380px,calc(100% - 40px));text-align:center;pointer-events:none;transition:opacity .4s}' +
  '.vto-msg[hidden]{display:block;opacity:0}' +
  '.vto-msg .ring{width:58px;height:58px;margin:0 auto 18px;border-radius:50%;border:1.5px solid rgba(232,200,134,.22);border-top-color:#E8C886;animation:vtoSpin 1s linear infinite}' +
  '.vto-msg h4{font-family:"Cormorant Garamond",Georgia,serif;font-weight:500;font-size:28px;line-height:1.15}' +
  '.vto-msg p{font-size:13px;line-height:1.65;color:#B4C3BC;margin-top:10px}' +
  '.vto-msg .acts{pointer-events:auto;display:flex;flex-direction:column;gap:10px;margin-top:22px}' +
  '.vto-oval{position:absolute;left:50%;top:44%;width:min(62vw,300px);aspect-ratio:3/4;transform:translate(-50%,-50%);border:1.5px dashed rgba(232,200,134,.55);border-radius:50%;z-index:2;pointer-events:none;transition:opacity .5s}' +
  '.vto-hint{position:absolute;left:50%;bottom:calc(244px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:3;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#F3EDD3;background:rgba(11,35,31,.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:9px 16px;border-radius:999px;white-space:nowrap;transition:opacity .4s;pointer-events:none}' +
  '.vto-bot{position:absolute;left:0;right:0;bottom:0;z-index:3;padding:0 0 max(16px,env(safe-area-inset-bottom))}' +
  '.vto-rail{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:6px 16px 14px;scrollbar-width:none;justify-content:safe center}' +
  '.vto-rail::-webkit-scrollbar{display:none}' +
  '.vto-m{flex:0 0 auto;scroll-snap-align:center;width:96px;border-radius:14px;padding:10px 6px 8px;background:rgba(243,237,211,.92);border:1.5px solid transparent;color:#16302A;cursor:pointer;transition:transform .3s,border-color .3s,background .3s;text-align:center}' +
  '.vto-m img{width:100%;height:34px;object-fit:contain;display:block}' +
  '.vto-m span{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:15px;line-height:1;margin-top:6px}' +
  '.vto-m.on{border-color:#E8C886;background:#FFFDF6;transform:translateY(-3px);box-shadow:0 8px 22px rgba(0,0,0,.3)}' +
  '.vto-ctl{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:4px 20px 0}' +
  '.vto-ctl .l{justify-self:start}.vto-ctl .r{justify-self:end}' +
  '.vto-shot{width:74px;height:74px;border-radius:50%;border:2px solid #E8C886;padding:5px;background:transparent;cursor:pointer}' +
  '.vto-shot i{display:block;width:100%;height:100%;border-radius:50%;background:radial-gradient(circle at 35% 30%,#F3E2B4,#C49A55 60%,#A87F3F);box-shadow:0 6px 18px rgba(0,0,0,.35);transition:transform .15s}' +
  '.vto-shot:active i{transform:scale(.9)}' +
  '.vto-want{display:inline-flex;align-items:center;gap:8px;height:46px;padding:0 16px;border-radius:999px;border:1px solid rgba(232,200,134,.55);background:rgba(11,35,31,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#F3EDD3;font-size:10.5px;letter-spacing:1.8px;text-transform:uppercase;font-weight:600;cursor:pointer;white-space:nowrap}' +
  '.vto-want svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.6}' +
  '.vto-want.on{background:#E8C886;color:#0E2A25;border-color:#E8C886}' +
  '.vto-btn{display:flex;align-items:center;justify-content:center;min-height:52px;border-radius:999px;border:0;cursor:pointer;font:600 15px "Cormorant Garamond",Georgia,serif;letter-spacing:2.2px;text-transform:uppercase;background:linear-gradient(to bottom,#EED9A4,#C49A55 55%,#A87F3F);color:#221806;box-shadow:0 4px 14px rgba(0,0,0,.25);padding:0 22px}' +
  '.vto-btn.ghost{background:transparent;border:1px solid rgba(243,237,211,.5);color:#F3EDD3;box-shadow:none;font:600 11px Montserrat,sans-serif;letter-spacing:2.2px}' +
  '.vto-size{position:absolute;right:16px;top:calc(84px + env(safe-area-inset-top));z-index:3;display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px;border-radius:999px;background:rgba(11,35,31,.5);border:1px solid rgba(232,200,134,.35);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}' +
  '.vto-size button{width:42px;height:42px;border-radius:50%;border:0;background:transparent;color:#F3EDD3;font:400 24px/1 Montserrat,sans-serif;cursor:pointer}' +
  '.vto-size button:active{background:rgba(232,200,134,.25)}' +
  '.vto-size small{font-size:8.5px;letter-spacing:1.6px;text-transform:uppercase;color:#E8C886;writing-mode:vertical-rl;transform:rotate(180deg);padding:4px 0}' +
  '.vto-lens{display:flex;justify-content:center;gap:4px;margin:0 auto 10px;padding:4px;width:max-content;border-radius:999px;background:rgba(11,35,31,.55);border:1px solid rgba(232,200,134,.3);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}' +
  '.vto-lens button{height:36px;padding:0 16px;border-radius:999px;border:0;background:transparent;color:#D7DED9;font:600 10px Montserrat,sans-serif;letter-spacing:1.8px;text-transform:uppercase;cursor:pointer;display:inline-flex;align-items:center;gap:8px}' +
  '.vto-lens button i{width:12px;height:12px;border-radius:50%;border:1px solid rgba(255,255,255,.6)}' +
  '.vto-lens button[data-a=lens-clear] i{background:rgba(214,226,220,.5)}.vto-lens button[data-a=lens-sun] i{background:linear-gradient(#3a3027,#5e5040)}' +
  '.vto-lens button.on{background:#F3EDD3;color:#0E2A25}' +
  '.vto-flash{position:absolute;inset:0;z-index:6;background:#fff;opacity:0;pointer-events:none}' +
  '.vto-flash.go{animation:vtoFlash .5s ease}' +
  '.vto-prev{position:absolute;inset:0;z-index:7;background:rgba(11,35,31,.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:max(20px,env(safe-area-inset-top)) 20px max(20px,env(safe-area-inset-bottom));opacity:0;visibility:hidden;transition:opacity .35s,visibility 0s .35s}' +
  '.vto-prev.open{opacity:1;visibility:visible;transition:opacity .35s}' +
  '.vto-prev img{max-width:min(440px,100%);max-height:62vh;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.45)}' +
  '.vto-prev .acts{display:grid;gap:10px;width:min(440px,100%)}' +
  '.vto-note{font-size:10.5px;letter-spacing:.4px;color:#8FA39B;text-align:center;padding:10px 20px 0;line-height:1.5}' +
  '.vto-note svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:1.8;vertical-align:-1px;margin-right:4px}' +
  '@keyframes vtoSpin{to{transform:rotate(360deg)}}@keyframes vtoFlash{0%{opacity:.85}100%{opacity:0}}' +
  '@media(min-width:900px){.vto-bot{padding-bottom:22px}.vto-m{width:110px}.vto-ttl b{font-size:30px}}' +
  '@media(max-width:380px){.vto-m{width:84px}.vto-want span{display:none}.vto-want{width:46px;padding:0;justify-content:center}}';

  var IC = {
    x: '<svg viewBox="0 0 20 20"><path d="M4 4l12 12M16 4L4 16"/></svg>',
    img: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 17"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13" r="3.6"/></svg>',
    bag: '<svg viewBox="0 0 24 24"><path d="M6 8h12l-1 12H7z"/><path d="M9 8V6.5a3 3 0 016 0V8"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>'
  };

  /* ── DOM ── */
  function build() {
    if (S.el) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var d = document.createElement('div'); d.className = 'vto'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Provador virtual Leben');
    d.innerHTML =
      '<div class="vto-stage"><video playsinline muted autoplay></video><canvas></canvas><div class="vto-vig"></div><div class="vto-oval"></div><div class="vto-flash"></div></div>' +
      '<div class="vto-top"><button class="vto-x" data-a="close" aria-label="Fechar provador">' + IC.x + '</button>' +
      '<div class="vto-ttl"><small>Provador virtual</small><b id="vtoName">Leben</b><i id="vtoCode"></i></div>' +
      '<button class="vto-ib" data-a="photo" aria-label="Usar uma foto">' + IC.img + '</button></div>' +
      '<div class="vto-msg" id="vtoMsg"></div>' +
      '<div class="vto-size"><button data-a="big" aria-label="Aumentar armação">+</button><small>Tamanho</small><button data-a="small" aria-label="Diminuir armação">−</button></div>' +
      '<div class="vto-hint" id="vtoHint">Posicione o rosto no centro</div>' +
      '<div class="vto-bot"><div class="vto-lens" role="group" aria-label="Tipo de lente"><button data-a="lens-clear" class="on"><i></i>Lente clara</button><button data-a="lens-sun"><i></i>Lente solar</button></div><div class="vto-rail" id="vtoRail"></div>' +
      '<div class="vto-ctl"><span class="l"></span><button class="vto-shot" data-a="shot" aria-label="Tirar foto"><i></i></button>' +
      '<span class="r"><button class="vto-want" data-a="want">' + IC.bag + '<span>Tenho interesse</span></button></span></div>' +
      '<div class="vto-note">' + IC.lock + 'A imagem é processada no seu aparelho e não é enviada. Tamanho aproximado — confirme na ótica.</div></div>' +
      '<div class="vto-prev" id="vtoPrev"><img alt="Sua foto com a armação Leben"><div class="acts">' +
      '<button class="vto-btn" data-a="share">Compartilhar no WhatsApp</button>' +
      '<button class="vto-btn ghost" data-a="save">Salvar foto</button>' +
      '<button class="vto-btn ghost" data-a="back">Voltar ao provador</button></div></div>' +
      '<input type="file" accept="image/*" hidden id="vtoFile">';
    document.body.appendChild(d);
    S.el = d; S.video = $('video', d); S.cv = $('canvas', d); S.cx = S.cv.getContext('2d');
    d.addEventListener('click', onClick);
    $('#vtoFile', d).addEventListener('change', onFile);
    document.addEventListener('keydown', function (e) {
      if (!S.open) return;
      if (e.key === 'Escape') { if ($('#vtoPrev').classList.contains('open')) closePrev(); else close(); }
      if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1);
    });
    addEventListener('resize', fit);
    var rail = $('#vtoRail', d);
    rail.innerHTML = Object.keys(FR).map(function (c) {
      return '<button class="vto-m" data-code="' + c + '" aria-label="Experimentar ' + FR[c].name + '"><img src="' + BASE + FR[c].img + '" alt=""><span>' + FR[c].name + '</span></button>';
    }).join('');
  }

  function msg(html) { var m = $('#vtoMsg'); clearTimeout(S.msgT); if (!html) { m.hidden = true; S.msgT = setTimeout(function () { if (m.hidden) m.innerHTML = ''; }, 450); return; } m.innerHTML = html; m.hidden = false; }
  function hint(t) { var h = $('#vtoHint'); h.textContent = t || ''; h.style.opacity = t ? 1 : 0; }

  /* ── armações: imagem, sombra, reflexo, cor da haste ── */
  function loadImg(src) { return new Promise(function (ok, no) { var i = new Image(); i.decoding = 'async'; i.onload = function () { ok(i); }; i.onerror = no; i.src = src; }); }
  function prepFrame(code) {
    var f = FR[code]; if (f._ready) return f._ready;
    f._ready = Promise.all([loadImg(BASE + f.img), loadImg(BASE + f.lens)]).then(function (r) {
      var im = r[0], lens = r[1], w = im.naturalWidth, h = im.naturalHeight;
      f.im = im;
      function cnv(W, H) { var c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
      // sombra de contato: silhueta reduzida (blur barato e compatível com Safari)
      var sc = cnv(Math.ceil(w / 10), Math.ceil(h / 10)), sx = sc.getContext('2d');
      sx.drawImage(im, 0, 0, sc.width, sc.height); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#1a0f08'; sx.fillRect(0, 0, sc.width, sc.height);
      var s2 = cnv(Math.ceil(w / 4), Math.ceil(h / 4)); s2.getContext('2d').drawImage(sc, 0, 0, s2.width, s2.height); f.shadow = s2;
      // máscara das lentes (luminância → alfa) e versão desfocada (para a borda interna do vidro)
      var mc = cnv(w, h), mx = mc.getContext('2d'); mx.drawImage(lens, 0, 0, w, h);
      var md = mx.getImageData(0, 0, w, h), p = md.data; for (var i = 0; i < p.length; i += 4) { p[i + 3] = p[i]; p[i] = p[i + 1] = p[i + 2] = 255; } mx.putImageData(md, 0, 0);
      var bs = cnv(Math.ceil(w / 14), Math.ceil(h / 14)); bs.getContext('2d').drawImage(mc, 0, 0, bs.width, bs.height);
      var bl = cnv(w, h), bx = bl.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(bs, 0, 0, w, h);
      function lensLayer(paint, edge) {
        var c = cnv(w, h), x = c.getContext('2d'); paint(x);
        x.globalCompositeOperation = 'destination-in'; x.drawImage(mc, 0, 0);
        if (edge) { // sombreado na borda interna: vidro com espessura
          var e = cnv(w, h), ex = e.getContext('2d'); ex.drawImage(mc, 0, 0); ex.globalCompositeOperation = 'destination-out'; ex.drawImage(bl, 0, 0); ex.drawImage(bl, 0, 0);
          ex.globalCompositeOperation = 'source-in'; ex.fillStyle = edge; ex.fillRect(0, 0, w, h);
          x.globalCompositeOperation = 'source-over'; x.drawImage(e, 0, 0);
        }
        return c;
      }
      var Lt = Math.min(f.lc[1], f.rc[1]) - f.lh / 2, Lb = Lt + f.lh;
      // lente de demonstração (clara): leve verde-acinzentado do vidro + borda + reflexo diagonal
      f.lensClear = lensLayer(function (x) {
        var g = x.createLinearGradient(0, Lt, 0, Lb); g.addColorStop(0, 'rgba(196,214,206,.20)'); g.addColorStop(1, 'rgba(176,196,188,.12)');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        var r = x.createLinearGradient(w * 0.05, Lt, w * 0.45, Lb); r.addColorStop(0, 'rgba(255,255,255,.30)'); r.addColorStop(0.3, 'rgba(255,255,255,.07)'); r.addColorStop(0.42, 'rgba(255,255,255,.16)'); r.addColorStop(0.5, 'rgba(255,255,255,0)'); r.addColorStop(1, 'rgba(255,255,255,.05)');
        x.fillStyle = r; x.fillRect(0, 0, w, h);
      }, 'rgba(40,52,48,.30)');
      // lente solar: degradê marrom-acinzentado (mais escuro em cima), reflexo suave
      f.lensSun = lensLayer(function (x) {
        var g = x.createLinearGradient(0, Lt, 0, Lb); g.addColorStop(0, 'rgba(48,40,32,.86)'); g.addColorStop(1, 'rgba(78,66,52,.70)');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        var r = x.createLinearGradient(w * 0.05, Lt, w * 0.45, Lb); r.addColorStop(0, 'rgba(255,255,255,.22)'); r.addColorStop(0.35, 'rgba(255,255,255,.04)'); r.addColorStop(0.45, 'rgba(255,255,255,.10)'); r.addColorStop(0.55, 'rgba(255,255,255,0)');
        x.fillStyle = r; x.fillRect(0, 0, w, h);
      }, 'rgba(20,16,12,.35)');
      // dobradiça: altura e espessura reais da armação na ponta lateral (procura na imagem)
      var ac = cnv(w, h), ax2 = ac.getContext('2d'); ax2.drawImage(im, 0, 0); var ad = ax2.getImageData(0, 0, w, h).data;
      function band(x0) { var ys = []; for (var y = 0; y < h; y++) if (ad[(y * w + x0) * 4 + 3] > 140) ys.push(y); return ys; }
      var ysL = band(Math.round(w * 0.035)), ysR = band(Math.round(w * 0.965)), ys = ysL.concat(ysR);
      ys.sort(function (a, b) { return a - b; });
      var top = ys.length ? ys[Math.floor(ys.length * 0.08)] : h * 0.12, bot = ys.length ? ys[Math.floor(ys.length * 0.5)] : h * 0.35;
      f.hy = (top + Math.min(bot, top + h * 0.22)) / 2; f.ht = clamp((Math.min(bot, top + h * 0.22) - top) * 0.62, h * 0.045, h * 0.11);
      // textura da haste: faixa da barra superior da armação (mesmo acetato), esticada e afinando até a ponta
      var ty0 = Math.max(0, Math.round(top + 2)), th = Math.max(6, Math.round(f.ht * 1.2));
      var tex = cnv(512, 48), tx = tex.getContext('2d');
      tx.drawImage(im, Math.round(w * 0.08), ty0, Math.round(w * 0.3), th, 0, 0, 512, 48);
      tx.globalCompositeOperation = 'destination-in';
      var tp = tx.createLinearGradient(0, 0, 512, 0); tp.addColorStop(0, 'rgba(0,0,0,1)'); tp.addColorStop(0.82, 'rgba(0,0,0,1)'); tp.addColorStop(1, 'rgba(0,0,0,0)');
      tx.fillStyle = tp; tx.beginPath(); tx.moveTo(0, 0); tx.lineTo(512, 14); tx.lineTo(512, 34); tx.lineTo(0, 48); tx.closePath(); tx.fill();
      tx.globalCompositeOperation = 'source-over';
      var hl = tx.createLinearGradient(0, 0, 0, 48); hl.addColorStop(0, 'rgba(255,255,255,.22)'); hl.addColorStop(0.35, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(0,0,0,.22)');
      tx.globalCompositeOperation = 'source-atop'; tx.fillStyle = hl; tx.fillRect(0, 0, 512, 48);
      f.temple = tex;
      return f;
    });
    return f._ready;
  }

  /* ── motor ── */
  function ensureEngine(mode) {
    var p = S.engine || (S.engine = import(BASE + 'vto/engine/vision_bundle.mjs').then(function (m) {
      vision = m;
      return m.FilesetResolver.forVisionTasks(BASE + 'vto/engine');
    }).then(function (fs) {
      var opts = function (del) { return { baseOptions: { modelAssetPath: BASE + 'vto/engine/face_landmarker.task', delegate: del }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false, minFaceDetectionConfidence: 0.5, minTrackingConfidence: 0.5 }; };
      return vision.FaceLandmarker.createFromOptions(fs, opts('GPU')).catch(function () { return vision.FaceLandmarker.createFromOptions(fs, opts('CPU')); });
    }).then(function (l) { lm = l; lmMode = 'VIDEO'; return l; }));
    return p.then(function (l) {
      if (lmMode !== mode) { return l.setOptions({ runningMode: mode }).then(function () { lmMode = mode; return l; }); }
      return l;
    });
  }

  /* ── câmera ── */
  function startCam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('nocam'));
    return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } } }).then(function (st) {
      S.stream = st; S.video.srcObject = st;
      return new Promise(function (ok) { S.video.onloadedmetadata = function () { S.video.play().then(ok, ok); }; });
    });
  }
  function stopCam() { if (S.stream) { S.stream.getTracks().forEach(function (t) { t.stop(); }); S.stream = null; } S.video.srcObject = null; }

  function fit() {
    if (!S.cv) return; var dpr = Math.min(devicePixelRatio || 1, 2), r = S.cv.getBoundingClientRect();
    S.cv.width = Math.round(r.width * dpr); S.cv.height = Math.round(r.height * dpr); S.dpr = dpr;
    if (S.mode === 'photo' && S.photo) renderPhoto();
  }

  /* fonte (vídeo ou foto) desenhada em "cover" (vídeo) ou "contain" (foto); espelhada no modo câmera */
  function srcRect(sw, sh, W, H, cover) {
    var s = cover ? Math.max(W / sw, H / sh) : Math.min(W / sw, (H * 0.78) / sh), w = sw * s, h = sh * s;
    return { x: (W - w) / 2, y: cover ? (H - h) / 2 : Math.max(0, (H * 0.86 - h) / 2), w: w, h: h, s: s };
  }

  /* ── geometria do rosto → pose da armação ── */
  function pose(L, rect, mirror) {
    function P(i) { var p = L[i]; return { x: rect.x + (mirror ? 1 - p.x : p.x) * rect.w, y: rect.y + p.y * rect.h, z: p.z * rect.w }; }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function d3(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
    var e1 = P(468), e2 = P(473); var pl = e1.x < e2.x ? e1 : e2, pr = e1.x < e2.x ? e2 : e1;
    var nose = P(1), fl = P(234), frt = P(454); if (fl.x > frt.x) { var t = fl; fl = frt; frt = t; }
    var dl = dist(nose, fl), dr = dist(nose, frt);
    /* giro: magnitude pela razão projeção 2D / medida 3D (estável); sentido pela assimetria nariz–contorno */
    var c2 = clamp((dist(fl, frt) / Math.max(1, d3(fl, frt)) + dist(pl, pr) / Math.max(1, d3(pl, pr))) / 2, 0.3, 1);
    var yaw = Math.acos(c2) * (dr >= dl ? 1 : -1);     // + = rosto virado para a direita da tela
    var roll = Math.atan2(pr.y - pl.y, pr.x - pl.x);
    /* escala real (px por mm): largura do rosto em 3D (não muda ao girar) + distância pupilar 3D */
    /* largura-alvo da armação (px): encaixe pelo rosto — a frente da armação acompanha a largura da
       face na altura dos olhos (contorno 3D) e a largura entre os cantos externos dos olhos; usa o maior,
       compensando a perspectiva da câmera de selfie (que "encolhe" as laterais do rosto) */
    var est = [FIT_FACE * d3(fl, frt), FIT_EYE * d3(P(33), P(263)), FIT_IPD * d3(pl, pr)].sort(function (a, b) { return a - b; });
    var fit = est[1];   // mediana: robusta a um ponto mal detectado
    var ppm = fit / FRAME_MM;
    var bridge = P(168);
    var mid = { x: (pl.x + pr.x) / 2, y: (pl.y + pr.y) / 2 };
    var ear = { l: P(127), r: P(356) };
    if (ear.l.x > ear.r.x) { var q = ear.l; ear.l = ear.r; ear.r = q; }
    return { mid: mid, bridge: bridge, ppm: ppm, yaw: yaw, roll: roll, ear: ear };
  }

  function drawFrame(ctx, f, ps, now, still) {
    var t = now || performance.now();
    var sc = (FRAME_MM * ps.ppm * (S.adj || 1)) / (f.w * 0.978);   // armação inteira = largura-alvo
    var cx = lerp(ps.mid.x, ps.bridge.x, 0.6), cy = ps.mid.y;
    var sm = still ? { x: cx, y: cy, s: sc, r: ps.roll, yaw: ps.yaw } : { x: F.x.f(cx, t), y: F.y.f(cy, t), s: F.s.f(sc, t), r: F.r.f(ps.roll, t), yaw: F.yaw.f(ps.yaw, t) };
    var yaw = sm.yaw, cyaw = Math.cos(yaw);
    var ax = (f.lc[0] + f.rc[0]) / 2, ay = (f.lc[1] + f.rc[1]) / 2 - f.lh * 0.06;   // pupila levemente acima do centro da lente
    var w = f.w, h = f.h;
    var k = 0.11 * Math.sin(Math.abs(yaw)), hL = yaw > 0 ? 1 - k : 1 + k, hR = yaw > 0 ? 1 + k : 1 - k;   // lado revelado pelo giro = mais próximo
    ctx.save();
    ctx.translate(sm.x, sm.y); ctx.rotate(sm.r);
    /* hastes: saem da dobradiça (altura real da armação), com a textura do próprio acetato,
       e seguem até a orelha; aparecem conforme o rosto gira */
    var ca = Math.cos(-sm.r), sa = Math.sin(-sm.r);
    function temple(side) {
      var vis = clamp((Math.abs(yaw) - 0.06) / 0.22, 0, 1) * (side === (yaw > 0 ? 1 : -1) ? 1 : 0);
      if (vis < 0.02) return;
      var hs = side < 0 ? hL : hR;
      var hx = (side < 0 ? (w * 0.012 - ax) : (w * 0.988 - ax)) * sm.s * cyaw, hy = (f.hy - ay) * sm.s * hs;
      var e = side < 0 ? ps.ear.l : ps.ear.r, ex = e.x - sm.x, ey = e.y - sm.y;
      var ex2 = ex * ca - ey * sa, ey2 = ex * sa + ey * ca + (f.ht * sm.s * 0.6);
      var dx = ex2 - hx, dy = ey2 - hy, len = Math.hypot(dx, dy); if (len < 4) return;
      var th = f.ht * sm.s * hs * 1.5;
      ctx.save(); ctx.globalAlpha = vis; ctx.translate(hx, hy); ctx.rotate(Math.atan2(dy, dx));
      ctx.drawImage(f.temple, -th * 0.15, -th / 2, len * 1.04, th);
      ctx.restore();
    }
    temple(-1); temple(1);
    ctx.scale(sm.s * cyaw, sm.s * (1 - 0.04 * Math.abs(yaw)));
    // sombra de contato (deslocada para baixo, suave)
    ctx.globalAlpha = 0.24; ctx.drawImage(f.shadow, -ax - w * 0.01, -ay + h * 0.07, w * 1.02, h);
    /* perspectiva: a metade mais próxima da câmera fica um pouco maior */
    function half(img, a) {
      ctx.globalAlpha = a;
      ctx.drawImage(img, 0, 0, ax, h, -ax, -ay * hL, ax, h * hL);
      ctx.drawImage(img, ax, 0, w - ax, h, 0, -ay * hR, w - ax, h * hR);
    }
    half(S.lens === 'sun' ? f.lensSun : f.lensClear, 1);
    half(f.im, 1); ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ── loop da câmera ── */
  var lastSeen = 0, lastVT = -1, raf = 0, fade = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    var v = S.video, ctx = S.cx, W = S.cv.width, H = S.cv.height;
    if (!v.videoWidth) return;
    var rect = srcRect(v.videoWidth, v.videoHeight, W, H, true);
    ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(v, W - rect.x - rect.w, rect.y, rect.w, rect.h); ctx.restore();
    var now = performance.now();
    if (lm && v.currentTime !== lastVT) {
      lastVT = v.currentTime;
      try { S.res = lm.detectForVideo(v, now); } catch (e) { }
    }
    var f = FR[S.code];
    var ok = S.res && S.res.faceLandmarks && S.res.faceLandmarks.length;
    if (ok) {
      lastSeen = now; S.lastPose = pose(S.res.faceLandmarks[0], rect, true);
      if (!S.seen) { S.seen = true; $('.vto-oval', S.el).style.opacity = 0; hint(''); }
    }
    var alive = now - lastSeen < 450;
    fade = clamp(fade + (alive ? 0.12 : -0.08), 0, 1);
    if (S.lastPose && f && f.im && fade > 0) { ctx.globalAlpha = fade; drawFrame(ctx, f, S.lastPose, now); ctx.globalAlpha = 1; }
    if (!alive && S.seen && now - lastSeen > 1200) { S.seen = false; resetF(); $('.vto-oval', S.el).style.opacity = 1; hint('Procurando seu rosto…'); }
  }

  /* ── modo foto ── */
  function onFile(e) {
    var file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file) return;
    var url = URL.createObjectURL(file);
    loadImg(url).then(function (img) {
      cancelAnimationFrame(raf); stopCam(); S.mode = 'photo'; S.photo = img; S.pres = null;
      msg('<div class="ring"></div><h4>Analisando a foto…</h4>'); hint('');
      $('.vto-oval', S.el).style.opacity = 0;
      return ensureEngine('IMAGE').then(function (l) {
        var c = document.createElement('canvas'), k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        S.photoC = c; S.pres = l.detect(c); msg('');
        if (!S.pres.faceLandmarks || !S.pres.faceLandmarks.length) { msg('<h4>Não encontramos um rosto</h4><p>Use uma foto de frente, com o rosto bem iluminado e sem óculos.</p><div class="acts"><button class="vto-btn" data-a="photo">Escolher outra foto</button><button class="vto-btn ghost" data-a="cam">Usar a câmera</button></div>'); }
        renderPhoto(); track('vto_photo', { code: S.code });
      });
    }).catch(function () { msg('<h4>Não foi possível abrir a foto</h4><div class="acts"><button class="vto-btn" data-a="photo">Tentar outra</button></div>'); });
  }
  function renderPhoto() {
    var ctx = S.cx, W = S.cv.width, H = S.cv.height, c = S.photoC || S.photo; if (!c) return;
    ctx.clearRect(0, 0, W, H);
    var rect = srcRect(c.width || c.naturalWidth, c.height || c.naturalHeight, W, H, false);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 40 * S.dpr; ctx.drawImage(c, rect.x, rect.y, rect.w, rect.h); ctx.restore();
    var f = FR[S.code];
    if (S.pres && S.pres.faceLandmarks && S.pres.faceLandmarks.length && f && f.im) drawFrame(ctx, f, pose(S.pres.faceLandmarks[0], rect, false), 0, true);
  }

  /* ── troca de modelo ── */
  function select(code) {
    if (!FR[code]) return; S.code = code; var f = FR[code];
    $('#vtoName').textContent = f.name; $('#vtoCode').textContent = code + ' · Leben Ateliê';
    S.el.querySelectorAll('.vto-m').forEach(function (b) { var on = b.dataset.code === code; b.classList.toggle('on', on); if (on && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); });
    paintWant();
    prepFrame(code).then(function () { if (S.mode === 'photo') renderPhoto(); });
    track('vto_model', { code: code });
  }
  function step(d) { var ks = Object.keys(FR), i = ks.indexOf(S.code); select(ks[(i + d + ks.length) % ks.length]); }
  function paintWant() {
    var b = $('[data-a=want]', S.el), on = window.lebenSel && window.lebenSel.get(S.code) > 0;
    b.classList.toggle('on', !!on); b.innerHTML = (on ? IC.ok : IC.bag) + '<span>' + (on ? 'Na seleção' : 'Tenho interesse') + '</span>';
  }

  /* ── foto / compartilhar ── */
  function capture() {
    var W = S.cv.width, H = S.cv.height, out = document.createElement('canvas'), k = 1080 / Math.min(W, H) > 1 ? 1 : 1;
    out.width = W; out.height = H; var o = out.getContext('2d'); o.drawImage(S.cv, 0, 0);
    // assinatura
    var f = FR[S.code], pad = 22 * S.dpr, g = o.createLinearGradient(0, H * 0.78, 0, H);
    g.addColorStop(0, 'rgba(11,35,31,0)'); g.addColorStop(1, 'rgba(11,35,31,.82)'); o.fillStyle = g; o.fillRect(0, H * 0.78, W, H * 0.22);
    o.fillStyle = '#F3EDD3'; o.font = '500 ' + (26 * S.dpr) + 'px "Cormorant Garamond", Georgia, serif'; o.textBaseline = 'alphabetic';
    o.fillText('L E B E N', pad, H - pad - 22 * S.dpr);
    o.fillStyle = '#E8C886'; o.font = '500 ' + (11 * S.dpr) + 'px Montserrat, Arial, sans-serif';
    o.fillText((f.name + ' · ' + S.code).toUpperCase().split('').join(String.fromCharCode(8202)), pad, H - pad);
    $('.vto-flash', S.el).classList.remove('go'); void S.el.offsetWidth; $('.vto-flash', S.el).classList.add('go');
    out.toBlob(function (b) {
      S.blob = b; var url = URL.createObjectURL(b); var im = $('#vtoPrev img'); if (S.url) URL.revokeObjectURL(S.url); S.url = url; im.src = url;
      $('#vtoPrev').classList.add('open');
    }, 'image/jpeg', 0.92);
    track('vto_capture', { code: S.code });
  }
  function closePrev() { $('#vtoPrev').classList.remove('open'); }
  function fileName() { return 'leben-' + FR[S.code].name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() + '-' + S.code.toLowerCase() + '.jpg'; }
  function share() {
    var f = FR[S.code], text = 'Experimentei a armação ' + f.name + ' (' + S.code + ') da Leben Eyewear no provador virtual. ' + location.origin + '/catalogo#linha-atelie';
    var file = S.blob && new File([S.blob], fileName(), { type: 'image/jpeg' });
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: text, title: 'Leben · ' + f.name }).then(function () { track('vto_share', { code: S.code }); }).catch(function () {});
    } else { save(); window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); track('vto_share', { code: S.code, via: 'wa' }); }
  }
  function save() { var a = document.createElement('a'); a.href = S.url; a.download = fileName(); document.body.appendChild(a); a.click(); a.remove(); track('vto_save', { code: S.code }); }

  /* ── abrir / fechar ── */
  function camFlow() {
    S.mode = 'cam'; S.photo = S.photoC = S.pres = null; resetF(); S.seen = false; lastSeen = 0;
    $('.vto-oval', S.el).style.opacity = 1; hint('Posicione o rosto no centro');
    msg('<div class="ring"></div><h4>Preparando o provador</h4><p>Permita o acesso à câmera. Tudo acontece no seu aparelho.</p>');
    return Promise.all([startCam(), ensureEngine('VIDEO'), prepFrame(S.code)]).then(function () {
      msg(''); cancelAnimationFrame(raf); fit(); loop();
    }).catch(function (err) {
      stopCam();
      var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      msg('<h4>' + (denied ? 'Câmera não autorizada' : 'Câmera indisponível') + '</h4><p>' +
        (denied ? 'Libere a câmera nas configurações do navegador ou experimente com uma foto sua.' : 'Sem problema: experimente as armações em uma foto sua.') +
        '</p><div class="acts"><button class="vto-btn" data-a="photo">Usar uma foto</button>' + (denied ? '<button class="vto-btn ghost" data-a="cam">Tentar de novo</button>' : '') + '</div>');
      hint(''); $('.vto-oval', S.el).style.opacity = 0;
      track('vto_cam_error', { reason: err && err.name || 'x' });
    });
  }
  function open(code) {
    return loadFR().then(function () {
      build(); if (!FR[code]) code = Object.keys(FR)[0];
      S.open = true; S.el.classList.add('open'); document.documentElement.style.overflow = 'hidden';
      fit(); select(code); track('vto_open', { code: code });
      camFlow();
    });
  }
  function close() {
    S.open = false; cancelAnimationFrame(raf); stopCam(); closePrev();
    S.el.classList.remove('open'); document.documentElement.style.overflow = '';
    if (window.lebenVTOClosed) window.lebenVTOClosed(S.code);
  }
  function onClick(e) {
    var m = e.target.closest('.vto-m'); if (m) { select(m.dataset.code); return; }
    var b = e.target.closest('[data-a]'); if (!b) return; var a = b.dataset.a;
    if (a === 'close') close();
    else if (a === 'photo') $('#vtoFile', S.el).click();
    else if (a === 'cam') camFlow();
    else if (a === 'shot') { if (S.mode === 'photo' && !S.pres) return; capture(); }
    else if (a === 'big' || a === 'small') {
      S.adj = clamp((S.adj || 1) * (a === 'big' ? 1.04 : 1 / 1.04), 0.8, 1.35);
      try { localStorage.setItem('lebenVtoAdj', S.adj.toFixed(3)); } catch (x) {}
      if (S.mode === 'photo') renderPhoto();
      track('vto_size', { adj: +S.adj.toFixed(2) });
    }
    else if (a === 'lens-clear' || a === 'lens-sun') {
      S.lens = a === 'lens-sun' ? 'sun' : 'clear';
      S.el.querySelectorAll('.vto-lens button').forEach(function (x) { x.classList.toggle('on', x === b); });
      if (S.mode === 'photo') renderPhoto();
      track('vto_lens', { lens: S.lens });
    }
    else if (a === 'back') closePrev();
    else if (a === 'share') share();
    else if (a === 'save') save();
    else if (a === 'want') { if (window.lebenSel) { var q = window.lebenSel.get(S.code); window.lebenSel.set(S.code, q ? 0 : 1); paintWant(); } }
  }
  /* swipe na tela troca o modelo */
  (function () {
    var x0 = null; document.addEventListener('touchstart', function (e) { if (S.open && e.target.closest('.vto-stage')) x0 = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); }, { passive: true });
  })();

  function loadFR() {
    if (FR) return Promise.resolve(FR);
    return fetch(BASE + 'vto/frames.json').then(function (r) { return r.json(); }).then(function (j) { FR = j; return FR; });
  }
  window.lebenVTO = {
    open: open, close: close,
    ready: loadFR,
    has: function (c) { return !!(FR && FR[c]); },
    _state: S
  };
})();
