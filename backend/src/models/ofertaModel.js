const pool = require('../config/db');

// Valida el polígono con PostGIS y calcula su área en m² (ST_Area sobre geography).
// Lanza { status: 400 } si el GeoJSON no se puede interpretar o la geometría es inválida.
exports.validarPoligono = async (geojson) => {
  let row;
  try {
    ({ rows: [row] } = await pool.query(
      `SELECT ST_IsValid(g) AS valido,
              ST_IsValidReason(g) AS motivo,
              GeometryType(g) AS tipo,
              ST_Area(g::geography) AS area
         FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326) AS g) s`,
      [JSON.stringify(geojson)]
    ));
  } catch {
    throw { status: 400, campo: 'poligono', message: 'El polígono no es un GeoJSON válido' };
  }
  if (row.tipo !== 'POLYGON') throw { status: 400, campo: 'poligono', message: 'La geometría debe ser un polígono' };
  if (!row.valido) {
    const cruce = /^Self-intersection|^Ring Self-intersection/.test(row.motivo);
    throw { status: 400, campo: 'poligono', message: cruce
      ? 'Polígono inválido: los lados se cruzan entre sí. Redibújelo sin cruzar líneas'
      : `Polígono inválido: ${row.motivo}` };
  }
  if (!(row.area > 0)) throw { status: 400, campo: 'poligono', message: 'El polígono no tiene área' };
  return Math.round(row.area * 100) / 100;
};

// Crea la oferta y su terreno candidato (con polígono y área oficial) en una transacción.
exports.createWithTerreno = async (o, geojson, area) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [oferta] } = await client.query(
      `INSERT INTO ofertas_terreno
         (nombre_propietario, contacto, ubicacion_referencial, precio_ofertado, area_referencial, descripcion)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [o.nombre_propietario, o.contacto, o.ubicacion_referencial, o.precio_ofertado, area, o.descripcion]
    );
    const { rows: [terreno] } = await client.query(
      `INSERT INTO terrenos_candidatos (id_oferta, geometria, area)
       VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326), $3) RETURNING id_terreno`,
      [oferta.id_oferta, JSON.stringify(geojson), area]
    );
    await client.query('COMMIT');
    return { oferta, terreno };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};
