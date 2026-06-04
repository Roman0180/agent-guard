import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("demo narration audio route", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
  });

  it("requires an OpenAI API key before generating narration", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await GET(new Request("http://localhost/api/demo-narration?segment=0"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Set OPENAI_API_KEY to generate natural AI narration audio."
    });
  });

  it("generates natural narration audio with the OpenAI speech endpoint", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const audio = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(audio, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/demo-narration?segment=1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key"
        })
      })
    );
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const requestInit = firstCall?.[1];
    expect(requestInit).toBeDefined();
    const requestBody = JSON.parse(String(requestInit?.body));
    expect(requestBody).toMatchObject({
      model: "gpt-4o-mini-tts",
      voice: "marin",
      response_format: "mp3"
    });
    expect(requestBody.instructions).toContain("natural");
    await expect(response.arrayBuffer()).resolves.toHaveProperty("byteLength", 3);
  });
});
