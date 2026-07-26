# Quarto Extensions Updater

[![Test Action](https://github.com/mcanouil/quarto-extensions-updater/actions/workflows/test.yml/badge.svg)](https://github.com/mcanouil/quarto-extensions-updater/actions/workflows/test.yml)[![Deploy: Documentation](https://github.com/mcanouil/quarto-extensions-updater/actions/workflows/deploy.yml/badge.svg)](https://github.com/mcanouil/quarto-extensions-updater/actions/workflows/deploy.yml)

A GitHub Action that keeps the [Quarto](https://quarto.org/) extensions of a repository up to date, the way Dependabot keeps dependencies up to date.
It scans every `_extensions` directory, compares each installed extension against the [Quarto extensions registry](https://m.canouil.dev/quarto-extensions/), updates the ones that moved through the Quarto CLI, and opens one pull request per extension with the release notes attached.

**Documentation: <https://m.canouil.dev/quarto-extensions-updater>**

## Usage

Create a workflow file (_e.g._, `.github/workflows/update-extensions.yml`):

```yaml
name: Update Quarto Extensions

on:
  schedule:
    - cron: "0 0 * * *" # Daily at midnight UTC
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
        with:
          version: "release"

      - uses: mcanouil/quarto-extensions-updater@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

The Quarto CLI performs the updates, so the setup step is required.

## Features

- One pull request per extension, or a single grouped pull request.
- Update strategies holding back major or minor changes.
- Include and exclude lists for pinning individual extensions.
- Multi-directory scanning for repositories with several Quarto sub-projects.
- Auto-merge by update type, with the merge method of your choice.
- Dry-run mode, optionally reporting into a GitHub issue.
- Reviewers and assignees for team workflows.
- Compatibility checks against `quarto-required`, skipping and reporting extensions that need a newer Quarto.
- Dependabot-style pull request bodies with release notes, grouped by update type.

Every input, output, and behaviour is documented at <https://m.canouil.dev/quarto-extensions-updater>.

## Related projects

- [Quarto Wizard](https://github.com/mcanouil/quarto-wizard): a Visual Studio Code extension for managing Quarto extensions.
- [Quarto Extensions](https://github.com/mcanouil/quarto-extensions): the registry of Quarto extensions this action reads.

## Contributing

Contributions are welcome.
Open an issue or a pull request on the [GitHub repository](https://github.com/mcanouil/quarto-extensions-updater), and see [contributing](https://m.canouil.dev/quarto-extensions-updater/contributing.html) for the development setup.

## Licence

This project is licensed under the MIT Licence.
See the [LICENSE](LICENSE) file for details.
