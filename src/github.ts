import * as core from "@actions/core";
import * as github from "@actions/github";
import type { PRAssignmentConfig, ExtensionUpdate, AutoMergeConfig, UpdateStrategy, ExtensionFilterConfig } from "./types";
import { HTTP_UNPROCESSABLE_ENTITY, HTTP_NOT_FOUND, GIT_FILE_MODE_REGULAR } from "./constants";
import { generateDryRunMarkdown } from "./summary";

/** GitHub API error with status code */
interface GitHubError extends Error {
	status: number;
}

/** Type guard to check if an error is a GitHub API error with status code */
function isGitHubError(error: unknown): error is GitHubError {
	return (
		error instanceof Error && "status" in error && typeof (error as Error & { status?: unknown }).status === "number"
	);
}

/** Type alias for GitHub Octokit client */
export type OctokitClient = ReturnType<typeof github.getOctokit>;

export interface ExistingPRResult {
	exists: boolean;
	prNumber?: number;
	prUrl?: string;
}

/**
 * Checks if a PR already exists for a specific branch and title
 * @param octokit GitHub API client
 * @param owner Repository owner
 * @param repo Repository name
 * @param branchName Branch name to check
 * @param expectedTitle Expected PR title
 * @returns ExistingPRResult with PR details if found
 */
export async function checkExistingPR(
	octokit: OctokitClient,
	owner: string,
	repo: string,
	branchName: string,
	expectedTitle: string,
): Promise<ExistingPRResult> {
	try {
		const existingPRs = await octokit.rest.pulls.list({
			owner,
			repo,
			head: `${owner}:${branchName}`,
			state: "open",
		});

		if (existingPRs.data.length > 0) {
			const existingPR = existingPRs.data[0];
			if (existingPR.title === expectedTitle) {
				return {
					exists: true,
					prNumber: existingPR.number,
					prUrl: existingPR.html_url,
				};
			}
		}
	} catch (error) {
		if (isGitHubError(error)) {
			if (error.status === HTTP_NOT_FOUND) {
				core.debug(`No existing PRs found for branch: ${branchName}`);
				return { exists: false };
			}
		}
		core.warning(`Unexpected error checking for existing PR on branch ${branchName}: ${error}`);
		throw error;
	}

	return { exists: false };
}

/**
 * Creates a new branch or updates an existing one
 * @param octokit GitHub API client
 * @param owner Repository owner
 * @param repo Repository name
 * @param branchName Branch name
 * @param baseSha SHA to point the branch to
 */
export async function createOrUpdateBranch(
	octokit: OctokitClient,
	owner: string,
	repo: string,
	branchName: string,
	baseSha: string,
): Promise<void> {
	try {
		await octokit.rest.git.createRef({
			owner,
			repo,
			ref: `refs/heads/${branchName}`,
			sha: baseSha,
		});
		core.info(`✅ Created branch: ${branchName}`);
	} catch (error: unknown) {
		if (isGitHubError(error) && error.status === HTTP_UNPROCESSABLE_ENTITY) {
			core.info(`Branch ${branchName} already exists, updating it...`);
			await octokit.rest.git.updateRef({
				owner,
				repo,
				ref: `heads/${branchName}`,
				sha: baseSha,
				force: true,
			});
		} else {
			throw error;
		}
	}
}

/**
 * Requests reviewers and assignees for a pull request
 * @param octokit GitHub API client
 * @param owner Repository owner
 * @param repo Repository name
 * @param prNumber PR number
 * @param assignmentConfig Reviewer and assignee configuration
 */
