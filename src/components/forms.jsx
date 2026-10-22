import { useState } from 'react';
import { oneYearBefore, oneYearFrom, todayStr } from '../utils/date.js';
import { cleanSkus, skusOf } from '../utils/sku.js';
import { SKUS, RENEW_WINDOW_DAYS, STAGES } from '../data/constants.js';
import DatePicker from './DatePicker.jsx';
import Icon from './icons.jsx';

function Field({ label, required, hint, children, full }) {
  return (
    <label className={`field${full ? ' full' : ''}`}>
      <span className="field-label">
        {label}
        {required ? <i>*</i> : null}
      </span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
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

// 多 SKU 编辑：默认 1 条；有多条时逐条「添加 SKU」，多于一条时任意一条都可移除。
// 第一条即主 SKU（数据库 plan 字段），其余存入 skus 列表。
function SkuEditor({ value, onChange }) {
  const list = value && value.length ? value : [''];
  const picked = list.filter(Boolean);
  const update = (index, sku) => onChange(list.map((v, i) => (i === index ? sku : v)));
  const add = () => onChange([...list, '']);
  const remove = (index) => onChange(list.filter((_, i) => i !== index));

  return (
    <div className="sku-editor">
      {list.map((sku, index) => {
        const others = list.filter((v, i) => i !== index && v);
        return (
          <div className="sku-row" key={index}>
            <select
              value={sku}
              onChange={(e) => update(index, e.target.value)}
              aria-label={`SKU ${index + 1}`}
            >
              <option value="">{index === 0 ? '请选择 SKU' : '请选择 SKU（可选）'}</option>
              {SKUS.map((s) => (
                <option key={s} value={s} disabled={others.includes(s)}>
                  {s}
                </option>
              ))}
            </select>
            {list.length > 1 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm sku-remove"
                onClick={() => remove(index)}
                title="移除这条 SKU"
              >
                移除
              </button>
            )}
          </div>
        );
      })}
      <div className="sku-editor-foot">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={add}
          disabled={list.length >= SKUS.length}
        >
          <Icon name="plus" />
          添加 SKU
        </button>
        <span className="field-hint">已选 {picked.length} 条，第一条为主 SKU</span>
      </div>
    </div>
  );
}

const skuFieldHint = '默认 1 条；一个客户可以有多条 SKU，点击「添加 SKU」继续添加';

export function ContractForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: initial?.id || null,
    name: initial?.name || '',
    // 默认 1 条 SKU；编辑时读取 skus（历史数据回退为 plan）
    skus: initial ? skusOf(initial) : [SKUS[0]],
    contact: initial?.contact || '',
    contractAmount: initial?.contractAmount ?? 0,
    startDate: initial?.startDate || todayStr(),
    expiryDate: initial?.expiryDate || oneYearFrom(todayStr()),
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
    const skus = cleanSkus(form.skus);
    if (!form.name.trim()) return setError('请填写客户名称');
    if (!skus.length) return setError('请选择 SKU');
    if (!form.expiryDate) return setError('请选择订阅到期时间');
    if (!(form.contractAmount > 0)) return setError('请填写合同金额');
    onSave({
      ...form,
      skus,
      plan: skus[0],
      name: form.name.trim(),
      contractAmount: Number(form.contractAmount),
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <Field label="客户名称" required full hint="客户名唯一：同名客户会共用同一份档案与备注">
        <input value={form.name} onChange={set('name')} placeholder="如：杭州云启科技有限公司" />
      </Field>
      <Field label="SKU" required full hint={skuFieldHint}>
        <SkuEditor value={form.skus} onChange={(skus) => setForm({ ...form, skus })} />
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
      {error && <div className="form-error">{error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

export function ProspectForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: initial?.id || null,
    name: initial?.name || '',
    stage: initial?.stage || 'initial',
    contact: initial?.contact || '',
    // SKU：客户统一字段，默认 1 条（历史跟进记录可能为空，编辑时需补选）
    skus: skusOf(initial),
    expectedAmount: initial?.expectedAmount ?? 0,
    lastFollowUp: initial?.lastFollowUp || todayStr(),
    nextFollowUp: initial?.nextFollowUp || '',
  });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const skus = cleanSkus(form.skus);
    if (!form.name.trim()) return setError('请填写客户名称');
    if (!skus.length) return setError('请选择 SKU');
    if (!(form.expectedAmount > 0)) return setError('请填写预计成交金额');
    onSave({
      ...form,
      skus,
      plan: skus[0],
      name: form.name.trim(),
      expectedAmount: Number(form.expectedAmount),
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <Field label="客户名称" required full hint="客户名唯一：同名客户会共用同一份档案与备注">
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
      <Field label="SKU" required full hint={skuFieldHint}>
        <SkuEditor value={form.skus} onChange={(skus) => setForm({ ...form, skus })} />
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
      {error && <div className="form-error">{error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

export function RenewForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: initial?.id || null,
    name: initial?.name || '',
    contact: initial?.contact || '',
    // SKU：与在约记录同步（不在约的续约客户会用它自动补建在约记录）
    skus: initial ? skusOf(initial) : [SKUS[0]],
    expectedAmount: initial?.expectedAmount ?? 0,
    expiryDate: initial?.expiryDate || todayStr(),
    lastFollowUp: initial?.lastFollowUp || todayStr(),
    nextFollowUp: initial?.nextFollowUp || '',
  });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const skus = cleanSkus(form.skus);
    if (!form.name.trim()) return setError('请填写客户名称');
    if (!skus.length) return setError('请选择 SKU');
    if (!(form.expectedAmount > 0)) return setError('请填写预计成交金额');
    if (!form.expiryDate) return setError('请选择续约到期时间');
    onSave({
      ...form,
      skus,
      plan: skus[0],
      name: form.name.trim(),
      expectedAmount: Number(form.expectedAmount),
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <Field label="客户名称" required full hint="客户名唯一：同名客户会共用同一份档案与备注">
        <input value={form.name} onChange={set('name')} placeholder="如：杭州云启科技有限公司" />
      </Field>
      <Field label="联系人">
        <input value={form.contact} onChange={set('contact')} placeholder="如：张经理" />
      </Field>
      <Field label="SKU" required full hint={`${skuFieldHint}；与在约记录同步，该客户不在约时会用它自动补建在约记录`}>
        <SkuEditor value={form.skus} onChange={(skus) => setForm({ ...form, skus })} />
      </Field>
      <Field label="预计金额（元）" required>
        <input type="number" min="0" step="any" value={form.expectedAmount} onChange={set('expectedAmount')} />
      </Field>
      <Field
        label="续约到期时间"
        required
        full
        hint={`保存后自动判定是否在约：在约客户归入「在约客户」板块；距到期 ≤ ${RENEW_WINDOW_DAYS} 天（约两个月）才留在「续约跟进」`}
      >
        <DatePicker value={form.expiryDate} onChange={(v) => setForm((f) => ({ ...f, expiryDate: v }))} clearable={false} />
      </Field>
      <Field label="上次跟进日期">
        <DatePicker value={form.lastFollowUp} onChange={(v) => setForm((f) => ({ ...f, lastFollowUp: v }))} />
      </Field>
      <Field label="下次跟进日期">
        <DatePicker value={form.nextFollowUp} onChange={(v) => setForm((f) => ({ ...f, nextFollowUp: v }))} />
      </Field>
      {error && <div className="form-error">{error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

export function PartnerForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: initial?.id || null,
    name: initial?.name || '',
    contact: initial?.contact || '',
  });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('请填写合作伙伴名称');
    onSave({ ...form, name: form.name.trim() });
  };

  return (
    <form className="form" onSubmit={submit}>
      <Field label="合作伙伴名称" required full>
        <input value={form.name} onChange={set('name')} placeholder="如：某某渠道商 / 代理商" />
      </Field>
      <Field label="联系人">
        <input value={form.contact} onChange={set('contact')} placeholder="如：王经理" />
      </Field>
      {error && <div className="form-error">{error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

export function DealForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ customer: '', amount: 0, date: todayStr() });
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
      <Field label="成交金额（元）" required>
        <input type="number" min="0" step="any" value={form.amount} onChange={set('amount')} />
      </Field>
      <Field label="签约日期" required>
        <DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} clearable={false} />
      </Field>
      {error && <div className="form-error">{error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

