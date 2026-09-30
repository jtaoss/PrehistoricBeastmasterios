(() => {
  var ENCODED = Object.freeze({
    terms: "aHR0cHM6Ly9kMXVkaG00Yzl2anpwaC5jbG91ZGZyb250Lm5ldC9pb3MtbGVnYWwvdGVybXMtb2Ytc2VydmljZS5odG1s",
    privacy: "aHR0cHM6Ly9kMXVkaG00Yzl2anpwaC5jbG91ZGZyb250Lm5ldC9pb3MtbGVnYWwvcHJpdmFjeS1wb2xpY3kuaHRtbA==",
    deletion: "aHR0cHM6Ly9kMXVkaG00Yzl2anpwaC5jbG91ZGZyb250Lm5ldC9pb3MtbGVnYWwvYWNjb3VudC1kZWxldGlvbi5odG1s"
  });
  var decode = (key) => {
    const encoded = ENCODED[key];
    if (!encoded) return "";
    try {
      return decodeURIComponent(Array.from(atob(encoded), (character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
    } catch {
      return "";
    }
  };
  var LEGAL_KEYS = Object.freeze(Object.keys(ENCODED));
  function openLegalURL(key, host = globalThis.window) {
    if (!LEGAL_KEYS.includes(key) || !host) return false;
    const bridge = host.pbmNative;
    if (bridge && typeof bridge.sdkToBrowser === "function") bridge.sdkToBrowser(`pbm-legal:${key}`);
    else if (typeof host.open === "function") host.open(decode(key), "_blank", "noopener,noreferrer");
    else return false;
    return true;
  }
  function installLegalLinks(root = globalThis.document, host = globalThis.window) {
    if (!root?.addEventListener) return () => {
    };
    const onClick = (event) => {
      const link = event.target?.closest?.("[data-legal]");
      if (!link || !root.contains(link)) return;
      event.preventDefault();
      openLegalURL(link.dataset.legal, host);
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }

  var ACCOUNT_SESSION_KEY = "emberwild_account_session_v1";
  var clean = (value) => String(value || "").normalize("NFKC").replace(/[\u0000-\u001f\u007f<>"'`]/g, "").trim();
  function accountDisplayName({ nickname = "", account = "" } = {}) {
    const accountName = clean(account).split("@")[0];
    return (clean(nickname) || accountName || "\u8352\u5883\u7375\u4EBA").slice(0, 20);
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
      if (!value?.authenticated) throw new Error("\u767B\u5165\u72C0\u614B\u7121\u6548\uFF0C\u8ACB\u91CD\u65B0\u767B\u5165\u3002");
      const playerId = clean(value.playerId).slice(0, 128), label = accountDisplayName({ nickname: value.displayName });
      const authenticatedAt = Number(value.authenticatedAt) * 1e3, accessExpiresAt = Number(value.accessExpiresAt) * 1e3;
      if (!playerId || !Number.isFinite(authenticatedAt) || !Number.isFinite(accessExpiresAt) || accessExpiresAt <= authenticatedAt) throw new Error("\u5E33\u865F\u670D\u52D9\u56DE\u50B3\u7684\u767B\u5165\u72C0\u614B\u4E0D\u5B8C\u6574\u3002");
      const session = { version: 2, playerId, label, authenticatedAt, accessExpiresAt }, raw = JSON.stringify(session);
      try {
        this.storage?.setItem?.(ACCOUNT_SESSION_KEY, raw);
        if (this.storage?.getItem?.(ACCOUNT_SESSION_KEY) !== raw) throw new Error("\u767B\u5165\u72C0\u614B\u672A\u80FD\u5BEB\u5165");
      } catch {
        throw new Error("\u7121\u6CD5\u4FDD\u5B58\u5E33\u865F\u986F\u793A\u72C0\u614B\uFF0C\u8ACB\u78BA\u8A8D\u88DD\u7F6E\u5132\u5B58\u7A7A\u9593\u3002");
      }
      this.current = Object.freeze(session);
      return this.current;
    }
    clear() {
      try {
        this.storage?.removeItem?.(ACCOUNT_SESSION_KEY);
        if (this.storage?.getItem?.(ACCOUNT_SESSION_KEY) !== null) throw new Error("\u767B\u5165\u72C0\u614B\u672A\u80FD\u6E05\u9664");
      } catch {
        throw new Error("\u7121\u6CD5\u6E05\u9664\u5E33\u865F\u986F\u793A\u72C0\u614B\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66\u3002");
      }
      this.current = null;
      return true;
    }
  };

  var GUEST_SESSION_KEY = "emberwild_guest_session_v1";
  var GuestSession = class {
    constructor(storage2) {
      this.storage = storage2;
    }
    active() {
      try {
        return this.storage?.getItem?.(GUEST_SESSION_KEY) === "1";
      } catch {
        return false;
      }
    }
    start() {
      try {
        this.storage?.setItem?.(GUEST_SESSION_KEY, "1");
        if (this.storage?.getItem?.(GUEST_SESSION_KEY) !== "1") throw new Error("guest state unavailable");
        return true;
      } catch {
        throw new Error("\u7121\u6CD5\u4FDD\u5B58\u8A2A\u5BA2\u72C0\u614B\uFF0C\u8ACB\u78BA\u8A8D\u88DD\u7F6E\u5132\u5B58\u7A7A\u9593\u5F8C\u91CD\u8A66\u3002");
      }
    }
    clear() {
      try {
        this.storage?.removeItem?.(GUEST_SESSION_KEY);
      } catch {
      }
    }
  };

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
      return typeof this.host.pbmNative?.miniAuth === "function";
    }
    request(action, fields = {}) {
      if (this.pending) throw new NativeAuthError("AUTH_IN_PROGRESS", "\u53E6\u4E00\u9805\u5E33\u865F\u64CD\u4F5C\u6B63\u5728\u8655\u7406\uFF0C\u8ACB\u7A0D\u5019");
      if (!["status", "login", "register", "recover", "logout", "delete", "completeDelete"].includes(action)) throw new NativeAuthError("INVALID_AUTH_ACTION", "\u4E0D\u652F\u63F4\u7684\u5E33\u865F\u64CD\u4F5C");
      if (!this.available()) throw new NativeAuthError("IOS_APP_REQUIRED", "\u8ACB\u5728 iOS App \u5167\u4F7F\u7528\u771F\u5BE6\u5E33\u865F\u670D\u52D9");
      const id = requestId(this.host), payload = { action, requestId: id, ...fields };
      return new Promise((resolve, reject) => {
        const pending = { requestId: id, action, resolve, reject };
        this.pending = pending;
        pending.timer = setTimeout(() => {
          if (this.pending !== pending) return;
          this.pending = null;
          reject(new NativeAuthError("AUTH_TIMEOUT", action === "register" ? "\u8A3B\u518A\u56DE\u61C9\u903E\u6642\uFF0C\u8ACB\u7A0D\u5F8C\u5148\u4F7F\u7528\u6B64\u5E33\u865F\u767B\u5165\uFF0C\u78BA\u8A8D\u662F\u5426\u5DF2\u5EFA\u7ACB\u3002" : "\u5E33\u865F\u670D\u52D9\u56DE\u61C9\u903E\u6642\uFF0C\u8ACB\u7A0D\u5F8C\u91CD\u8A66\u3002"));
        }, action === "status" ? this.statusTimeoutMs : this.requestTimeoutMs);
        try {
          this.host.pbmNative.miniAuth(JSON.stringify(payload));
        } catch (error) {
          clearTimeout(pending.timer);
          this.pending = null;
          reject(new NativeAuthError("NATIVE_BRIDGE_FAILED", error?.message || "\u7121\u6CD5\u9023\u63A5\u5E33\u865F\u670D\u52D9"));
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
    completeDeletionCleanup() {
      return this.request("completeDelete");
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
        pending.reject(new NativeAuthError(String(payload.code || "AUTH_FAILED"), String(payload.message || "\u5E33\u865F\u670D\u52D9\u672A\u80FD\u5B8C\u6210\u8ACB\u6C42")));
        return true;
      }
      pending.reject(new NativeAuthError("INVALID_AUTH_RESPONSE", "\u5E33\u865F\u670D\u52D9\u56DE\u61C9\u683C\u5F0F\u4E0D\u6B63\u78BA"));
      return true;
    }
  };

  var AccountDeletion = class {
    constructor({ auth, session, store, onConfirmed = () => {
    } }) {
      Object.assign(this, { auth, session, store, onConfirmed });
      this.confirmed = false;
      this.pending = null;
    }
    run({ confirmed = false } = {}) {
      if (this.pending) return this.pending;
      this.pending = this.perform(confirmed).finally(() => {
        this.pending = null;
      });
      return this.pending;
    }
    async perform(confirmed) {
      if (confirmed) this.confirmed = true;
      if (!this.confirmed) {
        try {
          const result = await this.auth.deleteAccount();
          if (result?.accountDeleted !== true || result?.authenticated !== false) throw new Error("\u4F3A\u670D\u5668\u5C1A\u672A\u78BA\u8A8D\u522A\u9664\u5E33\u865F\uFF0C\u8ACB\u91CD\u8A66\u3002");
          this.confirmed = true;
        } catch (error) {
          if (error?.code !== "ACCOUNT_DELETED_CLEANUP_REQUIRED") throw error;
          this.confirmed = true;
        }
      }
      try {
        await this.onConfirmed();
        await this.store.queue;
        this.store.reload();
        await this.store.clearProgress();
        this.session.clear();
        const completed = await this.auth.completeDeletionCleanup();
        if (completed?.authenticated !== false || completed?.cleanupRequired === true)
          throw new Error("\u672C\u6A5F\u6E05\u7406\u5C1A\u672A\u78BA\u8A8D\u5B8C\u6210");
        return { accountDeleted: true, localDataCleared: true };
      } catch (cause) {
        const error = new Error("\u5E33\u865F\u5DF2\u522A\u9664\uFF1B\u6B64\u88DD\u7F6E\u4ECD\u6709\u8CC7\u6599\u5C1A\u672A\u6E05\u9664\uFF0C\u8ACB\u9EDE\u64CA\u300C\u7E7C\u7E8C\u6E05\u7406\u300D\u3002");
        error.code = "ACCOUNT_CLEANUP_REQUIRED";
        error.accountDeleted = true;
        error.cause = cause;
        throw error;
      }
    }
  };

  var TUTORIAL_STEPS = Object.freeze(["move", "attack", "skill", "build", "reward"]);
  function validateTutorial(t) {
    if (t === null || t === void 0) return true;
    return typeof t === "object" && TUTORIAL_STEPS.includes(t.step) && ["active", "done", "skipped"].includes(t.status) && Number.isFinite(t.moved) && t.moved >= 0 && t.moved <= 64 && Number.isFinite(t.elapsed) && t.elapsed >= 0 && t.elapsed <= 1e8 && (t.reward === null || t.status === "active" && t.step === "reward" && ["wood", "bone", "amber"].every((k) => Number.isInteger(t.reward?.[k]) && t.reward[k] >= 0 && t.reward[k] <= 1e3)) && (t.version === void 0 || t.version === 2 && typeof t.started === "boolean" && typeof t.awaiting === "boolean" && (t.mandatory === void 0 || typeof t.mandatory === "boolean") && (!t.mandatory || t.status !== "skipped") && (t.skillCast === void 0 || typeof t.skillCast === "boolean") && Number.isInteger(t.attackHits) && t.attackHits >= 0 && t.attackHits <= 2 && Number.isInteger(t.slot) && t.slot >= 0 && t.slot <= 3 && point(t.moveTarget) && (t.buildSpot === null || point(t.buildSpot)) && (!t.awaiting || t.started && t.step !== "reward") && (t.status !== "active" || (t.step !== "build" || t.buildSpot !== null) && (t.started || t.step === "move")));
  }
  function point(p) {
    return !!p && Number.isFinite(p.x) && p.x >= 55 && p.x <= 665 && Number.isFinite(p.y) && p.y >= 85 && p.y <= 735;
  }

  var WORLD = Object.freeze({ width: 720, height: 820 });
  var MAX_WAVES = 8;
  var STAGE_BALANCE = Object.freeze([
    { hp: 1, damage: 0.85, speed: 1, spawn: 1.5, wood: 5, bone: 3, amber: 3 },
    { hp: 1.14, damage: 0.9, speed: 1, spawn: 1.36, wood: 6, bone: 3, amber: 3 },
    { hp: 1.34, damage: 0.98, speed: 1.01, spawn: 1.23, wood: 6, bone: 4, amber: 4 },
    { hp: 1.56, damage: 1.06, speed: 1.02, spawn: 1.14, wood: 7, bone: 4, amber: 4 },
    { hp: 1.82, damage: 1.15, speed: 1.03, spawn: 1.06, wood: 7, bone: 5, amber: 5 },
    { hp: 2.1, damage: 1.24, speed: 1.04, spawn: 1.1, wood: 8, bone: 5, amber: 5 },
    { hp: 2.42, damage: 1.33, speed: 1.05, spawn: 1.32, wood: 9, bone: 5, amber: 6 },
    { hp: 2.78, damage: 1.42, speed: 1.06, spawn: 1.05, wood: 10, bone: 6, amber: 7 }
  ].map((v) => Object.freeze(v)));
  var FORTIFICATION_BALANCE = Object.freeze({ incomingDamage: 0.78, betweenStageRepair: 0.35, heroRecovery: 15, eggRecovery: 18 });
  var STAGE_OBJECTIVES = Object.freeze([
    Object.freeze({ type: "defend", icon: "\u25C9", title: "\u5B88\u4F4F\u8056\u7378\u5375", short: "\u5B88\u8B77\u76EE\u6A19", detail: "\u64CA\u9000\u7378\u7FA4\uFF0C\u78BA\u4FDD\u8056\u7378\u5375\u4E0D\u88AB\u6467\u6BC0\u3002" }),
    Object.freeze({ type: "escort", icon: "\u2197", title: "\u8B77\u9001\u63A1\u96C6\u5E2B", short: "\u8B77\u9001 NPC", detail: "\u9760\u8FD1\u63A1\u96C6\u5E2B\u5E36\u8DEF\uFF0C\u8B77\u9001\u4ED6\u7A7F\u904E\u5DE8\u8568\u5DE2\u9053\u3002" }),
    Object.freeze({ type: "destroy", icon: "\u2739", title: "\u6467\u6BC0\u4E09\u5EA7\u7378\u5DE2", short: "\u6467\u6BC0\u5DE2\u7A74", detail: "\u6E05\u9664\u6CBC\u6FA4\u6BCD\u7378\u7684\u4E09\u5EA7\u5B75\u5316\u5DE2\uFF0C\u963B\u65B7\u5E7C\u7378\u589E\u63F4\u3002" }),
    Object.freeze({ type: "mining", icon: "\u25C6", title: "\u9650\u6642\u63A1\u96C6\u7194\u6676", short: "\u9650\u6642\u63A1\u7926", detail: "\u5728 50 \u79D2\u5167\u64CA\u788E\u4E09\u8655\u6A19\u8A18\u6676\u7926\u4E26\u64CA\u9000\u5B88\u885B\u3002" }),
    Object.freeze({ type: "rescue", icon: "\u2301", title: "\u71DF\u6551\u53D7\u56F0\u5F13\u624B", short: "\u71DF\u6551\u4F19\u4F34", detail: "\u9760\u8FD1\u7262\u7C60\u4E26\u5B88\u4F4F\u6551\u63F4\u5708\uFF0C\u5B8C\u6210\u5F8C\u5F13\u624B\u52A0\u5165\u672C\u5C40\u3002" }),
    Object.freeze({ type: "defend", icon: "\u25C9", title: "\u5B88\u4F4F\u7126\u6728\u9632\u7DDA", short: "\u9996\u9818\u5B88\u8B77", detail: "\u4FDD\u8B77\u8056\u7378\u9748\u5DE2\uFF0C\u907F\u958B\u885D\u89D2\u7378\u7684\u84C4\u529B\u885D\u92D2\u3002" }),
    Object.freeze({ type: "strongholds", icon: "\u25B3", title: "\u5B88\u4F4F\u4E09\u8655\u6708\u9AA8\u64DA\u9EDE", short: "\u591A\u9EDE\u9632\u5B88", detail: "\u7378\u7FA4\u6703\u5206\u8DEF\u653B\u64CA\u4E09\u8655\u64DA\u9EDE\uFF1B\u4EFB\u4E00\u5931\u5B88\u90FD\u6703\u7D50\u675F\u9060\u5F81\u3002" }),
    Object.freeze({ type: "defend", icon: "\u25C9", title: "\u5B88\u4F4F\u6CF0\u5766\u8056\u6240", short: "\u6700\u7D42\u5B88\u8B77", detail: "\u5728\u7425\u73C0\u6CF0\u5766\u7684\u9707\u5730\u653B\u52E2\u4E0B\u5B88\u4F4F\u6700\u5F8C\u706B\u7A2E\u3002" })
  ]);
  var ESCORT_PATH = Object.freeze([[125, 650], [205, 585], [275, 515], [390, 435], [500, 325], [585, 235], [640, 145]].map(([x, y]) => Object.freeze({ x, y })));
  var ENEMY_BALANCE = Object.freeze({
    raptor: Object.freeze({ hp: 34, speed: 64, damage: 9, radius: 15, drop: 1, chance: 0.45 }),
    brute: Object.freeze({ hp: 125, speed: 36, damage: 16, radius: 24, drop: 2, chance: 1 }),
    spitter: Object.freeze({ hp: 58, speed: 40, damage: 12, radius: 17, drop: 1, chance: 0.65 }),
    matriarch: Object.freeze({ hp: 550, speed: 28, damage: 16, radius: 38, drop: 8, chance: 1 }),
    charger: Object.freeze({ hp: 900, speed: 38, damage: 24, radius: 44, drop: 10, chance: 1 }),
    boss: Object.freeze({ hp: 1500, speed: 26, damage: 22, radius: 46, drop: 14, chance: 1 })
  });
  var BOSS_WEAKPOINTS = Object.freeze({
    matriarch: Object.freeze({ kind: "brood-core", name: "\u5B75\u5316\u56CA", hp: 105, radius: 17, color: "#b9df78", bonus: 0.12 }),
    charger: Object.freeze({ kind: "shoulder-plate", name: "\u88C2\u89D2\u80A9\u7532", hp: 155, radius: 18, color: "#f0bd71", bonus: 0.1 }),
    boss: Object.freeze({ kind: "amber-core", name: "\u7425\u73C0\u6838\u5FC3", hp: 235, radius: 20, color: "#ffc35c", bonus: 0.14 })
  });
  var MAP_EVENT_DEFS = Object.freeze({
    merchant: Object.freeze({ name: "\u8352\u5883\u884C\u5546", icon: "\u25C7", short: "\u4EE5 6 \u7425\u73C0\u4EA4\u63DB\u88DC\u7D66" }),
    ruin: Object.freeze({ name: "\u53E4\u7378\u907A\u8DE1", icon: "\u2318", short: "\u89E3\u8B80\u4E00\u679A\u9060\u5F81\u795D\u798F" }),
    hunter: Object.freeze({ name: "\u53D7\u50B7\u7375\u4EBA", icon: "\u2301", short: "\u6551\u63F4\u5F8C\u52A0\u5165\u672C\u95DC\u4F5C\u6230" }),
    chest: Object.freeze({ name: "\u8352\u91CE\u5BF6\u7BB1", icon: "\u25A3", short: "\u958B\u555F\u53D6\u5F97\u96A8\u6A5F\u6750\u6599" }),
    elite: Object.freeze({ name: "\u7CBE\u82F1\u7378\u7FA4", icon: "\u265C", short: "\u64CA\u6557\u91D1\u5370\u7378\u7FA4\u9818\u53D6\u61F8\u8CDE" })
  });
  var MAP_EVENT_SPOTS = Object.freeze([[105, 415], [615, 415], [215, 690], [505, 690], [155, 130], [565, 130], [100, 650], [620, 650]].map(([x, y]) => Object.freeze({ x, y })));
  var ACTIVE_SKILLS = Object.freeze({
    volley: Object.freeze({ name: "\u8CAB\u9AA8\u9F4A\u5C04", cooldown: 7, description: "\u5411\u81EA\u52D5\u9396\u5B9A\u65B9\u5411\u5C04\u51FA\u4E94\u652F\u7A7F\u900F\u9AA8\u77DB\uFF1B\u53EF\u5728\u5546\u4EBA\u8655\u64F4\u5145\u7BAD\u6578\u8207\u7A7F\u900F\u3002" }),
    shock: Object.freeze({ name: "\u8352\u9AA8\u9707\u64CA", cooldown: 11, description: "\u9707\u64CA\u8EAB\u908A\u6575\u4EBA\u4E26\u4F7F\u5176\u6E1B\u901F\uFF1B\u53EF\u5728\u5546\u4EBA\u8655\u89E3\u9396\u6301\u7E8C\u6E1B\u901F\u5730\u5E36\u3002" })
  });
  var COMPANION_MAX_LEVEL = 10;
  var COMPANIONS = Object.freeze({
    emberclaw: Object.freeze({
      name: "\u7130\u810A\u8FC5\u9F8D",
      title: "\u70C8\u7130\u7375\u624B",
      color: "#f3a24d",
      hp: 82,
      radius: 16,
      speed: 205,
      range: 48,
      damage: 17,
      cooldown: 0.66,
      ability: "\u6BCF\u7B2C 4 \u6B21\u64B2\u64CA\u5F15\u7206\u7130\u722A\uFF0C\u707C\u71D2\u5468\u570D\u6575\u4EBA\u3002",
      short: "\u9AD8\u901F\u8FD1\u6230 \xB7 \u7130\u722A\u7206\u767C"
    }),
    tideroot: Object.freeze({
      name: "\u6F6E\u6C50\u89D2\u9F8D",
      title: "\u6F6E\u606F\u5B88\u8B77",
      color: "#75cfca",
      hp: 105,
      radius: 18,
      speed: 160,
      range: 245,
      damage: 12,
      cooldown: 1.05,
      ability: "\u767C\u5C04\u6F6E\u6C50\u5F48\u7DE9\u901F\u6575\u4EBA\uFF0C\u4E26\u9031\u671F\u6CBB\u7642\u7375\u4EBA\u8207\u8056\u7378\u5375\u3002",
      short: "\u9060\u7A0B\u7DE9\u901F \xB7 \u6F6E\u606F\u6CBB\u7642"
    }),
    stoneback: Object.freeze({
      name: "\u5CA9\u7532\u5E7C\u9F8D",
      title: "\u6676\u7532\u58C1\u58D8",
      color: "#d2b36b",
      hp: 165,
      radius: 22,
      speed: 132,
      range: 58,
      damage: 20,
      cooldown: 1.08,
      ability: "\u4E3B\u52D5\u5438\u5F15\u8FD1\u6575\uFF1B\u6676\u7532\u6E1B\u50B7\uFF0C\u91CD\u64CA\u7522\u751F\u7BC4\u570D\u9707\u6CE2\u3002",
      short: "\u5438\u5F15\u706B\u529B \xB7 \u6676\u7532\u9707\u6CE2"
    })
  });
  var companionKillXP = Object.freeze({ raptor: 7, spitter: 10, brute: 14, matriarch: 42, charger: 50, boss: 65 });
  var CARDS = Object.freeze({
    watchtower: { name: "\u7375\u810A\u5F29\u53F0", cost: 5, color: "#d8c58f", short: "\u9023\u767C\u7A7F\u9AA8", hp: 180, radius: 29, range: 250, description: "\u5FEB\u901F\u5C04\u51FA\u9AA8\u5F29\u7BAD\uFF1B\u5347\u7D1A\u63D0\u9AD8\u50B7\u5BB3\uFF0C\u4E09\u7D1A\u53EF\u7A7F\u900F\u5169\u540D\u6575\u4EBA\u3002" },
    catapult: { name: "\u7425\u73C0\u6295\u7378\u5668", cost: 6, color: "#e3ad52", short: "\u62CB\u77F3\u9707\u7378", hp: 215, radius: 34, range: 230, description: "\u62CB\u51FA\u7425\u73C0\u7206\u5F48\uFF0C\u843D\u9EDE\u9020\u6210\u7BC4\u570D\u50B7\u5BB3\u4E26\u6E1B\u901F\u7378\u7FA4\u3002" },
    torch: { name: "\u71E7\u706B\u70AC", cost: 3, color: "#f5b463", short: "\u7A7F\u706B\u71C3\u77DB", hp: 120, radius: 24, range: 148, description: "\u81EA\u52D5\u707C\u71D2\u6575\u4EBA\uFF1B\u6295\u77DB\u7A7F\u904E\u706B\u5708\u6703\u71C3\u71D2\u3002" },
    wall: { name: "\u88C2\u9AA8\u7246", cost: 3, color: "#ede2bb", short: "\u885D\u523A\u5F15\u7206", hp: 300, radius: 31, range: 120, description: "\u5438\u5F15\u4E26\u963B\u64CB\u6575\u4EBA\uFF1B\u885D\u523A\u7A7F\u7246\u5F15\u7206\u9AA8\u7247\u3002" },
    nest: { name: "\u5E7C\u7378\u5DE2", cost: 5, color: "#b3d99b", short: "\u5B75\u5316\u6230\u53CB", hp: 135, radius: 25, range: 225, description: "\u5B75\u51FA\u5E7C\u7378\uFF0C\u81EA\u52D5\u64B2\u64CA\u9644\u8FD1\u6575\u4EBA\u3002" },
    spring: { name: "\u6F6E\u6C50\u6CC9", cost: 5, color: "#91d7d8", short: "\u56DE\u8840\u7DE9\u6575", hp: 165, radius: 24, range: 112, description: "\u9644\u8FD1\u56DE\u5FA9\u751F\u547D\u4E26\u6E1B\u901F\u6575\u4EBA\uFF1B\u6CC9\u908A\u885D\u523A\u91CB\u653E\u5BD2\u6F6E\u3002" }
  });
  var STARTING_BUILD_DECK = Object.freeze(["watchtower", "catapult", "wall", "spring"]);
  var BUILD_CARDS = Object.freeze(Object.fromEntries(STARTING_BUILD_DECK.map((id) => [id, CARDS[id]])));
  var HIRES = Object.freeze({
    hunter: { name: "\u904A\u7375\u5F13\u624B", color: "#a6cfb8", short: "\u9060\u7A0B\u8DDF\u96A8", hp: 65, radius: 15, range: 240, description: "\u8DDF\u96A8\u7375\u4EBA\uFF0C\u4EE5\u9AA8\u7BAD\u9060\u7A0B\u652F\u63F4\uFF1B\u5012\u4E0B\u5F8C\u9700\u91CD\u65B0\u96C7\u4F63\u3002" },
    guard: { name: "\u9AA8\u76FE\u885B\u58EB", color: "#d5c599", short: "\u8FD1\u6230\u8B77\u885B", hp: 150, radius: 19, range: 140, description: "\u8DDF\u96A8\u7375\u4EBA\uFF0C\u4E3B\u52D5\u63A5\u6575\u4E26\u5438\u5F15\u653B\u64CA\uFF1B\u6700\u591A\u540C\u6642\u56DB\u540D\u4F63\u5175\u3002" }
  });
  var DEPLOY_CARDS = Object.freeze({ ...CARDS, ...HIRES });
  var WEAPONS = Object.freeze({
    spear: Object.freeze({ name: "\u9AA8\u77DB", symbol: "\u2197", short: "\u76F4\u7DDA\u7A7F\u900F", range: 560, ranged: true, description: "\u7A69\u5B9A\u6295\u64F2\u4E26\u7A7F\u900F\u7378\u7FA4\uFF1B\u935B\u9020\u5F8C\u6BCF\u7B2C\u4E09\u64CA\u5206\u88C2\u6210\u4E09\u53C9\u9AA8\u77DB\u3002" }),
    axe: Object.freeze({ name: "\u9AA8\u65A7", symbol: "\u25C8", short: "\u6247\u5F62\u91CD\u65AC", range: 104, ranged: false, description: "\u8FD1\u8EAB\u6247\u5F62\u91CD\u65AC\uFF1B\u935B\u9020\u5F8C\u6539\u70BA\u74B0\u8EAB\u8FF4\u65CB\u65AC\u3002" }),
    bow: Object.freeze({ name: "\u7375\u9AA8\u5F13", symbol: "\u27B9", short: "\u9060\u7A0B\u901F\u5C04", range: 620, ranged: true, description: "\u6700\u9060\u5C04\u7A0B\u7684\u9AD8\u901F\u9AA8\u7BAD\uFF1B\u935B\u9020\u5F8C\u6BCF\u7B2C\u4E09\u7BAD\u6247\u5C04\u4E09\u767C\u3002" }),
    blades: Object.freeze({ name: "\u88C2\u7259\u96D9\u5203", symbol: "\u2715", short: "\u8FD1\u6230\u9023\u65AC", range: 94, ranged: false, description: "\u9AD8\u901F\u96D9\u6BB5\u9023\u65AC\uFF1B\u935B\u9020\u5F8C\u6BCF\u7B2C\u56DB\u64CA\u7A81\u9032\u4E26\u74B0\u65AC\u3002" }),
    hammer: Object.freeze({ name: "\u9707\u9AA8\u91CD\u9318", symbol: "\u2B22", short: "\u7BC4\u570D\u91CD\u64CA", range: 132, ranged: false, description: "\u7DE9\u6162\u4F46\u5BEC\u5EE3\u7684\u9707\u9000\u91CD\u64CA\uFF1B\u935B\u9020\u5F8C\u8FFD\u52A0\u5730\u88C2\u6CE2\u3002" })
  });
  var LOADOUT_RULES = Object.freeze({ cardSlots: 4, buildCards: 3, hireCards: 1, weaponSlots: 1, skillSlots: 1 });
  var DEFAULT_LOADOUT = Object.freeze({
    cards: Object.freeze(["watchtower", "catapult", "wall", "hunter"]),
    weapons: Object.freeze(["spear"]),
    skills: Object.freeze(["volley"])
  });
  var LEGACY_LOADOUT = Object.freeze({
    cards: Object.freeze(Object.keys(DEPLOY_CARDS)),
    weapons: Object.freeze(["spear", "axe"]),
    skills: Object.freeze(Object.keys(ACTIVE_SKILLS)),
    legacy: true
  });
  var copyLoadout = (loadout) => ({ cards: [...loadout.cards], weapons: [...loadout.weapons], skills: [...loadout.skills], ...loadout.legacy ? { legacy: true } : {} });
  function isValidLoadout(loadout, { allowLegacy = false } = {}) {
    if (!loadout || typeof loadout !== "object" || !Array.isArray(loadout.cards) || !Array.isArray(loadout.weapons) || !Array.isArray(loadout.skills)) return false;
    const unique = (list2) => new Set(list2).size === list2.length;
    if (!unique(loadout.cards) || !unique(loadout.weapons) || !unique(loadout.skills)) return false;
    if (!loadout.cards.every((id) => Object.hasOwn(DEPLOY_CARDS, id)) || !loadout.weapons.every((id) => Object.hasOwn(WEAPONS, id)) || !loadout.skills.every((id) => Object.hasOwn(ACTIVE_SKILLS, id))) return false;
    if (loadout.legacy === true) return allowLegacy && loadout.cards.length > 0 && loadout.weapons.length > 0 && loadout.skills.length > 0;
    return loadout.cards.length === LOADOUT_RULES.cardSlots && loadout.cards.filter((id) => Object.hasOwn(CARDS, id)).length === LOADOUT_RULES.buildCards && loadout.cards.filter((id) => Object.hasOwn(HIRES, id)).length === LOADOUT_RULES.hireCards && loadout.weapons.length === LOADOUT_RULES.weaponSlots && loadout.skills.length === LOADOUT_RULES.skillSlots;
  }
  function normalizeLoadout(loadout) {
    return copyLoadout(isValidLoadout(loadout) ? loadout : DEFAULT_LOADOUT);
  }
  var CARD_PRICES = Object.freeze({ watchtower: { wood: 5, bone: 2, amber: 0 }, catapult: { wood: 6, bone: 4, amber: 3 }, torch: { wood: 3, bone: 1, amber: 0 }, wall: { wood: 3, bone: 2, amber: 0 }, nest: { wood: 4, bone: 3, amber: 0 }, spring: { wood: 5, bone: 3, amber: 0 }, hunter: { wood: 4, bone: 4, amber: 7 }, guard: { wood: 3, bone: 5, amber: 7 } });
  var UPGRADES = Object.freeze([
    { id: "volley-fan", branch: "volley", rank: 1, maxRank: 2, name: "\u4E03\u77DB\u5C55\u7FFC", symbol: "\u27B6", desc: "\u8CAB\u9AA8\u9F4A\u5C04\u7531 5 \u652F\u63D0\u5347\u70BA 7 \u652F\u9AA8\u77DB\uFF0C\u6247\u9762\u8986\u84CB\u66F4\u5BEC\u3002", apply: (g) => {
      g.mods.volleyArrows += 2;
    } },
    { id: "volley-pierce", branch: "volley", rank: 2, maxRank: 2, requires: "volley-fan", name: "\u4E5D\u77DB\u8CAB\u9663", symbol: "\u2197", desc: "\u8CAB\u9AA8\u9F4A\u5C04\u518D\u589E\u52A0 2 \u652F\u9AA8\u77DB\uFF0C\u4E14\u6BCF\u652F\u984D\u5916\u7A7F\u900F 1 \u540D\u6575\u4EBA\u3002", apply: (g) => {
      g.mods.volleyArrows += 2;
      g.mods.volleyPierce++;
    } },
    { id: "shock-field", branch: "shock", rank: 1, maxRank: 2, name: "\u9707\u5730\u9918\u6CE2", symbol: "\u2739", desc: "\u8352\u9AA8\u9707\u64CA\u5F8C\u7559\u4E0B 4 \u79D2\u6E1B\u901F\u5730\u5E36\uFF0C\u6301\u7E8C\u58D3\u5236\u9032\u5165\u5340\u57DF\u7684\u6575\u4EBA\u3002", apply: (g) => {
      g.mods.shockFieldDuration += 4;
    } },
    { id: "shock-resonance", branch: "shock", rank: 2, maxRank: 2, requires: "shock-field", name: "\u5730\u8108\u56DE\u97FF", symbol: "\u25CE", desc: "\u6E1B\u901F\u5730\u5E36\u5EF6\u9577\u81F3 6 \u79D2\u3001\u7BC4\u570D\u64F4\u5927\uFF0C\u4E26\u6BCF\u79D2\u9020\u6210 12 \u9EDE\u9918\u9707\u50B7\u5BB3\u3002", apply: (g) => {
      g.mods.shockFieldDuration += 2;
      g.mods.shockFieldRadius += 25;
      g.mods.shockFieldDamage += 12;
    } },
    { id: "fire", name: "\u5F29\u6A5F\u6DEC\u706B", symbol: "\u2668", desc: "\u7375\u810A\u5F29\u53F0\u50B7\u5BB3 +35%\uFF1B\u820A\u5F0F\u706B\u70AC\u71C3\u71D2\u4EA6\u7372\u5F97\u5F37\u5316\u3002", apply: (g) => {
      g.mods.fire += 0.35;
      g.mods.torch += 0.35;
    } },
    { id: "bones", name: "\u788E\u9AA8\u98A8\u66B4", symbol: "\u2727", desc: "\u9AA8\u7246\u5F15\u7206\u50B7\u5BB3 +50%\uFF0C\u7BC4\u570D +20%\u3002", apply: (g) => {
      g.mods.blast += 0.5;
      g.mods.blastRange += 0.2;
    } },
    { id: "dash", name: "\u8E0F\u98A8\u6B65", symbol: "\u27B6", desc: "\u885D\u523A\u51B7\u537B\u7E2E\u77ED 25%\uFF0C\u79FB\u901F +8%\u3002", apply: (g) => {
      g.mods.dash *= 0.75;
      g.mods.speed += 0.08;
    } },
    { id: "spear", weapon: "spear", name: "\u88C2\u77DB\u4E09\u53C9", symbol: "\u2197", desc: "\u6539\u9020\u77DB\u982D\u8207\u6295\u64F2\u63E1\u6CD5\uFF1A\u6BCF\u7B2C\u4E09\u6B21\u6295\u77DB\u540C\u6642\u5C04\u51FA\u4E09\u652F\u5206\u88C2\u9AA8\u77DB\u3002", apply: (g) => {
      g.mods.spearFork = true;
    } },
    { id: "axe", weapon: "axe", name: "\u74B0\u5203\u9AA8\u65A7", symbol: "\u25C8", desc: "\u91CD\u9444\u96D9\u9762\u65A7\u5203\uFF1A\u9AA8\u65A7\u7531\u524D\u65B9\u6247\u65AC\u6539\u70BA\u5168\u5468\u570D\u8FF4\u65CB\u65AC\u3002", apply: (g) => {
      g.mods.spin = true;
    } },
    { id: "bow", weapon: "bow", name: "\u4E09\u5F26\u9F4A\u767C", symbol: "\u27B9", desc: "\u88DD\u4E0A\u7378\u7B4B\u526F\u5F26\uFF1A\u6BCF\u7B2C\u4E09\u6B21\u5C04\u64CA\u5411\u524D\u65B9\u6247\u5C04\u4E09\u652F\u9AA8\u7BAD\u3002", apply: (g) => {
      g.mods.bowVolley = true;
    } },
    { id: "blades", weapon: "blades", name: "\u5F71\u6B65\u8FFD\u7375", symbol: "\u2715", desc: "\u5728\u96D9\u5203\u52A0\u88DD\u9264\u7259\u914D\u91CD\uFF1A\u6BCF\u7B2C\u56DB\u6B21\u9023\u65AC\u7A81\u9032\u7A7F\u6575\u4E26\u65BD\u5C55\u74B0\u8EAB\u96D9\u65AC\u3002", apply: (g) => {
      g.mods.bladeRush = true;
    } },
    { id: "hammer", weapon: "hammer", name: "\u5730\u8108\u9918\u9707", symbol: "\u2B22", desc: "\u5C07\u7194\u6676\u5D4C\u5165\u9318\u9996\uFF1A\u91CD\u64CA\u5F8C\u5411\u524D\u6495\u958B\u5BEC\u5EE3\u5730\u88C2\u6CE2\uFF0C\u53EF\u8CAB\u7A7F\u7378\u7FA4\u3002", apply: (g) => {
      g.mods.hammerQuake = true;
    } },
    { id: "beast", name: "\u6295\u7378\u5320\u85DD", symbol: "\u2667", desc: "\u7425\u73C0\u6295\u7378\u5668\u50B7\u5BB3 +40%\uFF0C\u88DD\u586B\u9593\u9694\u7E2E\u77ED 15%\u3002", apply: (g) => {
      g.mods.beast += 0.4;
      g.mods.beastSpeed *= 0.85;
    } },
    { id: "spring", name: "\u6F6E\u6C50\u56DE\u97FF", symbol: "\u2248", desc: "\u6CC9\u6C34\u6CBB\u7642 +50%\uFF0C\u6CC9\u908A\u885D\u523A\u5BD2\u6F6E\u50B7\u5BB3\u7FFB\u500D\u3002", apply: (g) => {
      g.mods.heal += 0.5;
      g.mods.frost += 1;
    } },
    { id: "armor", name: "\u7425\u73C0\u8B77\u7532", symbol: "\u2B21", desc: "\u53D7\u5230\u50B7\u5BB3\u964D\u4F4E 15%\uFF0C\u7ACB\u5373\u56DE\u5FA9 20 \u751F\u547D\u3002", apply: (g) => {
      g.mods.armor *= 0.85;
      g.heal(20);
    } },
    { id: "builder", name: "\u8352\u91CE\u5DE5\u5320", symbol: "\u2302", desc: "\u5546\u4EBA\u5EFA\u7BC9\u5361\u7684\u6728\u6750\u50F9\u683C\u6E1B\u5C11 1\uFF08\u6700\u4F4E 1\uFF09\u3002", apply: (g) => {
      g.mods.discount++;
    } },
    { id: "heart", name: "\u5DE8\u7378\u4E4B\u5FC3", symbol: "\u2661", desc: "\u751F\u547D\u4E0A\u9650 +25\uFF0C\u7ACB\u5373\u56DE\u6EFF 25 \u751F\u547D\u3002", apply: (g) => {
      g.hero.maxHp += 25;
      g.heal(25);
    } },
    { id: "loot", name: "\u62FE\u8352\u76F4\u89BA", symbol: "\u25C6", desc: "\u6389\u843D\u81EA\u52D5\u5438\u9644\u8DDD\u96E2 +80\uFF0C\u6BCF\u6CE2\u591A\u5F97 3 \u7425\u73C0\u3002", apply: (g) => {
      g.mods.magnet += 80;
      g.mods.income += 3;
    } },
    { id: "repair", name: "\u5B88\u5DE2\u8A93\u7D04", symbol: "\u25C9", desc: "\u8056\u7378\u5375\u56DE\u5FA9 45\uFF0C\u6BCF\u6CE2\u7D50\u675F\u518D\u56DE\u5FA9 15\u3002", apply: (g) => {
      g.base.hp = Math.min(g.base.maxHp, g.base.hp + 45);
      g.mods.repair += 15;
    } }
  ]);
  var UPGRADE_PRICES = Object.freeze({
    "volley-fan": { wood: 0, bone: 2, amber: 10 },
    "volley-pierce": { wood: 0, bone: 4, amber: 16 },
    "shock-field": { wood: 0, bone: 2, amber: 10 },
    "shock-resonance": { wood: 0, bone: 4, amber: 16 },
    fire: { wood: 0, bone: 4, amber: 18 },
    bones: { wood: 0, bone: 3, amber: 14 },
    dash: { wood: 0, bone: 3, amber: 16 },
    spear: { wood: 3, bone: 4, amber: 12 },
    axe: { wood: 3, bone: 4, amber: 12 },
    bow: { wood: 4, bone: 3, amber: 14 },
    blades: { wood: 3, bone: 5, amber: 14 },
    hammer: { wood: 5, bone: 5, amber: 14 },
    beast: { wood: 0, bone: 4, amber: 18 },
    spring: { wood: 0, bone: 3, amber: 16 },
    armor: { wood: 0, bone: 3, amber: 16 },
    builder: { wood: 0, bone: 2, amber: 14 },
    heart: { wood: 0, bone: 3, amber: 16 },
    loot: { wood: 0, bone: 3, amber: 16 },
    repair: { wood: 0, bone: 2, amber: 16 }
  });
  var UPGRADE_CARD_REQUIREMENTS = Object.freeze({ fire: Object.freeze(["watchtower", "torch"]), bones: Object.freeze(["wall"]), beast: Object.freeze(["catapult"]), spring: Object.freeze(["spring"]) });
  var clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  var SNAPSHOT_KEYS = ["runId", "seed", "nextId", "phase", "wave", "time", "realTime", "waveTime", "amber", "hero", "base", "buildings", "enemies", "projectiles", "drops", "nodes", "hand", "cardTimers", "choices", "selectedUpgrades", "spawnQueue", "spawnTimer", "stats", "mods"];
  var MARKET_KEYS = ["materials", "inventory", "allies"];
  var enemyTypes = ["raptor", "brute", "spitter", "matriarch", "charger", "boss"];
  var STAGE_ROSTERS = Object.freeze([
    Object.freeze(["raptor", "raptor", "raptor", "raptor", "raptor", "raptor", "raptor", "raptor"]),
    Object.freeze(["raptor", "raptor", "brute", "raptor", "raptor", "raptor", "raptor", "brute", "raptor", "raptor", "raptor"]),
    Object.freeze(["raptor", "spitter", "raptor", "spitter", "brute", "raptor", "spitter", "raptor", "matriarch"]),
    Object.freeze(["brute", "raptor", "spitter", "brute", "raptor", "brute", "spitter", "raptor", "brute", "spitter", "raptor", "brute", "raptor", "spitter", "raptor", "raptor"]),
    Object.freeze(["spitter", "raptor", "brute", "raptor", "spitter", "brute", "raptor", "spitter", "raptor", "brute", "spitter", "raptor", "brute", "raptor", "spitter", "brute", "raptor", "spitter", "raptor", "brute"]),
    Object.freeze(["brute", "spitter", "raptor", "brute", "raptor", "spitter", "brute", "raptor", "charger"]),
    Object.freeze(["spitter", "brute", "raptor", "spitter", "raptor", "brute", "spitter", "raptor", "brute", "spitter", "raptor", "brute", "raptor", "spitter", "brute", "raptor", "spitter", "brute"]),
    Object.freeze(["brute", "spitter", "raptor", "brute", "spitter", "raptor", "boss"])
  ]);
  var own = (object, key) => Object.hasOwn(object, key);
  var isNum = (v, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  function required(condition) {
    if (!condition) throw new Error("\u9060\u5F81\u5B58\u6A94\u683C\u5F0F\u640D\u58DE\u6216\u7248\u672C\u4E0D\u76F8\u5BB9");
  }
  function numbers(object, keys) {
    required(object && typeof object === "object" && !Array.isArray(object));
    for (const key of keys) required(isNum(object[key]));
  }
  function list(value, max) {
    required(Array.isArray(value) && value.length <= max);
  }
  function actor(value) {
    numbers(value, ["x", "y", "hp", "r"]);
    required(isNum(value.x, -100, 820) && isNum(value.y, -100, 920) && isNum(value.r, 1, 100));
  }
  function objectiveActors(objective) {
    return objective ? [objective.npc, objective.captive, ...objective.targets || [], ...objective.points || []].filter(Boolean) : [];
  }
  function validateObjective(objective, wave) {
    required(objective && typeof objective === "object" && objective.stage === wave && STAGE_OBJECTIVES[wave - 1]?.type === objective.type);
    required(typeof objective.completed === "boolean");
    if (objective.type === "escort") {
      actor(objective.npc);
      numbers(objective.npc, ["maxHp", "speed"]);
      required(isNum(objective.npc.maxHp, 1, 1e3) && isNum(objective.npc.hp, 0, objective.npc.maxHp));
      required(Number.isInteger(objective.npc.waypoint) && isNum(objective.npc.waypoint, 0, ESCORT_PATH.length));
      required(typeof objective.npc.reached === "boolean");
    } else if (objective.type === "destroy") {
      list(objective.targets, 3);
      required(objective.targets.length === 3);
      for (const target of objective.targets) {
        actor(target);
        numbers(target, ["maxHp"]);
        required(target.objectiveKind === "nest" && isNum(target.maxHp, 1, 2e3) && isNum(target.hp, 0, target.maxHp));
      }
    } else if (objective.type === "mining") {
      numbers(objective, ["timeLeft", "duration", "mined", "required"]);
      required(Number.isInteger(objective.mined) && Number.isInteger(objective.required) && isNum(objective.mined, 0, 3) && objective.required === 3 && isNum(objective.timeLeft, 0, 50) && objective.duration === 50);
      list(objective.nodeIds, 3);
      required(objective.nodeIds.length === 3 && objective.nodeIds.every(Number.isInteger));
    } else if (objective.type === "rescue") {
      actor(objective.captive);
      numbers(objective.captive, ["maxHp"]);
      numbers(objective, ["progress", "required"]);
      required(isNum(objective.captive.maxHp, 1, 1e3) && isNum(objective.captive.hp, 0, objective.captive.maxHp) && typeof objective.rescued === "boolean" && objective.required === 4 && isNum(objective.progress, 0, objective.required));
    } else if (objective.type === "strongholds") {
      list(objective.points, 3);
      required(objective.points.length === 3);
      for (const point2 of objective.points) {
        actor(point2);
        numbers(point2, ["maxHp"]);
        required(point2.objectiveKind === "stronghold" && isNum(point2.maxHp, 1, 2e3) && isNum(point2.hp, 0, point2.maxHp));
      }
    }
  }
  function validateSnapshot(s) {
    required(s && [1, 2].includes(s.version) && typeof s.runId === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(s.runId));
    required(validateTutorial(s.tutorial));
    if (s.tutorial?.reward) required(s.phase === "prep" && s.wave === 1 && s.stats.waves === 1);
    required(SNAPSHOT_KEYS.every((key) => own(s, key)));
    numbers(s, ["seed", "nextId", "wave", "time", "realTime", "waveTime", "amber", "spawnTimer", "rngState"]);
    required(Number.isInteger(s.rngState) && isNum(s.rngState, 0, 4294967295));
    required(Number.isInteger(s.wave) && isNum(s.wave, 0, MAX_WAVES) && isNum(s.amber, 0, 99));
    required(["prep", "wave", "draft", "win", "lose"].includes(s.phase));
    required(s.phase !== "wave" || s.wave > 0);
    required(s.phase !== "draft" || s.wave > 0 && s.wave < MAX_WAVES);
    required(s.phase !== "win" || s.wave === MAX_WAVES || s.wave === 6);
    actor(s.hero);
    actor(s.base);
    numbers(s.hero, ["maxHp", "angle", "attackCD", "dashCD", "dashTime", "dashX", "dashY", "invulnerable", "swing"]);
    for (const key of ["volleyCD", "shockCD"]) if (s.hero[key] !== void 0) required(isNum(s.hero[key], 0, 1e6));
    if (s.hero.weaponChain !== void 0) required(Number.isInteger(s.hero.weaponChain) && isNum(s.hero.weaponChain, 0, 1e8));
    numbers(s.base, ["maxHp"]);
    required(s.hero.id === "hero" && s.base.id === "base");
    required(own(WEAPONS, s.hero.weapon));
    if (s.loadout !== void 0) {
      required(isValidLoadout(s.loadout, { allowLegacy: true }));
      required(s.loadout.weapons.includes(s.hero.weapon));
    }
    if (s.campUnlocks !== void 0 && s.campUnlocks !== null) {
      list(s.campUnlocks, UPGRADES.length);
      required(s.campUnlocks.every((id) => UPGRADES.some((upgrade) => upgrade.id === id)) && new Set(s.campUnlocks).size === s.campUnlocks.length);
    }
    if (s.campSupplyBonus !== void 0) {
      numbers(s.campSupplyBonus, ["wood", "bone", "amber"]);
      for (const key of ["wood", "bone", "amber"]) required(Number.isInteger(s.campSupplyBonus[key]) && isNum(s.campSupplyBonus[key], 0, 999));
    }
    for (const a of [s.hero, s.base]) required(isNum(a.maxHp, 1, 1e4) && isNum(a.hp, 0, a.maxHp));
    required(["lose", "win"].includes(s.phase) || s.hero.hp > 0 && s.base.hp > 0);
    list(s.buildings, 16);
    list(s.enemies, 120);
    list(s.projectiles, 250);
    list(s.drops, 150);
    list(s.nodes, 30);
    const ids = new Set(), mapEvents = s.eventPlan || [];
    if (s.eventPlan !== void 0) {
      list(mapEvents, 5);
      required(mapEvents.length === 5 && new Set(mapEvents.map((event) => event.type)).size === 5 && new Set(mapEvents.map((event) => event.stage)).size === 5);
      for (const event of mapEvents) {
        numbers(event, ["x", "y", "r", "stage", "variant"]);
        required(Number.isInteger(event.id) && event.id > 0 && !ids.has(event.id));
        ids.add(event.id);
        required(own(MAP_EVENT_DEFS, event.type) && isNum(event.x, 40, 680) && isNum(event.y, 60, 760) && isNum(event.r, 10, 60) && Number.isInteger(event.stage) && isNum(event.stage, 1, 7) && Number.isInteger(event.variant) && isNum(event.variant, 0, 2) && ["pending", "active", "completed", "missed"].includes(event.status));
        list(event.eliteIds, 6);
        required(event.eliteIds.every((id) => Number.isInteger(id) && id > 0) && new Set(event.eliteIds).size === event.eliteIds.length);
      }
    }
    if (s.version === 2) {
      required(MARKET_KEYS.every((key) => own(s, key)));
      list(s.allies, 4);
      for (const k of ["wood", "bone"]) required(Number.isInteger(s.materials?.[k]) && isNum(s.materials[k], 0, 999));
      for (const k of Object.keys(DEPLOY_CARDS)) {
        const value = s.inventory?.[k];
        required(value === void 0 && ["watchtower", "catapult"].includes(k) || Number.isInteger(value) && isNum(value, 0, 99));
      }
      for (const a of s.allies) {
        actor(a);
        required(own(HIRES, a.type));
        numbers(a, ["maxHp", "cd", "angle"]);
        required(isNum(a.maxHp, 1, 1e3) && isNum(a.hp, 0, a.maxHp));
      }
      required(s.phase !== "draft");
    }
    if (s.companion !== void 0 && s.companion !== null) {
      const p = s.companion;
      actor(p);
      required(own(COMPANIONS, p.type));
      numbers(p, ["maxHp", "cd", "abilityCD", "angle", "xp", "attackCount"]);
      required(Number.isInteger(p.level) && isNum(p.level, 1, COMPANION_MAX_LEVEL));
      required(Number.isInteger(p.xp) && isNum(p.xp, 0, 1e8));
      required(Number.isInteger(p.attackCount) && isNum(p.attackCount, 0, 1e8));
      required(isNum(p.maxHp, 1, 5e3) && isNum(p.hp, 0, p.maxHp));
    }
    if (s.objective !== void 0 && s.objective !== null) validateObjective(s.objective, s.wave);
    const weakpoints = s.enemies.map((enemy) => enemy.weakpoint).filter(Boolean);
    for (const a of [...s.buildings, ...s.enemies, ...weakpoints, ...s.projectiles, ...s.nodes, ...s.version === 2 ? s.allies : [], ...objectiveActors(s.objective)]) {
      required(Number.isInteger(a.id) && a.id > 0 && !ids.has(a.id));
      ids.add(a.id);
    }
    required(Number.isInteger(s.nextId) && s.nextId > Math.max(0, ...ids));
    for (const b of s.buildings) {
      actor(b);
      required(own(CARDS, b.type));
      numbers(b, ["maxHp", "level", "cd", "healCD"]);
      numbers(b.pet, ["x", "y"]);
      required(Number.isInteger(b.level) && isNum(b.level, 1, 3));
    }
    for (const e of s.enemies) {
      actor(e);
      required(enemyTypes.includes(e.type));
      numbers(e, ["maxHp", "speed", "damage", "cd", "windup", "burn", "slow", "flash", "angle"]);
      if (e.bossPhase !== void 0) required(Number.isInteger(e.bossPhase) && isNum(e.bossPhase, 0, 3));
      if (e.attackCount !== void 0) required(Number.isInteger(e.attackCount) && isNum(e.attackCount, 0, 1e6));
      if (e.attackKind !== void 0) required(typeof e.attackKind === "string" && e.attackKind.length <= 40);
      if (e.elite !== void 0) required(typeof e.elite === "boolean");
      if (e.eliteEventId !== void 0) required(Number.isInteger(e.eliteEventId) && e.eliteEventId > 0 && mapEvents.some((mapEvent) => mapEvent.type === "elite" && mapEvent.id === e.eliteEventId));
      if (e.windup > 0) numbers(e, ["lockX", "lockY"]);
      if (e.weakpoint) {
        const w = e.weakpoint;
        actor(w);
        numbers(w, ["maxHp", "openTime", "bossId"]);
        required(BOSS_WEAKPOINTS[e.type]?.kind === w.kind && w.bossId === e.id && isNum(w.maxHp, 1, 5e3) && isNum(w.hp, 0, w.maxHp) && typeof w.open === "boolean" && typeof w.broken === "boolean");
      }
    }
    for (const p of s.projectiles) {
      numbers(p, ["x", "y", "vx", "vy", "damage", "life"]);
      required(typeof p.hostile === "boolean");
      if (!p.hostile) {
        list(p.hits, 150);
        required(p.hits.every(Number.isInteger));
        numbers(p, ["pierce"]);
        required(typeof p.fire === "boolean");
        if (p.hitRadius !== void 0) required(isNum(p.hitRadius, 1, 80));
        if (p.targetWeakpointId !== void 0) required(Number.isInteger(p.targetWeakpointId) && p.targetWeakpointId >= 0);
        if (p.kind === "catapult") {
          numbers(p, ["startX", "startY", "targetX", "targetY", "maxLife", "radius"]);
          required(isNum(p.maxLife, 0.1, 5) && isNum(p.radius, 1, 300));
        }
        if (p.kind === "shock-field") {
          numbers(p, ["maxLife", "radius", "tickCD"]);
          required(isNum(p.maxLife, 0.1, 10) && isNum(p.radius, 1, 300) && isNum(p.tickCD, -1, 2));
        }
      }
    }
    for (const d of s.drops) numbers(d, ["x", "y", "value", "life"]);
    for (const n of s.nodes) actor(n);
    list(s.hand, 4);
    list(s.cardTimers, 4);
    required(s.hand.length === 4 && s.cardTimers.length === 4);
    s.hand.forEach((type, i) => {
      required(type === null || own(s.version === 2 ? DEPLOY_CARDS : CARDS, type));
      required(isNum(s.cardTimers[i], 0, 10));
      required(s.version === 2 || type !== null || s.cardTimers[i] > 0);
    });
    if (s.loadout !== void 0 && !s.loadout.legacy) required(s.hand.every((type) => type === null || s.loadout.cards.includes(type)));
    const validUpgrade = (id) => UPGRADES.some((u) => u.id === id);
    list(s.choices, 3);
    list(s.selectedUpgrades, s.version === 2 ? 32 : 5);
    required(s.choices.every(validUpgrade) && s.selectedUpgrades.every(validUpgrade));
    required(s.phase !== "draft" || s.choices.length === 3 && new Set(s.choices).size === 3);
    list(s.spawnQueue, 120);
    required(s.spawnQueue.every((t) => enemyTypes.includes(t)));
    numbers(s.stats, ["kills", "buildings", "upgrades", "combos", "damage", "harvested", "waves"]);
    numbers(s.mods, ["fire", "torch", "blast", "blastRange", "dash", "speed", "pierce", "spear", "axe", "beast", "beastSpeed", "heal", "frost", "armor", "discount", "magnet", "income", "repair"]);
    required(typeof s.mods.spin === "boolean");
    for (const key of ["bow", "blades", "hammer"]) if (s.mods[key] !== void 0) required(isNum(s.mods[key], 0, 500));
    for (const key of ["spearFork", "bowVolley", "bladeRush", "hammerQuake"]) if (s.mods[key] !== void 0) required(typeof s.mods[key] === "boolean");
    for (const key of ["volleyArrows", "volleyPierce", "shockFieldDuration", "shockFieldRadius", "shockFieldDamage"]) if (s.mods[key] !== void 0) required(isNum(s.mods[key], 0, 500));
    return true;
  }

  var CAMP_PRODUCTION = Object.freeze({
    tent: Object.freeze({ resource: "wood", name: "\u6728\u6750", icon: "\u25B0", per: "\u6BCF\u5B8C\u6210 2 \u95DC" }),
    forge: Object.freeze({ resource: "bone", name: "\u7378\u9AA8", icon: "\u2727", per: "\u6BCF\u5B8C\u6210 3 \u95DC" }),
    cache: Object.freeze({ resource: "amber", name: "\u7425\u73C0", icon: "\u25C6", per: "\u6BCF\u5B8C\u6210 4 \u95DC" }),
    nursery: Object.freeze({ resource: "warmth", name: "\u5B75\u5316\u71B1\u5EA6", icon: "\u2668", per: "\u6BCF\u5B8C\u6210 3 \u95DC" })
  });
  var CAMP_TASKS = Object.freeze({
    porter: Object.freeze({ name: "\u642C\u904B\u5DE5\u963F\u62D3", title: "\u71DF\u5730\u6574\u5099", detail: "\u5EFA\u9020\u6216\u5347\u7D1A 1 \u6B21\u6C38\u4E45\u8A2D\u65BD\u3002", reward: Object.freeze({ wood: 3, amber: 1, stones: 1 }) }),
    hunter: Object.freeze({ name: "\u5DE1\u6797\u7375\u4EBA\u745F\u96C5", title: "\u7378\u7FA4\u61F8\u8CDE", detail: "\u5728\u9060\u5F81\u4E2D\u7D2F\u8A08\u64CA\u6557\u6307\u5B9A\u6578\u91CF\u7684\u6575\u4EBA\u3002", reward: Object.freeze({ bone: 4, amber: 2, stones: 1 }) })
  });
  var HATCH_REQUIREMENTS = Object.freeze({
    emberclaw: Object.freeze({ nursery: 0, warmth: 0, label: "\u521D\u59CB\u8056\u7378\u5375" }),
    tideroot: Object.freeze({ nursery: 1, warmth: 3, label: "\u9700\u8981 1 \u7D1A\u7378\u5375\u6EAB\u5BA4" }),
    stoneback: Object.freeze({ nursery: 2, warmth: 5, label: "\u9700\u8981 2 \u7D1A\u7378\u5375\u6EAB\u5BA4" })
  });
  var lockedGoods = Object.freeze({ bow: ["forge", 1], blades: ["forge", 2], hammer: ["forge", 3], armor: ["tent", 1], heart: ["tent", 2], dash: ["tent", 3], builder: ["cache", 1], loot: ["cache", 2], repair: ["cache", 3] });
  var facilityLevel = (camp, type) => camp.buildings.find((building) => building.type === type)?.level || 0;
  function ensureCampProgress(camp) {
    if (!camp.stockpile) camp.stockpile = { wood: 0, bone: 0, amber: 0, warmth: 0 };
    if (!camp.production) camp.production = { tent: 0, forge: 0, cache: 0, nursery: 0 };
    if (!camp.tasks) camp.tasks = { porter: { progress: 0, goal: 1, ready: false, cycles: 0 }, hunter: { progress: 0, goal: 20, ready: false, cycles: 0 } };
    return camp;
  }
  function recordCampExpedition(state, snapshot) {
    const camp = ensureCampProgress(state.camp), waves = Math.max(0, Math.min(MAX_WAVES, snapshot.stats.waves || 0));
    if (waves > 0) {
      const intervals = { tent: 2, forge: 3, cache: 4, nursery: 3 };
      for (const [type, interval] of Object.entries(intervals)) {
        const level = facilityLevel(camp, type);
        if (level) camp.production[type] = Math.min(99, camp.production[type] + Math.floor(waves / interval) * level);
      }
    }
    const hunter = camp.tasks.hunter;
    if (!hunter.ready) {
      hunter.progress = Math.min(hunter.goal, hunter.progress + (snapshot.stats.kills || 0));
      hunter.ready = hunter.progress >= hunter.goal;
    }
    return camp;
  }
  var FACILITIES = Object.freeze({
    tent: { name: "\u7375\u4EBA\u5E33\u7BF7", costs: [3, 5, 8], tag: "\u9AD4\u9B44", desc: "\u63D0\u9AD8\u51FA\u5F81\u751F\u547D\u4E26\u751F\u7522\u6728\u6750\uFF1B\u7B49\u7D1A\u4F9D\u6B21\u89E3\u9396\u8B77\u7532\u3001\u5DE8\u7378\u4E4B\u5FC3\u8207\u8E0F\u98A8\u6B65\u3002", benefit: (l) => `\u751F\u547D +${l * 10} \xB7 \u6728\u6750 \xD7${l}` },
    forge: { name: "\u9AA8\u5668\u5DE5\u574A", costs: [4, 6, 9], tag: "\u6B66\u6280", desc: "\u5F37\u5316\u6240\u6709\u4E3B\u6B66\u5668\u4E26\u751F\u7522\u7378\u9AA8\uFF1B\u4E00\u81F3\u4E09\u7D1A\u4F9D\u6B21\u89E3\u9396\u7375\u9AA8\u5F13\u3001\u88C2\u7259\u96D9\u5203\u548C\u9707\u9AA8\u91CD\u9318\u3002", benefit: (l) => `\u6B66\u5668 +${l * 5}% \xB7 \u7378\u9AA8 \xD7${l}` },
    cache: { name: "\u88DC\u7D66\u5009\u5EAB", costs: [3, 5, 8], tag: "\u7C4C\u5099", desc: "\u589E\u52A0\u51FA\u5F81\u7425\u73C0\u4E26\u6301\u7E8C\u751F\u7522\u7425\u73C0\uFF1B\u7B49\u7D1A\u89E3\u9396\u5DE5\u5320\u3001\u62FE\u8352\u548C\u5B88\u5DE2\u5546\u54C1\u3002", benefit: (l) => `\u51FA\u5F81\u7425\u73C0 +${l * 2} \xB7 \u7522\u51FA \xD7${l}` },
    nursery: { name: "\u7378\u5375\u6EAB\u5BA4", costs: [3, 5, 8], tag: "\u5B88\u8B77", desc: "\u63D0\u9AD8\u8056\u7378\u5375\u8010\u4E45\u4E26\u751F\u7522\u5B75\u5316\u71B1\u5EA6\uFF1B\u5347\u7D1A\u5F8C\u53EF\u4EE5\u5B75\u5316\u66F4\u591A\u4F19\u4F34\u3002", benefit: (l) => `\u7378\u5375 +${l * 15} \xB7 \u71B1\u5EA6 \xD7${l}` }
  });
  function rewardFor(snapshot) {
    if (!["win", "lose"].includes(snapshot.phase)) throw new Error("\u9060\u5F81\u5C1A\u672A\u7D50\u675F\uFF0C\u4E0D\u80FD\u7D50\u7B97");
    return Math.max(0, Math.min(MAX_WAVES, snapshot.stats.waves)) * 2 + (snapshot.phase === "win" ? 8 : 0);
  }

  var SAVE_KEY = "emberwild_save_v2";
  var BACKUP_KEY = "emberwild_save_v2_backup";
  var LEGACY_KEY = "emberwild_prototype_v1";
  var PROGRESS_KEYS = Object.freeze([SAVE_KEY, BACKUP_KEY, LEGACY_KEY]);
  var clone = (value) => JSON.parse(JSON.stringify(value));
  var num = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  var need = (ok) => {
    if (!ok) throw new Error("\u71DF\u5730\u5B58\u6A94\u683C\u5F0F\u640D\u58DE\u6216\u7248\u672C\u4E0D\u76F8\u5BB9");
  };
  function freshCompanionState() {
    return { selected: null, roster: Object.fromEntries(Object.keys(COMPANIONS).map((type) => [type, { unlocked: false, level: 1, xp: 0 }])) };
  }
  function ensureCompanionState(profile) {
    if (profile.companions === void 0) profile.companions = freshCompanionState();
    return profile.companions;
  }
  function ensureLoadoutState(camp) {
    if (camp.loadout === void 0) camp.loadout = normalizeLoadout(DEFAULT_LOADOUT);
    return camp.loadout;
  }
  function offerWeekKey(time = Date.now()) {
    const date = new Date(time), utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
    const year = utc.getUTCFullYear(), start = new Date(Date.UTC(year, 0, 1));
    return `${year}-W${String(Math.ceil(((utc - start) / 864e5 + 1) / 7)).padStart(2, "0")}`;
  }
  function ensureOfferPromptState(profile, migrateCompleted = false) {
    if (profile.offerPrompts === void 0) {
      const seen = migrateCompleted && profile.tutorialDone === true;
      profile.offerPrompts = { starterShown: seen, weeklyShownWeek: seen ? offerWeekKey() : "" };
    }
    return profile.offerPrompts;
  }
  function syncCompanionProgress(state, snapshot) {
    if (["done", "skipped"].includes(snapshot.tutorial?.status)) state.profile.tutorialDone = true;
    const p = snapshot.companion;
    if (!p) return;
    const companions = ensureCompanionState(state.profile), saved = companions.roster[p.type];
    if (!saved) return;
    saved.unlocked = true;
    saved.level = p.level;
    saved.xp = p.xp;
    companions.selected = p.type;
  }
  function freshState(legacy = {}) {
    if (!legacy || typeof legacy !== "object") legacy = {};
    const number = (v, max) => Math.floor(clamp(Number(v) || 0, 0, max));
    const legacyComplete = number(legacy.runs, 1e6) > 0;
    const state = { profile: { runs: number(legacy.runs, 1e6), best: number(legacy.best, MAX_WAVES), victories: number(legacy.victories, 1e6), companions: freshCompanionState(), tutorialDone: legacyComplete, purchaseTransactions: [], offerPrompts: { starterShown: legacyComplete, weeklyShownWeek: legacyComplete ? offerWeekKey() : "" } }, camp: { stones: 8, buildings: [], position: { x: 980, y: 960, angle: 0 }, loadout: normalizeLoadout(DEFAULT_LOADOUT) }, run: null, lastResult: null };
    ensureCampProgress(state.camp);
    return state;
  }
  function validateState(state) {
    need(state && typeof state === "object" && state.profile && state.camp);
    if (state.profile.tutorialDone !== void 0) need(typeof state.profile.tutorialDone === "boolean");
    for (const k of ["runs", "victories"]) need(num(state.profile[k], 0, 1e6));
    need(num(state.profile.best, 0, MAX_WAVES));
    if (state.profile.companions !== void 0) {
      const companions = state.profile.companions, types2 = Object.keys(COMPANIONS);
      need(companions && typeof companions === "object" && companions.roster && typeof companions.roster === "object");
      need(companions.selected === null || types2.includes(companions.selected));
      for (const type of types2) {
        const p = companions.roster[type];
        need(p && typeof p.unlocked === "boolean" && num(p.level, 1, COMPANION_MAX_LEVEL) && num(p.xp, 0, 1e8));
      }
      if (companions.selected !== null) need(companions.roster[companions.selected].unlocked);
    }
    if (state.profile.purchaseTransactions !== void 0) {
      need(Array.isArray(state.profile.purchaseTransactions) && state.profile.purchaseTransactions.length <= 200);
      const ids = new Set();
      for (const item of state.profile.purchaseTransactions) {
        need(item && /^\d{1,40}$/.test(item.transactionId) && /^[a-z0-9-]{1,40}$/.test(item.offerId) && num(item.deliveredAt, 0, Number.MAX_SAFE_INTEGER) && !ids.has(item.transactionId));
        ids.add(item.transactionId);
      }
    }
    if (state.profile.offerPrompts !== void 0) {
      const prompts = state.profile.offerPrompts;
      need(prompts && typeof prompts.starterShown === "boolean" && typeof prompts.weeklyShownWeek === "string" && (prompts.weeklyShownWeek === "" || /^\d{4}-W\d{2}$/.test(prompts.weeklyShownWeek)));
    }
    need(num(state.camp.stones, 0, 1e8));
    need(Array.isArray(state.camp.buildings) && state.camp.buildings.length <= 4);
    if (state.camp.stockpile !== void 0) {
      for (const resource of ["wood", "bone", "amber", "warmth"]) need(num(state.camp.stockpile?.[resource], 0, 999));
    }
    if (state.camp.production !== void 0) {
      for (const type of Object.keys(FACILITIES)) need(num(state.camp.production?.[type], 0, 99));
    }
    if (state.camp.tasks !== void 0) {
      for (const npc of Object.keys(CAMP_TASKS)) {
        const task = state.camp.tasks?.[npc];
        need(task && num(task.progress, 0, 1e6) && num(task.goal, 1, 1e6) && num(task.cycles, 0, 1e6) && typeof task.ready === "boolean");
        need(task.progress <= task.goal);
      }
    }
    if (state.camp.loadout !== void 0) need(isValidLoadout(state.camp.loadout));
    if (state.camp.position !== void 0) {
      const p = state.camp.position;
      need(p && Number.isFinite(p.x) && p.x >= 80 && p.x <= 1920 && Number.isFinite(p.y) && p.y >= 80 && p.y <= 1620 && Number.isFinite(p.angle) && Math.abs(p.angle) <= Math.PI * 2);
    }
    const slots = new Set(), types = new Set();
    for (const b of state.camp.buildings) {
      need(b && Object.hasOwn(FACILITIES, b.type) && num(b.slot, 0, 5) && num(b.level, 1, 3) && !slots.has(b.slot) && !types.has(b.type));
      slots.add(b.slot);
      types.add(b.type);
    }
    need(state.run === null || typeof state.run === "object");
    if (state.run !== null) validateSnapshot(state.run);
    if (state.lastResult !== null) {
      const r = state.lastResult;
      need(r && typeof r.id === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(r.id));
      need(typeof r.won === "boolean" && num(r.waves, 0, MAX_WAVES) && num(r.stones, 0, MAX_WAVES * 2 + 8) && num(r.kills, 0, 1e4) && num(r.combos, 0, 1e7) && num(r.completedAt, 0, Number.MAX_SAFE_INTEGER));
      if (r.loot !== void 0) {
        need(r.loot && num(r.loot.wood, 0, 999) && num(r.loot.bone, 0, 999) && num(r.loot.amber, 0, 99) && num(r.loot.harvested, 0, 30));
      }
    }
    return true;
  }
  function digest(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
  function encode(state, revision = 1, updatedAt = Date.now()) {
    validateState(state);
    const payload = { version: 10, revision, updatedAt, state };
    return JSON.stringify({ ...payload, checksum: digest(JSON.stringify(payload)) });
  }
  function decode2(raw) {
    if (typeof raw !== "string" || raw.length > 5e5) throw new Error("\u5B58\u6A94\u70BA\u7A7A\u6216\u8D85\u904E\u5927\u5C0F\u9650\u5236");
    const e = JSON.parse(raw);
    if (![2, 3, 4, 5, 6, 7, 8, 9, 10].includes(e?.version)) throw new Error("\u5B58\u6A94\u7248\u672C\u4E0D\u76F8\u5BB9\uFF0C\u8ACB\u4FDD\u7559\u5099\u4EFD");
    need(num(e.revision, 0, Number.MAX_SAFE_INTEGER) && num(e.updatedAt, 0, Number.MAX_SAFE_INTEGER));
    need(e.checksum === digest(JSON.stringify({ version: e.version, revision: e.revision, updatedAt: e.updatedAt, state: e.state })));
    validateState(e.state);
    return e;
  }
  var SaveStore = class {
    constructor(storage2, locks = null) {
      this.storage = storage2;
      this.locks = locks;
      this.queue = Promise.resolve();
      this.reload();
    }
    reload() {
      this.warning = "";
      this.blocked = false;
      this.revision = 0;
      this.savedAt = 0;
      this.validRaw = null;
      this.raw = null;
      this.state = freshState();
      try {
        this.raw = this.storage.getItem(SAVE_KEY);
        const backup = this.storage.getItem(BACKUP_KEY);
        if (this.raw) {
          try {
            const e = decode2(this.raw);
            this.accept(e, this.raw);
            return;
          } catch {
          }
        }
        let future = false;
        try {
          future = JSON.parse(this.raw)?.version > 10;
        } catch {
        }
        if (future) {
          this.blocked = true;
          this.warning = "\u9019\u4EFD\u5B58\u6A94\u4F86\u81EA\u8F03\u65B0\u7248\u672C\uFF0C\u5DF2\u505C\u6B62\u5BEB\u5165\u3002\u8ACB\u5148\u532F\u51FA\u5099\u4EFD\u3002";
          return;
        }
        if (backup) {
          try {
            const e = decode2(backup);
            this.accept(e, backup);
            this.warning = "\u4E3B\u5B58\u6A94\u7570\u5E38\uFF0C\u5DF2\u6062\u5FA9\u4E0A\u4E00\u4EFD\u5099\u4EFD\u3002";
            return;
          } catch {
          }
        }
        if (this.raw || backup) {
          this.blocked = true;
          this.warning = "\u5B58\u6A94\u7121\u6CD5\u8B80\u53D6\uFF0C\u5DF2\u4FDD\u7559\u539F\u8CC7\u6599\u4E26\u505C\u6B62\u5BEB\u5165\u3002\u53EF\u5148\u532F\u51FA\u5099\u4EFD\u3002";
          return;
        }
        let legacy = {};
        try {
          legacy = JSON.parse(this.storage.getItem(LEGACY_KEY) || "{}");
        } catch {
        }
        this.state = freshState(legacy);
      } catch {
        this.blocked = true;
        this.warning = "\u700F\u89BD\u5668\u4E0D\u5141\u8A31\u672C\u6A5F\u5132\u5B58\uFF1B\u8ACB\u5141\u8A31\u5132\u5B58\u5F8C\u518D\u958B\u59CB\u9060\u5F81\u3002";
      }
    }
    accept(e, raw) {
      this.state = clone(e.state);
      ensureCompanionState(this.state.profile);
      ensureOfferPromptState(this.state.profile, true);
      ensureLoadoutState(this.state.camp);
      ensureCampProgress(this.state.camp);
      this.revision = e.revision;
      this.savedAt = e.updatedAt;
      this.validRaw = raw;
    }
    commit(fn) {
      if (this.blocked) throw new Error(this.warning || "\u5B58\u6A94\u66AB\u4E0D\u53EF\u5BEB\u5165");
      if (this.storage.getItem(SAVE_KEY) !== this.raw) {
        const e = new Error("\u53E6\u4E00\u500B\u9801\u9762\u5DF2\u66F4\u65B0\u5B58\u6A94\uFF0C\u8ACB\u8F09\u5165\u6700\u65B0\u9032\u5EA6");
        e.code = "CONFLICT";
        throw e;
      }
      const next = clone(this.state);
      const result = fn(next);
      ensureCompanionState(next.profile);
      ensureOfferPromptState(next.profile, true);
      ensureLoadoutState(next.camp);
      ensureCampProgress(next.camp);
      validateState(next);
      const raw = encode(next, this.revision + 1);
      if (this.validRaw) {
        try {
          this.storage.setItem(BACKUP_KEY, this.validRaw);
        } catch {
        }
      }
      try {
        this.storage.setItem(SAVE_KEY, raw);
      } catch {
        throw new Error("\u5B58\u6A94\u5931\u6557\uFF1A\u5132\u5B58\u7A7A\u9593\u4E0D\u8DB3\u6216\u88AB\u7981\u6B62\uFF0C\u9032\u5EA6\u5C1A\u672A\u5BEB\u5165");
      }
      this.raw = raw;
      this.accept(decode2(raw), raw);
      this.warning = "";
      return result;
    }
    async mutate(fn) {
      const task = async () => {
        const transaction = () => this.commit(fn);
        return this.locks ? this.locks.request("emberwild-save-v2", transaction) : transaction();
      };
      const p = this.queue.then(task, task);
      this.queue = p.catch(() => {
      });
      return p;
    }
    putRun(state, source) {
      const snapshot = typeof source === "function" ? source() : source;
      validateSnapshot(snapshot);
      if (state.run?.runId !== snapshot.runId) throw new Error("\u9060\u5F81\u5B58\u6A94\u5DF2\u8B8A\u66F4\uFF0C\u8ACB\u91CD\u65B0\u8F09\u5165");
      state.run = clone(snapshot);
      syncCompanionProgress(state, snapshot);
    }
    saveRun(source) {
      return this.mutate((s) => this.putRun(s, source));
    }
    flushRun(snapshot) {
      return this.commit((s) => this.putRun(s, snapshot));
    }
    begin(snapshot, replace = false) {
      validateSnapshot(snapshot);
      return this.mutate((s) => {
        if (s.run?.tutorial?.mandatory && s.run.tutorial.status === "active") throw new Error("\u8ACB\u5148\u5B8C\u6210\u65B0\u624B\u8A13\u7DF4\uFF0C\u4E0D\u53EF\u66FF\u63DB\u6559\u5B78\u9060\u5F81");
        if (s.run && !replace) throw new Error("\u5DF2\u6709\u672A\u5B8C\u6210\u9060\u5F81\uFF0C\u8ACB\u5148\u7E7C\u7E8C\u6216\u78BA\u8A8D\u653E\u68C4");
        const camp = ensureCampProgress(s.camp), bonus = snapshot.campSupplyBonus || { wood: 0, bone: 0, amber: 0 };
        for (const resource of ["wood", "bone", "amber"]) {
          if (camp.stockpile[resource] < bonus[resource]) throw new Error("\u71DF\u5730\u88DC\u7D66\u5DF2\u88AB\u53E6\u4E00\u500B\u9801\u9762\u4F7F\u7528\uFF0C\u8ACB\u91CD\u65B0\u8F09\u5165");
          camp.stockpile[resource] -= bonus[resource];
        }
        s.profile.runs = Math.min(1e6, s.profile.runs + 1);
        s.run = clone(snapshot);
        syncCompanionProgress(s, snapshot);
      });
    }
    complete(snapshot) {
      validateSnapshot(snapshot);
      return this.mutate((s) => {
        if (s.lastResult?.id === snapshot.runId) return s.lastResult;
        if (s.run?.runId !== snapshot.runId) throw new Error("\u9019\u5834\u9060\u5F81\u5DF2\u7D50\u7B97\u6216\u4E0D\u662F\u76EE\u524D\u5B58\u6A94");
        const stones = rewardFor(snapshot), won = snapshot.phase === "win";
        syncCompanionProgress(s, snapshot);
        recordCampExpedition(s, snapshot);
        s.camp.stones = Math.min(1e8, s.camp.stones + stones);
        s.profile.best = Math.max(s.profile.best, snapshot.stats.waves);
        if (won) s.profile.victories = Math.min(1e6, s.profile.victories + 1);
        const result = {
          id: snapshot.runId,
          won,
          waves: snapshot.stats.waves,
          stones,
          kills: snapshot.stats.kills,
          combos: snapshot.stats.combos,
          loot: { wood: snapshot.materials?.wood || 0, bone: snapshot.materials?.bone || 0, amber: snapshot.amber, harvested: snapshot.stats.harvested },
          completedAt: Date.now()
        };
        s.lastResult = result;
        s.run = null;
        return result;
      });
    }
    recordStoreKitDelivery(snapshot, { transactionId, offerId, deliveredAt = Date.now() }) {
      validateSnapshot(snapshot);
      if (!/^\d{1,40}$/.test(String(transactionId || "")) || !/^[a-z0-9-]{1,40}$/.test(String(offerId || ""))) throw new Error("\u4ED8\u6B3E\u56DE\u50B3\u8CC7\u6599\u4E0D\u5B8C\u6574");
      return this.mutate((s) => {
        const ledger = s.profile.purchaseTransactions || (s.profile.purchaseTransactions = []);
        if (ledger.some((item) => item.transactionId === String(transactionId))) return false;
        if (s.run?.runId !== snapshot.runId) throw new Error("\u4ED8\u6B3E\u5DF2\u9A57\u8B49\uFF0C\u4F46\u76EE\u524D\u9060\u5F81\u5DF2\u8B8A\u66F4\uFF1B\u8ACB\u52FF\u91CD\u8907\u8CFC\u8CB7");
        s.run = clone(snapshot);
        ledger.push({ transactionId: String(transactionId), offerId: String(offerId), deliveredAt });
        if (ledger.length > 200) ledger.splice(0, ledger.length - 200);
        return true;
      });
    }
    markOfferPrompt(kind, week = offerWeekKey()) {
      return this.markOfferPrompts([kind], week);
    }
    markOfferPrompts(kinds, week = offerWeekKey()) {
      return this.mutate((s) => {
        const prompts = ensureOfferPromptState(s.profile);
        for (const kind of kinds) {
          if (kind === "starter") prompts.starterShown = true;
          else if (kind === "weekly") prompts.weeklyShownWeek = week;
          else throw new Error("\u79AE\u5305\u63D0\u793A\u985E\u578B\u7121\u6548");
        }
      });
    }
    abandon() {
      return this.mutate((s) => {
        if (s.run?.tutorial?.mandatory && s.run.tutorial.status === "active") throw new Error("\u8ACB\u5148\u5B8C\u6210\u65B0\u624B\u8A13\u7DF4\uFF0C\u4E0D\u53EF\u653E\u68C4\u6559\u5B78");
        s.run = null;
      });
    }
    clearProgress() {
      const task = async () => {
        const transaction = () => {
          if (this.storage.getItem(SAVE_KEY) !== this.raw) {
            const e = new Error("\u53E6\u4E00\u500B\u9801\u9762\u5DF2\u66F4\u65B0\u5B58\u6A94\uFF0C\u8ACB\u91CD\u65B0\u8F09\u5165\u5F8C\u518D\u522A\u9664");
            e.code = "CONFLICT";
            throw e;
          }
          for (const key of [BACKUP_KEY, LEGACY_KEY, SAVE_KEY]) this.storage.removeItem(key);
          if (PROGRESS_KEYS.some((key) => this.storage.getItem(key) !== null)) throw new Error("\u5B58\u6A94\u522A\u9664\u672A\u5B8C\u6210\uFF0C\u8ACB\u95DC\u9589\u5176\u4ED6\u904A\u6232\u9801\u5F8C\u91CD\u8A66\u3002");
          this.reload();
          return true;
        };
        return this.locks ? this.locks.request("emberwild-save-v2", transaction) : transaction();
      };
      const p = this.queue.then(task, task);
      this.queue = p.catch(() => {
      });
      return p;
    }
    export() {
      return this.blocked ? JSON.stringify({ recovery: true, primary: this.raw, backup: this.storage.getItem(BACKUP_KEY) }, null, 2) : encode(this.state, this.revision);
    }
    async import(raw) {
      const e = decode2(raw), blocked = this.blocked;
      this.blocked = false;
      try {
        return await this.mutate((s) => {
          for (const key of ["profile", "camp", "run", "lastResult"]) s[key] = clone(e.state[key]);
        });
      } catch (error) {
        this.blocked = blocked;
        throw error;
      }
    }
  };

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
  var guestSession = new GuestSession(storage);
  var nativeAuth = new NativeAccountAuth(window);
  var views = {
    login: { title: "\u6B61\u8FCE\u56DE\u5230\u71DF\u5730", eyebrow: "YOUR JOURNEY CONTINUES", copy: "\u767B\u5165\u8056\u7378\u71DF\u5730\u7368\u7ACB\u5E33\u865F\uFF1B\u71DF\u5730\u9032\u5EA6\u4FDD\u5B58\u5728\u672C\u6A5F\u3002", action: "\u5B89\u5168\u767B\u5165" },
    register: { title: "\u5BEB\u4E0B\u4F60\u7684\u7375\u4EBA\u4E4B\u540D", eyebrow: "EVERY LEGEND HAS A BEGINNING", copy: "\u5EFA\u7ACB\u8056\u7378\u71DF\u5730\u5E33\u865F\uFF0C\u7528\u65BC\u4FDD\u5B58\u5854\u9632\u904A\u6232\u8CC7\u6599\u3002", action: "\u5EFA\u7ACB\u7375\u4EBA\u5E33\u865F" }
  };
  var mode = "login";
  var busy = false;
  var cleanupPending = false;
  var accountDeletion = new AccountDeletion({ auth: nativeAuth, session: accountSession, store: new SaveStore(storage, navigator.locks || null) });
  async function resumeCleanup() {
    cleanupPending = true;
    setBusy(true, "\u6B63\u5728\u6E05\u7406\u2026");
    $("account-cleanup").hidden = false;
    $("cleanup-retry").disabled = true;
    $("cleanup-message").textContent = "\u5E33\u865F\u5DF2\u522A\u9664\uFF0C\u6B63\u5728\u6E05\u9664\u6B64\u88DD\u7F6E\u7684\u904A\u6232\u8CC7\u6599\u3002";
    try {
      await accountDeletion.run({ confirmed: true });
      cleanupPending = false;
      $("account-cleanup").hidden = true;
      renderSession();
      showDialog("\u8056\u7378\u71DF\u5730\u5E33\u865F\u5DF2\u522A\u9664", "\u5E33\u865F\u8207\u6B64\u88DD\u7F6E\u4E0A\u7684\u71DF\u5730\u3001\u4F19\u4F34\u548C\u9060\u5F81\u9032\u5EA6\u5DF2\u6E05\u9664\u3002\u5176\u4ED6\u5E33\u865F\u53CA\u8072\u97F3\u3001\u756B\u8CEA\u8A2D\u5B9A\u4E0D\u53D7\u5F71\u97FF\u3002");
    } catch (error) {
      $("cleanup-message").textContent = error.message;
    } finally {
      $("cleanup-retry").disabled = false;
      setBusy(cleanupPending);
    }
  }
  document.addEventListener("click", (event) => {
    if (cleanupPending && !event.target.closest("#cleanup-retry")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  $("cleanup-retry").addEventListener("click", resumeCleanup);
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
    $("account-label").textContent = "\u5E33\u865F";
    $("account-hint").textContent = "ACCOUNT ID";
    $("account").type = "text";
    $("account").placeholder = mode === "register" ? "\u8A2D\u5B9A 6\u201324 \u4F4D\u82F1\u6578\u5E33\u865F" : "\u8F38\u5165\u904A\u6232\u5E33\u865F";
    $("account").autocomplete = "username";
    $("password").placeholder = mode === "register" ? "\u8A2D\u5B9A\u5BC6\u78BC\uFF08\u81F3\u5C11 8 \u5B57\u5143\uFF09" : "\u8F38\u5165\u5BC6\u78BC";
    $("password").autocomplete = mode === "register" ? "new-password" : "current-password";
    $("password").value = "";
    $("confirm").value = "";
    $("password").type = "password";
    $("password-toggle").setAttribute("aria-pressed", "false");
    $("password-toggle").setAttribute("aria-label", "\u986F\u793A\u5BC6\u78BC");
    $("auth-panel").setAttribute("aria-labelledby", mode === "recover" ? "form-title" : `tab-${mode}`);
    clearError();
    if (focus) $(mode === "register" ? "nickname" : "account").focus();
  }
  function showDialog(title, copy, allowGame = false, destination = "index.html") {
    $("dialog-title").textContent = title;
    $("dialog-copy").textContent = copy;
    $("dialog-game").hidden = !allowGame;
    $("dialog-game").href = destination;
    $("dialog-game").textContent = destination.includes("enter=camp") ? "\u9032\u5165\u71DF\u5730 \u2197" : "\u524D\u5F80\u672C\u6A5F\u904A\u6232 \u2197";
    if (!dialog.open) dialog.showModal();
  }
  var info = {
    help: ["\u8056\u7378\u71DF\u5730\u7368\u7ACB\u5E33\u865F", "\u6B64\u5E33\u865F\u50C5\u7528\u65BC\u5854\u9632\u904A\u6232\u3002\u767B\u5165\u5F8C\u624D\u80FD\u8CFC\u8CB7\uFF0C\u8A2A\u5BA2\u53EF\u5148\u904A\u73A9\u3002\u71DF\u5730\u9032\u5EA6\u53EA\u4FDD\u5B58\u5728\u6B64\u88DD\u7F6E\uFF0C\u5C1A\u4E0D\u652F\u63F4\u96F2\u7AEF\u540C\u6B65\u3002\u767B\u5165\u5F8C\u53EF\u5728\u300C\u5E33\u865F\u7BA1\u7406\u300D\u6C38\u4E45\u522A\u9664\u5E33\u865F\u3002"],
    recover: ["\u5BC6\u78BC\u627E\u56DE\u5C1A\u672A\u958B\u653E", "\u76EE\u524D\u4E0D\u652F\u63F4\u81EA\u52A9\u91CD\u8A2D\u5BC6\u78BC\u3002\u8ACB\u59A5\u5584\u4FDD\u5B58\u5E33\u865F\u8207\u5BC6\u78BC\uFF1B\u6B64\u9801\u4E0D\u6703\u63D0\u4EA4\u627E\u56DE\u7533\u8ACB\u3002"]
  };
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
    $("password-toggle").setAttribute("aria-label", visible ? "\u96B1\u85CF\u5BC6\u78BC" : "\u986F\u793A\u5BC6\u78BC");
  });
  form.addEventListener("input", clearError);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    clearError();
    if (mode === "register" && !$("nickname").value.trim()) return showError("\u5148\u70BA\u4F60\u7684\u7375\u4EBA\u53D6\u500B\u540D\u5B57\u3002", "nickname");
    if (!$("account").value.trim()) return showError("\u8ACB\u8F38\u5165\u904A\u6232\u5E33\u865F\u3002", "account");
    if (!ACCOUNT_PATTERN.test($("account").value.trim().toLowerCase())) return showError("\u5E33\u865F\u9808\u70BA 6\u201324 \u4F4D\u82F1\u6587\u5B57\u6BCD\u3001\u6578\u5B57\u6216\u5E95\u7DDA\u3002", "account");
    if (mode !== "recover" && !$("password").value) return showError("\u8ACB\u8F38\u5165\u5BC6\u78BC\u3002", "password");
    if (mode === "register" && $("password").value.length < 8) return showError("\u5BC6\u78BC\u81F3\u5C11\u9700\u8981 8 \u500B\u5B57\u5143\u3002", "password");
    if (mode === "register" && $("password").value !== $("confirm").value) return showError("\u5169\u6B21\u8F38\u5165\u7684\u5BC6\u78BC\u4E0D\u4E00\u81F4\u3002", "confirm");
    if (mode !== "recover" && !$("consent").checked) return showError("\u8ACB\u5148\u95B1\u8B80\u4E26\u540C\u610F\u7528\u6236\u5354\u8B70\u8207\u96B1\u79C1\u653F\u7B56\u3002", "consent");
    const submittedMode = mode, account = $("account").value.trim().toLowerCase(), password = $("password").value, nickname = $("nickname").value.trim();
    setBusy(true, submittedMode === "recover" ? "\u6B63\u5728\u9001\u51FA\u2026" : "\u6B63\u5728\u5B89\u5168\u9A57\u8B49\u2026");
    try {
      const result = submittedMode === "register" ? await nativeAuth.register(account, password, nickname, TERMS_VERSION) : await nativeAuth.login(account, password);
      const session = accountSession.accept(result);
      guestSession.clear();
      renderSession();
      showDialog(submittedMode === "register" ? "\u5E33\u865F\u5DF2\u5EFA\u7ACB" : "\u5DF2\u767B\u5165\u904A\u6232", `${session.label}\uFF0C\u5DF2\u767B\u5165\u8056\u7378\u71DF\u5730\u3002\u9032\u5EA6\u4FDD\u5B58\u5728\u6B64\u88DD\u7F6E\uFF0C\u5C1A\u4E0D\u652F\u63F4\u96F2\u7AEF\u540C\u6B65\u3002`, true, returnToCamp ? "index.html?enter=camp" : "index.html");
      $("account").value = "";
      $("nickname").value = "";
    } catch (error) {
      showError(error?.message || "\u5E33\u865F\u670D\u52D9\u672A\u80FD\u5B8C\u6210\u8ACB\u6C42\u3002");
    } finally {
      $("password").value = "";
      $("confirm").value = "";
      setBusy(false);
    }
  });
  $("logout-session").addEventListener("click", async () => {
    if (busy) return;
    clearError();
    setBusy(true, "\u6B63\u5728\u9000\u51FA\u2026");
    try {
      await nativeAuth.logout();
      accountSession.clear();
      renderSession();
      showDialog("\u5DF2\u5B89\u5168\u9000\u51FA", "\u5DF2\u9000\u51FA\u8056\u7378\u71DF\u5730\u5E33\u865F\uFF1B\u904A\u6232\u5B58\u6A94\u3001\u71DF\u5730\u3001\u4F19\u4F34\u8207\u8A2D\u5B9A\u5B8C\u6574\u4FDD\u7559\u3002");
    } catch (error) {
      showError(error?.message || "\u66AB\u6642\u7121\u6CD5\u9000\u51FA\u5E33\u865F\u3002");
    } finally {
      setBusy(false);
    }
  });
  $("guest-entry").addEventListener("click", () => {
    if (busy) return;
    clearError();
    try {
      guestSession.start();
      location.href = "index.html?enter=camp";
    } catch (error) {
      showError(error?.message || "\u66AB\u6642\u7121\u6CD5\u958B\u59CB\u8A2A\u5BA2\u8A66\u73A9\u3002");
    }
  });
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
    setBusy(true, "\u6B63\u5728\u6AA2\u67E5\u767B\u5165\u2026");
    try {
      const status = await nativeAuth.status();
      if (status.accountDeleted === true && status.cleanupRequired === true) {
        await resumeCleanup();
        return;
      }
      if (status.authenticated) {
        const session = accountSession.accept(status);
        guestSession.clear();
        renderSession();
        if (returnToCamp) showDialog("\u5E33\u865F\u5DF2\u767B\u5165", `${session.label}\uFF0C\u5B89\u5168\u767B\u5165\u4ECD\u6709\u6548\uFF0C\u53EF\u4EE5\u76F4\u63A5\u9032\u5165\u71DF\u5730\u3002`, true, "index.html?enter=camp");
      } else {
        accountSession.clear();
        renderSession();
        if (new URLSearchParams(location.search).get("status") === "account-deleted")
          showDialog("\u8056\u7378\u71DF\u5730\u5E33\u865F\u5DF2\u522A\u9664", "\u5E33\u865F\u8207\u6B64\u88DD\u7F6E\u4E0A\u7684\u71DF\u5730\u3001\u4F19\u4F34\u548C\u9060\u5F81\u9032\u5EA6\u5DF2\u6E05\u9664\u3002\u5176\u4ED6\u5E33\u865F\u53CA\u8072\u97F3\u3001\u756B\u8CEA\u8A2D\u5B9A\u4E0D\u53D7\u5F71\u97FF\u3002");
      }
    } catch (error) {
      if (error?.code === "AUTH_EXPIRED" || error?.code === "HTTP_401") {
        accountSession.clear();
        renderSession();
      }
      showError(error?.message || "\u66AB\u6642\u7121\u6CD5\u78BA\u8A8D\u767B\u5165\u72C0\u614B\uFF0C\u8ACB\u7A0D\u5F8C\u91CD\u8A66\u3002");
    } finally {
      setBusy(cleanupPending);
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
