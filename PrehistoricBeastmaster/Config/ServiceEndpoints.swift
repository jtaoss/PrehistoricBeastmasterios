import Foundation

enum ServiceEndpoints {
    enum Name: CaseIterable {
        case sdkAPI
        case legalTerms
        case legalPrivacy
        case legalDeletion
    }

    static func string(_ name: Name) -> String { values[name] ?? "" }
    static func url(_ name: Name) -> URL? { URL(string: string(name)) }
    static func host(_ name: Name) -> String { url(name)?.host?.lowercased() ?? "" }

    private static let values: [Name: String] = [
        .sdkAPI: "https://api.primitive-saga.com/",
        .legalTerms: "https://d1udhm4c9vjzph.cloudfront.net/ios-legal/terms-of-service.html",
        .legalPrivacy: "https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html",
        .legalDeletion: "https://d1udhm4c9vjzph.cloudfront.net/ios-legal/account-deletion.html"
    ]
}
