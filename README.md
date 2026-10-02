# Y&Y Plastic · Catálogo web

Catálogo de productos de **Y&Y Plastic** (Distribuidora Fénix SpA) con carrusel de fotos,
precios al detalle y al mayor, y modo administrador para editar todo desde la web.

Sitio estático (HTML + CSS + JS, sin build) desplegado en **Cloudflare Pages**, con datos en
**Supabase** — proyecto *Base de datos Proyectos varios*.

## Estructura

```
index.html          Página principal
css/styles.css      Estilos (colores del branding en :root)
js/config.js        URL y clave publicable de Supabase
js/app.js           Catálogo, carrusel, filtros, ficha de producto
js/admin.js         Modo admin (productos, categorías, carrusel, datos, clave)
js/imagenes.js      Compresión de fotos en el navegador (WebP, máx. 1400/1920 px)
assets/             Logo, logo horizontal e isotipo en SVG
supabase/schema.sql Tablas, permisos y funciones del proyecto
```

## Espacio en la base de datos "Proyectos varios"

Todo lo de este proyecto usa el prefijo `yyplastic_` y no toca los otros proyectos:

- Tablas: `yyplastic_productos`, `yyplastic_categorias`, `yyplastic_carrusel`, `yyplastic_config`, `yyplastic_admin`
- Funciones: `yyplastic_*` (cada escritura valida la clave de admin en el servidor)
- Bucket de fotos: `yyplastic-fotos` (carpetas `productos/` y `carrusel/`)

Para crearlo, ejecutar `supabase/schema.sql` en el SQL Editor de Supabase.

## Modo administrador

Botón **Admin** en el pie de página (o abrir la web con `?admin`). Clave inicial: `admin1234`
— cámbiala desde la barra de admin → *Cambiar clave*.

## Despliegue en Cloudflare Pages

- Production branch: `main`
- Framework preset: `None`
- Build command: *(vacío)*
- Build output directory: `/`
