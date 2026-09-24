(() => {
  // prototypes/emberwild/legal-links.mjs
  var LEGAL_URLS = Object.freeze({
    terms: "https://d1udhm4c9vjzph.cloudfront.net/ios-legal/terms-of-service.html",
    privacy: "https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html",
    deletion: "https://d1udhm4c9vjzph.cloudfront.net/ios-legal/account-deletion.html"
  });
  var allowed = new Set(Object.values(LEGAL_URLS));
  function openLegalURL(url, host = globalThis.window) {
    if (!allowed.has(url) || !host) return false;
    const bridge = host.android;
    if (bridge && typeof bridge.sdkToBrowser === "function") bridge.sdkToBrowser(url);
    else if (typeof host.open === "function") host.open(url, "_blank", "noopener,noreferrer");
    else return false;
    return true;
  }
  function installLegalLinks(root = globalThis.document, host = globalThis.window) {
    if (!root?.addEventListener) return () => {
    };
    const onClick = (event) => {
      const link = event.target?.closest?.("[data-legal-url]");
      if (!link || !root.contains(link)) return;
      event.preventDefault();
      openLegalURL(link.dataset.legalUrl, host);
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }

  // prototypes/emberwild/account-session.mjs
  var ACCOUNT_SESSION_KEY = "emberwild_account_session_v1";
  var clean = (value) => String(value || "").normalize("NFKC").replace(/[\u0000-\u001f\u007f<>"'`]/g, "").trim();
  function accountDisplayName({ nickname = "", account = "" } = {}) {
    const accountName = clean(account).split("@")[0];
    return (clean(nickname) || accountName || "荒境獵人").slice(0, 20);
  }
  function parse(raw) {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (value?.version !== 2 || typeof value.playerId !== "string" || !value.playerId.trim() || value.playerId.length > 128 || typeof value.label !== "string" || !value.label.trim() || value.label.length > 20 || !Number.isFinite(value.authenticatedAt) || !Number.isFinite(value.accessExpiresAt)) return null;
      return Object.freeze({ version: 2, playerId: value.playerId, label: value.label, authenticatedAt: value.authenticatedAt, accessExpiresAt: value.accessExpiresAt });
    } catch {
      return null;
    }
  }
  var AccountSession = class {
    constructor(storage2) {
      this.storage = storage2;
      this.current = null;
      this.reload();
    }
    reload() {
      try {
        this.current = parse(this.storage?.getItem?.(ACCOUNT_SESSION_KEY));
      } catch {
        this.current = null;
      }
      return this.current;
    }
    accept(value) {
      if (!value?.authenticated) throw new Error("登入狀態無效，請重新登入。");
      const playerId = clean(value.playerId).slice(0, 128), label = accountDisplayName({ nickname: value.displayName });
      const authenticatedAt = Number(value.authenticatedAt) * 1e3, accessExpiresAt = Number(value.accessExpiresAt) * 1e3;
      if (!playerId || !Number.isFinite(authenticatedAt) || !Number.isFinite(accessExpiresAt) || accessExpiresAt <= authenticatedAt) throw new Error("帳號服務回傳的登入狀態不完整。");
      const session = { version: 2, playerId, label, authenticatedAt, accessExpiresAt }, raw = JSON.stringify(session);
      try {
        this.storage?.setItem?.(ACCOUNT_SESSION_KEY, raw);
        if (this.storage?.getItem?.(ACCOUNT_SESSION_KEY) !== raw) throw new Error("登入狀態未能寫入");
      } catch {
        throw new Error("無法保存帳號顯示狀態，請確認裝置儲存空間。");
      }
      this.current = Object.freeze(session);
      return this.current;
    }
    clear() {
      try {
        this.storage?.removeItem?.(ACCOUNT_SESSION_KEY);
        if (this.storage?.getItem?.(ACCOUNT_SESSION_KEY) !== null) throw new Error("登入狀態未能清除");
      } catch {
        throw new Error("無法清除帳號顯示狀態，請稍後再試。");
      }
      this.current = null;
      return true;
    }
  };

  // prototypes/emberwild/native-auth.mjs
  var resultObject = (value) => {
    if (value && typeof value === "object") return value;
    try {
      return JSON.parse(String(value || ""));
    } catch {
      return {};
    }
  };
  var requestId = (host) => {
    if (typeof host.crypto?.randomUUID === "function") return host.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof host.crypto?.getRandomValues === "function") host.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = bytes[6] & 15 | 64;
    bytes[8] = bytes[8] & 63 | 128;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  var NativeAuthError = class extends Error {
    constructor(code, message) {
      super(message);
      this.name = "NativeAuthError";
      this.code = code;
    }
  };
  var NativeAccountAuth = class {
    constructor(host = globalThis, { requestTimeoutMs = 35e3, statusTimeoutMs = 8e3 } = {}) {
      this.host = host;
      this.pending = null;
      this.requestTimeoutMs = requestTimeoutMs;
      this.statusTimeoutMs = statusTimeoutMs;
      const previous = typeof host.javaCallBack === "function" ? host.javaCallBack : null;
      host.javaCallBack = (value) => {
        try {
          previous?.(value);
        } finally {
          this.handle(value);
        }
      };
    }
    available() {
      return typeof this.host.android?.miniAuth === "function";
    }
    request(action, fields = {}) {
      if (this.pending) throw new NativeAuthError("AUTH_IN_PROGRESS", "另一項帳號操作正在處理，請稍候");
      if (!["status", "login", "register", "recover", "logout", "delete"].includes(action)) throw new NativeAuthError("INVALID_AUTH_ACTION", "不支援的帳號操作");
      if (!this.available()) throw new NativeAuthError("IOS_APP_REQUIRED", "請在 iOS App 內使用真實帳號服務");
      const id = requestId(this.host), payload = { action, requestId: id, ...fields };
      return new Promise((resolve, reject) => {
        const pending = { requestId: id, action, resolve, reject };
        this.pending = pending;
        pending.timer = setTimeout(() => {
          if (this.pending !== pending) return;
          this.pending = null;
          reject(new NativeAuthError("AUTH_TIMEOUT", action === "register" ? "註冊回應逾時，請稍後先使用此帳號登入，確認是否已建立。" : "帳號服務回應逾時，請稍後重試。"));
        }, action === "status" ? this.statusTimeoutMs : this.requestTimeoutMs);
        try {
          this.host.android.miniAuth(JSON.stringify(payload));
        } catch (error) {
          clearTimeout(pending.timer);
          this.pending = null;
          reject(new NativeAuthError("NATIVE_BRIDGE_FAILED", error?.message || "無法連接帳號服務"));
        }
      });
    }
    status() {
      return this.request("status");
    }
    login(account, password) {
      return this.request("login", { account, password });
    }
    register(account, password, nickname, acceptedTermsVersion) {
      return this.request("register", { account, password, nickname, acceptedTermsVersion });
    }
    recover(account) {
      return this.request("recover", { account });
    }
    logout() {
      return this.request("logout");
    }
    deleteAccount() {
      return this.request("delete");
    }
    handle(value) {
      const payload = resultObject(value), pending = this.pending;
      if (!pending || payload.requestId !== pending.requestId || payload.action !== pending.action) return false;
      clearTimeout(pending.timer);
      this.pending = null;
      if (payload.func === "onMiniAuthResult" && payload.code === "OK") {
        pending.resolve(payload.data && typeof payload.data === "object" ? payload.data : {});
        return true;
      }
      if (payload.func === "onMiniAuthFail") {
        pending.reject(new NativeAuthError(String(payload.code || "AUTH_FAILED"), String(payload.message || "帳號服務未能完成請求")));
        return true;
      }
      pending.reject(new NativeAuthError("INVALID_AUTH_RESPONSE", "帳號服務回應格式不正確"));
      return true;
    }
  };

  // prototypes/emberwild/login-preview.mjs
  var TERMS_VERSION = "2026-09-20";
  var ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9_]{5,23}$/;
  var returnToCamp = new URLSearchParams(location.search).get("return") === "camp";
  var $ = (id) => document.getElementById(id);
  var form = $("auth-form");
  var dialog = $("preview-dialog");
  var storage = null;
  try {
    storage = window.localStorage;
  } catch {
  }
  var accountSession = new AccountSession(storage);
  var nativeAuth = new NativeAccountAuth(window);
  var views = {
    login: { title: "歡迎回到營地", eyebrow: "YOUR JOURNEY CONTINUES", copy: "使用你的正式帳號繼續旅程。", action: "安全登入" },
    register: { title: "寫下你的獵人之名", eyebrow: "EVERY LEGEND HAS A BEGINNING", copy: "建立帳號，讓身份與付款安全綁定。", action: "建立獵人帳號" },
    recover: { title: "找回歸途的路", eyebrow: "FIND YOUR WAY HOME", copy: "輸入遊戲帳號並提交安全找回申請。", action: "提交找回申請" }
  };
  var mode = "login";
  var busy = false;
  function renderSession() {
    const session = accountSession.reload();
    $("session-banner").hidden = !session;
    $("session-name").textContent = session?.label || "";
  }
  function clearError() {
    $("form-error").hidden = true;
    $("form-error").textContent = "";
    form.querySelectorAll("[aria-invalid]").forEach((control) => control.removeAttribute("aria-invalid"));
  }
  function showError(message, field) {
    $("form-error").textContent = message;
    $("form-error").hidden = false;
    if (field) {
      $(field).setAttribute("aria-invalid", "true");
      $(field).focus();
    }
  }
  function setBusy(next, label = "") {
    busy = next;
    form.toggleAttribute("aria-busy", next);
    $("form-fields").disabled = next;
    document.querySelectorAll(".auth-tabs button,.back-to-login").forEach((button) => {
      button.disabled = next;
    });
    $("guest-entry").disabled = next;
    $("logout-session").disabled = next;
    $("submit-label").textContent = label || views[mode].action;
  }
  function setView(next, focus = false) {
    if (!views[next] || busy) return;
    const previous = mode;
    mode = next;
    if (previous !== mode) {
      $("account").value = "";
      $("nickname").value = "";
    }
    document.documentElement.dataset.view = mode;
    const view = views[mode];
    $("form-title").textContent = view.title;
    $("form-eyebrow").textContent = view.eyebrow;
    $("form-description").textContent = view.copy;
    $("submit-label").textContent = view.action;
    for (const group of document.querySelectorAll("[data-field]")) {
      const name = group.dataset.field, visible = name === "account" || name === "password" && mode !== "recover" || ["nickname", "confirm"].includes(name) && mode === "register";
      group.hidden = !visible;
      group.querySelectorAll("input,button").forEach((control) => {
        control.disabled = !visible;
      });
    }
    for (const control of document.querySelectorAll(".auth-tabs button")) {
      const active = control.dataset.view === mode;
      control.setAttribute("aria-selected", String(active));
      control.tabIndex = active ? 0 : -1;
    }
    document.querySelector(".auth-tabs").hidden = mode === "recover";
    document.querySelector(".back-to-login").hidden = mode !== "recover";
    document.querySelector(".login-options").hidden = mode !== "login";
    document.querySelector(".consent-row").hidden = mode === "recover";
    $("consent").disabled = mode === "recover";
    document.querySelector(".recovery-note").hidden = mode !== "recover";
    document.querySelector(".guest-section").hidden = mode === "recover" || returnToCamp;
    $("account-label").textContent = "帳號";
    $("account-hint").textContent = "ACCOUNT ID";
    $("account").type = "text";
    $("account").placeholder = mode === "register" ? "設定 6–24 位英數帳號" : "輸入遊戲帳號";
    $("account").autocomplete = "username";
    $("password").placeholder = mode === "register" ? "設定密碼（至少 8 字元）" : "輸入密碼";
    $("password").autocomplete = mode === "register" ? "new-password" : "current-password";
    $("password").value = "";
    $("confirm").value = "";
    $("password").type = "password";
    $("password-toggle").setAttribute("aria-pressed", "false");
    $("password-toggle").setAttribute("aria-label", "顯示密碼");
    $("auth-panel").setAttribute("aria-labelledby", mode === "recover" ? "form-title" : `tab-${mode}`);
    clearError();
    if (focus) $(mode === "register" ? "nickname" : "account").focus();
  }
  function showDialog(title, copy, allowGame = false, destination = "index.html") {
    $("dialog-title").textContent = title;
    $("dialog-copy").textContent = copy;
    $("dialog-game").hidden = !allowGame;
    $("dialog-game").href = destination;
    $("dialog-game").textContent = destination.includes("enter=camp") ? "進入營地 ↗" : "前往本機遊戲 ↗";
    if (!dialog.open) dialog.showModal();
  }
  var info = { help: ["原始文明：聖獸覺醒帳號", "帳號、註冊、找回與退出均由 iOS 原生安全通道連接 HTTPS 帳號服務。密碼不會寫入遊戲存檔、localStorage 或日誌；登入令牌只保存在 iOS Keychain。訪客可試玩，但不能發起真實付款。"] };
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-info]").forEach((button) => button.addEventListener("click", () => showDialog(...info[button.dataset.info])));
  document.querySelector(".auth-tabs").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || busy) return;
    event.preventDefault();
    const next = event.key === "Home" ? "login" : event.key === "End" ? "register" : mode === "login" ? "register" : "login";
    setView(next);
    $(`tab-${next}`).focus();
  });
  $("password-toggle").addEventListener("click", () => {
    const visible = $("password").type === "password";
    $("password").type = visible ? "text" : "password";
    $("password-toggle").setAttribute("aria-pressed", String(visible));
    $("password-toggle").setAttribute("aria-label", visible ? "隱藏密碼" : "顯示密碼");
  });
  form.addEventListener("input", clearError);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    clearError();
    if (mode === "register" && !$("nickname").value.trim()) return showError("先為你的獵人取個名字。", "nickname");
    if (!$("account").value.trim()) return showError("請輸入遊戲帳號。", "account");
    if (!ACCOUNT_PATTERN.test($("account").value.trim().toLowerCase())) return showError("帳號須為 6–24 位英文字母、數字或底線。", "account");
    if (mode !== "recover" && !$("password").value) return showError("請輸入密碼。", "password");
    if (mode === "register" && $("password").value.length < 8) return showError("密碼至少需要 8 個字元。", "password");
    if (mode === "register" && $("password").value !== $("confirm").value) return showError("兩次輸入的密碼不一致。", "confirm");
    if (mode !== "recover" && !$("consent").checked) return showError("請先閱讀並同意用戶協議與隱私政策。", "consent");
    const submittedMode = mode, account = $("account").value.trim().toLowerCase(), password = $("password").value, nickname = $("nickname").value.trim();
    setBusy(true, submittedMode === "recover" ? "正在送出…" : "正在安全驗證…");
    try {
      if (submittedMode === "recover") {
        await nativeAuth.recover(account);
        showDialog("找回申請已提交", "如果此帳號存在且符合找回條件，系統會提供下一步安全驗證說明。為保護帳號，我們不會在此確認帳號是否存在。");
      } else {
        const result = submittedMode === "register" ? await nativeAuth.register(account, password, nickname, TERMS_VERSION) : await nativeAuth.login(account, password);
        const session = accountSession.accept(result);
        renderSession();
        showDialog(submittedMode === "register" ? "帳號已建立" : "已登入遊戲", `${session.label}，安全登入已完成。令牌保存在 iOS Keychain，密碼未寫入遊戲存檔。`, true, returnToCamp ? "index.html?enter=camp" : "index.html");
        $("account").value = "";
        $("nickname").value = "";
      }
    } catch (error) {
      showError(error?.message || "帳號服務未能完成請求。");
    } finally {
      $("password").value = "";
      $("confirm").value = "";
      setBusy(false);
    }
  });
  $("logout-session").addEventListener("click", async () => {
    if (busy) return;
    clearError();
    setBusy(true, "正在退出…");
    try {
      await nativeAuth.logout();
      accountSession.clear();
      renderSession();
      showDialog("已安全退出", "本機登入令牌已清除；遊戲存檔、營地、伙伴與設定完整保留。");
    } catch (error) {
      showError(error?.message || "暫時無法退出帳號。");
    } finally {
      setBusy(false);
    }
  });
  $("guest-entry").addEventListener("click", () => showDialog("以訪客身分出發", "訪客可以遊玩並保留本機進度，但不能發起真實付款。登入後才會把新訂單綁定至正式玩家 ID。", true));
  $("close-dialog").addEventListener("click", () => dialog.close());
  $("dismiss-dialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    }
  });
  async function refreshNativeSession() {
    if (!nativeAuth.available()) return;
    try {
      const status = await nativeAuth.status();
      if (status.authenticated) {
        const session = accountSession.accept(status);
        renderSession();
        if (returnToCamp) showDialog("帳號已登入", `${session.label}，安全登入仍有效，可以直接進入營地。`, true, "index.html?enter=camp");
      } else {
        accountSession.clear();
        renderSession();
      }
    } catch (error) {
      if (error?.code === "AUTH_NOT_CONFIGURED") $("demo-note").innerHTML = "<span>等待後端設定</span> 帳號 API 尚未部署，暫不可登入或付款";
    }
  }
  var requestedView = new URLSearchParams(location.search).get("view");
  installLegalLinks(document, window);
  setView(views[requestedView] ? requestedView : "login");
  renderSession();
  $("form-fields").disabled = false;
  window.emberwildBoot?.ready();
  refreshNativeSession();
})();
