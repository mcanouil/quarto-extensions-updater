// Mock modules before importing
jest.mock("fs", () => ({
	...jest.requireActual<typeof import("fs")>("fs"),
	existsSync: jest.fn(),
	readdirSync: jest.fn(),
	readFileSync: jest.fn(),
	writeFileSync: jest.fn(),
	promises: {
		access: jest.fn(),
		appendFile: jest.fn(),
		writeFile: jest.fn(),
		readFile: jest.fn(),
	},
}));
jest.mock("@actions/core");

import * as fs from "fs";
import * as core from "@actions/core";
import {
	findExtensionManifests,
	readExtensionManifest,
	extractExtensionInfo,
	updateManifestSource,
} from "../src/extensions";

const mockFs = jest.mocked(fs);

describe("findExtensionManifests", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return empty array when _extensions directory does not exist", () => {
		mockFs.existsSync.mockReturnValue(false);

		const result = findExtensionManifests("/workspace");

		expect(result).toEqual([]);
		expect(core.info).toHaveBeenCalledWith("No _extensions directory found");
	});

	it("should find manifests in standard structure", () => {
		mockFs.existsSync.mockImplementation((filePath) => {
			const pathStr = String(filePath);
			if (pathStr.endsWith("_extensions")) return true;
			if (pathStr.includes("_extension.yml")) return true;
			return false;
		});

		mockFs.readdirSync.mockImplementation((dirPath) => {
			const pathStr = String(dirPath);
			if (pathStr.endsWith("_extensions")) {
				return [{ name: "owner", isDirectory: () => true }] as fs.Dirent[];
			}
			if (pathStr.includes("owner")) {
				return [{ name: "extension", isDirectory: () => true }] as fs.Dirent[];
			}
			return [];
		});

		const result = findExtensionManifests("/workspace");

		expect(result.length).toBeGreaterThan(0);
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Found"));
	});

	it("should find multiple manifests from multiple owners", () => {
		mockFs.existsSync.mockImplementation((filePath) => {
			const pathStr = String(filePath);
			if (pathStr.endsWith("_extensions")) return true;
			if (pathStr.includes("_extension.yml") || pathStr.includes("_extension.yaml")) return true;
			return false;
		});

		mockFs.readdirSync.mockImplementation((dirPath) => {
			const pathStr = String(dirPath);
			if (pathStr.endsWith("_extensions")) {
				return [
					{ name: "owner1", isDirectory: () => true },
					{ name: "owner2", isDirectory: () => true },
				] as fs.Dirent[];
			}
			if (pathStr.includes("owner1")) {
				return [{ name: "ext1", isDirectory: () => true }] as fs.Dirent[];
			}
			if (pathStr.includes("owner2")) {
				return [{ name: "ext2", isDirectory: () => true }] as fs.Dirent[];
			}
			return [];
		});

		const result = findExtensionManifests("/workspace");

		expect(result).toHaveLength(2);
	});

	it("should skip non-directory entries in owners directory", () => {
		mockFs.existsSync.mockImplementation((filePath) => {
			const pathStr = String(filePath);
			if (pathStr.endsWith("_extensions")) return true;
			if (pathStr.includes("_extension.yml")) return true;
			return false;
		});

		mockFs.readdirSync.mockImplementation((dirPath) => {
			const pathStr = String(dirPath);
			if (pathStr.endsWith("_extensions")) {
				return [
					{ name: "owner", isDirectory: () => true },
					{ name: "file.txt", isDirectory: () => false },
				] as fs.Dirent[];
			}
			if (pathStr.includes("owner")) {
				return [{ name: "ext", isDirectory: () => true }] as fs.Dirent[];
			}
			return [];
		});

		const result = findExtensionManifests("/workspace");

		expect(result).toHaveLength(1);
	});

	it("should skip non-directory entries in extensions directory", () => {
		mockFs.existsSync.mockImplementation((filePath) => {
			const pathStr = String(filePath);
			if (pathStr.endsWith("_extensions")) return true;
			if (pathStr.includes("_extension.yml")) return true;
			return false;
		});

		mockFs.readdirSync.mockImplementation((dirPath) => {
			const pathStr = String(dirPath);
			if (pathStr.endsWith("_extensions")) {
				return [{ name: "owner", isDirectory: () => true }] as fs.Dirent[];
			}
			if (pathStr.includes("owner")) {
				return [
					{ name: "ext", isDirectory: () => true },
					{ name: "README.md", isDirectory: () => false },
				] as fs.Dirent[];
			}
			return [];
		});

		const result = findExtensionManifests("/workspace");

		expect(result).toHaveLength(1);
	});

	it("should handle errors when scanning directory", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockImplementation(() => {
			throw new Error("Permission denied");
		});

		const result = findExtensionManifests("/workspace");

		expect(result).toEqual([]);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Error scanning extensions directory"));
	});

	it("should return empty array when no manifests found", () => {
		mockFs.existsSync.mockImplementation((filePath) => {
			const pathStr = String(filePath);
			return pathStr.endsWith("_extensions");
		});

		mockFs.readdirSync.mockImplementation((dirPath) => {
			const pathStr = String(dirPath);
			if (pathStr.endsWith("_extensions")) {
				return [{ name: "owner", isDirectory: () => true }] as fs.Dirent[];
			}
			if (pathStr.includes("owner")) {
				return [{ name: "ext", isDirectory: () => true }] as fs.Dirent[];
			}
			return [];
		});

		const result = findExtensionManifests("/workspace");

		expect(result).toEqual([]);
		expect(core.info).toHaveBeenCalledWith("Found 0 extension manifests");
	});
});

