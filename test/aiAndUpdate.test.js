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

  assert.deepEqual(
    parseProviderModelsResponse(
      "gateway",
      {
        data: [{ id: "gemini-3.1-pro" }, { id: "gemini-3.8-flash" }],
      },
      "https://ai.starimg.ru/v1"
    ),
    ["gemini-3.1-pro", "gemini-3.8-flash"]
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

test("GeminiService persists multi-provider aiProviders and normalizes Base URLs", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { GeminiService } = require("../src/main/geminiService");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zoffice-gem-"));
  try {
    const svc = new GeminiService(tmpDir);
    svc.saveSettings({
      aiProvider: "claude",
      aiProviders: {
        claude: {
          apiKey: "sk-ant-test",
          baseUrl: "https://api.anthropic.com/v1/",
          model: "claude-sonnet-4-20250514",
        },
        openai: {
          apiKey: "sk-openai-test",
          baseUrl: "https://api.openai.com",
          model: "gpt-4o",
        },
        deepseek: {
          apiKey: "sk-ds-test",
          baseUrl: "https://api.deepseek.com/v1/",
          model: "deepseek-chat",
        },
        gateway: {
          apiKey: "sk-ant-gw-test",
          baseUrl: "https://ai.starimg.ru",
          model: "gemini-3.8-flash",
        },
      },
    });
    const claudeCfg = svc.getActiveAiConfig();
    assert.equal(claudeCfg.provider, "claude");
    assert.equal(claudeCfg.baseUrl, "https://api.anthropic.com");
    assert.equal(claudeCfg.apiKey, "sk-ant-test");

    svc.saveSettings({ aiProvider: "openai" });
    const openaiCfg = svc.getActiveAiConfig();
    assert.equal(openaiCfg.baseUrl, "https://api.openai.com/v1");
    assert.equal(openaiCfg.model, "gpt-4o");

    svc.saveSettings({ aiProvider: "gateway" });
    const gwCfg = svc.getActiveAiConfig();
    assert.equal(gwCfg.provider, "gateway");
    assert.equal(gwCfg.baseUrl, "https://ai.starimg.ru/v1");
    assert.equal(gwCfg.apiKey, "sk-ant-gw-test");
    assert.equal(gwCfg.model, "gemini-3.8-flash");
    const pubGw = svc.getPublicSettings();
    assert.equal(pubGw.aiProvider, "gateway");
    assert.equal(pubGw.activeAiModel, "gemini-3.8-flash");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("AiChatService syncs gateway provider settings with GeminiService", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { GeminiService } = require("../src/main/geminiService");
  const { AiChatService } = require("../src/main/aiChatService");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zoffice-chat-"));
  try {
    const gemSvc = new GeminiService(tmpDir);
    const chatSvc = new AiChatService(tmpDir, gemSvc);

    const pub = chatSvc.saveSettings({
      defaultProvider: "gateway",
      gateway: {
        apiKey: "sk-ant-gw-sync",
        baseUrl: "https://ai.starimg.ru/",
        model: "gemini-3.1-pro",
      },
    });
    assert.equal(pub.defaultProvider, "gateway");
    assert.equal(pub.gateway.baseUrl, "https://ai.starimg.ru/v1");
    assert.equal(pub.gateway.apiKey, "sk-ant-gw-sync");
    assert.equal(pub.gateway.model, "gemini-3.1-pro");
    assert.equal(gemSvc.settings.aiProviders.gateway.apiKey, "sk-ant-gw-sync");
    assert.equal(gemSvc.settings.aiProviders.gateway.baseUrl, "https://ai.starimg.ru/v1");
    assert.equal(gemSvc.settings.aiProviders.gateway.model, "gemini-3.1-pro");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("renderPdfToPngPages renders minimal PDF buffer into PNG page(s) on Windows", async () => {
  if (process.platform !== "win32") return;
  const { renderPdfToPngPages } = require("../src/main/geminiService");
  const minimalPdf = Buffer.from(
    "%PDF-1.4\n" +
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n" +
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n" +
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << >> >> endobj\n" +
      "4 0 obj << /Length 22 >> stream\n0 0 0 rg 10 10 50 50 re f\nendstream endobj\n" +
      "xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000210 00000 n \n" +
      "trailer << /Size 5 /Root 1 0 R >>\nstartxref\n282\n%%EOF\n",
    "ascii"
  );
  const pages = await renderPdfToPngPages(minimalPdf, { maxPages: 2, destinationWidth: 400 });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].pageNumber, 1);
  assert.equal(pages[0].mimeType, "image/png");
  const pngHeader = Buffer.from(pages[0].base64, "base64").subarray(0, 8);
  assert.deepEqual([...pngHeader], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test("UpdateService enables autoCheckUpdates and autoInstallUpdates by default", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { UpdateService } = require("../src/main/updateService");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zoffice-upd-"));
  try {
    const svc = new UpdateService(null, process.cwd(), tmpDir);
    const st = svc.getState();
    assert.equal(st.autoCheckUpdates, true);
    assert.equal(st.autoInstallUpdates, true);
    assert.equal(st.githubRepo, "Zon639/zOffice");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
