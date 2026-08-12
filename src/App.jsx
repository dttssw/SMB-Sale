import { useMemo, useState } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage.js';
import { getSeedContracts, getSeedProspects, getSeedDeals } from './data/seed.js';
import { daysUntil, formatCnDate, monthOf, todayStr } from './utils/date.js';
import { formatMoney, sumBy } from './utils/format.js';
import Header from './components/Header.jsx';
import KpiCard from './components/KpiCard.jsx';
import ExpiringContracts from './components/ExpiringContracts.jsx';
import ProspectList from './components/ProspectList.jsx';
import RevenuePanel from './components/RevenuePanel.jsx';
import Modal from './components/Modal.jsx';
import { ContractForm, ProspectForm, DealForm } from './components/forms.jsx';

const STORAGE_KEYS = ['smb.contracts.v1', 'smb.prospects.v1', 'smb.deals.v1'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const modalTitle = (m) => {
  if (m.kind === 'contract') return m.data ? '编辑在约客户' : '新增在约客户';
  if (m.kind === 'prospect') return m.data ? '编辑跟进客户' : '新增跟进客户';
  return '记录成交金额';
};

export default function App() {
  const [contracts, setContracts] = useLocalStorage('smb.contracts.v1', getSeedContracts);
  const [prospects, setProspects] = useLocalStorage('smb.prospects.v1', getSeedProspects);
  const [deals, setDeals] = useLocalStorage('smb.deals.v1', getSeedDeals);
  const [modal, setModal] = useState(null);

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
  }, [contracts, prospects, deals]);

  const saveContract = (data) => {
    if (data.id) setContracts(contracts.map((c) => (c.id === data.id ? data : c)));
    else setContracts([{ ...data, id: uid() }, ...contracts]);
    setModal(null);
  };

  const saveProspect = (data) => {
    if (data.id) setProspects(prospects.map((p) => (p.id === data.id ? data : p)));
    else setProspects([{ ...data, id: uid() }, ...prospects]);
    setModal(null);
  };

  const saveDeal = (data) => {
    setDeals([{ ...data, id: uid() }, ...deals]);
    setModal(null);
  };

  const removeContract = (id) => {
    if (window.confirm('确认删除该在约客户？')) setContracts(contracts.filter((c) => c.id !== id));
  };

  const removeProspect = (id) => {
    if (window.confirm('确认删除该跟进客户？')) setProspects(prospects.filter((p) => p.id !== id));
  };

  const resetData = () => {
    if (!window.confirm('将清除本地所有数据并恢复为演示数据，确定吗？')) return;
    STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
    window.location.reload();
  };

  const waitingContractCount = prospects.filter((p) => p.stage === 'contract').length;

  return (
    <div className="container">
      <Header today={formatCnDate(todayStr())} onReset={resetData} />

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
        SMB 销售工作台 · 数据保存在本地浏览器（localStorage），修改后实时生效，可随时重置演示数据
      </footer>
    </div>
  );
}
