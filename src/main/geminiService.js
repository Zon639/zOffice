const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const https = require("node:https");
const http = require("node:http");
const zlib = require("node:zlib");
const {
  DEFAULT_ND30_SETTINGS,
  readAddInSettingsFromAppData,
} = require("./nd30DocxService");

const SYSTEM_AI_PROVIDER_DEFAULTS = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-2.5-flash",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  claude: {
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-20250514",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  gateway: {
    baseUrl: "https://ai.starimg.ru/v1",
    model: "gemini-3.8-flash",
  },
};

function normalizeProviderBaseUrl(provider, rawUrl) {
  const def = SYSTEM_AI_PROVIDER_DEFAULTS[provider]?.baseUrl || "";
  let s = String(rawUrl || def).trim().replace(/\/+$/, "");
  if (provider === "claude") {
    s = s.replace(/\/v1$/i, "");
  } else if (
    (provider === "openai" && /^https:\/\/api\.openai\.com$/i.test(s)) ||
    (provider === "gateway" && /^https?:\/\/ai\.starimg\.ru$/i.test(s))
  ) {
    s = `${s}/v1`;
  }
  return s || def;
}

function postJsonRequest(url, headers = {}, payload = {}, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === "http:" ? http : https;
    const bodyBuf = Buffer.from(JSON.stringify(payload), "utf-8");

    const req = client.request(
      urlObj,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": String(bodyBuf.byteLength),
          ...headers,
        },
        family: 4,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const rawText = Buffer.concat(chunks).toString("utf-8");
          let parsed = null;
          try {
            parsed = JSON.parse(rawText);
          } catch (_) {
            return reject(
              new Error(`Phản hồi từ AI API không hợp lệ (HTTP ${res.statusCode}).`)
            );
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const apiMsg =
              parsed?.error?.message ||
              parsed?.message ||
              `Lỗi AI API (HTTP ${res.statusCode})`;
            return reject(new Error(apiMsg));
          }
          resolve(parsed);
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Quá thời gian chờ phản hồi từ AI API (${Math.round(timeoutMs / 1000)}s).`));
    });
    req.on("error", (err) => {
      reject(new Error(`Lỗi kết nối AI API: ${err.message}`));
    });
    req.write(bodyBuf);
    req.end();
  });
}
const {
  normalizeAppsScriptWebAppUrl,
} = require("./googleSheetService");

/**
 * Render the first pages of a PDF buffer or file to PNG base64 images on Windows
 * using built-in WinRT Windows.Data.Pdf.PdfDocument (no external dependencies).
 */
async function renderPdfToPngPages(pdfInput, { maxPages = 3, destinationWidth = 1200 } = {}) {
  if (process.platform !== "win32" || !pdfInput) return [];
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "zoffice-pdf-"));
  const outDir = path.join(tmpDir, "pages");
  await fsp.mkdir(outDir, { recursive: true });

  let pdfPath = "";
  if (Buffer.isBuffer(pdfInput)) {
    pdfPath = path.join(tmpDir, "input.pdf");
    await fsp.writeFile(pdfPath, pdfInput);
  } else {
    pdfPath = path.resolve(String(pdfInput));
    if (!fs.existsSync(pdfPath)) {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      return [];
    }
  }

  const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
$asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
})[0]
function AwaitOp($op, $resultType) {
  $t = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
  $t.Wait()
  return $t.Result
}
function AwaitAct($act) {
  $t = $asTaskAction.Invoke($null, @($act))
  $t.Wait()
}
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType=WindowsRuntime]
$null = [Windows.Data.Pdf.PdfPageRenderOptions, Windows.Data.Pdf, ContentType=WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]

$file = AwaitOp ([Windows.Storage.StorageFile]::GetFileFromPathAsync($env:ZOFFICE_PDF_PATH)) ([Windows.Storage.StorageFile])
$pdf = AwaitOp ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
$totalPages = [int]$pdf.PageCount
$limit = [Math]::Min($totalPages, [int]$env:ZOFFICE_PDF_MAX_PAGES)
for ($i = 0; $i -lt $limit; $i++) {
  $page = $pdf.GetPage($i)
  $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  $opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
  $opts.DestinationWidth = [uint32]$env:ZOFFICE_PDF_WIDTH
  AwaitAct ($page.RenderToStreamAsync($stream, $opts))
  $ms = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
  $bytes = New-Object byte[] $stream.Size
  $null = $ms.Read($bytes, 0, $bytes.Length)
  $outFile = Join-Path $env:ZOFFICE_PNG_DIR ("page_" + $i.ToString("D3") + ".png")
  [System.IO.File]::WriteAllBytes($outFile, $bytes)
  $page.Dispose()
  $stream.Dispose()
}
Write-Output $totalPages
`;

  try {
    const stdout = await new Promise((resolve, reject) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", psScript],
        {
          timeout: 30000,
          windowsHide: true,
          env: {
            ...process.env,
            ZOFFICE_PDF_PATH: pdfPath,
            ZOFFICE_PNG_DIR: outDir,
            ZOFFICE_PDF_MAX_PAGES: String(Math.max(1, Number(maxPages) || 3)),
            ZOFFICE_PDF_WIDTH: String(Math.max(400, Number(destinationWidth) || 1200)),
          },
        },
        (err, out, errOut) => {
          if (err) {
            return reject(new Error(errOut || err.message));
          }
          resolve(String(out || "").trim());
        }
      );
    });
    const totalPages = parseInt(stdout, 10) || 0;
    const files = (await fsp.readdir(outDir))
      .filter((f) => f.endsWith(".png"))
      .sort();
    const pages = [];
    for (let i = 0; i < files.length; i++) {
      const buf = await fsp.readFile(path.join(outDir, files[i]));
      pages.push({
        pageNumber: i + 1,
        totalPages: totalPages || files.length,
        mimeType: "image/png",
        base64: buf.toString("base64"),
      });
    }
    return pages;
  } catch (err) {
    console.warn("PDF to PNG render warning:", err?.message || err);
    return [];
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Lightweight pure-Node extractor for .docx (ZIP containing word/document.xml)
 */
function extractTextFromDocxBuffer(buf) {
  try {
    let offset = 0;
    const texts = [];
    while (offset + 30 <= buf.length) {
      const sig = buf.readUInt32LE(offset);
      if (sig !== 0x04034b50) break; // Local file header signature

      const compression = buf.readUInt16LE(offset + 8);
      const compressedSize = buf.readUInt32LE(offset + 18);
      const fileNameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const fileName = buf.subarray(offset + 30, offset + 30 + fileNameLen).toString("utf-8");
      const dataStart = offset + 30 + fileNameLen + extraLen;
      const dataEnd = dataStart + compressedSize;

      if (fileName === "word/document.xml" && dataEnd <= buf.length) {
        const rawSlice = buf.subarray(dataStart, dataEnd);
        const xmlBuf =
          compression === 0 ? rawSlice : zlib.inflateRawSync(rawSlice);
        const xml = xmlBuf.toString("utf-8");
        const clean = xml
          .replace(/<\/w:p>/g, "\n")
          .replace(/<w:tab\/>/g, "\t")
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        texts.push(clean);
        break;
      }
      offset = dataEnd;
    }
    return texts.join("\n");
  } catch (err) {
    console.warn("DOCX text extraction fallback warning:", err?.message || err);
    return "";
  }
}

function cleanDocNumberString(raw) {
  if (!raw) return "";
  let s = String(raw)
    .trim()
    .replace(/^(số\s*và\s*ký\s*hiệu|số\s*ký\s*hiệu|công\s*văn\s*số|văn\s*bản\s*số|số)\s*[:.]?\s*/i, "")
    .trim();
  // Chuẩn hóa khoảng trắng quanh dấu "/" và dấu "-" trong số ký hiệu (VD: "9785 / SKHCN - CĐS" -> "9785/SKHCN-CĐS")
  s = s
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*[-–—]\s*/g, "-")
    .replace(/\s{2,}/g, " ")
    .trim();
  return s;
}

