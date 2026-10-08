// Y&Y Plastic — carrito y pedidos con retiro en tienda.
// Cada línea del carrito es por UNIDAD (al detalle) o por CAJA (al mayor). El stock se cuenta en unidades:
// 1 caja descuenta unidades_por_caja unidades. Precio y stock los valida Supabase (yyplastic_crear_pedido).
(() => {
  const { sb, state, $, esc, toast, abrirModal, cerrarModal, urlFoto, error, precio, linkWhatsapp, storage,
    esMayor, stockDe } = window.YY;
  const KEY = 'yy_carrito2';
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
    if (!r.ok || !d.url) {
      const msg = /email/i.test(d.error || '') ? 'Flow no aceptó ese correo. Revisa que esté bien escrito.' : (d.error || 'No se pudo iniciar el pago con Flow');
      throw new Error(msg);
    }
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

  const keyDe = (id, tipo) => `${id}:${tipo}`;
  const upcDe = (p) => Math.max(1, p.unidades_por_caja || 1);
  const minPara = (p, tipo) => (tipo === 'mayor' ? Math.max(1, p.minimo_mayor || 1) : 1);
  const unidadesDe = (i) => (i.tipo === 'mayor' ? i.cantidad * upcDe(i) : i.cantidad);
  const precioUnit = (p, tipo) => {
    const v = tipo === 'mayor' ? p.precio_mayor : p.precio_detalle;
    return v === null || v === undefined ? null : Number(v);
  };
  const palabra = (tipo, n = 2) => (tipo === 'mayor' ? (n === 1 ? 'caja' : 'cajas') : (n === 1 ? 'unidad' : 'unidades'));

  // Máximo de esa línea según el stock, descontando lo que ya hay en la otra línea del mismo producto
  function maxPara(p, tipo, key) {
    const otras = items.filter((i) => i.id === p.id && i.key !== key).reduce((a, i) => a + unidadesDe(i), 0);
    const libre = Math.max(0, stockDe(p) - otras);
    return tipo === 'mayor' ? Math.floor(libre / upcDe(p)) : libre;
  }

  const snapshot = (p, tipo) => ({
    key: keyDe(p.id, tipo), tipo, id: p.id, nombre: p.nombre, unidad: p.unidad, unidad_mayor: p.unidad_mayor, codigo: p.codigo,
    precio_detalle: p.precio_detalle, precio_mayor: p.precio_mayor, minimo_mayor: p.minimo_mayor,
    unidades_por_caja: p.unidades_por_caja, stock: p.stock, foto: p.fotos?.[0] || '',
  });

  function agregar(p, tipo, cantidad) {
    const key = keyDe(p.id, tipo);
    const it = items.find((i) => i.key === key);
    if (precioUnit(p, tipo) === null) { toast('Ese producto no tiene precio para esta opción', 'error'); return false; }
    const max = maxPara(p, tipo, key);
    const nueva = (it ? it.cantidad : 0) + cantidad;
    if (nueva > max) {
      toast(max <= 0 ? 'Sin stock' : `Solo quedan ${max} ${palabra(tipo, max)}`, 'error');
      return false;
    }
    if (it) Object.assign(it, snapshot(p, tipo), { cantidad: nueva });
    else items.push({ ...snapshot(p, tipo), cantidad: nueva });
    guardar();
    toast(`Agregado: ${p.nombre}`);
    return true;
  }

  // Botón "Agregar" de la tarjeta: 1 unidad al detalle, o el mínimo de cajas al mayor
  function agregarRapido(p) {
    const tipo = esMayor(p) ? 'mayor' : 'detalle';
    return agregar(p, tipo, minPara(p, tipo));
  }

  // "2 cajas de X" / "6 × X"
  const lineaTxt = (i) => (i.tipo_precio === 'mayor'
    ? `${i.cantidad} ${palabra('mayor', i.cantidad)} de ${i.nombre}`
    : `${i.cantidad} × ${i.nombre}`);

  function totales() {
    let total = 0; let sinPrecio = false;
    const filas = items.map((i) => {
      const unit = precioUnit(i, i.tipo);
      if (unit === null) sinPrecio = true;
      const sub = unit === null ? 0 : unit * i.cantidad;
      total += sub;
      return { ...i, unit, sub, max: maxPara(i, i.tipo, i.key), min: minPara(i, i.tipo) };
    });
    return { filas, total, sinPrecio };
  }

  // ---------- Selector en la ficha de producto ----------
  function montarEnFicha(cont, p) {
    if (!cont) return;
    const tipo = esMayor(p) ? 'mayor' : 'detalle';
    const unit = precioUnit(p, tipo);
    if (unit === null) return;
    const min = minPara(p, tipo);
    const max = maxPara(p, tipo, keyDe(p.id, tipo));
    if (max < min) {
      const sueltas = stockDe(p);
      cont.innerHTML = tipo === 'mayor'
        ? `<p class="nostock"><strong>Sin stock al mayor.</strong>${sueltas > 0 && precioUnit(p, 'detalle') !== null ? ` Quedan ${sueltas} unidades al detalle: cambia a "Al detalle" para comprarlas.` : ''}</p>`
        : '<p class="nostock"><strong>Sin stock</strong></p>';
      return;
    }
    cont.innerHTML = `
      <div class="addcart">
        <div class="qty">
          <button type="button" data-d="-1" aria-label="Menos">−</button>
          <input type="number" min="${min}" max="${max}" step="1" value="${min}" aria-label="Cantidad de ${palabra(tipo)}">
          <button type="button" data-d="1" aria-label="Más">+</button>
        </div>
        <button type="button" class="btn addcart__btn">Agregar al carrito</button>
      </div>
      <p class="addcart__hint" aria-live="polite"></p>`;
    const input = cont.querySelector('input');
    const hint = cont.querySelector('.addcart__hint');
    const leer = () => Math.min(max, Math.max(min, parseInt(input.value, 10) || min));
    const pintar = () => {
      const n = leer();
      const upc = upcDe(p);
      hint.innerHTML = `${n} ${palabra(tipo, n)} × ${precio(unit)} = <strong>${precio(unit * n)}</strong>`
        + (tipo === 'mayor' && upc > 1 ? ` (${n * upc} unidades)` : '')
        + `<br><span class="addcart__tip">Disponible: ${max} ${palabra(tipo, max)}${tipo === 'mayor' ? ` · mínimo ${min}` : ''}</span>`;
    };
    cont.querySelector('.qty').addEventListener('click', (e) => {
      const d = +e.target.closest('[data-d]')?.dataset.d || 0;
      if (!d) return;
      input.value = Math.min(max, Math.max(min, (parseInt(input.value, 10) || min) + d));
      pintar();
    });
    input.addEventListener('input', pintar);
    input.addEventListener('change', () => { input.value = leer(); pintar(); });
    cont.querySelector('.addcart__btn').addEventListener('click', () => {
      if (agregar(p, tipo, leer())) cerrarModal();
    });
    pintar();
  }

  // ---------- Carrito ----------
  function verCarrito() {
    const { filas, total, sinPrecio } = totales();
    const c = state.config;
    const body = abrirModal(`
      <div class="cart">
        <h2>Tu pedido</h2>
        ${filas.length ? `
        <ul class="cart__list">
          ${filas.map((i) => `
            <li class="cart__item" data-key="${esc(i.key)}">
              <div class="cart__img">${i.foto ? `<img src="${esc(urlFoto(i.foto))}" alt="">` : '<img src="assets/isotipo.svg" alt="" class="cart__ph">'}</div>
              <div class="cart__info">
                <strong>${esc(i.nombre)}</strong>
                ${(i.tipo === 'mayor' && i.unidad_mayor) || i.unidad ? `<small>${esc(i.tipo === 'mayor' && i.unidad_mayor ? i.unidad_mayor : i.unidad)}</small>` : ''}
                <small class="cart__tipo cart__tipo--${i.tipo}">${i.unit === null ? 'Sin precio' : `${precio(i.unit)} ${i.tipo === 'mayor' ? 'por caja · al mayor' : 'c/u · al detalle'}`}</small>
                ${i.tipo === 'mayor' && upcDe(i) > 1 ? `<small>${i.cantidad} ${palabra('mayor', i.cantidad)} = ${i.cantidad * upcDe(i)} unidades</small>` : ''}
                ${i.cantidad > i.max ? `<small class="cart__warn">Solo quedan ${i.max} ${palabra(i.tipo, i.max)}: ajusta la cantidad.</small>` : ''}
              </div>
              <div class="qty qty--small">
                <button type="button" data-d="-1" aria-label="Menos">−</button>
                <input type="number" min="${i.min}" max="${i.max}" value="${i.cantidad}" aria-label="Cantidad de ${palabra(i.tipo)}">
                <button type="button" data-d="1" aria-label="Más">+</button>
              </div>
              <span class="cart__sub">${precio(i.sub)}</span>
              <button type="button" class="cart__del" data-del aria-label="Quitar">×</button>
            </li>`).join('')}
        </ul>
        <div class="cart__total"><span>Total</span><strong>${precio(total)}</strong></div>
        ${sinPrecio ? '<p class="form__hint">Hay productos sin precio en esa opción; quítalos o consúltalos por WhatsApp.</p>' : ''}

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
          <div class="payinfo">
            <strong>Pago seguro con Flow</strong>
            <small>Tarjeta de crédito, débito o transferencia. Al terminar vuelves a esta página y ves tu pedido en curso.</small>
          </div>
          <div class="form__actions">
            <button type="button" class="btn btn--ghost" data-vaciar>Vaciar</button>
            <button type="submit" class="btn"${sinPrecio || filas.some((i) => i.cantidad > i.max) ? ' disabled' : ''}>Pagar con Flow</button>
          </div>
        </form>` : `<p class="empty">Tu carrito está vacío.</p>`}
      </div>`, 'modal--wide');

    const list = body.querySelector('.cart__list');
    const limitar = (it, n) => {
      const max = maxPara(it, it.tipo, it.key); const min = minPara(it, it.tipo);
      if (n > max) toast(max <= 0 ? 'Sin stock' : `Solo quedan ${max} ${palabra(it.tipo, max)}`, 'error');
      return Math.max(min, Math.min(Math.max(max, min), n));
    };
    list?.addEventListener('click', (e) => {
      const li = e.target.closest('.cart__item');
      if (!li) return;
      const it = items.find((i) => i.key === li.dataset.key);
      if (!it) return;
      if (e.target.closest('[data-del]')) items = items.filter((i) => i !== it);
      const d = +e.target.closest('[data-d]')?.dataset.d || 0;
      if (d) it.cantidad = limitar(it, it.cantidad + d);
      if (e.target.closest('[data-del]') || d) { guardar(); verCarrito(); }
    });
    list?.addEventListener('change', (e) => {
      const li = e.target.closest('.cart__item');
      const it = items.find((i) => i.key === li?.dataset.key);
      if (!it) return;
      it.cantidad = limitar(it, parseInt(e.target.value, 10) || 1);
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
          p_items: items.map((i) => ({ producto_id: i.id, tipo: i.tipo, cantidad: i.cantidad })),
          p_metodo_pago: 'online',
        });
        if (err) throw err;
        items = []; guardar();
        btn.textContent = 'Conectando con Flow…';
        try { return await irAPagar(data.codigo); }
        catch (err) { error(err); } // el pedido quedó creado: se puede reintentar el pago desde la confirmación
        confirmacion(data, f.nombre.value.trim());
      } catch (err) { error(err); btn.disabled = false; }
    });
  }

  // Solo se muestra si Flow no pudo abrirse: el pedido ya existe y falta pagarlo
  function confirmacion(pedido, nombre) {
    const urlSeg = `${location.origin}${location.pathname}?pedido=${pedido.codigo}`;
    const wa = linkWhatsapp(`Hola Y&Y Plastic! Soy ${nombre}. Tengo el pedido #${pedido.folio} (retiro en tienda) pendiente de pago por ${precio(pedido.total)} y necesito ayuda.`);
    const body = abrirModal(`
      <div class="done">
        <img src="assets/isotipo.svg" alt="" class="done__icon">
        <h2>Pedido #${pedido.folio} creado</h2>
        <p>Total: <strong>${precio(pedido.total)}</strong> · Retiro en tienda</p>
        <p class="form__hint">Falta el pago. No pudimos abrir Flow; tu pedido quedó guardado, inténtalo de nuevo.</p>
        <div class="done__actions">
          <button type="button" class="btn" id="btnPagarAhora">Pagar con Flow</button>
          <a class="btn btn--ghost" href="${esc(urlSeg)}">Ver estado del pedido</a>
          ${wa ? `<a class="btn btn--wa" href="${esc(wa)}" target="_blank" rel="noopener">Pedir ayuda por WhatsApp</a>` : ''}
        </div>
        <p class="form__hint">Guarda este enlace para pagar o revisar tu pedido: <br><small class="done__link">${esc(urlSeg)}</small></p>
      </div>`);
    body.querySelector('#btnPagarAhora').addEventListener('click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Conectando con Flow…';
      try { await irAPagar(pedido.codigo); } catch (err) { error(err); e.target.disabled = false; e.target.textContent = 'Pagar con Flow'; }
    });
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
          <ul class="track__items">${data.items.map((i) => `<li><span>${esc(lineaTxt(i))}</span><span>${precio(i.subtotal)}</span></li>`).join('')}</ul>
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

  window.YYCarrito = { agregar, agregarRapido, montarEnFicha, verCarrito, lineaTxt, ESTADOS, PAGOS };
})();
