/**
 * Represents details of a Quarto extension from the registry
 */
export interface ExtensionDetails {
	createdAt: string;
	defaultBranchRef: string;
	description: string;
	latestRelease: string;
	latestReleaseUrl: string;
	licenseInfo: string;
	name: string;
	nameWithOwner: string;
	owner: string;
	repositoryTopics: string[];
	stargazerCount: number;
	title: string;
	url: string;
	author: string;
	template: boolean;
	templateContent: string | null;
}

/**
 * Represents data from an installed extension's manifest
 */
export interface ExtensionData {
	title?: string;
	author?: string;
	version?: string;
	contributes?: string;
	source?: string;
	repository?: string;
}

/**
 * Represents an extension update that needs to be applied
 */
export interface ExtensionUpdate {
	name: string;
	owner: string;
	nameWithOwner: string;
	repositoryName: string;
	currentVersion: string;
	latestVersion: string;
	manifestPath: string;
	url: string;
	releaseUrl: string;
	description: string;
}

/**
 * Registry of all available extensions
 */
export type ExtensionRegistry = Record<string, ExtensionDetails>;

/**
 * Auto-merge strategy for PRs
 */
export type AutoMergeStrategy = "patch" | "minor" | "all";

/**
 * GitHub merge method
 */
export type MergeMethod = "merge" | "squash" | "rebase";

/**
 * Configuration for auto-merge feature
 */
export interface AutoMergeConfig {
	enabled: boolean;
	strategy: AutoMergeStrategy;
	mergeMethod: MergeMethod;
}

/**
 * Update type based on semver
 */
export type UpdateType = "major" | "minor" | "patch" | "unknown";
