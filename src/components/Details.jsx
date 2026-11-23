import { useState } from 'react';
import Badge from './Badge.jsx';
import Icon from './icons.jsx';
import NotesSection from './NotesSection.jsx';
import { daysUntil, formatDate } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';
import { skusOf } from '../utils/sku.js';
import { RENEW_WINDOW_DAYS } from '../data/constants.js';

function Fact({ label, value }) {
  return (
    <div className="detail-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function statusBadge(status) {
  if (status === 'won') return <Badge tone="ok">已签</Badge>;
  if (status === 'watching') return <Badge tone="info">长期观察</Badge>;
  if (status === 'lost') return <Badge tone="danger">Lost</Badge>;
  return <Badge tone="primary">跟进中</Badge>;
}

function projectExpiryBadge(project) {
  if (project.status !== 'won' || !project.expiryDate) return null;
  const days = daysUntil(project.expiryDate);
  if (days == null) return null;
  if (days < 0) return { label: `已到期 ${-days} 天`, tone: 'danger' };
  if (days === 0) return { label: '今日到期', tone: 'danger' };
  if (days <= RENEW_WINDOW_DAYS) return { label: `还剩 ${days} 天到期`, tone: 'warn' };
  return { label: '正常在约', tone: 'ok' };
}

function SkuValue({ project }) {
  const skus = skusOf(project);
  if (!skus.length) return '—';
  return (
    <span className="sku-tags">
      {skus.map((sku) => (
        <span className="plan-tag" key={sku}>
          {sku}
        </span>
      ))}
    </span>
  );
}

function DetailMenu({ items }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="menu">
      <button type="button" className="btn btn-ghost" onClick={() => setOpen((v) => !v)}>
        <Icon name="more" />
        更多
      </button>
      {open && (
        <div className="menu-panel">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`menu-item${item.danger ? ' danger' : ''}`}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const statusCopy = {
  active: '该项目正在跟进中；赢单、长期观察或 Lost 都只作用于这个项目',
  watching: '该项目处于长期观察，不安排定时跟进；同客户的其他项目不受影响',
  won: '该项目已赢单，成交金额与订阅信息已保存；续约会创建新的独立项目',
  lost: '该项目已标记 Lost；客户主档和其他项目保持原样，可随时恢复',
};

export function ProjectDetail({
  project,
  onEdit,
  onWin,
  onRenew,
  onWatch,
  onLost,
  onRestore,
  onDelete,
  onCustomer,
  onNotesChanged,
}) {
  const expiry = projectExpiryBadge(project);
  const actions = [
    { label: '编辑项目', onClick: onEdit },
    ...(project.status === 'active' ? [{ label: '赢单 / 签约', onClick: onWin }] : []),
    ...(project.status === 'won' ? [{ label: '新建续约项目', onClick: onRenew }] : []),
    ...(project.status === 'active' ? [{ label: '转为长期观察', onClick: onWatch }] : []),
    ...(['active', 'watching'].includes(project.status) && onLost
      ? [{ label: '标记为 Lost', onClick: onLost }]
      : []),
    ...(['lost', 'watching'].includes(project.status) && onRestore
      ? [{ label: '恢复为进行中', onClick: onRestore }]
      : []),
    { label: '删除项目', danger: true, onClick: onDelete },
  ];

  return (
    <div className="customer-detail">
      <div className={`status-hint ${project.status}`}>
        <Icon name={project.status === 'lost' ? 'alert' : project.status === 'won' ? 'check' : 'target'} />
        <span>{statusCopy[project.status]}</span>
      </div>

      <div className="customer-detail-grid">
        <aside className="detail-aside" aria-label="项目档案">
          <div className="detail-aside-head">
            <div className="detail-aside-title">
              <h4 className="detail-name" title={project.name}>
                {project.name}
              </h4>
              <div className="detail-badges">
                {statusBadge(project.status)}
                <Badge tone="info">{project.category === 'renew' ? 'Renew' : project.category === 'new' ? 'New' : '历史'}</Badge>
                {expiry && <Badge tone={expiry.tone}>{expiry.label}</Badge>}
              </div>
            </div>
            <DetailMenu items={actions} />
          </div>

          <div className="detail-aside-scroll">
            <dl className="detail-facts">
              <Fact
                label="最终客户"
                value={
                  <button type="button" className="link-btn" onClick={onCustomer}>
                    {project.customerName}
                  </button>
                }
              />
              <Fact label="合作伙伴" value={project.partnerName || '—'} />
              <Fact label="项目联系人" value={project.contact || '—'} />
              <Fact label="SKU" value={<SkuValue project={project} />} />
              <Fact
                label={project.status === 'won' ? '成交金额' : '预计金额'}
                value={`${formatMoney(project.status === 'won' ? project.contractAmount : project.expectedAmount)} 元`}
              />
              {project.status === 'won' && (
                <>
                  <Fact label="订阅开始" value={formatDate(project.startDate)} />
                  <Fact label="订阅到期" value={formatDate(project.expiryDate)} />
                </>
              )}
              {project.status !== 'won' && (
                <>
                  <Fact label="上次跟进" value={formatDate(project.lastFollowUp)} />
                  <Fact label="下次跟进" value={project.status === 'watching' ? '—（长期观察）' : formatDate(project.nextFollowUp)} />
                </>
              )}
              {project.sourceProjectName && (
                <Fact label="来源已签项目" value={project.sourceProjectName} />
              )}
            </dl>
          </div>
        </aside>

        <NotesSection
          customerType="customer"
          customerId={project.customerId}
          projectId={project.id}
          projectMode
          onChanged={onNotesChanged}
        />
      </div>
    </div>
  );
}

export function CustomerDetail({
  customer,
  projects,
  onEdit,
  onDelete,
  onNewProject,
  onViewProject,
  onNotesChanged,
}) {
  const active = projects.filter((p) => ['active', 'watching'].includes(p.status));
  const signed = projects.filter((p) => p.status === 'won');
  const lost = projects.filter((p) => p.status === 'lost');
  const actions = [
    { label: '编辑客户', onClick: onEdit },
    { label: '删除客户', danger: true, onClick: onDelete },
  ];

  return (
    <div className="customer-detail">
      <div className="status-hint active">
        <Icon name="users" />
        <span>客户只保存主档信息；这里的所有项目互不影响，一个客户可以同时有多个新签和续约项目</span>
      </div>
      <div className="customer-detail-grid">
        <aside className="detail-aside" aria-label="客户档案">
          <div className="detail-aside-head">
            <div className="detail-aside-title">
              <h4 className="detail-name" title={customer.name}>
                {customer.name}
              </h4>
              <div className="detail-badges">
                <Badge tone="ok">进行中 {active.length}</Badge>
                <Badge tone="info">已签 {signed.length}</Badge>
                {lost.length > 0 && <Badge tone="danger">Lost {lost.length}</Badge>}
              </div>
            </div>
            <DetailMenu items={actions} />
          </div>
          <div className="detail-aside-scroll">
            <dl className="detail-facts">
              <Fact label="默认联系人" value={customer.contact || '—'} />
              <Fact label="全部项目" value={`${projects.length} 个`} />
              <Fact label="进行中项目" value={`${active.length} 个`} />
              <Fact label="已签项目" value={`${signed.length} 个`} />
            </dl>
            <div className="related-projects-head">
              <h5>客户项目</h5>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onNewProject}>
                <Icon name="plus" />
                新建项目
              </button>
            </div>
            <div className="related-project-list">
              {projects.map((project) => (
                <button
                  type="button"
                  key={project.id}
                  className="related-project-item"
                  onClick={() => onViewProject(project)}
                >
                  <span className="related-project-name">{project.name}</span>
                  <span className="related-project-meta">
                    {statusBadge(project.status)}
                    <span>{project.category === 'renew' ? '续约' : '新签'}</span>
                  </span>
                </button>
              ))}
              {projects.length === 0 && <p className="field-hint">暂无项目，点击上方「新建项目」开始跟进</p>}
            </div>
          </div>
        </aside>

        <NotesSection customerType="customer" customerId={customer.id} onChanged={onNotesChanged} />
      </div>
    </div>
  );
}

export function PartnerDetail({ partner, projects, onEdit, onDelete, onViewProject, onNotesChanged }) {
  const actions = [
    { label: '编辑合作伙伴', onClick: onEdit },
    { label: '删除合作伙伴', danger: true, onClick: onDelete },
  ];
  return (
    <div className="customer-detail">
      <div className="customer-detail-grid">
        <aside className="detail-aside" aria-label="合作伙伴档案">
          <div className="detail-aside-head">
            <div className="detail-aside-title">
              <h4 className="detail-name" title={partner.name}>
                {partner.name}
              </h4>
              <div className="detail-badges">
                <Badge tone="info">关联项目 {projects.length}</Badge>
              </div>
            </div>
            <DetailMenu items={actions} />
          </div>
          <div className="detail-aside-scroll">
            <p className="field-hint">合作伙伴联系人请逐条写在右侧备注中；删除合作伙伴不会删除关联项目。</p>
            <div className="related-projects-head">
              <h5>关联项目</h5>
            </div>
            <div className="related-project-list">
              {projects.map((project) => (
                <button type="button" key={project.id} className="related-project-item" onClick={() => onViewProject(project)}>
                  <span className="related-project-name">{project.name}</span>
                  <span className="related-project-meta">
                    {statusBadge(project.status)}
                    <span>{project.customerName}</span>
                  </span>
                </button>
              ))}
              {projects.length === 0 && <p className="field-hint">暂无关联项目</p>}
            </div>
          </div>
        </aside>
        <NotesSection customerType="partner" customerId={partner.id} onChanged={onNotesChanged} />
      </div>
    </div>
  );
}