describe("readExtensionManifest", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return null when manifest file does not exist", () => {
		mockFs.existsSync.mockReturnValue(false);

		const result = readExtensionManifest("/path/to/_extension.yml");

		expect(result).toBeNull();
		expect(core.warning).toHaveBeenCalledWith("Manifest not found: /path/to/_extension.yml");
	});

	it("should parse valid manifest with all fields", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue(`
title: Test Extension
author: Test Author
version: 1.0.0
source: owner/repo@v1.0.0
contributes:
  filters:
    - test.lua
`);

		const result = readExtensionManifest("/path/_extension.yml");

		expect(result).toEqual({
			title: "Test Extension",
			author: "Test Author",
			version: "1.0.0",
			source: "owner/repo@v1.0.0",
			repository: "owner/repo",
			contributes: "filters",
		});
	});

	it("should handle manifest with minimal fields", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue("version: 2.0.0\n");

		const result = readExtensionManifest("/path/_extension.yml");

		expect(result).toEqual({
			title: undefined,
			author: undefined,
			version: "2.0.0",
			source: undefined,
			repository: undefined,
			contributes: undefined,
		});
	});

	it("should handle manifest with multiple contributes types", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue(`
version: 1.0.0
contributes:
  filters:
    - filter1.lua
  shortcodes:
    - shortcode1.lua
  formats:
    html: default.html
`);

		const result = readExtensionManifest("/path/_extension.yml");

		expect(result?.contributes).toContain("filters");
		expect(result?.contributes).toContain("shortcodes");
		expect(result?.contributes).toContain("formats");
	});

	it("should extract repository from source field", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue("version: 1.0.0\nsource: mcanouil/quarto-iconify@v0.3.6\n");

		const result = readExtensionManifest("/path/_extension.yml");

		expect(result?.source).toBe("mcanouil/quarto-iconify@v0.3.6");
		expect(result?.repository).toBe("mcanouil/quarto-iconify");
	});

	it("should handle source without version tag", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue("version: 1.0.0\nsource: owner/repo\n");

		const result = readExtensionManifest("/path/_extension.yml");

		expect(result?.source).toBe("owner/repo");
		expect(result?.repository).toBe("owner/repo");
	});

	it("should handle non-string field types", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue("title: 123\nauthor: true\nversion: null\n");

		const result = readExtensionManifest("/path/_extension.yml");

		expect(result?.title).toBeUndefined();
		expect(result?.author).toBeUndefined();
		expect(result?.version).toBeUndefined();
	});

	it("should handle invalid YAML syntax", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue("title: Test\n  invalid: indentation\n");

		const result = readExtensionManifest("/path/_extension.yml");

		expect(result).toBeNull();
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Error reading manifest"));
	});

	it("should handle file read errors", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockImplementation(() => {
			throw new Error("Read permission denied");
		});

		const result = readExtensionManifest("/path/_extension.yml");

		expect(result).toBeNull();
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Error reading manifest"));
	});

	it("should handle contributes as non-object", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue('version: 1.0.0\ncontributes: "invalid"\n');

		const result = readExtensionManifest("/path/_extension.yml");

		expect(result?.contributes).toBeUndefined();
	});
});

