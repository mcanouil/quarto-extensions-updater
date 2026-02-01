import { checkForUpdates, groupUpdatesByType } from "../src/updates";
import type { Registry } from "@quarto-wizard/core";
import type { ExtensionUpdate, ExtensionFilterConfig } from "../src/types";
import * as extensions from "../src/extensions";

jest.mock("../src/extensions");

describe("checkForUpdates", () => {
	const mockRegistry: Registry = {
		"mcanouil/iconify": {
			id: "mcanouil/iconify",
			owner: "mcanouil",
			name: "iconify",
			fullName: "mcanouil/iconify",
			description: "Use Iconify icons in Quarto HTML documents",
			topics: ["quarto", "iconify"],
			contributes: ["shortcodes"],
			latestVersion: "1.1.1",
			latestTag: "v1.1.1",
			latestReleaseUrl: "https://github.com/mcanouil/quarto-iconify/releases/tag/v1.1.1",
			stars: 10,
			licence: "MIT License",
			htmlUrl: "https://github.com/mcanouil/quarto-iconify",
			template: false,
			defaultBranchRef: "main",
			latestCommit: "abc123",
		},
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should skip extension without source field", () => {
		const mockManifests = ["/workspace/_extensions/mcanouil/iconify/_extension.yml"];

		(extensions.findExtensionManifests as jest.Mock).mockReturnValue(mockManifests);
		(extensions.readExtensionManifest as jest.Mock).mockReturnValue({
			version: "1.0.0",
			source: undefined,
		});
		(extensions.extractExtensionInfo as jest.Mock).mockReturnValue({
			owner: "mcanouil",
			name: "iconify",
		});

		const updates = checkForUpdates("/workspace", mockRegistry);

		expect(updates).toHaveLength(0);
	});

	it("should detect updates for extension with source field", () => {
		const mockManifests = ["/workspace/_extensions/mcanouil/iconify/_extension.yml"];

		(extensions.findExtensionManifests as jest.Mock).mockReturnValue(mockManifests);
		(extensions.readExtensionManifest as jest.Mock).mockReturnValue({
			version: "1.0.0",
			source: "mcanouil/quarto-iconify@1.0.0",
			repository: "https://github.com/mcanouil/quarto-iconify",
		});
		(extensions.extractExtensionInfo as jest.Mock).mockReturnValue({
			owner: "mcanouil",
			name: "iconify",
		});

		const updates = checkForUpdates("/workspace", mockRegistry);

		expect(updates).toHaveLength(1);
		expect(updates[0].nameWithOwner).toBe("mcanouil/iconify");
		expect(updates[0].currentVersion).toBe("1.0.0");
		expect(updates[0].latestVersion).toBe("v1.1.1");
	});

	it("should skip extension without version", () => {
		const mockManifests = ["/workspace/_extensions/mcanouil/iconify/_extension.yml"];

		(extensions.findExtensionManifests as jest.Mock).mockReturnValue(mockManifests);
		(extensions.readExtensionManifest as jest.Mock).mockReturnValue({
			version: undefined,
			source: "mcanouil/quarto-iconify@1.0.0",
		});
		(extensions.extractExtensionInfo as jest.Mock).mockReturnValue({
			owner: "mcanouil",
			name: "iconify",
		});

		const updates = checkForUpdates("/workspace", mockRegistry);

		expect(updates).toHaveLength(0);
	});

	it("should skip extension not in registry", () => {
		const mockManifests = ["/workspace/_extensions/unknown/extension/_extension.yml"];

		(extensions.findExtensionManifests as jest.Mock).mockReturnValue(mockManifests);
		(extensions.readExtensionManifest as jest.Mock).mockReturnValue({
			version: "1.0.0",
			source: "unknown/extension@v1.0.0",
		});
		(extensions.extractExtensionInfo as jest.Mock).mockReturnValue({
			owner: "unknown",
			name: "extension",
		});

		const updates = checkForUpdates("/workspace", mockRegistry);

		expect(updates).toHaveLength(0);
	});

	it("should handle version with v prefix", () => {
		const mockManifests = ["/workspace/_extensions/mcanouil/iconify/_extension.yml"];

		(extensions.findExtensionManifests as jest.Mock).mockReturnValue(mockManifests);
		(extensions.readExtensionManifest as jest.Mock).mockReturnValue({
			version: "v1.0.0",
			source: "mcanouil/quarto-iconify@1.0.0",
			repository: "https://github.com/mcanouil/quarto-iconify",
		});
		(extensions.extractExtensionInfo as jest.Mock).mockReturnValue({
			owner: "mcanouil",
			name: "iconify",
		});

		const updates = checkForUpdates("/workspace", mockRegistry);

		expect(updates).toHaveLength(1);
		expect(updates[0].currentVersion).toBe("v1.0.0");
	});

	describe("filtering", () => {
		const mockRegistryMultiple: Registry = {
			"mcanouil/iconify": {
				id: "mcanouil/iconify",
				owner: "mcanouil",
				name: "iconify",
				fullName: "mcanouil/iconify",
				description: "Use Iconify icons in Quarto HTML documents",
				topics: ["quarto", "iconify"],
				contributes: ["shortcodes"],
				latestVersion: "1.1.1",
				latestTag: "v1.1.1",
				latestReleaseUrl: "https://github.com/mcanouil/quarto-iconify/releases/tag/v1.1.1",
				stars: 10,
				licence: "MIT License",
				htmlUrl: "https://github.com/mcanouil/quarto-iconify",
				template: false,
				defaultBranchRef: "main",
				latestCommit: "abc123",
			},
			"quarto-ext/lightbox": {
				id: "quarto-ext/lightbox",
				owner: "quarto-ext",
				name: "lightbox",
				fullName: "quarto-ext/lightbox",
				description: "Lightbox for Quarto",
				topics: ["quarto"],
				contributes: ["shortcodes"],
				latestVersion: "2.0.0",
				latestTag: "v2.0.0",
				latestReleaseUrl: "https://github.com/quarto-ext/lightbox/releases/tag/v2.0.0",
				stars: 50,
				licence: "MIT License",
				htmlUrl: "https://github.com/quarto-ext/lightbox",
				template: false,
				defaultBranchRef: "main",
				latestCommit: "def456",
			},
			"quarto-ext/fancy-text": {
				id: "quarto-ext/fancy-text",
				owner: "quarto-ext",
				name: "fancy-text",
				fullName: "quarto-ext/fancy-text",
				description: "Fancy text for Quarto",
				topics: ["quarto"],
				contributes: ["shortcodes"],
				latestVersion: "1.5.0",
				latestTag: "v1.5.0",
				latestReleaseUrl: "https://github.com/quarto-ext/fancy-text/releases/tag/v1.5.0",
				stars: 30,
				licence: "MIT License",
				htmlUrl: "https://github.com/quarto-ext/fancy-text",
				template: false,
				defaultBranchRef: "main",
				latestCommit: "ghi789",
			},
		};

		beforeEach(() => {
			const mockManifests = [
				"/workspace/_extensions/mcanouil/iconify/_extension.yml",
				"/workspace/_extensions/quarto-ext/lightbox/_extension.yml",
				"/workspace/_extensions/quarto-ext/fancy-text/_extension.yml",
			];

			(extensions.findExtensionManifests as jest.Mock).mockReturnValue(mockManifests);
			(extensions.readExtensionManifest as jest.Mock).mockImplementation((path: string) => {
				if (path.includes("iconify")) {
					return {
						version: "1.0.0",
						source: "mcanouil/quarto-iconify@1.0.0",
						repository: "https://github.com/mcanouil/quarto-iconify",
					};
				} else if (path.includes("lightbox")) {
					return {
						version: "1.0.0",
						source: "quarto-ext/lightbox@1.0.0",
						repository: "https://github.com/quarto-ext/lightbox",
					};
				} else if (path.includes("fancy-text")) {
					return {
						version: "1.0.0",
						source: "quarto-ext/fancy-text@1.0.0",
						repository: "https://github.com/quarto-ext/fancy-text",
					};
				}
				return null;
			});
			(extensions.extractExtensionInfo as jest.Mock).mockImplementation((path: string) => {
				if (path.includes("iconify")) {
					return { owner: "mcanouil", name: "iconify" };
				} else if (path.includes("lightbox")) {
					return { owner: "quarto-ext", name: "lightbox" };
				} else if (path.includes("fancy-text")) {
					return { owner: "quarto-ext", name: "fancy-text" };
				}
				return null;
			});
		});

		it("should include only specified extensions when include filter is used", () => {
			const filterConfig: ExtensionFilterConfig = {
				include: ["mcanouil/iconify", "quarto-ext/lightbox"],
				exclude: [],
			};

			const updates = checkForUpdates("/workspace", mockRegistryMultiple, filterConfig);

			expect(updates).toHaveLength(2);
			expect(updates.map((u) => u.nameWithOwner)).toContain("mcanouil/iconify");
			expect(updates.map((u) => u.nameWithOwner)).toContain("quarto-ext/lightbox");
			expect(updates.map((u) => u.nameWithOwner)).not.toContain("quarto-ext/fancy-text");
		});

		it("should exclude specified extensions when exclude filter is used", () => {
			const filterConfig: ExtensionFilterConfig = {
				include: [],
				exclude: ["quarto-ext/fancy-text"],
			};

			const updates = checkForUpdates("/workspace", mockRegistryMultiple, filterConfig);

			expect(updates).toHaveLength(2);
			expect(updates.map((u) => u.nameWithOwner)).toContain("mcanouil/iconify");
			expect(updates.map((u) => u.nameWithOwner)).toContain("quarto-ext/lightbox");
			expect(updates.map((u) => u.nameWithOwner)).not.toContain("quarto-ext/fancy-text");
		});

		it("should handle both include and exclude filters (exclude takes precedence)", () => {
			const filterConfig: ExtensionFilterConfig = {
				include: ["mcanouil/iconify", "quarto-ext/lightbox"],
				exclude: ["quarto-ext/lightbox"],
			};

			const updates = checkForUpdates("/workspace", mockRegistryMultiple, filterConfig);

			expect(updates).toHaveLength(1);
			expect(updates[0].nameWithOwner).toBe("mcanouil/iconify");
		});

		it("should return all updates when filter config is not provided", () => {
			const updates = checkForUpdates("/workspace", mockRegistryMultiple);

			expect(updates).toHaveLength(3);
		});

		it("should return all updates when filter config has empty arrays", () => {
			const filterConfig: ExtensionFilterConfig = {
				include: [],
				exclude: [],
			};

			const updates = checkForUpdates("/workspace", mockRegistryMultiple, filterConfig);

			expect(updates).toHaveLength(3);
		});

		it("should return no updates when include filter matches no extensions", () => {
			const filterConfig: ExtensionFilterConfig = {
				include: ["nonexistent/extension"],
				exclude: [],
			};

			const updates = checkForUpdates("/workspace", mockRegistryMultiple, filterConfig);

			expect(updates).toHaveLength(0);
		});

		it("should exclude all extensions when all are in exclude list", () => {
			const filterConfig: ExtensionFilterConfig = {
				include: [],
				exclude: ["mcanouil/iconify", "quarto-ext/lightbox", "quarto-ext/fancy-text"],
			};

			const updates = checkForUpdates("/workspace", mockRegistryMultiple, filterConfig);

			expect(updates).toHaveLength(0);
		});
	});

	describe("update strategy", () => {
		const mockRegistryForStrategy: Registry = {
			"owner/patch-update": {
				id: "owner/patch-update",
				owner: "owner",
				name: "patch-update",
				fullName: "owner/patch-update",
				description: "Patch update",
				topics: ["quarto"],
				contributes: ["filters"],
				latestVersion: "1.0.1",
				latestTag: "v1.0.1",
				latestReleaseUrl: "https://github.com/owner/patch-update/releases/tag/v1.0.1",
				stars: 10,
				licence: "MIT License",
				htmlUrl: "https://github.com/owner/patch-update",
				template: false,
				defaultBranchRef: "main",
				latestCommit: "abc123",
			},
			"owner/minor-update": {
				id: "owner/minor-update",
				owner: "owner",
				name: "minor-update",
				fullName: "owner/minor-update",
				description: "Minor update",
				topics: ["quarto"],
				contributes: ["filters"],
				latestVersion: "1.1.0",
				latestTag: "v1.1.0",
				latestReleaseUrl: "https://github.com/owner/minor-update/releases/tag/v1.1.0",
				stars: 10,
				licence: "MIT License",
				htmlUrl: "https://github.com/owner/minor-update",
				template: false,
				defaultBranchRef: "main",
				latestCommit: "def456",
			},
			"owner/major-update": {
				id: "owner/major-update",
				owner: "owner",
				name: "major-update",
				fullName: "owner/major-update",
				description: "Major update",
				topics: ["quarto"],
				contributes: ["filters"],
				latestVersion: "2.0.0",
				latestTag: "v2.0.0",
				latestReleaseUrl: "https://github.com/owner/major-update/releases/tag/v2.0.0",
				stars: 10,
				licence: "MIT License",
				htmlUrl: "https://github.com/owner/major-update",
				template: false,
				defaultBranchRef: "main",
				latestCommit: "ghi789",
			},
		};

		beforeEach(() => {
			const mockManifests = [
				"/workspace/_extensions/owner/patch-update/_extension.yml",
				"/workspace/_extensions/owner/minor-update/_extension.yml",
				"/workspace/_extensions/owner/major-update/_extension.yml",
			];

			(extensions.findExtensionManifests as jest.Mock).mockReturnValue(mockManifests);
			(extensions.readExtensionManifest as jest.Mock).mockImplementation((path: string) => {
				if (path.includes("patch-update")) {
					return {
						version: "1.0.0",
						source: "owner/patch-update@1.0.0",
						repository: "https://github.com/owner/patch-update",
					};
				} else if (path.includes("minor-update")) {
					return {
						version: "1.0.0",
						source: "owner/minor-update@1.0.0",
						repository: "https://github.com/owner/minor-update",
					};
				} else if (path.includes("major-update")) {
					return {
						version: "1.0.0",
						source: "owner/major-update@1.0.0",
						repository: "https://github.com/owner/major-update",
					};
				}
				return null;
			});
			(extensions.extractExtensionInfo as jest.Mock).mockImplementation((path: string) => {
				if (path.includes("patch-update")) {
					return { owner: "owner", name: "patch-update" };
				} else if (path.includes("minor-update")) {
					return { owner: "owner", name: "minor-update" };
				} else if (path.includes("major-update")) {
					return { owner: "owner", name: "major-update" };
				}
				return null;
			});
		});

		it("should return all updates when strategy is 'all'", () => {
			const updates = checkForUpdates("/workspace", mockRegistryForStrategy, undefined, "all");

			expect(updates).toHaveLength(3);
			expect(updates.map((u) => u.nameWithOwner)).toContain("owner/patch-update");
			expect(updates.map((u) => u.nameWithOwner)).toContain("owner/minor-update");
			expect(updates.map((u) => u.nameWithOwner)).toContain("owner/major-update");
		});

		it("should return only patch and minor updates when strategy is 'minor'", () => {
			const updates = checkForUpdates("/workspace", mockRegistryForStrategy, undefined, "minor");

			expect(updates).toHaveLength(2);
			expect(updates.map((u) => u.nameWithOwner)).toContain("owner/patch-update");
			expect(updates.map((u) => u.nameWithOwner)).toContain("owner/minor-update");
			expect(updates.map((u) => u.nameWithOwner)).not.toContain("owner/major-update");
		});

		it("should return only patch updates when strategy is 'patch'", () => {
			const updates = checkForUpdates("/workspace", mockRegistryForStrategy, undefined, "patch");

			expect(updates).toHaveLength(1);
			expect(updates[0].nameWithOwner).toBe("owner/patch-update");
		});

		it("should default to 'all' strategy when not specified", () => {
			const updates = checkForUpdates("/workspace", mockRegistryForStrategy);

			expect(updates).toHaveLength(3);
		});
	});
});