export async function requestReviewersAndAssignees(
	octokit: OctokitClient,
	owner: string,
	repo: string,
	prNumber: number,
	assignmentConfig: PRAssignmentConfig,
): Promise<void> {
	try {
		// Request reviewers (individual users and teams)
		if (assignmentConfig.reviewers.length > 0 || assignmentConfig.teamReviewers.length > 0) {
			await octokit.rest.pulls.requestReviewers({
				owner,
				repo,
				pull_number: prNumber,
				reviewers: assignmentConfig.reviewers,
				team_reviewers: assignmentConfig.teamReviewers,
			});

			const reviewerList = [
				...assignmentConfig.reviewers,
				...assignmentConfig.teamReviewers.map((team) => `@${owner}/${team}`),
			];
			core.info(`✅ Requested reviewers: ${reviewerList.join(", ")}`);
		}

		// Assign users to the PR
		if (assignmentConfig.assignees.length > 0) {
			await octokit.rest.issues.addAssignees({
				owner,
				repo,
				issue_number: prNumber,
				assignees: assignmentConfig.assignees,
			});
			core.info(`✅ Added assignees: ${assignmentConfig.assignees.join(", ")}`);
		}
	} catch (error) {
		core.warning(`Failed to set reviewers/assignees: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Creates or updates a pull request
 * @param octokit GitHub API client
 * @param owner Repository owner
 * @param repo Repository name
 * @param branchName Branch name
 * @param baseBranch Base branch name
 * @param prTitle PR title
 * @param prBody PR body
 * @param prLabels Labels to apply
 * @param assignmentConfig Optional reviewer and assignee configuration
 * @returns PR number and URL
 */
export async function createOrUpdatePR(
	octokit: OctokitClient,
	owner: string,
	repo: string,
	branchName: string,
	baseBranch: string,
	prTitle: string,
	prBody: string,
	prLabels: string[],
	assignmentConfig?: PRAssignmentConfig,
): Promise<{ number: number; url: string }> {
	const existingPRs = await octokit.rest.pulls.list({
		owner,
		repo,
		head: `${owner}:${branchName}`,
		state: "open",
	});

	let prNumber: number;
	let prUrl: string;

	if (existingPRs.data.length > 0) {
		const existingPR = existingPRs.data[0];
		core.info(`Updating existing PR #${existingPR.number}`);

		const { data: updatedPR } = await octokit.rest.pulls.update({
			owner,
			repo,
			pull_number: existingPR.number,
			title: prTitle,
			body: prBody,
		});

		await octokit.rest.issues.setLabels({
			owner,
			repo,
			issue_number: existingPR.number,
			labels: prLabels,
		});

		prNumber = updatedPR.number;
		prUrl = updatedPR.html_url;
		core.info(`✅ Updated PR: ${prUrl}`);
	} else {
		const { data: pr } = await octokit.rest.pulls.create({
			owner,
			repo,
			title: prTitle,
			body: prBody,
			head: branchName,
			base: baseBranch,
		});

		await octokit.rest.issues.setLabels({
			owner,
			repo,
			issue_number: pr.number,
			labels: prLabels,
		});

		prNumber = pr.number;
		prUrl = pr.html_url;
		core.info(`✅ Created PR: ${prUrl}`);
	}

	// Request reviewers and assignees if configured
	if (assignmentConfig) {
		await requestReviewersAndAssignees(octokit, owner, repo, prNumber, assignmentConfig);
	}

	return { number: prNumber, url: prUrl };
}

/**
 * Creates a Git commit with the specified files
 * @param octokit GitHub API client
 * @param owner Repository owner
 * @param repo Repository name
 * @param branchName Branch name to update
 * @param baseSha Base commit SHA
 * @param message Commit message
 * @param files Array of files with path and content
 * @returns Commit SHA
 */
export async function createCommit(
	octokit: OctokitClient,
	owner: string,
	repo: string,
	branchName: string,
	baseSha: string,
	message: string,
	files: { path: string; content: Buffer }[],
): Promise<string> {
	const { data: baseTree } = await octokit.rest.git.getTree({
		owner,
		repo,
		tree_sha: baseSha,
	});

	const tree = await Promise.all(
		files.map(async (file) => {
			const { data: blob } = await octokit.rest.git.createBlob({
				owner,
				repo,
				content: file.content.toString("base64"),
				encoding: "base64",
			});

			return {
				path: file.path,
				mode: GIT_FILE_MODE_REGULAR,
				type: "blob" as const,
				sha: blob.sha,
			};
		}),
	);

	const { data: newTree } = await octokit.rest.git.createTree({
		owner,
		repo,
		base_tree: baseTree.sha,
		tree,
	});

	const { data: commit } = await octokit.rest.git.createCommit({
		owner,
		repo,
		message,
		tree: newTree.sha,
		parents: [baseSha],
	});

	await octokit.rest.git.updateRef({
		owner,
		repo,
		ref: `heads/${branchName}`,
		sha: commit.sha,
	});

	return commit.sha;
}

/**
 * Creates a GitHub issue with dry-run update summary
 * @param octokit GitHub API client
 * @param owner Repository owner
 * @param repo Repository name
 * @param updates Array of extension updates found
 * @param groupUpdates Whether updates would be grouped
 * @param updateStrategy The update strategy being used
 * @param filterConfig Extension filtering configuration
 * @param autoMergeConfig Auto-merge configuration
 * @returns Issue number and URL
 */
export async function createIssueForUpdates(
	octokit: OctokitClient,
	owner: string,
	repo: string,
	updates: ExtensionUpdate[],
	groupUpdates: boolean,
	updateStrategy: UpdateStrategy,
	filterConfig: ExtensionFilterConfig,
	autoMergeConfig: AutoMergeConfig,
): Promise<{ number: number; url: string }> {
	const title = `Quarto Extensions Updates Available (${updates.length} update${updates.length > 1 ? "s" : ""})`;

	// Generate the same markdown content as the job summary
	const body = generateDryRunMarkdown(updates, groupUpdates, updateStrategy, filterConfig, autoMergeConfig);

	const { data: issue } = await octokit.rest.issues.create({
		owner,
		repo,
		title,
		body,
	});

	core.info(`✅ Created issue: ${issue.html_url}`);

	return { number: issue.number, url: issue.html_url };
}
