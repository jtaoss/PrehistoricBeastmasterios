import Foundation

var checks = 0
func check(_ condition: @autoclosure () -> Bool, _ label: String) {
    guard condition() else { fatalError("FAIL: \(label)") }
    checks += 1
}
func query(_ url: URL) -> [URLQueryItem] {
    URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
}
func rewrite(_ text: String, platform: String = "xmwh5xsqsdtt") -> URL {
    GameOrderEndpointRouter.rewrite(URL(string: text)!, orderPlatform: platform)
}
let expected = [
    "https://safthwy.antieh.com/fx/createOrder.php",
    "https://safthwy02.antieh.com/fx/createOrder.php",
    "https://safthwy02.antieh.com/fx16/createOrder.php",
    "https://safthwy04.antieh.com/fx/createOrder.php",
    "https://safthwy05.antieh.com/fx/createOrder.php",
    "https://safthwy06.antieh.com/fx/createOrder.php",
    "https://safthwy07.antieh.com/fx/createOrder.php",
    "https://safthwy08.antieh.com/fx/createOrder.php",
    "https://safthwy09.antieh.com/fx/createOrder.php"
]
// Every supported ID, including exact 1000/2000/... boundaries from Android.
for sid in 1...8999 {
    check(GameOrderEndpointRouter.resolve(String(sid))?.absoluteString == expected[sid / 1000], "sid \(sid)")
}
for invalid: String? in [nil, "", " ", "not-a-server", "0", "-1", "9000", "9999999999999999", "1.0", "0x1", "1 2"] {
    check(GameOrderEndpointRouter.resolve(invalid) == nil, "reject \(invalid ?? "nil")")
}
check(GameOrderEndpointRouter.resolve(" \n+1001\t")?.absoluteString == expected[1], "trim and positive sign")

let base = "https://safthwy.antieh.com/audit//createOrder.php"
for region in 0..<9 {
    for alias in ["sid", "serverId", "server_id", "sercerId"] {
        let target = rewrite("\(base)?\(alias)=\(region * 1000 + 1)&id=910001&platformType=old")
        check(target.host == URL(string: expected[region])!.host && target.path == URL(string: expected[region])!.path, "region \(region + 1) alias \(alias)")
        check(query(target).filter { $0.name == "platformType" }.map(\.value) == ["xmwh5xsqsdtt"], "platform override")
    }
}
check(rewrite("\(base)?sid=&serverId=%20&server_id=2001&sercerId=1").path == "/fx16/createOrder.php", "first nonempty alias")
check(rewrite("\(base)?sid=1&serverId=8001").host == "safthwy.antieh.com", "sid precedence")
check(rewrite("\(base)?sid=bad&serverId=8001").query == "sid=bad&serverId=8001", "invalid first alias does not choose another region")
check(rewrite("\(base)?sid=1&sid=8001").host == "safthwy.antieh.com", "first duplicate ID wins like Android")

let original = URL(string: "\(base)?sid=1&id=910001&roleName=%E7%8E%A9%E5%AE%B6%26%3D&sign=a%2Bb%2Fc%3D&tag=a&tag=b&empty=&bare&platformType=old&platformType=older&redirect=https://safthwy.antieh.com/audit//keep")!
let routed = GameOrderEndpointRouter.rewrite(original, orderPlatform: " xmwh5xsqsdtt ")
check(query(routed).filter { $0.name != "platformType" } == query(original).filter { $0.name != "platformType" }, "preserve every other query value, duplicate, Unicode, signature and URL")
check(query(routed).filter { $0.name == "platformType" }.map(\.value) == ["xmwh5xsqsdtt"], "deduplicate override like Android")
check(query(rewrite("\(base)?sid=1")).last == URLQueryItem(name: "platformType", value: "xmwh5xsqsdtt"), "append missing platform")

for args in ["", "?sid=0", "?sid=9000", "?sid=bad", "?sid=-1"] {
    let target = rewrite(base + args)
    check(target.host == "safthwy.antieh.com" && target.path == "/fx/createOrder.php", "invalid ID retains normalized original, never region 9")
    check(query(target) == query(URL(string: base + args)!), "invalid ID retains query")
}
let noPlatform = rewrite(base + "?sid=8001&platformType=original", platform: " ")
check(noPlatform.host == "safthwy.antieh.com" && noPlatform.query == "sid=8001&platformType=original", "empty platform does not route")
let legacy = rewrite("https://safthwy09.antieh.com/fx/createOrder.php?sid=1")
check(legacy.host == "safthwy.antieh.com", "legacy intercepted endpoint no longer forces region 9")
let login = rewrite("https://safthwy.antieh.com/audit//?act=login&platformType=old&token=fixture")
check(URLComponents(url: login, resolvingAgainstBaseURL: false)?.percentEncodedPath == "/fx/" && login.query == "act=login&platformType=old&token=fixture", "login only normalizes path")
let servers = rewrite("https://safthwy.antieh.com/audit/?act=getServerList&platformType=old&sign=fixture")
check(URLComponents(url: servers, resolvingAgainstBaseURL: false)?.percentEncodedPath == "/fx/" && query(servers).contains(URLQueryItem(name: "platformType", value: "xmwh5sqxss")), "server-list interop unchanged")
let outside = URL(string: "https://example.invalid/page?next=https://safthwy.antieh.com/audit//keep")!
check(GameOrderEndpointRouter.rewrite(outside, orderPlatform: "xmwh5xsqsdtt") == outside, "do not rewrite URLs embedded in query values")
print("PASS: \(checks) production Swift router checks; no network requests or orders")
