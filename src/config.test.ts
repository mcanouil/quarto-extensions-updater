// Mock @actions/core before importing
jest.mock("@actions/core");
jest.mock("./validation");

import * as core from "@actions/core";
import { parseInputs } from "./config";
import {
	validateAutoMergeStrategy,
	validateMergeMethod,
	validateUpdateStrategy,
	validateRegistryUrl,
	validateBranchPrefix,
} from "./validation";

const mockCore = jest.mocked(core);
const mockValidateAutoMergeStrategy = jest.mocked(validateAutoMergeStrategy);
const mockValidateMergeMethod = jest.mocked(validateMergeMethod);
const mockValidateUpdateStrategy = jest.mocked(validateUpdateStrategy);
const mockValidateRegistryUrl = jest.mocked(validateRegistryUrl);
const mockValidateBranchPrefix = jest.mocked(validateBranchPrefix);

describe("parseInputs", () => {
	beforeEach(() => {
		jest.clearAllMocks();

		// Set default mock implementations
		mockCore.getInput.mockImplementation((name: string) => {
			const defaults: Record<string, string> = {
				"github-token": "test-token",
				"workspace-path": "",
				"registry-url": "",
				"base-branch": "",
				"branch-prefix": "",
				"pr-title-prefix": "",
				"commit-message-prefix": "",
				"pr-labels": "",
				"auto-merge-strategy": "",
				"auto-merge-method": "",
				"include-extensions": "",
				"exclude-extensions": "",
				"update-strategy": "",
				"pr-reviewers": "",
				"pr-team-reviewers": "",
				"pr-assignees": "",
			};
			return defaults[name] || "";
		});

		mockCore.getBooleanInput.mockImplementation((name: string) => {
			const defaults: Record<string, boolean> = {
				"create-pr": true,
				"auto-merge": false,
				"group-updates": false,
				"dry-run": false,
			};
			return defaults[name] ?? false;
		});
	});

	it("should parse minimal required inputs with defaults", () => {
		const config = parseInputs();

		expect(config).toEqual({
			githubToken: "test-token",
			workspacePath: process.cwd(),
			registryUrl: undefined,
			createPR: true,
			baseBranch: "main",
			branchPrefix: "chore/quarto-extensions",
			prTitlePrefix: "chore(deps):",
			commitMessagePrefix: "chore(deps):",
			prLabels: ["dependencies", "quarto-extensions"],
			autoMergeConfig: {
				enabled: false,
				strategy: "patch",
				mergeMethod: "squash",
			},
			filterConfig: {
				include: [],
				exclude: [],
			},
			groupUpdates: false,
			updateStrategy: "all",
			dryRun: false,
			assignmentConfig: {
				reviewers: [],
				teamReviewers: [],
				assignees: [],
			},
		});

		expect(mockCore.getInput).toHaveBeenCalledWith("github-token", { required: true });
		expect(mockValidateAutoMergeStrategy).toHaveBeenCalledWith("patch");
		expect(mockValidateMergeMethod).toHaveBeenCalledWith("squash");
		expect(mockValidateUpdateStrategy).toHaveBeenCalledWith("all");
	});

	it("should parse all custom inputs", () => {
		mockCore.getInput.mockImplementation((name: string) => {
			const inputs: Record<string, string> = {
				"github-token": "custom-token",
				"workspace-path": "/custom/path",
				"registry-url": "https://example.com/registry.json",
				"base-branch": "develop",
				"branch-prefix": "deps/quarto",
				"pr-title-prefix": "deps:",
				"commit-message-prefix": "update:",
				"pr-labels": "dependencies,automation,quarto",
				"auto-merge-strategy": "minor",
				"auto-merge-method": "merge",
				"include-extensions": "owner/ext1, owner/ext2",
				"exclude-extensions": "owner/ext3, owner/ext4",
				"update-strategy": "patch",
				"pr-reviewers": "user1,user2",
				"pr-team-reviewers": "team1,team2",
				"pr-assignees": "assignee1,assignee2",
			};
			return inputs[name] || "";
		});

		mockCore.getBooleanInput.mockImplementation((name: string) => {
			const inputs: Record<string, boolean> = {
				"create-pr": true,
				"auto-merge": true,
				"group-updates": true,
				"dry-run": true,
			};
			return inputs[name] ?? false;
		});

		const config = parseInputs();

		expect(config).toEqual({
			githubToken: "custom-token",
			workspacePath: "/custom/path",
			registryUrl: "https://example.com/registry.json",
			createPR: true,
			baseBranch: "develop",
			branchPrefix: "deps/quarto",
			prTitlePrefix: "deps:",
			commitMessagePrefix: "update:",
			prLabels: ["dependencies", "automation", "quarto"],
			autoMergeConfig: {
				enabled: true,
				strategy: "minor",
				mergeMethod: "merge",
			},
			filterConfig: {
				include: ["owner/ext1", "owner/ext2"],
				exclude: ["owner/ext3", "owner/ext4"],
			},
			groupUpdates: true,
			updateStrategy: "patch",
			dryRun: true,
			assignmentConfig: {
				reviewers: ["user1", "user2"],
				teamReviewers: ["team1", "team2"],
				assignees: ["assignee1", "assignee2"],
			},
		});

		expect(mockValidateRegistryUrl).toHaveBeenCalledWith("https://example.com/registry.json");
		expect(mockValidateBranchPrefix).toHaveBeenCalledWith("deps/quarto");
	});

	it("should handle create-pr set to false", () => {
		mockCore.getBooleanInput.mockImplementation((name: string) => {
			if (name === "create-pr") return false;
			return false;
		});

		const config = parseInputs();

		expect(config.createPR).toBe(false);
	});

	it("should handle auto-merge enabled", () => {
		mockCore.getBooleanInput.mockImplementation((name: string) => {
			if (name === "auto-merge") return true;
			if (name === "create-pr") return true;
			return false;
		});

		mockCore.getInput.mockImplementation((name: string) => {
			if (name === "github-token") return "test-token";
			if (name === "auto-merge-strategy") return "all";
			if (name === "auto-merge-method") return "rebase";
			return "";
		});

		const config = parseInputs();

		expect(config.autoMergeConfig).toEqual({
			enabled: true,
			strategy: "all",
			mergeMethod: "rebase",
		});
	});

	it("should parse comma-separated labels with whitespace", () => {
		mockCore.getInput.mockImplementation((name: string) => {
			if (name === "github-token") return "test-token";
			if (name === "pr-labels") return "  label1  ,  label2  ,  label3  ";
			return "";
		});

		const config = parseInputs();

		expect(config.prLabels).toEqual(["label1", "label2", "label3"]);
	});

	it("should filter out empty labels", () => {
		mockCore.getInput.mockImplementation((name: string) => {
			if (name === "github-token") return "test-token";
			if (name === "pr-labels") return "label1,,label2,  ,label3";
			return "";
		});

		const config = parseInputs();

		expect(config.prLabels).toEqual(["label1", "label2", "label3"]);
	});

	it("should parse include extensions with whitespace", () => {
		mockCore.getInput.mockImplementation((name: string) => {
			if (name === "github-token") return "test-token";
			if (name === "include-extensions") return "  owner/ext1  ,  owner/ext2  ";
			return "";
		});

		const config = parseInputs();

		expect(config.filterConfig.include).toEqual(["owner/ext1", "owner/ext2"]);
	});

	it("should parse exclude extensions with whitespace", () => {
		mockCore.getInput.mockImplementation((name: string) => {
			if (name === "github-token") return "test-token";
			if (name === "exclude-extensions") return "  owner/ext3  ,  owner/ext4  ";
			return "";
		});

		const config = parseInputs();

		expect(config.filterConfig.exclude).toEqual(["owner/ext3", "owner/ext4"]);
	});

	it("should parse PR reviewers", () => {
		mockCore.getInput.mockImplementation((name: string) => {
			if (name === "github-token") return "test-token";
			if (name === "pr-reviewers") return "reviewer1, reviewer2, reviewer3";
			return "";
		});

		const config = parseInputs();

		expect(config.assignmentConfig.reviewers).toEqual(["reviewer1", "reviewer2", "reviewer3"]);
	});

	it("should parse PR team reviewers", () => {
		mockCore.getInput.mockImplementation((name: string) => {
			if (name === "github-token") return "test-token";
			if (name === "pr-team-reviewers") return "team-1, team-2";
			return "";
		});

		const config = parseInputs();

		expect(config.assignmentConfig.teamReviewers).toEqual(["team-1", "team-2"]);
	});

	it("should parse PR assignees", () => {
		mockCore.getInput.mockImplementation((name: string) => {
			if (name === "github-token") return "test-token";
			if (name === "pr-assignees") return "assignee1, assignee2";
			return "";
		});

		const config = parseInputs();

		expect(config.assignmentConfig.assignees).toEqual(["assignee1", "assignee2"]);
	});

	it("should not validate registry URL when not provided", () => {
		mockCore.getInput.mockImplementation((name: string) => {
			if (name === "github-token") return "test-token";
			return "";
		});

		parseInputs();

		expect(mockValidateRegistryUrl).not.toHaveBeenCalled();
	});

	it("should validate registry URL when provided", () => {
		mockCore.getInput.mockImplementation((name: string) => {
			if (name === "github-token") return "test-token";
			if (name === "registry-url") return "https://example.com/registry.json";
			return "";
		});

		parseInputs();

		expect(mockValidateRegistryUrl).toHaveBeenCalledWith("https://example.com/registry.json");
	});

	it("should always validate branch prefix", () => {
		parseInputs();

		expect(mockValidateBranchPrefix).toHaveBeenCalled();
	});

	it("should handle all update strategies", () => {
		const strategies = ["all", "minor", "patch"];

		strategies.forEach((strategy) => {
			jest.clearAllMocks();

			mockCore.getInput.mockImplementation((name: string) => {
				if (name === "github-token") return "test-token";
				if (name === "update-strategy") return strategy;
				return "";
			});

			const config = parseInputs();

			expect(config.updateStrategy).toBe(strategy);
			expect(mockValidateUpdateStrategy).toHaveBeenCalledWith(strategy);
		});
	});

	it("should handle all auto-merge strategies", () => {
		const strategies = ["patch", "minor", "all"];

		strategies.forEach((strategy) => {
			jest.clearAllMocks();

			mockCore.getInput.mockImplementation((name: string) => {
				if (name === "github-token") return "test-token";
				if (name === "auto-merge-strategy") return strategy;
				return "";
			});

			const config = parseInputs();

			expect(config.autoMergeConfig.strategy).toBe(strategy);
			expect(mockValidateAutoMergeStrategy).toHaveBeenCalledWith(strategy);
		});
	});

	it("should handle all merge methods", () => {
		const methods = ["merge", "squash", "rebase"];

		methods.forEach((method) => {
			jest.clearAllMocks();

			mockCore.getInput.mockImplementation((name: string) => {
				if (name === "github-token") return "test-token";
				if (name === "auto-merge-method") return method;
				return "";
			});

			const config = parseInputs();

			expect(config.autoMergeConfig.mergeMethod).toBe(method);
			expect(mockValidateMergeMethod).toHaveBeenCalledWith(method);
		});
	});

	it("should use process.cwd() when workspace-path is empty", () => {
		const originalCwd = process.cwd();

		mockCore.getInput.mockImplementation((name: string) => {
			if (name === "github-token") return "test-token";
			if (name === "workspace-path") return "";
			return "";
		});

		const config = parseInputs();

		expect(config.workspacePath).toBe(originalCwd);
	});

	it("should handle group-updates enabled", () => {
		mockCore.getBooleanInput.mockImplementation((name: string) => {
			if (name === "group-updates") return true;
			if (name === "create-pr") return true;
			return false;
		});

		const config = parseInputs();

		expect(config.groupUpdates).toBe(true);
	});

	it("should handle dry-run enabled", () => {
		mockCore.getBooleanInput.mockImplementation((name: string) => {
			if (name === "dry-run") return true;
			if (name === "create-pr") return true;
			return false;
		});

		const config = parseInputs();

		expect(config.dryRun).toBe(true);
	});
});
