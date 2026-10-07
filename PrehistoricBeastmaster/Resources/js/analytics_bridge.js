(function () {
    "use strict";

    if (window.__shellAnalyticsBridgeBootstrapped) {
        return;
    }
    window.__shellAnalyticsBridgeBootstrapped = true;

    var FIVE_MINUTES_MS = 5 * 60 * 1000;
    var STONE_THRESHOLD = 300000;
    var FORWARD_DEDUP_MS = 750;
    var lastForwardedAt = Object.create(null);
    var fiveMinuteReported = Object.create(null);
    var stoneReported = Object.create(null);

    function text(value) {
        return value == null ? "" : String(value);
    }

    function number(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function gameData() {
        try {
            return window.GameData && typeof window.GameData.getInstance === "function"
                ? window.GameData.getInstance() : null;
        } catch (ignored) {
            return null;
        }
    }

    function roleFields() {
        var fields = {};
        try {
            var data = gameData();
            var base = data && data.player && data.player.base ? data.player.base : {};
            var auth = window.AuthData && typeof window.AuthData.getInstance === "function"
                ? window.AuthData.getInstance() : {};
            fields.uid = text(auth.uid || window.uid || "");
            fields.role_id = text(base.id || "");
            fields.role_name = text(base.nick || "");
            fields.server_id = text(base.serverId || "");
        } catch (ignored) {
            // Missing game globals are expected while the Egret bundle is starting.
        }
        return fields;
    }

    function roleScope(fields) {
        fields = fields || roleFields();
        return [fields.uid || "", fields.server_id || "", fields.role_id || ""].join("|");
    }

    function send(name, fields) {
        var now = Date.now();
        var key = JSON.stringify([name, roleScope(fields), (fields || {}).account_id || ""]);
        if (lastForwardedAt[key] && now - lastForwardedAt[key] < FORWARD_DEDUP_MS) {
            return true;
        }
        try {
            if (window.android && typeof window.android.sdkEvent === "function") {
                window.android.sdkEvent(name, JSON.stringify(fields || {}));
                lastForwardedAt[key] = now;
                return true;
            }
        } catch (error) {
            console.warn("[GP-SHELL] Analytics bridge failed for " + name);
        }
        return false;
    }

    function currentStep() {
        try {
            if (window.TaskLogic && typeof window.TaskLogic.getInstance === "function") {
                return Math.max(0, number(window.TaskLogic.getInstance().getTaskId(), 0));
            }
        } catch (ignored) {
            // Return a stable numeric value when the task model is unavailable.
        }
        return 0;
    }

    function storageGet(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (ignored) {
            return null;
        }
    }

    function storageSet(key, value) {
        try {
            window.localStorage.setItem(key, text(value));
        } catch (ignored) {
            // Native-side one-shot state remains the final duplicate guard.
        }
    }

    function tutorialKey(suffix, fields) {
        return "__shell_analytics_tutorial_" + suffix + "_" + roleScope(fields);
    }

    function markFiveMinuteReported(fields) {
        var scope = roleScope(fields);
        if (!text(fields && fields.role_id).trim()) {
            return;
        }
        fiveMinuteReported[scope] = true;
        storageSet(tutorialKey("five_sent", fields), "1");
    }

    function scheduleFiveMinuteEvent(fields) {
        fields = fields || roleFields();
        if (!text(fields.role_id).trim()) {
            return;
        }
        var scope = roleScope(fields);
        var startedAt = number(storageGet(tutorialKey("start", fields)), 0);
        if (startedAt <= 0 || fiveMinuteReported[scope]
                || storageGet(tutorialKey("five_sent", fields)) === "1") {
            return;
        }
        if (window.__shellTutorialTimer && window.__shellTutorialTimerScope === scope) {
            return;
        }
        if (window.__shellTutorialTimer) {
            clearTimeout(window.__shellTutorialTimer);
        }
        window.__shellTutorialTimerScope = scope;
        window.__shellTutorialTimer = setTimeout(function () {
            window.__shellTutorialTimer = null;
            window.__shellTutorialTimerScope = "";
            var currentFields = roleFields();
            // A timer created for one role must never be attached to another role.
            if (roleScope(currentFields) !== scope) {
                return;
            }
            if (fiveMinuteReported[scope]
                    || storageGet(tutorialKey("five_sent", currentFields)) === "1") {
                return;
            }
            currentFields.current_step = currentStep();
            if (send("NewRole_5minute", currentFields)) {
                markFiveMinuteReported(currentFields);
            }
        }, Math.max(0, startedAt + FIVE_MINUTES_MS - Date.now()));
    }

    function startTutorial(fields) {
        // Native code retains the original event time if role identity arrives later.
        if (!text(fields.role_id).trim()) {
            return;
        }
        var startKey = tutorialKey("start", fields);
        if (!storageGet(startKey)) {
            storageSet(startKey, Date.now());
        }
        scheduleFiveMinuteEvent(fields);
    }

    function tutorialElapsedSeconds(fields) {
        if (!text(fields.role_id).trim()) {
            return null;
        }
        var startedAt = number(storageGet(tutorialKey("start", fields)), 0);
        return startedAt > 0 ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : null;
    }

    function accountIdentity() {
        var session = window.loginJson && typeof window.loginJson === "object"
            ? window.loginJson : {};
        return text(window.uid || session.uid || window.__shellSdkUsername
            || session.user_name || session.username || window.xmw_zhanghao_name || "");
    }

    function registrationMethod() {
        var session = window.loginJson && typeof window.loginJson === "object"
            ? window.loginJson : {};
        var raw = text(session.method || session.login_method || session.loginType
            || session.login_type || window.__shellRegistrationMethod).toLowerCase();
        if (raw.indexOf("facebook") >= 0 || raw === "fb") {
            return "FB";
        }
        if (raw.indexOf("google") >= 0) {
            return "Google";
        }
        if (raw.indexOf("apple") >= 0 || raw.indexOf("ios") >= 0) {
            return "Apple";
        }
        return "Guest";
    }

    function handlePlatformEvent(name, value, source) {
        var fields = roleFields();
        switch (text(name)) {
            case "Loading_completed":
                fields.duration = Math.max(0, Math.round(number(
                    window.performance && window.performance.now
                        ? window.performance.now() / 1000 : 0, 0)));
                send("Loading_completed", fields);
                break;
            case "complete_registration":
                if (source === "websdk") {
                    fields.method = registrationMethod();
                    fields.account_id = accountIdentity();
                    send("complete_registration", fields);
                } else {
                    // The game uses its historical Registration event after role creation.
                    fields.source = "role_created";
                    send("complete_avatar", fields);
                    send("view_content", fields);
                }
                break;
            case "View_Content":
            case "view_content":
                send("view_content", fields);
                break;
            case "NewRole_Tutorial":
                fields.step_id = 1;
                startTutorial(fields);
                send("NewRole_Tutorial", fields);
                break;
            case "NewRole_5minute":
                fields.current_step = currentStep();
                if (send("NewRole_5minute", fields)) {
                    markFiveMinuteReported(fields);
                }
                break;
            case "Tutorial_Completed":
            case "tutorial_complete":
                var elapsed = tutorialElapsedSeconds(fields);
                if (elapsed !== null) {
                    fields.time_spent = elapsed;
                }
                send("tutorial_complete", fields);
                break;
            case "KeepEvent":
                if (number(value, 0) === 2) {
                    fields.days_diff = 1;
                    send("next_day_login", fields);
                } else if (number(value, 0) === 3) {
                    fields.days_diff = 2;
                    send("3_days_login", fields);
                } else if (number(value, 0) === 7) {
                    fields.days_diff = 6;
                    send("7_days_login", fields);
                }
                break;
            case "next_day_login":
                fields.days_diff = 1;
                send("next_day_login", fields);
                break;
            case "3_days_login":
                fields.days_diff = 2;
                send("3_days_login", fields);
                break;
            case "7_days_login":
                fields.days_diff = 6;
                send("7_days_login", fields);
                break;
            case "Add_To_Wishlist":
                send("Add_To_Wishlist", fields);
                break;
            default:
                // Google purchase events are emitted only by the verified native flow.
                break;
        }
    }

    function installPlatformBridge() {
        if (!window.platform || typeof window.platform.AF_Event_Name !== "function") {
            return false;
        }
        var owner = Object.getPrototypeOf(window.platform);
        if (!owner || typeof owner.AF_Event_Name !== "function") {
            owner = window.platform;
        }
        var original = owner.AF_Event_Name;
        if (original.__shellAnalyticsWrapped) {
            return true;
        }
        var wrapped = function (name, value) {
            handlePlatformEvent(name, value, "platform");
            return original.apply(this, arguments);
        };
        wrapped.__shellAnalyticsWrapped = true;
        wrapped.__shellAnalyticsOriginal = original;
        owner.AF_Event_Name = wrapped;
        return owner.AF_Event_Name === wrapped;
    }

    function installWebSdkEventBridge() {
        if (!window.xmwsdk || typeof window.xmwsdk.AFStaticEvent !== "function") {
            return false;
        }
        var original = window.xmwsdk.AFStaticEvent;
        if (original.__shellAnalyticsWrapped) {
            return true;
        }
        var wrapped = function (name, value) {
            // The current web SDK only forwards AppsFlyer events for a small historical app-id
            // allowlist that may not include the native app ID. Observe this common event sink so direct
            // web-SDK calls (notably retention events) still reach the native analytics SDKs.
            handlePlatformEvent(name, value, "websdk");
            return original.apply(this, arguments);
        };
        wrapped.__shellAnalyticsWrapped = true;
        wrapped.__shellAnalyticsOriginal = original;
        window.xmwsdk.AFStaticEvent = wrapped;
        return window.xmwsdk.AFStaticEvent === wrapped;
    }

    function installRegistrationBridge() {
        if (!window.xmwsdk || typeof window.xmwsdk.complete_registration !== "function") {
            return false;
        }
        var original = window.xmwsdk.complete_registration;
        if (original.__shellAnalyticsWrapped) {
            return true;
        }
        var wrapped = function () {
            send("complete_registration", {
                method: registrationMethod(),
                account_id: accountIdentity(),
                source: "sdk_account"
            });
            return original.apply(this, arguments);
        };
        wrapped.__shellAnalyticsWrapped = true;
        wrapped.__shellAnalyticsOriginal = original;
        window.xmwsdk.complete_registration = wrapped;
        return window.xmwsdk.complete_registration === wrapped;
    }

    function checkStoneBalance() {
        try {
            var data = gameData();
            if (!data || typeof data.getItemNum !== "function") {
                return;
            }
            var fields = roleFields();
            var scope = roleScope(fields);
            if (!text(fields.role_id).trim()) {
                return;
            }
            var balance = Math.max(0, number(data.getItemNum(10000), 0));
            var key = "__shell_analytics_stone_sent_" + scope;
            if (stoneReported[scope] || storageGet(key) === "1") {
                return;
            }
            // The first loaded snapshot can already include the reward that crossed
            // the threshold. Native role-level deduplication also covers older builds.
            if (balance >= STONE_THRESHOLD) {
                fields.current_balance = Math.round(balance);
                if (send("have_300_thousand", fields)) {
                    stoneReported[scope] = true;
                    storageSet(key, "1");
                }
            }
        } catch (ignored) {
            // The game state is not available during early loading.
        }
    }

    function monitor() {
        installPlatformBridge();
        installWebSdkEventBridge();
        installRegistrationBridge();
        scheduleFiveMinuteEvent(roleFields());
    }

    monitor();
    window.__shellAnalyticsBridgeMonitor = setInterval(monitor, 500);
    window.__shellStoneBalanceMonitor = setInterval(checkStoneBalance, 2000);
})();
