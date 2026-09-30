import Foundation
import Network
import os
import UIKit

public struct TelemetryIngestRecord: Codable, Sendable {
    public let eventId: String
    public let category: String
    public let name: String
    public let timestamp: Double
    public let deviceId: String
    public let appVersion: String
    public let metadata: [String: String]

    public init(
        eventId: String,
        category: String,
        name: String,
        timestamp: Double,
        deviceId: String,
        appVersion: String,
        metadata: [String: String]
    ) {
        self.eventId = eventId
        self.category = category
        self.name = name
        self.timestamp = timestamp
        self.deviceId = deviceId
        self.appVersion = appVersion
        self.metadata = metadata
    }
}


public typealias StageTelemetryResult = StageResult

public protocol TelemetryTrackerProtocol: AnyObject, Sendable {
    func track(_ event: TelemetryEvent)
    func recordAppLaunch()
    func recordStageStart(stageId: String)
    func recordStageEnd(stageId: String, result: StageTelemetryResult, durationSeconds: Int)
    func recordCheckoutInitiate(productId: String)
    func recordCheckoutResult(productId: String, orderId: String, success: Bool)
    func recordItemConsume(itemId: String, costPearls: Int, remainingBalance: Int)
    func flushPendingEvents()
}


public final class TelemetryTracker: TelemetryTrackerProtocol, @unchecked Sendable {
    public static let shared = TelemetryTracker()

    private let lock = NSLock()
    private var providers: [TelemetryProvider] = []

    private let sessionId: String
    private var deviceId: String?
    private let appVersion: String
    private let bundleId: String

    private let dispatchQueue = DispatchQueue(label: "com.prehistoric.telemetry.dispatch", qos: .utility)

    public init(
        providers: [TelemetryProvider]? = nil,
        appVersion: String? = nil,
        bundleId: String? = nil
    ) {
        let resolvedAppVersion = appVersion ?? ShellConfig.versionName
        let resolvedBundleId = bundleId ?? ShellConfig.bundleId
        self.sessionId = UUID().uuidString.lowercased()
        self.deviceId = nil
        self.appVersion = resolvedAppVersion
        self.bundleId = resolvedBundleId

        if let customProviders = providers {
            self.providers = customProviders
        } else {
            self.providers = [
                BackendTelemetryProvider(bundleId: resolvedBundleId, appVersion: resolvedAppVersion),
                FirebaseTelemetryProvider(),
                ConsoleTelemetryProvider(isEnabled: true, printJSON: false)
            ]
        }

        for provider in self.providers {
            provider.initialize()
        }

        setupAppLifecycleHooks()
    }


    public func register(provider: TelemetryProvider) {
        lock.lock()
        defer { lock.unlock() }

        if !providers.contains(where: { $0.name == provider.name }) {
            provider.initialize()
            providers.append(provider)
        }
    }

    public func unregister(providerNamed name: String) {
        lock.lock()
        defer { lock.unlock() }
        providers.removeAll { $0.name == name }
    }

    public var registeredProviders: [TelemetryProvider] {
        lock.lock()
        defer { lock.unlock() }
        return providers
    }


    public func track(_ event: TelemetryEvent) {
        guard AnalyticsSDK.isCollectionAllowed else { return }
        let eventName = event.name
        let category = event.category
        let eventParams = event.parameters

        let activeProviders: [TelemetryProvider]
        lock.lock()
        activeProviders = self.providers
        lock.unlock()

        dispatchQueue.async { [weak self] in
            guard let self, AnalyticsSDK.isCollectionAllowed else { return }

            let enrichedParameters = self.buildEnrichedContext(with: eventParams)

            for provider in activeProviders {
                guard provider.isEnabled else { continue }
                self.dispatchSafely(to: provider, event: eventName, category: category, parameters: enrichedParameters)
            }
        }
    }


    private func buildEnrichedContext(with customParams: [String: Any]) -> [String: Any] {
        let resolvedDeviceId: String
        if let deviceId {
            resolvedDeviceId = deviceId
        } else {
            resolvedDeviceId = TelemetryDeviceIdentity.current
            deviceId = resolvedDeviceId
        }
        var context: [String: Any] = [
            "session_id": sessionId,
            "device_id": resolvedDeviceId,
            "app_version": appVersion,
            "bundle_id": bundleId,
            "locale": Locale.current.identifier,
            "client_timestamp": Int64(Date().timeIntervalSince1970 * 1000),
            "timezone": TimeZone.current.identifier
        ]

        for (key, value) in customParams {
            context[key] = value
        }

        return context
    }


    private func dispatchSafely(
        to provider: TelemetryProvider,
        event: String,
        category: String,
        parameters: [String: Any]
    ) {
        provider.track(event: event, category: category, parameters: parameters)
    }


    private func setupAppLifecycleHooks() {
        NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            self?.track(.appBackground)
        }

        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            self?.track(.appForeground)
        }
    }


    public func recordAppLaunch() {
        track(.appLaunch())
    }

    public func recordStageStart(stageId: String) {
        track(.stageStart(stageId: stageId))
    }

    public func recordStageEnd(stageId: String, result: StageTelemetryResult, durationSeconds: Int) {
        track(.stageEnd(stageId: stageId, result: result, durationSeconds: durationSeconds))
    }

    public func recordCheckoutInitiate(productId: String) {
        track(.checkoutInitiate(productId: productId))
    }

    public func recordCheckoutResult(productId: String, orderId: String, success: Bool) {
        if success {
            track(.checkoutSuccess(productId: productId, orderId: orderId, transactionId: ""))
        } else {
            track(.checkoutFailed(productId: productId, orderId: orderId, code: "FAILED", message: "Checkout failed"))
        }
    }

    public func recordItemConsume(itemId: String, costPearls: Int, remainingBalance: Int) {
        track(.itemConsume(itemId: itemId, costPearls: costPearls, remainingBalance: remainingBalance))
    }

    public func flushPendingEvents() {
    }
}

private enum TelemetryDeviceIdentity {
    private static let installIdKey = "pbm.telemetry.install_id"

    static var current: String {
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: installIdKey), !existing.isEmpty {
            return existing
        }
        let generated = UUID().uuidString.lowercased()
        defaults.set(generated, forKey: installIdKey)
        return generated
    }
}
