// Y&Y Plastic — carrito y pedidos con retiro en tienda.
// El precio final lo calcula Supabase (yyplastic_crear_pedido); aquí solo se muestra
// la misma regla: precio al mayor automático al llegar a la cantidad mínima.
(() => {
  const { sb, state, $, esc, toast, abrirModal, cerrarModal, urlFoto, error, precio, linkWhatsapp, storage } = window.YY;
  const KEY = 'yy_carrito';
  const C = window.YY_CONFIG;

  // RUT chileno: formato 12.345.678-9 y validación del dígito verificador
  function rutLimpio(v) { return String(v || '').replace(/[^0-9kK]/g, '').toUpperCase(); }
  function rutFormato(v) {
    const r = rutLimpio(v);
    if (r.length < 2) return r;
    return `${r.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${r.slice(-1)}`;
  }
  function rutValido(v) {
    const r = rutLimpio(v);
    if (r.length < 8 || r.length > 9 || !/^\d+$/.test(r.slice(0, -1))) return false;
    let suma = 0; let mult = 2;
    for (let i = r.length - 2; i >= 0; i--) { suma += Number(r[i]) * mult; mult = mult === 7 ? 2 : mult + 1; }
    const dv = 11 - (suma % 11);
    return r.slice(-1) === (dv === 11 ? '0' : dv === 10 ? 'K' : String(dv));
  }

  async function irAPagar(codigo) {
    const r = await fetch(`${C.flowUrl}/crear`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) throw new Error(d.error || 'No se pudo iniciar el pago con Flow');
    location.href = d.url;
  }

  let items = [];
  try { items = JSON.parse(storage.get(KEY) || '[]'); } catch { items = []; }
  if (!Array.isArray(items)) items = [];

  function guardar() {
    storage.set(KEY, JSON.stringify(items));
    const n = items.reduce((a, i) => a + i.cantidad, 0);
    const c = $('#carritoCount');
    c.textContent = n > 99 ? '99+' : n;
    c.hidden = n === 0;
  }

  function precioDe(p, cantidad) {
    if (p.precio_mayor !== null && p.precio_mayor !== undefined && cantidad >= (p.minimo_mayor || 1)) {
      return { tipo: 'mayor', unit: Number(p.precio_mayor) };
    }
    if (p.precio_detalle === null || p.precio_detalle === undefined) return { tipo: 'detalle', unit: null };
    return { tipo: 'detalle', unit: Number(p.precio_detalle) };
  }

  const snapshot = (p) => ({
    id: p.id, nombre: p.nombre, unidad: p.unidad, codigo: p.codigo,
    precio_detalle: p.precio_detalle, precio_mayor: p.precio_mayor, minimo_mayor: p.minimo_mayor,
    foto: p.fotos?.[0] || '',
  });

  function agregar(p, cantidad = 1) {
    const it = items.find((i) => i.id === p.id);
    if (it) { it.cantidad += cantidad; Object.assign(it, snapshot(p), { cantidad: it.cantidad }); }
    else items.push({ ...snapshot(p), cantidad });
    guardar();
    toast(`Agregado: ${p.nombre}`);
  }

  function totales() {
    let total = 0; let sinPrecio = false;
    const filas = items.map((i) => {
      const pr = precioDe(i, i.cantidad);
      if (pr.unit === null) sinPrecio = true;
      const sub = pr.unit === null ? 0 : pr.unit * i.cantidad;
      total += sub;
      return { ...i, ...pr, sub };
    });
    return { filas, total, sinPrecio };
  }

  // ---------- Selector en la ficha de producto ----------
  function montarEnFicha(cont, p) {
    if (!cont || (p.precio_detalle === null && p.precio_mayor === null)) return;
    const minInicial = state.modo === 'mayor' && p.precio_mayor !== null && p.minimo_mayor ? p.minimo_mayor : 1;
    cont.innerHTML = `
      <div class="addcart">
        <div class="qty">
          <button type="button" data-d="-1" aria-label="Menos">−</button>
          <input type="number" min="1" step="1" value="${minInicial}" aria-label="Cantidad">
          <button type="button" data-d="1" aria-label="Más">+</button>
        </div>
        <button type="button" class="btn addcart__btn">Agregar al carrito</button>
      </div>
      <p class="addcart__hint" aria-live="polite"></p>`;
    const input = cont.querySelector('input');
    const hint = cont.querySelector('.addcart__hint');
    const pintar = () => {
      const n = Math.max(1, parseInt(input.value, 10) || 1);
      const pr = precioDe(p, n);
      let txt = pr.unit === null ? 'Sin precio al detalle: consulta por WhatsApp.' : `${n} × ${precio(pr.unit)} = <strong>${precio(pr.unit * n)}</strong> (precio ${pr.tipo === 'mayor' ? 'al mayor' : 'al detalle'})`;
      if (pr.tipo === 'detalle' && p.precio_mayor !== null && p.minimo_mayor && n < p.minimo_mayor) {
        txt += `<br><span class="addcart__tip">Llevando ${p.minimo_mayor} o más pagas ${precio(p.precio_mayor)} c/u.</span>`;
      }
      hint.innerHTML = txt;
    };
    cont.querySelector('.qty').addEventListener('click', (e) => {
      const d = +e.target.closest('[data-d]')?.dataset.d || 0;
      if (!d) return;
      input.value = Math.max(1, (parseInt(input.value, 10) || 1) + d);
      pintar();
    });
    input.addEventListener('input', pintar);
    cont.querySelector('.addcart__btn').addEventListener('click', () => {
      const n = Math.max(1, parseInt(input.value, 10) || 1);
      if (precioDe(p, n).unit === null) return toast('Ese producto no tiene precio para esa cantidad', 'error');
      agregar(p, n);
      cerrarModal();
    });
    pintar();
  }

  // ---------- Carrito ----------
  function verCarrito() {
    const { filas, total, sinPrecio } = totales();
    const c = state.config;
    const pagoOnline = c.pago_online_activo === 'si';
    const body = abrirModal(`
      <div class="cart">
        <h2>Tu pedido</h2>
        ${filas.length ? `
        <ul class="cart__list">
          ${filas.map((i) => `
            <li class="cart__item" data-id="${i.id}">
              <div class="cart__img">${i.foto ? `<img src="${esc(urlFoto(i.foto))}" alt="">` : '<img src="assets/isotipo.svg" alt="" class="cart__ph">'}</div>
              <div class="cart__info">
                <strong>${esc(i.nombre)}</strong>
                ${i.unidad ? `<small>${esc(i.unidad)}</small>` : ''}
                <small class="cart__tipo cart__tipo--${i.tipo}">${i.unit === null ? 'Sin precio' : `${precio(i.unit)} c/u · ${i.tipo === 'mayor' ? 'al mayor' : 'al detalle'}`}</small>
              </div>
              <div class="qty qty--small">
                <button type="button" data-d="-1" aria-label="Menos">−</button>
                <input type="number" min="1" value="${i.cantidad}" aria-label="Cantidad">
                <button type="button" data-d="1" aria-label="Más">+</button>
              </div>
              <span class="cart__sub">${precio(i.sub)}</span>
              <button type="button" class="cart__del" data-del aria-label="Quitar">×</button>
            </li>`).join('')}
        </ul>
        <div class="cart__total"><span>Total</span><strong>${precio(total)}</strong></div>
        ${sinPrecio ? '<p class="form__hint">Hay productos sin precio para esa cantidad; quítalos o consúltalos por WhatsApp.</p>' : ''}

        <form class="form cart__form" id="fPedido">
          <div class="pickup">
            <strong>Retiro en tienda</strong>
            ${c.retiro_direccion || c.direccion ? `<span>${esc(c.retiro_direccion || c.direccion)}</span>` : ''}
            ${c.horario ? `<span>Horario: ${esc(c.horario)}</span>` : ''}
            ${c.retiro_instrucciones ? `<small>${esc(c.retiro_instrucciones)}</small>` : ''}
          </div>
          <div class="form__row">
            <label>Nombre y apellido *<input name="nombre" required autocomplete="name" placeholder="Ej: Juan Pérez" value="${esc(storage.get('yy_cli_nombre') || '')}"></label>
            <label>RUT *<input name="rut" required placeholder="12.345.678-9" maxlength="12" value="${esc(storage.get('yy_cli_rut') || '')}"></label>
          </div>
          <div class="form__row">
            <label>Correo *<input name="email" required type="email" autocomplete="email" placeholder="tucorreo@ejemplo.cl" value="${esc(storage.get('yy_cli_email') || '')}"></label>
            <label>Teléfono *<input name="telefono" required type="tel" autocomplete="tel" placeholder="+56 9 1234 5678" value="${esc(storage.get('yy_cli_tel') || '')}"></label>
          </div>
          <label>Comentarios (opcional)<textarea name="notas" rows="2" placeholder="Ej: retiro el sábado en la mañana"></textarea></label>
          <fieldset class="paymethods">
            <legend>Forma de pago</legend>
            ${pagoOnline ? '<label class="check"><input type="radio" name="pago" value="online" checked> Pagar online con Flow <small>(tarjetas, débito o transferencia)</small></label>' : ''}
            <label class="check"><input type="radio" name="pago" value="en_tienda"${pagoOnline ? '' : ' checked'}> Pago al retirar en tienda</label>
          </fieldset>
          <div class="form__actions">
            <button type="button" class="btn btn--ghost" data-vaciar>Vaciar</button>
            <button type="submit" class="btn"${sinPrecio ? ' disabled' : ''}>Enviar pedido</button>
          </div>
        </form>` : `<p class="empty">Tu carrito está vacío.</p>`}
      </div>`, 'modal--wide');

    const list = body.querySelector('.cart__list');
    list?.addEventListener('click', (e) => {
      const li = e.target.closest('.cart__item');
      if (!li) return;
      const it = items.find((i) => String(i.id) === li.dataset.id);
      if (e.target.closest('[data-del]')) items = items.filter((i) => i !== it);
      const d = +e.target.closest('[data-d]')?.dataset.d || 0;
      if (d) it.cantidad = Math.max(1, it.cantidad + d);
      if (e.target.closest('[data-del]') || d) { guardar(); verCarrito(); }
    });
    list?.addEventListener('change', (e) => {
      const li = e.target.closest('.cart__item');
      const it = items.find((i) => String(i.id) === li?.dataset.id);
      if (!it) return;
      it.cantidad = Math.max(1, parseInt(e.target.value, 10) || 1);
      guardar(); verCarrito();
    });
    body.querySelector('#fPedido [name=rut]')?.addEventListener('blur', (e) => { e.target.value = rutFormato(e.target.value); });
    body.querySelector('[data-vaciar]')?.addEventListener('click', () => {
      if (!confirm('¿Vaciar el carrito?')) return;
      items = []; guardar(); verCarrito();
    });

    body.querySelector('#fPedido')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      if (!/\S+\s+\S+/.test(f.nombre.value.trim())) { f.nombre.focus(); return toast('Ingresa nombre y apellido', 'error'); }
      if (!rutValido(f.rut.value)) { f.rut.focus(); return toast('El RUT no es válido', 'error'); }
      const btn = e.submitter; btn.disabled = true;
      try {
        storage.set('yy_cli_nombre', f.nombre.value.trim());
        storage.set('yy_cli_rut', rutFormato(f.rut.value));
        storage.set('yy_cli_email', f.email.value.trim());
        storage.set('yy_cli_tel', f.telefono.value.trim());
        const { data, error: err } = await sb.rpc('yyplastic_crear_pedido', {
          p_cliente: { nombre: f.nombre.value, rut: f.rut.value, telefono: f.telefono.value, email: f.email.value, notas: f.notas.value },
          p_items: items.map((i) => ({ producto_id: i.id, cantidad: i.cantidad })),
          p_metodo_pago: f.pago.value,
        });
        if (err) throw err;
        const resumen = items.map((i) => `• ${i.cantidad} × ${i.nombre}`).join('\n');
        items = []; guardar();
        if (f.pago.value === 'online') {
          btn.textContent = 'Conectando con Flow…';
          try { return await irAPagar(data.codigo); }
          catch (err) { error(err); } // si falla, el pedido queda creado y puede pagarlo desde el seguimiento
        }
        confirmacion(data, f.nombre.value.trim(), resumen);
      } catch (err) { error(err); btn.disabled = false; }
    });
  }

  function confirmacion(pedido, nombre, resumen) {
    const urlSeg = `${location.origin}${location.pathname}?pedido=${pedido.codigo}`;
    const wa = linkWhatsapp(`Hola Y&Y Plastic! Soy ${nombre}. Acabo de hacer el pedido #${pedido.folio} para retiro en tienda:\n${resumen}\nTotal: ${precio(pedido.total)}`);
    abrirModal(`
      <div class="done">
        <img src="assets/isotipo.svg" alt="" class="done__icon">
        <h2>¡Pedido #${pedido.folio} recibido!</h2>
        <p>Total: <strong>${precio(pedido.total)}</strong> · Retiro en tienda</p>
        <p class="form__hint">${esc(state.config.retiro_instrucciones || 'Te contactaremos cuando esté listo.')}</p>
        <div class="done__actions">
          ${wa ? `<a class="btn btn--wa" href="${esc(wa)}" target="_blank" rel="noopener">Avisar por WhatsApp</a>` : ''}
          <a class="btn btn--ghost" href="${esc(urlSeg)}">Ver estado del pedido</a>
        </div>
        <p class="form__hint">Guarda este enlace para revisar tu pedido: <br><small class="done__link">${esc(urlSeg)}</small></p>
      </div>`);
  }

  // ---------- Seguimiento (?pedido=codigo) ----------
  const ESTADOS = { nuevo: 'Recibido', confirmado: 'Confirmado', preparando: 'En preparación', listo: 'Listo para retirar', entregado: 'Entregado', cancelado: 'Cancelado' };
  const PAGOS = { pendiente: 'Pendiente', pagado: 'Pagado', fallido: 'Pago fallido', reembolsado: 'Reembolsado' };

  async function seguimiento(codigo) {
    try {
      const { data, error: err } = await sb.rpc('yyplastic_ver_pedido', { p_codigo: codigo });
      if (err) throw err;
      if (!data) return toast('No encontramos ese pedido', 'error');
      const pasos = ['nuevo', 'confirmado', 'preparando', 'listo', 'entregado'];
      const idx = pasos.indexOf(data.estado);
      const vuelta = new URLSearchParams(location.search).get('pago');
      const aviso = vuelta === 'pagado' ? '<p class="pay-banner pay-banner--ok">¡Pago recibido! Tu pedido está confirmado.</p>'
        : vuelta === 'fallido' ? '<p class="pay-banner pay-banner--error">El pago no se completó. Puedes intentarlo de nuevo.</p>'
        : vuelta === 'pendiente' ? '<p class="pay-banner">Tu pago está en proceso; Flow lo confirmará en unos minutos.</p>' : '';
      if (vuelta === 'pagado') { items = []; guardar(); }
      abrirModal(`
        <div class="track">
          ${aviso}
          <h2>Pedido #${data.folio}</h2>
          <p class="form__hint">${esc(data.cliente_nombre)} · ${new Date(data.creado_en).toLocaleString('es-CL')}</p>
          ${data.estado === 'cancelado' ? '<p class="status status--cancelado">Pedido cancelado</p>' : `
          <ol class="steps">${pasos.map((s, i) => `<li class="${i <= idx ? 'is-done' : ''}">${ESTADOS[s]}</li>`).join('')}</ol>`}
          <ul class="track__items">${data.items.map((i) => `<li><span>${i.cantidad} × ${esc(i.nombre)}</span><span>${precio(i.subtotal)}</span></li>`).join('')}</ul>
          <div class="cart__total"><span>Total</span><strong>${precio(data.total)}</strong></div>
          <p class="form__hint">Pago: ${data.metodo_pago === 'online' ? 'online con Flow' : 'al retirar en tienda'} · <strong class="pay pay--${data.estado_pago}">${PAGOS[data.estado_pago]}</strong></p>
          ${data.metodo_pago === 'online' && ['pendiente', 'fallido'].includes(data.estado_pago) && data.estado !== 'cancelado'
            ? '<button class="btn" id="btnPagar" type="button">Pagar ahora con Flow</button>' : ''}
          <p class="form__hint">Retiro en tienda. ${esc(state.config.retiro_instrucciones || '')}</p>
        </div>`);
      document.querySelector('#btnPagar')?.addEventListener('click', async (e) => {
        e.target.disabled = true; e.target.textContent = 'Conectando con Flow…';
        try { await irAPagar(codigo); } catch (err) { error(err); e.target.disabled = false; e.target.textContent = 'Pagar ahora con Flow'; }
      });
    } catch (e) { error(e); }
  }

  $('#btnCarrito').addEventListener('click', verCarrito);
  guardar();

  const codigo = new URLSearchParams(location.search).get('pedido');
  if (codigo) seguimiento(codigo);

  window.YYCarrito = { agregar, montarEnFicha, verCarrito, ESTADOS, PAGOS };
})();
