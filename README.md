# Receipt Verify Ethiopia

Standalone React Native Android app. Receipt image text and QR processing run on the device. Live verification requests are sent directly from the phone to public provider receipt URLs. No app-owned backend is included.

## Requirements

Node.js 20 or newer, Android Studio for local APK builds, or an Expo/EAS account for cloud builds.

## Install and run

```bash
npm install
npx expo prebuild --platform android
npx expo run:android
```

## Build an installable APK with EAS

```bash
npm install
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

The preview profile produces an APK. Install it on an Android phone after the build finishes.

## How a receipt is checked

The app reads the reference and amount from the receipt, then loads the provider's public receipt page on the phone and compares the two values.

- **Telebirr** — the receipt URL can be built from the 10-character reference, so no link is needed.
- **Every other bank** — receipt URLs contain account numbers, document ids or PDF ids that the app does not have. Paste the link from the bank SMS/app (or scan the QR that contains it) into **Receipt URL**. The same HTML/JSON parser then checks any bank.
- **Gateway errors** — requests carry browser headers, time out after a few seconds, and retry automatically on `408`, `425`, `429`, `500`, `502`, `503` and `504`. A repeated `504` is reported as “gateway timeout” with the provider name and HTTP status instead of a generic failure.

A receipt is marked **verified** only when the same reference is present on the provider page *and* the amount matches. Anything else is **not verified** or **unable**, never “verified”.

## Verification limitations

- **PDF receipts (CBE, Dashen, Zemen, …):** the link is valid, but React Native cannot extract text from a PDF on the device. The app opens the link and reports “Receipt is a PDF document” instead of guessing.
- **JavaScript-only portals (Bank of Abyssinia, some wallets):** the HTML shell may not contain the transaction data. Those return “Receipt page could not be read”.
- Provider endpoints can change, restrict requests, or require a logged-in session. Full automation for every bank needs a small server-side proxy with official provider access; see the note below.

A successful HTTP response or a matching screenshot is not proof of settlement. Always confirm the recipient and date in the bank app before releasing goods or funds.

## Adding a bank endpoint

Bank URL templates, reference formats and parsing live in `lib/receipts.ts`. Add a definition to `BANK_DEFINITIONS` with a `buildUrl` only when the provider publishes a receipt URL that can be built from the reference alone. Do not invent endpoints. Validate any new parser with real, consented sample receipts before relying on it.

For banks that only expose PDFs or app-gated pages, the reliable path is a backend that downloads the receipt, extracts the text, and returns a small JSON result. The app can then call that endpoint instead of the provider directly.
