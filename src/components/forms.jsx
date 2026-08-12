import { useState } from 'react';
import { todayStr } from '../utils/date.js';
import { OWNERS, PLANS, STAGES } from '../data/constants.js';

function Field({ label, required, children, full }) {
  return (
    <label className={`field${full ? ' full' : ''}`}>
      <span className="field-label">
        {label}
        {required ? <i>*</i> : null}
      </span>
      {children}
    </label>
  );
}

function Actions({ onCancel }) {
  return (
    <div className="form-actions">
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        取消
      </button>
      <button type="submit" className="btn btn-primary">
        保存
      </button>
    </div>
  );
}

export function ContractForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: initial?.id || null,
    name: initial?.name || '',
    owner: initial?.owner || OWNERS[0],
    plan: initial?.plan || PLANS[1],
    contact: initial?.contact || '',
    contractAmount: initial?.contractAmount ?? 0,
    startDate: initial?.startDate || todayStr(),
    expiryDate: initial?.expiryDate || '',
    note: initial?.note || '',
  });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('请填写客户名称');
    if (!form.expiryDate) return setError('请选择合同到期时间');
    if (!(form.contractAmount > 0)) return setError('请填写合同金额');
    onSave({ ...form, name: form.name.trim(), contractAmount: Number(form.contractAmount) });
  };

  return (
    <form className="form" onSubmit={submit}>
      <Field label="客户名称" required full>
        <input value={form.name} onChange={set('name')} placeholder="如：杭州云启科技有限公司" />
      </Field>
      <Field label="负责人" required>
        <select value={form.owner} onChange={set('owner')}>
          {OWNERS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>
      <Field label="套餐" required>
        <select value={form.plan} onChange={set('plan')}>
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="联系人">
        <input value={form.contact} onChange={set('contact')} placeholder="如：张经理" />
      </Field>
      <Field label="合同金额（元）" required>
        <input type="number" min="0" step="100" value={form.contractAmount} onChange={set('contractAmount')} />
      </Field>
      <Field label="合同开始时间" required>
        <input type="date" value={form.startDate} onChange={set('startDate')} />
      </Field>
      <Field label="合同到期时间" required full>
        <input type="date" value={form.expiryDate} onChange={set('expiryDate')} />
      </Field>
      <Field label="备注" full>
        <textarea value={form.note} onChange={set('note')} placeholder="合同约定、续约折扣等信息" />
      </Field>
      {error && <div className="form-error">⚠️ {error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

export function ProspectForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: initial?.id || null,
    name: initial?.name || '',
    owner: initial?.owner || OWNERS[0],
    stage: initial?.stage || 'initial',
    contact: initial?.contact || '',
    expectedAmount: initial?.expectedAmount ?? 0,
    lastFollowUp: initial?.lastFollowUp || todayStr(),
    nextFollowUp: initial?.nextFollowUp || '',
    note: initial?.note || '',
  });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('请填写客户名称');
    if (!(form.expectedAmount > 0)) return setError('请填写预计成交金额');
    onSave({ ...form, name: form.name.trim(), expectedAmount: Number(form.expectedAmount) });
  };

  return (
    <form className="form" onSubmit={submit}>
      <Field label="客户名称" required full>
        <input value={form.name} onChange={set('name')} placeholder="如：无锡鼎盛机械" />
      </Field>
      <Field label="负责人" required>
        <select value={form.owner} onChange={set('owner')}>
          {OWNERS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>
      <Field label="跟进阶段" required>
        <select value={form.stage} onChange={set('stage')}>
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="联系人">
        <input value={form.contact} onChange={set('contact')} placeholder="如：钱总" />
      </Field>
      <Field label="预计金额（元）" required>
        <input type="number" min="0" step="100" value={form.expectedAmount} onChange={set('expectedAmount')} />
      </Field>
      <Field label="上次跟进日期">
        <input type="date" value={form.lastFollowUp} onChange={set('lastFollowUp')} />
      </Field>
      <Field label="下次跟进日期" full>
        <input type="date" value={form.nextFollowUp} onChange={set('nextFollowUp')} />
      </Field>
      <Field label="跟进备注" full>
        <textarea value={form.note} onChange={set('note')} placeholder="客户诉求、异议点、下一步动作" />
      </Field>
      {error && <div className="form-error">⚠️ {error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

export function DealForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ customer: '', type: 'new', amount: 0, date: todayStr() });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    if (!form.customer.trim()) return setError('请填写客户名称');
    if (!(form.amount > 0)) return setError('请填写成交金额');
    onSave({ ...form, customer: form.customer.trim(), amount: Number(form.amount) });
  };

  return (
    <form className="form" onSubmit={submit}>
      <Field label="客户名称" required full>
        <input value={form.customer} onChange={set('customer')} placeholder="客户 / 公司名称" />
      </Field>
      <Field label="成交类型" required>
        <select value={form.type} onChange={set('type')}>
          <option value="renewal">续约</option>
          <option value="new">新签</option>
        </select>
      </Field>
      <Field label="成交金额（元）" required>
        <input type="number" min="0" step="100" value={form.amount} onChange={set('amount')} />
      </Field>
      <Field label="签约日期" required full>
        <input type="date" value={form.date} onChange={set('date')} />
      </Field>
      {error && <div className="form-error">⚠️ {error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

