// lib/rules.ts — Complete Trilingual Localization (English, Amharic, Afan Oromo) & Rules
export type AppLanguage = 'en' | 'am' | 'om';
export type AppTheme = 'light' | 'dark' | 'system';

export interface VerificationRules {
  cbeExpectedReceiverName: string;
  cbeLegacyReceiverDigits: string;
  telebirrExpectedReceiverName: string;
  minAmount: string;
  maxAmount: string;
  enforceReceiverMatch: boolean;
  theme: AppTheme;
  language: AppLanguage;
}

export const DEFAULT_RULES: VerificationRules = {
  cbeExpectedReceiverName: '',
  cbeLegacyReceiverDigits: '',
  telebirrExpectedReceiverName: '',
  minAmount: '',
  maxAmount: '',
  enforceReceiverMatch: false,
  theme: 'light',
  language: 'en',
};

export interface RuleCheckResult {
  passed: boolean;
  warnings: string[];
}

export function checkCustomRules(
  record: {
    bank: string;
    receiverName?: string | null;
    amount?: string | null;
  },
  rules: VerificationRules
): RuleCheckResult {
  const warnings: string[] = [];

  if (rules.enforceReceiverMatch) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (record.bank === 'cbe' && rules.cbeExpectedReceiverName.trim()) {
      const expected = norm(rules.cbeExpectedReceiverName);
      const actual = norm(record.receiverName || '');
      if (actual && !actual.includes(expected) && !expected.includes(actual)) {
        warnings.push(`CBE Receiver name "${record.receiverName}" does not match rule ("${rules.cbeExpectedReceiverName}")`);
      }
    }

    if (record.bank === 'telebirr' && rules.telebirrExpectedReceiverName.trim()) {
      const expected = norm(rules.telebirrExpectedReceiverName);
      const actual = norm(record.receiverName || '');
      if (actual && !actual.includes(expected) && !expected.includes(actual)) {
        warnings.push(`Telebirr Receiver name "${record.receiverName}" does not match rule ("${rules.telebirrExpectedReceiverName}")`);
      }
    }
  }

  return {
    passed: warnings.length === 0,
    warnings,
  };
}

