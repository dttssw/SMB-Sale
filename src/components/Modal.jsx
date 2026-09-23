import Icon from './icons.jsx';

/**
 * 弹窗：屏幕居中，560px；表单类由 App 传 wide（640px）。
 * 遮罩只有 rgba(0,0,0,.6) 一层，不加模糊；头部 16px/600 + 右上角 16px 关闭图标。
 */
export default function Modal({ title, onClose, error, children, wide = false }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div
        className={`modal${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error modal-error">{error}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}

