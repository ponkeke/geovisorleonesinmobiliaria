// CY-05: elección del lote en el mapa y registro de una oferta.
// El catastro (COFOPRI/MIDAGRI) es un servicio externo lento: la consulta del predio se simula con un contorno fijo en el
// océano (lejos de calles y de otros terrenos), así la prueba es estable y no depende de ese servicio.
const PREDIO = {
  fuente: 'urbano', etiqueta: 'Mz. Z · Lote 9', area_m2: 800,
  sello: `${Date.now()}.${'a'.repeat(64)}`,   // sello inventado: esta prueba no envía la oferta
  poligono: { type: 'Polygon', coordinates: [[[-83.2, -12.5], [-83.1996, -12.5], [-83.1996, -12.4997], [-83.2, -12.4997], [-83.2, -12.5]]] },
};

describe('Registro de ofertas', () => {
  it('CY-05a: hacer clic sobre un predio del catastro lo elige como terreno y muestra su área', () => {
    cy.intercept('GET', '**/api/catastro/predio*', { body: { predio: PREDIO } }).as('predio');
    cy.visit('/ofrecer');
    cy.get('input[name="nombre_propietario"]').type('Cypress Prueba');
    cy.get('input[name="contacto"]').type('999111222');
    cy.get('input[name="precio_ofertado"]').type('250000');
    cy.contains('button', 'Siguiente').click();
    cy.contains('button', 'Omitir').click();

    // Por defecto se elige el lote del catastro: los botones de dibujo solo aparecen en el modo «Dibujar mi terreno».
    cy.get('.map canvas.mapboxgl-canvas', { timeout: 30000 }).should('be.visible').scrollIntoView();
    cy.contains('.metodo-terreno button', 'Elegir lote del catastro').should('have.attr', 'aria-pressed', 'true');
    cy.contains('button', /Dibujar contorno|Finalizar|Deshacer punto/).should('not.exist');
    cy.contains('button', 'Cambiar lote').should('be.disabled');
    cy.wait(2500);   // el mapa termina de cargar su estilo antes de aceptar clics

    cy.get('.map canvas.mapboxgl-canvas').realClick();
    cy.wait('@predio').its('request.url').should('match', /lng=-?\d+(\.\d+)?&lat=-?\d+(\.\d+)?/);

    cy.get('.area-badge', { timeout: 15000 }).should('contain', 'Mz. Z · Lote 9').and('contain', 'm²');
    // La validación puede terminar con un aviso (p. ej. sin poder consultar las vías de OpenStreetMap), pero sin errores.
    cy.contains('.map-toolbar', 'Validando el lote', { timeout: 90000 }).should('not.exist');
    cy.get('.valid-error').should('not.exist');
    cy.contains('button', 'Enviar oferta').should('not.be.disabled');

    cy.contains('button', 'Cambiar lote').click();
    cy.get('.area-badge').should('not.exist');
  });

  it('CY-05c: sin elegir un lote no se puede enviar la oferta', () => {
    cy.visit('/ofrecer');
    cy.get('input[name="nombre_propietario"]').type('Cypress Prueba');
    cy.get('input[name="contacto"]').type('999111222');
    cy.get('input[name="precio_ofertado"]').type('250000');
    cy.contains('button', 'Siguiente').click();
    cy.contains('button', 'Omitir').click();
    cy.get('input[name="ubicacion_referencial"]').type('Huancayo, Junín');
    cy.contains('button', 'Enviar oferta').click();
    cy.contains('.field-error', 'Elija su lote en el mapa').should('be.visible');
    cy.location('pathname').should('eq', '/ofrecer');
  });

  it('CY-05d: «Dibujar mi terreno» cambia al modo de dibujo y se puede volver a elegir un lote', () => {
    cy.visit('/ofrecer');
    cy.get('input[name="nombre_propietario"]').type('Cypress Prueba');
    cy.get('input[name="contacto"]').type('999111222');
    cy.get('input[name="precio_ofertado"]').type('250000');
    cy.contains('button', 'Siguiente').click();
    cy.contains('button', 'Omitir').click();
    cy.get('.map canvas.mapboxgl-canvas', { timeout: 30000 }).should('be.visible');

    cy.contains('.metodo-terreno button', 'Dibujar mi terreno').click().should('have.attr', 'aria-pressed', 'true');
    cy.contains('button', 'Deshacer punto', { timeout: 15000 }).should('exist');
    cy.contains('button', 'Finalizar').should('be.disabled');
    cy.contains('button', 'Cambiar lote').should('not.exist');
    cy.get('input[name="ubicacion_referencial"]').type('Huancayo, Junín');
    cy.contains('button', 'Enviar oferta').click();
    cy.contains('.field-error', 'Dibuje el contorno de su terreno').should('be.visible');

    cy.contains('.metodo-terreno button', 'Elegir lote del catastro').click();
    cy.contains('button', 'Cambiar lote').should('exist');
    cy.contains('button', /Finalizar|Deshacer punto/).should('not.exist');
  });

  it('CY-05b: una oferta registrada aparece en el panel como terreno en evaluación', () => {
    cy.crearOferta().then(({ ubicacion }) => {
      cy.visitarComo('tecnica', '/panel');
      cy.seleccionarTerreno(ubicacion);
      cy.get('ul.cards li.selected').should('contain', ubicacion).and('contain', 'm²');
      cy.get('.count-chip').should('contain', 'terren');
    });
  });
});
