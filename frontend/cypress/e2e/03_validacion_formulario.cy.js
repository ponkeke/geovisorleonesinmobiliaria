// CY-04: validación del formulario público de ofertas.
describe('Validación del formulario de ofertas', () => {
  beforeEach(() => { cy.visit('/ofrecer'); });

  it('CY-04a: rechaza datos inválidos con mensajes claros y no avanza', () => {
    cy.get('input[name="nombre_propietario"]').type('Ana').blur();
    cy.get('#err-nombre_propietario').should('contain', 'Ingrese nombre y apellido');

    cy.get('input[name="contacto"]').type('123').blur();
    cy.get('#err-contacto').should('contain', 'El celular debe tener 9 dígitos y empezar con 9');

    cy.get('input[name="precio_ofertado"]').type('0').blur();
    cy.get('#err-precio_ofertado').should('contain', 'El precio debe ser mayor que 0');

    cy.contains('button', 'Siguiente').click();
    cy.contains('PASO 1 DE 2').should('be.visible');
  });

  it('CY-04b: un formulario vacío muestra los campos obligatorios', () => {
    cy.contains('button', 'Siguiente').click();
    cy.get('#err-nombre_propietario').should('contain', 'El nombre es obligatorio');
    cy.get('#err-contacto').should('contain', 'El teléfono o correo es obligatorio');
    cy.get('#err-precio_ofertado').should('contain', 'El precio es obligatorio');
  });

  it('CY-04c: con datos válidos avanza al paso de ubicación', () => {
    cy.get('input[name="nombre_propietario"]').type('Cypress Prueba');
    cy.get('input[name="contacto"]').type('999111222');
    cy.get('input[name="precio_ofertado"]').type('250000');
    cy.contains('button', 'Siguiente').click();

    cy.contains('button', 'Omitir').click();               // se omite la guía del mapa
    cy.contains('label', 'Dirección o referencia').should('be.visible');
    cy.contains('button', 'Enviar oferta').click();        // sin dirección ni polígono no se envía
    cy.get('#err-ubicacion_referencial').should('contain', 'La ubicación es obligatoria');
    cy.location('pathname').should('eq', '/ofrecer');
  });
});
