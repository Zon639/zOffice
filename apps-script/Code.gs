/**
 * ============================================================================
 * GOOGLE APPS SCRIPT - HỆ THỐNG TỔNG HỢP & THEO DÕI CÔNG VIỆC CÁC PHÒNG BAN
 * ============================================================================
 * Chức năng:
 * 1. Nhận dữ liệu giao việc từ ứng dụng zOffice (doPost) của nhiều chuyên viên.
 * 2. Lưu tập trung vào Sheet "CongViec_TongHop" và ghi nhận lịch sử tại "NhatKy_DongBo".
 * 3. Cung cấp Dashboard Web trực quan (doGet -> Dashboard.html) để theo dõi
 *    Đang thực hiện / Quá hạn / Đã hoàn thành cho tất cả phòng ban hoặc lọc từng phòng.
 */

const SHEET_TASKS = "CongViec_TongHop";
const SHEET_LOGS = "NhatKy_DongBo";

const STANDARD_DEPARTMENTS = [
  "Phòng Kinh tế",
  "Phòng Văn hóa - Xã hội",
  "Công an",
  "Quân sự",
  "Trung tâm dịch vụ tổng hợp",
  "Trung tâm Phục vụ Hành chính công",
  "Trạm Y tế",
];

const TASK_HEADERS = [
  "ID",
  "Số/Ký hiệu VB",
  "Trích yếu / Nội dung công việc",
  "Phòng ban chuyên môn",
  "Chuyên viên giao việc",
  "Người phụ trách (Zalo)",
  "Cơ quan ban hành",
  "Ngày nhận",
  "Hạn xử lý",
  "Độ khẩn",
  "Trạng thái gốc",
  "Trạng thái theo dõi",
  "Nội dung chỉ đạo",
  "Kết quả / VB phúc đáp",
  "Hoàn thành lúc",
  "Số tệp đính kèm",
  "Danh sách tệp đính kèm",
  "Số lần nhắc Zalo",
  "Nguồn cập nhật",
  "Tạo lúc",
  "Cập nhật lúc",
];

