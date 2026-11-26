const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const STANDARD_DEPARTMENTS = [
  "Phòng Kinh tế",
  "Phòng Văn Hóa",
  "Công an",
  "Quân sự",
  "Trung tâm dịch vụ tổng hợp",
  "Trung tâm Phục vụ Hành chính công",
];

function normalizeAppsScriptWebAppUrl(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) return "";

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (_) {
    return rawUrl;
  }

  if (
    parsedUrl.protocol === "https:" &&
    parsedUrl.hostname.toLowerCase() === "script.google.com"
  ) {
    parsedUrl.pathname = parsedUrl.pathname.replace(
      /^\/macros\/u\/\d+\/s\//i,
      "/macros/s/"
    );
    return parsedUrl.toString();
  }

  return rawUrl;
}

class GoogleSheetService {
  constructor(geminiService, rootDir) {
    this.geminiService = geminiService;
    this.rootDir = rootDir;
  }

  getConfig() {
    const settings = this.geminiService?.getPublicSettings?.() || {};
    return {
      webhookUrl: normalizeAppsScriptWebAppUrl(
        settings.googleSheetWebhookUrl
      ),
      secret: String(settings.googleSheetSecret || "").trim(),
      autoSync: settings.autoSyncGoogleSheet !== false,
      specialistName: String(settings.specialistName || "").trim(),
      defaultDepartment: String(settings.defaultDepartment || "").trim(),
    };
  }

  serializeDoc(doc, cfg = this.getConfig()) {
    const assignees = Array.isArray(doc.assignees) ? doc.assignees : [];
    const attachments = Array.isArray(doc.attachments) ? doc.attachments : [];
    const logs = Array.isArray(doc.messageLogs) ? doc.messageLogs : [];

    return {
      id: doc.id,
      docNumber: doc.docNumber || "",
      title: doc.title || "",
      issuer: doc.issuer || "",
      department: doc.department || cfg.defaultDepartment || "Chưa phân phòng ban",
      specialistName: doc.specialistName || cfg.specialistName || "",
      assigneesText: assignees
        .map((a) => a.displayName || a.userId || "")
        .filter(Boolean)
        .join(", "),
      receivedDate: doc.receivedDate || "",
      dueDate: doc.dueDate || "",
      priority: doc.priority || "normal",
      status: doc.status || "processing",
      notes: doc.notes || "",
      completionNote: doc.completionNote || "",
      completedAt: doc.completedAt || "",
      attachmentCount: attachments.length,
      attachmentSummary: attachments
        .map((a) => a.name || "")
        .filter(Boolean)
        .join(" | "),
      zaloSentCount: logs.length,
      sourceClient: `${os.hostname()}${cfg.specialistName ? ` (${cfg.specialistName})` : ""}`,
      createdAt: doc.createdAt || "",
      updatedAt: doc.updatedAt || new Date().toISOString(),
    };
  }

