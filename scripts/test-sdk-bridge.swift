import Foundation

@main
struct SdkBridgeTestRunner {
    static func assertCondition(_ condition: @autoclosure () -> Bool, _ message: String) {
        if !condition() {
            print("❌ [FAIL] \(message)")
            exit(1)
        }
    }

    static func main() {
        print("=== Running SDK Payment & Telemetry Bridge Verification Tests ===")

        // Test 1: PayRequest flexible field parsing
        do {
            let dopayJSON = """
            {
                "price": "4.99",
                "cp_order": "CP_ORD_998811",
                "goods_id": 2,
                "server_id": "1001",
                "server_name": "S1-Origin",
                "role_id": "role_888",
                "role_name": "DragonSlayer",
                "goods_name": "Pouch of Pearls",
                "product_id": "pbm_tier_499",
                "uid": "u_999",
                "username": "tester_alpha"
            }
            """
            let req = try PayRequest(json: dopayJSON)
            assertCondition(req.price == "4.99", "Price should be 4.99")
            assertCondition(req.cpOrder == "CP_ORD_998811", "cpOrder should match cp_order")
            assertCondition(req.goodsId == 2, "goodsId should match goods_id")
            assertCondition(req.serverId == "1001", "serverId should match server_id")
            assertCondition(req.roleId == "role_888", "roleId should match role_id")
            assertCondition(req.productId == "pbm_tier_499", "productId should match product_id")
            assertCondition(req.username == "tester_alpha", "username should match")
            print("  ✓ [PASS] Test 1: PayRequest parses H5 dopay flexible fields correctly")
        } catch {
            print("❌ [FAIL] Test 1 failed with error: \(error)")
            exit(1)
        }

        // Test 2: PayRequest orderId fallback
        do {
            let orderIdJSON = """
            {
                "amount": "0.99",
                "orderId": "ORD_12345",
                "goodsID": 1,
                "roleID": "role_1"
            }
            """
            let req = try PayRequest(json: orderIdJSON, fallbackUsername: "fallback_user")
            assertCondition(req.cpOrder == "ORD_12345", "cpOrder should resolve from orderId")
            assertCondition(req.goodsId == 1, "goodsId should resolve from goodsID")
            assertCondition(req.username == "fallback_user", "username should fallback to session username")
            assertCondition(req.resolvedProductId() == "pbm_tier_099", "resolvedProductId should map 0.99 to pbm_tier_099")
            print("  ✓ [PASS] Test 2: PayRequest resolves orderId and price-tier product ID mapping")
        } catch {
            print("❌ [FAIL] Test 2 failed with error: \(error)")
            exit(1)
        }

        // Test 3: PageScripts.javaCallBack callbacks
        do {
            let script = PageScripts.javaCallBack("{\"code\":\"OK\",\"orderId\":\"ORD_1\"}")
            assertCondition(script.contains("window.javaCallBack"), "Must notify window.javaCallBack")
            assertCondition(script.contains("window.xmwsdk.paycallback"), "Must notify window.xmwsdk.paycallback")
            assertCondition(script.contains("pbm-pay-result"), "Must dispatch pbm-pay-result custom event")
            print("  ✓ [PASS] Test 3: PageScripts.javaCallBack notifies javaCallBack, xmwsdk.paycallback, and CustomEvent")
        }

        // Test 4: JavaScript Bridge files exist and contain required functions
        do {
            let nativeBridgePath = "PrehistoricBeastmaster/Resources/js/native_bridge.js"
            let analyticsBridgePath = "PrehistoricBeastmaster/Resources/js/analytics_bridge.js"
            
            let nativeBridge = try String(contentsOfFile: nativeBridgePath)
            assertCondition(nativeBridge.contains("pbmNative"), "native_bridge.js must define pbmNative")
            assertCondition(nativeBridge.contains("dopay"), "native_bridge.js must define dopay")
            assertCondition(nativeBridge.contains("pay:"), "native_bridge.js must define pay")
            assertCondition(nativeBridge.contains("sdkEvent"), "native_bridge.js must define sdkEvent")
            assertCondition(nativeBridge.contains("gameTelemetry"), "native_bridge.js must define gameTelemetry")
            assertCondition(nativeBridge.contains("protectXmwSdk"), "native_bridge.js must protect xmwsdk.dopay")
            
            let analyticsBridge = try String(contentsOfFile: analyticsBridgePath)
            assertCondition(analyticsBridge.contains("AF_Event_Name"), "analytics_bridge.js must hook AF_Event_Name")
            assertCondition(analyticsBridge.contains("AFStaticEvent"), "analytics_bridge.js must hook AFStaticEvent")
            assertCondition(analyticsBridge.contains("complete_registration"), "analytics_bridge.js must hook complete_registration")
            assertCondition(analyticsBridge.contains("pbmNative.sdkEvent"), "analytics_bridge.js must forward to pbmNative.sdkEvent")
            print("  ✓ [PASS] Test 4: Native and Analytics bridge JavaScript files define all required hooks")
        } catch {
            print("❌ [FAIL] Test 4 failed with error: \(error)")
            exit(1)
        }

        // Test 5: Verify no markdown documentation files exist for Cursor blind test
        do {
            let fileManager = FileManager.default
            let currentDir = fileManager.currentDirectoryPath
            let enumerator = fileManager.enumerator(atPath: currentDir)
            var docFiles: [String] = []
            while let file = enumerator?.nextObject() as? String {
                if file.hasSuffix(".md") && !file.hasPrefix("build") && !file.hasPrefix("output") {
                    docFiles.append(file)
                }
            }
            assertCondition(docFiles.isEmpty, "Found unexpected documentation files: \(docFiles)")
            print("  ✓ [PASS] Test 5: Verified zero markdown documentation files in project for blind testing")
        }

        print("\n=== All 5 SDK Bridge and Blind Test Scenarios Passed Successfully! ===")
    }
}
