(function () {
    "use strict";
    if (window.__shellAndroidBridgeInstalled) {
        return;
    }
    window.__shellAndroidBridgeInstalled = true;
    window.__shellSdkStatus = window.__shellSdkStatus || "{}";

    function post(method, payload) {
        try {
            window.webkit.messageHandlers.android.postMessage({
                method: String(method || ""),
                payload: payload == null ? "" : String(payload)
            });
        } catch (error) {
            console.warn("[PBM-SHELL] Native bridge unavailable for " + method);
        }
    }

    window.android = {
        regsuccess: function () { post("regsuccess"); },
        loadComplete: function () { post("loadComplete"); },
        account: function (json) { post("account", json); },
        login: function () { post("login"); },
        loginout: function () { post("loginout"); },
        bindingPhone: function () { post("bindingPhone"); },
        pay: function (json) { post("pay", json); },
        chargeInfo: function (json) { post("chargeInfo", json); },
        upRole: function (json) { post("upRole", json); },
        upLoadAccountInfo: function (json) { post("upLoadAccountInfo", json); },
        sdkEvent: function (name, json) {
            post("sdkEvent", JSON.stringify({
                name: String(name || ""),
                json: json == null ? "" : String(json)
            }));
        },
        AF_Event_Name: function (json) { post("AF_Event_Name", json); },
        sdkToBrowser: function (url) { post("sdkToBrowser", url); },
        openMainGame: function () { post("openMainGame"); },
        returnToGameCenter: function () { post("returnToGameCenter"); },
        getSdkStatus: function () { return window.__shellSdkStatus || "{}"; },
        sendToNative: function (message) {
            if (message) {
                post("sendToNative", message);
            }
        },
        shareMessage: function (message) { /* not used on iOS */ }
    };
})();
