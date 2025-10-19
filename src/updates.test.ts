import { checkForUpdates, groupUpdatesByType } from "./updates";
import { ExtensionRegistry, ExtensionUpdate } from "./types";
import * as extensions from "./extensions";

jest.mock("./extensions");

describe("checkForUpdates", () => {
	const mockRegistry: ExtensionRegistry = {
		"mcanouil/iconify": {
			createdAt: "2024-01-01T00:00:00Z",
			defaultBranchRef: "main",
			description: "Use Iconify icons in Quarto HTML documents",
			latestRelease: "1.1.1",
			latestReleaseUrl: "https://github.com/mcanouil/quarto-iconify/releases/tag/v1.1.1",
			licenseInfo: "MIT License",
			name: "iconify",
			nameWithOwner: "mcanouil/iconify",
			owner: "mcanouil",
			repositoryTopics: ["quarto", "iconify"],
			stargazerCount: 10,
			title: "Iconify",
			url: "https://github.com/mcanouil/quarto-iconify",
			author: "Mickaël Canouil",
			template: false,
			templateContent: null,
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
		expect(updates[0].latestVersion).toBe("1.1.1");
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
});

describe("groupUpdatesByType", () => {
	const createUpdate = (name: string, current: string, latest: string): ExtensionUpdate => ({
		name,
		owner: "owner",
		nameWithOwner: `owner/${name}`,
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
