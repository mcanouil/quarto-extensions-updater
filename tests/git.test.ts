import { execSync } from "child_process";
import { applyUpdates, createBranchName, createCommitMessage, validateModifiedFiles } from "../src/git";
import { updateManifestSource } from "../src/extensions";
import type { ExtensionUpdate } from "../src/types";

// Mock modules before importing
jest.mock("child_process");
jest.mock("fs", () => ({
	...jest.requireActual<typeof import("fs")>("fs"),
	existsSync: jest.fn(),
	readdirSync: jest.fn(),
	readFileSync: jest.fn(),
	promises: {
		access: jest.fn(),
		appendFile: jest.fn(),
		writeFile: jest.fn(),
		readFile: jest.fn(),
	},
}));
jest.mock("path");
jest.mock("@actions/core");
jest.mock("../src/extensions");

// Import after mocking
import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockUpdateManifestSource = updateManifestSource as jest.MockedFunction<typeof updateManifestSource>;
const mockPath = jest.mocked(path);
const mockFs = jest.mocked(fs);

// Type for directory entry
interface DirEntry {
	name: string;
	isFile: () => boolean;
	isDirectory: () => boolean;
}

describe("git.ts", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockPath.join.mockImplementation((...args: string[]) => args.join("/"));
		mockPath.dirname.mockImplementation((p: string) => p.split("/").slice(0, -1).join("/"));
	});

	describe("isQuartoAvailable", () => {
		it("should return true when Quarto CLI is available", () => {
			mockExecSync.mockReturnValue(Buffer.from("1.4.0\n"));

			const createUpdate = (): ExtensionUpdate => ({
				name: "test-ext",
				owner: "test-owner",
				nameWithOwner: "test-owner/test-ext",
				repositoryName: "test-owner/test-repo",
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				manifestPath: "/path/to/_extension.yml",
				url: "https://github.com/test-owner/test-repo",
				releaseUrl: "https://github.com/test-owner/test-repo/releases/tag/v1.1.0",
				description: "Test extension",
			});

			mockFs.existsSync.mockReturnValue(true);
			mockFs.readdirSync.mockReturnValue([
				{ name: "file1.txt", isFile: () => true, isDirectory: () => false } as DirEntry,
			]);
			mockFs.readFileSync.mockReturnValue(Buffer.from("content"));

			applyUpdates([createUpdate()]);

			expect(mockExecSync).toHaveBeenCalledWith("quarto --version", {
				stdio: "pipe",
				encoding: "utf-8",
			});
		});

		it("should throw error when Quarto CLI is not available", () => {
			mockExecSync.mockImplementation((cmd) => {
				if (cmd === "quarto --version") {
					throw new Error("Command not found");
				}
				return Buffer.from("");
			});

			const createUpdate = (): ExtensionUpdate => ({
				name: "test-ext",
				owner: "test-owner",
				nameWithOwner: "test-owner/test-ext",
				repositoryName: "test-owner/test-repo",
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				manifestPath: "/path/to/_extension.yml",
				url: "https://github.com/test-owner/test-repo",
				releaseUrl: "https://github.com/test-owner/test-repo/releases/tag/v1.1.0",
				description: "Test extension",
			});

			expect(() => applyUpdates([createUpdate()])).toThrow("Quarto CLI is not available");
			expect(core.error).toHaveBeenCalledWith(expect.stringContaining("Quarto CLI is not available"));
		});
	});

	describe("getAllFilesInDirectory", () => {
		it("should recursively collect all files", () => {
			const createUpdate = (): ExtensionUpdate => ({
				name: "test-ext",
				owner: "test-owner",
				nameWithOwner: "test-owner/test-ext",
				repositoryName: "test-owner/test-repo",
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				manifestPath: "/path/to/_extension.yml",
				url: "https://github.com/test-owner/test-repo",
				releaseUrl: "https://github.com/test-owner/test-repo/releases/tag/v1.1.0",
				description: "Test extension",
			});

			mockExecSync.mockReturnValue(Buffer.from("1.4.0\n"));
			mockFs.existsSync.mockReturnValue(true);

			// Mock directory structure
			mockFs.readdirSync
				.mockReturnValueOnce([
					{ name: "file1.txt", isFile: () => true, isDirectory: () => false },
					{ name: "subdir", isFile: () => false, isDirectory: () => true },
				] as DirEntry[])
				.mockReturnValueOnce([{ name: "file2.txt", isFile: () => true, isDirectory: () => false }] as DirEntry[]);

			mockFs.readFileSync.mockReturnValue(Buffer.from("content"));

			const result = applyUpdates([createUpdate()]);

			expect(result).toContain("/path/to/file1.txt");
			expect(result).toContain("/path/to/subdir/file2.txt");
		});

		it("should return empty array for non-existent directory", () => {
			const createUpdate = (): ExtensionUpdate => ({
				name: "test-ext",
				owner: "test-owner",
				nameWithOwner: "test-owner/test-ext",
				repositoryName: "test-owner/test-repo",
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				manifestPath: "/path/to/_extension.yml",
				url: "https://github.com/test-owner/test-repo",
				releaseUrl: "https://github.com/test-owner/test-repo/releases/tag/v1.1.0",
				description: "Test extension",
			});

			mockExecSync.mockReturnValue(Buffer.from("1.4.0\n"));
			mockFs.existsSync.mockReturnValue(false);

			const result = applyUpdates([createUpdate()]);

			expect(result).toEqual([]);
		});
	});

	describe("applyUpdates", () => {
		const createUpdate = (name = "test-ext", version = "1.1.0"): ExtensionUpdate => ({
			name,
			owner: "test-owner",
			nameWithOwner: `test-owner/${name}`,
			repositoryName: `test-owner/test-${name}`,
			currentVersion: "1.0.0",
			latestVersion: version,
			manifestPath: `/path/to/${name}/_extension.yml`,
			url: `https://github.com/test-owner/test-${name}`,
			releaseUrl: `https://github.com/test-owner/test-${name}/releases/tag/v${version}`,
			description: `Test extension ${name}`,
		});

		beforeEach(() => {
			mockExecSync.mockReturnValue(Buffer.from("1.4.0\n"));
			mockFs.existsSync.mockReturnValue(true);
			mockFs.readdirSync.mockReturnValue([
				{ name: "_extension.yml", isFile: () => true, isDirectory: () => false },
				{ name: "extension.lua", isFile: () => true, isDirectory: () => false },
			] as DirEntry[]);
			mockFs.readFileSync.mockReturnValue(Buffer.from("content"));
		});

		it("should apply single update successfully", () => {
			const update = createUpdate();

			const result = applyUpdates([update]);

			expect(mockExecSync).toHaveBeenCalledWith("quarto add test-owner/test-test-ext@1.1.0 --no-prompt", {
				stdio: "inherit",
				encoding: "utf-8",
			});
			expect(mockUpdateManifestSource).toHaveBeenCalledWith(
				"/path/to/test-ext/_extension.yml",
				"test-owner/test-test-ext@1.1.0",
			);
			expect(result.length).toBeGreaterThan(0);
			expect(core.info).toHaveBeenCalledWith("Successfully updated test-owner/test-ext to 1.1.0");
		});

		it("should apply multiple updates", () => {
			const updates = [createUpdate("ext1", "1.1.0"), createUpdate("ext2", "2.0.0")];

			const result = applyUpdates(updates);

			expect(mockExecSync).toHaveBeenCalledTimes(3); // version check + 2 updates
			expect(mockUpdateManifestSource).toHaveBeenCalledTimes(2);
			expect(result.length).toBeGreaterThan(0);
		});

		it("should throw error when Quarto add fails", () => {
			mockExecSync.mockImplementation((cmd) => {
				if (cmd === "quarto --version") {
					return Buffer.from("1.4.0\n");
				}
				throw new Error("Failed to add extension");
			});

			const update = createUpdate();

			expect(() => applyUpdates([update])).toThrow("Failed to add extension");
			expect(core.error).toHaveBeenCalledWith(expect.stringContaining("Failed to update test-owner/test-ext"));
		});

		it("should track all files in extension directory", () => {
			mockFs.readdirSync
				.mockReturnValueOnce([
					{ name: "_extension.yml", isFile: () => true, isDirectory: () => false },
					{ name: "assets", isFile: () => false, isDirectory: () => true },
				] as DirEntry[])
				.mockReturnValueOnce([
					{ name: "style.css", isFile: () => true, isDirectory: () => false },
					{ name: "script.js", isFile: () => true, isDirectory: () => false },
				] as DirEntry[]);

			const update = createUpdate();
			const result = applyUpdates([update]);

			expect(result).toContain("/path/to/test-ext/_extension.yml");
			expect(result).toContain("/path/to/test-ext/assets/style.css");
			expect(result).toContain("/path/to/test-ext/assets/script.js");
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Tracked 3 file(s)"));
		});
	});

	describe("createBranchName", () => {
		const createUpdate = (owner: string, name: string, version: string): ExtensionUpdate => ({
			name,
			owner,
			nameWithOwner: `${owner}/${name}`,
			repositoryName: `${owner}/${name}`,
			currentVersion: "1.0.0",
			latestVersion: version,
			manifestPath: `/path/${owner}/${name}/_extension.yml`,
			url: `https://github.com/${owner}/${name}`,
			releaseUrl: `https://github.com/${owner}/${name}/releases/tag/v${version}`,
			description: "Test extension",
		});

		it("should create branch name for single extension", () => {
			const updates = [createUpdate("mcanouil", "iconify", "1.2.3")];

			const result = createBranchName(updates);

			expect(result).toBe("chore/quarto-extensions/update-mcanouil-iconify-1.2.3");
		});

		it("should use custom branch prefix", () => {
			const updates = [createUpdate("mcanouil", "iconify", "1.2.3")];

			const result = createBranchName(updates, "deps/quarto");

			expect(result).toBe("deps/quarto/update-mcanouil-iconify-1.2.3");
		});

		it("should create branch name for multiple extensions with timestamp", () => {
			const updates = [createUpdate("owner1", "ext1", "1.0.0"), createUpdate("owner2", "ext2", "2.0.0")];

			const result = createBranchName(updates);

			expect(result).toMatch(/^chore\/quarto-extensions\/update-extensions-\d{8}$/);
		});

		it("should handle slashes in extension names", () => {
			const updates = [createUpdate("quarto-ext", "fancy-text", "1.0.0")];

			const result = createBranchName(updates);

			expect(result).toBe("chore/quarto-extensions/update-quarto-ext-fancy-text-1.0.0");
			expect(result).not.toContain("//");
		});

		it("should use default prefix when empty string provided", () => {
			const updates = [createUpdate("mcanouil", "iconify", "1.2.3")];

			const result = createBranchName(updates, "");

			expect(result).toBe("chore/quarto-extensions/update-mcanouil-iconify-1.2.3");
		});
	});

	describe("createCommitMessage", () => {
		const createUpdate = (owner: string, name: string, current: string, latest: string): ExtensionUpdate => ({
			name,
			owner,
			nameWithOwner: `${owner}/${name}`,
			repositoryName: `${owner}/${name}`,
			currentVersion: current,
			latestVersion: latest,
			manifestPath: `/path/${owner}/${name}/_extension.yml`,
			url: `https://github.com/${owner}/${name}`,
			releaseUrl: `https://github.com/${owner}/${name}/releases/tag/v${latest}`,
			description: "Test extension",
		});

		it("should create commit message for single extension", () => {
			const updates = [createUpdate("mcanouil", "iconify", "1.0.0", "1.2.3")];

			const result = createCommitMessage(updates);

			expect(result).toContain("chore(deps): update mcanouil/iconify extension to 1.2.3");
			expect(result).toContain("Updates mcanouil/iconify from 1.0.0 to 1.2.3");
			expect(result).toContain("Release notes: https://github.com/mcanouil/iconify/releases/tag/v1.2.3");
		});

		it("should use custom prefix", () => {
			const updates = [createUpdate("mcanouil", "iconify", "1.0.0", "1.2.3")];

			const result = createCommitMessage(updates, "build(deps):");

			expect(result).toContain("build(deps): update mcanouil/iconify extension to 1.2.3");
			expect(result.startsWith("build(deps):")).toBe(true);
		});

		it("should create commit message for multiple extensions", () => {
			const updates = [
				createUpdate("owner1", "ext1", "1.0.0", "1.1.0"),
				createUpdate("owner2", "ext2", "2.0.0", "2.1.0"),
				createUpdate("owner3", "ext3", "3.0.0", "3.1.0"),
			];

			const result = createCommitMessage(updates);

			expect(result).toContain("chore(deps): update 3 Quarto extensions");
			expect(result).toContain("- owner1/ext1: 1.0.0 → 1.1.0");
			expect(result).toContain("- owner2/ext2: 2.0.0 → 2.1.0");
			expect(result).toContain("- owner3/ext3: 3.0.0 → 3.1.0");
		});

		it("should handle single extension in array (plural)", () => {
			const updates = [createUpdate("owner", "ext", "1.0.0", "2.0.0")];

			const result = createCommitMessage(updates);

			// Should use singular "extension" not "extensions"
			expect(result).toContain("update owner/ext extension to 2.0.0");
		});
	});

	describe("validateModifiedFiles", () => {
		it("should return true when all files exist", () => {
			mockFs.existsSync.mockReturnValue(true);

			const files = ["/path/to/file1.txt", "/path/to/file2.txt", "/path/to/file3.txt"];

			const result = validateModifiedFiles(files);

			expect(result).toBe(true);
			expect(mockFs.existsSync).toHaveBeenCalledTimes(3);
		});

		it("should return false when any file is missing", () => {
			mockFs.existsSync
				.mockReturnValueOnce(true)
				.mockReturnValueOnce(false) // Second file missing
				.mockReturnValueOnce(true);

			const files = ["/path/to/file1.txt", "/path/to/missing.txt", "/path/to/file3.txt"];

			const result = validateModifiedFiles(files);

			expect(result).toBe(false);
			expect(core.error).toHaveBeenCalledWith("Modified file not found: /path/to/missing.txt");
		});

		it("should return true for empty array", () => {
			const result = validateModifiedFiles([]);

			expect(result).toBe(true);
			expect(mockFs.existsSync).not.toHaveBeenCalled();
		});

		it("should return false when file does not exist", () => {
			mockFs.existsSync.mockReset();
			mockFs.existsSync.mockReturnValue(false);

			const files = ["/path/to/file1.txt"];

			const result = validateModifiedFiles(files);

			expect(result).toBe(false);
			expect(core.error).toHaveBeenCalledWith("Modified file not found: /path/to/file1.txt");
		});
	});
});
