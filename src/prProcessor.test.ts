// Mock all dependencies before importing
jest.mock("@actions/core");
jest.mock("fs", () => ({
	...jest.requireActual("fs"),
	readFileSync: jest.fn(),
}));
jest.mock("./git");
jest.mock("./pr");
jest.mock("./github");
jest.mock("./automerge");

import * as core from "@actions/core";
import * as fs from "fs";
import * as github from "@actions/github";
import { applyUpdates, createBranchName, createCommitMessage, validateModifiedFiles } from "./git";
import { generatePRTitle, generatePRBody } from "./pr";
import { checkExistingPR, createOrUpdateBranch, createOrUpdatePR, createCommit } from "./github";
import { shouldAutoMerge, enableAutoMerge, isAutoMergeEnabled } from "./automerge";
import { processPRForUpdateGroup, processAllPRs, type PRProcessingConfig } from "./prProcessor";
import type { ExtensionUpdate } from "./types";
import { createMockUpdate, createMockOctokit } from "./__test-utils__/mockFactories";

const mockCore = jest.mocked(core);
const mockFs = jest.mocked(fs);
const mockApplyUpdates = jest.mocked(applyUpdates);
const mockCreateBranchName = jest.mocked(createBranchName);
const mockCreateCommitMessage = jest.mocked(createCommitMessage);
const mockValidateModifiedFiles = jest.mocked(validateModifiedFiles);
const mockGeneratePRTitle = jest.mocked(generatePRTitle);
const mockGeneratePRBody = jest.mocked(generatePRBody);
const mockCheckExistingPR = jest.mocked(checkExistingPR);
const mockCreateOrUpdateBranch = jest.mocked(createOrUpdateBranch);
const mockCreateOrUpdatePR = jest.mocked(createOrUpdatePR);
const mockCreateCommit = jest.mocked(createCommit);
const mockShouldAutoMerge = jest.mocked(shouldAutoMerge);
const mockEnableAutoMerge = jest.mocked(enableAutoMerge);
const mockIsAutoMergeEnabled = jest.mocked(isAutoMergeEnabled);

const mockOctokit = createMockOctokit();

