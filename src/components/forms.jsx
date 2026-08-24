import { useState } from 'react';
import { oneYearBefore, oneYearFrom, todayStr } from '../utils/date.js';
import { PRODUCTS, STAGES } from '../data/constants.js';
import DatePicker from './DatePicker.jsx';

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

export function ContractForm({ initial, onSave, onCancel, notesText }) {
  const [form, setForm] = useState({
    id: initial?.id || null,
    name: initial?.name || '',
    plan: initial?.plan || PRODUCTS[0],
    contact: initial?.contact || '',
    contractAmount: initial?.contractAmount ?? 0,
    startDate: initial?.startDate || todayStr(),
    expiryDate: initial?.expiryDate || oneYearFrom(todayStr()),
    note: notesText !== undefined ? notesText : initial?.note || '',
  });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  // 订阅默认一年：选定开始时间后，到期时间自动设为一年后（前一天）
  const onStartDateChange = (v) => {
    setForm((f) => ({ ...f, startDate: v, expiryDate: v ? oneYearFrom(v) : f.expiryDate }));
  };

  // 订阅默认一年（反向联动）：选定到期时间后，开始时间自动设为一年前（加一天）
  const onExpiryDateChange = (v) => {
    setForm((f) => ({ ...f, expiryDate: v, startDate: v ? oneYearBefore(v) : f.startDate }));
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('请填写客户名称');
    if (!form.expiryDate) return setError('请选择订阅到期时间');
    if (!(form.contractAmount > 0)) return setError('请填写合同金额');
    onSave({ ...form, name: form.name.trim(), contractAmount: Number(form.contractAmount) });
  };

  return (
    <form className="form" onSubmit={submit}>
      <Field label="客户名称" required full>
        <input value={form.name} onChange={set('name')} placeholder="如：杭州云启科技有限公司" />
      </Field>
      <Field label="产品" required>
        <select value={form.plan} onChange={set('plan')}>
          {PRODUCTS.map((p) => (
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
        <input type="number" min="0" step="any" value={form.contractAmount} onChange={set('contractAmount')} />
      </Field>
      <Field label="订阅开始时间" required>
        <DatePicker value={form.startDate} onChange={onStartDateChange} clearable={false} />
      </Field>
      <Field label="订阅到期时间" required full>
        <DatePicker value={form.expiryDate} onChange={onExpiryDateChange} clearable={false} />
      </Field>
      <Field label="备注" full>
        <textarea
          value={form.note}
          onChange={set('note')}
          placeholder="客户情况、沟通记录等（保存后追加为该客户的备注时间线）"
        />
      </Field>
      {error && <div className="form-error">⚠️ {error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

export function ProspectForm({ initial, onSave, onCancel, notesText }) {
  const [form, setForm] = useState({
    id: initial?.id || null,
    name: initial?.name || '',
    stage: initial?.stage || 'initial',
    contact: initial?.contact || '',
    expectedAmount: initial?.expectedAmount ?? 0,
    lastFollowUp: initial?.lastFollowUp || todayStr(),
    nextFollowUp: initial?.nextFollowUp || '',
    note: notesText !== undefined ? notesText : initial?.note || '',
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
        <input type="number" min="0" step="any" value={form.expectedAmount} onChange={set('expectedAmount')} />
      </Field>
      <Field label="上次跟进日期">
        <DatePicker value={form.lastFollowUp} onChange={(v) => setForm((f) => ({ ...f, lastFollowUp: v }))} />
      </Field>
      <Field label="下次跟进日期" full>
        <DatePicker value={form.nextFollowUp} onChange={(v) => setForm((f) => ({ ...f, nextFollowUp: v }))} />
      </Field>
      <Field label="备注" full>
        <textarea
          value={form.note}
          onChange={set('note')}
          placeholder="客户情况、商机来源、客户诉求等（保存后追加为该客户的备注时间线）"
        />
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
        <input type="number" min="0" step="any" value={form.amount} onChange={set('amount')} />
      </Field>
      <Field label="签约日期" required full>
        <DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} clearable={false} />
      </Field>
      {error && <div className="form-error">⚠️ {error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

