// plugins/withMLKit.js — Expo Config Plugin for Google ML Kit OCR, Barcodes & Network Config
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PROGUARD_RULES = `
# ─── Google ML Kit Text Recognition & Barcode Scanning Rules ─────────
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**

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
    const mainApplication = modConfig.modResults.manifest.application[0];

    // Enable cleartext traffic for Ethiopian telecom/banking endpoints
    mainApplication.$['android:usesCleartextTraffic'] = 'true';

    if (!mainApplication['meta-data']) {
      mainApplication['meta-data'] = [];
    }

    // 1. Google ML Kit vision dependencies (ocr, barcode, text)
    const existingMlKit = mainApplication['meta-data'].find(
      (m) => m.$['android:name'] === 'com.google.mlkit.vision.DEPENDENCIES'
    );
    if (!existingMlKit) {
      mainApplication['meta-data'].push({
        $: {
          'android:name': 'com.google.mlkit.vision.DEPENDENCIES',
          'android:value': 'ocr,barcode,text',
        },
      });
    } else {
      existingMlKit.$['android:value'] = 'ocr,barcode,text';
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
        },
      });
    }

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
  return withMLKitProGuard(withMLKitManifest(config));
};

