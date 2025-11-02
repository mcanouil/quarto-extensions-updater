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
import type { AutoMergeConfig, AutoMergeStrategy, MergeMethod, ExtensionFilterConfig } from "./types";

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
		const updates = checkForUpdates(workspacePath, registry, filterConfig);
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
				const pr = await createOrUpdatePR(octokit, owner, repo, branchName, baseBranch, prTitle, prBody, prLabels);
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
