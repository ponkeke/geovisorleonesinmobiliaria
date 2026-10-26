import { NIVELES, nivelViabilidad, formatM2 } from '../components/mapConfig.js';
import {
  TIPOS_VIA, SUPERFICIES, SERVICIOS, ESTADOS_TRAMITE, CARGAS, DOCUMENTOS, COSTOS,
} from '../components/CriterioForm.jsx';
import { urlMapaEstatico } from './mapaEstatico.js';
import { alertasTerreno } from './alertas.js';
import { codigoTerreno, ESTADOS, ROLES, capitalizar } from './format.js';

// Resumen del terreno en PDF (A4), organizado por secciones. Se genera en el navegador con los datos del detalle.
// Las librerías se cargan al pulsar el botón para no engordar la carga inicial de la página.

const INK = [27, 27, 27];
const AMARILLO = [255, 204, 0];
const MUTED = [98, 98, 98];
const LINEA = [229, 225, 216];
const SUAVE = [255, 250, 240];
const MARGEN = 14;
const ANCHO = 210 - MARGEN * 2;

// El PDF usa tipografías estándar (Latin-1): lo que no cabe se reemplaza para no mostrar símbolos rotos.
const limpio = (v) => String(v ?? '')
  .replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
  .replace(/≈/g, 'aprox. ').replace(/[✓✔]/g, 'Si')
  .replace(/[^\u0000-ÿ]/g, '?');
