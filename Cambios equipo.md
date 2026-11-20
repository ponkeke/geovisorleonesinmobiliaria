11/10/2026 (Yupanqui)

Mejoras implementadas en el mapa
- Animacion para el area dibujada
- Vista de mapas ya registradas en la base de datos
- Actualización del funcionamiento del buscador
- Nueva muestra del mapa "Relieve"
- Aplicación de una nueva tolerancia para dibujar mapas encima de otras (de 20% a 1%)
- Restricción (validación) la cual no permite dibujar en rios, lagos y vias principales

Mejora del formulario aceptado
- Aplicación de animaciones y detallar los pasos siguientes al usuario
- Creación del botón "Registrar otro terreno"
- Descripción de los detalles de la oferta del terreno

26/10/2026 (Yupanqui)

Levantamiento topográfico en el Área Técnica
- Nueva sección "Levantamiento topográfico" para registrar el plano del ingeniero: datum, zona UTM, cuadro de vértices (Este/Norte, se pueden pegar desde Excel), área y perímetro declarados, tolerancia, fecha, ingeniero y CIP
- El área y el perímetro se calculan en UTM, igual que el ingeniero, y se comparan con lo declarado (también cada lado)
- Croquis del polígono medido en el detalle y contorno medido sobre el mapa, junto al dibujo del propietario
- Validaciones: lados cruzados, vértices repetidos o colineales y coordenadas lejos del terreno (datum o zona equivocados)
- Nueva migración 010 y pruebas automáticas (28)
