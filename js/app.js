// Y&Y Plastic — catálogo público
(() => {
  const C = window.YY_CONFIG;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
    auth: { persistSession: false },
  });

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const fmt = new Intl.NumberFormat(C.locale, { style: 'currency', currency: C.moneda, maximumFractionDigits: C.moneda === 'CLP' ? 0 : 2 });
  const precio = (n) => (n === null || n === undefined || n === '' ? null : fmt.format(Number(n)));

  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin storage */ } },
  };

  const state = {
    config: {},
    categorias: [],
    slides: [],
    productos: [],
    modo: storage.get('yy_modo') === 'mayor' ? 'mayor' : 'detalle',
    categoria: null,
    busqueda: '',
    pagina: 0,
    hayMas: false,
    admin: null, // { password, productos } cuando el modo admin está activo
  };

  // ---------- Utilidades UI ----------
  let toastTimer;
  function toast(msg, tipo = 'ok') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = `toast is-visible toast--${tipo}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 3200);
  }

  const modal = $('#modal');
  function abrirModal(html, clase = '') {
    $('#modalBody').innerHTML = html;
    modal.className = `modal ${clase}`;
    if (!modal.open) modal.showModal();
    return $('#modalBody');
  }
  function cerrarModal() { if (modal.open) modal.close(); }
  $('#modalClose').addEventListener('click', cerrarModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) cerrarModal(); });

  function urlFoto(path) {
    if (!path) return '';
    if (/^https?:\/\//.test(path)) return path;
    return sb.storage.from(C.bucket).getPublicUrl(path).data.publicUrl;
  }

  function linkWhatsapp(texto) {
    const num = (state.config.whatsapp || '').replace(/\D/g, '');
    if (!num) return null;
    return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
  }

  // ---------- Carga de datos ----------
  async function cargarConfig() {
    const { data, error } = await sb.from('yyplastic_config').select('clave, valor');
    if (error) throw error;
    state.config = Object.fromEntries(data.map((r) => [r.clave, r.valor]));
  }

  async function cargarCategorias() {
    const { data, error } = await sb.from('yyplastic_categorias').select('*').order('orden').order('nombre');
    if (error) throw error;
    state.categorias = data;
  }

  async function cargarSlides() {
    if (state.admin) {
      const { data, error } = await sb.rpc('yyplastic_admin_carrusel', { p_password: state.admin.password });
      if (error) throw error;
      state.slides = data;
    } else {
      const { data, error } = await sb.from('yyplastic_carrusel').select('*').order('orden').order('id');
      if (error) throw error;
      state.slides = data;
    }
  }

  const limpiarBusqueda = (q) => q.replace(/[%,()*\\]/g, ' ').trim();

  async function cargarProductos({ reiniciar = true } = {}) {
    if (reiniciar) { state.pagina = 0; state.productos = []; }
    const desde = state.pagina * C.porPagina;
    const hasta = desde + C.porPagina - 1;
    let lote;

    if (state.admin) {
      // En admin se trae todo (incluye ocultos) y se filtra aquí.
      if (!state.admin.productos) {
        const { data, error } = await sb.rpc('yyplastic_admin_productos', { p_password: state.admin.password });
        if (error) throw error;
        state.admin.productos = data;
      }
      const q = state.busqueda.toLowerCase();
      const filtrados = state.admin.productos.filter((p) =>
        (state.categoria === null || p.categoria_id === state.categoria) &&
        (!q || p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)));
      lote = filtrados.slice(desde, hasta + 1);
      state.hayMas = filtrados.length > hasta + 1;
    } else {
      let query = sb.from('yyplastic_productos').select('*')
        .order('destacado', { ascending: false }).order('orden').order('id', { ascending: false })
        .range(desde, hasta + 1); // pedimos uno extra para saber si hay más
      if (state.categoria !== null) query = query.eq('categoria_id', state.categoria);
      const q = limpiarBusqueda(state.busqueda);
      if (q) query = query.or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%,descripcion.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      state.hayMas = data.length > C.porPagina;
      lote = data.slice(0, C.porPagina);
    }
    state.productos = state.productos.concat(lote);
    state.pagina += 1;
    renderProductos();
  }

  // ---------- Íconos del pie de página ----------
  const svg = (d, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
  const ICONOS = {
    whatsapp: svg('M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.6c-2 0-3.9-.5-5.6-1.5l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6Zm5.8-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1a8.7 8.7 0 0 1-4.3-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.4 14.4 0 0 0 5.5 4.9c2 .9 2.9 1 3.9.8a3.3 3.3 0 0 0 2.2-1.5 2.7 2.7 0 0 0 .2-1.5c-.1-.2-.3-.3-.6-.4Z', '0 0 32 32'),
    instagram: svg('M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9-.1-1.3-.1-1.6-.1-4.8s0-3.6.1-4.8C2.4 4 3.9 2.4 7.2 2.3c1.2-.1 1.6-.1 4.8-.1ZM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0Zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.4-11.8a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9Z'),
    direccion: svg('M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z'),
    horario: svg('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7Z'),
  };
  // ---------- Render: datos del negocio ----------
  function renderConfig() {
    const c = state.config;
    document.title = `${c.nombre || 'Y&Y Plastic'} · Catálogo`;
    $('#footerEslogan').textContent = c.eslogan || '';
    $('#notaPrecio').textContent = state.modo === 'mayor' ? (c.nota_mayor || '') : 'Precios al detalle (por unidad o paquete).';

    const waLink = linkWhatsapp('Hola Y&Y Plastic! Quisiera hacer una consulta.');
    const redes = [
      ['whatsapp', waLink, 'WhatsApp'],
      ['instagram', c.instagram, 'Instagram'],
    ].filter(([, url]) => url);
    const datos = [['direccion', c.direccion], ['horario', c.horario]].filter(([, v]) => v);

    $('#footerInfo').innerHTML = `
      ${c.descripcion ? `<p class="footer__desc">${esc(c.descripcion)}</p>` : ''}
      ${redes.length ? `<div class="socials">${redes.map(([k, url, label]) =>
        `<a class="social social--${k}" href="${esc(url)}" target="_blank" rel="noopener">${ICONOS[k]}<span>${label}</span></a>`).join('')}</div>` : ''}
      ${datos.length ? `<ul class="footer__data">${datos.map(([k, v]) => `<li>${ICONOS[k]}<span>${esc(v)}</span></li>`).join('')}</ul>` : ''}`;

    const wa = linkWhatsapp('Hola Y&Y Plastic! Quisiera hacer una consulta.');
    const fl = $('#waFloat');
    fl.hidden = !wa;
    if (wa) fl.href = wa;
  }

  // ---------- Render: carrusel ----------
  // Franja de fotos que avanza de forma continua (se duplica la lista para que el giro no tenga cortes).
  function renderCarrusel() {
    const hero = $('#hero');
    const slides = state.slides;
    if (!slides.length) {
      hero.classList.remove('is-marquee');
      $('#heroTrack').innerHTML = `<div class="hero__slide hero__slide--brand">
           <div class="hero__brand">
             <img src="assets/logo.svg" alt="Y&Y Plastic">
             <p>${esc(state.config.eslogan || 'Tu aliado en envases para restaurantes, foodtrucks y delivery.')}</p>
             <a href="#catalogo" class="btn">Ver catálogo</a>
           </div>
         </div>`;
      return;
    }
    hero.classList.add('is-marquee');
    const item = (s, copia) => {
      const img = `<img src="${esc(urlFoto(s.imagen_url))}" alt="${copia ? '' : esc(s.titulo || 'Y&Y Plastic')}" loading="${copia ? 'lazy' : 'eager'}" draggable="false">`;
      const cls = `marquee__item${s.activo === false ? ' is-hidden-slide' : ''}`;
      return s.enlace
        ? `<a class="${cls}" href="${esc(s.enlace)}"${copia ? ' aria-hidden="true" tabindex="-1"' : ''}>${img}</a>`
        : `<div class="${cls}"${copia ? ' aria-hidden="true"' : ''}>${img}</div>`;
    };
    const track = $('#heroTrack');
    track.innerHTML = slides.map((s) => item(s, false)).join('') + slides.map((s) => item(s, true)).join('');
    track.style.setProperty('--duracion', `${Math.max(20, slides.length * 4)}s`);
  }

  // ---------- Render: categorías ----------
  function renderChips() {
    const chips = [{ id: null, nombre: 'Todos' }, ...state.categorias];
    $('#chips').innerHTML = chips.map((c) =>
      `<button role="tab" class="chip${c.id === state.categoria ? ' is-active' : ''}" data-id="${c.id ?? ''}">${esc(c.nombre)}</button>`).join('');
  }
  $('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    state.categoria = b.dataset.id ? Number(b.dataset.id) : null;
    renderChips();
    cargarProductos().catch(error);
  });

  // ---------- Render: productos ----------
  function bloquePrecio(p, compacto = true) {
    const det = precio(p.precio_detalle);
    const may = precio(p.precio_mayor);
    if (state.modo === 'mayor') {
      if (may) {
        return `<div class="price"><span class="price__main">${may}</span>
          <span class="price__sub">${textoCaja(p)}</span>
          ${det && !compacto ? `<span class="price__alt">Detalle: ${det}</span>` : ''}</div>`;
      }
      return `<div class="price"><span class="price__main price__main--muted">${det || 'Consultar'}</span><span class="price__sub">sin precio mayorista</span></div>`;
    }
    return `<div class="price"><span class="price__main">${det || 'Consultar'}</span>
      ${may && !compacto ? `<span class="price__alt">Al mayor: ${may} ${textoCaja(p)}</span>` : ''}</div>`;
  }

  const nombreCategoria = (id) => state.categorias.find((c) => c.id === id)?.nombre || '';

  // Presentación y descripción según el modo; si el mayor no tiene las suyas, se usan las del detalle
  const esMayor = (p) => state.modo === 'mayor' && p.precio_mayor !== null && p.precio_mayor !== undefined;
  // Stock en unidades (las del detalle). Al mayor se compra por caja: 1 caja = unidades_por_caja unidades.
  const upc = (p) => Math.max(1, p.unidades_por_caja || 1);
  const minCajas = (p) => Math.max(1, p.minimo_mayor || 1);
  const stockDe = (p) => Math.max(0, p.stock || 0);
  const cajasDisp = (p) => Math.floor(stockDe(p) / upc(p));
  const sinStock = (p) => (esMayor(p) ? cajasDisp(p) < minCajas(p) : stockDe(p) < 1);
  const textoCaja = (p) => `por caja${upc(p) > 1 ? ` de ${upc(p)} un.` : ''}${minCajas(p) > 1 ? ` · mín. ${minCajas(p)} cajas` : ''}`;
  const unidadDe = (p) => (esMayor(p) && p.unidad_mayor ? p.unidad_mayor : p.unidad);
  const descripcionDe = (p) => (esMayor(p) && p.descripcion_mayor ? p.descripcion_mayor : p.descripcion);

  function tarjeta(p) {
    const foto = p.fotos?.[0];
    return `<article class="card${p.activo === false ? ' is-inactive' : ''}" data-id="${p.id}" tabindex="0">
      <div class="card__img">
        ${foto ? `<img src="${esc(urlFoto(foto))}" alt="${esc(p.nombre)}" loading="lazy">` : `<img src="assets/isotipo.svg" alt="" class="card__placeholder">`}
        ${p.destacado ? '<span class="badge">Destacado</span>' : ''}
        ${p.activo === false ? '<span class="badge badge--dark">Oculto</span>' : ''}
        ${sinStock(p) ? '<span class="badge badge--stock">Sin stock</span>' : ''}
      </div>
      <div class="card__body">
        <span class="card__cat">${esc(nombreCategoria(p.categoria_id))}</span>
        <h3 class="card__name">${esc(p.nombre)}</h3>
        ${unidadDe(p) ? `<span class="card__unit">${esc(unidadDe(p))}</span>` : ''}
        ${bloquePrecio(p)}
        <span class="card__stock admin-only${stockDe(p) > 0 ? '' : ' card__stock--cero'}">Stock: ${stockDe(p)} un.${upc(p) > 1 ? ` (${Math.floor(stockDe(p) / upc(p))} cajas de ${upc(p)})` : ''}</span>
        ${(esMayor(p) ? p.precio_mayor : p.precio_detalle) !== null && (esMayor(p) ? p.precio_mayor : p.precio_detalle) !== undefined
          ? (sinStock(p)
            ? '<button class="btn btn--small card__add" type="button" disabled>Sin stock</button>'
            : `<button class="btn btn--small card__add" data-accion="agregar" aria-label="Agregar ${esc(p.nombre)} al carrito">Agregar</button>`) : ''}
      </div>
      <div class="card__admin admin-only">
        <button class="btn btn--small" data-accion="editar">Editar</button>
        <button class="btn btn--small btn--danger" data-accion="eliminar">Eliminar</button>
      </div>
    </article>`;
  }

  function renderProductos() {
    const grid = $('#grid');
    const nuevo = state.admin
      ? `<button class="card card--new" data-accion="nuevo"><span>+</span>Nuevo producto</button>`
      : '';
    grid.innerHTML = nuevo + state.productos.map(tarjeta).join('');
    $('#empty').hidden = state.productos.length > 0;
    $('#btnMas').hidden = !state.hayMas;
  }

  $('#btnMas').addEventListener('click', () => cargarProductos({ reiniciar: false }).catch(error));

  $('#grid').addEventListener('click', (e) => {
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    const card = e.target.closest('.card');
    if (!card) return;
    const p = state.productos.find((x) => String(x.id) === card.dataset.id);
    if (accion === 'nuevo') return window.YYAdmin?.editarProducto(null);
    if (accion === 'editar') return window.YYAdmin?.editarProducto(p);
    if (accion === 'eliminar') return window.YYAdmin?.eliminarProducto(p);
    if (accion === 'agregar') return window.YYCarrito?.agregarRapido(p);
    if (p) verProducto(p);
  });
  $('#grid').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('card') && e.target.dataset.id) e.target.click();
  });

  function verProducto(p) {
    const fotos = p.fotos?.length ? p.fotos.map(urlFoto) : ['assets/isotipo.svg'];
    const wa = linkWhatsapp(`Hola Y&Y Plastic! Me interesa: ${p.nombre}${p.codigo ? ` (cód. ${p.codigo})` : ''} — precio ${state.modo === 'mayor' ? 'al mayor' : 'al detalle'}.`);
    const det = precio(p.precio_detalle);
    const may = precio(p.precio_mayor);
    const body = abrirModal(`
      <div class="product">
        <div class="product__gallery">
          <div class="product__main"><img src="${esc(fotos[0])}" alt="${esc(p.nombre)}" id="pvMain"></div>
          ${fotos.length > 1 ? `<div class="product__thumbs">${fotos.map((f, i) =>
            `<button class="${i === 0 ? 'is-active' : ''}" data-src="${esc(f)}"><img src="${esc(f)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
        </div>
        <div class="product__info">
          <span class="card__cat">${esc(nombreCategoria(p.categoria_id))}</span>
          <h2>${esc(p.nombre)}</h2>
          ${p.codigo ? `<p class="product__code">Código: ${esc(p.codigo)}</p>` : ''}
          <div class="product__prices">
            <button type="button" class="pbox${!esMayor(p) ? ' is-active' : ''}" data-modo="detalle">
              <span>Al detalle</span><strong>${det || 'Consultar'}</strong>
              ${p.unidad ? `<small>${esc(p.unidad)}</small>` : ''}
            </button>
            <button type="button" class="pbox${esMayor(p) ? ' is-active' : ''}" data-modo="mayor"${may ? '' : ' disabled'}>
              <span>Al mayor</span><strong>${may || 'No disponible'}</strong>
              ${may ? `<small class="pbox__min">${textoCaja(p)}</small>` : ''}
              ${may && (p.unidad_mayor || p.unidad) ? `<small>${esc(p.unidad_mayor || p.unidad)}</small>` : ''}
            </button>
          </div>
          ${descripcionDe(p) ? `<p class="product__desc">${esc(descripcionDe(p)).replace(/\n/g, '<br>')}</p>` : ''}
          <div id="pvCarrito"></div>
          ${wa ? `<a class="btn btn--wa" href="${esc(wa)}" target="_blank" rel="noopener">Consultar por WhatsApp</a>` : ''}
          <button class="btn btn--small admin-only" id="pvEditar">Editar producto</button>
        </div>
      </div>`, 'modal--wide');
    body.querySelector('.product__thumbs')?.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $('#pvMain').src = b.dataset.src;
      body.querySelectorAll('.product__thumbs button').forEach((x) => x.classList.toggle('is-active', x === b));
    });
    body.querySelector('#pvEditar')?.addEventListener('click', () => window.YYAdmin?.editarProducto(p));
    body.querySelector('.product__prices')?.addEventListener('click', (e) => {
      const m = e.target.closest('.pbox')?.dataset.modo;
      if (!m || m === state.modo) return;
      setModo(m);
      verProducto(p);
    });
    window.YYCarrito?.montarEnFicha(body.querySelector('#pvCarrito'), p);
  }

  // ---------- Modo de precio ----------
  function setModo(modo) {
    state.modo = modo;
    storage.set('yy_modo', modo);
    $$('.price-toggle button').forEach((b) => b.classList.toggle('is-active', b.dataset.modo === modo));
    document.body.dataset.modo = modo;
    renderConfig();
    renderProductos();
  }
  $$('.price-toggle button').forEach((b) => b.addEventListener('click', () => setModo(b.dataset.modo)));

  // ---------- Búsqueda ----------
  let tBusqueda;
  $('#buscar').addEventListener('input', (e) => {
    clearTimeout(tBusqueda);
    tBusqueda = setTimeout(() => {
      state.busqueda = e.target.value.trim();
      cargarProductos().catch(error);
    }, 300);
  });

  function error(e) {
    console.error(e);
    toast(e?.message || 'Ocurrió un error', 'error');
  }

  // ---------- Inicio ----------
  async function iniciar() {
    $('#anio').textContent = new Date().getFullYear();
    setModo(state.modo);
    try {
      await Promise.all([cargarConfig(), cargarCategorias(), cargarSlides()]);
      renderConfig();
      renderCarrusel();
      renderChips();
      await cargarProductos();
    } catch (e) {
      error(e);
      renderCarrusel();
    }
  }

  // API compartida con admin.js
  window.YY = {
    sb, state, $, $$, esc, toast, abrirModal, cerrarModal, urlFoto, error, nombreCategoria, precio, fmt, linkWhatsapp, storage,
    esMayor, upc, minCajas, stockDe, cajasDisp, sinStock,
    async recargarTodo() {
      if (state.admin) state.admin.productos = null;
      await Promise.all([cargarConfig(), cargarCategorias(), cargarSlides()]);
      renderConfig();
      renderCarrusel();
      renderChips();
      await cargarProductos();
    },
  };

  iniciar();
})();
