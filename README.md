# Quarto Extensions Updater

> [!WARNING]
> This GitHub Action is currently experimental and under active development.
> Features and behaviour may change.
> Use with caution in production environments.

A GitHub Action that automatically updates Quarto extensions in your repository, similar to how Dependabot manages dependencies.

## Features

- 🔍 Automatically checks for Quarto extension updates.
- 📦 Updates extensions using Quarto CLI (`quarto add`).
- 🔄 Maintains `source` field in extension manifests for tracking.
- 📝 Creates detailed pull requests with release notes.
- 🔀 **One PR per extension** - each extension gets its own PR that updates when new versions are available (or group all updates into a single PR).
- 🏷️ Categorises updates by type (major, minor, patch).
- 🤖 Dependabot-style PR descriptions.
- 🚀 **Auto-merge support** - automatically merge PRs based on configurable rules (e.g., patch updates only).
- 🎯 **Selective updates** - include or exclude specific extensions from updates.
- 📦 **Grouped updates** - option to combine all extension updates into a single PR.
- 🛡️ **Update strategy** - control which types of updates to apply (all, minor, patch).
- ⚡ Runs on a schedule or manually.
- ⚙️ Highly customisable branch names, commit messages, and PR titles.

## Usage

### Basic Setup

Create a workflow file (e.g., `.github/workflows/update-extensions.yml`):

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
      - uses: actions/checkout@v4

      - name: Setup Quarto
        uses: quarto-dev/quarto-actions/setup@v2

      - uses: mcanouil/quarto-extensions-updater@v0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Advanced Configuration

```yaml
- uses: mcanouil/quarto-extensions-updater@v0
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

| Input                   | Description                                                                       | Required | Default                                                                 |
| ----------------------- | --------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `github-token`          | GitHub token for creating pull requests                                           | Yes      | `${{ github.token }}`                                                   |
| `workspace-path`        | Path to the workspace containing `_extensions` directory                          | No       | `.`                                                                     |
| `registry-url`          | URL to the Quarto extensions registry JSON file                                   | No       | [quarto-extensions directory](https://m.canouil.dev/quarto-extensions/) |
| `create-pr`             | Whether to create a pull request for updates                                      | No       | `true`                                                                  |
| `branch-prefix`         | Prefix for the update branch name                                                 | No       | `chore/quarto-extensions`                                               |
| `base-branch`           | Base branch to create pull requests against                                       | No       | `main`                                                                  |
| `pr-title-prefix`       | Prefix for PR titles                                                              | No       | `chore(deps):`                                                          |
| `commit-message-prefix` | Prefix for commit messages                                                        | No       | `chore(deps):`                                                          |
| `pr-labels`             | Comma-separated list of labels to add to PRs                                      | No       | `dependencies,quarto-extensions`                                        |
| `auto-merge`            | Enable automatic merging of PRs based on `auto-merge-strategy`                    | No       | `false`                                                                 |
| `auto-merge-strategy`   | Auto-merge strategy: `patch` (patch only), `minor` (minor and patch), `all` (all) | No       | `patch`                                                                 |
| `auto-merge-method`     | Merge method to use: `merge`, `squash`, or `rebase`                               | No       | `squash`                                                                |
| `include-extensions`    | Comma-separated list of extensions to include (e.g., `owner/name1,owner/name2`)   | No       | `` (all)                                                                |
| `exclude-extensions`    | Comma-separated list of extensions to exclude (e.g., `owner/name1,owner/name2`)   | No       | `` (none)                                                               |
| `group-updates`         | Group all extension updates into a single PR instead of one PR per extension       | No       | `false`                                                                 |
| `update-strategy`       | Control which types of updates to apply: `all`, `minor` (minor and patch), `patch` | No       | `all`                                                                   |

## Outputs

| Output              | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `updates-available` | Whether updates are available (`true`/`false`)              |
| `update-count`      | Number of updates available                                 |
| `updates`           | JSON array of updates (name, currentVersion, latestVersion) |
| `pr-number`         | Pull request number (if created)                            |
| `pr-url`            | Pull request URL (if created)                               |

## How It Works

1. **Fetch Registry**: Downloads the Quarto extensions registry from GitHub.
2. **Scan Extensions**: Finds all installed extensions in `_extensions/`.
3. **Check Versions**: Compares installed versions with registry using semantic versioning.
4. **Process Each Extension**: Each extension is processed individually to create separate PRs.
5. **Apply Updates**: Uses Quarto CLI (`quarto add owner/repo@version --no-prompt`) to update extensions.
6. **Track Updates**: Maintains `source` field in extension manifests for future update tracking.
7. **Create/Update PR**:
   - Creates a new PR if none exists for this extension
   - Updates the existing PR if one already exists (same branch name)
   - Ensures **one PR per extension** at most

## Requirements

- Quarto CLI must be installed in the workflow environment.
- Use `quarto-dev/quarto-actions/setup@v2` to install Quarto in GitHub Actions.

## Extension Registry

This action uses the Quarto extensions registry maintained at:

- Repository: [mcanouil/quarto-extensions](https://github.com/mcanouil/quarto-extensions).
- Branch: `quarto-wizard`.
- File: `quarto-extensions.json`.

The registry contains metadata about Quarto extensions including:

- Latest release versions.
- Release URLs.
- Repository information.
- Descriptions.

## Extension Manifest Format

Extensions should have a manifest file (`_extension.yml` or `_extension.yaml`) in the format:

```yaml
title: "My Extension"
author: "Your Name"
version: "1.0.0"
contributes:
  ...
