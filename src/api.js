const BASE = '/api';

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error('无法连接到数据服务，请确认后端已启动（npm run server）');
  }
  if (!res.ok) {
    let message = `请求失败（HTTP ${res.status}）`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  list: (resource) => request(`/${resource}`),
  create: (resource, data) => request(`/${resource}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (resource, id, data) => request(`/${resource}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (resource, id) => request(`/${resource}/${id}`, { method: 'DELETE' }),

  listProjects: () => request('/projects'),
  getProject: (id) => request(`/projects/${id}`),
  createProject: (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id, data) => request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  removeProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  winProject: (id, data) => request(`/projects/${id}/win`, { method: 'POST', body: JSON.stringify(data) }),
  renewProject: (id, data = {}) => request(`/projects/${id}/renew`, { method: 'POST', body: JSON.stringify(data) }),
  markProject: (id, status) => request(`/projects/${id}/${status}`, { method: 'POST' }),

  listCustomers: () => request('/customers'),
  createCustomer: (data) => request('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id, data) => request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  removeCustomer: (id) => request(`/customers/${id}`, { method: 'DELETE' }),

  syncRenewals: () => request('/sync/renewals', { method: 'POST' }),

  listMaterials: () => request('/materials'),
  uploadMaterial: async (file, note = '') => {
    const form = new FormData();
    form.append('file', file);
    if (note) form.append('note', note);
    let res;
    try {
      res = await fetch(`${BASE}/materials`, { method: 'POST', body: form });
    } catch {
      throw new Error('无法连接到数据服务，请确认后端已启动（npm run server）');
    }
    if (!res.ok) {
      let message = `上传失败（HTTP ${res.status}）`;
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
    return res.json();
  },
  removeMaterial: (id) => request(`/materials/${id}`, { method: 'DELETE' }),
  downloadUrl: (id) => `${BASE}/materials/${id}/download`,
  fileUrl: (storedName) => `/uploads/${encodeURIComponent(storedName)}`,

  listNotes: (customerType, customerId, projectId) => {
    const query = new URLSearchParams({ customerType, customerId });
    if (projectId) query.set('projectId', projectId);
    return request(`/notes?${query.toString()}`);
  },
  createNote: (data) => request('/notes', { method: 'POST', body: JSON.stringify(data) }),
  updateNote: (id, content) => request(`/notes/${id}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  removeNote: (id) => request(`/notes/${id}`, { method: 'DELETE' }),
};
