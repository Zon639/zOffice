const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");

// ==================== CRC32 & PURE-NODE ZIP WRITER (DOCX) ====================
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, "/"), "utf-8");
    const rawBuf = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(String(entry.content || ""), "utf-8");
    const compBuf = zlib.deflateRawSync(rawBuf);
    const crc = crc32(rawBuf);

    const localHdr = Buffer.alloc(30);
    localHdr.writeUInt32LE(0x04034b50, 0);
    localHdr.writeUInt16LE(20, 4); // version needed
    localHdr.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHdr.writeUInt16LE(8, 8); // deflate
    localHdr.writeUInt16LE(dosTime, 10);
    localHdr.writeUInt16LE(dosDate, 12);
    localHdr.writeUInt32LE(crc, 14);
    localHdr.writeUInt32LE(compBuf.length, 18);
    localHdr.writeUInt32LE(rawBuf.length, 22);
    localHdr.writeUInt16LE(nameBuf.length, 26);
    localHdr.writeUInt16LE(0, 28);

    localParts.push(localHdr, nameBuf, compBuf);

    const centralHdr = Buffer.alloc(46);
    centralHdr.writeUInt32LE(0x02014b50, 0);
    centralHdr.writeUInt16LE(20, 4);
    centralHdr.writeUInt16LE(20, 6);
    centralHdr.writeUInt16LE(0x0800, 8);
    centralHdr.writeUInt16LE(8, 10);
    centralHdr.writeUInt16LE(dosTime, 12);
    centralHdr.writeUInt16LE(dosDate, 14);
    centralHdr.writeUInt32LE(crc, 16);
    centralHdr.writeUInt32LE(compBuf.length, 20);
    centralHdr.writeUInt32LE(rawBuf.length, 24);
    centralHdr.writeUInt16LE(nameBuf.length, 28);
    centralHdr.writeUInt16LE(0, 30);
    centralHdr.writeUInt16LE(0, 32);
    centralHdr.writeUInt16LE(0, 34);
    centralHdr.writeUInt16LE(0, 36);
    centralHdr.writeUInt32LE(0, 38);
    centralHdr.writeUInt32LE(offset, 42);

    centralParts.push(centralHdr, nameBuf);
    offset += localHdr.length + nameBuf.length + compBuf.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

// ==================== NGHỊ ĐỊNH 30/2020/NĐ-CP CONSTANTS & SETTINGS ====================
const STANDARD_QUOC_HIEU = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
const STANDARD_TIEU_NGU = "Độc lập - Tự do - Hạnh phúc";

const DEFAULT_ND30_SETTINGS = {
  autoGenerateOnAssign: true,
  useAiDrafting: true,
  nextDocNumber: 1,
  parentAgency: "ỦY BAN NHÂN DÂN TỈNH/THÀNH PHỐ",
  issuingAgency: "ỦY BAN NHÂN DÂN XÃ/PHƯỜNG",
  agencyCode: "UBND",
  departmentCode: "VP",
  location: "Hà Nội",
  signerTitle: "CHỦ TỊCH",
  signerName: "Nguyễn Văn A",
  marginTopMm: 20,
  marginBottomMm: 20,
  marginLeftMm: 30,
  marginRightMm: 15,
  quocHieuSize: 12,
  tieuNguSize: 13,
  agencyNameSize: 12,
  docTitleSize: 14,
  bodyFontSize: 14,
  firstLineIndentCm: 1.27,
  spaceBeforePt: 6,
  spaceAfterPt: 0,
  lineSpacingMultiplier: 1.15,
};

