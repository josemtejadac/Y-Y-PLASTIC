// Y&Y Plastic — pedidos en tiempo real para el dueño (modo admin).
// Supabase avisa por el canal "yyplastic-pedidos" (solo id/folio, sin datos del cliente);
// el detalle se trae con el token de admin. Además se revisa cada 60 s por si se cae la conexión.
(() => {
  const { sb, state, $, esc, toast, abrirModal, error, precio } = window.YY;
  const { ESTADOS, PAGOS } = window.YYCarrito;
  const tituloBase = document.title;

  let pedidos = [];
  let conocidos = null; // ids ya vistos en esta sesión (para detectar nuevos)
  let canal = null;
  let poll = null;
  let filtro = 'activos';
  let panelAbierto = false;

  async function cargar() {
    if (!state.admin) return;
    const { data, error: e } = await sb.rpc('yyplastic_admin_pedidos', { p_password: state.admin.password, p_limite: 200 });
    if (e) throw e;
    const nuevos = conocidos ? data.filter((p) => !conocidos.has(p.id)) : [];
    const pagados = conocidos ? data.filter((p) => conocidos.has(p.id) && p.estado_pago === 'pagado'
      && pedidos.find((x) => x.id === p.id)?.estado_pago !== 'pagado') : [];
    pedidos = data;
    conocidos = new Set(data.map((p) => p.id));
    nuevos.forEach((p) => alertar(p));
    pagados.forEach((p) => alertar(p, true));
    pintarBadge();
    if (panelAbierto) pintarPanel();
  }

  function pintarBadge() {
    const n = pedidos.filter((p) => !p.visto).length;
    const b = $('#pedidosBadge');
    b.textContent = n;
    b.hidden = n === 0;
    document.title = n ? `(${n}) Pedidos · ${tituloBase}` : tituloBase;
  }

  // ---------- Avisos ----------
  let audio;
  function sonar() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18, 0.36].forEach((t, i) => {
        const o = audio.createOscillator(); const g = audio.createGain();
        o.frequency.value = [880, 1175, 1568][i];
        g.gain.setValueAtTime(0.0001, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.35, audio.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.16);
        o.connect(g).connect(audio.destination);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.17);
      });
    } catch { /* sin audio */ }
  }

  function alertar(p, pago = false) {
    sonar();
    toast(pago ? `💳 Pago recibido · pedido #${p.folio} · ${precio(p.total)}` : `🛒 Nuevo pedido #${p.folio} · ${p.cliente_nombre} · ${precio(p.total)}`);
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const n = new Notification(pago ? `Pago recibido #${p.folio}` : `Nuevo pedido #${p.folio}`, {
          body: `${p.cliente_nombre} · ${precio(p.total)} · retiro en tienda`, icon: 'assets/isotipo.svg', tag: `yy-${p.id}`,
        });
        n.onclick = () => { window.focus(); abrir(); };
      } catch { /* algunos móviles no permiten new Notification */ }
    }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  let tRecarga;
  const recargarPronto = () => { clearTimeout(tRecarga); tRecarga = setTimeout(() => cargar().catch(console.error), 400); };

  function iniciar() {
    detener();
    conocidos = null;
    cargar().catch(error);
    canal = sb.channel('yyplastic-pedidos')
      .on('broadcast', { event: 'pedido' }, recargarPronto)
      .subscribe();
    poll = setInterval(() => cargar().catch(console.error), 60000);
    document.addEventListener('visibilitychange', alVolver);
  }
  function alVolver() { if (!document.hidden) recargarPronto(); }

  function detener() {
    if (canal) { sb.removeChannel(canal); canal = null; }
    clearInterval(poll);
    document.removeEventListener('visibilitychange', alVolver);
    pedidos = []; conocidos = null;
    const b = $('#pedidosBadge'); if (b) b.hidden = true;
    document.title = tituloBase;
  }

  // ---------- Panel ----------
  const fecha = (s) => new Date(s).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const waCliente = (p, msg) => {
    let num = (p.cliente_telefono || '').replace(/\D/g, '');
    if (num.length === 9 && num.startsWith('9')) num = `56${num}`;
    return num ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}` : null;
  };

  function tarjetaPedido(p) {
    const listo = waCliente(p, `Hola ${p.cliente_nombre}! Tu pedido #${p.folio} de Y&Y Plastic está listo para retirar. Total: ${precio(p.total)}.`);
    const hola = waCliente(p, `Hola ${p.cliente_nombre}, te escribimos de Y&Y Plastic por tu pedido #${p.folio}.`);
    return `
      <article class="order${p.visto ? '' : ' is-new'} order--${p.estado}" data-id="${p.id}">
        <header class="order__head">
          <div>
            <strong>#${p.folio}</strong> ${p.visto ? '' : '<span class="badge badge--inline">Nuevo</span>'}
            <small>${fecha(p.creado_en)}</small>
          </div>
          <div class="order__pay">
            <strong class="order__total">${precio(p.total)}</strong>
            <span class="pay-chip pay-chip--${p.estado_pago}">${p.metodo_pago === 'online' ? 'Flow' : 'En tienda'} · ${PAGOS[p.estado_pago]}</span>
          </div>
        </header>
        <div class="order__client">
          <span>${esc(p.cliente_nombre)}</span>
          ${p.cliente_rut ? `<span class="order__rut">RUT ${esc(p.cliente_rut)}</span>` : ''}
          <a href="tel:${esc(p.cliente_telefono)}">${esc(p.cliente_telefono)}</a>
          ${p.cliente_email ? `<a href="mailto:${esc(p.cliente_email)}">${esc(p.cliente_email)}</a>` : ''}
        </div>
        <ul class="order__items">
          ${p.items.map((i) => `<li><span>${i.cantidad} × ${esc(i.nombre)}${i.unidad ? ` <small>(${esc(i.unidad)})</small>` : ''}</span>
            <span><small>${i.tipo_precio === 'mayor' ? 'mayor' : 'detalle'}</small> ${precio(i.subtotal)}</span></li>`).join('')}
        </ul>
        ${p.notas ? `<p class="order__notes">“${esc(p.notas)}”</p>` : ''}
        <div class="order__controls">
          <label>Estado
            <select data-campo="estado">${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}"${k === p.estado ? ' selected' : ''}>${v}</option>`).join('')}</select>
          </label>
          <label>Pago (${p.metodo_pago === 'online' ? 'online' : 'en tienda'})
            <select data-campo="estado_pago">${Object.entries(PAGOS).map(([k, v]) => `<option value="${k}"${k === p.estado_pago ? ' selected' : ''}>${v}</option>`).join('')}</select>
          </label>
        </div>
        <div class="order__actions">
          ${hola ? `<a class="btn btn--small btn--ghost" href="${esc(hola)}" target="_blank" rel="noopener">WhatsApp cliente</a>` : ''}
          ${listo ? `<a class="btn btn--small btn--wa" href="${esc(listo)}" target="_blank" rel="noopener" data-listo>Avisar "listo"</a>` : ''}
          ${p.visto ? '' : '<button class="btn btn--small" data-visto>Marcar visto</button>'}
        </div>
      </article>`;
  }

  function pintarPanel() {
    const body = $('#modalBody');
    const lista = body.querySelector('#ordersList');
    if (!lista) return;
    const activos = (p) => !['entregado', 'cancelado'].includes(p.estado);
    const visibles = pedidos.filter(filtro === 'activos' ? activos : () => true);
    body.querySelectorAll('[data-filtro]').forEach((b) => b.classList.toggle('is-active', b.dataset.filtro === filtro));
    lista.innerHTML = visibles.map(tarjetaPedido).join('') || '<p class="empty">No hay pedidos aquí todavía.</p>';
  }

  async function actualizar(id, cambios) {
    const { error: e } = await sb.rpc('yyplastic_actualizar_pedido', { p_password: state.admin.password, p_id: id, ...cambios });
    if (e) throw e;
    const p = pedidos.find((x) => x.id === id);
    if (p) {
      if (cambios.p_estado) p.estado = cambios.p_estado;
      if (cambios.p_estado_pago) p.estado_pago = cambios.p_estado_pago;
      if (cambios.p_visto !== undefined && cambios.p_visto !== null) p.visto = cambios.p_visto;
    }
    pintarBadge();
    pintarPanel();
  }

  function abrir() {
    panelAbierto = true;
    const notifs = 'Notification' in window && Notification.permission !== 'granted'
      ? '<button class="btn btn--small btn--ghost" id="btnNotif">Activar notificaciones</button>' : '';
    const body = abrirModal(`
      <div class="orders">
        <div class="orders__top">
          <h2>Pedidos</h2>
          <span class="live"><i></i> En vivo</span>
          ${notifs}
        </div>
        <div class="chips">
          <button class="chip" data-filtro="activos">Activos</button>
          <button class="chip" data-filtro="todos">Todos</button>
        </div>
        <div id="ordersList" class="orders__list"></div>
      </div>`, 'modal--wide');
    const modal = $('#modal');
    modal.addEventListener('close', () => { panelAbierto = false; }, { once: true });
    pintarPanel();
    cargar().catch(error);

    body.querySelector('#btnNotif')?.addEventListener('click', async (e) => {
      const r = await Notification.requestPermission();
      if (r === 'granted') { toast('Notificaciones activadas'); e.target.remove(); }
      else toast('El navegador bloqueó las notificaciones', 'error');
    });
    const root = body.querySelector('.orders');
    root.addEventListener('click', (e) => {
      const f = e.target.closest('[data-filtro]');
      if (f) { filtro = f.dataset.filtro; return pintarPanel(); }
      const card = e.target.closest('.order');
      if (!card) return;
      const id = Number(card.dataset.id);
      if (e.target.closest('[data-visto]')) actualizar(id, { p_visto: true }).catch(error);
      if (e.target.closest('[data-listo]')) actualizar(id, { p_estado: 'listo', p_visto: true }).catch(error);
    });
    root.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-campo]');
      if (!sel) return;
      const id = Number(sel.closest('.order').dataset.id);
      const cambios = sel.dataset.campo === 'estado' ? { p_estado: sel.value } : { p_estado_pago: sel.value };
      actualizar(id, { ...cambios, p_visto: true }).then(() => toast('Pedido actualizado')).catch(error);
    });
  }

  window.YYPedidos = { iniciar, detener, abrir };
  if (state.admin) iniciar(); // por si la sesión se reanudó antes de cargar este archivo
})();
