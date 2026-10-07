#!/usr/bin/env python3
"""Generate PrehistoricBeastmaster.xcodeproj for the iOS shell."""

import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IOS = ROOT
APP = IOS / "PrehistoricBeastmaster"
PROJ = IOS / "PrehistoricBeastmaster.xcodeproj"
PBX = PROJ / "project.pbxproj"


def uid() -> str:
    return uuid.uuid4().hex[:24].upper()


SWIFT_FILES = [
    "AppDelegate.swift",
    "LocalStoreKitBootstrap.swift",
    "SplashViewController.swift",
    "GameViewController.swift",
    "PrivacyPolicyViewController.swift",
    "Config/ShellConfig.swift",
    "Config/JSONObject.swift",
    "Payment/PayRequest.swift",
    "Payment/BackendGateway.swift",
    "Payment/StoreKitManager.swift",
    "Content/ContentConfig.swift",
    "Analytics/Analytics.swift",
    "Web/InjectedScripts.swift",
    "Web/GameAPIProxy.swift",
    "Web/GameOrderEndpointRouter.swift",
    "Web/TrustedWebView.swift",
]

PRODUCTS = [
    ("pbm_tier_099", "0.99", "Tier 0.99"),
    ("pbm_tier_199", "1.99", "Tier 1.99"),
    ("pbm_tier_299", "2.99", "Tier 2.99"),
    ("pbm_tier_399", "3.99", "Tier 3.99"),
    ("pbm_tier_499", "4.99", "Tier 4.99"),
    ("pbm_tier_999", "9.99", "Tier 9.99"),
    ("pbm_tier_1499", "14.99", "Tier 14.99"),
    ("pbm_tier_1999", "19.99", "Tier 19.99"),
    ("pbm_tier_2499", "24.99", "Tier 24.99"),
    ("pbm_tier_2999", "29.99", "Tier 29.99"),
    ("pbm_tier_3499", "34.99", "Tier 34.99"),
    ("pbm_tier_4999", "49.99", "Tier 49.99"),
    ("pbm_tier_5999", "59.99", "Tier 59.99"),
    ("pbm_tier_8999", "89.99", "Tier 89.99"),
    ("pbm_tier_9999", "99.99", "Tier 99.99"),
    ("pbm_tier_12999", "129.99", "Tier 129.99"),
    ("pbm_tier_30000", "300.00", "Tier 300"),
    ("pbm_tier_50000", "500.00", "Tier 500"),
    ("pbm_tier_100000", "999.99", "Tier 999.99"),
]


def write_storekit() -> None:
    products = []
    for product_id, price, name in PRODUCTS:
        products.append(
            {
                "displayPrice": price,
                "familyShareable": False,
                "internalID": str(uuid.uuid4()).upper(),
                "localizations": [
                    {
                        "description": {"value": name, "locale": "en_US"},
                        "displayName": {"value": name, "locale": "en_US"},
                        "locale": "en_US",
                    }
                ],
                "productID": product_id,
                "referenceName": name,
                "type": "Consumable",
            }
        )
    payload = {
        "identifier": str(uuid.uuid4()).upper(),
        "nonRenewingSubscriptions": [],
        "products": products,
        "settings": {},
        "subscriptionGroups": [],
        "version": {"major": 3, "minor": 0},
    }
    (APP / "Products.storekit").write_text(json.dumps(payload, indent=2) + "\n")


