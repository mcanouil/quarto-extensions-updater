/**
 * Base error class for quarto-extensions-updater errors
 */
export class QuartoExtensionUpdaterError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "QuartoExtensionUpdaterError";
		// Maintain proper prototype chain for instanceof checks
		Object.setPrototypeOf(this, QuartoExtensionUpdaterError.prototype);
	}
}

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends QuartoExtensionUpdaterError {
	constructor(
		message: string,
		public readonly field: string,
		public readonly value: unknown,
	) {
		super(message, "VALIDATION_ERROR", { field, value });
		this.name = "ValidationError";
		Object.setPrototypeOf(this, ValidationError.prototype);
	}
}

/**
 * Error thrown when registry operations fail
 */
export class RegistryError extends QuartoExtensionUpdaterError {
	constructor(
		message: string,
		public readonly url: string,
		public readonly statusCode?: number,
	) {
		super(message, "REGISTRY_ERROR", { url, statusCode });
		this.name = "RegistryError";
		Object.setPrototypeOf(this, RegistryError.prototype);
	}
}

/**
 * Error thrown when Git operations fail
 */
export class GitOperationError extends QuartoExtensionUpdaterError {
	constructor(
		message: string,
		public readonly operation: string,
		public readonly details?: string,
	) {
		super(message, "GIT_OPERATION_ERROR", { operation, details });
		this.name = "GitOperationError";
		Object.setPrototypeOf(this, GitOperationError.prototype);
	}
}

/**
 * Error thrown when GitHub API operations fail
 */
export class GitHubAPIError extends QuartoExtensionUpdaterError {
	constructor(
		message: string,
		public readonly operation: string,
		public readonly statusCode?: number,
	) {
		super(message, "GITHUB_API_ERROR", { operation, statusCode });
		this.name = "GitHubAPIError";
		Object.setPrototypeOf(this, GitHubAPIError.prototype);
	}
}

/**
 * Type guard to check if an error is a QuartoExtensionUpdaterError
 */
export function isQuartoError(error: unknown): error is QuartoExtensionUpdaterError {
	return error instanceof QuartoExtensionUpdaterError;
}

/**
 * Formats an error for logging, extracting useful information
 */
export function formatError(error: unknown): string {
	if (isQuartoError(error)) {
		const parts = [`[${error.code}] ${error.message}`];
		if (error.context && Object.keys(error.context).length > 0) {
			parts.push(`Context: ${JSON.stringify(error.context)}`);
		}
		return parts.join(" - ");
	}

	if (error instanceof Error) {
		return `${error.name}: ${error.message}`;
	}

	return String(error);
}