function decodeXmlEntities(str) {
  return String(str || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escapeXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function readAddInSettingsFromAppData(appDataDir = process.env.APPDATA || "") {
  if (!appDataDir) return null;
  const xmlPath = path.join(appDataDir, "NghiDinh30WordAddIn", "settings.xml");
  if (!fs.existsSync(xmlPath)) return null;

  try {
    const xml = fs.readFileSync(xmlPath, "utf-8");
    const getTag = (tag) => {
      const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
      return m ? decodeXmlEntities(m[1].trim()) : undefined;
    };
    const getNum = (tag, fallback) => {
      const raw = getTag(tag);
      if (raw === undefined || raw === "") return fallback;
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallback;
    };

    return {
      parentAgency: getTag("DefaultParentAgency") || DEFAULT_ND30_SETTINGS.parentAgency,
      issuingAgency: getTag("DefaultIssuingAgency") || DEFAULT_ND30_SETTINGS.issuingAgency,
      agencyCode: getTag("DefaultAgencyCode") || DEFAULT_ND30_SETTINGS.agencyCode,
      departmentCode: getTag("DefaultDepartmentCode") || DEFAULT_ND30_SETTINGS.departmentCode,
      location: getTag("DefaultLocation") || DEFAULT_ND30_SETTINGS.location,
      signerTitle: getTag("DefaultSignerTitle") || DEFAULT_ND30_SETTINGS.signerTitle,
      signerName: getTag("DefaultSignerName") || DEFAULT_ND30_SETTINGS.signerName,
      marginTopMm: getNum("PreferredMarginTopMm", 20),
      marginBottomMm: getNum("PreferredMarginBottomMm", 20),
      marginLeftMm: getNum("PreferredMarginLeftMm", 30),
      marginRightMm: getNum("PreferredMarginRightMm", 15),
      quocHieuSize: getNum("PreferredQuocHieuSize", 12),
      tieuNguSize: getNum("PreferredTieuNguSize", 13),
      agencyNameSize: getNum("PreferredAgencyNameSize", 12),
      docTitleSize: getNum("PreferredDocTitleSize", 14),
      bodyFontSize: getNum("PreferredBodyFontSize", 14),
      firstLineIndentCm: getNum("PreferredFirstLineIndentCm", 1.27),
      spaceBeforePt: getNum("PreferredSpaceBeforePt", 6),
      spaceAfterPt: getNum("PreferredSpaceAfterPt", 0),
      lineSpacingMultiplier: getNum("PreferredLineSpacingMultiplier", 1.15),
    };
  } catch (err) {
    console.warn("Could not read NghiDinh30WordAddIn settings.xml:", err?.message || err);
    return null;
  }
}

// ==================== UNIT CONVERSIONS & TEXT HELPERS ====================
function mmToTwips(mm) {
  return Math.round((Number(mm) || 0) * (1440 / 25.4));
}

function cmToTwips(cm) {
  return Math.round((Number(cm) || 0) * (1440 / 2.54));
}

function ptToHalfPt(pt) {
  return Math.round((Number(pt) || 14) * 2);
}

function ptToTwips(pt) {
  return Math.round((Number(pt) || 0) * 20);
}

function formatStandardLocationDate(location, date = new Date()) {
  const loc = String(location || "Hà Nội").trim() || "Hà Nội";
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const dayStr = day < 10 ? `0${day}` : String(day);
  // Theo Nghị định 30/2020/NĐ-CP: ngày 1-9 và tháng 1, 2 thêm số 0 ở đầu
  const monthStr = month === 1 || month === 2 ? `0${month}` : String(month);
  return `${loc}, ngày ${dayStr} tháng ${monthStr} năm ${d.getFullYear()}`;
}

function formatDocNumberPadded(num) {
  const raw = String(num ?? "01").trim();
  if (/^\d+$/.test(raw)) {
    const n = Number.parseInt(raw, 10);
    return n < 10 ? `0${n}` : String(n);
  }
  return raw || "01";
}

function formatDueDateVN(dueDateStr) {
  if (!dueDateStr) return "";
  const d = new Date(dueDateStr);
  if (Number.isNaN(d.getTime())) return String(dueDateStr).trim();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `trước ${hh}h${min} ngày ${dd}/${mm}/${yyyy}`;
}

function formatReceivedDateVN(dateStr) {
  if (!dateStr) return "";
  const m = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return `ngày ${m[3]} tháng ${m[2]} năm ${m[1]}`;
  }
  return String(dateStr).trim();
}

function normalizeCongVanSubject(rawSubject) {
  let s = String(rawSubject || "").trim();
  if (!s) {
    return "V/v phân công triển khai thực hiện nhiệm vụ chuyên môn";
  }
  if (/^v\/v\b/i.test(s)) {
    return "V/v " + s.replace(/^v\/v[:.\s]*/i, "").trim();
  }
  if (/^về việc\s+/i.test(s)) {
    return "V/v " + s.replace(/^về việc\s+/i, "").trim();
  }
  return "V/v " + s.charAt(0).toLowerCase() + s.slice(1);
}

function ensureClosingPunctuation(text) {
  const s = String(text || "").trim();
  if (!s) return "";
  if (s.endsWith("./.")) return s;
  return s.replace(/[.;/]+$/, "") + "./.";
}

function buildDeterministicAssignmentPlan(doc = {}, cfg = DEFAULT_ND30_SETTINGS) {
  const settings = { ...DEFAULT_ND30_SETTINGS, ...(cfg || {}) };
  const agency = String(settings.issuingAgency || "ỦY BAN NHÂN DÂN").trim();
  const agencyCode = String(settings.agencyCode || "UBND").trim() || "UBND";
  const deptCode = String(settings.departmentCode || "VP").trim() || "VP";

  const assignees = Array.isArray(doc.assignees) ? doc.assignees : [];
  const leadNames = assignees
    .filter((a) => a?.role !== "coord")
    .map((a) => a.displayName || a.userId)
    .filter(Boolean);
  const coordNames = assignees
    .filter((a) => a?.role === "coord")
    .map((a) => a.displayName || a.userId)
    .filter(Boolean);

  const primaryUnit = String(doc.department || "").trim();
  const recipients = [];
  if (primaryUnit) recipients.push(primaryUnit);
  for (const name of [...leadNames, ...coordNames]) {
    const label = primaryUnit ? `${name} (${primaryUnit})` : name;
    if (!recipients.includes(name) && !recipients.includes(label)) {
      if (!primaryUnit) recipients.push(name);
    }
  }
  if (recipients.length === 0) {
    recipients.push("Các phòng, ban chuyên môn và đơn vị liên quan");
  }

  const refParts = [];
  if (doc.docNumber) refParts.push(`Văn bản số ${String(doc.docNumber).trim()}`);
  if (doc.receivedDate) refParts.push(formatReceivedDateVN(doc.receivedDate));
  if (doc.issuer) refParts.push(`của ${String(doc.issuer).trim()}`);
  const refClause =
    refParts.length > 0
      ? `Thực hiện ${refParts.join(" ")}${doc.title ? ` về việc ${String(doc.title).trim()}` : ""}, `
      : "Căn cứ yêu cầu nhiệm vụ công tác, ";

  const preamble = `${refClause}${agency} yêu cầu ${
    primaryUnit || "các đơn vị, cá nhân có liên quan"
  } tập trung triển khai thực hiện các nội dung sau:`;

  const rawNoteLines = String(doc.notes || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*+\d.)\s]+/, "").trim())
    .filter(Boolean);

  const tasks =
    rawNoteLines.length > 0
      ? rawNoteLines
      : [
          `Nghiên cứu nội dung${doc.docNumber ? ` Văn bản số ${doc.docNumber}` : ""}${
            doc.title ? ` ("${doc.title}")` : ""
          } để tổ chức triển khai thực hiện đúng quy định và bảo đảm tiến độ.`,
          `Tham mưu, đề xuất phương án xử lý hoặc báo cáo kết quả thực hiện về ${agency} (qua ${deptCode}) để tổng hợp.`,
        ];

  const assigneeLabelParts = [];
  if (leadNames.length > 0) assigneeLabelParts.push(`Chủ trì: ${leadNames.join(", ")}`);
  if (coordNames.length > 0) assigneeLabelParts.push(`Phối hợp: ${coordNames.join(", ")}`);

  const departmentAssignments = [
    {
      departmentName: primaryUnit || (leadNames[0] || "Đơn vị, cá nhân phụ trách"),
      role: assigneeLabelParts.join("; ") || "Chủ trì tham mưu, thực hiện",
      tasks,
      deadline: formatDueDateVN(doc.dueDate),
    },
  ];

  const closing = ensureClosingPunctuation(
    `Yêu cầu ${
      primaryUnit ? `Thủ trưởng ${primaryUnit}` : "các đơn vị"
    } và cá nhân được phân công nghiêm túc triển khai thực hiện; báo cáo kết quả về ${agency} (qua ${deptCode}) đúng thời hạn quy định./.`
  );

  const noiNhan = [
    "Như trên;",
    `Lãnh đạo ${agency};`,
    `Lưu: VT, ${deptCode}.`,
  ];

  return {
    documentNumber: formatDocNumberPadded(settings.nextDocNumber || 1),
    symbolSuffix: `${agencyCode}-${deptCode}`,
    subject: normalizeCongVanSubject(doc.title),
    recipients,
    preambleParagraphs: [preamble],
    departmentAssignments,
    closingParagraph: closing,
    noiNhan,
  };
}

