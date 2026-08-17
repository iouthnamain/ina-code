import { type GeminiSettings, ProviderDriverKind } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";
import { normalizeModelSlug } from "@t3tools/shared/model";

import * as AcpSessionRuntime from "./AcpSessionRuntime.ts";

const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";
const GEMINI_OAUTH2_REFERRER_ENV = "GEMINI_OAUTH2_REFERRER";
const T3_CODE_OAUTH_REFERRER = "t3code";
const GEMINI_AUTH_METHOD_API_KEY = "gemini.api_key";
const GEMINI_AUTH_METHOD_CACHED_TOKEN = "agy-login";
const GEMINI_DRIVER_KIND = ProviderDriverKind.make("gemini");

type GeminiAcpRuntimeGeminiSettings = Pick<GeminiSettings, "binaryPath">;

interface GeminiAcpRuntimeInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "clientCapabilities" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly geminiSettings: GeminiAcpRuntimeGeminiSettings | null | undefined;
  readonly environment?: NodeJS.ProcessEnv;
}

export function buildGeminiAcpSpawnInput(
  geminiSettings: GeminiAcpRuntimeGeminiSettings | null | undefined,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
): AcpSessionRuntime.AcpSpawnInput {
  let command = geminiSettings?.binaryPath || "agy-acp";
  if (command === "agy" || command === "gemini") {
    command = "agy-acp";
  }
  return {
    command,
    args: [],
    cwd,
    env: {
      ...environment,
      [GEMINI_OAUTH2_REFERRER_ENV]: T3_CODE_OAUTH_REFERRER,
    },
  };
}

function resolveGeminiAuthMethodId(environment: NodeJS.ProcessEnv | undefined): string | undefined {
  // When a GEMINI_API_KEY is set, send an explicit `authenticate` with the
  // API-key auth method so agy-acp verifies it immediately.
  // Otherwise, skip the authenticate RPC entirely — agy-acp's session/new
  // handler checks auth internally via requireAuthenticated, and the
  // explicit authenticate call with the "agy-login" method redundantly
  // spawns `agy models` which hangs for ~15s on piped stdin.
  return environment?.[GEMINI_API_KEY_ENV]?.trim() ? GEMINI_AUTH_METHOD_API_KEY : undefined;
}

export const makeGeminiAcpRuntime = (
  input: GeminiAcpRuntimeInput,
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Crypto.Crypto | Scope.Scope
> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildGeminiAcpSpawnInput(input.geminiSettings, input.cwd, input.environment),
        authMethodId: resolveGeminiAuthMethodId(input.environment),
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    const runtime = yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
      Effect.provide(acpContext),
    );
    return runtime;
  });

export function resolveGeminiAcpBaseModelId(model: string | null | undefined): string {
  const trimmed = model?.trim();
  const base = trimmed && trimmed.length > 0 ? trimmed : "gemini-build";
  return normalizeModelSlug(base, GEMINI_DRIVER_KIND) ?? "gemini-build";
}

export function currentGeminiModelIdFromSessionSetup(
  sessionSetupResult:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
): string | undefined {
  return sessionSetupResult.models?.currentModelId?.trim() || undefined;
}

export function applyGeminiAcpModelSelection<E>(input: {
  readonly runtime: Pick<AcpSessionRuntime.AcpSessionRuntime["Service"], "setSessionModel">;
  readonly currentModelId: string | undefined;
  readonly requestedModelId: string | undefined;
  readonly mapError: (cause: EffectAcpErrors.AcpError) => E;
}): Effect.Effect<string | undefined, E> {
  const shouldSwitchModel =
    input.requestedModelId !== undefined && input.requestedModelId !== input.currentModelId;
  if (!shouldSwitchModel) {
    return Effect.succeed(input.currentModelId);
  }
  return input.runtime
    .setSessionModel(input.requestedModelId)
    .pipe(Effect.mapError(input.mapError), Effect.as(input.requestedModelId));
}
