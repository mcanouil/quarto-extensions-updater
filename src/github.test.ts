import {
	checkExistingPR,
	createOrUpdateBranch,
	createOrUpdatePR,
	createCommit,
	requestReviewersAndAssignees,
} from "./github";
import type { PRAssignmentConfig } from "./types";
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
						title: "chore(deps): update extension",
						html_url: "https://github.com/owner/repo/pull/42",
					},
				],
			});

			const result = await checkExistingPR(
				mockOctokit,
				"owner",
				"repo",
				"chore/quarto-extensions/update-ext",
				"chore(deps): update extension",
			);

			expect(result).toEqual({
				exists: true,
				prNumber: 42,
				prUrl: "https://github.com/owner/repo/pull/42",
			});
			expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				head: "owner:chore/quarto-extensions/update-ext",
				state: "open",
			});
		});

		it("should return exists: false when PR exists but title does not match", async () => {
			mockOctokit.rest.pulls.list.mockResolvedValue({
				data: [
					{
						number: 42,
						title: "Different title",
						html_url: "https://github.com/owner/repo/pull/42",
					},
				],
			});

			const result = await checkExistingPR(
				mockOctokit,
				"owner",
				"repo",
				"chore/quarto-extensions/update-ext",
				"chore(deps): update extension",
			);

			expect(result).toEqual({ exists: false });
		});

		it("should return exists: false when no PRs found", async () => {
			mockOctokit.rest.pulls.list.mockResolvedValue({
				data: [],
			});

			const result = await checkExistingPR(
				mockOctokit,
				"owner",
				"repo",
				"chore/quarto-extensions/update-ext",
				"chore(deps): update extension",
			);

			expect(result).toEqual({ exists: false });
		});

		it("should return exists: false and log debug on 404 error", async () => {
			const error = new Error("Not found") as Error & { status: number };
			error.status = 404;
			mockOctokit.rest.pulls.list.mockRejectedValue(error);

			const result = await checkExistingPR(
				mockOctokit,
				"owner",
				"repo",
				"chore/quarto-extensions/update-ext",
				"chore(deps): update extension",
			);

			expect(result).toEqual({ exists: false });
			expect(core.debug).toHaveBeenCalledWith(expect.stringContaining("No existing PRs found for branch"));
		});

		it("should throw on unexpected errors", async () => {
			const error = new Error("Internal server error") as Error & { status: number };
			error.status = 500;
			mockOctokit.rest.pulls.list.mockRejectedValue(error);

			await expect(
				checkExistingPR(
					mockOctokit,
					"owner",
					"repo",
					"chore/quarto-extensions/update-ext",
					"chore(deps): update extension",
				),
			).rejects.toThrow("Internal server error");

			expect(core.warning).toHaveBeenCalled();
		});
	});

	describe("createOrUpdateBranch", () => {
		it("should create a new branch when it does not exist", async () => {
			mockOctokit.rest.git.createRef.mockResolvedValue({});

			await createOrUpdateBranch(mockOctokit, "owner", "repo", "feature-branch", "abc123");

			expect(mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				ref: "refs/heads/feature-branch",
				sha: "abc123",
			});
			expect(core.info).toHaveBeenCalledWith("✅ Created branch: feature-branch");
		});

		it("should update existing branch when conflict occurs", async () => {
			const error = new Error("Reference already exists") as Error & { status: number };
			error.status = HTTP_UNPROCESSABLE_ENTITY;
			mockOctokit.rest.git.createRef.mockRejectedValue(error);
			mockOctokit.rest.git.updateRef.mockResolvedValue({});

			await createOrUpdateBranch(mockOctokit, "owner", "repo", "feature-branch", "abc123");

			expect(mockOctokit.rest.git.createRef).toHaveBeenCalled();
			expect(mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				ref: "heads/feature-branch",
				sha: "abc123",
				force: true,
			});
			expect(core.info).toHaveBeenCalledWith(
				expect.stringContaining("Branch feature-branch already exists, updating it"),
			);
		});

		it("should throw on non-conflict errors", async () => {
			const error = new Error("Forbidden") as Error & { status: number };
			error.status = 403;
			mockOctokit.rest.git.createRef.mockRejectedValue(error);

			await expect(createOrUpdateBranch(mockOctokit, "owner", "repo", "feature-branch", "abc123")).rejects.toThrow(
				"Forbidden",
			);
		});
	});

	describe("requestReviewersAndAssignees", () => {
		const assignmentConfig: PRAssignmentConfig = {
			reviewers: ["user1", "user2"],
			teamReviewers: ["team1"],
			assignees: ["assignee1"],
		};

		it("should request reviewers and assignees successfully", async () => {
			mockOctokit.rest.pulls.requestReviewers.mockResolvedValue({});
			mockOctokit.rest.issues.addAssignees.mockResolvedValue({});

			await requestReviewersAndAssignees(mockOctokit, "owner", "repo", 42, assignmentConfig);

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
				assignees: ["assignee1"],
			});
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Requested reviewers"));
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Added assignees"));
		});

		it("should handle only reviewers", async () => {
			const config: PRAssignmentConfig = {
				reviewers: ["user1"],
				teamReviewers: [],
				assignees: [],
			};

			mockOctokit.rest.pulls.requestReviewers.mockResolvedValue({});

			await requestReviewersAndAssignees(mockOctokit, "owner", "repo", 42, config);

			expect(mockOctokit.rest.pulls.requestReviewers).toHaveBeenCalled();
			expect(mockOctokit.rest.issues.addAssignees).not.toHaveBeenCalled();
		});

		it("should handle only assignees", async () => {
			const config: PRAssignmentConfig = {
				reviewers: [],
				teamReviewers: [],
				assignees: ["assignee1"],
			};

			mockOctokit.rest.issues.addAssignees.mockResolvedValue({});

			await requestReviewersAndAssignees(mockOctokit, "owner", "repo", 42, config);

			expect(mockOctokit.rest.pulls.requestReviewers).not.toHaveBeenCalled();
			expect(mockOctokit.rest.issues.addAssignees).toHaveBeenCalled();
		});

		it("should do nothing when no reviewers or assignees", async () => {
			const config: PRAssignmentConfig = {
				reviewers: [],
				teamReviewers: [],
				assignees: [],
			};

			await requestReviewersAndAssignees(mockOctokit, "owner", "repo", 42, config);

			expect(mockOctokit.rest.pulls.requestReviewers).not.toHaveBeenCalled();
			expect(mockOctokit.rest.issues.addAssignees).not.toHaveBeenCalled();
		});

		it("should log warning on error but not throw", async () => {
			mockOctokit.rest.pulls.requestReviewers.mockRejectedValue(new Error("API error"));

			await requestReviewersAndAssignees(mockOctokit, "owner", "repo", 42, assignmentConfig);

			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to set reviewers/assignees"));
		});

		it("should format team reviewers with @owner prefix", async () => {
			mockOctokit.rest.pulls.requestReviewers.mockResolvedValue({});

			await requestReviewersAndAssignees(mockOctokit, "owner", "repo", 42, assignmentConfig);

			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("@owner/team1"));
		});
	});

	describe("createOrUpdatePR", () => {
		const prLabels = ["dependencies", "quarto-extensions"];

		it("should create a new PR when none exists", async () => {
			mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
			mockOctokit.rest.pulls.create.mockResolvedValue({
				data: {
					number: 42,
					html_url: "https://github.com/owner/repo/pull/42",
				},
			});
			mockOctokit.rest.issues.setLabels.mockResolvedValue({});

			const result = await createOrUpdatePR(
				mockOctokit,
				"owner",
				"repo",
				"feature-branch",
				"main",
				"PR Title",
				"PR Body",
				prLabels,
			);

			expect(result).toEqual({
				number: 42,
				url: "https://github.com/owner/repo/pull/42",
			});
			expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				title: "PR Title",
				body: "PR Body",
				head: "feature-branch",
				base: "main",
			});
			expect(mockOctokit.rest.issues.setLabels).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				issue_number: 42,
				labels: prLabels,
			});
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Created PR"));
		});

		it("should update existing PR", async () => {
			mockOctokit.rest.pulls.list.mockResolvedValue({
				data: [{ number: 42 }],
			});
			mockOctokit.rest.pulls.update.mockResolvedValue({
				data: {
					number: 42,
					html_url: "https://github.com/owner/repo/pull/42",
				},
			});
			mockOctokit.rest.issues.setLabels.mockResolvedValue({});

			const result = await createOrUpdatePR(
				mockOctokit,
				"owner",
				"repo",
				"feature-branch",
				"main",
				"Updated PR Title",
				"Updated PR Body",
				prLabels,
			);

			expect(result).toEqual({
				number: 42,
				url: "https://github.com/owner/repo/pull/42",
			});
			expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				pull_number: 42,
				title: "Updated PR Title",
				body: "Updated PR Body",
			});
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Updating existing PR"));
		});

		it("should request reviewers and assignees when config provided", async () => {
			mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
			mockOctokit.rest.pulls.create.mockResolvedValue({
				data: {
					number: 42,
					html_url: "https://github.com/owner/repo/pull/42",
				},
			});
			mockOctokit.rest.issues.setLabels.mockResolvedValue({});
			mockOctokit.rest.pulls.requestReviewers.mockResolvedValue({});
			mockOctokit.rest.issues.addAssignees.mockResolvedValue({});

			const assignmentConfig: PRAssignmentConfig = {
				reviewers: ["user1"],
				teamReviewers: [],
				assignees: ["assignee1"],
			};

			await createOrUpdatePR(
				mockOctokit,
				"owner",
				"repo",
				"feature-branch",
				"main",
				"PR Title",
				"PR Body",
				prLabels,
				assignmentConfig,
			);

			expect(mockOctokit.rest.pulls.requestReviewers).toHaveBeenCalled();
			expect(mockOctokit.rest.issues.addAssignees).toHaveBeenCalled();
		});

		it("should not request reviewers when config not provided", async () => {
			mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });
			mockOctokit.rest.pulls.create.mockResolvedValue({
				data: {
					number: 42,
					html_url: "https://github.com/owner/repo/pull/42",
				},
			});
			mockOctokit.rest.issues.setLabels.mockResolvedValue({});

			await createOrUpdatePR(mockOctokit, "owner", "repo", "feature-branch", "main", "PR Title", "PR Body", prLabels);

			expect(mockOctokit.rest.pulls.requestReviewers).not.toHaveBeenCalled();
			expect(mockOctokit.rest.issues.addAssignees).not.toHaveBeenCalled();
		});
	});

	describe("createCommit", () => {
		const files = [
			{ path: "file1.txt", content: Buffer.from("content1") },
			{ path: "file2.txt", content: Buffer.from("content2") },
		];

		beforeEach(() => {
			mockOctokit.rest.git.getTree.mockResolvedValue({
				data: { sha: "tree-sha-123" },
			});
			mockOctokit.rest.git.createBlob.mockImplementation(async ({ content }) => ({
				data: { sha: `blob-${content}` },
			}));
			mockOctokit.rest.git.createTree.mockResolvedValue({
				data: { sha: "new-tree-sha-456" },
			});
			mockOctokit.rest.git.createCommit.mockResolvedValue({
				data: { sha: "commit-sha-789" },
			});
			mockOctokit.rest.git.updateRef.mockResolvedValue({});
		});

		it("should create commit with multiple files", async () => {
			const commitSha = await createCommit(
				mockOctokit,
				"owner",
				"repo",
				"feature-branch",
				"base-sha-abc",
				"Commit message",
				files,
			);

			expect(commitSha).toBe("commit-sha-789");

			// Verify tree fetched
			expect(mockOctokit.rest.git.getTree).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				tree_sha: "base-sha-abc",
			});

			// Verify blobs created for each file
			expect(mockOctokit.rest.git.createBlob).toHaveBeenCalledTimes(2);
			expect(mockOctokit.rest.git.createBlob).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				content: Buffer.from("content1").toString("base64"),
				encoding: "base64",
			});

			// Verify tree created
			expect(mockOctokit.rest.git.createTree).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				base_tree: "tree-sha-123",
				tree: expect.arrayContaining([
					expect.objectContaining({
						path: "file1.txt",
						mode: "100644",
						type: "blob",
					}),
					expect.objectContaining({
						path: "file2.txt",
						mode: "100644",
						type: "blob",
					}),
				]),
			});

			// Verify commit created
			expect(mockOctokit.rest.git.createCommit).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				message: "Commit message",
				tree: "new-tree-sha-456",
				parents: ["base-sha-abc"],
			});

			// Verify ref updated
			expect(mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				ref: "heads/feature-branch",
				sha: "commit-sha-789",
			});
		});

		it("should handle single file", async () => {
			const singleFile = [{ path: "single.txt", content: Buffer.from("single content") }];

			await createCommit(
				mockOctokit,
				"owner",
				"repo",
				"feature-branch",
				"base-sha-abc",
				"Single file commit",
				singleFile,
			);

			expect(mockOctokit.rest.git.createBlob).toHaveBeenCalledTimes(1);
		});

		it("should handle empty file list", async () => {
			await createCommit(mockOctokit, "owner", "repo", "feature-branch", "base-sha-abc", "Empty commit", []);

			expect(mockOctokit.rest.git.createBlob).not.toHaveBeenCalled();
			expect(mockOctokit.rest.git.createTree).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				base_tree: "tree-sha-123",
				tree: [],
			});
		});

		it("should encode file content as base64", async () => {
			const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
			const binaryFile = [{ path: "image.png", content: binaryContent }];

			await createCommit(
				mockOctokit,
				"owner",
				"repo",
				"feature-branch",
				"base-sha-abc",
				"Binary file commit",
				binaryFile,
			);

			expect(mockOctokit.rest.git.createBlob).toHaveBeenCalledWith({
				owner: "owner",
				repo: "repo",
				content: binaryContent.toString("base64"),
				encoding: "base64",
			});
		});
	});
});
