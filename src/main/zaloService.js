const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const dns = require("node:dns");
const http = require("node:http");
const https = require("node:https");
const zlib = require("node:zlib");
const { nativeImage } = require("electron");
const {
  Zalo,
  ThreadType,
  Urgency,
  LoginQRCallbackEventType,
} = require("zca-js");

try {
  dns.setDefaultResultOrder("ipv4first");
} catch (_) {}

/**
 * Fallback/Primary HTTP request using Node's native http/https module.
 * Eliminates Undici's "TypeError: fetch failed" on stale keep-alive sockets or large Buffer POSTs.
 */
function nodeHttpRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const isHttps = parsedUrl.protocol === "https:";
    const lib = isHttps ? https : http;

    const method = (options.method || "GET").toUpperCase();
    const headers = { ...(options.headers || {}) };

    let bodyBuffer = null;
    if (options.body != null) {
      if (Buffer.isBuffer(options.body)) {
        bodyBuffer = options.body;
      } else if (options.body instanceof Uint8Array) {
        bodyBuffer = Buffer.from(options.body);
      } else if (options.body instanceof URLSearchParams) {
        bodyBuffer = Buffer.from(options.body.toString(), "utf-8");
      } else if (typeof options.body === "string") {
        bodyBuffer = Buffer.from(options.body, "utf-8");
      } else {
        bodyBuffer = Buffer.from(String(options.body), "utf-8");
      }
      headers["Content-Length"] = String(bodyBuffer.byteLength);
    }

    // Request gzip/deflate/br only (avoid zstd if decompressing in node)
    headers["Accept-Encoding"] = "gzip, deflate, br";

    const req = lib.request(
      parsedUrl,
      {
        method,
        headers,
        family: 4,
        timeout: 45000,
        agent: false, // Fresh socket avoids stale keep-alive connection resets on POST uploads
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          let rawBuffer = Buffer.concat(chunks);
          const encoding = (res.headers["content-encoding"] || "").toLowerCase();

          try {
            if (encoding === "gzip") {
              rawBuffer = zlib.gunzipSync(rawBuffer);
            } else if (encoding === "deflate") {
              rawBuffer = zlib.inflateSync(rawBuffer);
            } else if (encoding === "br") {
              rawBuffer = zlib.brotliDecompressSync(rawBuffer);
            }
          } catch (_) {
            // Keep rawBuffer if decompression fails
          }

          const resHeaders = new Headers();
          const setCookies = [];
          for (const [k, v] of Object.entries(res.headers)) {
            if (v === undefined) continue;
            if (k.toLowerCase() === "set-cookie") {
              const arr = Array.isArray(v) ? v : [v];
              for (const c of arr) {
                setCookies.push(c);
                resHeaders.append("set-cookie", c);
              }
            } else if (k.toLowerCase() !== "content-encoding" && k.toLowerCase() !== "content-length") {
              resHeaders.set(k, Array.isArray(v) ? v.join(", ") : String(v));
            }
          }

          const responseObj = new Response(rawBuffer, {
            status: res.statusCode || 200,
            statusText: res.statusMessage || "",
            headers: resHeaders,
          });

          if (setCookies.length > 0 && typeof responseObj.headers.getSetCookie !== "function") {
            responseObj.headers.getSetCookie = () => setCookies;
          }

          resolve(responseObj);
        });
      }
    );

    if (options.signal) {
      if (options.signal.aborted) {
        req.destroy(new Error("Aborted"));
        return reject(new Error("Aborted"));
      }
      options.signal.addEventListener(
        "abort",
        () => {
          req.destroy(new Error("Aborted"));
          reject(new Error("Aborted"));
        },
        { once: true }
      );
    }

    req.on("timeout", () => {
      req.destroy(new Error("Request timeout"));
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (bodyBuffer) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}

/**
 * Resilient polyfill for zca-js:
 * Normalizes headers/body, retries automatically on transient network/socket errors,
 * and uses nodeHttpRequest fallback so "TypeError: fetch failed" never breaks file uploads.
 */
async function resilientZaloFetch(url, options = {}) {
  const cleanOptions = { ...options };
  if ("agent" in cleanOptions && !cleanOptions.agent) {
    delete cleanOptions.agent;
  }

  const headers = { ...(cleanOptions.headers || {}) };
  if (cleanOptions.body instanceof URLSearchParams) {
    cleanOptions.body = cleanOptions.body.toString();
  } else if (Buffer.isBuffer(cleanOptions.body)) {
    headers["Content-Length"] = String(cleanOptions.body.byteLength);
  }
  cleanOptions.headers = headers;

  const isFileUpload =
    String(url).includes("/upload") ||
    String(url).includes("/asyncfile/") ||
    String(url).includes("/photo_original/") ||
    Buffer.isBuffer(cleanOptions.body);

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // For file uploads or retry attempts, use Node's native https.request with fresh socket
      if (isFileUpload || attempt > 1) {
        return await nodeHttpRequest(url, cleanOptions);
      }
      return await global.fetch(url, cleanOptions);
    } catch (err) {
      lastErr = err;
      if (cleanOptions.signal && cleanOptions.signal.aborted) {
        throw err;
      }
      console.warn(
        `[Zalo HTTP Retry ${attempt}/3] ${options?.method || "GET"} ${String(url).slice(0, 80)}:`,
        err?.cause?.message || err?.message || err
      );
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 350 * attempt));
      }
    }
  }

  const detail = lastErr?.cause?.message || lastErr?.message || "Lỗi kết nối mạng";
  throw new Error(`Không thể kết nối máy chủ Zalo (${detail})`);
}

