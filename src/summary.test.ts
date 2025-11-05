// Mock @actions/core before importing
jest.mock("@actions/core");
jest.mock("./automerge");

import * as core from "@actions/core";
import { shouldAutoMerge } from "./automerge";
import { generateDryRunSummary, generateCompletedSummary, generateDryRunMarkdown } from "./summary";
import type { ExtensionUpdate, AutoMergeConfig, ExtensionFilterConfig } from "./types";
import { createMockUpdate, createMockSummary } from "./__test-utils__/mockFactories";

const mockCore = jest.mocked(core);
const mockShouldAutoMerge = jest.mocked(shouldAutoMerge);

// Mock the summary API
const mockSummary = createMockSummary();

describe("generateDryRunMarkdown", () => {
	const createUpdate = createMockUpdate;

	beforeEach(() => {
		jest.clearAllMocks();
		mockShouldAutoMerge.mockReturnValue(false);
	});

	it("should generate markdown with configuration table including defaults", () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];
		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		const markdown = generateDryRunMarkdown(updates, false, "all", filterConfig, autoMergeConfig);

		expect(markdown).toContain("## Dry-Run Summary");
		expect(markdown).toContain("### Configuration");
		expect(markdown).toContain("Settings marked with ⚙️ are non-default values");
		expect(markdown).toContain("| Setting | Value | Default |");
		expect(markdown).toContain("| Mode | Individual PRs (one per extension) | Individual PRs |");
		expect(markdown).toContain("| Update Strategy | all | all |");
		expect(markdown).toContain("| Include Filter | *(all)* | *(all)* |");
		expect(markdown).toContain("| Exclude Filter | *(none)* | *(none)* |");
		expect(markdown).toContain("| Auto-Merge | Disabled | Disabled |");
	});

	it("should mark non-default settings with indicator", () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];
		const filterConfig: ExtensionFilterConfig = {
			include: ["owner/ext1"],
			exclude: ["owner/ext2"],
		};
		const autoMergeConfig: AutoMergeConfig = { enabled: true, strategy: "minor", mergeMethod: "rebase" };

		const markdown = generateDryRunMarkdown(updates, true, "patch", filterConfig, autoMergeConfig);

		// Non-default settings should have ⚙️ indicator
		expect(markdown).toContain("| ⚙️ Mode | Grouped updates (single PR)");
		expect(markdown).toContain("| ⚙️ Update Strategy | patch");
		expect(markdown).toContain("| ⚙️ Include Filter | owner/ext1");
		expect(markdown).toContain("| ⚙️ Exclude Filter | owner/ext2");
		expect(markdown).toContain("| ⚙️ Auto-Merge | Enabled (minor updates, rebase method)");
	});

	it("should include planned actions section", () => {
		const updates: ExtensionUpdate[] = [
			createUpdate("owner/ext1", "1.0.0", "1.1.0"),
			createUpdate("owner/ext2", "2.0.0", "2.1.0"),
		];
		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		const markdownGrouped = generateDryRunMarkdown(updates, true, "all", filterConfig, autoMergeConfig);
		const markdownIndividual = generateDryRunMarkdown(updates, false, "all", filterConfig, autoMergeConfig);

		expect(markdownGrouped).toContain("### Planned Actions");
		expect(markdownGrouped).toContain("Would create **1 PR** with 2 extension updates");

		expect(markdownIndividual).toContain("### Planned Actions");
		expect(markdownIndividual).toContain("Would create **2 PRs** (one per extension)");
	});

	it("should include available updates table", () => {
		const updates: ExtensionUpdate[] = [
			createUpdate("owner/ext1", "1.0.0", "1.1.0"),
			createUpdate("owner/ext2", "2.0.0", "2.1.0"),
		];
		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		mockShouldAutoMerge.mockReturnValue(false);

		const markdown = generateDryRunMarkdown(updates, false, "all", filterConfig, autoMergeConfig);

		expect(markdown).toContain("### Available Updates");
		expect(markdown).toContain("| Extension | Current | Latest | Auto-Merge |");
		expect(markdown).toContain("| owner/ext1 | 1.0.0 | 1.1.0 | ✗ No |");
		expect(markdown).toContain("| owner/ext2 | 2.0.0 | 2.1.0 | ✗ No |");
	});

	it("should show auto-merge status for each update", () => {
		const updates: ExtensionUpdate[] = [
			createUpdate("owner/ext1", "1.0.0", "1.0.1"),
			createUpdate("owner/ext2", "1.0.0", "2.0.0"),
		];
		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: true, strategy: "patch", mergeMethod: "squash" };

		mockShouldAutoMerge.mockImplementation((update: ExtensionUpdate) => {
			return update.nameWithOwner === "owner/ext1"; // Only patch update
		});

		const markdown = generateDryRunMarkdown(updates, false, "all", filterConfig, autoMergeConfig);

		expect(markdown).toContain("| owner/ext1 | 1.0.0 | 1.0.1 | ✓ Yes |");
		expect(markdown).toContain("| owner/ext2 | 1.0.0 | 2.0.0 | ✗ No |");
	});

	it("should include next steps section", () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];
		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		const markdown = generateDryRunMarkdown(updates, false, "all", filterConfig, autoMergeConfig);

		expect(markdown).toContain("### Next Steps");
		expect(markdown).toContain("To apply these updates, remove `dry-run: true` from your workflow configuration.");
	});

	it("should handle singular update correctly", () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];
		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		const markdown = generateDryRunMarkdown(updates, true, "all", filterConfig, autoMergeConfig);

		expect(markdown).toContain("Would create **1 PR** with 1 extension update");
	});
});