const soles = (n) => `S/ ${Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' }) : '');
const sinoTexto = (v) => (v === true ? 'Sí' : v === false ? 'No' : 'Sin verificar');

// Descarga la imagen del mapa como data URL; si falla (sin red, sin token) el PDF sale sin mapa.
async function cargarMapa(poligono) {
  const url = urlMapaEstatico(poligono, { ancho: 560, alto: 240 });
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return { dataUrl, formato: blob.type.includes('png') ? 'PNG' : 'JPEG' };
  } catch {
    return null;
  }
}

export async function generarResumenPdf({ terreno: t, cercanos, usuario }) {
  const [{ jsPDF }, autoTableMod, mapa] = await Promise.all([import('jspdf'), import('jspdf-autotable'), cargarMapa(t.geometria)]);
  // Según el empaquetado, la función llega como default, default.default o con nombre.
  const autoTable = [autoTableMod.default, autoTableMod.default?.default, autoTableMod.autoTable].find((f) => typeof f === 'function');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const { oferta, criterios_tecnicos: ct, situacion_legal: sl, informacion_financiera: fi, puntaje, decision } = t;
  const codigo = codigoTerreno(t.id_terreno);
  const ahora = new Date();
  let y = 0;

  const nuevaPaginaSi = (alto) => { if (y + alto > 283) { doc.addPage(); y = 18; } };
  const texto = (s, x, yy, { tam = 10, negrita = false, color = INK, align = 'left', ancho } = {}) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal').setFontSize(tam).setTextColor(...color);
    doc.text(limpio(s), x, yy, { align, ...(ancho ? { maxWidth: ancho } : {}) });
  };
  const seccion = (titulo) => {
    nuevaPaginaSi(24);
    y += 4;
    doc.setFillColor(...AMARILLO).rect(MARGEN, y - 4.2, 2.2, 6, 'F');
    texto(titulo.toUpperCase(), MARGEN + 5, y, { tam: 10.5, negrita: true });
    y += 3;
  };
  const tabla = (cuerpo, { cabecera, anchoPrimera = 52, estiloFila } = {}) => {
    autoTable(doc, {
      startY: y, margin: { left: MARGEN, right: MARGEN }, theme: 'grid',
      head: cabecera ? [cabecera.map(limpio)] : undefined,
      body: cuerpo.map((fila) => fila.map(limpio)),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, lineColor: LINEA, lineWidth: 0.2, textColor: INK, overflow: 'linebreak' },
      headStyles: { fillColor: INK, textColor: AMARILLO, fontStyle: 'bold' },
      columnStyles: cabecera ? undefined : { 0: { cellWidth: anchoPrimera, fontStyle: 'bold', fillColor: SUAVE, textColor: MUTED } },
      didParseCell: estiloFila,
    });
    y = doc.lastAutoTable.finalY + 3;
  };

  // ---------- Encabezado ----------
  doc.setFillColor(...INK).rect(0, 0, 210, 26, 'F');
  doc.setFillColor(...AMARILLO).rect(0, 26, 210, 1.6, 'F');
  texto('LEONES GRUPO INMOBILIARIO', MARGEN, 11, { tam: 11, negrita: true, color: AMARILLO });
  texto('Resumen del terreno', MARGEN, 19.5, { tam: 17, negrita: true, color: [255, 255, 255] });
  texto(codigo, 210 - MARGEN, 11, { tam: 14, negrita: true, color: AMARILLO, align: 'right' });
  texto(ESTADOS[t.estado] || '', 210 - MARGEN, 19.5, { tam: 10, color: [255, 255, 255], align: 'right' });
  y = 36;

  // ---------- Identificación ----------
  texto(`Terreno ${oferta.ubicacion_referencial}`, MARGEN, y, { tam: 15, negrita: true, ancho: ANCHO });
  y += 7;
  texto(`${oferta.nombre_propietario}  -  ${oferta.contacto}`, MARGEN, y, { tam: 10, color: MUTED });
  y += 5;
  if (oferta.descripcion) {
    const lineas = doc.setFontSize(9.5).splitTextToSize(limpio(`Descripción: ${oferta.descripcion}`), ANCHO);
    texto(lineas.join('\n'), MARGEN, y, { tam: 9.5, color: MUTED });
    y += lineas.length * 4.2;
  }
  y += 2;

  // ---------- Mapa + datos clave ----------
  if (mapa) {
    const alto = (ANCHO * 240) / 560;
    try {
      doc.addImage(mapa.dataUrl, mapa.formato, MARGEN, y, ANCHO, alto);
      doc.setDrawColor(...LINEA).rect(MARGEN, y, ANCHO, alto);
      y += alto + 4;
    } catch { /* sin mapa */ }
  }
  const nivel = puntaje ? nivelViabilidad(puntaje.puntaje_total) : null;
  tabla([[
    'Área', formatM2(t.area),
    'Precio solicitado', soles(oferta.precio_ofertado),
    'Puntaje', puntaje ? `${puntaje.puntaje_total}/100 (${NIVELES[nivel].label})` : 'Pendiente',
  ]], {
    estiloFila: (d) => {
      if (d.section === 'body' && d.column.index % 2 === 0) Object.assign(d.cell.styles, { fontStyle: 'bold', fillColor: SUAVE, textColor: MUTED, cellWidth: 24 });
    },
  });

  // ---------- Resumen ejecutivo ----------
  seccion('Resumen ejecutivo');
  const det = puntaje?.detalle_criterios;
  const estadoArea = (registro, p) => (registro ? `Revisado${p !== undefined && puntaje ? `  -  ${p}/100` : ''}` : 'Pendiente');
  tabla([
    ['Criterio técnico', estadoArea(ct, det?.puntaje_tecnico)],
    ['Situación legal', estadoArea(sl, det?.puntaje_legal)],
    ['Información financiera', estadoArea(fi, det?.puntaje_financiero)],
  ]);
  const alertas = alertasTerreno(t);
  if (alertas.length) {
    tabla(alertas.map((a) => [a.nivel === 'alto' ? 'ATENCIÓN' : 'REVISAR', a.texto]), {
      estiloFila: (d) => {
        if (d.section === 'body' && d.column.index === 0) {
          d.cell.styles.textColor = d.cell.raw === 'ATENCIÓN' ? [178, 58, 46] : [168, 106, 0];
        }
      },
    });
  } else {
    texto('Sin alertas: no se detectaron puntos de atención con la información registrada.', MARGEN, y + 1, { tam: 9, color: MUTED });
    y += 6;
  }

  // ---------- Criterio técnico ----------
  seccion('Criterio técnico');
  if (!ct) texto('Pendiente de registro.', MARGEN, y + 1, { tam: 9.5, color: MUTED }), (y += 6);
  else {
    const servicios = Object.entries(SERVICIOS).filter(([k]) => ct[`servicio_${k}`]).map(([, v]) => v);
    tabla([
      ['Distancia a vía principal', `${ct.distancia_via_principal} m`],
      ['Compatibilidad normativa', ct.compatibilidad_normativa ? 'Sí' : 'No'],
      ['Acceso', [TIPOS_VIA[ct.tipo_via_acceso], ct.nombre_via_acceso, SUPERFICIES[ct.superficie_via]].filter(Boolean).join(' - ') || 'Sin especificar'],
      ['Servicios básicos', servicios.length ? servicios.join(', ') : 'Ninguno confirmado'],
      ['Visita', [fecha(ct.fecha_visita), ct.registrado_por_nombre].filter(Boolean).join('  -  ') || 'Sin fecha'],
      ...(ct.observaciones ? [['Observaciones', ct.observaciones]] : []),
    ]);
  }

  // ---------- Situación legal ----------
  seccion('Situación legal');
  if (!sl) texto('Pendiente de registro.', MARGEN, y + 1, { tam: 9.5, color: MUTED }), (y += 6);
  else {
    const cargas = Object.entries(CARGAS).filter(([k]) => sl[`carga_${k}`]).map(([, v]) => v);
    const avisos = [sl.hay_copropietarios && 'Copropietarios', sl.requiere_consentimiento_conyuge && 'Consentimiento del cónyuge', sl.hay_representante_poder && 'Representante con poder'].filter(Boolean);
    const docsOk = Object.entries(DOCUMENTOS).filter(([k]) => sl[`doc_${k}`]).map(([, v]) => v);
    const docsFalta = Object.entries(DOCUMENTOS).filter(([k]) => !sl[`doc_${k}`]).map(([, v]) => v);
    tabla([
      ['Ruta legal', capitalizar(sl.ruta_legal)],
      ['Partida registral', [sl.numero_partida && `N.° ${sl.numero_partida}`, sl.oficina_registral].filter(Boolean).join(' - ') || 'Sin datos'],
      ['Titular registral', sl.titular_registral || 'Sin datos'],
      ['Coincide con el propietario', sinoTexto(sl.titular_coincide)],
      ['Condiciones', avisos.length ? avisos.join(', ') : 'Ninguna declarada'],
      ['Cargas y gravámenes', cargas.length ? `${cargas.join(', ')}${sl.detalle_cargas ? ` (${sl.detalle_cargas})` : ''}` : 'Sin cargas declaradas'],
      ['Estado del trámite', [ESTADOS_TRAMITE[sl.estado_tramite] || sl.estado_tramite, fecha(sl.fecha_estado_tramite)].filter(Boolean).join(' - ') || 'Sin especificar'],
      ['Documentos', `${docsOk.length} de ${Object.keys(DOCUMENTOS).length} completos${docsFalta.length ? `. Faltan: ${docsFalta.join(', ')}` : ''}`],
      ['Revisión', [fecha(sl.fecha_revision), sl.registrado_por_nombre].filter(Boolean).join('  -  ') || 'Sin fecha'],
      ...(sl.observaciones ? [['Observaciones', sl.observaciones]] : []),
    ]);
  }

  // ---------- Información financiera ----------
  seccion('Información financiera');
  if (!fi) {
    texto(`Pendiente de registro. Precio solicitado por el propietario: ${soles(oferta.precio_ofertado)}.`, MARGEN, y + 1, { tam: 9.5, color: MUTED });
    y += 6;
  } else {
    const a = Number(t.area);
    const ref = Number(t.referencia_precio_m2);
    const precio = Number(fi.precio_ofertado);
    const costos = Number(fi.costos_adquisicion);
    const totalM2 = a > 0 ? (precio + costos) / a : null;
    const dif = totalM2 !== null && ref ? Math.round(((totalM2 - ref) / ref) * 100) : null;
    const desglose = Object.entries(COSTOS).filter(([k]) => Number(fi[`costo_${k}`]) > 0).map(([k, v]) => [`   ${v}`, soles(fi[`costo_${k}`])]);
    tabla([
      ['Precio ofertado', soles(precio)],
      ['Costos de adquisición', soles(costos)],
      ...desglose,
      ['Costo total', soles(precio + costos)],
      ...(a > 0 ? [['Precio por m²', soles(precio / a)], ['Costo total por m²', soles(totalM2)]] : []),
      ...(ref ? [['Referencia por m²', `${soles(ref)}${dif !== null ? `  (${dif > 0 ? '+' : ''}${dif} % frente a la referencia)` : ''}`]] : []),
      ['Revisión', [fecha(fi.fecha_revision), fi.registrado_por_nombre].filter(Boolean).join('  -  ') || 'Sin fecha'],
      ...(fi.observaciones ? [['Observaciones', fi.observaciones]] : []),
    ]);
  }

  // ---------- Entorno ----------
  seccion('Entorno del terreno');
  const categorias = cercanos?.data?.categorias;
  if (!categorias) {
    texto('Los lugares cercanos no estaban disponibles al generar este documento.', MARGEN, y + 1, { tam: 9.5, color: MUTED });
    y += 6;
  } else {
    tabla(categorias.map((c) => [c.etiqueta, c.lugares.length
      ? c.lugares.map((l) => `${l.nombre} (${Math.round(l.distancia_m)} m)`).join('\n')
      : 'Ninguno']));
    texto(`Datos de OpenStreetMap. Distancias medidas desde el borde del terreno${cercanos.data.radio_m ? ` (radio de ${cercanos.data.radio_m} m)` : ''}.`, MARGEN, y, { tam: 8, color: MUTED });
    y += 5;
  }

  // ---------- Archivos ----------
  if (t.archivos?.length) {
    seccion('Archivos adjuntos');
    const area = { tecnica: 'Técnica', legal: 'Legal', administrativa: 'Administrativa' };
    const tamano = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
    tabla(t.archivos.map((f) => [area[f.area] || f.area, f.nombre_original, f.tipo === 'foto' ? 'Foto' : 'Documento', tamano(f.tamano), f.subido_por_nombre || '']),
      { cabecera: ['Área', 'Archivo', 'Tipo', 'Tamaño', 'Subido por'] });
  }

  // ---------- Decisión ----------
  if (decision) {
    seccion('Decisión de adquisición');
    tabla([
      ['Resultado', capitalizar(decision.resultado)],
      ['Decidido por', decision.decidido_por_nombre || ''],
      ['Fecha', fecha(decision.fecha_decision)],
      ...(decision.observaciones ? [['Observaciones', decision.observaciones]] : []),
    ]);
  }

  // ---------- Pie de página ----------
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINEA).line(MARGEN, 289, 210 - MARGEN, 289);
    texto(`Leones Grupo Inmobiliario - Documento interno - Generado el ${ahora.toLocaleDateString('es-PE')} ${ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}${usuario ? ` por ${usuario.nombre} (${ROLES[usuario.rol] || usuario.rol})` : ''}`,
      MARGEN, 293.5, { tam: 7.5, color: MUTED });
    texto(`Página ${i} de ${paginas}`, 210 - MARGEN, 293.5, { tam: 7.5, color: MUTED, align: 'right' });
  }

  const lugar = limpio(oferta.ubicacion_referencial).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40);
  doc.save(`Resumen-${codigo}${lugar ? `-${lugar}` : ''}.pdf`);
}
