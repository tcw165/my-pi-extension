---
name: stacked-git-workflow
description: Manage stacked PRs and Git workflow using Graphite CLI (gt). Use for creating stacked PRs, submitting code for review, rebasing stacks, navigating branches, syncing with trunk, and dependent/stacked Git changes. Includes recommended workflow patterns.
---

# Stacked Git Workflow with Graphite CLI (gt)

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

## Preferred Workflow Pattern

**Three-step workflow for creating and submitting PRs:**

### Step 1: Stage Changes
```bash
git add <changes>
```

### Step 2: Commit with Graphite
**For a new PR:**
```bash
gt create -m "description of changes"
```

**For changes to an existing PR:**
```bash
gt modify
```

### Step 3: Submit Stack
```bash
gt submit --stack
```

This creates PR(s) on GitHub + Graphite dashboard with the PR URL. Changes are not in trunk (`main`) until the PR is reviewed and merged.

---

## Workflow Scenarios

### Scenario 1: New Feature (Single PR)

```bash
# Make changes
echo "new code" >> src/feature.ts

# Stage and create PR
git add src/feature.ts
gt create -m "add new feature"

# Submit to Graphite/GitHub
gt submit

# PR URL shown in terminal — share for review
# After approval & merge, changes appear in main
```

### Scenario 2: Feature Stack (Multiple Related PRs)

```bash
# Start from trunk
gt checkout main

# Create PR 1: Foundation
echo "base API" >> src/api.ts
git add src/api.ts
gt create -m "add base API endpoint"

# Stack PR 2: Business logic on top
echo "business logic" >> src/logic.ts
git add src/logic.ts
gt create -m "add business logic"

# Stack PR 3: UI on top of PR 2
echo "ui component" >> src/ui.ts
git add src/ui.ts
gt create -m "add UI component"

# Submit entire stack
gt submit --stack

# All three PRs created with dependency chain
# Merge in order: PR1 → PR2 → PR3
```

### Scenario 3: Updating an Existing PR

```bash
# Make changes
echo "bug fix" >> src/feature.ts

# Stage changes
git add src/feature.ts

# Update the current PR (restacks descendants)
gt modify

# Resubmit if needed
gt submit
```

### Scenario 4: Reviewing & Merging

```bash
# View your stacks
gt log

# Open PR in browser for review
gt pr

# After approval on GitHub, merge via Graphite or GitHub UI
# Then sync locally
gt sync

# Cleanup: gt sync removes merged branches automatically
```

---

## Typical Full Workflow

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
