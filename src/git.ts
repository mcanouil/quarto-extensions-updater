import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { ExtensionUpdate } from "./types";
import { updateManifestSource } from "./extensions";

/**
 * Checks if Quarto CLI is available
 * @returns True if Quarto CLI is available, false otherwise
 */
function isQuartoAvailable(): boolean {
	try {
		execSync("quarto --version", {
			stdio: "pipe",
			encoding: "utf-8",
		});
		return true;
	} catch (error) {
		core.error(`Quarto CLI is not available: ${error}`);
		return false;
	}
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
 * @returns Array of file paths that were modified
 */
export function applyUpdates(updates: ExtensionUpdate[]): string[] {
	// Check if Quarto CLI is available
	if (!isQuartoAvailable()) {
		const errorMessage =
			"Quarto CLI is not available. Please install Quarto before running this action.\n" +
			"In GitHub Actions, add this step before using quarto-extensions-updater:\n" +
			"  - name: Setup Quarto\n" +
			"    uses: quarto-dev/quarto-actions/setup@v2";
		core.error(errorMessage);
		throw new Error("Quarto CLI is not available");
	}

	const modifiedFiles: string[] = [];

	for (const update of updates) {
		try {
			const source = `${update.repositoryName}@${update.latestVersion}`;
			core.info(`Running: quarto add ${source} --no-prompt`);

			execSync(`quarto add ${source} --no-prompt`, {
				stdio: "inherit",
				encoding: "utf-8",
			});

			core.info(`Successfully updated ${update.nameWithOwner} to ${update.latestVersion}`);

			updateManifestSource(update.manifestPath, source);

			const extensionDir = path.dirname(update.manifestPath);
			const extensionFiles = getAllFilesInDirectory(extensionDir);
			modifiedFiles.push(...extensionFiles);

			core.info(`Tracked ${extensionFiles.length} file(s) in ${extensionDir}`);
		} catch (error) {
			core.error(`Failed to update ${update.nameWithOwner}: ${error}`);
			throw error;
		}
	}

	return modifiedFiles;
}

/**
 * Creates a branch name for the update PR
 * @param updates Array of updates
 * @returns Branch name
 */
export function createBranchName(updates: ExtensionUpdate[]): string {
	const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, "");

	if (updates.length === 1) {
		const update = updates[0];
		const safeName = update.nameWithOwner.replace(/\//g, "-");
		return `quarto-extensions/update-${safeName}-${update.latestVersion}`;
	}

	return `quarto-extensions/update-extensions-${timestamp}`;
}

/**
 * Creates a commit message for the updates
 * @param updates Array of updates
 * @returns Commit message
 */
export function createCommitMessage(updates: ExtensionUpdate[]): string {
	if (updates.length === 1) {
		const update = updates[0];
		return `chore(deps): update ${update.nameWithOwner} extension to ${update.latestVersion}

Updates ${update.nameWithOwner} from ${update.currentVersion} to ${update.latestVersion}.

Release notes: ${update.releaseUrl}`;
	}

	const title = `chore(deps): update ${updates.length} Quarto extension${updates.length > 1 ? "s" : ""}`;
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
