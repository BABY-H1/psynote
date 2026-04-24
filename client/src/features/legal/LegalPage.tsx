import { Link } from 'react-router-dom';

/**
 * 法律页占位 —— 用户协议 / 隐私政策 的临时占位,让登录页死链消失。
 *
 * Alpha 阶段内容简单,正式上线前由**产品 + 法务**提供正式文案,替换下面的
 * `CONTENT` 对象即可。每个机构可以覆盖成自己的文案(V2 考虑 per-org 自定义)。
 */

type LegalKind = 'privacy' | 'terms';

const CONTENT: Record<LegalKind, { title: string; body: string }> = {
  privacy: {
    title: '隐私政策',
    body: `本系统(Psynote)由使用机构提供给您使用,用于心理服务的预约、测评、咨询记录等。我们承诺:

• 您的个人信息与咨询记录受《中华人民共和国个人信息保护法》、《精神卫生法》等相关法律保护。
• 机构工作人员仅在必要范围内查阅您的数据,访问全程记录审计。
• 您的咨询逐字稿、测评原始答卷等敏感数据仅由授权咨询师和必要的督导人员查阅。
• 机构不会在未经您同意的情况下将您的个人信息与第三方共享(法律强制要求除外)。
• 您有权查阅、更正、导出或删除您的个人数据。如需行使权利,请联系使用机构。

本页为系统默认占位文本,正式版本将由使用机构提供。如您对隐私条款有疑问,请直接联系使用机构。`,
  },
  terms: {
    title: '用户协议',
    body: `欢迎使用 Psynote 心理服务平台。使用本系统即表示您同意以下条款:

1. **账户与安全**:您有义务妥善保管账号密码,不得与他人共享。账号被盗用产生的后果由您自行承担。
2. **服务范围**:本系统提供的测评、咨询、课程等服务仅作为辅助工具,不替代专业医疗诊断。如有严重心理危机,请立即联系当地精神卫生机构或拨打 120。
3. **内容真实性**:您在系统内填写的信息应真实准确,虚假信息可能影响服务效果并导致账号被停用。
4. **合理使用**:您不得利用本系统从事违法活动,不得上传违法或侵权内容。
5. **服务变更**:使用机构保留调整或停止服务的权利,但会在合理期限内通知您。

本页为系统默认占位文本,正式版本将由使用机构提供。如您对条款有疑问,请联系使用机构。`,
  },
};

function LegalPage({ kind }: { kind: LegalKind }) {
  const { title, body } = CONTENT[kind];
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-6">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">{title}</h1>
        <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
          {body}
        </div>
        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between text-sm">
          <Link to="/login" className="text-brand-600 hover:underline">返回登录</Link>
          <span className="text-slate-400">
            更新于 2026-04-24 · 占位版本
          </span>
        </div>
      </div>
    </div>
  );
}

export function PrivacyPolicyPage() {
  return <LegalPage kind="privacy" />;
}

export function TermsOfServicePage() {
  return <LegalPage kind="terms" />;
}