def write_pbxproj() -> None:
    ids = {
        "project": uid(),
        "target": uid(),
        "sources_phase": uid(),
        "frameworks_phase": uid(),
        "resources_phase": uid(),
        "product_ref": uid(),
        "main_group": uid(),
        "config_group": uid(),
        "src_group": uid(),
        "products_group": uid(),
        "resources_group": uid(),
        "assets": uid(),
        "info": uid(),
        "privacy": uid(),
        "storekit": uid(),
        "game_folder": uid(),
        "js_folder": uid(),
        "shared_xc": uid(),
        "debug_xc": uid(),
        "release_xc": uid(),
        "debug_proj": uid(),
        "release_proj": uid(),
        "debug_tgt": uid(),
        "release_tgt": uid(),
        "cfg_proj": uid(),
        "cfg_tgt": uid(),
        "assets_build": uid(),
        "privacy_build": uid(),
        "game_build": uid(),
        "js_build": uid(),
        "facebook_package": uid(),
        "firebase_package": uid(),
        "facebook_core_product": uid(),
        "firebase_core_product": uid(),
        "firebase_analytics_product": uid(),
        "facebook_core_build": uid(),
        "firebase_core_build": uid(),
        "firebase_analytics_build": uid(),
        "google_services": uid(),
        "google_services_build": uid(),
    }

    folders = {}
    file_ref = {}
    build_file = {}
    for path in SWIFT_FILES:
        file_ref[path] = uid()
        build_file[path] = uid()
        if "/" in path:
            folder = path.split("/", 1)[0]
            folders.setdefault(folder, []).append(path)

    folder_group = {name: uid() for name in folders}

    build_files = []
    file_refs = []
    source_entries = []
    for path in SWIFT_FILES:
        name = Path(path).name
        build_files.append(
            f"\t\t{build_file[path]} /* {name} in Sources */ = {{isa = PBXBuildFile; fileRef = {file_ref[path]} /* {name} */; }};"
        )
        if "/" in path:
            folder, _ = path.split("/", 1)
            file_refs.append(
                f"\t\t{file_ref[path]} /* {name} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {name}; sourceTree = \"<group>\"; }};"
            )
        else:
            file_refs.append(
                f"\t\t{file_ref[path]} /* {path} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {path}; sourceTree = \"<group>\"; }};"
            )
        source_entries.append(
            f"\t\t\t\t{build_file[path]} /* {name} in Sources */,"
        )

    folder_groups = []
    for folder, paths in folders.items():
        children = "\n".join(
            f"\t\t\t\t{file_ref[path]} /* {Path(path).name} */," for path in paths
        )
        folder_groups.append(
            f"\t\t{folder_group[folder]} /* {folder} */ = {{\n"
            f"\t\t\tisa = PBXGroup;\n"
            f"\t\t\tchildren = (\n{children}\n\t\t\t);\n"
            f"\t\t\tpath = {folder};\n"
            f"\t\t\tsourceTree = \"<group>\";\n"
            f"\t\t}};"
        )

    root_swift_children = "\n".join(
        f"\t\t\t\t{file_ref[path]} /* {path} */," for path in SWIFT_FILES if "/" not in path
    )
    subgroup_children = "\n".join(
        f"\t\t\t\t{folder_group[folder]} /* {folder} */," for folder in sorted(folders)
    )

    has_google_services = (APP / "GoogleService-Info.plist").exists()
    google_services_build = (
        f"\t\t{ids['google_services_build']} /* GoogleService-Info.plist in Resources */ = "
        f"{{isa = PBXBuildFile; fileRef = {ids['google_services']} /* GoogleService-Info.plist */; }};"
        if has_google_services else ""
    )
    google_services_ref = (
        f"\t\t{ids['google_services']} /* GoogleService-Info.plist */ = "
        "{isa = PBXFileReference; lastKnownFileType = text.plist.xml; "
        "path = GoogleService-Info.plist; sourceTree = \"<group>\"; };"
        if has_google_services else ""
    )
    google_services_child = (
        f"\t\t\t\t{ids['google_services']} /* GoogleService-Info.plist */,"
        if has_google_services else ""
    )
    google_services_resource = (
        f"\t\t\t\t{ids['google_services_build']} /* GoogleService-Info.plist in Resources */,"
        if has_google_services else ""
    )

    pbx = f"""// !$*UTF8*$!
{{
\tarchiveVersion = 1;
\tclasses = {{
\t}};
\tobjectVersion = 56;
\tobjects = {{

/* Begin PBXBuildFile section */
{chr(10).join(build_files)}
{google_services_build}
\t\t{ids['facebook_core_build']} /* FacebookCore in Frameworks */ = {{isa = PBXBuildFile; productRef = {ids['facebook_core_product']} /* FacebookCore */; }};
\t\t{ids['firebase_core_build']} /* FirebaseCore in Frameworks */ = {{isa = PBXBuildFile; productRef = {ids['firebase_core_product']} /* FirebaseCore */; }};
\t\t{ids['firebase_analytics_build']} /* FirebaseAnalyticsCore in Frameworks */ = {{isa = PBXBuildFile; productRef = {ids['firebase_analytics_product']} /* FirebaseAnalyticsCore */; }};
\t\t{ids['assets_build']} /* Assets.xcassets in Resources */ = {{isa = PBXBuildFile; fileRef = {ids['assets']} /* Assets.xcassets */; }};
\t\t{ids['privacy_build']} /* PrivacyInfo.xcprivacy in Resources */ = {{isa = PBXBuildFile; fileRef = {ids['privacy']} /* PrivacyInfo.xcprivacy */; }};
\t\t{ids['game_build']} /* game in Resources */ = {{isa = PBXBuildFile; fileRef = {ids['game_folder']} /* game */; }};
\t\t{ids['js_build']} /* js in Resources */ = {{isa = PBXBuildFile; fileRef = {ids['js_folder']} /* js */; }};
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
{chr(10).join(file_refs)}
{google_services_ref}
\t\t{ids['product_ref']} /* PrehistoricBeastmaster.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = PrehistoricBeastmaster.app; sourceTree = BUILT_PRODUCTS_DIR; }};
\t\t{ids['assets']} /* Assets.xcassets */ = {{isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = \"<group>\"; }};
\t\t{ids['info']} /* Info.plist */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = \"<group>\"; }};
\t\t{ids['privacy']} /* PrivacyInfo.xcprivacy */ = {{isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = \"<group>\"; }};
\t\t{ids['storekit']} /* Products.storekit */ = {{isa = PBXFileReference; lastKnownFileType = text.json; path = Products.storekit; sourceTree = \"<group>\"; }};
\t\t{ids['game_folder']} /* game */ = {{isa = PBXFileReference; lastKnownFileType = folder; path = game; sourceTree = \"<group>\"; }};
\t\t{ids['js_folder']} /* js */ = {{isa = PBXFileReference; lastKnownFileType = folder; path = js; sourceTree = \"<group>\"; }};
\t\t{ids['shared_xc']} /* Shared.xcconfig */ = {{isa = PBXFileReference; lastKnownFileType = text.xcconfig; path = Shared.xcconfig; sourceTree = \"<group>\"; }};
\t\t{ids['debug_xc']} /* Debug.xcconfig */ = {{isa = PBXFileReference; lastKnownFileType = text.xcconfig; path = Debug.xcconfig; sourceTree = \"<group>\"; }};
\t\t{ids['release_xc']} /* Release.xcconfig */ = {{isa = PBXFileReference; lastKnownFileType = text.xcconfig; path = Release.xcconfig; sourceTree = \"<group>\"; }};
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
\t\t{ids['frameworks_phase']} /* Frameworks */ = {{
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t\t{ids['facebook_core_build']} /* FacebookCore in Frameworks */,
\t\t\t\t{ids['firebase_core_build']} /* FirebaseCore in Frameworks */,
\t\t\t\t{ids['firebase_analytics_build']} /* FirebaseAnalyticsCore in Frameworks */,
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
\t\t{ids['main_group']} = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{ids['config_group']} /* Config */,
\t\t\t\t{ids['src_group']} /* PrehistoricBeastmaster */,
\t\t\t\t{ids['products_group']} /* Products */,
\t\t\t);
\t\t\tsourceTree = \"<group>\";
\t\t}};
\t\t{ids['config_group']} /* Config */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{ids['shared_xc']} /* Shared.xcconfig */,
\t\t\t\t{ids['debug_xc']} /* Debug.xcconfig */,
\t\t\t\t{ids['release_xc']} /* Release.xcconfig */,
\t\t\t);
\t\t\tpath = Config;
\t\t\tsourceTree = \"<group>\";
\t\t}};
\t\t{ids['src_group']} /* PrehistoricBeastmaster */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
{root_swift_children}
{subgroup_children}
{google_services_child}
\t\t\t\t{ids['assets']} /* Assets.xcassets */,
\t\t\t\t{ids['info']} /* Info.plist */,
\t\t\t\t{ids['privacy']} /* PrivacyInfo.xcprivacy */,
\t\t\t\t{ids['storekit']} /* Products.storekit */,
\t\t\t\t{ids['resources_group']} /* Resources */,
\t\t\t);
\t\t\tpath = PrehistoricBeastmaster;
\t\t\tsourceTree = \"<group>\";
\t\t}};
\t\t{ids['resources_group']} /* Resources */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{ids['game_folder']} /* game */,
\t\t\t\t{ids['js_folder']} /* js */,
\t\t\t);
\t\t\tpath = Resources;
\t\t\tsourceTree = \"<group>\";
\t\t}};
{chr(10).join(folder_groups)}
\t\t{ids['products_group']} /* Products */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{ids['product_ref']} /* PrehistoricBeastmaster.app */,
\t\t\t);
\t\t\tname = Products;
\t\t\tsourceTree = \"<group>\";
\t\t}};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
\t\t{ids['target']} /* PrehistoricBeastmaster */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {ids['cfg_tgt']} /* Build configuration list for PBXNativeTarget \"PrehistoricBeastmaster\" */;
\t\t\tbuildPhases = (
\t\t\t\t{ids['sources_phase']} /* Sources */,
\t\t\t\t{ids['frameworks_phase']} /* Frameworks */,
\t\t\t\t{ids['resources_phase']} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tpackageProductDependencies = (
\t\t\t\t{ids['facebook_core_product']} /* FacebookCore */,
\t\t\t\t{ids['firebase_core_product']} /* FirebaseCore */,
\t\t\t\t{ids['firebase_analytics_product']} /* FirebaseAnalyticsCore */,
\t\t\t);
\t\t\tname = PrehistoricBeastmaster;
\t\t\tproductName = PrehistoricBeastmaster;
\t\t\tproductReference = {ids['product_ref']} /* PrehistoricBeastmaster.app */;
\t\t\tproductType = \"com.apple.product-type.application\";
\t\t}};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
\t\t{ids['project']} /* Project object */ = {{
\t\t\tisa = PBXProject;
\t\t\tattributes = {{
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastSwiftUpdateCheck = 1600;
\t\t\t\tLastUpgradeCheck = 1600;
\t\t\t\tTargetAttributes = {{
\t\t\t\t\t{ids['target']} = {{
\t\t\t\t\t\tCreatedOnToolsVersion = 16.0;
\t\t\t\t\t}};
\t\t\t\t}};
\t\t\t}};
\t\t\tbuildConfigurationList = {ids['cfg_proj']} /* Build configuration list for PBXProject \"PrehistoricBeastmaster\" */;
\t\t\tcompatibilityVersion = \"Xcode 14.0\";
\t\t\tdevelopmentRegion = \"zh-Hant\";
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
\t\t\t\ten,
\t\t\t\t\"zh-Hant\",
\t\t\t\tBase,
\t\t\t);
\t\t\tmainGroup = {ids['main_group']};
\t\t\tpackageReferences = (
\t\t\t\t{ids['facebook_package']} /* XCRemoteSwiftPackageReference \"facebook-ios-sdk\" */,
\t\t\t\t{ids['firebase_package']} /* XCRemoteSwiftPackageReference \"firebase-ios-sdk\" */,
\t\t\t);
\t\t\tproductRefGroup = {ids['products_group']} /* Products */;
\t\t\tprojectDirPath = \"\";
\t\t\tprojectRoot = \"\";
\t\t\ttargets = (
\t\t\t\t{ids['target']} /* PrehistoricBeastmaster */,
\t\t\t);
\t\t}};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
\t\t{ids['resources_phase']} /* Resources */ = {{
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t\t{ids['assets_build']} /* Assets.xcassets in Resources */,
\t\t\t\t{ids['privacy_build']} /* PrivacyInfo.xcprivacy in Resources */,
\t\t\t\t{ids['game_build']} /* game in Resources */,
\t\t\t\t{ids['js_build']} /* js in Resources */,
{google_services_resource}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
\t\t{ids['sources_phase']} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
{chr(10).join(source_entries)}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
\t\t{ids['debug_proj']} /* Debug */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbaseConfigurationReference = {ids['debug_xc']} /* Debug.xcconfig */;
\t\t\tbuildSettings = {{
\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCLANG_ENABLE_OBJC_ARC = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
\t\t\t\tDEBUG_INFORMATION_FORMAT = dwarf;
\t\t\t\tENABLE_STRICT_OBJC_MSGSEND = YES;
\t\t\t\tGCC_DYNAMIC_NO_PIC = NO;
\t\t\t\tGCC_OPTIMIZATION_LEVEL = 0;
\t\t\t\tMTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;
\t\t\t\tONLY_ACTIVE_ARCH = YES;
\t\t\t\tSDKROOT = iphoneos;
\t\t\t}};
\t\t\tname = Debug;
\t\t}};
\t\t{ids['release_proj']} /* Release */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbaseConfigurationReference = {ids['release_xc']} /* Release.xcconfig */;
\t\t\tbuildSettings = {{
\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCLANG_ENABLE_OBJC_ARC = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
\t\t\t\tDEBUG_INFORMATION_FORMAT = \"dwarf-with-dsym\";
\t\t\t\tENABLE_NS_ASSERTIONS = NO;
\t\t\t\tENABLE_STRICT_OBJC_MSGSEND = YES;
\t\t\t\tMTL_ENABLE_DEBUG_INFO = NO;
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tVALIDATE_PRODUCT = YES;
\t\t\t}};
\t\t\tname = Release;
\t\t}};
\t\t{ids['debug_tgt']} /* Debug */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbaseConfigurationReference = {ids['debug_xc']} /* Debug.xcconfig */;
\t\t\tbuildSettings = {{
\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 17;
\t\t\t\tFRAMEWORK_SEARCH_PATHS = \"$(inherited) $(PLATFORM_DIR)/Developer/Library/Frameworks\";
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = PrehistoricBeastmaster/Info.plist;
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 16.0;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = \"$(inherited) @executable_path/Frameworks /Developer/Library/Frameworks\";
\t\t\t\tMARKETING_VERSION = 1.0.12;
\t\t\t\tOTHER_LDFLAGS = \"$(inherited) -ObjC -weak_framework StoreKitTest\";
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.stone.primitive.saga;
\t\t\t\tPRODUCT_NAME = \"$(TARGET_NAME)\";
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tSUPPORTED_PLATFORMS = \"iphoneos iphonesimulator\";
\t\t\t\tSUPPORTS_MACCATALYST = NO;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = \"-Onone\";
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = 1;
\t\t\t}};
\t\t\tname = Debug;
\t\t}};
\t\t{ids['release_tgt']} /* Release */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbaseConfigurationReference = {ids['release_xc']} /* Release.xcconfig */;
\t\t\tbuildSettings = {{
\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
\t\t\t\tCODE_SIGN_IDENTITY = \"Apple Distribution\";
\t\t\t\tCODE_SIGN_STYLE = Manual;
\t\t\t\tCURRENT_PROJECT_VERSION = 17;
\t\t\t\tDEVELOPMENT_TEAM = ADR4GMT9V3;
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = PrehistoricBeastmaster/Info.plist;
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 16.0;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = \"$(inherited) @executable_path/Frameworks\";
\t\t\t\tMARKETING_VERSION = 1.0.12;
\t\t\t\tOTHER_LDFLAGS = \"$(inherited) -ObjC\";
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.stone.primitive.saga;
\t\t\t\tPRODUCT_NAME = \"$(TARGET_NAME)\";
\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = Primal_Legends_AppStore_YU_KANG_2026;
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tSUPPORTED_PLATFORMS = \"iphoneos iphonesimulator\";
\t\t\t\tSUPPORTS_MACCATALYST = NO;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = 1;
\t\t\t}};
\t\t\tname = Release;
\t\t}};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
\t\t{ids['cfg_proj']} /* Build configuration list for PBXProject \"PrehistoricBeastmaster\" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{ids['debug_proj']} /* Debug */,
\t\t\t\t{ids['release_proj']} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
\t\t{ids['cfg_tgt']} /* Build configuration list for PBXNativeTarget \"PrehistoricBeastmaster\" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{ids['debug_tgt']} /* Debug */,
\t\t\t\t{ids['release_tgt']} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
/* End XCConfigurationList section */

/* Begin XCRemoteSwiftPackageReference section */
\t\t{ids['facebook_package']} /* XCRemoteSwiftPackageReference \"facebook-ios-sdk\" */ = {{
\t\t\tisa = XCRemoteSwiftPackageReference;
\t\t\trepositoryURL = \"https://github.com/facebook/facebook-ios-sdk.git\";
\t\t\trequirement = {{
\t\t\t\tkind = upToNextMajorVersion;
\t\t\t\tminimumVersion = 18.1.1;
\t\t\t}};
\t\t}};
\t\t{ids['firebase_package']} /* XCRemoteSwiftPackageReference \"firebase-ios-sdk\" */ = {{
\t\t\tisa = XCRemoteSwiftPackageReference;
\t\t\trepositoryURL = \"https://github.com/firebase/firebase-ios-sdk.git\";
\t\t\trequirement = {{
\t\t\t\tkind = upToNextMajorVersion;
\t\t\t\tminimumVersion = 12.18.0;
\t\t\t}};
\t\t}};
/* End XCRemoteSwiftPackageReference section */

/* Begin XCSwiftPackageProductDependency section */
\t\t{ids['facebook_core_product']} /* FacebookCore */ = {{
\t\t\tisa = XCSwiftPackageProductDependency;
\t\t\tpackage = {ids['facebook_package']} /* XCRemoteSwiftPackageReference \"facebook-ios-sdk\" */;
\t\t\tproductName = FacebookCore;
\t\t}};
\t\t{ids['firebase_core_product']} /* FirebaseCore */ = {{
\t\t\tisa = XCSwiftPackageProductDependency;
\t\t\tpackage = {ids['firebase_package']} /* XCRemoteSwiftPackageReference \"firebase-ios-sdk\" */;
\t\t\tproductName = FirebaseCore;
\t\t}};
\t\t{ids['firebase_analytics_product']} /* FirebaseAnalyticsCore */ = {{
\t\t\tisa = XCSwiftPackageProductDependency;
\t\t\tpackage = {ids['firebase_package']} /* XCRemoteSwiftPackageReference \"firebase-ios-sdk\" */;
\t\t\tproductName = FirebaseAnalyticsCore;
\t\t}};
/* End XCSwiftPackageProductDependency section */
\t}};
\trootObject = {ids['project']} /* Project object */;
}}
"""
    PROJ.mkdir(parents=True, exist_ok=True)
    PBX.write_text(pbx)
    scheme_dir = PROJ / "xcshareddata" / "xcschemes"
    scheme_dir.mkdir(parents=True, exist_ok=True)
    scheme = f"""<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1600"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "{ids['target']}"
               BuildableName = "PrehistoricBeastmaster.app"
               BlueprintName = "PrehistoricBeastmaster"
               ReferencedContainer = "container:PrehistoricBeastmaster.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "{ids['target']}"
            BuildableName = "PrehistoricBeastmaster.app"
            BlueprintName = "PrehistoricBeastmaster"
            ReferencedContainer = "container:PrehistoricBeastmaster.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "{ids['target']}"
            BuildableName = "PrehistoricBeastmaster.app"
            BlueprintName = "PrehistoricBeastmaster"
            ReferencedContainer = "container:PrehistoricBeastmaster.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
"""
    (scheme_dir / "PrehistoricBeastmaster.xcscheme").write_text(scheme)
    local_storekit_scheme = scheme.replace(
        '            buildForArchiving = "YES">',
        '            buildForArchiving = "NO">',
        1,
    ).replace(
        "      </BuildableProductRunnable>\n   </LaunchAction>",
        """      </BuildableProductRunnable>
      <StoreKitConfigurationFileReference
         identifier = "../PrehistoricBeastmaster/Products.storekit">
      </StoreKitConfigurationFileReference>
   </LaunchAction>""",
        1,
    )
    (scheme_dir / "PrehistoricBeastmaster-LocalStoreKit.xcscheme").write_text(
        local_storekit_scheme
    )


def main() -> None:
    write_storekit()
    write_pbxproj()
    print(f"Generated {PBX}")


if __name__ == "__main__":
    main()
