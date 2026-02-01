import type { AutoMergeStrategy, MergeMethod, UpdateStrategy } from "./types";
import { ValidationError } from "./errors";
import {
	VALID_MERGE_METHODS,
	VALID_AUTO_MERGE_STRATEGIES,
	VALID_UPDATE_STRATEGIES,
	HTTPS_PROTOCOL,
	INVALID_GIT_REF_CHARS,
} from "./constants";

/**
 * Validates that a merge method is one of the allowed values
 * @param method The merge method to validate
 * @throws ValidationError if the merge method is invalid
 */
export function validateMergeMethod(method: string): asserts method is MergeMethod {
	if (!VALID_MERGE_METHODS.includes(method as MergeMethod)) {
		throw new ValidationError(
			`Invalid merge method: '${method}'. Must be one of: ${VALID_MERGE_METHODS.join(", ")}`,
			"auto-merge-method",
			method,
		);
	}
}

/**
 * Validates that an auto-merge strategy is one of the allowed values
 * @param strategy The auto-merge strategy to validate
 * @throws ValidationError if the strategy is invalid
 */
export function validateAutoMergeStrategy(strategy: string): asserts strategy is AutoMergeStrategy {
	if (!VALID_AUTO_MERGE_STRATEGIES.includes(strategy as AutoMergeStrategy)) {
		throw new ValidationError(
			`Invalid auto-merge strategy: '${strategy}'. Must be one of: ${VALID_AUTO_MERGE_STRATEGIES.join(", ")}`,
			"auto-merge-strategy",
			strategy,
		);
	}
}

/**
 * Validates that an update strategy is one of the allowed values
 * @param strategy The update strategy to validate
 * @throws ValidationError if the strategy is invalid
 */
export function validateUpdateStrategy(strategy: string): asserts strategy is UpdateStrategy {
	if (!VALID_UPDATE_STRATEGIES.includes(strategy as UpdateStrategy)) {
		throw new ValidationError(
			`Invalid update strategy: '${strategy}'. Must be one of: ${VALID_UPDATE_STRATEGIES.join(", ")}`,
			"update-strategy",
			strategy,
		);
	}
}

/**
 * Validates a workspace path
 * @param workspacePath The workspace path to validate
 * @throws ValidationError if the path is invalid
 */
export function validateWorkspacePath(workspacePath: string): void {
	if (!workspacePath || workspacePath.trim().length === 0) {
		throw new ValidationError("Workspace path cannot be empty", "workspace-path", workspacePath);
	}
}

/**
 * Validates a registry URL
 * @param registryUrl The registry URL to validate
 * @throws ValidationError if the URL is invalid
 */
export function validateRegistryUrl(registryUrl: string): void {
	if (!registryUrl.startsWith(HTTPS_PROTOCOL)) {
		throw new ValidationError(`Registry URL must use HTTPS: ${registryUrl}`, "registry-url", registryUrl);
	}

	try {
		new URL(registryUrl);
	} catch {
		throw new ValidationError(`Invalid registry URL format: ${registryUrl}`, "registry-url", registryUrl);
	}
}

/**
 * Validates a branch prefix
 * @param branchPrefix The branch prefix to validate
 * @throws ValidationError if the prefix is invalid
 */
export function validateBranchPrefix(branchPrefix: string): void {
	if (branchPrefix.includes(" ")) {
		throw new ValidationError(`Branch prefix cannot contain spaces: ${branchPrefix}`, "branch-prefix", branchPrefix);
	}

	if (branchPrefix.includes("..")) {
		throw new ValidationError(`Branch prefix cannot contain '..': ${branchPrefix}`, "branch-prefix", branchPrefix);
	}

	// Check for invalid Git ref characters
	if (INVALID_GIT_REF_CHARS.test(branchPrefix)) {
		throw new ValidationError(
			`Branch prefix contains invalid characters: ${branchPrefix}`,
			"branch-prefix",
			branchPrefix,
		);
	}
}

/**
 * Parses a comma-separated list input into trimmed, non-empty strings
 * @param input The comma-separated input string
 * @returns Array of trimmed, non-empty strings
 */
export function parseCommaSeparatedList(input: string): string[] {
	if (!input || input.trim().length === 0) {
		return [];
	}

	return input
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}