describe("extractExtensionInfo", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should extract owner and name from valid path", () => {
		const manifestPath = "/workspace/_extensions/owner/extension/_extension.yml";

		const result = extractExtensionInfo(manifestPath);

		expect(result).toEqual({
			owner: "owner",
			name: "extension",
		});
	});

	it("should handle Windows path separator", () => {
		const manifestPath = "C:/workspace/_extensions/owner/extension/_extension.yml";

		const result = extractExtensionInfo(manifestPath);

		expect(result).toEqual({
			owner: "owner",
			name: "extension",
		});
	});

	it("should return null when _extensions marker is not found", () => {
		const manifestPath = "/workspace/owner/extension/_extension.yml";

		const result = extractExtensionInfo(manifestPath);

		expect(result).toBeNull();
	});

	it("should return null when path is too short after _extensions", () => {
		const manifestPath = "/workspace/_extensions/owner";

		const result = extractExtensionInfo(manifestPath);

		expect(result).toBeNull();
	});

	it("should return null when _extensions is at the end of path", () => {
		const manifestPath = "/workspace/_extensions";

		const result = extractExtensionInfo(manifestPath);

		expect(result).toBeNull();
	});

	it("should handle nested workspace paths", () => {
		const manifestPath = "/home/user/projects/workspace/_extensions/owner/extension/_extension.yml";

		const result = extractExtensionInfo(manifestPath);

		expect(result).toEqual({
			owner: "owner",
			name: "extension",
		});
	});

	it("should handle errors during path processing", () => {
		// Force an error by passing invalid input
		const invalidPath = null as unknown as string;

		const result = extractExtensionInfo(invalidPath);

		expect(result).toBeNull();
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Error extracting extension info"));
	});
});

describe("updateManifestSource", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should add source field when it does not exist", () => {
		mockFs.readFileSync.mockReturnValue("title: Test\nversion: 1.0.0");

		updateManifestSource("/path/_extension.yml", "owner/repo@v1.0.0");

		expect(mockFs.writeFileSync).toHaveBeenCalledWith(
			"/path/_extension.yml",
			"title: Test\nversion: 1.0.0\nsource: owner/repo@v1.0.0\n",
			"utf-8",
		);
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Added source field"));
	});

	it("should skip update when source field already exists", () => {
		mockFs.readFileSync.mockReturnValue("title: Test\nsource: existing/source@v1.0.0\nversion: 1.0.0");

		updateManifestSource("/path/_extension.yml", "owner/repo@v2.0.0");

		expect(mockFs.writeFileSync).not.toHaveBeenCalled();
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Source field already exists"));
	});

	it("should trim content before adding source", () => {
		mockFs.readFileSync.mockReturnValue("title: Test\nversion: 1.0.0\n\n\n");

		updateManifestSource("/path/_extension.yml", "owner/repo@v1.0.0");

		expect(mockFs.writeFileSync).toHaveBeenCalledWith(
			"/path/_extension.yml",
			"title: Test\nversion: 1.0.0\nsource: owner/repo@v1.0.0\n",
			"utf-8",
		);
	});

	it("should handle file read errors", () => {
		mockFs.readFileSync.mockImplementation(() => {
			throw new Error("Read permission denied");
		});

		expect(() => {
			updateManifestSource("/path/_extension.yml", "owner/repo@v1.0.0");
		}).toThrow("Read permission denied");

		expect(core.error).toHaveBeenCalledWith(expect.stringContaining("Error updating manifest source"));
	});

	it("should handle file write errors", () => {
		mockFs.readFileSync.mockReturnValue("title: Test");
		mockFs.writeFileSync.mockImplementation(() => {
			throw new Error("Write permission denied");
		});

		expect(() => {
			updateManifestSource("/path/_extension.yml", "owner/repo@v1.0.0");
		}).toThrow("Write permission denied");

		expect(core.error).toHaveBeenCalledWith(expect.stringContaining("Error updating manifest source"));
	});

	it("should handle empty file content", () => {
		mockFs.readFileSync.mockReturnValue("");
		mockFs.writeFileSync.mockImplementation(() => {
			// Reset mock from previous test
		});

		updateManifestSource("/path/_extension.yml", "owner/repo@v1.0.0");

		// When content is empty, trim() makes it empty, then adds newline before source
		expect(mockFs.writeFileSync).toHaveBeenCalledWith("/path/_extension.yml", "\nsource: owner/repo@v1.0.0\n", "utf-8");
	});

	it("should detect source: in comments or strings", () => {
		mockFs.readFileSync.mockReturnValue("title: Test\n# source: commented");

		updateManifestSource("/path/_extension.yml", "owner/repo@v1.0.0");

		expect(mockFs.writeFileSync).not.toHaveBeenCalled();
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Source field already exists"));
	});
});
