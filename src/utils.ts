/**
 * Utility functions for the application
 */

/**
 * Delays execution for a specified number of milliseconds
 * @param ms Number of milliseconds to wait
 * @returns Promise that resolves after the delay
 */
export async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
