require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { opciones: opcionesValidacion } = require('./config/validacionPoligono');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
app.use(cors());
// Límite de tamaño propio para la validación pública de polígonos (debe ir antes del parser global).
app.use('/api/poligonos', express.json({ limit: opcionesValidacion().maxBytes }));
app.use(express.json());
app.use('/api', routes);
app.use(errorHandler);

module.exports = app;
