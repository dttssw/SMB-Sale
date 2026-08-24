import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatDate, formatNoteTime } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';
import { stageOf } from '../data/constants.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// 备注时间在 utils/date.js 的 formatNoteTime 里按本地时区换算（datetime('now') 存的是 UTC）
function timeLabel(createdAt) {
  return formatNoteTime(createdAt);
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [noteError, setNoteError] = useState('');
  const [notesLoading, setNotesLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setNotesLoading(true);
    api
      .listNotes(customerType, customer.id)
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
  }, [customerType, customer.id]);

  const addNote = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    try {
      const saved = await api.createNote({ id: uid(), customerType, customerId: customer.id, content });
      // 同一天备注会合并到已有那条（后端返回合并后的同一条），据此做替换而非追加，避免重复
      setNotes((prev) =>
        prev.some((n) => n.id === saved.id) ? [saved, ...prev.filter((n) => n.id !== saved.id)] : [saved, ...prev]
      );
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

  const items = [
    { label: '编辑', onClick: onEdit },
    ...(isContract && onRenew ? [{ label: '续约', onClick: onRenew }] : []),
    ...(!isContract && onConvert ? [{ label: '转为在约', onClick: onConvert }] : []),
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
        <h4>📝 备注记录</h4>
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
        ) : notes.length === 0 ? (
          <div className="note-empty">暂无备注，可填写并提交第一条汇总</div>
        ) : (
          <div className="note-list">
            {notes.map((n) => (
              <div key={n.id} className="note-item">
                <div className="note-meta">
                  <span className="note-time">🕒 {timeLabel(n.createdAt)}</span>
                  <button className="link-btn danger" onClick={() => removeNote(n.id)}>
                    删除
                  </button>
                </div>
                <div className="note-content">{n.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
