import { jest } from "@jest/globals";
import type { ExtensionUpdate } from "../src/types.js";
import type { PRProcessingConfig } from "../src/prProcessor.js";
import {
	createMockUpdate,
	createMockOctokit,
	createMockFs,
	createMockActionsCore,
} from "./__test-utils__/mockFactories.js";

jest.unstable_mockModule("@actions/core", createMockActionsCore);
jest.unstable_mockModule("fs", createMockFs);
jest.unstable_mockModule("../src/git.js", () => ({
	getQuartoVersion: jest.fn(),
	deriveQuartoAddCwd: jest.fn(),
	applyUpdates: jest.fn(),
	createBranchName: jest.fn(),
	createCommitMessage: jest.fn(),
	validateModifiedFiles: jest.fn(),
}));
jest.unstable_mockModule("../src/pr.js", () => ({
	generatePRTitle: jest.fn(),
	generatePRBody: jest.fn(),
	generatePRLabels: jest.fn(),
	logUpdateSummary: jest.fn(),
}));
jest.unstable_mockModule("../src/github.js", () => ({
	checkExistingPR: jest.fn(),
	createOrUpdateBranch: jest.fn(),
	requestReviewersAndAssignees: jest.fn(),
	createOrUpdatePR: jest.fn(),
	createCommit: jest.fn(),
	listBaseFiles: jest.fn(),
	createIssueForUpdates: jest.fn(),
}));
jest.unstable_mockModule("../src/automerge.js", () => ({
	getUpdateType: jest.fn(),
	shouldAutoMerge: jest.fn(),
	enableAutoMerge: jest.fn(),
	isAutoMergeEnabled: jest.fn(),
}));

const core = await import("@actions/core");
const fs = await import("fs");
const { applyUpdates, createBranchName, createCommitMessage, validateModifiedFiles } = await import("../src/git.js");
const { generatePRTitle, generatePRBody } = await import("../src/pr.js");
const { checkExistingPR, createOrUpdateBranch, createOrUpdatePR, createCommit, listBaseFiles } =
	await import("../src/github.js");
