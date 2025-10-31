# Changelog

## 0.0.3 (2025-10-31)

### Features

- feat(pr): implement one PR per extension instead of grouping multiple extensions.
- feat(pr): implement PR reuse - existing PRs are updated when new versions are available.
- feat(branch): remove version from branch names for single extension updates to enable PR reuse.
- feat(config): add `pr-title-prefix` input parameter to customise PR titles (default: `chore(deps):`).
- feat(config): add `commit-message-prefix` input parameter to customise commit messages (default: `chore(deps):`).
- feat(config): add `pr-labels` input parameter to customise PR labels (default: `dependencies,quarto-extensions`).

### Documentation

- docs(readme): add new features section highlighting one PR per extension.
- docs(readme): update "How It Works" section to explain PR update logic.
- docs(readme): add new example for custom branch naming and PR format.
- docs(readme): update inputs table with new configuration options.

### Internal

- refactor(pr): update `generatePRTitle` to accept customisable prefix parameter.
- refactor(git): update `createCommitMessage` to accept customisable prefix parameter.
- refactor(git): update `createBranchName` to remove version for single extension updates.
- refactor(index): process each extension individually in separate loop iterations.
- refactor(index): remove unused `generatePRLabels` function in favour of user-defined labels.

## 0.0.2 (2025-10-19)

- feat(branch-prefix): implement support for customisable branch prefix input parameter (default: `chore/quarto-extensions`).

## 0.0.1 (2025-10-19)

- Initial release of Quarto Extensions Updater.
