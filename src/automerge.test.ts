import { getUpdateType, shouldAutoMerge, enableAutoMerge, isAutoMergeEnabled } from "./automerge";
import type { ExtensionUpdate, AutoMergeConfig } from "./types";
import * as core from "@actions/core";
import * as github from "@actions/github";

jest.mock("@actions/core");
jest.mock("@actions/github");

describe("getUpdateType", () => {
	it("should detect major updates", () => {
		expect(getUpdateType("1.0.0", "2.0.0")).toBe("major");
		expect(getUpdateType("1.5.3", "3.0.0")).toBe("major");
	});

	it("should detect minor updates", () => {
		expect(getUpdateType("1.0.0", "1.1.0")).toBe("minor");
		expect(getUpdateType("2.3.0", "2.5.0")).toBe("minor");
	});

	it("should detect patch updates", () => {
		expect(getUpdateType("1.0.0", "1.0.1")).toBe("patch");
		expect(getUpdateType("2.3.4", "2.3.5")).toBe("patch");
	});

	it("should handle pre-release versions", () => {
		expect(getUpdateType("1.0.0", "2.0.0-alpha.1")).toBe("major");
		expect(getUpdateType("1.0.0", "1.1.0-beta.2")).toBe("minor");
		expect(getUpdateType("1.0.0", "1.0.1-rc.1")).toBe("patch");
	});

	it("should handle versions with v prefix", () => {
		expect(getUpdateType("v1.0.0", "v2.0.0")).toBe("major");
		expect(getUpdateType("v1.0.0", "v1.1.0")).toBe("minor");
		expect(getUpdateType("v1.0.0", "v1.0.1")).toBe("patch");
	});

	it("should return unknown for same versions", () => {
		expect(getUpdateType("1.0.0", "1.0.0")).toBe("unknown");
	});

	it("should return unknown for invalid semver", () => {
		expect(getUpdateType("invalid", "1.0.0")).toBe("unknown");
		expect(getUpdateType("1.0.0", "invalid")).toBe("unknown");
	});
});

describe("shouldAutoMerge", () => {
	const createUpdate = (current: string, latest: string): ExtensionUpdate => ({
		name: "test-extension",
		owner: "test-owner",
		nameWithOwner: "test-owner/test-extension",
		repositoryName: "test-extension",
		currentVersion: current,
		latestVersion: latest,
		manifestPath: "/path/to/_extension.yml",
		url: "https://github.com/test-owner/test-extension",
		releaseUrl: `https://github.com/test-owner/test-extension/releases/tag/${latest}`,
		description: "Test extension",
	});

	describe("when auto-merge is disabled", () => {
		const config: AutoMergeConfig = {
			enabled: false,
			strategy: "patch",
			mergeMethod: "squash",
		};

		it("should return false for patch updates", () => {
			const update = createUpdate("1.0.0", "1.0.1");
			expect(shouldAutoMerge(update, config)).toBe(false);
		});

		it("should return false for minor updates", () => {
			const update = createUpdate("1.0.0", "1.1.0");
			expect(shouldAutoMerge(update, config)).toBe(false);
		});

		it("should return false for major updates", () => {
			const update = createUpdate("1.0.0", "2.0.0");
			expect(shouldAutoMerge(update, config)).toBe(false);
		});
	});

	describe("with patch strategy", () => {
		const config: AutoMergeConfig = {
			enabled: true,
			strategy: "patch",
			mergeMethod: "squash",
		};

		it("should return true for patch updates", () => {
			const update = createUpdate("1.0.0", "1.0.1");
			expect(shouldAutoMerge(update, config)).toBe(true);
		});

		it("should return false for minor updates", () => {
			const update = createUpdate("1.0.0", "1.1.0");
			expect(shouldAutoMerge(update, config)).toBe(false);
		});

		it("should return false for major updates", () => {
			const update = createUpdate("1.0.0", "2.0.0");
			expect(shouldAutoMerge(update, config)).toBe(false);
		});
	});

	describe("with minor strategy", () => {
		const config: AutoMergeConfig = {
			enabled: true,
			strategy: "minor",
			mergeMethod: "squash",
		};

		it("should return true for patch updates", () => {
			const update = createUpdate("1.0.0", "1.0.1");
			expect(shouldAutoMerge(update, config)).toBe(true);
		});

		it("should return true for minor updates", () => {
			const update = createUpdate("1.0.0", "1.1.0");
			expect(shouldAutoMerge(update, config)).toBe(true);
		});

		it("should return false for major updates", () => {
			const update = createUpdate("1.0.0", "2.0.0");
			expect(shouldAutoMerge(update, config)).toBe(false);
		});
	});

	describe("with all strategy", () => {
		const config: AutoMergeConfig = {
			enabled: true,
			strategy: "all",
			mergeMethod: "squash",
		};

		it("should return true for patch updates", () => {
			const update = createUpdate("1.0.0", "1.0.1");
			expect(shouldAutoMerge(update, config)).toBe(true);
		});

		it("should return true for minor updates", () => {
			const update = createUpdate("1.0.0", "1.1.0");
			expect(shouldAutoMerge(update, config)).toBe(true);
		});

		it("should return true for major updates", () => {
			const update = createUpdate("1.0.0", "2.0.0");
			expect(shouldAutoMerge(update, config)).toBe(true);
		});
	});
});

