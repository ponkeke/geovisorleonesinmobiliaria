// Compara lo medido (vértices en UTM) con lo que declara el plano del ingeniero. Función pura: no toca la BD.
const LADO_TOLERANCIA_M = 0.05;   // las distancias del plano vienen redondeadas al centímetro

const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;

// Magnitud declarada vs calculada; `dentro` es null si el plano no declara el dato.
function comparar(declarada, calculada, tolerancia) {
  if (declarada === null || declarada === undefined) return { declarada: null, calculada, diferencia: null, diferencia_pct: null, dentro: null };
  const diferencia = r2(calculada - declarada);
  const diferenciaPct = r3((Math.abs(calculada - declarada) / declarada) * 100);
  return { declarada, calculada, diferencia, diferencia_pct: diferenciaPct, dentro: diferenciaPct <= tolerancia };
}

// Agrega `verificacion` al registro de levantamiento: área, perímetro y cada lado.
exports.verificar = (l) => {
  if (!l) return null;
  const n = l.vertices.length;
  const lados = l.vertices.map((v, i) => {
    const declarada = v.distancia_plano ?? null;
    const diferencia = declarada === null ? null : r2(v.distancia_calculada - declarada);
    return {
      lado: `V${i + 1}–V${(i + 1) % n + 1}`, declarada, calculada: v.distancia_calculada, diferencia,
      coincide: diferencia === null ? null : Math.abs(diferencia) <= LADO_TOLERANCIA_M,
    };
  });
  const area = comparar(l.area_declarada, l.area_utm, l.tolerancia_pct);
  const perimetro = comparar(l.perimetro_declarado, l.perimetro_utm, l.tolerancia_pct);
  const revisados = [area.dentro, perimetro.dentro, ...lados.map((x) => x.coincide)].filter((x) => x !== null);
  return { ...l, verificacion: { area, perimetro, lados, dentro_tolerancia: revisados.length ? revisados.every(Boolean) : null } };
};
