const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("appApi", {
  // Documents
  listDocuments: () => ipcRenderer.invoke("docs:list"),
  saveDocument: (docData) => ipcRenderer.invoke("docs:save", docData),
  deleteDocument: (docId) => ipcRenderer.invoke("docs:delete", docId),
  updateDocumentStatus: (payload) => ipcRenderer.invoke("docs:update-status", payload),
  completeDocumentWithResponse: (payload) =>
    ipcRenderer.invoke("docs:complete-with-response", payload),
  generateNd30AssignmentDoc: (payload) =>
    ipcRenderer.invoke("nd30:generate-for-doc", payload),
  importNd30AddInSettings: () =>
    ipcRenderer.invoke("nd30:import-addin-settings"),

  // Files & Storage Configuration
  pickFiles: () => ipcRenderer.invoke("files:pick"),
  openFile: (filePath) => ipcRenderer.invoke("files:open", filePath),
  showFileInFolder: (filePath) => ipcRenderer.invoke("files:show-in-folder", filePath),
  pickStorageFolder: (defaultPath) =>
    ipcRenderer.invoke("storage:pick-folder", defaultPath),
  openStorageFolder: (folderPath) =>
    ipcRenderer.invoke("storage:open-folder", folderPath),
  migrateStorageFiles: () => ipcRenderer.invoke("storage:migrate-existing"),
  testGoogleSheetConnection: (overrideConfig) =>
    ipcRenderer.invoke("gsheet:test-connection", overrideConfig),
  syncDocToGoogleSheet: (docId) => ipcRenderer.invoke("gsheet:sync-one", docId),
  syncAllDocsToGoogleSheet: () => ipcRenderer.invoke("gsheet:sync-all"),
  openAppsScriptDashboard: (customUrl) =>
    ipcRenderer.invoke("gsheet:open-dashboard", customUrl),
  getAppsScriptTemplates: () =>
    ipcRenderer.invoke("gsheet:get-apps-script-templates"),
  fetchGoogleSheetDashboardData: (filters) =>
    ipcRenderer.invoke("gsheet:fetch-dashboard-data", filters),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (_) {
      return file?.path || "";
    }
  },

  // Gemini AI & Web Portal
  getGeminiSettings: () => ipcRenderer.invoke("gemini:get-settings"),
  saveGeminiSettings: (settings) => ipcRenderer.invoke("gemini:save-settings", settings),
  analyzeFileWithGemini: (filePath) => ipcRenderer.invoke("gemini:analyze-file", filePath),
  analyzeWebPageWithGemini: (payload) => ipcRenderer.invoke("gemini:analyze-webpage", payload),
  analyzeCompletionWithGemini: (payload) =>
    ipcRenderer.invoke("gemini:analyze-completion", payload),
  extractWebviewContent: (webContentsId) =>
    ipcRenderer.invoke("webportal:extract-webview-content", webContentsId),
  handleIofficeLogin: (payload) =>
    ipcRenderer.invoke("webportal:handle-ioffice-login", payload),
  exportWebPageFile: (payload) => ipcRenderer.invoke("webportal:export-page-file", payload),
  saveWebScreenshot: (payload) => ipcRenderer.invoke("webportal:save-screenshot", payload),

  // Chatbox AI Chat
  getAiChatState: () => ipcRenderer.invoke("aichat:get-state"),
  saveAiChatSettings: (settings) => ipcRenderer.invoke("aichat:save-settings", settings),
  createAiChatSession: (opts) => ipcRenderer.invoke("aichat:create-session", opts),
  setActiveAiChatSession: (sessionId) =>
    ipcRenderer.invoke("aichat:set-active-session", sessionId),
  updateAiChatSession: (sessionId, patch) =>
    ipcRenderer.invoke("aichat:update-session", { sessionId, patch }),
  deleteAiChatSession: (sessionId) =>
    ipcRenderer.invoke("aichat:delete-session", sessionId),
  clearAiChatSession: (sessionId) =>
    ipcRenderer.invoke("aichat:clear-session", sessionId),
  deleteAiChatMessage: (sessionId, messageId) =>
    ipcRenderer.invoke("aichat:delete-message", { sessionId, messageId }),
  sendAiChatMessage: (payload) => ipcRenderer.invoke("aichat:send-message", payload),
  stopAiChatStream: (streamId) => ipcRenderer.invoke("aichat:stop-stream", streamId),
  fetchOllamaModels: (baseUrl) =>
    ipcRenderer.invoke("aichat:fetch-ollama-models", baseUrl),
  fetchAiModels: (payload) =>
    ipcRenderer.invoke("aichat:fetch-models", payload),

  // Version & GitHub Auto-Update
  getUpdateState: () => ipcRenderer.invoke("update:get-state"),
  saveUpdateConfig: (patch) => ipcRenderer.invoke("update:save-config", patch),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdateFromGithub: (targetTag) =>
    ipcRenderer.invoke("update:install", targetTag),
  rollbackAppBackup: (backupId) =>
    ipcRenderer.invoke("update:rollback", backupId),
  openGithubReleaseUrl: (url) =>
    ipcRenderer.invoke("update:open-release-url", url),
  saveAiChatPastedImage: (payload) =>
    ipcRenderer.invoke("aichat:save-pasted-image", payload),
  exportAiChatMarkdown: (payload) =>
    ipcRenderer.invoke("aichat:export-markdown", payload),

  // Zalo (zca-js)
  getZaloStatus: () => ipcRenderer.invoke("zalo:get-status"),
  getSavedZaloCredentials: () => ipcRenderer.invoke("zalo:get-saved-credentials"),
  autoLoginZaloSaved: () => ipcRenderer.invoke("zalo:auto-login-saved"),
  startQRLogin: () => ipcRenderer.invoke("zalo:start-qr"),
  abortQRLogin: () => ipcRenderer.invoke("zalo:abort-qr"),
  loginWithCredentials: (creds) => ipcRenderer.invoke("zalo:login-credentials", creds),
  logoutZalo: () => ipcRenderer.invoke("zalo:logout"),
  getContacts: () => ipcRenderer.invoke("zalo:get-contacts"),
  syncContacts: () => ipcRenderer.invoke("zalo:sync-contacts"),
  findContactByPhone: (phone) => ipcRenderer.invoke("zalo:find-by-phone", phone),
  addManualContact: (data) => ipcRenderer.invoke("zalo:add-manual-contact", data),
  sendZaloMessage: (payload) => ipcRenderer.invoke("zalo:send-message", payload),

  // Event Listeners from Main Process
  onZaloStatusChanged: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("zalo:status-changed", handler);
    return () => ipcRenderer.removeListener("zalo:status-changed", handler);
  },
  onZaloQREvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("zalo:qr-event", handler);
    return () => ipcRenderer.removeListener("zalo:qr-event", handler);
  },
  onContactsUpdated: (callback) => {
    const handler = (_event, contacts) => callback(contacts);
    ipcRenderer.on("zalo:contacts-updated", handler);
    return () => ipcRenderer.removeListener("zalo:contacts-updated", handler);
  },
  onWebPortalDownloadStarted: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("webportal:download-started", handler);
    return () => ipcRenderer.removeListener("webportal:download-started", handler);
  },
  onWebPortalFileCaptured: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("webportal:file-captured", handler);
    return () => ipcRenderer.removeListener("webportal:file-captured", handler);
  },
  onWebPortalDownloadFailed: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("webportal:download-failed", handler);
    return () => ipcRenderer.removeListener("webportal:download-failed", handler);
  },
  onIofficeCredsAutosaved: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("webportal:ioffice-creds-autosaved", handler);
    return () => ipcRenderer.removeListener("webportal:ioffice-creds-autosaved", handler);
  },
  onAiChatStreamEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("aichat:stream-event", handler);
    return () => ipcRenderer.removeListener("aichat:stream-event", handler);
  },
  onUpdateStatusChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("update:status-changed", handler);
    return () => ipcRenderer.removeListener("update:status-changed", handler);
  },
});
