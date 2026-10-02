// Y&Y Plastic — carrito y pedidos con retiro en tienda.
// El precio final lo calcula Supabase (yyplastic_crear_pedido); aquí solo se muestra
// la misma regla: precio al mayor automático al llegar a la cantidad mínima.
(() => {
  const { sb, state, $, esc, toast, abrirModal, cerrarModal, urlFoto, error, precio, linkWhatsapp, storage } = window.YY;
  const KEY = 'yy_carrito';

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
            <label>Nombre *<input name="nombre" required autocomplete="name" value="${esc(storage.get('yy_cli_nombre') || '')}"></label>
            <label>Teléfono / WhatsApp *<input name="telefono" required type="tel" autocomplete="tel" placeholder="+56 9 ..." value="${esc(storage.get('yy_cli_tel') || '')}"></label>
          </div>
          <label>Correo (opcional)<input name="email" type="email" autocomplete="email"></label>
          <label>Comentarios (opcional)<textarea name="notas" rows="2" placeholder="Ej: retiro el sábado en la mañana"></textarea></label>
          <fieldset class="paymethods">
            <legend>Forma de pago</legend>
            <label class="check"><input type="radio" name="pago" value="en_tienda" checked> Pago al retirar en tienda</label>
            ${pagoOnline ? '<label class="check"><input type="radio" name="pago" value="online"> Pagar online ahora</label>' : ''}
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
    body.querySelector('[data-vaciar]')?.addEventListener('click', () => {
      if (!confirm('¿Vaciar el carrito?')) return;
      items = []; guardar(); verCarrito();
    });

    body.querySelector('#fPedido')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const btn = e.submitter; btn.disabled = true;
      try {
        storage.set('yy_cli_nombre', f.nombre.value.trim());
        storage.set('yy_cli_tel', f.telefono.value.trim());
        const { data, error: err } = await sb.rpc('yyplastic_crear_pedido', {
          p_cliente: { nombre: f.nombre.value, telefono: f.telefono.value, email: f.email.value, notas: f.notas.value },
          p_items: items.map((i) => ({ producto_id: i.id, cantidad: i.cantidad })),
          p_metodo_pago: f.pago.value,
        });
        if (err) throw err;
        const resumen = items.map((i) => `• ${i.cantidad} × ${i.nombre}`).join('\n');
        items = []; guardar();
        if (f.pago.value === 'online') {
          // Aquí se conectará la pasarela de pago (crear transacción y redirigir).
          toast('Pedido creado. El pago online se habilitará pronto.');
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
      abrirModal(`
        <div class="track">
          <h2>Pedido #${data.folio}</h2>
          <p class="form__hint">${esc(data.cliente_nombre)} · ${new Date(data.creado_en).toLocaleString('es-CL')}</p>
          ${data.estado === 'cancelado' ? '<p class="status status--cancelado">Pedido cancelado</p>' : `
          <ol class="steps">${pasos.map((s, i) => `<li class="${i <= idx ? 'is-done' : ''}">${ESTADOS[s]}</li>`).join('')}</ol>`}
          <ul class="track__items">${data.items.map((i) => `<li><span>${i.cantidad} × ${esc(i.nombre)}</span><span>${precio(i.subtotal)}</span></li>`).join('')}</ul>
          <div class="cart__total"><span>Total</span><strong>${precio(data.total)}</strong></div>
          <p class="form__hint">Pago: ${data.metodo_pago === 'online' ? 'online' : 'al retirar en tienda'} · ${PAGOS[data.estado_pago]}</p>
        </div>`);
    } catch (e) { error(e); }
  }

  $('#btnCarrito').addEventListener('click', verCarrito);
  guardar();

  const codigo = new URLSearchParams(location.search).get('pedido');
  if (codigo) seguimiento(codigo);

  window.YYCarrito = { agregar, montarEnFicha, verCarrito, ESTADOS, PAGOS };
})();
