import * as core from "@actions/core";
import { shouldAutoMerge } from "./automerge";
import type { ExtensionUpdate, AutoMergeConfig, UpdateStrategy, ExtensionFilterConfig, SkippedUpdate } from "./types";

/**
 * Raw configuration row with label, value, and whether it differs from the default
 */
interface ConfigRow {
	label: string;
	value: string;
	isNonDefault: boolean;
}

/**
 * Configuration table row data (used by GitHub Actions summary API)
 */
interface ConfigTableRow {
	data: string;
	header: boolean;
}

/**
 * Builds a normalised list of configuration rows from the current settings
 */
function getConfigRows(
	groupUpdates: boolean,
	updateStrategy: UpdateStrategy,
	filterConfig: ExtensionFilterConfig,
	autoMergeConfig: AutoMergeConfig,
): ConfigRow[] {
	const rows: ConfigRow[] = [
		{
			label: "Mode",
			value: groupUpdates ? "Grouped updates (single PR)" : "Individual PRs (one per extension)",
			isNonDefault: groupUpdates,
		},
		{
			label: "Update Strategy",
			value: updateStrategy,
			isNonDefault: updateStrategy !== "all",
		},
		{
			label: "Include Filter",
			value: filterConfig.include.length > 0 ? filterConfig.include.join(", ") : "*(all)*",
			isNonDefault: filterConfig.include.length > 0,
		},
		{
			label: "Exclude Filter",
			value: filterConfig.exclude.length > 0 ? filterConfig.exclude.join(", ") : "*(none)*",
			isNonDefault: filterConfig.exclude.length > 0,
		},
		{
			label: "Auto-Merge",
			value: autoMergeConfig.enabled
				? `Enabled (${autoMergeConfig.strategy} updates, ${autoMergeConfig.mergeMethod} method)`
				: "Disabled",
			isNonDefault: autoMergeConfig.enabled,
		},
	];

	return rows;
}

/**
 * Generates markdown content for dry-run summary
 * @param updates Array of extension updates that would be applied
 * @param groupUpdates Whether updates are grouped in a single PR
 * @param updateStrategy The update strategy being used
 * @param filterConfig Extension filtering configuration
 * @param autoMergeConfig Auto-merge configuration
 * @returns Markdown string for the dry-run summary
 */
export function generateDryRunMarkdown(
	updates: ExtensionUpdate[],
	groupUpdates: boolean,
	updateStrategy: UpdateStrategy,
	filterConfig: ExtensionFilterConfig,
	autoMergeConfig: AutoMergeConfig,
): string {
	let markdown = "## Dry-Run Summary\n\n";
	markdown += "No PRs will be created. This is a preview of what would happen.\n\n";

	// Configuration section
	markdown += "### Configuration\n\n";
	markdown += "Settings marked with ⚙️ are non-default values.\n\n";
	markdown += "| Setting | Value | Default |\n|---------|-------|----------|\n";

	const configRows = getConfigRows(groupUpdates, updateStrategy, filterConfig, autoMergeConfig);
	const defaults = ["Individual PRs", "all", "*(all)*", "*(none)*", "Disabled"];

	for (let i = 0; i < configRows.length; i++) {
		const row = configRows[i];
		const indicator = row.isNonDefault ? "⚙️ " : "";
		markdown += `| ${indicator}${row.label} | ${row.value} | ${defaults[i]} |\n`;
	}

	markdown += "\n";

	// Planned actions section
	markdown += "### Planned Actions\n\n";
	if (groupUpdates) {
		markdown += `Would create **1 PR** with ${updates.length} extension update${updates.length > 1 ? "s" : ""}\n\n`;
	} else {
		markdown += `Would create **${updates.length} PR${updates.length > 1 ? "s" : ""}** (one per extension)\n\n`;
	}

	// Updates table
	markdown += "### Available Updates\n\n";
	markdown += "| Extension | Current | Latest | Auto-Merge |\n|-----------|---------|--------|------------|\n";

	for (const update of updates) {
		const wouldAutoMerge = shouldAutoMerge(update, autoMergeConfig);
		markdown += `| ${update.nameWithOwner} | ${update.currentVersion} | ${update.latestVersion} | ${wouldAutoMerge ? "✓ Yes" : "✗ No"} |\n`;
	}

	markdown += "\n";

	// Next steps
	markdown += "### Next Steps\n\n";
	markdown += "To apply these updates, remove `dry-run: true` from your workflow configuration.\n";

	return markdown;
}

