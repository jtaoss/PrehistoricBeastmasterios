#if DEBUG
import Foundation
import StoreKitTest

enum LocalStoreKitBootstrap {
    private static var session: SKTestSession?

    private static func writeStatus(_ status: String, to documents: URL) {
        let file = documents.appendingPathComponent("local_storekit_status.txt")
        try? Data(status.utf8).write(to: file, options: .atomic)
    }

    static func startIfRequested() {
        guard ProcessInfo.processInfo.environment["PBM_LOCAL_STOREKIT"] == "1" else {
            return
        }

        do {
            let documents = try FileManager.default.url(
                for: .documentDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            let configuration = documents.appendingPathComponent("Products.storekit")
            let testSession = try SKTestSession(contentsOf: configuration)
            testSession.disableDialogs = false
            session = testSession
            writeStatus("enabled\n", to: documents)
            NSLog("[PBM-STOREKIT] Local StoreKit session enabled")
        } catch {
            if let documents = try? FileManager.default.url(
                for: .documentDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            ) {
                writeStatus("failed: \(error)\n", to: documents)
            }
            NSLog("[PBM-STOREKIT] Local StoreKit session failed: %@", String(describing: error))
        }
    }
}
#else
enum LocalStoreKitBootstrap {
    static func startIfRequested() {}
}
#endif
