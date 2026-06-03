import { demoNarrationSegments } from "../../demoNarration";

export const runtime = "nodejs";

type AudioCache = Map<number, ArrayBuffer>;

const globalAudioCache = globalThis as typeof globalThis & {
  __agentSidecarDemoAudioCache?: AudioCache;
};

const audioCache = globalAudioCache.__agentSidecarDemoAudioCache ?? new Map<number, ArrayBuffer>();
globalAudioCache.__agentSidecarDemoAudioCache = audioCache;

const speechModel = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
const speechVoice = process.env.OPENAI_TTS_VOICE ?? "marin";
const speechInstructions =
  "Speak like a warm, confident product narrator. Keep the delivery natural, human, concise, and lightly energetic without sounding robotic.";

export async function GET(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "Set OPENAI_API_KEY to generate natural AI narration audio." },
      { status: 503 }
    );
  }

  const segmentParam = new URL(request.url).searchParams.get("segment") ?? "0";
  const segmentIndex = Number(segmentParam);
  const segment = Number.isInteger(segmentIndex) ? demoNarrationSegments[segmentIndex] : undefined;

  if (!segment) {
    return Response.json({ error: "Unknown narration segment." }, { status: 400 });
  }

  const cachedAudio = audioCache.get(segmentIndex);
  if (cachedAudio) {
    return new Response(cachedAudio.slice(0), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: speechModel,
      voice: speechVoice,
      input: segment[2],
      instructions: speechInstructions,
      response_format: "mp3",
      speed: 1
    })
  });

  if (!response.ok) {
    return Response.json(
      { error: "Unable to generate narration audio right now." },
      { status: response.status }
    );
  }

  const audio = await response.arrayBuffer();
  audioCache.set(segmentIndex, audio.slice(0));

  return new Response(audio, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
