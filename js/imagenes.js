// Compresión de imágenes en el navegador antes de subirlas.
// Redimensiona al lado máximo indicado y exporta a WebP (o JPEG si el navegador
// no soporta WebP), bajando la calidad hasta quedar bajo el peso objetivo.
window.YYImagenes = (() => {
  const cargar = (file) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });

  const aBlob = (canvas, tipo, calidad) =>
    new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad));

  async function comprimir(file, { maxLado = 1400, pesoMax = 350 * 1024 } = {}) {
    if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen');
    const img = await cargar(file);
    const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * escala);
    const h = Math.round(img.naturalHeight * escala);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // fondo blanco para PNG con transparencia
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    let tipo = 'image/webp';
    let calidad = 0.82;
    let blob = await aBlob(canvas, tipo, calidad);
    if (!blob || blob.type !== 'image/webp') {
      tipo = 'image/jpeg';
      blob = await aBlob(canvas, tipo, calidad);
    }
    while (blob.size > pesoMax && calidad > 0.4) {
      calidad -= 0.08;
      blob = await aBlob(canvas, tipo, calidad);
    }
    return { blob, tipo, ext: tipo === 'image/webp' ? 'webp' : 'jpg', ancho: w, alto: h, original: file.size };
  }

  return { comprimir };
})();
