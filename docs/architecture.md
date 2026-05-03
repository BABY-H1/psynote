# Psynote Architecture

## System Overview

```mermaid
graph TB
    subgraph Client["Client (React 19 + Vite)"]
        direction TB
        Browser["Browser :5173"]
        subgraph UI["UI Layer"]
            Router["React Router 7"]
            Features["Feature Modules"]
            Shared["Shared Components"]
        end
        subgraph ClientState["State"]
            Zustand["Zustand (Auth/UI)"]
            RQ["React Query (Server State)"]
        end
        ApiClient["API Client (fetch)"]
    end

    subgraph Server["Server (Fastify 5)"]
        direction TB
        subgraph Middleware["Middleware Pipeline"]
            CORS["CORS"]
            RateLimit["Rate Limit"]
            Auth["Auth Guard (JWT)"]
            OrgCtx["Org Context + RLS"]
            RBAC["RBAC"]
            Audit["Audit / PHI Log"]
        end
        subgraph Modules["Business Modules"]
            Assessment["Assessment"]
            Counseling["Counseling"]
            Group["Group Therapy"]
            Course["Course"]
            AI["AI Service"]
            Compliance["Compliance"]
            Notification["Notification"]
            OrgMod["Org Management"]
            ClientPortal["Client Portal"]
            Referral["Referral"]
            FollowUp["Follow-up"]
        end
        Services["Service Layer"]
    end

    subgraph Data["Data Layer"]
        PG[("PostgreSQL\n(Drizzle ORM)\n30+ tables")]
        Redis[("Redis\n(BullMQ)")]
    end

    subgraph External["External Services"]
        LLM["LLM API\n(OpenAI)"]
        Email["Email\n(Nodemailer)"]
    end

    Browser --> Router
    Router --> Features
    Features --> Shared
    Features --> RQ
    RQ --> ApiClient
    Zustand --> ApiClient
    ApiClient -->|"/api/*"| CORS
    CORS --> RateLimit
    RateLimit --> Auth
    Auth --> OrgCtx
    OrgCtx --> RBAC
    RBAC --> Audit
    Audit --> Modules
    Modules --> Services
    Services --> PG
    Services --> Redis
    AI -.->|generate| LLM
    Notification -.->|send| Email

    style Client fill:#e0f2fe,stroke:#0284c7
    style Server fill:#f0fdf4,stroke:#16a34a
    style Data fill:#fef3c7,stroke:#d97706
    style External fill:#fce7f3,stroke:#db2777
```

## Monorepo Structure

```mermaid
graph LR
    subgraph Root["psynote (npm workspaces)"]
        C["client/"]
        S["server/"]
        P["packages/shared/"]
    end
    C -->|imports types| P
    S -->|imports types| P
    C -->|proxy /api| S

    style Root fill:#f8fafc,stroke:#475569
```

## Client Feature Architecture

```mermaid
graph TB
    subgraph App["App.tsx (Router)"]
        Public["Public Routes\n/assess/:id\n/login"]
        Portal["Client Portal\n/portal/*"]
        Shell["Counselor/Admin Shell\n/*"]
    end

    subgraph Features["Feature Modules"]
        direction LR
        subgraph Core["Core Counseling"]
            EP["episodes/\nCaseWorkbench\nEpisodeDetail\nCreateWizard"]
            APT["appointments/\nManagement\nAvailability"]
            NOTE["notes/\nSessionNoteForm\nNoteTemplates"]
        end
        subgraph Assessment["Assessment"]
            SCALE["scales/\nScaleLibrary\nScaleEditor\nAIScaleCreator"]
            ASSESS["assessments/\nManagement\nRunner\nReports"]
        end
        subgraph Extended["Extended"]
            GRP["groups/\nGroupCenter\nSchemes"]
            CRS["courses/\nCourseCenter\nBlueprint\nLessonEditor"]
            KB["knowledge/\nGoalLibrary\nAgreements\nTemplates"]
        end
    end

    subgraph Hooks["API Hooks (React Query)"]
        direction LR
        H1["useCounseling"]
        H2["useAssessments"]
        H3["useGroups"]
        H4["useCourses"]
        H5["useAI"]
        H6["useCompliance"]
    end

    Shell --> Core
    Shell --> Assessment
    Shell --> Extended
    Portal --> Features
    Core --> H1
    Assessment --> H2
    Extended --> H3
    Extended --> H4

    style Core fill:#dbeafe,stroke:#2563eb
    style Assessment fill:#e0e7ff,stroke:#4f46e5
    style Extended fill:#ede9fe,stroke:#7c3aed
```

## Server Module Architecture