// ==================== OOXML BUILDER (NGHỊ ĐỊNH 30/2020/NĐ-CP) ====================
function buildRunXml(text, { fontSizePt = 14, bold = false, italic = false } = {}) {
  const sz = ptToHalfPt(fontSizePt);
  return (
    `<w:r>` +
    `<w:rPr>` +
    `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>` +
    (bold ? `<w:b/><w:bCs/>` : "") +
    (italic ? `<w:i/><w:iCs/>` : "") +
    `<w:color w:val="auto"/>` +
    `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` +
    `</w:rPr>` +
    `<w:t xml:space="preserve">${escapeXml(text)}</w:t>` +
    `</w:r>`
  );
}

function buildParagraphXml({
  runs = [],
  alignment = "left",
  firstLineIndentTwips = 0,
  leftIndentTwips = 0,
  spaceBeforeTwips = 0,
  spaceAfterTwips = 0,
  lineMultiplier = 1.15,
  singleSpacing = false,
  extraInnerXml = "",
} = {}) {
  const jc =
    alignment === "justify"
      ? "both"
      : alignment === "center"
      ? "center"
      : alignment === "right"
      ? "right"
      : "left";
  const lineVal = singleSpacing ? 240 : Math.round((lineMultiplier || 1.15) * 240);

  let indAttrs = "";
  if (leftIndentTwips > 0) indAttrs += ` w:left="${leftIndentTwips}"`;
  if (firstLineIndentTwips > 0) indAttrs += ` w:firstLine="${firstLineIndentTwips}"`;

  return (
    `<w:p>` +
    `<w:pPr>` +
    `<w:spacing w:before="${spaceBeforeTwips}" w:after="${spaceAfterTwips}" w:line="${lineVal}" w:lineRule="auto"/>` +
    (indAttrs ? `<w:ind${indAttrs}/>` : "") +
    `<w:jc w:val="${jc}"/>` +
    `</w:pPr>` +
    extraInnerXml +
    runs.join("") +
    `</w:p>`
  );
}

