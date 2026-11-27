const STANDARD_DEPARTMENTS = [
  "Phòng Kinh tế",
  "Phòng Văn hóa - Xã hội",
  "Công an",
  "Quân sự",
  "Trung tâm dịch vụ tổng hợp",
  "Trung tâm Phục vụ Hành chính công",
  "Trạm Y tế",
];

// ==================== STATE MANAGEMENT ====================
const state = {
  documents: [],
  contacts: [],
  zaloStatus: {
    isLoggedIn: false,
    loginStatus: "disconnected",
    accountInfo: null,
    contactCount: 0,
  },
  activeTab: "processing", // 'processing' | 'overdue' | 'completed'
  searchQuery: "",
  filterDepartment: "",
  filterAssignee: "",
  filterPriority: "",

  // Form modal state
  editingDocId: null,
  formAssignees: [], // [{ userId, displayName, avatar, phoneNumber, role: 'lead' | 'coord' }]
  formAttachments: [], // [{ id, name, path, size, ext }]

  // Send Zalo modal state
  sendingDoc: null,
  selectedTemplate: "assign",
  sendingExtraAttachments: [],
  preselectedRecipientId: null,

  // View mode state ('tasks' | 'web' | 'chat' | 'dashboard')
  viewMode: "tasks",
  lastWebPageScreenshotBase64: "",
  portalDownloadTarget: "new_task", // 'new_task' | 'completion_response'

  // In-app Google Sheet Dashboard state
  dashboard: {
    department: "",
    status: "all",
    priority: "",
    specialist: "",
    search: "",
    data: null,
  },

  // Chatbox AI Chat state
  aiChat: {
    activeSessionId: "",
    sessions: [],
    copilotPresets: [],
    settings: null,
    searchQuery: "",
    pendingAttachments: [],
    quotedText: "",
    streamingSessionId: "",
    streamingMessageId: "",
    activeStreamId: "",
  },

  // Completion Matcher Modal state
  completionAttachments: [], // [{ id, name, path, size, ext }]
  completionExtracted: null,

  // Gemini AI & Web Portal settings state
  geminiSettings: {
    aiProvider: "gemini",
    aiProviders: {},
    hasApiKey: false,
    maskedApiKey: "",
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash",
    autoAnalyzeOnPick: true,
    autoCaptureWebDownloads: true,
    portalHomeUrl: "https://www.google.com",
    portalBookmarks: [],
  },
  systemAiDraftProviders: null,
  systemAiActiveDraftProvider: "gemini",

  // App version & GitHub auto-update state
  update: {
    state: null,
    liveStatus: null,
  },
};

// ==================== HELPERS ====================
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isoDateToVn(isoStr) {
  const s = String(isoStr || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function vnDateToIso(inputStr) {
  const s = String(inputStr || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const dd = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  const yyyy = Number.parseInt(m[3], 10);
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) {
    return null;
  }
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function isoDateTimeToVn(isoStr) {
  const s = String(isoStr || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) {
    const datePart = `${m[3]}/${m[2]}/${m[1]}`;
    return m[4] && m[5] ? `${datePart} ${m[4]}:${m[5]}` : `${datePart} 17:00`;
  }
  return s;
}

function vnDateTimeToIso(inputStr) {
  const s = String(inputStr || "").trim();
  if (!s) return "";
  const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (isoM) {
    return `${isoM[1]}-${isoM[2]}-${isoM[3]}T${isoM[4] || "17"}:${isoM[5] || "00"}`;
  }
  const m = s.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/
  );
  if (!m) return null;
  const dd = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  const yyyy = Number.parseInt(m[3], 10);
  const hh = m[4] !== undefined ? Number.parseInt(m[4], 10) : 17;
  const min = m[5] !== undefined ? Number.parseInt(m[5], 10) : 0;
  if (hh < 0 || hh > 23 || min < 0 || min > 59) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) {
    return null;
  }
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}T${String(
    hh
  ).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function setDocModalDatesFromIso(receivedIso, dueIso) {
  const recTextEl = document.getElementById("docReceivedDateInput");
  const recPickEl = document.getElementById("docReceivedDatePicker");
  const dueTextEl = document.getElementById("docDueDateInput");
  const duePickEl = document.getElementById("docDueDatePicker");

  const recIso = receivedIso ? String(receivedIso).slice(0, 10) : "";
  const dIso = dueIso ? String(dueIso).slice(0, 16) : "";

  if (recTextEl) recTextEl.value = recIso ? isoDateToVn(recIso) : "";
  if (recPickEl) recPickEl.value = /^\d{4}-\d{2}-\d{2}$/.test(recIso) ? recIso : "";
  if (dueTextEl) dueTextEl.value = dIso ? isoDateTimeToVn(dIso) : "";
  if (duePickEl) {
    duePickEl.value = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dIso) ? dIso.slice(0, 16) : "";
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  const icon = type === "success" ? "✅" : type === "error" ? "❌" : "💡";
  el.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 4200);
}

function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTimeVN(dateStr) {
  if (!dateStr) return "Chưa đặt hạn";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${hh}:${mm} ngày ${dd}/${mo}/${yyyy}`;
}

function formatDateOnlyVN(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mo}/${yyyy}`;
}

function getEffectiveTab(doc) {
  if (doc.status === "completed") {
    return "completed";
  }
  if (doc.dueDate) {
    const dueMs = new Date(doc.dueDate).getTime();
    if (!Number.isNaN(dueMs) && dueMs < Date.now()) {
      return "overdue";
    }
  }
  return "processing";
}

function getDeadlineInfo(doc) {
  if (doc.status === "completed") {
    return {
      type: "completed",
      label: `Hoàn thành: ${formatDateTimeVN(doc.completedAt || doc.updatedAt)}`,
      relativeText: "Đã hoàn thành",
    };
  }
  if (!doc.dueDate) {
    return {
      type: "normal",
      label: "Không thời hạn",
      relativeText: "Không giới hạn",
    };
  }

  const dueMs = new Date(doc.dueDate).getTime();
  const diffMs = dueMs - Date.now();
  const absMs = Math.abs(diffMs);

  const totalMinutes = Math.floor(absMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;

  let durationStr = "";
  if (days > 0) {
    durationStr = `${days} ngày ${hours} giờ`;
  } else if (hours > 0) {
    durationStr = `${hours} giờ ${mins} phút`;
  } else {
    durationStr = `${mins} phút`;
  }

  if (diffMs < 0) {
    return {
      type: "overdue",
      label: `Quá hạn ${durationStr} (${formatDateTimeVN(doc.dueDate)})`,
      relativeText: `${durationStr}`,
    };
  } else if (diffMs <= 24 * 3600 * 1000) {
    return {
      type: "soon",
      label: `Sắp đến hạn: còn ${durationStr} (${formatDateTimeVN(doc.dueDate)})`,
      relativeText: `còn ${durationStr}`,
    };
  } else {
    return {
      type: "normal",
      label: `Hạn: ${formatDateTimeVN(doc.dueDate)} (còn ${durationStr})`,
      relativeText: `còn ${durationStr}`,
    };
  }
}

function getInitials(name) {
  const parts = String(name || "U")
    .trim()
    .split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function renderAvatarHtml(avatarUrl, displayName, className = "contact-item-avatar") {
  if (avatarUrl && avatarUrl.startsWith("http")) {
    return `<img src="${escapeHtml(avatarUrl)}" class="${className}" alt="${escapeHtml(
      displayName
    )}" onerror="this.style.display='none'" />`;
  }
  return `<span class="avatar-fallback">${escapeHtml(getInitials(displayName))}</span>`;
}

// ==================== MESSAGE TEMPLATE BUILDER ====================
function buildMessageFromTemplate(doc, templateType) {
  const deadlineInfo = getDeadlineInfo(doc);
  const docNum = doc.docNumber || "Không số";
  const issuerLine = doc.issuer ? `\n• Cơ quan ban hành: ${doc.issuer}` : "";
  const notesLine = doc.notes ? `\n• Nội dung chỉ đạo: ${doc.notes}` : "";
  const dueFormatted = formatDateTimeVN(doc.dueDate);

  switch (templateType) {
    case "assign":
      return (
        `📄 [GIAO VĂN BẢN CẦN XỬ LÝ]\n` +
        `Kính gửi: {assigneeName}\n` +
        `• Số/Ký hiệu: ${docNum}${issuerLine}\n` +
        `• Trích yếu: ${doc.title}\n` +
        `• Hạn xử lý: ${dueFormatted}${notesLine}\n\n` +
        `Nhờ anh/chị kiểm tra văn bản và triển khai xử lý đúng tiến độ.`
      );

    case "remind":
      return (
        `⏰ [NHẮC HẠN XỬ LÝ VĂN BẢN]\n` +
        `Kính gửi: {assigneeName}\n` +
        `Văn bản số ${docNum} ("${doc.title}") sắp đến hạn xử lý:\n` +
        `• Hạn hoàn thành: ${dueFormatted} (${deadlineInfo.relativeText})${notesLine}\n\n` +
        `Nhờ anh/chị rà soát tiến độ và hoàn thành trước thời hạn.`
      );

    case "overdue":
      return (
        `🚨 [ĐÔN ĐỐC VĂN BẢN QUÁ HẠN]\n` +
        `Kính gửi: {assigneeName}\n` +
        `Văn bản số ${docNum} ("${doc.title}") hiện ĐÃ QUÁ HẠN xử lý!\n` +
        `• Hạn xử lý: ${dueFormatted} (Đã trễ ${deadlineInfo.relativeText})${notesLine}\n\n` +
        `Đề nghị anh/chị khẩn trương xử lý và phản hồi kết quả ngay!`
      );

    case "completed":
      return (
        `✅ [XÁC NHẬN ĐÃ XỬ LÝ VĂN BẢN]\n` +
        `Kính gửi: {assigneeName}\n` +
        `Văn bản số ${docNum} ("${doc.title}") đã được ghi nhận hoàn thành xử lý.` +
        (doc.completionNote ? `\n• Kết quả: ${doc.completionNote}` : "") +
        `\nTrân trọng cảm ơn sự phối hợp của anh/chị!`
      );

    default:
      return `📄 Văn bản ${docNum}: ${doc.title}\nHạn xử lý: ${dueFormatted}`;
  }
}

// ==================== RENDER FUNCTIONS ====================
function updateZaloHeaderStatus() {
  const dot = document.getElementById("zaloStatusDot");
  const avatar = document.getElementById("zaloHeaderAvatar");
  const text = document.getElementById("zaloStatusText");
  const countText = document.getElementById("zaloContactCountText");
  const contactsDivider = document.getElementById("zaloContactsDivider");
  const contactsBtn = document.getElementById("btnOpenContactsModal");
  const isLoggedIn = Boolean(state.zaloStatus.isLoggedIn);

  if (contactsDivider) {
    contactsDivider.classList.toggle("hidden", !isLoggedIn);
  }
  if (contactsBtn) {
    contactsBtn.classList.toggle("hidden", !isLoggedIn);
  }
  if (!isLoggedIn) {
    document.getElementById("contactsModal")?.classList.add("hidden");
  }

  if (countText) {
    countText.textContent = isLoggedIn ? `${state.contacts.length}` : "0";
  }

  if (state.zaloStatus.isLoggedIn && state.zaloStatus.accountInfo) {
    dot.className = "status-dot connected";
    text.textContent =
      state.zaloStatus.accountInfo.displayName || "Đã kết nối Zalo";
    if (state.zaloStatus.accountInfo.avatar) {
      avatar.src = state.zaloStatus.accountInfo.avatar;
      avatar.classList.remove("hidden");
    } else {
      avatar.classList.add("hidden");
    }
  } else if (
    state.zaloStatus.loginStatus === "connecting" ||
    state.zaloStatus.loginStatus === "qr_waiting" ||
    state.zaloStatus.loginStatus === "qr_scanned"
  ) {
    dot.className = "status-dot connecting";
    text.textContent = "Đang kết nối Zalo...";
    avatar.classList.add("hidden");
  } else {
    dot.className = "status-dot disconnected";
    text.textContent = "Đăng nhập Zalo";
    avatar.classList.add("hidden");
  }

  // Update Auth Modal if open
  const connectedPanel = document.getElementById("zaloConnectedPanel");
  const loginPanel = document.getElementById("zaloLoginPanel");
  const savedBanner = document.getElementById("zaloSavedSessionBanner");
  const savedLabel = document.getElementById("zaloSavedSessionAccountLabel");

  if (state.zaloStatus.isLoggedIn && state.zaloStatus.accountInfo) {
    connectedPanel.classList.remove("hidden");
    loginPanel.classList.add("hidden");
    document.getElementById("connectedProfileName").textContent =
      state.zaloStatus.accountInfo.displayName;
    document.getElementById("connectedProfileUid").textContent = `Zalo UID: ${
      state.zaloStatus.accountInfo.userId || "—"
    }`;
    const profAvatar = document.getElementById("connectedProfileAvatar");
    profAvatar.src =
      state.zaloStatus.accountInfo.avatar ||
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%230068ff'/></svg>";
  } else {
    connectedPanel.classList.add("hidden");
    loginPanel.classList.remove("hidden");
    if (savedBanner) {
      if (state.zaloStatus.hasSavedSession) {
        savedBanner.classList.remove("hidden");
        const accName =
          state.zaloStatus.accountInfo?.displayName || "Phiên Zalo đã lưu";
        const savedTime = state.zaloStatus.savedAt
          ? ` (Lưu lúc: ${formatDateTimeVN(state.zaloStatus.savedAt)})`
          : "";
        if (savedLabel) {
          savedLabel.textContent = `${accName}${savedTime}`;
        }
      } else {
        savedBanner.classList.add("hidden");
      }
    }
  }
}

async function populateSavedZaloCredentialsInForm() {
  try {
    if (typeof window.appApi.getSavedZaloCredentials !== "function") return;
    const saved = await window.appApi.getSavedZaloCredentials();
    if (!saved) return;
    const imeiEl = document.getElementById("credImeiInput");
    const uaEl = document.getElementById("credUserAgentInput");
    const cookieEl = document.getElementById("credCookieInput");
    if (imeiEl && saved.imei) imeiEl.value = saved.imei;
    if (uaEl && saved.userAgent) uaEl.value = saved.userAgent;
    if (cookieEl && saved.cookieJson) cookieEl.value = saved.cookieJson;
  } catch (err) {
    console.warn("Could not load saved Zalo credentials into form:", err);
  }
}

function updateAssigneeFilterDropdown() {
  const select = document.getElementById("filterAssignee");
  const currentVal = select.value;

  const map = new Map();
  if (state.zaloStatus.isLoggedIn) {
    for (const c of state.contacts) {
      map.set(c.userId, c.displayName);
    }
  }
  for (const doc of state.documents) {
    for (const a of doc.assignees || []) {
      if (a.userId && a.displayName) {
        map.set(a.userId, a.displayName);
      }
    }
  }

  const entries = Array.from(map.entries()).sort((a, b) =>
    a[1].localeCompare(b[1], "vi")
  );

  select.innerHTML =
    `<option value="">👤 Tất cả người phụ trách</option>` +
    entries
      .map(
        ([uid, name]) =>
          `<option value="${escapeHtml(uid)}">👤 ${escapeHtml(name)}</option>`
      )
      .join("");

  if (map.has(currentVal)) {
    select.value = currentVal;
  }
}

function updateDepartmentFilterDropdown() {
  const select = document.getElementById("filterDepartment");
  if (!select) return;
  const currentVal = select.value;

  const deptSet = new Set(STANDARD_DEPARTMENTS);
  for (const doc of state.documents) {
    if (doc.department && doc.department.trim()) {
      deptSet.add(doc.department.trim());
    }
  }
  const defaultDept = state.geminiSettings?.defaultDepartment;
  if (defaultDept && defaultDept.trim()) {
    deptSet.add(defaultDept.trim());
  }

  select.innerHTML =
    `<option value="">🏢 Tất cả phòng ban</option>` +
    Array.from(deptSet)
      .map(
        (d) => `<option value="${escapeHtml(d)}">🏢 ${escapeHtml(d)}</option>`
      )
      .join("");

  if (currentVal && deptSet.has(currentVal)) {
    select.value = currentVal;
  }
}

function renderTabsAndDocuments() {
  let countProcessing = 0;
  let countOverdue = 0;
  let countCompleted = 0;

  for (const doc of state.documents) {
    const tab = getEffectiveTab(doc);
    if (tab === "processing") countProcessing++;
    else if (tab === "overdue") countOverdue++;
    else if (tab === "completed") countCompleted++;
  }

  document.getElementById("badgeProcessing").textContent = countProcessing;
  document.getElementById("badgeOverdue").textContent = countOverdue;
  document.getElementById("badgeCompleted").textContent = countCompleted;

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === state.activeTab);
  });

  const bulkOverdueBtn = document.getElementById("btnBulkRemindOverdue");
  if (state.activeTab === "overdue" && countOverdue > 0) {
    bulkOverdueBtn.classList.remove("hidden");
  } else {
    bulkOverdueBtn.classList.add("hidden");
  }

  // Filter documents for active tab
  const query = state.searchQuery.trim().toLowerCase();
  const filtered = state.documents.filter((doc) => {
    if (getEffectiveTab(doc) !== state.activeTab) return false;

    if (
      state.filterDepartment &&
      String(doc.department || "").trim() !== state.filterDepartment
    ) {
      return false;
    }

    if (state.filterPriority && doc.priority !== state.filterPriority) {
      return false;
    }

    if (state.filterAssignee) {
      const hasAssignee = (doc.assignees || []).some(
        (a) => String(a.userId) === String(state.filterAssignee)
      );
      if (!hasAssignee) return false;
    }

    if (query) {
      const haystack = [
        doc.docNumber,
        doc.title,
        doc.issuer,
        doc.department,
        doc.specialistName,
        doc.notes,
        doc.completionNote,
        ...(doc.assignees || []).map((a) => a.displayName),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });

  // Sort: Overdue/Processing sorted by dueDate ascending (most urgent first), Completed sorted by completedAt descending
  filtered.sort((a, b) => {
    if (state.activeTab === "completed") {
      return (
        new Date(b.completedAt || b.updatedAt || 0).getTime() -
        new Date(a.completedAt || a.updatedAt || 0).getTime()
      );
    }
    const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return dueA - dueB;
  });

  const container = document.getElementById("documentsContainer");

  if (filtered.length === 0) {
    const emptyTitles = {
      processing: "Không có văn bản nào đang xử lý",
      overdue: "Tuyệt vời! Không có văn bản nào bị quá hạn",
      completed: "Chưa có văn bản nào hoàn thành",
    };
    const emptyIcons = {
      processing: "📂",
      overdue: "🎉",
      completed: "📋",
    };
    container.innerHTML = `
      <div class="empty-state-box">
        <div class="empty-state-icon">${emptyIcons[state.activeTab]}</div>
        <div class="empty-state-title">${emptyTitles[state.activeTab]}</div>
        <p class="empty-state-desc">
          Bạn có thể thêm văn bản mới cần xử lý, gán người phụ trách từ danh bạ Zalo và gửi thông báo tự động.
        </p>
        <button class="btn btn-primary" onclick="openDocModal()">＋ Thêm Văn Bản Cần Xử Lý</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((doc) => renderDocumentCard(doc)).join("");
}

function getAttachmentCategoryMeta(att) {
  const cat =
    att?.category === "assignment" ||
    att?.category === "completed" ||
    att?.category === "superior"
      ? att.category
      : att?.isCompletionFile
      ? "completed"
      : "superior";

  if (cat === "assignment") {
    return {
      key: "assignment",
      icon: "📋",
      shortLabel: "VB Giao việc",
      fullLabel: "Văn bản giao việc",
      chipClass: "cat-assignment",
    };
  }
  if (cat === "completed") {
    return {
      key: "completed",
      icon: "✅",
      shortLabel: "VB Phúc đáp",
      fullLabel: "Văn bản phúc đáp thực hiện của cơ quan chuyên môn",
      chipClass: "cat-completed",
    };
  }
  return {
    key: "superior",
    icon: "🏛️",
    shortLabel: "VB Cấp trên",
    fullLabel: "Văn bản của ngành cấp trên",
    chipClass: "cat-superior",
  };
}

function renderDocumentCard(doc) {
  const effectiveTab = getEffectiveTab(doc);
  const deadline = getDeadlineInfo(doc);

  const priorityMap = {
    normal: { label: "📄 Thường", cls: "priority-normal" },
    important: { label: "⚠️ Khẩn", cls: "priority-important" },
    urgent: { label: "🔥 Hỏa tốc", cls: "priority-urgent" },
  };
  const prio = priorityMap[doc.priority] || priorityMap.normal;

  const assignees = Array.isArray(doc.assignees) ? doc.assignees : [];
  const attachments = Array.isArray(doc.attachments) ? doc.attachments : [];
  const logs = Array.isArray(doc.messageLogs) ? doc.messageLogs : [];

  const assigneesHtml =
    assignees.length > 0
      ? assignees
          .map(
            (a) => `
          <span class="assignee-chip">
            ${renderAvatarHtml(a.avatar, a.displayName, "")}
            <span>${escapeHtml(a.displayName)}</span>
            <span class="assignee-role-tag">${
              a.role === "coord" ? "Phối hợp" : "Chủ trì"
            }</span>
            <button
              type="button"
              class="assignee-quick-msg-btn"
              title="Nhắn Zalo riêng cho ${escapeHtml(a.displayName)}"
              onclick="openSendZaloModal('${escapeHtml(doc.id)}', '${escapeHtml(a.userId)}')"
            >💬</button>
          </span>
        `
          )
          .join("")
      : `<span class="hint-text">Chưa chọn người phụ trách — <a href="#" onclick="openDocModal('${escapeHtml(
          doc.id
        )}'); return false;">Gán người phụ trách</a></span>`;

  const attachmentsHtml =
    attachments.length > 0
      ? `
      <div class="attachments-row">
        <span class="row-label">📎 Tệp văn bản (${attachments.length}):</span>
        ${attachments
          .map((att) => {
            const catMeta = getAttachmentCategoryMeta(att);
            return `
            <span
              class="attachment-chip ${catMeta.chipClass} ${att.isCompletionFile ? "completion-file" : ""}"
              title="[${escapeHtml(catMeta.fullLabel)}] Bấm để mở xem tệp: ${escapeHtml(att.path)}"
              onclick="openAttachmentFile('${escapeHtml(att.path.replace(/\\/g, "\\\\"))}')"
            >
              <span class="att-cat-tag">${catMeta.icon} ${escapeHtml(catMeta.shortLabel)}</span>
              <span>${escapeHtml(att.name)}</span>
              <small>(${formatBytes(att.size)})</small>
            </span>
          `;
          })
          .join("")}
      </div>
    `
      : "";

  const lastLog = logs[0];
  const lastLogHtml = lastLog
    ? `<span class="last-sent-log" onclick="openSendZaloModal('${escapeHtml(
        doc.id
      )}')" title="Xem lịch sử gửi tin nhắn Zalo">
        ✓ Đã gửi Zalo (${logs.length} lần) • Gần nhất: ${formatDateTimeVN(lastLog.sentAt)}
      </span>`
    : "";

  const sheetStatusHtml = doc.sheetSyncError
    ? `<span class="sheet-sync-badge error" onclick="syncSingleDocToSheet('${escapeHtml(
        doc.id
      )}')" title="Lỗi đồng bộ Google Sheet: ${escapeHtml(doc.sheetSyncError)} — Bấm để thử lại">
        ⚠ Lỗi Sheet (Thử lại)
      </span>`
    : doc.sheetSyncedAt
    ? `<span class="sheet-sync-badge synced" onclick="syncSingleDocToSheet('${escapeHtml(
        doc.id
      )}')" title="Đã đồng bộ Google Sheet lúc ${formatDateTimeVN(
        doc.sheetSyncedAt
      )} — Bấm để cập nhật lại">
        ☁️ Đã lên Sheet
      </span>`
    : state.geminiSettings?.googleSheetWebhookUrl
    ? `<span class="sheet-sync-badge pending" onclick="syncSingleDocToSheet('${escapeHtml(
        doc.id
      )}')" title="Bấm để đẩy văn bản này lên Google Sheet tổng hợp">
        ☁️ Chưa lên Sheet
      </span>`
    : "";

  const departmentBadgeHtml = doc.department
    ? `<span class="dept-badge" title="Phòng ban chuyên môn phụ trách">🏢 ${escapeHtml(
        doc.department
      )}</span>`
    : "";

  const specialistBadgeHtml = doc.specialistName
    ? `<span class="specialist-badge" title="Chuyên viên giao việc / theo dõi">🧑‍💼 CV: ${escapeHtml(
        doc.specialistName
      )}</span>`
    : "";

  const zaloBtnLabel =
    effectiveTab === "overdue"
      ? "🚨 Đôn đốc qua Zalo"
      : effectiveTab === "completed"
      ? "💬 Gửi xác nhận Zalo"
      : "💬 Gửi Zalo / Nhắc việc";

  const statusToggleBtn =
    effectiveTab === "completed"
      ? `<button class="btn btn-secondary btn-sm" onclick="markDocStatus('${escapeHtml(
          doc.id
        )}', 'processing')">
          ↩ Chuyển về Đang xử lý
        </button>`
      : `<button class="btn btn-success-soft btn-sm" onclick="promptCompleteDoc('${escapeHtml(
          doc.id
        )}')">
          ✓ Đánh dấu Đã xử lý
        </button>`;

  return `
    <article class="doc-card ${
      effectiveTab === "overdue"
        ? "card-overdue"
        : effectiveTab === "completed"
        ? "card-completed"
        : ""
    }">
      <div class="doc-card-top">
        <div class="doc-meta-badges">
          <span class="doc-number-badge">Số: ${escapeHtml(doc.docNumber || "Chưa số")}</span>
          ${departmentBadgeHtml}
          ${specialistBadgeHtml}
          ${
            doc.issuer
              ? `<span class="issuer-badge">🏛️ ${escapeHtml(doc.issuer)}</span>`
              : ""
          }
          <span class="priority-badge ${prio.cls}">${prio.label}</span>
          <span class="issuer-badge">Ngày nhận: ${formatDateOnlyVN(doc.receivedDate)}</span>
          ${lastLogHtml}
          ${sheetStatusHtml}
        </div>

        <div class="deadline-pill ${deadline.type}">
          <span>${
            deadline.type === "overdue"
              ? "🚨"
              : deadline.type === "soon"
              ? "⏰"
              : deadline.type === "completed"
              ? "✅"
              : "📅"
          }</span>
          <span>${escapeHtml(deadline.label)}</span>
        </div>
      </div>

      <h3 class="doc-title">${escapeHtml(doc.title)}</h3>

      ${doc.notes ? `<div class="doc-notes">📌 Chỉ đạo / Ghi chú: ${escapeHtml(doc.notes)}</div>` : ""}

      ${
        doc.status === "completed" && doc.completionNote
          ? `<div class="doc-completion-banner">✅ <b>Kết quả xử lý:</b> ${escapeHtml(
              doc.completionNote
            )}</div>`
          : ""
      }

      <div class="doc-details-grid">
        <div class="doc-assignees-and-files">
          <div class="assignees-row">
            <span class="row-label">👤 Người phụ trách:</span>
            ${assigneesHtml}
          </div>
          ${attachmentsHtml}
        </div>

        <div class="doc-actions-cluster">
          <button
            class="btn btn-zalo btn-sm"
            onclick="openSendZaloModal('${escapeHtml(doc.id)}')"
          >
            ${zaloBtnLabel}
          </button>
          <button
            class="btn btn-secondary btn-sm"
            title="Tạo / xuất lại Công văn Giao việc chuẩn Nghị định 30/2020/NĐ-CP (.docx)"
            onclick="generateNd30DocForTask('${escapeHtml(doc.id)}')"
          >
            📜 Tạo CV NĐ30
          </button>
          ${statusToggleBtn}
          <button
            class="btn btn-secondary btn-sm"
            onclick="openDocModal('${escapeHtml(doc.id)}')"
          >
            ✏️ Sửa / Giao việc
          </button>
          <button
            class="btn btn-ghost btn-sm"
            title="Xóa văn bản"
            onclick="deleteDoc('${escapeHtml(doc.id)}')"
          >
            🗑️
          </button>
        </div>
      </div>
    </article>
  `;
}

function setDocModalDepartmentValue(deptVal) {
  const select = document.getElementById("docDepartmentInput");
  const customInput = document.getElementById("docDepartmentCustomInput");
  if (!select) return;
  const val = String(deptVal || "").trim();
  if (!val) {
    select.value = "";
    if (customInput) {
      customInput.value = "";
      customInput.classList.add("hidden");
    }
    return;
  }
  const hasOption = Array.from(select.options).some(
    (opt) => opt.value === val && opt.value !== "__custom__"
  );
  if (hasOption) {
    select.value = val;
    if (customInput) {
      customInput.value = "";
      customInput.classList.add("hidden");
    }
  } else {
    select.value = "__custom__";
    if (customInput) {
      customInput.value = val;
      customInput.classList.remove("hidden");
    }
  }
}

function getDocModalDepartmentValue() {
  const select = document.getElementById("docDepartmentInput");
  const customInput = document.getElementById("docDepartmentCustomInput");
  if (!select) return "";
  if (select.value === "__custom__") {
    return (customInput?.value || "").trim();
  }
  return select.value.trim();
}

// ==================== DOCUMENT MODAL LOGIC ====================
function openDocModal(docId = null) {
  const modal = document.getElementById("docModal");
  const titleEl = document.getElementById("docModalTitle");

  state.editingDocId = docId;
  document.getElementById("assigneeSearchInput").value = "";

  if (docId) {
    const doc = state.documents.find((d) => d.id === docId);
    if (!doc) return;
    titleEl.textContent = `Chỉnh Sửa Văn Bản: ${doc.docNumber}`;
    document.getElementById("docIdInput").value = doc.id;
    document.getElementById("docNumberInput").value = doc.docNumber || "";
    document.getElementById("docIssuerInput").value = doc.issuer || "";
    setDocModalDepartmentValue(doc.department || "");
    const specEl = document.getElementById("docSpecialistInput");
    if (specEl) {
      specEl.value =
        doc.specialistName || state.geminiSettings?.specialistName || "";
    }
    document.getElementById("docTitleInput").value = doc.title || "";
    setDocModalDatesFromIso(doc.receivedDate || "", (doc.dueDate || "").slice(0, 16));
    document.getElementById("docPriorityInput").value = doc.priority || "normal";
    document.getElementById("docNotesInput").value = doc.notes || "";
    document.getElementById("docStatusInput").value = doc.status || "processing";
    document.getElementById("docCompletionNoteInput").value = doc.completionNote || "";
    const hasAssignAtt = Array.isArray(doc.attachments)
      ? doc.attachments.some((a) => a.category === "assignment")
      : false;
    const nd30Auto = state.geminiSettings?.nd30Settings?.autoGenerateOnAssign !== false;
    const chkNd30El = document.getElementById("chkAutoGenerateNd30");
    if (chkNd30El) chkNd30El.checked = !hasAssignAtt && nd30Auto;
    document.getElementById("chkAutoSendZalo").checked = false;
    document.getElementById("chkAutoSendAttachments").checked = false;

    state.formAssignees = JSON.parse(JSON.stringify(doc.assignees || []));
    state.formAttachments = JSON.parse(JSON.stringify(doc.attachments || []));
  } else {
    titleEl.textContent = "Thêm Văn Bản Cần Xử Lý Mới";
    document.getElementById("docForm").reset();
    document.getElementById("docIdInput").value = "";
    setDocModalDepartmentValue(state.geminiSettings?.defaultDepartment || "");
    const specEl = document.getElementById("docSpecialistInput");
    if (specEl) {
      specEl.value = state.geminiSettings?.specialistName || "";
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const tomorrow = new Date(now.getTime() + 2 * 86400000);
    tomorrow.setHours(17, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    const defaultDue = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(
      tomorrow.getDate()
    )}T17:00`;

    setDocModalDatesFromIso(todayStr, defaultDue);
    document.getElementById("docPriorityInput").value = "normal";
    document.getElementById("docStatusInput").value = "processing";
    const chkNd30El = document.getElementById("chkAutoGenerateNd30");
    if (chkNd30El) {
      chkNd30El.checked = state.geminiSettings?.nd30Settings?.autoGenerateOnAssign !== false;
    }
    document.getElementById("chkAutoSendZalo").checked = false;
    document.getElementById("chkAutoSendAttachments").checked = false;

    state.formAssignees = [];
    state.formAttachments = [];
  }

  renderFormAttachments();
  renderFormSelectedAssignees();
  renderFormContactPicker();

  const aiStatusBox = document.getElementById("aiAnalysisStatusBox");
  if (aiStatusBox) {
    aiStatusBox.classList.add("hidden");
    aiStatusBox.innerHTML = "";
  }

  modal.classList.remove("hidden");
}

function getActiveSystemAiSummary() {
  const s = state.geminiSettings || {};
  const prov = s.aiProvider || "gemini";
  const label = getProviderLabel(prov);
  const model =
    s.activeAiModel ||
    s.aiProviders?.[prov]?.model ||
    SYSTEM_AI_UI_META[prov]?.defaultModel ||
    s.geminiModel ||
    "gemini-2.5-flash";
  return { provider: prov, label, model };
}

function updateGeminiHeaderBadge() {
  const dot = document.getElementById("geminiKeyStatusDot");
  const btn = document.getElementById("btnOpenGeminiSettings");
  if (dot) {
    dot.classList.toggle(
      "ready",
      Boolean(
        state.geminiSettings.hasApiKey || state.geminiSettings.hasIofficeCredentials
      )
    );
  }
  if (btn) {
    const ioStatus = state.geminiSettings.iofficeUsername
      ? `iOffice: ${state.geminiSettings.iofficeUsername}`
      : "Chưa lưu TK iOffice";
    const activeAi = getActiveSystemAiSummary();
    const aiStatus = state.geminiSettings.hasApiKey
      ? `${activeAi.label}: ${activeAi.model}`
      : "Chưa nhập API Key AI";
    btn.title = `Cài đặt (${ioStatus} | ${aiStatus})`;
  }

  const ioTextEl = document.getElementById("iofficeSavedStatusText");
  if (ioTextEl) {
    ioTextEl.textContent = state.geminiSettings.iofficeUsername
      ? `TK iOffice: ${state.geminiSettings.iofficeUsername}`
      : "Lưu TK iOffice";
  }
}

function switchSystemSettingsTab(tabName = "ai") {
  const bar = document.getElementById("systemSettingsTabsBar");
  const form = document.getElementById("geminiSettingsForm");
  if (!bar || !form) return;

  bar.querySelectorAll("[data-settings-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.settingsTab === tabName);
  });
  form.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.settingsPanel !== tabName);
  });
  if (tabName === "updates") {
    renderUpdateModal();
  }
}

function openGeminiSettingsModal(initialTab = "ai") {
  const webview = document.getElementById("portalWebview");
  const currentPortalUrl =
    (webview?.getURL && webview.getURL()) ||
    state.geminiSettings.iofficeUrl ||
    state.geminiSettings.portalHomeUrl ||
    "https://vpdt.angiang.gov.vn";

  const ioUrlEl = document.getElementById("iofficeUrlInput");
  const ioUserEl = document.getElementById("iofficeUsernameInput");
  const ioPassEl = document.getElementById("iofficePasswordInput");
  const ioAutoEl = document.getElementById("chkIofficeAutoLogin");
  const ioAutoSaveEl = document.getElementById("chkIofficeAutoSaveOnWeb");

  if (ioUrlEl) {
    ioUrlEl.value =
      state.geminiSettings.iofficeUrl ||
      currentPortalUrl ||
      "https://vpdt.angiang.gov.vn";
  }
  if (ioUserEl) ioUserEl.value = state.geminiSettings.iofficeUsername || "";
  if (ioPassEl) ioPassEl.value = state.geminiSettings.iofficePassword || "";
  if (ioAutoEl) {
    ioAutoEl.checked = state.geminiSettings.iofficeAutoLogin !== false;
  }
  if (ioAutoSaveEl) {
    ioAutoSaveEl.checked = state.geminiSettings.iofficeAutoSaveOnWeb !== false;
  }

  const activeProv = state.geminiSettings.aiProvider || "gemini";
  const sysProviders = state.geminiSettings.aiProviders || {};
  const chatCfg = state.aiChat.settings || {};
  state.systemAiDraftProviders = {
    gemini: {
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: sysProviders.gemini?.apiKey || state.geminiSettings.geminiApiKey || chatCfg.gemini?.apiKey || "",
      model: sysProviders.gemini?.model || state.geminiSettings.geminiModel || "gemini-2.5-flash",
    },
    openai: {
      baseUrl: sysProviders.openai?.baseUrl || chatCfg.openai?.baseUrl || "https://api.openai.com/v1",
      apiKey: sysProviders.openai?.apiKey || chatCfg.openai?.apiKey || "",
      model: sysProviders.openai?.model || chatCfg.openai?.model || "gpt-4o-mini",
    },
    claude: {
      baseUrl: sysProviders.claude?.baseUrl || chatCfg.claude?.baseUrl || "https://api.anthropic.com",
      apiKey: sysProviders.claude?.apiKey || chatCfg.claude?.apiKey || "",
      model: sysProviders.claude?.model || chatCfg.claude?.model || "claude-sonnet-4-20250514",
    },
    deepseek: {
      baseUrl: sysProviders.deepseek?.baseUrl || chatCfg.deepseek?.baseUrl || "https://api.deepseek.com/v1",
      apiKey: sysProviders.deepseek?.apiKey || chatCfg.deepseek?.apiKey || "",
      model: sysProviders.deepseek?.model || chatCfg.deepseek?.model || "deepseek-chat",
    },
    gateway: {
      baseUrl: sysProviders.gateway?.baseUrl || chatCfg.gateway?.baseUrl || "https://ai.starimg.ru/v1",
      apiKey: sysProviders.gateway?.apiKey || chatCfg.gateway?.apiKey || "",
      model: sysProviders.gateway?.model || chatCfg.gateway?.model || "gemini-3.8-flash",
    },
  };
  state.systemAiActiveDraftProvider = activeProv;
  const sysProvEl = document.getElementById("systemAiProviderSelect");
  if (sysProvEl) sysProvEl.value = activeProv;
  renderSystemAiProviderFields(activeProv);

  document.getElementById("chkAutoAnalyzeOnPick").checked =
    state.geminiSettings.autoAnalyzeOnPick !== false;

  const storageCfg =
    state.geminiSettings.storageConfig ||
    state.geminiSettings.defaultStorageConfig ||
    {};
  const rootEl = document.getElementById("storageRootDirInput");
  if (rootEl) rootEl.value = storageCfg.rootDir || "";

  const specNameEl = document.getElementById("specialistNameInput");
  const defDeptEl = document.getElementById("defaultDepartmentSelect");
  const gsUrlEl = document.getElementById("googleSheetWebhookUrlInput");
  const gsSecretEl = document.getElementById("googleSheetSecretInput");
  const gsAutoEl = document.getElementById("chkAutoSyncGoogleSheet");
  const gsStatusEl = document.getElementById("googleSheetTestStatus");
  if (specNameEl) specNameEl.value = state.geminiSettings.specialistName || "";
  if (defDeptEl) defDeptEl.value = state.geminiSettings.defaultDepartment || "";
  if (gsUrlEl) gsUrlEl.value = state.geminiSettings.googleSheetWebhookUrl || "";
  if (gsSecretEl) gsSecretEl.value = state.geminiSettings.googleSheetSecret || "";
  if (gsAutoEl) {
    gsAutoEl.checked = state.geminiSettings.autoSyncGoogleSheet !== false;
  }
  if (gsStatusEl) {
    gsStatusEl.classList.add("hidden");
    gsStatusEl.innerHTML = "";
  }

  populateNd30SettingsInputs(state.geminiSettings.nd30Settings || {});
  renderUpdateModal();
  switchSystemSettingsTab(initialTab || "ai");

  document.getElementById("geminiSettingsModal").classList.remove("hidden");
}

function populateNd30SettingsInputs(nd30 = {}) {
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v ?? "";
  };
  setVal("nd30ParentAgencyInput", nd30.parentAgency || "");
  setVal("nd30IssuingAgencyInput", nd30.issuingAgency || "");
  setVal("nd30AgencyCodeInput", nd30.agencyCode || "UBND");
  setVal("nd30DepartmentCodeInput", nd30.departmentCode || "VP");
  setVal("nd30LocationInput", nd30.location || "");
  setVal("nd30NextDocNumInput", nd30.nextDocNumber || 1);
  setVal("nd30SignerTitleInput", nd30.signerTitle || "CHỦ TỊCH");
  setVal("nd30SignerNameInput", nd30.signerName || "");
  const autoChk = document.getElementById("chkNd30AutoGenerateOnAssign");
  const aiChk = document.getElementById("chkNd30UseAiDrafting");
  if (autoChk) autoChk.checked = nd30.autoGenerateOnAssign !== false;
  if (aiChk) aiChk.checked = nd30.useAiDrafting !== false;
}

async function triggerIofficeAutoLogin({ forceSubmit = false, silent = true } = {}) {
  const webview = document.getElementById("portalWebview");
  if (!webview || typeof window.appApi.handleIofficeLogin !== "function") return;
  let webContentsId = null;
  try {
    if (typeof webview.getWebContentsId === "function") {
      webContentsId = webview.getWebContentsId();
    }
  } catch (_) {}
  if (!webContentsId) return;

  try {
    const res = await window.appApi.handleIofficeLogin({
      webContentsId,
      forceSubmit,
    });
    if (res?.submitted) {
      showToast(
        `🔑 Đã tự động điền tài khoản "${state.geminiSettings.iofficeUsername}" và đăng nhập iOffice!`,
        "success"
      );
    } else if (res?.filled && !silent) {
      showToast(
        `✅ Đã điền tài khoản "${state.geminiSettings.iofficeUsername}" vào trang đăng nhập iOffice!`,
        "success"
      );
    } else if (!silent && !res?.filled) {
      if (!state.geminiSettings.iofficeUsername || !state.geminiSettings.iofficePassword) {
        showToast("Vui lòng nhập và lưu Tài khoản / Mật khẩu iOffice trước!", "info");
        openGeminiSettingsModal();
      } else {
        showToast(
          "Không tìm thấy ô nhập mật khẩu trên trang hiện tại (hoặc bạn đã đăng nhập iOffice rồi).",
          "info"
        );
      }
    }
  } catch (err) {
    if (!silent) {
      showToast(err.message || "Không thể tự động điền đăng nhập iOffice", "error");
    }
  }
}

function applyExtractedDataToForm(ext, sourceLabel, extraActionHtml = "") {
  const statusBox = document.getElementById("aiAnalysisStatusBox");
  if (!ext) return;

  if (ext.docNumber) {
    document.getElementById("docNumberInput").value = ext.docNumber;
  }
  if (ext.issuer) {
    document.getElementById("docIssuerInput").value = ext.issuer;
  }
  if (ext.title) {
    document.getElementById("docTitleInput").value = ext.title;
  }
  if (ext.receivedDate && /^\d{4}-\d{2}-\d{2}$/.test(ext.receivedDate.trim())) {
    const isoRec = ext.receivedDate.trim();
    document.getElementById("docReceivedDateInput").value = isoDateToVn(isoRec);
    const recPick = document.getElementById("docReceivedDatePicker");
    if (recPick) recPick.value = isoRec;
  }
  if (ext.dueDate) {
    let cleanDue = ext.dueDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDue)) {
      cleanDue = `${cleanDue}T17:00`;
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(cleanDue)) {
      const isoDue = cleanDue.slice(0, 16);
      document.getElementById("docDueDateInput").value = isoDateTimeToVn(isoDue);
      const duePick = document.getElementById("docDueDatePicker");
      if (duePick) duePick.value = isoDue;
    }
  }
  if (["normal", "important", "urgent"].includes(ext.priority)) {
    document.getElementById("docPriorityInput").value = ext.priority;
  }
  if (ext.notes) {
    document.getElementById("docNotesInput").value = ext.notes;
  }

  const hintMsg = ext.suggestedAssigneeHint
    ? `<div style="margin-top:4px;font-size:12px;">💡 <b>Gợi ý bộ phận/người nhận trong văn bản:</b> ${escapeHtml(
        ext.suggestedAssigneeHint
      )}</div>`
    : "";

  if (statusBox) {
    statusBox.className = "ai-analysis-status success";
    statusBox.classList.remove("hidden");
    statusBox.innerHTML = `✅ <b>Gemini AI đã điền tự động thông tin từ ${escapeHtml(
      sourceLabel
    )}!</b> Bạn có thể kiểm tra và chỉnh sửa lại nếu cần.${hintMsg}${extraActionHtml}`;
  }
}

async function analyzeFileAndFillForm(filePath, fileName) {
  const statusBox = document.getElementById("aiAnalysisStatusBox");
  const btnPickAI = document.getElementById("btnPickAndAnalyzeWithAI");

  if (!state.geminiSettings.hasApiKey) {
    statusBox.className = "ai-analysis-status error";
    statusBox.classList.remove("hidden");
    statusBox.innerHTML = `⚠️ Chưa cấu hình Gemini API Key! <button type="button" class="btn btn-ai btn-xs" onclick="openGeminiSettingsModal()">Nhập API Key ngay</button>`;
    openGeminiSettingsModal();
    return;
  }

  const activeAi = getActiveSystemAiSummary();
  statusBox.className = "ai-analysis-status loading";
  statusBox.classList.remove("hidden");
  statusBox.innerHTML = `⏳ ${escapeHtml(activeAi.label)} (<b>${escapeHtml(
    activeAi.model
  )}</b>) đang đọc tệp <b>"${escapeHtml(
    fileName
  )}"</b> và tự động trích xuất thông tin văn bản...`;

  if (btnPickAI) {
    btnPickAI.disabled = true;
    btnPickAI.textContent = "⏳ Đang đọc văn bản...";
  }

  try {
    const res = await window.appApi.analyzeFileWithGemini(filePath);
    const ext = res?.extracted || {};
    applyExtractedDataToForm(ext, `tệp "${fileName}"`);
    showToast("Đã tự động đọc và điền thông tin văn bản bằng Gemini AI!", "success");
  } catch (err) {
    statusBox.className = "ai-analysis-status error";
    statusBox.innerHTML = `❌ Không thể đọc tự động: ${escapeHtml(
      err.message || "Lỗi kết nối Gemini API"
    )}`;
    showToast(err.message || "Lỗi khi đọc văn bản bằng Gemini AI", "error");
  } finally {
    if (btnPickAI) {
      btnPickAI.disabled = false;
      btnPickAI.textContent = "✨ Chọn tệp & Đọc tự động";
    }
  }
}

// ==================== WEB PORTAL & PAGE CAPTURE LOGIC ====================
function setViewMode(mode) {
  const normalizedMode = mode === "split" ? "chat" : mode;
  state.viewMode = normalizedMode;
  const workspaceBody = document.getElementById("workspaceBody");
  const webPane = document.getElementById("webPortalPane");
  const tasksPane = document.getElementById("tasksPane");
  const aiChatPane = document.getElementById("aiChatPane");
  const dashboardPane = document.getElementById("dashboardPane");

  document.querySelectorAll(".view-mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.viewMode === normalizedMode);
  });

  workspaceBody.className = `workspace-body mode-${normalizedMode}`;

  if (normalizedMode === "tasks") {
    webPane?.classList.add("hidden");
    aiChatPane?.classList.add("hidden");
    dashboardPane?.classList.add("hidden");
    tasksPane?.classList.remove("hidden");
  } else if (normalizedMode === "web") {
    webPane?.classList.remove("hidden");
    tasksPane?.classList.add("hidden");
    aiChatPane?.classList.add("hidden");
    dashboardPane?.classList.add("hidden");
  } else if (normalizedMode === "chat") {
    webPane?.classList.add("hidden");
    tasksPane?.classList.add("hidden");
    dashboardPane?.classList.add("hidden");
    aiChatPane?.classList.remove("hidden");
    refreshAiChatContextDocSelect();
    renderAiChatHeaderAndContext();
    scrollAiChatToBottom();
    setTimeout(() => {
      document.getElementById("aiChatInput")?.focus();
    }, 60);
  } else if (normalizedMode === "dashboard") {
    webPane?.classList.add("hidden");
    tasksPane?.classList.add("hidden");
    aiChatPane?.classList.add("hidden");
    dashboardPane?.classList.remove("hidden");
    loadInAppDashboard();
  }
}

function normalizeWebUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "https://www.google.com";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.includes(".") && !s.includes(" ")) {
    return `https://${s}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}

function navigatePortalTo(rawUrl) {
  const url = normalizeWebUrl(rawUrl);
  const webview = document.getElementById("portalWebview");
  const urlInput = document.getElementById("portalUrlInput");
  if (urlInput) urlInput.value = url;
  if (webview) {
    try {
      webview.loadURL(url);
    } catch (_) {
      webview.src = url;
    }
  }
  window.appApi.saveGeminiSettings({ portalHomeUrl: url }).then((updated) => {
    state.geminiSettings = updated;
  });
}

function renderPortalBookmarks() {
  const listEl = document.getElementById("portalBookmarksList");
  if (!listEl) return;
  const bookmarks = Array.isArray(state.geminiSettings.portalBookmarks)
    ? state.geminiSettings.portalBookmarks
    : [];

  if (bookmarks.length === 0) {
    listEl.innerHTML = `<span class="hint-text">Chưa có cổng lưu nhanh. Bấm "⭐ Lưu cổng" để thêm.</span>`;
    return;
  }

  listEl.innerHTML = bookmarks
    .map(
      (bm, idx) => `
      <span class="portal-bookmark-chip" onclick="navigatePortalTo('${escapeHtml(
        bm.url.replace(/'/g, "\\'")
      )}')" title="Mở ${escapeHtml(bm.url)}">
        <span>🔖 ${escapeHtml(bm.name)}</span>
        <button
          type="button"
          class="portal-bookmark-del"
          title="Xóa cổng lưu nhanh này"
          onclick="event.stopPropagation(); removePortalBookmark(${idx})"
        >✕</button>
      </span>
    `
    )
    .join("");
}

async function removePortalBookmark(idx) {
  const bookmarks = [...(state.geminiSettings.portalBookmarks || [])];
  bookmarks.splice(idx, 1);
  const updated = await window.appApi.saveGeminiSettings({
    portalBookmarks: bookmarks,
  });
  state.geminiSettings = updated;
  renderPortalBookmarks();
}

async function attachLastWebScreenshot() {
  if (!state.lastWebPageScreenshotBase64) {
    showToast("Chưa có ảnh chụp trang web để đính kèm.", "error");
    return;
  }
  try {
    const docNum =
      document.getElementById("docNumberInput")?.value || "VanBanWeb";
    const fileObj = await window.appApi.saveWebScreenshot({
      screenshotBase64: state.lastWebPageScreenshotBase64,
      docNumber: docNum,
    });
    state.formAttachments.push(fileObj);
    renderFormAttachments();
    showToast(`Đã đính kèm ảnh chụp trang web: ${fileObj.name}`, "success");
  } catch (err) {
    showToast(err.message || "Không thể đính kèm ảnh chụp trang web", "error");
  }
}

async function captureCurrentWebviewData(webview) {
  let webContentsId = null;
  try {
    if (typeof webview.getWebContentsId === "function") {
      webContentsId = webview.getWebContentsId();
    }
  } catch (_) {}

  // 1. Ưu tiên dùng IPC Main Process để quét toàn bộ các frame (bao gồm cả iframe PDF.js / cross-origin)
  // nhằm trích xuất trực tiếp file PDF gốc (window.PDFViewerApplication.pdfDocument.getData()) và cuộn về đầu Trang 1 chụp dấu Số/Ngày tháng
  if (webContentsId && typeof window.appApi.extractWebviewContent === "function") {
    try {
      const mainExtracted = await window.appApi.extractWebviewContent(webContentsId);
      if (mainExtracted) {
        if (mainExtracted.screenshotBase64) {
          state.lastWebPageScreenshotBase64 = mainExtracted.screenshotBase64;
        }
        return {
          url: mainExtracted.url || (webview.getURL ? webview.getURL() : ""),
          title:
            mainExtracted.title ||
            (webview.getTitle ? webview.getTitle() : "Trang Web Văn Bản"),
          text: mainExtracted.text || "",
          fileBase64: mainExtracted.fileBase64 || "",
          fileName: mainExtracted.fileName || "",
          fileMime: mainExtracted.fileMime || "",
          screenshotBase64: mainExtracted.screenshotBase64 || "",
          webContentsId,
        };
      }
    } catch (ipcExtractErr) {
      console.warn(
        "extractWebviewContent IPC fallback to renderer executeJavaScript:",
        ipcExtractErr
      );
    }
  }

  // 2. Dự phòng nếu chưa lấy được webContentsId
  let pageData = {
    url: "",
    title: "",
    text: "",
    fileBase64: "",
    fileName: "",
    fileMime: "",
  };
  try {
    pageData = await webview.executeJavaScript(`
      (async () => {
        const chunks = [];
        if (document.body && document.body.innerText) {
          chunks.push(document.body.innerText.trim());
        }
        return {
          url: location.href,
          title: document.title,
          text: chunks.join("\\n\\n").slice(0, 45000),
          fileBase64: "",
          fileName: "",
          fileMime: "",
        };
      })();
    `);
  } catch (jsErr) {
    console.warn("Could not extract DOM text from webview:", jsErr);
    pageData = {
      url: webview.getURL ? webview.getURL() : "",
      title: webview.getTitle ? webview.getTitle() : "Trang Web Văn Bản",
      text: "",
      fileBase64: "",
      fileName: "",
      fileMime: "",
    };
  }

  let screenshotBase64 = "";
  try {
    const nativeImg = await webview.capturePage();
    screenshotBase64 = nativeImg.toDataURL();
    state.lastWebPageScreenshotBase64 = screenshotBase64;
  } catch (capErr) {
    console.warn("Could not capture webview screenshot:", capErr);
  }

  return {
    ...pageData,
    screenshotBase64,
    webContentsId,
  };
}

async function pullCurrentWebPageToApp({ keepExistingModal = false } = {}) {
  if (!state.geminiSettings.hasApiKey) {
    showToast(
      "Vui lòng nhập Gemini API Key trước khi kéo văn bản từ trang Web!",
      "info"
    );
    openGeminiSettingsModal();
    return;
  }

  const webview = document.getElementById("portalWebview");
  const btnPull = document.getElementById("btnPullWebPageToApp");
  if (!webview) return;

  if (btnPull) {
    btnPull.disabled = true;
    btnPull.textContent = "⏳ Đang kéo & lưu file...";
  }

  // Open modal if not already open
  const docModal = document.getElementById("docModal");
  if (!keepExistingModal && docModal.classList.contains("hidden")) {
    openDocModal(null);
  }

  const activeAi = getActiveSystemAiSummary();
  const statusBox = document.getElementById("aiAnalysisStatusBox");
  statusBox.className = "ai-analysis-status loading";
  statusBox.classList.remove("hidden");
  statusBox.innerHTML = `⏳ ${escapeHtml(activeAi.label)} (<b>${escapeHtml(
    activeAi.model
  )}</b>) đang đọc nội dung văn bản (kể cả dấu Số & Ngày tháng ký số trên PDF) và tự động lưu tệp đính kèm vào nhiệm vụ...`;

  try {
    const cap = await captureCurrentWebviewData(webview);

    const res = await window.appApi.analyzeWebPageWithGemini({
      pageUrl: cap.url,
      pageTitle: cap.title,
      pageText: cap.text,
      screenshotBase64: cap.screenshotBase64,
      fileBase64: cap.fileBase64,
      fileMime: cap.fileMime,
      fileName: cap.fileName,
    });

    // Tự động lưu tệp văn bản của trang web (File gốc tải được hoặc xuất PDF trang văn bản) và gắn vào nhiệm vụ
    let savedFileNote = "";
    try {
      const savedFile = await window.appApi.exportWebPageFile({
        webContentsId: cap.webContentsId,
        screenshotBase64: cap.screenshotBase64,
        fileBase64: cap.fileBase64,
        fileName: cap.fileName,
        docNumber: res.extracted?.docNumber || cap.title || "VanBanWeb",
        prefix: "VanBan",
      });
      if (savedFile && savedFile.path) {
        savedFile.category = "superior";
        const exists = state.formAttachments.some(
          (a) => a.path === savedFile.path || a.name === savedFile.name
        );
        if (!exists) {
          state.formAttachments.push(savedFile);
          renderFormAttachments();
        }
        savedFileNote = `<div style="margin-top:5px;color:#15803d;font-weight:600;">📎 Đã tự động lưu và đính kèm tệp <code>${escapeHtml(
          savedFile.name
        )}</code> (${formatBytes(savedFile.size)}) vào nhiệm vụ!</div>`;
      }
    } catch (exportErr) {
      console.warn("Could not auto-save web page file:", exportErr);
    }

    applyExtractedDataToForm(
      res.extracted,
      `trang Web "${cap.title || cap.url || "Cổng văn bản"}"`,
      savedFileNote
    );
    showToast(
      "Đã kéo thông tin văn bản và tự động lưu tệp đính kèm vào nhiệm vụ!",
      "success"
    );
  } catch (err) {
    statusBox.className = "ai-analysis-status error";
    statusBox.innerHTML = `❌ Không thể đọc trang Web: ${escapeHtml(
      err.message || "Lỗi kết nối Gemini API"
    )}`;
    showToast(err.message || "Lỗi khi đọc trang Web bằng Gemini AI", "error");
  } finally {
    if (btnPull) {
      btnPull.disabled = false;
      btnPull.textContent = "📥 Kéo Văn Bản Mới Về App";
    }
  }
}

// ==================== COMPLETION MATCHER (KHỚP LỆNH VĂN BẢN PHẢN HỒI) ====================
function openCompletionMatchModal(resetState = true) {
  const modal = document.getElementById("completionMatchModal");
  if (!modal) return;

  if (resetState) {
    state.completionAttachments = [];
    state.completionExtracted = null;
    document.getElementById("compResponseDocNumInput").value = "";
    document.getElementById("compResponseTitleInput").value = "";
    document.getElementById("compCompletionNoteInput").value = "";
    document.getElementById("compReferencedBadges").innerHTML =
      `<span class="hint-text">Chưa có dữ liệu căn cứ.</span>`;
    const excerptBox = document.getElementById("compBasisExcerptBox");
    excerptBox.classList.add("hidden");
    excerptBox.textContent = "";

    const statusBox = document.getElementById("completionAnalysisStatusBox");
    statusBox.className = "ai-analysis-status mt-12";
    statusBox.innerHTML = `💡 Hãy bấm <b>"📎 Chọn tệp VB Phản hồi từ máy tính"</b> hoặc <b>"🌐 Kéo VB Phản hồi đang mở trên Web"</b> để AI Gemini đọc phần căn cứ văn bản cấp trên và tự động khớp lệnh hoàn thành.`;
  }

  populateCompletionTaskSelect();
  renderCompletionAttachments();
  modal.classList.remove("hidden");
}

function populateCompletionTaskSelect(selectedTaskId = "") {
  const select = document.getElementById("compMatchedTaskSelect");
  if (!select) return;

  // Sắp xếp ưu tiên các nhiệm vụ Đang xử lý / Quá hạn lên đầu
  const sorted = [...state.documents].sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (a.status !== "completed" && b.status === "completed") return -1;
    return 0;
  });

  select.innerHTML =
    `<option value="">-- Chọn nhiệm vụ cấp trên cần đánh dấu Đã xử lý --</option>` +
    sorted
      .map((d) => {
        const isMatched = String(d.id) === String(selectedTaskId);
        const statusTag =
          d.status === "completed"
            ? "✅ Đã xử lý"
            : getEffectiveTab(d) === "overdue"
            ? "🚨 Quá hạn"
            : "⏳ Đang xử lý";
        const prefix = isMatched ? "🎯 [KHỚP LỆNH] " : "";
        return `<option value="${escapeHtml(d.id)}" ${
          isMatched ? "selected" : ""
        }>${prefix}Số: ${escapeHtml(d.docNumber || "Chưa số")} (${statusTag}) — ${escapeHtml(
          (d.title || "").slice(0, 75)
        )}</option>`;
      })
      .join("");

  if (selectedTaskId) {
    select.value = selectedTaskId;
  }
}

function renderCompletionAttachments() {
  const box = document.getElementById("compAttachmentsList");
  if (!box) return;
  if (!state.completionAttachments.length) {
    box.innerHTML = `<div class="empty-hint">Chưa có tệp văn bản phản hồi đính kèm.</div>`;
    return;
  }

  box.innerHTML = state.completionAttachments
    .map(
      (att, idx) => `
      <div class="attachment-item-row">
        <div>
          <strong>✅ 📄 ${escapeHtml(att.name)}</strong>
          <span class="hint-text">(${formatBytes(att.size)})</span>
        </div>
        <div class="inline-actions">
          <button type="button" class="btn btn-ghost btn-xs" onclick="openAttachmentFile('${escapeHtml(
            att.path.replace(/\\/g, "\\\\")
          )}')">Mở xem</button>
          <button type="button" class="btn btn-ghost btn-xs" onclick="removeCompletionAttachment(${idx})">✕ Xóa</button>
        </div>
      </div>
    `
    )
    .join("");
}

function removeCompletionAttachment(idx) {
  state.completionAttachments.splice(idx, 1);
  renderCompletionAttachments();
}

async function applyCompletionAnalysisResult(res) {
  const statusBox = document.getElementById("completionAnalysisStatusBox");
  const ext = res?.extracted || {};
  state.completionExtracted = ext;

  document.getElementById("compResponseDocNumInput").value =
    ext.responseDocNumber || "";
  document.getElementById("compResponseTitleInput").value =
    ext.responseTitle || "";
  document.getElementById("compCompletionNoteInput").value =
    ext.completionNote || "";

  const refs = Array.isArray(ext.referencedSuperiorDocNumbers)
    ? ext.referencedSuperiorDocNumbers.filter(Boolean)
    : [];
  const badgesEl = document.getElementById("compReferencedBadges");
  if (refs.length > 0) {
    badgesEl.innerHTML = refs
      .map(
        (code) =>
          `<span class="comp-ref-pill">🔗 Căn cứ văn bản số: ${escapeHtml(
            code
          )}</span>`
      )
      .join("");
  } else {
    badgesEl.innerHTML = `<span class="hint-text">Không tìm thấy số ký hiệu căn cứ rõ ràng trong văn bản.</span>`;
  }

  const excerptBox = document.getElementById("compBasisExcerptBox");
  if (ext.basisExcerpt) {
    excerptBox.classList.remove("hidden");
    excerptBox.textContent = `"${ext.basisExcerpt}"`;
  } else {
    excerptBox.classList.add("hidden");
  }

  const matchedTaskId = ext.matchedTaskId || "";
  populateCompletionTaskSelect(matchedTaskId);

  const matchedDoc = state.documents.find((d) => d.id === matchedTaskId);
  const autoComplete = document.getElementById("chkAutoCompleteOnExactMatch")?.checked;

  if (matchedDoc) {
    if (autoComplete) {
      await confirmAndCompleteMatchedTask({ isAuto: true });
    } else {
      statusBox.className = "ai-analysis-status success mt-12";
      statusBox.innerHTML = `🎯 <b>ĐÃ KHỚP LỆNH VỚI NHIỆM VỤ CẤP TRÊN:</b> Văn bản số <b>${escapeHtml(
        matchedDoc.docNumber
      )}</b> (<i>"${escapeHtml(
        matchedDoc.title
      )}"</i>).<br/>Hãy bấm <b>"✅ Xác Nhận Khớp Lệnh & Đánh Dấu Đã Xử Lý"</b> bên dưới để hoàn tất!`;
    }
  } else {
    statusBox.className = "ai-analysis-status error mt-12";
    statusBox.innerHTML = `⚠️ <b>AI đã đọc văn bản phản hồi</b> (Căn cứ tìm thấy: <b>${escapeHtml(
      refs.join(", ") || "Không rõ"
    )}</b>), nhưng chưa tìm thấy nhiệm vụ nào có cùng Số/Ký hiệu trong danh sách. Bạn có thể chọn thủ công nhiệm vụ ở mục 2 bên dưới để đánh dấu Đã xử lý.`;
  }
}

