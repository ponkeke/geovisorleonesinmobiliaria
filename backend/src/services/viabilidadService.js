// Cálculo de viabilidad (prototipo, sin ML). Cada sub-puntaje va de 0 a 100.
//   puntaje_total = tecnico*0.35 + legal*0.35 + financiero*0.30

const PESOS = { tecnico: 0.35, legal: 0.35, financiero: 0.30 };

// Técnico: 50% cercanía a vía principal + 50% compatibilidad normativa.
//   cercanía: 100 si está a <= 100 m; baja linealmente hasta 0 a >= 2000 m.
//   compatibilidad: 100 si es compatible, 0 si no.
const DIST_MIN = 100;
const DIST_MAX = 2000;
function puntajeTecnico({ distancia_via_principal, compatibilidad_normativa }) {
  const d = Number(distancia_via_principal);
  const cercania = d <= DIST_MIN ? 100
    : d >= DIST_MAX ? 0
    : 100 * (DIST_MAX - d) / (DIST_MAX - DIST_MIN);
  return 0.5 * cercania + 0.5 * (compatibilidad_normativa ? 100 : 0);
}

// Legal: la ruta más simple/rápida puntúa más.
const PUNTAJE_RUTA = {
  'partida registral': 100,
  'desmembramiento': 60,
  'prescripción adquisitiva': 30,
};
function puntajeLegal({ ruta_legal }) {
  return PUNTAJE_RUTA[ruta_legal] ?? 0;
}

// Financiero: costo total por m² (precio + costos de adquisición) frente a un
// valor de referencia FIJO (no hay histórico todavía; iteración futura).
//   <= referencia -> 100; baja linealmente hasta 0 en 2x la referencia.
// Se configura con la variable de entorno PRECIO_M2_REFERENCIA (por defecto 170).
const referenciaPrecioM2 = () => Number(process.env.PRECIO_M2_REFERENCIA) || 170;

function puntajeFinanciero({ precio_ofertado, costos_adquisicion }, area) {
  const ref = referenciaPrecioM2();
  const a = Number(area);
  if (!a || a <= 0) return 0;
  const porM2 = (Number(precio_ofertado) + Number(costos_adquisicion || 0)) / a;
  if (porM2 <= ref) return 100;
  if (porM2 >= 2 * ref) return 0;
  return 100 * (2 * ref - porM2) / ref;
}

const r2 = (n) => Math.round(n * 100) / 100;

function calcular({ criterios, legal, financiera, area }) {
  const tecnico = puntajeTecnico(criterios);
  const legalP = puntajeLegal(legal);
  const financiero = puntajeFinanciero(financiera, area);
  const total = tecnico * PESOS.tecnico + legalP * PESOS.legal + financiero * PESOS.financiero;
  return {
    total: r2(total),
    detalle: {
      pesos: PESOS,
      puntaje_tecnico: r2(tecnico),
      puntaje_legal: r2(legalP),
      puntaje_financiero: r2(financiero),
    },
  };
}

module.exports = { calcular, referenciaPrecioM2 };
