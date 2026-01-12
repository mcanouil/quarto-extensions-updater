import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import * as core from "@actions/core";
import type { InstalledExtension, ExtensionManifest } from "@quarto-wizard/core";
import type { ExtensionData } from "./types";
import { QUARTO_MANIFEST_FILENAMES } from "./constants";

// Re-export core types for use in other modules
export type { InstalledExtension, ExtensionManifest };

/** Quarto extension manifest YAML structure */
interface ExtensionManifestYAML {
	title?: string;
	author?: string;
	version?: string;
	contributes?: Record<string, unknown>;
	source?: string;
	repository?: string;
}

/**
 * Finds all Quarto extension manifests in the workspace
 * @param workspacePath The root path to search for extensions
 * @returns Array of paths to extension manifest files
 */
export function findExtensionManifests(workspacePath: string): string[] {
	const extensionsDir = path.join(workspacePath, "_extensions");

	if (!fs.existsSync(extensionsDir)) {
		core.info("No _extensions directory found");
		return [];
	}

	const manifests: string[] = [];

	try {
		const owners = fs.readdirSync(extensionsDir, { withFileTypes: true });

		for (const ownerEntry of owners) {
			if (!ownerEntry.isDirectory()) continue;

			const ownerPath = path.join(extensionsDir, ownerEntry.name);
			const extensions = fs.readdirSync(ownerPath, { withFileTypes: true });

			for (const extEntry of extensions) {
				if (!extEntry.isDirectory()) continue;

				const extPath = path.join(ownerPath, extEntry.name);

				for (const filename of QUARTO_MANIFEST_FILENAMES) {
					const manifestPath = path.join(extPath, filename);
					if (fs.existsSync(manifestPath)) {
						manifests.push(manifestPath);
						break;
					}
				}
			}
		}

		core.info(`Found ${manifests.length} extension manifests`);
		return manifests;
	} catch (error) {
		core.warning(`Error scanning extensions directory: ${error}`);
		return [];
	}
}

/**
 * Reads and parses a Quarto extension manifest file
 * @param manifestPath Path to the manifest file
 * @returns Parsed extension data or null if invalid
 */
export function readExtensionManifest(manifestPath: string): ExtensionData | null {
	try {
		if (!fs.existsSync(manifestPath)) {
			core.warning(`Manifest not found: ${manifestPath}`);
			return null;
		}

		const fileContent = fs.readFileSync(manifestPath, "utf8");
		const data = yaml.load(fileContent) as ExtensionManifestYAML;

		const extensionData: ExtensionData = {
			title: typeof data.title === "string" ? data.title : undefined,
			author: typeof data.author === "string" ? data.author : undefined,
			version: typeof data.version === "string" ? data.version : undefined,
			contributes:
				data.contributes && typeof data.contributes === "object" ? Object.keys(data.contributes).join(", ") : undefined,
			source: typeof data.source === "string" ? data.source : undefined,
			repository: typeof data.source === "string" ? data.source.replace(/@.*$/, "") : undefined,
		};

		return extensionData;
	} catch (error) {
		core.warning(`Error reading manifest ${manifestPath}: ${error}`);
		return null;
	}
}

/**
 * Extracts owner and extension name from a manifest path
 * @param manifestPath Path to the manifest file
 * @returns Object with owner and name, or null if invalid path
 */
export function extractExtensionInfo(manifestPath: string): {
	owner: string;
	name: string;
} | null {
	try {
		const parts = manifestPath.split(path.sep);
		const extensionsIndex = parts.indexOf("_extensions");

		if (extensionsIndex === -1 || extensionsIndex + 2 >= parts.length) {
			return null;
		}

		return {
			owner: parts[extensionsIndex + 1],
			name: parts[extensionsIndex + 2],
		};
	} catch (error) {
		core.warning(`Error extracting extension info from ${manifestPath}: ${error}`);
		return null;
	}
}

/**
 * Updates the source field in an extension manifest only if it doesn't exist
 * @param manifestPath Path to the manifest file
 * @param source The source URL to set (e.g., "owner/repo@v1.0.0")
 */
export function updateManifestSource(manifestPath: string, source: string): void {
	try {
		const fileContent = fs.readFileSync(manifestPath, "utf-8");

		if (fileContent.includes("source:")) {
			core.info(`Source field already exists in ${manifestPath}, skipping source update`);
			return;
		}

		const updatedContent = `${fileContent.trim()}\nsource: ${source}\n`;
		fs.writeFileSync(manifestPath, updatedContent, "utf-8");
		core.info(`Added source field to ${manifestPath}: ${source}`);
	} catch (error) {
		core.error(`Error updating manifest source in ${manifestPath}: ${error}`);
		throw error;
	}
}
