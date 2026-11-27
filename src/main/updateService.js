const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const { execFile, spawn } = require("node:child_process");

function normalizeGithubRepo(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const cleaned = s
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length < 2) return cleaned;
  return `${parts[0]}/${parts[1]}`;
}

function parseSemver(ver) {
  const clean = String(ver || "")
    .trim()
    .replace(/^v/i, "");
  if (!clean) return null;
  const [core, pre = ""] = clean.split("-", 2);
  const nums = core.split(".").map((n) => Number.parseInt(n, 10));
  if (nums.some((n) => Number.isNaN(n))) return null;
  return {
    major: nums[0] || 0,
    minor: nums[1] || 0,
    patch: nums[2] || 0,
    pre: pre.trim(),
  };
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) {
    return String(a || "").localeCompare(String(b || ""));
  }
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && !pb.pre) return -1;
  if (pa.pre === pb.pre) return 0;
  return pa.pre > pb.pre ? 1 : -1;
}

function pickReleaseAsset(release, isPackaged = false) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  if (isPackaged) {
    const exe = assets.find((a) => /\.exe$/i.test(a.name || ""));
    if (exe) {
      return {
        kind: "exe",
        name: exe.name,
        url: exe.browser_download_url,
        size: exe.size || 0,
      };
    }
  }
  const zipAsset = assets.find((a) => /\.zip$/i.test(a.name || ""));
  if (zipAsset) {
    return {
      kind: "zip",
      name: zipAsset.name,
      url: zipAsset.browser_download_url,
      size: zipAsset.size || 0,
    };
  }
  if (release?.zipball_url) {
    return {
      kind: "zip",
      name: `source-${release.tag_name || "release"}.zip`,
      url: release.zipball_url,
      size: 0,
    };
  }
  return null;
}

function githubApiJson(url, token = "") {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "zOffice-AutoUpdater/1.0",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const req = https.get(urlObj, { headers, timeout: 15000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        let parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch (_) {}

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const msg = parsed?.message || raw || `HTTP ${res.statusCode}`;
          if (res.statusCode === 404) {
            return reject(
              new Error(
                "Không tìm thấy Repository hoặc chưa có bản phát hành (Release) nào trên GitHub."
              )
            );
          }
          if (res.statusCode === 401 || res.statusCode === 403) {
            return reject(
              new Error(
                `GitHub từ chối truy cập (${res.statusCode}): ${msg}. Nếu repo là Private, hãy nhập GitHub Token.`
              )
            );
          }
          return reject(new Error(`GitHub API HTTP ${res.statusCode}: ${msg}`));
        }
        resolve(parsed);
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("Hết thời gian kết nối tới GitHub Releases (15s)."));
    });
    req.on("error", (err) => {
      reject(new Error(`Lỗi kết nối GitHub: ${err.message}`));
    });
  });
}

function downloadFileWithRedirects(url, destPath, token = "", onProgress = null, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 8) {
      return reject(new Error("Quá nhiều lượt chuyển hướng khi tải bản cập nhật."));
    }
    const urlObj = new URL(url);
    const client = urlObj.protocol === "http:" ? http : https;
    const headers = {
      "User-Agent": "zOffice-AutoUpdater/1.0",
      Accept: "application/octet-stream, application/zip, */*",
    };
    if (token && /(^|\.)github\.com$/i.test(urlObj.hostname)) {
      headers.Authorization = `Bearer ${token}`;
    }

    const req = client.get(urlObj, { headers, timeout: 60000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, urlObj).toString();
        return downloadFileWithRedirects(
          nextUrl,
          destPath,
          token,
          onProgress,
          depth + 1
        )
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`Tải tệp thất bại (HTTP ${res.statusCode}).`));
      }

      const totalBytes = Number(res.headers["content-length"] || 0);
      let receivedBytes = 0;
      const out = fs.createWriteStream(destPath);

      res.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (onProgress) {
          const percent =
            totalBytes > 0
              ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100))
              : null;
          onProgress({ receivedBytes, totalBytes, percent });
        }
      });

      res.pipe(out);
      out.on("finish", () => {
        out.close(() => resolve({ destPath, receivedBytes, totalBytes }));
      });
      out.on("error", (err) => {
        out.close(() => reject(err));
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("Hết thời gian tải gói cập nhật từ GitHub."));
    });
    req.on("error", (err) => {
      reject(new Error(`Lỗi tải gói cập nhật: ${err.message}`));
    });
  });
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true, timeout: 120000 },
      (err, stdout, stderr) => {
        if (err) {
          return reject(
            new Error(stderr?.trim() || err.message || "Lỗi PowerShell.")
          );
        }
        resolve(stdout);
      }
    );
  });
}

