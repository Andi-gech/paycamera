// plugins/withMLKit.js — Expo Config Plugin for Google ML Kit OCR, Barcodes & Network Config
const { withAndroidManifest, withDangerousMod, withGradleProperties } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PROGUARD_RULES = `
# ─── React Native Bridge & NativeModules ──────────────────────────────
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
    @com.facebook.react.bridge.ReactMethod(isBlockingSynchronousMethod=true) *;
}
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * extends com.facebook.react.bridge.ReactContextBaseJavaModule { *; }

# ─── Google ML Kit Text Recognition & Barcode Scanning Rules ─────────
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**

-keep class com.google.android.odml.** { *; }
-dontwarn com.google.android.odml.**

-keep class com.google.android.gms.vision.** { *; }
-dontwarn com.google.android.gms.vision.**

-keep class com.google.android.gms.common.** { *; }
-dontwarn com.google.android.gms.common.**

-keep class com.google.android.gms.internal.mlkit_vision_text.** { *; }
-dontwarn com.google.android.gms.internal.mlkit_vision_text.**

-keep class com.google.android.gms.internal.mlkit_vision_barcode.** { *; }
-dontwarn com.google.android.gms.internal.mlkit_vision_barcode.**

-keep class com.google.android.gms.tasks.** { *; }
-dontwarn com.google.android.gms.tasks.**

# React Native ML Kit Package Bridges
-keep class com.rnmlkit.** { *; }
-dontwarn com.rnmlkit.**

-keep class com.reactnativemlkit.** { *; }
-dontwarn com.reactnativemlkit.**

# Keep native JNI bindings
-keepclasseswithmembernames class * {
    native <methods>;
}
`;

function withMLKitManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    if (!manifest.$) {
      manifest.$ = {};
    }
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const mainApplication = manifest.application[0];

    // Enable cleartext traffic for Ethiopian telecom/banking endpoints
    mainApplication.$['android:usesCleartextTraffic'] = 'true';

    // Enable large heap so camera photos and OCR image decoding don't trigger OutOfMemoryError
    mainApplication.$['android:largeHeap'] = 'true';
    mainApplication.$['android:hardwareAccelerated'] = 'true';

    if (!mainApplication['meta-data']) {
      mainApplication['meta-data'] = [];
    }

    // 1. Google ML Kit vision dependencies (ocr, barcode, text, barcode_ui)
    // Note: tools:replace="android:value" prevents merge conflicts with expo-camera
    const existingMlKit = mainApplication['meta-data'].find(
      (m) => m.$['android:name'] === 'com.google.mlkit.vision.DEPENDENCIES'
    );
    if (!existingMlKit) {
      mainApplication['meta-data'].push({
        $: {
          'android:name': 'com.google.mlkit.vision.DEPENDENCIES',
          'android:value': 'barcode_ui,barcode,ocr,text',
          'tools:replace': 'android:value',
        },
      });
    } else {
      existingMlKit.$['android:value'] = 'barcode_ui,barcode,ocr,text';
      existingMlKit.$['tools:replace'] = 'android:value';
    }

    // 2. Fallback Firebase ML vision dependencies
    const existingFirebase = mainApplication['meta-data'].find(
      (m) => m.$['android:name'] === 'com.google.firebase.ml.vision.DEPENDENCIES'
    );
    if (!existingFirebase) {
      mainApplication['meta-data'].push({
        $: {
          'android:name': 'com.google.firebase.ml.vision.DEPENDENCIES',
          'android:value': 'ocr,barcode',
          'tools:replace': 'android:value',
        },
      });
    } else {
      existingFirebase.$['android:value'] = 'ocr,barcode';
      existingFirebase.$['tools:replace'] = 'android:value';
    }

    return modConfig;
  });
}

function withMLKitGradleProperties(config) {
  return withGradleProperties(config, (modConfig) => {
    // Disable R8 minification in release builds to prevent stripping ML Kit native reflection & bridges
    modConfig.modResults = modConfig.modResults.filter(
      (item) => item.key !== 'android.enableMinifyInReleaseBuilds' && item.key !== 'newArchEnabled'
    );
    modConfig.modResults.push({
      type: 'property',
      key: 'android.enableMinifyInReleaseBuilds',
      value: 'false',
    });
    modConfig.modResults.push({
      type: 'property',
      key: 'newArchEnabled',
      value: 'false',
    });
    return modConfig;
  });
}

function withMLKitProGuard(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const proguardPath = path.join(
        projectRoot,
        'android',
        'app',
        'proguard-rules.pro'
      );

      try {
        let currentRules = '';
        if (fs.existsSync(proguardPath)) {
          currentRules = fs.readFileSync(proguardPath, 'utf8');
        }

        if (!currentRules.includes('com.google.mlkit')) {
          fs.writeFileSync(
            proguardPath,
            currentRules + '\n' + PROGUARD_RULES,
            'utf8'
          );
        }
      } catch (err) {
        console.warn('[withMLKitProGuard] Could not update proguard-rules.pro:', err);
      }

      return modConfig;
    },
  ]);
}

module.exports = function withMLKit(config) {
  return withMLKitGradleProperties(withMLKitProGuard(withMLKitManifest(config)));
};

