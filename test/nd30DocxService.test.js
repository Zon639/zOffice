const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { extractTextFromDocxBuffer } = require("../src/main/geminiService");
const {
  DEFAULT_ND30_SETTINGS,
  readAddInSettingsFromAppData,
  buildDeterministicAssignmentPlan,
  buildCongVanDocxBuffer,
  formatStandardLocationDate,
  normalizeCongVanSubject,
  ensureClosingPunctuation,
} = require("../src/main/nd30DocxService");

test("formatStandardLocationDate pads single-digit day and months 1, 2 per ND 30/2020", () => {
  assert.equal(
    formatStandardLocationDate("Bình Thạnh Đông", new Date(2026, 0, 5)),
    "Bình Thạnh Đông, ngày 05 tháng 01 năm 2026"
  );
  assert.equal(
    formatStandardLocationDate("Bình Thạnh Đông", new Date(2026, 2, 15)),
    "Bình Thạnh Đông, ngày 15 tháng 3 năm 2026"
  );
});

test("normalizeCongVanSubject and ensureClosingPunctuation enforce ND 30/2020 conventions", () => {
  assert.equal(
    normalizeCongVanSubject("Về việc triển khai chuyển đổi số"),
    "V/v triển khai chuyển đổi số"
  );
  assert.equal(
    normalizeCongVanSubject("Tổ chức kiểm tra định kỳ"),
    "V/v tổ chức kiểm tra định kỳ"
  );
  assert.equal(
    ensureClosingPunctuation("Yêu cầu nghiêm túc thực hiện."),
    "Yêu cầu nghiêm túc thực hiện./."
  );
});

test("readAddInSettingsFromAppData parses NghiDinh30WordAddIn settings.xml", () => {
  const tmpAppData = fs.mkdtempSync(path.join(os.tmpdir(), "nd30-appdata-"));
  const dir = path.join(tmpAppData, "NghiDinh30WordAddIn");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "settings.xml"),
    `<?xml version="1.0"?>
<NghiDinh30Settings>
  <PreferredMarginTopMm>20</PreferredMarginTopMm>
  <PreferredMarginLeftMm>30</PreferredMarginLeftMm>
  <DefaultParentAgency>ỦY BAN NHÂN DÂN XÃ</DefaultParentAgency>
  <DefaultIssuingAgency>BÌNH THẠNH ĐÔNG</DefaultIssuingAgency>
  <DefaultAgencyCode>UBND</DefaultAgencyCode>
  <DefaultDepartmentCode>VP</DefaultDepartmentCode>
  <DefaultLocation>Bình Thạnh Đông</DefaultLocation>
  <DefaultSignerTitle>CHỦ TỊCH</DefaultSignerTitle>
  <DefaultSignerName>Nguyễn Văn Nghĩa</DefaultSignerName>
</NghiDinh30Settings>`,
    "utf-8"
  );

  try {
    const parsed = readAddInSettingsFromAppData(tmpAppData);
    assert.equal(parsed.parentAgency, "ỦY BAN NHÂN DÂN XÃ");
    assert.equal(parsed.issuingAgency, "BÌNH THẠNH ĐÔNG");
    assert.equal(parsed.signerName, "Nguyễn Văn Nghĩa");
    assert.equal(parsed.marginLeftMm, 30);
  } finally {
    fs.rmSync(tmpAppData, { recursive: true, force: true });
  }
});

