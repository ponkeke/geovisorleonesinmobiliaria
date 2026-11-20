import 'cypress-real-events';   // eventos de ratón reales (necesarios para dibujar sobre el mapa)
import './commands';

// Los mapas (Mapbox GL) pueden lanzar errores propios del navegador de pruebas (WebGL, estilo aún cargando)
// que no afectan al flujo evaluado. Cualquier otro error de la aplicación sí hace fallar la prueba.
Cypress.on('uncaught:exception', (err) => {
  if (/webgl|mapbox|style is not done loading|failed to initialize|resizeobserver|abort/i.test(err.message)) return false;
  return undefined;
});

// Al terminar todas las pruebas se borra lo que ellas crearon (ofertas de "Cypress ...").
after(() => { cy.task('limpiarDatosCypress'); });
