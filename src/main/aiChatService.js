const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { extractTextFromDocxBuffer } = require("./geminiService");

const COPILOT_PRESETS = [
  {
    id: "default",
    name: "🤖 Trợ lý AI Đa năng",
    description: "Hỏi đáp chung, phân tích tài liệu, viết nội dung chuẩn Chatbox",
    systemPrompt:
      "Bạn là trợ lý AI thông minh, chính xác và tận tâm (tích hợp trong ứng dụng zOffice). Hãy trả lời bằng tiếng Việt rõ ràng, mạch lạc, có cấu trúc Markdown dễ đọc.",
  },
  {
    id: "admin_vn",
    name: "📋 Chuyên gia Hành chính (NĐ 30)",
    description: "Rà soát thể thức, kỹ thuật trình bày văn bản theo Nghị định 30/2020/NĐ-CP",
    systemPrompt:
      "Bạn là chuyên gia văn thư - hành chính công tại Việt Nam, am hiểu sâu Nghị định 30/2020/NĐ-CP về công tác văn thư. Hãy hỗ trợ rà soát thể thức, số ký hiệu, thẩm quyền ký, văn phong hành chính chuẩn mực và súc tích.",
  },
  {
    id: "drafter",
    name: "✍️ Soạn thảo Công văn / Tờ trình",
    description: "Soạn công văn phúc đáp, báo cáo, tờ trình, kế hoạch chuyên nghiệp",
    systemPrompt:
      "Bạn là chuyên viên tổng hợp cao cấp chuyên soạn thảo Công văn, Tờ trình, Báo cáo, Thông báo cho cơ quan nhà nước và doanh nghiệp Việt Nam. Khi soạn thảo, luôn trình bày đủ Quốc hiệu, Tiêu ngữ, phần Căn cứ (nếu có văn bản cấp trên), nội dung rõ ràng và phần Nơi nhận chuẩn xác.",
  },
  {
    id: "task_analyst",
    name: "📊 Tổng hợp Tiến độ & Đôn đốc",
    description: "Phân tích danh sách văn bản đang xử lý, quá hạn, gợi ý nhắc việc Zalo",
    systemPrompt:
      "Bạn là trợ lý điều phối công việc. Dựa trên danh sách văn bản và hạn xử lý được cung cấp, hãy phân tích mức độ ưu tiên (Hỏa tốc, Khẩn, Quá hạn), liệt kê đầu việc trọng tâm cho từng người phụ trách và soạn sẵn mẫu tin nhắn Zalo đôn đốc ngắn gọn, lịch sự.",
  },
];

const PROVIDER_CATALOG = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    models: [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-2.5-flash-lite",
    ],
  },
  openai: {
    id: "openai",
    label: "ChatGPT / OpenAI",
    defaultModel: "gpt-4o-mini",
    defaultBaseUrl: "https://api.openai.com/v1",
    models: [
      "gpt-4o-mini",
      "gpt-4o",
      "gpt-4.1-mini",
      "gpt-4.1",
      "o3-mini",
      "o4-mini",
    ],
  },
  claude: {
    id: "claude",
    label: "Anthropic Claude",
    defaultModel: "claude-sonnet-4-20250514",
    defaultBaseUrl: "https://api.anthropic.com",
    models: [
      "claude-sonnet-4-20250514",
      "claude-3-7-sonnet-latest",
      "claude-3-5-haiku-latest",
    ],
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    defaultModel: "deepseek-chat",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  ollama: {
    id: "ollama",
    label: "Ollama (Chạy AI Local)",
    defaultModel: "llama3.2",
    defaultBaseUrl: "http://127.0.0.1:11434",
    models: ["llama3.2", "qwen2.5", "gemma3", "deepseek-r1"],
  },
};