describe("generateDryRunSummary", () => {
	const createUpdate = createMockUpdate;

	beforeEach(() => {
		jest.clearAllMocks();
		mockCore.summary = mockSummary as unknown as typeof core.summary;
		mockShouldAutoMerge.mockReturnValue(false);
	});

	it("should generate summary for single update without grouping", async () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/extension", "1.0.0", "1.1.0")];

		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		await generateDryRunSummary(updates, false, "all", filterConfig, autoMergeConfig);

		// Should call addRaw with markdown content
		expect(mockSummary.addRaw).toHaveBeenCalled();
		const markdownCall = mockSummary.addRaw.mock.calls[0][0];
		expect(markdownCall).toContain("## Dry-Run Summary");
		expect(markdownCall).toContain("No PRs will be created");
		expect(markdownCall).toContain("### Configuration");
		expect(markdownCall).toContain("Would create **1 PR** (one per extension)");
		expect(mockSummary.write).toHaveBeenCalled();
	});

	it("should generate summary for multiple updates with grouping", async () => {
		const updates: ExtensionUpdate[] = [
			createUpdate("owner/ext1", "1.0.0", "1.1.0"),
			createUpdate("owner/ext2", "2.0.0", "2.1.0"),
			createUpdate("owner/ext3", "3.0.0", "3.1.0"),
		];

		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		await generateDryRunSummary(updates, true, "all", filterConfig, autoMergeConfig);

		const markdownCall = mockSummary.addRaw.mock.calls[0][0];
		expect(markdownCall).toContain("Would create **1 PR** with 3 extension updates");
	});

	it("should add issue creation notice when createIssue is true", async () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];
		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		await generateDryRunSummary(updates, false, "all", filterConfig, autoMergeConfig, true);

		expect(mockSummary.addBreak).toHaveBeenCalled();
		expect(mockSummary.addRaw).toHaveBeenCalledWith(
			"ℹ️ A GitHub issue has been created with this summary for tracking purposes.",
			true,
		);
	});

	it("should not add issue creation notice when createIssue is false", async () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];
		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		await generateDryRunSummary(updates, false, "all", filterConfig, autoMergeConfig, false);

		// addRaw should only be called once (for the markdown content, not for the issue notice)
		expect(mockSummary.addRaw).toHaveBeenCalledTimes(1);
		const calls = mockSummary.addRaw.mock.calls;
		const hasIssueNotice = calls.some((call) => call[0].includes("GitHub issue has been created"));
		expect(hasIssueNotice).toBe(false);
	});

});

