(function () {
    "use strict";
    if (window.pbmGameSDK) return;

    function object(value) {
        var parsed = typeof value === "string" ? JSON.parse(value) : value;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("SDK request must be an object");
        }
        return parsed;
    }

    function config() {
        var status = {};
        try { status = object(window.__shellSdkStatus || "{}"); } catch (_) {}
        var gameId = window.location.protocol === "file:" ? "emberwild" : "main";
        try {
            var base = new URL(status.miniGameBaseURL);
            var page = new URL(window.location.href);
            if (page.origin === base.origin && ["index.html", "login-preview.html"].some(function (name) {
                return page.pathname === base.pathname + name;
            })) gameId = "emberwild";
        } catch (_) {}
        return Object.freeze({
            version: "1.0",
            gameId: status.gameId || gameId,
            appId: status.appId || "",
            bundleId: status.bundleId || "",
            channel: status.channel || "",
            webSdkChannel: status.webSdkChannel || "",
            payChannel: status.payChannel,
            store: "app_store",
            contentMode: status.contentMode || "MINI_ONLY",
            storeKitEnabled: status.storeKitEnabled !== false
        });
    }

    function handler(name) {
        return window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers[name];
    }

    function post(method, payload) {
        var bridge = handler("android");
        if (bridge && typeof bridge.postMessage === "function") {
            bridge.postMessage({method: method, payload: JSON.stringify(payload)});
            return;
        }
        // The hosted main game also supports the historical direct WK pay alias.
        var pay = method === "pay" && handler("pay");
        if (pay && typeof pay.postMessage === "function") {
            pay.postMessage(payload);
            return;
        }
        throw new Error("iOS native SDK bridge is unavailable");
    }

    function available() {
        var bridge = handler("android");
        if (bridge && typeof bridge.postMessage === "function") return true;
        var pay = config().gameId === "main" && handler("pay");
        return Boolean(pay && typeof pay.postMessage === "function");
    }

    function purchase(value) {
        var request = object(value);
        if (!config().storeKitEnabled) throw new Error("App Store purchases are disabled");
        if (typeof request.offerId === "string" && request.offerId.trim()) {
            if (typeof request.clientRequestId !== "string" || !request.clientRequestId.trim()) {
                throw new Error("Purchase request ID is missing");
            }
            // Native code creates the game order, then calls the SAME StoreKit
            // and SDK verification flow as the main game. Never invent an order.
            post("miniPurchase", {offerId: request.offerId, clientRequestId: request.clientRequestId});
        } else {
            if (typeof request.cpOrder !== "string" || !request.cpOrder.trim()) {
                throw new Error("Game order is missing");
            }
            post("pay", request);
        }
        // Completion stays on the existing correlated, server-verified callback.
        // Dispatching a purchase is never treated as payment success here.
    }

    function track(name, value) {
        try {
            var fields = object(value == null ? {} : value);
            fields = Object.assign({}, fields, {game_id: config().gameId});
            post("sdkEvent", {name: String(name || ""), json: JSON.stringify(fields)});
            return true;
        } catch (_) {
            // Measurement failures must not interrupt gameplay or queue events.
            return false;
        }
    }

    Object.defineProperty(window, "pbmGameSDK", {value: Object.freeze({
        getConfig: config,
        isAvailable: available,
        purchase: purchase,
        track: track
    }), writable: false, configurable: false});
})();
