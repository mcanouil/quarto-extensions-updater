import { execSync } from "child_process";
import {
	applyUpdates,
	getQuartoVersion,
	createBranchName,
	createCommitMessage,
	validateModifiedFiles,
	deriveQuartoAddCwd,
} from "../src/git";
import { updateManifestSource, readExtensionManifest } from "../src/extensions";
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
const mockReadExtensionManifest = readExtensionManifest as jest.MockedFunction<typeof readExtensionManifest>;
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
		mockReadExtensionManifest.mockReturnValue(null);
	});

	describe("getQuartoVersion", () => {
		it("should return version when Quarto CLI is available", () => {
			mockExecSync.mockReturnValue("1.4.0\n" as unknown as Buffer);

			const result = getQuartoVersion();

			expect(result).toBe("1.4.0");
			expect(mockExecSync).toHaveBeenCalledWith("quarto --version", {
				stdio: "pipe",
				encoding: "utf-8",
			});
		});

		it("should return null when Quarto CLI is not available", () => {
			mockExecSync.mockImplementation(() => {
				throw new Error("Command not found");
			});

			const result = getQuartoVersion();

			expect(result).toBeNull();
			expect(core.error).toHaveBeenCalledWith(expect.stringContaining("Quarto CLI is not available"));
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
			mockExecSync.mockReturnValue("1.4.0\n" as unknown as Buffer);
			mockFs.existsSync.mockReturnValue(true);
			mockFs.readdirSync.mockReturnValue([
				{ name: "_extension.yml", isFile: () => true, isDirectory: () => false },
				{ name: "extension.lua", isFile: () => true, isDirectory: () => false },
			] as DirEntry[]);
			mockFs.readFileSync.mockReturnValue(Buffer.from("content"));
		});

		it("should throw error when Quarto CLI is not available", () => {
			mockExecSync.mockImplementation(() => {
				throw new Error("Command not found");
			});

			expect(() => applyUpdates([createUpdate()])).toThrow("Quarto CLI is not available");
			expect(core.error).toHaveBeenCalledWith(expect.stringContaining("Quarto CLI is not available"));
		});

		it("should apply single update successfully", () => {
			const update = createUpdate();

			const result = applyUpdates([update]);

			expect(mockExecSync).toHaveBeenCalledWith("quarto add test-owner/test-test-ext@1.1.0 --no-prompt", {
				cwd: process.cwd(),
				stdio: "pipe",
				encoding: "utf-8",
			});
			expect(mockUpdateManifestSource).toHaveBeenCalledWith(
				"/path/to/test-ext/_extension.yml",
				"test-owner/test-test-ext@1.1.0",
			);
			expect(result.modifiedFiles.length).toBeGreaterThan(0);
			expect(result.skippedUpdates).toEqual([]);
			expect(core.info).toHaveBeenCalledWith("Successfully updated test-owner/test-ext to 1.1.0");
		});

		it("should apply multiple updates", () => {
			const updates = [createUpdate("ext1", "1.1.0"), createUpdate("ext2", "2.0.0")];

			const result = applyUpdates(updates);

			expect(mockExecSync).toHaveBeenCalledTimes(3); // version check + 2 updates
			expect(mockUpdateManifestSource).toHaveBeenCalledTimes(2);
			expect(result.modifiedFiles.length).toBeGreaterThan(0);
			expect(result.skippedUpdates).toEqual([]);
		});

		it("should skip extension when quarto add fails instead of throwing", () => {
			mockExecSync.mockImplementation((cmd) => {
				if (cmd === "quarto --version") {
					return "1.4.0\n" as unknown as Buffer;
				}
				throw new Error("Failed to add extension");
			});

			const update = createUpdate();

			const result = applyUpdates([update]);

			expect(result.modifiedFiles).toEqual([]);
			expect(result.skippedUpdates).toHaveLength(1);
			expect(result.skippedUpdates[0].update).toBe(update);
			expect(result.skippedUpdates[0].reason).toContain("Failed to update");
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Skipping test-owner/test-ext"));
		});

		it("should use stderr from quarto add failure for a more informative reason", () => {
			mockExecSync.mockImplementation((cmd) => {
				if (cmd === "quarto --version") {
					return "1.4.0\n" as unknown as Buffer;
				}
				const error = new Error("Command failed: quarto add test-owner/test-test-ext@1.1.0 --no-prompt");
				(error as Error & { stderr: string }).stderr =
					"ERROR: Extension requires Quarto version >=99.0.0 (you have 1.4.0)\n";
				throw error;
			});

			const update = createUpdate();

			const result = applyUpdates([update]);

			expect(result.skippedUpdates).toHaveLength(1);
			expect(result.skippedUpdates[0].reason).toBe(
				"Failed to update: ERROR: Extension requires Quarto version >=99.0.0 (you have 1.4.0)",
			);
		});

		it("should fall back to stdout when stderr is empty", () => {
			mockExecSync.mockImplementation((cmd) => {
				if (cmd === "quarto --version") {
					return "1.4.0\n" as unknown as Buffer;
				}
				const error = new Error("Command failed: quarto add test-owner/test-test-ext@1.1.0 --no-prompt");
				(error as Error & { stderr: string; stdout: string }).stderr = "";
				(error as Error & { stderr: string; stdout: string }).stdout =
					"ERROR: Extension not found at test-owner/test-test-ext@1.1.0\n";
				throw error;
			});

			const update = createUpdate();

			const result = applyUpdates([update]);

			expect(result.skippedUpdates).toHaveLength(1);
			expect(result.skippedUpdates[0].reason).toBe(
				"Failed to update: ERROR: Extension not found at test-owner/test-test-ext@1.1.0",
			);
		});

		it("should skip extension when quarto-required exceeds installed version", () => {
			const update = createUpdate();
			mockReadExtensionManifest.mockReturnValue({
				version: "1.1.0",
				quartoRequired: "99.0.0",
			});

			const result = applyUpdates([update]);

			expect(result.modifiedFiles).toEqual([]);
			expect(result.skippedUpdates).toHaveLength(1);
			expect(result.skippedUpdates[0].reason).toContain("requires Quarto >= 99.0.0");
			expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Skipping test-owner/test-ext"));
		});

		it("should include extension when quarto-required is satisfied", () => {
			const update = createUpdate();
			mockReadExtensionManifest.mockReturnValue({
				version: "1.1.0",
				quartoRequired: "1.0.0",
			});

			const result = applyUpdates([update]);

			expect(result.modifiedFiles.length).toBeGreaterThan(0);
			expect(result.skippedUpdates).toEqual([]);
		});

		it("should continue processing when one extension fails", () => {
			let callCount = 0;
			mockExecSync.mockImplementation((cmd) => {
				if (cmd === "quarto --version") {
					return "1.4.0\n" as unknown as Buffer;
				}
				callCount++;
				if (callCount === 1) {
					throw new Error("Failed to add extension");
				}
				return "" as unknown as Buffer;
			});

			const updates = [createUpdate("failing-ext", "1.1.0"), createUpdate("working-ext", "2.0.0")];

			const result = applyUpdates(updates);

			expect(result.skippedUpdates).toHaveLength(1);
			expect(result.skippedUpdates[0].update.name).toBe("failing-ext");
			expect(result.modifiedFiles.length).toBeGreaterThan(0);
			expect(mockUpdateManifestSource).toHaveBeenCalledTimes(1);
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

			expect(result.modifiedFiles).toContain("/path/to/test-ext/_extension.yml");
			expect(result.modifiedFiles).toContain("/path/to/test-ext/assets/style.css");
			expect(result.modifiedFiles).toContain("/path/to/test-ext/assets/script.js");
			expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Tracked 3 file(s)"));
		});

		it("should return empty modified files for non-existent directory", () => {
			mockFs.existsSync.mockReturnValue(false);

			const update = createUpdate();
			const result = applyUpdates([update]);

			expect(result.modifiedFiles).toEqual([]);
		});

		it("should log installed Quarto version", () => {
			applyUpdates([createUpdate()]);

			expect(core.info).toHaveBeenCalledWith("Installed Quarto version: 1.4.0");
		});

		it("should use correct cwd when manifest path contains _extensions", () => {
			const update: ExtensionUpdate = {
				name: "iconify",
				owner: "mcanouil",
				nameWithOwner: "mcanouil/iconify",
				repositoryName: "mcanouil/quarto-iconify",
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				manifestPath: "/workspace/_extensions/mcanouil/iconify/_extension.yml",
				url: "https://github.com/mcanouil/quarto-iconify",
				releaseUrl: "https://github.com/mcanouil/quarto-iconify/releases/tag/v1.1.0",
				description: "Test extension",
			};

			applyUpdates([update]);

			expect(mockExecSync).toHaveBeenCalledWith("quarto add mcanouil/quarto-iconify@1.1.0 --no-prompt", {
				cwd: "/workspace",
				stdio: "pipe",
				encoding: "utf-8",
			});
		});
	});

	describe("deriveQuartoAddCwd", () => {
		it("should return parent directory of _extensions", () => {
			const result = deriveQuartoAddCwd("/workspace/_extensions/owner/ext/_extension.yml");

			expect(result).toBe("/workspace");
		});

		it("should return process.cwd() when path has no _extensions segment", () => {
			const result = deriveQuartoAddCwd("/path/to/ext/_extension.yml");

			expect(result).toBe(process.cwd());
		});

		it("should return process.cwd() when path starts with _extensions", () => {
			const result = deriveQuartoAddCwd("_extensions/owner/ext/_extension.yml");

			expect(result).toBe(process.cwd());
		});

		it("should handle nested scan directories", () => {
			const result = deriveQuartoAddCwd("/workspace/slides/_extensions/owner/ext/_extension.yml");

			expect(result).toBe("/workspace/slides");
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