/**
 * Thêm menu thao tác nhanh trên thanh công cụ Google Sheets
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📊 zOffice - Quản Lý Công Việc")
    .addItem("🚀 Khởi tạo / Chuẩn hóa Sheet dữ liệu", "setupDatabase")
    .addItem("🔄 Cập nhật trạng thái Quá hạn hiện tại", "refreshOverdueStatuses")
    .addItem("🌐 Mở Dashboard Web App", "showDashboardLinkDialog")
    .addToUi();
}

function showDashboardLinkDialog() {
  const url = ScriptApp.getService().getUrl();
  const ui = SpreadsheetApp.getUi();
  if (!url) {
    ui.alert(
      "Chưa triển khai Web App",
      "Vui lòng vào menu Triển khai (Deploy) -> Triển khai mới (New deployment) -> chọn Ứng dụng web (Web app) để lấy đường dẫn Dashboard.",
      ui.ButtonSet.OK
    );
    return;
  }
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;padding:8px 4px;line-height:1.5;">' +
      "<p>Đường dẫn Dashboard & Đồng bộ dữ liệu:</p>" +
      '<p><a href="' +
      url +
      '" target="_blank" style="color:#0d9488;font-weight:bold;word-break:break-all;">' +
      url +
      "</a></p>" +
      '<p style="color:#475569;font-size:12px;">Sao chép đường dẫn này dán vào phần Cài đặt Google Sheet trên ứng dụng zOffice.</p>' +
      "</div>"
  )
    .setWidth(460)
    .setHeight(180);
  ui.showModalDialog(html, "Đường dẫn Dashboard & Đồng bộ");
}

/**
 * Khởi tạo cấu trúc 2 Sheet nếu chưa tồn tại
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let taskSheet = ss.getSheetByName(SHEET_TASKS);
  if (!taskSheet) {
    taskSheet = ss.insertSheet(SHEET_TASKS);
  }

  if (taskSheet.getLastRow() === 0) {
    taskSheet.appendRow(TASK_HEADERS);
  } else {
    const currentHeaders = taskSheet
      .getRange(1, 1, 1, TASK_HEADERS.length)
      .getValues()[0];
    if (String(currentHeaders[0] || "").trim() !== "ID") {
      taskSheet.insertRowBefore(1);
      taskSheet.getRange(1, 1, 1, TASK_HEADERS.length).setValues([TASK_HEADERS]);
    } else {
      taskSheet.getRange(1, 1, 1, TASK_HEADERS.length).setValues([TASK_HEADERS]);
    }
  }

  const headerRange = taskSheet.getRange(1, 1, 1, TASK_HEADERS.length);
  headerRange
    .setBackground("#0F172A")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setVerticalAlignment("middle")
    .setWrap(true);
  taskSheet.setFrozenRows(1);
  taskSheet.setRowHeight(1, 34);

  const colWidths = [
    170, 140, 320, 210, 160, 190, 180, 110, 140, 110, 120, 140, 260, 240, 140,
    90, 240, 100, 150, 140, 140,
  ];
  for (let i = 0; i < colWidths.length; i++) {
    taskSheet.setColumnWidth(i + 1, colWidths[i]);
  }

  let logSheet = ss.getSheetByName(SHEET_LOGS);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_LOGS);
  }
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow([
      "Thời gian",
      "Hành động",
      "ID Công việc",
      "Số/Ký hiệu VB",
      "Phòng ban",
      "Chuyên viên",
      "Nguồn gửi",
      "Ghi chú",
    ]);
    logSheet
      .getRange(1, 1, 1, 8)
      .setBackground("#1E293B")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold");
    logSheet.setFrozenRows(1);
  }

  return { taskSheet: taskSheet, logSheet: logSheet };
}

function computeEffectiveStatus(rawStatus, dueDateStr) {
  const status = String(rawStatus || "processing").trim().toLowerCase();
  if (status === "completed") {
    return "completed";
  }
  if (dueDateStr) {
    const dueMs = new Date(dueDateStr).getTime();
    if (!isNaN(dueMs) && dueMs < Date.now()) {
      return "overdue";
    }
  }
  return "processing";
}

function statusToLabel(effectiveStatus) {
  if (effectiveStatus === "completed") return "Đã hoàn thành";
  if (effectiveStatus === "overdue") return "Quá hạn";
  return "Đang thực hiện";
}

function priorityToLabel(priority) {
  const p = String(priority || "normal").toLowerCase();
  if (p === "urgent") return "Hỏa tốc / Thượng khẩn";
  if (p === "important") return "Khẩn / Quan trọng";
  return "Thường";
}

function docPayloadToRow(doc) {
  const effective = computeEffectiveStatus(doc.status, doc.dueDate);
  const assigneesText =
    doc.assigneesText ||
    (Array.isArray(doc.assignees)
      ? doc.assignees
          .map(function (a) {
            return a.displayName || a.userId || "";
          })
          .filter(Boolean)
          .join(", ")
      : "");

  const attachmentList =
    doc.attachmentSummary ||
    (Array.isArray(doc.attachments)
      ? doc.attachments
          .map(function (a) {
            return a.name || "";
          })
          .filter(Boolean)
          .join(" | ")
      : "");

  const attCount =
    typeof doc.attachmentCount === "number"
      ? doc.attachmentCount
      : Array.isArray(doc.attachments)
      ? doc.attachments.length
      : 0;

  const zaloCount =
    typeof doc.zaloSentCount === "number"
      ? doc.zaloSentCount
      : Array.isArray(doc.messageLogs)
      ? doc.messageLogs.length
      : 0;

  return [
    String(doc.id || ""),
    String(doc.docNumber || ""),
    String(doc.title || ""),
    String(doc.department || "Chưa phân phòng ban"),
    String(doc.specialistName || ""),
    String(assigneesText),
    String(doc.issuer || ""),
    String(doc.receivedDate || ""),
    String(doc.dueDate || ""),
    String(doc.priority || "normal"),
    String(doc.status || "processing"),
    statusToLabel(effective),
    String(doc.notes || ""),
    String(doc.completionNote || ""),
    String(doc.completedAt || ""),
    attCount,
    String(attachmentList),
    zaloCount,
    String(doc.sourceClient || ""),
    String(doc.createdAt || ""),
    String(doc.updatedAt || new Date().toISOString()),
  ];
}

function verifySecretToken(incomingSecret) {
  const expected = PropertiesService.getScriptProperties().getProperty("SYNC_SECRET");
  if (!expected) return true;
  return String(incomingSecret || "").trim() === String(expected).trim();
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Endpoint HTTP POST nhận đồng bộ dữ liệu từ App zOffice
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const raw = (e && e.postData && e.postData.contents) || "{}";
    const body = JSON.parse(raw);

    if (!verifySecretToken(body.secret)) {
      return jsonResponse({
        ok: false,
        error: "Sai mã bảo mật đồng bộ (Secret Token).",
      });
    }

    const setup = setupDatabase();
    const taskSheet = setup.taskSheet;
    const logSheet = setup.logSheet;
    const action = String(body.action || "upsert");
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === "ping") {
      return jsonResponse({
        ok: true,
        spreadsheetName: ss.getName(),
        spreadsheetUrl: ss.getUrl(),
        dashboardUrl: ScriptApp.getService().getUrl() || ss.getUrl(),
        totalRows: Math.max(0, taskSheet.getLastRow() - 1),
        serverTime: new Date().toISOString(),
      });
    }

    const lastRow = taskSheet.getLastRow();
    const idMap = {};
    if (lastRow > 1) {
      const idValues = taskSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < idValues.length; i++) {
        const val = String(idValues[i][0] || "").trim();
        if (val) {
          idMap[val] = i + 2;
        }
      }
    }

    if (action === "delete") {
      const targetId = String(body.docId || (body.doc && body.doc.id) || "").trim();
      if (!targetId) {
        return jsonResponse({ ok: false, error: "Thiếu ID công việc cần xóa." });
      }
      const rowNum = idMap[targetId];
      if (rowNum) {
        taskSheet.deleteRow(rowNum);
        logSheet.appendRow([
          new Date().toISOString(),
          "DELETE",
          targetId,
          "",
          "",
          String(body.specialistName || ""),
          String(body.sourceClient || ""),
          "Đã xóa dòng " + rowNum,
        ]);
      }
      return jsonResponse({
        ok: true,
        action: "delete",
        deleted: Boolean(rowNum),
        syncedAt: new Date().toISOString(),
      });
    }

    const docsToProcess =
      action === "bulk_upsert" && Array.isArray(body.docs)
        ? body.docs
        : body.doc
        ? [body.doc]
        : [];

    if (docsToProcess.length === 0) {
      return jsonResponse({
        ok: false,
        error: "Không có dữ liệu công việc trong yêu cầu.",
      });
    }

    let inserted = 0;
    let updated = 0;
    const rowsToAppend = [];

    for (let i = 0; i < docsToProcess.length; i++) {
      const doc = docsToProcess[i];
      if (!doc || !doc.id) continue;
      const docId = String(doc.id).trim();
      const rowValues = docPayloadToRow(doc);
      const existingRow = idMap[docId];
      if (existingRow) {
        taskSheet
          .getRange(existingRow, 1, 1, TASK_HEADERS.length)
          .setValues([rowValues]);
        updated++;
      } else {
        rowsToAppend.push(rowValues);
        idMap[docId] = lastRow + rowsToAppend.length;
        inserted++;
      }
    }

    if (rowsToAppend.length > 0) {
      const startRow = taskSheet.getLastRow() + 1;
      taskSheet
        .getRange(startRow, 1, rowsToAppend.length, TASK_HEADERS.length)
        .setValues(rowsToAppend);
    }

    const firstDoc = docsToProcess[0] || {};
    logSheet.appendRow([
      new Date().toISOString(),
      action.toUpperCase(),
      docsToProcess.length === 1 ? String(firstDoc.id || "") : "BATCH_" + docsToProcess.length,
      docsToProcess.length === 1 ? String(firstDoc.docNumber || "") : "",
      docsToProcess.length === 1 ? String(firstDoc.department || "") : "Nhiều phòng ban",
      String(firstDoc.specialistName || body.specialistName || ""),
      String(firstDoc.sourceClient || body.sourceClient || ""),
      "Thêm mới: " + inserted + ", Cập nhật: " + updated,
    ]);

    return jsonResponse({
      ok: true,
      action: action,
      inserted: inserted,
      updated: updated,
      totalProcessed: inserted + updated,
      syncedAt: new Date().toISOString(),
      dashboardUrl: ScriptApp.getService().getUrl() || ss.getUrl(),
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cập nhật cột Trạng thái theo dõi trực tiếp trên Sheet
 */