source: "owner/repo@v1.0.0"
```

The action will automatically add or update the `source` field.

## Pull Request Format

The action creates pull requests with:

- **Title**: Clear description of the update(s).
- **Labels**: `dependencies`, `quarto-extensions`, update type labels.
- **Body**:
  - Updates grouped by type (major, minor, patch).
  - Links to release notes.
  - Repository information.
  - Descriptions of changes.

Example PR body:

```markdown
Updates the following Quarto extension(s):

## ✨ Minor Updates

- **[mcanouil/quarto-iconify](https://github.com/mcanouil/quarto-iconify)**: `1.0.0` → `3.0.1`

---

### Release Notes

**mcanouil/quarto-iconify** (1.0.0 → 3.0.1)

- [Release notes](https://github.com/mcanouil/quarto-iconify/releases/tag/v3.0.1)
- [Repository](https://github.com/mcanouil/quarto-iconify)

> A fancy text extension for Quarto

---

🤖 This PR was automatically generated by [quarto-extensions-updater](https://github.com/mcanouil/quarto-extensions-updater)
```

## Auto-Merge

The action supports automatically merging PRs based on the update type, similar to Dependabot's auto-merge feature.

### How Auto-Merge Works

When enabled, the action will automatically enable GitHub's auto-merge feature on PRs that match your configured strategy.
PRs will be merged automatically once all required status checks pass and branch protection rules are satisfied.

### Auto-Merge Strategies

- **`patch`** (default): Only auto-merge patch updates (e.g., 1.0.0 → 1.0.1).
- **`minor`**: Auto-merge minor and patch updates (e.g., 1.0.0 → 1.1.0 or 1.0.1).
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
      - uses: actions/checkout@v4

      - name: Setup Quarto
        uses: quarto-dev/quarto-actions/setup@v2

      - uses: mcanouil/quarto-extensions-updater@v0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          auto-merge: true
          auto-merge-strategy: "patch"
          auto-merge-method: "squash"
```

### Example: Auto-Merge Minor and Patch Updates

```yaml
- uses: mcanouil/quarto-extensions-updater@v0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    auto-merge: true
    auto-merge-strategy: "minor"
```

### Important Notes

- Auto-merge requires branch protection rules to be configured if you want to enforce checks before merging.
- The PR will only merge automatically after all required status checks pass.
- If auto-merge fails (e.g., due to permission issues), the PR will still be created but won't auto-merge.
- The action logs a warning if auto-merge fails but continues normal operation.

## Grouped Updates

By default, the action creates one PR per extension for granular control. However, you can group all updates into a single PR if you prefer fewer PRs.

### Enable Grouped Updates

```yaml
- uses: mcanouil/quarto-extensions-updater@v0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    group-updates: true
```

When `group-updates` is enabled:

- All extension updates are combined into a single PR.
- The PR title reflects the total number of extensions being updated.
- The PR body lists all updates grouped by type (major, minor, patch).
- Auto-merge will only be enabled if **all** extensions in the group qualify based on your auto-merge strategy.

### Use Cases for Grouped Updates

- **Fewer PRs**: Reduce notification noise by combining all updates into one PR.
- **Batch Updates**: Apply all extension updates at once for easier testing.
- **Simplified Review**: Review all changes in a single pull request.

### Use Cases for Individual PRs (Default)

- **Granular Control**: Review and merge each extension update independently.
- **Targeted Testing**: Test each extension update separately to identify issues.
- **Selective Auto-merge**: Automatically merge safe updates (e.g., patches) whilst reviewing others manually.
- **Better Change Tracking**: See exactly which extension caused issues if problems arise.

## Update Strategy

Control which types of updates are applied based on semantic versioning.

### Available Strategies

- **`all`** (default): Apply all updates regardless of type (major, minor, patch).
- **`minor`**: Only apply minor and patch updates, skip major breaking changes.
- **`patch`**: Only apply patch updates, skip minor and major changes.

### Examples

**Only apply safe patch updates:**

```yaml
- uses: mcanouil/quarto-extensions-updater@v0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    update-strategy: "patch"
```

**Avoid breaking changes (no major updates):**

```yaml
- uses: mcanouil/quarto-extensions-updater@v0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    update-strategy: "minor"
```

### Use Cases

- **Conservative Updates**: Use `patch` to only apply bug fixes and avoid any new features or breaking changes.
- **Balanced Approach**: Use `minor` to get new features whilst avoiding breaking changes.
- **Stay Current**: Use `all` (default) to get all updates including major versions.

### Combining with Auto-Merge

Update strategy works independently from auto-merge strategy:

```yaml
- uses: mcanouil/quarto-extensions-updater@v0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    update-strategy: "minor"      # Only check for minor and patch updates
    auto-merge: true
    auto-merge-strategy: "patch"  # Auto-merge only patch updates
```

In this example:
- Only minor and patch updates are detected (major updates are skipped entirely).
- Of those updates, only patch updates are auto-merged.
- Minor updates create PRs that require manual review.

## Selective Extension Updates

You can control which extensions are updated using include and exclude lists.

### Include Only Specific Extensions

To update only certain extensions, use the `include-extensions` input:

```yaml
- uses: mcanouil/quarto-extensions-updater@v0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    include-extensions: "mcanouil/iconify,quarto-ext/lightbox"
```

This will only check for updates and create PRs for the specified extensions. All other extensions will be ignored.

### Exclude Specific Extensions

To exclude certain extensions from updates (e.g., to pin a specific version), use the `exclude-extensions` input:

```yaml
- uses: mcanouil/quarto-extensions-updater@v0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    exclude-extensions: "quarto-ext/fancy-text,owner/unstable-extension"
```

This will check all extensions except the specified ones.

### Combining Include and Exclude

You can use both filters together. If an extension appears in both lists, the exclude filter takes precedence:

```yaml
- uses: mcanouil/quarto-extensions-updater@v0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    include-extensions: "mcanouil/iconify,quarto-ext/lightbox,quarto-ext/fancy-text"
    exclude-extensions: "quarto-ext/fancy-text"
```

In this example, only `mcanouil/iconify` and `quarto-ext/lightbox` will be updated.

### Use Cases

- **Pin Specific Extensions**: Use `exclude-extensions` to prevent updates to extensions you want to keep at a specific version.
- **Gradual Rollout**: Use `include-extensions` to test updates on a subset of extensions before enabling updates for all.
- **Unstable Extensions**: Exclude extensions that are under active development or have known issues.
- **Critical Extensions**: Create separate workflows for critical vs. non-critical extensions with different schedules.

## Examples

### Check for Updates Without Creating PR

```yaml
- name: Check for updates
  id: check
  uses: mcanouil/quarto-extensions-updater@v0
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
- uses: mcanouil/quarto-extensions-updater@v0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    registry-url: "https://example.com/custom-registry.json"
```

### Different Schedule

```yaml
on:
  schedule:
    - cron: "0 0 * * 0"  # Weekly on Sunday
    # or
    - cron: "0 0 1 * *"  # Monthly on 1st day
```

### Custom Branch Naming and PR Format

Use conventional commits style with custom labels:

```yaml
- uses: mcanouil/quarto-extensions-updater@v0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    branch-prefix: "deps/quarto"
    pr-title-prefix: "build(deps):"
    commit-message-prefix: "build(deps):"
    pr-labels: "dependencies,quarto,automated,low-priority"
```

This will create PRs with:

- Branch: `deps/quarto/update-owner-name`
- Title: `build(deps): update owner/name extension to 1.2.3`
- Labels: `dependencies`, `quarto`, `automated`, `low-priority`

## Troubleshooting

### No Extensions Found

Ensure your extensions are in `_extensions/owner/name/` structure with `_extension.yml` or `_extension.yaml` files.

### No Updates Detected

- Verify extensions are in the registry: <https://m.canouil.dev/quarto-extensions/>.
- Check version fields exist in manifests.
- Ensure versions follow semantic versioning (X.Y.Z).

### PR Not Created

- Verify workflow has `contents: write` and `pull-requests: write` permissions..
- Check GitHub Actions logs for errors..
- Ensure no existing PR with same branch name..

## Related Projects

- [Quarto Wizard](https://github.com/mcanouil/quarto-wizard) - VSCode extension for managing Quarto extensions.
- [Quarto Extensions](https://github.com/mcanouil/quarto-extensions) - Registry of Quarto extensions.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

```bash
npm install    # Install dependencies
npm run build  # Build the action
npm test       # Run tests
npm run format # Format code
npm run lint   # Lint code
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/mcanouil/quarto-extensions-updater).

## License

This project is licensed under the MIT License.
See the [LICENSE](LICENSE) file for details.
