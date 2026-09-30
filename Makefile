# Static gate and unsigned Release archive for TestFlight preflight.
AUDIT_APP ?=
AUDIT_VERSION ?= 1.0.12
AUDIT_BUILD ?= 52
AUDIT_FLAGS ?=
NODE ?= node

SCHEME ?= PrehistoricBeastmaster
PROJECT ?= PrehistoricBeastmaster.xcodeproj
ARCHIVE_PATH ?= build/PrehistoricBeastmaster.xcarchive
DERIVED_DATA ?= build/DerivedData
SOURCE_PACKAGES ?= $(DERIVED_DATA)/SourcePackages

.PHONY: audit-release archive-rc verify-rc

audit-release:
	@test -n "$(AUDIT_APP)" || { echo 'Usage: make audit-release AUDIT_APP=path/to/App.app [AUDIT_FLAGS=--unsigned-check]'; exit 2; }
	$(NODE) scripts/audit-release-package.mjs "$(AUDIT_APP)" "$(AUDIT_VERSION)" "$(AUDIT_BUILD)" $(AUDIT_FLAGS)

# Release device archive. Signing is disabled so a machine without the distribution profile can still preflight.
archive-rc:
	rm -rf "$(ARCHIVE_PATH)"
	xcodebuild archive \
		-project "$(PROJECT)" \
		-scheme "$(SCHEME)" \
		-configuration Release \
		-destination 'generic/platform=iOS' \
		-archivePath "$(ARCHIVE_PATH)" \
		-derivedDataPath "$(DERIVED_DATA)" \
		-clonedSourcePackagesDirPath "$(SOURCE_PACKAGES)" \
		CODE_SIGNING_ALLOWED=NO \
		CODE_SIGNING_REQUIRED=NO \
		CODE_SIGN_IDENTITY=- \
		PROVISIONING_PROFILE_SPECIFIER= \
		ENABLE_DEBUG_DYLIB=NO

verify-rc: archive-rc
	@app=$$(find "$(ARCHIVE_PATH)/Products/Applications" -maxdepth 1 -name '*.app' -type d | head -n 1); \
	test -n "$$app" || { echo 'Release archive does not contain an .app'; exit 1; }; \
	$(MAKE) audit-release AUDIT_APP="$$app" AUDIT_FLAGS=--unsigned-check
