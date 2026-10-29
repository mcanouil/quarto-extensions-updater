import * as core from "@actions/core";
import type { OctokitClient } from "./github.js";
import type { ExtensionUpdate, SkippedUpdate } from "./types.js";
import { copyLocationSuffix, extensionNames, groupCopies, groupUpdatesByType } from "./updates.js";
import { PR_FOOTER_TEXT, DEFAULT_PR_LABELS, LOG_SEPARATOR_CHAR, LOG_SEPARATOR_LENGTH } from "./constants.js";

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
	const extensions = groupCopies(updates);
	if (extensions.length === 1) {
		const update = extensions[0][0];
		return `${prefix} update ${update.nameWithOwner} extension to ${update.latestVersion}`;
	}

	return `${prefix} update ${extensions.length} Quarto extensions`;
}

/**
 * Generates a detailed Pull Request body similar to Dependabot
 * @param updates Array of extension updates
 * @param octokit GitHub API client
 * @param skippedUpdates Updates skipped while applying the group
 * @param removedFiles Files deleted because the new releases no longer ship them
 * @returns PR body in markdown format
 */
export async function generatePRBody(
	updates: ExtensionUpdate[],
	octokit: OctokitClient,
	skippedUpdates: SkippedUpdate[] = [],
	removedFiles: string[] = [],
): Promise<string> {
	const sections: string[] = [];

	sections.push("Updates the following Quarto extension(s):");
	sections.push("");

	const grouped = groupUpdatesByType(updates);

	if (grouped.major.length > 0) {
		sections.push("## ⚠️ Major Updates");
		sections.push("");
		sections.push(...formatUpdateList(grouped.major, updates));
		sections.push("");
	}

	if (grouped.minor.length > 0) {
		sections.push("## ✨ Minor Updates");
		sections.push("");
		sections.push(...formatUpdateList(grouped.minor, updates));
		sections.push("");
	}

	if (grouped.patch.length > 0) {
		sections.push("## 🐛 Patch Updates");
		sections.push("");
		sections.push(...formatUpdateList(grouped.patch, updates));
		sections.push("");
	}

	if (removedFiles.length > 0) {
		sections.push("## 🗑️ Removed Files");
		sections.push("");
		sections.push("The new releases no longer ship these files, so this pull request deletes them:");
		sections.push("");
		for (const file of removedFiles) {
			sections.push(`- **${ownerOfFile(file, updates)}**: \`${file}\``);
		}
		sections.push("");
	}

	sections.push("---");
	sections.push("");

	const extensions = groupCopies(updates).map((copies) => copies[0]);

	// Fetch all release notes in parallel
	const releaseNotesMap = new Map<string, string | null>();
	const releaseNotesEntries = extensions
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

	for (const update of extensions) {
		if (extensions.length > 1) {
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
				`- **${skipped.update.nameWithOwner}**${copyLocationSuffix(skipped.update, updates)} (\`${skipped.update.currentVersion}\` → \`${skipped.update.latestVersion}\`): ${skipped.reason}`,
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
 * Names the extension a file belongs to, choosing the innermost folder when one extension embeds another
 */
function ownerOfFile(file: string, updates: ExtensionUpdate[]): string {
	const owners = updates.filter((update) => file.startsWith(`${update.location}/`));
	owners.sort((a, b) => b.location.length - a.location.length);
	return owners[0]?.nameWithOwner ?? "unknown extension";
}

/**
 * Formats a list of updates as markdown, naming the location of each copy of an extension installed more than once
 * @param updates Array of extension updates to list
 * @param allUpdates Every update in the pull request, used to find extensions installed more than once
 * @returns Array of markdown lines
 */
function formatUpdateList(updates: ExtensionUpdate[], allUpdates: ExtensionUpdate[]): string[] {
	const lines: string[] = [];

	for (const update of updates) {
		lines.push(
			`- **[${update.nameWithOwner}](${update.url})**: \`${update.currentVersion}\` → \`${update.latestVersion}\`${copyLocationSuffix(update, allUpdates)}`,
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
			core.warning(
				`   ${update.nameWithOwner}${copyLocationSuffix(update, updates)}: ${update.currentVersion} → ${update.latestVersion}`,
			);
		}
	}

	if (grouped.minor.length > 0) {
		core.info(`✨ Minor updates (${grouped.minor.length}):`);
		for (const update of grouped.minor) {
			core.info(
				`   ${update.nameWithOwner}${copyLocationSuffix(update, updates)}: ${update.currentVersion} → ${update.latestVersion}`,
			);
		}
	}

	if (grouped.patch.length > 0) {
		core.info(`🐛 Patch updates (${grouped.patch.length}):`);
		for (const update of grouped.patch) {
			core.info(
				`   ${update.nameWithOwner}${copyLocationSuffix(update, updates)}: ${update.currentVersion} → ${update.latestVersion}`,
			);
		}
	}

	core.info(LOG_SEPARATOR_CHAR.repeat(LOG_SEPARATOR_LENGTH));
	core.info(`Total: ${extensionNames(updates).length} extension(s) to update`);
}
