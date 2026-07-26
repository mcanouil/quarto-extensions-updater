import { jest } from "@jest/globals";
import type { Registry } from "@quarto-wizard/core";
import { createMockActionsCore } from "./__test-utils__/mockFactories.js";

jest.unstable_mockModule("@actions/core", createMockActionsCore);

jest.unstable_mockModule("@quarto-wizard/core", () => ({
	fetchRegistry: jest.fn<() => Promise<Registry>>(),
	getDefaultRegistryUrl: jest.fn(),
}));

const core = await import("@actions/core");
const { fetchRegistry: mockFetchRegistry } = await import("@quarto-wizard/core");
const { fetchExtensionsRegistry } = await import("../src/registry.js");
const { RegistryError } = await import("../src/errors.js");

describe("fetchExtensionsRegistry", () => {
	const mockRegistry: Registry = {
		"owner/extension": {
			id: "owner/extension",
			owner: "owner",
			name: "extension",
			fullName: "owner/extension",
			description: "Test extension",
			topics: ["quarto"],
			contributes: ["filters"],
			latestVersion: "1.0.0",
			latestTag: "v1.0.0",
			latestReleaseUrl: "https://github.com/owner/extension/releases/tag/v1.0.0",
			stars: 10,
			licence: "MIT",
			htmlUrl: "https://github.com/owner/extension",
			template: false,
			defaultBranchRef: "main",
			latestCommit: "abc123",
		},
	};

	beforeEach(() => {
		jest.clearAllMocks();
		(mockFetchRegistry as jest.Mock).mockReset();
	});

	it("should successfully fetch and parse registry", async () => {
		(mockFetchRegistry as jest.Mock).mockResolvedValue(mockRegistry);

		const result = await fetchExtensionsRegistry();

		expect(result).toEqual(mockRegistry);
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Fetching extensions registry from:"));
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Successfully fetched 1 extensions"));
	});

	it("should use custom registry URL when provided", async () => {
		const customUrl = "https://example.com/custom-registry.json";

		(mockFetchRegistry as jest.Mock).mockResolvedValue(mockRegistry);

		await fetchExtensionsRegistry(customUrl);

		expect(mockFetchRegistry).toHaveBeenCalledWith(
			expect.objectContaining({
				registryUrl: customUrl,
			}),
		);
	});

	it("should use default registry URL when not provided", async () => {
		(mockFetchRegistry as jest.Mock).mockResolvedValue(mockRegistry);

		await fetchExtensionsRegistry();

		expect(mockFetchRegistry).toHaveBeenCalledWith(
			expect.objectContaining({
				registryUrl: "https://m.canouil.dev/quarto-extensions/extensions.json",
			}),
		);
	});

	it("should throw RegistryError on fetch error", async () => {
		(mockFetchRegistry as jest.Mock).mockRejectedValue(new Error("Network error"));

		await expect(fetchExtensionsRegistry()).rejects.toThrow(RegistryError);
		await expect(fetchExtensionsRegistry()).rejects.toThrow("Failed to fetch registry");
	});

	it("should wrap unexpected errors in RegistryError", async () => {
		(mockFetchRegistry as jest.Mock).mockRejectedValue(new TypeError("Network error"));

		await expect(fetchExtensionsRegistry()).rejects.toThrow(RegistryError);
		await expect(fetchExtensionsRegistry()).rejects.toThrow("Failed to fetch registry");
	});

	it("should log errors to core.error", async () => {
		(mockFetchRegistry as jest.Mock).mockRejectedValue(new Error("Test error"));

		await expect(fetchExtensionsRegistry()).rejects.toThrow();
		expect(core.error).toHaveBeenCalled();
	});

	it("should pass forceRefresh option to core library", async () => {
		(mockFetchRegistry as jest.Mock).mockResolvedValue(mockRegistry);

		await fetchExtensionsRegistry();

		expect(mockFetchRegistry).toHaveBeenCalledWith(
			expect.objectContaining({
				forceRefresh: true,
			}),
		);
	});

	it("should pass timeout option to core library", async () => {
		(mockFetchRegistry as jest.Mock).mockResolvedValue(mockRegistry);

		await fetchExtensionsRegistry();

		expect(mockFetchRegistry).toHaveBeenCalledWith(
			expect.objectContaining({
				timeout: 30000,
			}),
		);
	});
});
