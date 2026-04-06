# Psynote

AI 驱动的心理服务管理平台，为心理咨询机构提供全流程数字化解决方案。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS |
| 状态管理 | Zustand (客户端) + TanStack Query (服务端) |
| 后端 | Fastify 5 + TypeScript + Drizzle ORM |
| 数据库 | PostgreSQL |
| 队列 | BullMQ + Redis |
| AI | OpenAI Compatible API |
| 认证 | 自建 JWT (bcrypt + jsonwebtoken) |
| 邮件 | Nodemailer |

## 核心功能

### 咨询服务
- **个案管理** - 个案工作台、治疗计划、风险评估、会谈记录
- **预约管理** - 排班设置、在线预约、提醒通知
- **合规协议** - 知情同意书模板管理、电子签署、审计追踪

### 测评系统
- **量表库** - 量表管理、AI 创建量表、维度与计分规则
- **测评管理** - 批量施测、公开链接、报告生成与导出

### 团体辅导
- **方案模板** - AI 生成/导入团辅方案、OKR 目标设计
- **活动管理** - 创建团辅活动、报名管理、出勤记录

### 课程体系
- **课程创作** - 手动/AI 辅助创建课程、蓝图编辑器
- **课程发布** - 学员报名、作业批改、反馈收集

### 知识库
- 测评量表、治疗目标、合规协议、团辅方案、课程方案、会谈记录模板
- 统一的 AI 生成 + 文本导入 + 手动编辑流程

### 来访者门户
- 自助仪表盘、预约管理、测评报告、协议签署、课程学习

### 系统管理
- 多机构支持、成员角色权限 (RBAC)、数据隔离、系统管理员面板

## 快速开始

### 环境要求
- Node.js 18+
- PostgreSQL
- Redis

### 安装

```bash
git clone https://github.com/BABY-H1/psynote.git
cd psynote
npm install
```

### 配置环境变量

在 `server/` 目录创建 `.env` 文件：

```env
NODE_ENV=development
PORT=4000
HOST=0.0.0.0
CLIENT_URL=http://localhost:5173

DATABASE_URL=postgresql://user:password@localhost:5432/psynote
REDIS_URL=redis://localhost:6379

JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret

OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

NODEMAILER_HOST=smtp.gmail.com
NODEMAILER_PORT=587
NODEMAILER_USER=your_email
NODEMAILER_PASSWORD=your_password
```

### 初始化数据库

```bash
cd server
npx drizzle-kit migrate
```

### 启动开发服务器

```bash
npm run dev
```

前端：http://localhost:5173 | 后端：http://localhost:4000

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 同时启动前后端开发服务器 |
| `npm run dev:server` | 仅启动后端 (Fastify + tsx watch) |
| `npm run dev:client` | 仅启动前端 (Vite) |
| `npm run build` | 构建前后端 |
| `npm run typecheck` | 全量类型检查 |
| `npm run db:generate` | 生成数据库迁移文件 |
| `npm run db:migrate` | 执行数据库迁移 |
| `npm run db:studio` | 打开 Drizzle Studio |

## 项目结构

```
psynote/
├── client/                     # React 前端
│   └── src/
│       ├── app/                # 路由与布局
│       ├── features/           # 功能模块
│       │   ├── assessment/     # 测评
│       │   ├── counseling/     # 咨询
│       │   ├── courses/        # 课程
│       │   ├── knowledge/      # 知识库
│       │   ├── client-portal/  # 来访者门户
│       │   └── admin/          # 系统管理
│       ├── api/                # API 客户端与 hooks
│       ├── stores/             # 全局状态
│       └── shared/             # 共享组件
├── server/                     # Fastify 后端
│   └── src/
│       ├── app.ts              # 入口与路由注册
│       ├── db/                 # 数据库 schema 与迁移
│       ├── middleware/         # 认证、权限、审计
│       └── modules/            # 业务模块
│           ├── ai/             # AI 管线
│           ├── assessment/     # 测评服务
│           ├── counseling/     # 咨询服务
│           ├── compliance/     # 合规服务
│           ├── group/          # 团体辅导
│           └── course/         # 课程服务
├── packages/shared/            # 共享类型与工具
└── docs/                       # 文档
```

## 权限模型

| 角色 | 说明 |
|------|------|
| `system_admin` | 系统管理员，全平台管理 |
| `org_admin` | 机构管理员，管理本机构 |
| `counselor` | 咨询师，临床操作 |
| `admin_staff` | 行政人员，非临床操作 |
| `client` | 来访者，自助门户 |

## License

Private - All rights reserved.
