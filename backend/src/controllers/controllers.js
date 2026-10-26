const authService = require('../services/authService');
const ofertaService = require('../services/ofertaService');
const terrenoService = require('../services/terrenoService');
const validacionPoligono = require('../services/validacionPoligonoService');
const lugaresService = require('../services/lugaresService');
const accesoService = require('../services/accesoService');
const archivoService = require('../services/archivoService');

// Envuelve un handler async para delegar errores a errorHandler.
const h = (fn) => (req, res, next) => fn(req, res).catch(next);

exports.login = h(async (req, res) =>
  res.json(await authService.login(req.body.correo, req.body.password)));

exports.crearOferta = h(async (req, res) =>
  res.status(201).json(await ofertaService.registrar(req.body)));

exports.listarTerrenos = h(async (req, res) => res.json(await terrenoService.listar()));
exports.detalleTerreno = h(async (req, res) => res.json(await terrenoService.detalle(req.params.id)));

exports.acceso = h(async (req, res) => res.json(await accesoService.acceso(req.params.id)));
exports.cercanos = h(async (req, res) => res.json(await lugaresService.cercanos(req.params.id)));

exports.contornosRegistrados = h(async (req, res) => res.json(await terrenoService.contornosPublicos()));
exports.validarPoligono = h(async (req, res) => res.json(await validacionPoligono.validar(req.body?.poligono)));

// Fotos y reportes de la revisión técnica. El cuerpo es el archivo en bruto; el nombre llega en X-Nombre-Archivo.
exports.subirArchivo = h(async (req, res) =>
  res.status(201).json({ archivo: await archivoService.subir(req.params.id, req.body, req.get('X-Nombre-Archivo'), req.user) }));
exports.eliminarArchivo = h(async (req, res) => {
  await archivoService.eliminar(req.params.id, req.params.idArchivo, req.user);
  res.status(204).end();
});
exports.descargarArchivo = h(async (req, res) => {
  const { fila, abs } = await archivoService.abrir(req.params.id, req.params.idArchivo);
  const enLinea = fila.tipo === 'foto' || fila.mime === 'application/pdf';
  res.set({
    'Content-Type': fila.mime,
    'Content-Disposition': `${enLinea ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fila.nombre_original)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=3600',
  });
  await new Promise((resolve, reject) => res.sendFile(abs, (err) => (err ? reject(err) : resolve())));
});

exports.criteriosTecnicos = h(async (req, res) =>
  res.status(201).json(await terrenoService.registrarCriteriosTecnicos(req.params.id, req.body, req.user)));
exports.situacionLegal = h(async (req, res) =>
  res.status(201).json(await terrenoService.registrarSituacionLegal(req.params.id, req.body, req.user)));
exports.informacionFinanciera = h(async (req, res) =>
  res.status(201).json(await terrenoService.registrarInformacionFinanciera(req.params.id, req.body, req.user)));
exports.calcularViabilidad = h(async (req, res) =>
  res.json(await terrenoService.calcularViabilidad(req.params.id)));
exports.decision = h(async (req, res) =>
  res.status(201).json(await terrenoService.registrarDecision(req.params.id, req.body, req.user)));
