'use strict';
/* Tortas · Hechas a Mano — pantalla de cocina.
   Los tickets del día para el chef: qué hornear, con qué tamaño, la descripción
   de las personalizadas y las imágenes de referencia que subió el cliente.
   Los pedidos llegan de la web pública (data/pedidos.json via Apps Script) y se
   sondean cada 30s — funciona en cualquier dispositivo con un navegador. */

const app = (() => {
  const viewEl = document.getElementById('view');

  // ---------- iconos ----------
  const P = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    bell: '<path d="M6.4 9a5.6 5.6 0 0 1 11.2 0c0 6 2.4 7.5 2.4 7.5H4S6.4 15 6.4 9"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/>',
    img: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m5 19 5.5-5.5 3 3L17 13l4 4"/>',
    box: '<path d="M21 8.5v7a2 2 0 0 1-1 1.73l-6 3.5a2 2 0 0 1-2 0l-6-3.5a2 2 0 0 1-1-1.73v-7a2 2 0 0 1 1-1.73l6-3.5a2 2 0 0 1 2 0l6 3.5a2 2 0 0 1 1 1.73Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 12v9.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="3.5"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/><path d="M15.5 3.6a3.5 3.5 0 0 1 0 6.8"/>',
  };
  const icon = (n, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
  document.querySelectorAll('.nav a[data-icon]').forEach(a => a.insertAdjacentHTML('afterbegin', icon(a.dataset.icon, 17)));

  const META = { nuevo: { badge: 'b-blue' }, preparando: { badge: 'b-violet' }, enviado: { badge: 'b-amber' }, entregado: { badge: 'b-green' }, cancelado: { badge: 'b-red' } };
  const STATUS_LABEL = Store.STATUS_LABEL;
  const ACCION = { nuevo: 'Empezar a hornear', preparando: 'Marcar listo', enviado: 'Entregado' };

  function toast(msg, ic = 'bell') {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${icon(ic, 15)}<span>${msg}</span>`;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  // ---------- vista ----------
  viewEl.innerHTML = `
    <div class="view-head">
      <div>
        <h1>Cocina</h1>
        <div class="sub">${new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })} — los pedidos de la web llegan solos; pasa el dedo cuando el horno encienda.</div>
      </div>
    </div>
    <div class="kpis" id="prod-hoy"></div>
    <div id="tickets"></div>`;

  const TAMLABEL = { P: 'Pequeña', M: 'Mediana', G: 'Grande' };
  const imgRemota = ruta => ruta && ruta.startsWith('http') ? ruta : 'https://shusukegxe.github.io/venta-tortas-caseras/' + ruta;

  function activos() {
    return Store.db.orders.filter(o => ['nuevo', 'preparando', 'enviado'].includes(o.status))
      .sort((a, b) => (a.deliveryDate || '9999').localeCompare(b.deliveryDate || '9999'));
  }

  function updateProduccion() {
    const hoy = new Date().toDateString();
    const del = activos();
    const porTam = { P: 0, M: 0, G: 0, pers: 0 };
    for (const o of del) for (const it of o.items) {
      if (it.descripcion) porTam.pers += it.qty;
      else if (TAMLABEL[it.tam]) porTam[it.tam] += it.qty;
    }
    document.getElementById('prod-hoy').innerHTML = [
      ['clock', 'gold', 'Tortas en cola', del.length],
      ['box', 'blue', 'Pequeñas', porTam.P],
      ['box', 'violet', 'Medianas', porTam.M],
      ['box', 'green', 'Grandes', porTam.G],
      ['box', 'amber', 'Personalizadas', porTam.pers],
    ].map(([ic, cl, k, v]) => `
      <div class="kpi"><div class="ic ${cl}">${icon(ic, 17)}</div><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
  }

  function itemLinea(it) {
    const tam = it.tam && TAMLABEL[it.tam] ? ` <b>${TAMLABEL[it.tam]}</b>` : '';
    const lineas = [`<div class="tk-item">${it.qty}× ${Store.esc(it.name)}${tam} <span class="mono" style="color:var(--text-3)">${Store.money(it.price)}</span></div>`];
    if (it.descripcion) lineas.push(`<div class="tk-desc">${Store.esc(it.descripcion)}</div>`);
    if (it.images && it.images.length) {
      lineas.push(`<div class="tk-imgs">${it.images.map(r =>
        `<a href="${imgRemota(r)}" target="_blank" rel="noopener"><img src="${imgRemota(r)}" alt="referencia" loading="lazy"></a>`).join('')}</div>`);
    }
    return lineas.join('');
  }

  function updateTickets() {
    const lista = activos();
    document.getElementById('tickets').innerHTML = lista.length ? `<div class="cocina-grid">${lista.map(o => `
      <section class="card ticket">
        <div class="card-head">
          <span class="mono" style="font-weight:700">${o.id}</span>
          <span class="badge ${META[o.status].badge}"><span class="dot"></span>${STATUS_LABEL[o.status]}</span>
        </div>
        <div class="card-body">
          <div class="tk-cliente">${icon('users', 14)} ${Store.esc(o.customer.name)} · ${Store.esc(o.customer.phone)}</div>
          <div class="tk-meta">${icon('clock', 14)} entrega: <b>${o.deliveryDate ? Store.fecha(o.deliveryDate) : 'por coordinar'}</b>${o.customer.note ? ` · ${Store.esc(o.customer.note)}` : ''}</div>
          <div class="tk-items">${o.items.map(itemLinea).join('')}</div>
          ${Store.NEXT[o.status] ? `<button class="btn primary" style="width:100%;margin-top:12px" data-act="advance" data-id="${o.id}">${icon('arrow', 14)} ${ACCION[o.status]}</button>` : `<div class="dim" style="text-align:center;margin-top:10px">en reparto — fuera de la cocina</div>`}
        </div>
      </section>`).join('')}</div>`
      : '<div class="card" style="padding:40px;text-align:center;color:var(--text-3)">Sin tortas en cola — buen momento para preparar masas.</div>';
  }

  function updateAll() { updateProduccion(); updateTickets(); }

  // ---------- eventos ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act="advance"]');
    if (!el) return;
    Store.advanceOrder(el.dataset.id).catch(err => toast(Store.esc(err.message), 'bell'));
  });

  // pedidos reales entre dispositivos (web pública → data/pedidos.json)
  const FUENTE_PEDIDOS = 'https://shusukegxe.github.io/venta-tortas-caseras/data/pedidos.json';
  async function sondearRemoto() {
    try {
      const res = await fetch(FUENTE_PEDIDOS, { cache: 'no-store' });
      if (!res.ok) return;
      const n = Store.mergeRemote(await res.json());
      if (n > 0) toast(`${n} pedido${n > 1 ? 's' : ''} entró${n > 1 ? '' : ''} de la web`, 'receipt');
    } catch { /* sin conexión: sigue con lo local */ }
  }
  sondearRemoto();
  setInterval(sondearRemoto, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sondearRemoto(); });

  Store.subscribe(updateAll);
  updateAll();
})();
