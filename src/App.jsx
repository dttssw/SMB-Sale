import { useEffect, useMemo, useRef, useState } from 'react';
import { useDbData } from './hooks/useDbData.js';
import { api } from './api.js';
import { daysUntil, formatCnDate, formatDate, monthOf, oneYearFrom, renewFrom, todayStr } from './utils/date.js';
import { sumBy } from './utils/format.js';
import { PRODUCTS } from './data/constants.js';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Home from './components/Home.jsx';
import ExpiringContracts from './components/ExpiringContracts.jsx';
import ProspectList from './components/ProspectList.jsx';
import PartnerList from './components/PartnerList.jsx';
import RevenuePanel from './components/RevenuePanel.jsx';
import WorkJournal from './components/WorkJournal.jsx';
import MaterialLibrary from './components/MaterialLibrary.jsx';
import Modal from './components/Modal.jsx';
import { ContractForm, ProspectForm, RenewForm, PartnerForm, DealForm } from './components/forms.jsx';
import CustomerDetail from './components/CustomerDetail.jsx';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const modalTitle = (m) => {
  if (m.kind === 'contract') return m.data ? '编辑在约客户' : '新增在约客户';
  if (m.kind === 'convert') return '跟进客户转为在约客户';
  if (m.kind === 'prospect') return m.data ? '编辑跟进客户' : '新增跟进客户';
  if (m.kind === 'renew') return m.data ? '编辑续约跟进' : '新建 Renew 客户';
  if (m.kind === 'partner') return m.data ? '编辑合作伙伴' : '新建合作伙伴';
  return '记录成交金额';
};

// 客户跟进板块的展示尺寸：双栏并排 / 单栏全宽（把跟进板块拉大，一屏看到更多客户）
const FOLLOW_LAYOUTS = [
  { key: 'split', label: '双栏', title: 'New / Renew 并排显示' },
  { key: 'wide', label: '单栏全宽', title: '每个跟进板块占满整宽，客户看得更多' },
];

// 左侧导航板块
const SECTIONS = [
  { key: 'home', label: '总览', icon: '🏠', desc: '欢迎语与今日全局聚焦，一眼看清今天什么最要紧' },
  { key: 'journal', label: '今日工作', icon: '📝', desc: '记下每天做了什么，按天归档、方便复盘' },
  { key: 'follow', label: '客户跟进', icon: '🎯', desc: 'New / Renew 分流跟进，构成你的主体工作区' },
  { key: 'contracts', label: '在约客户', icon: '📋', desc: '在约订阅参考清单，临期客户优先处理' },
  { key: 'revenue', label: '成交金额', icon: '💰', desc: '本月 / 累计成交回顾，心里有底' },
  { key: 'partners', label: '合作伙伴', icon: '🤝', desc: '渠道商 / 代理商登记，可随时补备注' },
  { key: 'materials', label: '材料库', icon: '📁', desc: '方案 / 报价 / 合同模板等资料集中管理' },
];

