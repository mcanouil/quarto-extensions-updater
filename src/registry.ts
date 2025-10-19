import * as core from "@actions/core";
import { ExtensionRegistry } from "./types";

const EXTENSIONS_REGISTRY_URL =
	"https://raw.githubusercontent.com/mcanouil/quarto-extensions/refs/heads/quarto-wizard/quarto-extensions.json";

/**
 * Fetches the Quarto extensions registry from GitHub
 * @param registryUrl Optional custom registry URL
 * @returns The extension registry
 */
export async function fetchExtensionsRegistry(registryUrl?: string): Promise<ExtensionRegistry> {
	const url = registryUrl || EXTENSIONS_REGISTRY_URL;

	try {
		core.info(`Fetching extensions registry from: ${url}`);

		const response = await fetch(url, {
			headers: {
				Accept: "application/json",
				"User-Agent": "quarto-extensions-updater",
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch registry: ${response.status} ${response.statusText}`);
		}

		const registry = (await response.json()) as ExtensionRegistry;

		const extensionCount = Object.keys(registry).length;
		core.info(`Successfully fetched ${extensionCount} extensions from registry`);

		return registry;
	} catch (error) {
		core.error(`Error fetching extensions registry: ${error}`);
		throw error;
	}
}