function refreshOverdueStatuses() {
  const setup = setupDatabase();
  const sheet = setup.taskSheet;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  const data = sheet.getRange(2, 1, lastRow - 1, TASK_HEADERS.length).getValues();
  let changed = 0;
  const statusUpdates = [];
  for (let i = 0; i < data.length; i++) {
    const dueStr = data[i][8];
    const rawStatus = data[i][10];
    const label = statusToLabel(computeEffectiveStatus(rawStatus, dueStr));
    if (String(data[i][11] || "") !== label) {
      changed++;
    }
    statusUpdates.push([label]);
  }
  sheet.getRange(2, 12, statusUpdates.length, 1).setValues(statusUpdates);
  return changed;
}

/**
 * Endpoint HTTP GET:
 * - ?action=data: trả JSON dữ liệu tổng hợp
 * - Mặc định: trả giao diện Web Dashboard (Dashboard.html)
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action === "data") {
    return jsonResponse(getDashboardData(params));
  }

  const template = HtmlService.createTemplateFromFile("Dashboard");
  template.initialDept = String(params.dept || "");
  return template
    .evaluate()
    .setTitle("Dashboard Theo Dõi Công Việc Các Phòng Ban")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/**
 * Trả dữ liệu tổng hợp & danh sách công việc cho Dashboard.html
 */
