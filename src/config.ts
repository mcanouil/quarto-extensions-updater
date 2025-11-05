import * as core from "@actions/core";
import {
	validateAutoMergeStrategy,
	validateMergeMethod,
	validateUpdateStrategy,
	validateRegistryUrl,
	validateBranchPrefix,
} from "./validation";
import {
	DEFAULT_BASE_BRANCH,
	DEFAULT_BRANCH_PREFIX,
	DEFAULT_PR_TITLE_PREFIX,
	DEFAULT_COMMIT_MESSAGE_PREFIX,
	DEFAULT_PR_LABELS,
	LABEL_SEPARATOR,
} from "./constants";
import type {
	AutoMergeConfig,
	AutoMergeStrategy,
	MergeMethod,
	ExtensionFilterConfig,
	UpdateStrategy,
	PRAssignmentConfig,
} from "./types";

/**
 * Application configuration parsed from GitHub Actions inputs
 */
export interface AppConfig {
	githubToken: string;
	workspacePath: string;
	registryUrl: string | undefined;
	createPR: boolean;
	baseBranch: string;
	branchPrefix: string;
	prTitlePrefix: string;
	commitMessagePrefix: string;
	prLabels: string[];
	autoMergeConfig: AutoMergeConfig;
	filterConfig: ExtensionFilterConfig;
	groupUpdates: boolean;
	updateStrategy: UpdateStrategy;
	dryRun: boolean;
	createIssue: boolean;
	assignmentConfig: PRAssignmentConfig;
}

/**
 * Parses a comma-separated string input into a filtered array
 * @param input Comma-separated string to parse
 * @returns Array of trimmed non-empty strings
 */
function parseCommaSeparatedInput(input: string): string[] {
	return input
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

/**
 * Parses all GitHub Actions inputs and returns validated configuration
 * @returns Validated application configuration object
 * @throws ValidationError if any input validation fails
 */
export function parseInputs(): AppConfig {
	// Required inputs
	const githubToken = core.getInput("github-token", { required: true });

	// Path and registry
	const workspacePath = core.getInput("workspace-path") || process.cwd();
	const registryUrl = core.getInput("registry-url") || undefined;

	// PR configuration
	const createPR = core.getBooleanInput("create-pr") !== false;
	const baseBranch = core.getInput("base-branch") || DEFAULT_BASE_BRANCH;
	const branchPrefix = core.getInput("branch-prefix") || DEFAULT_BRANCH_PREFIX;
	const prTitlePrefix = core.getInput("pr-title-prefix") || DEFAULT_PR_TITLE_PREFIX;
	const commitMessagePrefix = core.getInput("commit-message-prefix") || DEFAULT_COMMIT_MESSAGE_PREFIX;

	// PR labels
	const prLabelsInput = core.getInput("pr-labels") || DEFAULT_PR_LABELS.join(LABEL_SEPARATOR);
	const prLabels = parseCommaSeparatedInput(prLabelsInput);

	// Auto-merge configuration
	const autoMergeEnabled = core.getBooleanInput("auto-merge") === true;
	const autoMergeStrategyInput = core.getInput("auto-merge-strategy") || "patch";
	const autoMergeMethodInput = core.getInput("auto-merge-method") || "squash";

	// Validate auto-merge inputs
	validateAutoMergeStrategy(autoMergeStrategyInput);
	validateMergeMethod(autoMergeMethodInput);

	const autoMergeConfig: AutoMergeConfig = {
		enabled: autoMergeEnabled,
		strategy: autoMergeStrategyInput as AutoMergeStrategy,
		mergeMethod: autoMergeMethodInput as MergeMethod,
	};

	// Extension filtering
	const includeExtensionsInput = core.getInput("include-extensions") || "";
	const excludeExtensionsInput = core.getInput("exclude-extensions") || "";

	const filterConfig: ExtensionFilterConfig = {
		include: parseCommaSeparatedInput(includeExtensionsInput),
		exclude: parseCommaSeparatedInput(excludeExtensionsInput),
	};

	// Update configuration
	const groupUpdates = core.getBooleanInput("group-updates") === true;
	const updateStrategyInput = core.getInput("update-strategy") || "all";
	const dryRun = core.getBooleanInput("dry-run") === true;
	const createIssue = core.getBooleanInput("create-issue") === true;

	// Validate update strategy
	validateUpdateStrategy(updateStrategyInput);
	const updateStrategy = updateStrategyInput as UpdateStrategy;

	// PR assignment configuration
	const prReviewersInput = core.getInput("pr-reviewers") || "";
	const prTeamReviewersInput = core.getInput("pr-team-reviewers") || "";
	const prAssigneesInput = core.getInput("pr-assignees") || "";

	const assignmentConfig: PRAssignmentConfig = {
		reviewers: parseCommaSeparatedInput(prReviewersInput),
		teamReviewers: parseCommaSeparatedInput(prTeamReviewersInput),
		assignees: parseCommaSeparatedInput(prAssigneesInput),
	};

	// Validate configuration
	if (registryUrl) {
		validateRegistryUrl(registryUrl);
	}
	validateBranchPrefix(branchPrefix);

	return {
		githubToken,
		workspacePath,
		registryUrl,
		createPR,
		baseBranch,
		branchPrefix,
		prTitlePrefix,
		commitMessagePrefix,
		prLabels,
		autoMergeConfig,
		filterConfig,
		groupUpdates,
		updateStrategy,
		dryRun,
		createIssue,
		assignmentConfig,
	};
}
