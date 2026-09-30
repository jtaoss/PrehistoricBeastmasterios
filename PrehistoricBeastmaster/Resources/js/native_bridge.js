(function () {
    "use strict";
    if (window.__pbmNativeBridgeInstalled) {
        return;
    }
    window.__pbmNativeBridgeInstalled = true;
    window.__shellSdkStatus = window.__shellSdkStatus || "{}";

    function post(method, payload) {
        try {
            window.webkit.messageHandlers.pbmNative.postMessage({
                method: String(method || ""),
                payload: payload == null ? "" : (typeof payload === "object" ? JSON.stringify(payload) : String(payload))
            });
        } catch (error) {
            console.warn("[PBM-SHELL] Native bridge unavailable for " + method);
        }
    }

    function buildPayRequest(amount, cpOrder, channel, serverId, serverName, goodsID, goodsName, roleID, roleName, roleLevel, payTypeId) {
        var text = function (v) { return v == null ? "" : String(v); };
        var session = window.loginJson && typeof window.loginJson === "object" ? window.loginJson : {};
        var account = text(window.__shellSdkUsername || session.user_name || session.username || session.userName || window.xmw_zhanghao_name || window.uid || "");
        var request = {
            price: text(amount),
            cpOrder: text(cpOrder),
            channel: text(channel),
            serverId: text(serverId),
            sercerId: text(serverId),
            serverName: text(serverName),
            goodsId: text(goodsID),
            goodsName: text(goodsName),
            roleID: text(roleID),
            roleId: text(roleID),
            roleName: text(roleName),
            roleLevel: text(roleLevel),
            productId: text(payTypeId || goodsID),
            payType_id: text(payTypeId),
            uid: text(window.uid || session.uid),
            username: account,
            user_name: account
        };
        try {
            var game = window.GameData && typeof window.GameData.getInstance === "function" ? window.GameData.getInstance() : null;
            var record = game && game.open7DaysRecord ? game.open7DaysRecord : null;
            if (record) {
                var roleDay = Number(record.days);
                var roleTotal = Number(record.totalMoney);
                if (Number.isFinite(roleDay)) { request.roleDay = Math.max(0, Math.round(roleDay)); }
                if (Number.isFinite(roleTotal) && roleTotal >= 0) { request.roleTotalAmount = roleTotal; }
            }
        } catch (ignore) {}
        return JSON.stringify(request);
    }

    var dispatchPay = function (payload) {
        if (arguments.length > 1) {
            post("pay", buildPayRequest.apply(null, arguments));
        } else if (typeof payload === "object" && payload !== null) {
            post("pay", JSON.stringify(payload));
        } else {
            post("pay", payload);
        }
    };

    window.pbmNative = {
        regsuccess: function () { post("regsuccess"); },
        loadComplete: function () { post("loadComplete"); },
        startSDK: function () { post("regsuccess"); },
        miniPurchase: function (json) { post("miniPurchase", json); },
        dopay: dispatchPay,
        pay: dispatchPay,
        account: function (json) { post("accountSession", json); },
        setRole: function (json) { post("roleReported", json); },
        uploadRole: function (json) { post("roleReported", json); },
        economyAction: function (json) { post("economyAction", json); },
        openGameShop: function () { post("openGameShop"); },
        miniAuth: function (json) { post("miniAuth", json); },
        sdkEvent: function (name, json) {
            post("sdkEvent", JSON.stringify({
                name: String(name || ""),
                json: json == null ? "" : (typeof json === "object" ? JSON.stringify(json) : String(json))
            }));
        },
        gameTelemetry: function (json) {
            post("gameTelemetry", json == null ? "" : (typeof json === "object" ? JSON.stringify(json) : String(json)));
        },
        AF_Event_Name: function (json) { post("AF_Event_Name", json); },
        sdkToBrowser: function (url) { post("sdkToBrowser", url); },
        getSdkStatus: function () { return window.__shellSdkStatus || "{}"; },
        sendToNative: function (message) {
            if (message) {
                post("sendToNative", message);
            }
        },
        shareMessage: function () { }
    };

    window.android = window.android || {
        pay: function (json) { dispatchPay(json); },
        sendToNative: function (msg) { window.pbmNative.sendToNative(msg); },
        account: function (json) { window.pbmNative.account(json); }
    };

    window.dopay = dispatchPay;

    function protectXmwSdk(sdk) {
        if (!sdk || (typeof sdk !== "object" && typeof sdk !== "function")) {
            return false;
        }
        try {
            var descriptor = Object.getOwnPropertyDescriptor(sdk, "dopay");
            if (descriptor && descriptor.get && descriptor.get.__pbmProtected) {
                return true;
            }
            var getter = function () { return dispatchPay; };
            getter.__pbmProtected = true;
            Object.defineProperty(sdk, "dopay", {
                enumerable: true,
                configurable: false,
                get: getter,
                set: function () { }
            });
            sdk.pay = dispatchPay;
            return true;
        } catch (ignore) {
            return false;
        }
    }

    var currentXmwSdk = window.xmwsdk;
    try {
        var globalDesc = Object.getOwnPropertyDescriptor(window, "xmwsdk");
        if (!globalDesc || globalDesc.configurable) {
            Object.defineProperty(window, "xmwsdk", {
                enumerable: true,
                configurable: false,
                get: function () { return currentXmwSdk; },
                set: function (val) {
                    currentXmwSdk = val;
                    protectXmwSdk(val);
                }
            });
        }
    } catch (ignore) {}

    protectXmwSdk(window.xmwsdk);
    setInterval(function () { protectXmwSdk(window.xmwsdk); }, 1000);
})();