describe("enableAutoMerge", () => {
	let mockOctokit: any;

	beforeEach(() => {
		jest.clearAllMocks();
		mockOctokit = {
			rest: {
				pulls: {
					get: jest.fn(),
				},
			},
			graphql: jest.fn(),
		};
	});

	it("should enable auto-merge successfully", async () => {
		const prNodeId = "PR_test123";
		mockOctokit.rest.pulls.get.mockResolvedValue({
			data: { node_id: prNodeId },
		});
		mockOctokit.graphql.mockResolvedValue({});

		await enableAutoMerge(mockOctokit, "owner", "repo", 42, "squash");

		expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
			owner: "owner",
			repo: "repo",
			pull_number: 42,
		});

		expect(mockOctokit.graphql).toHaveBeenCalledWith(expect.stringContaining("enablePullRequestAutoMerge"), {
			pullRequestId: prNodeId,
			mergeMethod: "SQUASH",
		});

		expect(core.info).toHaveBeenCalledWith("Enabling auto-merge for PR #42 with squash method");
		expect(core.info).toHaveBeenCalledWith("Successfully enabled auto-merge for PR #42");
	});

	it("should handle different merge methods", async () => {
		const prNodeId = "PR_test123";
		mockOctokit.rest.pulls.get.mockResolvedValue({
			data: { node_id: prNodeId },
		});
		mockOctokit.graphql.mockResolvedValue({});

		// Test merge method
		await enableAutoMerge(mockOctokit, "owner", "repo", 42, "merge");
		expect(mockOctokit.graphql).toHaveBeenCalledWith(expect.any(String), {
			pullRequestId: prNodeId,
			mergeMethod: "MERGE",
		});

		// Test rebase method
		await enableAutoMerge(mockOctokit, "owner", "repo", 42, "rebase");
		expect(mockOctokit.graphql).toHaveBeenCalledWith(expect.any(String), {
			pullRequestId: prNodeId,
			mergeMethod: "REBASE",
		});
	});

	it("should log warning on error", async () => {
		const error = new Error("Test error");
		mockOctokit.rest.pulls.get.mockRejectedValue(error);

		await enableAutoMerge(mockOctokit, "owner", "repo", 42, "squash");

		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to enable auto-merge for PR #42"));
	});

	it("should log permission warning on permission error", async () => {
		const error = new Error("permissions error");
		mockOctokit.rest.pulls.get.mockRejectedValue(error);

		await enableAutoMerge(mockOctokit, "owner", "repo", 42, "squash");

		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("permissions"));
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("pull-requests: write"));
	});
});

describe("isAutoMergeEnabled", () => {
	let mockOctokit: any;

	beforeEach(() => {
		jest.clearAllMocks();
		mockOctokit = {
			graphql: jest.fn(),
		};
	});

	it("should return true when auto-merge is enabled", async () => {
		mockOctokit.graphql.mockResolvedValue({
			repository: {
				pullRequest: {
					autoMergeRequest: {
						enabledAt: "2025-01-01T00:00:00Z",
					},
				},
			},
		});

		const result = await isAutoMergeEnabled(mockOctokit, "owner", "repo", 42);

		expect(result).toBe(true);
		expect(mockOctokit.graphql).toHaveBeenCalledWith(expect.stringContaining("autoMergeRequest"), {
			owner: "owner",
			repo: "repo",
			prNumber: 42,
		});
	});

	it("should return false when auto-merge is not enabled", async () => {
		mockOctokit.graphql.mockResolvedValue({
			repository: {
				pullRequest: {
					autoMergeRequest: null,
				},
			},
		});

		const result = await isAutoMergeEnabled(mockOctokit, "owner", "repo", 42);

		expect(result).toBe(false);
	});

	it("should return false and log warning on error", async () => {
		const error = new Error("Test error");
		mockOctokit.graphql.mockRejectedValue(error);

		const result = await isAutoMergeEnabled(mockOctokit, "owner", "repo", 42);

		expect(result).toBe(false);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to check auto-merge status for PR #42"));
	});
});
