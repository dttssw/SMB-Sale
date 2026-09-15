import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatDate, formatNoteDate, formatNoteTime, formatCnDate, isInCurrentWeek, todayStr } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';
import { stageOf } from '../data/constants.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

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

function DetailItem({ label, value, full }) {
  return (
    <div className={`detail-item${full ? ' full' : ''}`}>
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

export default function CustomerDetail({ customerType, customer, onEdit, onRenew, onConvert, onDelete }) {
  const isContract = customerType === 'contract';
  const isPartner = customerType === 'partner';
  // 客户主档：跟进 / 在约 共用同一条备注时间线（customerType='customer'，以 customerId 为准）
  // 合作伙伴保持独立档案，备注仍按 partner + 自身 id
  const noteType = isPartner ? 'partner' : 'customer';
  const noteCid = isPartner ? customer.id : customer.customerId;
  const [menuOpen, setMenuOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [noteError, setNoteError] = useState('');
  const [notesLoading, setNotesLoading] = useState(true);
  const [noteView, setNoteView] = useState('week'); // 'week' 本周 | 'all' 全部（含历史）
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    let alive = true;
    setNotesLoading(true);
    api
      .listNotes(noteType, noteCid)
      .then((rows) => {
        if (alive) {
          setNotes(rows);
          setNoteError('');
        }
      })
      .catch((err) => {
        if (alive) setNoteError(err.message);
      })
      .finally(() => {
        if (alive) setNotesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [noteType, noteCid]);

  const addNote = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    try {
      const saved = await api.createNote({ id: uid(), customerType: noteType, customerId: noteCid, content });
      // 每条备注独立成行，直接插到最前即可（按 createdAt DESC 展示）
      setNotes((prev) => [saved, ...prev]);
      setText('');
      setNoteError('');
    } catch (err) {
      setNoteError(err.message);
    }
  };

  const removeNote = async (id) => {
    if (!window.confirm('确认删除该条备注？')) return;
    try {
      await api.removeNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setNoteError(err.message);
    }
  };

  const startEditNote = (n) => {
    setEditId(n.id);
    setEditText(n.content);
  };
  const cancelEditNote = () => {
    setEditId(null);
    setEditText('');
  };
  const saveEditNote = async () => {
    const content = editText.trim();
    if (!content) return;
    try {
      const saved = await api.updateNote(editId, content);
      setNotes((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
      setEditId(null);
      setEditText('');
    } catch (err) {
      setNoteError(err.message);
    }
  };

  // 本周（周一~周日）备注；更早的备注在「全部」视图下可查阅
  const weekNotes = notes.filter((n) => isInCurrentWeek(formatNoteDate(n.createdAt)));
  const hiddenCount = notes.length - weekNotes.length;
  const displayNotes = noteView === 'all' ? notes : weekNotes;

  // 按归属日期倒序分组；组内按创建时间倒序（后端已按 createdAt DESC 返回）
  const dayOrder = [...new Set(displayNotes.map((n) => formatNoteDate(n.createdAt)))].sort((a, b) => b.localeCompare(a));
  const groupedNotes = dayOrder.map((date) => ({
    date,
    items: displayNotes
      .filter((n) => formatNoteDate(n.createdAt) === date)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }));

  const items = [
    { label: '编辑', onClick: onEdit },
    ...(isContract && onRenew ? [{ label: '续约', onClick: onRenew }] : []),
    // 只有跟进类 New 客户可以转为在约：续约跟进（renew）本身已关联在约合同，再转会生成第二条在约记录
    ...(customerType === 'prospect' && customer.category === 'new' && onConvert
      ? [{ label: '转为在约', onClick: onConvert }]
      : []),
    { label: '删除', danger: true, onClick: onDelete },
  ];

  return (
    <div className="customer-detail">
      <div className="detail-actions">
        <div className="menu">
          <button type="button" className="btn btn-ghost" onClick={() => setMenuOpen((v) => !v)}>
            ⋯ 更多
          </button>
          {menuOpen && (
            <div className="menu-panel">
              {items.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  className={`menu-item${it.danger ? ' danger' : ''}`}
                  onClick={() => {
                    setMenuOpen(false);
                    it.onClick();
                  }}
                >
                  {it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="detail-grid">
        {isContract ? (
          <>
            <DetailItem label="客户名称" value={customer.name} full />
            <DetailItem label="产品" value={customer.plan} />
            <DetailItem label="联系人" value={customer.contact || '—'} />
            <DetailItem label="合同金额" value={`${formatMoney(customer.contractAmount)} 元`} />
            <DetailItem label="订阅开始时间" value={formatDate(customer.startDate)} />
            <DetailItem label="订阅到期时间" value={formatDate(customer.expiryDate)} full />
          </>
        ) : isPartner ? (
          <>
            <DetailItem label="合作伙伴名称" value={customer.name} full />
            <DetailItem label="联系人" value={customer.contact || '—'} />
          </>
        ) : (
          <>
            <DetailItem label="客户名称" value={customer.name} full />
            <DetailItem label="跟进阶段" value={stageOf(customer.stage).label} />
            <DetailItem label="联系人" value={customer.contact || '—'} />
            <DetailItem label="预计金额" value={`${formatMoney(customer.expectedAmount)} 元`} />
            <DetailItem label="上次跟进" value={customer.lastFollowUp ? formatDate(customer.lastFollowUp) : '—'} />
            <DetailItem label="下次跟进" value={customer.nextFollowUp ? formatDate(customer.nextFollowUp) : '—'} />
            {customer.category === 'renew' && (
              <DetailItem label="续约到期时间" value={customer.expiryDate ? formatDate(customer.expiryDate) : '—'} full />
            )}
          </>
        )}
      </div>

      <div className="note-section">
        <div className="note-head">
          <h4>📝 备注记录</h4>
          {notes.length > 0 && (
            <span className="note-head-ops">
              <span className="note-view-toggle">
                <button
                  type="button"
                  className={noteView === 'week' ? 'active' : ''}
                  onClick={() => setNoteView('week')}
                >
                  本周
                </button>
                <button
                  type="button"
                  className={noteView === 'all' ? 'active' : ''}
                  onClick={() => setNoteView('all')}
                >
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
            placeholder="填写备注内容，保存后按系统时间同步到时间线"
          />
          <div className="note-form-foot">
            <span className="note-form-hint">提交后按当前系统时间归档</span>
            <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
              提交备注
            </button>
          </div>
        </form>
        {noteError && <div className="form-error">⚠️ {noteError}</div>}

        {notesLoading ? (
          <div className="note-empty">加载备注中…</div>
        ) : displayNotes.length === 0 ? (
          <div className="note-empty">
            {noteView === 'all'
              ? '暂无备注，可填写并提交第一条汇总'
              : hiddenCount > 0
                ? '本周暂无备注，可填写并提交第一条汇总'
                : '暂无备注，可填写并提交第一条汇总'}
          </div>
        ) : (
          <div className="note-list">
            {groupedNotes.map((g) => (
              <div key={g.date} className="note-day">
                <div className="note-day-head">
                  <span>{dayLabel(g.date)}</span>
                  <span className="note-day-count">{g.items.length} 条</span>
                </div>
                {g.items.map((n) => (
                  <div key={n.id} className="note-item">
                    <div className="note-meta">
                      <span className="note-time">{formatNoteTime(n.createdAt).slice(11, 16)}</span>
                      <span className="note-ops">
                        <button className="link-btn" onClick={() => startEditNote(n)}>
                          编辑
                        </button>
                        <button className="link-btn danger" onClick={() => removeNote(n.id)}>
                          删除
                        </button>
                      </span>
                    </div>
                    {editId === n.id ? (
                      <div className="note-edit">
                        <textarea value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                        <div className="note-edit-actions">
                          <span className="note-form-hint">保存后将覆盖该条备注</span>
                          <div>
                            <button type="button" className="link-btn" onClick={cancelEditNote}>
                              取消
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={saveEditNote}
                              disabled={!editText.trim()}
                            >
                              保存
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="note-content">{n.content}</div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {noteView === 'week' && hiddenCount > 0 && (
          <button type="button" className="work-hidden-note" onClick={() => setNoteView('all')}>
            💾 更早的 {hiddenCount} 条备注已隐藏 · 点击查看全部
          </button>
        )}
      </div>
    </div>
  );
}