function requestJsonGet(url, headers = {}, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = getRequestClient(urlObj);
    const req = client.get(
      urlObj,
      {
        headers: {
          Accept: "application/json",
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch (_) {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              return reject(
                new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 300)}`)
              );
            }
            return reject(new Error("Phản hồi API không phải JSON hợp lệ."));
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const msg =
              parsed?.error?.message ||
              parsed?.message ||
              parsed?.error ||
              raw;
            return reject(
              new Error(`HTTP ${res.statusCode}: ${String(msg).slice(0, 300)}`)
            );
          }
          resolve(parsed);
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("Hết thời gian kết nối tới API (12s)."));
    });
    req.on("error", (err) => {
      reject(new Error(`Lỗi kết nối API: ${err.message}`));
    });
  });
}

function parseProviderModelsResponse(provider, parsed, baseUrl = "") {
  const unique = (arr) => Array.from(new Set(arr.filter(Boolean)));

  if (provider === "gemini") {
    const rawList = Array.isArray(parsed?.models) ? parsed.models : [];
    const models = rawList
      .filter((m) => {
        const methods = m?.supportedGenerationMethods;
        if (Array.isArray(methods) && methods.length > 0) {
          return methods.includes("generateContent");
        }
        return true;
      })
      .map((m) => String(m?.name || "").replace(/^models\//, "").trim())
      .filter((id) => id && !/embedding|aqa|imagen|veo/i.test(id));
    return unique(models);
  }

  if (provider === "openai" || provider === "deepseek") {
    const rawList = Array.isArray(parsed?.data)
      ? parsed.data
      : Array.isArray(parsed?.models)
      ? parsed.models
      : [];
    const isOfficialOpenAi =
      provider === "openai" && /api\.openai\.com/i.test(String(baseUrl || ""));
    const models = rawList
      .map((m) => String(m?.id || m?.name || "").trim())
      .filter((id) => {
        if (!id) return false;
        if (!isOfficialOpenAi) return true;
        return !/^(text-embedding|embedding|tts-|whisper-|dall-e|babbage|davinci|omni-moderation|text-moderation|gpt-image|sora)/i.test(
          id
        );
      })
      .sort((a, b) => a.localeCompare(b));
    return unique(models);
  }

  if (provider === "claude") {
    const rawList = Array.isArray(parsed?.data) ? parsed.data : [];
    const models = rawList
      .map((m) => String(m?.id || m?.name || "").trim())
      .filter(Boolean);
    return unique(models);
  }

  if (provider === "ollama") {
    const rawList = Array.isArray(parsed?.models) ? parsed.models : [];
    return unique(rawList.map((m) => String(m?.name || "").trim()));
  }

  return [];
}

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "xml",
  "html",
  "htm",
  "log",
  "js",
  "ts",
  "py",
  "css",
  "yaml",
  "yml",
]);

const IMAGE_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function getRequestClient(urlObj) {
  return urlObj.protocol === "http:" ? http : https;
}

function normalizeBaseUrl(raw, fallback) {
  const s = String(raw || fallback || "").trim();
  return s.replace(/\/+$/, "");
}

class AiChatService {
  constructor(dataDir, geminiService) {
    this.dataDir = dataDir;
    this.geminiService = geminiService;
    this.chatsPath = path.join(dataDir, "ai-chats.json");
    this.settingsPath = path.join(dataDir, "ai-chat-settings.json");
    this.activeStreams = new Map();
    this.settings = this.loadSettings();
    this.store = this.loadStore();
  }

  loadSettings() {
    const gemKey = String(this.geminiService?.settings?.geminiApiKey || "").trim();
    const gemModel = String(
      this.geminiService?.settings?.geminiModel || "gemini-2.5-flash"
    ).trim();

    const defaults = {
      defaultProvider: "gemini",
      temperature: 0.7,
      maxContextMessages: 14,
      gemini: {
        apiKey: gemKey,
        model: gemModel || "gemini-2.5-flash",
      },
      openai: {
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
      },
      claude: {
        apiKey: "",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-20250514",
      },
      deepseek: {
        apiKey: "",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
      },
      ollama: {
        baseUrl: "http://127.0.0.1:11434",
        model: "llama3.2",
      },
      loadedModels: {
        gemini: [],
        openai: [],
        claude: [],
        deepseek: [],
        ollama: [],
      },
    };

    try {
      if (fs.existsSync(this.settingsPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.settingsPath, "utf-8"));
        return {
          ...defaults,
          ...parsed,
          temperature:
            typeof parsed.temperature === "number"
              ? parsed.temperature
              : defaults.temperature,
          maxContextMessages:
            Number(parsed.maxContextMessages) > 0
              ? Number(parsed.maxContextMessages)
              : defaults.maxContextMessages,
          gemini: {
            ...defaults.gemini,
            ...(parsed.gemini || {}),
            apiKey: gemKey || parsed.gemini?.apiKey || "",
            model: parsed.gemini?.model || gemModel || "gemini-2.5-flash",
          },
          openai: {
            ...defaults.openai,
            ...(parsed.openai || {}),
            baseUrl: normalizeBaseUrl(
              parsed.openai?.baseUrl,
              defaults.openai.baseUrl
            ),
          },
          claude: {
            ...defaults.claude,
            ...(parsed.claude || {}),
            baseUrl: normalizeBaseUrl(
              parsed.claude?.baseUrl,
              defaults.claude.baseUrl
            ),
          },
          deepseek: {
            ...defaults.deepseek,
            ...(parsed.deepseek || {}),
            baseUrl: normalizeBaseUrl(
              parsed.deepseek?.baseUrl,
              defaults.deepseek.baseUrl
            ),
          },
          ollama: {
            ...defaults.ollama,
            ...(parsed.ollama || {}),
            baseUrl: normalizeBaseUrl(
              parsed.ollama?.baseUrl,
              defaults.ollama.baseUrl
            ),
          },
          loadedModels: {
            ...defaults.loadedModels,
            ...(parsed.loadedModels || {}),
          },
        };
      }
    } catch (err) {
      console.error("Failed to read ai-chat-settings.json:", err);
    }

    return defaults;
  }

  saveSettings(newSettings = {}) {
    const merged = {
      ...this.settings,
      defaultProvider:
        newSettings.defaultProvider || this.settings.defaultProvider || "gemini",
      temperature:
        newSettings.temperature !== undefined
          ? Math.max(0, Math.min(2, Number(newSettings.temperature) || 0.7))
          : this.settings.temperature,
      maxContextMessages:
        newSettings.maxContextMessages !== undefined
          ? Math.max(2, Math.min(40, Number(newSettings.maxContextMessages) || 14))
          : this.settings.maxContextMessages,
      gemini: {
        ...this.settings.gemini,
        ...(newSettings.gemini || {}),
      },
      openai: {
        ...this.settings.openai,
        ...(newSettings.openai || {}),
      },
      claude: {
        ...this.settings.claude,
        ...(newSettings.claude || {}),
      },
      deepseek: {
        ...this.settings.deepseek,
        ...(newSettings.deepseek || {}),
      },
      ollama: {
        ...this.settings.ollama,
        ...(newSettings.ollama || {}),
      },
      loadedModels: {
        ...(this.settings.loadedModels || {}),
        ...(newSettings.loadedModels || {}),
      },
    };

    merged.gemini.apiKey = String(merged.gemini.apiKey || "").trim();
    merged.gemini.model = String(merged.gemini.model || "gemini-2.5-flash").trim();
    merged.openai.apiKey = String(merged.openai.apiKey || "").trim();
    merged.openai.baseUrl = normalizeBaseUrl(
      merged.openai.baseUrl,
      "https://api.openai.com/v1"
    );
    merged.openai.model = String(merged.openai.model || "gpt-4o-mini").trim();
    merged.claude.apiKey = String(merged.claude.apiKey || "").trim();
    merged.claude.baseUrl = normalizeBaseUrl(
      merged.claude.baseUrl,
      "https://api.anthropic.com"
    );
    merged.claude.model = String(
      merged.claude.model || "claude-sonnet-4-20250514"
    ).trim();
    merged.deepseek.apiKey = String(merged.deepseek.apiKey || "").trim();
    merged.deepseek.baseUrl = normalizeBaseUrl(
      merged.deepseek.baseUrl,
      "https://api.deepseek.com/v1"
    );
    merged.deepseek.model = String(
      merged.deepseek.model || "deepseek-chat"
    ).trim();
    merged.ollama.baseUrl = normalizeBaseUrl(
      merged.ollama.baseUrl,
      "http://127.0.0.1:11434"
    );
    merged.ollama.model = String(merged.ollama.model || "llama3.2").trim();

    this.settings = merged;
    fs.writeFileSync(
      this.settingsPath,
      JSON.stringify(this.settings, null, 2),
      "utf-8"
    );

    // Đồng bộ Gemini API Key & Model sang GeminiService để dùng chung trong toàn bộ app
    if (this.geminiService && newSettings.gemini) {
      this.geminiService.saveSettings({
        geminiApiKey: merged.gemini.apiKey,
        geminiModel: merged.gemini.model,
      });
    }

    return this.getPublicSettings();
  }

  getPublicSettings() {
    // Luôn ưu tiên đồng bộ nếu user vừa đổi API key ở Cài đặt AI Gemini chung
    const sharedGemKey = String(
      this.geminiService?.settings?.geminiApiKey || ""
    ).trim();
    if (sharedGemKey && sharedGemKey !== this.settings.gemini.apiKey) {
      this.settings.gemini.apiKey = sharedGemKey;
    }

    return {
      ...this.settings,
      providersCatalog: PROVIDER_CATALOG,
    };
  }

  loadStore() {
    try {
      if (fs.existsSync(this.chatsPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.chatsPath, "utf-8"));
        if (parsed && Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
          return {
            activeSessionId:
              parsed.activeSessionId || parsed.sessions[0].id,
            sessions: parsed.sessions,
          };
        }
      }
    } catch (err) {
      console.error("Failed to read ai-chats.json:", err);
    }

    const first = this.buildNewSession();
    const initial = {
      activeSessionId: first.id,
      sessions: [first],
    };
    this.saveStore(initial);
    return initial;
  }

  saveStore(storeObj = this.store) {
    this.store = storeObj;
    fs.writeFileSync(
      this.chatsPath,
      JSON.stringify(this.store, null, 2),
      "utf-8"
    );
  }

  buildNewSession(opts = {}) {
    const nowIso = new Date().toISOString();
    const preset =
      COPILOT_PRESETS.find((p) => p.id === opts.copilotId) ||
      COPILOT_PRESETS[0];

    return {
      id: makeId("chat"),
      title: String(opts.title || "Cuộc trò chuyện mới").trim(),
      pinned: false,
      copilotId: preset.id,
      systemPrompt:
        opts.systemPrompt !== undefined
          ? String(opts.systemPrompt)
          : preset.systemPrompt,
      provider: opts.provider || this.settings.defaultProvider || "gemini",
      model: opts.model || "",
      contextMode: opts.contextMode || "active_docs", // none | active_docs | all_docs | single_doc
      contextDocId: opts.contextDocId || "",
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: [],
    };
  }

  getState() {
    return {
      activeSessionId: this.store.activeSessionId,
      sessions: this.store.sessions,
      settings: this.getPublicSettings(),
      copilotPresets: COPILOT_PRESETS,
    };
  }

  createSession(opts = {}) {
    const session = this.buildNewSession(opts);
    this.store.sessions.unshift(session);
    this.store.activeSessionId = session.id;
    this.saveStore();
    return {
      session,
      state: this.getState(),
    };
  }

  updateSession(sessionId, patch = {}) {
    const idx = this.store.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) {
      throw new Error("Không tìm thấy cuộc trò chuyện.");
    }
    const existing = this.store.sessions[idx];
    const updated = {
      ...existing,
      title:
        patch.title !== undefined
          ? String(patch.title || "Cuộc trò chuyện mới").trim()
          : existing.title,
      pinned: patch.pinned !== undefined ? Boolean(patch.pinned) : existing.pinned,
      copilotId:
        patch.copilotId !== undefined ? patch.copilotId : existing.copilotId,
      systemPrompt:
        patch.systemPrompt !== undefined
          ? String(patch.systemPrompt)
          : existing.systemPrompt,
      provider: patch.provider !== undefined ? patch.provider : existing.provider,
      model: patch.model !== undefined ? patch.model : existing.model,
      contextMode:
        patch.contextMode !== undefined
          ? patch.contextMode
          : existing.contextMode,
      contextDocId:
        patch.contextDocId !== undefined
          ? patch.contextDocId
          : existing.contextDocId,
      updatedAt: new Date().toISOString(),
    };

    this.store.sessions[idx] = updated;
    if (patch.setActive) {
      this.store.activeSessionId = sessionId;
    }
    this.saveStore();
    return {
      session: updated,
      state: this.getState(),
    };
  }

  setActiveSession(sessionId) {
    if (this.store.sessions.some((s) => s.id === sessionId)) {
      this.store.activeSessionId = sessionId;
      this.saveStore();
    }
    return this.getState();
  }

  deleteSession(sessionId) {
    this.store.sessions = this.store.sessions.filter((s) => s.id !== sessionId);
    if (this.store.sessions.length === 0) {
      const fresh = this.buildNewSession();
      this.store.sessions.push(fresh);
      this.store.activeSessionId = fresh.id;
    } else if (this.store.activeSessionId === sessionId) {
      this.store.activeSessionId = this.store.sessions[0].id;
    }
    this.saveStore();
    return this.getState();
  }

  clearSessionMessages(sessionId) {
    const idx = this.store.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) throw new Error("Không tìm thấy cuộc trò chuyện.");
    this.store.sessions[idx].messages = [];
    this.store.sessions[idx].updatedAt = new Date().toISOString();
    this.saveStore();
    return {
      session: this.store.sessions[idx],
      state: this.getState(),
    };
  }

  deleteMessage(sessionId, messageId) {
    const idx = this.store.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) throw new Error("Không tìm thấy cuộc trò chuyện.");
    this.store.sessions[idx].messages = this.store.sessions[idx].messages.filter(
      (m) => m.id !== messageId
    );
    this.store.sessions[idx].updatedAt = new Date().toISOString();
    this.saveStore();
    return {
      session: this.store.sessions[idx],
      state: this.getState(),
    };
  }

  stopStream(streamId) {
    const entry = this.activeStreams.get(streamId);
    if (entry) {
      entry.aborted = true;
      try {
        entry.abort();
      } catch (_) {}
      this.activeStreams.delete(streamId);
      return { stopped: true };
    }
    return { stopped: false };
  }

  buildDocumentsContextText(session, docs = []) {
    const mode = session.contextMode || "none";
    if (mode === "none" || !Array.isArray(docs) || docs.length === 0) {
      return "";
    }

    const nowMs = Date.now();
    const formatDocLine = (d) => {
      const dueMs = d.dueDate ? new Date(d.dueDate).getTime() : NaN;
      const isOverdue =
        d.status !== "completed" && !Number.isNaN(dueMs) && dueMs < nowMs;
      const statusLabel =
        d.status === "completed"
          ? "Đã xử lý"
          : isOverdue
          ? "QUÁ HẠN"
          : "Đang xử lý";
      const assignees = Array.isArray(d.assignees)
        ? d.assignees.map((a) => a.displayName).filter(Boolean).join(", ")
        : "";
      const attNames = Array.isArray(d.attachments)
        ? d.attachments.map((a) => a.name).filter(Boolean).join(", ")
        : "";

      return [
        `- Số/KH: ${d.docNumber || "(Chưa rõ)"} | Trạng thái: ${statusLabel} | Độ khẩn: ${d.priority || "normal"}`,
        `  Trích yếu: ${d.title || ""}`,
        d.issuer ? `  Cơ quan ban hành: ${d.issuer}` : "",
        d.receivedDate ? `  Ngày ban hành/nhận: ${d.receivedDate}` : "",
        d.dueDate ? `  Hạn xử lý: ${d.dueDate}` : "",
        assignees ? `  Người phụ trách (Zalo): ${assignees}` : "",
        d.notes ? `  Ghi chú/Chỉ đạo: ${d.notes}` : "",
        d.completionNote ? `  Kết quả hoàn thành: ${d.completionNote}` : "",
        attNames ? `  Tệp đính kèm: ${attNames}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    };

    if (mode === "single_doc" && session.contextDocId) {
      const target = docs.find((d) => d.id === session.contextDocId);
      if (!target) return "";
      return `=== VĂN BẢN / NHIỆM VỤ ĐƯỢC CHỌN LÀM NGỮ CẢNH ===\n${formatDocLine(
        target
      )}`;
    }

    let selected = docs;
    let label = "TẤT CẢ VĂN BẢN TRONG PHẦN MỀM";
    if (mode === "active_docs") {
      selected = docs.filter((d) => d.status !== "completed");
      label = "DANH SÁCH VĂN BẢN ĐANG XỬ LÝ & QUÁ HẠN";
    }

    const lines = selected.slice(0, 40).map(formatDocLine);
    return `=== ${label} (Tổng: ${selected.length}, thời điểm hiện tại: ${new Date().toLocaleString(
      "vi-VN"
    )}) ===\n${lines.length ? lines.join("\n\n") : "(Không có văn bản nào)"}`;
  }

  async readAttachmentPayload(att) {
    if (!att || !att.path || !fs.existsSync(att.path)) {
      return { kind: "missing", name: att?.name || "file" };
    }
    const ext = (
      att.ext || path.extname(att.path).replace(".", "")
    ).toLowerCase();
    const name = att.name || path.basename(att.path);
    const stat = await fsp.stat(att.path);
    if (stat.size > 20 * 1024 * 1024) {
      return {
        kind: "text",
        name,
        text: `[Tệp ${name} vượt quá 20MB nên chỉ đính kèm tên tệp]`,
      };
    }

    const buf = await fsp.readFile(att.path);
    if (IMAGE_MIME[ext]) {
      return {
        kind: "image",
        name,
        mimeType: IMAGE_MIME[ext],
        base64: buf.toString("base64"),
      };
    }
    if (ext === "pdf") {
      return {
        kind: "pdf",
        name,
        mimeType: "application/pdf",
        base64: buf.toString("base64"),
      };
    }
    if (ext === "docx") {
      const extracted = extractTextFromDocxBuffer(buf);
      return {
        kind: "text",
        name,
        text: extracted
          ? `--- Nội dung tệp Word "${name}" ---\n${extracted.slice(0, 40000)}`
          : `[Không đọc được nội dung văn bản từ tệp Word "${name}"]`,
      };
    }
    if (TEXT_EXTENSIONS.has(ext)) {
      return {
        kind: "text",
        name,
        text: `--- Nội dung tệp "${name}" ---\n${buf
          .toString("utf-8")
          .slice(0, 40000)}`,
      };
    }
    return {
      kind: "text",
      name,
      text: `[Tệp đính kèm "${name}" (.${ext}), kích thước ${stat.size} bytes]`,
    };
  }

  resolveProviderAndModel(session, overrideProvider, overrideModel) {
    const provider =
      overrideProvider ||
      session.provider ||
      this.settings.defaultProvider ||
      "gemini";
    const provCfg = this.settings[provider] || {};
    const catalog = PROVIDER_CATALOG[provider] || PROVIDER_CATALOG.gemini;
    const model = String(
      overrideModel ||
        (provider === session.provider ? session.model : "") ||
        provCfg.model ||
        catalog.defaultModel
    ).trim();
    return { provider, model };
  }

  async sendMessage({
    sessionId,
    userText = "",
    attachments = [],
    quotedText = "",
    regenerateMessageId = "",
    provider: overrideProvider = "",
    model: overrideModel = "",
    docs = [],
    onEvent = () => {},
  }) {
    const idx = this.store.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) {
      throw new Error("Không tìm thấy cuộc trò chuyện.");
    }

    const session = this.store.sessions[idx];
    const { provider, model } = this.resolveProviderAndModel(
      session,
      overrideProvider,
      overrideModel
    );

    if (overrideProvider) session.provider = provider;
    if (overrideModel) session.model = model;

    // Nếu là Regenerate: xóa từ tin nhắn assistant đó trở đi và dùng lại tin nhắn user trước đó
    if (regenerateMessageId) {
      const msgIdx = session.messages.findIndex(
        (m) => m.id === regenerateMessageId
      );
      if (msgIdx >= 0) {
        session.messages = session.messages.slice(0, msgIdx);
      }
    } else {
      const cleanUserText = String(userText || "").trim();
      if (!cleanUserText && (!attachments || attachments.length === 0)) {
        throw new Error("Vui lòng nhập nội dung tin nhắn hoặc đính kèm tệp.");
      }
      const userMsg = {
        id: makeId("msg"),
        role: "user",
        content: cleanUserText,
        quotedText: String(quotedText || "").trim(),
        attachments: (attachments || []).map((a) => ({
          id: a.id || makeId("att"),
          name: a.name || path.basename(a.path || "file"),
          path: a.path,
          size: a.size || 0,
          ext:
            a.ext ||
            path.extname(a.path || "").replace(".", "").toLowerCase(),
        })),
        createdAt: new Date().toISOString(),
      };
      session.messages.push(userMsg);

      // Tự đặt tiêu đề cuộc trò chuyện từ câu hỏi đầu tiên (giống Chatbox)
      if (
        session.messages.length === 1 &&
        (!session.title || session.title === "Cuộc trò chuyện mới")
      ) {
        const autoTitle =
          cleanUserText ||
          (attachments?.[0]?.name ? `Phân tích ${attachments[0].name}` : "Cuộc trò chuyện mới");
        session.title = autoTitle.replace(/\s+/g, " ").slice(0, 46);
      }
    }

    // Tạo message placeholder của assistant để stream từng token
    const assistantMsg = {
      id: makeId("msg"),
      role: "assistant",
      content: "",
      provider,
      model,
      createdAt: new Date().toISOString(),
      streaming: true,
    };
    session.messages.push(assistantMsg);
    session.updatedAt = new Date().toISOString();
    this.saveStore();

    const streamId = makeId("stream");
    onEvent({
      type: "start",
      streamId,
      sessionId: session.id,
      messageId: assistantMsg.id,
      session,
    });

    // Chuẩn bị ngữ cảnh hệ thống + lịch sử chat
    const contextText = this.buildDocumentsContextText(session, docs);
    const fullSystemPrompt = [
      String(session.systemPrompt || "").trim(),
      contextText,
    ]
      .filter(Boolean)
      .join("\n\n");

    // Nếu user chọn 1 văn bản cụ thể làm ngữ cảnh và tin nhắn đầu chưa đính kèm file của VB đó -> tự đọc đính kèm text/pdf từ văn bản đó nếu có
    let extraContextAttachments = [];
    if (
      session.contextMode === "single_doc" &&
      session.contextDocId &&
      session.messages.filter((m) => m.role === "user").length === 1
    ) {
      const targetDoc = docs.find((d) => d.id === session.contextDocId);
      if (targetDoc && Array.isArray(targetDoc.attachments)) {
        extraContextAttachments = targetDoc.attachments.slice(0, 2);
      }
    }

    const maxHist = Number(this.settings.maxContextMessages) || 14;
    const historySlice = session.messages
      .slice(0, -1) // bỏ assistantMsg rỗng đang stream
      .slice(-maxHist);

    try {
      const preparedHistory = [];
      for (let i = 0; i < historySlice.length; i++) {
        const m = historySlice[i];
        const attList =
          i === historySlice.length - 1 &&
          m.role === "user" &&
          extraContextAttachments.length > 0
            ? [...(m.attachments || []), ...extraContextAttachments]
            : m.attachments || [];

        const parsedAttachments = [];
        for (const att of attList) {
          parsedAttachments.push(await this.readAttachmentPayload(att));
        }

        let textContent = String(m.content || "");
        if (m.quotedText) {
          textContent = `> Trích dẫn: "${m.quotedText}"\n\n${textContent}`;
        }

        preparedHistory.push({
          role: m.role,
          text: textContent,
          attachments: parsedAttachments,
        });
      }

      const emitDelta = (chunkText) => {
        if (!chunkText) return;
        assistantMsg.content += chunkText;
        onEvent({
          type: "delta",
          streamId,
          sessionId: session.id,
          messageId: assistantMsg.id,
          delta: chunkText,
        });
      };

      if (provider === "gemini") {
        await this.streamGemini({
          model,
          systemPrompt: fullSystemPrompt,
          history: preparedHistory,
          streamId,
          onDelta: emitDelta,
        });
      } else if (provider === "openai" || provider === "deepseek") {
        await this.streamOpenAICompat({
          providerKey: provider,
          model,
          systemPrompt: fullSystemPrompt,
          history: preparedHistory,
          streamId,
          onDelta: emitDelta,
        });
      } else if (provider === "claude") {
        await this.streamClaude({
          model,
          systemPrompt: fullSystemPrompt,
          history: preparedHistory,
          streamId,
          onDelta: emitDelta,
        });
      } else if (provider === "ollama") {
        await this.streamOllama({
          model,
          systemPrompt: fullSystemPrompt,
          history: preparedHistory,
          streamId,
          onDelta: emitDelta,
        });
      } else {
        throw new Error(`Nhà cung cấp AI "${provider}" chưa được hỗ trợ.`);
      }

      delete assistantMsg.streaming;
      if (!assistantMsg.content.trim()) {
        assistantMsg.content = "(AI không trả về nội dung văn bản.)";
      }
      session.updatedAt = new Date().toISOString();
      this.saveStore();

      onEvent({
        type: "done",
        streamId,
        sessionId: session.id,
        messageId: assistantMsg.id,
        session,
      });

      return { success: true, session, messageId: assistantMsg.id };
    } catch (err) {
      const wasAborted = err?.name === "AbortError" || err?.isUserAborted;
      delete assistantMsg.streaming;
      if (wasAborted) {
        if (!assistantMsg.content.trim()) {
          assistantMsg.content = "_(Đã dừng phản hồi)_";
        }
      } else {
        assistantMsg.error = err?.message || "Lỗi gọi AI API";
        if (!assistantMsg.content.trim()) {
          assistantMsg.content = `❌ **Lỗi kết nối AI:** ${assistantMsg.error}`;
        }
      }
      session.updatedAt = new Date().toISOString();
      this.saveStore();

      onEvent({
        type: wasAborted ? "done" : "error",
        streamId,
        sessionId: session.id,
        messageId: assistantMsg.id,
        error: wasAborted ? "" : assistantMsg.error,
        session,
      });

      return {
        success: wasAborted,
        aborted: wasAborted,
        error: assistantMsg.error || "",
        session,
      };
    } finally {
      this.activeStreams.delete(streamId);
    }
  }

  streamHttpSSE({ url, method = "POST", headers = {}, bodyObj, streamId, onLine }) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = getRequestClient(urlObj);
      const bodyStr = JSON.stringify(bodyObj);
      const bodyBuf = Buffer.from(bodyStr, "utf-8");

      const req = client.request(
        urlObj,
        {
          method,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": String(bodyBuf.byteLength),
            ...headers,
          },
          timeout: 120000,
        },
        (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const errChunks = [];
            res.on("data", (c) => errChunks.push(c));
            res.on("end", () => {
              const rawErr = Buffer.concat(errChunks).toString("utf-8");
              let parsedMsg = rawErr;
              try {
                const j = JSON.parse(rawErr);
                parsedMsg =
                  j?.error?.message || j?.message || j?.error || rawErr;
              } catch (_) {}
              reject(
                new Error(
                  `HTTP ${res.statusCode}: ${String(parsedMsg).slice(0, 400)}`
                )
              );
            });
            return;
          }

          let buffer = "";
          res.setEncoding("utf-8");
          res.on("data", (chunk) => {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed) onLine(trimmed);
            }
          });
          res.on("end", () => {
            if (buffer.trim()) {
              onLine(buffer.trim());
            }
            resolve();
          });
        }
      );

      this.activeStreams.set(streamId, {
        aborted: false,
        abort: () => {
          const e = new Error("Aborted by user");
          e.isUserAborted = true;
          req.destroy(e);
        },
      });

      req.on("timeout", () => {
        req.destroy(new Error("Quá thời gian chờ phản hồi từ AI API (120s)."));
      });
      req.on("error", (err) => {
        const entry = this.activeStreams.get(streamId);
        if (entry?.aborted) {
          const abortErr = new Error("Aborted");
          abortErr.isUserAborted = true;
          reject(abortErr);
        } else {
          reject(err);
        }
      });

      req.write(bodyBuf);
      req.end();
    });
  }

  async streamGemini({ model, systemPrompt, history, streamId, onDelta }) {
    const apiKey = String(
      this.settings.gemini?.apiKey ||
        this.geminiService?.settings?.geminiApiKey ||
        ""
    ).trim();
    if (!apiKey) {
      throw new Error(
        "Chưa nhập Gemini API Key! Hãy bấm '⚙️ Cài đặt Model & API' để nhập khóa Google AI Studio."
      );
    }

    const contents = history.map((m) => {
      const parts = [];
      for (const att of m.attachments || []) {
        if (att.kind === "image" || att.kind === "pdf") {
          parts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: att.base64,
            },
          });
        } else if (att.kind === "text" && att.text) {
          parts.push({ text: att.text });
        }
      }
      if (m.text || parts.length === 0) {
        parts.push({ text: m.text || "Hãy phân tích tệp đính kèm." });
      }
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts,
      };
    });

    const payload = {
      contents,
      generationConfig: {
        temperature: Number(this.settings.temperature) ?? 0.7,
      },
    };
    if (systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model || "gemini-2.5-flash"
    )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

    await this.streamHttpSSE({
      url,
      bodyObj: payload,
      streamId,
      onLine: (line) => {
        if (!line.startsWith("data:")) return;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") return;
        try {
          const obj = JSON.parse(jsonStr);
          const parts = obj?.candidates?.[0]?.content?.parts || [];
          for (const p of parts) {
            if (typeof p?.text === "string") {
              onDelta(p.text);
            }
          }
        } catch (_) {}
      },
    });
  }

  async streamOpenAICompat({
    providerKey = "openai",
    model,
    systemPrompt,
    history,
    streamId,
    onDelta,
  }) {
    const isDeepSeek = providerKey === "deepseek";
    const defaultUrl = isDeepSeek
      ? "https://api.deepseek.com/v1"
      : "https://api.openai.com/v1";
    const defaultModel = isDeepSeek ? "deepseek-chat" : "gpt-4o-mini";
    const cfg = this.settings[providerKey] || {};
    const apiKey = String(cfg.apiKey || "").trim();
    const baseUrl = normalizeBaseUrl(cfg.baseUrl, defaultUrl);
    if (!apiKey) {
      throw new Error(
        `Chưa nhập API Key cho ${
          isDeepSeek ? "DeepSeek" : "ChatGPT / OpenAI"
        }! Hãy vào '⚙️ Cài đặt Model & API'.`
      );
    }

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    for (const m of history) {
      const hasImage = (m.attachments || []).some((a) => a.kind === "image");
      const textAdditions = (m.attachments || [])
        .map((a) => {
          if (a.kind === "text") return a.text;
          if (a.kind === "pdf") {
            return `[Đã đính kèm PDF "${a.name}". Lưu ý: API OpenAI-compatible không đọc PDF nhị phân trực tiếp như Gemini; hãy chuyển sang model Gemini để đọc PDF scan/ký số trực tiếp.]`;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n\n");

      const combinedText = [m.text, textAdditions].filter(Boolean).join("\n\n");

      if (hasImage && m.role === "user") {
        const contentParts = [];
        if (combinedText) {
          contentParts.push({ type: "text", text: combinedText });
        }
        for (const a of m.attachments || []) {
          if (a.kind === "image") {
            contentParts.push({
              type: "image_url",
              image_url: { url: `data:${a.mimeType};base64,${a.base64}` },
            });
          }
        }
        messages.push({ role: "user", content: contentParts });
      } else {
        messages.push({
          role: m.role === "assistant" ? "assistant" : "user",
          content: combinedText || "Xin chào",
        });
      }
    }

    const url = `${baseUrl}/chat/completions`;
    await this.streamHttpSSE({
      url,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      bodyObj: {
        model: model || defaultModel,
        messages,
        temperature: Number(this.settings.temperature) ?? 0.7,
        stream: true,
      },
      streamId,
      onLine: (line) => {
        if (!line.startsWith("data:")) return;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") return;
        try {
          const obj = JSON.parse(jsonStr);
          const delta = obj?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") {
            onDelta(delta);
          }
        } catch (_) {}
      },
    });
  }

  async streamClaude({ model, systemPrompt, history, streamId, onDelta }) {
    const cfg = this.settings.claude || {};
    const apiKey = String(cfg.apiKey || "").trim();
    const baseUrl = normalizeBaseUrl(cfg.baseUrl, "https://api.anthropic.com");
    if (!apiKey) {
      throw new Error(
        "Chưa nhập Anthropic Claude API Key! Hãy vào '⚙️ Cài đặt Model & API'."
      );
    }

    const messages = history.map((m) => {
      const blocks = [];
      for (const a of m.attachments || []) {
        if (a.kind === "image") {
          blocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: a.mimeType,
              data: a.base64,
            },
          });
        } else if (a.kind === "pdf") {
          blocks.push({
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: a.base64,
            },
          });
        } else if (a.kind === "text" && a.text) {
          blocks.push({ type: "text", text: a.text });
        }
      }
      if (m.text || blocks.length === 0) {
        blocks.push({ type: "text", text: m.text || "Hãy phân tích tài liệu." });
      }
      return {
        role: m.role === "assistant" ? "assistant" : "user",
        content: blocks,
      };
    });

    const url = `${baseUrl}/v1/messages`;
    const bodyObj = {
      model: model || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      temperature: Math.min(1, Number(this.settings.temperature) ?? 0.7),
      stream: true,
      messages,
    };
    if (systemPrompt) {
      bodyObj.system = systemPrompt;
    }

    await this.streamHttpSSE({
      url,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      bodyObj,
      streamId,
      onLine: (line) => {
        if (!line.startsWith("data:")) return;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") return;
        try {
          const obj = JSON.parse(jsonStr);
          if (
            obj?.type === "content_block_delta" &&
            obj?.delta?.type === "text_delta" &&
            typeof obj.delta.text === "string"
          ) {
            onDelta(obj.delta.text);
          }
        } catch (_) {}
      },
    });
  }

  async streamOllama({ model, systemPrompt, history, streamId, onDelta }) {
    const cfg = this.settings.ollama || {};
    const baseUrl = normalizeBaseUrl(cfg.baseUrl, "http://127.0.0.1:11434");

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    for (const m of history) {
      const textAdditions = (m.attachments || [])
        .map((a) => (a.kind === "text" ? a.text : `[Đính kèm: ${a.name}]`))
        .filter(Boolean)
        .join("\n\n");
      const images = (m.attachments || [])
        .filter((a) => a.kind === "image")
        .map((a) => a.base64);

      const msgObj = {
        role: m.role === "assistant" ? "assistant" : "user",
        content: [m.text, textAdditions].filter(Boolean).join("\n\n") || "Xin chào",
      };
      if (images.length > 0) msgObj.images = images;
      messages.push(msgObj);
    }

    await this.streamHttpSSE({
      url: `${baseUrl}/api/chat`,
      bodyObj: {
        model: model || "llama3.2",
        messages,
        stream: true,
        options: {
          temperature: Number(this.settings.temperature) ?? 0.7,
        },
      },
      streamId,
      onLine: (line) => {
        try {
          const obj = JSON.parse(line);
          if (typeof obj?.message?.content === "string") {
            onDelta(obj.message.content);
          }
        } catch (_) {}
      },
    });
  }

  async fetchProviderModels({ provider = "gemini", apiKey = "", baseUrl = "" } = {}) {
    const prov = String(provider || "gemini").trim().toLowerCase();
    let parsed;
    let resolvedBaseUrl = "";

    if (prov === "gemini") {
      const key = String(
        apiKey ||
          this.settings.gemini?.apiKey ||
          this.geminiService?.settings?.geminiApiKey ||
          ""
      ).trim();
      if (!key) {
        throw new Error("Vui lòng nhập Gemini API Key trước khi tải danh sách model.");
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(
        key
      )}`;
      parsed = await requestJsonGet(url);
    } else if (prov === "openai" || prov === "deepseek") {
      const isDeepSeek = prov === "deepseek";
      const cfg = this.settings[prov] || {};
      const key = String(apiKey || cfg.apiKey || "").trim();
      resolvedBaseUrl = normalizeBaseUrl(
        baseUrl || cfg.baseUrl,
        isDeepSeek ? "https://api.deepseek.com/v1" : "https://api.openai.com/v1"
      );
      if (!key) {
        throw new Error(
          `Vui lòng nhập ${
            isDeepSeek ? "DeepSeek" : "OpenAI / ChatGPT"
          } API Key trước khi tải danh sách model.`
        );
      }
      parsed = await requestJsonGet(`${resolvedBaseUrl}/models`, {
        Authorization: `Bearer ${key}`,
      });
    } else if (prov === "claude") {
      const cfg = this.settings.claude || {};
      const key = String(apiKey || cfg.apiKey || "").trim();
      resolvedBaseUrl = normalizeBaseUrl(
        baseUrl || cfg.baseUrl,
        "https://api.anthropic.com"
      );
      if (!key) {
        throw new Error(
          "Vui lòng nhập Anthropic Claude API Key trước khi tải danh sách model."
        );
      }
      parsed = await requestJsonGet(`${resolvedBaseUrl}/v1/models?limit=100`, {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      });
    } else if (prov === "ollama") {
      resolvedBaseUrl = normalizeBaseUrl(
        baseUrl || this.settings.ollama?.baseUrl,
        "http://127.0.0.1:11434"
      );
      parsed = await requestJsonGet(`${resolvedBaseUrl}/api/tags`, {}, 6000);
    } else {
      throw new Error(`Nhà cung cấp "${prov}" chưa hỗ trợ tải model.`);
    }

    const models = parseProviderModelsResponse(prov, parsed, resolvedBaseUrl);

    if (models.length > 0) {
      const prevLoaded = this.settings.loadedModels || {};
      const nextSettings = this.saveSettings({
        loadedModels: {
          ...prevLoaded,
          [prov]: models,
        },
      });
      return { provider: prov, models, settings: nextSettings };
    }

    return { provider: prov, models, settings: this.getPublicSettings() };
  }

  async fetchOllamaModels(customBaseUrl) {
    const res = await this.fetchProviderModels({
      provider: "ollama",
      baseUrl: customBaseUrl,
    });
    return res.models || [];
  }
}

module.exports = {
  AiChatService,
  COPILOT_PRESETS,
  PROVIDER_CATALOG,
  parseProviderModelsResponse,
};
