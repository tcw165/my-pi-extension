---
name: graphite
description: Manage stacked PRs and branches using the Graphite CLI (gt). Use when the user asks about creating stacked PRs, submitting code for review, rebasing stacks, navigating branches, syncing with trunk, or any Git workflow involving dependent/stacked changes.
---

# Graphite CLI (gt)

Graphite simplifies stacked PR workflows on GitHub. Each branch in a stack builds on top of the previous one, keeping changes small, focused, and reviewable.

## Key Concepts

- **Stack**: A sequence of PRs, each building off its parent. e.g. `main ← PR1 ← PR2 ← PR3`
- **Trunk**: The base branch stacks merge into (usually `main`)
- **Downstack**: PRs below the current one (ancestors)
- **Upstack**: PRs above the current one (descendants)

## Setup

```bash
gt init                    # Initialize Graphite in a repo (select trunk branch)
gt auth --token <token>    # Authenticate (get token from https://app.graphite.dev/settings/cli)
```

## Creating & Stacking Changes

```bash
# Create a new branch with staged changes (stacks on current branch)
gt create -m "description of changes"

# Amend current branch with new changes and restack descendants
gt modify

# Absorb staged changes into the relevant commits in the stack
gt absorb
```

## Submitting PRs

```bash
# Submit current branch + all downstack branches
gt submit

# Submit the entire current stack
gt submit --stack
```

## Syncing & Rebasing

```bash
# Sync trunk from remote, rebase all stacks, clean up merged branches
gt sync

# Restack all branches in the current stack (fix parent history)
gt restack
```

## Navigating Stacks

```bash
gt up [steps]              # Move to child branch
gt down [steps]            # Move to parent branch
gt top                     # Jump to tip of current stack
gt bottom                  # Jump to branch closest to trunk
gt checkout [branch]       # Interactive branch selector (or specify branch)
gt log                     # Visual graph of current stack
gt log short               # Compact view
gt log long                # Detailed view
```

## Branch Management

```bash
gt delete [name]           # Delete branch, restack children onto parent
gt rename [name]           # Rename branch and update metadata
gt fold                    # Fold branch's changes into its parent
gt split                   # Split current branch into multiple branches
gt squash                  # Squash all commits in branch into one
gt track [branch]          # Start tracking an existing branch with Graphite
gt untrack [branch]        # Stop tracking a branch
gt move                    # Rebase current branch onto a different target
gt reorder                 # Interactively reorder branches in the stack
gt pop                     # Delete current branch but keep working tree changes
gt undo                    # Undo the most recent Graphite mutation
```

## Freezing (Exclude from Submit)

```bash
gt freeze [branch]         # Freeze branch + downstack (excluded from submit)
gt unfreeze [branch]       # Unfreeze branch + upstack
```

## Conflict Resolution

```bash
gt continue                # Continue after resolving a rebase conflict
gt abort                   # Abort the current rebase
```

## Branch Info

```bash
gt info [branch]           # Display info about current/specified branch
gt parent                  # Show parent branch
gt children                # Show child branches
gt trunk                   # Show trunk branch
```

## GitHub / Graphite Web

```bash
gt pr [branch]             # Open PR page in browser
gt dash                    # Open Graphite dashboard
gt merge                   # Merge PRs from trunk to current branch via Graphite
gt get [branch]            # Sync a branch/PR from remote
```

## Common Aliases

| Alias | Command |
|-------|---------|
| `gt c` | `gt create` |
| `gt m` | `gt modify` |
| `gt s` | `gt submit` |
| `gt u` | `gt up` |
| `gt d` | `gt down` |
| `gt t` | `gt top` |
| `gt b` | `gt bottom` |
| `gt l` | `gt log` |
| `gt r` | `gt restack` |
| `gt co` | `gt checkout` |
| `gt sq` | `gt squash` |
| `gt sp` | `gt split` |
| `gt ab` | `gt absorb` |
| `gt dl` | `gt delete` |
| `gt rn` | `gt rename` |
| `gt tr` | `gt track` |

## Typical Workflow

```bash
# 1. Start from trunk
gt checkout main

# 2. Create first branch in the stack
gt create -m "add API endpoint"

# 3. Stack another change on top
gt create -m "add frontend for API"

# 4. Stack docs on top
gt create -m "add API docs"

# 5. Submit the whole stack as linked PRs
gt submit --stack

# 6. After review feedback, go to the branch that needs changes
gt checkout "add API endpoint"
# Make changes...
gt modify

# 7. Sync with latest trunk and clean up
gt sync
```

## Tips

- Always use `gt sync` before starting new work to stay up to date
- Use `gt log` frequently to visualize your stack
- Prefer small, focused branches — that's the whole point of stacking
- Use `gt modify` (not `git commit --amend`) to ensure descendants are restacked
- Use `gt submit --stack` to push everything at once
- If a rebase conflicts, resolve and run `gt continue`
- Use `gt undo` if something goes wrong
