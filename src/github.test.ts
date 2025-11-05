import {
	checkExistingPR,
	createOrUpdateBranch,
	createOrUpdatePR,
	createCommit,
	requestReviewersAndAssignees,
	createIssueForUpdates,
} from "./github";
import type { PRAssignmentConfig, ExtensionUpdate, AutoMergeConfig, ExtensionFilterConfig } from "./types";
import { createMockUpdate } from "./__test-utils__/mockFactories";
import { HTTP_UNPROCESSABLE_ENTITY } from "./constants";
import * as core from "@actions/core";

// Mock modules
jest.mock("@actions/core");

// Get actual fs for constants
jest.mock("fs", () => ({
	...jest.requireActual("fs"),
}));

// Define mock Octokit type
interface MockOctokit {
	rest: {
		git: {
			createRef: jest.Mock;
			updateRef: jest.Mock;
			getTree: jest.Mock;
			createBlob: jest.Mock;
			createTree: jest.Mock;
			createCommit: jest.Mock;
		};
		pulls: {
			list: jest.Mock;
			create: jest.Mock;
			update: jest.Mock;
			requestReviewers: jest.Mock;
		};
		issues: {
			setLabels: jest.Mock;
			addAssignees: jest.Mock;
			create: jest.Mock;
		};
	};
}

