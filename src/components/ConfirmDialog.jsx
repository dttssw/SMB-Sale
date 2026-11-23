import { useState } from 'react';
import Modal from './Modal.jsx';

/**
 * 二次确认弹窗：删除 / 状态变更这类不可逆或影响面大的操作都必须先过这一层。
 * 确认按钮走异步回调，失败时错误留在弹窗里，不关窗也不丢上下文。
 */
export default function ConfirmDialog({
  title = '请确认',
  message,
  confirmText = '确认',
  danger = true,
  onCancel,
  onConfirm,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message || '操作失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={busy ? undefined : onCancel} error={error}>
      <p className="confirm-text">{message}</p>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button
          type="button"
          className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
          onClick={run}
          disabled={busy}
        >
          {busy ? '处理中…' : confirmText}
        </button>
      </div>
    </Modal>
  );
}
