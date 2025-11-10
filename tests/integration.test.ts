import * as path from "path";
import * as fs from "fs";
import { checkForUpdates } from "../src/updates";
import { fetchExtensionsRegistry } from "../src/registry";
import type { ExtensionRegistry } from "../src/types";

describe("Integration Tests - Real Quarto Extension", () => {
	const testDir = path.join(__dirname, "..", "test-workspace");
	const extensionPath = path.join(testDir, "_extensions", "mcanouil", "iconify", "_extension.yml");
	let registry: ExtensionRegistry;

	beforeAll(async () => {
		registry = await fetchExtensionsRegistry();

		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
		fs.mkdirSync(testDir, { recursive: true });

		const extensionDir = path.dirname(extensionPath);
		fs.mkdirSync(extensionDir, { recursive: true });

		const extensionContent = `name: iconify
version: 1.0.0
author: Mickaël Canouil
contributes:
  shortcodes:
    - iconify.lua
`;
		fs.writeFileSync(extensionPath, extensionContent);
	});

	afterAll(() => {
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("should NOT check extension without source field", () => {
		expect(fs.existsSync(extensionPath)).toBe(true);

		const manifest = fs.readFileSync(extensionPath, "utf-8");
		expect(manifest).not.toContain("source:");

		const updates = checkForUpdates(testDir, registry);

		expect(updates).toHaveLength(0);
	});

	it("should check extension WITH source field and find updates", () => {
		const sourceField = "\nsource: mcanouil/quarto-iconify@1.0.0\n";
		fs.appendFileSync(extensionPath, sourceField);

		const manifest = fs.readFileSync(extensionPath, "utf-8");
		expect(manifest).toContain("source: mcanouil/quarto-iconify@1.0.0");

		const updates = checkForUpdates(testDir, registry);

		expect(updates.length).toBeGreaterThan(0);

		const update = updates[0];
		expect(update).toBeDefined();
		if (update) {
			expect(update.nameWithOwner).toBe("mcanouil/iconify");
			expect(update.currentVersion).toBe("1.0.0");
			expect(update.latestVersion).toBeDefined();
			expect(update.latestVersion > "1.0.0").toBe(true);
		}
	});
});
