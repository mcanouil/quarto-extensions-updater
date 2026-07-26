/**
 * Shared test utilities for creating mock objects
 * This module provides factory functions to reduce duplication across test files
 */

import { jest } from "@jest/globals";
import type { ExtensionUpdate } from "../../src/types.js";
import type * as github from "@actions/github";
import type * as actionsCore from "@actions/core";

/**
 * Creates a mock ExtensionUpdate object for testing
 * @param nameWithOwner Full name of extension (e.g., "owner/name")
 * @param currentVersion Current version string
 * @param latestVersion Latest version string
 * @param description Optional description (defaults to "Test extension")
 * @returns Mock ExtensionUpdate object
 */
export function createMockUpdate(
	nameWithOwner: string,
	currentVersion: string,
	latestVersion: string,
	description = "Test extension",
): ExtensionUpdate {
	const [owner, name] = nameWithOwner.split("/");
	return {
		name,
		owner,
		nameWithOwner,
		repositoryName: nameWithOwner,
		currentVersion,
		latestVersion,
		manifestPath: `/workspace/_extensions/${nameWithOwner}/_extension.yml`,
		url: `https://github.com/${nameWithOwner}`,
		releaseUrl: `https://github.com/${nameWithOwner}/releases/tag/${latestVersion}`,
		description,
	};
}

/**
 * Creates a mock Octokit client for testing GitHub API interactions
 * @returns Mock Octokit object with common methods
 */
export function createMockOctokit() {
	return {
		rest: {
			pulls: {
				list: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				get: jest.fn(),
				requestReviewers: jest.fn(),
				listReviews: jest.fn(),
			},
			repos: {
				getBranch: jest.fn(),
				getReleaseByTag: jest.fn(),
			},
			git: {
				createRef: jest.fn(),
				updateRef: jest.fn(),
				createTree: jest.fn(),
				createCommit: jest.fn(),
				createBlob: jest.fn(),
			},
			issues: {
				addLabels: jest.fn(),
				addAssignees: jest.fn(),
			},
		},
		graphql: jest.fn(),
	} as unknown as ReturnType<typeof github.getOctokit>;
}

/**
 * Creates a mock @actions/core summary object
 * @returns Mock summary object with chainable methods
 */
export function createMockSummary() {
	return {
		addHeading: jest.fn().mockReturnThis(),
		addRaw: jest.fn().mockReturnThis(),
		addBreak: jest.fn().mockReturnThis(),
		addTable: jest.fn().mockReturnThis(),
		write: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	};
}

/**
 * Creates a mock of the fs module covering the surface used by src/
 * @returns Mock module object with the four fs functions the source calls
 */
export function createMockFs() {
	return {
		existsSync: jest.fn(),
		readdirSync: jest.fn(),
		readFileSync: jest.fn(),
		writeFileSync: jest.fn(),
	};
}

/**
 * Creates a mock of the @actions/core module.
 *
 * ESM has no automock equivalent to `jest.mock("@actions/core")`, so every
 * export the source uses has to be listed explicitly for
 * `jest.unstable_mockModule`.
 * @returns Mock module object covering the @actions/core surface used by src/
 */
export function createMockActionsCore() {
	return {
		info: jest.fn(),
		debug: jest.fn(),
		warning: jest.fn(),
		error: jest.fn(),
		setFailed: jest.fn(),
		getInput: jest.fn<typeof actionsCore.getInput>(),
		getBooleanInput: jest.fn<typeof actionsCore.getBooleanInput>(),
		setOutput: jest.fn(),
		startGroup: jest.fn(),
		endGroup: jest.fn(),
		summary: createMockSummary(),
	};
}
