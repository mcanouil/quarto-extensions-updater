# Changelog

## Unreleased

- fix: resolve auto-merge "clean status" error by implementing 3-second delay before enabling auto-merge and retry logic to handle timing issues when GitHub hasn't computed PR mergeable state.
- refactor: relocate all test files from `src/` to top-level `tests/` directory for better organisation.

## 0.3.0 (2025-11-05)

- feat: add `create-issue` input parameter to enable GitHub issue creation in dry-run mode (defaults to `false`).
- feat: implement `createIssueForUpdates()` function in `src/github.ts` to create issues with dry-run summaries.
- feat: add `issue-number` and `issue-url` outputs for tracking created issues.
- feat: enhance dry-run configuration display with "Default" column and ⚙️ indicator for non-default settings to ease debugging.
- feat: unify dry-run summary formatting between GitHub Actions job summaries and GitHub issues using shared `generateDryRunMarkdown()` function.
- refactor: extract `generateDryRunMarkdown()` in `src/summary.ts` as single source of truth for dry-run content generation.
- refactor: update `generateDryRunSummary()` to use markdown-based rendering via `generateDryRunMarkdown()`.
- test: add comprehensive test coverage for `generateDryRunMarkdown()` (7 tests).
- test: add test coverage for `createIssueForUpdates()` (3 tests).
- test: add test coverage for `create-issue` configuration parsing (2 tests).
- test: add test coverage for dry-run summary with issue creation notice (2 tests).
- docs: add "Creating Issues in Dry-Run Mode" section to README with usage examples.
- docs: update inputs and outputs tables in README with new `create-issue`, `issue-number`, and `issue-url` entries.

## 0.2.0 (2025-11-03)

- refactor: modularise codebase into dedicated modules (`config.ts`, `prProcessor.ts`, `summary.ts`, `validation.ts`, `errors.ts`, `constants.ts`) with comprehensive input validation and improved error handling.
- refactor: improve PR body generation with collapsible release notes and enhance auto-merge logic.
- test: add comprehensive unit tests across all modules.
- docs: update README for clarity and consistency with British English conventions, improve structure, and update examples to match actual code behaviour.
- fix: correct update type detection in auto-merge strategy and improve error messages for invalid configuration values.

## 0.1.1 (2025-11-02)

- fix: use HTML anchor tags for PR links in GitHub Actions Job Summary to ensure proper rendering.

## 0.1.0 (2025-11-02)

- feat: add `pr-reviewers`, `pr-team-reviewers`, and `pr-assignees` input parameters for automatic reviewer and assignee assignment on created PRs.
- feat: implement `requestReviewersAndAssignees()` function in `src/github.ts` to request reviewers and assign users to PRs.
- feat: update `createOrUpdatePR()` to accept optional `PRAssignmentConfig` parameter for setting reviewers and assignees.
- feat: add `PRAssignmentConfig` interface to `src/types.ts` with `reviewers`, `teamReviewers`, and `assignees` fields.
- feat: add `dry-run` input parameter to preview updates without creating PRs or making changes.
- feat: implement dry-run mode with detailed reporting of configuration, planned actions, and auto-merge status.
- feat: add `update-strategy` input parameter to control which types of updates to apply: `all` (default), `minor` (minor and patch only), `patch` (patch only).
- feat: implement update strategy filtering logic in `checkForUpdates()` with `shouldApplyUpdate()` helper function.
- test: add comprehensive test coverage for update strategy filtering (4 new tests).
- feat: add `group-updates` input parameter to combine all extension updates into a single PR (default: `false`).
- feat: implement update grouping logic with smart auto-merge (only enabled when all updates qualify).
- feat: add `include-extensions` and `exclude-extensions` input parameters for filtering which extensions to update.
- feat: implement filtering logic with exclude taking precedence over include.
- feat: add `auto-merge`, `auto-merge-strategy` (`patch`/`minor`/`all`), and `auto-merge-method` (`merge`/`squash`/`rebase`) input parameters.
- feat: implement auto-merge functionality using GitHub GraphQL API with strategies based on semver update type.
- feat: add GitHub Actions Job Summary for both dry-run and normal modes showing configuration, applied updates, PR links, and auto-merge status.
- refactor: update PR creation workflow to handle both single and multiple extension updates.
- refactor: create dedicated `src/automerge.ts` module with `shouldAutoMerge()`, `enableAutoMerge()`, `isAutoMergeEnabled()`, and `getUpdateType()` functions.
- test: add comprehensive test coverage for filtering logic (7 new tests).
- test: add comprehensive test coverage for auto-merge functionality (26 tests, 95.34% coverage).
- fix: add error handling for invalid semver versions.
- fix: add graceful error handling for reviewer/assignee requests with warning logging on failure.

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
