# @psynote/client-portal

C 端(来访者 / 学员 / 受测者)服务门户,独立构建包。

Phase 8a 完成了文件层面的抽包(源码从 `client/src/features/client-portal`
迁到本包),保留通过 `@client/*` alias 对主 client 的双向耦合。Phase 8b
完成了独立 Vite 构建 —— 现在 portal 既可以作为 `@psynote/client-portal`
被主 client import 挂到 `/portal/*` 路由,也可以独立构建为一个小型 SPA
部署到自己的域名(例如 `portal.psynote.com`)。

## 开发

### 在主 client 里运行(同 Phase 8a)

```bash
npm run dev:client        # 主 client,http://localhost:5173
# /portal/* 路由复用 client 的整个 shell + providers
```

### 独立 dev server(Phase 8b 新增)

```bash
npm run dev --workspace=@psynote/client-portal
# portal 独立 dev server,http://localhost:5174
# /api/* 走 vite proxy 转发到 http://localhost:4000 (psynote 后端)
```

两个 dev server 可以**同时**运行 —— 它们使用不同端口(5173 vs 5174)
并且都通过 proxy 转发到同一个后端实例。

### 独立构建

```bash
npm run build --workspace=@psynote/client-portal
# 产出 packages/client-portal/dist/{index.html, assets/*}
```

当前 bundle 体积(Phase 8c 重构后):
- `index.html` 0.75 kB
- `index-*.css` 50.6 kB (gzip 8.5 kB)
- `index-*.js` 435 kB (gzip 129 kB)

## 独立部署(生产)

Portal 是静态 SPA,任何能托管静态文件 + 提供反向代理转发 `/api/*` 的
方案都能跑。示例:

### nginx

```nginx
server {
  listen 443 ssl http2;
  server_name portal.psynote.com;

  # 静态资源
  root /var/www/psynote-portal;
  index index.html;

  # SPA fallback — 所有非 asset 请求回到 index.html
  location / {
    try_files $uri $uri/ /index.html;
  }

  # API 反向代理到 psynote 后端
  location /api/ {
    proxy_pass http://psynote-backend.internal:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### 认证模型

Portal 不用 cookie,用 **Bearer token in localStorage**(和主 client 相同的
`useAuthStore`)。这意味着:

- **跨域 session 共享不是必需的** —— 用户在 `portal.psynote.com` 独立登录,
  token 存在该域下的 localStorage。主 client 在 `app.psynote.com` 登录会
  单独存一份。两边互不影响。
- **不需要 CORS cookie 配置** —— 请求由同域反向代理中转,浏览器看到的
  是同域请求。
- **刷新 token 机制一致** —— portal 和 client 共用 `@client/api/client.ts`,
  refresh token 逻辑完全相同。

### 路由差异

Phase 8c 重构后,portal 采用 **4 tab 底部导航 + 下钻**结构:

```
/login                              — 共享 LoginPage
/portal/                            — PortalAppShell 壳
  index                             —   HomeTab (首页:待办 + 状态 + 时间线缩略)
  services                          —   MyServicesTab (我的咨询 / 团辅 / 课程)
  services/:kind/:id                —   ServiceDetail (下钻:咨询师会谈历史 + 预约入口)
  services/course/:courseId         —   CourseReader (下钻:课程阅读器)
  book                              —   BookAppointment (下钻:为已绑定咨询师预约)
  archive                           —   ArchiveTab (档案:测评历史 + 完整时间线)
  account                           —   AccountTab (我的:协议 + 个人信息 + 退出)
  account/profile                   —   ProfileSettings (下钻)
  account/consents                  —   ConsentCenter (下钻)
