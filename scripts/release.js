const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");

function findExe(name, candidates) {
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return name;
}

const GH_EXE = findExe("gh", [
  "C:\\Program Files\\GitHub CLI\\gh.exe",
  path.join(process.env.LOCALAPPDATA || "", "Programs\\GitHub CLI\\gh.exe"),
]);

const GIT_EXE = findExe("git", [
  "C:\\Program Files\\Git\\cmd\\git.exe",
  path.join(process.env.LOCALAPPDATA || "", "Microsoft\\WinGet\\Links\\git.exe"),
  path.join(process.env.LOCALAPPDATA || "", "Programs\\Git\\cmd\\git.exe"),
]);

function run(exe, args, opts = {}) {
  console.log(`> ${path.basename(exe)} ${args.join(" ")}`);
  return execFileSync(exe, args, {
    cwd: ROOT_DIR,
    stdio: opts.capture ? "pipe" : "inherit",
    encoding: "utf-8",
    ...opts,
  });
}

async function buildCleanZip(version) {
  const distDir = path.join(ROOT_DIR, "data", ".updates", "releases");
  await fsp.mkdir(distDir, { recursive: true });
  const stageDir = path.join(distDir, `stage-v${version}`);
  const zipPath = path.join(distDir, `zOffice-v${version}.zip`);

  await fsp.rm(stageDir, { recursive: true, force: true });
  await fsp.rm(zipPath, { force: true });
  await fsp.mkdir(stageDir, { recursive: true });

  const entries = [
    ".gitignore",
    "KhoiDongApp.bat",
    "package.json",
    "package-lock.json",
    "README.md",
    "z.ico",
    "z.png",
    "src",
    "apps-script",
    "build",
    "scripts",
    "test",
  ];

  for (const entry of entries) {
    const src = path.join(ROOT_DIR, entry);
    if (!fs.existsSync(src)) continue;
    await fsp.cp(src, path.join(stageDir, entry), { recursive: true, force: true });
  }

  const escStage = stageDir.replace(/'/g, "''");
  const escZip = zipPath.replace(/'/g, "''");
  run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${escStage}\\*' -DestinationPath '${escZip}' -Force`,
  ]);
  await fsp.rm(stageDir, { recursive: true, force: true });
  return zipPath;
}

async function buildWindowsInstaller(version) {
  const builderCmd = path.join(ROOT_DIR, "node_modules", ".bin", "electron-builder.cmd");
  const expectedExe = path.join(ROOT_DIR, "dist", `zOffice-Setup-${version}.exe`);
  if (!fs.existsSync(builderCmd)) {
    console.warn("electron-builder not found; skipping .exe installer build.");
    return null;
  }
  run("cmd.exe", ["/c", builderCmd, "--win", "nsis"]);
  if (!fs.existsSync(expectedExe)) {
    throw new Error(`Không tìm thấy tệp cài đặt sau khi build: ${expectedExe}`);
  }
  return expectedExe;
}

async function main() {
  const args = process.argv.slice(2);
  const pkgPath = path.join(ROOT_DIR, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  let nextVersion = pkg.version || "1.0.0";
  let notes = "";

  if (args[0] && /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(args[0])) {
    nextVersion = args[0];
    notes = args.slice(1).join(" ").trim();
    if (nextVersion !== pkg.version) {
      pkg.version = nextVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
      console.log(`Updated package.json version -> ${nextVersion}`);
    }
  } else if (args.length > 0) {
    notes = args.join(" ").trim();
  }

  const tag = `v${nextVersion}`;
  const repo = typeof pkg.repository === "string" ? pkg.repository : "Zon639/zOffice";

  // 1. Run all unit tests before releasing
  run(process.execPath, [
    "--test",
    "test/aiAndUpdate.test.js",
    "test/googleSheetService.test.js",
    "test/nd30DocxService.test.js",
  ]);

  // 2. Commit & push via git if available
  try {
    run(GIT_EXE, ["status", "--short"]);
    run(GIT_EXE, ["add", "-A"]);
    const diff = run(GIT_EXE, ["status", "--porcelain"], { capture: true }).trim();
    if (diff) {
      run(GIT_EXE, ["commit", "-m", `Release ${tag}${notes ? `: ${notes}` : ""}`]);
    }
    run(GIT_EXE, ["push", "-u", "origin", "main"]);
  } catch (err) {
    console.warn("Git push note:", err.message);
  }

  // 3. Build clean release zip AND Windows .exe installer
  const zipPath = await buildCleanZip(nextVersion);
  console.log(`Built release package: ${zipPath}`);
  const exePath = await buildWindowsInstaller(nextVersion);
  if (exePath) {
    console.log(`Built Windows installer: ${exePath}`);
  }

  // 4. Create GitHub Release with both .exe (for installed users) and .zip (for source users)
  const releaseNotes =
    notes ||
    `Phát hành zOffice ${tag}\n\n- Đồng bộ mã nguồn & cập nhật tự động qua GitHub Releases.\n- Đính kèm bộ cài zOffice-Setup-${nextVersion}.exe (kèm đầy đủ thư viện & Add-in Word NĐ 30/2020) và gói cập nhật mã nguồn .zip.\n- An toàn dữ liệu cục bộ (không ghi đè thư mục data/).`;

  const assets = [exePath, zipPath].filter(Boolean);

  try {
    run(GH_EXE, [
      "release",
      "create",
      tag,
      ...assets,
      "--repo",
      repo,
      "--title",
      `zOffice ${tag}`,
      "--notes",
      releaseNotes,
    ]);
    console.log(`\n✅ Published GitHub Release ${tag} to ${repo}!`);
  } catch (err) {
    console.error("Failed to create GitHub Release:", err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
