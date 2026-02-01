import * as core from "@actions/core";
import type { OctokitClient } from "./github";
import type { ExtensionUpdate, SkippedUpdate } from "./types";
import { groupUpdatesByType } from "./updates";
import { PR_FOOTER_TEXT, DEFAULT_PR_LABELS, LOG_SEPARATOR_CHAR, LOG_SEPARATOR_LENGTH } from "./constants";

/**
 * Fetches release notes for a specific release
 * @param octokit GitHub API client
 * @param owner Repository owner
 * @param repo Repository name
 * @param version Release version (will try with and without 'v' prefix)
 * @returns Release notes body or null if not found
 */
async function fetchReleaseNotes(
	octokit: OctokitClient,
	owner: string,
	repo: string,
	version: string,
): Promise<string | null> {
	const tagsToTry = version.startsWith("v") ? [version, version.slice(1)] : [version, `v${version}`];

	for (const tag of tagsToTry) {
		try {
			const { data: release } = await octokit.rest.repos.getReleaseByTag({
				owner,
				repo,
				tag,
			});
			return release.body || null;
		} catch (error) {
			core.debug(`Failed to fetch release notes for ${owner}/${repo}@${tag}: ${error}`);
		}
	}

	return null;
}

/**
 * Generates a Pull Request title
 * @param updates Array of extension updates
 * @param prefix Prefix for the PR title (default: "chore(deps):")
 * @returns PR title
 */
export function generatePRTitle(updates: ExtensionUpdate[], prefix = "chore(deps):"): string {
	if (updates.length === 1) {
		const update = updates[0];
		return `${prefix} update ${update.nameWithOwner} extension to ${update.latestVersion}`;
	}

	return `${prefix} update ${updates.length} Quarto extension${updates.length > 1 ? "s" : ""}`;
}

/**
 * Generates a detailed Pull Request body similar to Dependabot
 * @param updates Array of extension updates
 * @param octokit GitHub API client
 * @returns PR body in markdown format
 */
export async function generatePRBody(
	updates: ExtensionUpdate[],
	octokit: OctokitClient,
	skippedUpdates: SkippedUpdate[] = [],
): Promise<string> {
	const sections: string[] = [];

	sections.push("Updates the following Quarto extension(s):");
	sections.push("");

	const grouped = groupUpdatesByType(updates);

	if (grouped.major.length > 0) {
		sections.push("## ⚠️ Major Updates");
		sections.push("");
		sections.push(...formatUpdateList(grouped.major));
		sections.push("");
	}

	if (grouped.minor.length > 0) {
		sections.push("## ✨ Minor Updates");
		sections.push("");
		sections.push(...formatUpdateList(grouped.minor));
		sections.push("");
	}

	if (grouped.patch.length > 0) {
		sections.push("## 🐛 Patch Updates");
		sections.push("");
		sections.push(...formatUpdateList(grouped.patch));
		sections.push("");
	}

	sections.push("---");
	sections.push("");

	// Fetch all release notes in parallel
	const releaseNotesMap = new Map<string, string | null>();
	const releaseNotesEntries = updates
		.map((update) => {
			const parts = update.repositoryName.split("/");
			if (parts.length !== 2) {
				core.warning(`Invalid repository name format: ${update.repositoryName}`);
				return null;
			}
			const [owner, repo] = parts;
			return {
				key: update.nameWithOwner,
				promise: fetchReleaseNotes(octokit, owner, repo, update.latestVersion),
			};
		})
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	const releaseNotesResults = await Promise.all(releaseNotesEntries.map((e) => e.promise));
	for (let i = 0; i < releaseNotesEntries.length; i++) {
		releaseNotesMap.set(releaseNotesEntries[i].key, releaseNotesResults[i]);
	}

	for (const update of updates) {
		if (updates.length > 1) {
			sections.push(`### ${update.nameWithOwner}`);
			sections.push("");
		} else {
			sections.push("### Release Notes");
			sections.push("");
		}

		const releaseBody = releaseNotesMap.get(update.nameWithOwner) ?? null;

		sections.push("<details>");
		sections.push(`<summary>Release ${update.latestVersion}</summary>`);
		sections.push("");

		if (releaseBody) {
			const quotedBody = releaseBody
				.split("\n")
				.map((line) => `> ${line}`)
				.join("\n");
			sections.push(quotedBody);
		} else {
			sections.push(`> No release notes available.`);
			sections.push(`>`);
			sections.push(`> View release: ${update.releaseUrl}`);
		}

		sections.push("");
		sections.push("</details>");
		sections.push("");

		if (update.description) {
			sections.push(`**About**: ${update.description}`);
			sections.push("");
		}

		sections.push(`**Links**: [Repository](${update.url}) · [Release](${update.releaseUrl})`);
		sections.push("");
	}

	if (skippedUpdates.length > 0) {
		sections.push("## ⏭️ Skipped Extensions");
		sections.push("");
		sections.push("The following extension(s) were skipped during this update:");
		sections.push("");
		for (const skipped of skippedUpdates) {
			sections.push(
				`- **${skipped.update.nameWithOwner}** (\`${skipped.update.currentVersion}\` → \`${skipped.update.latestVersion}\`): ${skipped.reason}`,
			);
		}
		sections.push("");
	}

	sections.push("---");
	sections.push("");
	sections.push(PR_FOOTER_TEXT);

	return sections.join("\n");
}

/**
 * Formats a list of updates as markdown
 * @param updates Array of extension updates
 * @returns Array of markdown lines
 */
function formatUpdateList(updates: ExtensionUpdate[]): string[] {
	const lines: string[] = [];

	for (const update of updates) {
		lines.push(
			`- **[${update.nameWithOwner}](${update.url})**: \`${update.currentVersion}\` → \`${update.latestVersion}\``,
		);
	}

	return lines;
}

/**
 * Generates labels for the PR based on update types
 * @returns Array of label names
 *
 * Note: Additional labels based on update type (major/minor/patch) and count
 * are not currently added. To enable this feature, uncomment the code below
 * and add the updates parameter back to the function signature.
 */
export function generatePRLabels(): string[] {
	return [...DEFAULT_PR_LABELS];
}

/**
 * Logs a summary of the updates
 * @param updates Array of extension updates
 */
export function logUpdateSummary(updates: ExtensionUpdate[]): void {
	core.info("📦 Extension Updates Summary:");
	core.info(LOG_SEPARATOR_CHAR.repeat(LOG_SEPARATOR_LENGTH));

	const grouped = groupUpdatesByType(updates);

	if (grouped.major.length > 0) {
		core.warning(`⚠️  Major updates (${grouped.major.length}):`);
		for (const update of grouped.major) {
			core.warning(`   ${update.nameWithOwner}: ${update.currentVersion} → ${update.latestVersion}`);
		}
	}

	if (grouped.minor.length > 0) {
		core.info(`✨ Minor updates (${grouped.minor.length}):`);
		for (const update of grouped.minor) {
			core.info(`   ${update.nameWithOwner}: ${update.currentVersion} → ${update.latestVersion}`);
		}
	}

	if (grouped.patch.length > 0) {
		core.info(`🐛 Patch updates (${grouped.patch.length}):`);
		for (const update of grouped.patch) {
			core.info(`   ${update.nameWithOwner}: ${update.currentVersion} → ${update.latestVersion}`);
		}
	}

	core.info(LOG_SEPARATOR_CHAR.repeat(LOG_SEPARATOR_LENGTH));
	core.info(`Total: ${updates.length} extension(s) to update`);
}
