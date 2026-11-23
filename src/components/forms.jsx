import { useState } from 'react';
import { oneYearBefore, oneYearFrom, todayStr } from '../utils/date.js';
import { cleanSkus, skusOf } from '../utils/sku.js';
import { SKUS } from '../data/constants.js';
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
            <select value={sku} onChange={(e) => update(index, e.target.value)} aria-label={`SKU ${index + 1}`}>
              <option value="">{index === 0 ? '请选择 SKU' : '请选择 SKU（可选）'}</option>
              {SKUS.map((s) => (
                <option key={s} value={s} disabled={others.includes(s)}>
                  {s}
                </option>
              ))}
            </select>
            {list.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm sku-remove" onClick={() => remove(index)}>
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

const skuFieldHint = '一个项目可以配置多条 SKU，第一条作为主 SKU';

export function ProjectForm({
  initial,
  customers,
  partners,
  onCreateCustomer,
  onSave,
  onCancel,
  defaultCategory = 'new',
  renewMode = false,
  lockCustomer = false,
}) {
  const isSigned = initial?.status === 'won';
  const [form, setForm] = useState({
    id: initial?.id || null,
    name: initial?.name || '',
    customerId: initial?.customerId || '',
    partnerId: initial?.partnerId || '',
    category: initial?.category || defaultCategory,
    contact: initial?.contact || '',
    expectedAmount: initial?.expectedAmount ?? 0,
    skus: initial ? skusOf(initial) : [SKUS[0]],
    lastFollowUp: initial?.lastFollowUp || todayStr(),
    nextFollowUp: initial?.nextFollowUp || '',
    contractAmount: initial?.contractAmount ?? initial?.expectedAmount ?? 0,
    startDate: initial?.startDate || todayStr(),
    expiryDate: initial?.expiryDate || oneYearFrom(todayStr()),
  });
  const [newCustomer, setNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerContact, setNewCustomerContact] = useState('');
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const onStartDateChange = (value) =>
    setForm((prev) => ({ ...prev, startDate: value, expiryDate: oneYearFrom(value) }));
  const onExpiryDateChange = (value) =>
    setForm((prev) => ({ ...prev, expiryDate: value, startDate: oneYearBefore(value) }));

  const submit = async (e) => {
    e.preventDefault();
    const skus = cleanSkus(form.skus);
    if (!form.name.trim()) return setError('请填写项目名称');
    if (!skus.length) return setError('请选择 SKU');
    if (Number(form.expectedAmount) <= 0) return setError('请填写预计成交金额');
    if (isSigned) {
      if (Number(form.contractAmount) <= 0) return setError('请填写成交金额');
      if (!form.startDate || !form.expiryDate) return setError('请选择订阅开始和到期时间');
      if (form.startDate > form.expiryDate) return setError('订阅开始时间不能晚于到期时间');
    }

    let customerId = form.customerId;
    try {
      if (newCustomer) {
        if (!newCustomerName.trim()) return setError('请填写新客户名称');
        const customer = await onCreateCustomer({
          name: newCustomerName.trim(),
          contact: newCustomerContact.trim(),
        });
        customerId = customer.id;
      }
      if (!customerId) return setError('请选择最终客户');
      await onSave({
        ...form,
        name: form.name.trim(),
        customerId,
        partnerId: form.partnerId || null,
        skus,
        expectedAmount: Number(form.expectedAmount),
        contractAmount: isSigned ? Number(form.contractAmount) : null,
        startDate: isSigned ? form.startDate : null,
        expiryDate: isSigned ? form.expiryDate : form.expiryDate || null,
        category: isSigned ? form.category || null : form.category,
        nextFollowUp: isSigned ? '' : form.nextFollowUp,
      });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <Field
        label={renewMode ? '续约项目名称' : '项目名称'}
        required
        full
        hint="项目是一次新签或续约商机；项目名称可随时修改"
      >
        <input value={form.name} onChange={set('name')} placeholder="如：云启科技 · 旗舰版升级" />
      </Field>

      {lockCustomer ? (
        <Field label="最终客户" required full hint="续约项目继承原已签项目的最终客户">
          <input value={initial?.customerName || customers.find((c) => c.id === form.customerId)?.name || ''} disabled />
        </Field>
      ) : (
        <Field label="最终客户" required full hint="一个项目必须且只能选择一个最终客户">
          <select
            value={newCustomer ? '__new__' : form.customerId}
            onChange={(e) => {
              if (e.target.value === '__new__') {
                setNewCustomer(true);
                setForm({ ...form, customerId: '' });
              } else {
                setNewCustomer(false);
                setForm({ ...form, customerId: e.target.value });
              }
            }}
          >
            <option value="">请选择客户</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
            <option value="__new__">＋ 新建客户</option>
          </select>
        </Field>
      )}

      {newCustomer && !lockCustomer && (
        <>
          <Field label="新客户名称" required>
            <input
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              placeholder="如：杭州云启科技有限公司"
            />
          </Field>
          <Field label="客户联系人">
            <input
              value={newCustomerContact}
              onChange={(e) => setNewCustomerContact(e.target.value)}
              placeholder="如：张经理"
            />
          </Field>
        </>
      )}

      <Field label="合作伙伴">
        <select value={form.partnerId} onChange={set('partnerId')}>
          <option value="">不关联合作伙伴</option>
          {partners.map((partner) => (
            <option key={partner.id} value={partner.id}>
              {partner.name}
            </option>
          ))}
        </select>
      </Field>

      {!renewMode && (
        <Field label="项目类型" required hint="New 与 Renew 只描述项目类型，不代表客户状态">
          <select value={form.category || 'new'} onChange={set('category')} disabled={isSigned && !form.category}>
            <option value="new">New · 新签</option>
            <option value="renew">Renew · 续约</option>
          </select>
        </Field>
      )}

      <Field label="项目联系人">
        <input value={form.contact} onChange={set('contact')} placeholder="如：李总" />
      </Field>

      <Field label="SKU" required full hint={skuFieldHint}>
        <SkuEditor value={form.skus} onChange={(skus) => setForm({ ...form, skus })} />
      </Field>

      <Field label={isSigned ? '成交金额（元）' : '预计金额（元）'} required>
        <input
          type="number"
          min="0"
          step="any"
          value={isSigned ? form.contractAmount : form.expectedAmount}
          onChange={set(isSigned ? 'contractAmount' : 'expectedAmount')}
        />
      </Field>

      {isSigned && (
        <>
          <Field label="订阅开始时间" required>
            <DatePicker value={form.startDate} onChange={onStartDateChange} clearable={false} />
          </Field>
          <Field label="订阅到期时间" required>
            <DatePicker value={form.expiryDate} onChange={onExpiryDateChange} clearable={false} />
          </Field>
        </>
      )}

      {!isSigned && (
        <>
          <Field label="上次跟进日期">
            <DatePicker value={form.lastFollowUp} onChange={(v) => setForm((f) => ({ ...f, lastFollowUp: v }))} />
          </Field>
          <Field label="下次跟进日期">
            <DatePicker value={form.nextFollowUp} onChange={(v) => setForm((f) => ({ ...f, nextFollowUp: v }))} />
          </Field>
        </>
      )}

      {error && <div className="form-error">{error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

export function WinProjectForm({ project, onSave, onCancel }) {
  const [form, setForm] = useState({
    contractAmount: project.contractAmount ?? project.expectedAmount ?? 0,
    startDate: project.startDate || todayStr(),
    expiryDate: project.expiryDate || oneYearFrom(todayStr()),
    skus: skusOf(project),
  });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const onStartDateChange = (value) =>
    setForm((prev) => ({ ...prev, startDate: value, expiryDate: oneYearFrom(value) }));
  const onExpiryDateChange = (value) =>
    setForm((prev) => ({ ...prev, expiryDate: value, startDate: oneYearBefore(value) }));

  const submit = (e) => {
    e.preventDefault();
    if (Number(form.contractAmount) <= 0) return setError('请填写成交金额');
    if (!form.startDate || !form.expiryDate) return setError('请选择订阅开始和到期时间');
    const skus = cleanSkus(form.skus);
    if (!skus.length) return setError('请选择 SKU');
    onSave({
      contractAmount: Number(form.contractAmount),
      startDate: form.startDate,
      expiryDate: form.expiryDate,
      skus,
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-note">
        项目赢单后会进入「已签项目」，同时生成一笔成交记录。原项目记录不会删除。
      </div>
      <Field label="成交金额（元）" required full>
        <input type="number" min="0" step="any" value={form.contractAmount} onChange={set('contractAmount')} />
      </Field>
      <Field label="SKU" required full>
        <SkuEditor value={form.skus} onChange={(skus) => setForm({ ...form, skus })} />
      </Field>
      <Field label="订阅开始时间" required>
        <DatePicker value={form.startDate} onChange={onStartDateChange} clearable={false} />
      </Field>
      <Field label="订阅到期时间" required>
        <DatePicker value={form.expiryDate} onChange={onExpiryDateChange} clearable={false} />
      </Field>
      {error && <div className="form-error">{error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

export function CustomerForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ id: initial?.id || null, name: initial?.name || '', contact: initial?.contact || '' });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('请填写客户名称');
    onSave({ ...form, name: form.name.trim(), contact: form.contact.trim() });
  };
  return (
    <form className="form" onSubmit={submit}>
      <Field label="客户名称" required full hint="客户名唯一，同一家公司只保留一份主档">
        <input value={form.name} onChange={set('name')} placeholder="如：杭州云启科技有限公司" />
      </Field>
      <Field label="默认联系人" full>
        <input value={form.contact} onChange={set('contact')} placeholder="如：张经理" />
      </Field>
      {error && <div className="form-error">{error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

export function PartnerForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ id: initial?.id || null, name: initial?.name || '' });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('请填写合作伙伴名称');
    onSave({ ...form, name: form.name.trim() });
  };
  return (
    <form className="form" onSubmit={submit}>
      <Field
        label="合作伙伴名称"
        required
        full
        hint="联系人可逐条写在详情页的备注时间线里；项目可在项目表单中选择该合作伙伴"
      >
        <input value={form.name} onChange={set('name')} placeholder="如：某某渠道商 / 代理商" />
      </Field>
      {error && <div className="form-error">{error}</div>}
      <Actions onCancel={onCancel} />
    </form>
  );
}

export function DealForm({ projects, initial, onSave, onCancel }) {
  const signed = projects.filter((p) => p.status === 'won');
  const [form, setForm] = useState({
    projectId: initial?.projectId || signed[0]?.id || '',
    amount: initial?.amount ?? signed[0]?.contractAmount ?? 0,
    date: initial?.date || todayStr(),
  });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    if (!form.projectId) return setError('请选择已签项目');
    if (Number(form.amount) <= 0) return setError('请填写成交金额');
    onSave({ ...form, amount: Number(form.amount) });
  };
  const selected = signed.find((p) => p.id === form.projectId);
  return (
    <form className="form" onSubmit={submit}>
      <Field label="已签项目" required full>
        <select value={form.projectId} onChange={set('projectId')}>
          <option value="">请选择已签项目</option>
          {signed.map((project) => (
            <option key={project.id} value={project.id}>
              {project.customerName} · {project.name}
            </option>
          ))}
        </select>
      </Field>
      {selected && (
        <div className="form-note">
          最终客户：{selected.customerName} · 类型：{selected.category === 'renew' ? '续约' : '新签'}
        </div>
      )}
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