  async postToAppsScript(webhookUrl, payload) {
    const url = normalizeAppsScriptWebAppUrl(webhookUrl);
    if (!url) {
      throw new Error(
        "Chưa cấu hình URL Web App Google Apps Script trong Cài đặt."
      );
    }
    if (!/^https:\/\/script\.google\.com\//i.test(url)) {
      throw new Error(
        "URL Google Apps Script không hợp lệ (cần bắt đầu bằng https://script.google.com/...)."
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(payload),
        redirect: "follow",
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (_) {
        if (/accounts\.google\.com|ServiceLogin/i.test(text)) {
          throw new Error(
            "Web App Apps Script đang yêu cầu đăng nhập Google. Vui lòng Deploy lại và chọn 'Ai có quyền truy cập: Bất kỳ ai (Anyone)'."
          );
        }
        throw new Error(
          "Phản hồi từ Google Apps Script không phải JSON hợp lệ. Hãy kiểm tra lại mã Code.gs và bản triển khai Web App."
        );
      }

      if (!parsed || parsed.ok === false) {
        throw new Error(
          parsed?.error || "Google Apps Script trả về lỗi không xác định."
        );
      }

      return parsed;
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new Error("Hết thời gian kết nối tới Google Apps Script (20s).");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async testConnection(overrideConfig = null) {
    const cfg = {
      ...this.getConfig(),
      ...(overrideConfig || {}),
    };
    return await this.postToAppsScript(cfg.webhookUrl, {
      action: "ping",
      secret: cfg.secret || "",
    });
  }

  async syncDocument(doc, { force = false } = {}) {
    const cfg = this.getConfig();
    if (!cfg.webhookUrl) {
      return { skipped: true, reason: "not_configured" };
    }
    if (!force && !cfg.autoSync) {
      return { skipped: true, reason: "auto_sync_disabled" };
    }
    try {
      const res = await this.postToAppsScript(cfg.webhookUrl, {
        action: "upsert",
        secret: cfg.secret || "",
        specialistName: cfg.specialistName || "",
        sourceClient: os.hostname(),
        doc: this.serializeDoc(doc, cfg),
      });
      return {
        skipped: false,
        success: true,
        syncedAt: res.syncedAt || new Date().toISOString(),
        dashboardUrl: res.dashboardUrl || cfg.webhookUrl,
      };
    } catch (err) {
      return {
        skipped: false,
        success: false,
        error: err?.message || "Lỗi đồng bộ lên Google Sheet",
      };
    }
  }

  async deleteDocument(docId) {
    const cfg = this.getConfig();
    if (!cfg.webhookUrl || !cfg.autoSync) {
      return { skipped: true };
    }
    try {
      const res = await this.postToAppsScript(cfg.webhookUrl, {
        action: "delete",
        secret: cfg.secret || "",
        specialistName: cfg.specialistName || "",
        sourceClient: os.hostname(),
        docId,
      });
      return { skipped: false, success: true, ...res };
    } catch (err) {
      return {
        skipped: false,
        success: false,
        error: err?.message || "Lỗi xóa dữ liệu trên Google Sheet",
      };
    }
  }

  async syncAllDocuments(docs = []) {
    const cfg = this.getConfig();
    if (!cfg.webhookUrl) {
      throw new Error(
        "Chưa cấu hình URL Web App Google Apps Script trong Cài đặt."
      );
    }
    const serialized = (Array.isArray(docs) ? docs : []).map((d) =>
      this.serializeDoc(d, cfg)
    );
    if (serialized.length === 0) {
      return {
        ok: true,
        totalProcessed: 0,
        inserted: 0,
        updated: 0,
        syncedAt: new Date().toISOString(),
      };
    }
    return await this.postToAppsScript(cfg.webhookUrl, {
      action: "bulk_upsert",
      secret: cfg.secret || "",
      specialistName: cfg.specialistName || "",
      sourceClient: os.hostname(),
      docs: serialized,
    });
  }

  async fetchDashboardData(filters = {}) {
    const cfg = this.getConfig();
    if (!cfg.webhookUrl) {
      throw new Error(
        "Chưa cấu hình URL Web App Google Apps Script trong Cài đặt."
      );
    }
    if (!/^https:\/\/script\.google\.com\//i.test(cfg.webhookUrl)) {
      throw new Error("URL Google Apps Script không hợp lệ.");
    }

    const urlObj = new URL(cfg.webhookUrl);
    urlObj.searchParams.set("action", "data");
    if (filters.department) {
      urlObj.searchParams.set("department", String(filters.department));
    }
    if (filters.status && filters.status !== "all") {
      urlObj.searchParams.set("status", String(filters.status));
    }
    if (filters.priority) {
      urlObj.searchParams.set("priority", String(filters.priority));
    }
    if (filters.specialist) {
      urlObj.searchParams.set("specialist", String(filters.specialist));
    }
    if (filters.search) {
      urlObj.searchParams.set("search", String(filters.search));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(urlObj.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (_) {
        if (/accounts\.google\.com|ServiceLogin/i.test(text)) {
          throw new Error(
            "Web App Apps Script đang yêu cầu đăng nhập. Vui lòng Deploy với quyền 'Ai có quyền truy cập: Bất kỳ ai'."
          );
        }
        throw new Error(
          "Phản hồi từ Google Apps Script không phải JSON hợp lệ."
        );
      }
      if (!parsed || parsed.ok === false) {
        throw new Error(parsed?.error || "Không thể tải dữ liệu Dashboard.");
      }
      return parsed;
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new Error("Hết thời gian tải dữ liệu Dashboard (20s).");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  getAppsScriptTemplates() {
    const appsScriptDir = path.join(this.rootDir, "apps-script");
    const codePath = path.join(appsScriptDir, "Code.gs");
    const dashboardPath = path.join(appsScriptDir, "Dashboard.html");
    const guidePath = path.join(appsScriptDir, "HUONG_DAN_CAI_DAT.md");

    return {
      departments: STANDARD_DEPARTMENTS,
      codeGs: fs.existsSync(codePath) ? fs.readFileSync(codePath, "utf-8") : "",
      dashboardHtml: fs.existsSync(dashboardPath)
        ? fs.readFileSync(dashboardPath, "utf-8")
        : "",
      guideMd: fs.existsSync(guidePath)
        ? fs.readFileSync(guidePath, "utf-8")
        : "",
    };
  }
}

module.exports = {
  GoogleSheetService,
  STANDARD_DEPARTMENTS,
  normalizeAppsScriptWebAppUrl,
};
