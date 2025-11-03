import * as core from "@actions/core";
import * as semver from "semver";
import type {
	ExtensionUpdate,
	ExtensionRegistry,
	ExtensionDetails,
	ExtensionFilterConfig,
	UpdateStrategy,
} from "./types";
import { findExtensionManifests, readExtensionManifest, extractExtensionInfo } from "./extensions";

/**
 * Determines if an update should be applied based on the update strategy
 * @param currentVersion The current version
 * @param latestVersion The latest version
 * @param strategy The update strategy
 * @returns True if the update should be applied
 */
function shouldApplyUpdate(currentVersion: string, latestVersion: string, strategy: UpdateStrategy): boolean {
	if (strategy === "all") {
		return true;
	}

	const current = normaliseVersion(currentVersion);
	const latest = normaliseVersion(latestVersion);

	if (!semver.valid(current) || !semver.valid(latest)) {
		return false;
	}

	const diff = semver.diff(current, latest);

	if (strategy === "patch") {
		return diff === "patch" || diff === "prepatch";
	}

	if (strategy === "minor") {
		return diff === "minor" || diff === "preminor" || diff === "patch" || diff === "prepatch";
	}

	return false;
}

/**
 * Checks for available updates for installed Quarto extensions
 * @param workspacePath The workspace path to check
 * @param registry The extensions registry
 * @param filterConfig Optional configuration for filtering extensions
 * @param updateStrategy Optional strategy to control which types of updates to apply (default: "all")
 * @returns Array of available updates
 */
export function checkForUpdates(
	workspacePath: string,
	registry: ExtensionRegistry,
	filterConfig?: ExtensionFilterConfig,
	updateStrategy: UpdateStrategy = "all",
): ExtensionUpdate[] {
	const updates: ExtensionUpdate[] = [];
	const manifestPaths = findExtensionManifests(workspacePath);

	core.info(`Checking ${manifestPaths.length} extensions for updates...`);

	for (const manifestPath of manifestPaths) {
		const extensionData = readExtensionManifest(manifestPath);
		const extensionInfo = extractExtensionInfo(manifestPath);

		if (!extensionData || !extensionInfo) {
			continue;
		}

		const { owner, name } = extensionInfo;
		const nameWithOwner = `${owner}/${name}`;

		// Apply include/exclude filters
		if (filterConfig) {
			if (filterConfig.include.length > 0 && !filterConfig.include.includes(nameWithOwner)) {
				core.info(`Skipping ${nameWithOwner}: not in include list`);
				continue;
			}

			if (filterConfig.exclude.length > 0 && filterConfig.exclude.includes(nameWithOwner)) {
				core.info(`Skipping ${nameWithOwner}: in exclude list`);
				continue;
			}
		}

		if (!extensionData.source) {
			core.info(`Skipping ${nameWithOwner}: no source field (cannot track updates)`);
			continue;
		}

		if (!extensionData.version || extensionData.version === "none") {
			core.info(`Skipping ${nameWithOwner}: no version specified`);
			continue;
		}

		const registryEntry = findRegistryEntry(registry, nameWithOwner, extensionData.repository);

		if (!registryEntry) {
			core.info(`Skipping ${nameWithOwner}: not found in registry`);
			continue;
		}

		const latestVersion = registryEntry.latestRelease;
		if (!latestVersion || latestVersion === "none") {
			core.info(`Skipping ${nameWithOwner}: no release version in registry`);
			continue;
		}

		const currentVersion = normaliseVersion(extensionData.version);
		const normalizedLatest = normaliseVersion(latestVersion);

		if (!semver.valid(currentVersion) || !semver.valid(normalizedLatest)) {
			core.warning(
				`Skipping ${nameWithOwner}: invalid version format (current: ${extensionData.version}, latest: ${latestVersion})`,
			);
			continue;
		}

		if (semver.lt(currentVersion, normalizedLatest)) {
			// Check if this update should be applied based on the update strategy
			if (!shouldApplyUpdate(extensionData.version, latestVersion, updateStrategy)) {
				const diff = semver.diff(currentVersion, normalizedLatest);
				core.info(
					`Skipping ${nameWithOwner}: ${diff} update (${extensionData.version} → ${latestVersion}) not allowed by update strategy (${updateStrategy})`,
				);
				continue;
			}

			core.info(`Update available for ${nameWithOwner}: ${extensionData.version} → ${latestVersion}`);

			updates.push({
				name,
				owner,
				nameWithOwner,
				repositoryName: registryEntry.nameWithOwner,
				currentVersion: extensionData.version,
				latestVersion,
				manifestPath,
				url: registryEntry.url,
				releaseUrl: registryEntry.latestReleaseUrl,
				description: registryEntry.description,
			});
		} else {
			core.info(`${nameWithOwner} is up to date (${extensionData.version})`);
		}
	}

	return updates;
}

/**
 * Finds a registry entry by name or repository URL
 * @param registry The extensions registry
 * @param nameWithOwner The extension's owner/name
 * @param repository Optional repository URL from the extension manifest
 * @returns The matching registry entry or null
 */
function findRegistryEntry(
	registry: ExtensionRegistry,
	nameWithOwner: string,
	repository?: string,
): ExtensionDetails | null {
	if (registry[nameWithOwner]) {
		return registry[nameWithOwner];
	}

	if (repository) {
		const repoName = repository.replace(/^https?:\/\/github\.com\//, "");
		if (registry[repoName]) {
			return registry[repoName];
		}
	}

	return null;
}

/**
 * Normalises a version string for semver comparison
 * Removes 'v' prefix and ensures valid semver format
 * @param version The version string to normalise
 * @returns Normalised version string
 */
function normaliseVersion(version: string): string {
	let normalised = version.trim();

	if (normalised.startsWith("v")) {
		normalised = normalised.substring(1);
	}

	return normalised;
}

/**
 * Groups updates by type for better PR organisation
 * @param updates Array of extension updates
 * @returns Object with updates grouped by type
 */
export function groupUpdatesByType(updates: ExtensionUpdate[]): {
	major: ExtensionUpdate[];
	minor: ExtensionUpdate[];
	patch: ExtensionUpdate[];
} {
	const grouped = {
		major: [] as ExtensionUpdate[],
		minor: [] as ExtensionUpdate[],
		patch: [] as ExtensionUpdate[],
	};

	for (const update of updates) {
		const current = normaliseVersion(update.currentVersion);
		const latest = normaliseVersion(update.latestVersion);

		if (!semver.valid(current) || !semver.valid(latest)) {
			continue;
		}

		const diff = semver.diff(current, latest);

		if (diff === "major" || diff === "premajor") {
			grouped.major.push(update);
		} else if (diff === "minor" || diff === "preminor") {
			grouped.minor.push(update);
		} else if (diff === "patch" || diff === "prepatch") {
			grouped.patch.push(update);
		} else {
			grouped.patch.push(update);
		}
	}

	return grouped;
}
