import * as core from "@actions/core";
import { shouldAutoMerge } from "./automerge";
import type { ExtensionUpdate, AutoMergeConfig, UpdateStrategy, ExtensionFilterConfig } from "./types";

/**
 * Configuration table row data
 */
interface ConfigTableRow {
	data: string;
	header: boolean;
}

/**
 * Generates configuration table for job summaries
 */
function generateConfigTable(
	groupUpdates: boolean,
	updateStrategy: UpdateStrategy,
	filterConfig: ExtensionFilterConfig,
	autoMergeConfig: AutoMergeConfig,
): ConfigTableRow[][] {
	const configTable: ConfigTableRow[][] = [
		[
			{ data: "Setting", header: true },
			{ data: "Value", header: true },
		],
		[
			{ data: "Mode", header: false },
			{
				data: groupUpdates ? "Grouped updates (single PR)" : "Individual PRs (one per extension)",
				header: false,
			},
		],
		[
			{ data: "Update Strategy", header: false },
			{ data: updateStrategy, header: false },
		],
	];

	if (filterConfig.include.length > 0) {
		configTable.push([
			{ data: "Include Filter", header: false },
			{ data: filterConfig.include.join(", "), header: false },
		]);
	}

	if (filterConfig.exclude.length > 0) {
		configTable.push([
			{ data: "Exclude Filter", header: false },
			{ data: filterConfig.exclude.join(", "), header: false },
		]);
	}

	if (autoMergeConfig.enabled) {
		configTable.push([
			{ data: "Auto-Merge", header: false },
			{
				data: `Enabled (${autoMergeConfig.strategy} updates, ${autoMergeConfig.mergeMethod} method)`,
				header: false,
			},
		]);
	} else {
		configTable.push([
			{ data: "Auto-Merge", header: false },
			{ data: "Disabled", header: false },
		]);
	}

	return configTable;
}

/**
 * Generates dry-run job summary for GitHub Actions
 * @param updates Array of extension updates that would be applied
 * @param groupUpdates Whether updates are grouped in a single PR
 * @param updateStrategy The update strategy being used
 * @param filterConfig Extension filtering configuration
 * @param autoMergeConfig Auto-merge configuration
 */
export async function generateDryRunSummary(
	updates: ExtensionUpdate[],
	groupUpdates: boolean,
	updateStrategy: UpdateStrategy,
	filterConfig: ExtensionFilterConfig,
	autoMergeConfig: AutoMergeConfig,
): Promise<void> {
	core.summary.addHeading("Dry-Run Summary", 2);
	core.summary.addRaw("No PRs will be created. This is a preview of what would happen.", true);
	core.summary.addBreak();

	// Configuration section
	core.summary.addHeading("Configuration", 3);
	const configTable = generateConfigTable(groupUpdates, updateStrategy, filterConfig, autoMergeConfig);
	core.summary.addTable(configTable);
	core.summary.addBreak();

	// Planned actions section
	core.summary.addHeading("Planned Actions", 3);
	if (groupUpdates) {
		core.summary.addRaw(
			`Would create **1 PR** with ${updates.length} extension update${updates.length > 1 ? "s" : ""}`,
			true,
		);
	} else {
		core.summary.addRaw(
			`Would create **${updates.length} PR${updates.length > 1 ? "s" : ""}** (one per extension)`,
			true,
		);
	}
	core.summary.addBreak();

	// Updates table
	const updatesTable = [
		[
			{ data: "Extension", header: true },
			{ data: "Current", header: true },
			{ data: "Latest", header: true },
			{ data: "Auto-Merge", header: true },
		],
	];

	for (const update of updates) {
		const wouldAutoMerge = shouldAutoMerge(update, autoMergeConfig);
		updatesTable.push([
			{ data: update.nameWithOwner, header: false },
			{ data: update.currentVersion, header: false },
			{ data: update.latestVersion, header: false },
			{ data: wouldAutoMerge ? "✓ Yes" : "✗ No", header: false },
		]);
	}

	core.summary.addTable(updatesTable);
	core.summary.addBreak();

	// Instructions
	core.summary.addHeading("Next Steps", 3);
	core.summary.addRaw(
		"To apply these updates, remove <code>dry-run: true</code> from your workflow configuration.",
		true,
	);

	await core.summary.write();
}

/**
 * Generates job summary for completed PR operations
 * @param updates Array of extension updates that were applied
 * @param createdPRs Array of created PR results
 * @param groupUpdates Whether updates were grouped in a single PR
 * @param updateStrategy The update strategy that was used
 * @param filterConfig Extension filtering configuration
 * @param autoMergeConfig Auto-merge configuration
 */
export async function generateCompletedSummary(
	updates: ExtensionUpdate[],
	createdPRs: { number: number; url: string }[],
	groupUpdates: boolean,
	updateStrategy: UpdateStrategy,
	filterConfig: ExtensionFilterConfig,
	autoMergeConfig: AutoMergeConfig,
): Promise<void> {
	core.summary.addHeading("Extension Updates Summary", 2);
	core.summary.addRaw(`Successfully created/updated ${createdPRs.length} PR${createdPRs.length > 1 ? "s" : ""}`, true);
	core.summary.addBreak();

	// Configuration section
	core.summary.addHeading("Configuration", 3);
	const configTable = generateConfigTable(groupUpdates, updateStrategy, filterConfig, autoMergeConfig);
	core.summary.addTable(configTable);
	core.summary.addBreak();

	// Updates section
	core.summary.addHeading("Applied Updates", 3);

	// Create a map of updates to their PRs
	const updateToPR = new Map<string, { number: number; url: string }>();
	if (groupUpdates && createdPRs.length > 0) {
		// All updates go to the same PR
		const pr = createdPRs[0];
		for (const update of updates) {
			updateToPR.set(update.nameWithOwner, pr);
		}
	} else {
		// Match individual updates to their PRs (assumes same order)
		for (let i = 0; i < Math.min(updates.length, createdPRs.length); i++) {
			updateToPR.set(updates[i].nameWithOwner, createdPRs[i]);
		}
	}

	const updatesTable = [
		[
			{ data: "Extension", header: true },
			{ data: "Current", header: true },
			{ data: "Latest", header: true },
			{ data: "Pull Request", header: true },
			{ data: "Auto-Merge", header: true },
		],
	];

	for (const update of updates) {
		const pr = updateToPR.get(update.nameWithOwner);
		const prLink = pr ? `<a href="${pr.url}">#${pr.number}</a>` : "N/A";
		const autoMergeStatus = shouldAutoMerge(update, autoMergeConfig) ? "✓ Yes" : "✗ No";

		updatesTable.push([
			{ data: update.nameWithOwner, header: false },
			{ data: update.currentVersion, header: false },
			{ data: update.latestVersion, header: false },
			{ data: prLink, header: false },
			{ data: autoMergeStatus, header: false },
		]);
	}

	core.summary.addTable(updatesTable);
	core.summary.addBreak();

	await core.summary.write();
}