describe("processPRForUpdateGroup", () => {
	const createUpdate = createMockUpdate;

	const baseConfig: PRProcessingConfig = {
		workspacePath: "/workspace",
		baseBranch: "main",
		baseSha: "abc123",
		branchPrefix: "chore/quarto-extensions",
		prTitlePrefix: "chore(deps):",
		commitMessagePrefix: "chore(deps):",
		prLabels: ["dependencies"],
		autoMergeConfig: { enabled: false, strategy: "patch", mergeMethod: "squash" },
		assignmentConfig: { reviewers: [], teamReviewers: [], assignees: [] },
	};

	beforeEach(() => {
		jest.clearAllMocks();

		// Default successful mocks
		mockCreateBranchName.mockReturnValue("chore/quarto-extensions/update");
		mockGeneratePRTitle.mockReturnValue("chore(deps): update extension");
		mockCheckExistingPR.mockResolvedValue({ exists: false });
		mockApplyUpdates.mockReturnValue(["/workspace/_extensions/owner/ext/_extension.yml"]);
		mockValidateModifiedFiles.mockReturnValue(true);
		mockCreateCommitMessage.mockReturnValue("chore(deps): update extension\n\nUpdate details");
		mockCreateOrUpdateBranch.mockResolvedValue(undefined);
		mockFs.readFileSync.mockReturnValue(Buffer.from("file content"));
		mockCreateCommit.mockResolvedValue("commit123");
		mockGeneratePRBody.mockResolvedValue("PR body");
		mockCreateOrUpdatePR.mockResolvedValue({ number: 123, url: "https://github.com/owner/repo/pull/123" });
		mockShouldAutoMerge.mockReturnValue(false);
	});

	it("should successfully process a single update", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];

		const result = await processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, baseConfig);

		expect(result).toEqual({
			number: 123,
			url: "https://github.com/owner/repo/pull/123",
		});

		expect(mockApplyUpdates).toHaveBeenCalledWith(updates);
		expect(mockCreateCommit).toHaveBeenCalled();
		expect(mockCreateOrUpdatePR).toHaveBeenCalled();
	});

	it("should skip if PR already exists", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];

		mockCheckExistingPR.mockResolvedValue({
			exists: true,
			prNumber: 456,
			prUrl: "https://github.com/owner/repo/pull/456",
		});

		const result = await processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, baseConfig);

		expect(result).toEqual({
			number: 456,
			url: "https://github.com/owner/repo/pull/456",
		});

		expect(mockCore.info).toHaveBeenCalledWith(
			expect.stringContaining("PR #456 already exists for owner/ext1@1.1.0"),
		);
		expect(mockApplyUpdates).not.toHaveBeenCalled();
	});

	it("should handle grouped updates", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0"), createUpdate("owner/ext2", "2.0.0", "2.1.0")];

		mockApplyUpdates.mockReturnValue([
			"/workspace/_extensions/owner/ext1/_extension.yml",
			"/workspace/_extensions/owner/ext2/_extension.yml",
		]);

		const result = await processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, baseConfig);

		expect(result.number).toBe(123);
		expect(mockApplyUpdates).toHaveBeenCalledWith(updates);
		expect(mockCore.info).toHaveBeenCalledWith("Modified 2 file(s)");
	});

	it("should throw error if file validation fails", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];

		mockValidateModifiedFiles.mockReturnValue(false);

		await expect(processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, baseConfig)).rejects.toThrow(
			"Failed to validate modified files for owner/ext1",
		);
	});

	it("should handle auto-merge for single update when enabled and qualifies", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.0.1")];

		const config: PRProcessingConfig = {
			...baseConfig,
			autoMergeConfig: { enabled: true, strategy: "patch", mergeMethod: "squash" },
		};

		mockShouldAutoMerge.mockReturnValue(true);
		mockIsAutoMergeEnabled.mockResolvedValue(false);

		await processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, config);

		expect(mockShouldAutoMerge).toHaveBeenCalledWith(updates[0], config.autoMergeConfig);
		expect(mockEnableAutoMerge).toHaveBeenCalledWith(mockOctokit, "owner", "repo", 123, "squash");
		expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining("Auto-merge enabled for owner/ext1"));
	});

	it("should skip auto-merge if already enabled", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.0.1")];

		const config: PRProcessingConfig = {
			...baseConfig,
			autoMergeConfig: { enabled: true, strategy: "patch", mergeMethod: "squash" },
		};

		mockShouldAutoMerge.mockReturnValue(true);
		mockIsAutoMergeEnabled.mockResolvedValue(true);

		await processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, config);

		expect(mockEnableAutoMerge).not.toHaveBeenCalled();
		expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining("Auto-merge already enabled for PR #123"));
	});

	it("should not enable auto-merge for single update when it does not qualify", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "2.0.0")]; // Major update

		const config: PRProcessingConfig = {
			...baseConfig,
			autoMergeConfig: { enabled: true, strategy: "patch", mergeMethod: "squash" },
		};

		mockShouldAutoMerge.mockReturnValue(false);

		await processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, config);

		expect(mockEnableAutoMerge).not.toHaveBeenCalled();
		expect(mockCore.info).toHaveBeenCalledWith(
			expect.stringContaining("Auto-merge not applicable for owner/ext1 (strategy: patch)"),
		);
	});

	it("should enable auto-merge for grouped updates when all qualify", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.0.1"), createUpdate("owner/ext2", "2.0.0", "2.0.1")];

		mockApplyUpdates.mockReturnValue([
			"/workspace/_extensions/owner/ext1/_extension.yml",
			"/workspace/_extensions/owner/ext2/_extension.yml",
		]);

		const config: PRProcessingConfig = {
			...baseConfig,
			autoMergeConfig: { enabled: true, strategy: "patch", mergeMethod: "squash" },
		};

		mockShouldAutoMerge.mockReturnValue(true);
		mockIsAutoMergeEnabled.mockResolvedValue(false);

		await processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, config);

		expect(mockEnableAutoMerge).toHaveBeenCalledWith(mockOctokit, "owner", "repo", 123, "squash");
		expect(mockCore.info).toHaveBeenCalledWith(
			expect.stringContaining("Auto-merge enabled for grouped updates (all 2 updates qualify)"),
		);
	});

	it("should not enable auto-merge for grouped updates when not all qualify", async () => {
		const updates = [
			createUpdate("owner/ext1", "1.0.0", "1.0.1"), // Patch
			createUpdate("owner/ext2", "2.0.0", "3.0.0"), // Major
		];

		mockApplyUpdates.mockReturnValue([
			"/workspace/_extensions/owner/ext1/_extension.yml",
			"/workspace/_extensions/owner/ext2/_extension.yml",
		]);

		const config: PRProcessingConfig = {
			...baseConfig,
			autoMergeConfig: { enabled: true, strategy: "patch", mergeMethod: "squash" },
		};

		mockShouldAutoMerge.mockReturnValueOnce(true).mockReturnValueOnce(false);

		await processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, config);

		expect(mockEnableAutoMerge).not.toHaveBeenCalled();
		expect(mockCore.info).toHaveBeenCalledWith(
			expect.stringContaining("Auto-merge not applicable for grouped updates (not all updates qualify"),
		);
	});

	it("should strip workspace path from file paths", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];

		mockApplyUpdates.mockReturnValue(["/workspace/_extensions/owner/ext1/_extension.yml"]);

		await processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, baseConfig);

		expect(mockCreateCommit).toHaveBeenCalledWith(
			mockOctokit,
			"owner",
			"repo",
			"chore/quarto-extensions/update",
			"abc123",
			expect.any(String),
			[
				{
					path: "_extensions/owner/ext1/_extension.yml",
					content: expect.any(Buffer),
				},
			],
		);
	});

	it("should handle PR creation error", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];

		mockCreateOrUpdatePR.mockRejectedValue(new Error("API error"));

		await expect(processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, baseConfig)).rejects.toThrow(
			"API error",
		);

		expect(mockCore.error).toHaveBeenCalledWith(expect.stringContaining("Failed to create/update PR for owner/ext1"));
	});

	it("should handle grouped updates error with proper description", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0"), createUpdate("owner/ext2", "2.0.0", "2.1.0")];

		mockApplyUpdates.mockReturnValue([
			"/workspace/_extensions/owner/ext1/_extension.yml",
			"/workspace/_extensions/owner/ext2/_extension.yml",
		]);
		mockCreateOrUpdatePR.mockRejectedValue(new Error("API error"));

		await expect(processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, baseConfig)).rejects.toThrow(
			"API error",
		);

		expect(mockCore.error).toHaveBeenCalledWith(
			expect.stringContaining("Failed to create/update PR for grouped updates"),
		);
	});
});