test("buildCongVanDocxBuffer generates valid ND 30/2020 DOCX archive with required structure", () => {
  const plan = buildDeterministicAssignmentPlan(
    {
      docNumber: "148/UBND-VX",
      issuer: "Sở Khoa học và Công nghệ",
      receivedDate: "2026-11-25",
      dueDate: "2026-11-30T17:00",
      department: "Phòng Kinh tế",
      title: "Triển khai kế hoạch chuyển đổi số quý IV",
      notes: "Rà soát hồ sơ\nTổng hợp báo cáo gửi về UBND xã",
      assignees: [{ displayName: "Nguyễn Văn A", role: "lead" }],
    },
    {
      ...DEFAULT_ND30_SETTINGS,
      parentAgency: "ỦY BAN NHÂN DÂN XÃ",
      issuingAgency: "BÌNH THẠNH ĐÔNG",
      agencyCode: "UBND",
      departmentCode: "VP",
      location: "Bình Thạnh Đông",
      signerTitle: "CHỦ TỊCH",
      signerName: "Nguyễn Văn Nghĩa",
      nextDocNumber: 5,
    }
  );

  const buf = buildCongVanDocxBuffer(plan, {
    ...DEFAULT_ND30_SETTINGS,
    parentAgency: "ỦY BAN NHÂN DÂN XÃ",
    issuingAgency: "BÌNH THẠNH ĐÔNG",
    signerTitle: "CHỦ TỊCH",
    signerName: "Nguyễn Văn Nghĩa",
  });

  // Verify ZIP signature and readable text via extractTextFromDocxBuffer
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  const extractedText = extractTextFromDocxBuffer(buf);
  assert.match(extractedText, /ỦY BAN NHÂN DÂN XÃ/);
  assert.match(extractedText, /BÌNH THẠNH ĐÔNG/);
  assert.match(extractedText, /CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM/);
  assert.match(extractedText, /Độc lập - Tự do - Hạnh phúc/);
  assert.match(extractedText, /Số: 05\/UBND-VP/);
  assert.match(extractedText, /Kính gửi: Phòng Kinh tế/);
  assert.match(extractedText, /\.\/\./);
  assert.match(extractedText, /Nơi nhận:/);
  assert.match(extractedText, /Nguyễn Văn Nghĩa/);

  // Verify PowerShell Expand-Archive extracts the DOCX cleanly and inspect XML rules
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nd30-docx-"));
  const docxPath = path.join(tmpDir, "test.docx");
  const extractDir = path.join(tmpDir, "out");
  try {
    fs.writeFileSync(docxPath, buf);
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${docxPath.replace(/'/g, "''")}', '${extractDir.replace(/'/g, "''")}')`,
      ],
      { windowsHide: true }
    );
    const docXml = fs.readFileSync(
      path.join(extractDir, "word", "document.xml"),
      "utf-8"
    );
    assert.match(docXml, /w:pgSz w:w="11906" w:h="16838"/);
    assert.match(docXml, /w:titlePg\//);
    assert.match(docXml, /ND30_LINE_AGENCY/);
    assert.match(docXml, /ND30_LINE_TIEUNGU/);

    const header2Xml = fs.readFileSync(
      path.join(extractDir, "word", "header2.xml"),
      "utf-8"
    );
    assert.match(header2Xml, /w:instr=" PAGE "/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("buildDeterministicAssignmentPlan matches office directive style with bold deadline", () => {
  const plan = buildDeterministicAssignmentPlan(
    {
      docNumber: "9315/SNV-TCBC",
      issuer: "Sở Nội vụ",
      receivedDate: "2026-11-20",
      dueDate: "2026-11-24T17:00",
      department: "Phòng Văn hóa - Xã hội",
      title: "lấy ý kiến hồ sơ dự thảo Thông tư sửa đổi, bổ sung một số điều của Thông tư số 05/2025/TT-BNV",
      notes: "Tham mưu UBND xã có ý kiến góp ý và gửi về Sở Nội vụ",
    },
    {
      ...DEFAULT_ND30_SETTINGS,
      parentAgency: "UBND XÃ BÌNH THẠNH ĐÔNG",
      issuingAgency: "VĂN PHÒNG HĐND VÀ UBND",
      agencyCode: "VP",
      departmentCode: "TH",
      location: "Bình Thạnh Đông",
      signerTitle: "CHÁNH VĂN PHÒNG",
      signerName: "Trần Thị Kim Pha",
      nextDocNumber: 12,
    }
  );

  assert.equal(plan.symbolSuffix, "VP-TH");
  assert.deepEqual(plan.recipients, ["Phòng Văn hóa - Xã hội"]);
  assert.equal(plan.bodyParagraphs.length, 4);
  assert.match(
    plan.bodyParagraphs[0],
    /^Ủy ban nhân dân xã Bình Thạnh Đông nhận được Công văn số 9315\/SNV-TCBC ngày 20 tháng 11 năm 2026 của Sở Nội vụ về việc lấy ý kiến/
  );
  assert.equal(
    plan.bodyParagraphs[1],
    "Về vấn đề này, Ủy ban nhân dân xã có ý kiến như sau:"
  );
  assert.equal(
    plan.bodyParagraphs[2],
    "Giao Phòng Văn hóa - Xã hội chủ trì, phối hợp với các cơ quan, đơn vị có liên quan nghiên cứu nội dung Công văn nêu trên. Tham mưu UBND xã có ý kiến góp ý và gửi về Sở Nội vụ **trước ngày 24/11/2026.**"
  );
  assert.equal(
    plan.bodyParagraphs[3],
    "Văn phòng HĐND và UBND xã thông báo ý kiến chỉ đạo của UBND xã đến Phòng Văn hóa - Xã hội biết, phối hợp triển khai thực hiện./."
  );
  assert.deepEqual(plan.noiNhan, [
    "Như trên;",
    "UBND xã;",
    "Lãnh đạo VP;",
    "Lưu: VT.",
  ]);

  const buf = buildCongVanDocxBuffer(plan, {
    ...DEFAULT_ND30_SETTINGS,
    parentAgency: "UBND XÃ BÌNH THẠNH ĐÔNG",
    issuingAgency: "VĂN PHÒNG HĐND VÀ UBND",
    agencyCode: "VP",
    departmentCode: "TH",
    location: "Bình Thạnh Đông",
    signerTitle: "CHÁNH VĂN PHÒNG",
    signerName: "Trần Thị Kim Pha",
  });
  const text = extractTextFromDocxBuffer(buf);
  assert.match(text, /Kính gửi: Phòng Văn hóa - Xã hội/);
  assert.match(text, /trước ngày 24\/11\/2026\./);
  assert.doesNotMatch(text, /\*\*trước ngày/);
  assert.match(text, /CHÁNH VĂN PHÒNG/);
  assert.match(text, /Trần Thị Kim Pha/);
});

test("buildDeterministicAssignmentPlan condenses multi-bullet notes and removes duplicate deadline", () => {
  const plan = buildDeterministicAssignmentPlan(
    {
      docNumber: "9315/SNV-TCBC",
      issuer: "Sở Nội vụ",
      receivedDate: "2026-11-20",
      dueDate: "2026-11-24T17:00",
      department: "Phòng Văn hóa - Xã hội",
      title: "V/v lấy ý kiến hồ sơ dự thảo Thông tư",
      notes:
        "• Nghiên cứu nội dung dự thảo Thông tư.\n• Tham mưu UBND xã có ý kiến góp ý và gửi về Sở Nội vụ trước ngày 24/11/2026.",
    },
    {
      ...DEFAULT_ND30_SETTINGS,
      parentAgency: "UBND XÃ BÌNH THẠNH ĐÔNG",
      issuingAgency: "VĂN PHÒNG HĐND VÀ UBND",
      agencyCode: "VP",
      departmentCode: "TH",
      location: "Bình Thạnh Đông",
      signerTitle: "CHÁNH VĂN PHÒNG",
      signerName: "Trần Thị Kim Pha",
    }
  );

  assert.equal(
    plan.bodyParagraphs[2],
    "Giao Phòng Văn hóa - Xã hội chủ trì, phối hợp với các cơ quan, đơn vị có liên quan nghiên cứu nội dung Công văn nêu trên. Tham mưu UBND xã có ý kiến góp ý và gửi về Sở Nội vụ **trước ngày 24/11/2026.**"
  );
});

test("draftPlanWithAi fills only red-slot fields while preserving exact fixed Word template", async () => {
  const { Nd30DocxService } = require("../src/main/nd30DocxService");
  const mockGeminiService = {
    getPublicSettings: () => ({
      nd30Settings: {
        ...DEFAULT_ND30_SETTINGS,
        parentAgency: "UBND XÃ BÌNH THẠNH ĐÔNG",
        issuingAgency: "VĂN PHÒNG HĐND VÀ UBND",
        agencyCode: "VP",
        departmentCode: "TH",
        location: "Bình Thạnh Đông",
        signerTitle: "CHÁNH VĂN PHÒNG",
        signerName: "Trần Thị Kim Pha",
      },
    }),
    getActiveAiConfig: () => ({ provider: "gemini", apiKey: "fake-key", model: "gemini-2.5-flash" }),
    callActiveAiForJson: async () =>
      JSON.stringify({
        subject: "V/v lấy ý kiến hồ sơ dự thảo Thông tư 05/2025/TT-BNV",
        incomingDocType: "Công văn",
        aboutClause: "về việc lấy ý kiến hồ sơ dự thảo Thông tư 05/2025/TT-BNV",
        recipients: ["Phòng Văn hóa - Xã hội"],
        shortActionClause: "Tham mưu UBND xã có ý kiến góp ý và gửi về Sở Nội vụ trước ngày 24/11/2026.",
      }),
  };

  const svc = new Nd30DocxService(mockGeminiService);
  const plan = await svc.draftPlanWithAi(
    {
      docNumber: "9315/SNV-TCBC",
      issuer: "Sở Nội vụ",
      receivedDate: "2026-11-20",
      dueDate: "2026-11-24T17:00",
      department: "Phòng Văn hóa - Xã hội",
      title: "Lấy ý kiến hồ sơ dự thảo Thông tư 05/2025/TT-BNV",
      notes: "• Nghiên cứu...\n• Góp ý...",
    },
    svc.getSettings()
  );

  assert.equal(plan.bodyParagraphs.length, 4);
  assert.equal(
    plan.bodyParagraphs[1],
    "Về vấn đề này, Ủy ban nhân dân xã có ý kiến như sau:"
  );
  assert.equal(
    plan.bodyParagraphs[2],
    "Giao Phòng Văn hóa - Xã hội chủ trì, phối hợp với các cơ quan, đơn vị có liên quan nghiên cứu nội dung Công văn nêu trên. Tham mưu UBND xã có ý kiến góp ý và gửi về Sở Nội vụ **trước ngày 24/11/2026.**"
  );
  assert.equal(
    plan.bodyParagraphs[3],
    "Văn phòng HĐND và UBND xã thông báo ý kiến chỉ đạo của UBND xã đến Phòng Văn hóa - Xã hội biết, phối hợp triển khai thực hiện./."
  );
});
