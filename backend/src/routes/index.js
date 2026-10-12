const router = require('express').Router();
const c = require('../controllers/controllers');
const limitadores = require('../middlewares/limitadores');
const { requireAuth, requireRole } = require('../middlewares/auth');

// Públicas
router.post('/ofertas', c.crearOferta);
router.post('/auth/login', c.login);
router.get('/poligonos/registrados', limitadores.contornos, c.contornosRegistrados);
router.post('/poligonos/validar', limitadores.validarPoligono, c.validarPoligono);

// Internas
router.use('/terrenos', requireAuth);
router.get('/terrenos', c.listarTerrenos);
router.get('/terrenos/:id', c.detalleTerreno);
router.get('/terrenos/:id/cercanos', c.cercanos);
router.post('/terrenos/:id/criterios-tecnicos', requireRole('tecnica'), c.criteriosTecnicos);
router.post('/terrenos/:id/situacion-legal', requireRole('legal'), c.situacionLegal);
router.post('/terrenos/:id/informacion-financiera', requireRole('administrativa'), c.informacionFinanciera);
router.post('/terrenos/:id/calcular-viabilidad', c.calcularViabilidad);
router.post('/terrenos/:id/decision', requireRole('gerencia'), c.decision);

module.exports = router;
