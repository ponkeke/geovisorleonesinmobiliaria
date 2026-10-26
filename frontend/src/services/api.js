import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const errorMessage = (e) => e.response?.data?.error || 'No se pudo conectar con el servidor';

export const enviarOferta = (data) => api.post('/ofertas', data).then((r) => r.data);

export const login = (correo, password) =>
  api.post('/auth/login', { correo, password }, { timeout: 15000 }).then((r) => {
    localStorage.setItem('token', r.data.token);
    localStorage.setItem('usuario', JSON.stringify(r.data.usuario));
    return r.data;
  });

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
};

export const getUsuario = () => JSON.parse(localStorage.getItem('usuario') || 'null');

// Validación topológica (R1-R4) del polígono; el plazo es largo porque puede consultar vías en OpenStreetMap.
export const validarPoligono = (poligono) =>
  api.post('/poligonos/validar', { poligono }, { timeout: 60000 }).then((r) => r.data);

// Contorno (sin datos personales) de los terrenos ya registrados, para mostrarlos al dibujar.
export const contornosRegistrados = () => api.get('/poligonos/registrados').then((r) => r.data);

export const listarTerrenos = () => api.get('/terrenos').then((r) => r.data);
export const getTerreno = (id) => api.get(`/terrenos/${id}`).then((r) => r.data);
// Overpass puede tardar (timeout + reintentos en el servidor), por eso el plazo es mayor.
export const getCercanos = (id) => api.get(`/terrenos/${id}/cercanos`, { timeout: 60000 }).then((r) => r.data);
// Vía que da frente al terreno (sugerencia de tipo, nombre y superficie); puede tardar si hay que consultar OSM.
export const getAcceso = (id) => api.get(`/terrenos/${id}/acceso`, { timeout: 60000 }).then((r) => r.data);
// Fotos y reportes de la visita: el cuerpo es el archivo en bruto y el nombre va en una cabecera (sin multipart).
export const subirArchivo = (id, file) =>
  api.post(`/terrenos/${id}/archivos`, file, {
    headers: { 'Content-Type': 'application/octet-stream', 'X-Nombre-Archivo': encodeURIComponent(file.name) },
    timeout: 120000,
  }).then((r) => r.data.archivo);
export const descargarArchivo = (id, idArchivo) => api.get(`/terrenos/${id}/archivos/${idArchivo}`, { responseType: 'blob' }).then((r) => r.data);
export const eliminarArchivo = (id, idArchivo) => api.delete(`/terrenos/${id}/archivos/${idArchivo}`);
export const registrarCriteriosTecnicos = (id, data) =>
  api.post(`/terrenos/${id}/criterios-tecnicos`, data).then((r) => r.data);
export const registrarSituacionLegal = (id, data) =>
  api.post(`/terrenos/${id}/situacion-legal`, data).then((r) => r.data);
export const registrarInformacionFinanciera = (id, data) =>
  api.post(`/terrenos/${id}/informacion-financiera`, data).then((r) => r.data);
export const registrarDecision = (id, resultado, observaciones) =>
  api.post(`/terrenos/${id}/decision`, { resultado, observaciones }).then((r) => r.data);
