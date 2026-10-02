// Y&Y Plastic — modo administrador
// Se activa con el botón "Admin" del pie de página (o abriendo la web con ?admin).
// La clave se valida en Supabase (función yyplastic_check_password); cada cambio
// vuelve a enviarla y el servidor la verifica antes de guardar.
(() => {
  const { sb, state, $, esc, toast, abrirModal, cerrarModal, urlFoto, error } = window.YY;
  const C = window.YY_CONFIG;
  const KEY = 'yy_admin_pw';

  const ses = {
    get() { try { return sessionStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { sessionStorage.setItem(KEY, v); } catch { /* sin storage */ } },
    del() { try { sessionStorage.removeItem(KEY); } catch { /* sin storage */ } },
  };

  const pw = () => state.admin?.password;

  async function rpc(nombre, args) {
    const { data, error: e } = await sb.rpc(nombre, { p_password: pw(), ...args });
    if (e) {
      if (e.code === '28000') { salir(); throw new Error('La clave de admin ya no es válida. Vuelve a entrar.'); }
      throw e;
    }
    return data;
  }

  // ---------- Entrar / salir ----------
  async function entrar(password, silencioso = false) {
    const { data, error: e } = await sb.rpc('yyplastic_check_password', { p_password: password });
    if (e) throw e;
    if (!data) { if (!silencioso) toast('Clave incorrecta', 'error'); return false; }
    state.admin = { password, productos: null };
    ses.set(password);
    document.body.classList.add('is-admin');
    await window.YY.recargarTodo();
    if (!silencioso) toast('Modo admin activado');
    return true;
  }

  function salir() {
    state.admin = null;
    ses.del();
    document.body.classList.remove('is-admin');
    window.YY.recargarTodo().catch(error);
  }

  function pedirClave() {
    const body = abrirModal(`
      <form class="form" id="fLogin">
        <h2>Acceso administrador</h2>
        <label>Clave<input type="password" name="pw" autocomplete="current-password" required autofocus></label>
        <div class="form__actions"><button class="btn" type="submit">Entrar</button></div>
      </form>`);
    body.querySelector('#fLogin').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter; btn.disabled = true;
      try { if (await entrar(e.target.pw.value)) cerrarModal(); }
      catch (err) { error(err); }
      finally { btn.disabled = false; }
    });
  }

  $('#btnAdmin').addEventListener('click', () => (state.admin ? salir() : pedirClave()));
  $('#btnEditCarrusel').addEventListener('click', () => gestionarCarrusel());

  document.querySelector('#adminbar').addEventListener('click', (e) => {
    const a = e.target.closest('[data-admin]')?.dataset.admin;
    if (a === 'nuevo') editarProducto(null);
    if (a === 'categorias') gestionarCategorias();
    if (a === 'carrusel') gestionarCarrusel();
    if (a === 'ajustes') editarAjustes();
    if (a === 'clave') cambiarClave();
    if (a === 'salir') { salir(); toast('Saliste del modo admin'); }
  });

  // ---------- Subida de fotos (comprimidas) ----------
  async function subirFoto(file, carpeta, opciones) {
    const r = await window.YYImagenes.comprimir(file, opciones);
    const path = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${r.ext}`;
    const { error: e } = await sb.storage.from(C.bucket).upload(path, r.blob, {
      contentType: r.tipo, cacheControl: '31536000', upsert: false,
    });
    if (e) throw e;
    console.info(`Foto comprimida: ${(r.original / 1024).toFixed(0)} KB → ${(r.blob.size / 1024).toFixed(0)} KB (${r.ancho}×${r.alto})`);
    return path;
  }

  // ---------- Productos ----------
  function editarProducto(p) {
    const nuevo = !p;
    p = p || { nombre: '', descripcion: '', categoria_id: null, codigo: '', unidad: '', precio_detalle: null, precio_mayor: null, minimo_mayor: null, fotos: [], destacado: false, activo: true, orden: 0 };
    let fotos = [...(p.fotos || [])];
    const opcionesCat = ['<option value="">Sin categoría</option>']
      .concat(state.categorias.map((c) => `<option value="${c.id}"${c.id === p.categoria_id ? ' selected' : ''}>${esc(c.nombre)}</option>`)).join('');
    const v = (x) => (x === null || x === undefined ? '' : esc(x));

    const body = abrirModal(`
      <form class="form" id="fProd">
        <h2>${nuevo ? 'Nuevo producto' : 'Editar producto'}</h2>
        <label>Nombre *<input name="nombre" required value="${v(p.nombre)}"></label>
        <div class="form__row">
          <label>Categoría<select name="categoria_id">${opcionesCat}</select></label>
          <label>Código / SKU<input name="codigo" value="${v(p.codigo)}"></label>
        </div>
        <label>Presentación / unidad<input name="unidad" placeholder="Ej: Paquete x 50 unidades" value="${v(p.unidad)}"></label>
        <div class="form__row form__row--3">
          <label>Precio al detalle<input name="precio_detalle" type="number" min="0" step="any" inputmode="decimal" value="${v(p.precio_detalle)}"></label>
          <label>Precio al mayor<input name="precio_mayor" type="number" min="0" step="any" inputmode="decimal" value="${v(p.precio_mayor)}"></label>
          <label>Mínimo al mayor<input name="minimo_mayor" type="number" min="1" step="1" placeholder="Ej: 12" value="${v(p.minimo_mayor)}"></label>
        </div>
        <label>Descripción<textarea name="descripcion" rows="4">${v(p.descripcion)}</textarea></label>
        <div class="form__field">
          <span class="form__label">Fotos <small>(se comprimen automáticamente; la primera es la principal)</small></span>
          <div class="photos" id="fotos"></div>
        </div>
        <div class="form__row form__row--3 form__checks">
          <label class="check"><input type="checkbox" name="destacado"${p.destacado ? ' checked' : ''}> Destacado</label>
          <label class="check"><input type="checkbox" name="activo"${p.activo ? ' checked' : ''}> Visible en la web</label>
          <label>Orden<input name="orden" type="number" step="1" value="${v(p.orden)}"></label>
        </div>
        <div class="form__actions">
          ${nuevo ? '' : '<button type="button" class="btn btn--danger btn--ghost" id="btnDel">Eliminar</button>'}
          <button type="submit" class="btn">Guardar</button>
        </div>
      </form>`, 'modal--wide');

    const cont = body.querySelector('#fotos');
    function pintarFotos() {
      cont.innerHTML = fotos.map((f, i) => `
        <div class="photo" data-i="${i}">
          <img src="${esc(urlFoto(f))}" alt="">
          ${i === 0 ? '<span class="photo__main">Principal</span>' : `<button type="button" class="photo__btn" data-a="principal" title="Hacer principal">★</button>`}
          <button type="button" class="photo__btn photo__btn--del" data-a="quitar" title="Quitar">×</button>
        </div>`).join('') +
        `<label class="photo photo--add"><input type="file" accept="image/*" multiple hidden><span>+</span>Agregar</label>`;
    }
    pintarFotos();

    cont.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const i = +b.closest('.photo').dataset.i;
      if (b.dataset.a === 'quitar') fotos.splice(i, 1);
      if (b.dataset.a === 'principal') fotos.unshift(...fotos.splice(i, 1));
      pintarFotos();
    });
    cont.addEventListener('change', async (e) => {
      const files = [...(e.target.files || [])];
      if (!files.length) return;
      const add = cont.querySelector('.photo--add');
      add.classList.add('is-loading');
      try {
        for (const f of files) fotos.push(await subirFoto(f, 'productos', { maxLado: 1400, pesoMax: 300 * 1024 }));
        toast(`${files.length} foto(s) subida(s)`);
      } catch (err) { error(err); }
      pintarFotos();
    });

    body.querySelector('#btnDel')?.addEventListener('click', () => eliminarProducto(p));

    body.querySelector('#fProd').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const btn = e.submitter; btn.disabled = true;
      try {
        await rpc('yyplastic_guardar_producto', {
          p: {
            id: p.id ?? null,
            nombre: f.nombre.value.trim(),
            categoria_id: f.categoria_id.value,
            codigo: f.codigo.value.trim(),
            unidad: f.unidad.value.trim(),
            precio_detalle: f.precio_detalle.value,
            precio_mayor: f.precio_mayor.value,
            minimo_mayor: f.minimo_mayor.value,
            descripcion: f.descripcion.value.trim(),
            fotos,
            destacado: f.destacado.checked,
            activo: f.activo.checked,
            orden: f.orden.value || 0,
          },
        });
        cerrarModal();
        toast('Producto guardado');
        await window.YY.recargarTodo();
      } catch (err) { error(err); }
      finally { btn.disabled = false; }
    });
  }

  async function eliminarProducto(p) {
    if (!p || !confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await rpc('yyplastic_eliminar_producto', { p_id: p.id });
      cerrarModal();
      toast('Producto eliminado');
      await window.YY.recargarTodo();
    } catch (err) { error(err); }
  }

  // ---------- Categorías ----------
  function gestionarCategorias() {
    const body = abrirModal(`
      <div class="form">
        <h2>Categorías</h2>
        <p class="form__hint">Ordena con el número (menor aparece primero). Al borrar una categoría sus productos quedan "sin categoría".</p>
        <div class="list" id="catList">
          ${state.categorias.map((c) => `
            <div class="list__row" data-id="${c.id}">
              <input class="list__name" value="${esc(c.nombre)}" aria-label="Nombre">
              <input class="list__num" type="number" value="${c.orden}" aria-label="Orden">
              <button class="btn btn--small" data-a="guardar">Guardar</button>
              <button class="btn btn--small btn--danger btn--ghost" data-a="borrar">Borrar</button>
            </div>`).join('') || '<p class="form__hint">Aún no hay categorías.</p>'}
        </div>
        <form class="list__row list__row--new" id="fCat">
          <input class="list__name" name="nombre" placeholder="Nueva categoría (ej: Envases, Cubiertos…)" required>
          <input class="list__num" name="orden" type="number" value="${state.categorias.length}" aria-label="Orden">
          <button class="btn btn--small" type="submit">Agregar</button>
        </form>
      </div>`);

    body.querySelector('#catList').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const row = b.closest('.list__row');
      const id = Number(row.dataset.id);
      try {
        if (b.dataset.a === 'guardar') {
          await rpc('yyplastic_guardar_categoria', { p_id: id, p_nombre: row.querySelector('.list__name').value, p_orden: +row.querySelector('.list__num').value || 0 });
          toast('Categoría guardada');
        } else {
          if (!confirm('¿Borrar esta categoría?')) return;
          await rpc('yyplastic_eliminar_categoria', { p_id: id });
          toast('Categoría borrada');
        }
        await window.YY.recargarTodo();
        gestionarCategorias();
      } catch (err) { error(err); }
    });

    body.querySelector('#fCat').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await rpc('yyplastic_guardar_categoria', { p_id: null, p_nombre: e.target.nombre.value, p_orden: +e.target.orden.value || 0 });
        toast('Categoría agregada');
        await window.YY.recargarTodo();
        gestionarCategorias();
      } catch (err) { error(err); }
    });
  }

  // ---------- Carrusel ----------
  function gestionarCarrusel() {
    const body = abrirModal(`
      <div class="form">
        <h2>Carrusel de fotos</h2>
        <p class="form__hint">Tamaño recomendado: horizontal (ej. 1920×800). Las fotos se comprimen al subirlas. Si no hay diapositivas se muestra el logo.</p>
        <div class="slides" id="slideList">
          ${state.slides.map((s) => `
            <div class="slide-row" data-id="${s.id}">
              <img src="${esc(urlFoto(s.imagen_url))}" alt="">
              <div class="slide-row__fields">
                <input name="titulo" placeholder="Título" value="${esc(s.titulo)}">
                <input name="subtitulo" placeholder="Subtítulo" value="${esc(s.subtitulo)}">
                <input name="enlace" placeholder="Enlace del botón (opcional, ej: #catalogo)" value="${esc(s.enlace)}">
                <div class="slide-row__meta">
                  <label>Orden <input name="orden" type="number" value="${s.orden}"></label>
                  <label class="check"><input type="checkbox" name="activo"${s.activo ? ' checked' : ''}> Visible</label>
                  <button class="btn btn--small" data-a="guardar">Guardar</button>
                  <button class="btn btn--small btn--danger btn--ghost" data-a="borrar">Borrar</button>
                </div>
              </div>
            </div>`).join('') || '<p class="form__hint">Aún no hay diapositivas.</p>'}
        </div>
        <label class="btn btn--ghost upload-btn" id="slideAdd">
          <input type="file" accept="image/*" multiple hidden>+ Agregar foto(s) al carrusel
        </label>
      </div>`, 'modal--wide');

    body.querySelector('#slideList').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const row = b.closest('.slide-row');
      const s = state.slides.find((x) => String(x.id) === row.dataset.id);
      try {
        if (b.dataset.a === 'guardar') {
          const val = (n) => row.querySelector(`[name="${n}"]`);
          await rpc('yyplastic_guardar_slide', { p: {
            id: s.id, imagen_url: s.imagen_url, titulo: val('titulo').value, subtitulo: val('subtitulo').value,
            enlace: val('enlace').value, orden: val('orden').value || 0, activo: val('activo').checked,
          } });
          toast('Diapositiva guardada');
        } else {
          if (!confirm('¿Borrar esta diapositiva?')) return;
          await rpc('yyplastic_eliminar_slide', { p_id: s.id });
          toast('Diapositiva borrada');
        }
        await window.YY.recargarTodo();
        gestionarCarrusel();
      } catch (err) { error(err); }
    });

    body.querySelector('#slideAdd input').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      if (!files.length) return;
      const lbl = body.querySelector('#slideAdd');
      lbl.classList.add('is-loading');
      try {
        let orden = state.slides.length;
        for (const f of files) {
          const path = await subirFoto(f, 'carrusel', { maxLado: 1920, pesoMax: 450 * 1024 });
          await rpc('yyplastic_guardar_slide', { p: { imagen_url: path, orden: orden++, activo: true } });
        }
        toast('Foto(s) agregada(s) al carrusel');
        await window.YY.recargarTodo();
        gestionarCarrusel();
      } catch (err) { error(err); lbl.classList.remove('is-loading'); }
    });
  }

  // ---------- Datos del negocio ----------
  function editarAjustes() {
    const c = state.config;
    const campos = [
      ['nombre', 'Nombre del negocio'],
      ['eslogan', 'Eslogan'],
      ['descripcion', 'Descripción corta (pie de página)', 'textarea'],
      ['whatsapp', 'WhatsApp (con código país, ej: 56912345678)'],
      ['telefono', 'Teléfono'],
      ['email', 'Correo'],
      ['direccion', 'Dirección'],
      ['horario', 'Horario de atención'],
      ['instagram', 'Instagram (URL)'],
      ['facebook', 'Facebook (URL)'],
      ['tiktok', 'TikTok (URL)'],
      ['nota_mayor', 'Nota sobre precios al mayor', 'textarea'],
    ];
    const body = abrirModal(`
      <form class="form" id="fCfg">
        <h2>Datos del negocio</h2>
        ${campos.map(([k, label, tipo]) => tipo === 'textarea'
          ? `<label>${label}<textarea name="${k}" rows="2">${esc(c[k] || '')}</textarea></label>`
          : `<label>${label}<input name="${k}" value="${esc(c[k] || '')}"></label>`).join('')}
        <div class="form__actions"><button class="btn" type="submit">Guardar</button></div>
      </form>`);
    body.querySelector('#fCfg').addEventListener('submit', async (e) => {
      e.preventDefault();
      const datos = Object.fromEntries(campos.map(([k]) => [k, e.target[k].value.trim()]));
      try {
        await rpc('yyplastic_guardar_config', { p: datos });
        cerrarModal();
        toast('Datos guardados');
        await window.YY.recargarTodo();
      } catch (err) { error(err); }
    });
  }

  // ---------- Cambiar clave ----------
  function cambiarClave() {
    const body = abrirModal(`
      <form class="form" id="fPw">
        <h2>Cambiar clave de admin</h2>
        <label>Nueva clave<input type="password" name="n1" minlength="6" required autocomplete="new-password"></label>
        <label>Repetir nueva clave<input type="password" name="n2" minlength="6" required autocomplete="new-password"></label>
        <div class="form__actions"><button class="btn" type="submit">Cambiar</button></div>
      </form>`);
    body.querySelector('#fPw').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { n1, n2 } = e.target;
      if (n1.value !== n2.value) return toast('Las claves no coinciden', 'error');
      try {
        await rpc('yyplastic_cambiar_clave', { p_nueva: n1.value });
        state.admin.password = n1.value;
        ses.set(n1.value);
        cerrarModal();
        toast('Clave actualizada');
      } catch (err) { error(err); }
    });
  }

  window.YYAdmin = { editarProducto, eliminarProducto };

  // ---------- Reanudar sesión o abrir con ?admin ----------
  const guardada = ses.get();
  if (guardada) entrar(guardada, true).catch(() => ses.del());
  else if (new URLSearchParams(location.search).has('admin')) pedirClave();
})();