function getDashboardData(filters) {
  const f = filters || {};
  const filterDept = String(f.department || "").trim();
  const filterStatus = String(f.status || "all").trim(); // all | processing | overdue | completed
  const filterPriority = String(f.priority || "").trim();
  const filterSpecialist = String(f.specialist || "").trim();
  const searchQuery = String(f.search || "").trim().toLowerCase();

  const setup = setupDatabase();
  const sheet = setup.taskSheet;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lastRow = sheet.getLastRow();

  const allItems = [];
  if (lastRow > 1) {
    const rows = sheet.getRange(2, 1, lastRow - 1, TASK_HEADERS.length).getValues();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0] && !r[1] && !r[2]) continue;
      const dueStr = r[8] ? String(r[8]) : "";
      const rawStatus = String(r[10] || "processing");
      const effectiveStatus = computeEffectiveStatus(rawStatus, dueStr);
      const dept = String(r[3] || "Chưa phân phòng ban").trim() || "Chưa phân phòng ban";
      const specialist = String(r[4] || "").trim();

      allItems.push({
        id: String(r[0] || ""),
        docNumber: String(r[1] || ""),
        title: String(r[2] || ""),
        department: dept,
        specialistName: specialist,
        assigneesText: String(r[5] || ""),
        issuer: String(r[6] || ""),
        receivedDate: String(r[7] || ""),
        dueDate: dueStr,
        priority: String(r[9] || "normal"),
        priorityLabel: priorityToLabel(r[9]),
        status: rawStatus,
        effectiveStatus: effectiveStatus,
        effectiveStatusLabel: statusToLabel(effectiveStatus),
        notes: String(r[12] || ""),
        completionNote: String(r[13] || ""),
        completedAt: String(r[14] || ""),
        attachmentCount: Number(r[15] || 0),
        attachmentSummary: String(r[16] || ""),
        zaloSentCount: Number(r[17] || 0),
        sourceClient: String(r[18] || ""),
        createdAt: String(r[19] || ""),
        updatedAt: String(r[20] || ""),
      });
    }
  }

  // Khởi tạo thống kê theo 6 phòng ban chuẩn + phòng ban phát sinh
  const deptMap = {};
  for (let i = 0; i < STANDARD_DEPARTMENTS.length; i++) {
    const dName = STANDARD_DEPARTMENTS[i];
    deptMap[dName] = {
      department: dName,
      total: 0,
      processing: 0,
      overdue: 0,
      completed: 0,
      completionRate: 0,
    };
  }

  const specialistSet = {};
  const globalSummary = {
    total: 0,
    processing: 0,
    overdue: 0,
    completed: 0,
    completionRate: 0,
  };

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    if (item.specialistName) {
      specialistSet[item.specialistName] = true;
    }

    if (!deptMap[item.department]) {
      deptMap[item.department] = {
        department: item.department,
        total: 0,
        processing: 0,
        overdue: 0,
        completed: 0,
        completionRate: 0,
      };
    }

    deptMap[item.department].total++;
    deptMap[item.department][item.effectiveStatus]++;

    globalSummary.total++;
    globalSummary[item.effectiveStatus]++;
  }

  globalSummary.completionRate =
    globalSummary.total > 0
      ? Math.round((globalSummary.completed / globalSummary.total) * 100)
      : 0;

  const departmentStats = Object.keys(deptMap).map(function (k) {
    const d = deptMap[k];
    d.completionRate = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
    return d;
  });

  // Tính KPI của phạm vi đang lọc (toàn bộ hoặc theo 1 phòng ban)
  const scopedItems = filterDept
    ? allItems.filter(function (it) {
        return it.department === filterDept;
      })
    : allItems;

  const scopedSummary = {
    total: 0,
    processing: 0,
    overdue: 0,
    completed: 0,
    completionRate: 0,
  };
  for (let i = 0; i < scopedItems.length; i++) {
    scopedSummary.total++;
    scopedSummary[scopedItems[i].effectiveStatus]++;
  }
  scopedSummary.completionRate =
    scopedSummary.total > 0
      ? Math.round((scopedSummary.completed / scopedSummary.total) * 100)
      : 0;

  // Áp dụng các bộ lọc chi tiết cho bảng công việc
  const filtered = scopedItems.filter(function (item) {
    if (filterStatus && filterStatus !== "all" && item.effectiveStatus !== filterStatus) {
      return false;
    }
    if (filterPriority && item.priority !== filterPriority) {
      return false;
    }
    if (filterSpecialist && item.specialistName !== filterSpecialist) {
      return false;
    }
    if (searchQuery) {
      const hay = [
        item.docNumber,
        item.title,
        item.department,
        item.specialistName,
        item.assigneesText,
        item.issuer,
        item.notes,
        item.completionNote,
      ]
        .join(" ")
        .toLowerCase();
      if (hay.indexOf(searchQuery) === -1) return false;
    }
    return true;
  });

  // Sắp xếp: Quá hạn lên đầu -> Đang thực hiện (gần hạn lên trước) -> Đã hoàn thành (mới nhất lên trước)
  const statusOrder = { overdue: 0, processing: 1, completed: 2 };
  filtered.sort(function (a, b) {
    const oa = statusOrder[a.effectiveStatus];
    const ob = statusOrder[b.effectiveStatus];
    if (oa !== ob) return oa - ob;
    if (a.effectiveStatus === "completed") {
      return (
        new Date(b.completedAt || b.updatedAt || 0).getTime() -
        new Date(a.completedAt || a.updatedAt || 0).getTime()
      );
    }
    const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return dueA - dueB;
  });

  return {
    ok: true,
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    generatedAt: new Date().toISOString(),
    standardDepartments: STANDARD_DEPARTMENTS,
    specialists: Object.keys(specialistSet).sort(),
    globalSummary: globalSummary,
    scopedSummary: scopedSummary,
    departmentStats: departmentStats,
    items: filtered,
  };
}
