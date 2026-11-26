const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  session,
  webContents,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { ZaloService } = require("./zaloService");
const { GeminiService } = require("./geminiService");
const { AiChatService } = require("./aiChatService");
const {
  GoogleSheetService,
  normalizeAppsScriptWebAppUrl,
} = require("./googleSheetService");
const { UpdateService } = require("./updateService");

let mainWindow = null;
let zaloService = null;
let geminiService = null;
let aiChatService = null;
let googleSheetService = null;
let updateService = null;

const DATA_DIR = path.join(app.getAppPath(), "data");
const ATTACHMENTS_DIR = path.join(DATA_DIR, "attachments");
const WEB_DOWNLOADS_DIR = path.join(DATA_DIR, "web_downloads");
const AI_CHAT_UPLOADS_DIR = path.join(DATA_DIR, "ai_chat_uploads");
const DOCS_PATH = path.join(DATA_DIR, "documents.json");

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ATTACHMENTS_DIR)) {
    fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(WEB_DOWNLOADS_DIR)) {
    fs.mkdirSync(WEB_DOWNLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(AI_CHAT_UPLOADS_DIR)) {
    fs.mkdirSync(AI_CHAT_UPLOADS_DIR, { recursive: true });
  }
}

// Allow internal government/enterprise eOffice portals with self-signed SSL certificates
app.on(
  "certificate-error",
  (event, _webContents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(true);
  }
);

// Handle popups inside embedded <webview> so document links / downloads open seamlessly
app.on("web-contents-created", (_event, contents) => {
  if (contents.getType() === "webview") {
    contents.setWindowOpenHandler(({ url }) => {
      if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
        setImmediate(() => {
          if (!contents.isDestroyed()) {
            contents.loadURL(url);
          }
        });
      }
      return { action: "deny" };
    });
  }
});

function createSampleDocuments() {
  const now = new Date();
  const fmtDate = (offsetDays, hours = 17, minutes = 0) => {
    const d = new Date(now.getTime() + offsetDays * 86400000);
    d.setHours(hours, minutes, 0, 0);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  };
  const fmtDayOnly = (offsetDays) => fmtDate(offsetDays).slice(0, 10);

  return [
    {
      id: "doc_sample_1",
      docNumber: "148/UBND-VX",
      title: "Triển khai kế hoạch chuyển đổi số và số hóa hồ sơ hành chính quý IV",
      issuer: "UBND Thành phố",
      receivedDate: fmtDayOnly(-1),
      dueDate: fmtDate(2, 17, 0),
      priority: "important", // normal | important | urgent
      status: "processing", // processing | completed (overdue is computed dynamically when status !== 'completed' and dueDate < now)
      assignees: [],
      attachments: [],
      notes: "Rà soát danh mục hồ sơ cần số hóa, tổng hợp báo cáo trước 17h00 ngày hạn xử lý.",
      completionNote: "",
      completedAt: null,
      createdAt: new Date(now.getTime() - 86400000).toISOString(),
      updatedAt: new Date(now.getTime() - 86400000).toISOString(),
      messageLogs: [],
    },
    {
      id: "doc_sample_2",
      docNumber: "89/TB-VP",
      title: "Thông báo kết luận cuộc họp giao ban tuần và đôn đốc nhiệm vụ tồn đọng",
      issuer: "Văn phòng Cơ quan",
      receivedDate: fmtDayOnly(-4),
      dueDate: fmtDate(-1, 16, 30),
      priority: "urgent",
      status: "processing",
      assignees: [],
      attachments: [],
      notes: "Văn bản đã quá hạn báo cáo. Cần gửi tin nhắn Zalo đôn đốc các cá nhân phụ trách gửi kết quả ngay.",
      completionNote: "",
      completedAt: null,
      createdAt: new Date(now.getTime() - 4 * 86400000).toISOString(),
      updatedAt: new Date(now.getTime() - 86400000).toISOString(),
      messageLogs: [],
    },
    {
      id: "doc_sample_3",
      docNumber: "312/CV-TCKT",
      title: "Thẩm định dự toán kinh phí mua sắm trang thiết bị văn phòng đợt 2",
      issuer: "Phòng Tài chính - Kế toán",
      receivedDate: fmtDayOnly(-5),
      dueDate: fmtDate(-2, 17, 0),
      priority: "normal",
      status: "completed",
      assignees: [],
      attachments: [],
      notes: "Phối hợp đối chiếu báo giá và hoàn thiện tờ trình phê duyệt.",
      completionNote: "Đã hoàn thành tờ trình số 45/TTr-TCKT và trình lãnh đạo ký duyệt.",
      completedAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
      createdAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
      updatedAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
      messageLogs: [],
    },
  ];
}

function loadDocuments() {
  ensureDirectories();
  try {
    if (!fs.existsSync(DOCS_PATH)) {
      const initial = createSampleDocuments();
      fs.writeFileSync(DOCS_PATH, JSON.stringify(initial, null, 2), "utf-8");
      return initial;
    }
    const raw = fs.readFileSync(DOCS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to load documents:", err);
    return [];
  }
}

function saveDocuments(docs) {
  ensureDirectories();
  fs.writeFileSync(DOCS_PATH, JSON.stringify(docs, null, 2), "utf-8");
}

function normalizeAttachmentCategory(rawCategory, isCompletionFile = false) {
  if (
    rawCategory === "assignment" ||
    rawCategory === "completed" ||
    rawCategory === "superior"
  ) {
    return rawCategory;
  }
  return isCompletionFile ? "completed" : "superior";
}

function sanitizeDocFolderName(docNumber, docId) {
  const cleanNum = String(docNumber || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F\s]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 80);
  return cleanNum || docId || `VB_${Date.now()}`;
}

function resolveAttachmentTargetDir(docNumber, docId) {
  const storageCfg =
    geminiService?.getPublicSettings()?.storageConfig ||
    geminiService?.getDefaultStorageConfig();

  const rootDir =
    storageCfg?.rootDir || path.join(DATA_DIR, "LuuTru_VanBan");
  const subName = sanitizeDocFolderName(docNumber, docId);
  return path.join(rootDir, subName);
}

