import {
	validateMergeMethod,
	validateAutoMergeStrategy,
	validateUpdateStrategy,
	validateWorkspacePath,
	validateRegistryUrl,
	validateBranchPrefix,
	parseCommaSeparatedList,
} from "../src/validation";

describe("validateMergeMethod", () => {
	it("should accept valid merge methods", () => {
		expect(() => validateMergeMethod("merge")).not.toThrow();
		expect(() => validateMergeMethod("squash")).not.toThrow();
		expect(() => validateMergeMethod("rebase")).not.toThrow();
	});

	it("should reject invalid merge methods", () => {
		expect(() => validateMergeMethod("invalid")).toThrow("Invalid merge method: 'invalid'");
		expect(() => validateMergeMethod("")).toThrow("Invalid merge method: ''");
		expect(() => validateMergeMethod("MERGE")).toThrow("Invalid merge method: 'MERGE'");
	});
});

describe("validateAutoMergeStrategy", () => {
	it("should accept valid auto-merge strategies", () => {
		expect(() => validateAutoMergeStrategy("patch")).not.toThrow();
		expect(() => validateAutoMergeStrategy("minor")).not.toThrow();
		expect(() => validateAutoMergeStrategy("all")).not.toThrow();
	});

	it("should reject invalid auto-merge strategies", () => {
		expect(() => validateAutoMergeStrategy("invalid")).toThrow("Invalid auto-merge strategy: 'invalid'");
		expect(() => validateAutoMergeStrategy("major")).toThrow("Invalid auto-merge strategy: 'major'");
		expect(() => validateAutoMergeStrategy("")).toThrow("Invalid auto-merge strategy: ''");
	});
});

describe("validateUpdateStrategy", () => {
	it("should accept valid update strategies", () => {
		expect(() => validateUpdateStrategy("patch")).not.toThrow();
		expect(() => validateUpdateStrategy("minor")).not.toThrow();
		expect(() => validateUpdateStrategy("all")).not.toThrow();
	});

	it("should reject invalid update strategies", () => {
		expect(() => validateUpdateStrategy("invalid")).toThrow("Invalid update strategy: 'invalid'");
		expect(() => validateUpdateStrategy("major")).toThrow("Invalid update strategy: 'major'");
		expect(() => validateUpdateStrategy("")).toThrow("Invalid update strategy: ''");
	});
});

describe("validateWorkspacePath", () => {
	it("should accept valid workspace paths", () => {
		expect(() => validateWorkspacePath("/valid/path")).not.toThrow();
		expect(() => validateWorkspacePath("./relative/path")).not.toThrow();
		expect(() => validateWorkspacePath("C:\\Windows\\Path")).not.toThrow();
	});

	it("should reject empty workspace paths", () => {
		expect(() => validateWorkspacePath("")).toThrow("Workspace path cannot be empty");
		expect(() => validateWorkspacePath("   ")).toThrow("Workspace path cannot be empty");
	});
});

describe("validateRegistryUrl", () => {
	it("should accept valid HTTPS URLs", () => {
		expect(() => validateRegistryUrl("https://example.com/registry.json")).not.toThrow();
		expect(() => validateRegistryUrl("https://raw.githubusercontent.com/user/repo/branch/file.json")).not.toThrow();
	});

	it("should reject non-HTTPS URLs", () => {
		expect(() => validateRegistryUrl("http://example.com/registry.json")).toThrow("Registry URL must use HTTPS");
		expect(() => validateRegistryUrl("ftp://example.com/registry.json")).toThrow("Registry URL must use HTTPS");
	});

	it("should reject invalid URL formats", () => {
		expect(() => validateRegistryUrl("https://")).toThrow("Invalid registry URL format");
		expect(() => validateRegistryUrl("not-a-url")).toThrow("Registry URL must use HTTPS");
	});
});

describe("validateBranchPrefix", () => {
	it("should accept valid branch prefixes", () => {
		expect(() => validateBranchPrefix("feature/branch")).not.toThrow();
		expect(() => validateBranchPrefix("chore/updates")).not.toThrow();
		expect(() => validateBranchPrefix("fix-bug")).not.toThrow();
		expect(() => validateBranchPrefix("v1.0.0")).not.toThrow();
	});

	it("should reject branch prefixes with spaces", () => {
		expect(() => validateBranchPrefix("branch with spaces")).toThrow("Branch prefix cannot contain spaces");
	});

	it("should reject branch prefixes with double dots", () => {
		expect(() => validateBranchPrefix("branch..name")).toThrow("Branch prefix cannot contain '..'");
	});

	it("should reject branch prefixes with invalid Git characters", () => {
		expect(() => validateBranchPrefix("branch~name")).toThrow("Branch prefix contains invalid characters");
		expect(() => validateBranchPrefix("branch^name")).toThrow("Branch prefix contains invalid characters");
		expect(() => validateBranchPrefix("branch:name")).toThrow("Branch prefix contains invalid characters");
		expect(() => validateBranchPrefix("branch?name")).toThrow("Branch prefix contains invalid characters");
		expect(() => validateBranchPrefix("branch*name")).toThrow("Branch prefix contains invalid characters");
		expect(() => validateBranchPrefix("branch[name")).toThrow("Branch prefix contains invalid characters");
		expect(() => validateBranchPrefix("branch]name")).toThrow("Branch prefix contains invalid characters");
		expect(() => validateBranchPrefix("branch\\name")).toThrow("Branch prefix contains invalid characters");
	});
});

describe("parseCommaSeparatedList", () => {
	it("should parse valid comma-separated lists", () => {
		expect(parseCommaSeparatedList("item1,item2,item3")).toEqual(["item1", "item2", "item3"]);
		expect(parseCommaSeparatedList("single")).toEqual(["single"]);
	});

	it("should trim whitespace from items", () => {
		expect(parseCommaSeparatedList("item1 , item2 , item3")).toEqual(["item1", "item2", "item3"]);
		expect(parseCommaSeparatedList("  item1  ,  item2  ")).toEqual(["item1", "item2"]);
	});

	it("should return empty array for empty input", () => {
		expect(parseCommaSeparatedList("")).toEqual([]);
		expect(parseCommaSeparatedList("   ")).toEqual([]);
	});

	it("should filter out empty items after trimming", () => {
		expect(parseCommaSeparatedList("item1,,item2")).toEqual(["item1", "item2"]);
	});

	it("should filter out whitespace-only items", () => {
		expect(parseCommaSeparatedList("item1, ,item2")).toEqual(["item1", "item2"]);
	});
});