export const I18N = {
  en: {
    appName: 'ልክ pay',
    appSubtitle: 'Ethiopian Settlement Verifier',

    // Navigation Tabs
    tabHome: 'Home',
    tabHistory: 'History',
    tabSettings: 'Settings',

    // Home Screen
    greeting: 'Hello, 👋',
    verifyReceipt: 'Verify your receipt',
    safeSecureTitle: 'Safe & Secure',
    safeSecureSub: 'We check with official sources,\nnot just screenshots.',
    selectBank: 'Select Bank / Provider',
    transactionRef: 'Transaction Reference',
    refPlaceholder: 'Enter 10-character reference (e.g. DJR1DSXKZH)',
    btnVerify: 'Verify Receipt',
    orScanText: 'or scan a receipt image',
    btnScanUpload: 'Scan or Upload Receipt Image',

    // History Screen
    historyTitle: 'History',
    searchPlaceholder: 'Search by reference or name...',
    filterAll: 'All',
    statusVerified: 'Verified',
    statusUnable: 'Unable',
    statusPending: 'Pending',
    emptyHistory: 'No verification history yet',
    emptyHistorySub: 'Verified receipts will appear here',

    // Verify Result Screen
    navResultTitle: 'Verification Result',
    resVerified: 'Verified',
    resVerifiedMismatch: 'Verified but not same name',
    resUnable: 'Unable to Verify',
    resSuccessSub: 'This transaction has been confirmed\nwith the official source.',
    resMismatchSub: 'The transaction exists officially, but the receiver name does NOT match your custom rule.',
    resFailSub: 'The official receipt could not be read.\nPlease try again or check the details.',
    labelTransferMoney: 'Transfer Money',
    labelReference: 'Reference',
    labelStatus: 'Status',
    labelSuccessful: 'Successful',
    labelUnknown: 'Unknown',
    labelPayerName: 'Payer Name',
    labelTransactionTo: 'Transaction To',
    labelReceiverAccount: 'Receiver Account',
    labelTime: 'Transaction Time',
    officialVerified: 'Official receipt verified',
    officialResponse: 'Official source response',
    labelScannedReceipt: 'Scanned Receipt Image',
    labelTapToZoom: 'Tap to zoom',
    btnViewDetails: 'View Details',
    btnTryAgain: 'Try Again',

    // Receipt Details Screen
    navDetailsTitle: 'Receipt Details',
    headingTxInfo: 'Transaction Information',
    labelServiceFee: 'Service Fee',
    labelTotalPaid: 'Total Paid Amount',
    labelCurrency: 'Currency',
    btnShareReceipt: 'Share Receipt',

    // Scan Upload Screen
    navScanTitle: 'Scan or Upload Receipt',
    addReceiptTitle: 'Add Receipt Image',
    addReceiptSub: 'Take a clear screenshot or upload an image\nof your receipt.',
    btnTakePhoto: 'Take Photo',
    btnChooseGallery: 'Choose from Gallery',
    supportedFormats: 'Supported formats: JPG, PNG',
    clarityNote: 'Make sure the receipt is clear and complete.',
    analyzingText: 'Analyzing receipt and auto-identifying...',

    // Settings Screen
    settings: 'Settings',
    customRules: 'Custom Verification Rules',
    customRulesSub: 'Enforce specific receiver names or accounts for safety.',
    cbeReceiverRule: 'CBE Expected Receiver Name',
    cbeReceiverHint: 'e.g. Abebe Kebede',
    cbeLegacyDigits: 'CBE Receiver Account (Last 8 Digits)',
    cbeLegacyHint: 'e.g. 100012340393',
    telebirrReceiverRule: 'Telebirr Expected Receiver Name',
    telebirrReceiverHint: 'e.g. Zemensa Behaylu',
    enforceMatch: 'Enforce Receiver Name Match',
    enforceMatchSub: 'Flag receipts where the receiver name differs from your rule.',
    appearance: 'Appearance & Display',
    theme: 'Theme',
    language: 'Language',
    saveRules: 'Save Settings & Rules',
    savedSuccess: 'Settings and custom rules saved successfully!',

    // Onboarding Strings
    onboardingSkip: 'Skip',
    onboardingNext: 'Next',
    onboardingGetStarted: 'Get Started',
    onboardingAlreadyHaveAccount: 'Already set up? Go to Home',
    onboardingHeadline: 'Stop Fake Receipts in Seconds',
    onboardingSubtitle: 'Official settlement checks for CBE, Telebirr, Awash, BOA & Dashen.',
    onboardingPrivacyNote: '100% On-Device & Private · No Login Required',
    onboardingSlide1Title: 'Instant Receipt Verification',
    onboardingSlide1Sub: 'Scan or paste transactions from CBE, Telebirr, Awash, BOA & Dashen in seconds with high-speed OCR.',
    onboardingSlide2Title: 'Direct Bank Settlement',
    onboardingSlide2Sub: 'Direct queries against Ethiopian banking servers expose forged, photoshopped, or fake payment screenshots.',
    onboardingSlide3Title: 'Merchant Protection Rules',
    onboardingSlide3Sub: 'Set expected receiver accounts and names. Never get tricked by redirected transfers or fake receipts.',

    // Profile & Settings Redesign Strings
    profileTitle: 'Profile & Settings',
    profileSubtitle: 'Merchant identity, verification rules & app settings',
    profileMerchantBadge: 'Merchant Mode',
    profileTotalVerified: 'Total Checks',
    profileSuccessRate: 'Match Rate',
    profileSupportedBanks: 'Active Banks',
    profileSectionRules: 'Receiver Protection Rules',
    profileSectionAppearance: 'Display & Preferences',
    profileSectionData: 'Data & Maintenance',
    profileClearHistory: 'Clear Verification History',
    profileClearConfirmTitle: 'Clear Verification History?',
    profileClearConfirmSub: 'All saved receipts and verification history will be permanently deleted.',
    profileClearSuccess: 'History cleared successfully.',
    profileReplayTour: 'Replay Welcome Tour',
    profileReplayTourSub: 'Walk through features and instructions again.',
    profileAboutTitle: 'About LikPay',
    profileEngineLabel: 'Engine',
    profileEngineVal: 'Direct Ethiopian Gateway Scraper',
    profileStorageLabel: 'Database',
    profileStorageVal: 'Local Encrypted SQLite',
    profileVersionLabel: 'App Version',

    // No Network / Connectivity
    noNetworkTitle: 'No Reliable Network',
    noNetworkSub: 'Unable to connect to the internet. Verifying receipts requires an active network connection to reach official banking servers.',
    noNetworkRetry: 'Check Connection',
    noNetworkDismiss: 'Dismiss',
    noNetworkChecking: 'Checking network connection...',
    networkRestored: 'Internet connection restored!',
    networkOfflineStatus: 'Offline — No reliable internet',
  },

  am: {
    appName: 'ልክ pay',
    appSubtitle: 'የኢትዮጵያ የክፍያ ማረጋገጫ',

    // Navigation Tabs
    tabHome: 'ዋና ገጽ',
    tabHistory: 'ታሪክ',
    tabSettings: 'ቅንብሮች',

    // Home Screen
    greeting: 'ሰላም, 👋',
    verifyReceipt: 'ደረሰኝዎን ያረጋግጡ',
    safeSecureTitle: 'አስተማማኝ እና ደህንነቱ የተጠበቀ',
    safeSecureSub: 'ደረሰኞችን ከትክክለኛው የባንክ ማዕከል\nእንፈትሻለን።',
    selectBank: 'ባንክ ወይም አቅራቢ ይምረጡ',
    transactionRef: 'የግብይት መለያ ቁጥር (Reference)',
    refPlaceholder: 'የ 10 አሃዝ መለያ ያስገቡ (ለምሳሌ DJR1DSXKZH)',
    btnVerify: 'ደረሰኝ አረጋግጥ',
    orScanText: 'ወይም የደረሰኝ ፎቶ ቃኝ / ምረጥ',
    btnScanUpload: 'የደረሰኝ ፎቶ ቃኝ / ስቀል',

    // History Screen
    historyTitle: 'የምርመራ ታሪክ',
    searchPlaceholder: 'በመለያ ቁጥር ወይም ስም ይፈልጉ...',
    filterAll: 'ሁሉም',
    statusVerified: 'የተረጋገጠ',
    statusUnable: 'አልተረጋገጠም',
    statusPending: 'በመጠባበቅ ላይ',
    emptyHistory: 'እስካሁን ምንም የተረጋገጠ ደረሰኝ የለም',
    emptyHistorySub: 'የተረጋገጡ ደረሰኞች እዚህ ይዘረዘራሉ',

    // Verify Result Screen
    navResultTitle: 'የማረጋገጫ ውጤት',
    resVerified: 'ተረጋግጧል',
    resVerifiedMismatch: 'ተረጋግጧል ግን ስሙ ተመሳሳይ አይደለም',
    resUnable: 'ማረጋገጥ አልተቻለም',
    resSuccessSub: 'ይህ ግብይት ከትክክለኛው ምንጭ\nተረጋግጧል።',
    resMismatchSub: 'ግብይቱ በትክክል ተገኝቷል፤ ነገር ግን የተቀባዩ ስም ካስቀመጡት ደንብ ጋር አይዛመድም።',
    resFailSub: 'ደረሰኙን ማንበብ አልተቻለም።\nእባክዎ እንደገና ይሞክሩ።',
    labelTransferMoney: 'የተላለፈ ገንዘብ',
    labelReference: 'የግብይት መለያ',
    labelStatus: 'ሁኔታ',
    labelSuccessful: 'የተሳካ',
    labelUnknown: 'ያልታወቀ',
    labelPayerName: 'ከፋይ ስም',
    labelTransactionTo: 'ተቀባይ',
    labelReceiverAccount: 'የተቀባይ ሂሳብ',
    labelTime: 'የተከናወነበት ሰዓት',
    officialVerified: 'ኦፊሴላዊ ደረሰኝ ተረጋግጧል',
    officialResponse: 'የባንክ ማዕከል ምላሽ',
    labelScannedReceipt: 'የተቃኘው ደረሰኝ ምስል',
    labelTapToZoom: 'ሙሉውን ለማየት ይንኩ',
    btnViewDetails: 'ሙሉ ዝርዝር ይመልከቱ',
    btnTryAgain: 'እንደገና ሞክር',

    // Receipt Details Screen
    navDetailsTitle: 'የደረሰኝ ዝርዝር',
    headingTxInfo: 'የግብይት መረጃ',
    labelServiceFee: 'የአገልግሎት ክፍያ',
    labelTotalPaid: 'ጠቅላላ የተከፈለ',
    labelCurrency: 'የገንዘብ አይነት',
    btnShareReceipt: 'ደረሰኝ አጋራ',

    // Scan Upload Screen
    navScanTitle: 'ደረሰኝ ቃኝ / ስቀል',
    addReceiptTitle: 'የደረሰኝ ምስል ያስገቡ',
    addReceiptSub: 'የደረሰኝዎን ግልጽ ፎቶ ያንሱ ወይም\nከስልክዎ ጋለሪ ይምረጡ።',
    btnTakePhoto: 'ፎቶ አንሳ',
    btnChooseGallery: 'ከጋለሪ ምረጥ',
    supportedFormats: 'የተፈቀዱ ፋይሎች፡ JPG, PNG',
    clarityNote: 'ደረሰኙ ግልጽ እና ሙሉ መሆኑን ያረጋግጡ።',
    analyzingText: 'ደረሰኙን በመመርመር ላይ...',

    // Settings Screen
    settings: 'ቅንብሮች',
    customRules: 'ብጁ የማረጋገጫ ደንቦች',
    customRulesSub: 'ለደህንነት ሲባል ተቀባዩን ስም ወይም ሂሳብ ይወስኑ።',
    cbeReceiverRule: 'የንግድ ባንክ ተቀባይ ስም',
    cbeReceiverHint: 'ለምሳሌ፡ አበበ ከበደ',
    cbeLegacyDigits: 'የንግድ ባንክ ተቀባይ ሂሳብ (የመጨረሻዎቹ 8 አሃዞች)',
    cbeLegacyHint: 'ለምሳሌ፡ 100012340393',
    telebirrReceiverRule: 'የቴሌብር ተቀባይ ስም',
    telebirrReceiverHint: 'ለምሳሌ፡ ዘመንሳ በኃይሉ',
    enforceMatch: 'የተቀባይ ስም ተዛምዶን አስገድድ',
    enforceMatchSub: 'ደረሰኙ ላይ ያለው ስም ከደንቡ ካልተዛመደ ያሳውቁኝ።',
    appearance: 'ገጽታ እና ማሳያ',
    theme: 'ገጽታ (Theme)',
    language: 'ቋንቋ',
    saveRules: 'ቅንብሮችን አስቀምጥ',
    savedSuccess: 'ደንቦች እና ቅንብሮች በተሳካ ሁኔታ ተቀምጠዋል!',

    // Onboarding Strings
    onboardingSkip: 'ዝለል',
    onboardingNext: 'ቀጥል',
    onboardingGetStarted: 'አሁን ጀምር',
    onboardingAlreadyHaveAccount: 'ቀደም ሲል አዋቅረዋል? ወደ ዋና ገጽ',
    onboardingHeadline: 'ሀሰተኛ ደረሰኞችን በሰከንዶች ውስጥ ያስቁሙ',
    onboardingSubtitle: 'የንግድ ባንክ፣ ቴሌብር፣ አዋሽ፣ አቢሲኒያ እና ዳሽን ደረሰኞችን በቀጥታ ያረጋግጡ።',
    onboardingPrivacyNote: 'በስልክዎ ብቻ የሚሰራ · ምንም መመዝገብ አያስፈልግም',
    onboardingSlide1Title: 'ቅጽበታዊ የደረሰኝ ማረጋገጫ',
    onboardingSlide1Sub: 'የንግድ ባንክ፣ ቴሌብር፣ አዋሽ፣ አቢሲኒያ እና ዳሽን ደረሰኞችን በካሜራ ወይም በመለያ ቁጥር በሰከንዶች ውስጥ ያረጋግጡ።',
    onboardingSlide2Title: 'ቀጥታ ከባንክ ማዕከላት',
    onboardingSlide2Sub: 'ከኢትዮጵያ የባንክ ሰርቨሮች ጋር በቀጥታ በመገናኘት የተሰሩ ሀሰተኛ እና የተጭበረበሩ የክፍያ ስክሪንሾቶችን ያጋልጣል።',
    onboardingSlide3Title: 'የንግድ ደህንነት መጠበቂያ',
    onboardingSlide3Sub: 'የተቀባይ ስም እና የሂሳብ ቁጥር ትክክለኛ መሆኑን በማረጋገጥ ያልተፈቀዱ የገንዘብ ማስተላለፎችን ያስወግዱ።',

    // Profile & Settings Redesign Strings
    profileTitle: 'መገለጫ እና ቅንብሮች',
    profileSubtitle: 'የነጋዴ ማንነት፣ የማረጋገጫ ደንቦች እና የመተግበሪያ ቅንብሮች',
    profileMerchantBadge: 'የነጋዴ ሁነታ',
    profileTotalVerified: 'ምርመራዎች',
    profileSuccessRate: 'የስኬት ምጣኔ',
    profileSupportedBanks: 'የባንክ ማዕከላት',
    profileSectionRules: 'የተቀባይ ደህንነት ደንቦች',
    profileSectionAppearance: 'ገጽታ እና ቋንቋ',
    profileSectionData: 'መረጃ እና ዳታቤዝ',
    profileClearHistory: 'የምርመራ ታሪክን አጽዳ',
    profileClearConfirmTitle: 'የምርመራ ታሪክ ይጥፋ?',
    profileClearConfirmSub: 'ሁሉም የተቀመጡ ደረሰኞች እና የምርመራ ታሪክ በቋሚነት ይሰረዛሉ።',
    profileClearSuccess: 'የምርመራ ታሪክ በተሳካ ሁኔታ ተጠርጓል።',
    profileReplayTour: 'የመተግበሪያውን ጉብኝት እንደገና እይ',
    profileReplayTourSub: 'መመሪያዎችን እና ገጽታዎችን እንደገና ይጎብኙ።',
    profileAboutTitle: 'ስለ ልክ pay',
    profileEngineLabel: 'ቴክኖሎጂ',
    profileEngineVal: 'ቀጥታ የኢትዮጵያ ባንኮች ማረጋገጫ ሞተር',
    profileStorageLabel: 'ዳታቤዝ',
    profileStorageVal: 'በስልክዎ የተመሰጠረ SQLite',
    profileVersionLabel: 'ስሪት',

    // No Network / Connectivity
    noNetworkTitle: 'አስተማማኝ ኔትወርክ የለም',
    noNetworkSub: 'ከኢንተርኔት ጋር መገናኘት አልተቻለም። ደረሰኞችን ለማረጋገጥ ከባንክ ማዕከላት ጋር የሚያገናኝ አስተማማኝ ኔትወርክ ያስፈልጋል።',
    noNetworkRetry: 'ግንኙነቱን ፈትሽ',
    noNetworkDismiss: 'ዝጋ',
    noNetworkChecking: 'የኔትወርክ ግንኙነት በመፈተሽ ላይ...',
    networkRestored: 'የኢንተርኔት ግንኙነት ተመልሷል!',
    networkOfflineStatus: 'ከመስመር ውጭ — ኢንተርኔት የለም',
  },

  om: {
    appName: 'ልክ pay',
    appSubtitle: 'Mirkaneessa Kaffaltii Itoophiyaa',

    // Navigation Tabs
    tabHome: 'Fuula Duraa',
    tabHistory: 'Seenaa',
    tabSettings: 'Sajollee',

    // Home Screen
    greeting: 'Akkam, 👋',
    verifyReceipt: 'Nagahee kee mirkaneessi',
    safeSecureTitle: 'Amansiisaa fi Nageenya Qabeessa',
    safeSecureSub: 'Maddi odeeffannoo keenya madda\nbaankii isa sirriidha.',
    selectBank: 'Baankii ykn Dhiyeessaa Filadhu',
    transactionRef: 'Lakkoofsa Nagahee (Reference)',
    refPlaceholder: 'Lakkoofsa dijitii 10 galchi (fkn DJR1DSXKZH)',
    btnVerify: 'Nagahee Mirkaneessi',
    orScanText: 'ykn suuraa nagahee skaan godhi',
    btnScanUpload: 'Suuraa Nagahee Skaan / Olkaawi',

    // History Screen
    historyTitle: 'Seenaa Mirkaneessaa',
    searchPlaceholder: 'Lakkoofsaan ykn maqaan barbaadi...',
    filterAll: 'Hunda',
    statusVerified: 'Mirkanaa\'e',
    statusUnable: 'Hin Mirkannoofne',
    statusPending: 'Eeggannoo Irra',
    emptyHistory: 'Seenaan nagahee mirkanaa\'e hin jiru',
    emptyHistorySub: 'Nagaheen mirkanaa\'e asitti mul\'ata',

    // Verify Result Screen
    navResultTitle: 'Bu\'aa Mirkaneessaa',
    resVerified: 'Mirkanaa\'eera',
    resVerifiedMismatch: 'Mirkanaa\'e garuu maqaan wal hin simne',
    resUnable: 'Mirkaneessuun hin danda\'amne',
    resSuccessSub: 'Daldalli kun madda seera qabeessaa\nirraa mirkanaa\'eera.',
    resMismatchSub: 'Daldalli kun sirriitti argameera, garuu maqaan simataa seera kee wajjin wal hin simu.',
    resFailSub: 'Nagaheen dubbifamuu hin dandeenye.\nMee irra deebi\'ii yaali.',
    labelTransferMoney: 'Maallaqa Dabarfe',
    labelReference: 'Lakkoofsa Daldalaa',
    labelStatus: 'Haala',
    labelSuccessful: 'Milkaa\'eera',
    labelUnknown: 'Hin beekamu',
    labelPayerName: 'Maqaa Kaffalaa',
    labelTransactionTo: 'Gara',
    labelReceiverAccount: 'Herrega Simataa',
    labelTime: 'Yeroo Daldalaa',
    officialVerified: 'Nagaheen seera qabeessi mirkanaa\'e',
    officialResponse: 'Deebii madda baankii',
    labelScannedReceipt: 'Suuraa Nagahee Skaan Ta\'e',
    labelTapToZoom: 'Guutummaatti arguuf tuqi',
    btnViewDetails: 'Bal\'ina Ilaali',
    btnTryAgain: 'Irra Deebi\'ii Yaali',

    // Receipt Details Screen
    navDetailsTitle: 'Bal\'ina Nagahee',
    headingTxInfo: 'Odeeffannoo Daldalaa',
    labelServiceFee: 'Kaffaltii Tajaajilaa',
    labelTotalPaid: 'Ida\'ama Kaffalame',
    labelCurrency: 'Gosa Maallaqaa',
    btnShareReceipt: 'Nagahee Qoodi',

    // Scan Upload Screen
    navScanTitle: 'Nagahee Skaan / Olkaawi',
    addReceiptTitle: 'Suuraa Nagahee Galchi',
    addReceiptSub: 'Suuraa nagahee ifa ta\'e kaasi ykn\ngaalarii bilbila kee irraa filadhu.',
    btnTakePhoto: 'Suuraa Kaasi',
    btnChooseGallery: 'Gaalarii Irraa Filadhu',
    supportedFormats: 'Gosa fayilootaa: JPG, PNG',
    clarityNote: 'Nagaheen ifa fi guutuu ta\'uu mirkaneessi.',
    analyzingText: 'Nagaheen sakatta\'amaa jira...',

    // Settings Screen
    settings: 'Sajollee',
    customRules: 'Seera Mirkaneessaa',
    customRulesSub: 'Nageenyaaf maqaa fi lakkoofsa herrega simataa murteessi.',
    cbeReceiverRule: 'Maqaa Simataa Baankii Daldala Itiyoophiyaa',
    cbeReceiverHint: 'fkn: Abbabaa Kabbadaa',
    cbeLegacyDigits: 'Lakkoofsa Herrega Simataa (Digitiiwwan 8)',
    cbeLegacyHint: 'fkn: 100012340393',
    telebirrReceiverRule: 'Maqaa Simataa Telebirr',
    telebirrReceiverHint: 'fkn: Zamanisaa Baahiluu',
    enforceMatch: 'Wal-gituu Maqaa Simataa Dirqisiisi',
    enforceMatchSub: 'Maqaan nagahee irraa yoo wal hin simne akeekkachiisi.',
    appearance: 'Bifa fi Agarsiisa',
    theme: 'Bifa (Theme)',
    language: 'Afaan',
    saveRules: 'Sajollee fi Seera Olkaawi',
    savedSuccess: 'Seerri fi sajolleen milkaa\'inaan olkaawameera!',

    // Onboarding Strings
    onboardingSkip: 'Utali',
    onboardingNext: 'Itti Fufi',
    onboardingGetStarted: 'Amma Jalqabi',
    onboardingAlreadyHaveAccount: 'Kanaan dura qophoofteetta? Gara Fuula Duraatti',
    onboardingHeadline: 'Nagaheewwan Sobaa Daqiiqaa Muraasa Keessatti Dhaabaa',
    onboardingSubtitle: 'Nagahee CBE, Telebirr, Awash, BOA fi Dashen kallattiin mirkaneessi.',
    onboardingPrivacyNote: 'Herrega Malee Hojjeta · Qunnamtii Cufamaa',
    onboardingSlide1Title: 'Nagahee Yeroo Osoo Hin Fudhatin Mirkaneessi',
    onboardingSlide1Sub: 'Nagahee CBE, Telebirr, Awash, BOA fi Dashen kaameeraadhaan ykn koodiidhaan daqiiqaa muraasa keessatti sakatta\'i.',
    onboardingSlide2Title: 'Qunnamtii Kallattii Baankotaa',
    onboardingSlide2Sub: 'Sirna baankota Itoophiyaa waliin kallattiin qunnamuudhaan nagaheewwan sobaa fi jijjiiraman saaxila.',
    onboardingSlide3Title: 'Nageenya Daldala Kee Eegi',
    onboardingSlide3Sub: 'Maqaa simataa fi lakkoofsa herregaa qindeessuudhaan kaffaltii dogoggoraa fi sobaa ofirraa ittisi.',

    // Profile & Settings Redesign Strings
    profileTitle: 'Piroofaayilii fi Sajollee',
    profileSubtitle: 'Eenyummaa daldalaa, seera mirkaneessaa fi sajollee',
    profileMerchantBadge: 'Haala Daldalaa',
    profileTotalVerified: 'Sakatta\'a Waliigalaa',
    profileSuccessRate: 'Reeshoo Milkaa\'inaa',
    profileSupportedBanks: 'Madda Baankii',
    profileSectionRules: 'Seera Nageenya Simataa',
    profileSectionAppearance: 'Bifa fi Afaan',
    profileSectionData: 'Daataa fi Kuusaa',
    profileClearHistory: 'Seenaa Mirkaneessaa Haqii',
    profileClearConfirmTitle: 'Seenaa Mirkaneessaa Haquu?',
    profileClearConfirmSub: 'Nagaheen kuufamee fi seenaan hundi guutummaatti ni haqama.',
    profileClearSuccess: 'Seenaan milkaa\'inaan haqameera.',
    profileReplayTour: 'Turtii Baga Dhuftanii Irra Deebi\'i',
    profileReplayTourSub: 'Qajeelfamoota fi bifa fayyadamaa irra deebi\'ii ilaali.',
    profileAboutTitle: 'Waa\'ee LikPay',
    profileEngineLabel: 'Mootora',
    profileEngineVal: 'Mirkaneessa Kallattii Baankota Itoophiyaa',
    profileStorageLabel: 'Kuusaa Daataa',
    profileStorageVal: 'SQLite Cufamaa Bilbila Kee Irraa',
    profileVersionLabel: 'Gosa Appilikeeshinii',

    // No Network / Connectivity
    noNetworkTitle: 'Netwoorkii Amansiisaan Hin Jiru',
    noNetworkSub: 'Qunnamtii intarneetii argachuu hin dandeenye. Nagahee baankii mirkaneessuuf netwoorkii amansiisaan barbaachisaadha.',
    noNetworkRetry: 'Qunnamtii Sakatta\'i',
    noNetworkDismiss: 'Cufi',
    noNetworkChecking: 'Qunnamtii sakatta\'aa jira...',
    networkRestored: 'Qunnamtiin intarneetii deebi\'eera!',
    networkOfflineStatus: 'Toora Irraa Ala — Intarneetiin Hin Jiru',
  },
};
