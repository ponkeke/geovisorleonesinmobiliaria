// Resumen financiero calculado: precio por m², costo total y costo total por m² frente a la referencia.
// El nivel sigue la misma lógica del puntaje: dentro de la referencia, hasta 1,5× o más.
const soles = (n) => `S/ ${Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const entero = (n) => `S/ ${Number(n).toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;

export default function ResumenFinanciero({ precio, costos, area, referencia }) {
  const a = Number(area);
  const ref = Number(referencia);
  if (!a || a <= 0 || !ref) return null;
  const p = Number(precio) || 0;
  const c = Number(costos) || 0;
  const porM2 = p / a;
  const totalM2 = (p + c) / a;
  const dif = ((totalM2 - ref) / ref) * 100;
  const nivel = totalM2 <= ref ? 'ok' : totalM2 <= ref * 1.5 ? 'medio' : 'alto';
  const texto = nivel === 'ok'
    ? `Dentro de la referencia (${Math.abs(Math.round(dif))} % por debajo)`
    : `${Math.round(dif)} % por encima de la referencia`;
  return (
    <div className="resumen-fin" aria-label="Resumen financiero">
      <div className={`resumen-fin-estado ${nivel}`} role="status"><i aria-hidden="true" />{texto}</div>
      <dl>
        <div><dt>Precio por m²</dt><dd>{soles(porM2)}</dd></div>
        <div><dt>Costo total</dt><dd>{entero(p + c)}</dd></div>
        <div><dt>Costo total por m²</dt><dd>{soles(totalM2)}</dd></div>
        <div><dt>Referencia por m²</dt><dd>{soles(ref)}</dd></div>
      </dl>
    </div>
  );
}
