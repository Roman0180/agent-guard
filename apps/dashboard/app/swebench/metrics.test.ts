import { describe, expect, it, vi } from "vitest";

import {
  dashboardDaemonUrlCandidates,
  dashboardDaemonUrls,
  dashboardEventsUrl,
  discoverDashboardDaemonUrls,
  fetchDashboardMetrics,
  resetDashboardMetrics,
  type DashboardMetrics
} from "./metrics";

const metrics: DashboardMetrics = {
  generatedAt: "2026-07-07T00:00:00.000Z",
  totals: {
    runCount: 0,
    defaultCostUsd: 0,
    sidecarCostUsd: 0,
    savingsUsd: 0,
    savingsPercent: 0,
    timingSampleCount: 0,
    qualityPreservedRuns: 0,
    qualityEvaluatedRuns: 0,
    qualityPreservationRate: 0
  },
  runs: []
};

describe("dashboard metrics client", () => {
  it("prefers the configured daemon URL and deduplicates local defaults", () => {
    expect(dashboardDaemonUrls(" http://127.0.0.1:7433/ ")).toEqual([
      "http://127.0.0.1:7433",
      "http://127.0.0.1:4319"
    ]);
  });

  it("discovers daemon URLs from the dashboard API route", async () => {
    const fetchMetrics = vi.fn(async () => new Response(JSON.stringify({
      daemonUrls: ["http://127.0.0.1:17454/", "bad-value", "http://127.0.0.1:7433"]
    }), { status: 200 }));

    await expect(discoverDashboardDaemonUrls(fetchMetrics)).resolves.toEqual([
      "http://127.0.0.1:17454/",
      "bad-value",
      "http://127.0.0.1:7433"
    ]);
    expect(fetchMetrics).toHaveBeenCalledWith("/api/agent-sidecar/daemon", { cache: "no-store" });
  });

  it("merges discovered daemon URLs before local defaults", async () => {
    const fetchMetrics = vi.fn(async () => new Response(JSON.stringify({
      daemonUrls: ["http://127.0.0.1:17454/", "http://127.0.0.1:7433"]
    }), { status: 200 }));

    await expect(dashboardDaemonUrlCandidates(fetchMetrics, "http://127.0.0.1:9000/")).resolves.toEqual([
      "http://127.0.0.1:9000",
      "http://127.0.0.1:17454",
      "http://127.0.0.1:7433",
      "http://127.0.0.1:4319"
    ]);
  });

  it("builds the daemon event stream URL", () => {
    expect(dashboardEventsUrl("http://127.0.0.1:7433/")).toBe("http://127.0.0.1:7433/api/dashboard/events");
  });

  it("falls back when a live daemon lacks the dashboard metrics route", async () => {
    const fetchMetrics = vi.fn(async (url: string) => {
      if (url.startsWith("http://127.0.0.1:4319")) {
        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
      }
      return new Response(JSON.stringify(metrics), { status: 200 });
    });

    const result = await fetchDashboardMetrics(fetchMetrics, ["http://127.0.0.1:4319", "http://127.0.0.1:7433/"]);

    expect(result.sourceUrl).toBe("http://127.0.0.1:7433");
    expect(result.metrics).toEqual(metrics);
    expect(fetchMetrics).toHaveBeenNthCalledWith(1, "http://127.0.0.1:4319/api/dashboard/metrics", { cache: "no-store" });
    expect(fetchMetrics).toHaveBeenNthCalledWith(2, "http://127.0.0.1:7433/api/dashboard/metrics", { cache: "no-store" });
  });

  it("reports every attempted daemon URL when metrics are unavailable", async () => {
    const fetchMetrics = vi.fn(async () => new Response(JSON.stringify({ error: "Not Found" }), { status: 404 }));

    await expect(fetchDashboardMetrics(fetchMetrics, ["http://127.0.0.1:4319", "http://127.0.0.1:7433"])).rejects.toThrow(
      "tried http://127.0.0.1:4319, http://127.0.0.1:7433"
    );
  });

  it("posts dashboard reset to the first daemon that supports it", async () => {
    const resetResult = {
      ok: true,
      sessionsRemoved: 1,
      swebenchRunsRemoved: 1,
      metrics
    };
    const fetchMetrics = vi.fn(async (url: string) => {
      if (url.startsWith("http://127.0.0.1:4319")) {
        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
      }
      return new Response(JSON.stringify(resetResult), { status: 200 });
    });

    const result = await resetDashboardMetrics(fetchMetrics, ["http://127.0.0.1:4319", "http://127.0.0.1:7433/"]);

    expect(result.sourceUrl).toBe("http://127.0.0.1:7433");
    expect(result.result).toEqual(resetResult);
    expect(fetchMetrics).toHaveBeenNthCalledWith(1, "http://127.0.0.1:4319/api/dashboard/reset", { method: "POST", cache: "no-store" });
    expect(fetchMetrics).toHaveBeenNthCalledWith(2, "http://127.0.0.1:7433/api/dashboard/reset", { method: "POST", cache: "no-store" });
  });
});
