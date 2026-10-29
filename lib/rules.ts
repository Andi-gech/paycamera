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
  },
};
