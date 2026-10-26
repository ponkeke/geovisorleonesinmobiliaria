// Overpass (y otros servicios) a veces anuncian IPv6 pero no responden por ahí: se prueba IPv4 primero.
require('dns').setDefaultResultOrder('ipv4first');

const app = require('./app');

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API escuchando en http://localhost:${port}`));
