import type { WorkerEnv } from "../alchemy.run.ts";

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/")) {
      const backendUrl = new URL(env.API_ORIGIN);
      if (
        (backendUrl.protocol !== "https:" && backendUrl.protocol !== "http:") ||
        backendUrl.pathname !== "/" ||
        backendUrl.search ||
        backendUrl.hash ||
        backendUrl.username ||
        backendUrl.password
      ) {
        throw new Error("API_ORIGIN must be an HTTP(S) origin without a path.");
      }

      const targetUrl = new URL(
        `${requestUrl.pathname}${requestUrl.search}`,
        backendUrl.origin,
      );
      return fetch(new Request(targetUrl, request));
    }

    return env.ASSETS.fetch(request);
  },
};