describe("processAllPRs", () => {
	const createUpdate = createMockUpdate;

	const baseConfig: PRProcessingConfig = {
		workspacePath: "/workspace",
		baseBranch: "main",
		baseSha: "abc123",
		branchPrefix: "chore/quarto-extensions",
		prTitlePrefix: "chore(deps):",
		commitMessagePrefix: "chore(deps):",
		prLabels: ["dependencies"],
		autoMergeConfig: { enabled: false, strategy: "patch", mergeMethod: "squash" },
		assignmentConfig: { reviewers: [], teamReviewers: [], assignees: [] },
	};

	beforeEach(() => {
		jest.clearAllMocks();

		// Default successful mocks
		mockCreateBranchName.mockReturnValue("chore/quarto-extensions/update");
		mockGeneratePRTitle.mockReturnValue("chore(deps): update extension");
		mockCheckExistingPR.mockResolvedValue({ exists: false });
		mockApplyUpdates.mockReturnValue(["/workspace/_extensions/owner/ext/_extension.yml"]);
		mockValidateModifiedFiles.mockReturnValue(true);
		mockCreateCommitMessage.mockReturnValue("chore(deps): update extension");
		mockCreateOrUpdateBranch.mockResolvedValue(undefined);
		mockFs.readFileSync.mockReturnValue(Buffer.from("file content"));
		mockCreateCommit.mockResolvedValue("commit123");
		mockGeneratePRBody.mockResolvedValue("PR body");
		mockCreateOrUpdatePR.mockResolvedValue({ number: 123, url: "https://github.com/owner/repo/pull/123" });
		mockShouldAutoMerge.mockReturnValue(false);
		mockCore.startGroup.mockImplementation(() => {
			// Mock implementation
		});
		mockCore.endGroup.mockImplementation(() => {
			// Mock implementation
		});
	});

	it("should process multiple updates individually when not grouped", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0"), createUpdate("owner/ext2", "2.0.0", "2.1.0")];

		mockCreateOrUpdatePR
			.mockResolvedValueOnce({ number: 123, url: "https://github.com/owner/repo/pull/123" })
			.mockResolvedValueOnce({ number: 124, url: "https://github.com/owner/repo/pull/124" });

		const results = await processAllPRs(mockOctokit, "owner", "repo", updates, false, baseConfig);

		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({ number: 123, url: "https://github.com/owner/repo/pull/123" });
		expect(results[1]).toEqual({ number: 124, url: "https://github.com/owner/repo/pull/124" });
		expect(mockCore.startGroup).toHaveBeenCalledTimes(2);
	});

	it("should process all updates together when grouped", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0"), createUpdate("owner/ext2", "2.0.0", "2.1.0")];

		mockApplyUpdates.mockReturnValue([
			"/workspace/_extensions/owner/ext1/_extension.yml",
			"/workspace/_extensions/owner/ext2/_extension.yml",
		]);

		const results = await processAllPRs(mockOctokit, "owner", "repo", updates, true, baseConfig);

		expect(results).toHaveLength(1);
		expect(results[0]).toEqual({ number: 123, url: "https://github.com/owner/repo/pull/123" });
		expect(mockCore.startGroup).toHaveBeenCalledTimes(1);
		expect(mockCore.startGroup).toHaveBeenCalledWith(expect.stringContaining("2 extensions"));
	});

	it("should use correct group description for single extension", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];

		await processAllPRs(mockOctokit, "owner", "repo", updates, false, baseConfig);

		expect(mockCore.startGroup).toHaveBeenCalledWith(expect.stringContaining("owner/ext1"));
	});

	it("should handle errors and still call endGroup", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];

		mockCreateOrUpdatePR.mockRejectedValue(new Error("API error"));

		await expect(processAllPRs(mockOctokit, "owner", "repo", updates, false, baseConfig)).rejects.toThrow(
			"API error",
		);

		expect(mockCore.endGroup).toHaveBeenCalled();
		expect(mockCore.error).toHaveBeenCalledWith(expect.stringContaining("Failed to process owner/ext1"));
	});

	it("should process empty updates array", async () => {
		const updates: ExtensionUpdate[] = [];

		const results = await processAllPRs(mockOctokit, "owner", "repo", updates, false, baseConfig);

		expect(results).toEqual([]);
		expect(mockCore.startGroup).not.toHaveBeenCalled();
	});
});
