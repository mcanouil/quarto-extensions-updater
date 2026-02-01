import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
import { fetchExtensionsRegistry } from "./registry";
import { checkForUpdates } from "./updates";
import { logUpdateSummary } from "./pr";
import { parseInputs } from "./config";
import { generateDryRunSummary, generateCompletedSummary } from "./summary";
import { processAllPRs } from "./prProcessor";
import { createIssueForUpdates } from "./github";
import type { ExtensionUpdate, SkippedUpdate } from "./types";

/**
 * Validates that the workspace path exists
 * @param workspacePath The workspace path to validate
 * @throws Error if the workspace path does not exist
 */
function validateWorkspace(workspacePath: string): void {
	if (!fs.existsSync(workspacePath)) {
		throw new Error(`Workspace path does not exist: ${workspacePath}`);
	}
}

/**
 * Sets GitHub Actions output values for extension updates
 * @param updates Array of extension updates found
 */
function setUpdateOutputs(updates: ExtensionUpdate[]): void {
	core.setOutput("updates-available", updates.length > 0 ? "true" : "false");
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
}

/**
 * Sets GitHub Actions output values for created pull requests
 * @param createdPRs Array of created PR results with number and URL
 */
function setPROutputs(createdPRs: { number: number; url: string }[]): void {
	if (createdPRs.length > 0) {
		core.setOutput("pr-number", createdPRs[0].number.toString());
		core.setOutput("pr-url", createdPRs[0].url);
		core.info(`📊 Summary: Created/updated ${createdPRs.length} PR(s)`);
	}
}

async function run(): Promise<void> {
	try {
		// Parse and validate all inputs
		const config = parseInputs();

		// Validate workspace exists
		validateWorkspace(config.workspacePath);

		// Initialise GitHub client
		const octokit = github.getOctokit(config.githubToken);
		const context = github.context;
		const { owner, repo } = context.repo;

		core.info("🚀 Starting Quarto Extensions Updater...");
		core.info(`Workspace path: ${config.workspacePath}`);
		core.info(`Repository: ${owner}/${repo}`);
		core.info(`Base branch: ${config.baseBranch}`);

		// Fetch registry and check for updates
		core.startGroup("📥 Fetching extensions registry");
		const registry = await fetchExtensionsRegistry(config.registryUrl);
		core.endGroup();

		core.startGroup("🔍 Checking for updates");
		const updates = checkForUpdates(config.workspacePath, registry, config.filterConfig, config.updateStrategy);
		core.endGroup();

		// Handle no updates case
		if (updates.length === 0) {
			core.info("✅ All extensions are up to date!");
			setUpdateOutputs(updates);
			return;
		}

		logUpdateSummary(updates);
		setUpdateOutputs(updates);

		// Handle dry-run mode
		if (config.dryRun) {
			core.startGroup("🔍 Dry-Run Mode - No Changes Will Be Made");

			await generateDryRunSummary(
				updates,
				config.groupUpdates,
				config.updateStrategy,
				config.filterConfig,
				config.autoMergeConfig,
				config.createIssue,
			);

			core.info("📋 Dry-run summary written to job summary");
			core.info(`✓ Found ${updates.length} update${updates.length > 1 ? "s" : ""} that would be applied`);
			core.info("💡 Check the job summary for detailed information");

			// Create issue if enabled
			if (config.createIssue) {
				core.info("📝 Creating issue with update summary...");
				const issue = await createIssueForUpdates(
					octokit,
					owner,
					repo,
					updates,
					config.groupUpdates,
					config.updateStrategy,
					config.filterConfig,
					config.autoMergeConfig,
				);
				core.setOutput("issue-number", issue.number.toString());
				core.setOutput("issue-url", issue.url);
				core.info(`✅ Issue created: ${issue.url}`);
			}

			core.endGroup();
			return;
		}

		// Exit if PR creation is disabled
		if (!config.createPR) {
			core.info("ℹ️ PR creation disabled, exiting...");
			return;
		}

		// Get base branch SHA
		const { data: refData } = await octokit.rest.git.getRef({
			owner,
			repo,
			ref: `heads/${config.baseBranch}`,
		});
		const baseSha = refData.object.sha;

		// Process all PRs
		const createdPRs = await processAllPRs(octokit, owner, repo, updates, config.groupUpdates, {
			workspacePath: config.workspacePath,
			baseBranch: config.baseBranch,
			baseSha,
			branchPrefix: config.branchPrefix,
			prTitlePrefix: config.prTitlePrefix,
			commitMessagePrefix: config.commitMessagePrefix,
			prLabels: config.prLabels,
			autoMergeConfig: config.autoMergeConfig,
			assignmentConfig: config.assignmentConfig,
		});

		// Collect skipped updates from all PR results
		const allSkippedUpdates: SkippedUpdate[] = createdPRs.flatMap((pr) => pr.skippedUpdates ?? []);

		// Filter out PRs with no actual changes (number === 0)
		const actualPRs = createdPRs.filter((pr) => pr.number > 0);

		// Filter updates to only those that were successfully applied
		const skippedNames = new Set(allSkippedUpdates.map((s) => s.update.nameWithOwner));
		const appliedUpdates = updates.filter((u) => !skippedNames.has(u.nameWithOwner));

		// Set outputs and generate summary
		if (actualPRs.length > 0) {
			setPROutputs(actualPRs);

			core.startGroup("📋 Generating Job Summary");
			await generateCompletedSummary(
				appliedUpdates,
				actualPRs,
				config.groupUpdates,
				config.updateStrategy,
				config.filterConfig,
				config.autoMergeConfig,
				allSkippedUpdates,
			);
			core.endGroup();
		}

		if (allSkippedUpdates.length > 0) {
			core.warning(
				`${allSkippedUpdates.length} extension(s) were skipped during update. ` + "Check the job summary for details.",
			);
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
