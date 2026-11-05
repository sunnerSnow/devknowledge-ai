import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 用假的 SDK 測 Gemini provider 的重試、備用模型與預算邏輯（不打網路）。
 * 每個 script 項目描述一次 generateContent 的行為。
 */
type Step = { status: number } | { text: string } | { hang: true };
const script: Step[] = [];
const calls: { model: string; signal: AbortSignal }[] = [];

class FakeApiError extends Error {
  constructor(readonly status: number) {
    super(`status ${status}`);
    this.name = "ApiError";
  }
}

vi.mock("@google/genai", () => ({
  ThinkingLevel: { MINIMAL: "MINIMAL", LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" },
  GoogleGenAI: class {
    models = {
      generateContent: async (params: { model: string; config: { abortSignal: AbortSignal } }) => {
        calls.push({ model: params.model, signal: params.config.abortSignal });
        const step = script.shift();
        if (!step) throw new Error("script 用完了");
        if ("hang" in step) {
          await new Promise((_, reject) => params.config.abortSignal.addEventListener("abort", () => reject(new Error("aborted"))));
        }
        if ("status" in step) throw new FakeApiError(step.status);
        if ("text" in step) return { text: step.text, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 } };
        throw new Error("unreachable");
      },
    };
  },
}));

const { createGeminiProvider } = await import("@/lib/ai/providers/gemini");
const { AiUnavailableError } = await import("@/lib/ai/provider");

const request = { system: "s", user: "u", jsonSchema: {}, maxOutputTokens: 100, timeoutMs: 60_000 };
const provider = () => createGeminiProvider("key", "main-model", { fallbackModel: "fallback-model", backoffMs: 1 });

async function expectUnavailable(p: Promise<unknown>, status: number) {
  const error = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AiUnavailableError);
  expect((error as InstanceType<typeof AiUnavailableError>).status).toBe(status);
}

beforeEach(() => {
  script.length = 0;
  calls.length = 0;
});

describe("Gemini provider", () => {
  it("成功：回文字與實際模型", async () => {
    script.push({ text: "{}" });
    const r = await provider().generateStructured(request);
    expect(r).toMatchObject({ text: "{}", model: "main-model", inputTokens: 1, outputTokens: 2 });
    expect(calls.map((c) => c.model)).toEqual(["main-model"]);
  });

  it("503 一次後重試同一模型成功", async () => {
    script.push({ status: 503 }, { text: "{}" });
    const r = await provider().generateStructured(request);
    expect(r.model).toBe("main-model");
    expect(calls.map((c) => c.model)).toEqual(["main-model", "main-model"]);
  });

  it("503 兩次後換備用模型；結果回報備用模型", async () => {
    script.push({ status: 503 }, { status: 503 }, { text: "{}" });
    const r = await provider().generateStructured(request);
    expect(r.model).toBe("fallback-model");
    expect(calls.map((c) => c.model)).toEqual(["main-model", "main-model", "fallback-model"]);
  });

  it("429 不重試主模型，直接換備用模型", async () => {
    script.push({ status: 429 }, { text: "{}" });
    const r = await provider().generateStructured(request);
    expect(r.model).toBe("fallback-model");
    expect(calls.map((c) => c.model)).toEqual(["main-model", "fallback-model"]);
  });

  it("400／401／空回應 不重試也不換模型", async () => {
    script.push({ status: 400 });
    await expectUnavailable(provider().generateStructured(request), 503);
    expect(calls).toHaveLength(1);
    script.push({ status: 401 });
    await expectUnavailable(provider().generateStructured(request), 503);
    expect(calls).toHaveLength(2);
    script.push({ text: "" });
    await expectUnavailable(provider().generateStructured(request), 503);
    expect(calls).toHaveLength(3);
  });

  it("逾時：回 504、不重試、呼叫被中止", async () => {
    script.push({ hang: true });
    await expectUnavailable(provider().generateStructured({ ...request, timeoutMs: 30 }), 504);
    expect(calls).toHaveLength(1);
    expect(calls[0].signal.aborted).toBe(true);
  });

  it("剩餘預算不足就不重試：整段耗時不超過 timeoutMs", async () => {
    // 預算 10 秒 < 最低重試門檻 15 秒：第一次 503 後不再嘗試
    script.push({ status: 503 }, { text: "{}" });
    await expectUnavailable(provider().generateStructured({ ...request, timeoutMs: 10_000 }), 503);
    expect(calls).toHaveLength(1);
    // 429 同理：預算不足就不換備用模型
    calls.length = 0;
    script.length = 0;
    script.push({ status: 429 }, { text: "{}" });
    await expectUnavailable(provider().generateStructured({ ...request, timeoutMs: 10_000 }), 429);
    expect(calls).toHaveLength(1);
  });

  it("沒有備用模型時 503 兩次就回報", async () => {
    script.push({ status: 503 }, { status: 503 });
    const p = createGeminiProvider("key", "main-model", { fallbackModel: null, backoffMs: 1 });
    await expectUnavailable(p.generateStructured(request), 503);
    expect(calls).toHaveLength(2);
  });
});
