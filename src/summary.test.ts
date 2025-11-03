// Mock @actions/core before importing
jest.mock("@actions/core");
jest.mock("./automerge");

import * as core from "@actions/core";
import { shouldAutoMerge } from "./automerge";
import { generateDryRunSummary, generateCompletedSummary } from "./summary";
import type { ExtensionUpdate, AutoMergeConfig, ExtensionFilterConfig } from "./types";
import { createMockUpdate, createMockSummary } from "./__test-utils__/mockFactories";

const mockCore = jest.mocked(core);
const mockShouldAutoMerge = jest.mocked(shouldAutoMerge);

// Mock the summary API
const mockSummary = createMockSummary();

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

		expect(mockSummary.addHeading).toHaveBeenCalledWith("Dry-Run Summary", 2);
		expect(mockSummary.addRaw).toHaveBeenCalledWith(
			"No PRs will be created. This is a preview of what would happen.",
			true,
		);
		expect(mockSummary.addHeading).toHaveBeenCalledWith("Configuration", 3);
		expect(mockSummary.addTable).toHaveBeenCalled();
		expect(mockSummary.addRaw).toHaveBeenCalledWith("Would create **1 PR** (one per extension)", true);
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

		expect(mockSummary.addRaw).toHaveBeenCalledWith("Would create **1 PR** with 3 extension updates", true);
	});

	it("should include filter configuration when provided", async () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];

		const filterConfig: ExtensionFilterConfig = {
			include: ["owner/ext1", "owner/ext2"],
			exclude: ["owner/ext3"],
		};
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		await generateDryRunSummary(updates, false, "all", filterConfig, autoMergeConfig);

		const tableCall = mockSummary.addTable.mock.calls[0][0];
		// Check that include filter is in the table
		const includeRow = tableCall.find((row: unknown[]) => {
			const firstCell = row[0] as { data: string; header: boolean };
			return firstCell.data === "Include Filter";
		});
		expect(includeRow).toBeDefined();
		expect(includeRow[1]).toEqual({ data: "owner/ext1, owner/ext2", header: false });

		// Check that exclude filter is in the table
		const excludeRow = tableCall.find((row: unknown[]) => {
			const firstCell = row[0] as { data: string; header: boolean };
			return firstCell.data === "Exclude Filter";
		});
		expect(excludeRow).toBeDefined();
		expect(excludeRow[1]).toEqual({ data: "owner/ext3", header: false });
	});

	it("should show auto-merge enabled configuration", async () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/ext1", "1.0.0", "1.0.1")];

		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: true, strategy: "minor", mergeMethod: "rebase" };

		await generateDryRunSummary(updates, false, "patch", filterConfig, autoMergeConfig);

		const tableCall = mockSummary.addTable.mock.calls[0][0];
		const autoMergeRow = tableCall.find((row: unknown[]) => {
			const firstCell = row[0] as { data: string; header: boolean };
			return firstCell.data === "Auto-Merge";
		});
		expect(autoMergeRow[1]).toEqual({
			data: "Enabled (minor updates, rebase method)",
			header: false,
		});
	});

	it("should show auto-merge disabled configuration", async () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/ext1", "1.0.0", "1.0.1")];

		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		await generateDryRunSummary(updates, false, "all", filterConfig, autoMergeConfig);

		const tableCall = mockSummary.addTable.mock.calls[0][0];
		const autoMergeRow = tableCall.find((row: unknown[]) => {
			const firstCell = row[0] as { data: string; header: boolean };
			return firstCell.data === "Auto-Merge";
		});
		expect(autoMergeRow[1]).toEqual({ data: "Disabled", header: false });
	});

	it("should include auto-merge status for each update", async () => {
		const updates: ExtensionUpdate[] = [
			createUpdate("owner/ext1", "1.0.0", "1.0.1"),
			createUpdate("owner/ext2", "1.0.0", "2.0.0"),
		];

		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: true, strategy: "patch", mergeMethod: "squash" };

		mockShouldAutoMerge.mockImplementation((update: ExtensionUpdate) => {
			return update.nameWithOwner === "owner/ext1"; // Only patch update
		});

		await generateDryRunSummary(updates, false, "all", filterConfig, autoMergeConfig);

		const updatesTableCall = mockSummary.addTable.mock.calls[1][0];
		// First update should have auto-merge
		expect(updatesTableCall[1][3]).toEqual({ data: "✓ Yes", header: false });
		// Second update should not
		expect(updatesTableCall[2][3]).toEqual({ data: "✗ No", header: false });
	});

	it("should use singular for single update", async () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/ext1", "1.0.0", "1.1.0")];

		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		await generateDryRunSummary(updates, true, "all", filterConfig, autoMergeConfig);

		expect(mockSummary.addRaw).toHaveBeenCalledWith("Would create **1 PR** with 1 extension update", true);
	});

	it("should handle different update strategies", async () => {
		const updates: ExtensionUpdate[] = [createUpdate("owner/ext1", "1.0.0", "1.0.1")];
		const filterConfig: ExtensionFilterConfig = { include: [], exclude: [] };
		const autoMergeConfig: AutoMergeConfig = { enabled: false, strategy: "patch", mergeMethod: "squash" };

		const strategies: ("all" | "minor" | "patch")[] = ["all", "minor", "patch"];

		for (const strategy of strategies) {
			jest.clearAllMocks();

			await generateDryRunSummary(updates, false, strategy, filterConfig, autoMergeConfig);

			const tableCall = mockSummary.addTable.mock.calls[0][0];
			const strategyRow = tableCall.find((row: unknown[]) => {
				const firstCell = row[0] as { data: string; header: boolean };
				return firstCell.data === "Update Strategy";
			});
			expect(strategyRow[1]).toEqual({ data: strategy, header: false });
		}
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
