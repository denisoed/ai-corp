# Command Execution in Docker

AI Corp runs agent shell commands through a workspace-scoped Docker sandbox.

## Goals

- keep the user experience unchanged
- prevent agents from touching the host machine
- allow real project commands such as `npm run dev`, `npm test`, `git status`, or build scripts
- preserve auditability and approvals for risky actions

## Execution Model

Each command is run with:

- the workspace folder mounted into the container
- a non-root container user
- no extra Linux capabilities
- `no-new-privileges`
- CPU, memory, and PID limits
- policy-based network control

Commands are never executed directly on the host through `child_process` or a local shell.

## Permissions

- `system:run_commands` allows an agent to request command execution
- `system:approve_commands` allows an agent to approve pending command runs

## Approval Rules

Commands may require approval when they:

- access the network
- modify Git state
- perform destructive operations

Approval is recorded in the existing approvals workflow and resolved from the same UI path as other approvals.

## Workspace Settings

The command-execution settings live under the workspace settings object:

- `enabled`
- `dockerImage`
- `allowNetwork`
- `allowDestructiveCommands`
- `allowGitWrite`
- `timeoutMs`
- `cpuLimit`
- `memoryLimitMb`
- `pidsLimit`

## Operational Notes

- Docker must be installed and running on the host that runs the backend.
- The backend checks Docker availability before launching a command.
- Command runs are stored in the persistent store under `commandRuns`.
- Detached commands are supported for long-running processes like dev servers.

## Recommended Default Profile

- image: `node:20-bookworm-slim`
- CPU limit: `2`
- memory limit: `4096 MB`
- PID limit: `512`
- network: disabled unless policy allows it
- user: non-root
