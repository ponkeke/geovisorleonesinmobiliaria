const authService = require('../services/authService');
const ofertaService = require('../services/ofertaService');
const terrenoService = require('../services/terrenoService');
const validacionPoligono = require('../services/validacionPoligonoService');
const lugaresService = require('../services/lugaresService');

// Envuelve un handler async para delegar errores a errorHandler.
const h = (fn) => (req, res, next) => fn(req, res).catch(next);

exports.login = h(async (req, res) =>
  res.json(await authService.login(req.body.correo, req.body.password)));

exports.crearOferta = h(async (req, res) =>
  res.status(201).json(await ofertaService.registrar(req.body)));

exports.listarTerrenos = h(async (req, res) => res.json(await terrenoService.listar()));
exports.detalleTerreno = h(async (req, res) => res.json(await terrenoService.detalle(req.params.id)));

exports.cercanos = h(async (req, res) => res.json(await lugaresService.cercanos(req.params.id)));

exports.contornosRegistrados = h(async (req, res) => res.json(await terrenoService.contornosPublicos()));
exports.validarPoligono = h(async (req, res) => res.json(await validacionPoligono.validar(req.body?.poligono)));

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