async function copyAttachmentToConfiguredDir(
  att,
  { category, docNumber, docId } = {}
) {
  if (!att || !att.path || !fs.existsSync(att.path)) return null;
  const resolvedCategory = normalizeAttachmentCategory(
    category ?? att.category,
    Boolean(att.isCompletionFile)
  );
  const targetDir = resolveAttachmentTargetDir(docNumber, docId);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const baseName = path.basename(att.path);
  let destPath = path.join(targetDir, baseName);
  const srcResolved = path.resolve(att.path);
  const destResolved = path.resolve(destPath);

  if (srcResolved !== destResolved) {
    if (fs.existsSync(destPath)) {
      const parsed = path.parse(baseName);
      const srcStat = fs.statSync(srcResolved);
      const dstStat = fs.statSync(destResolved);
      if (srcStat.size !== dstStat.size) {
        destPath = path.join(
          targetDir,
          `${parsed.name}_${Date.now().toString().slice(-4)}${parsed.ext}`
        );
      }
    }
    try {
      await fsp.copyFile(srcResolved, destPath);
    } catch (copyErr) {
      console.warn("Could not copy attachment to configured folder:", copyErr);
      destPath = att.path;
    }
  }

  const stat = fs.statSync(destPath);
  return {
    id:
      att.id ||
      `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: att.name || path.basename(destPath),
    path: destPath,
    size: stat.size,
    ext: path.extname(destPath).replace(".", "").toLowerCase(),
    category: resolvedCategory,
    isCompletionFile: resolvedCategory === "completed",
  };
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 880,
    minWidth: 1080,
    minHeight: 680,
    title: "zOffice - Quản Lý Công Việc & Văn Bản",
    backgroundColor: "#f1f5f9",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  mainWindow.webContents.on("did-finish-load", async () => {
    if (zaloService) {
      sendToRenderer("zalo:status-changed", zaloService.getStatus());
      sendToRenderer("zalo:contacts-updated", zaloService.getContacts());
      if (zaloService.getStatus().hasSavedSession && !zaloService.isLoggedIn) {
        await zaloService.autoLoginFromSession();
      }
    }
    if (updateService && updateService.config?.autoCheckUpdates && updateService.config?.githubRepo) {
      setTimeout(() => {
        updateService.checkForUpdates({ silent: true }).catch(() => {});
      }, 3500);
    }
  });
}

function setupWebPortalDownloadInterceptor() {
  const portalSession = session.fromPartition("persist:webportal");

  // Duy trì bền vững Cookie đăng nhập của iOffice / Cổng văn bản qua các lần tắt mở phần mềm
  const persistingCookieKeys = new Set();
  portalSession.cookies.on("changed", async (_event, cookie, cause, removed) => {
    if (removed || cause === "overwrite") return;
    try {
      // Nếu cổng iOffice tạo session cookie (bị xóa khi đóng app), tự động gia hạn 30 ngày để giữ phiên đăng nhập
      if (cookie.session && cookie.domain && cookie.name) {
        const lockKey = `${cookie.domain}|${cookie.path}|${cookie.name}`;
        if (!persistingCookieKeys.has(lockKey)) {
          persistingCookieKeys.add(lockKey);
          const cleanDomain = cookie.domain.startsWith(".")
            ? cookie.domain.slice(1)
            : cookie.domain;
          const scheme = cookie.secure ? "https://" : "http://";
          const cookieUrl = `${scheme}${cleanDomain}${cookie.path || "/"}`;
          try {
            await portalSession.cookies.set({
              url: cookieUrl,
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path || "/",
              secure: Boolean(cookie.secure),
              httpOnly: Boolean(cookie.httpOnly),
              sameSite: cookie.sameSite || "unspecified",
              expirationDate: Math.floor(Date.now() / 1000) + 30 * 86400,
            });
          } catch (_) {
          } finally {
            setTimeout(() => persistingCookieKeys.delete(lockKey), 2000);
          }
        }
      }
      await portalSession.cookies.flushStore();
    } catch (_) {}
  });

  portalSession.on("will-download", (_event, item, _webContents) => {
    const autoCapture =
      geminiService?.settings?.autoCaptureWebDownloads !== false;

    if (!autoCapture) {
      return; // Let default Save-As dialog appear if user unchecked auto-capture
    }

    const rawFileName = item.getFilename() || `VanBan_${Date.now()}.pdf`;
    const safeName = rawFileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    const subDir = path.join(WEB_DOWNLOADS_DIR, `dl_${Date.now()}`);
    if (!fs.existsSync(subDir)) {
      fs.mkdirSync(subDir, { recursive: true });
    }
    const savePath = path.join(subDir, safeName);
    item.setSavePath(savePath);

    sendToRenderer("webportal:download-started", {
      name: safeName,
      url: item.getURL(),
      totalBytes: item.getTotalBytes(),
    });

    item.once("done", (_ev, state) => {
      if (state === "completed" && fs.existsSync(savePath)) {
        try {
          const stat = fs.statSync(savePath);
          sendToRenderer("webportal:file-captured", {
            id: `webdl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: safeName,
            path: savePath,
            size: stat.size,
            ext: path.extname(savePath).replace(".", "").toLowerCase(),
            sourceUrl: item.getURL(),
          });
        } catch (err) {
          console.error("Error reading captured web download:", err);
        }
      } else {
        sendToRenderer("webportal:download-failed", {
          name: safeName,
          state,
        });
      }
    });
  });
}

async function syncDocAndPersistStatus(docId, { force = false } = {}) {
  if (!googleSheetService || !docId) return null;
  const docs = loadDocuments();
  const idx = docs.findIndex((d) => d.id === docId);
  if (idx < 0) return null;

  const syncRes = await googleSheetService.syncDocument(docs[idx], { force });
  if (!syncRes || syncRes.skipped) {
    return docs[idx];
  }

  const freshDocs = loadDocuments();
  const freshIdx = freshDocs.findIndex((d) => d.id === docId);
  if (freshIdx < 0) return docs[idx];

  if (syncRes.success) {
    freshDocs[freshIdx].sheetSyncedAt = syncRes.syncedAt;
    freshDocs[freshIdx].sheetSyncError = "";
  } else {
    freshDocs[freshIdx].sheetSyncError = syncRes.error || "Lỗi đồng bộ Sheet";
  }
  saveDocuments(freshDocs);
  return freshDocs[freshIdx];
}

