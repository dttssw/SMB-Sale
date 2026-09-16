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
      if (body && body.error) message = body.error;
    } catch {
      /* 忽略非 JSON 错误体 */
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
  // ---- 材料库 ----
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
        if (body && body.error) message = body.error;
      } catch {
        /* 忽略非 JSON 错误体 */
      }
      throw new Error(message);
    }
    return res.json();
  },
  removeMaterial: (id) => request(`/materials/${id}`, { method: 'DELETE' }),
  downloadUrl: (id) => `${BASE}/materials/${id}/download`,
  fileUrl: (storedName) => `/uploads/${encodeURIComponent(storedName)}`,
  // ---- 客户备注（时间线）----
  listNotes: (customerType, customerId) =>
    request(`/notes?customerType=${encodeURIComponent(customerType)}&customerId=${encodeURIComponent(customerId)}`),
  createNote: (data) => request('/notes', { method: 'POST', body: JSON.stringify(data) }),
  updateNote: (id, content) => request(`/notes/${id}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  removeNote: (id) => request(`/notes/${id}`, { method: 'DELETE' }),
  // 同步续约跟进：到期 < RENEW_WINDOW_DAYS 天（见 src/data/constants.js）的在约客户自动生成/更新 Renew 跟进；不再接近到期的自动退出
  syncRenewals: () => request('/sync/renewals', { method: 'POST' }),
  // 跟进客户 → 转为在约：服务端在一个事务里完成「移出跟进 + 建立在约」，确保同一家客户不会同时出现在两个板块
  convertProspect: (id, data) => request(`/prospects/${id}/convert`, { method: 'POST', body: JSON.stringify(data) }),
};