/**
 * Converts normalised config rows into the GitHub Actions summary table format
 */
function configRowsToTable(rows: ConfigRow[]): ConfigTableRow[][] {
	const table: ConfigTableRow[][] = [
		[
			{ data: "Setting", header: true },
			{ data: "Value", header: true },
		],
	];

	for (const row of rows) {
		table.push([
			{ data: row.label, header: false },
			{ data: row.value, header: false },
		]);
	}

	return table;
}

/**
 * Generates dry-run job summary for GitHub Actions
 * @param updates Array of extension updates that would be applied
 * @param groupUpdates Whether updates are grouped in a single PR
 * @param updateStrategy The update strategy being used
 * @param filterConfig Extension filtering configuration
 * @param autoMergeConfig Auto-merge configuration
 * @param createIssue Whether an issue will be created with the summary
 */
export async function generateDryRunSummary(
	updates: ExtensionUpdate[],
	groupUpdates: boolean,
	updateStrategy: UpdateStrategy,
	filterConfig: ExtensionFilterConfig,
	autoMergeConfig: AutoMergeConfig,
	createIssue = false,
): Promise<void> {
	// Generate markdown content
	const markdown = generateDryRunMarkdown(updates, groupUpdates, updateStrategy, filterConfig, autoMergeConfig);

	// Add the markdown to the summary
	core.summary.addRaw(markdown);

	// Add issue creation notice if applicable
	if (createIssue) {
		core.summary.addBreak();
		core.summary.addRaw("ℹ️ A GitHub issue has been created with this summary for tracking purposes.", true);
	}

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
	createdPRs: { number: number; url: string; extensions: string[] }[],
	groupUpdates: boolean,
	updateStrategy: UpdateStrategy,
	filterConfig: ExtensionFilterConfig,
	autoMergeConfig: AutoMergeConfig,
	skippedUpdates: SkippedUpdate[] = [],
): Promise<void> {
	core.summary.addHeading("Extension Updates Summary", 2);
	core.summary.addRaw(`Successfully created/updated ${createdPRs.length} PR${createdPRs.length > 1 ? "s" : ""}`, true);
	core.summary.addBreak();

	// Configuration section
	core.summary.addHeading("Configuration", 3);
	const configRows = getConfigRows(groupUpdates, updateStrategy, filterConfig, autoMergeConfig);
	core.summary.addTable(configRowsToTable(configRows));
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
		// Match individual updates to their PRs by extension name
		for (const pr of createdPRs) {
			for (const ext of pr.extensions) {
				updateToPR.set(ext, pr);
			}
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

	if (skippedUpdates.length > 0) {
		core.summary.addHeading("Skipped Extensions", 3);
		core.summary.addRaw("The following extension(s) were skipped during this update:", true);

		const skippedTable = [
			[
				{ data: "Extension", header: true },
				{ data: "Current", header: true },
				{ data: "Latest", header: true },
				{ data: "Reason", header: true },
			],
		];

		for (const skipped of skippedUpdates) {
			skippedTable.push([
				{ data: skipped.update.nameWithOwner, header: false },
				{ data: skipped.update.currentVersion, header: false },
				{ data: skipped.update.latestVersion, header: false },
				{ data: skipped.reason, header: false },
			]);
		}

		core.summary.addTable(skippedTable);
		core.summary.addBreak();
	}

	await core.summary.write();
}
