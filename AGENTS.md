# AGENTS.md

## Project Overview

**AI Agent Company Dashboard** (AI Corp / Orchestra AI) — платформа оркестрации AI-агентов, которая позволяет создавать виртуальные «компании» из AI-агентов с разными ролями, управлять задачами через Kanban-доску, настраивать меж-агентское взаимодействие и подключать агентов к Telegram.

### Ключевые возможности
- Создание **Workspace** (рабочих пространств) с агентами, задачами и ролями
- **AI-агенты** с ролями (Manager, Developer, Analyst, Reviewer, Designer, DevOps, Research), навыками и personalities (SOUL.md, IDENTITY.md, ROLE.md)
- **Kanban-доска** задач (Backlog → Planned → In Progress → Review → Needs Approval → Done)
- **Inter-agent messaging**: send_message, ask_agent, reply_to_message
- **Telegram-боты**: каждый агент может иметь своего Telegram-бота для общения с пользователем
- **Cron-задачи**: периодическое выполнение задач агентами по расписанию
- **Role-based permissions**: file:read/write/delete/list, system:manage_agents/roles/crons/broadcast
- **Company templates**: преднастроенные команды (Software Dev Team, Marketing Agency, Data Science Team)
- **Инициализация из .aicorp.yml**: workspace можно создать из YAML-файла в корне проекта

---

## Tech Stack

