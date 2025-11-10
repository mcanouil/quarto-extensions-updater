import {
	QuartoExtensionUpdaterError,
	ValidationError,
	RegistryError,
	GitOperationError,
	GitHubAPIError,
	isQuartoError,
	formatError,
} from "../src/errors";

describe("QuartoExtensionUpdaterError", () => {
	it("should create error with message and code", () => {
		const error = new QuartoExtensionUpdaterError("Test error", "TEST_CODE");

		expect(error.message).toBe("Test error");
		expect(error.code).toBe("TEST_CODE");
		expect(error.name).toBe("QuartoExtensionUpdaterError");
		expect(error instanceof Error).toBe(true);
	});

	it("should create error with context", () => {
		const context = { key: "value", number: 42 };
		const error = new QuartoExtensionUpdaterError("Test error", "TEST_CODE", context);

		expect(error.context).toEqual(context);
	});

	it("should be instanceof Error", () => {
		const error = new QuartoExtensionUpdaterError("Test", "CODE");
		expect(error instanceof Error).toBe(true);
		expect(error instanceof QuartoExtensionUpdaterError).toBe(true);
	});
});

describe("ValidationError", () => {
	it("should create validation error with field and value", () => {
		const error = new ValidationError("Invalid input", "test-field", "bad-value");

		expect(error.message).toBe("Invalid input");
		expect(error.code).toBe("VALIDATION_ERROR");
		expect(error.field).toBe("test-field");
		expect(error.value).toBe("bad-value");
		expect(error.name).toBe("ValidationError");
	});

	it("should include field and value in context", () => {
		const error = new ValidationError("Invalid", "field", 123);

		expect(error.context).toEqual({
			field: "field",
			value: 123,
		});
	});

	it("should be instanceof ValidationError and QuartoExtensionUpdaterError", () => {
		const error = new ValidationError("Test", "field", "value");

		expect(error instanceof ValidationError).toBe(true);
		expect(error instanceof QuartoExtensionUpdaterError).toBe(true);
		expect(error instanceof Error).toBe(true);
	});
});

describe("RegistryError", () => {
	it("should create registry error with URL", () => {
		const error = new RegistryError("Fetch failed", "https://example.com/registry.json");

		expect(error.message).toBe("Fetch failed");
		expect(error.code).toBe("REGISTRY_ERROR");
		expect(error.url).toBe("https://example.com/registry.json");
		expect(error.name).toBe("RegistryError");
	});

	it("should include status code when provided", () => {
		const error = new RegistryError("HTTP error", "https://example.com", 404);

		expect(error.statusCode).toBe(404);
		expect(error.context).toEqual({
			url: "https://example.com",
			statusCode: 404,
		});
	});

	it("should work without status code", () => {
		const error = new RegistryError("Error", "https://example.com");

		expect(error.statusCode).toBeUndefined();
		expect(error.context).toEqual({
			url: "https://example.com",
			statusCode: undefined,
		});
	});
});

describe("GitOperationError", () => {
	it("should create git operation error", () => {
		const error = new GitOperationError("Commit failed", "commit", "Merge conflict");

		expect(error.message).toBe("Commit failed");
		expect(error.code).toBe("GIT_OPERATION_ERROR");
		expect(error.operation).toBe("commit");
		expect(error.details).toBe("Merge conflict");
		expect(error.name).toBe("GitOperationError");
	});

	it("should work without details", () => {
		const error = new GitOperationError("Failed", "push");

		expect(error.details).toBeUndefined();
		expect(error.context).toEqual({
			operation: "push",
			details: undefined,
		});
	});
});

describe("GitHubAPIError", () => {
	it("should create GitHub API error", () => {
		const error = new GitHubAPIError("API request failed", "createPR", 422);

		expect(error.message).toBe("API request failed");
		expect(error.code).toBe("GITHUB_API_ERROR");
		expect(error.operation).toBe("createPR");
		expect(error.statusCode).toBe(422);
		expect(error.name).toBe("GitHubAPIError");
	});

	it("should work without status code", () => {
		const error = new GitHubAPIError("Network error", "fetchPR");

		expect(error.statusCode).toBeUndefined();
	});
});

describe("isQuartoError", () => {
	it("should return true for QuartoExtensionUpdaterError", () => {
		const error = new QuartoExtensionUpdaterError("Test", "CODE");
		expect(isQuartoError(error)).toBe(true);
	});

	it("should return true for ValidationError", () => {
		const error = new ValidationError("Test", "field", "value");
		expect(isQuartoError(error)).toBe(true);
	});

	it("should return true for RegistryError", () => {
		const error = new RegistryError("Test", "url");
		expect(isQuartoError(error)).toBe(true);
	});

	it("should return true for GitOperationError", () => {
		const error = new GitOperationError("Test", "operation");
		expect(isQuartoError(error)).toBe(true);
	});

	it("should return true for GitHubAPIError", () => {
		const error = new GitHubAPIError("Test", "operation");
		expect(isQuartoError(error)).toBe(true);
	});

	it("should return false for regular Error", () => {
		const error = new Error("Regular error");
		expect(isQuartoError(error)).toBe(false);
	});

	it("should return false for non-error objects", () => {
		expect(isQuartoError({})).toBe(false);
		expect(isQuartoError("string")).toBe(false);
		expect(isQuartoError(null)).toBe(false);
		expect(isQuartoError(undefined)).toBe(false);
	});
});

describe("formatError", () => {
	it("should format QuartoExtensionUpdaterError with context", () => {
		const error = new QuartoExtensionUpdaterError("Test error", "TEST_CODE", { key: "value" });
		const formatted = formatError(error);

		expect(formatted).toBe('[TEST_CODE] Test error - Context: {"key":"value"}');
	});

	it("should format QuartoExtensionUpdaterError without context", () => {
		const error = new QuartoExtensionUpdaterError("Test error", "TEST_CODE");
		const formatted = formatError(error);

		expect(formatted).toBe("[TEST_CODE] Test error");
	});

	it("should format ValidationError", () => {
		const error = new ValidationError("Invalid value", "test-field", "bad");
		const formatted = formatError(error);

		expect(formatted).toContain("[VALIDATION_ERROR]");
		expect(formatted).toContain("Invalid value");
		expect(formatted).toContain("test-field");
	});

	it("should format regular Error", () => {
		const error = new Error("Regular error");
		const formatted = formatError(error);

		expect(formatted).toBe("Error: Regular error");
	});

	it("should format TypeError", () => {
		const error = new TypeError("Type error");
		const formatted = formatError(error);

		expect(formatted).toBe("TypeError: Type error");
	});

	it("should format non-Error objects", () => {
		expect(formatError("string error")).toBe("string error");
		expect(formatError(42)).toBe("42");
		expect(formatError(null)).toBe("null");
		expect(formatError(undefined)).toBe("undefined");
	});

	it("should format object errors", () => {
		const error = { message: "Custom error" };
		const formatted = formatError(error);

		expect(formatted).toBe("[object Object]");
	});
});
