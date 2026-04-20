import { TIER_LABELS, type OrgTier } from '@psynote/shared';
import { getRoleLabel } from '../../../../shared/constants/roles';
import { Modal } from './TenantDetailPrimitives';
import { ROLE_OPTIONS } from './types';

/** Add-member modal — controlled form (name / email / password / role). */
export function AddMemberModal({
  form,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  form: { email: string; name: string; password: string; role: string };
  error: string;
  onChange: (patch: Partial<{ email: string; name: string; password: string; role: string }>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal title="添加成员" onClose={onClose}>
      <div className="space-y-3">
        <Field label="姓名 *">
          <input type="text" value={form.name} onChange={(e) => onChange({ name: e.target.value })} className={fieldInput} />
        </Field>
        <Field label="邮箱 *">
          <input type="email" value={form.email} onChange={(e) => onChange({ email: e.target.value })} className={fieldInput} />
        </Field>
        <Field label="密码 *">
          <input type="password" value={form.password} onChange={(e) => onChange({ password: e.target.value })} className={fieldInput} />
        </Field>
        <Field label="角色">
          <select value={form.role} onChange={(e) => onChange({ role: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
          </select>
        </Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={onSubmit} submitLabel="添加" />
    </Modal>
  );
}

/** Issue-license modal — tier + maxSeats + months. */
export function IssueLicenseModal({
  form,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  form: { tier: OrgTier; maxSeats: number; months: number };
  error: string;
  onChange: (patch: Partial<{ tier: OrgTier; maxSeats: number; months: number }>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal title="签发许可证" onClose={onClose}>
      <div className="space-y-3">
        <Field label="套餐等级">
          <select value={form.tier} onChange={(e) => onChange({ tier: e.target.value as OrgTier })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
            {(Object.keys(TIER_LABELS) as OrgTier[]).map((t) => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field label="最大席位">
          <input type="number" min={1} value={form.maxSeats} onChange={(e) => onChange({ maxSeats: parseInt(e.target.value) || 1 })} className={fieldInput} />
        </Field>
        <Field label="有效期（月）">
          <input type="number" min={1} value={form.months} onChange={(e) => onChange({ months: parseInt(e.target.value) || 12 })} className={fieldInput} />
        </Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={onSubmit} submitLabel="签发" />
    </Modal>
  );
}

/** Modify-license modal — tier + maxSeats only (expiry is preserved). */
export function ModifyLicenseModal({
  form,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  form: { tier: OrgTier; maxSeats: number };
  error: string;
  onChange: (patch: Partial<{ tier: OrgTier; maxSeats: number }>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal title="修改许可证" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500 mb-2">修改套餐等级和席位，到期时间保持不变。</p>
        <Field label="套餐等级">
          <select value={form.tier} onChange={(e) => onChange({ tier: e.target.value as OrgTier })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
            {(Object.keys(TIER_LABELS) as OrgTier[]).map((t) => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field label="最大席位">
          <input type="number" min={1} value={form.maxSeats} onChange={(e) => onChange({ maxSeats: parseInt(e.target.value) || 1 })} className={fieldInput} />
        </Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={onSubmit} submitLabel="确认修改" />
    </Modal>
  );
}

// ── internal helpers ──

const fieldInput =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ModalFooter({
  onClose,
  onSubmit,
  submitLabel,
}: {
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 mt-4">
      <button onClick={onClose} className="text-sm text-slate-500 px-4 py-2">取消</button>
      <button onClick={onSubmit} className="text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">{submitLabel}</button>
    </div>
  );
}
