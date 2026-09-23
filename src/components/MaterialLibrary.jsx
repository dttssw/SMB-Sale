import { useRef, useState } from 'react';
import useFitScroll, { useViewport } from '../hooks/useViewportFit.js';
import Icon from './icons.jsx';

/**
 * 按扩展名归到同一套 16px 线性图标（不再按格式换 emoji）：
 * doc / pdf / ppt / xls / img / html / md / zip / 其他
 */
const FILE_ICONS = {
  pdf: 'filePdf',
  ppt: 'filePpt',
  pptx: 'filePpt',
  doc: 'fileDoc',
  docx: 'fileDoc',
  wps: 'fileDoc',
  txt: 'fileDoc',
  xls: 'fileXls',
  xlsx: 'fileXls',
  csv: 'fileXls',
  html: 'fileHtml',
  htm: 'fileHtml',
  md: 'fileMd',
  zip: 'fileZip',
  rar: 'fileZip',
  '7z': 'fileZip',
  png: 'fileImg',
  jpg: 'fileImg',
  jpeg: 'fileImg',
  gif: 'fileImg',
  webp: 'fileImg',
  svg: 'fileImg',
  mp4: 'fileOther',
  mp3: 'fileOther',
  json: 'fileOther',
};

// 支持浏览器直接新标签内联预览的类型（无脚本执行风险：PDF / 图片）
const PREVIEWABLE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp']);
// HTML/SVG 可内嵌脚本（XSS 风险），需通过沙箱 iframe 隔离预览，不能直接新标签打开
const SANDBOX_PREVIEWABLE = new Set(['html', 'htm', 'svg']);

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function MaterialLibrary({ materials, onUpload, onDelete }) {
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { name, url }
  // 按窗口高度自适应：材料清单的高度跟着窗口大小走
  const viewport = useViewport();
  const { panelRef, scrollRef, maxHeight } = useFitScroll(viewport.height, [materials.length, files.length]);

  const chooseFiles = (e) => {
    const list = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...list].slice(0, 20)); // 单次最多保留 20 个待上传文件
    e.target.value = ''; // 允许重复选择同一文件
  };

  const removePending = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      await onUpload(files, note);
      setFiles([]);
      setNote('');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);

  const closePreview = () => setPreview(null);

  // 打开预览：PDF / 图片直接在浏览器新标签查看；HTML/SVG 用沙箱 iframe 内联加载，拒执行脚本（防 XSS）
  const openPreview = (m) => {
    const ext = (m.ext || extOf(m.name)).replace('.', '');
    if (SANDBOX_PREVIEWABLE.has(ext)) {
      setPreview({ name: m.name, url: m.url });
    } else {
      window.open(m.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      <section className="panel" ref={panelRef}>
        <div className="panel-head">
        <div>
          <h2>材料库</h2>
          <p className="panel-desc">上传产品方案、报价单、合同模板等资料（PDF / PPT / Word / Excel / HTML / SVG / 图片等），支持在线预览与下载（HTML/SVG 以沙箱隔离预览）</p>
        </div>
      </div>

      <div className="material-upload">
        <div className="material-upload-main">
          <button type="button" className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? '上传中…' : (
              <>
                <Icon name="plus" />
                选择文件
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={chooseFiles}
            accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.html,.htm,.svg,.md,.txt,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar,.7z,.mp4,.mp3,.json,.wps"
          />
          {files.length > 0 && (
            <div className="material-pending">
              <div className="material-pending-list">
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="material-pending-item">
                    <Icon name={FILE_ICONS[extOf(f.name)] || 'fileOther'} />
                    <span className="material-name">
                      <span className="material-filename" title={f.name}>{f.name}</span>
                    </span>
                    <button type="button" className="icon-btn" onClick={() => removePending(i)} aria-label="移除">
                      <Icon name="close" size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="material-pending-info">
                共 {files.length} 个文件，合计 {formatSize(totalSize)}
              </div>
            </div>
          )}
        </div>
        <div className="material-upload-side">
          <input
            type="text"
            className="material-note-input"
            placeholder="备注（可选）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={100}
            disabled={uploading}
          />
          <button type="button" className="btn btn-ghost" onClick={submit} disabled={!files.length || uploading}>
            {uploading ? '上传中…' : '上传'}
          </button>
        </div>
      </div>

      {error && (
        <div className="db-banner error">
          <span>{error}</span>
          <button type="button" className="icon-btn" onClick={() => setError('')} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
      )}

      <div
        className="table-wrap fit-scroll"
        ref={scrollRef}
        style={maxHeight > 0 ? { '--fit-max': `${maxHeight}px` } : undefined}
      >
        <table className="table">
          <thead>
            <tr>
              <th>文件名</th>
              <th>类型</th>
              <th className="num">大小</th>
              <th className="col-opt">备注</th>
              <th className="num col-opt">上传时间</th>
              <th className="ops">操作</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => {
              const ext = (m.ext || extOf(m.name)).replace('.', '');
              const icon = FILE_ICONS[ext] || 'fileOther';
              const previewable = PREVIEWABLE.has(ext) || SANDBOX_PREVIEWABLE.has(ext);
              return (
                <tr key={m.id}>
                  <td>
                    <div className="cell-main material-name">
                      <span className="material-icon">
                        <Icon name={icon} />
                      </span>
                      <span className="material-filename" title={m.name}>
                        {m.name}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="plan-tag">{ext ? ext.toUpperCase() : '文件'}</span>
                  </td>
                  <td className="num">{formatSize(m.size)}</td>
                  <td className="col-opt">
                    <span className="cell-sub">{m.note || '—'}</span>
                  </td>
                  <td className="num col-opt">{m.createdAt ? m.createdAt.slice(0, 10) : '—'}</td>
                  <td className="ops">
                    {previewable ? (
                      <button type="button" className="link-btn" onClick={() => openPreview(m)}>
                        预览
                      </button>
                    ) : null}
                    <a
                      className="link-btn"
                      href={`/api/materials/${m.id}/download`}
                      download={m.name}
                      title="下载"
                    >
                      下载
                    </a>
                    <button type="button" className="link-btn danger" onClick={() => onDelete(m.id)}>
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
            {materials.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  <div className="empty-state">
                    <p>材料库为空，上传方案 / 报价 / 合同模板后可在同一处预览与下载</p>
                    <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                      <Icon name="plus" />
                      选择文件
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      </section>

      {preview && (
        <div className="preview-overlay" onClick={closePreview}>
          <div className="preview-box" onClick={(e) => e.stopPropagation()}>
            <div className="preview-head">
              <span className="preview-title" title={preview.name}>
                {preview.name}
              </span>
              <span className="preview-tag">沙箱预览</span>
              <button type="button" className="icon-btn" onClick={closePreview} aria-label="关闭">
                <Icon name="close" />
              </button>
            </div>
            <iframe
              className="preview-iframe"
              title={preview.name}
              src={preview.url}
              sandbox=""
            />
          </div>
        </div>
      )}
    </>
  );
}
