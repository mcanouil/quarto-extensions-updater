import * as core from "@actions/core";
import * as semver from "semver";
import type { OctokitClient } from "./github";
import type { ExtensionUpdate, AutoMergeConfig, UpdateType, MergeMethod } from "./types";
import { sleep } from "./utils";
import { AUTO_MERGE_INITIAL_DELAY_MS, AUTO_MERGE_RETRY_DELAY_MS } from "./constants";

/**
 * Determines the type of version update based on semver
 */
export function getUpdateType(currentVersion: string, latestVersion: string): UpdateType {
	try {
		const diff = semver.diff(currentVersion, latestVersion);

		if (!diff) {
			return "unknown";
		}

		if (diff === "major" || diff === "premajor") {
			return "major";
		}

		if (diff === "minor" || diff === "preminor") {
			return "minor";
		}

		if (diff === "patch" || diff === "prepatch") {
			return "patch";
		}

		return "unknown";
	} catch {
		return "unknown";
	}
}

/**
 * Determines if an update should be auto-merged based on the configured strategy
 */
export function shouldAutoMerge(update: ExtensionUpdate, config: AutoMergeConfig): boolean {
	if (!config.enabled) {
		return false;
	}

	const updateType = getUpdateType(update.currentVersion, update.latestVersion);

	switch (config.strategy) {
		case "patch":
			return updateType === "patch";
		case "minor":
			return updateType === "patch" || updateType === "minor";
		case "all":
			return true;
		default:
			return false;
	}
}

/**
 * Checks if an error is the "clean status" error from GitHub
 */
function isCleanStatusError(error: unknown): boolean {
	return error instanceof Error && error.message.toLowerCase().includes("pull request is in clean status");
}

/**
 * Attempts to enable auto-merge with the GraphQL API
 */
async function attemptEnableAutoMerge(
	octokit: OctokitClient,
	pullRequestId: string,
	mergeMethod: string,
): Promise<void> {
	const mutation = `
		mutation EnableAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
			enablePullRequestAutoMerge(input: {
				pullRequestId: $pullRequestId
				mergeMethod: $mergeMethod
			}) {
				pullRequest {
					id
					number
					autoMergeRequest {
						enabledAt
						enabledBy {
							login
						}
					}
				}
			}
		}
	`;

	await octokit.graphql(mutation, {
		pullRequestId,
		mergeMethod,
	});
}

/**
 * Enables auto-merge on a pull request with delay and retry logic
 */
export async function enableAutoMerge(
	octokit: OctokitClient,
	owner: string,
	repo: string,
	prNumber: number,
	mergeMethod: MergeMethod,
): Promise<void> {
	try {
		core.info(`Enabling auto-merge for PR #${prNumber} with ${mergeMethod} method`);

		// Get the PR node ID
		const prData = await octokit.rest.pulls.get({
			owner,
			repo,
			pull_number: prNumber,
		});

		const pullRequestId = prData.data.node_id;
		const mergeMethodEnum = mergeMethod.toUpperCase();

		// Wait before attempting to enable auto-merge
		// This gives GitHub time to compute the PR's mergeable state
		core.debug(`Waiting ${AUTO_MERGE_INITIAL_DELAY_MS}ms before enabling auto-merge...`);
		await sleep(AUTO_MERGE_INITIAL_DELAY_MS);

		try {
			// First attempt to enable auto-merge
			await attemptEnableAutoMerge(octokit, pullRequestId, mergeMethodEnum);
			core.info(`✅ Successfully enabled auto-merge for PR #${prNumber}`);
		} catch (firstError) {
			// Check if this is the "clean status" error
			if (isCleanStatusError(firstError)) {
				core.info(`PR #${prNumber} is in clean status, waiting ${AUTO_MERGE_RETRY_DELAY_MS}ms before retrying...`);
				await sleep(AUTO_MERGE_RETRY_DELAY_MS);

				try {
					// Retry once
					await attemptEnableAutoMerge(octokit, pullRequestId, mergeMethodEnum);
					core.info(`✅ Successfully enabled auto-merge for PR #${prNumber} on retry`);
				} catch (retryError) {
					// Still failed after retry
					core.warning(
						`Failed to enable auto-merge for PR #${prNumber} after retry: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
					);
					core.warning(
						"This may occur if the repository has no required status checks configured. " +
							"Auto-merge requires at least one required status check or branch protection rule.",
					);
				}
			} else {
				// Different error - rethrow to be caught by outer catch
				throw firstError;
			}
		}
	} catch (error) {
		// Log the error but don't fail the action
		core.warning(
			`Failed to enable auto-merge for PR #${prNumber}: ${error instanceof Error ? error.message : String(error)}`,
		);

		// Check if it's a permissions issue
		if (error instanceof Error && error.message.includes("permissions")) {
			core.warning(
				"Auto-merge requires the workflow to have write permissions for pull-requests. " +
					"Please ensure your workflow has 'pull-requests: write' permission.",
			);
		}
	}
}

/**
 * Checks if auto-merge is already enabled on a PR
 */
export async function isAutoMergeEnabled(
	octokit: OctokitClient,
	owner: string,
	repo: string,
	prNumber: number,
): Promise<boolean> {
	try {
		const query = `
			query CheckAutoMerge($owner: String!, $repo: String!, $prNumber: Int!) {
				repository(owner: $owner, name: $repo) {
					pullRequest(number: $prNumber) {
						autoMergeRequest {
							enabledAt
						}
					}
				}
			}
		`;

		const result = await octokit.graphql<{
			repository: {
				pullRequest: {
					autoMergeRequest: {
						enabledAt: string;
					} | null;
				};
			};
		}>(query, {
			owner,
			repo,
			prNumber,
		});

		return result.repository.pullRequest.autoMergeRequest !== null;
	} catch (error) {
		core.warning(
			`Failed to check auto-merge status for PR #${prNumber}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}
}
