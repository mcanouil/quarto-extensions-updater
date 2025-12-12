# Quarto Extensions Updater

A GitHub Action that automatically updates Quarto extensions in your repository, similar to how Dependabot manages dependencies.

## Features

- 🔍 Automatically checks for Quarto extension updates.
- 📦 Updates extensions using Quarto CLI (`quarto add`).
- 🔄 Maintains `source` field in extension manifests for tracking.
- 📝 Creates detailed pull requests with release notes.
- 🔀 **One PR per extension** — each extension gets its own PR that updates when new versions are available (or group all updates into a single PR).
- 🏷️ Categorises updates by type (major, minor, patch).
- 🤖 Dependabot-style PR descriptions.
- 🚀 **Auto-merge support** — enable automatic merging of PRs based on configurable rules (*e.g.*, patch updates only).
- 🎯 **Selective updates** — include or exclude specific extensions from updates.
- 📦 **Grouped updates** — option to combine all extension updates into a single PR.
- 🛡️ **Update strategy** — control which types of updates to apply (all, minor, patch).
- 🧪 **Dry-run mode** — preview updates and test configuration without making changes.
- 👥 **PR reviewers and assignees** — automatically request reviewers and assign team members to PRs.
- ⚡ Runs on a schedule or manually.
- ⚙️ Highly customisable branch names, commit messages, and PR titles.

## Usage

### Basic Setup

Create a workflow file (*e.g.*, `.github/workflows/update-extensions.yml`):

```yaml
name: Update Quarto Extensions

on:
  schedule:
    - cron: "0 0 * * *"  # Daily at midnight UTC
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Setup Quarto
        uses: quarto-dev/quarto-actions/setup@v2

      - uses: mcanouil/quarto-extensions-updater@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Advanced Configuration

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    workspace-path: "."
    registry-url: "https://raw.githubusercontent.com/mcanouil/quarto-extensions/refs/heads/quarto-wizard/quarto-extensions.json"
    create-pr: true
    branch-prefix: "chore/quarto-extensions"
    base-branch: "main"
    pr-title-prefix: "chore(deps):"
    commit-message-prefix: "chore(deps):"
    pr-labels: "dependencies,quarto-extensions"
    auto-merge: true
    auto-merge-strategy: "patch"
    auto-merge-method: "squash"
```

## Inputs

