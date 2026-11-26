const test = require("node:test");
const assert = require("node:assert/strict");

const { parseProviderModelsResponse } = require("../src/main/aiChatService");
const {
  normalizeGithubRepo,
  compareSemver,
  pickReleaseAsset,
} = require("../src/main/updateService");

test("parseProviderModelsResponse parses Gemini generateContent models and strips prefix", () => {
  const models = parseProviderModelsResponse("gemini", {
    models: [
      {
        name: "models/gemini-2.5-flash",
        supportedGenerationMethods: ["generateContent", "countTokens"],
      },
      {
        name: "models/text-embedding-004",
        supportedGenerationMethods: ["embedContent"],
      },
      {
        name: "models/gemini-2.5-pro",
        supportedGenerationMethods: ["generateContent"],
      },
    ],
  });
  assert.deepEqual(models, ["gemini-2.5-flash", "gemini-2.5-pro"]);
});

test("parseProviderModelsResponse filters non-chat OpenAI models for api.openai.com", () => {
  const models = parseProviderModelsResponse(
    "openai",
    {
      data: [
        { id: "gpt-4o-mini" },
        { id: "text-embedding-3-small" },
        { id: "tts-1" },
        { id: "gpt-4.1" },
        { id: "dall-e-3" },
      ],
    },
    "https://api.openai.com/v1"
  );
  assert.deepEqual(models, ["gpt-4.1", "gpt-4o-mini"]);
});

test("parseProviderModelsResponse parses DeepSeek, Claude, and Ollama model payloads", () => {
  assert.deepEqual(
    parseProviderModelsResponse("deepseek", {
      data: [{ id: "deepseek-reasoner" }, { id: "deepseek-chat" }],
    }),
    ["deepseek-chat", "deepseek-reasoner"]
  );

  assert.deepEqual(
    parseProviderModelsResponse("claude", {
      data: [
        { id: "claude-sonnet-4-20250514" },
        { id: "claude-3-5-haiku-latest" },
      ],
    }),
    ["claude-sonnet-4-20250514", "claude-3-5-haiku-latest"]
  );

  assert.deepEqual(
    parseProviderModelsResponse("ollama", {
      models: [{ name: "qwen2.5:7b" }, { name: "llama3.2:latest" }],
    }),
    ["qwen2.5:7b", "llama3.2:latest"]
  );
});

test("normalizeGithubRepo extracts owner/repo from URLs and shorthand", () => {
  assert.equal(normalizeGithubRepo("myuser/zOffice"), "myuser/zOffice");
  assert.equal(
    normalizeGithubRepo("https://github.com/myuser/zOffice.git"),
    "myuser/zOffice"
  );
  assert.equal(
    normalizeGithubRepo("https://github.com/myuser/zOffice/"),
    "myuser/zOffice"
  );
});

test("compareSemver compares versions numerically and respects prereleases", () => {
  assert.equal(compareSemver("1.0.10", "1.0.2"), 1);
  assert.equal(compareSemver("v1.2.0", "1.1.9"), 1);
  assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
  assert.equal(compareSemver("1.1.0", "1.1.0-beta.1"), 1);
  assert.equal(compareSemver("1.1.0-beta.1", "1.1.0"), -1);
});

test("pickReleaseAsset selects exe when packaged and zip/zipball when running from source", () => {
  const release = {
    tag_name: "v1.2.0",
    zipball_url: "https://api.github.com/repos/a/b/zipball/v1.2.0",
    assets: [
      {
        name: "zOffice-Setup-1.2.0.exe",
        browser_download_url: "https://example.com/setup.exe",
        size: 1000,
      },
      {
        name: "zOffice-1.2.0.zip",
        browser_download_url: "https://example.com/app.zip",
        size: 500,
      },
    ],
  };

  assert.equal(pickReleaseAsset(release, false).kind, "zip");
  assert.equal(pickReleaseAsset(release, false).name, "zOffice-1.2.0.zip");
  assert.equal(pickReleaseAsset(release, true).kind, "exe");

  const tagOnlyRelease = {
    tag_name: "v1.2.0",
    zipball_url: "https://api.github.com/repos/a/b/zipball/v1.2.0",
    assets: [],
  };
  assert.equal(pickReleaseAsset(tagOnlyRelease, false).url, tagOnlyRelease.zipball_url);
});
