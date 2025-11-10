import { generatePRTitle, generatePRBody, generatePRLabels, logUpdateSummary } from "../src/pr";
import { ExtensionUpdate } from "../src/types";
import * as core from "@actions/core";
import * as github from "@actions/github";

// Mock @actions/core
jest.mock("@actions/core");

// Mock GitHub Octokit
const mockOctokit = {
	rest: {
		repos: {
			getReleaseByTag: jest.fn(),
		},
	},
} as unknown as ReturnType<typeof github.getOctokit>;

describe("generatePRTitle", () => {
	it("should generate title for single update", () => {
		const updates: ExtensionUpdate[] = [
			{
				name: "iconify",
				owner: "mcanouil",
				nameWithOwner: "mcanouil/iconify",
				repositoryName: "mcanouil/quarto-iconify",
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				manifestPath: "/path/to/manifest",
				url: "https://github.com/mcanouil/quarto-iconify",
				releaseUrl: "https://github.com/mcanouil/quarto-iconify/releases/tag/1.1.0",
				description: "Iconify extension",
			},
		];

		const title = generatePRTitle(updates);

		expect(title).toBe("chore(deps): update mcanouil/iconify extension to 1.1.0");
	});

	it("should generate title for multiple updates", () => {
		const updates: ExtensionUpdate[] = [
			{
				name: "iconify",
				owner: "mcanouil",
				nameWithOwner: "mcanouil/iconify",
				repositoryName: "mcanouil/quarto-iconify",
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				manifestPath: "/path1",
				url: "https://github.com/mcanouil/quarto-iconify",
				releaseUrl: "https://github.com/mcanouil/quarto-iconify/releases/tag/1.1.0",
			},
			{
				name: "lightbox",
				owner: "quarto-ext",
				nameWithOwner: "quarto-ext/lightbox",
				repositoryName: "quarto-ext/lightbox",
				currentVersion: "1.0.0",
				latestVersion: "2.0.0",
				manifestPath: "/path2",
				url: "https://github.com/quarto-ext/lightbox",
				releaseUrl: "https://github.com/quarto-ext/lightbox/releases/tag/2.0.0",
			},
		];

		const title = generatePRTitle(updates);

		expect(title).toBe("chore(deps): update 2 Quarto extensions");
	});

	it("should use custom prefix", () => {
		const updates: ExtensionUpdate[] = [
			{
				name: "test",
				owner: "owner",
				nameWithOwner: "owner/test",
				repositoryName: "owner/test",
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				manifestPath: "/path",
				url: "https://github.com/owner/test",
				releaseUrl: "https://github.com/owner/test/releases/tag/1.1.0",
			},
		];

		const title = generatePRTitle(updates, "build:");

		expect(title).toBe("build: update owner/test extension to 1.1.0");
	});
});

describe("generatePRBody", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should generate PR body for single update with release notes", async () => {
		const updates: ExtensionUpdate[] = [
			{
				name: "iconify",
				owner: "mcanouil",
				nameWithOwner: "mcanouil/iconify",
				repositoryName: "mcanouil/quarto-iconify",
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				manifestPath: "/path",
				url: "https://github.com/mcanouil/quarto-iconify",
				releaseUrl: "https://github.com/mcanouil/quarto-iconify/releases/tag/v1.1.0",
				description: "Iconify extension for Quarto",
			},
		];

		(mockOctokit.rest.repos.getReleaseByTag as jest.Mock).mockResolvedValue({
			data: {
				body: "## What's Changed\n\n- Added new icons\n- Fixed bugs",
			},
		});

		const body = await generatePRBody(updates, mockOctokit);

		expect(body).toContain("Updates the following Quarto extension(s):");
		expect(body).toContain("mcanouil/iconify");
		expect(body).toContain("`1.0.0` → `1.1.0`");
		expect(body).toContain("Release 1.1.0");
		expect(body).toContain("> ## What's Changed");
		expect(body).toContain("**About**: Iconify extension for Quarto");
		expect(body).toContain("quarto-extensions-updater");
	});

	it("should handle missing release notes", async () => {
		const updates: ExtensionUpdate[] = [
			{
				name: "test",
				owner: "owner",
				nameWithOwner: "owner/test",
				repositoryName: "owner/test",
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				manifestPath: "/path",
				url: "https://github.com/owner/test",
				releaseUrl: "https://github.com/owner/test/releases/tag/1.1.0",
			},
		];

		(mockOctokit.rest.repos.getReleaseByTag as jest.Mock).mockRejectedValue(new Error("Not found"));

		const body = await generatePRBody(updates, mockOctokit);

		expect(body).toContain("No release notes available");
		expect(body).toContain("View release:");
	});

	it("should group updates by type", async () => {
		const updates: ExtensionUpdate[] = [
			{
				name: "major",
				owner: "owner",
				nameWithOwner: "owner/major",
				repositoryName: "owner/major",
				currentVersion: "1.0.0",
				latestVersion: "2.0.0",
				manifestPath: "/path1",
				url: "https://github.com/owner/major",
				releaseUrl: "https://github.com/owner/major/releases/tag/2.0.0",
			},
			{
				name: "minor",
				owner: "owner",
				nameWithOwner: "owner/minor",
				repositoryName: "owner/minor",
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				manifestPath: "/path2",
				url: "https://github.com/owner/minor",
				releaseUrl: "https://github.com/owner/minor/releases/tag/1.1.0",
			},
			{
				name: "patch",
				owner: "owner",
				nameWithOwner: "owner/patch",
				repositoryName: "owner/patch",
				currentVersion: "1.0.0",
				latestVersion: "1.0.1",
				manifestPath: "/path3",
				url: "https://github.com/owner/patch",
				releaseUrl: "https://github.com/owner/patch/releases/tag/1.0.1",
			},
		];

		(mockOctokit.rest.repos.getReleaseByTag as jest.Mock).mockResolvedValue({
			data: { body: "Release notes" },
		});

		const body = await generatePRBody(updates, mockOctokit);

		expect(body).toContain("## ⚠️ Major Updates");
		expect(body).toContain("## ✨ Minor Updates");
		expect(body).toContain("## 🐛 Patch Updates");
	});

	it("should handle invalid repository name format", async () => {
		const updates: ExtensionUpdate[] = [
			{
				name: "test",
				owner: "owner",
				nameWithOwner: "owner/test",
				repositoryName: "invalid-format",
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				manifestPath: "/path",
				url: "https://github.com/owner/test",
				releaseUrl: "https://github.com/owner/test/releases/tag/1.1.0",
			},
		];

		const body = await generatePRBody(updates, mockOctokit);

		expect(body).toContain("owner/test");
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Invalid repository name format"));
	});
});

