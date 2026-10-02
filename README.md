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
js/carrito.js       Carrito, pedido con retiro en tienda y seguimiento (?pedido=)
js/pedidos-admin.js Pedidos en tiempo real para el dueño (sonido + aviso)
js/imagenes.js      Compresión de fotos en el navegador (WebP, máx. 1400/1920 px)
assets/             Logo, logo horizontal e isotipo en SVG
supabase/schema.sql Tablas, permisos y funciones del catálogo
supabase/02_pedidos.sql Pedidos, sesiones de admin y pasos para la pasarela de pago
```

## Espacio en la base de datos "Proyectos varios"

Todo lo de este proyecto usa el prefijo `yyplastic_` y no toca los otros proyectos:

- Tablas: `yyplastic_productos`, `yyplastic_categorias`, `yyplastic_carrusel`, `yyplastic_config`, `yyplastic_admin`
- Funciones: `yyplastic_*` (cada escritura valida la clave de admin en el servidor)
- Bucket de fotos: `yyplastic-fotos` (carpetas `productos/` y `carrusel/`)

Para crearlo, ejecutar `supabase/schema.sql` en el SQL Editor de Supabase.

## Modo administrador

Botón **Admin** en el pie de página (o abrir la web con `?admin`). La sesión queda iniciada
en ese dispositivo (token de 180 días); cambiar la clave cierra las demás sesiones.

Los pedidos llegan en tiempo real al botón **Pedidos** de la barra admin (sonido, contador
en la pestaña y notificación del navegador si se activa).

## Despliegue en Cloudflare Pages

- Production branch: `main`
- Framework preset: `None`
- Build command: *(vacío)*
- Build output directory: `/`