class ZaloService {
  constructor(dataDir, sendToRenderer) {
    this.dataDir = dataDir;
    this.sendToRenderer = sendToRenderer;
    this.sessionPath = path.join(dataDir, "zalo-session.json");
    this.contactsPath = path.join(dataDir, "zalo-contacts.json");

    this.api = null;
    this.accountInfo = null;
    this.isLoggedIn = false;
    this.loginStatus = "disconnected"; // disconnected | qr_waiting | qr_scanned | connecting | connected
    this.currentQRActions = null;
    this.keepAliveTimer = null;
    this.lastCredentials = this.loadSavedCredentialsFromDisk();
    if (this.lastCredentials?.savedAccountInfo && !this.accountInfo) {
      this.accountInfo = this.lastCredentials.savedAccountInfo;
    }
    this.contacts = this.loadCachedContacts();
  }

  /**
   * Chuẩn hóa dữ liệu Cookie đầu vào (hỗ trợ mảng JSON, J2Team JSON, tough-cookie JSON hoặc chuỗi Cookie header)
   * và loại bỏ các cookie hết hạn (value === "EXPIRED" hoặc maxAge <= 0)
   */
  normalizeCookieList(rawCookie) {
    let list = [];
    if (!rawCookie) return list;

    let parsed = rawCookie;
    if (typeof rawCookie === "string") {
      const trimmed = rawCookie.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        parsed = JSON.parse(trimmed);
      } else {
        // Chuỗi header dạng "zpw_sek=...; zpsid=..."
        const pairs = trimmed.split(";").map((s) => s.trim()).filter(Boolean);
        for (const pair of pairs) {
          const eqIdx = pair.indexOf("=");
          if (eqIdx > 0) {
            const k = pair.slice(0, eqIdx).trim();
            const v = pair.slice(eqIdx + 1).trim();
            list.push({
              key: k,
              name: k,
              value: v,
              domain: k === "zpw_sek" ? "chat.zalo.me" : "zalo.me",
              path: "/",
              secure: true,
            });
          }
        }
        return list;
      }
    }

    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && Array.isArray(parsed.cookies)) {
      list = parsed.cookies;
    } else if (parsed && Array.isArray(parsed.cookie)) {
      list = parsed.cookie;
    } else if (parsed && parsed.cookie && Array.isArray(parsed.cookie.cookies)) {
      list = parsed.cookie.cookies;
    }

    return list
      .filter((c) => {
        if (!c || typeof c !== "object") return false;
        const val = String(c.value ?? "");
        if (!val || val === "EXPIRED") return false;
        if (typeof c.maxAge === "number" && c.maxAge <= 0) return false;
        return true;
      })
      .map((c) => ({
        ...c,
        key: c.key || c.name,
        name: c.name || c.key,
      }));
  }

  loadSavedCredentialsFromDisk() {
    try {
      if (fs.existsSync(this.sessionPath)) {
        const raw = fs.readFileSync(this.sessionPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && parsed.imei && parsed.cookie) {
          parsed.cookie = this.normalizeCookieList(parsed.cookie);
          return parsed;
        }
      }
    } catch (err) {
      console.warn("Failed to read zalo-session.json:", err?.message || err);
    }
    return null;
  }

  persistCurrentSession(fallbackCreds = null) {
    try {
      let liveCookies = null;
      let liveImei = "";
      let liveUserAgent = "";

      if (this.api) {
        try {
          const jar =
            typeof this.api.getCookie === "function" ? this.api.getCookie() : null;
          if (jar && typeof jar.toJSON === "function") {
            const jarJson = jar.toJSON();
            if (jarJson && Array.isArray(jarJson.cookies) && jarJson.cookies.length > 0) {
              liveCookies = this.normalizeCookieList(jarJson.cookies);
            }
          }
          const ctx =
            typeof this.api.getContext === "function" ? this.api.getContext() : null;
          if (ctx) {
            liveImei = ctx.imei || "";
            liveUserAgent = ctx.userAgent || "";
          }
        } catch (_) {}
      }

      const base = fallbackCreds || this.lastCredentials || {};
      const finalCookies =
        liveCookies && liveCookies.length > 0
          ? liveCookies
          : this.normalizeCookieList(base.cookie);
      const finalImei = String(liveImei || base.imei || "").trim();
      const finalUA =
        String(liveUserAgent || base.userAgent || "").trim() ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";

      if (!finalImei || !finalCookies || finalCookies.length === 0) {
        return null;
      }

      const sessionObj = {
        imei: finalImei,
        userAgent: finalUA,
        language: "vi",
        cookie: finalCookies,
        savedAccountInfo: this.accountInfo || base.savedAccountInfo || null,
        savedAt: new Date().toISOString(),
      };

      this.lastCredentials = sessionObj;
      fs.writeFileSync(
        this.sessionPath,
        JSON.stringify(sessionObj, null, 2),
        "utf-8"
      );
      return sessionObj;
    } catch (err) {
      console.warn("Could not persist Zalo session:", err?.message || err);
      return null;
    }
  }

  startKeepAliveLoop() {
    this.stopKeepAliveLoop();
    // Định kỳ 8 phút gọi keepAlive và lưu lại Cookie mới nhất xuống đĩa
    this.keepAliveTimer = setInterval(async () => {
      if (!this.api || !this.isLoggedIn) return;
      try {
        if (typeof this.api.keepAlive === "function") {
          await this.api.keepAlive();
        }
        this.persistCurrentSession();
      } catch (err) {
        console.warn("[Zalo KeepAlive Warning]:", err?.message || err);
      }
    }, 8 * 60 * 1000);
  }

  stopKeepAliveLoop() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  getSavedCredentials() {
    const saved = this.loadSavedCredentialsFromDisk() || this.lastCredentials;
    if (!saved) {
      return {
        hasSavedSession: false,
        imei: "",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
        cookieJson: "",
        savedAccountInfo: null,
        savedAt: null,
      };
    }
    return {
      hasSavedSession: true,
      imei: saved.imei || "",
      userAgent:
        saved.userAgent ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
      cookieJson: JSON.stringify(saved.cookie || [], null, 2),
      savedAccountInfo: saved.savedAccountInfo || this.accountInfo || null,
      savedAt: saved.savedAt || null,
    };
  }

  createZaloInstance() {
    return new Zalo({
      selfListen: true,
      checkUpdate: false,
      logging: false,
      polyfill: resilientZaloFetch,
      imageMetadataGetter: async (filePath) => {
        try {
          const stat = await fsp.stat(filePath);
          const img = nativeImage.createFromPath(filePath);
          const size = img.getSize();
          return {
            width: size.width || 800,
            height: size.height || 600,
            size: stat.size,
          };
        } catch (err) {
          return null;
        }
      },
    });
  }

  loadCachedContacts() {
    try {
      if (fs.existsSync(this.contactsPath)) {
        const raw = fs.readFileSync(this.contactsPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.error("Failed to read cached contacts:", err);
    }
    return [];
  }

  saveContactsToDisk(contacts) {
    try {
      this.contacts = contacts;
      fs.writeFileSync(this.contactsPath, JSON.stringify(contacts, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to save contacts:", err);
    }
  }

  getStatus() {
    const saved = this.lastCredentials || this.loadSavedCredentialsFromDisk();
    return {
      isLoggedIn: this.isLoggedIn,
      loginStatus: this.loginStatus,
      accountInfo: this.accountInfo || saved?.savedAccountInfo || null,
      contactCount: this.isLoggedIn ? this.contacts.length : 0,
      hasSavedSession: fs.existsSync(this.sessionPath),
      savedAt: saved?.savedAt || null,
    };
  }

  getContacts() {
    if (!this.isLoggedIn) {
      return [];
    }
    return this.contacts;
  }

  startListenerSafely() {
    if (!this.api || !this.api.listener) return;
    try {
      // Only start if WebSocket is not already open/connecting
      if (this.api.listener.ws && (this.api.listener.ws.readyState === 0 || this.api.listener.ws.readyState === 1)) {
        return;
      }
      this.api.listener.removeAllListeners("error");
      this.api.listener.on("error", (err) => {
        console.warn("[Zalo Listener Warning]:", err?.message || err);
      });
      this.api.listener.on("disconnected", (code, reason) => {
        console.warn("[Zalo Listener Disconnected]:", code, reason);
      });
      this.api.listener.start({ retryOnClose: true });
    } catch (err) {
      console.warn("[Zalo Listener Start]:", err?.message || err);
    }
  }

  async ensureListenerReadyForUpload() {
    if (!this.api || !this.api.listener) return;
    const listener = this.api.listener;

    // If WebSocket is already open and has cipherKey, it's ready
    if (listener.ws && listener.ws.readyState === 1 && listener.cipherKey) {
      return;
    }

    // If closed or null, restart it and wait for cipher_key
    if (!listener.ws || listener.ws.readyState === 2 || listener.ws.readyState === 3) {
      try {
        listener.stop();
      } catch (_) {}
      this.startListenerSafely();
    }

    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 4000);
      const onReady = () => {
        clearTimeout(timeout);
        resolve();
      };
      listener.once("cipher_key", onReady);
    });
  }

  async fetchProfileAndInit() {
    if (!this.api) return null;
    try {
      const infoRes = await this.api.fetchAccountInfo();
      const profile = infoRes?.profile || infoRes || {};
      const ownId = this.api.getOwnId ? this.api.getOwnId() : profile.userId;
      this.accountInfo = {
        userId: profile.userId || ownId || "",
        displayName: profile.displayName || profile.zaloName || "Tài khoản Zalo",
        zaloName: profile.zaloName || "",
        avatar: profile.avatar || "",
        phoneNumber: profile.phoneNumber || "",
      };
    } catch (err) {
      const ownId = this.api.getOwnId ? this.api.getOwnId() : "";
      if (!this.accountInfo) {
        this.accountInfo = {
          userId: ownId,
          displayName: "Tài khoản Zalo (" + ownId + ")",
          zaloName: "",
          avatar: "",
          phoneNumber: "",
        };
      }
    }

    this.isLoggedIn = true;
    this.loginStatus = "connected";
    this.startListenerSafely();
    this.persistCurrentSession();
    this.startKeepAliveLoop();

    this.sendToRenderer("zalo:status-changed", this.getStatus());
    this.sendToRenderer("zalo:contacts-updated", this.getContacts());

    try {
      await this.syncContacts();
      this.persistCurrentSession();
    } catch (err) {
      console.warn("Initial contact sync warning:", err?.message || err);
    }

    return this.getStatus();
  }

  async autoLoginFromSession() {
    if (!fs.existsSync(this.sessionPath)) {
      return { success: false, reason: "no_session" };
    }
    try {
      this.loginStatus = "connecting";
      this.sendToRenderer("zalo:status-changed", this.getStatus());

      const raw = await fsp.readFile(this.sessionPath, "utf-8");
      const rawCreds = JSON.parse(raw);
      const cleanCookies = this.normalizeCookieList(rawCreds.cookie);
      const credentials = {
        imei: String(rawCreds.imei || "").trim(),
        cookie: cleanCookies,
        userAgent:
          String(rawCreds.userAgent || "").trim() ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
        language: "vi",
      };

      this.lastCredentials = {
        ...rawCreds,
        ...credentials,
      };
      if (rawCreds.savedAccountInfo && !this.accountInfo) {
        this.accountInfo = rawCreds.savedAccountInfo;
      }

      const zalo = this.createZaloInstance();
      this.api = await zalo.login(credentials);
      await this.fetchProfileAndInit();

      return {
        success: true,
        status: this.getStatus(),
      };
    } catch (err) {
      this.isLoggedIn = false;
      this.loginStatus = "disconnected";
      this.api = null;
      this.sendToRenderer("zalo:status-changed", this.getStatus());
      this.sendToRenderer("zalo:contacts-updated", this.getContacts());
      return {
        success: false,
        error: err?.message || "Phiên đăng nhập Zalo đã hết hạn. Vui lòng đăng nhập lại.",
      };
    }
  }

  async loginWithCredentials({ imei, cookie, userAgent, saveOnly = false }) {
    try {
      let finalImei = String(imei || "").trim();
      let finalUA =
        String(userAgent || "").trim() ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";
      let rawCookieInput = cookie;

      // Nếu người dùng dán nguyên đối tượng zalo-session.json vào ô Cookie
      if (typeof cookie === "string" && cookie.trim().startsWith("{")) {
        try {
          const maybeFullObj = JSON.parse(cookie.trim());
          if (maybeFullObj.imei && !finalImei) {
            finalImei = String(maybeFullObj.imei).trim();
          }
          if (maybeFullObj.userAgent) {
            finalUA = String(maybeFullObj.userAgent).trim();
          }
        } catch (_) {}
      }

      const parsedCookie = this.normalizeCookieList(rawCookieInput);
      if (!finalImei || parsedCookie.length === 0) {
        throw new Error("Vui lòng nhập đầy đủ IMEI và dữ liệu Cookie hợp lệ.");
      }

      const credentials = {
        imei: finalImei,
        cookie: parsedCookie,
        userAgent: finalUA,
        language: "vi",
        savedAccountInfo: this.accountInfo || this.lastCredentials?.savedAccountInfo || null,
        savedAt: new Date().toISOString(),
      };

      // Lưu ngay thông tin đăng nhập xuống đĩa trước khi kết nối để luôn bảo toàn dữ liệu người dùng nhập
      this.lastCredentials = credentials;
      await fsp.writeFile(
        this.sessionPath,
        JSON.stringify(credentials, null, 2),
        "utf-8"
      );

      if (saveOnly) {
        this.sendToRenderer("zalo:status-changed", this.getStatus());
        return {
          success: true,
          savedOnly: true,
          status: this.getStatus(),
        };
      }

      this.loginStatus = "connecting";
      this.sendToRenderer("zalo:status-changed", this.getStatus());

      const zalo = this.createZaloInstance();
      this.api = await zalo.login(credentials);

      await this.fetchProfileAndInit();

      return {
        success: true,
        status: this.getStatus(),
      };
    } catch (err) {
      this.isLoggedIn = false;
      this.loginStatus = "disconnected";
      this.api = null;
      this.sendToRenderer("zalo:status-changed", this.getStatus());
      this.sendToRenderer("zalo:contacts-updated", this.getContacts());
      return {
        success: false,
        error:
          err?.message ||
          "Đã lưu thông tin vào máy nhưng đăng nhập Zalo thất bại (kiểm tra lại Cookie/IMEI).",
      };
    }
  }

  async startQRLogin() {
    this.abortQRLogin();
    const zalo = this.createZaloInstance();
    const qrTempPath = path.join(this.dataDir, "qr-temp.png");

    this.loginStatus = "qr_waiting";
    this.sendToRenderer("zalo:status-changed", this.getStatus());

    try {
      this.api = await zalo.loginQR(
        {
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
          language: "vi",
          qrPath: qrTempPath,
        },
        (event) => {
          if (event.actions) {
            this.currentQRActions = event.actions;
          }
          switch (event.type) {
            case LoginQRCallbackEventType.QRCodeGenerated: {
              this.loginStatus = "qr_waiting";
              this.sendToRenderer("zalo:qr-event", {
                type: "QRCodeGenerated",
                image: `data:image/png;base64,${event.data.image}`,
                code: event.data.code,
              });
              break;
            }
            case LoginQRCallbackEventType.QRCodeScanned: {
              this.loginStatus = "qr_scanned";
              this.sendToRenderer("zalo:qr-event", {
                type: "QRCodeScanned",
                displayName: event.data?.display_name || "",
                avatar: event.data?.avatar || "",
              });
              break;
            }
            case LoginQRCallbackEventType.QRCodeExpired: {
              this.sendToRenderer("zalo:qr-event", {
                type: "QRCodeExpired",
              });
              break;
            }
            case LoginQRCallbackEventType.QRCodeDeclined: {
              this.loginStatus = "disconnected";
              this.sendToRenderer("zalo:qr-event", {
                type: "QRCodeDeclined",
              });
              break;
            }
            case LoginQRCallbackEventType.GotLoginInfo: {
              this.loginStatus = "connecting";
              if (event.data) {
                const rawCookies = JSON.parse(JSON.stringify(event.data.cookie));
                const credentials = {
                  cookie: this.normalizeCookieList(rawCookies),
                  imei: event.data.imei,
                  userAgent: event.data.userAgent,
                  language: "vi",
                  savedAt: new Date().toISOString(),
                };
                this.lastCredentials = credentials;
                fs.writeFileSync(
                  this.sessionPath,
                  JSON.stringify(credentials, null, 2),
                  "utf-8"
                );
              }
              this.sendToRenderer("zalo:qr-event", {
                type: "GotLoginInfo",
              });
              break;
            }
          }
        }
      );

      this.currentQRActions = null;
      await this.fetchProfileAndInit();
      this.sendToRenderer("zalo:qr-event", {
        type: "LoginSuccess",
        status: this.getStatus(),
      });

      return {
        success: true,
        status: this.getStatus(),
      };
    } catch (err) {
      this.currentQRActions = null;
      if (!this.isLoggedIn) {
        this.loginStatus = "disconnected";
        this.sendToRenderer("zalo:status-changed", this.getStatus());
      }
      return {
        success: false,
        error: err?.message || "Quá trình đăng nhập QR đã dừng hoặc gặp lỗi.",
      };
    }
  }

  abortQRLogin() {
    if (this.currentQRActions && typeof this.currentQRActions.abort === "function") {
      try {
        this.currentQRActions.abort();
      } catch (_) {}
      this.currentQRActions = null;
    }
    if (!this.isLoggedIn) {
      this.loginStatus = "disconnected";
      this.sendToRenderer("zalo:status-changed", this.getStatus());
    }
  }

  async logout() {
    this.abortQRLogin();
    this.stopKeepAliveLoop();
    if (this.api && this.api.listener) {
      try {
        this.api.listener.stop();
      } catch (_) {}
    }
    this.api = null;
    this.accountInfo = null;
    this.lastCredentials = null;
    this.isLoggedIn = false;
    this.loginStatus = "disconnected";
    try {
      if (fs.existsSync(this.sessionPath)) {
        await fsp.unlink(this.sessionPath);
      }
    } catch (_) {}
    this.sendToRenderer("zalo:status-changed", this.getStatus());
    this.sendToRenderer("zalo:contacts-updated", this.getContacts());
    return { success: true, status: this.getStatus() };
  }

  async syncContacts() {
    if (!this.api || !this.isLoggedIn) {
      throw new Error("Vui lòng đăng nhập Zalo trước khi đồng bộ danh bạ.");
    }

    const [friendsRes, aliasRes] = await Promise.allSettled([
      this.api.getAllFriends(20000, 1),
      this.api.getAliasList(500, 1),
    ]);

    const aliasMap = new Map();
    if (aliasRes.status === "fulfilled" && aliasRes.value?.items) {
      for (const item of aliasRes.value.items) {
        if (item.userId && item.alias) {
          aliasMap.set(String(item.userId), item.alias);
        }
      }
    }

    const friendsList =
      friendsRes.status === "fulfilled" && Array.isArray(friendsRes.value)
        ? friendsRes.value
        : [];

    const contactMap = new Map();

    for (const existing of this.contacts) {
      if (existing && existing.userId) {
        contactMap.set(String(existing.userId), existing);
      }
    }

    for (const f of friendsList) {
      if (!f || !f.userId) continue;
      const uid = String(f.userId);
      const alias = aliasMap.get(uid) || "";
      const displayName = alias || f.displayName || f.zaloName || uid;
      contactMap.set(uid, {
        userId: uid,
        displayName,
        originalName: f.displayName || f.zaloName || "",
        zaloName: f.zaloName || "",
        alias,
        avatar: f.avatar || "",
        phoneNumber: f.phoneNumber || "",
        gender: f.gender ?? 0,
        source: "zalo_friends",
      });
    }

    const merged = Array.from(contactMap.values()).sort((a, b) =>
      (a.displayName || "").localeCompare(b.displayName || "", "vi")
    );

    this.saveContactsToDisk(merged);
    this.sendToRenderer("zalo:contacts-updated", merged);
    this.sendToRenderer("zalo:status-changed", this.getStatus());
    return merged;
  }

  async findUserByPhone(phoneNumber) {
    if (!this.api || !this.isLoggedIn) {
      throw new Error("Vui lòng đăng nhập Zalo trước khi tìm người dùng qua SĐT.");
    }
    const cleanPhone = String(phoneNumber || "").trim();
    if (!cleanPhone) {
      throw new Error("Vui lòng nhập số điện thoại.");
    }
    const res = await this.api.findUser(cleanPhone);
    if (!res || !res.uid) {
      throw new Error("Không tìm thấy tài khoản Zalo với số điện thoại này.");
    }
    const contact = {
      userId: String(res.uid),
      displayName: res.display_name || res.zalo_name || cleanPhone,
      originalName: res.display_name || res.zalo_name || "",
      zaloName: res.zalo_name || "",
      alias: "",
      avatar: res.avatar || "",
      phoneNumber: cleanPhone,
      source: "phone_search",
    };

    const existingIdx = this.contacts.findIndex((c) => c.userId === contact.userId);
    if (existingIdx >= 0) {
      this.contacts[existingIdx] = { ...this.contacts[existingIdx], ...contact };
    } else {
      this.contacts.push(contact);
    }
    this.contacts.sort((a, b) =>
      (a.displayName || "").localeCompare(b.displayName || "", "vi")
    );
    this.saveContactsToDisk(this.contacts);
    this.sendToRenderer("zalo:contacts-updated", this.contacts);

    return contact;
  }

  addManualContact({ userId, displayName, phoneNumber, department }) {
    const uid = String(userId || `manual_${Date.now()}`).trim();
    const name = String(displayName || "").trim();
    if (!name) {
      throw new Error("Vui lòng nhập tên người phụ trách.");
    }
    const contact = {
      userId: uid,
      displayName: name,
      originalName: name,
      zaloName: name,
      alias: "",
      avatar: "",
      phoneNumber: String(phoneNumber || "").trim(),
      department: String(department || "").trim(),
      source: uid.startsWith("manual_") ? "manual" : "custom_uid",
    };

    const existingIdx = this.contacts.findIndex((c) => c.userId === contact.userId);
    if (existingIdx >= 0) {
      this.contacts[existingIdx] = { ...this.contacts[existingIdx], ...contact };
    } else {
      this.contacts.push(contact);
    }
    this.contacts.sort((a, b) =>
      (a.displayName || "").localeCompare(b.displayName || "", "vi")
    );
    this.saveContactsToDisk(this.contacts);
    this.sendToRenderer("zalo:contacts-updated", this.contacts);
    return contact;
  }

  async sendMessageToAssignees({
    recipients,
    message,
    urgency = "default",
    attachmentPaths = [],
  }) {
    if (!this.api || !this.isLoggedIn) {
      throw new Error(
        "Chưa kết nối tài khoản Zalo! Vui lòng đăng nhập Zalo ở góc trên bên phải trước khi gửi tin nhắn."
      );
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error("Vui lòng chọn ít nhất 1 người phụ trách để gửi tin nhắn.");
    }

    const msgText = String(message || "").trim();
    if (!msgText && (!attachmentPaths || attachmentPaths.length === 0)) {
      throw new Error("Nội dung tin nhắn không được để trống.");
    }

    const validAttachments = (attachmentPaths || []).filter(
      (p) => typeof p === "string" && fs.existsSync(p)
    );

    if (validAttachments.length > 0) {
      // Ensure WebSocket listener is open and has cipher_key so `file_done` callback is received
      await this.ensureListenerReadyForUpload();
    } else {
      this.startListenerSafely();
    }

    let zaloUrgency = Urgency.Default;
    if (urgency === "important") zaloUrgency = Urgency.Important;
    if (urgency === "urgent") zaloUrgency = Urgency.Urgent;

    const results = [];

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      const uid = String(r.userId || "").trim();
      const name = r.displayName || uid;

      if (!uid || uid.startsWith("manual_")) {
        results.push({
          userId: uid,
          displayName: name,
          success: false,
          error:
            "Người phụ trách này chưa có Zalo UID (danh bạ thủ công). Vui lòng chọn từ danh bạ Zalo hoặc tìm bằng SĐT.",
        });
        continue;
      }

      try {
        const personalizedMsg = msgText.replace(/\{assigneeName\}/g, name);

        const payload = {
          msg: personalizedMsg,
          urgency: zaloUrgency,
        };

        if (validAttachments.length > 0) {
          payload.attachments = validAttachments;
        }

        const res = await this.api.sendMessage(payload, uid, ThreadType.User);
        results.push({
          userId: uid,
          displayName: name,
          success: true,
          msgId: res?.message?.msgId || res?.attachment?.[0]?.msgId || null,
          attachmentCount: validAttachments.length,
        });
      } catch (err) {
        console.error(`[Zalo Send Error to ${name} (${uid})]:`, err);
        results.push({
          userId: uid,
          displayName: name,
          success: false,
          error: err?.cause?.message || err?.message || "Gửi tin nhắn thất bại",
        });
      }

      if (i < recipients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 650));
      }
    }

    return results;
  }
}

module.exports = { ZaloService };
