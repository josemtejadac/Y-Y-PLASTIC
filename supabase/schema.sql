-- =====================================================================
-- Y&Y PLASTIC  ·  Espacio dentro de "Base de datos Proyectos varios"
-- Todo lo de este proyecto usa el prefijo  yyplastic_  y el bucket
-- de fotos  yyplastic-fotos  para no mezclarse con los otros proyectos.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tablas ----------
create table if not exists public.yyplastic_admin (
  id int primary key default 1 check (id = 1),
  password_hash text not null
);
insert into public.yyplastic_admin (id, password_hash)
values (1, extensions.crypt('admin1234', extensions.gen_salt('bf')))
on conflict (id) do nothing;

create table if not exists public.yyplastic_config (
  clave text primary key,
  valor text not null default ''
);
insert into public.yyplastic_config (clave, valor) values
  ('nombre', 'Y&Y Plastic'),
  ('eslogan', 'Soluciones prácticas para tu cocina.'),
  ('descripcion', 'Distribuidora de envases, desechables y artículos plásticos. Venta al detalle y al mayor.'),
  ('whatsapp', ''),
  ('telefono', ''),
  ('email', ''),
  ('direccion', ''),
  ('horario', ''),
  ('instagram', ''),
  ('facebook', ''),
  ('tiktok', ''),
  ('nota_mayor', 'El precio al mayor aplica desde la cantidad mínima indicada en cada producto.')
on conflict (clave) do nothing;

create table if not exists public.yyplastic_categorias (
  id bigint generated always as identity primary key,
  nombre text not null,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);

