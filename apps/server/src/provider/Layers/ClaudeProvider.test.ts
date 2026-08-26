import { assert, it } from "@effect/vitest";
import type { ProviderOptionDescriptor } from "@t3tools/contracts";

import {
  getClaudeModelCapabilities,
  normalizeClaudeCliEffort,
  resolveClaudeEffort,
} from "./ClaudeProvider.ts";

const LOCAL_GPT_MODELS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];

it("exposes Claude effort controls for every local GPT 5.6 model", () => {
  const efforts = LOCAL_GPT_MODELS.map((model) =>
    (getClaudeModelCapabilities(model).optionDescriptors ?? []).find(
      (descriptor) => descriptor.id === "effort",
    ),
  );

  const expectedEffort = {
    id: "effort",
    label: "Reasoning",
    type: "select",
    options: [
      { id: "low", label: "Low" },
      { id: "medium", label: "Medium" },
      { id: "high", label: "High", isDefault: true },
      { id: "xhigh", label: "Extra High" },
      { id: "max", label: "Max" },
      {
        id: "ultracode",
        label: "Ultracode",
        description: "xhigh effort plus multi-agent workflow orchestration",
      },
      { id: "ultrathink", label: "Ultrathink" },
    ],
    currentValue: "high",
    promptInjectedValues: ["ultrathink"],
  } satisfies ProviderOptionDescriptor;
  assert.deepStrictEqual(
    efforts,
    LOCAL_GPT_MODELS.map(() => expectedEffort),
  );
});

it("resolves every local GPT effort and leaves arbitrary custom models empty", () => {
  for (const model of LOCAL_GPT_MODELS) {
    const capabilities = getClaudeModelCapabilities(model);

    assert.deepStrictEqual(
      ["low", "medium", "high", "xhigh", "max", "ultracode", "ultrathink"].map((effort) =>
        resolveClaudeEffort(capabilities, effort),
      ),
      ["low", "medium", "high", "xhigh", "max", "ultracode", "high"],
    );
    assert.deepStrictEqual(
      ["xhigh", "ultracode"].map((effort) => normalizeClaudeCliEffort(effort, model)),
      ["xhigh", "xhigh"],
    );
  }
  assert.deepStrictEqual(getClaudeModelCapabilities("custom-model").optionDescriptors ?? [], []);
});