describe("generatePRLabels", () => {
	it("should return default labels", () => {
		const labels = generatePRLabels();

		expect(labels).toEqual(["dependencies", "quarto-extensions"]);
	});

	it("should return array that can be modified", () => {
		const labels = generatePRLabels();

		// Should not affect future calls
		labels.push("test");

		const newLabels = generatePRLabels();
		expect(newLabels).toEqual(["dependencies", "quarto-extensions"]);
	});
});

describe("logUpdateSummary", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should log summary for mixed updates", () => {
		const updates: ExtensionUpdate[] = [
			{
				name: "major",
				owner: "owner",
				nameWithOwner: "owner/major",
				repositoryName: "owner/major",
				currentVersion: "1.0.0",
				latestVersion: "2.0.0",
				manifestPath: "/path1",
				url: "https://github.com/owner/major",
				releaseUrl: "https://github.com/owner/major/releases/tag/2.0.0",
			},
			{
				name: "minor",
				owner: "owner",
				nameWithOwner: "owner/minor",
				repositoryName: "owner/minor",
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				manifestPath: "/path2",
				url: "https://github.com/owner/minor",
				releaseUrl: "https://github.com/owner/minor/releases/tag/1.1.0",
			},
			{
				name: "patch",
				owner: "owner",
				nameWithOwner: "owner/patch",
				repositoryName: "owner/patch",
				currentVersion: "1.0.0",
				latestVersion: "1.0.1",
				manifestPath: "/path3",
				url: "https://github.com/owner/patch",
				releaseUrl: "https://github.com/owner/patch/releases/tag/1.0.1",
			},
		];

		logUpdateSummary(updates);

		expect(core.info).toHaveBeenCalledWith("📦 Extension Updates Summary:");
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("⚠️  Major updates (1):"));
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("✨ Minor updates (1):"));
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("🐛 Patch updates (1):"));
		expect(core.info).toHaveBeenCalledWith("Total: 3 extension(s) to update");
	});

	it("should log only patch updates", () => {
		const updates: ExtensionUpdate[] = [
			{
				name: "patch",
				owner: "owner",
				nameWithOwner: "owner/patch",
				repositoryName: "owner/patch",
				currentVersion: "1.0.0",
				latestVersion: "1.0.1",
				manifestPath: "/path",
				url: "https://github.com/owner/patch",
				releaseUrl: "https://github.com/owner/patch/releases/tag/1.0.1",
			},
		];

		logUpdateSummary(updates);

		expect(core.warning).not.toHaveBeenCalledWith(expect.stringContaining("Major updates"));
		expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining("Minor updates"));
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("🐛 Patch updates (1):"));
	});

	it("should use correct separator length", () => {
		const updates: ExtensionUpdate[] = [
			{
				name: "test",
				owner: "owner",
				nameWithOwner: "owner/test",
				repositoryName: "owner/test",
				currentVersion: "1.0.0",
				latestVersion: "1.0.1",
				manifestPath: "/path",
				url: "https://github.com/owner/test",
				releaseUrl: "https://github.com/owner/test/releases/tag/1.0.1",
			},
		];

		logUpdateSummary(updates);

		// Check that separator is called with repeated character
		const separatorCalls = (core.info as jest.Mock).mock.calls.filter((call) => call[0].includes("─"));
		expect(separatorCalls.length).toBeGreaterThan(0);
		expect(separatorCalls[0][0]).toMatch(/^─+$/);
	});
});
