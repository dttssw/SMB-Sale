import { useEffect, useMemo, useRef, useState } from 'react';
import { useDbData } from './hooks/useDbData.js';
import { useViewport } from './hooks/useViewportFit.js';
import { api } from './api.js';
import { daysUntil, formatCnDate, monthOf, todayStr } from './utils/date.js';
import { hashForSection, sectionFromHash } from './utils/route.js';
import { sumBy } from './utils/format.js';
import { RENEW_WINDOW_DAYS } from './data/constants.js';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Home from './components/Home.jsx';
import SignedProjects from './components/SignedProjects.jsx';
import ProjectList from './components/ProjectList.jsx';
import { WatchList, LostProjects } from './components/ProjectStatusList.jsx';
import CustomerList from './components/CustomerList.jsx';
import PartnerList from './components/PartnerList.jsx';
import RevenuePanel from './components/RevenuePanel.jsx';
import WorkJournal from './components/WorkJournal.jsx';
import MaterialLibrary from './components/MaterialLibrary.jsx';
import Modal from './components/Modal.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import Icon from './components/icons.jsx';
import { ProjectForm, WinProjectForm, CustomerForm, PartnerForm, DealForm } from './components/forms.jsx';
import { ProjectDetail, CustomerDetail, PartnerDetail } from './components/Details.jsx';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const SECTIONS = [
  { key: 'home', label: '总览', icon: 'home', desc: '今日聚焦与关键数字' },
  { key: 'journal', label: '今日工作', icon: 'journal', desc: '每天做了什么，按天归档' },
  { key: 'projects', label: '项目跟进', icon: 'target', desc: '按项目推进新签与续约，同客户可以并行多个项目' },
  { key: 'signed', label: '已签项目', icon: 'clipboard', desc: '已赢单项目的成交与订阅信息，临期时可创建续约' },
  { key: 'customers', label: '客户名单', icon: 'users', desc: '只维护客户主档，查看该客户的全部项目与备注' },
  { key: 'watch', label: '长期观察', icon: 'eye', desc: '暂时不需要定时跟进、但需要长期留意的项目' },
  { key: 'lost', label: 'Lost 项目', icon: 'alert', desc: '未赢单项目归档，客户与其他项目不受影响' },
  { key: 'partners', label: '合作伙伴', icon: 'briefcase', desc: '渠道商 / 代理商主档与关联项目' },
  { key: 'revenue', label: '成交金额', icon: 'coins', desc: '按项目查看新签与续约成交' },
  { key: 'materials', label: '材料库', icon: 'folder', desc: '方案 / 报价 / 合同模板等资料' },
];

const NAV_KEYS = SECTIONS.map((section) => section.key);
const HASH_ALIASES = { follow: 'projects', contracts: 'signed' };

