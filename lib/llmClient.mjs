export const LLM_ENDPOINT = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions";
export const LLM_MODEL = "gpt-oss-20b";
export const LLM_MAX_TOKENS = 400;
export const LLM_TEMPERATURE = 0.2;

export class LlmClientError extends Error {
  constructor(message, { code = "unknown", status = null, retryAfter = null, cause } = {}) {
    super(message, { cause });
    this.name = "LlmClientError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function responseMessage(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new LlmClientError("The AI endpoint returned an empty response.", { code: "invalid_response" });
  }
  return content.trim();
}

export async function requestCompletion(messages, {
  fetchImpl = globalThis.fetch,
  maxTokens = LLM_MAX_TOKENS,
  temperature = LLM_TEMPERATURE,
  signal,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new LlmClientError("Browser fetch is unavailable.", { code: "network" });
  }

  let response;
  try {
    response = await fetchImpl(LLM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: LLM_MODEL, messages, max_tokens: maxTokens, temperature }),
      signal,
    });
  } catch (cause) {
    if (cause?.name === "AbortError") throw cause;
    throw new LlmClientError("Could not reach the AI endpoint. Check your connection and try again.", { code: "network", cause });
  }

  if (response.status === 429) {
    const retryAfter = response.headers?.get?.("retry-after") ?? null;
    throw new LlmClientError(
      retryAfter ? `Anonymous AI limit reached. Try again in ${retryAfter} seconds.` : "Anonymous AI limit reached. Wait about a minute and try again.",
      { code: "rate_limit", status: 429, retryAfter },
    );
  }

  if (!response.ok) {
    throw new LlmClientError(`The AI endpoint returned HTTP ${response.status}.`, { code: "service", status: response.status });
  }

  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new LlmClientError("The AI endpoint returned invalid JSON.", { code: "invalid_response", cause });
  }

  return responseMessage(payload);
}
