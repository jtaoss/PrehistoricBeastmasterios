import CryptoKit
import Foundation

struct JSONObject {
    private(set) var storage: [String: Any]

    init(_ storage: [String: Any] = [:]) {
        self.storage = storage
    }

    init(json: String) throws {
        let data = Data(json.utf8)
        let object = try JSONSerialization.jsonObject(with: data)
        guard let dictionary = object as? [String: Any] else {
            throw URLError(.cannotParseResponse)
        }
        storage = dictionary
    }

    static func parse(_ json: String?) -> JSONObject {
        guard let json, !json.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return JSONObject()
        }
        return (try? JSONObject(json: json)) ?? JSONObject()
    }

    func string(_ key: String, _ fallback: String = "") -> String {
        if let value = storage[key] as? String {
            return value
        }
        if let value = storage[key] as? NSNumber {
            return value.stringValue
        }
        return fallback
    }

    func int(_ key: String, _ fallback: Int = 0) -> Int {
        if let value = storage[key] as? Int {
            return value
        }
        if let value = storage[key] as? NSNumber {
            return value.intValue
        }
        if let value = Int(string(key)) {
            return value
        }
        return fallback
    }

    func int64(_ key: String, _ fallback: Int64 = 0) -> Int64 {
        if let value = storage[key] as? Int64 {
            return value
        }
        if let value = storage[key] as? NSNumber {
            return value.int64Value
        }
        if let value = Int64(string(key)) {
            return value
        }
        return fallback
    }

    func double(_ key: String, _ fallback: Double = -1) -> Double {
        if let value = storage[key] as? Double, value.isFinite {
            return value
        }
        if let value = storage[key] as? NSNumber {
            let parsed = value.doubleValue
            return parsed.isFinite ? parsed : fallback
        }
        if let parsed = Double(string(key).trimmingCharacters(in: .whitespacesAndNewlines)), parsed.isFinite {
            return parsed
        }
        return fallback
    }

    func bool(_ key: String, _ fallback: Bool = false) -> Bool {
        if let value = storage[key] as? Bool {
            return value
        }
        if let value = storage[key] as? NSNumber {
            return value.boolValue
        }
        let raw = string(key).lowercased()
        if raw == "true" || raw == "1" {
            return true
        }
        if raw == "false" || raw == "0" {
            return false
        }
        return fallback
    }

    func has(_ key: String) -> Bool {
        storage[key] != nil
    }

    func jsonObject(_ key: String) -> JSONObject? {
        if let value = storage[key] as? [String: Any] {
            return JSONObject(value)
        }
        if let raw = storage[key] as? String {
            return try? JSONObject(json: raw)
        }
        return nil
    }

    var dictionary: [String: Any] { storage }

    mutating func put(_ key: String, _ value: Any?) {
        guard let value else { return }
        if let text = value as? String, text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return
        }
        storage[key] = value
    }

    mutating func remove(_ key: String) {
        storage.removeValue(forKey: key)
    }

    func jsonString() -> String {
        guard JSONSerialization.isValidJSONObject(storage),
              let data = try? JSONSerialization.data(withJSONObject: storage, options: []) else {
            return "{}"
        }
        return String(data: data, encoding: .utf8) ?? "{}"
    }
}

enum ShellText {
    static func firstNonBlank(_ values: String?...) -> String {
        for value in values {
            if let value {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    return trimmed
                }
            }
        }
        return ""
    }

    static func sha256Hex(_ value: String) -> String {
        let digest = SHA256.hash(data: Data(value.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}
