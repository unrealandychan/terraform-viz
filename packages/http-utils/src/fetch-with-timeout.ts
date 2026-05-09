/**
 * Wrapper around `fetch` that aborts the request after `timeoutMs` milliseconds.
 *
 * @throws {Error} with message "Request timed out after Xms" on abort
 */
export async function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}
