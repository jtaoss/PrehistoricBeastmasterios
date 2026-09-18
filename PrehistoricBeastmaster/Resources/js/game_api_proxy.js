(function () {
    "use strict";
    if (window.__shellGameApiProxyInstalled) {
        return;
    }
    if (!window.webkit || !window.webkit.messageHandlers || !window.webkit.messageHandlers.gameApiProxy) {
        return;
    }
    window.__shellGameApiProxyInstalled = true;

    function text(value) {
        return value == null ? "" : String(value);
    }

    function shouldProxy(url) {
        try {
            var parsed = new URL(url, location.href);
            if (parsed.protocol !== "https:") {
                return false;
            }
            var host = parsed.hostname.toLowerCase();
            var path = parsed.pathname || "";
            if (host === "safthwy.antieh.com" && (path === "/audit" || path.indexOf("/audit/") === 0
                    || path === "/fx" || path.indexOf("/fx/") === 0)) {
                return true;
            }
            var order = window.__shellGameOrderEndpoint;
            if (order) {
                var target = new URL(order);
                if (host === target.hostname.toLowerCase() && path.toLowerCase() === target.pathname.toLowerCase()) {
                    return true;
                }
            }
        } catch (ignored) {
            return false;
        }
        return false;
    }

    function headerMap(headers) {
        var result = {};
        if (!headers) {
            return result;
        }
        if (typeof headers.forEach === "function") {
            headers.forEach(function (value, key) {
                result[key] = value;
            });
            return result;
        }
        Object.keys(headers).forEach(function (key) {
            result[key] = headers[key];
        });
        return result;
    }

    function proxyRequest(url, method, headers) {
        return window.webkit.messageHandlers.gameApiProxy.postMessage({
            url: text(url),
            method: text(method || "GET"),
            headers: headerMap(headers),
            userAgent: text(navigator.userAgent),
            referer: text(location.href)
        });
    }

    function requestAct(url) {
        try {
            return new URL(url, location.href).searchParams.get("act") || "unknown";
        } catch (ignored) {
            return "unknown";
        }
    }

    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;
    var originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    var originalAbort = XMLHttpRequest.prototype.abort;
    var sequence = 0;
    var responseProperties = ["readyState", "status", "statusText", "response", "responseText",
        "getAllResponseHeaders", "getResponseHeader"];

    function clearResponse(xhr) {
        if (!xhr.__shellResponseInstalled) { return; }
        responseProperties.forEach(function (key) { delete xhr[key]; });
        xhr.__shellResponseInstalled = false;
    }

    function setResponse(xhr, status, body, contentType) {
        xhr.__shellResponseInstalled = true;
        var response = body;
        if (xhr.responseType === "json") {
            try { response = JSON.parse(body); } catch (ignored) { response = null; }
        }
        Object.defineProperty(xhr, "readyState", { configurable: true, get: function () { return 4; } });
        Object.defineProperty(xhr, "status", { configurable: true, get: function () { return status; } });
        Object.defineProperty(xhr, "statusText", { configurable: true, get: function () { return status === 0 ? "" : status < 300 ? "OK" : "Error"; } });
        Object.defineProperty(xhr, "response", { configurable: true, get: function () { return response; } });
        Object.defineProperty(xhr, "responseText", { configurable: true, get: function () {
            if (xhr.responseType && xhr.responseType !== "text") { throw new DOMException("Response is not text", "InvalidStateError"); }
            return body;
        } });
        xhr.getAllResponseHeaders = function () { return status ? "content-type: " + contentType + "\r\n" : ""; };
        xhr.getResponseHeader = function (name) { return status && String(name).toLowerCase() === "content-type" ? contentType : null; };
    }

    function resetAfterAbort(xhr) {
        clearResponse(xhr);
        originalAbort.call(xhr);
        // Native send() was deliberately not called for a bridge request, so
        // native abort() alone leaves its OPENED state unchanged.
        xhr.__shellResponseInstalled = true;
        Object.defineProperty(xhr, "readyState", { configurable: true, get: function () { return 0; } });
    }

    function nativeMessage(method, payload) {
        try {
            window.webkit.messageHandlers.android.postMessage({ method: method, payload: payload });
        } catch (ignored) { /* Diagnostics must not prevent delivery of a reply. */ }
    }

    function orderContext(url) {
        try {
            var parsed = new URL(url, location.href);
            if (!/\/createOrder\.php$/i.test(parsed.pathname)) { return ""; }
            function safe(value) { return /^[a-z0-9_.-]{1,64}$/i.test(value || "") ? value : "unknown"; }
            return " server=" + safe(parsed.searchParams.get("sid"))
                + " goods=" + safe(parsed.searchParams.get("id")) + " host=" + parsed.hostname;
        } catch (ignored) { return ""; }
    }

    function recordOrder(request, stage, status, body) {
        var context = orderContext(request.url);
        if (!context) { return; }
        var reason = "", business = "unknown", orderPresent = false;
        if (stage === "response") {
            var parsed;
            try { parsed = JSON.parse(body); } catch (ignored) { reason = "invalid_response"; }
            if (!status || status < 200 || status >= 300) { reason = "http"; }
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                var numericStatus = String(parsed.status).trim();
                business = /^-?\d{1,8}$/.test(numericStatus) ? numericStatus : "unknown";
                orderPresent = (typeof parsed.cpOrder === "string" || typeof parsed.cpOrder === "number")
                    && !!String(parsed.cpOrder).trim();
                if (!reason && (business === "unknown" || Number(business) !== 0)) { reason = "business"; }
                if (!reason && !orderPresent) { reason = "missing_order"; }
            } else if (!reason) { reason = "invalid_response"; }
        } else if (stage === "network_error") { reason = "network"; }
        nativeMessage("sendToNative", "[PBM-SHELL] game-order-" + stage + " request=" + request.id
            + context + " http=" + status + " business=" + business + " orderPresent=" + orderPresent
            + (reason ? " reason=" + reason : ""));
        if (reason) {
            nativeMessage("gameOrderFailed", JSON.stringify({ reason: reason, http: status, business: business }));
        }
    }

    XMLHttpRequest.prototype.open = function (method, url) {
        // Reusing a native XHR must invalidate the old asynchronous bridge reply
        // and remove our DONE-state getters before native open() runs again.
        this.__shellActiveRequest = null;
        clearResponse(this);
        this.__shellMethod = method;
        try {
            this.__shellUrl = new URL(url, location.href).href;
        } catch (ignored) {
            this.__shellUrl = url;
        }
        this.__shellHeaders = {};
        this.__shellProxy = shouldProxy(this.__shellUrl) && String(method || "GET").toUpperCase() === "GET";

        // Keep the native XHR state machine in OPENED state even when send() is
        // completed through the WKWebView bridge. Egret HttpRequest checks that
        // state before sending the region-login request. Skipping native open()
        // leaves readyState at UNSENT and only affects the proxied /fx/ region.
        return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        if (this.__shellProxy) {
            this.__shellHeaders[name] = value;
            return;
        }
        return originalSetHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
        if (!this.__shellProxy) {
            return originalSend.apply(this, arguments);
        }
        var xhr = this;
        if (xhr.readyState !== 1 || (xhr.__shellActiveRequest && !xhr.__shellActiveRequest.finished)) {
            throw new DOMException("Request is not ready to send", "InvalidStateError");
        }
        var request = { id: ++sequence, url: xhr.__shellUrl, finished: false };
        xhr.__shellActiveRequest = request;
        recordOrder(request, "start", 0, "");
        proxyRequest(xhr.__shellUrl, xhr.__shellMethod, xhr.__shellHeaders).then(function (response) {
            if (xhr.__shellActiveRequest !== request) { return; }
            if (response && response.shellCheckoutBusy) {
                // A second selection is ignored, not a failed/duplicate order.
                // Do not dispatch load, error or gameOrderFailed, and never
                // manufacture an order/price for a different game item.
                xhr.abort();
                return;
            }
            request.finished = true;
            var status = Number(response && response.status) || 0;
            var textBody = text(response && response.body);
            var contentType = text(response && response.contentType) || "application/json";
            setResponse(xhr, status, textBody, contentType);
            recordOrder(request, "response", status, textBody);
            // dispatchEvent also invokes the onreadystatechange property. Calling
            // it explicitly first used to deliver the same response twice.
            xhr.dispatchEvent(new Event("readystatechange"));
            if (xhr.__shellActiveRequest !== request) { return; }
            xhr.dispatchEvent(new Event("load"));
            if (xhr.__shellActiveRequest !== request) { return; }
            xhr.dispatchEvent(new Event("loadend"));
        }, function (error) {
            if (xhr.__shellActiveRequest !== request) { return; }
            request.finished = true;
            console.error("[PBM-GAME-API] proxy_failed act=" + requestAct(request.url)
                + " error=" + text(error && error.message ? error.message : error));
            setResponse(xhr, 0, "", "");
            recordOrder(request, "network_error", 0, "");
            xhr.dispatchEvent(new Event("readystatechange"));
            if (xhr.__shellActiveRequest !== request) { return; }
            xhr.dispatchEvent(new Event("error"));
            if (xhr.__shellActiveRequest !== request) { return; }
            xhr.dispatchEvent(new Event("loadend"));
        });
    };

    XMLHttpRequest.prototype.abort = function () {
        var request = this.__shellActiveRequest;
        if (!this.__shellProxy || !request) {
            this.__shellActiveRequest = null;
            clearResponse(this);
            return originalAbort.apply(this, arguments);
        }
        if (request.finished) {
            this.__shellActiveRequest = null;
            return resetAfterAbort(this);
        }
        request.finished = true;
        setResponse(this, 0, "", "");
        this.dispatchEvent(new Event("readystatechange"));
        if (this.__shellActiveRequest !== request) { return; }
        this.dispatchEvent(new Event("abort"));
        if (this.__shellActiveRequest !== request) { return; }
        this.dispatchEvent(new Event("loadend"));
        if (this.__shellActiveRequest !== request) { return; }
        this.__shellActiveRequest = null;
        resetAfterAbort(this);
    };

    if (typeof window.fetch === "function") {
        var originalFetch = window.fetch;
        window.fetch = function (input, init) {
            var url = typeof input === "string" ? input : (input && input.url);
            var method = (init && init.method) || (input && input.method) || "GET";
            if (!shouldProxy(url) || String(method).toUpperCase() !== "GET") {
                return originalFetch.apply(this, arguments);
            }
            var headers = (init && init.headers) || (input && input.headers);
            return proxyRequest(url, method, headers).then(function (response) {
                if (response && response.shellCheckoutBusy) {
                    throw new DOMException("A checkout is already active", "AbortError");
                }
                return new Response(text(response && response.body), {
                    status: Number(response && response.status) || 0,
                    headers: { "Content-Type": text(response && response.contentType) || "application/json" }
                });
            });
        };
    }
})();
