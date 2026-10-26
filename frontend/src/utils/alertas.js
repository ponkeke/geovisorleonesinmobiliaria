import { CARGAS, DOCUMENTOS } from '../components/CriterioForm.jsx';

// Puntos de atención de un terreno, calculados con lo ya registrado (no cambian el puntaje).
// `t` es el detalle del terreno (GET /terrenos/:id). Devuelve [{ nivel: 'alto' | 'medio', texto }].
export function alertasTerreno(t) {
  const { criterios_tecnicos: ct, situacion_legal: sl, informacion_financiera: fi } = t;
  const out = [];
  const alto = (texto) => out.push({ nivel: 'alto', texto });
  const medio = (texto) => out.push({ nivel: 'medio', texto });

  if (!ct) medio('Falta registrar el criterio técnico');
  else if (!ct.compatibilidad_normativa) alto('No es compatible normativamente');

  if (!sl) medio('Falta registrar la situación legal');
  else {
    if (sl.titular_coincide === false) alto('El titular registral no coincide con el propietario');
    else if (sl.titular_coincide === null || sl.titular_coincide === undefined) medio('Titularidad sin verificar');
    const cargas = Object.entries(CARGAS).filter(([k]) => sl[`carga_${k}`]).map(([, v]) => v.toLowerCase());
    if (cargas.length) alto(`Tiene cargas o gravámenes: ${cargas.join(', ')}`);
    const faltan = Object.keys(DOCUMENTOS).filter((k) => !sl[`doc_${k}`]).length;
    if (faltan) medio(`Documentos legales incompletos (${Object.keys(DOCUMENTOS).length - faltan} de ${Object.keys(DOCUMENTOS).length})`);
    if (sl.estado_tramite === 'observado') medio('El trámite está observado');
    if (sl.requiere_consentimiento_conyuge || sl.hay_copropietarios) medio('Requiere consentimiento de cónyuge o copropietarios');
  }

  if (!fi) medio('Falta registrar la información financiera');
  else if (Number(t.area) > 0 && Number(t.referencia_precio_m2) > 0) {
    const ref = Number(t.referencia_precio_m2);
    const totalM2 = (Number(fi.precio_ofertado) + Number(fi.costos_adquisicion || 0)) / Number(t.area);
    const dif = Math.round(((totalM2 - ref) / ref) * 100);
    if (totalM2 > ref * 1.5) alto(`El costo por m² está ${dif} % sobre la referencia`);
    else if (totalM2 > ref) medio(`El costo por m² está ${dif} % sobre la referencia`);
  }
  return out;
}