```mermaid
graph TB
    subgraph Entry["app.ts"]
        Fastify["Fastify Instance"]
    end

    subgraph MW["Middleware Chain"]
        direction LR
        M1["cors"] --> M2["rate-limit"] --> M3["auth"] --> M4["org-context"] --> M5["rbac"] --> M6["audit"]
    end

    subgraph Domains["Business Domains"]
        subgraph AssessDomain["Assessment Domain"]
            R1["scale.routes"]
            R2["assessment.routes"]
            R3["result.routes"]
            R4["batch.routes"]
            R5["report.routes"]
            R6["distribution.routes"]
        end
        subgraph CounselDomain["Counseling Domain"]
            R7["episode.routes"]
            R8["appointment.routes"]
            R9["availability.routes"]
            R10["session-note.routes"]
            R11["note-template.routes"]
            R12["goal-library.routes"]
            R13["client-profile.routes"]
            R14["treatment-plan.routes"]
        end
        subgraph ExtDomain["Extended Domains"]
            R15["referral.routes"]
            R16["follow-up.routes"]
            R17["ai.routes"]
            R18["scheme/instance/enrollment"]
            R19["course.routes"]
            R20["consent/compliance"]
            R21["notification.routes"]
        end
    end

    subgraph Jobs["Background Jobs (BullMQ)"]
        Q1["Reminder Worker"]
        Q2["Compliance Queue"]
    end

    Fastify --> MW
    MW --> Domains
    Domains --> PG[("PostgreSQL")]
    Jobs --> Redis[("Redis")]
    Jobs --> PG

    style AssessDomain fill:#e0e7ff,stroke:#4f46e5
    style CounselDomain fill:#dbeafe,stroke:#2563eb
    style ExtDomain fill:#ede9fe,stroke:#7c3aed
    style Jobs fill:#fef3c7,stroke:#d97706
```

## Database Schema (Core Tables)

```mermaid
erDiagram
    organizations ||--o{ org_members : has
    organizations ||--o{ client_profiles : has
    organizations ||--o{ scales : owns
    organizations ||--o{ care_episodes : has
    organizations ||--o{ group_schemes : has
    organizations ||--o{ courses : has

    users ||--o{ org_members : joins
    users ||--o{ client_profiles : has

    org_members {
        uuid id PK
        uuid org_id FK
        uuid user_id FK
        text role
        text status
    }

    scales ||--o{ scale_dimensions : contains
    scales ||--o{ scale_items : contains
    scale_dimensions ||--o{ dimension_rules : has

    assessments ||--o{ assessment_results : produces
    assessments ||--o{ assessment_scales : includes
    assessments ||--o{ distributions : shared_via

    care_episodes ||--o{ care_timeline : logs
    care_episodes ||--o{ session_notes : has
    care_episodes ||--o{ treatment_plans : has
    care_episodes }o--|| users : counselor
    care_episodes }o--|| users : client

    care_episodes {
        uuid id PK
        uuid org_id FK
        uuid client_id FK
        uuid counselor_id FK
        text status
        text current_risk
    }

    session_notes ||--o{ note_attachments : has

    group_schemes ||--o{ group_instances : creates
    group_instances ||--o{ group_enrollments : has

    courses ||--o{ course_lessons : contains
    courses ||--o{ course_enrollments : has
    courses ||--o{ course_requirements : needs
```

## Request Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant V as Vite Proxy
    participant F as Fastify
    participant A as Auth Guard
    participant O as Org Context
    participant R as Route Handler
    participant S as Service
    participant DB as PostgreSQL

    B->>V: GET /api/orgs/:orgId/episodes
    V->>F: proxy to :4000
    F->>A: JWT verification
    A->>A: decode token / dev bypass
    A->>O: set request.user
    O->>DB: verify org membership
    O->>DB: SET app.current_org_id (RLS)
    O->>R: request.org = { orgId, role }
    R->>R: validate(schema, request.query)
    R->>S: episodeService.listEpisodes()
    S->>DB: SELECT ... WHERE org_id = ?
    DB-->>S: rows
    S-->>R: episodes[]
    R-->>B: 200 JSON
```

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.8 (strict) |
| Frontend | React 19, React Router 7, Vite 6 |
| State | Zustand (client), React Query (server) |
| Styling | Tailwind CSS 3.4 |
| Backend | Fastify 5 |
| ORM | Drizzle ORM (PostgreSQL) |
| Auth | 自建 JWT (bcrypt + jsonwebtoken) |
| Validation | Zod |
| Jobs | BullMQ (Redis) |
| AI | OpenAI API (configurable) |
| Monorepo | npm workspaces |
