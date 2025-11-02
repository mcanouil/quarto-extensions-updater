import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
import * as path from "path";
import { fetchExtensionsRegistry } from "./registry";
import { checkForUpdates } from "./updates";
import { applyUpdates, createBranchName, createCommitMessage, validateModifiedFiles } from "./git";
import { generatePRTitle, generatePRBody, logUpdateSummary } from "./pr";
import { checkExistingPR, createOrUpdateBranch, createOrUpdatePR, createCommit } from "./github";
import { shouldAutoMerge, enableAutoMerge, isAutoMergeEnabled } from "./automerge";
import type {
	AutoMergeConfig,
	AutoMergeStrategy,
	MergeMethod,
	ExtensionFilterConfig,
	UpdateStrategy,
	PRAssignmentConfig,
} from "./types";

const DEFAULT_BASE_BRANCH = "main";
const DEFAULT_BRANCH_PREFIX = "chore/quarto-extensions";
const DEFAULT_PR_TITLE_PREFIX = "chore(deps):";
const DEFAULT_COMMIT_MESSAGE_PREFIX = "chore(deps):";
const DEFAULT_PR_LABELS = "dependencies,quarto-extensions";

async function run(): Promise<void> {
	try {
		const githubToken = core.getInput("github-token", { required: true });
		const workspacePath = core.getInput("workspace-path") || process.cwd();
		const registryUrl = core.getInput("registry-url") || undefined;
		const createPR = core.getBooleanInput("create-pr") !== false;
		const baseBranch = core.getInput("base-branch") || DEFAULT_BASE_BRANCH;
		const branchPrefix = core.getInput("branch-prefix") || DEFAULT_BRANCH_PREFIX;
		const prTitlePrefix = core.getInput("pr-title-prefix") || DEFAULT_PR_TITLE_PREFIX;
		const commitMessagePrefix = core.getInput("commit-message-prefix") || DEFAULT_COMMIT_MESSAGE_PREFIX;
		const prLabelsInput = core.getInput("pr-labels") || DEFAULT_PR_LABELS;
		const prLabels = prLabelsInput
			.split(",")
			.map((label) => label.trim())
			.filter((label) => label.length > 0);

		const autoMergeEnabled = core.getBooleanInput("auto-merge") === true;
		const autoMergeStrategy = (core.getInput("auto-merge-strategy") || "patch") as AutoMergeStrategy;
		const autoMergeMethod = (core.getInput("auto-merge-method") || "squash") as MergeMethod;

		const autoMergeConfig: AutoMergeConfig = {
			enabled: autoMergeEnabled,
			strategy: autoMergeStrategy,
			mergeMethod: autoMergeMethod,
		};

		const includeExtensionsInput = core.getInput("include-extensions") || "";
		const excludeExtensionsInput = core.getInput("exclude-extensions") || "";

		const filterConfig: ExtensionFilterConfig = {
			include: includeExtensionsInput
				.split(",")
				.map((ext) => ext.trim())
				.filter((ext) => ext.length > 0),
			exclude: excludeExtensionsInput
				.split(",")
				.map((ext) => ext.trim())
				.filter((ext) => ext.length > 0),
		};

		const groupUpdates = core.getBooleanInput("group-updates") === true;
		const updateStrategy = (core.getInput("update-strategy") || "all") as UpdateStrategy;
		const dryRun = core.getBooleanInput("dry-run") === true;

		const prReviewersInput = core.getInput("pr-reviewers") || "";
		const prTeamReviewersInput = core.getInput("pr-team-reviewers") || "";
		const prAssigneesInput = core.getInput("pr-assignees") || "";

		const assignmentConfig: PRAssignmentConfig = {
			reviewers: prReviewersInput
				.split(",")
				.map((reviewer) => reviewer.trim())
				.filter((reviewer) => reviewer.length > 0),
			teamReviewers: prTeamReviewersInput
				.split(",")
				.map((team) => team.trim())
				.filter((team) => team.length > 0),
			assignees: prAssigneesInput
				.split(",")
				.map((assignee) => assignee.trim())
				.filter((assignee) => assignee.length > 0),
		};

		if (!fs.existsSync(workspacePath)) {
			throw new Error(`Workspace path does not exist: ${workspacePath}`);
		}

		if (registryUrl && !registryUrl.startsWith("https://")) {
			throw new Error(`Registry URL must use HTTPS: ${registryUrl}`);
		}

		if (branchPrefix.includes(" ")) {
			throw new Error(`Branch prefix cannot contain spaces: ${branchPrefix}`);
		}

		const octokit = github.getOctokit(githubToken);
		const context = github.context;
		const { owner, repo } = context.repo;

		core.info("🚀 Starting Quarto Extensions Updater...");
		core.info(`Workspace path: ${workspacePath}`);
		core.info(`Repository: ${owner}/${repo}`);
		core.info(`Base branch: ${baseBranch}`);

		core.startGroup("📥 Fetching extensions registry");
		const registry = await fetchExtensionsRegistry(registryUrl);
		core.endGroup();

		core.startGroup("🔍 Checking for updates");
		const updates = checkForUpdates(workspacePath, registry, filterConfig, updateStrategy);
		core.endGroup();

		if (updates.length === 0) {
			core.info("✅ All extensions are up to date!");
			core.setOutput("updates-available", "false");
			core.setOutput("update-count", "0");
			return;
		}

		logUpdateSummary(updates);

		core.setOutput("updates-available", "true");
		core.setOutput("update-count", updates.length.toString());
		core.setOutput(
			"updates",
			JSON.stringify(
				updates.map((u) => ({
					name: u.nameWithOwner,
					currentVersion: u.currentVersion,
					latestVersion: u.latestVersion,
				})),
			),
		);

		// Handle dry-run mode
		if (dryRun) {
			core.startGroup("🔍 Dry-Run Mode - No Changes Will Be Made");

			core.summary.addHeading("Dry-Run Summary", 2);
			core.summary.addRaw("No PRs will be created. This is a preview of what would happen.", true);
			core.summary.addBreak();

			// Configuration section
			core.summary.addHeading("Configuration", 3);
			const configTable = [
				[
					{ data: "Setting", header: true },
					{ data: "Value", header: true },
				],
				[
					{ data: "Mode", header: false },
					{ data: groupUpdates ? "Grouped updates (single PR)" : "Individual PRs (one per extension)", header: false },
				],
				[
					{ data: "Update Strategy", header: false },
					{ data: updateStrategy, header: false },
				],
			];

			if (filterConfig.include.length > 0) {
				configTable.push([
					{ data: "Include Filter", header: false },
					{ data: filterConfig.include.join(", "), header: false },
				]);
			}
			if (filterConfig.exclude.length > 0) {
				configTable.push([
					{ data: "Exclude Filter", header: false },
					{ data: filterConfig.exclude.join(", "), header: false },
				]);
			}
			if (autoMergeConfig.enabled) {
				configTable.push([
					{ data: "Auto-Merge", header: false },
					{
						data: `Enabled (${autoMergeConfig.strategy} updates, ${autoMergeConfig.mergeMethod} method)`,
						header: false,
					},
				]);
			} else {
				configTable.push([
					{ data: "Auto-Merge", header: false },
					{ data: "Disabled", header: false },
				]);
			}

			core.summary.addTable(configTable);
			core.summary.addBreak();

			// Planned actions section
			core.summary.addHeading("Planned Actions", 3);
			if (groupUpdates) {
				core.summary.addRaw(
					`Would create **1 PR** with ${updates.length} extension update${updates.length > 1 ? "s" : ""}`,
					true,
				);
			} else {
				core.summary.addRaw(
					`Would create **${updates.length} PR${updates.length > 1 ? "s" : ""}** (one per extension)`,
					true,
				);
			}
			core.summary.addBreak();

			// Updates table
			const updatesTable = [
				[
					{ data: "Extension", header: true },
					{ data: "Current", header: true },
					{ data: "Latest", header: true },
					{ data: "Auto-Merge", header: true },
				],
			];

			for (const update of updates) {
				const wouldAutoMerge = shouldAutoMerge(update, autoMergeConfig);
				updatesTable.push([
					{ data: update.nameWithOwner, header: false },
					{ data: update.currentVersion, header: false },
					{ data: update.latestVersion, header: false },
					{ data: wouldAutoMerge ? "✓ Yes" : "✗ No", header: false },
				]);
			}

			core.summary.addTable(updatesTable);
			core.summary.addBreak();

			// Instructions
			core.summary.addHeading("Next Steps", 3);
			core.summary.addRaw(
				"To apply these updates, remove <code>dry-run: true</code> from your workflow configuration.",
				true,
			);

			await core.summary.write();

			core.info("📋 Dry-run summary written to job summary");
			core.info(`✓ Found ${updates.length} update${updates.length > 1 ? "s" : ""} that would be applied`);
			core.info("💡 Check the job summary for detailed information");

			core.endGroup();
			return;
		}

		if (!createPR) {
			core.info("ℹ️ PR creation disabled, exiting...");
			return;
		}

		const { data: refData } = await octokit.rest.git.getRef({
			owner,
			repo,
			ref: `heads/${baseBranch}`,
		});
		const baseSha = refData.object.sha;

		const createdPRs: { number: number; url: string }[] = [];

		// Determine whether to create one PR for all updates or one PR per extension
		const updateGroups = groupUpdates ? [updates] : updates.map((u) => [u]);

		for (const updateGroup of updateGroups) {
			const groupDescription =
				updateGroup.length === 1 ? updateGroup[0].nameWithOwner : `${updateGroup.length} extensions`;
			core.startGroup(`📝 Processing ${groupDescription}`);

			const branchName = createBranchName(updateGroup, branchPrefix);
			const prTitle = generatePRTitle(updateGroup, prTitlePrefix);

			const existingPR = await checkExistingPR(octokit, owner, repo, branchName, prTitle);
			if (existingPR.exists && existingPR.prNumber && existingPR.prUrl) {
				if (updateGroup.length === 1) {
					core.info(
						`ℹ️ PR #${existingPR.prNumber} already exists for ${updateGroup[0].nameWithOwner}@${updateGroup[0].latestVersion}, skipping...`,
					);
				} else {
					core.info(`ℹ️ PR #${existingPR.prNumber} already exists for grouped updates, skipping...`);
				}
				core.info(`   URL: ${existingPR.prUrl}`);
				createdPRs.push({ number: existingPR.prNumber, url: existingPR.prUrl });
				core.endGroup();
				continue;
			}

			const modifiedFiles = applyUpdates(updateGroup);

			if (!validateModifiedFiles(modifiedFiles)) {
				const errorDesc = updateGroup.length === 1 ? updateGroup[0].nameWithOwner : "grouped updates";
				throw new Error(`Failed to validate modified files for ${errorDesc}`);
			}

			core.info(`Modified ${modifiedFiles.length} file(s)`);

			const commitMessage = createCommitMessage(updateGroup, commitMessagePrefix);

			core.info(`Branch: ${branchName}`);
			core.info(`Commit message: ${commitMessage.split("\n")[0]}`);

			await createOrUpdateBranch(octokit, owner, repo, branchName, baseSha);

			const workspacePrefix = `${workspacePath}${path.sep}`;
			const files = modifiedFiles.map((filePath) => ({
				path: filePath.startsWith(workspacePrefix) ? filePath.slice(workspacePrefix.length) : filePath,
				content: fs.readFileSync(filePath),
			}));

			const commitSha = await createCommit(octokit, owner, repo, branchName, baseSha, commitMessage, files);

			core.info(`✅ Created commit: ${commitSha}`);

			const prBody = await generatePRBody(updateGroup, octokit);

			try {
				const pr = await createOrUpdatePR(
					octokit,
					owner,
					repo,
					branchName,
					baseBranch,
					prTitle,
					prBody,
					prLabels,
					assignmentConfig,
				);
				createdPRs.push(pr);

				// Handle auto-merge if enabled (only for single extension updates or when all updates qualify)
				if (updateGroup.length === 1 && shouldAutoMerge(updateGroup[0], autoMergeConfig)) {
					core.info(`🤖 Auto-merge enabled for ${updateGroup[0].nameWithOwner}`);

					// Check if auto-merge is already enabled
					const alreadyEnabled = await isAutoMergeEnabled(octokit, owner, repo, pr.number);

					if (alreadyEnabled) {
						core.info(`   Auto-merge already enabled for PR #${pr.number}`);
					} else {
						await enableAutoMerge(octokit, owner, repo, pr.number, autoMergeConfig.mergeMethod);
					}
				} else if (updateGroup.length > 1 && autoMergeConfig.enabled) {
					// For grouped updates, check if all updates qualify for auto-merge
					const allQualify = updateGroup.every((u) => shouldAutoMerge(u, autoMergeConfig));
					if (allQualify) {
						core.info(`🤖 Auto-merge enabled for grouped updates (all ${updateGroup.length} updates qualify)`);
						const alreadyEnabled = await isAutoMergeEnabled(octokit, owner, repo, pr.number);
						if (!alreadyEnabled) {
							await enableAutoMerge(octokit, owner, repo, pr.number, autoMergeConfig.mergeMethod);
						}
					} else {
						core.info(
							`ℹ️ Auto-merge not applicable for grouped updates (not all updates qualify for strategy: ${autoMergeConfig.strategy})`,
						);
					}
				} else if (updateGroup.length === 1 && autoMergeConfig.enabled) {
					core.info(
						`ℹ️ Auto-merge not applicable for ${updateGroup[0].nameWithOwner} (strategy: ${autoMergeConfig.strategy})`,
					);
				}
			} catch (error) {
				const errorDesc = updateGroup.length === 1 ? updateGroup[0].nameWithOwner : "grouped updates";
				core.error(`Failed to create/update PR for ${errorDesc}: ${error}`);
				throw error;
			}

			core.endGroup();
		}

		if (createdPRs.length > 0) {
			core.setOutput("pr-number", createdPRs[0].number.toString());
			core.setOutput("pr-url", createdPRs[0].url);
			core.info(`📊 Summary: Created/updated ${createdPRs.length} PR(s)`);

			// Generate job summary
			core.startGroup("📋 Generating Job Summary");

			core.summary.addHeading("Extension Updates Summary", 2);
			core.summary.addRaw(
				`Successfully created/updated ${createdPRs.length} PR${createdPRs.length > 1 ? "s" : ""}`,
				true,
			);
			core.summary.addBreak();

			// Configuration section
			core.summary.addHeading("Configuration", 3);
			const configTable = [
				[
					{ data: "Setting", header: true },
					{ data: "Value", header: true },
				],
				[
					{ data: "Mode", header: false },
					{ data: groupUpdates ? "Grouped updates (single PR)" : "Individual PRs (one per extension)", header: false },
				],
				[
					{ data: "Update Strategy", header: false },
					{ data: updateStrategy, header: false },
				],
			];

			if (filterConfig.include.length > 0) {
				configTable.push([
					{ data: "Include Filter", header: false },
					{ data: filterConfig.include.join(", "), header: false },
				]);
			}
			if (filterConfig.exclude.length > 0) {
				configTable.push([
					{ data: "Exclude Filter", header: false },
					{ data: filterConfig.exclude.join(", "), header: false },
				]);
			}
			if (autoMergeConfig.enabled) {
				configTable.push([
					{ data: "Auto-Merge", header: false },
					{
						data: `Enabled (${autoMergeConfig.strategy} updates, ${autoMergeConfig.mergeMethod} method)`,
						header: false,
					},
				]);
			} else {
				configTable.push([
					{ data: "Auto-Merge", header: false },
					{ data: "Disabled", header: false },
				]);
			}

			core.summary.addTable(configTable);
			core.summary.addBreak();

			// Updates section
			core.summary.addHeading("Applied Updates", 3);

			// Create a map of updates to their PRs
			const updateToPR = new Map<string, { number: number; url: string }>();
			if (groupUpdates && createdPRs.length > 0) {
				// All updates go to the same PR
				const pr = createdPRs[0];
				for (const update of updates) {
					updateToPR.set(update.nameWithOwner, pr);
				}
			} else {
				// Match individual updates to their PRs (assumes same order)
				for (let i = 0; i < Math.min(updates.length, createdPRs.length); i++) {
					updateToPR.set(updates[i].nameWithOwner, createdPRs[i]);
				}
			}

			const updatesTable = [
				[
					{ data: "Extension", header: true },
					{ data: "Current", header: true },
					{ data: "Latest", header: true },
					{ data: "Pull Request", header: true },
					{ data: "Auto-Merge", header: true },
				],
			];

			for (const update of updates) {
				const pr = updateToPR.get(update.nameWithOwner);
				const prLink = pr ? `[#${pr.number}](${pr.url})` : "N/A";
				const autoMergeStatus = shouldAutoMerge(update, autoMergeConfig) ? "✓ Yes" : "✗ No";

				updatesTable.push([
					{ data: update.nameWithOwner, header: false },
					{ data: update.currentVersion, header: false },
					{ data: update.latestVersion, header: false },
					{ data: prLink, header: false },
					{ data: autoMergeStatus, header: false },
				]);
			}

			core.summary.addTable(updatesTable);
			core.summary.addBreak();

			await core.summary.write();

			core.endGroup();
		}

		core.info("🎉 Successfully completed!");
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed("An unknown error occurred");
		}
	}
}

run();