async function copyAppCodeSubset(srcRoot, destRoot) {
  const entriesToBackup = [
    "src",
    "apps-script",
    "scripts",
    "test",
    "package.json",
    "package-lock.json",
    "KhoiDongApp.bat",
    "README.md",
    "z.ico",
    "z.png",
  ];
  await fsp.mkdir(destRoot, { recursive: true });
  for (const name of entriesToBackup) {
    const srcPath = path.join(srcRoot, name);
    if (!fs.existsSync(srcPath)) continue;
    const destPath = path.join(destRoot, name);
    await fsp.cp(srcPath, destPath, { recursive: true, force: true });
  }
}

function locateExtractedAppRoot(extractDir) {
  const hasAppFiles = (dir) =>
    fs.existsSync(path.join(dir, "package.json")) &&
    fs.existsSync(path.join(dir, "src", "main", "main.js"));

  if (hasAppFiles(extractDir)) return extractDir;

  const children = fs
    .readdirSync(extractDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const child of children) {
    const candidate = path.join(extractDir, child.name);
    if (hasAppFiles(candidate)) return candidate;
  }
  return "";
}

class UpdateService {
  constructor(app, rootDir, dataDir, emitStatus = () => {}) {
    this.app = app;
    this.rootDir = rootDir;
    this.dataDir = dataDir;
    this.emitStatus = emitStatus;
    this.configPath = path.join(dataDir, "update-settings.json");
    this.updatesDir = path.join(dataDir, ".updates");
    this.backupsDir = path.join(this.updatesDir, "backups");
    this.stagingDir = path.join(this.updatesDir, "staging");
    this.config = this.loadConfig();
    this.lastCheckResult = null;
    this.isBusy = false;
    this.attemptedAutoTags = new Set();
  }