async function analyzeCompletionFromFile(fileObj) {
  if (!state.geminiSettings.hasApiKey) {
    showToast("Vui lòng nhập Gemini API Key trước!", "info");
    openGeminiSettingsModal();
    return;
  }

  const modal = document.getElementById("completionMatchModal");
  if (modal.classList.contains("hidden")) {
    openCompletionMatchModal(true);
  }

  if (fileObj && fileObj.path) {
    const exists = state.completionAttachments.some(
      (a) => a.path === fileObj.path
    );
    if (!exists) {
      state.completionAttachments.push(fileObj);
      renderCompletionAttachments();
    }
  }

  const activeAi = getActiveSystemAiSummary();
  const statusBox = document.getElementById("completionAnalysisStatusBox");
  statusBox.className = "ai-analysis-status loading mt-12";
  statusBox.innerHTML = `⏳ ${escapeHtml(activeAi.label)} (<b>${escapeHtml(
    activeAi.model
  )}</b>) đang đọc văn bản phản hồi <b>"${escapeHtml(
    fileObj.name
  )}"</b> để tìm phần Căn cứ văn bản cấp trên và đối chiếu Số/Ký hiệu...`;

  try {
    const res = await window.appApi.analyzeCompletionWithGemini({
      filePath: fileObj.path,
    });
    await applyCompletionAnalysisResult(res);
  } catch (err) {
    statusBox.className = "ai-analysis-status error mt-12";
    statusBox.innerHTML = `❌ Lỗi khi đọc văn bản phản hồi: ${escapeHtml(
      err.message || "Lỗi kết nối Gemini API"
    )}`;
    showToast(err.message || "Lỗi khi đọc văn bản phản hồi", "error");
  }
}

async function pullWebCompletionToApp() {
  if (!state.geminiSettings.hasApiKey) {
    showToast("Vui lòng nhập Gemini API Key trước!", "info");
    openGeminiSettingsModal();
    return;
  }

  const webview = document.getElementById("portalWebview");
  const btnPullComp = document.getElementById("btnPullWebCompletionToApp");
  if (!webview) return;

  if (btnPullComp) {
    btnPullComp.disabled = true;
    btnPullComp.textContent = "⏳ Đang đọc & khớp lệnh...";
  }

  openCompletionMatchModal(true);

  const activeAi = getActiveSystemAiSummary();
  const statusBox = document.getElementById("completionAnalysisStatusBox");
  statusBox.className = "ai-analysis-status loading mt-12";
  statusBox.innerHTML = `⏳ ${escapeHtml(activeAi.label)} (<b>${escapeHtml(
    activeAi.model
  )}</b>) đang đọc văn bản phản hồi của chuyên viên trên trang Web, lưu tệp đính kèm và đối chiếu Số/Ký hiệu văn bản cấp trên...`;

  try {
    const cap = await captureCurrentWebviewData(webview);

    const res = await window.appApi.analyzeCompletionWithGemini({
      pageUrl: cap.url,
      pageTitle: cap.title,
      pageText: cap.text,
      screenshotBase64: cap.screenshotBase64,
      fileBase64: cap.fileBase64,
      fileMime: cap.fileMime,
      fileName: cap.fileName,
    });

    // Tự động lưu tệp văn bản phản hồi từ trang web vào danh sách tệp phản hồi
    try {
      const savedFile = await window.appApi.exportWebPageFile({
        webContentsId: cap.webContentsId,
        screenshotBase64: cap.screenshotBase64,
        fileBase64: cap.fileBase64,
        fileName: cap.fileName,
        docNumber:
          res.extracted?.responseDocNumber || cap.title || "VBPhanHoi",
        prefix: "VBPhanHoi",
      });
      if (savedFile && savedFile.path) {
        state.completionAttachments.push(savedFile);
        renderCompletionAttachments();
      }
    } catch (exportErr) {
      console.warn("Could not save completion web file:", exportErr);
    }

    await applyCompletionAnalysisResult(res);
  } catch (err) {
    statusBox.className = "ai-analysis-status error mt-12";
    statusBox.innerHTML = `❌ Không thể đọc văn bản phản hồi trên Web: ${escapeHtml(
      err.message || "Lỗi kết nối Gemini API"
    )}`;
    showToast(err.message || "Lỗi khi đọc văn bản phản hồi trên Web", "error");
  } finally {
    if (btnPullComp) {
      btnPullComp.disabled = false;
      btnPullComp.textContent = "✅ Kéo VB Phản Hồi & Đánh Dấu Hoàn Thành";
    }
  }
}

async function confirmAndCompleteMatchedTask({ isAuto = false } = {}) {
  const select = document.getElementById("compMatchedTaskSelect");
  const docId = select?.value;
  if (!docId) {
    showToast("Vui lòng chọn nhiệm vụ cấp trên cần đánh dấu Đã xử lý!", "error");
    return;
  }

  const completionNote =
    document.getElementById("compCompletionNoteInput")?.value ||
    "Đã hoàn thành văn bản phản hồi.";
  const btnConfirm = document.getElementById("btnConfirmCompletionMatch");
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.textContent = "⏳ Đang lưu hoàn thành...";
  }

  try {
    const updatedDoc = await window.appApi.completeDocumentWithResponse({
      docId,
      completionNote,
      responseAttachments: state.completionAttachments,
    });

    const idx = state.documents.findIndex((d) => d.id === docId);
    if (idx >= 0) {
      state.documents[idx] = updatedDoc;
    }

    state.activeTab = "completed";
    renderTabsAndDocuments();

    const statusBox = document.getElementById("completionAnalysisStatusBox");
    if (statusBox) {
      statusBox.className = "ai-analysis-status success mt-12";
      statusBox.innerHTML = `🎉 <b>${
        isAuto ? "ĐÃ KHỚP LỆNH TỰ ĐỘNG & " : "ĐÃ "
      }ĐÁNH DẤU HOÀN THÀNH NHIỆM VỤ!</b><br/>
      • Nhiệm vụ cấp trên: <b>Số ${escapeHtml(updatedDoc.docNumber)}</b> — <i>"${escapeHtml(
        updatedDoc.title
      )}"</i><br/>
      • Trạng thái: <b>✅ Đã xử lý</b> (Đã lưu ${
        state.completionAttachments.length
      } tệp văn bản phản hồi của chuyên viên vào nhiệm vụ).`;
    }

    showToast(
      `🎯 Khớp lệnh thành công! Nhiệm vụ số "${updatedDoc.docNumber}" đã chuyển sang Đã xử lý kèm tệp phản hồi!`,
      "success"
    );

    if (!isAuto) {
      closeModal("completionMatchModal");
    }
  } catch (err) {
    showToast(err.message || "Lỗi khi cập nhật hoàn thành nhiệm vụ", "error");
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.textContent = "✅ Xác Nhận Khớp Lệnh & Đánh Dấu Đã Xử Lý";
    }
  }
}

function renderFormAttachments() {
  const box = document.getElementById("docFormAttachmentsList");
  if (!state.formAttachments.length) {
    box.innerHTML = `<div class="empty-hint">Chưa có tệp văn bản đính kèm. Chọn một trong 3 nút trên để thêm tệp (tất cả sẽ được lưu chung vào 1 thư mục theo Số/Ký hiệu văn bản).</div>`;
    return;
  }

  box.innerHTML = state.formAttachments
    .map((att, idx) => {
      const catMeta = getAttachmentCategoryMeta(att);
      return `
      <div class="attachment-item-row">
        <div style="display:flex; align-items:center; gap:8px; min-width:0; flex-wrap:wrap;">
          <select
            class="att-cat-select ${catMeta.chipClass}"
            onchange="changeFormAttachmentCategory(${idx}, this.value)"
            title="Loại văn bản (lưu chung vào cùng thư mục theo Số/Ký hiệu văn bản)"
          >
            <option value="superior" ${catMeta.key === "superior" ? "selected" : ""}>🏛️ VB Cấp trên</option>
            <option value="assignment" ${catMeta.key === "assignment" ? "selected" : ""}>📋 VB Giao việc</option>
            <option value="completed" ${catMeta.key === "completed" ? "selected" : ""}>✅ VB Phúc đáp / Thực hiện</option>
          </select>
          <strong style="word-break:break-word;">${escapeHtml(att.name)}</strong>
          <span class="hint-text">(${formatBytes(att.size)})</span>
        </div>
        <div class="inline-actions">
          <button type="button" class="btn btn-ai-outline btn-xs" title="Dùng Gemini AI đọc tệp này và điền vào biểu mẫu" onclick="analyzeFileAndFillForm('${escapeHtml(
            att.path.replace(/\\/g, "\\\\")
          )}', '${escapeHtml(att.name.replace(/'/g, "\\'"))}')">✨ Đọc bằng AI</button>
          <button type="button" class="btn btn-ghost btn-xs" onclick="openAttachmentFile('${escapeHtml(
            att.path.replace(/\\/g, "\\\\")
          )}')">Mở xem</button>
          <button type="button" class="btn btn-ghost btn-xs" onclick="removeFormAttachment(${idx})">✕ Xóa</button>
        </div>
      </div>
    `;
    })
    .join("");
}

function changeFormAttachmentCategory(idx, newCategory) {
  if (!state.formAttachments[idx]) return;
  state.formAttachments[idx].category = newCategory;
  state.formAttachments[idx].isCompletionFile = newCategory === "completed";
  renderFormAttachments();
}

function removeFormAttachment(idx) {
  state.formAttachments.splice(idx, 1);
  renderFormAttachments();
}

function renderFormSelectedAssignees() {
  const countEl = document.getElementById("selectedAssigneesCount");
  const listEl = document.getElementById("selectedAssigneesList");
  countEl.textContent = state.formAssignees.length;

  if (state.formAssignees.length === 0) {
    listEl.innerHTML = state.zaloStatus.isLoggedIn
      ? `<div class="empty-hint">Chưa chọn người phụ trách nào. Hãy tích chọn từ danh bạ Zalo bên dưới.</div>`
      : `<div class="empty-hint">Chưa chọn người phụ trách nào.</div>`;
    return;
  }

  listEl.innerHTML = state.formAssignees
    .map(
      (a, idx) => `
      <div class="selected-assignee-pill">
        ${renderAvatarHtml(a.avatar, a.displayName, "")}
        <span>${escapeHtml(a.displayName)}</span>
        <select onchange="changeAssigneeRole(${idx}, this.value)">
          <option value="lead" ${a.role !== "coord" ? "selected" : ""}>Chủ trì</option>
          <option value="coord" ${a.role === "coord" ? "selected" : ""}>Phối hợp</option>
        </select>
        <button type="button" title="Bỏ chọn" onclick="removeFormAssignee('${escapeHtml(
          a.userId
        )}')">✕</button>
      </div>
    `
    )
    .join("");
}

function changeAssigneeRole(idx, role) {
  if (state.formAssignees[idx]) {
    state.formAssignees[idx].role = role;
  }
}

function toggleFormAssignee(userId) {
  const uid = String(userId);
  const existingIdx = state.formAssignees.findIndex((a) => String(a.userId) === uid);
  if (existingIdx >= 0) {
    state.formAssignees.splice(existingIdx, 1);
  } else {
    const contact = state.contacts.find((c) => String(c.userId) === uid);
    if (contact) {
      state.formAssignees.push({
        userId: contact.userId,
        displayName: contact.displayName,
        avatar: contact.avatar || "",
        phoneNumber: contact.phoneNumber || "",
        role: state.formAssignees.length === 0 ? "lead" : "coord",
      });
    }
  }
  renderFormSelectedAssignees();
  renderFormContactPicker();
}

function removeFormAssignee(userId) {
  state.formAssignees = state.formAssignees.filter(
    (a) => String(a.userId) !== String(userId)
  );
  renderFormSelectedAssignees();
  renderFormContactPicker();
}

