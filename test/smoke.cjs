'use strict';
/* Smoke test de la pantalla de cocina (código real sobre jsdom). */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const DIR = __dirname + '/..';
const html = fs.readFileSync(`${DIR}/index.html`, 'utf8')
  .replace('<script src="core.js"></script>', () => `<script>\n${fs.readFileSync(`${DIR}/core.js`, 'utf8')}\n</script>`)
  .replace('<script src="app.js"></script>', () => `<script>\n${fs.readFileSync(`${DIR}/app.js`, 'utf8')}\n</script>`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK ' : ' FAIL') + ' ' + msg); if (!cond) fails++; };

(async () => {
  const remotos = [
    {
      id: 'O-0200', customer: { name: 'Sofía Ríos', phone: '977222333', address: 'Jr. Dulce 7', note: 'para las 4pm' },
      items: [
        { pid: 'p1', name: 'Selva Negra · Mediana', price: 72, qty: 2, tam: 'M' },
        { pid: 'p5', name: 'Personalizada', price: 120, qty: 1, descripcion: 'Torta personalizada: masa de vainilla, tema de mariposas, dedicatoria "Feliz 15, Sofía".', images: ['uploads/O-0200-1.jpg'] },
      ],
      total: 264, payMethod: 'transferencia', payStatus: 'pendiente', status: 'nuevo',
      deliveryDate: new Date().toISOString().slice(0, 10), createdAt: Date.now(),
      history: [{ status: 'nuevo', at: Date.now() }],
    },
    {
      id: 'O-0199', customer: { name: 'Ana Torres', phone: '5550101', address: 'Calle 1 #23', note: '' },
      items: [{ pid: 'p4', name: 'Torta de Chantilly · Grande', price: 82, qty: 1, tam: 'G' }],
      total: 82, payMethod: 'efectivo', payStatus: 'pendiente', status: 'entregado',
      deliveryDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10), createdAt: Date.now() - 86400000,
      history: [{ status: 'nuevo', at: Date.now() - 86400000 }],
    },
  ];

  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(window) {
      window.Notification = { permission: 'default', requestPermission: async () => 'granted' };
      window.fetch = async () => ({ ok: true, json: async () => remotos });
    },
  });
  dom.window.onerror = e => { console.log('  ONERROR ' + e); fails++; };
  const d = dom.window.document;
  await sleep(700);

  // 1. producción del día
  ok(d.getElementById('btn-avisos') && !d.getElementById('btn-avisos').hidden, 'avisos: botón visible con permiso en default');
  ok(d.querySelectorAll('.kpi').length === 5, 'cocina: 5 KPIs de producción');
  ok(d.getElementById('prod-hoy').textContent.includes('Tortas en cola'), 'cocina: tortas en cola visible');

  // 2. tickets: solo activos, con tamaños, descripción e imágenes
  ok(d.querySelectorAll('.ticket').length === 2, 'cocina: 2 tickets activos (remoto + ejemplo; el entregado se oculta)');
  const ticket = [...d.querySelectorAll('.ticket')].find(t => t.textContent.includes('O-0200')).textContent;
  ok(ticket.includes('Sofía Ríos'), 'ticket: id y cliente remotos visibles');
  ok(ticket.includes('Mediana'), 'ticket: tamaño Mediana resaltado');
  ok(ticket.includes('mariposas'), 'ticket: descripción de la personalizada visible');
  ok(!!d.querySelector('.tk-imgs img'), 'ticket: imagen de referencia del cliente');

  // 3. avanzar en la cocina: nuevo → en preparación → en camino
  d.querySelector('[data-act="advance"][data-id="O-0200"]').click();
  await sleep(1100);
  ok(d.querySelector('.ticket').textContent.includes('En preparación'), 'cocina: O-0200 en preparación');
  ok(d.querySelector('.ticket').textContent.includes('Marcar listo'), 'cocina: siguiente acción "Marcar listo"');
  d.querySelector('[data-act="advance"][data-id="O-0200"]').click();
  await sleep(1100);
  const t2 = [...d.querySelectorAll('.ticket')].find(t => t.textContent.includes('O-0200'));
  ok(t2.textContent.includes('En camino'), 'cocina: O-0200 en camino');
  ok(t2.textContent.includes('Entregado'), 'cocina: botón final "Entregado" disponible');
  t2.querySelector('[data-act="advance"]').click();
  await sleep(1100);
  const t3 = [...d.querySelectorAll('.ticket')];
  ok(!t3.some(t => t.textContent.includes('O-0200')), 'cocina: entregado sale de la cocina');

  // 4. persistencia local de los estados
  const local = JSON.parse(dom.window.localStorage.getItem('tortas-pedidos-v1'));
  ok(local.orders.find(o => o.id === 'O-0200').status === 'entregado', 'cocina: estado persistido localmente');

  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('EXCEPCIÓN:', e); process.exit(1); });
