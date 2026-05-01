<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# AI Corp

AI Agent Company Dashboard for orchestrating workspace-scoped agents, tasks, roles, Telegram bots, and cron jobs.

## Quick Start

**Prerequisites**
- Node.js
- Docker Desktop or Docker Engine

1. Install dependencies:
   `npm install`
2. Start the frontend:
   `npm run dev`
3. Start the backend:
   `npm run dev:server`

The app uses:
- frontend dev server on `http://localhost:3001`
- backend API on `http://localhost:4000`

## Workspace Command Execution

Agents can execute shell commands inside a Docker sandbox that is scoped to their workspace.

### What changed
- Agents can call the `run_command` tool.
- Commands run in Docker, not on the host machine.
- Each command is mounted to the workspace folder only.
- Dangerous or networked commands can require approval.

### Default safety model
- non-root container user
- no Linux capabilities
- `no-new-privileges`
- resource limits for CPU, memory, and process count
- workspace-only filesystem mount
- approval flow for risky commands

### Permissions
Two new permissions were added:
- `system:run_commands`
- `system:approve_commands`

Grant them from the Roles and Agents screens if you want agents to run commands or approve pending runs.

## Workspace Settings

Each workspace can define command-execution settings:
- enable or disable command execution
- choose a Docker image
- set timeout, CPU, memory, and PID limits
- allow or disallow network access
- allow or disallow destructive commands
- allow or disallow Git write operations

## First-Time Setup

The first time you use command execution:
- make sure Docker is running
- open or create a workspace with a valid `folderPath`
- let the system create the command sandbox automatically

If Docker is unavailable, command execution returns a clear error and does not affect the rest of the app.

## Development

```bash
npm run dev
npm run dev:server
npm run lint
npm test
```

## Notes

- User-facing workflows remain the same.
- Docker is an internal execution layer and is not exposed in the normal UI flow.
- Initial setup requires Docker to be installed on the machine that runs the backend.