function buildVmlHorizontalLineRun({ widthPt, leftOffsetPt, topOffsetPt, altTag }) {
  const w = Math.max(20, Number(widthPt) || 60).toFixed(1);
  const left = Math.max(0, Number(leftOffsetPt) || 0).toFixed(1);
  const top = Math.max(8, Number(topOffsetPt) || 15).toFixed(1);
  return (
    `<w:r><w:pict>` +
    `<v:line id="${escapeXml(altTag || "ND30_LINE")}" alt="${escapeXml(altTag || "")}" ` +
    `style="position:absolute;left:0;text-align:left;margin-left:${left}pt;margin-top:${top}pt;width:${w}pt;height:0;z-index:251658240" ` +
    `from="0,0" to="${w}pt,0" strokeweight="0.75pt" strokecolor="#000000"/>` +
    `</w:pict></w:r>`
  );
}

function buildCongVanDocxBuffer(plan, cfg = DEFAULT_ND30_SETTINGS) {
  const settings = { ...DEFAULT_ND30_SETTINGS, ...(cfg || {}) };

  const pageW = mmToTwips(210);
  const pageH = mmToTwips(297);
  const mTop = mmToTwips(settings.marginTopMm);
  const mBottom = mmToTwips(settings.marginBottomMm);
  const mLeft = mmToTwips(settings.marginLeftMm);
  const mRight = mmToTwips(settings.marginRightMm);

  const usableTwips = pageW - mLeft - mRight; // ~9354 twips
  const col1W = Math.round(usableTwips * 0.44); // 44%
  const col2W = usableTwips - col1W; // 56%

  const col1Pt = col1W / 20;
  const col2Pt = col2W / 20;

  const parentAgency = String(settings.parentAgency || "").trim().toUpperCase();
  const issuingAgency = String(settings.issuingAgency || "").trim().toUpperCase();

  // Độ dài đường kẻ ngang dưới tên cơ quan ban hành (~42% độ dài dòng chữ, cân giữa ô cột 1)
  const estAgencyTextPt = Math.min(col1Pt - 16, Math.max(48, issuingAgency.length * settings.agencyNameSize * 0.52));
  const agencyLineWidthPt = Math.max(36, estAgencyTextPt * 0.42);
  const agencyLineLeftPt = (col1Pt - agencyLineWidthPt) / 2;

  // Độ dài đường kẻ ngang dưới Tiêu ngữ "Độc lập - Tự do - Hạnh phúc" (100% độ dài dòng chữ, ~159.5pt ở cỡ 13)
  const tieuNguLineWidthPt = settings.tieuNguSize >= 13.5 ? 171 : 159.5;
  const tieuNguLineLeftPt = (col2Pt - tieuNguLineWidthPt) / 2;

  const noBorderXml =
    `<w:tblBorders>` +
    `<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `<w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `</w:tblBorders>`;

  // 1. Header Table (2x2)
  const headerTableXml =
    `<w:tbl>` +
    `<w:tblPr>` +
    `<w:tblW w:w="${usableTwips}" w:type="dxa"/>` +
    `<w:jc w:val="center"/>` +
    noBorderXml +
    `<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar>` +
    `</w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${col1W}"/><w:gridCol w:w="${col2W}"/></w:tblGrid>` +
    // Row 1
    `<w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="${col1W}" w:type="dxa"/></w:tcPr>` +
    buildParagraphXml({
      alignment: "center",
      singleSpacing: true,
      runs: [buildRunXml(parentAgency, { fontSizePt: settings.agencyNameSize, bold: false })],
    }) +
    buildParagraphXml({
      alignment: "center",
      singleSpacing: true,
      spaceAfterTwips: ptToTwips(6),
      extraInnerXml: buildVmlHorizontalLineRun({
        widthPt: agencyLineWidthPt,
        leftOffsetPt: agencyLineLeftPt,
        topOffsetPt: settings.agencyNameSize + 3,
        altTag: "ND30_LINE_AGENCY",
      }),
      runs: [buildRunXml(issuingAgency, { fontSizePt: settings.agencyNameSize, bold: true })],
    }) +
    `</w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="${col2W}" w:type="dxa"/></w:tcPr>` +
    buildParagraphXml({
      alignment: "center",
      singleSpacing: true,
      runs: [buildRunXml(STANDARD_QUOC_HIEU, { fontSizePt: settings.quocHieuSize, bold: true })],
    }) +
    buildParagraphXml({
      alignment: "center",
      singleSpacing: true,
      spaceAfterTwips: ptToTwips(6),
      extraInnerXml: buildVmlHorizontalLineRun({
        widthPt: tieuNguLineWidthPt,
        leftOffsetPt: tieuNguLineLeftPt,
        topOffsetPt: settings.tieuNguSize + 3,
        altTag: "ND30_LINE_TIEUNGU",
      }),
      runs: [buildRunXml(STANDARD_TIEU_NGU, { fontSizePt: settings.tieuNguSize, bold: true })],
    }) +
    `</w:tc>` +
    `</w:tr>` +
    // Row 2
    `<w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="${col1W}" w:type="dxa"/></w:tcPr>` +
    buildParagraphXml({
      alignment: "center",
      singleSpacing: true,
      spaceBeforeTwips: ptToTwips(2),
      spaceAfterTwips: ptToTwips(2),
      runs: [
        buildRunXml(
          `Số: ${formatDocNumberPadded(plan.documentNumber)}/${String(
            plan.symbolSuffix || `${settings.agencyCode}-${settings.departmentCode}`
          ).trim()}`,
          { fontSizePt: 13, bold: false }
        ),
      ],
    }) +
    buildParagraphXml({
      alignment: "center",
      singleSpacing: true,
      spaceBeforeTwips: ptToTwips(2),
      spaceAfterTwips: ptToTwips(2),
      runs: [buildRunXml(normalizeCongVanSubject(plan.subject), { fontSizePt: 12, bold: false })],
    }) +
    `</w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="${col2W}" w:type="dxa"/></w:tcPr>` +
    buildParagraphXml({
      alignment: "center",
      singleSpacing: true,
      spaceBeforeTwips: ptToTwips(2),
      spaceAfterTwips: ptToTwips(2),
      runs: [
        buildRunXml(formatStandardLocationDate(settings.location, new Date()), {
          fontSizePt: 13,
          bold: false,
          italic: true,
        }),
      ],
    }) +
    `</w:tc>` +
    `</w:tr>` +
    `</w:tbl>`;

  // 2. Kính gửi block (Phụ lục I Mục II.9.a: chữ đứng 14pt, KHÔNG in đậm)
  const bodyBlocks = [];
  const recipients = Array.isArray(plan.recipients) ? plan.recipients.filter(Boolean) : [];
  if (recipients.length === 1) {
    bodyBlocks.push(
      buildParagraphXml({
        alignment: "center",
        spaceBeforeTwips: ptToTwips(6),
        spaceAfterTwips: ptToTwips(6),
        lineMultiplier: settings.lineSpacingMultiplier,
        runs: [
          buildRunXml(
            `Kính gửi: ${String(recipients[0]).trim().replace(/[.;]+$/, "")}`,
            { fontSizePt: settings.bodyFontSize, bold: false }
          ),
        ],
      })
    );
  } else if (recipients.length > 1) {
    bodyBlocks.push(
      buildParagraphXml({
        alignment: "left",
        leftIndentTwips: cmToTwips(3.5),
        spaceBeforeTwips: ptToTwips(6),
        spaceAfterTwips: ptToTwips(2),
        lineMultiplier: settings.lineSpacingMultiplier,
        runs: [buildRunXml("Kính gửi:", { fontSizePt: settings.bodyFontSize, bold: false })],
      })
    );
    recipients.forEach((rec, idx) => {
      const isLast = idx === recipients.length - 1;
      const clean = String(rec).trim().replace(/^-\s*/, "").replace(/[.;]+$/, "");
      bodyBlocks.push(
        buildParagraphXml({
          alignment: "left",
          leftIndentTwips: cmToTwips(5.15),
          spaceBeforeTwips: ptToTwips(1),
          spaceAfterTwips: ptToTwips(isLast ? 6 : 1),
          lineMultiplier: settings.lineSpacingMultiplier,
          runs: [
            buildRunXml(`- ${clean}${isLast ? "." : ";"}`, {
              fontSizePt: settings.bodyFontSize,
              bold: false,
            }),
          ],
        })
      );
    });
  }

  const indentTwips = cmToTwips(settings.firstLineIndentCm);
  const spaceBefore = ptToTwips(settings.spaceBeforePt);
  const spaceAfter = ptToTwips(settings.spaceAfterPt);

  // 3. Preamble
  for (const pre of plan.preambleParagraphs || []) {
    if (!String(pre || "").trim()) continue;
    bodyBlocks.push(
      buildParagraphXml({
        alignment: "justify",
        firstLineIndentTwips: indentTwips,
        spaceBeforeTwips: spaceBefore,
        spaceAfterTwips: spaceAfter,
        lineMultiplier: settings.lineSpacingMultiplier,
        runs: [buildRunXml(String(pre).trim(), { fontSizePt: settings.bodyFontSize })],
      })
    );
  }

  // 4. Department Assignments
  const assignments = Array.isArray(plan.departmentAssignments)
    ? plan.departmentAssignments
    : [];
  assignments.forEach((item, idx) => {
    if (!item || !String(item.departmentName || "").trim()) return;
    const roleSuffix = item.role ? ` (${String(item.role).trim()})` : "";
    const deptHeader = `${idx + 1}. Giao ${String(item.departmentName).trim()}${roleSuffix}:`;
    bodyBlocks.push(
      buildParagraphXml({
        alignment: "justify",
        firstLineIndentTwips: indentTwips,
        spaceBeforeTwips: spaceBefore,
        spaceAfterTwips: spaceAfter,
        lineMultiplier: settings.lineSpacingMultiplier,
        runs: [
          buildRunXml(deptHeader, {
            fontSizePt: settings.bodyFontSize,
            bold: true,
          }),
        ],
      })
    );

    for (const t of item.tasks || []) {
      const cleanTask = String(t || "")
        .trim()
        .replace(/^[-+•*]+\s*/, "");
      if (!cleanTask) continue;
      const ended = /[.;]$/.test(cleanTask) ? cleanTask : `${cleanTask}.`;
      bodyBlocks.push(
        buildParagraphXml({
          alignment: "justify",
          firstLineIndentTwips: indentTwips,
          spaceBeforeTwips: spaceBefore,
          spaceAfterTwips: spaceAfter,
          lineMultiplier: settings.lineSpacingMultiplier,
          runs: [buildRunXml(`- ${ended}`, { fontSizePt: settings.bodyFontSize })],
        })
      );
    }

    if (item.deadline && String(item.deadline).trim()) {
      const dl = String(item.deadline).trim().replace(/[.;]+$/, "");
      bodyBlocks.push(
        buildParagraphXml({
          alignment: "justify",
          firstLineIndentTwips: indentTwips,
          spaceBeforeTwips: spaceBefore,
          spaceAfterTwips: spaceAfter,
          lineMultiplier: settings.lineSpacingMultiplier,
          runs: [
            buildRunXml(`- Thời hạn hoàn thành/báo cáo: ${dl}.`, {
              fontSizePt: settings.bodyFontSize,
              italic: true,
            }),
          ],
        })
      );
    }
  });

  // 5. Closing Paragraph (bắt buộc kết thúc bằng ./.)
  if (plan.closingParagraph) {
    bodyBlocks.push(
      buildParagraphXml({
        alignment: "justify",
        firstLineIndentTwips: indentTwips,
        spaceBeforeTwips: spaceBefore,
        spaceAfterTwips: spaceAfter,
        lineMultiplier: settings.lineSpacingMultiplier,
        runs: [
          buildRunXml(ensureClosingPunctuation(plan.closingParagraph), {
            fontSizePt: settings.bodyFontSize,
          }),
        ],
      })
    );
  }

  // 6. Signature Table (50% / 50%)
  const sigColW = Math.floor(usableTwips / 2);
  const sigCol2W = usableTwips - sigColW;
  const noiNhanList =
    Array.isArray(plan.noiNhan) && plan.noiNhan.length > 0
      ? plan.noiNhan
      : ["Như trên;", `Lãnh đạo ${settings.issuingAgency};`, `Lưu: VT, ${settings.departmentCode}.`];

  const noiNhanParas = [
    buildParagraphXml({
      alignment: "left",
      singleSpacing: true,
      spaceBeforeTwips: ptToTwips(1),
      spaceAfterTwips: ptToTwips(1),
      runs: [buildRunXml("Nơi nhận:", { fontSizePt: 12, bold: true, italic: true })],
    }),
    ...noiNhanList
      .map((raw) => String(raw || "").trim())
      .filter(Boolean)
      .map((raw, i, arr) => {
        const clean = raw.replace(/^-\s*/, "").replace(/[.;]+$/, "");
        const suffix = i === arr.length - 1 ? "." : ";";
        return buildParagraphXml({
          alignment: "left",
          singleSpacing: true,
          spaceBeforeTwips: ptToTwips(1),
          spaceAfterTwips: ptToTwips(1),
          runs: [buildRunXml(`- ${clean}${suffix}`, { fontSizePt: 11 })],
        });
      }),
  ].join("");

  const signerTitle = String(settings.signerTitle || "CHỦ TỊCH").trim().toUpperCase();
  const signerName = String(settings.signerName || "").trim();
  const sigRightParas = [
    buildParagraphXml({
      alignment: "center",
      singleSpacing: true,
      spaceBeforeTwips: ptToTwips(1),
      spaceAfterTwips: ptToTwips(1),
      runs: [buildRunXml(signerTitle, { fontSizePt: settings.bodyFontSize, bold: true })],
    }),
    buildParagraphXml({ alignment: "center", singleSpacing: true, runs: [] }),
    buildParagraphXml({ alignment: "center", singleSpacing: true, runs: [] }),
    buildParagraphXml({ alignment: "center", singleSpacing: true, runs: [] }),
    buildParagraphXml({
      alignment: "center",
      singleSpacing: true,
      spaceBeforeTwips: ptToTwips(1),
      spaceAfterTwips: ptToTwips(1),
      runs: [buildRunXml(signerName, { fontSizePt: settings.bodyFontSize, bold: true })],
    }),
  ].join("");

  const sigTableXml =
    `<w:tbl>` +
    `<w:tblPr><w:tblW w:w="${usableTwips}" w:type="dxa"/>${noBorderXml}</w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${sigColW}"/><w:gridCol w:w="${sigCol2W}"/></w:tblGrid>` +
    `<w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="${sigColW}" w:type="dxa"/></w:tcPr>${noiNhanParas}</w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="${sigCol2W}" w:type="dxa"/></w:tcPr>${sigRightParas}</w:tc>` +
    `</w:tr>` +
    `</w:tbl>`;

  const emptySpacerPara = buildParagraphXml({ singleSpacing: true, runs: [] });

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:v="urn:schemas-microsoft-com:vml" ` +
    `xmlns:o="urn:schemas-microsoft-com:office:office">` +
    `<w:body>` +
    headerTableXml +
    emptySpacerPara +
    bodyBlocks.join("") +
    emptySpacerPara +
    sigTableXml +
    `<w:sectPr>` +
    `<w:headerReference w:type="first" r:id="rIdHeaderFirst"/>` +
    `<w:headerReference w:type="default" r:id="rIdHeaderDefault"/>` +
    `<w:pgSz w:w="${pageW}" w:h="${pageH}"/>` +
    `<w:pgMar w:top="${mTop}" w:right="${mRight}" w:bottom="${mBottom}" w:left="${mLeft}" w:header="567" w:footer="567" w:gutter="0"/>` +
    `<w:titlePg/>` +
    `</w:sectPr>` +
    `</w:body>` +
    `</w:document>`;

  // Header trang 1: trống (Mục I.5 Phụ lục I NĐ 30/2020: không hiển thị số trang ở trang 1)
  const headerFirstXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:hdr>`;

  // Header từ trang 2 trở đi: đánh số trang ở giữa lề trên, cỡ 13 Times New Roman, không có chữ "Trang"
  const headerDefaultXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>` +
    `<w:fldSimple w:instr=" PAGE ">` +
    buildRunXml("1", { fontSizePt: 13, bold: false, italic: false }) +
    `</w:fldSimple>` +
    `</w:p></w:hdr>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr>` +
    `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>` +
    `<w:sz w:val="${ptToHalfPt(settings.bodyFontSize)}"/><w:szCs w:val="${ptToHalfPt(settings.bodyFontSize)}"/>` +
    `</w:rPr></w:rPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    `</w:styles>`;

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
    `<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
    `</Types>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const docRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rIdHeaderFirst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>` +
    `<Relationship Id="rIdHeaderDefault" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>` +
    `</Relationships>`;

  return buildZipBuffer([
    { name: "[Content_Types].xml", content: contentTypesXml },
    { name: "_rels/.rels", content: rootRelsXml },
    { name: "word/_rels/document.xml.rels", content: docRelsXml },
    { name: "word/styles.xml", content: stylesXml },
    { name: "word/header1.xml", content: headerFirstXml },
    { name: "word/header2.xml", content: headerDefaultXml },
    { name: "word/document.xml", content: documentXml },
  ]);
}

// ==================== SERVICE CLASS ====================
class Nd30DocxService {
  constructor(geminiService, callGeminiRestApiFn) {
    this.geminiService = geminiService;
    this.callGeminiRestApi = callGeminiRestApiFn;
  }

  getSettings() {
    const pub = this.geminiService?.getPublicSettings?.() || {};
    return {
      ...DEFAULT_ND30_SETTINGS,
      ...(pub.nd30Settings || {}),
    };
  }

  async draftPlanWithAi(doc, settings) {
    const activeAi = this.geminiService?.getActiveAiConfig?.() || {};
    const apiKey = String(activeAi.apiKey || process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey || typeof this.geminiService?.callActiveAiForJson !== "function") {
      if (!apiKey || typeof this.callGeminiRestApi !== "function") {
        return null;
      }
    }

    const pub = this.geminiService?.getPublicSettings?.() || {};
    const model = String(activeAi.model || pub.geminiModel || "gemini-2.5-flash").trim();
    const assignees = Array.isArray(doc.assignees)
      ? doc.assignees.map((a) => `${a.displayName || a.userId} (${a.role === "coord" ? "Phối hợp" : "Chủ trì"})`).join(", ")
      : "";

    const prompt = `Bạn là Chuyên gia Văn thư - Hành chính nhà nước Việt Nam theo Nghị định số 30/2020/NĐ-CP.
Hãy soạn thảo nội dung CÔNG VĂN GIAO VIỆC của "${settings.issuingAgency}" (Cơ quan chủ quản: "${settings.parentAgency}", Người ký: "${settings.signerTitle} ${settings.signerName}") dựa trên thông tin giao việc sau:
- Số/Ký hiệu văn bản đến: ${doc.docNumber || "(Không có)"}
- Cơ quan ban hành văn bản đến: ${doc.issuer || "(Không rõ)"}
- Ngày văn bản đến: ${doc.receivedDate || "(Không rõ)"}
- Trích yếu nội dung: ${doc.title || ""}
- Phòng/đơn vị phụ trách: ${doc.department || "(Chưa phân phòng ban)"}
- Cá nhân thực hiện (Zalo): ${assignees || "(Chưa chọn)"}
- Hạn hoàn thành: ${formatDueDateVN(doc.dueDate) || "(Không nêu cụ thể)"}
- Nội dung chỉ đạo / yêu cầu: ${doc.notes || "(Triển khai thực hiện theo nội dung văn bản)"}

Trả về duy nhất 1 JSON hợp lệ gồm:
{
  "subject": "V/v ... (ngắn gọn, chuẩn Công văn NĐ 30/2020)",
  "recipients": ["Tên phòng ban / đơn vị nhận"],
  "preambleParagraphs": ["Đoạn mở đầu dẫn chiếu văn bản đến và nêu yêu cầu chung"],
  "departmentAssignments": [
    {
      "departmentName": "Tên phòng ban / đơn vị",
      "role": "Chủ trì tham mưu, thực hiện",
      "tasks": ["Nhiệm vụ cụ thể 1...", "Nhiệm vụ cụ thể 2..."],
      "deadline": "${formatDueDateVN(doc.dueDate)}"
    }
  ],
  "closingParagraph": "Đoạn kết thúc bắt buộc kết thúc bằng ./.",
  "noiNhan": ["Như trên;", "Lãnh đạo ${settings.issuingAgency};", "Lưu: VT, ${settings.departmentCode}."]
}`;

    try {
      let text = "";
      if (typeof this.geminiService?.callActiveAiForJson === "function") {
        text = await this.geminiService.callActiveAiForJson({
          parts: [{ text: prompt }],
          temperature: 0.2,
        });
      } else {
        const res = await this.callGeminiRestApi(apiKey, model, {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        });
        text = res?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
      if (!text) return null;
      const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed || typeof parsed !== "object") return null;

      const fallback = buildDeterministicAssignmentPlan(doc, settings);
      return {
        documentNumber: fallback.documentNumber,
        symbolSuffix: fallback.symbolSuffix,
        subject: normalizeCongVanSubject(parsed.subject || fallback.subject),
        recipients:
          Array.isArray(parsed.recipients) && parsed.recipients.length > 0
            ? parsed.recipients
            : fallback.recipients,
        preambleParagraphs:
          Array.isArray(parsed.preambleParagraphs) && parsed.preambleParagraphs.length > 0
            ? parsed.preambleParagraphs
            : fallback.preambleParagraphs,
        departmentAssignments:
          Array.isArray(parsed.departmentAssignments) && parsed.departmentAssignments.length > 0
            ? parsed.departmentAssignments
            : fallback.departmentAssignments,
        closingParagraph: ensureClosingPunctuation(
          parsed.closingParagraph || fallback.closingParagraph
        ),
        noiNhan:
          Array.isArray(parsed.noiNhan) && parsed.noiNhan.length > 0
            ? parsed.noiNhan
            : fallback.noiNhan,
      };
    } catch (err) {
      console.warn("AI ND30 drafting fallback to template:", err?.message || err);
      return null;
    }
  }

  async generateAssignmentDocx(doc, { targetDir, useAi = true, incrementCounter = true } = {}) {
    if (!doc) throw new Error("Thiếu thông tin công việc để tạo Công văn giao việc.");
    const settings = this.getSettings();

    let plan = null;
    if (useAi && settings.useAiDrafting !== false) {
      plan = await this.draftPlanWithAi(doc, settings);
    }
    if (!plan) {
      plan = buildDeterministicAssignmentPlan(doc, settings);
    }

    const buf = buildCongVanDocxBuffer(plan, settings);
    await fsp.mkdir(targetDir, { recursive: true });

    const safeDocNum = String(doc.docNumber || doc.id || "GiaoViec")
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F\s]+/g, "_")
      .slice(0, 45);
    const fileName = `CongVan_GiaoViec_${safeDocNum}_${formatDocNumberPadded(
      plan.documentNumber
    )}.docx`;
    const filePath = path.join(targetDir, fileName);
    await fsp.writeFile(filePath, buf);

    if (incrementCounter && this.geminiService?.saveSettings) {
      const nextNum = (Number.parseInt(settings.nextDocNumber, 10) || 1) + 1;
      this.geminiService.saveSettings({
        nd30Settings: {
          ...settings,
          nextDocNumber: nextNum,
        },
      });
    }

    return {
      attachment: {
        id: `att_nd30_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: fileName,
        path: filePath,
        size: buf.byteLength,
        ext: "docx",
        category: "assignment",
        isCompletionFile: false,
        generatedByNd30: true,
      },
      plan,
      filePath,
    };
  }
}

module.exports = {
  Nd30DocxService,
  DEFAULT_ND30_SETTINGS,
  readAddInSettingsFromAppData,
  buildDeterministicAssignmentPlan,
  buildCongVanDocxBuffer,
  formatStandardLocationDate,
  normalizeCongVanSubject,
  ensureClosingPunctuation,
};