create table if not exists public.yyplastic_productos (
  id bigint generated always as identity primary key,
  nombre text not null,
  descripcion text not null default '',
  categoria_id bigint references public.yyplastic_categorias(id) on delete set null,
  codigo text not null default '',
  unidad text not null default '',
  precio_detalle numeric(12,2),
  precio_mayor numeric(12,2),
  minimo_mayor int,
  fotos text[] not null default '{}',
  destacado boolean not null default false,
  activo boolean not null default true,
  orden int not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists yyplastic_productos_categoria_idx on public.yyplastic_productos (categoria_id);
create index if not exists yyplastic_productos_orden_idx on public.yyplastic_productos (destacado desc, orden, id desc);

create table if not exists public.yyplastic_carrusel (
  id bigint generated always as identity primary key,
  imagen_url text not null,
  titulo text not null default '',
  subtitulo text not null default '',
  enlace text not null default '',
  orden int not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ---------- RLS: lectura pública, escritura SOLO vía funciones con clave ----------
alter table public.yyplastic_admin      enable row level security;
alter table public.yyplastic_config     enable row level security;
alter table public.yyplastic_categorias enable row level security;
alter table public.yyplastic_productos  enable row level security;
alter table public.yyplastic_carrusel   enable row level security;

create policy "yyplastic config lectura"     on public.yyplastic_config     for select using (true);
create policy "yyplastic categorias lectura" on public.yyplastic_categorias for select using (true);
create policy "yyplastic productos lectura"  on public.yyplastic_productos  for select using (activo);
create policy "yyplastic carrusel lectura"   on public.yyplastic_carrusel   for select using (activo);
-- yyplastic_admin no tiene política: nadie la lee desde el navegador.

-- ---------- Funciones admin (security definer, validan la clave) ----------
create or replace function public.yyplastic_check_password(p_password text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean;
begin
  select (password_hash = crypt(p_password, password_hash)) into v_ok from public.yyplastic_admin where id = 1;
  return coalesce(v_ok, false);
end; $$;

create or replace function public.yyplastic_require_admin(p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.yyplastic_check_password(p_password) then
    raise exception 'Clave de administrador incorrecta' using errcode = '28000';
  end if;
end; $$;
revoke all on function public.yyplastic_require_admin(text) from public, anon, authenticated;

create or replace function public.yyplastic_cambiar_clave(p_password text, p_nueva text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.yyplastic_require_admin(p_password);
  if length(coalesce(p_nueva, '')) < 6 then raise exception 'La clave debe tener al menos 6 caracteres'; end if;
  update public.yyplastic_admin set password_hash = crypt(p_nueva, gen_salt('bf')) where id = 1;
end; $$;

-- Admin ve también los productos / slides ocultos
create or replace function public.yyplastic_admin_productos(p_password text)
returns setof public.yyplastic_productos language plpgsql security definer set search_path = public as $$
begin
  perform public.yyplastic_require_admin(p_password);
  return query select * from public.yyplastic_productos order by destacado desc, orden, id desc;
end; $$;

create or replace function public.yyplastic_admin_carrusel(p_password text)
returns setof public.yyplastic_carrusel language plpgsql security definer set search_path = public as $$
begin
  perform public.yyplastic_require_admin(p_password);
  return query select * from public.yyplastic_carrusel order by orden, id;
end; $$;

create or replace function public.yyplastic_guardar_producto(p_password text, p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_fotos text[];
begin
  perform public.yyplastic_require_admin(p_password);
  if coalesce(trim(p->>'nombre'), '') = '' then raise exception 'El producto necesita un nombre'; end if;
  v_fotos := coalesce(array(select jsonb_array_elements_text(coalesce(p->'fotos', '[]'::jsonb))), '{}');
  if (p->>'id') is null then
    insert into public.yyplastic_productos
      (nombre, descripcion, categoria_id, codigo, unidad, precio_detalle, precio_mayor, minimo_mayor, fotos, destacado, activo, orden)
    values (
      trim(p->>'nombre'), coalesce(p->>'descripcion',''), nullif(p->>'categoria_id','')::bigint,
      coalesce(p->>'codigo',''), coalesce(p->>'unidad',''),
      nullif(p->>'precio_detalle','')::numeric, nullif(p->>'precio_mayor','')::numeric, nullif(p->>'minimo_mayor','')::int,
      v_fotos, coalesce((p->>'destacado')::boolean, false), coalesce((p->>'activo')::boolean, true),
      coalesce(nullif(p->>'orden','')::int, 0))
    returning id into v_id;
  else
    v_id := (p->>'id')::bigint;
    update public.yyplastic_productos set
      nombre = trim(p->>'nombre'), descripcion = coalesce(p->>'descripcion',''),
      categoria_id = nullif(p->>'categoria_id','')::bigint,
      codigo = coalesce(p->>'codigo',''), unidad = coalesce(p->>'unidad',''),
      precio_detalle = nullif(p->>'precio_detalle','')::numeric,
      precio_mayor = nullif(p->>'precio_mayor','')::numeric,
      minimo_mayor = nullif(p->>'minimo_mayor','')::int,
      fotos = v_fotos,
      destacado = coalesce((p->>'destacado')::boolean, false),
      activo = coalesce((p->>'activo')::boolean, true),
      orden = coalesce(nullif(p->>'orden','')::int, 0),
      actualizado_en = now()
    where id = v_id;
  end if;
  return v_id;
end; $$;

create or replace function public.yyplastic_eliminar_producto(p_password text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.yyplastic_require_admin(p_password);
  delete from public.yyplastic_productos where id = p_id;
end; $$;

create or replace function public.yyplastic_guardar_categoria(p_password text, p_id bigint, p_nombre text, p_orden int)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform public.yyplastic_require_admin(p_password);
  if coalesce(trim(p_nombre), '') = '' then raise exception 'La categoría necesita un nombre'; end if;
  if p_id is null then
    insert into public.yyplastic_categorias (nombre, orden) values (trim(p_nombre), coalesce(p_orden, 0)) returning id into v_id;
  else
    update public.yyplastic_categorias set nombre = trim(p_nombre), orden = coalesce(p_orden, 0) where id = p_id;
    v_id := p_id;
  end if;
  return v_id;
end; $$;

create or replace function public.yyplastic_eliminar_categoria(p_password text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.yyplastic_require_admin(p_password);
  delete from public.yyplastic_categorias where id = p_id;
end; $$;

create or replace function public.yyplastic_guardar_slide(p_password text, p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform public.yyplastic_require_admin(p_password);
  if coalesce(p->>'imagen_url', '') = '' then raise exception 'La diapositiva necesita una imagen'; end if;
  if (p->>'id') is null then
    insert into public.yyplastic_carrusel (imagen_url, titulo, subtitulo, enlace, orden, activo)
    values (p->>'imagen_url', coalesce(p->>'titulo',''), coalesce(p->>'subtitulo',''), coalesce(p->>'enlace',''),
            coalesce(nullif(p->>'orden','')::int, 0), coalesce((p->>'activo')::boolean, true))
    returning id into v_id;
  else
    v_id := (p->>'id')::bigint;
    update public.yyplastic_carrusel set
      imagen_url = p->>'imagen_url', titulo = coalesce(p->>'titulo',''), subtitulo = coalesce(p->>'subtitulo',''),
      enlace = coalesce(p->>'enlace',''), orden = coalesce(nullif(p->>'orden','')::int, 0),
      activo = coalesce((p->>'activo')::boolean, true)
    where id = v_id;
  end if;
  return v_id;
end; $$;

create or replace function public.yyplastic_eliminar_slide(p_password text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.yyplastic_require_admin(p_password);
  delete from public.yyplastic_carrusel where id = p_id;
end; $$;

create or replace function public.yyplastic_guardar_config(p_password text, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.yyplastic_require_admin(p_password);
  insert into public.yyplastic_config (clave, valor)
  select key, value from jsonb_each_text(p)
  on conflict (clave) do update set valor = excluded.valor;
end; $$;

-- ---------- Storage: bucket propio para las fotos (ya comprimidas en el navegador) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('yyplastic-fotos', 'yyplastic-fotos', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

create policy "yyplastic fotos lectura" on storage.objects
  for select using (bucket_id = 'yyplastic-fotos');
-- Subida solo dentro de las carpetas del proyecto; máx 1 MB y solo webp/jpeg (lo limita el bucket).
create policy "yyplastic fotos subida" on storage.objects
  for insert with check (
    bucket_id = 'yyplastic-fotos'
    and (storage.foldername(name))[1] in ('productos', 'carrusel')
  );
