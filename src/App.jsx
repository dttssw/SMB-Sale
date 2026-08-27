import { useEffect, useMemo, useRef, useState } from 'react';
import { useDbData } from './hooks/useDbData.js';
import { api } from './api.js';
import { daysUntil, formatCnDate, formatDate, formatNoteTime, monthOf, oneYearFrom, renewFrom, todayStr } from './utils/date.js';
import { formatMoney, sumBy } from './utils/format.js';
import { PRODUCTS } from './data/constants.js';
import Header from './components/Header.jsx';
import KpiCard from './components/KpiCard.jsx';
import ExpiringContracts from './components/ExpiringContracts.jsx';
import ProspectList from './components/ProspectList.jsx';
import PartnerList from './components/PartnerList.jsx';
import RevenuePanel from './components/RevenuePanel.jsx';
import WorkJournal from './components/WorkJournal.jsx';
import ExpiryAlert from './components/ExpiryAlert.jsx';
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

export default function App() {
  const contractsDb = useDbData('contracts');
  const prospectsDb = useDbData('prospects');
  const dealsDb = useDbData('deals');
  const partnersDb = useDbData('partners');
  const materialsDb = useDbData('materials');
  const worklogsDb = useDbData('worklogs');
  const [modal, setModal] = useState(null);
  const [actionError, setActionError] = useState('');

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
      const { note, ...record } = data;
      let savedId = data.id;
      if (data.id) await contractsDb.update(record);
      else {
        const saved = await contractsDb.create({ ...record, id: uid() });
        savedId = saved.id;
      }
      // 表单里填写的备注 → 追加到客户备注时间线（不写入客户表）；仅在备注相对打开时有改动时才追加，避免重复
      if (note && note !== (modal?.initialNote || ''))
        await api.createNote({ id: uid(), customerType: 'contract', customerId: savedId, content: note });
      await runSync();
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const saveProspect = async (data) => {
    try {
      const { note, ...record } = data;
      let savedId = data.id;
      if (data.id) await prospectsDb.update(record);
      else {
        // 新跟进客户默认归入 New（Renew 由到期<45天的在约客户自动生成）
        const saved = await prospectsDb.create({ ...record, category: 'new', id: uid() });
        savedId = saved.id;
      }
      // 表单里填写的备注 → 追加到客户备注时间线（不写入客户表）；仅在备注相对打开时有改动时才追加，避免重复
      if (note && note !== (modal?.initialNote || ''))
        await api.createNote({ id: uid(), customerType: 'prospect', customerId: savedId, content: note });
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  // 新建 / 编辑 Renew 续约跟进客户（手动创建，不关联在约客户）
  const saveRenew = async (data) => {
    try {
      const { note, ...record } = data;
      let savedId = data.id;
      if (data.id) await prospectsDb.update(record);
      else {
        const saved = await prospectsDb.create({
          ...record,
          stage: 'negotiation',
          category: 'renew',
          contractId: '',
          id: uid(),
        });
        savedId = saved.id;
      }
      // 表单里填写的备注 → 追加到客户备注时间线（不写入客户表）；仅在备注相对打开时有改动时才追加，避免重复
      if (note && note !== (modal?.initialNote || ''))
        await api.createNote({ id: uid(), customerType: 'prospect', customerId: savedId, content: note });
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
      const { note, ...record } = data;
      let savedId = data.id;
      if (data.id) await partnersDb.update(record);
      else {
        const saved = await partnersDb.create({ ...record, id: uid() });
        savedId = saved.id;
      }
      // 表单里填写的备注 → 追加到合作伙伴的备注时间线（不写入表）；仅在备注相对打开时有改动时才追加，避免重复
      if (note && note !== (modal?.initialNote || ''))
        await api.createNote({ id: uid(), customerType: 'partner', customerId: savedId, content: note });
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  // 跟进中的客户 → 转为在约客户：先创建在约客户，成功后从跟进列表中移除
  const convertToContract = async (prospect, data) => {
    try {
      const { note, ...record } = data;
      const saved = await contractsDb.create({ ...record, id: uid() });
      // 新客户（New）转为在约时，自动在金额看板记录一笔新签成交；续约（Renew）不记录金额
      if (prospect.category !== 'renew') {
        await dealsDb.create({ id: uid(), customer: saved.name, type: 'new', amount: saved.contractAmount, date: todayStr() });
      }
      // 把跟进客户的备注时间线迁移到新在约客户（raw=true 原样迁移，避免叠加时间标记或触发当日合并）
      const prospNotes = await api.listNotes('prospect', prospect.id);
      for (const n of prospNotes) {
        await api.createNote({ id: uid(), customerType: 'contract', customerId: saved.id, content: n.content, raw: true });
      }
      // 转在约表单里填写的备注（相对跟进客户时间线有改动时才追加，避免重复迁移后的内容）
      if (note && note !== (modal?.initialNote || ''))
        await api.createNote({ id: uid(), customerType: 'contract', customerId: saved.id, content: note });
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

  // 打开「转为在约客户」弹窗：预填跟进客户信息（金额、联系人；订阅默认一年），并加载其备注时间线
  const convertProspect = async (p) => {
    let initialNote = '';
    try {
      initialNote = notesToText(await api.listNotes('prospect', p.id));
    } catch {
      /* 忽略加载失败，备注框回退为空 */
    }
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
      initialNote,
    });
  };

  // 打开客户详情弹窗（点击客户名 / 详情按钮）
  const openDetail = (customerType) => (customer) =>
    setModal({ kind: 'detail', customerType, customer });

  // 把某客户备注时间线拼成带时间的文本，供编辑表单的备注框显示（与详情弹窗里看到的备注一致）
  const notesToText = (rows) => rows.map((n) => `${formatNoteTime(n.createdAt)} ${n.content}`).join('\n');

  // 打开编辑弹窗：先加载该客户的备注时间线作为备注框初始内容，避免“编辑界面备注”与“详情添加的备注”不一致
  const openEditModal = async (customerType, customer) => {
    let initialNote = '';
    try {
      initialNote = notesToText(await api.listNotes(customerType, customer.id));
    } catch {
      /* 忽略加载失败，备注框回退为空 */
    }
    const kind = customerType === 'prospect' && customer.category === 'renew' ? 'renew' : customerType;
    setModal({ kind, data: customer, initialNote });
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

  const retry = () => {
    setActionError('');
    contractsDb.reload();
    prospectsDb.reload();
    dealsDb.reload();
    partnersDb.reload();
    materialsDb.reload();
    worklogsDb.reload();
  };

  if (loading) {
    return (
      <div className="container">
        <Header today={formatCnDate(todayStr())} />
        <div className="db-banner">🔄 正在连接数据库，加载数据…</div>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="container">
        <Header today={formatCnDate(todayStr())} />
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
      </div>
    );
  }

  return (
    <div className="container">
      <Header today={formatCnDate(todayStr())} />

      {actionError && (
        <div className="db-banner error">
          <span>⚠️ {actionError}</span>
          <button className="icon-btn" onClick={() => setActionError('')} aria-label="关闭">
            ✕
          </button>
        </div>
      )}

      <div className="kpi-grid">
        <KpiCard
          label="今日需跟进"
          value={stats.followDue}
          unit="家"
          icon="🎯"
          tone={stats.followDue > 0 ? 'danger' : 'ok'}
          sub={`逾期 ${stats.overdueFollow} · 今日 ${stats.dueTodayFollow}`}
        />
        <KpiCard
          label="临期在约"
          value={stats.expiring}
          unit="家"
          icon="🔔"
          tone={stats.expiring > 0 ? 'warn' : 'ok'}
          sub={`已到期 ${stats.overdueContracts} · 30天内 ${stats.exp30}`}
        />
        <KpiCard
          label="今日记录"
          value={stats.todayWork}
          unit="条"
          icon="📝"
          tone="violet"
          sub="今天做了什么"
        />
        <KpiCard
          label="本月成交"
          value={formatMoney(stats.monthNew)}
          icon="💰"
          valueClass="money"
          sub={`累计 ${formatMoney(stats.newTotal)}`}
        />
      </div>

      <ExpiryAlert contracts={contracts} onView={openDetail('contract')} onRenew={renewContract} />

      <div className="dash-layout">
        <div className="dash-col">
          <WorkJournal entries={worklogs} onAdd={addWorklog} onRemove={removeWorklog} />

          <ProspectList
            prospects={prospects}
            onAdd={() => setModal({ kind: 'prospect' })}
            onAddRenew={() => setModal({ kind: 'renew' })}
            onView={openDetail('prospect')}
          />
        </div>

        <div className="dash-col">
          <RevenuePanel deals={deals} onAdd={() => setModal({ kind: 'deal' })} />

          <PartnerList
            partners={partners}
            onAdd={() => setModal({ kind: 'partner' })}
            onView={openDetail('partner')}
          />

          <ExpiringContracts contracts={contracts} onView={openDetail('contract')} />
        </div>
      </div>

      <MaterialLibrary materials={materials} onUpload={uploadMaterials} onDelete={removeMaterial} />

      {modal && (
        <Modal title={modalTitle(modal)} onClose={() => setModal(null)}>
          {modal.kind === 'contract' && (
            <ContractForm
              key={modal.data?.id || 'new'}
              initial={modal.data}
              notesText={modal.initialNote}
              onSave={saveContract}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'convert' && (
            <ContractForm
              key={`convert-${modal.data.id}`}
              initial={modal.initial}
              notesText={modal.initialNote}
              onSave={(data) => convertToContract(modal.data, data)}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'prospect' && (
            <ProspectForm
              key={modal.data?.id || 'new'}
              initial={modal.data}
              notesText={modal.initialNote}
              onSave={saveProspect}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'renew' && (
            <RenewForm
              key={modal.data?.id || 'new'}
              initial={modal.data}
              notesText={modal.initialNote}
              onSave={saveRenew}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'partner' && (
            <PartnerForm
              key={modal.data?.id || 'new'}
              initial={modal.data}
              notesText={modal.initialNote}
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

      <footer className="footer">
        SMB 销售工作台 · 数据保存在本地 SQLite 数据库（server/data/smb.db），上传材料保存在 server/uploads，由 Node API 读写，增删改实时生效
      </footer>
    </div>
  );
}
