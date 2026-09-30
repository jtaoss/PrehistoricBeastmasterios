import Foundation
import WebKit

@MainActor
final class WebActionSyncHandler: NSObject, WKScriptMessageHandler {
    nonisolated static let messageName = "actionSync"
    private weak var webView: WKWebView?
    private let orders: AssetOrderCoordinator
    private let canStart: () -> Bool
    private let submit: (PayRequest) -> Void
    private let isTrustedURL: (URL?) -> Bool
    private var preparation: Task<Void, Never>?
    private var documentID: String?
    private var requests: [String: String] = [:]
    private var completedRequests = Set<String>()
    var onPreparation: (() -> Void)?
    var onFailure: ((String) -> Void)?

    init(orders: AssetOrderCoordinator, isTrustedURL: @escaping (URL?) -> Bool,
         canStart: @escaping () -> Bool, submit: @escaping (PayRequest) -> Void) {
        self.orders = orders
        self.isTrustedURL = isTrustedURL
        self.canStart = canStart
        self.submit = submit
    }

    func attach(to view: WKWebView) {
        precondition(webView == nil, "Attach one handler per view")
        webView = view
        let content = view.configuration.userContentController
        content.add(self, name: Self.messageName)
        content.addUserScript(WKUserScript(source: Self.documentScript, injectionTime: .atDocumentStart,
                                          forMainFrameOnly: true))
    }

    func navigationStarted() {
        preparation?.cancel()
        documentID = nil
        requests.removeAll()
        completedRequests.removeAll()
    }

    func accountDidChange() {
        preparation?.cancel()
        requests.removeAll()
        completedRequests.removeAll()
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.messageName, message.webView === webView,
              message.frameInfo.isMainFrame, isTrustedURL(message.frameInfo.request.url),
              isTrustedURL(webView?.url) else { return }
        let body: JSONObject
        if let object = message.body as? [String: Any] { body = JSONObject(object) }
        else if let text = message.body as? String, let object = try? JSONObject(json: text) { body = object }
        else { return }
        if body.string("action") == "ready" {
            let id = body.string("documentId")
            guard UUID(uuidString: id) != nil else { return }
            documentID = id
            return
        }
        guard let document = documentID else { return }
        let requestId = body.string("requestId", UUID().uuidString)
        guard body.string("action") == "upgrade", UUID(uuidString: requestId) != nil,
              let asset = Config.assetID(forActionID: body.string("id")) else {
            emit(false, fields: JSONObject(["code": "INVALID_ACTION", "requestId": requestId]), document: document)
            return
        }
        guard requests[requestId] == nil, !completedRequests.contains(requestId) else { return }
        guard preparation == nil, !orders.isPreparing, canStart() else {
            emit(false, fields: JSONObject(["code": "PAYMENT_IN_PROGRESS", "requestId": requestId]), document: document)
            return
        }
        requests[requestId] = document
        onPreparation?()
        preparation = Task { [weak self] in
            guard let self else { return }
            defer { self.preparation = nil }
            do {
                let request = try await self.orders.makeRequest(assetId: asset, requestId: requestId,
                                                               destination: .webActions, callback: .actionSync)
                try Task.checkCancellation()
                guard self.documentID == document, self.canStart() else { throw CancellationError() }
                self.submit(request)
            } catch {
                guard self.requests.removeValue(forKey: requestId) == document else { return }
                let code = (error as? BillingError)?.code
                    ?? (error as? MiniGameAuthService.AuthError)?.code ?? "ACTION_SYNC_FAILED"
                self.emit(false, fields: JSONObject(["code": code, "requestId": requestId]), document: document)
                self.onFailure?(error.localizedDescription)
            }
        }
    }

    func receive(_ function: String, request: PayRequest, fields: JSONObject) {
        guard request.destination == .webActions, request.paymentCallback == .actionSync,
              !request.resultAccountId.isEmpty, request.resultAccountId == orders.currentAccountID,
              let document = requests[request.callbackRequestId], document == documentID else { return }
        var result = fields
        result.put("requestId", request.callbackRequestId)
        result.put("status", function == "onPayResult" ? "delivered" : function == "onPayPending" ? "pending" : "failed")
        emit(function == "onPayResult", fields: result, document: document)
        if function != "onPayPending" {
            requests.removeValue(forKey: request.callbackRequestId)
            completedRequests.insert(request.callbackRequestId)
        }
    }

    private func emit(_ success: Bool, fields: JSONObject, document: String) {
        guard documentID == document, isTrustedURL(webView?.url) else { return }
        let token = JSONObject(["value": document]).jsonString()
        let script = """
        (function(){if(window.__actionSyncDocumentID!==\(token).value)return;
        if(typeof window.onSyncCompleted==='function')window.onSyncCompleted(\(success ? "true" : "false"),\(fields.jsonString()));})();
        """
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }

    private static let documentScript = """
    (function(){var bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    var hex=Array.from(bytes,function(x){return x.toString(16).padStart(2,'0');}).join('');
    var id=hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
    Object.defineProperty(window,'__actionSyncDocumentID',{value:id,writable:false,configurable:false});
    window.webkit.messageHandlers.actionSync.postMessage({action:'ready',documentId:id});})();
    """
}