export default function App() {
  const contractsDb = useDbData('contracts');
  const prospectsDb = useDbData('prospects');
  const dealsDb = useDbData('deals');
  const partnersDb = useDbData('partners');
  const materialsDb = useDbData('materials');
  const worklogsDb = useDbData('worklogs');
  const [modal, setModal] = useState(null);
  const [actionError, setActionError] = useState('');
  const [nav, setNav] = useState('home');
  const [followLayout, setFollowLayout] = useState('split');

  const active = SECTIONS.find((s) => s.key === nav) || SECTIONS[0];

  const loading =
    contractsDb.loading ||
    prospectsDb.loading ||
    dealsDb.loading ||
    partnersDb.loading ||
    materialsDb.loading ||
    worklogsDb.loading;
  const dbError =
    contractsDb.error ||
    prospectsDb.error ||
    dealsDb.error ||
    partnersDb.error ||
    materialsDb.error ||
    worklogsDb.error;

  const contracts = contractsDb.data;
  const prospects = prospectsDb.data;
  const deals = dealsDb.data;
  const partners = partnersDb.data;
  const materials = materialsDb.data;
  const worklogs = worklogsDb.data;

  const stats = useMemo(() => {
    const today = todayStr();
    const overdueFollow = prospects.filter((p) => p.nextFollowUp && daysUntil(p.nextFollowUp) < 0).length;
    const dueTodayFollow = prospects.filter((p) => p.nextFollowUp === today).length;
    const followDue = overdueFollow + dueTodayFollow;

    const overdueContracts = contracts.filter((c) => daysUntil(c.expiryDate) < 0).length;
    const expiring = contracts.filter((c) => {
      const d = daysUntil(c.expiryDate);
      return d != null && d <= 45;
    }).length;
    const exp30 = contracts.filter((c) => {
      const d = daysUntil(c.expiryDate);
      return d != null && d >= 0 && d <= 30;
    }).length;

    const todayWork = worklogs.filter((w) => w.date === today).length;

    const newDeals = deals.filter((d) => d.type !== 'renewal');
    const newTotal = sumBy(newDeals, 'amount');
    const monthKey = today.slice(0, 7);
    const monthNew = sumBy(newDeals.filter((d) => monthOf(d.date) === monthKey), 'amount');
    const newCount = newDeals.length;
    return { overdueFollow, dueTodayFollow, followDue, overdueContracts, expiring, exp30, todayWork, newTotal, monthNew, newCount };
  }, [contracts, deals, prospects, worklogs]);

  // 侧边导航角标（仅在有数量时显示）
  const navBadges = { follow: stats.followDue, contracts: stats.expiring, journal: stats.todayWork };

  // ---- 续约跟进同步：到期<45天的在约客户自动生成/更新 Renew 跟进；不再接近到期自动退出 ----
  const syncRef = useRef(false);
  const runSync = async () => {
    try {
      await api.syncRenewals();
      await prospectsDb.reload();
    } catch (err) {
      setActionError(err.message);
    }
  };
  useEffect(() => {
    if (loading || dbError || syncRef.current) return;
    syncRef.current = true;
    runSync();
  }, [loading, dbError]);

  const saveContract = async (data) => {
    try {
      let savedId = data.id;
      if (data.id) await contractsDb.update(data);
      else {
        const saved = await contractsDb.create({ ...data, id: uid() });
        savedId = saved.id;
      }
      await runSync();
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const saveProspect = async (data) => {
    try {
      let savedId = data.id;
      if (data.id) await prospectsDb.update(data);
      else {
        // 新跟进客户默认归入 New（Renew 由到期<45天的在约客户自动生成）
        const saved = await prospectsDb.create({ ...data, category: 'new', id: uid() });
        savedId = saved.id;
      }
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  // 新建 / 编辑 Renew 续约跟进客户（手动创建，不关联在约客户）
  const saveRenew = async (data) => {
    try {
      let savedId = data.id;
      if (data.id) await prospectsDb.update(data);
      else {
        const saved = await prospectsDb.create({
          ...data,
          stage: 'negotiation',
          category: 'renew',
          contractId: '',
          id: uid(),
        });
        savedId = saved.id;
      }
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const saveDeal = async (data) => {
    try {
      await dealsDb.create({ ...data, type: 'new', id: uid() });
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  // 新建 / 编辑合作伙伴（不含金额、跟进时间、订阅签约字段）
  const savePartner = async (data) => {
    try {
      let savedId = data.id;
      if (data.id) await partnersDb.update(data);
      else {
        const saved = await partnersDb.create({ ...data, id: uid() });
        savedId = saved.id;
      }
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  // 跟进中的客户 → 转为在约客户：复用跟进入的客户主档（customerId），使其与在约客户共享同一份名称/联系人/备注时间线
  const convertToContract = async (prospect, data) => {
    try {
      const saved = await contractsDb.create({ ...data, id: uid(), customerId: prospect.customerId });
      // 新客户（New）转为在约时，自动在金额看板记录一笔新签成交；续约（Renew）不记录金额
      if (prospect.category !== 'renew') {
        await dealsDb.create({ id: uid(), customer: saved.name, type: 'new', amount: saved.contractAmount, date: todayStr() });
      }
      // 备注时间线已在客户主档上共享（不再复制粘贴），直接移除跟进角色即可（主档与备注保留）
      await prospectsDb.remove(prospect.id);
      await runSync();
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const removeContract = async (id) => {
    if (!window.confirm('确认删除该在约客户？')) return;
    try {
      await contractsDb.remove(id);
      await runSync();
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  // 续约：订阅开始时间顺延为到期日次日，订阅到期时间自动往后延长一年
  const renewContract = async (c) => {
    const { startDate, expiryDate } = renewFrom(c.expiryDate);
    if (
      !window.confirm(
        `确认续约「${c.name}」？\n订阅开始时间：${formatDate(c.startDate)} → ${formatDate(startDate)}\n订阅到期时间：${formatDate(c.expiryDate)} → ${formatDate(expiryDate)}`
      )
    ) {
      return;
    }
    try {
      await contractsDb.update({ ...c, startDate, expiryDate });
      await runSync();
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const removeProspect = async (id) => {
    if (!window.confirm('确认删除该跟进客户？')) return;
    try {
      await prospectsDb.remove(id);
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const removePartner = async (id) => {
    if (!window.confirm('确认删除该合作伙伴？')) return;
    try {
      await partnersDb.remove(id);
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  // 打开「转为在约客户」弹窗：预填跟进客户信息（金额、联系人；订阅默认一年）
  const convertProspect = (p) => {
    setModal({
      kind: 'convert',
      data: p,
      initial: {
        name: p.name,
        contact: p.contact || '',
        plan: PRODUCTS[0],
        contractAmount: p.expectedAmount || '',
        startDate: todayStr(),
        expiryDate: oneYearFrom(todayStr()),
      },
    });
  };

  // 打开客户详情弹窗（点击客户名 / 详情按钮）
  const openDetail = (customerType) => (customer) =>
    setModal({ kind: 'detail', customerType, customer });

  // 打开编辑弹窗：备注已改为每条独立成行、在详情中逐条管理，这里直接打开编辑表单即可
  const openEditModal = (customerType, customer) => {
    const kind = customerType === 'prospect' && customer.category === 'renew' ? 'renew' : customerType;
    setModal({ kind, data: customer });
  };

  const uploadMaterials = async (files, note) => {
    for (const file of files) {
      await api.uploadMaterial(file, note);
    }
    await materialsDb.reload();
    setActionError('');
  };

  const removeMaterial = async (id) => {
    if (!window.confirm('确认删除该材料？删除后不可恢复。')) return;
    try {
      await materialsDb.remove(id);
      setActionError('');
    } catch (err) {
      setActionError(err.message);
    }
  };

  const addWorklog = async (content) => {
    try {
      await worklogsDb.create({ id: uid(), content, date: todayStr() });
      setActionError('');
    } catch (err) {
      setActionError(err.message);
    }
  };

  const removeWorklog = async (id) => {
    if (!window.confirm('确认删除该条工作记录？')) return;
    try {
      await worklogsDb.remove(id);
      setActionError('');
    } catch (err) {
      setActionError(err.message);
    }
  };

  const updateWorklog = async (id, content) => {
    try {
      await worklogsDb.update({ id, content });
      setActionError('');
    } catch (err) {
      setActionError(err.message);
    }
  };

  const retry = () => {
    setActionError('');
    contractsDb.reload();
    prospectsDb.reload();
    dealsDb.reload();
    partnersDb.reload();
    materialsDb.reload();
    worklogsDb.reload();
  };

  const today = formatCnDate(todayStr());
  const shell = (title, icon, desc, content, badges = {}) => (
    <div className="app-shell">
      <Sidebar sections={SECTIONS} active={active.key} onSelect={setNav} today={today} badges={badges} />
      <main className="app-main">
        <Header today={today} title={title} icon={icon} desc={desc} />
        <div className="app-content">
          {actionError && (
            <div className="db-banner error">
              <span>⚠️ {actionError}</span>
              <button className="icon-btn" onClick={() => setActionError('')} aria-label="关闭">
                ✕
              </button>
            </div>
          )}
          {content}
        </div>
        <footer className="footer">
          SMB 销售工作台 · 数据保存在本地 SQLite 数据库（server/data/smb.db），上传材料保存在 server/uploads，由 Node API 读写，增删改实时生效
        </footer>
      </main>
    </div>
  );

  if (loading) {
    return shell(
      'SMB 销售工作台',
      '💼',
      '正在连接数据服务',
      <div className="db-banner">🔄 正在连接数据库，加载数据…</div>
    );
  }

  if (dbError) {
    return shell(
      'SMB 销售工作台',
      '💼',
      '数据服务未就绪',
      <div className="db-error">
        <h3>⚠️ 无法连接数据服务</h3>
        <p>{dbError}</p>
        <p className="db-error-hint">
          请先在终端运行 <code>npm run server</code> 启动后端（默认端口 3001），然后点击重试。
        </p>
        <button className="btn btn-primary" onClick={retry}>
          重试
        </button>
      </div>
    );
  }

  let content;
  switch (active.key) {
    case 'home':
      content = (
        <Home
          stats={stats}
          contracts={contracts}
          today={todayStr()}
          onView={openDetail('contract')}
          onRenew={renewContract}
        />
      );
      break;
    case 'journal':
      content = <WorkJournal entries={worklogs} onAdd={addWorklog} onRemove={removeWorklog} onEdit={updateWorklog} />;
      break;
    case 'follow':
      content = (
        <section className="workspace">
          <div className="workspace-head">
            <div>
              <h2>🎯 客户跟进</h2>
              <p className="panel-desc">
                New / Renew 分流跟进，构成你的主体工作区；每条客户的工作记录写在「详情 → 备注」里
              </p>
            </div>
            <div className="workspace-tools">
              <span className="workspace-tools-label">板块尺寸</span>
              <div className="seg-toggle" role="group" aria-label="客户跟进板块尺寸">
                {FOLLOW_LAYOUTS.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    className={followLayout === l.key ? 'active' : ''}
                    title={l.title}
                    onClick={() => setFollowLayout(l.key)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={`workspace-grid${followLayout === 'wide' ? ' grid-wide' : ''}`}>
            <ProspectList
              prospects={prospects}
              variant="new"
              wide={followLayout === 'wide'}
              onAdd={() => setModal({ kind: 'prospect' })}
              onView={openDetail('prospect')}
            />
            <ProspectList
              prospects={prospects}
              variant="renew"
              wide={followLayout === 'wide'}
              onAdd={() => setModal({ kind: 'renew' })}
              onView={openDetail('prospect')}
            />
          </div>
        </section>
      );
      break;
    case 'contracts':
      content = <ExpiringContracts contracts={contracts} onView={openDetail('contract')} />;
      break;
    case 'revenue':
      content = <RevenuePanel deals={deals} onAdd={() => setModal({ kind: 'deal' })} />;
      break;
    case 'partners':
      content = (
        <PartnerList
          partners={partners}
          onAdd={() => setModal({ kind: 'partner' })}
          onView={openDetail('partner')}
        />
      );
      break;
    case 'materials':
      content = <MaterialLibrary materials={materials} onUpload={uploadMaterials} onDelete={removeMaterial} />;
      break;
    default:
      content = null;
  }

  return (
    <>
      {shell(active.label, active.icon, active.desc, content, navBadges)}

      {modal && (
        <Modal title={modalTitle(modal)} onClose={() => setModal(null)}>
          {modal.kind === 'contract' && (
            <ContractForm
              key={modal.data?.id || 'new'}
              initial={modal.data}
              onSave={saveContract}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'convert' && (
            <ContractForm
              key={`convert-${modal.data.id}`}
              initial={modal.initial}
              onSave={(data) => convertToContract(modal.data, data)}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'prospect' && (
            <ProspectForm
              key={modal.data?.id || 'new'}
              initial={modal.data}
              onSave={saveProspect}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'renew' && (
            <RenewForm
              key={modal.data?.id || 'new'}
              initial={modal.data}
              onSave={saveRenew}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'partner' && (
            <PartnerForm
              key={modal.data?.id || 'new'}
              initial={modal.data}
              onSave={savePartner}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'detail' && (
            <CustomerDetail
              customerType={modal.customerType}
              customer={modal.customer}
              onEdit={() => openEditModal(modal.customerType, modal.customer)}
              onRenew={modal.customerType === 'contract' ? () => renewContract(modal.customer) : undefined}
              onConvert={modal.customerType === 'prospect' ? () => convertProspect(modal.customer) : undefined}
              onDelete={() => {
                if (modal.customerType === 'contract') removeContract(modal.customer.id);
                else if (modal.customerType === 'prospect') removeProspect(modal.customer.id);
                else removePartner(modal.customer.id);
              }}
            />
          )}
          {modal.kind === 'deal' && (
            <DealForm onSave={saveDeal} onCancel={() => setModal(null)} />
          )}
        </Modal>
      )}
    </>
  );
}
