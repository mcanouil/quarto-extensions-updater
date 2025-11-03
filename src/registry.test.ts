import { fetchExtensionsRegistry } from "./registry";
import { RegistryError } from "./errors";
import * as core from "@actions/core";

// Mock @actions/core
jest.mock("@actions/core");

// Mock global fetch
global.fetch = jest.fn();

describe("fetchExtensionsRegistry", () => {
	const mockRegistry = {
		"owner/extension": {
			description: "Test extension",
			latestRelease: "1.0.0",
			latestReleaseUrl: "https://github.com/owner/extension/releases/tag/1.0.0",
			nameWithOwner: "owner/extension",
			owner: "owner",
			url: "https://github.com/owner/extension",
			defaultBranchRef: "main",
			name: "extension",
			repositoryTopics: ["quarto"],
		},
	};

	beforeEach(() => {
		jest.clearAllMocks();
		(global.fetch as jest.Mock).mockReset();
	});

	afterEach(() => {
		jest.clearAllTimers();
	});

	it("should successfully fetch and parse registry", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => mockRegistry,
		});

		const result = await fetchExtensionsRegistry();

		expect(result).toEqual(mockRegistry);
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Fetching extensions registry from:"));
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Successfully fetched 1 extensions"));
	});

	it("should use custom registry URL when provided", async () => {
		const customUrl = "https://example.com/custom-registry.json";

		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => mockRegistry,
		});

		await fetchExtensionsRegistry(customUrl);

		expect(global.fetch).toHaveBeenCalledWith(
			customUrl,
			expect.objectContaining({
				headers: expect.any(Object),
			}),
		);
	});

	it("should throw RegistryError on HTTP error", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: false,
			status: 404,
			statusText: "Not Found",
		});

		await expect(fetchExtensionsRegistry()).rejects.toThrow(RegistryError);
		await expect(fetchExtensionsRegistry()).rejects.toThrow("Failed to fetch registry: 404 Not Found");
	});

	it("should throw RegistryError on JSON parse error", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => {
				throw new Error("Invalid JSON");
			},
		});

		await expect(fetchExtensionsRegistry()).rejects.toThrow(RegistryError);
		await expect(fetchExtensionsRegistry()).rejects.toThrow("Failed to parse registry JSON");
	});

	it("should throw RegistryError when registry is not an object", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => null,
		});

		await expect(fetchExtensionsRegistry()).rejects.toThrow(RegistryError);
		await expect(fetchExtensionsRegistry()).rejects.toThrow("Registry response is not a valid object");
	});

	it("should throw RegistryError when registry is an array instead of object", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => [],
		});

		await expect(fetchExtensionsRegistry()).rejects.toThrow(RegistryError);
	});

	it("should handle timeout errors", async () => {
		const abortError = new Error("The operation was aborted");
		abortError.name = "AbortError";

		(global.fetch as jest.Mock).mockRejectedValue(abortError);

		await expect(fetchExtensionsRegistry()).rejects.toThrow(RegistryError);
		await expect(fetchExtensionsRegistry()).rejects.toThrow("Registry fetch timed out after 30 seconds");
	});

	it("should wrap unexpected errors in RegistryError", async () => {
		(global.fetch as jest.Mock).mockRejectedValue(new TypeError("Network error"));

		await expect(fetchExtensionsRegistry()).rejects.toThrow(RegistryError);
		await expect(fetchExtensionsRegistry()).rejects.toThrow("Unexpected error fetching registry");
	});

	it("should include correct headers in request", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => mockRegistry,
		});

		await fetchExtensionsRegistry();

		expect(global.fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				headers: {
					Accept: "application/json",
					"User-Agent": "quarto-extensions-updater",
				},
			}),
		);
	});

	it("should log errors to core.error", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: false,
			status: 500,
			statusText: "Internal Server Error",
		});

		await expect(fetchExtensionsRegistry()).rejects.toThrow();
		expect(core.error).toHaveBeenCalled();
	});
});
