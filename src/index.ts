import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
import { fetchExtensionsRegistry } from "./registry";
import { checkForUpdates } from "./updates";
import { applyUpdates, createBranchName, createCommitMessage, validateModifiedFiles } from "./git";
import { generatePRTitle, generatePRBody, logUpdateSummary } from "./pr";
import { checkExistingPR, createOrUpdateBranch, createOrUpdatePR } from "./github";

const DEFAULT_BASE_BRANCH = "main";
const DEFAULT_BRANCH_PREFIX = "chore/quarto-extensions";
const DEFAULT_PR_TITLE_PREFIX = "chore(deps):";
const DEFAULT_COMMIT_MESSAGE_PREFIX = "chore(deps):";
const DEFAULT_PR_LABELS = "dependencies,quarto-extensions";
const FILE_MODE = "100644" as const;
const BLOB_TYPE = "blob" as const;

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

		const createdPRs: { number: number; url: string }[] = [];

		for (const update of updates) {
			core.startGroup(`📝 Processing ${update.nameWithOwner}`);

			const branchName = createBranchName([update], branchPrefix);
			const prTitle = generatePRTitle([update], prTitlePrefix);

			const existingPR = await checkExistingPR(octokit, owner, repo, branchName, prTitle);
			if (existingPR.exists) {
				core.info(
					`ℹ️ PR #${existingPR.prNumber} already exists for ${update.nameWithOwner}@${update.latestVersion}, skipping...`,
				);
				core.info(`   URL: ${existingPR.prUrl}`);
				createdPRs.push({ number: existingPR.prNumber!, url: existingPR.prUrl! });
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

			const { data: refData } = await octokit.rest.git.getRef({
				owner,
				repo,
				ref: `heads/${baseBranch}`,
			});

			const baseSha = refData.object.sha;

			await createOrUpdateBranch(octokit, owner, repo, branchName, baseSha);

			const { data: baseTree } = await octokit.rest.git.getTree({
				owner,
				repo,
				tree_sha: baseSha,
			});

			const tree = await Promise.all(
				modifiedFiles.map(async (filePath) => {
					const content = fs.readFileSync(filePath);
					const { data: blob } = await octokit.rest.git.createBlob({
						owner,
						repo,
						content: content.toString("base64"),
						encoding: "base64",
					});

					return {
						path: filePath.replace(`${workspacePath}/`, ""),
						mode: FILE_MODE,
						type: BLOB_TYPE,
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
				message: commitMessage,
				tree: newTree.sha,
				parents: [baseSha],
			});

			await octokit.rest.git.updateRef({
				owner,
				repo,
				ref: `heads/${branchName}`,
				sha: commit.sha,
			});

			core.info(`✅ Created commit: ${commit.sha}`);

			const prBody = await generatePRBody([update], octokit);

			try {
				const pr = await createOrUpdatePR(octokit, owner, repo, branchName, baseBranch, prTitle, prBody, prLabels);
				createdPRs.push(pr);
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