function renderFormContactPicker() {
  const listEl = document.getElementById("contactPickerList");
  const pickerBox = document.getElementById("contactPickerBox");
  const loginNotice = document.getElementById("contactPickerLoginNotice");
  const syncBtn = document.getElementById("btnSyncContactsInForm");
  const quickAddBtn = document.getElementById("btnToggleQuickAddContact");
  const quickAddBox = document.getElementById("quickAddContactBox");
  const isLoggedIn = Boolean(state.zaloStatus.isLoggedIn);

  if (pickerBox) pickerBox.classList.toggle("hidden", !isLoggedIn);
  if (loginNotice) loginNotice.classList.toggle("hidden", isLoggedIn);
  if (syncBtn) syncBtn.classList.toggle("hidden", !isLoggedIn);
  if (quickAddBtn) quickAddBtn.classList.toggle("hidden", !isLoggedIn);
  if (!isLoggedIn) {
    if (quickAddBox) quickAddBox.classList.add("hidden");
    if (listEl) listEl.innerHTML = "";
    return;
  }

  const q = (document.getElementById("assigneeSearchInput")?.value || "")
    .trim()
    .toLowerCase();

  const filtered = state.contacts.filter((c) => {
    if (!q) return true;
    return [c.displayName, c.originalName, c.zaloName, c.alias, c.phoneNumber, c.userId]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-hint">
        ${
          state.contacts.length === 0
            ? "Danh bạ trống. Hãy bấm '🔄 Đồng bộ Zalo' để lấy danh sách bạn bè từ Zalo hoặc bấm '＋ Thêm liên hệ'."
            : "Không tìm thấy người phụ trách phù hợp từ khóa."
        }
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered
    .map((c) => {
      const isSelected = state.formAssignees.some(
        (a) => String(a.userId) === String(c.userId)
      );
      const subInfo = [
        c.phoneNumber ? `SĐT: ${c.phoneNumber}` : "",
        c.originalName && c.originalName !== c.displayName ? `(${c.originalName})` : "",
        c.source === "manual" ? "Thủ công (Chưa có Zalo UID)" : `Zalo ID: ${c.userId}`,
      ]
        .filter(Boolean)
        .join(" • ");

      return `
        <div
          class="contact-picker-item ${isSelected ? "selected" : ""}"
          onclick="toggleFormAssignee('${escapeHtml(c.userId)}')"
        >
          <div class="contact-item-left">
            ${renderAvatarHtml(c.avatar, c.displayName)}
            <div>
              <div class="contact-item-name">${escapeHtml(c.displayName)}</div>
              <div class="contact-item-sub">${escapeHtml(subInfo)}</div>
            </div>
          </div>
          <div>
            <input type="checkbox" ${isSelected ? "checked" : ""} onclick="event.stopPropagation(); toggleFormAssignee('${escapeHtml(
        c.userId
      )}')" />
          </div>
        </div>
      `;
    })
    .join("");
}

// ==================== SEND ZALO MESSAGE MODAL ====================
function openSendZaloModal(docId, preselectUserId = null) {
  const doc = state.documents.find((d) => d.id === docId);
  if (!doc) return;

  state.sendingDoc = doc;
  state.sendingExtraAttachments = [];
  state.preselectedRecipientId = preselectUserId ? String(preselectUserId) : null;

  const effectiveTab = getEffectiveTab(doc);
  if (effectiveTab === "overdue") {
    state.selectedTemplate = "overdue";
    document.getElementById("sendZaloUrgencySelect").value = "urgent";
  } else if (effectiveTab === "completed") {
    state.selectedTemplate = "completed";
    document.getElementById("sendZaloUrgencySelect").value = "default";
  } else {
    const deadlineInfo = getDeadlineInfo(doc);
    state.selectedTemplate = deadlineInfo.type === "soon" ? "remind" : "assign";
    document.getElementById("sendZaloUrgencySelect").value =
      doc.priority === "urgent"
        ? "urgent"
        : doc.priority === "important"
        ? "important"
        : "default";
  }

  document.getElementById(
    "sendZaloDocSubtitle"
  ).textContent = `Văn bản số ${doc.docNumber}: "${doc.title}"`;

  document.querySelectorAll(".template-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.template === state.selectedTemplate);
  });

  document.getElementById("sendZaloMessageInput").value = buildMessageFromTemplate(
    doc,
    state.selectedTemplate
  );

  renderSendZaloRecipients();
  renderSendZaloAttachments();
  renderSendZaloHistory();

  const banner = document.getElementById("sendZaloResultBanner");
  banner.classList.add("hidden");
  banner.innerHTML = "";

  document.getElementById("sendZaloModal").classList.remove("hidden");
}

function renderSendZaloRecipients() {
  const container = document.getElementById("sendZaloRecipientsList");
  const doc = state.sendingDoc;
  if (!doc) return;

  const assignees = Array.isArray(doc.assignees) ? doc.assignees : [];
  if (assignees.length === 0) {
    container.innerHTML = `
      <div class="empty-hint">
        Văn bản này chưa có người phụ trách.
        <button type="button" class="btn btn-secondary btn-xs" onclick="closeModal('sendZaloModal'); openDocModal('${escapeHtml(
          doc.id
        )}')">
          ＋ Chọn người phụ trách ngay
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = assignees
    .map((a) => {
      const checked = state.preselectedRecipientId
        ? String(a.userId) === state.preselectedRecipientId
        : true;
      return `
        <label class="recipient-check-card">
          <input
            type="checkbox"
            class="send-recipient-checkbox"
            value="${escapeHtml(a.userId)}"
            data-name="${escapeHtml(a.displayName)}"
            ${checked ? "checked" : ""}
          />
          ${renderAvatarHtml(a.avatar, a.displayName, "")}
          <span>${escapeHtml(a.displayName)} (${
        a.role === "coord" ? "Phối hợp" : "Chủ trì"
      })</span>
        </label>
      `;
    })
    .join("");
}

function renderSendZaloAttachments() {
  const container = document.getElementById("sendZaloAttachmentsList");
  const doc = state.sendingDoc;
  if (!doc) return;

  const allFiles = [...(doc.attachments || []), ...state.sendingExtraAttachments];
  if (allFiles.length === 0) {
    container.innerHTML = `<div class="empty-hint">Không có tệp đính kèm. Bấm "+ Chọn thêm tệp khác" nếu muốn gửi kèm file qua Zalo.</div>`;
    return;
  }

  container.innerHTML = allFiles
    .map(
      (att) => `
      <label class="recipient-check-card">
        <input
          type="checkbox"
          class="send-attachment-checkbox"
          value="${escapeHtml(att.path)}"
          checked
        />
        <span>📎 ${escapeHtml(att.name)} <small>(${formatBytes(att.size)})</small></span>
      </label>
    `
    )
    .join("");
}

function renderSendZaloHistory() {
  const section = document.getElementById("sendZaloHistorySection");
  const listEl = document.getElementById("sendZaloHistoryList");
  const doc = state.sendingDoc;
  const logs = doc?.messageLogs || [];

  if (!logs.length) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  listEl.innerHTML = logs
    .map((log) => {
      const okNames = (log.results || [])
        .filter((r) => r.success)
        .map((r) => r.displayName)
        .join(", ");
      const failNames = (log.results || [])
        .filter((r) => !r.success)
        .map((r) => `${r.displayName} (${r.error})`)
        .join(", ");

      return `
        <div class="history-item">
          <div>
            <strong>🕒 ${formatDateTimeVN(log.sentAt)}</strong>
            ${
              log.attachmentCount > 0
                ? ` • 📎 Đính kèm ${log.attachmentCount} tệp`
                : ""
            }
          </div>
          ${
            okNames
              ? `<div style="color:#15803d">✓ Đã gửi tới: ${escapeHtml(okNames)}</div>`
              : ""
          }
          ${
            failNames
              ? `<div style="color:#dc2626">✕ Lỗi: ${escapeHtml(failNames)}</div>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

// ==================== ACTIONS & IPC HANDLERS ====================
async function openAttachmentFile(filePath) {
  try {
    await window.appApi.openFile(filePath);
  } catch (err) {
    showToast(err.message || "Không thể mở tệp đính kèm", "error");
  }
}

async function markDocStatus(docId, status, completionNote = "") {
  try {
    const updated = await window.appApi.updateDocumentStatus({
      docId,
      status,
      completionNote,
    });
    const idx = state.documents.findIndex((d) => d.id === docId);
    if (idx >= 0) state.documents[idx] = updated;
    renderTabsAndDocuments();
    showToast(
      status === "completed"
        ? "Đã chuyển văn bản sang mục Đã xử lý!"
        : "Đã chuyển văn bản về Đang xử lý!",
      "success"
    );
  } catch (err) {
    showToast(err.message || "Lỗi cập nhật trạng thái", "error");
  }
}

function promptCompleteDoc(docId) {
  const doc = state.documents.find((d) => d.id === docId);
  if (!doc) return;
  const note =
    doc.completionNote && doc.completionNote.trim()
      ? doc.completionNote.trim()
      : "Đã hoàn thành xử lý đúng yêu cầu.";
  markDocStatus(docId, "completed", note);
}

async function deleteDoc(docId) {
  const doc = state.documents.find((d) => d.id === docId);
  if (!doc) return;
  if (!window.confirm(`Bạn có chắc muốn xóa văn bản "${doc.docNumber} - ${doc.title}"?`)) {
    return;
  }
  try {
    await window.appApi.deleteDocument(docId);
    state.documents = state.documents.filter((d) => d.id !== docId);
    renderTabsAndDocuments();
    updateAssigneeFilterDropdown();
    showToast("Đã xóa văn bản.", "info");
  } catch (err) {
    showToast(err.message || "Không thể xóa văn bản", "error");
  }
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add("hidden");
  if (modalId === "zaloAuthModal") {
    window.appApi.abortQRLogin();
  }
}

function renderContactsModalList() {
  const container = document.getElementById("contactsModalList");
  if (!container) return;
  if (!state.zaloStatus.isLoggedIn) {
    container.innerHTML = `<div class="empty-hint" style="grid-column: 1 / -1;">Vui lòng đăng nhập Zalo để xem danh bạ.</div>`;
    return;
  }
  const q = (document.getElementById("contactsModalSearch")?.value || "")
    .trim()
    .toLowerCase();

  const filtered = state.contacts.filter((c) => {
    if (!q) return true;
    return [c.displayName, c.originalName, c.phoneNumber, c.userId]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-hint" style="grid-column: 1 / -1;">Chưa có liên hệ nào phù hợp. Hãy bấm "🔄 Đồng bộ bạn bè Zalo" để tải danh bạ.</div>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (c) => `
      <div class="contact-card">
        ${renderAvatarHtml(c.avatar, c.displayName)}
        <div style="overflow:hidden">
          <div class="contact-item-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(c.displayName)}
          </div>
          <div class="contact-item-sub">
            ${escapeHtml(c.phoneNumber || `UID: ${c.userId}`)}
          </div>
        </div>
      </div>
    `
    )
    .join("");
}

// ==================== INITIALIZATION & EVENT BINDINGS ====================
window.addEventListener("DOMContentLoaded", async () => {
  // Load initial data
  const [docs, contacts, zaloStatus, geminiSettings] = await Promise.all([
    window.appApi.listDocuments(),
    window.appApi.getContacts(),
    window.appApi.getZaloStatus(),
    window.appApi.getGeminiSettings(),
  ]);

  state.documents = docs || [];
  state.zaloStatus = zaloStatus || state.zaloStatus;
  state.contacts = state.zaloStatus.isLoggedIn ? contacts || [] : [];
  state.geminiSettings = geminiSettings || state.geminiSettings;

  updateZaloHeaderStatus();
  updateGeminiHeaderBadge();
  updateAssigneeFilterDropdown();
  updateDepartmentFilterDropdown();
  renderTabsAndDocuments();
  renderPortalBookmarks();

  // Initialize Web Portal URL & Auto-capture checkbox
  const portalUrlInput = document.getElementById("portalUrlInput");
  const portalWebview = document.getElementById("portalWebview");
  const chkAutoCaptureWeb = document.getElementById("chkAutoCaptureWebDownloads");
  const homeUrl = state.geminiSettings.portalHomeUrl || "https://www.google.com";
  if (portalUrlInput) portalUrlInput.value = homeUrl;
  if (portalWebview) portalWebview.src = homeUrl;
  if (chkAutoCaptureWeb) {
    chkAutoCaptureWeb.checked =
      state.geminiSettings.autoCaptureWebDownloads !== false;
  }

  // View Mode Switcher ('tasks' | 'web' | 'chat')
  document.querySelectorAll(".view-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setViewMode(btn.dataset.viewMode);
    });
  });

  // Initialize Chatbox AI Tab
  await initAiChatModule();

  // Initialize Version Manager & GitHub Auto-Updater
  await initUpdateModule();

  // Web Portal Navigation Controls
  if (portalWebview) {
    const syncUrlBar = (e) => {
      if (e.url && portalUrlInput && document.activeElement !== portalUrlInput) {
        portalUrlInput.value = e.url;
      }
    };
    portalWebview.addEventListener("did-navigate", syncUrlBar);
    portalWebview.addEventListener("did-navigate-in-page", syncUrlBar);
    portalWebview.addEventListener("did-finish-load", () => {
      setTimeout(() => {
        triggerIofficeAutoLogin({ forceSubmit: false, silent: true });
      }, 450);
    });
  }

  document
    .getElementById("btnOpenIofficeLoginModal")
    ?.addEventListener("click", () => {
      openGeminiSettingsModal();
      setTimeout(() => {
        document.getElementById("iofficeUsernameInput")?.focus();
      }, 80);
    });

  document
    .getElementById("btnFillIofficeLoginNow")
    ?.addEventListener("click", async () => {
      await triggerIofficeAutoLogin({ forceSubmit: true, silent: false });
    });

  if (typeof window.appApi.onIofficeCredsAutosaved === "function") {
    window.appApi.onIofficeCredsAutosaved((data) => {
      if (data?.settings) {
        state.geminiSettings = data.settings;
        updateGeminiHeaderBadge();
      }
      showToast(
        `🔐 Đã tự động lưu thông tin đăng nhập iOffice (Tài khoản: ${
          data?.username || ""
        })!`,
        "success"
      );
    });
  }

  document.getElementById("btnPortalBack")?.addEventListener("click", () => {
    if (portalWebview && portalWebview.canGoBack()) {
      portalWebview.goBack();
    }
  });

  document.getElementById("btnPortalForward")?.addEventListener("click", () => {
    if (portalWebview && portalWebview.canGoForward()) {
      portalWebview.goForward();
    }
  });

  document.getElementById("btnPortalReload")?.addEventListener("click", () => {
    if (portalWebview) {
      portalWebview.reload();
    }
  });

  document.getElementById("portalUrlForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    navigatePortalTo(portalUrlInput.value);
  });

  document
    .getElementById("btnSavePortalBookmark")
    ?.addEventListener("click", async () => {
      const currentUrl =
        (portalWebview?.getURL && portalWebview.getURL()) ||
        portalUrlInput?.value ||
        "";
      if (!currentUrl) return;
      let hostLabel = "Cổng Văn Bản";
      try {
        hostLabel = new URL(currentUrl).hostname.replace(/^www\./, "");
      } catch (_) {}
      const rawTitle =
        (portalWebview?.getTitle && portalWebview.getTitle()) || hostLabel;
      const bmName = (rawTitle || hostLabel).trim().slice(0, 30) || "Cổng Văn Bản";
      const bookmarks = [...(state.geminiSettings.portalBookmarks || [])];
      if (!bookmarks.some((b) => b.url === currentUrl)) {
        bookmarks.push({ name: bmName, url: currentUrl });
      }
      const updated = await window.appApi.saveGeminiSettings({
        portalBookmarks: bookmarks,
        portalHomeUrl: currentUrl,
      });
      state.geminiSettings = updated;
      renderPortalBookmarks();
      showToast(`Đã lưu cổng "${bmName}" vào thanh truy cập nhanh!`, "success");
    });

  chkAutoCaptureWeb?.addEventListener("change", async (e) => {
    const updated = await window.appApi.saveGeminiSettings({
      autoCaptureWebDownloads: e.target.checked,
    });
    state.geminiSettings = updated;
    showToast(
      e.target.checked
        ? "Đã bật tự động kéo file tải về trên Web vào App!"
        : "Đã tắt tự động kéo file tải về trên Web.",
      "info"
    );
  });

  document
    .getElementById("portalDownloadTargetSelect")
    ?.addEventListener("change", (e) => {
      state.portalDownloadTarget = e.target.value;
      showToast(
        e.target.value === "completion_response"
          ? "Chế độ tải file Web: Tự động đưa vào Khớp lệnh VB Phản hồi (Đánh dấu hoàn thành)!"
          : "Chế độ tải file Web: Tự động đưa vào Tạo nhiệm vụ mới!",
        "info"
      );
    });

  document
    .getElementById("btnPullWebPageToApp")
    ?.addEventListener("click", async () => {
      await pullCurrentWebPageToApp();
    });

  document
    .getElementById("btnPullWebCompletionToApp")
    ?.addEventListener("click", async () => {
      await pullWebCompletionToApp();
    });

  document
    .getElementById("btnOpenCompletionMatcher")
    ?.addEventListener("click", () => {
      openCompletionMatchModal(true);
    });

  document
    .getElementById("btnPickCompletionFile")
    ?.addEventListener("click", async () => {
      if (!state.geminiSettings.hasApiKey) {
        showToast("Vui lòng nhập Gemini API Key trước!", "info");
        openGeminiSettingsModal();
        return;
      }
      const files = await window.appApi.pickFiles();
      if (files && files.length) {
        for (const f of files.slice(1)) {
          state.completionAttachments.push(f);
        }
        await analyzeCompletionFromFile(files[0]);
      }
    });

  document
    .getElementById("btnPullCompletionFromWebInModal")
    ?.addEventListener("click", async () => {
      await pullWebCompletionToApp();
    });

  document
    .getElementById("btnAddMoreCompletionFiles")
    ?.addEventListener("click", async () => {
      const files = await window.appApi.pickFiles();
      if (files && files.length) {
        state.completionAttachments.push(...files);
        renderCompletionAttachments();
      }
    });

  document
    .getElementById("btnConfirmCompletionMatch")
    ?.addEventListener("click", async () => {
      await confirmAndCompleteMatchedTask({ isAuto: false });
    });

  // Subscribe to Web Portal Download Capture Events
  window.appApi.onWebPortalDownloadStarted((info) => {
    showToast(
      `📥 Đang kéo tệp "${info.name}" từ Cổng văn bản về phần mềm...`,
      "info"
    );
  });

  window.appApi.onWebPortalFileCaptured(async (fileObj) => {
    const completionModalOpen = !document
      .getElementById("completionMatchModal")
      ?.classList.contains("hidden");

    if (
      state.portalDownloadTarget === "completion_response" ||
      completionModalOpen
    ) {
      showToast(
        `✅ Đã kéo tệp VB Phản hồi "${fileObj.name}"! Đang đối chiếu căn cứ để khớp hoàn thành...`,
        "success"
      );
      await analyzeCompletionFromFile(fileObj);
      return;
    }

    showToast(
      `✅ Đã kéo tệp "${fileObj.name}" vào phần mềm! Đang đọc tự động bằng AI...`,
      "success"
    );

    const docModal = document.getElementById("docModal");
    if (docModal.classList.contains("hidden")) {
      openDocModal(null);
    }

    fileObj.category = fileObj.category || "superior";
    state.formAttachments.push(fileObj);
    renderFormAttachments();

    if (state.geminiSettings.hasApiKey) {
      const readableExts = [
        "pdf",
        "png",
        "jpg",
        "jpeg",
        "webp",
        "docx",
        "txt",
        "md",
        "csv",
        "json",
        "xml",
        "html",
      ];
      if (readableExts.includes((fileObj.ext || "").toLowerCase())) {
        await analyzeFileAndFillForm(fileObj.path, fileObj.name);
      } else {
        // Fallback: if downloaded file is .rar/.zip/.doc/.xls, read webpage metadata with AI while keeping file attached
        await pullCurrentWebPageToApp({ keepExistingModal: true });
      }
    }
  });

  window.appApi.onWebPortalDownloadFailed((info) => {
    if (info.state !== "cancelled") {
      showToast(`Không thể tải tệp "${info.name}" từ trang web.`, "error");
    }
  });

  // Periodic check every 30s to auto-promote expired documents into "Quá hạn"
  setInterval(() => {
    renderTabsAndDocuments();
  }, 30000);

  // Subscribe to Main Process Zalo events
  window.appApi.onZaloStatusChanged((status) => {
    state.zaloStatus = status || state.zaloStatus;
    if (!state.zaloStatus.isLoggedIn) {
      state.contacts = [];
    }
    updateZaloHeaderStatus();
    updateAssigneeFilterDropdown();
    renderFormSelectedAssignees();
    renderFormContactPicker();
    renderContactsModalList();
  });

  window.appApi.onContactsUpdated((updatedContacts) => {
    state.contacts = state.zaloStatus.isLoggedIn ? updatedContacts || [] : [];
    updateZaloHeaderStatus();
    updateAssigneeFilterDropdown();
    renderFormContactPicker();
    renderContactsModalList();
  });

  window.appApi.onZaloQREvent((ev) => {
    const qrImg = document.getElementById("qrCodeImage");
    const placeholder = document.getElementById("qrPlaceholder");
    const scannedBox = document.getElementById("qrScannedInfo");
    const statusMsg = document.getElementById("qrStatusMessage");
    const btnRefresh = document.getElementById("btnRefreshQR");

    if (ev.type === "QRCodeGenerated") {
      placeholder.classList.add("hidden");
      scannedBox.classList.add("hidden");
      qrImg.src = ev.image;
      qrImg.classList.remove("hidden");
      btnRefresh.classList.remove("hidden");
      statusMsg.textContent =
        "Mở ứng dụng Zalo trên điện thoại và quét mã QR phía trên để đăng nhập.";
    } else if (ev.type === "QRCodeScanned") {
      qrImg.classList.add("hidden");
      scannedBox.classList.remove("hidden");
      document.getElementById("qrScannedName").textContent =
        ev.displayName || "Tài khoản Zalo";
      document.getElementById("qrScannedAvatar").src = ev.avatar || "";
      statusMsg.textContent = "Đã quét mã QR! Vui lòng bấm Xác nhận trên điện thoại...";
    } else if (ev.type === "QRCodeExpired") {
      qrImg.classList.add("hidden");
      placeholder.classList.remove("hidden");
      statusMsg.textContent = "Mã QR đã hết hạn. Vui lòng bấm tạo lại mã QR mới.";
    } else if (ev.type === "QRCodeDeclined") {
      qrImg.classList.add("hidden");
      scannedBox.classList.add("hidden");
      placeholder.classList.remove("hidden");
      statusMsg.textContent = "Bạn đã từ chối đăng nhập QR trên điện thoại.";
    } else if (ev.type === "LoginSuccess") {
      showToast("Đăng nhập Zalo và đồng bộ danh bạ thành công!", "success");
      updateZaloHeaderStatus();
    }
  });

  // Tab switching
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeTab = btn.dataset.tab;
      renderTabsAndDocuments();
    });
  });

  // Search & Filters
  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    renderTabsAndDocuments();
  });

  document.getElementById("filterDepartment")?.addEventListener("change", (e) => {
    state.filterDepartment = e.target.value;
    renderTabsAndDocuments();
  });

  document.getElementById("filterAssignee").addEventListener("change", (e) => {
    state.filterAssignee = e.target.value;
    renderTabsAndDocuments();
  });

  document.getElementById("filterPriority").addEventListener("change", (e) => {
    state.filterPriority = e.target.value;
    renderTabsAndDocuments();
  });

  document
    .getElementById("docDepartmentInput")
    ?.addEventListener("change", (e) => {
      const customEl = document.getElementById("docDepartmentCustomInput");
      if (!customEl) return;
      if (e.target.value === "__custom__") {
        customEl.classList.remove("hidden");
        customEl.focus();
      } else {
        customEl.classList.add("hidden");
      }
    });

  // Close modal buttons
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeModal(btn.dataset.closeModal);
    });
  });

  // Header buttons
  document.getElementById("btnCreateDoc").addEventListener("click", () => {
    openDocModal(null);
  });

  document.getElementById("btnOpenZaloModal").addEventListener("click", async () => {
    updateZaloHeaderStatus();
    await populateSavedZaloCredentialsInForm();
    document.getElementById("zaloAuthModal").classList.remove("hidden");
  });

  document.getElementById("btnOpenContactsModal").addEventListener("click", () => {
    if (!state.zaloStatus.isLoggedIn) {
      showToast("Vui lòng đăng nhập Zalo để xem danh bạ.", "info");
      return;
    }
    renderContactsModalList();
    document.getElementById("contactsModal").classList.remove("hidden");
  });

  document.getElementById("btnLoginZaloFromDocForm")?.addEventListener("click", async () => {
    updateZaloHeaderStatus();
    await populateSavedZaloCredentialsInForm();
    document.getElementById("zaloAuthModal").classList.remove("hidden");
  });

  document
    .getElementById("btnOpenGeminiSettings")
    .addEventListener("click", () => {
      openGeminiSettingsModal("ai");
    });

  document
    .querySelectorAll("#systemSettingsTabsBar [data-settings-tab]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        switchSystemSettingsTab(btn.dataset.settingsTab || "ai");
      });
    });

  document.getElementById("btnConfigGeminiFromForm").addEventListener("click", () => {
    openGeminiSettingsModal();
  });

  document
    .getElementById("systemAiProviderSelect")
    ?.addEventListener("change", (e) => {
      syncCurrentSystemAiDraftFromInputs();
      const nextProv = e.target.value || "gemini";
      state.systemAiActiveDraftProvider = nextProv;
      renderSystemAiProviderFields(nextProv);
    });

  document
    .getElementById("geminiModelSelect")
    ?.addEventListener("change", (e) => {
      const customEl = document.getElementById("systemAiCustomModelInput");
      if (!customEl) return;
      if (e.target.value === "__custom__") {
        customEl.classList.remove("hidden");
        customEl.focus();
      } else {
        customEl.classList.add("hidden");
      }
    });

  document
    .getElementById("btnFetchGeminiModelsMain")
    ?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const provider =
        document.getElementById("systemAiProviderSelect")?.value || "gemini";
      const apiKey = (
        document.getElementById("geminiApiKeyInput")?.value || ""
      ).trim();
      const baseUrl = (
        document.getElementById("systemAiBaseUrlInput")?.value || ""
      ).trim();
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "⏳ Đang tải...";
      try {
        const res = await window.appApi.fetchAiModels({
          provider,
          apiKey,
          baseUrl,
        });
        if (res?.settings) {
          state.aiChat.settings = res.settings;
        }
        const models = res?.models || [];
        const curVal = getSelectedSystemAiModelValue(provider);
        const chosen =
          models.length > 0 && !models.includes(curVal) ? models[0] : curVal;
        populateMainSystemModelSelect(provider, chosen, models);
        showToast(
          `Đã tải ${models.length} model ${getProviderLabel(provider)} từ API!`,
          "success"
        );
      } catch (err) {
        showToast(
          err.message ||
            `Không tải được danh sách model ${getProviderLabel(provider)}`,
          "error"
        );
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

  document.getElementById("btnToggleIofficePass")?.addEventListener("click", (e) => {
    const passInput = document.getElementById("iofficePasswordInput");
    if (!passInput) return;
    const isHidden = passInput.type === "password";
    passInput.type = isHidden ? "text" : "password";
    e.currentTarget.textContent = isHidden ? "🙈 Ẩn" : "👁️ Hiện";
  });

  const saveAllSettingsFromModal = async ({ loginIofficeAfterSave = false } = {}) => {
    const saveBtn = document.getElementById("btnSaveGeminiSettings");
    if (saveBtn) saveBtn.disabled = true;
    try {
      const ioUrl = (
        document.getElementById("iofficeUrlInput")?.value ||
        state.geminiSettings.portalHomeUrl ||
        "https://vpdt.angiang.gov.vn"
      ).trim();
      syncCurrentSystemAiDraftFromInputs();
      const activeProv =
        document.getElementById("systemAiProviderSelect")?.value || "gemini";
      const draftProviders = state.systemAiDraftProviders || {};
      const updated = await window.appApi.saveGeminiSettings({
        aiProvider: activeProv,
        aiProviders: draftProviders,
        iofficeUrl: ioUrl,
        portalHomeUrl: ioUrl || state.geminiSettings.portalHomeUrl,
        iofficeUsername: (
          document.getElementById("iofficeUsernameInput")?.value || ""
        ).trim(),
        iofficePassword:
          document.getElementById("iofficePasswordInput")?.value || "",
        iofficeAutoLogin: Boolean(
          document.getElementById("chkIofficeAutoLogin")?.checked
        ),
        iofficeAutoSaveOnWeb: Boolean(
          document.getElementById("chkIofficeAutoSaveOnWeb")?.checked
        ),
        geminiApiKey: draftProviders.gemini?.apiKey || "",
        geminiModel: draftProviders.gemini?.model || "gemini-2.5-flash",
        autoAnalyzeOnPick: document.getElementById("chkAutoAnalyzeOnPick").checked,
        specialistName: (
          document.getElementById("specialistNameInput")?.value || ""
        ).trim(),
        defaultDepartment:
          document.getElementById("defaultDepartmentSelect")?.value || "",
        googleSheetWebhookUrl: (
          document.getElementById("googleSheetWebhookUrlInput")?.value || ""
        ).trim(),
        googleSheetSecret:
          document.getElementById("googleSheetSecretInput")?.value || "",
        autoSyncGoogleSheet: Boolean(
          document.getElementById("chkAutoSyncGoogleSheet")?.checked
        ),
        nd30Settings: {
          ...(state.geminiSettings?.nd30Settings || {}),
          parentAgency: (
            document.getElementById("nd30ParentAgencyInput")?.value || ""
          ).trim(),
          issuingAgency: (
            document.getElementById("nd30IssuingAgencyInput")?.value || ""
          ).trim(),
          agencyCode: (
            document.getElementById("nd30AgencyCodeInput")?.value || "UBND"
          ).trim(),
          departmentCode: (
            document.getElementById("nd30DepartmentCodeInput")?.value || "VP"
          ).trim(),
          location: (
            document.getElementById("nd30LocationInput")?.value || ""
          ).trim(),
          nextDocNumber: Math.max(
            1,
            Number.parseInt(
              document.getElementById("nd30NextDocNumInput")?.value || "1",
              10
            ) || 1
          ),
          signerTitle: (
            document.getElementById("nd30SignerTitleInput")?.value || "CHỦ TỊCH"
          ).trim(),
          signerName: (
            document.getElementById("nd30SignerNameInput")?.value || ""
          ).trim(),
          autoGenerateOnAssign: Boolean(
            document.getElementById("chkNd30AutoGenerateOnAssign")?.checked
          ),
          useAiDrafting: Boolean(
            document.getElementById("chkNd30UseAiDrafting")?.checked
          ),
        },
        storageConfig: {
          rootDir: document.getElementById("storageRootDirInput")?.value || "",
        },
      });
      state.geminiSettings = updated;
      if (typeof window.appApi.saveUpdateConfig === "function") {
        const repoEl = document.getElementById("updGithubRepoInput");
        if (repoEl) {
          state.update.state = await window.appApi.saveUpdateConfig({
            githubRepo: repoEl.value || "",
            githubToken:
              document.getElementById("updGithubTokenInput")?.value || "",
            autoCheckUpdates: Boolean(
              document.getElementById("chkUpdAutoCheck")?.checked
            ),
            autoInstallUpdates: Boolean(
              document.getElementById("chkUpdAutoInstall")?.checked
            ),
            includePrerelease: Boolean(
              document.getElementById("chkUpdIncludePre")?.checked
            ),
          });
          renderUpdateHeaderPill();
        }
      }
      updateGeminiHeaderBadge();
      updateDepartmentFilterDropdown();
      if (typeof window.appApi.getAiChatState === "function") {
        const chatState = await window.appApi.getAiChatState();
        if (chatState?.settings) {
          state.aiChat.settings = chatState.settings;
          renderAiChatHeaderAndContext();
        }
      }
      closeModal("geminiSettingsModal");
      showToast(
        "Đã lưu cấu hình nơi lưu trữ văn bản, tài khoản iOffice & AI Gemini!",
        "success"
      );

      if (loginIofficeAfterSave) {
        if (state.viewMode === "tasks") {
          setViewMode("web");
        }
        const currentUrl =
          (portalWebview?.getURL && portalWebview.getURL()) || "";
        if (
          ioUrl &&
          (!currentUrl ||
            currentUrl === "about:blank" ||
            currentUrl.includes("google.com"))
        ) {
          navigatePortalTo(ioUrl);
        } else {
          await triggerIofficeAutoLogin({ forceSubmit: true, silent: false });
        }
      }
    } catch (err) {
      showToast(err.message || "Lỗi khi lưu cấu hình", "error");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  };

  document.getElementById("geminiSettingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveAllSettingsFromModal({ loginIofficeAfterSave: false });
  });

  document
    .getElementById("btnSaveAndLoginIofficeNow")
    ?.addEventListener("click", async () => {
      await saveAllSettingsFromModal({ loginIofficeAfterSave: true });
    });

  // Document Form Events
  document.getElementById("assigneeSearchInput").addEventListener("input", () => {
    renderFormContactPicker();
  });

  document.getElementById("btnPickAndAnalyzeWithAI").addEventListener("click", async () => {
    if (!state.geminiSettings.hasApiKey) {
      showToast("Vui lòng nhập Gemini API Key trước khi đọc văn bản tự động.", "info");
      openGeminiSettingsModal();
      return;
    }
    const files = await window.appApi.pickFiles();
    if (files && files.length) {
      const tagged = files.map((f) => ({ ...f, category: "superior" }));
      state.formAttachments.push(...tagged);
      renderFormAttachments();
      await analyzeFileAndFillForm(tagged[0].path, tagged[0].name);
    }
  });

  document.querySelectorAll("[data-pick-att-category]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const category = btn.dataset.pickAttCategory || "superior";
      const files = await window.appApi.pickFiles();
      if (files && files.length) {
        const tagged = files.map((f) => ({
          ...f,
          category,
          isCompletionFile: category === "completed",
        }));
        state.formAttachments.push(...tagged);
        renderFormAttachments();
        if (
          category !== "completed" &&
          state.geminiSettings.hasApiKey &&
          state.geminiSettings.autoAnalyzeOnPick &&
          !document.getElementById("docTitleInput").value.trim()
        ) {
          await analyzeFileAndFillForm(tagged[0].path, tagged[0].name);
        }
      }
    });
  });

  const openStorageSectionInModal = () => {
    openGeminiSettingsModal();
    setTimeout(() => {
      document
        .getElementById("storageSettingsSection")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  document
    .getElementById("btnOpenStorageSettings")
    ?.addEventListener("click", openStorageSectionInModal);
  document
    .getElementById("btnOpenStorageFromDocForm")
    ?.addEventListener("click", openStorageSectionInModal);

  const bindFolderPickAndOpen = (pickBtnId, openBtnId, inputId) => {
    document.getElementById(pickBtnId)?.addEventListener("click", async () => {
      const inputEl = document.getElementById(inputId);
      const res = await window.appApi.pickStorageFolder(inputEl?.value || "");
      if (!res.canceled && res.path && inputEl) {
        inputEl.value = res.path;
      }
    });
    document.getElementById(openBtnId)?.addEventListener("click", async () => {
      const folderPath = document.getElementById(inputId)?.value?.trim();
      if (!folderPath) {
        showToast("Chưa có đường dẫn thư mục để mở.", "info");
        return;
      }
      try {
        await window.appApi.openStorageFolder(folderPath);
      } catch (err) {
        showToast(err.message || "Không thể mở thư mục", "error");
      }
    });
  };

  bindFolderPickAndOpen(
    "btnPickStorageRootDir",
    "btnOpenStorageRootDir",
    "storageRootDirInput"
  );

  document
    .getElementById("btnResetStorageDefaults")
    ?.addEventListener("click", () => {
      const def = state.geminiSettings.defaultStorageConfig || {};
      const rootEl = document.getElementById("storageRootDirInput");
      if (rootEl && def.rootDir) {
        rootEl.value = def.rootDir;
      }
      showToast("Đã khôi phục nơi lưu trữ mặc định (hãy bấm Lưu để áp dụng).", "info");
    });

  document
    .getElementById("btnMigrateStorageFiles")
    ?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        // Save current storage settings first so migration uses the path shown in input
        const updated = await window.appApi.saveGeminiSettings({
          storageConfig: {
            rootDir: document.getElementById("storageRootDirInput")?.value || "",
          },
        });
        state.geminiSettings = updated;

        const res = await window.appApi.migrateStorageFiles();
        if (Array.isArray(res.docs)) {
          state.documents = res.docs;
          renderTabsAndDocuments();
        }
        showToast(
          `📦 Đã sắp xếp ${res.movedCount}/${res.totalProcessed} tệp vào thư mục theo Số/Ký hiệu văn bản!`,
          "success"
        );
      } catch (err) {
        showToast(err.message || "Lỗi khi sắp xếp file vào nơi lưu trữ", "error");
      } finally {
        btn.disabled = false;
      }
    });

  document.getElementById("btnToggleQuickAddContact").addEventListener("click", () => {
    document.getElementById("quickAddContactBox").classList.toggle("hidden");
  });

  document.getElementById("btnSyncContactsInForm").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "⏳ Đang đồng bộ...";
    try {
      const res = await window.appApi.syncContacts();
      state.contacts = res.contacts || [];
      renderFormContactPicker();
      showToast(`Đã đồng bộ ${state.contacts.length} liên hệ từ Zalo!`, "success");
    } catch (err) {
      showToast(err.message || "Lỗi đồng bộ danh bạ Zalo", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "🔄 Đồng bộ Zalo";
    }
  });

  document.getElementById("btnFindPhoneInForm").addEventListener("click", async (e) => {
    const phoneInput = document.getElementById("quickPhoneInput");
    const phone = phoneInput.value.trim();
    if (!phone) {
      showToast("Vui lòng nhập số điện thoại cần tìm.", "error");
      return;
    }
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await window.appApi.findContactByPhone(phone);
      if (res.contact) {
        phoneInput.value = "";
        toggleFormAssignee(res.contact.userId);
        showToast(`Đã tìm thấy và chọn: ${res.contact.displayName}`, "success");
      }
    } catch (err) {
      showToast(err.message || "Không tìm thấy người dùng Zalo", "error");
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("btnAddManualInForm").addEventListener("click", async () => {
    const nameEl = document.getElementById("quickManualNameInput");
    const uidEl = document.getElementById("quickManualUidInput");
    const displayName = nameEl.value.trim();
    const userId = uidEl.value.trim();
    if (!displayName) {
      showToast("Vui lòng nhập họ tên người phụ trách.", "error");
      return;
    }
    try {
      const res = await window.appApi.addManualContact({
        displayName,
        userId,
      });
      nameEl.value = "";
      uidEl.value = "";
      if (res.contact) {
        toggleFormAssignee(res.contact.userId);
        showToast(`Đã thêm người phụ trách: ${res.contact.displayName}`, "success");
      }
    } catch (err) {
      showToast(err.message || "Không thể thêm liên hệ", "error");
    }
  });

  // Calendar picker buttons & sync for Vietnamese dd/mm/yyyy date inputs
  document.querySelectorAll(".vn-picker-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.pickerTarget;
      const picker = document.getElementById(targetId);
      if (!picker) return;
      if (targetId === "docReceivedDatePicker") {
        const iso = vnDateToIso(document.getElementById("docReceivedDateInput")?.value || "");
        if (iso) picker.value = iso;
      } else if (targetId === "docDueDatePicker") {
        const iso = vnDateTimeToIso(document.getElementById("docDueDateInput")?.value || "");
        if (iso) picker.value = iso.slice(0, 16);
      }
      if (typeof picker.showPicker === "function") {
        try {
          picker.showPicker();
          return;
        } catch (_) {}
      }
      picker.click();
    });
  });

  document
    .getElementById("docReceivedDatePicker")
    ?.addEventListener("change", (e) => {
      if (e.target.value) {
        document.getElementById("docReceivedDateInput").value = isoDateToVn(
          e.target.value
        );
      }
    });

  document
    .getElementById("docDueDatePicker")
    ?.addEventListener("change", (e) => {
      if (e.target.value) {
        document.getElementById("docDueDateInput").value = isoDateTimeToVn(
          e.target.value
        );
      }
    });

  // Save Document Form Submit
  document.getElementById("docForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById("btnSaveDoc");
    const rawReceived =
      document.getElementById("docReceivedDateInput")?.value || "";
    const rawDue = document.getElementById("docDueDateInput")?.value || "";
    const parsedReceivedIso = rawReceived.trim()
      ? vnDateToIso(rawReceived)
      : "";
    const parsedDueIso = vnDateTimeToIso(rawDue);

    if (rawReceived.trim() && parsedReceivedIso === null) {
      showToast(
        "Ngày nhận văn bản chưa đúng định dạng dd/mm/yyyy (VD: 25/11/2026).",
        "error"
      );
      document.getElementById("docReceivedDateInput")?.focus();
      return;
    }
    if (!parsedDueIso) {
      showToast(
        "Hạn xử lý (Deadline) chưa đúng định dạng dd/mm/yyyy HH:mm (VD: 08/12/2026 17:00).",
        "error"
      );
      document.getElementById("docDueDateInput")?.focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "⏳ Đang lưu...";

    try {
      const autoGenNd30 = Boolean(
        document.getElementById("chkAutoGenerateNd30")?.checked
      );
      if (autoGenNd30) {
        saveBtn.textContent = "⏳ Đang lưu & tạo CV NĐ 30...";
      }

      const payload = {
        id: document.getElementById("docIdInput").value || null,
        docNumber: document.getElementById("docNumberInput").value,
        issuer: document.getElementById("docIssuerInput").value,
        department: getDocModalDepartmentValue(),
        specialistName:
          document.getElementById("docSpecialistInput")?.value || "",
        title: document.getElementById("docTitleInput").value,
        receivedDate: parsedReceivedIso,
        dueDate: parsedDueIso,
        priority: document.getElementById("docPriorityInput").value,
        notes: document.getElementById("docNotesInput").value,
        status: document.getElementById("docStatusInput").value,
        completionNote: document.getElementById("docCompletionNoteInput").value,
        assignees: state.formAssignees,
        attachments: state.formAttachments,
        autoGenerateNd30: autoGenNd30,
        forceGenerateNd30: autoGenNd30,
        openNd30AfterSave: autoGenNd30,
      };

      const savedDoc = await window.appApi.saveDocument(payload);
      if (autoGenNd30) {
        state.geminiSettings = await window.appApi.getGeminiSettings();
      }

      const existingIdx = state.documents.findIndex((d) => d.id === savedDoc.id);
      if (existingIdx >= 0) {
        state.documents[existingIdx] = savedDoc;
      } else {
        state.documents.unshift(savedDoc);
      }

      // Switch to the tab where this document belongs so user sees it right away
      state.activeTab = getEffectiveTab(savedDoc);
      renderTabsAndDocuments();
      updateAssigneeFilterDropdown();
      updateDepartmentFilterDropdown();
      closeModal("docModal");
      if (savedDoc.sheetSyncError) {
        showToast(
          `Đã lưu văn bản ${savedDoc.docNumber}, nhưng lỗi đồng bộ Sheet: ${savedDoc.sheetSyncError}`,
          "info"
        );
      } else if (savedDoc.nd30JustGenerated && autoGenNd30) {
        showToast(
          savedDoc.nd30OpenError
            ? `📜 Đã lưu & tạo Công văn Giao việc NĐ 30/2020 (không tự mở được tệp: ${savedDoc.nd30OpenError})`
            : `📜 Đã lưu, tạo & mở Công văn Giao việc NĐ 30/2020 cho ${savedDoc.docNumber || "nhiệm vụ"}!`,
          savedDoc.nd30OpenError ? "info" : "success"
        );
      } else if (savedDoc.nd30GeneratedDocPath && autoGenNd30) {
        showToast(
          `📜 Đã lưu & tạo Công văn Giao việc NĐ 30/2020 cho ${savedDoc.docNumber || "nhiệm vụ"}!`,
          "success"
        );
      } else if (savedDoc.sheetSyncedAt && state.geminiSettings?.googleSheetWebhookUrl) {
        showToast(
          `Đã lưu văn bản ${savedDoc.docNumber} & đồng bộ lên Google Sheet!`,
          "success"
        );
      } else {
        showToast(`Đã lưu văn bản ${savedDoc.docNumber}!`, "success");
      }

      // Check if Auto-send Zalo is enabled
      const autoSend = document.getElementById("chkAutoSendZalo").checked;
      const autoAttach = document.getElementById("chkAutoSendAttachments").checked;

      if (autoSend && savedDoc.assignees && savedDoc.assignees.length > 0) {
        if (!state.zaloStatus.isLoggedIn) {
          showToast(
            "Đã lưu văn bản. Hãy đăng nhập Zalo để gửi tin nhắn cho người phụ trách!",
            "info"
          );
        } else {
          showToast("Đang tự động gửi tin nhắn Zalo cho người phụ trách...", "info");
          const msg = buildMessageFromTemplate(savedDoc, "assign");
          const attachPaths = autoAttach
            ? (savedDoc.attachments || []).map((a) => a.path)
            : [];
          const sendRes = await window.appApi.sendZaloMessage({
            docId: savedDoc.id,
            recipients: savedDoc.assignees,
            message: msg,
            urgency:
              savedDoc.priority === "urgent"
                ? "urgent"
                : savedDoc.priority === "important"
                ? "important"
                : "default",
            attachmentPaths: attachPaths,
            templateType: "assign",
          });
          if (sendRes.updatedDoc) {
            const idx = state.documents.findIndex((d) => d.id === savedDoc.id);
            if (idx >= 0) state.documents[idx] = sendRes.updatedDoc;
            renderTabsAndDocuments();
          }
          const okCount = (sendRes.results || []).filter((r) => r.success).length;
          if (okCount > 0) {
            showToast(
              `Đã tự động gửi tin nhắn Zalo tới ${okCount}/${savedDoc.assignees.length} người phụ trách!`,
              "success"
            );
          } else {
            const firstErr = sendRes.results?.[0]?.error || "Gửi Zalo không thành công";
            showToast(firstErr, "error");
          }
        }
      }
    } catch (err) {
      showToast(err.message || "Lỗi khi lưu văn bản", "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "💾 Lưu Văn Bản";
    }
  });

  // Send Zalo Modal Events
  document.querySelectorAll(".template-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".template-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      state.selectedTemplate = pill.dataset.template;
      if (state.sendingDoc) {
        document.getElementById("sendZaloMessageInput").value = buildMessageFromTemplate(
          state.sendingDoc,
          state.selectedTemplate
        );
      }
    });
  });

  document
    .getElementById("btnAddExtraAttachmentForZalo")
    .addEventListener("click", async () => {
      const files = await window.appApi.pickFiles();
      if (files && files.length) {
        state.sendingExtraAttachments.push(...files);
        renderSendZaloAttachments();
      }
    });

  document.getElementById("btnConfirmSendZalo").addEventListener("click", async (e) => {
    if (!state.sendingDoc) return;
    const btn = e.currentTarget;
    const banner = document.getElementById("sendZaloResultBanner");

    const checkedRecipients = Array.from(
      document.querySelectorAll(".send-recipient-checkbox:checked")
    ).map((el) => ({
      userId: el.value,
      displayName: el.dataset.name,
    }));

    if (checkedRecipients.length === 0) {
      showToast("Vui lòng tích chọn ít nhất 1 người phụ trách nhận tin nhắn.", "error");
      return;
    }

    const attachmentPaths = Array.from(
      document.querySelectorAll(".send-attachment-checkbox:checked")
    ).map((el) => el.value);

    const message = document.getElementById("sendZaloMessageInput").value;
    const urgency = document.getElementById("sendZaloUrgencySelect").value;

    btn.disabled = true;
    btn.textContent = "⏳ Đang gửi qua Zalo...";
    banner.classList.add("hidden");

    try {
      const res = await window.appApi.sendZaloMessage({
        docId: state.sendingDoc.id,
        recipients: checkedRecipients,
        message,
        urgency,
        attachmentPaths,
        templateType: state.selectedTemplate,
      });

      if (res.updatedDoc) {
        state.sendingDoc = res.updatedDoc;
        const idx = state.documents.findIndex((d) => d.id === res.updatedDoc.id);
        if (idx >= 0) state.documents[idx] = res.updatedDoc;
        renderTabsAndDocuments();
        renderSendZaloHistory();
      }

      const okList = (res.results || []).filter((r) => r.success);
      const failList = (res.results || []).filter((r) => !r.success);

      banner.classList.remove("hidden");
      if (failList.length === 0) {
        banner.className = "send-result-banner success";
        banner.innerHTML = `✅ Đã gửi tin nhắn Zalo thành công cho <b>${okList
          .map((r) => escapeHtml(r.displayName))
          .join(", ")}</b>!`;
        showToast("Gửi tin nhắn Zalo thành công!", "success");
      } else {
        banner.className = "send-result-banner error";
        banner.innerHTML =
          (okList.length > 0
            ? `<div>✓ Đã gửi: ${okList.map((r) => escapeHtml(r.displayName)).join(", ")}</div>`
            : "") +
          `<div>✕ Không gửi được: ${failList
            .map((r) => `${escapeHtml(r.displayName)} (${escapeHtml(r.error)})`)
            .join("; ")}</div>`;
      }
    } catch (err) {
      banner.classList.remove("hidden");
      banner.className = "send-result-banner error";
      banner.textContent = `❌ ${err.message || "Lỗi gửi tin nhắn Zalo"}`;
      showToast(err.message || "Lỗi gửi tin nhắn Zalo", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "🚀 Gửi Tin Nhắn Zalo Ngay";
    }
  });

  // Bulk Remind All Overdue Documents
  document.getElementById("btnBulkRemindOverdue").addEventListener("click", async (e) => {
    const overdueDocs = state.documents.filter(
      (d) => getEffectiveTab(d) === "overdue" && (d.assignees || []).length > 0
    );
    if (overdueDocs.length === 0) {
      showToast("Các văn bản quá hạn chưa được gán người phụ trách Zalo.", "error");
      return;
    }
    if (
      !window.confirm(
        `Bạn có muốn gửi tin nhắn Zalo đôn đốc cho tất cả ${overdueDocs.length} văn bản đang quá hạn không?`
      )
    ) {
      return;
    }

    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "⏳ Đang gửi đôn đốc...";
    let sentDocs = 0;

    try {
      for (const doc of overdueDocs) {
        const msg = buildMessageFromTemplate(doc, "overdue");
        const res = await window.appApi.sendZaloMessage({
          docId: doc.id,
          recipients: doc.assignees,
          message: msg,
          urgency: "urgent",
          attachmentPaths: (doc.attachments || []).map((a) => a.path),
          templateType: "overdue",
        });
        if (res.updatedDoc) {
          const idx = state.documents.findIndex((d) => d.id === doc.id);
          if (idx >= 0) state.documents[idx] = res.updatedDoc;
        }
        if (res.success) sentDocs++;
      }
      renderTabsAndDocuments();
      showToast(
        `Đã gửi tin nhắn đôn đốc cho ${sentDocs}/${overdueDocs.length} văn bản quá hạn!`,
        sentDocs > 0 ? "success" : "error"
      );
    } catch (err) {
      showToast(err.message || "Lỗi khi gửi đôn đốc hàng loạt", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "💬 Gửi Zalo đôn đốc tất cả quá hạn";
    }
  });

  // Zalo Auth Modal Events
  const switchZaloAuthTab = async (tab) => {
    document.querySelectorAll(".auth-tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.authTab === tab);
    });
    document.getElementById("authTabQR")?.classList.toggle("hidden", tab !== "qr");
    document.getElementById("authTabCookie")?.classList.toggle("hidden", tab !== "cookie");
    if (tab === "cookie") {
      await populateSavedZaloCredentialsInForm();
    }
  };

  document.querySelectorAll(".auth-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchZaloAuthTab(btn.dataset.authTab);
    });
  });

  document
    .getElementById("btnReconnectSavedZalo")
    ?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "⏳ Đang kết nối...";
      try {
        const res = await window.appApi.autoLoginZaloSaved();
        if (res?.success) {
          showToast("Đã kết nối lại tài khoản Zalo từ thông tin đã lưu!", "success");
          updateZaloHeaderStatus();
        } else {
          showToast(
            res?.error ||
              "Phiên Zalo đã lưu hết hạn. Hãy quét lại mã QR hoặc cập nhật Cookie mới.",
            "error"
          );
        }
      } catch (err) {
        showToast(err.message || "Không thể kết nối lại phiên Zalo", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "⚡ Kết nối lại ngay";
      }
    });

  document
    .getElementById("btnViewSavedZaloCreds")
    ?.addEventListener("click", async () => {
      await switchZaloAuthTab("cookie");
    });

  document
    .getElementById("btnShowCurrentZaloCreds")
    ?.addEventListener("click", async () => {
      document.getElementById("zaloConnectedPanel")?.classList.add("hidden");
      document.getElementById("zaloLoginPanel")?.classList.remove("hidden");
      await switchZaloAuthTab("cookie");
    });

  const triggerQR = async () => {
    document.getElementById("qrStatusMessage").textContent =
      "⏳ Đang khởi tạo mã QR từ máy chủ Zalo...";
    await window.appApi.startQRLogin();
  };

  document.getElementById("btnGenerateQR").addEventListener("click", triggerQR);
  document.getElementById("btnRefreshQR").addEventListener("click", triggerQR);

  document.getElementById("cookieLoginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnSubmitCookieLogin");
    btn.disabled = true;
    btn.textContent = "⏳ Đang lưu & đăng nhập...";
    try {
      const res = await window.appApi.loginWithCredentials({
        imei: document.getElementById("credImeiInput").value,
        userAgent: document.getElementById("credUserAgentInput").value,
        cookie: document.getElementById("credCookieInput").value,
        saveOnly: false,
      });
      if (res.success) {
        showToast("Đã lưu thông tin & đăng nhập Zalo thành công!", "success");
        updateZaloHeaderStatus();
      } else {
        showToast(res.error || "Đăng nhập thất bại", "error");
      }
    } catch (err) {
      showToast(err.message || "Lỗi đăng nhập bằng Cookie", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "🔐 Lưu & Đăng Nhập Zalo Ngay";
    }
  });

  document.getElementById("btnSaveCookieOnly")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await window.appApi.loginWithCredentials({
        imei: document.getElementById("credImeiInput").value,
        userAgent: document.getElementById("credUserAgentInput").value,
        cookie: document.getElementById("credCookieInput").value,
        saveOnly: true,
      });
      if (res.success) {
        showToast("💾 Đã lưu thông tin đăng nhập Zalo (IMEI & Cookie) vào máy!", "success");
        updateZaloHeaderStatus();
      } else {
        showToast(res.error || "Không thể lưu thông tin Zalo", "error");
      }
    } catch (err) {
      showToast(err.message || "Lỗi lưu thông tin Zalo", "error");
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("btnSyncContactsFromAuth").addEventListener("click", async () => {
    try {
      const res = await window.appApi.syncContacts();
      showToast(`Đã đồng bộ ${res.contacts.length} bạn bè Zalo!`, "success");
    } catch (err) {
      showToast(err.message || "Lỗi đồng bộ danh bạ", "error");
    }
  });

  document.getElementById("btnLogoutZalo").addEventListener("click", async () => {
    if (!window.confirm("Bạn muốn đăng xuất tài khoản Zalo hiện tại?")) return;
    await window.appApi.logoutZalo();
    showToast("Đã đăng xuất tài khoản Zalo.", "info");
  });

  // Contacts Modal Events
  document.getElementById("contactsModalSearch").addEventListener("input", () => {
    renderContactsModalList();
  });

  document.getElementById("btnModalSyncContacts").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await window.appApi.syncContacts();
      showToast(`Đã đồng bộ ${res.contacts.length} bạn bè từ Zalo!`, "success");
    } catch (err) {
      showToast(err.message || "Lỗi đồng bộ danh bạ", "error");
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("btnModalFindByPhone").addEventListener("click", async () => {
    const phoneEl = document.getElementById("contactsModalPhoneInput");
    const phone = phoneEl.value.trim();
    if (!phone) return;
    try {
      const res = await window.appApi.findContactByPhone(phone);
      phoneEl.value = "";
      showToast(`Đã thêm từ Zalo: ${res.contact.displayName}`, "success");
    } catch (err) {
      showToast(err.message || "Không tìm thấy SĐT trên Zalo", "error");
    }
  });

  // ==================== GOOGLE SHEET & APPS SCRIPT EVENTS ====================
  const runSyncAllToGoogleSheet = async (triggerBtn = null) => {
    if (!state.geminiSettings?.googleSheetWebhookUrl) {
      showToast(
        "Vui lòng nhập URL Web App Google Apps Script trong Cài đặt trước khi đồng bộ.",
        "info"
      );
      openGeminiSettingsModal("gsheet");
      setTimeout(() => {
        document
          .getElementById("googleSheetSettingsSection")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
      return;
    }
    const prevText = triggerBtn ? triggerBtn.textContent : "";
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = "⏳ Đang đồng bộ...";
    }
    try {
      const res = await window.appApi.syncAllDocsToGoogleSheet();
      if (Array.isArray(res.docs)) {
        state.documents = res.docs;
        renderTabsAndDocuments();
      }
      showToast(
        `☁️ Đã đồng bộ ${res.totalProcessed || 0} công việc lên Google Sheet (Thêm mới: ${
          res.inserted || 0
        }, Cập nhật: ${res.updated || 0})!`,
        "success"
      );
    } catch (err) {
      showToast(err.message || "Lỗi đồng bộ lên Google Sheet", "error");
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.textContent = prevText;
      }
    }
  };

  document
    .getElementById("btnSyncAllToGoogleSheet")
    ?.addEventListener("click", (e) => runSyncAllToGoogleSheet(e.currentTarget));

  document
    .getElementById("btnSyncAllFromSettings")
    ?.addEventListener("click", async (e) => {
      const url = (
        document.getElementById("googleSheetWebhookUrlInput")?.value || ""
      ).trim();
      const secret =
        document.getElementById("googleSheetSecretInput")?.value || "";
      const specialistName = (
        document.getElementById("specialistNameInput")?.value || ""
      ).trim();
      const defaultDepartment =
        document.getElementById("defaultDepartmentSelect")?.value || "";
      const autoSyncGoogleSheet = Boolean(
        document.getElementById("chkAutoSyncGoogleSheet")?.checked
      );
      if (url) {
        state.geminiSettings = await window.appApi.saveGeminiSettings({
          specialistName,
          defaultDepartment,
          googleSheetWebhookUrl: url,
          googleSheetSecret: secret,
          autoSyncGoogleSheet,
        });
      }
      await runSyncAllToGoogleSheet(e.currentTarget);
    });

  const openDashboardHandler = async () => {
    const inputUrl = (
      document.getElementById("googleSheetWebhookUrlInput")?.value || ""
    ).trim();
    const targetUrl = inputUrl || state.geminiSettings?.googleSheetWebhookUrl || "";
    if (!targetUrl) {
      showToast(
        "Chưa có URL Web App Google Apps Script. Hãy cài đặt và dán URL vào mục 4 trong Cài đặt.",
        "info"
      );
      openGeminiSettingsModal("gsheet");
      setTimeout(() => {
        document
          .getElementById("googleSheetSettingsSection")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
      return;
    }
    if (inputUrl && inputUrl !== state.geminiSettings?.googleSheetWebhookUrl) {
      state.geminiSettings = await window.appApi.saveGeminiSettings({
        googleSheetWebhookUrl: inputUrl,
      });
    }
    closeModal("geminiSettingsModal");
    setViewMode("dashboard");
  };

  document
    .getElementById("btnInstallNd30AddIn")
    ?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "⏳ Đang cài Add-in...";
      try {
        await window.appApi.installNd30AddIn();
        showToast(
          "Đã cài đặt Add-in Nghị định 30/2020 vào Microsoft Word! Mở lại Word để thấy tab 'NGHỊ ĐỊNH 30/2020'.",
          "success"
        );
      } catch (err) {
        showToast(err.message || "Không thể cài Add-in Word", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

  document
    .getElementById("btnImportNd30FromAddIn")
    ?.addEventListener("click", async () => {
      try {
        const res = await window.appApi.importNd30AddInSettings();
        if (res?.settings) {
          populateNd30SettingsInputs(res.settings);
          showToast(
            res.found
              ? "Đã nạp cấu hình chuẩn NĐ 30/2020 từ Word Add-in!"
              : "Không tìm thấy settings.xml của Add-in, đã nạp giá trị mặc định.",
            res.found ? "success" : "info"
          );
        }
      } catch (err) {
        showToast(err.message || "Không nạp được cấu hình Add-in", "error");
      }
    });

  document
    .getElementById("btnOpenAppsScriptDashboard")
    ?.addEventListener("click", openDashboardHandler);
  document
    .getElementById("btnOpenDashboardFromSettings")
    ?.addEventListener("click", openDashboardHandler);

  // ==================== IN-APP DASHBOARD EVENTS ====================
  document.getElementById("btnDashRefresh")?.addEventListener("click", () => {
    loadInAppDashboard();
  });

  document.getElementById("btnDashGoToSettings")?.addEventListener("click", () => {
    openGeminiSettingsModal("gsheet");
  });

  document
    .getElementById("btnDashOpenBrowser")
    ?.addEventListener("click", async () => {
      try {
        await window.appApi.openAppsScriptDashboard(
          state.geminiSettings?.googleSheetWebhookUrl || ""
        );
      } catch (err) {
        showToast(err.message || "Không thể mở trình duyệt", "error");
      }
    });

  document
    .getElementById("btnDashOpenSheetFile")
    ?.addEventListener("click", async () => {
      const sheetUrl = state.dashboard?.data?.spreadsheetUrl;
      if (sheetUrl) {
        await window.appApi.openAppsScriptDashboard(sheetUrl);
      }
    });

  document.getElementById("btnDashExportCsv")?.addEventListener("click", () => {
    exportInAppDashboardCsv();
  });

  document.getElementById("dashDeptSelect")?.addEventListener("change", (e) => {
    state.dashboard.department = e.target.value;
    loadInAppDashboard();
  });

  document
    .getElementById("dashSpecialistSelect")
    ?.addEventListener("change", (e) => {
      state.dashboard.specialist = e.target.value;
      loadInAppDashboard();
    });

  document
    .getElementById("dashPrioritySelect")
    ?.addEventListener("change", (e) => {
      state.dashboard.priority = e.target.value;
      loadInAppDashboard();
    });

  let dashSearchTimer = null;
  document.getElementById("dashSearchInput")?.addEventListener("input", (e) => {
    state.dashboard.search = e.target.value;
    clearTimeout(dashSearchTimer);
    dashSearchTimer = setTimeout(loadInAppDashboard, 250);
  });

  document.querySelectorAll("[data-dash-kpi]").forEach((card) => {
    card.addEventListener("click", () => {
      state.dashboard.status = card.dataset.dashKpi || "all";
      loadInAppDashboard();
    });
  });

  document.querySelectorAll("[data-dash-status]").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.dashboard.status = tab.dataset.dashStatus || "all";
      loadInAppDashboard();
    });
  });

  document
    .getElementById("btnTestGoogleSheet")
    ?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const statusBox = document.getElementById("googleSheetTestStatus");
      const webhookUrl = (
        document.getElementById("googleSheetWebhookUrlInput")?.value || ""
      ).trim();
      const secret =
        document.getElementById("googleSheetSecretInput")?.value || "";
      btn.disabled = true;
      btn.textContent = "⏳ Đang kiểm tra...";
      try {
        const res = await window.appApi.testGoogleSheetConnection({
          webhookUrl,
          secret,
        });
        if (statusBox) {
          statusBox.className = "ai-analysis-status success mt-12";
          statusBox.innerHTML = `✅ Kết nối thành công với Google Sheet: <b>${escapeHtml(
            res.spreadsheetName || "Google Sheet"
          )}</b> (Hiện có ${res.totalRows || 0} dòng công việc).`;
        }
        showToast("Kết nối Google Apps Script thành công!", "success");
      } catch (err) {
        if (statusBox) {
          statusBox.className = "ai-analysis-status error mt-12";
          statusBox.textContent = `❌ ${err.message || "Kết nối thất bại"}`;
        }
        showToast(err.message || "Lỗi kết nối Google Sheet", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "🧪 Kiểm tra kết nối";
      }
    });

  let cachedGasTemplates = null;
  let activeGasTab = "code";
  const renderGasTabContent = () => {
    if (!cachedGasTemplates) return;
    const viewer = document.getElementById("appsScriptCodeViewer");
    const hint = document.getElementById("gasTabHintText");
    document.querySelectorAll("[data-gas-tab]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.gasTab === activeGasTab);
    });
    if (activeGasTab === "code") {
      if (viewer) viewer.value = cachedGasTemplates.codeGs || "";
      if (hint) {
        hint.innerHTML =
          "Mở tệp <b>Code.gs</b> trong Apps Script và dán toàn bộ mã sau:";
      }
    } else if (activeGasTab === "dashboard") {
      if (viewer) viewer.value = cachedGasTemplates.dashboardHtml || "";
      if (hint) {
        hint.innerHTML =
          "Tạo tệp HTML tên chính xác là <b>Dashboard</b> (<code>Dashboard.html</code>) và dán mã sau:";
      }
    } else {
      if (viewer) viewer.value = cachedGasTemplates.guideMd || "";
      if (hint) {
        hint.innerHTML =
          "Hướng dẫn cài đặt Google Sheet tổng hợp & Dashboard từng bước:";
      }
    }
  };

  document
    .getElementById("btnOpenAppsScriptModal")
    ?.addEventListener("click", async () => {
      try {
        cachedGasTemplates = await window.appApi.getAppsScriptTemplates();
        activeGasTab = "code";
        renderGasTabContent();
        document.getElementById("appsScriptModal")?.classList.remove("hidden");
      } catch (err) {
        showToast(err.message || "Không tải được mã Apps Script", "error");
      }
    });

  document.querySelectorAll("[data-gas-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeGasTab = btn.dataset.gasTab || "code";
      renderGasTabContent();
    });
  });

  document
    .getElementById("btnCopyGasContent")
    ?.addEventListener("click", async () => {
      const viewer = document.getElementById("appsScriptCodeViewer");
      if (!viewer || !viewer.value) return;
      try {
        await navigator.clipboard.writeText(viewer.value);
        showToast("Đã sao chép nội dung vào khay nhớ tạm!", "success");
      } catch (_) {
        viewer.select();
        document.execCommand("copy");
        showToast("Đã sao chép nội dung!", "success");
      }
    });
});

window.generateNd30DocForTask = async function (docId) {
  try {
    showToast("📜 Đang tạo Công văn Giao việc chuẩn Nghị định 30/2020...", "info");
    const res = await window.appApi.generateNd30AssignmentDoc({
      docId,
      useAi: true,
      openAfter: true,
    });
    if (res?.doc) {
      const idx = state.documents.findIndex((d) => d.id === docId);
      if (idx >= 0) state.documents[idx] = res.doc;
      renderTabsAndDocuments();
    }
    state.geminiSettings = await window.appApi.getGeminiSettings();
    showToast(
      `✅ Đã tạo & mở Công văn: ${res?.attachment?.name || "CongVan_GiaoViec.docx"}`,
      "success"
    );
  } catch (err) {
    showToast(err.message || "Lỗi tạo Công văn Giao việc NĐ 30/2020", "error");
  }
};

async function syncSingleDocToSheet(docId) {
  if (!state.geminiSettings?.googleSheetWebhookUrl) {
    showToast("Chưa cấu hình URL Google Apps Script trong Cài đặt.", "info");
    return;
  }
  try {
    showToast("Đang đồng bộ công việc lên Google Sheet...", "info");
    const res = await window.appApi.syncDocToGoogleSheet(docId);
    if (res?.doc) {
      const idx = state.documents.findIndex((d) => d.id === docId);
      if (idx >= 0) state.documents[idx] = res.doc;
      renderTabsAndDocuments();
    }
    showToast("☁️ Đã đồng bộ công việc lên Google Sheet!", "success");
  } catch (err) {
    showToast(err.message || "Lỗi đồng bộ Google Sheet", "error");
  }
}

// ==================== IN-APP GOOGLE SHEET DASHBOARD ====================
function selectDashDepartment(dept) {
  state.dashboard.department = dept;
  loadInAppDashboard();
}

async function loadInAppDashboard() {
  const notCfgBanner = document.getElementById("dashNotConfiguredBanner");
  const mainContent = document.getElementById("dashMainContent");
  const statusEl = document.getElementById("inAppDashStatusText");
  const refreshBtn = document.getElementById("btnDashRefresh");

  if (!state.geminiSettings?.googleSheetWebhookUrl) {
    notCfgBanner?.classList.remove("hidden");
    mainContent?.classList.add("hidden");
    if (statusEl) statusEl.textContent = "Chưa cấu hình URL Apps Script";
    return;
  }

  notCfgBanner?.classList.add("hidden");
  mainContent?.classList.remove("hidden");
  if (statusEl) statusEl.textContent = "⏳ Đang tải dữ liệu từ Google Sheet...";
  if (refreshBtn) refreshBtn.disabled = true;

  try {
    const data = await window.appApi.fetchGoogleSheetDashboardData({
      department: state.dashboard.department,
      status: state.dashboard.status,
      priority: state.dashboard.priority,
      specialist: state.dashboard.specialist,
      search: state.dashboard.search,
    });
    state.dashboard.data = data;

    if (statusEl) {
      statusEl.textContent = `● Cập nhật lúc ${formatDateTimeVN(
        data.generatedAt
      )}`;
    }
    const sheetBtn = document.getElementById("btnDashOpenSheetFile");
    if (sheetBtn) {
      sheetBtn.classList.toggle("hidden", !data.spreadsheetUrl);
    }

    renderInAppDashboard(data);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `❌ ${err.message || "Lỗi tải Dashboard"}`;
    }
    showToast(err.message || "Không tải được dữ liệu Dashboard", "error");
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function renderInAppDashboard(data) {
  const deptSelect = document.getElementById("dashDeptSelect");
  const pillsEl = document.getElementById("dashDeptPills");
  const stats = data.departmentStats || [];
  const global = data.globalSummary || { total: 0, overdue: 0 };
  const scoped = data.scopedSummary || {
    total: 0,
    processing: 0,
    overdue: 0,
    completed: 0,
    completionRate: 0,
  };

  if (deptSelect) {
    deptSelect.innerHTML =
      `<option value="">🏢 Tất cả các phòng ban (${global.total})</option>` +
      stats
        .map(
          (d) =>
            `<option value="${escapeHtml(d.department)}">${escapeHtml(
              d.department
            )} (${d.total})</option>`
        )
        .join("");
    deptSelect.value = state.dashboard.department;
  }

  if (pillsEl) {
    const allBtn = `
      <button type="button" class="dash-dept-pill ${
        !state.dashboard.department ? "active" : ""
      }" onclick="selectDashDepartment('')">
        <span>Tất cả phòng ban</span>
        <span class="dash-pill-cnt">${global.total}</span>
        ${
          global.overdue > 0
            ? `<span class="dash-pill-over">${global.overdue} trễ</span>`
            : ""
        }
      </button>
    `;
    const deptBtns = stats
      .map((d) => {
        const active = state.dashboard.department === d.department;
        return `
          <button type="button" class="dash-dept-pill ${
            active ? "active" : ""
          }" onclick="selectDashDepartment('${escapeHtml(d.department).replace(
          /'/g,
          "\\'"
        )}')">
            <span>${escapeHtml(d.department)}</span>
            <span class="dash-pill-cnt">${d.total}</span>
            ${
              d.overdue > 0
                ? `<span class="dash-pill-over">${d.overdue} trễ</span>`
                : ""
            }
          </button>
        `;
      })
      .join("");
    pillsEl.innerHTML = allBtn + deptBtns;
  }

  document.getElementById("inAppDashScopeText").textContent = `Phạm vi: ${
    state.dashboard.department || "Tất cả phòng ban"
  }`;
  document.getElementById("dashKpiTotal").textContent = scoped.total;
  document.getElementById("dashKpiProcessing").textContent = scoped.processing;
  document.getElementById("dashKpiOverdue").textContent = scoped.overdue;
  document.getElementById("dashKpiCompleted").textContent = scoped.completed;
  document.getElementById(
    "dashKpiRate"
  ).textContent = `Tỷ lệ hoàn thành: ${scoped.completionRate}%`;
  document.getElementById("dashKpiSub").textContent =
    state.dashboard.department || "Tất cả phòng ban";

  document.getElementById("dashTabAll").textContent = scoped.total;
  document.getElementById("dashTabProc").textContent = scoped.processing;
  document.getElementById("dashTabOver").textContent = scoped.overdue;
  document.getElementById("dashTabDone").textContent = scoped.completed;

  document.querySelectorAll("[data-dash-kpi]").forEach((el) => {
    el.classList.toggle("is-selected", el.dataset.dashKpi === state.dashboard.status);
  });
  document.querySelectorAll("[data-dash-status]").forEach((el) => {
    el.classList.toggle(
      "active",
      el.dataset.dashStatus === state.dashboard.status
    );
  });

  // Render Department Stacked Bars & Summary Table
  const barsEl = document.getElementById("dashDeptBars");
  const maxTotal = Math.max(1, ...stats.map((d) => d.total));
  if (barsEl) {
    barsEl.innerHTML = stats
      .map((d) => {
        const wDone = d.total > 0 ? (d.completed / maxTotal) * 100 : 0;
        const wProc = d.total > 0 ? (d.processing / maxTotal) * 100 : 0;
        const wOver = d.total > 0 ? (d.overdue / maxTotal) * 100 : 0;
        const selected = state.dashboard.department === d.department;
        return `
          <div class="dash-bar-row ${
            selected ? "selected" : ""
          }" onclick="selectDashDepartment('${escapeHtml(d.department).replace(
          /'/g,
          "\\'"
        )}')">
            <div class="dash-bar-meta">
              <b>${escapeHtml(d.department)}</b>
              <span class="dash-bar-nums">
                Tổng: <b>${d.total}</b> •
                <span style="color:#15803d;">Xong: ${d.completed}</span> •
                <span style="color:#0284c7;">Đang làm: ${d.processing}</span> •
                <span style="color:#dc2626;">Quá hạn: ${d.overdue}</span>
              </span>
            </div>
            <div class="dash-bar-track">
              <div class="seg-done" style="width:${wDone}%"></div>
              <div class="seg-proc" style="width:${wProc}%"></div>
              <div class="seg-over" style="width:${wOver}%"></div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  const deptTbody = document.getElementById("dashDeptTableBody");
  if (deptTbody) {
    deptTbody.innerHTML = stats
      .map(
        (d) => `
        <tr style="cursor:pointer;" onclick="selectDashDepartment('${escapeHtml(
          d.department
        ).replace(/'/g, "\\'")}')">
          <td><b>${escapeHtml(d.department)}</b></td>
          <td><b>${d.total}</b></td>
          <td style="color:#0284c7;font-weight:700;">${d.processing}</td>
          <td style="color:#dc2626;font-weight:700;">${d.overdue}</td>
          <td style="color:#15803d;font-weight:700;">${d.completed}</td>
          <td>${d.completionRate}%</td>
        </tr>
      `
      )
      .join("");
  }

  // Specialist dropdown
  const specSelect = document.getElementById("dashSpecialistSelect");
  if (specSelect) {
    const prev = state.dashboard.specialist;
    const specs = data.specialists || [];
    specSelect.innerHTML =
      `<option value="">Tất cả chuyên viên</option>` +
      specs
        .map(
          (sp) =>
            `<option value="${escapeHtml(sp)}">${escapeHtml(sp)}</option>`
        )
        .join("");
    specSelect.value = prev;
  }

  // Render tasks table
  const tbody = document.getElementById("dashTasksTableBody");
  const items = data.items || [];
  if (tbody) {
    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted);">
            Không có công việc nào phù hợp bộ lọc hiện tại.
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = items
        .map((it) => {
          const who = [
            it.specialistName ? `CV: ${it.specialistName}` : "",
            it.assigneesText ? `Thực hiện: ${it.assigneesText}` : "",
          ]
            .filter(Boolean)
            .join(" • ");
          const statusCls =
            it.effectiveStatus === "completed"
              ? "completed"
              : it.effectiveStatus === "overdue"
              ? "overdue"
              : "processing";
          const prioCls =
            it.priority === "urgent"
              ? "priority-urgent"
              : it.priority === "important"
              ? "priority-important"
              : "priority-normal";
          return `
            <tr>
              <td style="font-weight:700;white-space:nowrap;">${escapeHtml(
                it.docNumber || "Chưa số"
              )}</td>
              <td><span class="dept-badge">${escapeHtml(
                it.department
              )}</span></td>
              <td>
                <div style="font-weight:700;">${escapeHtml(it.title)}</div>
                ${
                  it.completionNote
                    ? `<div style="font-size:12px;color:#15803d;margin-top:2px;">✓ ${escapeHtml(
                        it.completionNote
                      )}</div>`
                    : ""
                }
              </td>
              <td style="font-size:12.5px;">${escapeHtml(who || "—")}</td>
              <td style="white-space:nowrap;font-size:12.5px;">${escapeHtml(
                formatDateTimeVN(it.dueDate)
              )}</td>
              <td><span class="priority-badge ${prioCls}">${escapeHtml(
            it.priorityLabel || "Thường"
          )}</span></td>
              <td><span class="dash-status-pill ${statusCls}">${escapeHtml(
            it.effectiveStatusLabel
          )}</span></td>
            </tr>
          `;
        })
        .join("");
    }
  }
}

