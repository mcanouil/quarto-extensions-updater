import { jest } from "@jest/globals";
import type { ExtensionUpdate } from "../src/types.js";
import { createMockFs, createMockActionsCore } from "./__test-utils__/mockFactories.js";

jest.unstable_mockModule("child_process", () => ({ execSync: jest.fn() }));
jest.unstable_mockModule("fs", createMockFs);
jest.unstable_mockModule("path", () => ({
	join: jest.fn(),
	dirname: jest.fn(),
	resolve: jest.fn(),
	isAbsolute: jest.fn(),
	sep: "/",
}));
jest.unstable_mockModule("@actions/core", createMockActionsCore);
jest.unstable_mockModule("../src/extensions.js", () => ({
	findExtensionManifests: jest.fn(),
	readExtensionManifest: jest.fn(),
	extractExtensionInfo: jest.fn(),
	updateManifestSource: jest.fn(),
}));

const { execSync } = await import("child_process");
const fs = await import("fs");
const path = await import("path");
const core = await import("@actions/core");
const { updateManifestSource, readExtensionManifest } = await import("../src/extensions.js");
const {
	applyUpdates,
	getQuartoVersion,
	createBranchName,
	createCommitMessage,
	validateModifiedFiles,
	deriveQuartoAddCwd,
	getCheckedOutSha,
} = await import("../src/git.js");

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

		it("should list files after every update so an embedded reinstall leaves no stale or duplicate paths", () => {
			const parent: ExtensionUpdate = { ...createUpdate("atelier"), manifestPath: "/path/to/atelier/_extension.yml" };
			const embedded: ExtensionUpdate = {
				...createUpdate("gitlink"),
				manifestPath: "/path/to/atelier/_extensions/test-owner/gitlink/_extension.yml",
			};
			let embeddedReinstalled = false;
			mockExecSync.mockImplementation((command: string) => {
				if (command.includes("gitlink@")) {
					embeddedReinstalled = true;
				}
				return "1.4.0\n" as unknown as Buffer;
			});
			const file = (name: string): DirEntry => ({ name, isFile: () => true, isDirectory: () => false });
			const dir = (name: string): DirEntry => ({ name, isFile: () => false, isDirectory: () => true });
			const tree: Record<string, () => DirEntry[]> = {
				"/path/to/atelier": () => [file("_extension.yml"), dir("_extensions")],
				"/path/to/atelier/_extensions": () => [dir("test-owner")],
				"/path/to/atelier/_extensions/test-owner": () => [dir("gitlink")],
				"/path/to/atelier/_extensions/test-owner/gitlink": () =>
					embeddedReinstalled ? [file("_extension.yml")] : [file("_extension.yml"), file("dropped.lua")],
			};
			mockFs.readdirSync.mockImplementation(((dirPath: string) => tree[dirPath]()) as unknown as typeof fs.readdirSync);

			const result = applyUpdates([parent, embedded]);

			expect(result.modifiedFiles).toEqual([
				"/path/to/atelier/_extension.yml",
				"/path/to/atelier/_extensions/test-owner/gitlink/_extension.yml",
			]);
		});

		it("should apply a parent extension before an extension embedded in it", () => {
			const embedded: ExtensionUpdate = {
				...createUpdate("gitlink"),
				manifestPath: "/path/to/_extensions/test-owner/atelier/_extensions/test-owner/gitlink/_extension.yml",
			};
			const parent: ExtensionUpdate = {
				...createUpdate("atelier"),
				manifestPath: "/path/to/_extensions/test-owner/atelier/_extension.yml",
			};

			applyUpdates([embedded, parent]);

			const addCommands = mockExecSync.mock.calls
				.map(([command]) => command)
				.filter((command) => command.startsWith("quarto add"));
			expect(addCommands).toEqual([
				"quarto add test-owner/test-atelier@1.1.0 --no-prompt",
				"quarto add test-owner/test-gitlink@1.1.0 --no-prompt",
			]);
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

	describe("getCheckedOutSha", () => {
		it("should return the commit checked out in the workspace", () => {
			mockExecSync.mockReturnValue("abc123\n" as unknown as Buffer);

			expect(getCheckedOutSha("/workspace")).toBe("abc123");
			expect(mockExecSync).toHaveBeenCalledWith("git rev-parse HEAD", {
				cwd: "/workspace",
				stdio: "pipe",
				encoding: "utf-8",
			});
		});

		it("should return null when the workspace is not a git checkout", () => {
			mockExecSync.mockImplementation(() => {
				throw new Error("not a git repository");
			});

			expect(getCheckedOutSha("/workspace")).toBeNull();
		});
	});

	describe("deriveQuartoAddCwd", () => {
		it("should return parent directory of _extensions", () => {
			const result = deriveQuartoAddCwd("/workspace/_extensions/owner/ext/_extension.yml");

			expect(result).toBe("/workspace");
		});

		it("should return the extension directory that embeds a nested extension", () => {
			const result = deriveQuartoAddCwd("/workspace/_extensions/atelier/_extensions/mcanouil/gitlink/_extension.yml");

			expect(result).toBe("/workspace/_extensions/atelier");
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

		it("should use the single-extension branch name for copies of one extension", () => {
			const topLevel = createUpdate("mcanouil", "gitlink", "1.9.2");
			const embedded = {
				...createUpdate("mcanouil", "gitlink", "1.9.2"),
				manifestPath: "/path/_extensions/atelier/_extensions/mcanouil/gitlink/_extension.yml",
			};

			const result = createBranchName([topLevel, embedded]);

			expect(result).toBe("chore/quarto-extensions/update-mcanouil-gitlink-1.9.2");
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

		it("should describe copies of one extension as a single extension", () => {
			const topLevel = createUpdate("mcanouil", "gitlink", "1.0.0", "1.2.0");
			const embedded = {
				...createUpdate("mcanouil", "gitlink", "1.1.0", "1.2.0"),
				manifestPath: "/path/_extensions/atelier/_extensions/mcanouil/gitlink/_extension.yml",
			};

			const result = createCommitMessage([topLevel, embedded]);

			expect(result).toContain("chore(deps): update mcanouil/gitlink extension to 1.2.0");
			expect(result).toContain("Updates mcanouil/gitlink from 1.0.0, 1.1.0 to 1.2.0");
		});

		it("should count distinct extensions when copies are grouped with others", () => {
			const topLevel = createUpdate("mcanouil", "gitlink", "1.0.0", "1.2.0");
			const embedded = {
				...createUpdate("mcanouil", "gitlink", "1.0.0", "1.2.0"),
				manifestPath: "/path/_extensions/atelier/_extensions/mcanouil/gitlink/_extension.yml",
			};

			const result = createCommitMessage([topLevel, embedded, createUpdate("mcanouil", "iconify", "1.0.0", "1.1.0")]);

			expect(result).toContain("chore(deps): update 2 Quarto extensions");
			expect(result).toContain("- mcanouil/gitlink: 1.0.0 → 1.2.0");
			expect(result.match(/mcanouil\/gitlink/g)).toHaveLength(1);
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