### Backend
- **Runtime**: Node.js (TypeScript 5.8, ESM)
- **Server**: Express.js 4 (port 4000)
- **Cron**: node-cron
- **YAML**: js-yaml
- **AI Integration**: OpenCode API (OpenAI-совместимый function-calling)
- **Persistence**: JSON-файлы в `~/.aicorp/` (settings.json + workspaces/*.json)

### Frontend
- **Framework**: React 19 + React Router 7
- **State**: Zustand 5
- **Graph visualization**: @xyflow/react (ReactFlow) + D3.js
- **Styling**: Tailwind CSS v4
- **UI**: Radix UI primitives, Lucide React icons, motion animations
- **Markdown**: marked

### Build
- **Bundler**: Vite 6 (dev server port 3001, proxy /api → :4000)
- **TS runner (server)**: tsx (watch mode)

### Testing
- **Framework**: Vitest 4
- Тесты: `tests/` directory, зеркалит структуру `src/`
- Запуск: `npm test` (однократно), `npm run test:watch` (watch mode)
- Тестировать в первую очередь чистые утилиты (lib/glob.ts, lib/telegram-formatter.ts)
- Инструменты агентов тестировать с инжектируемым store

---

## Project Structure

```
/
├── src/
│   ├── main.tsx                 # React entry point
│   ├── App.tsx                  # Root component (routing + state sync)
│   ├── index.css                # Global styles (Tailwind + markdown)
│   ├── store.ts                 # Client-side Zustand store
│   ├── types.ts                 # Все TypeScript-типы
│   │
│   ├── lib/                     # Shared utilities
│   │   ├── utils.ts             # cn() utility (clsx + tailwind-merge)
│   │   ├── markdown.ts          # Markdown helpers
│   │   ├── templates.ts         # Company templates
│   │   └── telegramAdapter.ts   # Client-side Telegram hook
│   │
│   ├── server/                  # Backend code
│   │   ├── index.ts             # Express server entry
│   │   ├── api.ts               # REST API route aggregator
│   │   ├── store.ts             # Server-side persistent store
│   │   ├── telegram.ts          # Telegram bot lifecycle + handleAskAgent orchestrator
│   │   ├── opencode.ts          # OpenCode API client (OpenCodeChatSession)
│   │   ├── cron.ts              # Cron job manager
│   │   ├── agent-memory.ts      # Agent memory system
│   │   ├── workspace-guard.ts   # Workspace security
│   │   │
│   │   ├── lib/                 # Server-side utilities
│   │   │   ├── glob.ts          # Glob pattern matching (permissions)
│   │   │   ├── telegram-formatter.ts  # Markdown → Telegram HTML conversion
│   │   │   └── tool-definitions.ts    # OpenAI function-calling tool schemas
│   │   │
│   │   ├── routes/              # REST API route modules
│   │   │   ├── state.ts         # GET /state, POST /logs
│   │   │   ├── agents.ts        # Agent CRUD + memory + personality + role assignment
│   │   │   ├── workspaces.ts    # Workspace CRUD + folders + init from .aicorp.yml + templates
│   │   │   ├── tasks.ts         # Task CRUD + comments + approvals
│   │   │   ├── roles.ts         # Role CRUD
│   │   │   └── crons.ts         # Cron job CRUD
│   │   │
│   │   └── tools/               # Agent tool implementations (by domain)
│   │       ├── index.ts         # executeTool dispatcher
│   │       ├── agent.ts         # create_agent, update_agent, delete_agent, ...
│   │       ├── task.ts          # create_task, move_task, search_tasks, generate_report, ...
│   │       ├── messaging.ts     # send_message, reply_to_message, send_broadcast, ...
│   │       ├── connection.ts    # add_connection, resolve_approval, ...
│   │       ├── file.ts          # read_file, write_file, delete_file, list_files
│   │       ├── role.ts          # create_role, assign_role, grant_permission_to_role, ...
│   │       └── cron.ts          # create_cron, list_crons, delete_cron, ...
│   │
│   └── components/              # React components
│       ├── layout/Layout.tsx
│       ├── views/               # Page views
│       │   ├── Dashboard.tsx
│       │   ├── WorkspacesList.tsx
│       │   ├── TaskBoard.tsx
│       │   ├── TaskDetail.tsx
│       │   ├── ActivityLogs.tsx
│       │   ├── RolesManagement.tsx
│       │   ├── CronJobs.tsx
│       │   ├── AgentNode.tsx
│       │   └── ParallelBezierEdge.tsx
│       ├── chat/                # Chat components
│       │   ├── ChatFAB.tsx
│       │   ├── ChatPanel.tsx
│       │   ├── ChatListView.tsx
│       │   ├── ChatConversation.tsx
│       │   └── MessageBubble.tsx
│       └── ui/                  # Reusable UI primitives
│           ├── Button.tsx
│           ├── Card.tsx
│           ├── Badge.tsx
│           ├── Input.tsx
│           ├── CustomSelect.tsx
│           ├── MultiSelect.tsx
│           ├── Tabs.tsx
│           └── FolderPicker.tsx
├── tests/                       # Test files (mirrors src/ structure)
│   └── server/
│       └── lib/
│           ├── glob.test.ts
│           └── telegram-formatter.test.ts
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
└── index.html
```

---

## Coding Rules & Principles

### Обязательные принципы

#### 1. DRY (Don't Repeat Yourself)
- Не дублируй код. Если один и тот же код встречается в двух местах — выноси в отдельную функцию/модуль.
- Общие утилиты (форматирование дат, валидация, slug-генерация) — в `src/lib/` или `src/server/lib/`.

#### 2. KISS (Keep It Simple, Stupid)
- Пиши простой, понятный код. Не усложняй архитектуру без необходимости.
- Одна функция — одна ответственность. Если функция делает «и то и это» — разбей на две.
- Избегай преждевременной оптимизации.

#### 3. YAGNI (You Aren't Gonna Need It)
- Не добавляй фичи/абстракции «на будущее». Только то, что нужно сейчас.
- Не создавай интерфейсы/абстракции, пока не появится минимум 2 реализации.

#### 4. Модульность
- Файл не должен превышать ~500 строк (кроме auto-generated кода). Если больше — разбивай на модули.
- Серверные модули разбиваются по доменной ответственности:
  - `src/server/tools/` — реализации инструментов агентов (по одному файлу на инструмент или группу)
  - `src/server/routes/` — REST API route handlers (agents, workspaces, tasks, roles, crons)
  - `src/server/lib/` — общие утилиты сервера
- Клиентские компоненты разбиваются по функциональности:
  - Большие view (>300 строк) — выноси подкомпоненты в отдельные файлы
  - UI-компоненты — только презентационные, без бизнес-логики

#### 5. Функции должны быть тестируемы
- Функция не должна иметь побочных эффектов (side effects), если это возможно.
- Чистые функции — предпочтительны. Ввод через аргументы, вывод через return.
- Инжектируй зависимости (API-клиенты, базу данных) через параметры, а не через глобальные переменные.
- Избегай прямых вызовов `process.env` внутри функций — пробрасывай конфигурацию через параметры.

### Общие правила

- **TypeScript strict mode**: типы должны быть полными, избегай `any`. Если тип неизвестен — используй `unknown`.
- **Именование**:
  - Файлы: kebab-case (`agent-memory.ts`, `task-board.tsx`)
  - Функции: camelCase, глагол + существительное (`createAgent`, `findTaskByTitle`)
  - Типы/интерфейсы: PascalCase (`Agent`, `TaskStatus`)
  - Константы: UPPER_SNAKE_CASE (`MAX_RECENT_MESSAGES`)
- **Обработка ошибок**: всегда явно обрабатывай ошибки. Используй try/catch с конкретными типами ошибок.
- **Логирование**: используй префиксы `[ModuleName]` для всех логов.
- **API-роуты**: один файл на ресурс (agents.ts, tasks.ts и т.д.), не пиши все роуты в одном файле.
- **Документация**: документируй публичные функции через JSDoc.
- **Секреты**: НИКОГДА не коммить .env файлы или секреты. Используй .env.example.

### Коммиты
- Коммиты на английском, в формате: `<type>: <message>` (feat:, fix:, refactor:, test:, docs:, chore:)
- Один коммит — одна логическая единица изменений.

### Перед PR
- `npm run lint` (type-check) должен проходить без ошибок
- Все изменения должны быть проверены ручным запуском `npm run dev` и `npm run dev:server`

---

## Development Commands

```bash
# Development
npm run dev          # Frontend dev server (port 3001)
npm run dev:server   # Backend dev server with watch (port 4000)

# Production
npm run build        # Build frontend
npm run server       # Start production server

# Quality
npm run lint         # TypeScript type-checking
npm test             # Run tests once
npm run test:watch   # Run tests in watch mode
```
