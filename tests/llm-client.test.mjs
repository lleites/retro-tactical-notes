import assert from "node:assert/strict";
import test from "node:test";
import {
  LLM_ENDPOINT,
  LLM_MAX_TOKENS,
  LLM_MODEL,
  LLM_TEMPERATURE,
  LlmClientError,
  requestCompletion,
} from "../lib/llmClient.mjs";

const messages = [{ role: "user", content: "Summarize this note" }];

test("anonymous completion sends public configuration without authorization", async () => {
  let request;
  const content = await requestCompletion(messages, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ choices: [{ message: { content: "  Short summary.  " } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.equal(content, "Short summary.");
  assert.equal(request.url, LLM_ENDPOINT);
  assert.equal(request.options.method, "POST");
  assert.deepEqual(request.options.headers, { "Content-Type": "application/json" });
  assert.equal("Authorization" in request.options.headers, false);
  assert.deepEqual(JSON.parse(request.options.body), {
    model: LLM_MODEL,
    messages,
    max_tokens: LLM_MAX_TOKENS,
    temperature: LLM_TEMPERATURE,
  });
});

test("service errors expose their HTTP status", async () => {
  await assert.rejects(
    requestCompletion(messages, { fetchImpl: async () => new Response("Unavailable", { status: 503 }) }),
    (error) => error instanceof LlmClientError && error.code === "service" && error.status === 503,
  );
});

test("rate limits return a friendly retry message", async () => {
  await assert.rejects(
    requestCompletion(messages, { fetchImpl: async () => new Response("Limited", { status: 429, headers: { "Retry-After": "30" } }) }),
    (error) => error instanceof LlmClientError && error.code === "rate_limit" && error.status === 429 && error.retryAfter === "30" && /30 seconds/.test(error.message),
  );
});

test("network failures are normalized", async () => {
  await assert.rejects(
    requestCompletion(messages, { fetchImpl: async () => { throw new TypeError("Failed to fetch"); } }),
    (error) => error instanceof LlmClientError && error.code === "network",
  );
});
