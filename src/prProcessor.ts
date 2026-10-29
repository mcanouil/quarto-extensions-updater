import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import { applyUpdates, createBranchName, createCommitMessage, getCheckedOutSha, validateModifiedFiles } from "./git.js";
import { generatePRTitle, generatePRBody } from "./pr.js";
import { extensionNames, groupCopies } from "./updates.js";
import {
	checkExistingPR,
	createOrUpdateBranch,
	createOrUpdatePR,
	createCommit,
	listBaseFiles,
	type OctokitClient,
} from "./github.js";
import { shouldAutoMerge, enableAutoMerge, isAutoMergeEnabled } from "./automerge.js";
import type { ExtensionUpdate, AutoMergeConfig, PRAssignmentConfig, SkippedUpdate } from "./types.js";

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
 * Result of processing all PRs, including skipped updates from groups that produced no PR
 */
export interface ProcessAllPRsResult {
	createdPRs: PRProcessingResult[];
	skippedUpdates: SkippedUpdate[];
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
	if (!autoMergeConfig.enabled || updateGroup.length === 0) {
		return;
	}

	// For single extension updates, every copy of the extension must qualify
	if (extensionNames(updateGroup).length === 1) {
		if (updateGroup.every((u) => shouldAutoMerge(u, autoMergeConfig))) {
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
 * Returns a human-readable description of an update group
 */
function describeUpdateGroup(updateGroup: ExtensionUpdate[]): string {
	return extensionNames(updateGroup).length === 1 ? updateGroup[0].nameWithOwner : "grouped updates";
}

/**
 * Prepares files for a Git commit by stripping the workspace prefix and reading contents
 */
function prepareCommitFiles(modifiedFiles: string[], workspacePath: string): { path: string; content: Buffer }[] {
	const workspacePrefix = `${workspacePath}${path.sep}`;
	return modifiedFiles.map((filePath) => ({
		path: filePath.startsWith(workspacePrefix) ? filePath.slice(workspacePrefix.length) : filePath,
		content: fs.readFileSync(filePath),
	}));
}

/**
 * Finds files that the base commit has in an updated extension folder but that the new release no longer ships
 * @returns The removed files of each extension, keyed by `owner/name`, each file credited to its innermost extension
 */
async function findRemovedFiles(
	octokit: OctokitClient,
	owner: string,
	repo: string,
	appliedUpdates: ExtensionUpdate[],
	config: PRProcessingConfig,
): Promise<Map<string, string[]>> {
	const removedFiles = new Map<string, string[]>();
	if (appliedUpdates.length === 0) {
		return removedFiles;
	}

	// Files missing on disk only mean "dropped" when the workspace holds the base commit
	const folders = appliedUpdates.map((update) => update.location).join(", ");
	const checkedOutSha = getCheckedOutSha(config.workspacePath);
	if (checkedOutSha !== config.baseSha) {
		core.warning(
			`The workspace is at ${checkedOutSha ?? "an unknown commit"}, not the base commit ${config.baseSha}, ` +
				`so files dropped by new releases are kept in: ${folders}`,
		);
		return removedFiles;
	}

	const baseFiles = await listBaseFiles(octokit, owner, repo, config.baseSha);
	if (baseFiles === null) {
		core.warning(
			`The base tree is too large to list in full, so files dropped by new releases are kept in: ${folders}`,
		);
		return removedFiles;
	}

	for (const file of baseFiles) {
		const owners = appliedUpdates.filter((update) => file.startsWith(`${update.location}/`));
		if (owners.length === 0 || fs.existsSync(path.join(config.workspacePath, file))) {
			continue;
		}
		const innermost = owners.reduce((a, b) => (b.location.length > a.location.length ? b : a));
		removedFiles.set(innermost.nameWithOwner, [...(removedFiles.get(innermost.nameWithOwner) ?? []), file]);
	}
	return removedFiles;
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
	const groupDesc = describeUpdateGroup(updateGroup);
	const branchName = createBranchName(updateGroup, config.branchPrefix);
	const prTitle = generatePRTitle(updateGroup, config.prTitlePrefix);

	// Check for existing PR
	const existingPR = await checkExistingPR(octokit, owner, repo, branchName, prTitle);
	if (existingPR.exists && existingPR.prNumber && existingPR.prUrl) {
		if (extensionNames(updateGroup).length === 1) {
			core.info(
				`ℹ️ PR #${existingPR.prNumber} already exists for ${updateGroup[0].nameWithOwner}@${updateGroup[0].latestVersion}, skipping...`,
			);
		} else {
			core.info(`ℹ️ PR #${existingPR.prNumber} already exists for grouped updates, skipping...`);
		}
		core.info(`   URL: ${existingPR.prUrl}`);
		return { number: existingPR.prNumber, url: existingPR.prUrl, extensions: extensionNames(updateGroup) };
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
		core.warning(`No files modified for ${groupDesc}, all extensions may have been skipped`);
		return { number: 0, url: "", extensions: extensionNames(updateGroup), skippedUpdates };
	}

	if (!validateModifiedFiles(modifiedFiles)) {
		throw new Error(`Failed to validate modified files for ${groupDesc}`);
	}

	core.info(`Modified ${modifiedFiles.length} file(s)`);

	const skippedManifests = new Set(skippedUpdates.map((skipped) => skipped.update.manifestPath));
	const appliedUpdates = updateGroup.filter((update) => !skippedManifests.has(update.manifestPath));
	const removedFiles = await findRemovedFiles(octokit, owner, repo, appliedUpdates, config);
	const removedPaths = [...removedFiles.values()].flat();
	if (removedPaths.length > 0) {
		core.info(`Removing ${removedPaths.length} file(s) that the new releases no longer ship`);
	}

	// Create commit
	const commitMessage = createCommitMessage(updateGroup, config.commitMessagePrefix);
	core.info(`Branch: ${branchName}`);
	core.info(`Commit message: ${commitMessage.split("\n")[0]}`);

	await createOrUpdateBranch(octokit, owner, repo, branchName, config.baseSha);

	const files = prepareCommitFiles(modifiedFiles, config.workspacePath);
	const commitSha = await createCommit(
		octokit,
		owner,
		repo,
		branchName,
		config.baseSha,
		commitMessage,
		files,
		removedPaths,
	);

	core.info(`✅ Created commit: ${commitSha}`);

	// Create or update PR
	const prBody = await generatePRBody(updateGroup, octokit, skippedUpdates, removedFiles);

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

		// Handle auto-merge, judged on the updates that were applied
		await handleAutoMerge(octokit, owner, repo, pr.number, appliedUpdates, config.autoMergeConfig);

		return { ...pr, extensions: extensionNames(updateGroup), skippedUpdates };
	} catch (error) {
		core.error(`Failed to create/update PR for ${groupDesc}: ${error}`);
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
): Promise<ProcessAllPRsResult> {
	const createdPRs: PRProcessingResult[] = [];
	const allSkippedUpdates: SkippedUpdate[] = [];

	// Determine whether to create one PR for all updates or one PR per extension
	const updateGroups = groupUpdates ? [updates] : groupCopies(updates);

	for (const updateGroup of updateGroups) {
		const extensionCount = extensionNames(updateGroup).length;
		const groupDescription = extensionCount === 1 ? updateGroup[0].nameWithOwner : `${extensionCount} extensions`;
		core.startGroup(`📝 Processing ${groupDescription}`);

		try {
			const result = await processPRForUpdateGroup(octokit, owner, repo, updateGroup, config);

			if (result.skippedUpdates && result.skippedUpdates.length > 0) {
				allSkippedUpdates.push(...result.skippedUpdates);
			}

			if (result.number > 0) {
				createdPRs.push(result);
			}
		} catch (error) {
			core.error(`Failed to process ${groupDescription}: ${error}`);
			throw error;
		} finally {
			core.endGroup();
		}
	}

	return { createdPRs, skippedUpdates: allSkippedUpdates };
}
