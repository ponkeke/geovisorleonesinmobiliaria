// Los services lanzan errores con { status, message }; cualquier otro es 500.
module.exports = (err, req, res, next) => {
  if (err.type === 'entity.too.large') err = { status: 413, message: 'El archivo es demasiado grande' };
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Error interno' : err.message, ...(err.campo && { campo: err.campo }), ...(err.errores && { errores: err.errores, avisos: err.avisos }) });
};
