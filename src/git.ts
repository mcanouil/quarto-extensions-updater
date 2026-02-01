import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as semver from "semver";
import type { ExtensionUpdate, ApplyUpdatesResult } from "./types";
import { updateManifestSource, readExtensionManifest } from "./extensions";

/**
 * Gets the installed Quarto CLI version
 * @returns The Quarto version string or null if unavailable
 */
export function getQuartoVersion(): string | null {
	try {
		const output = execSync("quarto --version", {
			stdio: "pipe",
			encoding: "utf-8",
		});
		return output.trim();
	} catch (error) {
		core.error(`Quarto CLI is not available: ${error}`);
		return null;
	}
}

/**
 * Checks whether the installed Quarto version satisfies a required version
 * @param quartoVersion The installed Quarto version
 * @param requiredVersion The minimum required Quarto version from extension manifest
 * @returns True if the installed version satisfies the requirement
 */
function satisfiesQuartoRequirement(quartoVersion: string, requiredVersion: string): boolean {
	const installed = semver.coerce(quartoVersion);
	const required = semver.coerce(requiredVersion);

	if (!installed || !required) {
		return true;
	}

	return semver.gte(installed, required);
}

/**
 * Recursively gets all files in a directory
 * @param dirPath Directory path to scan
 * @returns Array of file paths
 */
function getAllFilesInDirectory(dirPath: string): string[] {
	const files: string[] = [];

	if (!fs.existsSync(dirPath)) {
		return files;
	}

	const entries = fs.readdirSync(dirPath, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);

		if (entry.isDirectory()) {
			files.push(...getAllFilesInDirectory(fullPath));
		} else if (entry.isFile()) {
			files.push(fullPath);
		}
	}

	return files;
}

/**
 * Applies extension updates using Quarto CLI
 * @param updates Array of updates to apply
 * @returns Result containing modified files and any skipped updates
 */
export function applyUpdates(updates: ExtensionUpdate[]): ApplyUpdatesResult {
	const quartoVersion = getQuartoVersion();

	if (!quartoVersion) {
		const errorMessage =
			"Quarto CLI is not available. Please install Quarto before running this action.\n" +
			"In GitHub Actions, add this step before using quarto-extensions-updater:\n" +
			"  - name: Setup Quarto\n" +
			"    uses: quarto-dev/quarto-actions/setup@v2\n" +
			"    with:\n" +
			'      version: "release"';
		core.error(errorMessage);
		throw new Error("Quarto CLI is not available");
	}

	core.info(`Installed Quarto version: ${quartoVersion}`);

	const modifiedFiles: string[] = [];
	const skippedUpdates: ApplyUpdatesResult["skippedUpdates"] = [];

	for (const update of updates) {
		try {
			const source = `${update.repositoryName}@${update.latestVersion}`;
			core.info(`Running: quarto add ${source} --no-prompt`);

			const output = execSync(`quarto add ${source} --no-prompt`, {
				stdio: "pipe",
				encoding: "utf-8",
			});

			if (output) {
				core.info(output.trim());
			}

			core.info(`Successfully updated ${update.nameWithOwner} to ${update.latestVersion}`);

			// Check quarto-required in the updated manifest
			const updatedManifest = readExtensionManifest(update.manifestPath);
			if (updatedManifest?.quartoRequired) {
				if (!satisfiesQuartoRequirement(quartoVersion, updatedManifest.quartoRequired)) {
					const reason =
						`Extension requires Quarto >= ${updatedManifest.quartoRequired} ` +
						`but installed version is ${quartoVersion}`;
					core.warning(`Skipping ${update.nameWithOwner}: ${reason}`);
					skippedUpdates.push({ update, reason });
					continue;
				}
			}

			updateManifestSource(update.manifestPath, source);

			const extensionDir = path.dirname(update.manifestPath);
			const extensionFiles = getAllFilesInDirectory(extensionDir);
			modifiedFiles.push(...extensionFiles);

			core.info(`Tracked ${extensionFiles.length} file(s) in ${extensionDir}`);
		} catch (error) {
			let reason: string;
			if (error instanceof Error && "stderr" in error) {
				const stderr = String((error as NodeJS.ErrnoException & { stderr: unknown }).stderr).trim();
				reason = stderr || error.message;
			} else {
				reason = error instanceof Error ? error.message : String(error);
			}
			reason = `Failed to update: ${reason}`;
			core.warning(`Skipping ${update.nameWithOwner}: ${reason}`);
			skippedUpdates.push({ update, reason });
		}
	}

	return { modifiedFiles, skippedUpdates };
}

/**
 * Creates a branch name for the update PR
 * @param updates Array of updates
 * @param branchPrefix Prefix for the branch name (will be separated with /)
 * @returns Branch name
 */
export function createBranchName(updates: ExtensionUpdate[], branchPrefix = "chore/quarto-extensions"): string {
	const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, "");
	const prefix = branchPrefix.length === 0 ? "chore/quarto-extensions" : branchPrefix;

	if (updates.length === 1) {
		const update = updates[0];
		const safeName = update.nameWithOwner.replace(/\//g, "-");
		return `${prefix}/update-${safeName}-${update.latestVersion}`;
	}

	return `${prefix}/update-extensions-${timestamp}`;
}

/**
 * Creates a commit message for the updates
 * @param updates Array of updates
 * @param prefix Prefix for the commit message (default: "chore(deps):")
 * @returns Commit message
 */
export function createCommitMessage(updates: ExtensionUpdate[], prefix = "chore(deps):"): string {
	if (updates.length === 1) {
		const update = updates[0];
		return `${prefix} update ${update.nameWithOwner} extension to ${update.latestVersion}

Updates ${update.nameWithOwner} from ${update.currentVersion} to ${update.latestVersion}.

Release notes: ${update.releaseUrl}`;
	}

	const title = `${prefix} update ${updates.length} Quarto extension${updates.length > 1 ? "s" : ""}`;
	const body = updates.map((u) => `- ${u.nameWithOwner}: ${u.currentVersion} → ${u.latestVersion}`).join("\n");

	return `${title}\n\n${body}`;
}

/**
 * Validates that files were actually modified
 * @param filePaths Array of file paths to check
 * @returns True if all files exist
 */
export function validateModifiedFiles(filePaths: string[]): boolean {
	for (const filePath of filePaths) {
		if (!fs.existsSync(filePath)) {
			core.error(`Modified file not found: ${filePath}`);
			return false;
		}
	}
	return true;
}
