import Badge from './Badge.jsx';
import Icon from './icons.jsx';
import NotesSection from './NotesSection.jsx';
import { daysUntil, formatDate } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';
import { skuEntriesOf, isServiceOnly } from '../utils/sku.js';
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
  if (project.status !== 'won' || !project.expiryDate || isServiceOnly(project)) return null;
  const days = daysUntil(project.expiryDate);
  if (days == null) return null;
  if (days < 0) return { label: `已到期 ${-days} 天`, tone: 'danger' };
  if (days === 0) return { label: '今日到期', tone: 'danger' };
  if (days <= RENEW_WINDOW_DAYS) return { label: `还剩 ${days} 天到期`, tone: 'warn' };
  return { label: '正常在约', tone: 'ok' };
}

function SkuValue({ project }) {
  const entries = skuEntriesOf(project);
  if (!entries.length) return '—';
  return (
    <span className="sku-tags">
      {entries.map(({ sku, qty }) => (
        <span className="plan-tag" key={sku}>
          {sku}
          <i className="sku-qty-tag">×{qty}</i>
        </span>
      ))}
    </span>
  );
}

/**
 * 操作区：左侧是常规操作（编辑 / 观察 / Lost / 恢复），右侧是重量级操作。
 * 赢单 / 签约、新建续约与「删除项目」放在同一组、同一尺寸——它们是会改写项目结果的动作，
 * 不该和常规按钮混在一排；删除仍然单独靠最右，点击后走二次确认。
 */
function DetailActions({ items }) {
  if (!items.length) return null;
  const routine = items.filter((item) => !item.tone);
  const major = items.filter((item) => item.tone === 'major');
  const danger = items.filter((item) => item.tone === 'danger');

  return (
    <div className="detail-actions">
      <div className="detail-actions-group">
        {routine.map((item) => (
          <button key={item.label} type="button" className="btn btn-action" onClick={item.onClick}>
            {item.icon && <Icon name={item.icon} />}
            {item.label}
          </button>
        ))}
      </div>
      {(major.length > 0 || danger.length > 0) && (
        <div className="detail-actions-group detail-actions-group-end">
          {major.map((item) => (
            <button key={item.label} type="button" className="btn btn-primary btn-action-lg" onClick={item.onClick}>
              {item.icon && <Icon name={item.icon} />}
              {item.label}
            </button>
          ))}
          {danger.map((item) => (
            <button key={item.label} type="button" className="btn btn-danger btn-action-lg" onClick={item.onClick}>
              {item.icon && <Icon name={item.icon} />}
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
  const serviceOnly = isServiceOnly(project);
  const expiry = projectExpiryBadge(project);
  const actions = [
    { label: '编辑项目', icon: 'edit', onClick: onEdit },
    ...(project.status === 'active' ? [{ label: '转为长期观察', icon: 'eye', onClick: onWatch }] : []),
    ...(['lost', 'watching'].includes(project.status) && onRestore
      ? [{ label: '恢复为进行中', icon: 'refresh', onClick: onRestore }]
      : []),
    ...(['active', 'watching'].includes(project.status) && onLost
      ? [{ label: '标记为 Lost', icon: 'alert', onClick: onLost }]
      : []),
    ...(project.status === 'active'
      ? [{ label: '赢单 / 签约', icon: 'check', tone: 'major', onClick: onWin }]
      : []),
    ...(project.status === 'won' && !serviceOnly
      ? [{ label: '新建续约项目', icon: 'refresh', tone: 'major', onClick: onRenew }]
      : []),
    { label: '删除项目', icon: 'trash', tone: 'danger', onClick: onDelete },
  ];
  const hint =
    project.status === 'won' && serviceOnly
      ? '该项目已赢单，成交金额已保存；PS 人天服务一次性交付，没有订阅期限，也不产生续约'
      : statusCopy[project.status];

  return (
    <div className="customer-detail">
      <div className={`status-hint ${project.status}`}>
        <Icon name={project.status === 'lost' ? 'alert' : project.status === 'won' ? 'check' : 'target'} />
        <span>{hint}</span>
      </div>

      <DetailActions items={actions} />

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
              {project.status === 'won' && !serviceOnly && (
                <>
                  <Fact label="订阅开始" value={formatDate(project.startDate)} />
                  <Fact label="订阅到期" value={formatDate(project.expiryDate)} />
                </>
              )}
              {project.status === 'won' && serviceOnly && (
                <Fact label="订阅期限" value="无 · PS 人天服务一次性交付" />
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
    { label: '编辑客户', icon: 'edit', onClick: onEdit },
    { label: '删除客户', icon: 'trash', tone: 'danger', onClick: onDelete },
  ];

  return (
    <div className="customer-detail">
      <div className="status-hint active">
        <Icon name="users" />
        <span>客户只保存主档信息；这里的所有项目互不影响，一个客户可以同时有多个新签和续约项目</span>
      </div>
      <DetailActions items={actions} />
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
    { label: '编辑合作伙伴', icon: 'edit', onClick: onEdit },
    { label: '删除合作伙伴', icon: 'trash', tone: 'danger', onClick: onDelete },
  ];
  return (
    <div className="customer-detail">
      <DetailActions items={actions} />
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
