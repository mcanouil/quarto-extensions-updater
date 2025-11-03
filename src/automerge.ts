import * as core from "@actions/core";
import * as semver from "semver";
import type { OctokitClient } from "./github";
import type { ExtensionUpdate, AutoMergeConfig, UpdateType, MergeMethod } from "./types";

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
 * Enables auto-merge on a pull request
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

		// Use GraphQL API to enable auto-merge
		// The REST API doesn't support auto-merge directly
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

		// First, get the PR node ID
		const prData = await octokit.rest.pulls.get({
			owner,
			repo,
			pull_number: prNumber,
		});

		const pullRequestId = prData.data.node_id;

		// Convert merge method to GraphQL enum format
		const mergeMethodEnum = mergeMethod.toUpperCase();

		// Enable auto-merge using GraphQL
		await octokit.graphql(mutation, {
			pullRequestId,
			mergeMethod: mergeMethodEnum,
		});

		core.info(`Successfully enabled auto-merge for PR #${prNumber}`);
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
