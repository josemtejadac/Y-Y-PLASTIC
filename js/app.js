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

  // ---------- Render: datos del negocio ----------
  function renderConfig() {
    const c = state.config;
    document.title = `${c.nombre || 'Y&Y Plastic'} · Catálogo`;
    $('#footerEslogan').textContent = c.eslogan || '';
    $('#notaPrecio').textContent = state.modo === 'mayor' ? (c.nota_mayor || '') : 'Precios al detalle (por unidad o paquete).';

    const filas = [];
    if (c.direccion) filas.push(['Dirección', esc(c.direccion)]);
    if (c.horario) filas.push(['Horario', esc(c.horario)]);
    if (c.telefono) filas.push(['Teléfono', `<a href="tel:${esc(c.telefono.replace(/\s/g, ''))}">${esc(c.telefono)}</a>`]);
    if (c.whatsapp) filas.push(['WhatsApp', `<a href="${esc(linkWhatsapp('Hola Y&Y Plastic!'))}" target="_blank" rel="noopener">${esc(c.whatsapp)}</a>`]);
    if (c.email) filas.push(['Correo', `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`]);
    const redes = ['instagram', 'facebook', 'tiktok'].filter((k) => c[k])
      .map((k) => `<a href="${esc(c[k])}" target="_blank" rel="noopener">${k[0].toUpperCase() + k.slice(1)}</a>`);
    if (redes.length) filas.push(['Redes', redes.join(' · ')]);
    $('#footerInfo').innerHTML =
      (c.descripcion ? `<p class="footer__desc">${esc(c.descripcion)}</p>` : '') +
      `<dl>${filas.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

    const wa = linkWhatsapp('Hola Y&Y Plastic! Quisiera hacer una consulta.');
    const fl = $('#waFloat');
    fl.hidden = !wa;
    if (wa) fl.href = wa;
  }

  // ---------- Render: carrusel ----------
  const hero = { idx: 0, timer: null };

  function renderCarrusel() {
    const slides = state.slides.length
      ? state.slides
      : [{ id: 'default', default: true }];
    $('#heroTrack').innerHTML = slides.map((s) => s.default
      ? `<div class="hero__slide hero__slide--brand">
           <div class="hero__brand">
             <img src="assets/logo.svg" alt="Y&Y Plastic">
             <p>${esc(state.config.eslogan || 'Soluciones prácticas para tu cocina.')}</p>
             <a href="#catalogo" class="btn">Ver catálogo</a>
           </div>
         </div>`
      : `<div class="hero__slide${s.activo === false ? ' is-hidden-slide' : ''}">
           <img src="${esc(urlFoto(s.imagen_url))}" alt="${esc(s.titulo)}" loading="lazy">
           ${s.titulo || s.subtitulo ? `<div class="hero__caption">
             ${s.titulo ? `<h2>${esc(s.titulo)}</h2>` : ''}
             ${s.subtitulo ? `<p>${esc(s.subtitulo)}</p>` : ''}
             ${s.enlace ? `<a class="btn" href="${esc(s.enlace)}">Ver más</a>` : ''}
           </div>` : ''}
         </div>`).join('');
    $('#heroDots').innerHTML = slides.length > 1
      ? slides.map((_, i) => `<button aria-label="Ir a la imagen ${i + 1}" data-i="${i}"></button>`).join('')
      : '';
    $('#hero').classList.toggle('is-single', slides.length < 2);
    const first = $('#heroTrack img');
    if (first) first.loading = 'eager';
    irA(0);
  }

  function irA(i) {
    const n = $$('.hero__slide').length;
    if (!n) return;
    hero.idx = (i + n) % n;
    $('#heroTrack').style.transform = `translateX(-${hero.idx * 100}%)`;
    $$('#heroDots button').forEach((b, j) => b.classList.toggle('is-active', j === hero.idx));
    clearInterval(hero.timer);
    if (n > 1) hero.timer = setInterval(() => irA(hero.idx + 1), 5500);
  }

  $('#heroPrev').addEventListener('click', () => irA(hero.idx - 1));
  $('#heroNext').addEventListener('click', () => irA(hero.idx + 1));
  $('#heroDots').addEventListener('click', (e) => { if (e.target.dataset.i) irA(+e.target.dataset.i); });
  (() => { // swipe en móvil
    let x0 = null;
    const tr = $('#heroTrack');
    tr.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    tr.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) irA(hero.idx + (dx < 0 ? 1 : -1));
      x0 = null;
    });
  })();

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
          ${p.minimo_mayor ? `<span class="price__sub">desde ${p.minimo_mayor} ${compacto ? 'un.' : 'unidades'}</span>` : ''}
          ${det && !compacto ? `<span class="price__alt">Detalle: ${det}</span>` : ''}</div>`;
      }
      return `<div class="price"><span class="price__main price__main--muted">${det || 'Consultar'}</span><span class="price__sub">sin precio mayorista</span></div>`;
    }
    return `<div class="price"><span class="price__main">${det || 'Consultar'}</span>
      ${may && !compacto ? `<span class="price__alt">Al mayor: ${may}${p.minimo_mayor ? ` (desde ${p.minimo_mayor} un.)` : ''}</span>` : ''}</div>`;
  }

  const nombreCategoria = (id) => state.categorias.find((c) => c.id === id)?.nombre || '';

  function tarjeta(p) {
    const foto = p.fotos?.[0];
    return `<article class="card${p.activo === false ? ' is-inactive' : ''}" data-id="${p.id}" tabindex="0">
      <div class="card__img">
        ${foto ? `<img src="${esc(urlFoto(foto))}" alt="${esc(p.nombre)}" loading="lazy">` : `<img src="assets/isotipo.svg" alt="" class="card__placeholder">`}
        ${p.destacado ? '<span class="badge">Destacado</span>' : ''}
        ${p.activo === false ? '<span class="badge badge--dark">Oculto</span>' : ''}
      </div>
      <div class="card__body">
        <span class="card__cat">${esc(nombreCategoria(p.categoria_id))}</span>
        <h3 class="card__name">${esc(p.nombre)}</h3>
        ${p.unidad ? `<span class="card__unit">${esc(p.unidad)}</span>` : ''}
        ${bloquePrecio(p)}
        ${p.precio_detalle !== null || p.precio_mayor !== null
          ? `<button class="btn btn--small card__add" data-accion="agregar" aria-label="Agregar ${esc(p.nombre)} al carrito">Agregar</button>` : ''}
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
    if (accion === 'agregar') return window.YYCarrito?.agregar(p, 1);
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
          ${p.unidad ? `<p class="product__unit">${esc(p.unidad)}</p>` : ''}
          <div class="product__prices">
            <div class="pbox${state.modo === 'detalle' ? ' is-active' : ''}">
              <span>Al detalle</span><strong>${det || 'Consultar'}</strong>
            </div>
            <div class="pbox${state.modo === 'mayor' ? ' is-active' : ''}">
              <span>Al mayor</span><strong>${may || 'Consultar'}</strong>
              ${p.minimo_mayor ? `<small>desde ${p.minimo_mayor} unidades</small>` : ''}
            </div>
          </div>
          ${p.descripcion ? `<p class="product__desc">${esc(p.descripcion).replace(/\n/g, '<br>')}</p>` : ''}
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
