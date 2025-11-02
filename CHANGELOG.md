# Changelog

## Unreleased

- feat(auto-merge): add auto-merge support for PRs based on configurable strategies.
- feat(auto-merge): add `auto-merge` input parameter to enable/disable auto-merge (default: `false`).
- feat(auto-merge): add `auto-merge-strategy` input parameter with options: `patch`, `minor`, `all` (default: `patch`).
- feat(auto-merge): add `auto-merge-method` input parameter with options: `merge`, `squash`, `rebase` (default: `squash`).
- feat(auto-merge): implement `shouldAutoMerge()` function to determine if PR should be auto-merged based on update type.
- feat(auto-merge): implement `enableAutoMerge()` function using GitHub GraphQL API.
- feat(auto-merge): implement `isAutoMergeEnabled()` function to check if auto-merge is already enabled.
- feat(auto-merge): implement `getUpdateType()` function to classify updates as major, minor, or patch.
- docs(readme): add auto-merge feature to features list.
- docs(readme): add dedicated "Auto-Merge" section with configuration examples and required permissions.
- docs(readme): add auto-merge input parameters to inputs table.
- docs(readme): document required workflow permissions for auto-merge (`pull-requests: write`).
- docs(readme): add examples for auto-merge with patch and minor strategies.
- docs(changelog): document new auto-merge feature.
- refactor(types): add `AutoMergeStrategy`, `MergeMethod`, `AutoMergeConfig`, and `UpdateType` types.
- refactor(automerge): create dedicated `src/automerge.ts` module for auto-merge functionality.
- refactor(index): integrate auto-merge logic into PR creation workflow.
- test(automerge): add comprehensive test coverage for auto-merge functionality (26 tests, 95.34% coverage).
- fix(automerge): add error handling for invalid semver versions in `getUpdateType()`.

## 0.0.5 (2025-10-31)

- refactor(github): extract GitHub API operations into dedicated `src/github.ts` module.
- refactor(github): add `checkExistingPR()` helper function for checking existing PRs.
- refactor(github): add `createOrUpdateBranch()` helper function for branch management.
- refactor(github): add `createOrUpdatePR()` helper function for PR creation/updates.
- refactor(github): add `createCommit()` helper function for Git commit operations.
- refactor(github): add `OctokitClient` type alias for improved type safety and reusability.
- refactor(github): add `GitHubError` interface and `isGitHubError()` type guard for better error handling.
- refactor(github): extract and document `FILE_MODE_REGULAR` constant for Git file modes.
- refactor(github): update all function signatures to use `OctokitClient` type alias.
- refactor(github): replace inline error type checking with `isGitHubError()` type guard.
- refactor(extensions): add `ExtensionManifestYAML` interface for typed manifest parsing.
- refactor(extensions): extract and document `MANIFEST_FILENAMES` constant.
- refactor(extensions): update `readExtensionManifest()` to use typed `ExtensionManifestYAML` interface.
- refactor(index): extract constants for default values (base branch, prefixes, labels).
- refactor(index): move `fs` import to module level instead of dynamic imports.
- refactor(index): extract `owner` and `repo` once to reduce repeated property access.
- refactor(index): simplify PR creation/update logic using new helper functions.
- refactor(index): simplify Git commit creation using `createCommit()` helper.
- refactor(index): improve path normalisation logic using `path.sep` and `slice()`.
- refactor(index): improve type safety by checking optional properties before use.
- fix(index): add input parameter validation for workspace path, registry URL, and branch prefix.
- fix(github): improve error handling in `checkExistingPR()` to distinguish expected vs unexpected errors.
- fix(pr): add validation for repository name format before splitting.
- perf(index): eliminate duplicate PR checking logic.
- perf(index): remove dynamic `import("fs")` inside map loop for better performance.
- perf(index): fetch base branch SHA once before loop instead of repeating for each update.

## 0.0.4 (2025-10-31)

- feat(pr): skip PR creation when PR already exists for the same extension version.

## 0.0.3 (2025-10-31)

- feat(pr): implement one PR per extension instead of grouping multiple extensions.
- feat(pr): implement PR reuse - existing PRs are updated when new versions are available.
- feat(branch): remove version from branch names for single extension updates to enable PR reuse.
- feat(config): add `pr-title-prefix` input parameter to customise PR titles (default: `chore(deps):`).
- feat(config): add `commit-message-prefix` input parameter to customise commit messages (default: `chore(deps):`).
- feat(config): add `pr-labels` input parameter to customise PR labels (default: `dependencies,quarto-extensions`).
- docs(readme): add new features section highlighting one PR per extension.
- docs(readme): update "How It Works" section to explain PR update logic.
- docs(readme): add new example for custom branch naming and PR format.
- docs(readme): update inputs table with new configuration options.
- refactor(pr): update `generatePRTitle` to accept customisable prefix parameter.
- refactor(git): update `createCommitMessage` to accept customisable prefix parameter.
- refactor(git): update `createBranchName` to remove version for single extension updates.
- refactor(index): process each extension individually in separate loop iterations.
- refactor(index): remove unused `generatePRLabels` function in favour of user-defined labels.

## 0.0.2 (2025-10-19)

- feat(branch-prefix): implement support for customisable branch prefix input parameter (default: `chore/quarto-extensions`).

## 0.0.1 (2025-10-19)

- Initial release of Quarto Extensions Updater.
