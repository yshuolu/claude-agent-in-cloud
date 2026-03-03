---
name: manage-task
description: Pick a todo task from the task board, implement it, verify the result, push code, wait for CI to pass, then close the task. Use when you want the agent to autonomously work through the next available task.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# Do Task

Pick a task from the board and drive it to completion.

## 1. Pick a task

- Call `list_tasks` with status `todo` to see available work.
- Choose the highest-priority task (urgent > high > medium > low). If priorities are equal, pick the oldest.
- Call `update_task` to set its status to `in_progress`.

## 2. Do the work

- Read the task title and description carefully to understand requirements.
- Implement the solution. For coding tasks: write code, create/edit files as needed.
- For non-coding tasks: perform the requested action and document what you did.

## 3. Verify the result

- For coding tasks: run the project's test suite, linter, and type checker. Fix any failures before proceeding.
- For non-coding tasks: verify the outcome matches the task requirements.
- If verification fails, fix the issues and re-verify. Do not proceed until everything passes.

## 4. Push (coding tasks only)

- Create a branch if not already on one: `git checkout -b task/<id>`
- Stage and commit changes with a message referencing the task: `[task:<id>] <summary>`
- Push the branch to the remote repository.
- Open a PR linking back to the task.

## 5. Wait for CI

- After pushing, check CI status: `gh run list --branch <branch> --limit 5`
- Poll until the run completes. If CI fails:
  1. Read the logs: `gh run view <run-id> --log-failed`
  2. Fix the failing issue.
  3. Commit, push, and re-check. Repeat until CI passes.
- If the task is non-coding or there is no CI configured, skip this step.

## 6. Close the task

- Once everything passes (tests, lint, typecheck, CI), call `update_task` to set status to `done`.
- If you opened a PR, update the task description with the PR URL.

## Handling blockers

- If you get stuck or encounter a blocker you cannot resolve, update the task description with what you found, set status back to `todo`, and explain the blocker to the user.
- Do NOT mark a task as done unless all verification steps pass.