function callGeminiRestApi(apiKey, model, payload) {
  return new Promise((resolve, reject) => {
    const cleanModel = String(model || "gemini-2.5-flash").trim();
    const url = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        cleanModel
      )}:generateContent?key=${encodeURIComponent(apiKey)}`
    );

    const bodyBuf = Buffer.from(JSON.stringify(payload), "utf-8");

    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": String(bodyBuf.byteLength),
        },
        family: 4,
        timeout: 60000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const rawText = Buffer.concat(chunks).toString("utf-8");
          let parsed = null;
          try {
            parsed = JSON.parse(rawText);
          } catch (_) {
            return reject(
              new Error(`Phản hồi từ Gemini không hợp lệ (HTTP ${res.statusCode}).`)
            );
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            const apiMsg =
              parsed?.error?.message ||
              `Lỗi Gemini API (HTTP ${res.statusCode})`;
            return reject(new Error(apiMsg));
          }

          resolve(parsed);
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Quá thời gian chờ phản hồi từ Gemini API (60s)."));
    });

    req.on("error", (err) => {
      reject(new Error(`Lỗi kết nối Gemini API: ${err.message}`));
    });

    req.write(bodyBuf);
    req.end();
  });
}

class GeminiService {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.settingsPath = path.join(dataDir, "settings.json");
    this.settings = this.loadSettings();
  }

  getDefaultStorageConfig() {
    const rootDir = path.join(this.dataDir, "LuuTru_VanBan");
    return {
      rootDir,
    };
  }

  ensureStorageDirectories(storageConfig) {
    const cfg = storageConfig || this.settings?.storageConfig || this.getDefaultStorageConfig();
    if (cfg.rootDir && !fs.existsSync(cfg.rootDir)) {
      try {
        fs.mkdirSync(cfg.rootDir, { recursive: true });
      } catch (err) {
        console.warn("Could not create storage dir:", cfg.rootDir, err?.message || err);
      }
    }
  }

  loadSettings() {
    const defaultStorage = this.getDefaultStorageConfig();
    const defaults = {
      aiProvider: "gemini",
      aiProviders: {
        gemini: { ...SYSTEM_AI_PROVIDER_DEFAULTS.gemini, apiKey: process.env.GEMINI_API_KEY || "" },
        openai: { ...SYSTEM_AI_PROVIDER_DEFAULTS.openai, apiKey: "" },
        claude: { ...SYSTEM_AI_PROVIDER_DEFAULTS.claude, apiKey: "" },
        deepseek: { ...SYSTEM_AI_PROVIDER_DEFAULTS.deepseek, apiKey: "" },
        gateway: { ...SYSTEM_AI_PROVIDER_DEFAULTS.gateway, apiKey: "" },
      },
      geminiApiKey: process.env.GEMINI_API_KEY || "",
      geminiModel: "gemini-2.5-flash",
      autoAnalyzeOnPick: true,
      autoCaptureWebDownloads: true,
      portalHomeUrl: "https://vpdt.angiang.gov.vn",
      portalBookmarks: [
        { name: "VNPT iOffice An Giang", url: "https://vpdt.angiang.gov.vn" },
        { name: "VNPT iOffice", url: "https://ioffice.vnpt.vn" },
        { name: "Viettel vOffice", url: "https://voffice.viettel.vn" },
      ],
      iofficeUrl: "https://vpdt.angiang.gov.vn",
      iofficeUsername: "",
      iofficePassword: "",
      iofficeAutoLogin: true,
      iofficeAutoSaveOnWeb: true,
      specialistName: "",
      defaultDepartment: "",
      googleSheetWebhookUrl: "",
      googleSheetSecret: "",
      autoSyncGoogleSheet: true,
      nd30Settings: {
        ...DEFAULT_ND30_SETTINGS,
        ...(readAddInSettingsFromAppData() || {}),
      },
      storageConfig: defaultStorage,
    };
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, "utf-8");
        const parsed = JSON.parse(raw);
        const parsedStorage = parsed.storageConfig || {};
        let resolvedRoot = String(parsedStorage.rootDir || "").trim();
        if (!resolvedRoot && parsedStorage.assignmentDir) {
          const parentDir = path.dirname(String(parsedStorage.assignmentDir).trim());
          if (parentDir && parentDir !== ".") {
            resolvedRoot = parentDir;
          }
        }
        const mergedStorage = {
          rootDir: resolvedRoot || defaultStorage.rootDir,
        };
        this.ensureStorageDirectories(mergedStorage);
        const mergedProviders = {
          gemini: {
            ...defaults.aiProviders.gemini,
            ...(parsed.aiProviders?.gemini || {}),
            apiKey: String(
              parsed.aiProviders?.gemini?.apiKey ??
                parsed.geminiApiKey ??
                defaults.geminiApiKey
            ).trim(),
            model: String(
              parsed.aiProviders?.gemini?.model ||
                parsed.geminiModel ||
                defaults.geminiModel
            ).trim(),
          },
          openai: {
            ...defaults.aiProviders.openai,
            ...(parsed.aiProviders?.openai || {}),
            baseUrl: normalizeProviderBaseUrl("openai", parsed.aiProviders?.openai?.baseUrl),
          },
          claude: {
            ...defaults.aiProviders.claude,
            ...(parsed.aiProviders?.claude || {}),
            baseUrl: normalizeProviderBaseUrl("claude", parsed.aiProviders?.claude?.baseUrl),
          },
          deepseek: {
            ...defaults.aiProviders.deepseek,
            ...(parsed.aiProviders?.deepseek || {}),
            baseUrl: normalizeProviderBaseUrl("deepseek", parsed.aiProviders?.deepseek?.baseUrl),
          },
          gateway: {
            ...defaults.aiProviders.gateway,
            ...(parsed.aiProviders?.gateway || {}),
            baseUrl: normalizeProviderBaseUrl("gateway", parsed.aiProviders?.gateway?.baseUrl),
          },
        };
        return {
          ...defaults,
          ...parsed,
          aiProvider: parsed.aiProvider || "gemini",
          aiProviders: mergedProviders,
          geminiApiKey: mergedProviders.gemini.apiKey,
          geminiModel: mergedProviders.gemini.model,
          iofficeUrl:
            parsed.iofficeUrl || parsed.portalHomeUrl || defaults.iofficeUrl,
          iofficeUsername: String(parsed.iofficeUsername || "").trim(),
          iofficePassword: String(parsed.iofficePassword || ""),
          iofficeAutoLogin:
            parsed.iofficeAutoLogin !== undefined
              ? Boolean(parsed.iofficeAutoLogin)
              : true,
          iofficeAutoSaveOnWeb:
            parsed.iofficeAutoSaveOnWeb !== undefined
              ? Boolean(parsed.iofficeAutoSaveOnWeb)
              : true,
          portalBookmarks: Array.isArray(parsed.portalBookmarks)
            ? parsed.portalBookmarks
            : defaults.portalBookmarks,
          specialistName: String(parsed.specialistName || "").trim(),
          defaultDepartment: String(parsed.defaultDepartment || "").trim(),
          googleSheetWebhookUrl: normalizeAppsScriptWebAppUrl(
            parsed.googleSheetWebhookUrl
          ),
          googleSheetSecret: String(parsed.googleSheetSecret || "").trim(),
          autoSyncGoogleSheet:
            parsed.autoSyncGoogleSheet !== undefined
              ? Boolean(parsed.autoSyncGoogleSheet)
              : true,
          nd30Settings: {
            ...defaults.nd30Settings,
            ...(parsed.nd30Settings || {}),
          },
          storageConfig: mergedStorage,
        };
      }
    } catch (err) {
      console.error("Failed to read settings.json:", err);
    }
    this.ensureStorageDirectories(defaultStorage);
    return defaults;
  }

  saveSettings(newSettings) {
    const defaultStorage = this.getDefaultStorageConfig();
    const curStorage = this.settings.storageConfig || defaultStorage;
    const nextStorageInput = newSettings.storageConfig || {};
    const mergedStorage = {
      rootDir:
        String(
          nextStorageInput.rootDir ?? curStorage.rootDir ?? defaultStorage.rootDir
        ).trim() || defaultStorage.rootDir,
    };
    this.ensureStorageDirectories(mergedStorage);

    const prevProviders = this.settings.aiProviders || {
      gemini: { ...SYSTEM_AI_PROVIDER_DEFAULTS.gemini, apiKey: this.settings.geminiApiKey || "" },
      openai: { ...SYSTEM_AI_PROVIDER_DEFAULTS.openai, apiKey: "" },
      claude: { ...SYSTEM_AI_PROVIDER_DEFAULTS.claude, apiKey: "" },
      deepseek: { ...SYSTEM_AI_PROVIDER_DEFAULTS.deepseek, apiKey: "" },
      gateway: { ...SYSTEM_AI_PROVIDER_DEFAULTS.gateway, apiKey: "" },
    };
    const nextProvidersInput = newSettings.aiProviders || {};
    const nextGeminiKey = String(
      nextProvidersInput.gemini?.apiKey ??
        newSettings.geminiApiKey ??
        prevProviders.gemini?.apiKey ??
        this.settings.geminiApiKey
    ).trim();
    const nextGeminiModel = String(
      nextProvidersInput.gemini?.model ||
        newSettings.geminiModel ||
        prevProviders.gemini?.model ||
        this.settings.geminiModel ||
        "gemini-2.5-flash"
    ).trim();

    const mergedProviders = {
      gemini: {
        baseUrl: SYSTEM_AI_PROVIDER_DEFAULTS.gemini.baseUrl,
        apiKey: nextGeminiKey,
        model: nextGeminiModel,
      },
      openai: {
        ...SYSTEM_AI_PROVIDER_DEFAULTS.openai,
        ...(prevProviders.openai || {}),
        ...(nextProvidersInput.openai || {}),
      },
      claude: {
        ...SYSTEM_AI_PROVIDER_DEFAULTS.claude,
        ...(prevProviders.claude || {}),
        ...(nextProvidersInput.claude || {}),
      },
      deepseek: {
        ...SYSTEM_AI_PROVIDER_DEFAULTS.deepseek,
        ...(prevProviders.deepseek || {}),
        ...(nextProvidersInput.deepseek || {}),
      },
      gateway: {
        ...SYSTEM_AI_PROVIDER_DEFAULTS.gateway,
        ...(prevProviders.gateway || {}),
        ...(nextProvidersInput.gateway || {}),
      },
    };
    for (const pKey of ["openai", "claude", "deepseek", "gateway"]) {
      mergedProviders[pKey].apiKey = String(mergedProviders[pKey].apiKey || "").trim();
      mergedProviders[pKey].baseUrl = normalizeProviderBaseUrl(pKey, mergedProviders[pKey].baseUrl);
      mergedProviders[pKey].model = String(
        mergedProviders[pKey].model || SYSTEM_AI_PROVIDER_DEFAULTS[pKey].model
      ).trim();
    }

    this.settings = {
      ...this.settings,
      ...newSettings,
      aiProvider: String(newSettings.aiProvider || this.settings.aiProvider || "gemini").trim(),
      aiProviders: mergedProviders,
      geminiApiKey: nextGeminiKey,
      geminiModel: nextGeminiModel,
      autoAnalyzeOnPick:
        newSettings.autoAnalyzeOnPick !== undefined
          ? Boolean(newSettings.autoAnalyzeOnPick)
          : this.settings.autoAnalyzeOnPick,
      autoCaptureWebDownloads:
        newSettings.autoCaptureWebDownloads !== undefined
          ? Boolean(newSettings.autoCaptureWebDownloads)
          : this.settings.autoCaptureWebDownloads,
      portalHomeUrl: String(
        newSettings.portalHomeUrl ??
          this.settings.portalHomeUrl ??
          "https://vpdt.angiang.gov.vn"
      ).trim(),
      iofficeUrl: String(
        newSettings.iofficeUrl ??
          this.settings.iofficeUrl ??
          newSettings.portalHomeUrl ??
          this.settings.portalHomeUrl ??
          "https://vpdt.angiang.gov.vn"
      ).trim(),
      iofficeUsername: String(
        newSettings.iofficeUsername ?? this.settings.iofficeUsername ?? ""
      ).trim(),
      iofficePassword: String(
        newSettings.iofficePassword ?? this.settings.iofficePassword ?? ""
      ),
      iofficeAutoLogin:
        newSettings.iofficeAutoLogin !== undefined
          ? Boolean(newSettings.iofficeAutoLogin)
          : this.settings.iofficeAutoLogin !== false,
      iofficeAutoSaveOnWeb:
        newSettings.iofficeAutoSaveOnWeb !== undefined
          ? Boolean(newSettings.iofficeAutoSaveOnWeb)
          : this.settings.iofficeAutoSaveOnWeb !== false,
      portalBookmarks: Array.isArray(newSettings.portalBookmarks)
        ? newSettings.portalBookmarks
        : this.settings.portalBookmarks,
      specialistName: String(
        newSettings.specialistName ?? this.settings.specialistName ?? ""
      ).trim(),
      defaultDepartment: String(
        newSettings.defaultDepartment ?? this.settings.defaultDepartment ?? ""
      ).trim(),
      googleSheetWebhookUrl: normalizeAppsScriptWebAppUrl(
        newSettings.googleSheetWebhookUrl ??
          this.settings.googleSheetWebhookUrl ??
          ""
      ),
      googleSheetSecret: String(
        newSettings.googleSheetSecret ?? this.settings.googleSheetSecret ?? ""
      ).trim(),
      autoSyncGoogleSheet:
        newSettings.autoSyncGoogleSheet !== undefined
          ? Boolean(newSettings.autoSyncGoogleSheet)
          : this.settings.autoSyncGoogleSheet !== false,
      nd30Settings: {
        ...DEFAULT_ND30_SETTINGS,
        ...(this.settings.nd30Settings || {}),
        ...(newSettings.nd30Settings || {}),
      },
      storageConfig: mergedStorage,
    };
    fs.writeFileSync(
      this.settingsPath,
      JSON.stringify(this.settings, null, 2),
      "utf-8"
    );
    return this.getPublicSettings();
  }

  getActiveAiConfig() {
    const prov = String(this.settings.aiProvider || "gemini").trim().toLowerCase();
    const providers = this.settings.aiProviders || {};
    const cfg = providers[prov] || {};
    const def = SYSTEM_AI_PROVIDER_DEFAULTS[prov] || SYSTEM_AI_PROVIDER_DEFAULTS.gemini;
    const apiKey =
      prov === "gemini"
        ? String(cfg.apiKey || this.settings.geminiApiKey || process.env.GEMINI_API_KEY || "").trim()
        : String(cfg.apiKey || "").trim();
    return {
      provider: SYSTEM_AI_PROVIDER_DEFAULTS[prov] ? prov : "gemini",
      apiKey,
      baseUrl: normalizeProviderBaseUrl(prov, cfg.baseUrl || def.baseUrl),
      model: String(cfg.model || (prov === "gemini" ? this.settings.geminiModel : "") || def.model).trim(),
    };
  }

  getPublicSettings() {
    const activeAi = this.getActiveAiConfig();
    const key = this.settings.geminiApiKey || "";
    const ioUser = String(this.settings.iofficeUsername || "").trim();
    const ioPass = String(this.settings.iofficePassword || "");
    const defaultStorage = this.getDefaultStorageConfig();
    const activeKey = activeAi.apiKey || "";
    return {
      aiProvider: activeAi.provider,
      activeAiModel: activeAi.model,
      aiProviders: this.settings.aiProviders || {},
      hasApiKey: Boolean(activeKey || key),
      maskedApiKey: activeKey
        ? activeKey.length > 10
          ? `${activeKey.slice(0, 6)}...${activeKey.slice(-4)}`
          : "********"
        : "",
      geminiApiKey: key,
      geminiModel: this.settings.geminiModel || "gemini-2.5-flash",
      autoAnalyzeOnPick: Boolean(this.settings.autoAnalyzeOnPick),
      autoCaptureWebDownloads:
        this.settings.autoCaptureWebDownloads !== undefined
          ? Boolean(this.settings.autoCaptureWebDownloads)
          : true,
      portalHomeUrl:
        this.settings.portalHomeUrl || "https://vpdt.angiang.gov.vn",
      portalBookmarks: Array.isArray(this.settings.portalBookmarks)
        ? this.settings.portalBookmarks
        : [],
      iofficeUrl:
        this.settings.iofficeUrl ||
        this.settings.portalHomeUrl ||
        "https://vpdt.angiang.gov.vn",
      iofficeUsername: ioUser,
      iofficePassword: ioPass,
      hasIofficeCredentials: Boolean(ioUser && ioPass),
      iofficeAutoLogin: this.settings.iofficeAutoLogin !== false,
      iofficeAutoSaveOnWeb: this.settings.iofficeAutoSaveOnWeb !== false,
      specialistName: String(this.settings.specialistName || "").trim(),
      defaultDepartment: String(this.settings.defaultDepartment || "").trim(),
      googleSheetWebhookUrl: normalizeAppsScriptWebAppUrl(
        this.settings.googleSheetWebhookUrl
      ),
      googleSheetSecret: String(this.settings.googleSheetSecret || "").trim(),
      autoSyncGoogleSheet: this.settings.autoSyncGoogleSheet !== false,
      nd30Settings: {
        ...DEFAULT_ND30_SETTINGS,
        ...(this.settings.nd30Settings || {}),
      },
      storageConfig: this.settings.storageConfig || defaultStorage,
      defaultStorageConfig: defaultStorage,
    };
  }

  async callActiveAiForJson({ parts = [], responseSchema = null, temperature = 0.1 } = {}) {
    const cfg = this.getActiveAiConfig();
    const providerLabels = {
      gemini: "Google Gemini",
      openai: "ChatGPT / OpenAI",
      claude: "Anthropic Claude",
      deepseek: "DeepSeek",
      gateway: "AI Gateway / Proxy",
    };
    const label = providerLabels[cfg.provider] || cfg.provider;
    if (!cfg.apiKey) {
      throw new Error(
        `Chưa cấu hình API Key cho ${label}! Vui lòng bấm nút '⚙️' Cài đặt hệ thống để nhập API Key.`
      );
    }

    if (cfg.provider === "gemini") {
      const payload = {
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
          ...(responseSchema ? { responseSchema } : {}),
        },
      };
      const resData = await callGeminiRestApi(cfg.apiKey, cfg.model, payload);
      return resData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    if (cfg.provider === "claude") {
      const blocks = [];
      for (const p of parts) {
        if (p?.inlineData?.data) {
          if (p.inlineData.mimeType === "application/pdf") {
            blocks.push({
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: p.inlineData.data },
            });
          } else {
            blocks.push({
              type: "image",
              source: { type: "base64", media_type: p.inlineData.mimeType || "image/png", data: p.inlineData.data },
            });
          }
        } else if (p?.text) {
          blocks.push({ type: "text", text: p.text });
        }
      }
      blocks.push({
        type: "text",
        text: "YÊU CẦU ĐỊNH DẠNG: Chỉ trả về duy nhất 1 đối tượng JSON hợp lệ (không bọc trong markdown code fence, không giải thích thêm).",
      });

      const resData = await postJsonRequest(
        `${cfg.baseUrl}/v1/messages`,
        {
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
        },
        {
          model: cfg.model,
          max_tokens: 4096,
          temperature: Math.min(1, temperature),
          messages: [{ role: "user", content: blocks }],
        }
      );
      const textParts = (resData?.content || [])
        .filter((c) => c?.type === "text" && typeof c.text === "string")
        .map((c) => c.text);
      return textParts.join("\n").trim();
    }

    // OpenAI / DeepSeek / Gateway (OpenAI-compatible)
    const contentParts = [];
    let hasPdfWithoutText = false;
    let hasTextOrImage = false;
    const supportsVision = cfg.provider === "openai" || cfg.provider === "gateway";
    for (const p of parts) {
      if (p?.inlineData?.data) {
        const mime = p.inlineData.mimeType || "";
        if (mime.startsWith("image/") && supportsVision) {
          contentParts.push({
            type: "image_url",
            image_url: { url: `data:${mime};base64,${p.inlineData.data}` },
          });
          hasTextOrImage = true;
        } else if (mime === "application/pdf") {
          if (supportsVision) {
            const pdfPages = await renderPdfToPngPages(
              Buffer.from(p.inlineData.data, "base64"),
              { maxPages: 3, destinationWidth: 1200 }
            );
            if (pdfPages.length > 0) {
              for (const pg of pdfPages) {
                contentParts.push({
                  type: "text",
                  text: `[Hình ảnh Trang ${pg.pageNumber}/${pg.totalPages} của tệp PDF đính kèm]`,
                });
                contentParts.push({
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${pg.base64}` },
                });
              }
              hasTextOrImage = true;
            } else {
              hasPdfWithoutText = true;
            }
          } else {
            hasPdfWithoutText = true;
          }
        }
      } else if (p?.text) {
        contentParts.push({ type: "text", text: p.text });
        hasTextOrImage = true;
      }
    }

    if (hasPdfWithoutText && contentParts.filter((c) => c.type === "text").length <= 1) {
      throw new Error(
        `${label} không hỗ trợ đọc tệp PDF nhị phân trực tiếp như Gemini hoặc Claude. Hãy chọn tệp Word (.docx)/.txt, hoặc chuyển Nhà cung cấp AI chính sang Gemini / Claude để đọc PDF trực tiếp.`
      );
    }

    if (!hasTextOrImage) {
      throw new Error(`Không có nội dung văn bản hợp lệ để gửi tới ${label}.`);
    }

    const messageContent =
      contentParts.every((c) => c.type === "text")
        ? contentParts.map((c) => c.text).join("\n\n")
        : contentParts;

    const reqBody = {
      model: cfg.model,
      temperature,
      messages: [
        {
          role: "system",
          content:
            "Bạn là trợ lý AI trích xuất dữ liệu văn bản hành chính Việt Nam. Luôn trả về duy nhất 1 đối tượng JSON hợp lệ đúng các trường được yêu cầu (không bọc markdown code fence).",
        },
        { role: "user", content: messageContent },
      ],
    };
    if (cfg.provider !== "gateway") {
      reqBody.response_format = { type: "json_object" };
    }

    const resData = await postJsonRequest(
      `${cfg.baseUrl}/chat/completions`,
      { Authorization: `Bearer ${cfg.apiKey}` },
      reqBody
    );
    return resData?.choices?.[0]?.message?.content || "";
  }

  async analyzeDocumentFile(filePath) {
    const activeCfg = this.getActiveAiConfig();
    if (!activeCfg.apiKey) {
      throw new Error(
        "Chưa cấu hình API Key AI! Vui lòng bấm nút '⚙️' để chọn nhà cung cấp AI và nhập API Key."
      );
    }

    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error("Không tìm thấy tệp văn bản cần đọc.");
    }

    const stat = await fsp.stat(filePath);
    if (stat.size > 20 * 1024 * 1024) {
      throw new Error("Tệp văn bản vượt quá 20MB để đọc trực tiếp qua Gemini inlineData.");
    }

    const ext = path.extname(filePath).replace(".", "").toLowerCase();
    const fileName = path.basename(filePath);
    const fileBuf = await fsp.readFile(filePath);

    const parts = [];

    const mimeMap = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
    };

    if (mimeMap[ext]) {
      parts.push({
        inlineData: {
          mimeType: mimeMap[ext],
          data: fileBuf.toString("base64"),
        },
      });
    } else if (ext === "docx") {
      const extractedText = extractTextFromDocxBuffer(fileBuf);
      if (!extractedText) {
        throw new Error("Không thể trích xuất văn bản từ tệp .docx này.");
      }
      parts.push({
        text: `Nội dung văn bản Word (${fileName}):\n\n${extractedText}`,
      });
    } else if (["txt", "md", "csv", "json", "xml", "html"].includes(ext)) {
      parts.push({
        text: `Nội dung tệp (${fileName}):\n\n${fileBuf.toString("utf-8")}`,
      });
    } else {
      throw new Error(
        `Định dạng tệp .${ext} chưa hỗ trợ đọc tự động. Hãy chọn tệp PDF, Ảnh (.png, .jpg, .webp), Word (.docx) hoặc Text (.txt).`
      );
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    const systemPrompt = `Bạn là trợ lý AI chuyên đọc hiểu và bóc tách thông tin văn bản hành chính / công văn / thông báo tại Việt Nam.
Hãy đọc kỹ tài liệu đính kèm (tên tệp gốc: "${fileName}", ngày hiện tại của hệ thống: ${todayStr}) và trích xuất chính xác các thông tin sau sang định dạng JSON.

⚠️ LƯU Ý QUAN TRỌNG VỀ VĂN BẢN ĐƯỢC KÝ SỐ (VGCA / VNPT-CA / Viettel-CA):
- Trong văn bản PDF ký số tại Việt Nam, lớp văn bản gốc (text layer) thường để trống phần số và ngày tháng (ví dụ: "Số:   /SKHCN-CĐS" và "..., ngày    tháng    năm 2026"), còn con số thực tế (ví dụ "9785", "1917", "10698") và ngày tháng ban hành (ví dụ "13", "10" hoặc "02", "11") được văn thư đóng dấu bằng hình ảnh/stamp lên góc trên Trang 1 khi phát hành.
- Do đó, bạn BẮT BUỘC phải quan sát trực tiếp hình ảnh hiển thị trên Trang 1 của tài liệu (kết hợp kiểm tra tên tệp "${fileName}" hoặc thời gian trong khung chữ ký số ở cuối văn bản) để lấy ĐẦY ĐỦ cả phần SỐ đứng trước dấu "/" lẫn phần KÝ HIỆU sau dấu "/". Tuyệt đối KHÔNG trả về docNumber bị khuyết số ở đầu như "/SKHCN-CĐS".

Chi tiết các trường JSON cần trích xuất:
1. "docNumber": Số và ký hiệu văn bản đầy đủ cả số lẫn ký hiệu, viết liền không cách quanh dấu "/" và "-" (ví dụ: "9785/SKHCN-CĐS", "1917/VP-TH", "10698/SKHCN-PTCN&ĐMST", "148/UBND-VX").
2. "issuer": Cơ quan, đơn vị ban hành văn bản (ví dụ: "Sở Khoa học và Công nghệ tỉnh An Giang", "Văn phòng UBND tỉnh An Giang"...).
3. "title": Trích yếu nội dung chính của văn bản (thường nằm ngay dưới câu "V/v..." hoặc tiêu đề văn bản). Viết ngắn gọn, rõ ràng, chuẩn văn phong hành chính.
4. "receivedDate": Ngày tháng năm ban hành văn bản theo định dạng "YYYY-MM-DD" (đọc kỹ con số ngày và tháng được đóng dấu ký số tại dòng "..., ngày ... tháng ... năm ..." ở đầu Trang 1, hoặc thời gian ký số / tên tệp như "(02.11.2026)" -> "2026-11-02"). Nếu không rõ thì để "".
5. "dueDate": Hạn xử lý / thời hạn yêu cầu hoàn thành hoặc gửi báo cáo được nêu trong văn bản theo định dạng "YYYY-MM-DDTHH:mm" (ví dụ: văn bản yêu cầu gửi trước ngày 10/11/2026 thì trả về "2026-11-10T17:00"). Nếu trong văn bản không nêu hạn hoàn thành cụ thể thì trả về "".
6. "priority": Độ khẩn của văn bản. Chỉ trả về 1 trong 3 giá trị:
   - "urgent" (nếu có dấu HỎA TỐC, THƯỢNG KHẨN, hoặc yêu cầu hoàn thành ngay trong ngày)
   - "important" (nếu có dấu KHẨN, hoặc nhấn mạnh đôn đốc quan trọng)
   - "normal" (văn bản thông thường)
7. "notes": Tóm tắt ngắn gọn (2 - 4 ý gạch đầu dòng bằng dấu "• ") về nhiệm vụ cụ thể cần xử lý, yêu cầu phối hợp, hoặc nội dung trọng tâm của văn bản để gửi tin nhắn Zalo giao việc cho người phụ trách.
8. "suggestedAssigneeHint": Tên cá nhân, phòng ban hoặc bộ phận được đề cập tại mục Nơi nhận / Giao nhiệm vụ (nếu có, dạng chuỗi ngắn gọn).`;

    parts.push({ text: systemPrompt });

    const textOutput = await this.callActiveAiForJson({
      parts,
      temperature: 0.1,
      responseSchema: {
        type: "OBJECT",
        properties: {
          docNumber: { type: "STRING" },
          issuer: { type: "STRING" },
          title: { type: "STRING" },
          receivedDate: { type: "STRING" },
          dueDate: { type: "STRING" },
          priority: {
            type: "STRING",
            enum: ["normal", "important", "urgent"],
          },
          notes: { type: "STRING" },
          suggestedAssigneeHint: { type: "STRING" },
        },
        required: [
          "docNumber",
          "issuer",
          "title",
          "receivedDate",
          "dueDate",
          "priority",
          "notes",
        ],
      },
    });
    if (!textOutput) {
      throw new Error("AI API không trả về dữ liệu trích xuất.");
    }

    let extracted = null;
    try {
      extracted = JSON.parse(textOutput);
    } catch (_) {
      // Fallback strip markdown code fences if any
      const cleaned = textOutput
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      extracted = JSON.parse(cleaned);
    }

    if (extracted && extracted.docNumber) {
      extracted.docNumber = cleanDocNumberString(extracted.docNumber);
    }

    return {
      success: true,
      fileName,
      extracted,
    };
  }

  async analyzeWebPageContent({
    pageUrl = "",
    pageTitle = "",
    pageText = "",
    screenshotBase64 = "",
    fileBase64 = "",
    fileMime = "",
    fileName = "",
  }) {
    const activeCfg = this.getActiveAiConfig();
    if (!activeCfg.apiKey) {
      throw new Error(
        "Chưa cấu hình API Key AI! Vui lòng bấm nút '⚙️' trên thanh công cụ để nhập API Key."
      );
    }

    const parts = [];

    // 1. Ưu tiên đính kèm trực tiếp tệp PDF gốc trích xuất từ PDF.js / Webview (chứa đầy đủ con dấu Số & Ngày tháng ký số)
    if (fileBase64) {
      const cleanFileB64 = String(fileBase64).replace(/^data:[^;]+;base64,/, "");
      if (cleanFileB64) {
        parts.push({
          inlineData: {
            mimeType: fileMime || "application/pdf",
            data: cleanFileB64,
          },
        });
      }
    }

    // 2. Đính kèm ảnh chụp màn hình trang web hiện tại
    if (screenshotBase64) {
      const cleanB64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
      if (cleanB64) {
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: cleanB64,
          },
        });
      }
    }

    // 3. Văn bản DOM trích xuất từ trang web và các iframe
    const trimmedText = String(pageText || "").slice(0, 45000).trim();
    if (trimmedText) {
      parts.push({
        text: `Dữ liệu văn bản trích xuất từ trang web Quản lý văn bản (${fileName ? `Tệp đang mở: ${fileName} | ` : ""}URL: ${pageUrl} | Tiêu đề: ${pageTitle}):\n\n${trimmedText}`,
      });
    }

    if (parts.length === 0) {
      throw new Error(
        "Không thu thập được nội dung hoặc hình ảnh từ trang web hiện tại."
      );
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    const systemPrompt = `Bạn là trợ lý AI chuyên đọc hiểu và bóc tách thông tin từ hệ thống Quản lý văn bản & Điều hành (như VNPT iOffice, Viettel vOffice, Egov, MISA, Cổng văn bản đến...) tại Việt Nam.
Hãy quan sát kỹ tệp PDF đính kèm (nếu có), ảnh chụp màn hình trang web và nội dung văn bản trên trang (ngày hệ thống hiện tại: ${todayStr}) để trích xuất thông tin của văn bản hành chính đang mở sang định dạng JSON.

⚠️ LƯU Ý ĐẶC BIỆT QUAN TRỌNG VỀ VĂN BẢN ĐƯỢC KÝ SỐ TRÊN WEB (PDF.js):
- Khi văn bản ký số hiển thị trên trình xem PDF.js của web, phần văn bản thô (text layer) thường bị khuyết số và ngày tháng (ví dụ chỉ có: "Số: /SKHCN - CĐS" và "ngày tháng năm 2026"), bởi vì con số công văn (ví dụ: "9785", "1917", "10698") và ngày tháng ban hành (ví dụ: "ngày 13 tháng 10", "ngày 02 tháng 11") được đóng dấu bằng HÌNH ẢNH (Stamp Annotation) lên góc trên Trang 1 của tệp PDF khi văn thư phát hành!
- Vì vậy, bạn BẮT BUỘC phải nhìn trực tiếp vào HÌNH ẢNH TRANG 1 của tệp PDF đính kèm và ảnh chụp màn hình (đồng thời đối chiếu với bảng thông tin văn bản đến, nội dung phần căn cứ hoặc chữ ký số) để đọc ĐẦY ĐỦ cả con số đứng trước dấu "/" lẫn ký hiệu đứng sau dấu "/".
- TUYỆT ĐỐI KHÔNG trả về "docNumber" chỉ có phần ký hiệu bắt đầu bằng dấu "/" (như "/SKHCN - CĐS"). Phải trả về đầy đủ số và ký hiệu (ví dụ: "9785/SKHCN-CĐS", "1917/VP-TH").

Chi tiết các trường JSON cần trích xuất:
1. "docNumber": Số và ký hiệu văn bản đầy đủ cả số lẫn ký hiệu, chuẩn hóa không có khoảng trắng thừa quanh dấu "/" và "-" (ví dụ: "9785/SKHCN-CĐS", "1917/VP-TH", "148/UBND-VX").
2. "issuer": Cơ quan, đơn vị ban hành văn bản (ví dụ: "Sở Khoa học và Công nghệ tỉnh An Giang", "Văn phòng UBND tỉnh An Giang"...).
3. "title": Trích yếu nội dung chính của văn bản (viết ngắn gọn, rõ ràng, chuẩn hành chính).
4. "receivedDate": Ngày ban hành văn bản (hoặc ngày đến) theo định dạng "YYYY-MM-DD" (đọc kỹ con dấu ngày/tháng đóng trên dòng "..., ngày ... tháng ... năm ..." ở góc phải đầu Trang 1 của PDF, hoặc thông tin ngày ban hành trên hệ thống, hoặc ngày ký số ở cuối văn bản; chuyển từ DD/MM/YYYY sang YYYY-MM-DD). Nếu không rõ để "".
5. "dueDate": Hạn xử lý / thời hạn hoàn thành được hiển thị trên hệ thống hoặc nêu trong nội dung văn bản theo định dạng "YYYY-MM-DDTHH:mm" (nếu chỉ có ngày DD/MM/YYYY thì thêm "T17:00" ở cuối, ví dụ "2026-11-10T17:00"). Nếu không có hạn cụ thể thì để "".
6. "priority": Độ khẩn của văn bản. Chỉ trả về 1 trong 3 giá trị:
   - "urgent" (Hỏa tốc, Thượng khẩn)
   - "important" (Khẩn, Quan trọng)
   - "normal" (Thường / Bình thường)
7. "notes": Tóm tắt ngắn gọn (2 - 4 dòng gạch đầu dòng bằng "• ") về Ý kiến chỉ đạo / bút phê của lãnh đạo trên hệ thống hoặc nội dung công việc trọng tâm cần xử lý để gửi tin nhắn Zalo giao việc.
8. "suggestedAssigneeHint": Tên chuyên viên, lãnh đạo hoặc phòng ban được phân công xử lý trên trang web hoặc nơi nhận (nếu có).`;

    parts.push({ text: systemPrompt });

    const textOutput = await this.callActiveAiForJson({
      parts,
      temperature: 0.1,
      responseSchema: {
        type: "OBJECT",
        properties: {
          docNumber: { type: "STRING" },
          issuer: { type: "STRING" },
          title: { type: "STRING" },
          receivedDate: { type: "STRING" },
          dueDate: { type: "STRING" },
          priority: {
            type: "STRING",
            enum: ["normal", "important", "urgent"],
          },
          notes: { type: "STRING" },
          suggestedAssigneeHint: { type: "STRING" },
        },
        required: [
          "docNumber",
          "issuer",
          "title",
          "receivedDate",
          "dueDate",
          "priority",
          "notes",
        ],
      },
    });
    if (!textOutput) {
      throw new Error("AI API không trả về dữ liệu trích xuất từ trang web.");
    }

    let extracted = null;
    try {
      extracted = JSON.parse(textOutput);
    } catch (_) {
      const cleaned = textOutput
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      extracted = JSON.parse(cleaned);
    }

    if (extracted && extracted.docNumber) {
      extracted.docNumber = cleanDocNumberString(extracted.docNumber);
    }

    return {
      success: true,
      pageUrl,
      pageTitle,
      extracted,
    };
  }

  /**
   * Đọc văn bản phản hồi của chuyên viên (từ File hoặc từ Trang Web),
   * trích xuất phần "Căn cứ / Thực hiện / Phúc đáp văn bản số..." của cấp trên,
   * và tự động đối chiếu khớp lệnh với danh sách nhiệm vụ đang xử lý.
   */
  async analyzeCompletionResponse({
    filePath = "",
    pageUrl = "",
    pageTitle = "",
    pageText = "",
    screenshotBase64 = "",
    fileBase64 = "",
    fileMime = "",
    fileName = "",
    activeDocs = [],
  }) {
    const activeCfg = this.getActiveAiConfig();
    if (!activeCfg.apiKey) {
      throw new Error(
        "Chưa cấu hình API Key AI! Vui lòng bấm nút '⚙️' trên thanh công cụ để nhập API Key."
      );
    }

    const parts = [];
    let rawTextForFallbackMatch = String(pageText || "");
    let sourceName = fileName || pageTitle || pageUrl || "Văn bản phản hồi";

    // 1. Nếu có filePath truyền vào (PDF, Ảnh, DOCX, TXT)
    if (filePath && fs.existsSync(filePath)) {
      const ext = path.extname(filePath).replace(".", "").toLowerCase();
      const fName = path.basename(filePath);
      sourceName = fName;
      const fileBuf = await fsp.readFile(filePath);

      const mimeMap = {
        pdf: "application/pdf",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
      };

      if (mimeMap[ext]) {
        parts.push({
          inlineData: {
            mimeType: mimeMap[ext],
            data: fileBuf.toString("base64"),
          },
        });
      } else if (ext === "docx") {
        const extractedText = extractTextFromDocxBuffer(fileBuf);
        rawTextForFallbackMatch += "\n" + extractedText;
        if (extractedText) {
          parts.push({
            text: `Nội dung văn bản phản hồi Word (${fName}):\n\n${extractedText}`,
          });
        }
      } else if (["txt", "md", "csv", "json", "xml", "html"].includes(ext)) {
        const txt = fileBuf.toString("utf-8");
        rawTextForFallbackMatch += "\n" + txt;
        parts.push({
          text: `Nội dung tệp văn bản phản hồi (${fName}):\n\n${txt}`,
        });
      }
    }

    // 2. Nếu có tệp PDF gốc trích xuất trực tiếp từ trình xem PDF.js trên Webview
    if (fileBase64) {
      const cleanFileB64 = String(fileBase64).replace(/^data:[^;]+;base64,/, "");
      if (cleanFileB64) {
        parts.push({
          inlineData: {
            mimeType: fileMime || "application/pdf",
            data: cleanFileB64,
          },
        });
      }
    }

    // 3. Nếu có ảnh chụp màn hình trang web
    if (screenshotBase64) {
      const cleanB64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
      if (cleanB64) {
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: cleanB64,
          },
        });
      }
    }

    // 4. Nếu có văn bản trích xuất từ DOM trang web
    const trimmedPageText = String(pageText || "").slice(0, 45000).trim();
    if (trimmedPageText) {
      parts.push({
        text: `Nội dung hiển thị trên trang web (${pageTitle || pageUrl}):\n${trimmedPageText}`,
      });
    }

    if (parts.length === 0) {
      throw new Error(
        "Không tìm thấy dữ liệu tệp hoặc nội dung trang web của văn bản phản hồi."
      );
    }

    const tasksSummaryLines = activeDocs.map(
      (d) =>
        `- ID: "${d.id}" | Số/Ký hiệu cấp trên: "${d.docNumber}" | Cơ quan ban hành: "${
          d.issuer || ""
        }" | Trích yếu: "${d.title || ""}" | Trạng thái hiện tại: ${
          d.status === "completed" ? "Đã xử lý" : "Chưa hoàn thành"
        }`
    );

    const systemPrompt = `Bạn là trợ lý AI chuyên đối chiếu và khớp lệnh hoàn thành văn bản hành chính tại Việt Nam.
Tài liệu đính kèm là VĂN BẢN PHẢN HỒI / BÁO CÁO / CÔNG VĂN TRẢ LỜI do chuyên viên các phòng soạn thảo (có thể đã được ký số ban hành).
⚠️ LƯU Ý VỀ VĂN BẢN KÝ SỐ: Phần Số và Ngày tháng của văn bản phản hồi thường được đóng dấu hình ảnh (Stamp) ở góc trái/phải đầu Trang 1 của tệp PDF (trong khi lớp text có thể chỉ hiện "Số: /VP-TH"). Hãy nhìn trực tiếp vào hình ảnh Trang 1 của tệp PDF để đọc đầy đủ cả Số lẫn Ký hiệu của văn bản phản hồi (ví dụ: "1917/VP-TH").

Trong văn bản hành chính Việt Nam, phần mở đầu (phần căn cứ) luôn nêu rõ văn bản của cấp trên mà văn bản này thực hiện hoặc phúc đáp, ví dụ:
- "Thực hiện Công văn số 9785/SKHCN-CĐS ngày 13/10/2026 của Sở Khoa học và Công nghệ..."
- "Căn cứ Kế hoạch/Thông báo/Công văn số 148/UBND-VX..."
- "Phúc đáp Công văn số ..."

Dưới đây là DANH SÁCH NHIỆM VỤ (VĂN BẢN CẤP TRÊN) đang lưu trong phần mềm:
${
  tasksSummaryLines.length > 0
    ? tasksSummaryLines.join("\n")
    : "(Hiện chưa có nhiệm vụ nào)"
}

Hãy đọc kỹ văn bản phản hồi của chuyên viên và trả về JSON theo cấu trúc sau:
1. "responseDocNumber": Số và ký hiệu đầy đủ của chính văn bản phản hồi này (đọc cả con số đóng dấu trước dấu "/", ví dụ: "1917/VP-TH", "45/BC-TCKT", nếu chưa có số mới ghi "Dự thảo" hoặc ký hiệu).
2. "responseTitle": Trích yếu nội dung của văn bản phản hồi này.
3. "referencedSuperiorDocNumbers": Mảng liệt kê TẤT CẢ các Số/Ký hiệu văn bản cấp trên được nhắc tới trong phần Căn cứ / Thực hiện / Phúc đáp của văn bản phản hồi (chuẩn hóa không cách thừa quanh dấu "/" và "-", ví dụ: ["9785/SKHCN-CĐS", "148/UBND-VX"]).
4. "basisExcerpt": Trích dẫn nguyên văn câu văn có chứa phần căn cứ văn bản cấp trên trong tài liệu của chuyên viên (ví dụ: "Thực hiện Công văn số 9785/SKHCN-CĐS ngày 13/10/2026 của Sở Khoa học và Công nghệ về việc...").
5. "matchedTaskId": So sánh các số/ký hiệu trong "referencedSuperiorDocNumbers" với cột "Số/Ký hiệu cấp trên" trong DANH SÁCH NHIỆM VỤ ở trên. Nếu tìm thấy nhiệm vụ trùng khớp Số/Ký hiệu (hoặc trùng phần ký hiệu và trích yếu tương ứng), hãy trả về chính xác "ID" của nhiệm vụ đó. Nếu không khớp nhiệm vụ nào thì trả về "".
6. "matchConfidence": Trả về "exact" nếu khớp chính xác Số/Ký hiệu văn bản cấp trên; "partial" nếu khớp một phần; "none" nếu không tìm thấy nhiệm vụ khớp.
7. "completionNote": Viết 1 đoạn ghi chú kết quả hoàn thành rõ ràng để lưu vào nhiệm vụ (ví dụ: "Đã hoàn thành bằng văn bản phản hồi số 1917/VP-TH (Căn cứ CV số 9785/SKHCN-CĐS): [Tóm tắt ngắn gọn kết quả xử lý của chuyên viên]").`;

    parts.push({ text: systemPrompt });

    const textOutput = await this.callActiveAiForJson({
      parts,
      temperature: 0.1,
      responseSchema: {
        type: "OBJECT",
        properties: {
          responseDocNumber: { type: "STRING" },
          responseTitle: { type: "STRING" },
          referencedSuperiorDocNumbers: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          basisExcerpt: { type: "STRING" },
          matchedTaskId: { type: "STRING" },
          matchConfidence: {
            type: "STRING",
            enum: ["exact", "partial", "none"],
          },
          completionNote: { type: "STRING" },
        },
        required: [
          "responseDocNumber",
          "responseTitle",
          "referencedSuperiorDocNumbers",
          "basisExcerpt",
          "matchedTaskId",
          "matchConfidence",
          "completionNote",
        ],
      },
    });
    if (!textOutput) {
      throw new Error("AI API không trả về kết quả đối chiếu văn bản phản hồi.");
    }

    let extracted = null;
    try {
      extracted = JSON.parse(textOutput);
    } catch (_) {
      const cleaned = textOutput
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      extracted = JSON.parse(cleaned);
    }

    if (extracted) {
      if (extracted.responseDocNumber) {
        extracted.responseDocNumber = cleanDocNumberString(
          extracted.responseDocNumber
        );
      }
      if (Array.isArray(extracted.referencedSuperiorDocNumbers)) {
        extracted.referencedSuperiorDocNumbers =
          extracted.referencedSuperiorDocNumbers
            .map(cleanDocNumberString)
            .filter(Boolean);
      }
    }

    // Thuật toán đối chiếu chuẩn hóa Số/Ký hiệu (Deterministic Normalization Verification)
    const normCode = (str) =>
      String(str || "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[-–—]/g, "-")
        .trim();

    const refList = Array.isArray(extracted.referencedSuperiorDocNumbers)
      ? extracted.referencedSuperiorDocNumbers
      : [];
    const normRefs = refList.map(normCode).filter(Boolean);
    const normRawText = normCode(rawTextForFallbackMatch);

    // Ưu tiên tìm các nhiệm vụ chưa hoàn thành trước, nếu không có mới xét nhiệm vụ đã hoàn thành
    const sortedCandidates = [...activeDocs].sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (a.status !== "completed" && b.status === "completed") return -1;
      return 0;
    });

    let verifiedTask = null;
    if (extracted.matchedTaskId) {
      verifiedTask = activeDocs.find((d) => d.id === extracted.matchedTaskId) || null;
    }

    // Kiểm tra khớp chính xác bằng mã chuẩn hóa giữa referencedSuperiorDocNumbers và docNumber của nhiệm vụ
    for (const doc of sortedCandidates) {
      const docCode = normCode(doc.docNumber);
      if (!docCode) continue;
      const isExactRef = normRefs.some(
        (r) => r === docCode || r.includes(docCode) || docCode.includes(r)
      );
      const isInRawText = docCode.length >= 4 && normRawText.includes(docCode);
      if (isExactRef || isInRawText) {
        verifiedTask = doc;
        extracted.matchedTaskId = doc.id;
        extracted.matchConfidence = "exact";
        break;
      }
    }

    return {
      success: true,
      sourceName,
      extracted,
      matchedTask: verifiedTask,
    };
  }
}

module.exports = {
  GeminiService,
  extractTextFromDocxBuffer,
  callGeminiRestApi,
  renderPdfToPngPages,
};