  getCurrentVersion() {
    try {
      const pkgPath = path.join(this.rootDir, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg?.version) return String(pkg.version).trim();
      }
    } catch (_) {}
    try {
      if (this.app && typeof this.app.getVersion === "function") {
        return this.app.getVersion();
      }
    } catch (_) {}
    return "1.0.0";
  }

  getDefaultGithubRepo() {
    try {
      const pkgPath = path.join(this.rootDir, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const rawRepo =
          typeof pkg?.repository === "string"
            ? pkg.repository
            : pkg?.repository?.url || "";
        return normalizeGithubRepo(rawRepo);
      }
    } catch (_) {}
    return "";
  }

  loadConfig() {
    const defaults = {
      githubRepo: this.getDefaultGithubRepo(),
      githubToken: "",
      autoCheckUpdates: true,
      autoInstallUpdates: true,
      includePrerelease: false,
      lastCheckedAt: "",
      history: [],
    };
    try {
      if (fs.existsSync(this.configPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        return {
          ...defaults,
          ...parsed,
          githubRepo: normalizeGithubRepo(
            parsed.githubRepo ?? defaults.githubRepo
          ),
          githubToken: String(parsed.githubToken || "").trim(),
          autoCheckUpdates:
            parsed.autoCheckUpdates !== undefined
              ? Boolean(parsed.autoCheckUpdates)
              : true,
          autoInstallUpdates:
            parsed.autoInstallUpdates !== undefined
              ? Boolean(parsed.autoInstallUpdates)
              : true,
          includePrerelease: Boolean(parsed.includePrerelease),
          history: Array.isArray(parsed.history) ? parsed.history : [],
        };
      }
    } catch (err) {
      console.error("Failed to read update-settings.json:", err);
    }
    return defaults;
  }

  saveConfig(patch = {}) {
    this.config = {
      ...this.config,
      githubRepo:
        patch.githubRepo !== undefined
          ? normalizeGithubRepo(patch.githubRepo)
          : this.config.githubRepo,
      githubToken:
        patch.githubToken !== undefined
          ? String(patch.githubToken || "").trim()
          : this.config.githubToken,
      autoCheckUpdates:
        patch.autoCheckUpdates !== undefined
          ? Boolean(patch.autoCheckUpdates)
          : this.config.autoCheckUpdates,
      autoInstallUpdates:
        patch.autoInstallUpdates !== undefined
          ? Boolean(patch.autoInstallUpdates)
          : this.config.autoInstallUpdates,
      includePrerelease:
        patch.includePrerelease !== undefined
          ? Boolean(patch.includePrerelease)
          : this.config.includePrerelease,
      lastCheckedAt:
        patch.lastCheckedAt !== undefined
          ? patch.lastCheckedAt
          : this.config.lastCheckedAt,
      history: Array.isArray(patch.history) ? patch.history : this.config.history,
    };
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(
      this.configPath,
      JSON.stringify(this.config, null, 2),
      "utf-8"
    );
    return this.getState();
  }

  listBackups() {
    if (!fs.existsSync(this.backupsDir)) return [];
    const dirs = fs
      .readdirSync(this.backupsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const full = path.join(this.backupsDir, d.name);
        let version = "";
        try {
          const pkg = JSON.parse(
            fs.readFileSync(path.join(full, "package.json"), "utf-8")
          );
          version = pkg?.version || "";
        } catch (_) {}
        const stat = fs.statSync(full);
        return {
          id: d.name,
          version,
          createdAt: stat.mtime.toISOString(),
          path: full,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return dirs;
  }

  getState() {
    return {
      currentVersion: this.getCurrentVersion(),
      isPackaged: Boolean(this.app?.isPackaged),
      githubRepo: this.config.githubRepo,
      hasGithubToken: Boolean(this.config.githubToken),
      githubToken: this.config.githubToken,
      autoCheckUpdates: this.config.autoCheckUpdates,
      autoInstallUpdates: this.config.autoInstallUpdates !== false,
      includePrerelease: this.config.includePrerelease,
      lastCheckedAt: this.config.lastCheckedAt,
      history: this.config.history || [],
      backups: this.listBackups(),
      lastCheckResult: this.lastCheckResult,
      isBusy: this.isBusy,
    };
  }

  async checkForUpdates({ silent = false, autoInstallIfNew = false } = {}) {
    const repo = normalizeGithubRepo(this.config.githubRepo);
    if (!repo || !repo.includes("/")) {
      if (silent) {
        return { configured: false, ...this.getState() };
      }
      throw new Error(
        "Chưa cấu hình Repository GitHub (VD: ten-tai-khoan/zOffice)."
      );
    }

    this.emitStatus({
      phase: "checking",
      message: `Đang kiểm tra bản phát hành mới từ ${repo}...`,
    });

    const rawReleases = await githubApiJson(
      `https://api.github.com/repos/${repo}/releases?per_page=10`,
      this.config.githubToken
    );

    const releases = (Array.isArray(rawReleases) ? rawReleases : [])
      .filter((r) => r && !r.draft)
      .filter((r) => this.config.includePrerelease || !r.prerelease)
      .map((r) => {
        const version = String(r.tag_name || r.name || "")
          .replace(/^v/i, "")
          .trim();
        return {
          id: r.id,
          tagName: r.tag_name || version,
          version,
          name: r.name || r.tag_name || version,
          body: r.body || "",
          prerelease: Boolean(r.prerelease),
          publishedAt: r.published_at || r.created_at || "",
          htmlUrl: r.html_url || `https://github.com/${repo}/releases`,
          asset: pickReleaseAsset(r, Boolean(this.app?.isPackaged)),
          zipballUrl: r.zipball_url || "",
          assets: Array.isArray(r.assets) ? r.assets : [],
        };
      });

    releases.sort((a, b) => compareSemver(b.version, a.version));

    const currentVersion = this.getCurrentVersion();
    const latest = releases[0] || null;
    const hasUpdate = Boolean(
      latest && compareSemver(latest.version, currentVersion) > 0
    );

    const checkedAt = new Date().toISOString();
    this.lastCheckResult = {
      configured: true,
      repo,
      currentVersion,
      hasUpdate,
      latestRelease: latest,
      releases,
      checkedAt,
    };
    this.saveConfig({ lastCheckedAt: checkedAt });

    this.emitStatus({
      phase: hasUpdate ? "available" : "up-to-date",
      hasUpdate,
      currentVersion,
      latestVersion: latest?.version || currentVersion,
      latestRelease: latest,
      message: hasUpdate
        ? `Có phiên bản mới v${latest.version} (hiện tại v${currentVersion})`
        : `Bạn đang dùng phiên bản mới nhất (v${currentVersion})`,
    });

    if (
      hasUpdate &&
      autoInstallIfNew &&
      !this.isBusy &&
      latest?.tagName &&
      !this.attemptedAutoTags.has(latest.tagName)
    ) {
      this.attemptedAutoTags.add(latest.tagName);
      this.emitStatus({
        phase: "auto-updating",
        hasUpdate: true,
        currentVersion,
        latestVersion: latest.version,
        latestRelease: latest,
        percent: 5,
        message: `Phát hiện bản mới v${latest.version} — đang tự động tải và cài đặt...`,
      });
      const installRes = await this.downloadAndInstallUpdate(latest.tagName);
      return {
        ...this.lastCheckResult,
        autoUpdateStarted: true,
        installRes,
        state: this.getState(),
      };
    }

    return {
      ...this.lastCheckResult,
      state: this.getState(),
    };
  }

  async downloadAndInstallUpdate(targetTag = "") {
    if (this.isBusy) {
      throw new Error("Đang có tiến trình cập nhật đang chạy.");
    }
    this.isBusy = true;
    try {
      const checkRes =
        this.lastCheckResult || (await this.checkForUpdates({ silent: false }));
      const releases = checkRes.releases || [];
      const target = targetTag
        ? releases.find((r) => r.tagName === targetTag || r.version === targetTag)
        : checkRes.latestRelease;

      if (!target) {
        throw new Error("Không tìm thấy bản phát hành phù hợp để cập nhật.");
      }

      const asset = pickReleaseAsset(target, Boolean(this.app?.isPackaged));
      if (!asset || !asset.url) {
        throw new Error("Bản phát hành này không có tệp gói cập nhật.");
      }

      await fsp.rm(this.stagingDir, { recursive: true, force: true });
      await fsp.mkdir(this.stagingDir, { recursive: true });

      const archivePath = path.join(this.stagingDir, asset.name);
      this.emitStatus({
        phase: "downloading",
        percent: 0,
        message: `Đang tải v${target.version}...`,
      });

      await downloadFileWithRedirects(
        asset.url,
        archivePath,
        this.config.githubToken,
        ({ receivedBytes, totalBytes, percent }) => {
          this.emitStatus({
            phase: "downloading",
            receivedBytes,
            totalBytes,
            percent: percent ?? 50,
            message:
              percent !== null
                ? `Đang tải v${target.version} (${percent}%)...`
                : `Đang tải v${target.version} (${Math.round(
                    receivedBytes / 1024
                  )} KB)...`,
          });
        }
      );

      if (asset.kind === "exe" && this.app?.isPackaged) {
        this.emitStatus({
          phase: "installing",
          percent: 100,
          message: "Đang mở trình cài đặt phiên bản mới...",
        });
        spawn(archivePath, [], { detached: true, stdio: "ignore" }).unref();
        setTimeout(() => this.app.quit(), 400);
        return { startedInstaller: true, version: target.version };
      }

      this.emitStatus({
        phase: "installing",
        percent: 100,
        message: `Đang giải nén & sao lưu phiên bản v${this.getCurrentVersion()}...`,
      });

      const extractDir = path.join(this.stagingDir, "extracted");
      await fsp.mkdir(extractDir, { recursive: true });
      const escapedArchive = archivePath.replace(/'/g, "''");
      const escapedExtract = extractDir.replace(/'/g, "''");
      await runPowerShell(
        `Expand-Archive -LiteralPath '${escapedArchive}' -DestinationPath '${escapedExtract}' -Force`
      );

      const newAppRoot = locateExtractedAppRoot(extractDir);
      if (!newAppRoot) {
        throw new Error(
          "Gói cập nhật không hợp lệ (không tìm thấy package.json và src/main/main.js)."
        );
      }

      const currentVersion = this.getCurrentVersion();
      const backupName = `v${currentVersion}_${Date.now()}`;
      const backupDir = path.join(this.backupsDir, backupName);
      await copyAppCodeSubset(this.rootDir, backupDir);

      let needsNpmInstall = false;
      try {
        const curPkg = JSON.parse(
          fs.readFileSync(path.join(this.rootDir, "package.json"), "utf-8")
        );
        const newPkg = JSON.parse(
          fs.readFileSync(path.join(newAppRoot, "package.json"), "utf-8")
        );
        needsNpmInstall =
          JSON.stringify(curPkg.dependencies || {}) !==
          JSON.stringify(newPkg.dependencies || {});
      } catch (_) {}

      const nextHistory = [
        {
          id: `upd_${Date.now()}`,
          action: "update",
          fromVersion: currentVersion,
          toVersion: target.version,
          tagName: target.tagName,
          backupId: backupName,
          at: new Date().toISOString(),
        },
        ...(this.config.history || []),
      ].slice(0, 25);

      this.saveConfig({ history: nextHistory });

      await this.spawnApplyAndRestartScript({
        sourceDir: newAppRoot,
        needsNpmInstall,
      });

      return {
        startedUpdate: true,
        fromVersion: currentVersion,
        toVersion: target.version,
        backupId: backupName,
      };
    } catch (err) {
      this.emitStatus({
        phase: "error",
        message: err?.message || "Lỗi cập nhật từ GitHub.",
      });
      throw err;
    } finally {
      this.isBusy = false;
    }
  }

  async rollbackBackup(backupId) {
    if (this.isBusy) {
      throw new Error("Đang có tiến trình cập nhật đang chạy.");
    }
    const safeId = path.basename(String(backupId || ""));
    const backupDir = path.join(this.backupsDir, safeId);
    if (!safeId || !fs.existsSync(path.join(backupDir, "package.json"))) {
      throw new Error("Không tìm thấy bản sao lưu hợp lệ để khôi phục.");
    }

    let restoredVersion = "";
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(backupDir, "package.json"), "utf-8")
      );
      restoredVersion = pkg?.version || "";
    } catch (_) {}

    const currentVersion = this.getCurrentVersion();
    const nextHistory = [
      {
        id: `rb_${Date.now()}`,
        action: "rollback",
        fromVersion: currentVersion,
        toVersion: restoredVersion || safeId,
        backupId: safeId,
        at: new Date().toISOString(),
      },
      ...(this.config.history || []),
    ].slice(0, 25);
    this.saveConfig({ history: nextHistory });

    this.emitStatus({
      phase: "installing",
      percent: 100,
      message: `Đang khôi phục phiên bản sao lưu ${restoredVersion || safeId}...`,
    });

    await this.spawnApplyAndRestartScript({
      sourceDir: backupDir,
      needsNpmInstall: false,
    });

    return { startedRollback: true, restoredVersion };
  }

  async spawnApplyAndRestartScript({ sourceDir, needsNpmInstall }) {
    await fsp.mkdir(this.updatesDir, { recursive: true });
    const scriptPath = path.join(this.updatesDir, "apply-update.ps1");
    const logPath = path.join(this.updatesDir, "last-update.log");
    const batPath = path.join(this.rootDir, "KhoiDongApp.bat");

    const escPs = (v) => String(v).replace(/'/g, "''");
    const psLines = [
      `$ErrorActionPreference = 'Stop'`,
      `$targetPid = ${process.pid}`,
      `$srcDir = '${escPs(sourceDir)}'`,
      `$destDir = '${escPs(this.rootDir)}'`,
      `$logFile = '${escPs(logPath)}'`,
      `$batFile = '${escPs(batPath)}'`,
      `$exclude = @('data', 'node_modules', '.git', '.updates')`,
      `"Starting update at $(Get-Date -Format o)" | Out-File -FilePath $logFile -Encoding utf8`,
      `for ($i = 0; $i -lt 40; $i++) {`,
      `  if (-not (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) { break }`,
      `  Start-Sleep -Milliseconds 300`,
      `}`,
      `Get-ChildItem -Path $srcDir -Force | ForEach-Object {`,
      `  if ($exclude -contains $_.Name) { return }`,
      `  $targetPath = Join-Path $destDir $_.Name`,
      `  if ($_.PSIsContainer) {`,
      `    Copy-Item -Path $_.FullName -Destination $destDir -Recurse -Force`,
      `  } else {`,
      `    Copy-Item -Path $_.FullName -Destination $targetPath -Force`,
      `  }`,
      `}`,
      needsNpmInstall
        ? `Push-Location $destDir; npm.cmd install --omit=dev >> $logFile 2>&1; Pop-Location`
        : `# No dependency changes`,
      `"Update applied cleanly at $(Get-Date -Format o)" | Add-Content -Path $logFile -Encoding utf8`,
      `if (Test-Path $batFile) {`,
      `  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'start', '""', ('"' + $batFile + '"') -WorkingDirectory $destDir`,
      `} else {`,
      `  Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -WorkingDirectory $destDir`,
      `}`,
    ];

    await fsp.writeFile(scriptPath, psLines.join("\r\n"), "utf-8");

    spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath],
      {
        detached: true,
        stdio: "ignore",
      }
    ).unref();

    setTimeout(() => {
      try {
        this.app.exit(0);
      } catch (_) {
        process.exit(0);
      }
    }, 350);
  }
}

module.exports = {
  UpdateService,
  normalizeGithubRepo,
  parseSemver,
  compareSemver,
  pickReleaseAsset,
};
