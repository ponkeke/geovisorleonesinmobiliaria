// CY-06: al completar los tres criterios se calcula el puntaje de viabilidad.
describe('Evaluación y viabilidad', () => {
  it('CY-06: el puntaje se calcula al registrar los criterios técnico, legal y financiero', () => {
    cy.crearOferta().then(({ ubicacion, idTerreno }) => {
      // Sin criterios todavía: no hay puntaje
      cy.visitarComo('gerencia', '/panel');
      cy.seleccionarTerreno(ubicacion);
      cy.get('ul.cards li.selected .card-score').should('contain', '—');

      cy.completarCriterios(idTerreno);

      cy.reload();
      cy.seleccionarTerreno(ubicacion);
      cy.get('ul.cards li.selected .card-score').should('contain', '/100').and('not.contain', '—');
    });
  });
});
