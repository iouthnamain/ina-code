import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as EffectAcpErrors from "effect-acp/errors";

import {
  applyGeminiAcpModelSelection,
  buildGeminiAcpSpawnInput,
  resolveGeminiAcpBaseModelId,
} from "./GeminiAcpSupport.ts";

describe("resolveGeminiAcpBaseModelId", () => {
  it("normalizes empty and custom Gemini model ids", () => {
    expect(resolveGeminiAcpBaseModelId(undefined)).toBe("gemini-build");
    expect(resolveGeminiAcpBaseModelId("   ")).toBe("gemini-build");
    expect(resolveGeminiAcpBaseModelId("  gemini-test-custom-model  ")).toBe(
      "gemini-test-custom-model",
    );
  });
});

describe("buildGeminiAcpSpawnInput", () => {
  it("passes the T3 Code referrer through Gemini OAuth env", () => {
    const spawn = buildGeminiAcpSpawnInput({ binaryPath: "/usr/local/bin/agy" }, "/tmp/project", {
      GEMINI_API_KEY: "secret",
      GEMINI_OAUTH2_REFERRER: "other-client",
    });

    expect(spawn).toEqual({
      command: "/usr/local/bin/agy",
      args: ["agent", "stdio"],
      cwd: "/tmp/project",
      env: {
        GEMINI_API_KEY: "secret",
        GEMINI_OAUTH2_REFERRER: "t3code",
      },
    });
  });
});

describe("applyGeminiAcpModelSelection", () => {
  const makeRecordingRuntime = (failure?: EffectAcpErrors.AcpError) => {
    const modelCalls: Array<string> = [];
    const runtime = {
      setSessionModel: (modelId: string) =>
        Effect.gen(function* () {
          modelCalls.push(modelId);
          if (failure) return yield* failure;
          return {};
        }),
    };
    return { runtime, modelCalls };
  };

  it.effect("calls session/set_model when the requested model differs from current", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyGeminiAcpModelSelection({
        runtime,
        currentModelId: "gemini-build",
        requestedModelId: "gemini-mock-alt",
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual(["gemini-mock-alt"]);
      expect(result).toBe("gemini-mock-alt");
    }),
  );

  it.effect("skips set_model when requested matches current", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyGeminiAcpModelSelection({
        runtime,
        currentModelId: "gemini-build",
        requestedModelId: "gemini-build",
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual([]);
      expect(result).toBe("gemini-build");
    }),
  );

  it.effect("skips set_model when no model is requested", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyGeminiAcpModelSelection({
        runtime,
        currentModelId: "gemini-build",
        requestedModelId: undefined,
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual([]);
      expect(result).toBe("gemini-build");
    }),
  );

  it.effect("propagates session/set_model failures via mapError", () =>
    Effect.gen(function* () {
      const failure = EffectAcpErrors.AcpRequestError.invalidParams("session id not known");
      const { runtime } = makeRecordingRuntime(failure);
      const error = yield* Effect.flip(
        applyGeminiAcpModelSelection({
          runtime,
          currentModelId: "gemini-build",
          requestedModelId: "gemini-mock-alt",
          mapError: (cause) => cause.message,
        }),
      );
      expect(error).toBe(failure.message);
    }),
  );
});
