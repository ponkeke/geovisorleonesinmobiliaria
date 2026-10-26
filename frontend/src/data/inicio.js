// Canales oficiales de atención de Leones.
// WhatsApp debe incluir el código de país, por ejemplo 51 seguido del celular.
export const CONTACTO = {
  whatsapp: '',
  correo: 'mktleonesgrupoinmobiliario@gmail.com',
  telefono: '925 981 766',
  telefonoEnlace: 'tel:+51925981766',
  direccion: '',
};

export const REDES_SOCIALES = [
  { nombre: 'Facebook', icono: 'facebook', enlace: 'https://www.facebook.com/LeonesDSPeru' },
  { nombre: 'Instagram', icono: 'instagram', enlace: 'https://www.instagram.com/leonesgrupoinmobiliario/' },
  { nombre: 'TikTok', icono: 'tiktok', enlace: 'https://www.tiktok.com/@leonesgrupoinmobiliario' },
];

// Fichas reales: { nombre, ubicacion, descripcion, imagen, enlace }.
// Sin fichas, el inicio muestra una presentación general de futuros proyectos.
export const PROYECTOS = [];

export const TERRENOS = [
  { icono: 'pin', titulo: 'Ubicación y entorno', texto: 'La zona donde se encuentra el terreno y lo que tiene a su alrededor.' },
  { icono: 'building', titulo: 'Accesos y servicios', texto: 'Las vías de acceso, los servicios y los lugares cercanos al predio.' },
  { icono: 'polygon', titulo: 'Área y características', texto: 'Sus dimensiones, su contorno y los detalles que lo hacen especial.' },
  { icono: 'shield', titulo: 'Información del predio', texto: 'Los datos del propietario y la información técnica, legal y comercial para su evaluación.' },
];

export const PREGUNTAS = [
  { pregunta: '¿Necesito crear una cuenta para ofrecer mi terreno?', respuesta: 'No. El formulario es público y puedes enviar tu propuesta sin registrarte. El inicio de sesión está reservado para el equipo de Leones.' },
  { pregunta: '¿Qué información necesito para completar el formulario?', respuesta: 'Tu nombre y apellido, un teléfono o correo, el precio solicitado y la ubicación de tu terreno. También deberás dibujar su contorno en el mapa. La descripción adicional es opcional.' },
  { pregunta: '¿Puedo ofrecer un terreno en cualquier ubicación?', respuesta: 'Puedes indicar la ubicación de tu terreno en el formulario. Cada propuesta se revisa de manera individual según sus características y su potencial de adquisición.' },
  { pregunta: '¿Cómo puedo conocer el área de mi terreno?', respuesta: 'Al dibujar el contorno en el mapa podrás consultar el área y ajustar sus vértices antes de enviar la propuesta.' },
  { pregunta: '¿Qué sucede después de enviar mi oferta?', respuesta: 'El equipo de Leones revisará la ubicación y las características del predio, junto con sus aspectos técnicos, legales y financieros. Tus datos de contacto permitirán comunicarnos contigo sobre la propuesta.' },
  { pregunta: '¿Enviar una propuesta garantiza la compra del terreno?', respuesta: 'La propuesta permite iniciar su evaluación. La adquisición depende de la revisión del equipo y de las características del terreno.' },
];
