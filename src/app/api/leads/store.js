// Almacén en memoria para prospectos (dueños interesados en el servicio de co-hosting).
// Nota: en hosting serverless la memoria no persiste entre despliegues/instancias.
// El landing también guarda una copia en el navegador (localStorage) como respaldo.
export const leads = [];

export function addLead(lead) {
  const entry = { ...lead, receivedAt: new Date().toISOString() };
  leads.unshift(entry);
  if (leads.length > 500) leads.pop();
  return entry;
}