describe("generateCompletedSummary", () => {
	const createUpdate = createMockUpdate;

	beforeEach(() => {
		jest.clearAllMocks();
		mockCore.summary = mockSummary as unknown as typeof core.summary;
		mockShouldAutoMerge.mockReturnValue(false);
	});

	it("should generate summary for single PR", async () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];
		const createdPRs = [{ number: 123, url: "https://github.com/owner/repo/pull/123" }];

		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		await generateCompletedSummary(updates, createdPRs, false, "all", filterConfig, autoMergeConfig);

		expect(mockSummary.addHeading).toHaveBeenCalledWith("Extension Updates Summary", 2);
		expect(mockSummary.addRaw).toHaveBeenCalledWith("Successfully created/updated 1 PR", true);
		expect(mockSummary.write).toHaveBeenCalled();
	});

	it("should generate summary for multiple PRs", async () => {
		const updates: ExtensionUpdate[] = [
			createUpdate("owner/ext1", "1.0.0", "1.1.0"),
			createUpdate("owner/ext2", "2.0.0", "2.1.0"),
		];
		const createdPRs = [
			{ number: 123, url: "https://github.com/owner/repo/pull/123" },
			{ number: 124, url: "https://github.com/owner/repo/pull/124" },
		];

		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		await generateCompletedSummary(updates, createdPRs, false, "all", filterConfig, autoMergeConfig);

		expect(mockSummary.addRaw).toHaveBeenCalledWith("Successfully created/updated 2 PRs", true);
	});

	it("should link updates to PRs in grouped mode", async () => {
		const updates: ExtensionUpdate[] = [
			createUpdate("owner/ext1", "1.0.0", "1.1.0"),
			createUpdate("owner/ext2", "2.0.0", "2.1.0"),
		];
		const createdPRs = [{ number: 123, url: "https://github.com/owner/repo/pull/123" }];

		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		await generateCompletedSummary(updates, createdPRs, true, "all", filterConfig, autoMergeConfig);

		const updatesTableCall = mockSummary.addTable.mock.calls[1][0];
		// Both updates should link to the same PR
		expect(updatesTableCall[1][3]).toEqual({
			data: '<a href="https://github.com/owner/repo/pull/123">#123</a>',
			header: false,
		});
		expect(updatesTableCall[2][3]).toEqual({
			data: '<a href="https://github.com/owner/repo/pull/123">#123</a>',
			header: false,
		});
	});

	it("should link updates to individual PRs in non-grouped mode", async () => {
		const updates: ExtensionUpdate[] = [
			createUpdate("owner/ext1", "1.0.0", "1.1.0"),
			createUpdate("owner/ext2", "2.0.0", "2.1.0"),
		];
		const createdPRs = [
			{ number: 123, url: "https://github.com/owner/repo/pull/123" },
			{ number: 124, url: "https://github.com/owner/repo/pull/124" },
		];

		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		await generateCompletedSummary(updates, createdPRs, false, "all", filterConfig, autoMergeConfig);

		const updatesTableCall = mockSummary.addTable.mock.calls[1][0];
		// First update to first PR
		expect(updatesTableCall[1][3]).toEqual({
			data: '<a href="https://github.com/owner/repo/pull/123">#123</a>',
			header: false,
		});
		// Second update to second PR
		expect(updatesTableCall[2][3]).toEqual({
			data: '<a href="https://github.com/owner/repo/pull/124">#124</a>',
			header: false,
		});
	});

	it("should handle update without PR as N/A", async () => {
		const updates: ExtensionUpdate[] = [
			createUpdate("owner/ext1", "1.0.0", "1.1.0"),
			createUpdate("owner/ext2", "2.0.0", "2.1.0"),
		];
		const createdPRs = [{ number: 123, url: "https://github.com/owner/repo/pull/123" }];

		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		await generateCompletedSummary(updates, createdPRs, false, "all", filterConfig, autoMergeConfig);

		const updatesTableCall = mockSummary.addTable.mock.calls[1][0];
		// First update has PR
		expect(updatesTableCall[1][3]).toEqual({
			data: '<a href="https://github.com/owner/repo/pull/123">#123</a>',
			header: false,
		});
		// Second update has no PR
		expect(updatesTableCall[2][3]).toEqual({ data: "N/A", header: false });
	});

	it("should include auto-merge status for each update", async () => {
		const updates: ExtensionUpdate[] = [
			createUpdate("owner/ext1", "1.0.0", "1.0.1"),
			createUpdate("owner/ext2", "1.0.0", "2.0.0"),
		];
		const createdPRs = [
			{ number: 123, url: "https://github.com/owner/repo/pull/123" },
			{ number: 124, url: "https://github.com/owner/repo/pull/124" },
		];

		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: true, strategy: "patch", mergeMethod: "squash" };

		mockShouldAutoMerge.mockImplementation((update: ExtensionUpdate) => {
			return update.nameWithOwner === "owner/ext1";
		});

		await generateCompletedSummary(updates, createdPRs, false, "all", filterConfig, autoMergeConfig);

		const updatesTableCall = mockSummary.addTable.mock.calls[1][0];
		// First update should have auto-merge
		expect(updatesTableCall[1][4]).toEqual({ data: "✓ Yes", header: false });
		// Second update should not
		expect(updatesTableCall[2][4]).toEqual({ data: "✗ No", header: false });
	});

	it("should include filter configuration", async () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];
		const createdPRs = [{ number: 123, url: "https://github.com/owner/repo/pull/123" }];

		const filterConfig: ExtensionFilterConfig = {
			include: ["owner/ext1"],
			exclude: [],
		};
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		await generateCompletedSummary(updates, createdPRs, false, "minor", filterConfig, autoMergeConfig);

		const configTableCall = mockSummary.addTable.mock.calls[0][0];
		const includeRow = configTableCall.find((row: unknown[]) => {
			const firstCell = row[0] as { data: string; header: boolean };
			return firstCell.data === "Include Filter";
		});
		expect(includeRow).toBeDefined();
	});
});
