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
import type { AutoMergeConfig, AutoMergeStrategy, MergeMethod } from "./types";

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
		const updates = checkForUpdates(workspacePath, registry);
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

		for (const update of updates) {
			core.startGroup(`📝 Processing ${update.nameWithOwner}`);

			const branchName = createBranchName([update], branchPrefix);
			const prTitle = generatePRTitle([update], prTitlePrefix);

			const existingPR = await checkExistingPR(octokit, owner, repo, branchName, prTitle);
			if (existingPR.exists && existingPR.prNumber && existingPR.prUrl) {
				core.info(
					`ℹ️ PR #${existingPR.prNumber} already exists for ${update.nameWithOwner}@${update.latestVersion}, skipping...`,
				);
				core.info(`   URL: ${existingPR.prUrl}`);
				createdPRs.push({ number: existingPR.prNumber, url: existingPR.prUrl });
				core.endGroup();
				continue;
			}

			const modifiedFiles = applyUpdates([update]);

			if (!validateModifiedFiles(modifiedFiles)) {
				throw new Error(`Failed to validate modified files for ${update.nameWithOwner}`);
			}

			core.info(`Modified ${modifiedFiles.length} file(s)`);

			const commitMessage = createCommitMessage([update], commitMessagePrefix);

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

			const prBody = await generatePRBody([update], octokit);

			try {
				const pr = await createOrUpdatePR(octokit, owner, repo, branchName, baseBranch, prTitle, prBody, prLabels);
				createdPRs.push(pr);

				// Handle auto-merge if enabled
				if (shouldAutoMerge(update, autoMergeConfig)) {
					core.info(`🤖 Auto-merge enabled for ${update.nameWithOwner}`);

					// Check if auto-merge is already enabled
					const alreadyEnabled = await isAutoMergeEnabled(octokit, owner, repo, pr.number);

					if (alreadyEnabled) {
						core.info(`   Auto-merge already enabled for PR #${pr.number}`);
					} else {
						await enableAutoMerge(octokit, owner, repo, pr.number, autoMergeConfig.mergeMethod);
					}
				} else if (autoMergeConfig.enabled) {
					core.info(`ℹ️ Auto-merge not applicable for ${update.nameWithOwner} (strategy: ${autoMergeConfig.strategy})`);
				}
			} catch (error) {
				core.error(`Failed to create/update PR for ${update.nameWithOwner}: ${error}`);
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
