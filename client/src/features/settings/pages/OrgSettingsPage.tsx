/**
 * Phase 10 — Unified org settings page.
 *
 * Two-level tabs:
 *   - Top bar groups by concern (我的 / 门面 / 组织 / 经营 / 安全)
 *   - Sub bar switches individual tabs within the active group
 *
 * Each tab's content is delegated — inline definitions for 4 org-specific
 * concerns (BasicInfo / Certifications / PublicServices / EAPPartnership)
 * live under ./org-settings/; everything else is already an external
 * component imported by path.
 */
import { useMemo, useState } from 'react';
import { SchoolClassManagement } from './SchoolClassManagement';
import { SchoolStudentList } from './SchoolStudentList';
import { MemberManagement } from './MemberManagement';
import { OrgBrandingSettings } from './OrgBrandingSettings';
import { SubscriptionTab } from './SubscriptionTab';
import { AuditLogViewer } from '../../collaboration/AuditLogViewer';
import { BasicInfoTab as MyBasicInfoTab } from '../../me/components/BasicInfoTab';
import { CounselorProfileTab as MyCounselorProfileTab } from '../../me/components/CounselorProfileTab';
import { ChangePasswordTab } from '../../me/components/ChangePasswordTab';
import { useMe } from '../../../api/useMe';
import { useAuthStore } from '../../../stores/authStore';
import { isVisible, type SceneContext } from '../../../app/scene/visibility';
import { BasicInfoTab } from './org-settings/BasicInfoTab';
import { CertificationsTab } from './org-settings/CertificationsTab';
import { EAPPartnershipTab } from './org-settings/EAPPartnershipTab';
import { PublicServicesTab } from './org-settings/PublicServicesTab';
import { GROUP_LABELS, GROUP_ORDER, TABS, type SettingsTab } from './org-settings/tabsConfig';

export function OrgSettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('my-basic');
  const { currentRole, currentOrgType, currentOrgTier } = useAuthStore();
  const { data: me } = useMe();

  const isSchool = currentOrgType === 'school';
  const scene: SceneContext = {
    orgType: currentOrgType,
    role: currentRole,
    tier: currentOrgTier,
  };

  const visibleTabs = useMemo(
    () =>
      TABS.filter((t) => isVisible(t, scene)).map((t) => {
        if (t.key === 'members' && isSchool) return { ...t, label: '教师管理' };
        return t;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene.orgType, scene.role, scene.tier, isSchool],
  );

  const groupedTabs = useMemo(
    () =>
      GROUP_ORDER.map((g) => ({
        group: g,
        label: GROUP_LABELS[g],
        tabs: visibleTabs.filter((t) => t.group === g),
      })).filter((g) => g.tabs.length > 0),
    [visibleTabs],
  );

  const activeGroup = groupedTabs.find((g) => g.tabs.some((t) => t.key === tab)) || groupedTabs[0];

  return (
    <div className="space-y-4">
      <div className="flex border-b border-slate-200">
        {groupedTabs.map(({ group, label }) => (
          <button
            key={group}
            type="button"
            onClick={() => {
              const firstTab = groupedTabs.find((g) => g.group === group)?.tabs[0];
              if (firstTab) setTab(firstTab.key);
            }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition ${
              activeGroup?.group === group
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeGroup && activeGroup.tabs.length > 1 && (
        <div className="flex gap-1">
          {activeGroup.tabs.map(({ key, label: tabLabel, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 transition ${
                tab === key ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tabLabel}
            </button>
          ))}
        </div>
      )}

      <div>
        {tab === 'my-basic' && (me ? <MyBasicInfoTab me={me} /> : <Loading />)}
        {tab === 'my-counselor' && (me ? <MyCounselorProfileTab me={me} /> : <Loading />)}
        {tab === 'my-password' && <ChangePasswordTab hasExistingPassword={true} />}
        {tab === 'basic' && <BasicInfoTab />}
        {tab === 'services' && <PublicServicesTab />}
        {tab === 'branding' && <OrgBrandingSettings />}
        {tab === 'members' && <MemberManagement />}
        {tab === 'classes' && <SchoolClassManagement />}
        {tab === 'students' && <SchoolStudentList />}
        {tab === 'partners' && <EAPPartnershipTab />}
        {tab === 'subscription' && <SubscriptionTab />}
        {tab === 'audit' && <AuditLogViewer />}
        {tab === 'certifications' && <CertificationsTab />}
      </div>
    </div>
  );
}

function Loading() {
  return <div className="text-sm text-slate-400 py-8 text-center">加载中...</div>;
}
