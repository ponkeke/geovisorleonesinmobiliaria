// Iconos blancos (trazo) que se dibujan dentro del círculo de cada lugar cercano en el mapa.
// Para una categoría nueva basta agregar su clave (la del backend) con el contenido SVG (viewBox 24x24).
const ICONOS = {
  via_principal: '<path d="M8 3 5 21M16 3l3 18M12 4v3M12 10v4M12 17v3"/>',
  colegio: '<path d="M12 6v13M12 6C10 4.5 7 4 3 4v14c4 0 7 .5 9 2 2-1.5 5-2 9-2V4c-4 0-7 .5-9 2z"/>',
  universidad: '<path d="m2 9 10-5 10 5-10 5zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5M22 9v6"/>',
  tienda: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
  restaurante: '<path d="M7 3v7M5 3v5a2 2 0 0 0 4 0V3M7 10v11M17 21V3c-2.5 1-4 4-4 8h4"/>',
  salud: '<path d="M12 5v14M5 12h14"/>',
  mercado: '<path d="M3 9h18l-1.5-5h-15zM5 9v11h14V9M9 20v-6h6v6"/>',
  banco: '<path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  parque: '<path d="M12 22v-7M12 15c-4 0-6-2.5-6-5.5 0-2 1.2-3.3 2.5-3.8C9 3.8 10.4 2 12 2s3 1.8 3.5 3.7C16.8 6.2 18 7.5 18 9.5c0 3-2 5.5-6 5.5z"/>',
};

const svg = (contenido) => `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" `
  + `stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${contenido}</svg>`;

export const nombreIcono = (clave) => `ico-${clave}`;

// Registra las imágenes en el mapa (hay que repetirlo tras cada cambio de estilo).
export function cargarIconos(map) {
  for (const [clave, contenido] of Object.entries(ICONOS)) {
    const nombre = nombreIcono(clave);
    if (map.hasImage(nombre)) continue;
    const img = new Image(48, 48);
    img.onload = () => { if (map.getStyle() && !map.hasImage(nombre)) map.addImage(nombre, img, { pixelRatio: 2 }); };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(contenido))}`;
  }
}