*                                   — 未登录 → /login,已登录 → /portal
```

主 client 里那些 counselor / org_admin / system-admin 的路由在 portal
bundle 中完全不存在,即使 counselor 误登 portal 也只会看到来访者视角
(因为 PortalApp 不做角色分流)。

## 架构决策

### Phase 8a:为什么保留 `@client/*` 耦合?

Phase 8a 的目标是**文件层面**独立,不是**依赖图**独立。Portal 仍然深度
依赖主 client 的:

- `@client/api/*` — `useClientPortal` / `useConsent` / `useCourses` 等 react-query hooks
- `@client/shared/components` — 共享 UI(Toast / PageLoading / RiskBadge / EmptyState 等)
- `@client/stores/authStore` — 登录态
- `@client/features/counseling/components/Timeline` — 时间线组件
- `@client/features/assessment/constants` — 风险等级文案常量

这些依赖在 Phase 8b 的独立构建中通过 vite alias 被**bundle-inlined**:
构建器跟随 import 图,把 `@client/*` 指向的文件拷贝到 portal 的 bundle 里。
运行时 portal 是完全独立的 — 不需要主 client 的 dist 存在。

### Phase 8c:移动优先 4-tab 重构

Phase 8a/8b 完成了**构建层**独立,但信息架构仍然沿用 B 端思路
(7 个扁平页面 + 顶部横向导航 + PC 密度)。Phase 8c 把 portal 的 UX
重构为**移动优先的 4-tab 底部导航小程序壳**:

- **4 底部 tab**:🏠 首页 / 📋 我的服务 / 📁 档案 / 👤 我的
- **移动单列布局**:`max-w-md` (448 px) 居中,桌面打开也是手机壳
  —— 故意不做响应式双套布局,为将来 Taro 编译小程序降成本
- **待办驱动**:HomeTab 顶部是"现在要做什么"(未签协议 / 近期预约),
  而不是状态仪表盘
- **精简"逛商店"**:删除 ServiceHall 页面。B2B2C 模型下机构分配
  出现在"我的服务",公开招募走 `/enroll/:instanceId` 外链
- **零服务端改动**:所有 tab 复用 Phase 8a 的 hooks
- **顺带修复** CourseReader `enrollmentId=null` hardcode bug —— 从
  MyServicesTab 下钻时通过 route state 把 enrollmentId 传进去

对 B 端(counselor / org_admin)没有任何影响 —— 他们的 `/portal/*`
路由不存在,主 client 的 AppShell 走单独的 AppRoutes 分支。

### 未来方向:打破 `@client/*` 耦合

真正解耦 portal 需要把共用的 hooks / UI / store **进一步抽**到更独立的
共享包,例如:

- `@psynote/api-client` — 所有 react-query hooks + api base client
- `@psynote/ui-kit` — shared/components(含 delivery 组件)
- `@psynote/auth-store` — authStore 和 tier 逻辑

届时 portal 只依赖 `@psynote/shared` + 3 个共享包,与主 client 完全对等。
这个改造成本不高,但在当前单代码库阶段收益有限,留作后续阶段决策。

### 微信小程序

如果将来要在微信小程序里跑 portal,有两条路:

- **Taro**:用 `@tarojs/taro` 编译现有 React 代码,shim 路由和样式。
  Phase 8c 的移动单列布局让这条路改动量最小。
- **uni-app**:重写为 Vue。最像原生体验,成本最高。

决策时机:C 端用户规模或企业客户明确要求时再启动。

## 文件布局

```
packages/client-portal/
├── README.md                    — 本文件
├── package.json                 — workspace 定义 + dev/build/preview 脚本
├── tsconfig.json                — portal 独立 typecheck 配置(noEmit)
├── vite.config.ts               — Phase 8b 独立 Vite 构建(port 5174)
├── tailwind.config.ts           — Phase 8b 独立 Tailwind(含 content glob 回到 client/src)
├── postcss.config.js            — Phase 8b 新增
├── index.html                   — Phase 8b 新增
├── dist/                        — 构建产物(gitignored)
└── src/
    ├── index.css                — tailwind 入口
    ├── main.tsx                 — Phase 8b 独立 entry
    ├── PortalApp.tsx            — portal-only 路由树(Phase 8c: 4 tab 嵌套)
    ├── PortalAppShell.tsx       — Phase 8c: 移动优先壳 (header + Outlet + BottomTabBar)
    ├── index.ts                 — 公共 API surface(主 client import 时用)
    ├── components/              — Phase 8c: 新建组件目录
    │   ├── BottomTabBar.tsx     —   4 tab 底部导航 (NavLink active 态)
    │   ├── TaskCard.tsx         —   首页待办卡片 (icon + title + action)
    │   ├── ServiceCard.tsx      —   我的服务卡片 (counseling/group/course)
    │   └── SectionHeader.tsx    —   移动风格 section 标题
    └── pages/
        ├── HomeTab.tsx          — Phase 8c: 首页 tab (待办 + 状态 + 时间线缩略)
        ├── MyServicesTab.tsx    — Phase 8c: 我的服务 tab (3 section)
        ├── ArchiveTab.tsx       — Phase 8c: 档案 tab (测评历史 + 完整时间线)
        ├── AccountTab.tsx       — Phase 8c: 我的 tab (协议 + 个人信息 + 退出)
        ├── ProfileSettings.tsx  — Phase 8c: 个人信息下钻 (只读)
        ├── ServiceDetail.tsx    — Phase 8c: 咨询服务详情下钻
        ├── BookAppointment.tsx  — 预约下钻 (Phase 8c 简化: 接 ?counselorId= 预选)
        ├── CourseReader.tsx     — 课程阅读器 (Phase 8c 修复 enrollmentId bug)
        └── ConsentCenter.tsx    — 协议签署下钻
```
