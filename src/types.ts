// Re-export core types
export type { Registry, RegistryEntry } from "@quarto-wizard/core";

/**
 * Represents data from an installed extension's manifest
 */
export interface ExtensionData {
	title?: string;
	author?: string;
	version?: string;
	quartoRequired?: string;
	contributes?: string;
	source?: string;
	repository?: string;
}

/**
 * Represents an extension that was skipped during update
 */
export interface SkippedUpdate {
	update: ExtensionUpdate;
	reason: string;
}

/**
 * Result of applying extension updates
 */
export interface ApplyUpdatesResult {
	modifiedFiles: string[];
	skippedUpdates: SkippedUpdate[];
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
 * Update strategy - controls which types of updates to apply
 */
export type UpdateStrategy = "patch" | "minor" | "all";

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

/**
 * Configuration for filtering which extensions to update
 */
export interface ExtensionFilterConfig {
	include: string[];
	exclude: string[];
}

/**
 * Configuration for PR reviewers and assignees
 */
export interface PRAssignmentConfig {
	reviewers: string[];
	teamReviewers: string[];
	assignees: string[];
}