describe("github.ts", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		jest.clearAllMocks();

		// Create a fresh mock Octokit for each test
		mockOctokit = {
			rest: {
				git: {
					createRef: jest.fn(),
					updateRef: jest.fn(),
					getTree: jest.fn(),
					createBlob: jest.fn(),
					createTree: jest.fn(),
					createCommit: jest.fn(),
				},
				pulls: {
					list: jest.fn(),
					create: jest.fn(),
					update: jest.fn(),
					requestReviewers: jest.fn(),
				},
				issues: {
					setLabels: jest.fn(),
					addAssignees: jest.fn(),
					create: jest.fn(),
				},
			},
		};
	});

	describe("checkExistingPR", () => {
		it("should return exists: true when PR exists with matching title", async () => {
			mockOctokit.rest.pulls.list.mockResolvedValue({
				data: [
					{
						number: 42,
						title: "chore(deps): update quarto-revealjs-codefocus to 1.0.0",
						html_url: "https://github.com/owner/repo/pull/42",
					},
				],
			});

			const result = await checkExistingPR(
				mockOctokit as any,
				"owner",
				"repo",
				"chore/quarto-extensions/revealjs-codefocus",
				"chore(deps): update quarto-revealjs-codefocus to 1.0.0",
			);

			expect(result).toEqual({
				exists: true,
				prNumber: 42,
				prUrl: "https://github.com/owner/repo/pull/42",
			});
		});

		it("should return exists: false when PR exists but title does not match", async () => {
			mockOctokit.rest.pulls.list.mockResolvedValue({
				data: [
					{
						number: 42,
						title: "chore(deps): update quarto-revealjs-codefocus to 0.9.0",
						html_url: "https://github.com/owner/repo/pull/42",
					},
				],
			});

			const result = await checkExistingPR(
				mockOctokit as any,
				"owner",
				"repo",
				"chore/quarto-extensions/revealjs-codefocus",
				"chore(deps): update quarto-revealjs-codefocus to 1.0.0",
			);

			expect(result).toEqual({
				exists: false,
			});
		});

		it("should return exists: false when no PRs found", async () => {
			mockOctokit.rest.pulls.list.mockResolvedValue({
				data: [],
			});

			const result = await checkExistingPR(
				mockOctokit as any,
				"owner",
				"repo",
				"chore/quarto-extensions/revealjs-codefocus",
				"chore(deps): update quarto-revealjs-codefocus to 1.0.0",
			);

			expect(result).toEqual({
				exists: false,
			});
		});

		it("should return exists: false and log debug on 404 error", async () => {
			const error = new Error("Not found") as Error & { status?: number };
			error.status = 404;
			mockOctokit.rest.pulls.list.mockRejectedValue(error);

			const mockCore = core as jest.Mocked<typeof core>;

			const result = await checkExistingPR(
				mockOctokit as any,
				"owner",
				"repo",
				"chore/quarto-extensions/revealjs-codefocus",
				"chore(deps): update quarto-revealjs-codefocus to 1.0.0",
			);

			expect(result).toEqual({
				exists: false,
			});
			expect(mockCore.debug).toHaveBeenCalled();
		});

		it("should throw on unexpected errors", async () => {
			const error = new Error("Unexpected error") as Error & { status?: number };
			error.status = 500;
			mockOctokit.rest.pulls.list.mockRejectedValue(error);

			const mockCore = core as jest.Mocked<typeof core>;

			await expect(
				checkExistingPR(
					mockOctokit as any,
					"owner",
					"repo",
					"chore/quarto-extensions/revealjs-codefocus",
					"chore(deps): update quarto-revealjs-codefocus to 1.0.0",
				),
			).rejects.toThrow("Unexpected error");

			expect(mockCore.warning).toHaveBeenCalled();
		});
	});

	describe("createOrUpdateBranch", () => {
		it("should create a new branch when it does not exist", async () => {
			mockOctokit.rest.git.createRef.mockResolvedValue({ data: {} });

			await createOrUpdateBranch(mockOctokit as any, "owner", "repo", "test-branch", "abc123");

			expect(mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				ref: "refs/heads/test-branch",
				sha: "abc123",
			});
		});

		it("should update existing branch when conflict occurs", async () => {
			const error = new Error("Reference already exists") as Error & { status?: number };
			error.status = HTTP_UNPROCESSABLE_ENTITY;
			mockOctokit.rest.git.createRef.mockRejectedValue(error);
			mockOctokit.rest.git.updateRef.mockResolvedValue({ data: {} });

			await createOrUpdateBranch(mockOctokit as any, "owner", "repo", "test-branch", "abc123");

			expect(mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				ref: "heads/test-branch",
				sha: "abc123",
				force: true,
			});
		});

		it("should throw on non-conflict errors", async () => {
			const error = new Error("Server error") as Error & { status?: number };
			error.status = 500;
			mockOctokit.rest.git.createRef.mockRejectedValue(error);

			await expect(createOrUpdateBranch(mockOctokit as any, "owner", "repo", "test-branch", "abc123")).rejects.toThrow(
				"Server error",
			);
		});
	});

	describe("requestReviewersAndAssignees", () => {
		it("should request reviewers and assignees successfully", async () => {
			const mockCore = core as jest.Mocked<typeof core>;
			mockOctokit.rest.pulls.requestReviewers.mockResolvedValue({ data: {} });
			mockOctokit.rest.issues.addAssignees.mockResolvedValue({ data: {} });

			const assignmentConfig: PRAssignmentConfig = {
				reviewers: ["user1", "user2"],
				teamReviewers: ["team1"],
				assignees: ["user3"],
			};

			await requestReviewersAndAssignees(mockOctokit as any, "owner", "repo", 42, assignmentConfig);

			expect(mockOctokit.rest.pulls.requestReviewers).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				pull_number: 42,
				reviewers: ["user1", "user2"],
				team_reviewers: ["team1"],
			});

			expect(mockOctokit.rest.issues.addAssignees).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				issue_number: 42,
				assignees: ["user3"],
			});

			expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining("Requested reviewers"));
			expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining("Added assignees"));
		});

		it("should handle only reviewers", async () => {
			mockOctokit.rest.pulls.requestReviewers.mockResolvedValue({ data: {} });

			const assignmentConfig: PRAssignmentConfig = {
				reviewers: ["user1"],
				teamReviewers: [],
				assignees: [],
			};

			await requestReviewersAndAssignees(mockOctokit as any, "owner", "repo", 42, assignmentConfig);

			expect(mockOctokit.rest.pulls.requestReviewers).toHaveBeenCalled();
			expect(mockOctokit.rest.issues.addAssignees).not.toHaveBeenCalled();
		});

		it("should handle only assignees", async () => {
			mockOctokit.rest.issues.addAssignees.mockResolvedValue({ data: {} });

			const assignmentConfig: PRAssignmentConfig = {
				reviewers: [],
				teamReviewers: [],
				assignees: ["user1"],
			};

			await requestReviewersAndAssignees(mockOctokit as any, "owner", "repo", 42, assignmentConfig);

			expect(mockOctokit.rest.pulls.requestReviewers).not.toHaveBeenCalled();
			expect(mockOctokit.rest.issues.addAssignees).toHaveBeenCalled();
		});

		it("should do nothing when no reviewers or assignees", async () => {
			const assignmentConfig: PRAssignmentConfig = {
				reviewers: [],
				teamReviewers: [],
				assignees: [],
			};

			await requestReviewersAndAssignees(mockOctokit as any, "owner", "repo", 42, assignmentConfig);

			expect(mockOctokit.rest.pulls.requestReviewers).not.toHaveBeenCalled();
			expect(mockOctokit.rest.issues.addAssignees).not.toHaveBeenCalled();
		});

		it("should log warning on error but not throw", async () => {
			const mockCore = core as jest.Mocked<typeof core>;
			mockOctokit.rest.pulls.requestReviewers.mockRejectedValue(new Error("API Error"));

			const assignmentConfig: PRAssignmentConfig = {
				reviewers: ["user1"],
				teamReviewers: [],
				assignees: [],
			};

			await expect(
				requestReviewersAndAssignees(mockOctokit as any, "owner", "repo", 42, assignmentConfig),
			).resolves.not.toThrow();

			expect(mockCore.warning).toHaveBeenCalled();
		});

		it("should format team reviewers with @owner prefix", async () => {
			const mockCore = core as jest.Mocked<typeof core>;
			mockOctokit.rest.pulls.requestReviewers.mockResolvedValue({ data: {} });

			const assignmentConfig: PRAssignmentConfig = {
				reviewers: [],
				teamReviewers: ["frontend-team", "backend-team"],
				assignees: [],
			};

			await requestReviewersAndAssignees(mockOctokit as any, "owner", "repo", 42, assignmentConfig);

			expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining("@owner/frontend-team, @owner/backend-team"));
		});
	});

	describe("createOrUpdatePR", () => {
		it("should create a new PR when none exists", async () => {
			mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
			mockOctokit.rest.pulls.create.mockResolvedValue({
				data: {
					number: 42,
					html_url: "https://github.com/owner/repo/pull/42",
				},
			});
			mockOctokit.rest.issues.setLabels.mockResolvedValue({ data: {} });

			const result = await createOrUpdatePR(
				mockOctokit as any,
				"owner",
				"repo",
				"test-branch",
				"main",
				"Test PR",
				"PR body",
				["dependencies"],
			);

			expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				title: "Test PR",
				body: "PR body",
				head: "test-branch",
				base: "main",
			});

			expect(mockOctokit.rest.issues.setLabels).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				issue_number: 42,
				labels: ["dependencies"],
			});

			expect(result).toEqual({
				number: 42,
				url: "https://github.com/owner/repo/pull/42",
			});
		});

		it("should update existing PR", async () => {
			mockOctokit.rest.pulls.list.mockResolvedValue({
				data: [
					{
						number: 42,
						title: "Old title",
						html_url: "https://github.com/owner/repo/pull/42",
					},
				],
			});
			mockOctokit.rest.pulls.update.mockResolvedValue({
				data: {
					number: 42,
					html_url: "https://github.com/owner/repo/pull/42",
				},
			});
			mockOctokit.rest.issues.setLabels.mockResolvedValue({ data: {} });

			const result = await createOrUpdatePR(
				mockOctokit as any,
				"owner",
				"repo",
				"test-branch",
				"main",
				"New title",
				"New body",
				["dependencies"],
			);

			expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				pull_number: 42,
				title: "New title",
				body: "New body",
			});

			expect(mockOctokit.rest.issues.setLabels).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				issue_number: 42,
				labels: ["dependencies"],
			});

			expect(result).toEqual({
				number: 42,
				url: "https://github.com/owner/repo/pull/42",
			});
		});

		it("should request reviewers and assignees when config provided", async () => {
			mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
			mockOctokit.rest.pulls.create.mockResolvedValue({
				data: {
					number: 42,
					html_url: "https://github.com/owner/repo/pull/42",
				},
			});
			mockOctokit.rest.issues.setLabels.mockResolvedValue({ data: {} });
			mockOctokit.rest.pulls.requestReviewers.mockResolvedValue({ data: {} });

			const assignmentConfig: PRAssignmentConfig = {
				reviewers: ["user1"],
				teamReviewers: [],
				assignees: [],
			};

			await createOrUpdatePR(
				mockOctokit as any,
				"owner",
				"repo",
				"test-branch",
				"main",
				"Test PR",
				"PR body",
				["dependencies"],
				assignmentConfig,
			);

			expect(mockOctokit.rest.pulls.requestReviewers).toHaveBeenCalled();
		});

		it("should not request reviewers when config not provided", async () => {
			mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
			mockOctokit.rest.pulls.create.mockResolvedValue({
				data: {
					number: 42,
					html_url: "https://github.com/owner/repo/pull/42",
				},
			});
			mockOctokit.rest.issues.setLabels.mockResolvedValue({ data: {} });

			await createOrUpdatePR(mockOctokit as any, "owner", "repo", "test-branch", "main", "Test PR", "PR body", [
				"dependencies",
			]);

			expect(mockOctokit.rest.pulls.requestReviewers).not.toHaveBeenCalled();
		});
	});

	describe("createCommit", () => {
		it("should create commit with multiple files", async () => {
			mockOctokit.rest.git.getTree.mockResolvedValue({
				data: { sha: "tree-sha" },
			});

			mockOctokit.rest.git.createBlob.mockResolvedValue({
				data: { sha: "blob-sha-1" },
			});

			mockOctokit.rest.git.createTree.mockResolvedValue({
				data: { sha: "new-tree-sha" },
			});

			mockOctokit.rest.git.createCommit.mockResolvedValue({
				data: { sha: "commit-sha" },
			});

			mockOctokit.rest.git.updateRef.mockResolvedValue({
				data: {},
			});

			const files = [
				{ path: "file1.txt", content: Buffer.from("content1") },
				{ path: "file2.txt", content: Buffer.from("content2") },
			];

			const commitSha = await createCommit(
				mockOctokit as any,
				"owner",
				"repo",
				"test-branch",
				"base-sha",
				"Test commit",
				files,
			);

			expect(commitSha).toBe("commit-sha");
			expect(mockOctokit.rest.git.createBlob).toHaveBeenCalledTimes(2);
		});

		it("should handle single file", async () => {
			mockOctokit.rest.git.getTree.mockResolvedValue({
				data: { sha: "tree-sha" },
			});

			mockOctokit.rest.git.createBlob.mockResolvedValue({
				data: { sha: "blob-sha" },
			});

			mockOctokit.rest.git.createTree.mockResolvedValue({
				data: { sha: "new-tree-sha" },
			});

			mockOctokit.rest.git.createCommit.mockResolvedValue({
				data: { sha: "commit-sha" },
			});

			mockOctokit.rest.git.updateRef.mockResolvedValue({
				data: {},
			});

			const files = [{ path: "file.txt", content: Buffer.from("content") }];

			const commitSha = await createCommit(
				mockOctokit as any,
				"owner",
				"repo",
				"test-branch",
				"base-sha",
				"Test commit",
				files,
			);

			expect(commitSha).toBe("commit-sha");
			expect(mockOctokit.rest.git.createBlob).toHaveBeenCalledTimes(1);
		});

		it("should handle empty file list", async () => {
			mockOctokit.rest.git.getTree.mockResolvedValue({
				data: { sha: "tree-sha" },
			});

			mockOctokit.rest.git.createTree.mockResolvedValue({
				data: { sha: "new-tree-sha" },
			});

			mockOctokit.rest.git.createCommit.mockResolvedValue({
				data: { sha: "commit-sha" },
			});

			mockOctokit.rest.git.updateRef.mockResolvedValue({
				data: {},
			});

			const files: { path: string; content: Buffer }[] = [];

			const commitSha = await createCommit(
				mockOctokit as any,
				"owner",
				"repo",
				"test-branch",
				"base-sha",
				"Test commit",
				files,
			);

			expect(commitSha).toBe("commit-sha");
			expect(mockOctokit.rest.git.createBlob).not.toHaveBeenCalled();
		});

		it("should encode file content as base64", async () => {
			mockOctokit.rest.git.getTree.mockResolvedValue({
				data: { sha: "tree-sha" },
			});

			mockOctokit.rest.git.createBlob.mockResolvedValue({
				data: { sha: "blob-sha" },
			});

			mockOctokit.rest.git.createTree.mockResolvedValue({
				data: { sha: "new-tree-sha" },
			});

			mockOctokit.rest.git.createCommit.mockResolvedValue({
				data: { sha: "commit-sha" },
			});

			mockOctokit.rest.git.updateRef.mockResolvedValue({
				data: {},
			});

			const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
			const files = [{ path: "image.png", content: binaryContent }];

			await createCommit(mockOctokit as any, "owner", "repo", "test-branch", "base-sha", "Add image", files);

			expect(mockOctokit.rest.git.createBlob).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				content: binaryContent.toString("base64"),
				encoding: "base64",
			});
		});
	});

	describe("createIssueForUpdates", () => {
		it("should create an issue with dry-run summary", async () => {
			const updates: ExtensionUpdate[] = [
				createMockUpdate("owner/ext1", "1.0.0", "1.1.0"),
				createMockUpdate("owner/ext2", "2.0.0", "2.1.0"),
			];
			const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
			const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

			mockOctokit.rest.issues.create.mockResolvedValue({
				data: {
					number: 42,
					html_url: "https://github.com/owner/repo/issues/42",
				},
			});

			const result = await createIssueForUpdates(
				mockOctokit as any,
				"owner",
				"repo",
				updates,
				false,
				"all",
				filterConfig,
				autoMergeConfig,
			);

			expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				title: "Quarto Extensions Updates Available (2 updates)",
				body: expect.stringContaining("## Dry-Run Summary"),
			});

			expect(result).toEqual({
				number: 42,
				url: "https://github.com/owner/repo/issues/42",
			});
		});

		it("should include configuration and updates in issue body", async () => {
			const updates: ExtensionUpdate[] = [createMockUpdate("owner/ext1", "1.0.0", "1.1.0")];
			const filterConfig: ExtensionFilterConfig = { include: ["owner/ext1"], exclude: [] };
			const autoMergeConfig: AutoMergeConfig = { enabled: true, strategy: "minor", mergeMethod: "rebase" };

			mockOctokit.rest.issues.create.mockResolvedValue({
				data: {
					number: 1,
					html_url: "https://github.com/owner/repo/issues/1",
				},
			});

			await createIssueForUpdates(
				mockOctokit as any,
				"owner",
				"repo",
				updates,
				true,
				"patch",
				filterConfig,
				autoMergeConfig,
			);

			const createCall = mockOctokit.rest.issues.create.mock.calls[0][0];
			const body = createCall.body;

			// Check that the body contains configuration information
			expect(body).toContain("### Configuration");
			expect(body).toContain("⚙️ Mode");
			expect(body).toContain("⚙️ Update Strategy");
			expect(body).toContain("⚙️ Include Filter");
			expect(body).toContain("⚙️ Auto-Merge");

			// Check that the body contains update information
			expect(body).toContain("### Available Updates");
			expect(body).toContain("owner/ext1");
			expect(body).toContain("1.0.0");
			expect(body).toContain("1.1.0");
		});

		it("should use singular 'update' for single update", async () => {
			const updates: ExtensionUpdate[] = [createMockUpdate("owner/ext1", "1.0.0", "1.1.0")];
			const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
			const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

			mockOctokit.rest.issues.create.mockResolvedValue({
				data: {
					number: 1,
					html_url: "https://github.com/owner/repo/issues/1",
				},
			});

			await createIssueForUpdates(
				mockOctokit as any,
				"owner",
				"repo",
				updates,
				false,
				"all",
				filterConfig,
				autoMergeConfig,
			);

			const createCall = mockOctokit.rest.issues.create.mock.calls[0][0];
			expect(createCall.title).toBe("Quarto Extensions Updates Available (1 update)");
		});
	});
});
