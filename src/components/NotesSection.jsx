import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from './icons.jsx';
import { formatDate, formatCnDate, formatNoteDate, formatNoteTime, isInCurrentWeek, todayStr } from '../utils/date.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function dayLabel(date) {
  const today = todayStr();
  if (date === today) return '今天';
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (date === yesterday) return '昨天';
  return formatCnDate(date);
}

export default function NotesSection({
  customerType,
  customerId,
  projectId = null,
  onChanged,
  projectMode = false,
}) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('week');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .listNotes(customerType, customerId, projectId)
      .then((rows) => {
        if (!alive) return;
        setNotes(rows);
        setError('');
      })
      .catch((err) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [customerType, customerId, projectId]);

  const addNote = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    try {
      const saved = await api.createNote({
        id: uid(),
        customerType,
        customerId,
        projectId: projectId || null,
        content,
      });
      setNotes((prev) => [saved, ...prev]);
      setText('');
      setError('');
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeNote = async (id) => {
    if (!window.confirm('确认删除该条备注？')) return;
    try {
      await api.removeNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const saveEdit = async () => {
    const content = editText.trim();
    if (!content) return;
    try {
      const saved = await api.updateNote(editId, content);
      setNotes((prev) => prev.map((n) => (n.id === saved.id ? { ...n, ...saved } : n)));
      setEditId(null);
      setEditText('');
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const weekNotes = notes.filter((n) => isInCurrentWeek(formatNoteDate(n.createdAt)));
  const hiddenCount = notes.length - weekNotes.length;
  const displayNotes = view === 'all' ? notes : weekNotes;
  const dayOrder = [...new Set(displayNotes.map((n) => formatNoteDate(n.createdAt)))].sort((a, b) => b.localeCompare(a));
  const grouped = dayOrder.map((date) => ({
    date,
    items: displayNotes
      .filter((n) => formatNoteDate(n.createdAt) === date)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }));

  return (
    <section className="note-section" aria-label={projectMode ? '项目备注' : '备注记录'}>
      <div className="note-head">
        <div className="note-head-title">
          <h4>{projectMode ? '项目备注' : '备注记录'}</h4>
          <span className="note-head-sub">
            {notes.length > 0 ? `共 ${notes.length} 条 · 本周 ${weekNotes.length} 条` : '按系统时间归档'}
          </span>
        </div>
        {notes.length > 0 && (
          <span className="note-head-ops">
            <span className="note-view-toggle">
              <button type="button" className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>
                本周
              </button>
              <button type="button" className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
                全部（{notes.length}）
              </button>
            </span>
          </span>
        )}
      </div>
      <form className="note-form" onSubmit={addNote}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={projectMode ? '记录这个项目的沟通、方案、商务进展和下一步' : '写一条跟进记录：沟通了谁、聊到哪一步、下一步做什么'}
        />
        <div className="note-form-foot">
          <span className="note-form-hint">
            {projectMode ? '只刷新当前项目的跟进日期，不影响同客户其他项目' : '按当前系统时间归档'}
          </span>
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
            提交备注
          </button>
        </div>
      </form>
      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="note-empty">加载备注中…</div>
      ) : displayNotes.length === 0 ? (
        <div className="note-empty">{view === 'all' ? '暂无备注，可填写第一条' : '本周暂无备注，可填写第一条'}</div>
      ) : (
        <div className="note-list">
          {grouped.map((group) => (
            <div key={group.date} className="note-day">
              <div className="note-day-head">
                <span>{dayLabel(group.date)}</span>
                <span className="note-day-count">{group.items.length} 条</span>
              </div>
              {group.items.map((note) => (
                <div key={note.id} className="note-item">
                  <div className="note-meta">
                    <span className="note-time">{formatNoteTime(note.createdAt).slice(11, 16)}</span>
                    <span className="note-ops">
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => {
                          setEditId(note.id);
                          setEditText(note.content);
                        }}
                      >
                        编辑
                      </button>
                      <button type="button" className="link-btn danger" onClick={() => removeNote(note.id)}>
                        删除
                      </button>
                    </span>
                  </div>
                  {note.projectName && !projectMode && (
                    <div className="note-project-tag">
                      <Icon name="briefcase" size={12} /> {note.projectName}
                    </div>
                  )}
                  {editId === note.id ? (
                    <div className="note-edit">
                      <textarea value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                      <div className="note-edit-actions">
                        <span className="note-form-hint">保存后将覆盖该条备注</span>
                        <div>
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => {
                              setEditId(null);
                              setEditText('');
                            }}
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={saveEdit}
                            disabled={!editText.trim()}
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="note-content">{note.content}</div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {view === 'week' && hiddenCount > 0 && (
        <button type="button" className="work-hidden-note" onClick={() => setView('all')}>
          <Icon name="chevronDown" />
          更早的 {hiddenCount} 条备注已隐藏 · 点击查看全部
        </button>
      )}
    </section>
  );
}