function exportInAppDashboardCsv() {
  const items = state.dashboard?.data?.items || [];
  if (items.length === 0) {
    showToast("Không có dữ liệu để xuất CSV.", "info");
    return;
  }
  const headers = [
    "Số/Ký hiệu",
    "Phòng ban",
    "Trích yếu",
    "Chuyên viên",
    "Người thực hiện",
    "Cơ quan ban hành",
    "Ngày nhận",
    "Hạn xử lý",
    "Độ khẩn",
    "Trạng thái",
    "Kết quả phúc đáp",
  ];
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    headers.map(cell).join(","),
    ...items.map((it) =>
      [
        it.docNumber,
        it.department,
        it.title,
        it.specialistName,
        it.assigneesText,
        it.issuer,
        it.receivedDate,
        it.dueDate,
        it.priorityLabel,
        it.effectiveStatusLabel,
        it.completionNote,
      ]
        .map(cell)
        .join(",")
    ),
  ];
  const blob = new Blob(["\uFEFF" + rows.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Dashboard_CongViec_${(
    state.dashboard.department || "TatCaPhongBan"
  ).replace(/\s+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== CHATBOX AI CHAT MODULE ====================
function renderInlineMarkdown(escapedText) {
  let s = escapedText;
  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  // Markdown links [label](https://...)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;text-decoration:underline;">${label}</a>`;
  });
  // Bold & italic
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return s;
}

function renderChatMarkdown(rawText) {
  const src = String(rawText || "");
  if (!src.trim()) return "";

  const codeBlocks = [];
  const withPlaceholders = src.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({
      lang: lang || "text",
      code: code.replace(/\r?\n$/, ""),
    });
    return `\n@@CODEBLOCK_${idx}@@\n`;
  });

  const lines = withPlaceholders.split(/\r?\n/);
  const htmlParts = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    const cbMatch = trimmed.match(/^@@CODEBLOCK_(\d+)@@$/);
    if (cbMatch) {
      const cb = codeBlocks[Number(cbMatch[1])];
      const safeCode = escapeHtml(cb.code);
      const safeLang = escapeHtml(cb.lang);
      htmlParts.push(
        `<div class="chatbox-code-block"><div class="chatbox-code-header"><span>${safeLang}</span><button type="button" class="chatbox-code-copy" onclick="copyChatCodeBlock(this)">Sao chép</button></div><pre><code>${safeCode}</code></pre></div>`
      );
      i++;
      continue;
    }

    // Headings
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      htmlParts.push(`<h${level}>${renderInlineMarkdown(escapeHtml(hMatch[2]))}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^([-*_]){3,}$/.test(trimmed)) {
      htmlParts.push("<hr style='border:none;border-top:1px solid #e2e8f0;margin:10px 0;' />");
      i++;
      continue;
    }

    // Markdown Table
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/.test(lines[i + 1])
    ) {
      const parseRow = (r) =>
        r
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => renderInlineMarkdown(escapeHtml(c.trim())));
      const headers = parseRow(trimmed);
      i += 2;
      const bodyRows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        bodyRows.push(parseRow(lines[i]));
        i++;
      }
      htmlParts.push(
        `<table><thead><tr>${headers
          .map((h) => `<th>${h}</th>`)
          .join("")}</tr></thead><tbody>${bodyRows
          .map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const qLines = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        qLines.push(renderInlineMarkdown(escapeHtml(lines[i].trim().replace(/^>\s?/, ""))));
        i++;
      }
      htmlParts.push(`<blockquote>${qLines.join("<br />")}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*•]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*•]\s+/, "");
        items.push(`<li>${renderInlineMarkdown(escapeHtml(itemText))}</li>`);
        i++;
      }
      htmlParts.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, "");
        items.push(`<li>${renderInlineMarkdown(escapeHtml(itemText))}</li>`);
        i++;
      }
      htmlParts.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Paragraph
    const pLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^@@CODEBLOCK_\d+@@$/.test(lines[i].trim()) &&
      !/^(#{1,4})\s+/.test(lines[i].trim()) &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith(">")
    ) {
      pLines.push(renderInlineMarkdown(escapeHtml(lines[i])));
      i++;
    }
    htmlParts.push(`<p>${pLines.join("<br />")}</p>`);
  }

  return htmlParts.join("");
}

window.copyChatCodeBlock = function (btn) {
  const pre = btn?.closest(".chatbox-code-block")?.querySelector("pre");
  if (!pre) return;
  navigator.clipboard?.writeText(pre.textContent || "");
  const old = btn.textContent;
  btn.textContent = "Đã chép";
  setTimeout(() => {
    btn.textContent = old;
  }, 1400);
};

function getActiveAiChatSession() {
  return (
    state.aiChat.sessions.find((s) => s.id === state.aiChat.activeSessionId) ||
    state.aiChat.sessions[0] ||
    null
  );
}

function getProviderLabel(provider) {
  const map = {
    gemini: "Gemini",
    openai: "ChatGPT / OpenAI",
    claude: "Claude",
    deepseek: "DeepSeek",
    gateway: "AI Gateway (AI STAR)",
    ollama: "Ollama",
  };
  return map[provider] || provider || "AI";
}

function getCombinedModelsForProvider(provider, currentModel = "") {
  const settings = state.aiChat.settings || {};
  const loaded = Array.isArray(settings.loadedModels?.[provider])
    ? settings.loadedModels[provider]
    : [];
  const catalog = settings.providersCatalog?.[provider]?.models || [];
  const defaultM = settings.providersCatalog?.[provider]?.defaultModel || "";
  const combined = [...loaded, ...catalog, defaultM, currentModel]
    .map((m) => String(m || "").trim())
    .filter(Boolean);
  return Array.from(new Set(combined));
}

const SYSTEM_AI_UI_META = {
  gemini: {
    keyLabel: "Gemini API Key",
    keyPlaceholder: "Nhập mã API Key từ Google AI Studio (AIzaSy...)",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    hideBaseUrl: true,
    defaultModel: "gemini-2.5-flash",
    presets: [
      { id: "gemini-2.5-flash", label: "⚡ gemini-2.5-flash (Khuyên dùng - Nhanh & Đọc PDF/OCR rất chuẩn)" },
      { id: "gemini-2.5-pro", label: "🧠 gemini-2.5-pro (Chuyên sâu cho văn bản dài & phức tạp)" },
      { id: "gemini-2.0-flash", label: "🚀 gemini-2.0-flash (Tốc độ phản hồi cực nhanh)" },
    ],
    hint: "Lấy mã tại <code>https://aistudio.google.com/apikey</code>. Hỗ trợ đọc PDF scan, ảnh, Word, trang web iOffice & đồng bộ Chatbox AI.",
  },
  openai: {
    keyLabel: "OpenAI / ChatGPT API Key",
    keyPlaceholder: "sk-... (hoặc key của API tương thích OpenAI)",
    defaultBaseUrl: "https://api.openai.com/v1",
    hideBaseUrl: false,
    defaultModel: "gpt-4o-mini",
    presets: [
      { id: "gpt-4o-mini", label: "⚡ gpt-4o-mini (Nhanh, tiết kiệm)" },
      { id: "gpt-4o", label: "🧠 gpt-4o (Mạnh mẽ, đọc ảnh & trang web tốt)" },
      { id: "gpt-4.1-mini", label: "🚀 gpt-4.1-mini" },
      { id: "gpt-4.1", label: "🌟 gpt-4.1" },
    ],
    hint: "Giữ Base URL mặc định <code>https://api.openai.com/v1</code> (hoặc đổi nếu dùng proxy tương thích). Lưu ý: đọc tệp Word/Ảnh/Web trực tiếp; riêng PDF scan nên dùng Gemini hoặc Claude.",
  },
  claude: {
    keyLabel: "Anthropic Claude API Key",
    keyPlaceholder: "sk-ant-...",
    defaultBaseUrl: "https://api.anthropic.com",
    hideBaseUrl: false,
    defaultModel: "claude-sonnet-4-20250514",
    presets: [
      { id: "claude-sonnet-4-20250514", label: "🧠 claude-sonnet-4-20250514 (Khuyên dùng)" },
      { id: "claude-3-7-sonnet-latest", label: "✨ claude-3-7-sonnet-latest" },
      { id: "claude-3-5-haiku-latest", label: "⚡ claude-3-5-haiku-latest (Nhanh)" },
    ],
    hint: "Giữ Base URL mặc định <code>https://api.anthropic.com</code> (không thêm /v1 ở cuối). Hỗ trợ đọc PDF, ảnh, Word và trang web iOffice.",
  },
  deepseek: {
    keyLabel: "DeepSeek API Key",
    keyPlaceholder: "sk-...",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    hideBaseUrl: false,
    defaultModel: "deepseek-chat",
    presets: [
      { id: "deepseek-chat", label: "🐋 deepseek-chat (Khuyên dùng - Nhanh & chuẩn JSON)" },
      { id: "deepseek-reasoner", label: "🧠 deepseek-reasoner (Suy luận sâu)" },
    ],
    hint: "Giữ Base URL mặc định <code>https://api.deepseek.com/v1</code> và dán API Key vào. Lưu ý: DeepSeek hỗ trợ đọc Word (.docx), Text, nội dung Web & soạn Công văn NĐ 30; không đọc trực tiếp file PDF scan/ảnh.",
  },
  gateway: {
    keyLabel: "API Key (AI Gateway / AI STAR)",
    keyPlaceholder: "sk-ant-api03-... hoặc sk-...",
    defaultBaseUrl: "https://ai.starimg.ru/v1",
    hideBaseUrl: false,
    defaultModel: "gemini-3.8-flash",
    presets: [
      { id: "gemini-3.8-flash", label: "⚡ gemini-3.8-flash (Google Gemini trên AI STAR)" },
      { id: "gemini-3.1-pro", label: "🧠 gemini-3.1-pro (Google Gemini Pro trên AI STAR)" },
      { id: "claude-sonnet-5", label: "✨ claude-sonnet-5 (Anthropic trên AI STAR)" },
      { id: "claude-opus-5", label: "🌟 claude-opus-5 (Anthropic Opus trên AI STAR)" },
      { id: "gpt-5.6-sol", label: "🤖 gpt-5.6-sol (OpenAI trên AI STAR)" },
      { id: "deepseek-v4-pro-0813", label: "🐋 deepseek-v4-pro-0813 (DeepSeek trên AI STAR)" },
    ],
    hint: "Dán API Key và Base URL của gateway bên thứ 3 (mặc định <code>https://ai.starimg.ru/v1</code>). Hỗ trợ đọc PDF (kể cả bản scan/ký số), Ảnh, Word, trang Web iOffice & tự động đồng bộ Chatbox AI; bấm <b>🔄 Tải DS Model</b> để lấy danh sách model thực tế.",
  },
};

function getSelectedSystemAiModelValue(provider) {
  const sel = document.getElementById("geminiModelSelect");
  const custom = document.getElementById("systemAiCustomModelInput");
  const def = SYSTEM_AI_UI_META[provider]?.defaultModel || "gemini-2.5-flash";
  if (sel && sel.value === "__custom__") {
    return (custom?.value || "").trim() || def;
  }
  return (sel?.value || "").trim() || def;
}

function syncCurrentSystemAiDraftFromInputs() {
  if (!state.systemAiDraftProviders) return;
  const prov = state.systemAiActiveDraftProvider || "gemini";
  const meta = SYSTEM_AI_UI_META[prov] || SYSTEM_AI_UI_META.gemini;
  state.systemAiDraftProviders[prov] = {
    baseUrl:
      (document.getElementById("systemAiBaseUrlInput")?.value || "").trim() ||
      meta.defaultBaseUrl,
    apiKey: (document.getElementById("geminiApiKeyInput")?.value || "").trim(),
    model: getSelectedSystemAiModelValue(prov),
  };
}

function renderSystemAiProviderFields(provider) {
  const prov = SYSTEM_AI_UI_META[provider] ? provider : "gemini";
  const meta = SYSTEM_AI_UI_META[prov];
  const draft = state.systemAiDraftProviders?.[prov] || {};

  const baseGroup = document.getElementById("systemAiBaseUrlGroup");
  const baseInput = document.getElementById("systemAiBaseUrlInput");
  const keyLabel = document.getElementById("systemAiKeyLabel");
  const keyInput = document.getElementById("geminiApiKeyInput");
  const hintEl = document.getElementById("systemAiHintText");

  if (baseGroup) baseGroup.classList.toggle("hidden", Boolean(meta.hideBaseUrl));
  if (baseInput) {
    baseInput.value = draft.baseUrl || meta.defaultBaseUrl;
    baseInput.placeholder = meta.defaultBaseUrl;
  }
  if (keyLabel) keyLabel.textContent = meta.keyLabel;
  if (keyInput) {
    keyInput.value = draft.apiKey || "";
    keyInput.placeholder = meta.keyPlaceholder;
  }
  if (hintEl) hintEl.innerHTML = meta.hint;

  const loaded = state.aiChat.settings?.loadedModels?.[prov] || [];
  populateMainSystemModelSelect(
    prov,
    draft.model || meta.defaultModel,
    loaded
  );
}

function populateMainSystemModelSelect(provider, selectedModel, loadedList = []) {
  const sel = document.getElementById("geminiModelSelect");
  const customEl = document.getElementById("systemAiCustomModelInput");
  if (!sel) return;
  const meta = SYSTEM_AI_UI_META[provider] || SYSTEM_AI_UI_META.gemini;
  const presets = meta.presets || [];
  const presetMap = new Map(presets.map((p) => [p.id, p.label]));
  const allIds = Array.from(
    new Set(
      [
        ...presets.map((p) => p.id),
        ...(Array.isArray(loadedList) ? loadedList : []),
        selectedModel,
      ].filter(Boolean)
    )
  );
  sel.innerHTML =
    allIds
      .map(
        (id) =>
          `<option value="${escapeHtml(id)}">${escapeHtml(
            presetMap.get(id) || id
          )}</option>`
      )
      .join("") + `<option value="__custom__">✏️ Nhập tên model khác...</option>`;

  const target = selectedModel || meta.defaultModel;
  if (target && allIds.includes(target)) {
    sel.value = target;
    customEl?.classList.add("hidden");
  } else if (target) {
    sel.value = "__custom__";
    if (customEl) {
      customEl.value = target;
      customEl.classList.remove("hidden");
    }
  }
}

function populateMainGeminiModelSelect(selectedModel = "gemini-2.5-flash", loadedList = []) {
  populateMainSystemModelSelect("gemini", selectedModel, loadedList);
}

function syncModelDatalistForProvider(provider, currentModel = "") {
  const list = getCombinedModelsForProvider(provider, currentModel);
  const dl = document.getElementById("aiChatModelDatalist");
  if (dl) {
    dl.innerHTML = list.map((m) => `<option value="${escapeHtml(m)}"></option>`).join("");
  }
  const sel = document.getElementById("aiChatModelSelect");
  if (sel) {
    sel.innerHTML =
      list
        .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
        .join("") + `<option value="__custom__">✏️ Nhập tên model khác...</option>`;
    if (currentModel && list.includes(currentModel)) {
      sel.value = currentModel;
    } else if (list.length > 0 && !currentModel) {
      sel.value = list[0];
    }
  }
}

function refreshAiChatContextDocSelect() {
  const select = document.getElementById("aiChatContextDocSelect");
  if (!select) return;
  const activeSession = getActiveAiChatSession();
  const currentVal = activeSession?.contextDocId || select.value || "";
  const sortedDocs = [...(state.documents || [])].sort((a, b) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || "")
  );

  select.innerHTML = `<option value="">-- Chọn văn bản trong app --</option>` + sortedDocs
    .map((d) => {
      const st = d.status === "completed" ? "[Đã XL]" : "[Đang XL]";
      const label = `${st} ${d.docNumber || "Chưa có số"} - ${(d.title || "").slice(0, 55)}`;
      return `<option value="${escapeHtml(d.id)}">${escapeHtml(label)}</option>`;
    })
    .join("");

  if (currentVal && sortedDocs.some((d) => d.id === currentVal)) {
    select.value = currentVal;
  }
}

function renderAiChatSidebar() {
  const listEl = document.getElementById("aiChatSessionList");
  if (!listEl) return;

  const q = String(state.aiChat.searchQuery || "").trim().toLowerCase();
  const sorted = [...(state.aiChat.sessions || [])].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });

  const filtered = q
    ? sorted.filter((s) => {
        if ((s.title || "").toLowerCase().includes(q)) return true;
        return (s.messages || []).some((m) =>
          (m.content || "").toLowerCase().includes(q)
        );
      })
    : sorted;

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-hint" style="padding:14px;">Không tìm thấy cuộc trò chuyện phù hợp.</div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((s) => {
      const isActive = s.id === state.aiChat.activeSessionId;
      const msgCount = Array.isArray(s.messages) ? s.messages.length : 0;
      const modelShort =
        s.model ||
        state.aiChat.settings?.[s.provider || "gemini"]?.model ||
        "gemini-2.5-flash";
      return `
        <div class="chatbox-session-item ${isActive ? "active" : ""}" data-session-id="${escapeHtml(
        s.id
      )}">
          <div class="chatbox-session-meta">
            <div class="chatbox-session-title">${s.pinned ? "📌 " : ""}${escapeHtml(
        s.title || "Cuộc trò chuyện mới"
      )}</div>
            <div class="chatbox-session-sub">${escapeHtml(
              getProviderLabel(s.provider)
            )} • ${escapeHtml(modelShort)} • ${msgCount} tin</div>
          </div>
          <div class="chatbox-session-actions">
            <button type="button" class="chatbox-session-action-btn" data-action="pin" data-id="${escapeHtml(
              s.id
            )}" title="${s.pinned ? "Bỏ ghim" : "Ghim lên đầu"}">📌</button>
            <button type="button" class="chatbox-session-action-btn" data-action="delete" data-id="${escapeHtml(
              s.id
            )}" title="Xóa cuộc trò chuyện">🗑️</button>
          </div>
        </div>
      `;
    })
    .join("");

  listEl.querySelectorAll(".chatbox-session-item").forEach((el) => {
    el.addEventListener("click", async (e) => {
      const actionBtn = e.target.closest("[data-action]");
      if (actionBtn) {
        e.stopPropagation();
        const act = actionBtn.dataset.action;
        const sid = actionBtn.dataset.id;
        if (act === "pin") {
          const target = state.aiChat.sessions.find((x) => x.id === sid);
          const res = await window.appApi.updateAiChatSession(sid, {
            pinned: !target?.pinned,
          });
          applyAiChatState(res.state);
        } else if (act === "delete") {
          if (!window.confirm("Xóa cuộc trò chuyện này?")) return;
          const nextState = await window.appApi.deleteAiChatSession(sid);
          applyAiChatState(nextState);
        }
        return;
      }

      const sid = el.dataset.sessionId;
      if (sid && sid !== state.aiChat.activeSessionId) {
        const nextState = await window.appApi.setActiveAiChatSession(sid);
        applyAiChatState(nextState);
      }
    });
  });
}

function renderAiChatHeaderAndContext() {
  const session = getActiveAiChatSession();
  if (!session) return;

  const titleEl = document.getElementById("aiChatTitleInput");
  const provEl = document.getElementById("aiChatProviderSelect");
  const modelSelEl = document.getElementById("aiChatModelSelect");
  const modelEl = document.getElementById("aiChatModelInput");
  const ctxModeEl = document.getElementById("aiChatContextModeSelect");
  const ctxDocEl = document.getElementById("aiChatContextDocSelect");
  const copilotEl = document.getElementById("aiChatCopilotSelect");
  const hintEl = document.getElementById("aiChatActiveProviderHint");

  if (titleEl && document.activeElement !== titleEl) {
    titleEl.value = session.title || "Cuộc trò chuyện mới";
  }

  const provider =
    session.provider || state.aiChat.settings?.defaultProvider || "gemini";
  const model =
    session.model ||
    state.aiChat.settings?.[provider]?.model ||
    state.aiChat.settings?.providersCatalog?.[provider]?.defaultModel ||
    "gemini-2.5-flash";

  if (provEl) provEl.value = provider;
  syncModelDatalistForProvider(provider, model);
  if (modelEl && document.activeElement !== modelEl) {
    modelEl.value = model;
  }
  if (modelSelEl && modelEl && document.activeElement !== modelEl) {
    modelSelEl.value = model;
    modelEl.classList.add("hidden");
  }

  if (ctxModeEl) ctxModeEl.value = session.contextMode || "active_docs";
  if (ctxDocEl) {
    ctxDocEl.classList.toggle("hidden", session.contextMode !== "single_doc");
    if (session.contextDocId) {
      ctxDocEl.value = session.contextDocId;
    }
  }

  if (copilotEl) {
    const presets = state.aiChat.copilotPresets || [];
    copilotEl.innerHTML = presets
      .map(
        (p) =>
          `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`
      )
      .join("");
    if (session.copilotId) {
      copilotEl.value = session.copilotId;
    }
  }

  if (hintEl) {
    const hasGemKey = Boolean(
      state.aiChat.settings?.gemini?.apiKey || state.geminiSettings?.hasApiKey
    );
    const hasProviderKey =
      provider === "ollama"
        ? true
        : provider === "gemini"
        ? hasGemKey
        : Boolean(state.aiChat.settings?.[provider]?.apiKey);
    hintEl.textContent = hasProviderKey
      ? `${getProviderLabel(provider)} • ${model}`
      : `⚠️ Chưa nhập API Key cho ${getProviderLabel(provider)}`;
    hintEl.style.color = hasProviderKey ? "" : "#dc2626";
  }
}

function renderAiChatPendingAttachments() {
  const bar = document.getElementById("aiChatAttachmentsBar");
  if (!bar) return;
  const list = state.aiChat.pendingAttachments || [];
  if (list.length === 0) {
    bar.classList.add("hidden");
    bar.innerHTML = "";
    return;
  }
  bar.classList.remove("hidden");
  bar.innerHTML = list
    .map(
      (att, idx) => `
      <span class="chatbox-pending-att">
        <span>📎 ${escapeHtml(att.name)}</span>
        <button type="button" onclick="removeAiChatPendingAtt(${idx})" title="Bỏ tệp">✕</button>
      </span>
    `
    )
    .join("");
}

window.removeAiChatPendingAtt = function (index) {
  state.aiChat.pendingAttachments.splice(index, 1);
  renderAiChatPendingAttachments();
};

function renderAiChatQuoteBar() {
  const bar = document.getElementById("aiChatQuoteBar");
  const txtEl = document.getElementById("aiChatQuoteText");
  if (!bar || !txtEl) return;
  if (!state.aiChat.quotedText) {
    bar.classList.add("hidden");
    txtEl.textContent = "";
  } else {
    bar.classList.remove("hidden");
    txtEl.textContent = state.aiChat.quotedText.slice(0, 140);
  }
}

function scrollAiChatToBottom() {
  const container = document.getElementById("aiChatMessages");
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

function renderAiChatMessages() {
  const container = document.getElementById("aiChatMessages");
  if (!container) return;
  const session = getActiveAiChatSession();
  const messages = session?.messages || [];

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="chatbox-welcome">
        <div class="chatbox-welcome-icon">💬</div>
        <h3>Chatbox AI — Trợ lý Đa Mô Hình & Văn Bản</h3>
        <p>
          Hỗ trợ hỏi đáp trực tiếp dữ liệu văn bản trong ứng dụng, đọc file PDF/Word/Ảnh, và kết nối đa nền tảng (Gemini, OpenAI/DeepSeek, Claude, Ollama).
        </p>
        <div class="chatbox-prompt-grid">
          <button type="button" class="chatbox-prompt-card" onclick="useAiChatStarterPrompt('Hãy tổng hợp toàn bộ các văn bản đang xử lý và quá hạn hiện có trong phần mềm, sắp xếp theo mức độ khẩn và đề xuất việc cần làm ngay hôm nay.')">
            <div class="chatbox-prompt-card-title">📊 Tổng hợp việc cần xử lý hôm nay</div>
            <div class="chatbox-prompt-card-desc">Liệt kê các văn bản quá hạn, sắp đến hạn và người phụ trách cần đôn đốc.</div>
          </button>
          <button type="button" class="chatbox-prompt-card" onclick="useAiChatStarterPrompt('Hãy soạn giúp tôi một Công văn / Báo cáo phản hồi chuẩn Nghị định 30/2020/NĐ-CP căn cứ vào văn bản cấp trên đang được chọn làm ngữ cảnh.')">
            <div class="chatbox-prompt-card-title">✍️ Soạn công văn trả lời cấp trên</div>
            <div class="chatbox-prompt-card-desc">Tạo dự thảo văn bản phúc đáp đúng thể thức, đầy đủ phần Căn cứ & Nơi nhận.</div>
          </button>
          <button type="button" class="chatbox-prompt-card" onclick="useAiChatStarterPrompt('Hãy soạn sẵn tin nhắn Zalo ngắn gọn, lịch sự để gửi đôn đốc các chuyên viên phụ trách xử lý những văn bản sắp đến hạn hoặc quá hạn.')">
            <div class="chatbox-prompt-card-title">💬 Soạn tin nhắn Zalo đôn đốc</div>
            <div class="chatbox-prompt-card-desc">Tạo lời nhắc ngắn gọn, rõ hạn chót cho từng cá nhân phụ trách.</div>
          </button>
          <button type="button" class="chatbox-prompt-card" onclick="useAiChatStarterPrompt('Tôi sẽ đính kèm tệp văn bản, hãy tóm tắt nội dung chính, các đầu việc cần thực hiện, thời hạn và gợi ý phân công xử lý.')">
            <div class="chatbox-prompt-card-title">📎 Tóm tắt & Phân tích tài liệu</div>
            <div class="chatbox-prompt-card-desc">Hỗ trợ đọc trực tiếp PDF (kể cả bản ký số), Word (.docx), Ảnh chụp.</div>
          </button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = messages
    .map((m) => {
      const isUser = m.role === "user";
      const avatar = isUser ? "👤" : "🤖";
      const timeStr = m.createdAt
        ? new Date(m.createdAt).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      const modelTag =
        !isUser && (m.model || m.provider)
          ? `<span class="chatbox-msg-model-tag">${escapeHtml(
              getProviderLabel(m.provider)
            )} • ${escapeHtml(m.model || "")}</span>`
          : "";

      const quoteHtml = m.quotedText
        ? `<div class="chatbox-msg-quote">💬 ${escapeHtml(
            m.quotedText.slice(0, 180)
          )}</div>`
        : "";

      const atts = Array.isArray(m.attachments) ? m.attachments : [];
      const attHtml =
        atts.length > 0
          ? `<div class="chatbox-msg-attachments">${atts
              .map(
                (a) =>
                  `<span class="chatbox-msg-att-chip" onclick="openAttachmentFile('${escapeHtml(
                    (a.path || "").replace(/\\/g, "\\\\")
                  )}')">📄 ${escapeHtml(a.name)}</span>`
              )
              .join("")}</div>`
          : "";

      let bodyHtml = "";
      if (isUser) {
        bodyHtml = `<div>${escapeHtml(m.content || "").replace(/\n/g, "<br />")}</div>`;
      } else if (m.streaming && !m.content) {
        bodyHtml = `<div class="chatbox-typing-dots"><span></span><span></span><span></span></div>`;
      } else {
        bodyHtml = `<div class="chatbox-markdown">${renderChatMarkdown(
          m.content || ""
        )}</div>`;
      }

      const actionsHtml = m.streaming
        ? ""
        : `
          <div class="chatbox-msg-actions">
            <button type="button" class="chatbox-msg-action-btn" onclick="copyAiChatMessage('${escapeHtml(
              m.id
            )}')">📋 Sao chép</button>
            <button type="button" class="chatbox-msg-action-btn" onclick="quoteAiChatMessage('${escapeHtml(
              m.id
            )}')">💬 Trích dẫn</button>
            ${
              !isUser
                ? `<button type="button" class="chatbox-msg-action-btn" onclick="regenerateAiChatMessage('${escapeHtml(
                    m.id
                  )}')">🔄 Tạo lại</button>`
                : ""
            }
            <button type="button" class="chatbox-msg-action-btn" onclick="deleteAiChatMessage('${escapeHtml(
              m.id
            )}')">🗑️ Xóa</button>
          </div>
        `;

      return `
        <div class="chatbox-msg-row ${isUser ? "user" : "assistant"}" data-msg-id="${escapeHtml(
        m.id
      )}">
          <div class="chatbox-msg-avatar">${avatar}</div>
          <div class="chatbox-msg-body-wrap">
            <div class="chatbox-msg-meta">
              <strong>${isUser ? "Bạn" : "Trợ lý AI"}</strong>
              ${modelTag}
              <span>${timeStr}</span>
            </div>
            <div class="chatbox-msg-bubble">
              ${quoteHtml}
              ${attHtml}
              <div class="chatbox-msg-content-target">${bodyHtml}</div>
            </div>
            ${actionsHtml}
          </div>
        </div>
      `;
    })
    .join("");

  scrollAiChatToBottom();
}

function updateStreamingButtons(isStreaming) {
  const btnSend = document.getElementById("btnSendAiChat");
  const btnStop = document.getElementById("btnStopAiChat");
  if (btnSend) btnSend.classList.toggle("hidden", isStreaming);
  if (btnStop) btnStop.classList.toggle("hidden", !isStreaming);
}

function applyAiChatState(chatState) {
  if (!chatState) return;
  state.aiChat.activeSessionId = chatState.activeSessionId || "";
  state.aiChat.sessions = Array.isArray(chatState.sessions)
    ? chatState.sessions
    : [];
  if (chatState.settings) state.aiChat.settings = chatState.settings;
  if (Array.isArray(chatState.copilotPresets)) {
    state.aiChat.copilotPresets = chatState.copilotPresets;
  }

  renderAiChatSidebar();
  refreshAiChatContextDocSelect();
  renderAiChatHeaderAndContext();
  renderAiChatMessages();
}

window.useAiChatStarterPrompt = function (text) {
  const input = document.getElementById("aiChatInput");
  if (!input) return;
  input.value = text;
  input.focus();
};

window.copyAiChatMessage = function (msgId) {
  const session = getActiveAiChatSession();
  const msg = session?.messages?.find((m) => m.id === msgId);
  if (!msg) return;
  navigator.clipboard?.writeText(msg.content || "");
  showToast("Đã sao chép nội dung tin nhắn!", "success");
};

window.quoteAiChatMessage = function (msgId) {
  const session = getActiveAiChatSession();
  const msg = session?.messages?.find((m) => m.id === msgId);
  if (!msg) return;
  state.aiChat.quotedText = (msg.content || "").trim();
  renderAiChatQuoteBar();
  document.getElementById("aiChatInput")?.focus();
};

window.deleteAiChatMessage = async function (msgId) {
  const session = getActiveAiChatSession();
  if (!session) return;
  const res = await window.appApi.deleteAiChatMessage(session.id, msgId);
  applyAiChatState(res.state);
};

window.regenerateAiChatMessage = async function (msgId) {
  const session = getActiveAiChatSession();
  if (!session || state.aiChat.activeStreamId) return;
  updateStreamingButtons(true);
  try {
    const prov = document.getElementById("aiChatProviderSelect")?.value || "";
    const model = document.getElementById("aiChatModelInput")?.value?.trim() || "";
    await window.appApi.sendAiChatMessage({
      sessionId: session.id,
      regenerateMessageId: msgId,
      provider: prov,
      model,
    });
  } catch (err) {
    showToast(err.message || "Lỗi tạo lại phản hồi AI", "error");
    updateStreamingButtons(false);
  }
};

async function sendAiChatPrompt() {
  const session = getActiveAiChatSession();
  if (!session) return;
  if (state.aiChat.activeStreamId) {
    showToast("AI đang trả lời, bạn có thể bấm Dừng trước khi gửi tiếp.", "info");
    return;
  }

  const input = document.getElementById("aiChatInput");
  const userText = (input?.value || "").trim();
  const attachments = [...(state.aiChat.pendingAttachments || [])];
  const quotedText = state.aiChat.quotedText || "";

  if (!userText && attachments.length === 0) {
    showToast("Hãy nhập nội dung câu hỏi hoặc đính kèm tệp.", "info");
    return;
  }

  const provider =
    document.getElementById("aiChatProviderSelect")?.value || session.provider;
  const model = document.getElementById("aiChatModelInput")?.value?.trim() || "";

  if (input) {
    input.value = "";
    input.style.height = "auto";
  }
  state.aiChat.pendingAttachments = [];
  state.aiChat.quotedText = "";
  renderAiChatPendingAttachments();
  renderAiChatQuoteBar();
  updateStreamingButtons(true);

  try {
    const res = await window.appApi.sendAiChatMessage({
      sessionId: session.id,
      userText,
      attachments,
      quotedText,
      provider,
      model,
    });
    if (res && !res.success && res.error) {
      showToast(res.error, "error");
    }
  } catch (err) {
    showToast(err.message || "Lỗi khi gửi tin nhắn AI", "error");
  } finally {
    state.aiChat.activeStreamId = "";
    state.aiChat.streamingMessageId = "";
    updateStreamingButtons(false);
  }
}

const PROVIDER_MODEL_FIELD_MAP = {
  gemini: {
    inputId: "aiCfgGeminiModel",
    selectId: "aiCfgModelSelect_gemini",
    datalistId: "geminiPresetModelsList",
    keyId: "aiCfgGeminiKey",
    baseUrlId: "",
    statusId: "aiCfgModelStatus_gemini",
  },
  openai: {
    inputId: "aiCfgOpenAiModel",
    selectId: "aiCfgModelSelect_openai",
    datalistId: "openAiPresetModelsList",
    keyId: "aiCfgOpenAiKey",
    baseUrlId: "aiCfgOpenAiBaseUrl",
    statusId: "aiCfgModelStatus_openai",
  },
  claude: {
    inputId: "aiCfgClaudeModel",
    selectId: "aiCfgModelSelect_claude",
    datalistId: "claudePresetModelsList",
    keyId: "aiCfgClaudeKey",
    baseUrlId: "aiCfgClaudeBaseUrl",
    statusId: "aiCfgModelStatus_claude",
  },
  deepseek: {
    inputId: "aiCfgDeepSeekModel",
    selectId: "aiCfgModelSelect_deepseek",
    datalistId: "deepSeekPresetModelsList",
    keyId: "aiCfgDeepSeekKey",
    baseUrlId: "aiCfgDeepSeekBaseUrl",
    statusId: "aiCfgModelStatus_deepseek",
  },
  gateway: {
    inputId: "aiCfgGatewayModel",
    selectId: "aiCfgModelSelect_gateway",
    datalistId: "gatewayPresetModelsList",
    keyId: "aiCfgGatewayKey",
    baseUrlId: "aiCfgGatewayBaseUrl",
    statusId: "aiCfgModelStatus_gateway",
  },
  ollama: {
    inputId: "aiCfgOllamaModel",
    selectId: "aiCfgModelSelect_ollama",
    datalistId: "ollamaPresetModelsList",
    keyId: "",
    baseUrlId: "aiCfgOllamaBaseUrl",
    statusId: "aiCfgModelStatus_ollama",
  },
};

function syncProviderSettingsModelUI(provider, selectedModel, overrideModels = null) {
  const meta = PROVIDER_MODEL_FIELD_MAP[provider];
  if (!meta) return;
  const inputEl = document.getElementById(meta.inputId);
  const selectEl = document.getElementById(meta.selectId);
  const dlEl = document.getElementById(meta.datalistId);
  const statusEl = document.getElementById(meta.statusId);

  const models = Array.isArray(overrideModels) && overrideModels.length > 0
    ? Array.from(new Set([...overrideModels, selectedModel].filter(Boolean)))
    : getCombinedModelsForProvider(provider, selectedModel);

  if (dlEl) {
    dlEl.innerHTML = models
      .map((m) => `<option value="${escapeHtml(m)}"></option>`)
      .join("");
  }
  if (selectEl) {
    selectEl.innerHTML =
      models
        .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
        .join("") + `<option value="__custom__">✏️ Nhập tên model khác...</option>`;
    const targetVal = selectedModel || models[0] || "";
    if (targetVal && models.includes(targetVal)) {
      selectEl.value = targetVal;
      inputEl?.classList.add("hidden");
    } else if (targetVal) {
      selectEl.value = "__custom__";
      inputEl?.classList.remove("hidden");
    }
  }
  if (inputEl && selectedModel) {
    inputEl.value = selectedModel;
  }
  if (statusEl) {
    const loadedCount = (state.aiChat.settings?.loadedModels?.[provider] || []).length;
    statusEl.textContent =
      loadedCount > 0
        ? `Đã tải ${loadedCount} model từ API (đang hiển thị trong danh sách).`
        : "Bấm '🔄 Tải DS Model' để lấy danh sách model mới nhất trực tiếp từ API.";
  }
}

function openAiChatSettingsModal() {
  const cfg = state.aiChat.settings || {};
  document.getElementById("aiCfgDefaultProvider").value =
    cfg.defaultProvider || "gemini";
  const temp = cfg.temperature !== undefined ? cfg.temperature : 0.7;
  document.getElementById("aiCfgTemperature").value = String(temp);
  document.getElementById("aiCfgTempVal").textContent = String(temp);
  document.getElementById("aiCfgMaxHistory").value = String(
    cfg.maxContextMessages || 14
  );

  const gemModel =
    cfg.gemini?.model || state.geminiSettings?.geminiModel || "gemini-2.5-flash";
  document.getElementById("aiCfgGeminiKey").value =
    cfg.gemini?.apiKey || state.geminiSettings?.geminiApiKey || "";
  document.getElementById("aiCfgGeminiModel").value = gemModel;
  syncProviderSettingsModelUI("gemini", gemModel);

  const openAiModel = cfg.openai?.model || "gpt-4o-mini";
  document.getElementById("aiCfgOpenAiBaseUrl").value =
    cfg.openai?.baseUrl || "https://api.openai.com/v1";
  document.getElementById("aiCfgOpenAiKey").value = cfg.openai?.apiKey || "";
  document.getElementById("aiCfgOpenAiModel").value = openAiModel;
  syncProviderSettingsModelUI("openai", openAiModel);

  const claudeModel = cfg.claude?.model || "claude-sonnet-4-20250514";
  document.getElementById("aiCfgClaudeBaseUrl").value =
    cfg.claude?.baseUrl || "https://api.anthropic.com";
  document.getElementById("aiCfgClaudeKey").value = cfg.claude?.apiKey || "";
  document.getElementById("aiCfgClaudeModel").value = claudeModel;
  syncProviderSettingsModelUI("claude", claudeModel);

  const deepSeekModel = cfg.deepseek?.model || "deepseek-chat";
  document.getElementById("aiCfgDeepSeekBaseUrl").value =
    cfg.deepseek?.baseUrl || "https://api.deepseek.com/v1";
  document.getElementById("aiCfgDeepSeekKey").value = cfg.deepseek?.apiKey || "";
  document.getElementById("aiCfgDeepSeekModel").value = deepSeekModel;
  syncProviderSettingsModelUI("deepseek", deepSeekModel);

  const gatewayModel = cfg.gateway?.model || "gemini-3.8-flash";
  document.getElementById("aiCfgGatewayBaseUrl").value =
    cfg.gateway?.baseUrl || "https://ai.starimg.ru/v1";
  document.getElementById("aiCfgGatewayKey").value = cfg.gateway?.apiKey || "";
  document.getElementById("aiCfgGatewayModel").value = gatewayModel;
  syncProviderSettingsModelUI("gateway", gatewayModel);

  const ollamaModel = cfg.ollama?.model || "llama3.2";
  document.getElementById("aiCfgOllamaBaseUrl").value =
    cfg.ollama?.baseUrl || "http://127.0.0.1:11434";
  document.getElementById("aiCfgOllamaModel").value = ollamaModel;
  syncProviderSettingsModelUI("ollama", ollamaModel);

  document.getElementById("aiChatSettingsModal").classList.remove("hidden");
}

function openAiChatPromptModal() {
  const session = getActiveAiChatSession();
  if (!session) return;
  const presetSelect = document.getElementById("aiPromptModalPresetSelect");
  const textarea = document.getElementById("aiPromptModalTextarea");
  const presets = state.aiChat.copilotPresets || [];

  presetSelect.innerHTML = presets
    .map(
      (p) =>
        `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} — ${escapeHtml(
          p.description
        )}</option>`
    )
    .join("");
  if (session.copilotId) presetSelect.value = session.copilotId;
  textarea.value = session.systemPrompt || "";

  document.getElementById("aiChatPromptModal").classList.remove("hidden");
}

async function initAiChatModule() {
  if (typeof window.appApi.getAiChatState !== "function") return;
  const initialState = await window.appApi.getAiChatState();
  applyAiChatState(initialState);

  // Listen to real-time streaming chunks
  window.appApi.onAiChatStreamEvent((ev) => {
    if (!ev) return;
    if (ev.type === "start") {
      state.aiChat.activeStreamId = ev.streamId;
      state.aiChat.streamingSessionId = ev.sessionId;
      state.aiChat.streamingMessageId = ev.messageId;
      if (ev.session) {
        const sIdx = state.aiChat.sessions.findIndex((s) => s.id === ev.session.id);
        if (sIdx >= 0) state.aiChat.sessions[sIdx] = ev.session;
      }
      renderAiChatSidebar();
      renderAiChatHeaderAndContext();
      renderAiChatMessages();
      updateStreamingButtons(true);
    } else if (ev.type === "delta") {
      const session = state.aiChat.sessions.find((s) => s.id === ev.sessionId);
      const msg = session?.messages?.find((m) => m.id === ev.messageId);
      if (msg) {
        msg.content = (msg.content || "") + (ev.delta || "");
        const row = document.querySelector(
          `.chatbox-msg-row[data-msg-id="${CSS.escape(ev.messageId)}"] .chatbox-msg-content-target`
        );
        if (row) {
          row.innerHTML = `<div class="chatbox-markdown">${renderChatMarkdown(
            msg.content
          )}</div>`;
          scrollAiChatToBottom();
        }
      }
    } else if (ev.type === "done" || ev.type === "error") {
      if (ev.session) {
        const sIdx = state.aiChat.sessions.findIndex((s) => s.id === ev.session.id);
        if (sIdx >= 0) state.aiChat.sessions[sIdx] = ev.session;
      }
      state.aiChat.activeStreamId = "";
      state.aiChat.streamingMessageId = "";
      updateStreamingButtons(false);
      renderAiChatSidebar();
      renderAiChatMessages();
    }
  });

  document.getElementById("btnNewAiChat")?.addEventListener("click", async () => {
    const res = await window.appApi.createAiChatSession();
    applyAiChatState(res.state);
    document.getElementById("aiChatInput")?.focus();
  });

  document.getElementById("aiChatSearchInput")?.addEventListener("input", (e) => {
    state.aiChat.searchQuery = e.target.value;
    renderAiChatSidebar();
  });

  document
    .getElementById("btnToggleChatSidebar")
    ?.addEventListener("click", () => {
      document.getElementById("chatboxSidebar")?.classList.toggle("collapsed");
    });

  document
    .getElementById("btnOpenAiChatSettings")
    ?.addEventListener("click", () => {
      openAiChatSettingsModal();
    });

  document
    .getElementById("btnOpenAiPromptSettings")
    ?.addEventListener("click", () => {
      openAiChatPromptModal();
    });

  document
    .getElementById("aiPromptModalPresetSelect")
    ?.addEventListener("change", (e) => {
      const preset = (state.aiChat.copilotPresets || []).find(
        (p) => p.id === e.target.value
      );
      if (preset) {
        document.getElementById("aiPromptModalTextarea").value =
          preset.systemPrompt;
      }
    });

  document
    .getElementById("aiChatPromptForm")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const session = getActiveAiChatSession();
      if (!session) return;
      const copilotId = document.getElementById(
        "aiPromptModalPresetSelect"
      ).value;
      const systemPrompt = document.getElementById(
        "aiPromptModalTextarea"
      ).value;
      const res = await window.appApi.updateAiChatSession(session.id, {
        copilotId,
        systemPrompt,
      });
      applyAiChatState(res.state);
      closeModal("aiChatPromptModal");
      showToast("Đã cập nhật Vai trò AI cho cuộc trò chuyện!", "success");
    });

  document
    .getElementById("aiChatTitleInput")
    ?.addEventListener("change", async (e) => {
      const session = getActiveAiChatSession();
      if (!session) return;
      const res = await window.appApi.updateAiChatSession(session.id, {
        title: e.target.value.trim() || "Cuộc trò chuyện mới",
      });
      applyAiChatState(res.state);
    });

  document
    .getElementById("aiChatProviderSelect")
    ?.addEventListener("change", async (e) => {
      const session = getActiveAiChatSession();
      if (!session) return;
      const nextProvider = e.target.value;
      const defaultModel =
        state.aiChat.settings?.[nextProvider]?.model ||
        state.aiChat.settings?.providersCatalog?.[nextProvider]?.defaultModel ||
        "";
      const res = await window.appApi.updateAiChatSession(session.id, {
        provider: nextProvider,
        model: defaultModel,
      });
      applyAiChatState(res.state);
    });

  document
    .getElementById("aiChatModelSelect")
    ?.addEventListener("change", async (e) => {
      const val = e.target.value;
      const inputEl = document.getElementById("aiChatModelInput");
      if (val === "__custom__") {
        if (inputEl) {
          inputEl.classList.remove("hidden");
          inputEl.focus();
          inputEl.select();
        }
        return;
      }
      if (inputEl) {
        inputEl.value = val;
        inputEl.classList.add("hidden");
      }
      const session = getActiveAiChatSession();
      if (!session || !val) return;
      const res = await window.appApi.updateAiChatSession(session.id, {
        model: val,
      });
      applyAiChatState(res.state);
    });

  document
    .getElementById("aiChatModelInput")
    ?.addEventListener("change", async (e) => {
      const session = getActiveAiChatSession();
      if (!session) return;
      const val = e.target.value.trim();
      if (!val) return;
      const res = await window.appApi.updateAiChatSession(session.id, {
        model: val,
      });
      applyAiChatState(res.state);
    });

  document
    .getElementById("btnRefreshChatModels")
    ?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const session = getActiveAiChatSession();
      const provider =
        document.getElementById("aiChatProviderSelect")?.value ||
        session?.provider ||
        "gemini";
      btn.disabled = true;
      try {
        const res = await window.appApi.fetchAiModels({ provider });
        if (res?.settings) {
          state.aiChat.settings = res.settings;
        }
        const models = res?.models || [];
        if (models.length === 0) {
          showToast(
            `Không tìm thấy model nào từ ${getProviderLabel(provider)}.`,
            "info"
          );
        } else {
          const curModel =
            document.getElementById("aiChatModelInput")?.value?.trim() || "";
          const chosen = models.includes(curModel) ? curModel : models[0];
          syncModelDatalistForProvider(provider, chosen);
          if (session && chosen !== session.model) {
            const up = await window.appApi.updateAiChatSession(session.id, {
              model: chosen,
            });
            applyAiChatState(up.state);
          } else {
            renderAiChatHeaderAndContext();
          }
          showToast(
            `Đã tải ${models.length} model ${getProviderLabel(provider)}!`,
            "success"
          );
        }
      } catch (err) {
        showToast(
          err.message || `Lỗi tải danh sách model ${getProviderLabel(provider)}`,
          "error"
        );
      } finally {
        btn.disabled = false;
      }
    });

  document
    .getElementById("aiChatContextModeSelect")
    ?.addEventListener("change", async (e) => {
      const session = getActiveAiChatSession();
      if (!session) return;
      const mode = e.target.value;
      let contextDocId = session.contextDocId || "";
      if (mode === "single_doc" && !contextDocId && state.documents.length > 0) {
        contextDocId = state.documents[0].id;
      }
      const res = await window.appApi.updateAiChatSession(session.id, {
        contextMode: mode,
        contextDocId,
      });
      applyAiChatState(res.state);
    });

  document
    .getElementById("aiChatContextDocSelect")
    ?.addEventListener("change", async (e) => {
      const session = getActiveAiChatSession();
      if (!session) return;
      const res = await window.appApi.updateAiChatSession(session.id, {
        contextMode: "single_doc",
        contextDocId: e.target.value,
      });
      applyAiChatState(res.state);
    });

  document
    .getElementById("aiChatCopilotSelect")
    ?.addEventListener("change", async (e) => {
      const session = getActiveAiChatSession();
      if (!session) return;
      const preset = (state.aiChat.copilotPresets || []).find(
        (p) => p.id === e.target.value
      );
      if (!preset) return;
      const res = await window.appApi.updateAiChatSession(session.id, {
        copilotId: preset.id,
        systemPrompt: preset.systemPrompt,
      });
      applyAiChatState(res.state);
      showToast(`Đã chuyển vai trò: ${preset.name}`, "info");
    });

  document
    .getElementById("btnClearAiChat")
    ?.addEventListener("click", async () => {
      const session = getActiveAiChatSession();
      if (!session || !session.messages?.length) return;
      if (!window.confirm("Xóa toàn bộ tin nhắn trong cuộc trò chuyện hiện tại?"))
        return;
      const res = await window.appApi.clearAiChatSession(session.id);
      applyAiChatState(res.state);
    });

  document
    .getElementById("btnExportAiChat")
    ?.addEventListener("click", async () => {
      const session = getActiveAiChatSession();
      if (!session || !session.messages?.length) {
        showToast("Cuộc trò chuyện chưa có nội dung để xuất.", "info");
        return;
      }
      const mdLines = [
        `# ${session.title || "Cuộc trò chuyện AI"}`,
        `- Thời gian xuất: ${new Date().toLocaleString("vi-VN")}`,
        "",
      ];
      for (const m of session.messages) {
        const who = m.role === "user" ? "## 👤 Bạn" : `## 🤖 AI (${m.model || ""})`;
        mdLines.push(who, "", m.content || "", "");
      }
      const res = await window.appApi.exportAiChatMarkdown({
        title: session.title,
        markdown: mdLines.join("\n"),
      });
      if (!res.canceled) {
        showToast(`Đã xuất hội thoại ra: ${res.filePath}`, "success");
      }
    });

  document
    .getElementById("btnPickAiChatFiles")
    ?.addEventListener("click", async () => {
      const files = await window.appApi.pickFiles();
      if (files && files.length) {
        state.aiChat.pendingAttachments.push(...files);
        renderAiChatPendingAttachments();
      }
    });

  document
    .getElementById("btnInsertDocPrompt")
    ?.addEventListener("click", () => {
      const session = getActiveAiChatSession();
      const input = document.getElementById("aiChatInput");
      if (!input) return;
      if (session?.contextMode === "single_doc" && session.contextDocId) {
        const doc = state.documents.find((d) => d.id === session.contextDocId);
        if (doc) {
          input.value = `Dựa trên văn bản số "${doc.docNumber}" (${doc.title}), hãy tóm tắt yêu cầu chính và soạn dự thảo văn bản/báo cáo phản hồi giúp tôi.`;
          input.focus();
          return;
        }
      }
      input.value =
        "Hãy tổng hợp tình hình các văn bản đang xử lý và quá hạn hiện có trong phần mềm, kèm đề xuất đôn đốc cụ thể.";
      input.focus();
    });

  document
    .getElementById("btnCancelAiQuote")
    ?.addEventListener("click", () => {
      state.aiChat.quotedText = "";
      renderAiChatQuoteBar();
    });

  document
    .getElementById("btnSendAiChat")
    ?.addEventListener("click", () => sendAiChatPrompt());

  document
    .getElementById("btnStopAiChat")
    ?.addEventListener("click", async () => {
      if (state.aiChat.activeStreamId) {
        await window.appApi.stopAiChatStream(state.aiChat.activeStreamId);
      }
    });

  const aiInput = document.getElementById("aiChatInput");
  if (aiInput) {
    aiInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendAiChatPrompt();
      }
    });
    aiInput.addEventListener("input", () => {
      aiInput.style.height = "auto";
      aiInput.style.height = `${Math.min(aiInput.scrollHeight, 180)}px`;
    });
    aiInput.addEventListener("paste", async (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      for (const item of items) {
        if (item.type && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (!blob) continue;
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const saved = await window.appApi.saveAiChatPastedImage({
                dataUrl: reader.result,
                name: blob.name || `AnhDan_${Date.now()}.png`,
              });
              state.aiChat.pendingAttachments.push(saved);
              renderAiChatPendingAttachments();
              showToast("Đã dán ảnh vào tin nhắn AI!", "success");
            } catch (err) {
              showToast(err.message || "Không thể dán ảnh", "error");
            }
          };
          reader.readAsDataURL(blob);
        }
      }
    });
  }

  // Drag & Drop files onto Composer
  const composerWrap = document.getElementById("aiChatComposerWrap");
  if (composerWrap) {
    composerWrap.addEventListener("dragover", (e) => {
      e.preventDefault();
      composerWrap.classList.add("drag-over");
    });
    composerWrap.addEventListener("dragleave", () => {
      composerWrap.classList.remove("drag-over");
    });
    composerWrap.addEventListener("drop", (e) => {
      e.preventDefault();
      composerWrap.classList.remove("drag-over");
      const files = Array.from(e.dataTransfer?.files || []);
      for (const f of files) {
        const filePath =
          typeof window.appApi.getPathForFile === "function"
            ? window.appApi.getPathForFile(f)
            : f.path || "";
        if (!filePath) continue;
        const dotIdx = f.name.lastIndexOf(".");
        state.aiChat.pendingAttachments.push({
          id: `drop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: f.name,
          path: filePath,
          size: f.size || 0,
          ext: dotIdx >= 0 ? f.name.slice(dotIdx + 1).toLowerCase() : "",
        });
      }
      renderAiChatPendingAttachments();
    });
  }

  // Chatbox Settings Modal bindings
  document
    .getElementById("aiCfgTemperature")
    ?.addEventListener("input", (e) => {
      document.getElementById("aiCfgTempVal").textContent = e.target.value;
    });

  document.querySelectorAll(".ai-cfg-model-select").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const provider = sel.dataset.providerSelect;
      const meta = PROVIDER_MODEL_FIELD_MAP[provider];
      if (!meta) return;
      const inputEl = document.getElementById(meta.inputId);
      const val = e.target.value;
      if (val === "__custom__") {
        if (inputEl) {
          inputEl.classList.remove("hidden");
          inputEl.focus();
          inputEl.select();
        }
      } else {
        if (inputEl) {
          inputEl.value = val;
          inputEl.classList.add("hidden");
        }
      }
    });
  });

  document.querySelectorAll(".btn-fetch-provider-models").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const provider = btn.dataset.fetchProvider;
      const meta = PROVIDER_MODEL_FIELD_MAP[provider];
      if (!meta) return;
      const apiKey = meta.keyId
        ? (document.getElementById(meta.keyId)?.value || "").trim()
        : "";
      const baseUrl = meta.baseUrlId
        ? (document.getElementById(meta.baseUrlId)?.value || "").trim()
        : "";
      const statusEl = document.getElementById(meta.statusId);
      const prevText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "⏳ Đang tải...";
      if (statusEl) {
        statusEl.textContent = "⏳ Đang tải danh sách model từ API...";
        statusEl.style.color = "";
      }

      try {
        const res = await window.appApi.fetchAiModels({
          provider,
          apiKey,
          baseUrl,
        });
        if (res?.settings) {
          state.aiChat.settings = res.settings;
        }
        const models = res?.models || [];
        if (models.length === 0) {
          if (statusEl) {
            statusEl.textContent = "API không trả về model nào.";
          }
          showToast(`Không có model nào được trả về cho ${getProviderLabel(provider)}.`, "info");
        } else {
          const curVal =
            (document.getElementById(meta.inputId)?.value || "").trim();
          const chosen = models.includes(curVal) ? curVal : models[0];
          syncProviderSettingsModelUI(provider, chosen, models);
          if (statusEl) {
            statusEl.textContent = `✅ Đã tải thành công ${models.length} model (${models.slice(0, 3).join(", ")}...)`;
            statusEl.style.color = "#15803d";
          }
          showToast(
            `Đã tải ${models.length} model ${getProviderLabel(provider)}!`,
            "success"
          );
        }
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `❌ ${err.message || "Lỗi tải danh sách model"}`;
          statusEl.style.color = "#dc2626";
        }
        showToast(err.message || "Không tải được danh sách model", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = prevText;
      }
    });
  });

  document
    .getElementById("aiChatSettingsForm")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const readModelVal = (provider) => {
          const meta = PROVIDER_MODEL_FIELD_MAP[provider];
          const selVal = document.getElementById(meta.selectId)?.value || "";
          const inpVal = (document.getElementById(meta.inputId)?.value || "").trim();
          return selVal && selVal !== "__custom__" ? selVal : inpVal;
        };

        const saved = await window.appApi.saveAiChatSettings({
          defaultProvider: document.getElementById("aiCfgDefaultProvider").value,
          temperature: Number(document.getElementById("aiCfgTemperature").value),
          maxContextMessages: Number(
            document.getElementById("aiCfgMaxHistory").value
          ),
          gemini: {
            apiKey: document.getElementById("aiCfgGeminiKey").value,
            model: readModelVal("gemini") || "gemini-2.5-flash",
          },
          openai: {
            baseUrl: document.getElementById("aiCfgOpenAiBaseUrl").value,
            apiKey: document.getElementById("aiCfgOpenAiKey").value,
            model: readModelVal("openai") || "gpt-4o-mini",
          },
          claude: {
            baseUrl: document.getElementById("aiCfgClaudeBaseUrl").value,
            apiKey: document.getElementById("aiCfgClaudeKey").value,
            model: readModelVal("claude") || "claude-sonnet-4-20250514",
          },
          deepseek: {
            baseUrl: document.getElementById("aiCfgDeepSeekBaseUrl").value,
            apiKey: document.getElementById("aiCfgDeepSeekKey").value,
            model: readModelVal("deepseek") || "deepseek-chat",
          },
          gateway: {
            baseUrl: document.getElementById("aiCfgGatewayBaseUrl").value,
            apiKey: document.getElementById("aiCfgGatewayKey").value,
            model: readModelVal("gateway") || "gemini-3.8-flash",
          },
          ollama: {
            baseUrl: document.getElementById("aiCfgOllamaBaseUrl").value,
            model: readModelVal("ollama") || "llama3.2",
          },
        });
        state.aiChat.settings = saved;
        state.geminiSettings = await window.appApi.getGeminiSettings();
        updateGeminiHeaderBadge();
        renderAiChatHeaderAndContext();
        closeModal("aiChatSettingsModal");
        showToast("Đã lưu cài đặt Chatbox AI đa mô hình!", "success");
      } catch (err) {
        showToast(err.message || "Lỗi lưu cài đặt AI Chatbox", "error");
      }
    });
}

// ==================== VERSION MANAGER & GITHUB AUTO-UPDATE ====================
function renderUpdateHeaderPill() {
  const settingsBtn = document.getElementById("btnOpenGeminiSettings");
  const tabDotEl = document.getElementById("settingsUpdateTabDot");
  const st = state.update.state;
  const live = state.update.liveStatus;

  const curVer = st?.currentVersion || "1.0.0";
  const hasUpdate = Boolean(
    live?.hasUpdate || st?.lastCheckResult?.hasUpdate
  );
  const latestVer =
    live?.latestVersion || st?.lastCheckResult?.latestRelease?.version || "";

  if (tabDotEl) {
    tabDotEl.classList.toggle("hidden", !hasUpdate);
  }
  if (settingsBtn && hasUpdate && latestVer) {
    settingsBtn.title = `Cài đặt hệ thống (Có bản cập nhật mới v${latestVer}, hiện tại v${curVer})`;
  }
}

function renderUpdateModal() {
  const st = state.update.state || {};
  const live = state.update.liveStatus;
  const curVer = st.currentVersion || "1.0.0";

  const badge = document.getElementById("updCurrentVersionBadge");
  if (badge) badge.textContent = `zOffice v${curVer}`;

  const lastCheckedEl = document.getElementById("updLastCheckedText");
  if (lastCheckedEl) {
    lastCheckedEl.textContent = st.lastCheckedAt
      ? `Kiểm tra lúc ${formatDateTimeVN(st.lastCheckedAt)}`
      : "Chưa kiểm tra từ GitHub";
  }

  const repoEl = document.getElementById("updGithubRepoInput");
  const tokenEl = document.getElementById("updGithubTokenInput");
  const autoChkEl = document.getElementById("chkUpdAutoCheck");
  const autoInstallEl = document.getElementById("chkUpdAutoInstall");
  const preChkEl = document.getElementById("chkUpdIncludePre");
  if (repoEl && document.activeElement !== repoEl) {
    repoEl.value = st.githubRepo || "";
  }
  if (tokenEl && document.activeElement !== tokenEl) {
    tokenEl.value = st.githubToken || "";
  }
  if (autoChkEl) autoChkEl.checked = st.autoCheckUpdates !== false;
  if (autoInstallEl) autoInstallEl.checked = st.autoInstallUpdates !== false;
  if (preChkEl) preChkEl.checked = Boolean(st.includePrerelease);

  const checkRes = st.lastCheckResult;
  const bannerEl = document.getElementById("updStatusBanner");
  const installBtn = document.getElementById("btnInstallUpdateNow");
  const relSel = document.getElementById("updReleasesSelect");
  const notesEl = document.getElementById("updReleaseNotesBox");
  const openGhBtn = document.getElementById("btnOpenGithubRelease");

  if (bannerEl) {
    if (live?.phase === "error") {
      bannerEl.textContent = `❌ ${live.message}`;
      bannerEl.style.color = "#dc2626";
    } else if (checkRes?.hasUpdate && checkRes.latestRelease) {
      bannerEl.textContent = `🎉 Có phiên bản mới v${checkRes.latestRelease.version} (hiện tại v${curVer}). Bấm "Tải & Cập nhật tự động" để nâng cấp.`;
      bannerEl.style.color = "#047857";
    } else if (checkRes?.configured) {
      bannerEl.textContent = `✅ Bạn đang sử dụng phiên bản mới nhất (v${curVer}).`;
      bannerEl.style.color = "#0369a1";
    } else {
      bannerEl.textContent = st.githubRepo
        ? `Đã cấu hình repo ${st.githubRepo}. Bấm "Kiểm tra ngay" để tìm bản phát hành mới.`
        : "Nhập Repository GitHub bên dưới (VD: owner/zOffice) để bật tự động cập nhật.";
      bannerEl.style.color = "";
    }
  }

  if (installBtn) {
    const canInstall = Boolean(checkRes?.releases?.length);
    installBtn.classList.toggle("hidden", !canInstall);
    if (checkRes?.hasUpdate && checkRes.latestRelease) {
      installBtn.textContent = `⬇️ Cập nhật lên v${checkRes.latestRelease.version}`;
    } else if (checkRes?.latestRelease) {
      installBtn.textContent = `⬇️ Cài lại bản v${checkRes.latestRelease.version}`;
    }
  }

  const releases = checkRes?.releases || [];
  if (relSel) {
    if (releases.length === 0) {
      relSel.innerHTML = `<option value="">-- Chưa có bản phát hành nào --</option>`;
    } else {
      const prevVal = relSel.value;
      relSel.innerHTML = releases
        .map(
          (r) =>
            `<option value="${escapeHtml(r.tagName)}">${escapeHtml(
              `v${r.version}${r.prerelease ? " (Pre-release)" : ""}`
            )}</option>`
        )
        .join("");
      if (prevVal && releases.some((r) => r.tagName === prevVal)) {
        relSel.value = prevVal;
      }
    }
  }

  const selectedRelease =
    releases.find((r) => r.tagName === relSel?.value) || releases[0] || null;
  if (notesEl) {
    if (selectedRelease) {
      notesEl.textContent =
        `Phiên bản: ${selectedRelease.name || selectedRelease.tagName}\n` +
        `Ngày phát hành: ${
          selectedRelease.publishedAt
            ? formatDateTimeVN(selectedRelease.publishedAt)
            : "—"
        }\n\n` +
        (selectedRelease.body || "(Không có ghi chú phát hành)");
    } else {
      notesEl.textContent =
        'Bấm "Kiểm tra ngay" để tải danh sách bản phát hành từ GitHub Releases.';
    }
  }
  if (openGhBtn) {
    openGhBtn.classList.toggle("hidden", !selectedRelease?.htmlUrl);
  }

  const progWrap = document.getElementById("updateProgressWrap");
  const progBar = document.getElementById("updProgressBar");
  const progText = document.getElementById("updProgressText");
  if (progWrap && progBar && progText) {
    const showProg =
      live?.phase === "auto-updating" ||
      live?.phase === "downloading" ||
      live?.phase === "installing";
    progWrap.classList.toggle("hidden", !showProg);
    if (showProg) {
      progBar.style.width = `${live.percent ?? 20}%`;
      progText.textContent = live.message || "Đang xử lý...";
    }
  }

  const histEl = document.getElementById("updHistoryList");
  if (histEl) {
    const backups = st.backups || [];
    const history = st.history || [];
    if (backups.length === 0 && history.length === 0) {
      histEl.innerHTML = `<div class="empty-hint">Chưa có lịch sử cập nhật hoặc bản sao lưu nào.</div>`;
    } else {
      const backupItems = backups.map(
        (b) => `
          <div class="update-history-item">
            <div>
              <b>💾 Bản sao lưu ${escapeHtml(b.version ? `v${b.version}` : b.id)}</b>
              <div class="hint-text">Tạo lúc ${escapeHtml(formatDateTimeVN(b.createdAt))}</div>
            </div>
            <button type="button" class="btn btn-secondary btn-xs btn-rollback-backup" data-backup-id="${escapeHtml(
              b.id
            )}">↩️ Khôi phục</button>
          </div>
        `
      );
      const logItems = history.slice(0, 6).map(
        (h) => `
          <div class="update-history-item">
            <div>
              <b>${h.action === "rollback" ? "↩️ Khôi phục" : "⬆️ Cập nhật"}: v${escapeHtml(
          h.fromVersion
        )} → v${escapeHtml(h.toVersion)}</b>
              <div class="hint-text">${escapeHtml(formatDateTimeVN(h.at))}</div>
            </div>
          </div>
        `
      );
      histEl.innerHTML = [...backupItems, ...logItems].join("");
      histEl.querySelectorAll(".btn-rollback-backup").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const bid = btn.dataset.backupId;
          if (
            !window.confirm(
              "Khôi phục ứng dụng về bản sao lưu này và khởi động lại zOffice?"
            )
          ) {
            return;
          }
          try {
            await window.appApi.rollbackAppBackup(bid);
          } catch (err) {
            showToast(err.message || "Lỗi khôi phục bản sao lưu", "error");
          }
        });
      });
    }
  }
}

async function initUpdateModule() {
  if (typeof window.appApi.getUpdateState !== "function") return;
  try {
    state.update.state = await window.appApi.getUpdateState();
    renderUpdateHeaderPill();
  } catch (_) {}

  window.appApi.onUpdateStatusChanged?.(async (status) => {
    state.update.liveStatus = status;
    try {
      state.update.state = await window.appApi.getUpdateState();
    } catch (_) {}
    renderUpdateHeaderPill();
    renderUpdateModal();
    if (status?.phase === "auto-updating") {
      showToast(
        `🔄 Phát hiện zOffice v${status.latestVersion} — đang tự động tải & cài đặt cập nhật...`,
        "info"
      );
    } else if (status?.phase === "available" && state.update.state?.autoInstallUpdates === false) {
      showToast(
        `🎉 zOffice có bản mới v${status.latestVersion} trên GitHub!`,
        "info"
      );
    }
  });

  document
    .getElementById("btnSaveUpdateConfig")
    ?.addEventListener("click", async () => {
      try {
        state.update.state = await window.appApi.saveUpdateConfig({
          githubRepo: document.getElementById("updGithubRepoInput")?.value || "",
          githubToken:
            document.getElementById("updGithubTokenInput")?.value || "",
          autoCheckUpdates: Boolean(
            document.getElementById("chkUpdAutoCheck")?.checked
          ),
          autoInstallUpdates: Boolean(
            document.getElementById("chkUpdAutoInstall")?.checked
          ),
          includePrerelease: Boolean(
            document.getElementById("chkUpdIncludePre")?.checked
          ),
        });
        renderUpdateHeaderPill();
        renderUpdateModal();
        showToast("Đã lưu cấu hình nguồn cập nhật GitHub!", "success");
      } catch (err) {
        showToast(err.message || "Lỗi lưu cấu hình cập nhật", "error");
      }
    });

  document
    .getElementById("btnCheckUpdatesNow")
    ?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "⏳ Đang kiểm tra...";
      try {
        state.update.state = await window.appApi.saveUpdateConfig({
          githubRepo: document.getElementById("updGithubRepoInput")?.value || "",
          githubToken:
            document.getElementById("updGithubTokenInput")?.value || "",
          autoCheckUpdates: Boolean(
            document.getElementById("chkUpdAutoCheck")?.checked
          ),
          autoInstallUpdates: Boolean(
            document.getElementById("chkUpdAutoInstall")?.checked
          ),
          includePrerelease: Boolean(
            document.getElementById("chkUpdIncludePre")?.checked
          ),
        });
        const res = await window.appApi.checkForUpdates();
        if (res?.state) state.update.state = res.state;
        renderUpdateHeaderPill();
        renderUpdateModal();
        showToast(
          res?.hasUpdate
            ? `Có bản mới v${res.latestRelease?.version}!`
            : `Đang ở phiên bản mới nhất (v${res?.currentVersion || ""}).`,
          res?.hasUpdate ? "success" : "info"
        );
      } catch (err) {
        showToast(err.message || "Không kiểm tra được bản cập nhật", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

  document
    .getElementById("btnInstallUpdateNow")
    ?.addEventListener("click", async (e) => {
      const targetTag =
        document.getElementById("updReleasesSelect")?.value || "";
      if (
        !window.confirm(
          "zOffice sẽ tải bản cập nhật từ GitHub, sao lưu mã nguồn cũ (giữ nguyên toàn bộ dữ liệu) và tự khởi động lại. Tiếp tục?"
        )
      ) {
        return;
      }
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await window.appApi.installUpdateFromGithub(targetTag);
      } catch (err) {
        showToast(err.message || "Lỗi cập nhật từ GitHub", "error");
        btn.disabled = false;
      }
    });

  document
    .getElementById("updReleasesSelect")
    ?.addEventListener("change", () => {
      renderUpdateModal();
    });

  document
    .getElementById("btnOpenGithubRelease")
    ?.addEventListener("click", async () => {
      const releases = state.update.state?.lastCheckResult?.releases || [];
      const tag = document.getElementById("updReleasesSelect")?.value;
      const rel = releases.find((r) => r.tagName === tag) || releases[0];
      if (rel?.htmlUrl) {
        await window.appApi.openGithubReleaseUrl(rel.htmlUrl);
      }
    });
}
