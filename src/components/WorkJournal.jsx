import { useState } from 'react';
import { formatCnDate, formatNoteTime, isInCurrentWeek, todayStr } from '../utils/date.js';

// 按天分组标题：今天 / 昨天 / 具体日期（含星期）
function dayLabel(date) {
  const today = todayStr();
  if (date === today) return '今天';
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (date === y) return '昨天';
  return formatCnDate(date);
}

export default function WorkJournal({ entries, onAdd, onRemove, onEdit }) {
  const [text, setText] = useState('');
  const [view, setView] = useState('week'); // 'week' 本周 | 'all' 全部（含历史）
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const today = todayStr();
  // 本周（周一~周日）的记录；更早的历史记录在「全部」视图下可查阅
  const weekEntries = entries.filter((w) => isInCurrentWeek(w.date));
  const todayCount = entries.filter((w) => w.date === today).length;
  const hiddenCount = entries.length - weekEntries.length;
  const displayEntries = view === 'all' ? entries : weekEntries;

  const add = (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    onAdd(content);
    setText('');
  };

  const startEdit = (w) => {
    setEditId(w.id);
    setEditText(w.content);
  };
  const cancelEdit = () => {
    setEditId(null);
    setEditText('');
  };
  const saveEdit = async () => {
    const content = editText.trim();
    if (!content) return;
    try {
      await onEdit(editId, content);
      setEditId(null);
      setEditText('');
    } catch (err) {
      // 错误由父级横幅展示，保留编辑框以便重试
    }
  };

  // 按归属日期倒序分组；组内按创建时间倒序（后端已按 createdAt DESC 返回）
  const dayOrder = [...new Set(displayEntries.map((w) => w.date))].sort((a, b) => b.localeCompare(a));
  const groups = dayOrder.map((date) => ({
    date,
    items: displayEntries
      .filter((w) => w.date === date)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }));

  return (
    <section className="panel panel-journal">
      <div className="panel-head">
        <div>
          <h2>📝 今日工作记录</h2>
          <p className="panel-desc">记录你每天做了什么——谈了哪几家客户、推进了哪些事，回头好复盘</p>
        </div>
        <div className="work-head-ops">
          {todayCount > 0 && <span className="pill pill-ok">今天已记 {todayCount} 条</span>}
          <div className="work-view-toggle">
            <button type="button" className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>
              本周
            </button>
            <button type="button" className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
              全部（{entries.length}）
            </button>
          </div>
        </div>
      </div>

      <form className="work-add" onSubmit={add}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="今天做了什么？例如：下午跟「某公司」把方案演示走完，约好下周商务谈判…"
        />
        <div className="work-add-foot">
          <span className="note-form-hint">{today} · 按系统时间归档</span>
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
            ＋ 记一笔
          </button>
        </div>
      </form>

      {groups.length === 0 ? (
        <div className="empty-block">
          {view === 'all'
            ? '还没有任何工作记录，写下一笔开始吧 ✍️'
            : hiddenCount > 0
              ? '本周还没有记录，写下一笔开始吧 ✍️'
              : '还没有任何工作记录，写下一笔开始吧 ✍️'}
        </div>
      ) : (
        <div className="work-list">
          {groups.map((g) => (
            <div key={g.date} className="work-day">
              <div className="work-day-head">
                <span>{dayLabel(g.date)}</span>
                <span className="work-day-count">{g.items.length} 条</span>
              </div>
              {g.items.map((w) => (
                <div key={w.id} className="work-item">
                  <div className="work-item-meta">
                    <span className="work-item-time">{formatNoteTime(w.createdAt).slice(11, 16)}</span>
                    <span className="work-item-ops">
                      <button className="link-btn" onClick={() => startEdit(w)}>
                        编辑
                      </button>
                      <button className="link-btn danger" onClick={() => onRemove(w.id)}>
                        删除
                      </button>
                    </span>
                  </div>
                  {editId === w.id ? (
                    <div className="note-edit">
                      <textarea value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                      <div className="note-edit-actions">
                        <span className="note-form-hint">保存后将覆盖该条记录</span>
                        <div>
                          <button type="button" className="link-btn" onClick={cancelEdit}>
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
                    <div className="work-item-content">{w.content}</div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {view === 'week' && hiddenCount > 0 && (
        <button type="button" className="work-hidden-note" onClick={() => setView('all')}>
          💾 更早的 {hiddenCount} 条记录已隐藏 · 点击查看全部
        </button>
      )}
    </section>
  );
}
