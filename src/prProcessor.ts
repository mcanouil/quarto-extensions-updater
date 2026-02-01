import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import { applyUpdates, createBranchName, createCommitMessage, validateModifiedFiles } from "./git";
import { generatePRTitle, generatePRBody } from "./pr";
import { checkExistingPR, createOrUpdateBranch, createOrUpdatePR, createCommit, type OctokitClient } from "./github";
import { shouldAutoMerge, enableAutoMerge, isAutoMergeEnabled } from "./automerge";
import type { ExtensionUpdate, AutoMergeConfig, PRAssignmentConfig, SkippedUpdate } from "./types";

/**
 * Result of processing a PR
 */
export interface PRProcessingResult {
	number: number;
	url: string;
	extensions: string[];
	skippedUpdates?: SkippedUpdate[];
}

/**
 * Configuration for PR processing
 */
export interface PRProcessingConfig {
	workspacePath: string;
	baseBranch: string;
	baseSha: string;
	branchPrefix: string;
	prTitlePrefix: string;
	commitMessagePrefix: string;
	prLabels: string[];
	autoMergeConfig: AutoMergeConfig;
	assignmentConfig: PRAssignmentConfig;
}

/**
 * Handles auto-merge logic for a PR
 */
async function handleAutoMerge(
	octokit: OctokitClient,
	owner: string,
	repo: string,
	prNumber: number,
	updateGroup: ExtensionUpdate[],
	autoMergeConfig: AutoMergeConfig,
): Promise<void> {
	if (!autoMergeConfig.enabled) {
		return;
	}

	// For single extension updates
	if (updateGroup.length === 1) {
		if (shouldAutoMerge(updateGroup[0], autoMergeConfig)) {
			core.info(`🤖 Auto-merge enabled for ${updateGroup[0].nameWithOwner}`);

			const alreadyEnabled = await isAutoMergeEnabled(octokit, owner, repo, prNumber);

			if (alreadyEnabled) {
				core.info(`   Auto-merge already enabled for PR #${prNumber}`);
			} else {
				await enableAutoMerge(octokit, owner, repo, prNumber, autoMergeConfig.mergeMethod);
			}
		} else {
			core.info(
				`ℹ️ Auto-merge not applicable for ${updateGroup[0].nameWithOwner} (strategy: ${autoMergeConfig.strategy})`,
			);
		}
		return;
	}

	// For grouped updates, check if all updates qualify for auto-merge
	const allQualify = updateGroup.every((u) => shouldAutoMerge(u, autoMergeConfig));
	if (allQualify) {
		core.info(`🤖 Auto-merge enabled for grouped updates (all ${updateGroup.length} updates qualify)`);
		const alreadyEnabled = await isAutoMergeEnabled(octokit, owner, repo, prNumber);
		if (!alreadyEnabled) {
			await enableAutoMerge(octokit, owner, repo, prNumber, autoMergeConfig.mergeMethod);
		}
	} else {
		core.info(
			`ℹ️ Auto-merge not applicable for grouped updates (not all updates qualify for strategy: ${autoMergeConfig.strategy})`,
		);
	}
}

/**
 * Processes a single update group (either a single extension or multiple grouped extensions)
 */
export async function processPRForUpdateGroup(
	octokit: OctokitClient,
	owner: string,
	repo: string,
	updateGroup: ExtensionUpdate[],
	config: PRProcessingConfig,
): Promise<PRProcessingResult> {
	const branchName = createBranchName(updateGroup, config.branchPrefix);
	const prTitle = generatePRTitle(updateGroup, config.prTitlePrefix);

	// Check for existing PR
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
		return { number: existingPR.prNumber, url: existingPR.prUrl, extensions: updateGroup.map((u) => u.nameWithOwner) };
	}

	// Apply updates and validate
	const { modifiedFiles, skippedUpdates } = applyUpdates(updateGroup);

	if (skippedUpdates.length > 0) {
		core.warning(`Skipped ${skippedUpdates.length} extension(s) during update`);
		for (const skipped of skippedUpdates) {
			core.warning(`  - ${skipped.update.nameWithOwner}: ${skipped.reason}`);
		}
	}

	if (modifiedFiles.length === 0) {
		const errorDesc = updateGroup.length === 1 ? updateGroup[0].nameWithOwner : "grouped updates";
		core.warning(`No files modified for ${errorDesc}, all extensions may have been skipped`);
		return { number: 0, url: "", extensions: updateGroup.map((u) => u.nameWithOwner), skippedUpdates };
	}

	if (!validateModifiedFiles(modifiedFiles)) {
		const errorDesc = updateGroup.length === 1 ? updateGroup[0].nameWithOwner : "grouped updates";
		throw new Error(`Failed to validate modified files for ${errorDesc}`);
	}

	core.info(`Modified ${modifiedFiles.length} file(s)`);

	// Create commit
	const commitMessage = createCommitMessage(updateGroup, config.commitMessagePrefix);
	core.info(`Branch: ${branchName}`);
	core.info(`Commit message: ${commitMessage.split("\n")[0]}`);

	await createOrUpdateBranch(octokit, owner, repo, branchName, config.baseSha);

	const workspacePrefix = `${config.workspacePath}${path.sep}`;
	const files = modifiedFiles.map((filePath) => ({
		path: filePath.startsWith(workspacePrefix) ? filePath.slice(workspacePrefix.length) : filePath,
		content: fs.readFileSync(filePath),
	}));

	const commitSha = await createCommit(octokit, owner, repo, branchName, config.baseSha, commitMessage, files);

	core.info(`✅ Created commit: ${commitSha}`);

	// Create or update PR
	const prBody = await generatePRBody(updateGroup, octokit, skippedUpdates);

	try {
		const pr = await createOrUpdatePR(
			octokit,
			owner,
			repo,
			branchName,
			config.baseBranch,
			prTitle,
			prBody,
			config.prLabels,
			config.assignmentConfig,
		);

		// Handle auto-merge
		await handleAutoMerge(octokit, owner, repo, pr.number, updateGroup, config.autoMergeConfig);

		return { ...pr, extensions: updateGroup.map((u) => u.nameWithOwner), skippedUpdates };
	} catch (error) {
		const errorDesc = updateGroup.length === 1 ? updateGroup[0].nameWithOwner : "grouped updates";
		core.error(`Failed to create/update PR for ${errorDesc}: ${error}`);
		throw error;
	}
}

/**
 * Processes all update groups and returns results
 */
export async function processAllPRs(
	octokit: OctokitClient,
	owner: string,
	repo: string,
	updates: ExtensionUpdate[],
	groupUpdates: boolean,
	config: PRProcessingConfig,
): Promise<PRProcessingResult[]> {
	const createdPRs: PRProcessingResult[] = [];

	// Determine whether to create one PR for all updates or one PR per extension
	const updateGroups = groupUpdates ? [updates] : updates.map((u) => [u]);

	for (const updateGroup of updateGroups) {
		const groupDescription =
			updateGroup.length === 1 ? updateGroup[0].nameWithOwner : `${updateGroup.length} extensions`;
		core.startGroup(`📝 Processing ${groupDescription}`);

		try {
			const pr = await processPRForUpdateGroup(octokit, owner, repo, updateGroup, config);
			createdPRs.push(pr);
		} catch (error) {
			core.error(`Failed to process ${groupDescription}: ${error}`);
			throw error;
		} finally {
			core.endGroup();
		}
	}

	return createdPRs;
}
