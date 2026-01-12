import * as core from "@actions/core";
import { fetchRegistry as coreFetchRegistry, type Registry } from "@quarto-wizard/core";
import { RegistryError } from "./errors";
import { DEFAULT_REGISTRY_URL, DEFAULT_FETCH_TIMEOUT_MS } from "./constants";

/**
 * Fetches the Quarto extensions registry using @quarto-wizard/core
 * @param registryUrl Optional custom registry URL
 * @returns The extension registry
 * @throws RegistryError if the fetch fails
 */
export async function fetchExtensionsRegistry(registryUrl?: string): Promise<Registry> {
	const url = registryUrl || DEFAULT_REGISTRY_URL;

	try {
		core.info(`Fetching extensions registry from: ${url}`);

		const registry = await coreFetchRegistry({
			registryUrl: url,
			forceRefresh: true,
			cacheDir: undefined,
			timeout: DEFAULT_FETCH_TIMEOUT_MS,
		});

		const extensionCount = Object.keys(registry).length;
		core.info(`Successfully fetched ${extensionCount} extensions from registry`);

		return registry;
	} catch (error) {
		const wrappedError = new RegistryError(`Failed to fetch registry: ${error}`, url);
		core.error(wrappedError.message);
		throw wrappedError;
	}
}
