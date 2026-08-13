import { useMemo, useState } from 'react';
import { useDbData } from './hooks/useDbData.js';
import { api } from './api.js';
import { daysUntil, formatCnDate, monthOf, todayStr } from './utils/date.js';
import { formatMoney, sumBy } from './utils/format.js';
import Header from './components/Header.jsx';
import KpiCard from './components/KpiCard.jsx';
import ExpiringContracts from './components/ExpiringContracts.jsx';
import ProspectList from './components/ProspectList.jsx';
import RevenuePanel from './components/RevenuePanel.jsx';
import Modal from './components/Modal.jsx';
import { ContractForm, ProspectForm, DealForm } from './components/forms.jsx';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const modalTitle = (m) => {
  if (m.kind === 'contract') return m.data ? '编辑在约客户' : '新增在约客户';
  if (m.kind === 'prospect') return m.data ? '编辑跟进客户' : '新增跟进客户';
  return '记录成交金额';
};

export default function App() {
  const contractsDb = useDbData('contracts');
  const prospectsDb = useDbData('prospects');
  const dealsDb = useDbData('deals');
  const [modal, setModal] = useState(null);
  const [actionError, setActionError] = useState('');

  const loading = contractsDb.loading || prospectsDb.loading || dealsDb.loading;
  const dbError = contractsDb.error || prospectsDb.error || dealsDb.error;

  const contracts = contractsDb.data;
  const prospects = prospectsDb.data;
  const deals = dealsDb.data;

  const stats = useMemo(() => {
    const overdue = contracts.filter((c) => daysUntil(c.expiryDate) < 0).length;
    const exp30 = contracts.filter((c) => {
      const d = daysUntil(c.expiryDate);
      return d >= 0 && d <= 30;
    }).length;
    const renewalTotal = sumBy(deals.filter((d) => d.type === 'renewal'), 'amount');
    const newTotal = sumBy(deals.filter((d) => d.type === 'new'), 'amount');
    const monthKey = todayStr().slice(0, 7);
    const monthRenewal = sumBy(
      deals.filter((d) => d.type === 'renewal' && monthOf(d.date) === monthKey),
      'amount'
    );
    const monthNew = sumBy(
      deals.filter((d) => d.type === 'new' && monthOf(d.date) === monthKey),
      'amount'
    );
    const renewalPct = renewalTotal + newTotal > 0 ? Math.round((renewalTotal / (renewalTotal + newTotal)) * 100) : 0;
    return { overdue, exp30, renewalTotal, newTotal, monthRenewal, monthNew, renewalPct };
  }, [contracts, deals]);

  const saveContract = async (data) => {
    try {
      if (data.id) await contractsDb.update(data);
      else await contractsDb.create({ ...data, id: uid() });
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const saveProspect = async (data) => {
    try {
      if (data.id) await prospectsDb.update(data);
      else await prospectsDb.create({ ...data, id: uid() });
      setActionError('');
      setModal(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const saveDeal = async (data) => {
    try {
      await dealsDb.create({ ...data, id: uid() });
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
      setActionError('');
    } catch (err) {
      setActionError(err.message);
    }
  };

  const removeProspect = async (id) => {
    if (!window.confirm('确认删除该跟进客户？')) return;
    try {
      await prospectsDb.remove(id);
      setActionError('');
    } catch (err) {
      setActionError(err.message);
    }
  };

  const clearAll = async () => {
    if (!window.confirm('将清空数据库中全部数据（在约客户、跟进客户、成交记录），确定吗？此操作不可恢复。')) return;
    try {
      setActionError('');
      await api.clearAll();
      await Promise.all([contractsDb.reload(), prospectsDb.reload(), dealsDb.reload()]);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const retry = () => {
    setActionError('');
    contractsDb.reload();
    prospectsDb.reload();
    dealsDb.reload();
  };

  const waitingContractCount = prospects.filter((p) => p.stage === 'contract').length;

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
      <Header today={formatCnDate(todayStr())} onClear={clearAll} />

      {actionError && (
        <div className="db-banner error">
          <span>⚠️ {actionError}</span>
          <button className="icon-btn" onClick={() => setActionError('')} aria-label="关闭">
            ✕
          </button>
        </div>
      )}

      <div className="kpi-grid">
        <KpiCard label="在约客户" value={contracts.length} unit="家" icon="📇" sub={`已到期 ${stats.overdue} 家`} />
        <KpiCard
          label="30天内到期"
          value={stats.exp30}
          unit="家"
          icon="⏰"
          tone="warn"
          sub="建议尽快安排续约触达"
        />
        <KpiCard
          label="跟进中的新客户"
          value={prospects.length}
          unit="家"
          icon="🚀"
          tone="violet"
          sub={`待签约 ${waitingContractCount} 家`}
        />
        <KpiCard
          label="本月续约金额"
          value={formatMoney(stats.monthRenewal)}
          icon="🔁"
          tone="ok"
          valueClass="money"
          sub={`累计 ${formatMoney(stats.renewalTotal)}`}
        />
        <KpiCard
          label="本月新签金额"
          value={formatMoney(stats.monthNew)}
          icon="🆕"
          valueClass="money"
          sub={`累计 ${formatMoney(stats.newTotal)}`}
        />
        <KpiCard label="续约率" value={stats.renewalPct} unit="%" icon="📊" sub="续约金额占成交总金额比例" />
      </div>

      <ExpiringContracts
        contracts={contracts}
        onAdd={() => setModal({ kind: 'contract' })}
        onEdit={(c) => setModal({ kind: 'contract', data: c })}
        onDelete={removeContract}
      />

      <ProspectList
        prospects={prospects}
        onAdd={() => setModal({ kind: 'prospect' })}
        onEdit={(p) => setModal({ kind: 'prospect', data: p })}
        onDelete={removeProspect}
      />

      <RevenuePanel deals={deals} onAdd={() => setModal({ kind: 'deal' })} />

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
          {modal.kind === 'prospect' && (
            <ProspectForm
              key={modal.data?.id || 'new'}
              initial={modal.data}
              onSave={saveProspect}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'deal' && (
            <DealForm onSave={saveDeal} onCancel={() => setModal(null)} />
          )}
        </Modal>
      )}

      <footer className="footer">
        SMB 销售工作台 · 数据保存在本地 SQLite 数据库（server/data/smb.db），由 Node API 读写，增删改实时生效
      </footer>
    </div>
  );
}