| Input                   | Description                                                                               | Required | Default                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `github-token`          | GitHub token for creating pull requests                                                   | Yes      | `${{ github.token }}`                                                   |
| `workspace-path`        | Path to the workspace containing `_extensions` directory                                  | No       | `.`                                                                     |
| `registry-url`          | URL to the Quarto extensions registry JSON file                                           | No       | [quarto-extensions directory](https://m.canouil.dev/quarto-extensions/) |
| `create-pr`             | Whether to create a pull request for updates                                              | No       | `true`                                                                  |
| `branch-prefix`         | Prefix for the update branch name                                                         | No       | `chore/quarto-extensions`                                               |
| `base-branch`           | Base branch to create pull requests against                                               | No       | `main`                                                                  |
| `pr-title-prefix`       | Prefix for PR titles                                                                      | No       | `chore(deps):`                                                          |
| `commit-message-prefix` | Prefix for commit messages                                                                | No       | `chore(deps):`                                                          |
| `pr-labels`             | Comma-separated list of labels to add to PRs                                              | No       | `dependencies,quarto-extensions`                                        |
| `auto-merge`            | Enable automatic merging of PRs based on `auto-merge-strategy`                            | No       | `false`                                                                 |
| `auto-merge-strategy`   | Auto-merge strategy: `patch` (patch only), `minor` (minor and patch), `all` (all)         | No       | `patch`                                                                 |
| `auto-merge-method`     | Merge method to use: `merge`, `squash`, or `rebase`                                       | No       | `squash`                                                                |
| `include-extensions`    | Comma-separated list of extensions to include (*e.g.*, `owner/name1,owner/name2`)         | No       | *(all)*                                                                 |
| `exclude-extensions`    | Comma-separated list of extensions to exclude (*e.g.*, `owner/name1,owner/name2`)         | No       | *(none)*                                                                |
| `group-updates`         | Group all extension updates into a single PR instead of one PR per extension              | No       | `false`                                                                 |
| `update-strategy`       | Control which types of updates to apply: `all`, `minor` (minor and patch), `patch`        | No       | `all`                                                                   |
| `dry-run`               | Run in dry-run mode: check for updates and report without making changes                  | No       | `false`                                                                 |
| `create-issue`          | In dry-run mode, create a GitHub issue with the update summary                            | No       | `false`                                                                 |
| `pr-reviewers`          | Comma-separated list of GitHub usernames to request as reviewers (*e.g.*, `user1,user2`)  | No       | *(none)*                                                                |
| `pr-team-reviewers`     | Comma-separated list of GitHub team slugs to request as reviewers (*e.g.*, `team1,team2`) | No       | *(none)*                                                                |
| `pr-assignees`          | Comma-separated list of GitHub usernames to assign to PRs (*e.g.*, `user1,user2`)         | No       | *(none)*                                                                |

## Outputs

| Output              | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `updates-available` | Whether updates are available (`true`/`false`)              |
| `update-count`      | Number of updates available                                 |
| `updates`           | JSON array of updates (name, currentVersion, latestVersion) |
| `pr-number`         | Pull request number (if created)                            |
| `pr-url`            | Pull request URL (if created)                               |
| `issue-number`      | Issue number (if created in dry-run mode)                   |
| `issue-url`         | Issue URL (if created in dry-run mode)                      |

## How It Works

1. **Fetch Registry**: Downloads the Quarto extensions registry from GitHub.
2. **Scan Extensions**: Finds all installed extensions in `_extensions/`.
3. **Check Versions**: Compares installed versions with registry using semantic versioning.
4. **Process Each Extension**: Each extension is processed individually to create separate PRs.
5. **Apply Updates**: Uses Quarto CLI (`quarto add owner/repo@version --no-prompt`) to update extensions.
6. **Track Updates**: Maintains `source` field in extension manifests for future update tracking.
7. **Create/Update PR**:
   - Creates a new PR if none exists for this extension.
   - Updates the existing PR if one already exists (same branch name).
   - Ensures **one PR per extension** at most.

## Requirements

This action requires:

- Quarto CLI installed in the workflow environment.
- Use `quarto-dev/quarto-actions/setup@v2` to install Quarto in GitHub Actions.

## Extension Registry

This action uses the Quarto extensions registry maintained at:

- **Repository**: [mcanouil/quarto-extensions](https://github.com/mcanouil/quarto-extensions)
- **Branch**: `quarto-wizard`
- **File**: `quarto-extensions.json`

The registry contains metadata about Quarto extensions, including:

- Latest release versions.
- Release URLs.
- Repository information.
- Descriptions.

## Extension Manifest Format

Extensions should have a manifest file (`_extension.yml` or `_extension.yaml`) with the following structure:

```yaml
title: "My Extension"
author: "Your Name"
version: "1.0.0"
contributes:
  ...
source: "owner/repo@v1.0.0"
```

The action will automatically add or update the `source` field to track extension origins.

## Pull Request Format

The action creates pull requests with the following details:

- **Title**: Clear description of the update(s).
- **Labels**: `dependencies`, `quarto-extensions`, and update type labels.
- **Body**:
  - Updates grouped by type (major, minor, patch).
  - Links to release notes.
  - Repository information.
  - Descriptions of changes.

Example PR body:

```markdown
Updates the following Quarto extension(s):

## 🐛 Patch Updates

- **[mcanouil/iconify](https://github.com/mcanouil/quarto-iconify)**: `3.0.0` → `3.0.2`

---

### Release Notes

<details>
<summary>Release 3.0.2</summary>

> ## What's Changed
> * refactor: use module and enhance iconify extension by @mcanouil in https://github.com/mcanouil/quarto-iconify/pull/46
> * ci: bump version for release :rocket: by @github-actions[bot] in https://github.com/mcanouil/quarto-iconify/pull/47
> 
> 
> **Full Changelog**: https://github.com/mcanouil/quarto-iconify/compare/3.0.1...3.0.2

</details>

**About**: Use Iconify icons in HTML-based Quarto documents (over 200,000 open source vector icons).

**Links**: [Repository](https://github.com/mcanouil/quarto-iconify) · [Release](https://github.com/mcanouil/quarto-iconify/releases/tag/3.0.2)

---

🤖 This PR was automatically generated by [quarto-extensions-updater](https://github.com/mcanouil/quarto-extensions-updater)
```

## Auto-Merge

The action supports enabling automatic merging of PRs based on the update type.

### How Auto-Merge Works

When enabled, the action will automatically enable GitHub's auto-merge feature on PRs that match your configured strategy.
PRs will be merged automatically once all required status checks pass and branch protection rules are satisfied.

> [!IMPORTANT]
> Auto-merge requires at least one required status check or branch protection rule to be configured on the base branch. Without this, GitHub will not allow auto-merge to be enabled.

### Auto-Merge Strategies

- **`patch`** (default): Only auto-merge patch updates (*e.g.*, 1.0.0 to 1.0.1).
- **`minor`**: Auto-merge minor and patch updates (*e.g.*, 1.0.0 to 1.1.0 or 1.0.1).
- **`all`**: Auto-merge all updates including major versions.

### Auto-Merge Methods

- **`squash`** (default): Squash all commits into one.
- **`merge`**: Create a merge commit.
- **`rebase`**: Rebase and merge.

### Required Permissions

To use auto-merge, your workflow must have write permissions for pull requests.
Add this to your workflow file:

```yaml
permissions:
  contents: write
  pull-requests: write
```

### Example: Auto-Merge Patch Updates

```yaml
name: Update Quarto Extensions

on:
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Setup Quarto
        uses: quarto-dev/quarto-actions/setup@v2

      - uses: mcanouil/quarto-extensions-updater@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          auto-merge: true
          auto-merge-strategy: "patch"
          auto-merge-method: "squash"
```

### Example: Auto-Merge Minor and Patch Updates

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    auto-merge: true
    auto-merge-strategy: "minor"
```

### Important Notes

- The PR will only merge automatically after all required status checks pass.
- If auto-merge fails (*e.g.*, due to permission issues or missing status checks), the PR will still be created but will not auto-merge.
- The action logs a warning if auto-merge fails but continues normal operation.

## Grouped Updates

By default, the action creates one PR per extension for granular control.
However, you can group all updates into a single PR if you prefer fewer PRs.

### Enable Grouped Updates

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    group-updates: true
```

When `group-updates` is enabled:

- All extension updates are combined into a single PR.
- The PR title reflects the total number of extensions being updated.
- The PR body lists all updates grouped by type (major, minor, patch).
- Auto-merge will only be enabled if all extensions in the group qualify based on your auto-merge strategy.

## Update Strategy

Control which types of updates are applied based on semantic versioning.

### Available Strategies

- **`all`** (default): Apply all updates regardless of type (major, minor, patch).
- **`minor`**: Only apply minor and patch updates; skip major breaking changes.
- **`patch`**: Only apply patch updates; skip minor and major changes.

### Examples

**Only apply safe patch updates:**

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    update-strategy: "patch"
```

**Avoid breaking changes (no major updates):**

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    update-strategy: "minor"
```

### Combining with Auto-Merge

Update strategy works independently from auto-merge strategy:

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    update-strategy: "minor"      # Only check for minor and patch updates
    auto-merge: true
    auto-merge-strategy: "patch"  # Auto-merge only patch updates
```

In this configuration:

- Only minor and patch updates are detected (major updates are skipped entirely).
- Of those updates, only patch updates are auto-merged.
- Minor updates create PRs that require manual review.

## Selective Extension Updates

You can control which extensions are updated using include and exclude lists.

### Include Only Specific Extensions

To update only certain extensions, use the `include-extensions` input:

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    include-extensions: "mcanouil/iconify,quarto-ext/lightbox"
```

This will only check for updates and create PRs for the specified extensions.
All other extensions will be ignored.

### Exclude Specific Extensions

To exclude certain extensions from updates (*e.g.*, to pin a specific version), use the `exclude-extensions` input:

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    exclude-extensions: "quarto-ext/fancy-text,owner/unstable-extension"
```

This will check all extensions except the specified ones.

### Combining Include and Exclude

You can combine both filters.
If an extension appears in both lists, the exclude filter takes precedence:

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    include-extensions: "mcanouil/iconify,quarto-ext/lightbox,quarto-ext/fancy-text"
    exclude-extensions: "quarto-ext/fancy-text"
```

In this example, only `mcanouil/iconify` and `quarto-ext/lightbox` will be updated.

## Dry-Run Mode

Test your configuration and see what updates would be applied without actually creating PRs or making changes.

### Enable Dry-Run Mode

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    dry-run: true
```

### What Dry-Run Does

When `dry-run` is enabled:

- Checks for available updates normally.
- Reports all configuration settings (update strategy, filters, grouping, auto-merge).
- Shows exactly which PRs would be created.
- Indicates which updates would be auto-merged.
- **No PRs are created.**
- **No changes are made to your repository.**

### Creating Issues in Dry-Run Mode

Optionally create a GitHub issue with the update summary when running in dry-run mode:

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    dry-run: true
    create-issue: true
```

When `create-issue` is enabled in dry-run mode:

- A GitHub issue is created with the update summary.
- The issue includes all configuration settings and available updates.
- Issue number and URL are available as outputs (`issue-number`, `issue-url`).
- Useful for tracking updates without creating PRs immediately.

### Example Output

The dry-run mode generates a GitHub Actions Job Summary with the following sections:

- **Dry-Run Summary**: Notification that no PRs will be created.
- **Configuration**: Table showing mode, update strategy, filters, and auto-merge settings.
- **Planned Actions**: Number of PRs that would be created.
- **Updates Table**: List of all updates with current version, latest version, and auto-merge status.
- **Next Steps**: Instructions to remove `dry-run: true` to apply updates.

## PR Reviewers and Assignees

Configure automatic reviewer requests and assignees for created pull requests to support team workflows.

### Configuration Options

- **`pr-reviewers`**: Individual GitHub users to request as reviewers.
- **`pr-team-reviewers`**: GitHub team slugs to request as reviewers (requires organisation membership).
- **`pr-assignees`**: GitHub users to assign to the PR.

### Request Individual Reviewers

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    pr-reviewers: "user1,user2"
```

### Request Team Reviewers

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    pr-team-reviewers: "frontend-team,backend-team"
```

### Assign PRs and Request Reviewers

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    pr-reviewers: "team-lead"
    pr-assignees: "dependency-manager"
```

### Combined Team Workflow

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    pr-reviewers: "user1,user2"
    pr-team-reviewers: "platform-team"
    pr-assignees: "dependency-manager,team-lead"
    auto-merge: true
    auto-merge-strategy: "patch"
```

In this configuration:

- Individual reviewers `user1` and `user2` are requested.
- The `platform-team` is also requested for review.
- The PR is assigned to `dependency-manager` and `team-lead`.
- Patch updates are automatically merged (after review approval if branch protection requires it).

### Notes

- **Team reviewers** require the repository to be part of an organisation and the team to have access to the repository.
- **Permissions**: The GitHub token must have appropriate permissions to request reviewers and add assignees.
- **Branch protection**: If branch protection rules require review approval, auto-merge will wait for the required approvals.
- **Failed requests**: If reviewer/assignee requests fail (*e.g.*, due to permissions), a warning is logged but the PR creation will still succeed.

## Examples

### Test Configuration with Dry-Run

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    update-strategy: "minor"
    exclude-extensions: "owner/unstable-ext"
    dry-run: true
```

### Check for Updates Without Creating PR

```yaml
- name: Check for updates
  id: check
  uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    create-pr: false

- name: Display results
  run: |
    echo "Updates available: ${{ steps.check.outputs.updates-available }}"
    echo "Number of updates: ${{ steps.check.outputs.update-count }}"
```

### Custom Registry

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    registry-url: "https://example.com/custom-registry.json"
```

### Different Schedule

**Weekly schedule:**

```yaml
on:
  schedule:
    - cron: "0 0 * * 0"  # Weekly on Sunday
```

**Monthly schedule:**

```yaml
on:
  schedule:
    - cron: "0 0 1 * *"  # Monthly on 1st day
```

### Custom Branch Naming and PR Format

Use conventional commits style with custom labels:

```yaml
- uses: mcanouil/quarto-extensions-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    branch-prefix: "deps/quarto"
    pr-title-prefix: "build(deps):"
    commit-message-prefix: "build(deps):"
    pr-labels: "dependencies,quarto,automated,low-priority"
```

This will create PRs with:

- **Branch**: `deps/quarto/update-owner-name`
- **Title**: `build(deps): update owner/name extension to 1.2.3`
- **Labels**: `dependencies`, `quarto`, `automated`, `low-priority`

## Troubleshooting

### No Extensions Found

Ensure your extensions are in `_extensions/owner/name/` structure with `_extension.yml` or `_extension.yaml` files.

### No Updates Detected

- Verify extensions are in the registry: <https://m.canouil.dev/quarto-extensions/>.
- Check version fields exist in manifests.
- Ensure versions follow semantic versioning (X.Y.Z).

### PR Not Created

- Verify workflow has `contents: write` and `pull-requests: write` permissions.
- Check GitHub Actions logs for errors.
- Ensure no existing PR with same branch name.

## Related Projects

- [Quarto Wizard](https://github.com/mcanouil/quarto-wizard) - VSCode extension for managing Quarto extensions.
- [Quarto Extensions](https://github.com/mcanouil/quarto-extensions) - Registry of Quarto extensions.

## Development

To set up the development environment:

```bash
npm install     # Install dependencies
npm run build   # Build the action
npm test        # Run tests
npm run format  # Format code
npm run lint    # Lint code
npm run all     # Format, lint, and build
```

For more details on contributing to this project, please refer to the development guidelines.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/mcanouil/quarto-extensions-updater).

## Licence

This project is licensed under the MIT Licence.
See the [LICENSE](LICENSE) file for details.
