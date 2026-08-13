import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

/**
 * 面向后端数据库（SQLite）的 CRUD Hook。
 * data 为 null 表示尚未完成首次加载，此时 loading 为 true。
 */
export function useDbData(resource) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setData(await api.list(resource));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [resource]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = useCallback(
    async (item) => {
      const saved = await api.create(resource, item);
      setData((prev) => (prev ? [saved, ...prev] : [saved]));
      return saved;
    },
    [resource]
  );

  const update = useCallback(
    async (item) => {
      const saved = await api.update(resource, item.id, item);
      setData((prev) => (prev ? prev.map((x) => (x.id === saved.id ? saved : x)) : prev));
      return saved;
    },
    [resource]
  );

  const remove = useCallback(
    async (id) => {
      await api.remove(resource, id);
      setData((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
    },
    [resource]
  );

  return {
    data: data || [],
    loading: data === null && !error,
    error,
    reload,
    create,
    update,
    remove,
  };
}
