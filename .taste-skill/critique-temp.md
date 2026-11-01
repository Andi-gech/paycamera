# Design Critique: Full Mobile Application (`cheki-mobile`)
Target: All 8 core screens across the entire user journey:
1. Entry & Onboarding (app/index.tsx, app/onboarding.tsx)
2. Home / Manual Verification (app/(tabs)/index.tsx)
3. History & Audit Log (app/(tabs)/history.tsx)
4. Profile, Rules & Settings (app/(tabs)/profile.tsx)
5. Scan Viewfinder & OCR Scanner (app/scan-upload.tsx)
6. Verification Result (app/verify-result.tsx)
7. Receipt Details & Share (app/receipt-details.tsx)
8. High-Throughput Batch Processing (app/batch-verify.tsx)

## Design Health Score: 28 / 40 (Acceptable - Needs Polish)
- Visibility of System Status: 3/4
- Match Between System & Real World: 2/4 (Critical P0: Negative signs on received payments)
- User Control & Freedom: 3/4
- Consistency & Standards: 2/4 (Token divergence across stack screens vs tabs)
- Error Prevention: 3/4 (Excellent 0/O auto-correction for Telebirr)
- Recognition Rather Than Recall: 3/4
- Flexibility & Efficiency of Use: 4/4 (Outstanding batch mode & direct camera)
- Aesthetic & Minimalist Design: 3/4 (Profile is crisp; Home has banner clutter)
- Error Recovery: 3/4
- Help & Documentation: 2/4

## Priority Issues:
- [P0] Critical: Negative Sign on Received Settlement Amounts in verify-result and receipt-details (-data.amount).
- [P1] Payment Rail Inconsistency: BOA is functional but missing in History filters; Dashen is disabled on Home but present in History filters.
- [P2] Token Fragmentation: Colors.primaryBlue vs colors.accent (Emerald) across screens.
- [P3] Cluttered Home Tab Visual Hierarchy pushing core input below the fold on budget 360dp devices.

