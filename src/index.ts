import * as core from "@actions/core";
import * as github from "@actions/github";
import { fetchExtensionsRegistry } from "./registry";
import { checkForUpdates } from "./updates";
import { applyUpdates, createBranchName, createCommitMessage, validateModifiedFiles } from "./git";
import { generatePRTitle, generatePRBody, generatePRLabels, logUpdateSummary } from "./pr";

async function run(): Promise<void> {
	try {
		const githubToken = core.getInput("github-token", { required: true });
		const workspacePath = core.getInput("workspace-path") || process.cwd();
		const registryUrl = core.getInput("registry-url") || undefined;
		const createPR = core.getBooleanInput("create-pr") !== false;
		const baseBranch = core.getInput("base-branch") || "main";

		const octokit = github.getOctokit(githubToken);
		const context = github.context;

		core.info("🚀 Starting Quarto Extensions Updater...");
		core.info(`Workspace path: ${workspacePath}`);
		core.info(`Repository: ${context.repo.owner}/${context.repo.repo}`);
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

		core.startGroup("📝 Applying updates");
		const modifiedFiles = applyUpdates(updates);

		if (!validateModifiedFiles(modifiedFiles)) {
			throw new Error("Failed to validate modified files");
		}

		core.info(`Modified ${modifiedFiles.length} file(s)`);
		core.endGroup();

		core.startGroup("🌿 Creating branch and commit");
		const branchName = createBranchName(updates);
		const commitMessage = createCommitMessage(updates);

		core.info(`Branch: ${branchName}`);
		core.info(`Commit message: ${commitMessage.split("\n")[0]}`);

		const { data: refData } = await octokit.rest.git.getRef({
			owner: context.repo.owner,
			repo: context.repo.repo,
			ref: `heads/${baseBranch}`,
		});

		const baseSha = refData.object.sha;

		try {
			await octokit.rest.git.createRef({
				owner: context.repo.owner,
				repo: context.repo.repo,
				ref: `refs/heads/${branchName}`,
				sha: baseSha,
			});
			core.info(`✅ Created branch: ${branchName}`);
		} catch (error: unknown) {
			if (error instanceof Error && "status" in error && error.status === 422) {
				core.info(`Branch ${branchName} already exists, updating it...`);
				await octokit.rest.git.updateRef({
					owner: context.repo.owner,
					repo: context.repo.repo,
					ref: `heads/${branchName}`,
					sha: baseSha,
					force: true,
				});
			} else {
				throw error;
			}
		}

		const { data: baseTree } = await octokit.rest.git.getTree({
			owner: context.repo.owner,
			repo: context.repo.repo,
			tree_sha: baseSha,
		});

		const tree = await Promise.all(
			modifiedFiles.map(async (filePath) => {
				const fs = await import("fs");
				const content = fs.readFileSync(filePath);
				const { data: blob } = await octokit.rest.git.createBlob({
					owner: context.repo.owner,
					repo: context.repo.repo,
					content: content.toString("base64"),
					encoding: "base64",
				});

				return {
					path: filePath.replace(`${workspacePath}/`, ""),
					mode: "100644" as const,
					type: "blob" as const,
					sha: blob.sha,
				};
			}),
		);

		const { data: newTree } = await octokit.rest.git.createTree({
			owner: context.repo.owner,
			repo: context.repo.repo,
			base_tree: baseTree.sha,
			tree,
		});

		const { data: commit } = await octokit.rest.git.createCommit({
			owner: context.repo.owner,
			repo: context.repo.repo,
			message: commitMessage,
			tree: newTree.sha,
			parents: [baseSha],
		});

		await octokit.rest.git.updateRef({
			owner: context.repo.owner,
			repo: context.repo.repo,
			ref: `heads/${branchName}`,
			sha: commit.sha,
		});

		core.info(`✅ Created commit: ${commit.sha}`);
		core.endGroup();

		core.startGroup("🔀 Creating Pull Request");
		const prTitle = generatePRTitle(updates);
		const prBody = await generatePRBody(updates, octokit);
		const prLabels = generatePRLabels(updates);

		try {
			const existingPRs = await octokit.rest.pulls.list({
				owner: context.repo.owner,
				repo: context.repo.repo,
				head: `${context.repo.owner}:${branchName}`,
				state: "open",
			});

			if (existingPRs.data.length > 0) {
				const existingPR = existingPRs.data[0];
				core.info(`Updating existing PR #${existingPR.number}`);

				const { data: updatedPR } = await octokit.rest.pulls.update({
					owner: context.repo.owner,
					repo: context.repo.repo,
					pull_number: existingPR.number,
					title: prTitle,
					body: prBody,
				});

				await octokit.rest.issues.setLabels({
					owner: context.repo.owner,
					repo: context.repo.repo,
					issue_number: existingPR.number,
					labels: prLabels,
				});

				core.info(`✅ Updated PR: ${updatedPR.html_url}`);
				core.setOutput("pr-number", updatedPR.number.toString());
				core.setOutput("pr-url", updatedPR.html_url);
			} else {
				const { data: pr } = await octokit.rest.pulls.create({
					owner: context.repo.owner,
					repo: context.repo.repo,
					title: prTitle,
					body: prBody,
					head: branchName,
					base: baseBranch,
				});

				await octokit.rest.issues.setLabels({
					owner: context.repo.owner,
					repo: context.repo.repo,
					issue_number: pr.number,
					labels: prLabels,
				});

				core.info(`✅ Created PR: ${pr.html_url}`);
				core.setOutput("pr-number", pr.number.toString());
				core.setOutput("pr-url", pr.html_url);
			}
		} catch (error) {
			core.error(`Failed to create/update PR: ${error}`);
			throw error;
		}

		core.endGroup();

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
