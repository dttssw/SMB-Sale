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
  // 续约跟进同步：距到期 ≤ RENEW_WINDOW_DAYS 天（见 src/data/constants.js，默认 60 天 ≈ 两个月）的在约客户
  // 自动生成 / 更新 Renew 跟进；不在约的历史续约客户自动补建在约记录；距到期更久的从续约跟进退出
  syncRenewals: () => request('/sync/renewals', { method: 'POST' }),
  // 新建 / 编辑续约客户：服务端统一执行「在约判定」——
  // 已是在约客户 → 归入「在约客户」板块（续约信息与在约记录同步）；不在约 → 自动补建在约记录；
  // 只有距到期 ≤ RENEW_WINDOW_DAYS 天的才留在「续约跟进」，更久的自动退出该板块
  saveRenew: (data) => request('/renewals', { method: 'POST', body: JSON.stringify(data) }),
  // 跟进客户 → 转为在约：服务端在一个事务里完成「移出跟进 + 建立在约」，确保同一家客户不会同时出现在两个板块
  convertProspect: (id, data) => request(`/prospects/${id}/convert`, { method: 'POST', body: JSON.stringify(data) }),
};