const { shouldAutoMerge, enableAutoMerge, isAutoMergeEnabled } = await import("../src/automerge.js");
const { processPRForUpdateGroup, processAllPRs } = await import("../src/prProcessor.js");

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
const mockListBaseFiles = jest.mocked(listBaseFiles);
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
		mockApplyUpdates.mockReturnValue({
			modifiedFiles: ["/workspace/_extensions/owner/ext/_extension.yml"],
			skippedUpdates: [],
		});
		mockValidateModifiedFiles.mockReturnValue(true);
		mockCreateCommitMessage.mockReturnValue("chore(deps): update extension\n\nUpdate details");
		mockCreateOrUpdateBranch.mockResolvedValue(undefined);
		mockFs.readFileSync.mockReturnValue(Buffer.from("file content"));
		mockCreateCommit.mockResolvedValue("commit123");
		mockListBaseFiles.mockResolvedValue([]);
		mockGeneratePRBody.mockResolvedValue("PR body");
		mockCreateOrUpdatePR.mockResolvedValue({ number: 123, url: "https://github.com/owner/repo/pull/123" });
		mockShouldAutoMerge.mockReturnValue(false);
	});

	it("should delete files that the new release no longer ships, only in applied extension folders", async () => {
		const applied = createUpdate("owner/ext1", "1.0.0", "1.1.0");
		const skipped = createUpdate("owner/ext2", "1.0.0", "1.1.0");
		mockApplyUpdates.mockReturnValue({
			modifiedFiles: ["/workspace/_extensions/owner/ext1/_extension.yml"],
			skippedUpdates: [{ update: skipped, reason: "Needs a newer Quarto" }],
		});
		mockListBaseFiles.mockResolvedValue([
			"_extensions/owner/ext1/_extension.yml",
			"_extensions/owner/ext1/old.lua",
			"_extensions/owner/ext10/kept.lua",
			"_extensions/owner/ext2/gone.lua",
			"README.md",
		]);
		mockFs.existsSync.mockImplementation((file) => String(file).endsWith("_extension.yml"));

		await processPRForUpdateGroup(mockOctokit, "owner", "repo", [applied, skipped], baseConfig);

		expect(mockListBaseFiles).toHaveBeenCalledWith(mockOctokit, "owner", "repo", "abc123");
		expect(mockCreateCommit).toHaveBeenCalledWith(
			mockOctokit,
			"owner",
			"repo",
			"chore/quarto-extensions/update",
			"abc123",
			expect.any(String),
			expect.any(Array),
			["_extensions/owner/ext1/old.lua"],
		);
		expect(mockGeneratePRBody).toHaveBeenCalledWith(expect.any(Array), mockOctokit, expect.any(Array), [
			"_extensions/owner/ext1/old.lua",
		]);
	});

	it("should keep dropped files and warn when the base tree cannot be listed in full", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];
		mockListBaseFiles.mockResolvedValue(null);

		await processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, baseConfig);

		expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("_extensions/owner/ext1"));
		expect(mockCreateCommit).toHaveBeenCalledWith(
			mockOctokit,
			"owner",
			"repo",
			"chore/quarto-extensions/update",
			"abc123",
			expect.any(String),
			expect.any(Array),
			[],
		);
	});

	it("should successfully process a single update", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];

		const result = await processPRForUpdateGroup(mockOctokit, "owner", "repo", updates, baseConfig);

		expect(result.number).toBe(123);
		expect(result.url).toBe("https://github.com/owner/repo/pull/123");

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

		expect(result.number).toBe(456);
		expect(result.url).toBe("https://github.com/owner/repo/pull/456");

		expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining("PR #456 already exists for owner/ext1@1.1.0"));
		expect(mockApplyUpdates).not.toHaveBeenCalled();
	});

	it("should handle grouped updates", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0"), createUpdate("owner/ext2", "2.0.0", "2.1.0")];

		mockApplyUpdates.mockReturnValue({
			modifiedFiles: [
				"/workspace/_extensions/owner/ext1/_extension.yml",
				"/workspace/_extensions/owner/ext2/_extension.yml",
			],
			skippedUpdates: [],
		});

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

	it("should name the extension and require every copy to qualify for auto-merge", async () => {
		const patchCopy = createUpdate("mcanouil/gitlink", "1.9.0", "1.9.2");
		const minorCopy = {
			...createUpdate("mcanouil/gitlink", "1.8.0", "1.9.2"),
			manifestPath: "/workspace/_extensions/atelier/_extensions/mcanouil/gitlink/_extension.yml",
		};
		const config: PRProcessingConfig = {
			...baseConfig,
			autoMergeConfig: { enabled: true, strategy: "patch", mergeMethod: "squash" },
		};
		mockShouldAutoMerge.mockImplementation((update) => update.currentVersion === "1.9.0");

		const result = await processPRForUpdateGroup(mockOctokit, "owner", "repo", [patchCopy, minorCopy], config);

		expect(mockEnableAutoMerge).not.toHaveBeenCalled();
		expect(mockCore.info).toHaveBeenCalledWith(
			expect.stringContaining("Auto-merge not applicable for mcanouil/gitlink (strategy: patch)"),
		);
		expect(result.extensions).toEqual(["mcanouil/gitlink"]);
	});

	it("should judge auto-merge on the copies that were applied", async () => {
		const patchCopy = createUpdate("mcanouil/gitlink", "1.9.0", "1.9.2");
		const minorCopy = {
			...createUpdate("mcanouil/gitlink", "1.8.0", "1.9.2"),
			manifestPath: "/workspace/_extensions/atelier/_extensions/mcanouil/gitlink/_extension.yml",
		};
		mockApplyUpdates.mockReturnValue({
			modifiedFiles: ["/workspace/_extensions/mcanouil/gitlink/_extension.yml"],
			skippedUpdates: [{ update: minorCopy, reason: "Needs a newer Quarto" }],
		});
		const config: PRProcessingConfig = {
			...baseConfig,
			autoMergeConfig: { enabled: true, strategy: "patch", mergeMethod: "squash" },
		};
		mockShouldAutoMerge.mockImplementation((update) => update.currentVersion === "1.9.0");
		mockIsAutoMergeEnabled.mockResolvedValue(false);

		await processPRForUpdateGroup(mockOctokit, "owner", "repo", [patchCopy, minorCopy], config);

		expect(mockEnableAutoMerge).toHaveBeenCalledWith(mockOctokit, "owner", "repo", 123, "squash");
	});

	it("should not enable auto-merge when no update was applied", async () => {
		const update = createUpdate("owner/ext1", "1.0.0", "1.0.1");
		mockApplyUpdates.mockReturnValue({
			modifiedFiles: ["/workspace/_extensions/owner/ext1/_extension.yml"],
			skippedUpdates: [{ update, reason: "Needs a newer Quarto" }],
		});
		const config: PRProcessingConfig = {
			...baseConfig,
			autoMergeConfig: { enabled: true, strategy: "patch", mergeMethod: "squash" },
		};
		mockShouldAutoMerge.mockReturnValue(true);

		await processPRForUpdateGroup(mockOctokit, "owner", "repo", [update], config);

		expect(mockEnableAutoMerge).not.toHaveBeenCalled();
	});

	it("should name the extension when a PR for its copies already exists", async () => {
		const topLevel = createUpdate("mcanouil/gitlink", "1.0.0", "1.1.0");
		const embedded = {
			...topLevel,
			manifestPath: "/workspace/_extensions/atelier/_extensions/mcanouil/gitlink/_extension.yml",
		};
		mockCheckExistingPR.mockResolvedValue({ exists: true, prNumber: 7, prUrl: "https://github.com/owner/repo/pull/7" });

		const result = await processPRForUpdateGroup(mockOctokit, "owner", "repo", [topLevel, embedded], baseConfig);

		expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining("already exists for mcanouil/gitlink@1.1.0"));
		expect(result.extensions).toEqual(["mcanouil/gitlink"]);
	});

	it("should enable auto-merge for grouped updates when all qualify", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.0.1"), createUpdate("owner/ext2", "2.0.0", "2.0.1")];

		mockApplyUpdates.mockReturnValue({
			modifiedFiles: [
				"/workspace/_extensions/owner/ext1/_extension.yml",
				"/workspace/_extensions/owner/ext2/_extension.yml",
			],
			skippedUpdates: [],
		});

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

		mockApplyUpdates.mockReturnValue({
			modifiedFiles: [
				"/workspace/_extensions/owner/ext1/_extension.yml",
				"/workspace/_extensions/owner/ext2/_extension.yml",
			],
			skippedUpdates: [],
		});

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

		mockApplyUpdates.mockReturnValue({
			modifiedFiles: ["/workspace/_extensions/owner/ext1/_extension.yml"],
			skippedUpdates: [],
		});

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
			[],
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

		mockApplyUpdates.mockReturnValue({
			modifiedFiles: [
				"/workspace/_extensions/owner/ext1/_extension.yml",
				"/workspace/_extensions/owner/ext2/_extension.yml",
			],
			skippedUpdates: [],
		});
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
		mockApplyUpdates.mockReturnValue({
			modifiedFiles: ["/workspace/_extensions/owner/ext/_extension.yml"],
			skippedUpdates: [],
		});
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

		const { createdPRs } = await processAllPRs(mockOctokit, "owner", "repo", updates, false, baseConfig);

		expect(createdPRs).toHaveLength(2);
		expect(createdPRs[0].number).toBe(123);
		expect(createdPRs[0].url).toBe("https://github.com/owner/repo/pull/123");
		expect(createdPRs[1].number).toBe(124);
		expect(createdPRs[1].url).toBe("https://github.com/owner/repo/pull/124");
		expect(mockCore.startGroup).toHaveBeenCalledTimes(2);
	});

	it("should process all updates together when grouped", async () => {
		const updates = [createUpdate("owner/ext1", "1.0.0", "1.1.0"), createUpdate("owner/ext2", "2.0.0", "2.1.0")];

		mockApplyUpdates.mockReturnValue({
			modifiedFiles: [
				"/workspace/_extensions/owner/ext1/_extension.yml",
				"/workspace/_extensions/owner/ext2/_extension.yml",
			],
			skippedUpdates: [],
		});

		const { createdPRs } = await processAllPRs(mockOctokit, "owner", "repo", updates, true, baseConfig);

		expect(createdPRs).toHaveLength(1);
		expect(createdPRs[0].number).toBe(123);
		expect(createdPRs[0].url).toBe("https://github.com/owner/repo/pull/123");
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

		await expect(processAllPRs(mockOctokit, "owner", "repo", updates, false, baseConfig)).rejects.toThrow("API error");

		expect(mockCore.endGroup).toHaveBeenCalled();
		expect(mockCore.error).toHaveBeenCalledWith(expect.stringContaining("Failed to process owner/ext1"));
	});

	it("should put every copy of one extension in the same pull request when not grouped", async () => {
		const topLevel = createUpdate("mcanouil/gitlink", "1.0.0", "1.1.0");
		const embedded = {
			...createUpdate("mcanouil/gitlink", "1.0.0", "1.1.0"),
			manifestPath: "/workspace/_extensions/atelier/_extensions/mcanouil/gitlink/_extension.yml",
		};

		const { createdPRs } = await processAllPRs(mockOctokit, "owner", "repo", [topLevel, embedded], false, baseConfig);

		expect(createdPRs).toHaveLength(1);
		expect(mockApplyUpdates).toHaveBeenCalledTimes(1);
		expect(mockApplyUpdates).toHaveBeenCalledWith([topLevel, embedded]);
	});

	it("should process empty updates array", async () => {
		const updates: ExtensionUpdate[] = [];

		const { createdPRs, skippedUpdates } = await processAllPRs(
			mockOctokit,
			"owner",
			"repo",
			updates,
			false,
			baseConfig,
		);

		expect(createdPRs).toEqual([]);
		expect(skippedUpdates).toEqual([]);
		expect(mockCore.startGroup).not.toHaveBeenCalled();
	});
});