function readSection() {
  const raw = window.location.hash.replace(/^#\/?/, '').split(/[?#]/)[0].replace(/\/+$/, '').trim();
  const key = HASH_ALIASES[raw] || raw;
  return sectionFromHash(key ? `#/${key}` : '', NAV_KEYS);
}

const modalTitle = (modal) => {
  if (modal.kind === 'detailProject') return '项目详情';
  if (modal.kind === 'detailCustomer') return '客户详情';
  if (modal.kind === 'detailPartner') return '合作伙伴详情';
  if (modal.kind === 'project') return modal.data?.id ? '编辑项目' : '新建项目';
  if (modal.kind === 'customer') return modal.data?.id ? '编辑客户' : '新建客户';
  if (modal.kind === 'partner') return modal.data?.id ? '编辑合作伙伴' : '新建合作伙伴';
  if (modal.kind === 'win') return '项目赢单 / 签约';
  if (modal.kind === 'renew') return '新建续约项目';
  if (modal.kind === 'deal') return '记录成交金额';
  return '';
};

const FOLLOW_LAYOUTS = [
  { key: 'auto', label: '自动', title: '宽屏双栏，窄屏单栏' },
  { key: 'split', label: '双栏', title: 'New / Renew 并排显示' },
  { key: 'wide', label: '单栏全宽', title: '每个项目板块占满整宽' },
];

const AUTO_SPLIT_MIN_WIDTH = 1280;

export default function App() {
  const projectsDb = useDbData('projects');
  const customersDb = useDbData('customers');
  const partnersDb = useDbData('partners');
  const dealsDb = useDbData('deals');
  const materialsDb = useDbData('materials');
  const worklogsDb = useDbData('worklogs');
  const [modal, setModalState] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [nav, setNav] = useState(readSection);
  const [followLayout, setFollowLayout] = useState('auto');
  const viewport = useViewport();
  const syncRef = useRef(false);

  const setModal = (next) => {
    setActionError('');
    setActionNotice('');
    setModalState(next);
  };

  useEffect(() => {
    const onHashChange = () => setNav(readSection());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', hashForSection(nav));
    const raw = window.location.hash.replace(/^#\/?/, '').split(/[?#]/)[0];
    if (HASH_ALIASES[raw]) window.history.replaceState(null, '', hashForSection(HASH_ALIASES[raw]));
  }, []);

  const selectNav = (key) => {
    if (key === nav) return;
    setNav(key);
    window.location.hash = hashForSection(key);
  };

  const active = SECTIONS.find((section) => section.key === nav) || SECTIONS[0];
  const layoutMode =
    followLayout === 'auto' ? (viewport.width >= AUTO_SPLIT_MIN_WIDTH ? 'split' : 'wide') : followLayout;

  const loading =
    projectsDb.loading ||
    customersDb.loading ||
    partnersDb.loading ||
    dealsDb.loading ||
    materialsDb.loading ||
    worklogsDb.loading;
  const dbError =
    projectsDb.error ||
    customersDb.error ||
    partnersDb.error ||
    dealsDb.error ||
    materialsDb.error ||
    worklogsDb.error;

  const projects = projectsDb.data;
  const customers = customersDb.data;
  const partners = partnersDb.data;
  const deals = dealsDb.data;
  const materials = materialsDb.data;
  const worklogs = worklogsDb.data;

  const activeProjects = useMemo(() => projects.filter((project) => project.status === 'active'), [projects]);
  const signedProjects = useMemo(() => projects.filter((project) => project.status === 'won'), [projects]);
  const watchingProjects = useMemo(() => projects.filter((project) => project.status === 'watching'), [projects]);
  const lostProjects = useMemo(() => projects.filter((project) => project.status === 'lost'), [projects]);

  const stats = useMemo(() => {
    const today = todayStr();
    const overdueFollow = activeProjects.filter((project) => project.nextFollowUp && daysUntil(project.nextFollowUp) < 0).length;
    const dueTodayFollow = activeProjects.filter((project) => project.nextFollowUp === today).length;
    const overdueContracts = signedProjects.filter((project) => daysUntil(project.expiryDate) < 0).length;
    const expiring = signedProjects.filter((project) => {
      const days = daysUntil(project.expiryDate);
      return days != null && days <= RENEW_WINDOW_DAYS;
    }).length;
    const exp30 = signedProjects.filter((project) => {
      const days = daysUntil(project.expiryDate);
      return days != null && days >= 0 && days <= 30;
    }).length;
    const newDeals = deals.filter((deal) => deal.type !== 'renewal');
    const monthKey = today.slice(0, 7);
    return {
      overdueFollow,
      dueTodayFollow,
      followDue: overdueFollow + dueTodayFollow,
      overdueContracts,
      expiring,
      exp30,
      todayWork: worklogs.filter((worklog) => worklog.date === today).length,
      newTotal: sumBy(newDeals, 'amount'),
      monthNew: sumBy(newDeals.filter((deal) => monthOf(deal.date) === monthKey), 'amount'),
      newCount: newDeals.length,
    };
  }, [activeProjects, signedProjects, deals, worklogs]);

  const navBadges = { projects: stats.followDue, signed: stats.expiring };

  const reloadCore = async () => {
    await Promise.all([projectsDb.reload(), customersDb.reload()]);
  };

  useEffect(() => {
    if (loading || dbError || syncRef.current) return;
    syncRef.current = true;
    api
      .syncRenewals()
      .then(async (result) => {
        if (result?.created) {
          await reloadCore();
          setActionNotice(`已自动创建 ${result.created} 个到期续约项目`);
        }
      })
      .catch((err) => setActionError(err.message));
  }, [loading, dbError]);

  const detailProject = useMemo(() => {
    if (!modal || modal.kind !== 'detailProject') return null;
    return projects.find((project) => project.id === modal.id) || modal.project;
  }, [modal, projects]);

  const detailCustomer = useMemo(() => {
    if (!modal || modal.kind !== 'detailCustomer') return null;
    return customers.find((customer) => customer.id === modal.id) || modal.customer;
  }, [modal, customers]);

  const detailPartner = useMemo(() => {
    if (!modal || modal.kind !== 'detailPartner') return null;
    return partners.find((partner) => partner.id === modal.id) || modal.partner;
  }, [modal, partners]);

  const openProject = (project) => setModal({ kind: 'detailProject', id: project.id, project });
  const openCustomer = (customerOrProject) => {
    const id = customerOrProject.customerId || customerOrProject.id;
    const customer = customers.find((item) => item.id === id);
    if (!customer) {
      setActionError('找不到对应客户，请刷新后重试');
      return;
    }
    setModal({ kind: 'detailCustomer', id, customer });
  };
  const openPartner = (partner) => setModal({ kind: 'detailPartner', id: partner.id, partner });

  const saveProject = async (data) => {
    if (data.id) await projectsDb.update(data);
    else await projectsDb.create({ ...data, id: uid() });
    await reloadCore();
    setModal(null);
  };

  const saveCustomer = async (data) => {
    if (data.id) await customersDb.update(data);
    else await customersDb.create({ ...data, id: uid() });
    await customersDb.reload();
    setModal(null);
  };

  const createCustomerFromProject = async (data) => {
    const saved = await customersDb.create({ ...data, id: uid() });
    await customersDb.reload();
    return saved;
  };

  const savePartner = async (data) => {
    if (data.id) await partnersDb.update(data);
    else await partnersDb.create({ ...data, id: uid() });
    await partnersDb.reload();
    setModal(null);
  };

  const winProject = async (project, data) => {
    await api.winProject(project.id, data);
    await Promise.all([reloadCore(), dealsDb.reload()]);
    setModal(null);
    setActionNotice(`项目「${project.name}」已赢单并进入已签项目`);
  };

  const createRenewal = async (source, data) => {
    await api.renewProject(source.id, data);
    await reloadCore();
    setModal(null);
    setActionNotice(`已从「${source.name}」创建独立续约项目，原已签项目保留`);
  };

  // 所有删除 / 状态变更都先弹应用内确认框，确认后才真正调用接口
  const changeStatus = (project, action, confirmText, notice) =>
    setConfirm({
      title: action === 'lost' ? '标记为 Lost' : action === 'watch' ? '转为长期观察' : '恢复为进行中',
      message: confirmText,
      confirmText: '确认',
      danger: action === 'lost',
      onConfirm: async () => {
        await api.markProject(project.id, action);
        await reloadCore();
        setModal(null);
        setConfirm(null);
        setActionNotice(notice);
      },
    });

  const deleteProject = (project) =>
    setConfirm({
      title: '删除项目',
      message: `确认删除项目「${project.name}」？删除后不可恢复，客户主档和其他项目不受影响。`,
      confirmText: '删除项目',
      onConfirm: async () => {
        await api.removeProject(project.id);
        await reloadCore();
        setModal(null);
        setConfirm(null);
        setActionNotice(`项目「${project.name}」已删除`);
      },
    });

  const deleteCustomer = (customer) =>
    setConfirm({
      title: '删除客户',
      message: `确认删除客户「${customer.name}」？该客户名下还有项目时系统会阻止删除。`,
      confirmText: '删除客户',
      onConfirm: async () => {
        await customersDb.remove(customer.id);
        setModal(null);
        setConfirm(null);
        setActionNotice(`客户「${customer.name}」已删除`);
      },
    });

  const deletePartner = (partner) =>
    setConfirm({
      title: '删除合作伙伴',
      message: `确认删除合作伙伴「${partner.name}」？关联项目会保留，但不再关联该合作伙伴。`,
      confirmText: '删除合作伙伴',
      onConfirm: async () => {
        await partnersDb.remove(partner.id);
        await projectsDb.reload();
        setModal(null);
        setConfirm(null);
        setActionNotice(`合作伙伴「${partner.name}」已删除`);
      },
    });

  const saveDeal = async (data) => {
    await dealsDb.create({ ...data, id: uid() });
    setModal(null);
    setActionNotice('成交记录已保存');
  };

  const uploadMaterials = async (files, note) => {
    for (const file of files) await api.uploadMaterial(file, note);
    await materialsDb.reload();
  };

  const addWorklog = async (content) => {
    await worklogsDb.create({ id: uid(), content, date: todayStr() });
  };
  const removeWorklog = async (id) => {
    if (!window.confirm('确认删除该条工作记录？')) return;
    await worklogsDb.remove(id);
  };
  const updateWorklog = async (id, content) => {
    await worklogsDb.update({ id, content });
  };

  const retry = () => {
    setActionError('');
    projectsDb.reload();
    customersDb.reload();
    partnersDb.reload();
    dealsDb.reload();
    materialsDb.reload();
    worklogsDb.reload();
  };

  const shell = (title, desc, content, badges = {}) => (
    <div className="app-shell">
      <Sidebar sections={SECTIONS} active={active.key} onSelect={selectNav} badges={badges} />
      <main className="app-main">
        <Header today={formatCnDate(todayStr())} title={title} desc={desc} />
        <div className="app-content">
          {actionError && (
            <div className="db-banner error">
              <span>{actionError}</span>
              <button type="button" className="icon-btn" onClick={() => setActionError('')} aria-label="关闭">
                <Icon name="close" />
              </button>
            </div>
          )}
          {actionNotice && (
            <div className="db-banner ok">
              <span>{actionNotice}</span>
              <button type="button" className="icon-btn" onClick={() => setActionNotice('')} aria-label="关闭">
                <Icon name="close" />
              </button>
            </div>
          )}
          {content}
        </div>
        <footer className="footer">SMB 销售工作台 · v2.0.0</footer>
      </main>
    </div>
  );

  if (loading) {
    return shell(
      'SMB 销售工作台',
      '正在连接数据服务',
      <div className="loading-state">
        <span className="loading-dots"><i /><i /><i /></span>
        正在加载项目与客户数据…
      </div>
    );
  }

  if (dbError) {
    return shell(
      'SMB 销售工作台',
      '数据服务未就绪',
      <div className="db-error">
        <h3><Icon name="alert" size={20} />无法连接数据服务</h3>
        <p>{dbError}</p>
        <button type="button" className="btn btn-primary" onClick={retry}>重试</button>
      </div>
    );
  }

  let content;
  switch (active.key) {
    case 'home':
      content = (
        <Home
          stats={stats}
          projects={signedProjects}
          today={todayStr()}
          onView={openProject}
          onRenew={(project) => setModal({ kind: 'renew', source: project })}
        />
      );
      break;
    case 'journal':
      content = <WorkJournal entries={worklogs} onAdd={addWorklog} onRemove={removeWorklog} onEdit={updateWorklog} />;
      break;
    case 'projects':
      content = (
        <section className="workspace">
          <div className="workspace-head">
            <div>
              <h2>项目跟进</h2>
              <p className="panel-desc">同一客户可以并行多个项目；赢单、Lost、长期观察都只改变当前项目</p>
            </div>
            <div className="workspace-tools">
              <span className="workspace-tools-hint">窗口 {viewport.width}×{viewport.height}</span>
              <span className="workspace-tools-label">板块尺寸</span>
              <div className="seg-toggle" role="group" aria-label="项目跟进板块尺寸">
                {FOLLOW_LAYOUTS.map((layout) => (
                  <button
                    key={layout.key}
                    type="button"
                    className={followLayout === layout.key ? 'active' : ''}
                    title={layout.title}
                    onClick={() => setFollowLayout(layout.key)}
                  >
                    {layout.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={`workspace-grid${layoutMode === 'wide' ? ' grid-wide' : ''}`}>
            <ProjectList
              projects={activeProjects}
              variant="new"
              wide={layoutMode === 'wide'}
              onAdd={() => setModal({ kind: 'project', initial: { category: 'new', status: 'active' }, defaultCategory: 'new' })}
              onView={openProject}
              onCustomer={openCustomer}
              onWatch={(project) =>
                changeStatus(
                  project,
                  'watch',
                  `确认把项目「${project.name}」转为长期观察？同客户其他项目不受影响。`,
                  `项目「${project.name}」已转入长期观察`
                )
              }
            />
            <ProjectList
              projects={activeProjects}
              variant="renew"
              wide={layoutMode === 'wide'}
              onAdd={() => setModal({ kind: 'project', initial: { category: 'renew', status: 'active' }, defaultCategory: 'renew' })}
              onView={openProject}
              onCustomer={openCustomer}
            />
          </div>
        </section>
      );
      break;
    case 'signed':
      content = (
        <SignedProjects
          projects={signedProjects}
          onView={openProject}
          onCustomer={openCustomer}
          onRenew={(project) => setModal({ kind: 'renew', source: project })}
        />
      );
      break;
    case 'customers':
      content = (
        <CustomerList
          customers={customers}
          onAdd={() => setModal({ kind: 'customer' })}
          onView={openCustomer}
        />
      );
      break;
    case 'watch':
      content = (
        <div className="workspace-grid grid-wide">
          <WatchList
            projects={watchingProjects}
            onView={openProject}
            onCustomer={openCustomer}
            onRestore={(project) =>
              changeStatus(
                project,
                'restore',
                `确认恢复项目「${project.name}」？只恢复这个项目，其他项目不变。`,
                `项目「${project.name}」已恢复跟进`
              )
            }
          />
        </div>
      );
      break;
    case 'lost':
      content = (
        <div className="workspace-grid grid-wide">
          <LostProjects
            projects={lostProjects}
            onView={openProject}
            onCustomer={openCustomer}
            onRestore={(project) =>
              changeStatus(
                project,
                'restore',
                `确认恢复项目「${project.name}」？客户与其他项目不受影响。`,
                `项目「${project.name}」已恢复为进行中`
              )
            }
          />
        </div>
      );
      break;
    case 'partners':
      content = (
        <PartnerList
          partners={partners}
          projects={projects}
          onAdd={() => setModal({ kind: 'partner' })}
          onView={openPartner}
        />
      );
      break;
    case 'revenue':
      content = <RevenuePanel deals={deals} onAdd={() => setModal({ kind: 'deal' })} />;
      break;
    case 'materials':
      content = (
        <MaterialLibrary
          materials={materials}
          onUpload={uploadMaterials}
          onDelete={async (id) => {
            if (!window.confirm('确认删除该材料？删除后不可恢复。')) return;
            await materialsDb.remove(id);
          }}
        />
      );
      break;
    default:
      content = null;
  }

  return (
    <>
      {shell(active.label, active.desc, content, navBadges)}

      {modal && (
        <Modal
          title={modalTitle(modal)}
          onClose={() => setModal(null)}
          error={actionError}
          wide={!['detailProject', 'detailCustomer', 'detailPartner'].includes(modal.kind)}
          detail={['detailProject', 'detailCustomer', 'detailPartner'].includes(modal.kind)}
        >
          {modal.kind === 'project' && (
            <ProjectForm
              key={modal.data?.id || modal.initial?.customerId || 'new-project'}
              initial={modal.data || modal.initial || null}
              customers={customers}
              partners={partners}
              onCreateCustomer={createCustomerFromProject}
              onSave={saveProject}
              onCancel={() => setModal(null)}
              defaultCategory={modal.defaultCategory || 'new'}
            />
          )}
          {modal.kind === 'renew' && (
            <ProjectForm
              key={`renew-${modal.source.id}`}
              initial={{
                ...modal.source,
                id: null,
                name: `${modal.source.name} · 续约`,
                status: 'active',
                category: 'renew',
                contractAmount: null,
                startDate: null,
              }}
              customers={customers}
              partners={partners}
              onCreateCustomer={createCustomerFromProject}
              onSave={(data) => createRenewal(modal.source, data)}
              onCancel={() => setModal(null)}
              defaultCategory="renew"
              renewMode
              lockCustomer
            />
          )}
          {modal.kind === 'win' && (
            <WinProjectForm
              project={modal.project}
              onSave={(data) => winProject(modal.project, data)}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'customer' && (
            <CustomerForm
              key={modal.data?.id || 'new-customer'}
              initial={modal.data}
              onSave={saveCustomer}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'partner' && (
            <PartnerForm
              key={modal.data?.id || 'new-partner'}
              initial={modal.data}
              onSave={savePartner}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'deal' && (
            <DealForm projects={projects} onSave={saveDeal} onCancel={() => setModal(null)} />
          )}

          {modal.kind === 'detailProject' && detailProject && (
            <ProjectDetail
              project={detailProject}
              onEdit={() => setModal({ kind: 'project', data: detailProject })}
              onWin={() => setModal({ kind: 'win', project: detailProject })}
              onRenew={() => setModal({ kind: 'renew', source: detailProject })}
              onWatch={() =>
                changeStatus(
                  detailProject,
                  'watch',
                  `确认把项目「${detailProject.name}」转为长期观察？`,
                  `项目「${detailProject.name}」已转入长期观察`
                )
              }
              onLost={() =>
                changeStatus(
                  detailProject,
                  'lost',
                  `确认把项目「${detailProject.name}」标记为 Lost？客户与其他项目不受影响。`,
                  `项目「${detailProject.name}」已标记 Lost`
                )
              }
              onRestore={() =>
                changeStatus(
                  detailProject,
                  'restore',
                  `确认恢复项目「${detailProject.name}」？`,
                  `项目「${detailProject.name}」已恢复为进行中`
                )
              }
              onDelete={() => deleteProject(detailProject)}
              onCustomer={() => openCustomer(detailProject)}
              onNotesChanged={async () => {
                await reloadCore();
              }}
            />
          )}

          {modal.kind === 'detailCustomer' && detailCustomer && (
            <CustomerDetail
              customer={detailCustomer}
              projects={projects.filter((project) => project.customerId === detailCustomer.id)}
              onEdit={() => setModal({ kind: 'customer', data: detailCustomer })}
              onDelete={() => deleteCustomer(detailCustomer)}
              onNewProject={() =>
                setModal({
                  kind: 'project',
                  initial: {
                    customerId: detailCustomer.id,
                    customerName: detailCustomer.name,
                    category: 'new',
                    status: 'active',
                  },
                  defaultCategory: 'new',
                })
              }
              onViewProject={openProject}
              onNotesChanged={reloadCore}
            />
          )}

          {modal.kind === 'detailPartner' && detailPartner && (
            <PartnerDetail
              partner={detailPartner}
              projects={projects.filter((project) => project.partnerId === detailPartner.id)}
              onEdit={() => setModal({ kind: 'partner', data: detailPartner })}
              onDelete={() => deletePartner(detailPartner)}
              onViewProject={openProject}
              onNotesChanged={reloadCore}
            />
          )}
        </Modal>
      )}

      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </>
  );
}
