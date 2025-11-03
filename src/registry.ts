import * as core from "@actions/core";
import type { ExtensionRegistry } from "./types";
import { RegistryError } from "./errors";
import { DEFAULT_REGISTRY_URL, DEFAULT_FETCH_TIMEOUT_MS, HTTP_HEADER_ACCEPT_JSON, HTTP_USER_AGENT } from "./constants";

/**
 * Fetches the Quarto extensions registry from GitHub with timeout
 * @param registryUrl Optional custom registry URL
 * @returns The extension registry
 * @throws RegistryError if the fetch fails
 */
export async function fetchExtensionsRegistry(registryUrl?: string): Promise<ExtensionRegistry> {
	const url = registryUrl || DEFAULT_REGISTRY_URL;

	try {
		core.info(`Fetching extensions registry from: ${url}`);

		// Create an AbortController for timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);

		const response = await fetch(url, {
			headers: {
				Accept: HTTP_HEADER_ACCEPT_JSON,
				"User-Agent": HTTP_USER_AGENT,
			},
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			throw new RegistryError(
				`Failed to fetch registry: ${response.status} ${response.statusText}`,
				url,
				response.status,
			);
		}

		let registry: ExtensionRegistry;
		try {
			registry = (await response.json()) as ExtensionRegistry;
		} catch (parseError) {
			throw new RegistryError(`Failed to parse registry JSON: ${parseError}`, url);
		}

		// Validate registry structure (must be an object, not an array or null)
		if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
			throw new RegistryError("Registry response is not a valid object", url);
		}

		const extensionCount = Object.keys(registry).length;
		core.info(`Successfully fetched ${extensionCount} extensions from registry`);

		return registry;
	} catch (error) {
		// Handle timeout errors
		if (error instanceof Error && error.name === "AbortError") {
			const timeoutError = new RegistryError(
				`Registry fetch timed out after ${DEFAULT_FETCH_TIMEOUT_MS / 1000} seconds`,
				url,
			);
			core.error(timeoutError.message);
			throw timeoutError;
		}

		// Re-throw RegistryError as-is
		if (error instanceof RegistryError) {
			core.error(error.message);
			throw error;
		}

		// Wrap other errors
		const wrappedError = new RegistryError(`Unexpected error fetching registry: ${error}`, url);
		core.error(wrappedError.message);
		throw wrappedError;
	}
}