describe("groupUpdatesByType", () => {
	const createUpdate = (name: string, current: string, latest: string): ExtensionUpdate => ({
		name,
		owner: "owner",
		nameWithOwner: `owner/${name}`,
		repositoryName: `owner/${name}`,
		currentVersion: current,
		latestVersion: latest,
		manifestPath: `/path/to/${name}/_extension.yml`,
		url: `https://github.com/owner/${name}`,
		releaseUrl: `https://github.com/owner/${name}/releases/tag/${latest}`,
		description: `Test extension ${name}`,
	});

	it("should group updates by type", () => {
		const updates = [
			createUpdate("ext1", "1.0.0", "2.0.0"),
			createUpdate("ext2", "1.5.0", "1.6.0"),
			createUpdate("ext3", "1.0.1", "1.0.2"),
		];

		const grouped = groupUpdatesByType(updates);

		expect(grouped.major).toHaveLength(1);
		expect(grouped.major[0].name).toBe("ext1");
		expect(grouped.minor).toHaveLength(1);
		expect(grouped.minor[0].name).toBe("ext2");
		expect(grouped.patch).toHaveLength(1);
		expect(grouped.patch[0].name).toBe("ext3");
	});

	it("should handle empty array", () => {
		const grouped = groupUpdatesByType([]);

		expect(grouped.major).toHaveLength(0);
		expect(grouped.minor).toHaveLength(0);
		expect(grouped.patch).toHaveLength(0);
	});

	it("should handle version with v prefix", () => {
		const updates = [createUpdate("ext1", "v1.0.0", "v2.0.0")];

		const grouped = groupUpdatesByType(updates);

		expect(grouped.major).toHaveLength(1);
	});
});
