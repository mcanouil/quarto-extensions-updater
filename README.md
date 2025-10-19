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
- 🏷️ Categorises updates by type (major, minor, patch).
- 🤖 Dependabot-style PR descriptions.
- ⚡ Runs on a schedule or manually.

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
```

## Inputs

| Input            | Description                                              | Required | Default                                                                 |
| ---------------- | -------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `github-token`   | GitHub token for creating pull requests                  | Yes      | `${{ github.token }}`                                                   |
| `workspace-path` | Path to the workspace containing `_extensions` directory | No       | `.`                                                                     |
| `registry-url`   | URL to the Quarto extensions registry JSON file          | No       | [quarto-extensions directory](https://m.canouil.dev/quarto-extensions/) |
| `create-pr`      | Whether to create a pull request for updates             | No       | `true`                                                                  |
| `branch-prefix`  | Prefix for the update branch name                        | No       | `chore/quarto-extensions`                                               |
| `base-branch`    | Base branch to create pull requests against              | No       | `main`                                                                  |

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
4. **Apply Updates**: Uses Quarto CLI (`quarto add owner/repo@version --no-prompt`) to update extensions.
5. **Track Updates**: Maintains `source` field in extension manifests for future update tracking.
6. **Create PR**: Generates a detailed pull request with release notes.

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

## Troubleshooting

### No Extensions Found

Ensure your extensions are in `_extensions/owner/name/` structure with `_extension.yml` or `_extension.yaml` files.

### No Updates Detected

- Verify extensions are in the registry: [http://m.canouil.dev/quarto-extensions/](http://m.canouil.dev/quarto-extensions/).
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