app.whenReady().then(() => {
  ensureDirectories();
  zaloService = new ZaloService(DATA_DIR, sendToRenderer);
  geminiService = new GeminiService(DATA_DIR);
  aiChatService = new AiChatService(DATA_DIR, geminiService);
  googleSheetService = new GoogleSheetService(geminiService, app.getAppPath());
  updateService = new UpdateService(
    app,
    app.getAppPath(),
    DATA_DIR,
    (status) => sendToRenderer("update:status-changed", status)
  );
  setupWebPortalDownloadInterceptor();

  // ==================== VERSION & GITHUB AUTO-UPDATE IPC ====================
  ipcMain.handle("update:get-state", async () => {
    return updateService.getState();
  });

  ipcMain.handle("update:save-config", async (_event, patch) => {
    return updateService.saveConfig(patch || {});
  });

  ipcMain.handle("update:check", async () => {
    return await updateService.checkForUpdates({ silent: false });
  });

  ipcMain.handle("update:install", async (_event, targetTag) => {
    return await updateService.downloadAndInstallUpdate(targetTag || "");
  });

  ipcMain.handle("update:rollback", async (_event, backupId) => {
    return await updateService.rollbackBackup(backupId);
  });

  ipcMain.handle("update:open-release-url", async (_event, url) => {
    const clean = String(url || "").trim();
    if (/^https:\/\/github\.com\//i.test(clean)) {
      await shell.openExternal(clean);
      return { opened: true };
    }
    return { opened: false };
  });

  // ==================== CHATBOX AI CHAT IPC ====================
  ipcMain.handle("aichat:get-state", async () => {
    return aiChatService.getState();
  });

  ipcMain.handle("aichat:save-settings", async (_event, newSettings) => {
    return aiChatService.saveSettings(newSettings);
  });

  ipcMain.handle("aichat:create-session", async (_event, opts) => {
    return aiChatService.createSession(opts);
  });

  ipcMain.handle("aichat:set-active-session", async (_event, sessionId) => {
    return aiChatService.setActiveSession(sessionId);
  });

  ipcMain.handle("aichat:update-session", async (_event, { sessionId, patch }) => {
    return aiChatService.updateSession(sessionId, patch);
  });

  ipcMain.handle("aichat:delete-session", async (_event, sessionId) => {
    return aiChatService.deleteSession(sessionId);
  });

  ipcMain.handle("aichat:clear-session", async (_event, sessionId) => {
    return aiChatService.clearSessionMessages(sessionId);
  });

  ipcMain.handle("aichat:delete-message", async (_event, { sessionId, messageId }) => {
    return aiChatService.deleteMessage(sessionId, messageId);
  });

  ipcMain.handle("aichat:send-message", async (_event, payload) => {
    const docs = loadDocuments();
    return await aiChatService.sendMessage({
      ...payload,
      docs,
      onEvent: (ev) => sendToRenderer("aichat:stream-event", ev),
    });
  });

  ipcMain.handle("aichat:stop-stream", async (_event, streamId) => {
    return aiChatService.stopStream(streamId);
  });

  ipcMain.handle("aichat:fetch-ollama-models", async (_event, baseUrl) => {
    return await aiChatService.fetchOllamaModels(baseUrl);
  });

  ipcMain.handle("aichat:fetch-models", async (_event, payload) => {
    return await aiChatService.fetchProviderModels(payload || {});
  });

  ipcMain.handle("aichat:save-pasted-image", async (_event, { dataUrl, name }) => {
    ensureDirectories();
    const match = String(dataUrl || "").match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) {
      throw new Error("Dữ liệu ảnh dán không hợp lệ.");
    }
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const buf = Buffer.from(match[2], "base64");
    const safeName = (name || `AnhDan_${Date.now()}.${ext}`).replace(
      /[<>:"/\\|?*\x00-\x1F]/g,
      "_"
    );
    const savePath = path.join(AI_CHAT_UPLOADS_DIR, `${Date.now()}_${safeName}`);
    await fsp.writeFile(savePath, buf);
    return {
      id: `chatimg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: safeName,
      path: savePath,
      size: buf.byteLength,
      ext,
    };
  });

  ipcMain.handle("aichat:export-markdown", async (_event, { title, markdown }) => {
    const safeTitle = String(title || "Chatbox-AI")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .slice(0, 50);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Xuất cuộc trò chuyện AI ra file Markdown",
      defaultPath: `${safeTitle}.md`,
      filters: [
        { name: "Markdown (*.md)", extensions: ["md"] },
        { name: "Text (*.txt)", extensions: ["txt"] },
      ],
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }
    await fsp.writeFile(result.filePath, String(markdown || ""), "utf-8");
    return { canceled: false, filePath: result.filePath };
  });

  // ==================== GEMINI AI & WEB PORTAL IPC ====================
  ipcMain.handle("gemini:get-settings", async () => {
    return geminiService.getPublicSettings();
  });

  ipcMain.handle("gemini:save-settings", async (_event, newSettings) => {
    return geminiService.saveSettings(newSettings);
  });

  ipcMain.handle("gemini:analyze-file", async (_event, filePath) => {
    return await geminiService.analyzeDocumentFile(filePath);
  });

  ipcMain.handle("gemini:analyze-webpage", async (_event, payload) => {
    return await geminiService.analyzeWebPageContent(payload);
  });

  ipcMain.handle("gemini:analyze-completion", async (_event, payload) => {
    const allDocs = loadDocuments();
    return await geminiService.analyzeCompletionResponse({
      ...payload,
      activeDocs: allDocs,
    });
  });

  /**
   * Trích xuất toàn diện nội dung và tệp PDF gốc từ <webview> (bao gồm cả mọi iframe PDF.js / cross-origin frame).
   * Giải quyết triệt để trường hợp Văn bản ký số (VGCA / VNPT-CA) hiển thị trên PDF.js mà phần Số và Ngày tháng
   * ban hành là con dấu hình ảnh (Stamp Annotation) nằm ở đầu Trang 1.
   */
  ipcMain.handle(
    "webportal:extract-webview-content",
    async (_event, webContentsId) => {
      const wc = webContents.fromId(Number(webContentsId));
      if (!wc || wc.isDestroyed()) {
        throw new Error("Không tìm thấy khung trình duyệt Web Portal.");
      }

      const allFrames = wc.mainFrame?.framesInSubtree || [wc.mainFrame];
      const textChunks = [];
      let extractedFileBase64 = "";
      let extractedFileName = "";
      let extractedFileMime = "";
      const scrolledFrames = [];

      for (let idx = 0; idx < allFrames.length; idx++) {
        const frame = allFrames[idx];
        if (!frame || frame.isDestroyed?.()) continue;

        try {
          const frameRes = await frame.executeJavaScript(
            `
            (async () => {
              const out = {
                label: document.title || location.pathname || ("Frame " + ${idx}),
                href: location.href || "",
                text: "",
                fileBase64: "",
                fileName: "",
                fileMime: "",
                didScrollTop: false,
                prevScrollTop: 0,
                prevPageNumber: 0,
              };

              function uint8ToBase64(bytes) {
                let binary = "";
                const chunkSize = 0x8000;
                for (let i = 0; i < bytes.length; i += chunkSize) {
                  binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
                }
                return btoa(binary);
              }

              // 1. Thu thập văn bản hiển thị và các ô nhập liệu trong frame
              const parts = [];
              if (document.body && document.body.innerText) {
                const bt = document.body.innerText.trim();
                if (bt) parts.push(bt);
              }
              const inputs = Array.from(document.querySelectorAll("input[type='text'], input:not([type]), textarea, select"));
              const fieldVals = inputs
                .map((el) => {
                  const lbl = el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.getAttribute("name") || el.id || "";
                  const val = el.value ? String(el.value).trim() : "";
                  return val ? (lbl ? lbl + ": " + val : val) : "";
                })
                .filter(Boolean);
              if (fieldVals.length) {
                parts.push("Các trường thông tin:\\n" + fieldVals.join("\\n"));
              }
              out.text = parts.join("\\n\\n").slice(0, 35000);

              // 2. Kiểm tra nếu frame này đang chạy trình xem PDF.js (VNPT-iOffice, vOffice, Egov...)
              const pdfApp = window.PDFViewerApplication || window.PDFView || null;
              if (pdfApp && pdfApp.pdfDocument && typeof pdfApp.pdfDocument.getData === "function") {
                try {
                  const rawBytes = await pdfApp.pdfDocument.getData();
                  if (rawBytes && rawBytes.byteLength > 200 && rawBytes.byteLength <= 20 * 1024 * 1024) {
                    const u8 = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
                    out.fileBase64 = uint8ToBase64(u8);
                    out.fileMime = "application/pdf";
                    const rawName =
                      pdfApp.contentDispositionFilename ||
                      (pdfApp.url ? String(pdfApp.url).split("/").pop().split("?")[0] : "") ||
                      document.title ||
                      "VanBanKySo.pdf";
                    out.fileName = decodeURIComponent(rawName);
                    if (!/\\.pdf$/i.test(out.fileName)) {
                      out.fileName += ".pdf";
                    }
                  }
                } catch (_) {}
              }

              // 3. Nếu đang có khung cuộn PDF.js (#viewerContainer), tạm cuộn về đầu Trang 1 để chụp được dấu Số & Ngày tháng
              const viewerContainer =
                document.getElementById("viewerContainer") ||
                document.querySelector(".pdfViewer")?.parentElement ||
                null;
              if (viewerContainer && viewerContainer.scrollTop > 40) {
                out.didScrollTop = true;
                out.prevScrollTop = viewerContainer.scrollTop;
                if (pdfApp?.pdfViewer?.currentPageNumber) {
                  out.prevPageNumber = pdfApp.pdfViewer.currentPageNumber;
                  try {
                    pdfApp.pdfViewer.currentPageNumber = 1;
                  } catch (_) {}
                }
                viewerContainer.scrollTop = 0;
              }

              // 4. Nếu chưa lấy được từ PDFViewerApplication.pdfDocument.getData(), thử fetch từ URL PDF trong tham số hoặc thẻ nhúng
              if (!out.fileBase64) {
                const candidateUrls = [];
                try {
                  const u = new URL(location.href);
                  const fileParam = u.searchParams.get("file") || u.searchParams.get("url") || u.searchParams.get("path");
                  if (fileParam) {
                    candidateUrls.push({
                      url: new URL(fileParam, location.href).href,
                      hintName: fileParam.split("/").pop().split("?")[0] || "VanBan.pdf",
                    });
                  }
                } catch (_) {}

                if (pdfApp && pdfApp.url && typeof pdfApp.url === "string") {
                  try {
                    candidateUrls.push({
                      url: new URL(pdfApp.url, location.href).href,
                      hintName: pdfApp.contentDispositionFilename || "VanBan.pdf",
                    });
                  } catch (_) {}
                }

                const embeds = Array.from(document.querySelectorAll("embed[src], object[data], iframe[src], a[href]"));
                for (const el of embeds) {
                  const rawHref = el.getAttribute("src") || el.getAttribute("data") || el.getAttribute("href") || "";
                  if (!rawHref || rawHref.startsWith("javascript:") || rawHref.startsWith("#")) continue;
                  try {
                    const absUrl = new URL(rawHref, location.href).href;
                    const lower = absUrl.toLowerCase();
                    const linkText = (el.innerText || el.getAttribute("title") || el.getAttribute("download") || "").trim();
                    if (
                      /\\.(pdf|docx|doc)(\\?|$)/i.test(lower) ||
                      /\\.(pdf|docx|doc)$/i.test(linkText) ||
                      el.tagName === "EMBED" ||
                      (el.tagName === "OBJECT" && (el.type || "").includes("pdf"))
                    ) {
                      candidateUrls.push({ url: absUrl, hintName: linkText });
                    }
                  } catch (_) {}
                }

                for (const cand of candidateUrls.slice(0, 4)) {
                  try {
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), 4500);
                    const resp = await fetch(cand.url, { credentials: "include", signal: ctrl.signal });
                    clearTimeout(timer);
                    if (!resp.ok) continue;
                    const ctype = (resp.headers.get("content-type") || "").toLowerCase();
                    if (ctype.includes("text/html")) continue;

                    const buf = await resp.arrayBuffer();
                    if (buf.byteLength > 300 && buf.byteLength <= 20 * 1024 * 1024) {
                      const u8 = new Uint8Array(buf);
                      const isPdfMagic =
                        u8.length > 4 &&
                        u8[0] === 0x25 &&
                        u8[1] === 0x50 &&
                        u8[2] === 0x44 &&
                        u8[3] === 0x46; // %PDF
                      if (isPdfMagic || ctype.includes("pdf") || ctype.includes("word") || /\\.(pdf|docx)$/i.test(cand.hintName)) {
                        out.fileBase64 = uint8ToBase64(u8);
                        out.fileMime = isPdfMagic || ctype.includes("pdf") ? "application/pdf" : ctype;
                        const disp = resp.headers.get("content-disposition") || "";
                        const matchName = disp.match(/filename\\*?=(?:UTF-8'')?["']?([^"';\\n]+)/i);
                        if (matchName && matchName[1]) {
                          out.fileName = decodeURIComponent(matchName[1]);
                        } else if (cand.hintName && /\\.(pdf|docx|doc)$/i.test(cand.hintName)) {
                          out.fileName = cand.hintName;
                        } else {
                          out.fileName = isPdfMagic ? "VanBanKySo.pdf" : "VanBanTaiVe.docx";
                        }
                        break;
                      }
                    }
                  } catch (_) {}
                }
              }

              return out;
            })();
            `,
            true
          );

          if (frameRes) {
            if (frameRes.text) {
              textChunks.push(
                `--- [Khung ${idx + 1}: ${frameRes.label}] ---\n${frameRes.text}`
              );
            }
            if (!extractedFileBase64 && frameRes.fileBase64) {
              extractedFileBase64 = frameRes.fileBase64;
              extractedFileName = frameRes.fileName || "VanBanKySo.pdf";
              extractedFileMime = frameRes.fileMime || "application/pdf";
            }
            if (frameRes.didScrollTop) {
              scrolledFrames.push({
                frame,
                prevScrollTop: frameRes.prevScrollTop,
              });
            }
          }
        } catch (_) {
          // Ignore cross-frame / destroyed frame errors
        }
      }

      // Nếu vừa cuộn PDF.js về đầu Trang 1, chờ 180ms để canvas Trang 1 (có dấu Số & Ngày tháng) vẽ xong trước khi chụp ảnh
      if (scrolledFrames.length > 0) {
        await new Promise((r) => setTimeout(r, 180));
      }

      let screenshotBase64 = "";
      try {
        const nativeImg = await wc.capturePage();
        screenshotBase64 = nativeImg.toDataURL();
      } catch (capErr) {
        console.warn("Could not capture webview page:", capErr?.message || capErr);
      }

      // Khôi phục vị trí cuộn như cũ cho người dùng
      for (const item of scrolledFrames) {
        try {
          if (item.frame && !item.frame.isDestroyed?.()) {
            await item.frame.executeJavaScript(
              `
              (() => {
                const vc = document.getElementById("viewerContainer") || document.querySelector(".pdfViewer")?.parentElement;
                if (vc) vc.scrollTop = ${Number(item.prevScrollTop) || 0};
              })();
              `,
              true
            );
          }
        } catch (_) {}
      }

      return {
        url: wc.getURL() || "",
        title: wc.getTitle() || "Cổng Văn Bản",
        text: textChunks.join("\n\n").slice(0, 45000),
        fileBase64: extractedFileBase64,
        fileName: extractedFileName,
        fileMime: extractedFileMime,
        screenshotBase64,
        webContentsId: wc.id,
      };
    }
  );

  ipcMain.handle(
    "webportal:export-page-file",
    async (
      _event,
      {
        webContentsId,
        screenshotBase64,
        fileBase64,
        fileName,
        docNumber,
        prefix = "VanBan",
      }
    ) => {
      const subDir = path.join(WEB_DOWNLOADS_DIR, `exp_${Date.now()}`);
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true });
      }
      const safeDocNum = String(docNumber || "TrangWeb")
        .replace(/[<>:"/\\|?*\x00-\x1F\s]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 45);

      // 1. Nếu trích xuất được trực tiếp file gốc (PDF/DOCX...) từ trang web (bao gồm cả PDF.js)
      if (fileBase64) {
        const cleanFileB64 = fileBase64.replace(/^data:[^;]+;base64,/, "");
        const buf = Buffer.from(cleanFileB64, "base64");
        let chosenName = String(fileName || "").trim();
        const isGenericName =
          !chosenName ||
          /^(vanbankyso|vanban|viewer|document|download|file)\.pdf$/i.test(
            chosenName
          );
        if (isGenericName && safeDocNum && safeDocNum !== "TrangWeb") {
          chosenName = `${prefix}_${safeDocNum}.pdf`;
        } else if (!chosenName) {
          chosenName = `${prefix}_${Date.now()}.pdf`;
        }
        const safeName = chosenName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
        const savePath = path.join(subDir, safeName);
        await fsp.writeFile(savePath, buf);
        return {
          id: `webfile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: safeName,
          path: savePath,
          size: buf.byteLength,
          ext: path.extname(safeName).replace(".", "").toLowerCase() || "pdf",
        };
      }

      // 2. Xuất toàn bộ trang văn bản đang mở trên Webview thành tệp PDF chuẩn (printToPDF)
      if (webContentsId) {
        try {
          const wc = webContents.fromId(Number(webContentsId));
          if (wc && !wc.isDestroyed()) {
            const pdfBuf = await wc.printToPDF({
              printBackground: true,
              pageSize: "A4",
            });
            if (pdfBuf && pdfBuf.byteLength > 0) {
              const pdfName = `${prefix}_${safeDocNum || Date.now()}.pdf`;
              const savePath = path.join(subDir, pdfName);
              await fsp.writeFile(savePath, pdfBuf);
              return {
                id: `webpdf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: pdfName,
                path: savePath,
                size: pdfBuf.byteLength,
                ext: "pdf",
              };
            }
          }
        } catch (pdfErr) {
          console.warn(
            "printToPDF fallback to screenshot:",
            pdfErr?.message || pdfErr
          );
        }
      }

      // 3. Dự phòng: lưu ảnh chụp màn hình trang web (.png)
      if (screenshotBase64) {
        const cleanB64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
        const buf = Buffer.from(cleanB64, "base64");
        const imgName = `${prefix}_${safeDocNum || Date.now()}.png`;
        const savePath = path.join(subDir, imgName);
        await fsp.writeFile(savePath, buf);
        return {
          id: `webcap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: imgName,
          path: savePath,
          size: buf.byteLength,
          ext: "png",
        };
      }

      throw new Error("Không thể xuất tệp văn bản từ trang web hiện tại.");
    }
  );

  ipcMain.handle(
    "webportal:save-screenshot",
    async (_event, { screenshotBase64, docNumber }) => {
      if (!screenshotBase64) {
        throw new Error("Không có dữ liệu ảnh chụp trang web.");
      }
      const cleanB64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(cleanB64, "base64");
      const subDir = path.join(WEB_DOWNLOADS_DIR, `cap_${Date.now()}`);
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true });
      }
      const safeDocNum = String(docNumber || "VanBanWeb")
        .replace(/[<>:"/\\|?*\x00-\x1F\s]+/g, "_")
        .slice(0, 40);
      const fileName = `AnhChup_${safeDocNum}.png`;
      const savePath = path.join(subDir, fileName);
      await fsp.writeFile(savePath, buf);
      return {
        id: `webcap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: fileName,
        path: savePath,
        size: buf.byteLength,
        ext: "png",
      };
    }
  );

  // ==================== DOCUMENTS IPC ====================
  ipcMain.handle("docs:list", async () => {
    return loadDocuments();
  });

  ipcMain.handle("docs:save", async (_event, docData) => {
    const docs = loadDocuments();
    const nowIso = new Date().toISOString();
    const isEdit = Boolean(docData.id && docs.some((d) => d.id === docData.id));
    const docId = docData.id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Copy attachments into the configured folder for each category (Cấp trên / Giao việc / Hoàn thành)
    const processedAttachments = [];
    if (Array.isArray(docData.attachments)) {
      for (const att of docData.attachments) {
        const savedAtt = await copyAttachmentToConfiguredDir(att, {
          category: att?.category,
          docNumber: docData.docNumber,
          docId,
        });
        if (savedAtt) {
          processedAttachments.push(savedAtt);
        }
      }
    }

    const gsheetCfg = googleSheetService?.getConfig?.() || {};
    const resolvedDepartment =
      String(docData.department ?? "").trim() ||
      gsheetCfg.defaultDepartment ||
      "";
    const resolvedSpecialist =
      String(docData.specialistName ?? "").trim() ||
      gsheetCfg.specialistName ||
      "";

    if (isEdit) {
      const idx = docs.findIndex((d) => d.id === docId);
      const existing = docs[idx];
      const updated = {
        ...existing,
        docNumber: String(docData.docNumber || "").trim(),
        title: String(docData.title || "").trim(),
        issuer: String(docData.issuer || "").trim(),
        department: resolvedDepartment || existing.department || "",
        specialistName: resolvedSpecialist || existing.specialistName || "",
        receivedDate: docData.receivedDate || existing.receivedDate,
        dueDate: docData.dueDate || existing.dueDate,
        priority: docData.priority || "normal",
        status: docData.status || existing.status || "processing",
        assignees: Array.isArray(docData.assignees) ? docData.assignees : [],
        attachments: processedAttachments,
        notes: String(docData.notes || "").trim(),
        completionNote:
          docData.completionNote !== undefined
            ? String(docData.completionNote).trim()
            : existing.completionNote || "",
        completedAt:
          docData.status === "completed"
            ? existing.completedAt || nowIso
            : null,
        updatedAt: nowIso,
      };
      docs[idx] = updated;
      saveDocuments(docs);
      return (await syncDocAndPersistStatus(updated.id)) || updated;
    } else {
      const newDoc = {
        id: docId,
        docNumber: String(docData.docNumber || "").trim(),
        title: String(docData.title || "").trim(),
        issuer: String(docData.issuer || "").trim(),
        department: resolvedDepartment,
        specialistName: resolvedSpecialist,
        receivedDate: docData.receivedDate || nowIso.slice(0, 10),
        dueDate: docData.dueDate || "",
        priority: docData.priority || "normal",
        status: docData.status === "completed" ? "completed" : "processing",
        assignees: Array.isArray(docData.assignees) ? docData.assignees : [],
        attachments: processedAttachments,
        notes: String(docData.notes || "").trim(),
        completionNote: String(docData.completionNote || "").trim(),
        completedAt: docData.status === "completed" ? nowIso : null,
        createdAt: nowIso,
        updatedAt: nowIso,
        messageLogs: [],
      };
      docs.unshift(newDoc);
      saveDocuments(docs);
      return (await syncDocAndPersistStatus(newDoc.id)) || newDoc;
    }
  });

  ipcMain.handle("docs:delete", async (_event, docId) => {
    const docs = loadDocuments();
    const filtered = docs.filter((d) => d.id !== docId);
    saveDocuments(filtered);
    const sheetDelete = await googleSheetService.deleteDocument(docId);
    return { success: true, sheetDelete };
  });

  ipcMain.handle("docs:update-status", async (_event, { docId, status, completionNote }) => {
    const docs = loadDocuments();
    const idx = docs.findIndex((d) => d.id === docId);
    if (idx === -1) throw new Error("Không tìm thấy văn bản.");

    const nowIso = new Date().toISOString();
    docs[idx].status = status;
    docs[idx].updatedAt = nowIso;
    if (status === "completed") {
      docs[idx].completedAt = nowIso;
      if (completionNote !== undefined) {
        docs[idx].completionNote = String(completionNote).trim();
      }
    } else {
      docs[idx].completedAt = null;
    }
    saveDocuments(docs);
    return (await syncDocAndPersistStatus(docId)) || docs[idx];
  });

  ipcMain.handle(
    "docs:complete-with-response",
    async (_event, { docId, completionNote, responseAttachments = [] }) => {
      const docs = loadDocuments();
      const idx = docs.findIndex((d) => d.id === docId);
      if (idx === -1) {
        throw new Error("Không tìm thấy nhiệm vụ cần đánh dấu hoàn thành.");
      }

      const nowIso = new Date().toISOString();
      const currentAttachments = Array.isArray(docs[idx].attachments)
        ? [...docs[idx].attachments]
        : [];

      for (const att of responseAttachments) {
        const savedAtt = await copyAttachmentToConfiguredDir(att, {
          category: "completed",
          docNumber: docs[idx].docNumber,
          docId,
        });
        if (!savedAtt) continue;

        const baseName = path.basename(savedAtt.path);
        const displayName = att.name
          ? att.name.startsWith("[VB Phản hồi]")
            ? att.name
            : `[VB Phản hồi] ${att.name}`
          : `[VB Phản hồi] ${baseName}`;

        const alreadyExists = currentAttachments.some(
          (existing) =>
            path.resolve(existing.path || "") === path.resolve(savedAtt.path)
        );
        if (!alreadyExists) {
          currentAttachments.push({
            ...savedAtt,
            id: `att_resp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: displayName,
            category: "completed",
            isCompletionFile: true,
          });
        }
      }

      docs[idx].attachments = currentAttachments;
      docs[idx].status = "completed";
      docs[idx].completedAt = nowIso;
      docs[idx].updatedAt = nowIso;
      if (completionNote) {
        docs[idx].completionNote = String(completionNote).trim();
      }

      saveDocuments(docs);
      return (await syncDocAndPersistStatus(docId)) || docs[idx];
    }
  );

  // ==================== FILES IPC ====================
  ipcMain.handle("files:pick", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Chọn tệp văn bản đính kèm",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Văn bản & Tài liệu (PDF, Word, Excel, Ảnh)",
          extensions: [
            "pdf",
            "doc",
            "docx",
            "xls",
            "xlsx",
            "ppt",
            "pptx",
            "txt",
            "png",
            "jpg",
            "jpeg",
            "webp",
            "zip",
            "rar",
          ],
        },
        { name: "Tất cả các tệp", extensions: ["*"] },
      ],
    });

    if (result.canceled || !result.filePaths.length) {
      return [];
    }

    return result.filePaths.map((fp) => {
      const stat = fs.statSync(fp);
      return {
        id: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: path.basename(fp),
        path: fp,
        size: stat.size,
        ext: path.extname(fp).replace(".", "").toLowerCase(),
      };
    });
  });

  ipcMain.handle("files:open", async (_event, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error("Tệp đính kèm không tồn tại trên ổ cứng.");
    }
    const err = await shell.openPath(filePath);
    if (err) throw new Error(err);
    return { success: true };
  });

  ipcMain.handle("files:show-in-folder", async (_event, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error("Tệp đính kèm không tồn tại trên ổ cứng.");
    }
    shell.showItemInFolder(filePath);
    return { success: true };
  });

  // ==================== STORAGE FOLDER SETTINGS IPC ====================
  ipcMain.handle("storage:pick-folder", async (_event, defaultPath) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Chọn thư mục lưu file văn bản",
      defaultPath:
        defaultPath && fs.existsSync(defaultPath) ? defaultPath : DATA_DIR,
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths.length) {
      return { canceled: true, path: "" };
    }
    return { canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle("storage:open-folder", async (_event, folderPath) => {
    if (!folderPath) {
      throw new Error("Chưa có đường dẫn thư mục.");
    }
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    const err = await shell.openPath(folderPath);
    if (err) throw new Error(err);
    return { success: true };
  });

  ipcMain.handle("storage:migrate-existing", async () => {
    const docs = loadDocuments();
    let totalProcessed = 0;
    let movedCount = 0;
    let skippedMissing = 0;

    for (const doc of docs) {
      if (!Array.isArray(doc.attachments) || doc.attachments.length === 0) {
        continue;
      }
      const nextAttachments = [];
      for (const att of doc.attachments) {
        totalProcessed++;
        if (!att || !att.path || !fs.existsSync(att.path)) {
          skippedMissing++;
          nextAttachments.push(att);
          continue;
        }
        const prevPath = path.resolve(att.path);
        const migrated = await copyAttachmentToConfiguredDir(att, {
          category: att.category,
          docNumber: doc.docNumber,
          docId: doc.id,
        });
        if (migrated) {
          if (path.resolve(migrated.path) !== prevPath) {
            movedCount++;
          }
          nextAttachments.push(migrated);
        } else {
          nextAttachments.push(att);
        }
      }
      doc.attachments = nextAttachments;
    }

    saveDocuments(docs);
    return {
      success: true,
      totalProcessed,
      movedCount,
      skippedMissing,
      docs,
    };
  });

  // ==================== ZALO (zca-js) IPC ====================
  ipcMain.handle("zalo:get-status", async () => {
    return zaloService.getStatus();
  });

  ipcMain.handle("zalo:get-saved-credentials", async () => {
    return zaloService.getSavedCredentials();
  });

  ipcMain.handle("zalo:auto-login-saved", async () => {
    return await zaloService.autoLoginFromSession();
  });

  ipcMain.handle("zalo:start-qr", async () => {
    return await zaloService.startQRLogin();
  });

  ipcMain.handle("zalo:abort-qr", async () => {
    zaloService.abortQRLogin();
    return { success: true };
  });

  ipcMain.handle("zalo:login-credentials", async (_event, creds) => {
    return await zaloService.loginWithCredentials(creds);
  });

  ipcMain.handle(
    "webportal:handle-ioffice-login",
    async (_event, { webContentsId, forceSubmit = false } = {}) => {
      const wc = webContents.fromId(Number(webContentsId));
      if (!wc || wc.isDestroyed()) {
        return { filled: false, submitted: false };
      }

      const settings = geminiService.getPublicSettings();
      const savedUser = String(settings.iofficeUsername || "").trim();
      const savedPass = String(settings.iofficePassword || "");
      const shouldAutoSubmit = Boolean(forceSubmit || settings.iofficeAutoLogin);
      const shouldAutoCapture = settings.iofficeAutoSaveOnWeb !== false;

      const allFrames = wc.mainFrame?.framesInSubtree || [wc.mainFrame];
      let anyFilled = false;
      let anySubmitted = false;
      let capturedCreds = null;

      for (const frame of allFrames) {
        if (!frame || frame.isDestroyed?.()) continue;
        try {
          const res = await frame.executeJavaScript(
            `
            (() => {
              const out = { filled: false, submitted: false, captured: null };

              function isVisible(el) {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 10 && rect.height > 10;
              }

              function setNativeValue(el, val) {
                if (!el) return;
                el.focus();
                const proto = Object.getPrototypeOf(el);
                const desc = Object.getOwnPropertyDescriptor(proto, "value") ||
                             Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
                if (desc && desc.set) {
                  desc.set.call(el, val);
                } else {
                  el.value = val;
                }
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
              }

              function findLoginFields() {
                const passInputs = Array.from(document.querySelectorAll("input[type='password']")).filter(isVisible);
                if (passInputs.length === 0) return null;
                const passEl = passInputs[0];
                const form = passEl.closest("form") || document.body;

                // Tìm ô nhập tài khoản nằm trước ô mật khẩu trong cùng form hoặc trang
                const candidates = Array.from(
                  form.querySelectorAll(
                    "input[type='text'], input[type='email'], input[type='tel'], input:not([type])"
                  )
                ).filter((el) => {
                  if (!isVisible(el) || el.disabled || el.readOnly) return false;
                  const meta = (
                    (el.name || "") + " " +
                    (el.id || "") + " " +
                    (el.placeholder || "") + " " +
                    (el.className || "")
                  ).toLowerCase();
                  if (/captcha|macode|maxacnhan|otp|search|timkiem/i.test(meta)) return false;
                  return true;
                });

                let userEl = candidates.find((el) => {
                  const meta = (
                    (el.name || "") + " " +
                    (el.id || "") + " " +
                    (el.placeholder || "") + " " +
                    (el.getAttribute(" autocomplete") || "")
                  ).toLowerCase();
                  return /user|account|login|taikhoan|tendangnhap|email|uid|ma_nv/i.test(meta);
                });
                if (!userEl && candidates.length > 0) {
                  userEl = candidates[0];
                }

                // Kiểm tra xem có ô Captcha đang trống không
                const captchaEl = Array.from(
                  form.querySelectorAll("input[type='text'], input:not([type])")
                ).find((el) => {
                  if (!isVisible(el)) return false;
                  const meta = ((el.name || "") + " " + (el.id || "") + " " + (el.placeholder || "")).toLowerCase();
                  return /captcha|maxacnhan|mabaove|securitycode/i.test(meta);
                });

                return { form, userEl, passEl, captchaEl };
              }

              // 1. Kiểm tra nếu người dùng vừa nhập tài khoản/mật khẩu trên trang web ở lần thao tác trước
              try {
                const rawCap = sessionStorage.getItem("__qlcv_captured_ioffice_creds");
                if (rawCap) {
                  sessionStorage.removeItem("__qlcv_captured_ioffice_creds");
                  out.captured = JSON.parse(rawCap);
                }
              } catch (_) {}

              const fields = findLoginFields();
              if (!fields || !fields.userEl || !fields.passEl) {
                return out;
              }

              // 2. Gắn hook tự động bắt Tài khoản & Mật khẩu khi người dùng gõ trên trang Web và bấm Đăng nhập
              if (${JSON.stringify(shouldAutoCapture)} && !fields.passEl.dataset.qlcvHooked) {
                fields.passEl.dataset.qlcvHooked = "1";
                const saveNow = () => {
                  const u = (fields.userEl.value || "").trim();
                  const p = fields.passEl.value || "";
                  if (u && p) {
                    try {
                      sessionStorage.setItem(
                        "__qlcv_captured_ioffice_creds",
                        JSON.stringify({
                          username: u,
                          password: p,
                          url: location.origin + location.pathname,
                        })
                      );
                    } catch (_) {}
                  }
                };
                fields.userEl.addEventListener("change", saveNow);
                fields.passEl.addEventListener("change", saveNow);
                fields.passEl.addEventListener("keydown", (e) => {
                  if (e.key === "Enter") saveNow();
                });
                if (fields.form) {
                  fields.form.addEventListener("submit", saveNow, true);
                  fields.form.addEventListener("click", (e) => {
                    const btn = e.target.closest("button, input[type='submit'], input[type='button'], a");
                    if (btn) saveNow();
                  }, true);
                }
              }

              // 3. Nếu đã có Tài khoản & Mật khẩu iOffice lưu trong phần mềm -> Tự động điền vào ô
              const savedU = ${JSON.stringify(savedUser)};
              const savedP = ${JSON.stringify(savedPass)};
              const doSubmit = ${JSON.stringify(shouldAutoSubmit)};
              const isForce = ${JSON.stringify(Boolean(forceSubmit))};

              if (savedU && savedP) {
                if (fields.userEl.value !== savedU) {
                  setNativeValue(fields.userEl, savedU);
                }
                if (fields.passEl.value !== savedP) {
                  setNativeValue(fields.passEl, savedP);
                }
                out.filled = true;

                // Tự động tích ô "Ghi nhớ đăng nhập / Remember me" nếu có
                try {
                  const rememberChk = Array.from(fields.form.querySelectorAll("input[type='checkbox']")).find(
                    (c) => !c.checked && isVisible(c)
                  );
                  if (rememberChk) {
                    rememberChk.click();
                  }
                } catch (_) {}

                // Nếu bật tự động đăng nhập (hoặc bấm nút "Đăng nhập ngay") và không vướng Captcha đang bỏ trống
                const hasEmptyCaptcha = Boolean(fields.captchaEl && !fields.captchaEl.value.trim());
                const nowTs = Date.now();
                const lastAutoTs = Number(window.__qlcvLastAutoSubmitTs || 0);
                let prevAttemptTs = 0;
                try {
                  prevAttemptTs = Number(sessionStorage.getItem("__qlcv_last_autosubmit_ts") || 0);
                } catch (_) {}

                if (doSubmit && (!hasEmptyCaptcha || isForce) && (isForce || (nowTs - lastAutoTs > 15000 && nowTs - prevAttemptTs > 15000))) {
                  window.__qlcvLastAutoSubmitTs = nowTs;
                  try {
                    sessionStorage.setItem("__qlcv_last_autosubmit_ts", String(nowTs));
                  } catch (_) {}

                  // Tìm nút Đăng nhập
                  const btnCandidates = Array.from(
                    fields.form.querySelectorAll(
                      "button[type='submit'], input[type='submit'], button, input[type='button'], a.btn, a[id*='login' i], a[id*='dangnhap' i]"
                    )
                  ).filter(isVisible);

                  let loginBtn = btnCandidates.find((el) => {
                    const txt = (
                      (el.innerText || el.value || el.title || el.id || el.name || "")
                    ).toLowerCase();
                    return /đăng\\s*nhập|dang\\s*nhap|login|sign\\s*in|xác\\s*nhận/i.test(txt);
                  });

                  if (!loginBtn) {
                    loginBtn = fields.form.querySelector("button[type='submit'], input[type='submit']");
                  }

                  if (loginBtn) {
                    setTimeout(() => loginBtn.click(), 120);
                    out.submitted = true;
                  } else if (fields.form && fields.form.tagName === "FORM") {
                    setTimeout(() => {
                      try {
                        fields.form.requestSubmit ? fields.form.requestSubmit() : fields.form.submit();
                      } catch (_) {}
                    }, 120);
                    out.submitted = true;
                  }
                }
              }

              return out;
            })();
            `,
            true
          );

          if (res) {
            if (res.filled) anyFilled = true;
            if (res.submitted) anySubmitted = true;
            if (res.captured && res.captured.username && res.captured.password) {
              capturedCreds = res.captured;
            }
          }
        } catch (_) {}
      }

      // Nếu tự động bắt được tài khoản/mật khẩu mới khi người dùng gõ trên trang Web iOffice -> Lưu ngay vào settings.json
      if (
        capturedCreds &&
        shouldAutoCapture &&
        (capturedCreds.username !== savedUser || capturedCreds.password !== savedPass)
      ) {
        const updatedSettings = geminiService.saveSettings({
          iofficeUsername: capturedCreds.username,
          iofficePassword: capturedCreds.password,
          iofficeUrl: capturedCreds.url || settings.iofficeUrl,
        });
        sendToRenderer("webportal:ioffice-creds-autosaved", {
          username: capturedCreds.username,
          settings: updatedSettings,
        });
      }

      return {
        filled: anyFilled,
        submitted: anySubmitted,
        captured: Boolean(capturedCreds),
      };
    }
  );

  ipcMain.handle("zalo:logout", async () => {
    return await zaloService.logout();
  });

  ipcMain.handle("zalo:get-contacts", async () => {
    return zaloService.getContacts();
  });

  ipcMain.handle("zalo:sync-contacts", async () => {
    const contacts = await zaloService.syncContacts();
    return { success: true, contacts };
  });

  ipcMain.handle("zalo:find-by-phone", async (_event, phone) => {
    const contact = await zaloService.findUserByPhone(phone);
    return { success: true, contact, contacts: zaloService.getContacts() };
  });

  ipcMain.handle("zalo:add-manual-contact", async (_event, data) => {
    const contact = zaloService.addManualContact(data);
    return { success: true, contact, contacts: zaloService.getContacts() };
  });

  ipcMain.handle("zalo:send-message", async (_event, payload) => {
    const {
      docId,
      recipients,
      message,
      urgency,
      attachmentPaths,
      templateType,
    } = payload;

    const results = await zaloService.sendMessageToAssignees({
      recipients,
      message,
      urgency,
      attachmentPaths,
    });

    // Save message log to the document if docId is provided
    let updatedDoc = null;
    if (docId) {
      const docs = loadDocuments();
      const idx = docs.findIndex((d) => d.id === docId);
      if (idx >= 0) {
        if (!Array.isArray(docs[idx].messageLogs)) {
          docs[idx].messageLogs = [];
        }
        docs[idx].messageLogs.unshift({
          id: `msglog_${Date.now()}`,
          sentAt: new Date().toISOString(),
          templateType: templateType || "custom",
          message,
          urgency: urgency || "default",
          attachmentCount: Array.isArray(attachmentPaths) ? attachmentPaths.length : 0,
          results,
        });
        docs[idx].updatedAt = new Date().toISOString();
        saveDocuments(docs);
        updatedDoc = (await syncDocAndPersistStatus(docId)) || docs[idx];
      }
    }

    return {
      success: results.some((r) => r.success),
      results,
      updatedDoc,
    };
  });

  // ==================== GOOGLE SHEET & APPS SCRIPT DASHBOARD IPC ====================
  ipcMain.handle("gsheet:test-connection", async (_event, overrideConfig) => {
    return await googleSheetService.testConnection(overrideConfig);
  });

  ipcMain.handle("gsheet:sync-one", async (_event, docId) => {
    const updatedDoc = await syncDocAndPersistStatus(docId, { force: true });
    if (!updatedDoc) {
      throw new Error("Không tìm thấy văn bản cần đồng bộ.");
    }
    if (updatedDoc.sheetSyncError) {
      throw new Error(updatedDoc.sheetSyncError);
    }
    return { success: true, doc: updatedDoc };
  });

  ipcMain.handle("gsheet:sync-all", async () => {
    const docs = loadDocuments();
    const res = await googleSheetService.syncAllDocuments(docs);
    const syncedAt = res.syncedAt || new Date().toISOString();
    for (const d of docs) {
      d.sheetSyncedAt = syncedAt;
      d.sheetSyncError = "";
    }
    saveDocuments(docs);
    return {
      ...res,
      docs,
    };
  });

  ipcMain.handle("gsheet:open-dashboard", async (_event, customUrl) => {
    const cfg = googleSheetService.getConfig();
    const targetUrl = normalizeAppsScriptWebAppUrl(
      customUrl || cfg.webhookUrl
    );
    if (!targetUrl) {
      throw new Error(
        "Chưa cấu hình URL Web App Google Apps Script để mở Dashboard."
      );
    }
    await shell.openExternal(targetUrl);
    return { success: true, url: targetUrl };
  });

  ipcMain.handle("gsheet:get-apps-script-templates", async () => {
    return googleSheetService.getAppsScriptTemplates();
  });

  ipcMain.handle("gsheet:fetch-dashboard-data", async (_event, filters) => {
    return await googleSheetService.fetchDashboardData(filters || {});
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", async () => {
  try {
    if (zaloService && zaloService.isLoggedIn) {
      zaloService.persistCurrentSession();
    }
    const portalSession = session.fromPartition("persist:webportal");
    await portalSession.cookies.flushStore();
  } catch (_) {}
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
