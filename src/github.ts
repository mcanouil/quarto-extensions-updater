import * as core from "@actions/core";
import * as github from "@actions/github";

export const GIT_CONFLICT_STATUS = 422;

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
	octokit: ReturnType<typeof github.getOctokit>,
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
		core.debug(`Error checking for existing PR: ${error}`);
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
	octokit: ReturnType<typeof github.getOctokit>,
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
		if (error instanceof Error && "status" in error && error.status === GIT_CONFLICT_STATUS) {
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
 * Creates or updates a pull request
 * @param octokit GitHub API client
 * @param owner Repository owner
 * @param repo Repository name
 * @param branchName Branch name
 * @param baseBranch Base branch name
 * @param prTitle PR title
 * @param prBody PR body
 * @param prLabels Labels to apply
 * @returns PR number and URL
 */
export async function createOrUpdatePR(
	octokit: ReturnType<typeof github.getOctokit>,
	owner: string,
	repo: string,
	branchName: string,
	baseBranch: string,
	prTitle: string,
	prBody: string,
	prLabels: string[],
): Promise<{ number: number; url: string }> {
	const existingPRs = await octokit.rest.pulls.list({
		owner,
		repo,
		head: `${owner}:${branchName}`,
		state: "open",
	});

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

		core.info(`✅ Updated PR: ${updatedPR.html_url}`);
		return { number: updatedPR.number, url: updatedPR.html_url };
	}

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

	core.info(`✅ Created PR: ${pr.html_url}`);
	return { number: pr.number, url: pr.html_url };
}
