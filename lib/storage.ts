// lib/storage.ts — SQLite helpers for verification history & settings
import * as SQLite from 'expo-sqlite';
import type { VerificationRecord, VerificationStatus, BankId } from './types';

let dbInstance: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('cheki_app.db');
    await dbInstance.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        bank TEXT NOT NULL,
        bankName TEXT NOT NULL,
        reference TEXT NOT NULL,
        amount TEXT,
        currency TEXT NOT NULL DEFAULT 'ETB',
        status TEXT NOT NULL,
        senderName TEXT,
        receiverName TEXT,
        receiverAccount TEXT,
        transactionTime TEXT,
        receiptUrl TEXT,
        errorMessage TEXT,
        isLegacy INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        imageUri TEXT
      );
    `);
    try {
      await dbInstance.execAsync('ALTER TABLE history ADD COLUMN imageUri TEXT;');
    } catch {
      // Column already exists in schema
    }
  }
  return dbInstance;
}

// ── Settings ──────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [key]
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, value]
    );
  } catch (err) {
    console.error('Failed to store setting:', err);
  }
}

export async function getOnboardingComplete(): Promise<boolean> {
  const val = await getSetting('onboarding_complete');
  return val === '1';
}

export async function setOnboardingComplete(): Promise<void> {
  await setSetting('onboarding_complete', '1');
}

export async function getStoredReceiverAccount(): Promise<string> {
  return (await getSetting('cbe_receiver_account')) || '';
}

export async function setStoredReceiverAccount(account: string): Promise<void> {
  await setSetting('cbe_receiver_account', account);
}

// ── Custom Rules ──────────────────────────────────────────
export async function getCustomRules(): Promise<import('./rules').VerificationRules> {
  const json = await getSetting('custom_verification_rules');
  if (!json) {
    const { DEFAULT_RULES } = await import('./rules');
    // If receiver account was set in legacy storage, include it
    const legacyAcc = await getStoredReceiverAccount();
    return { ...DEFAULT_RULES, cbeLegacyReceiverDigits: legacyAcc };
  }
  try {
    return JSON.parse(json);
  } catch {
    const { DEFAULT_RULES } = await import('./rules');
    return DEFAULT_RULES;
  }
}

export async function saveCustomRules(rules: import('./rules').VerificationRules): Promise<void> {
  await setSetting('custom_verification_rules', JSON.stringify(rules));
  if (rules.cbeLegacyReceiverDigits) {
    await setStoredReceiverAccount(rules.cbeLegacyReceiverDigits);
  }
}

// ── History ───────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function saveVerification(
  record: Omit<VerificationRecord, 'id' | 'createdAt'>
): Promise<VerificationRecord> {
  const db = await getDb();
  const id = generateId();
  const createdAt = new Date().toISOString();
  const full: VerificationRecord = { ...record, id, createdAt };

  await db.runAsync(
    `INSERT INTO history
       (id, bank, bankName, reference, amount, currency, status,
        senderName, receiverName, receiverAccount, transactionTime,
        receiptUrl, errorMessage, isLegacy, createdAt, imageUri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      full.id,
      full.bank,
      full.bankName,
      full.reference,
      full.amount ?? null,
      full.currency,
      full.status,
      full.senderName ?? null,
      full.receiverName ?? null,
      full.receiverAccount ?? null,
      full.transactionTime ?? null,
      full.receiptUrl ?? null,
      full.errorMessage ?? null,
      full.isLegacy ? 1 : 0,
      full.createdAt,
      full.imageUri ?? null,
    ]
  );

  return full;
}

export async function getHistory(
  filter?: BankId | 'all',
  search?: string
): Promise<VerificationRecord[]> {
  const db = await getDb();
  let sql = 'SELECT * FROM history';
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  if (filter && filter !== 'all') {
    conditions.push('bank = ?');
    params.push(filter);
  }
  if (search && search.trim()) {
    conditions.push('(reference LIKE ? OR bankName LIKE ? OR receiverName LIKE ? OR senderName LIKE ?)');
    const like = `%${search.trim()}%`;
    params.push(like, like, like, like);
  }

  if (conditions.length) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY createdAt DESC';

  const rows = await db.getAllAsync<{
    id: string;
    bank: string;
    bankName: string;
    reference: string;
    amount: string | null;
    currency: string;
    status: string;
    senderName: string | null;
    receiverName: string | null;
    receiverAccount: string | null;
    transactionTime: string | null;
    receiptUrl: string | null;
    errorMessage: string | null;
    isLegacy: number;
    createdAt: string;
    imageUri: string | null;
  }>(sql, params);

  return rows.map((r) => ({
    ...r,
    bank: r.bank as BankId,
    status: r.status as VerificationStatus,
    isLegacy: r.isLegacy === 1,
    imageUri: r.imageUri ?? null,
  }));
}

export async function getVerificationById(
  id: string
): Promise<VerificationRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: string;
    bank: string;
    bankName: string;
    reference: string;
    amount: string | null;
    currency: string;
    status: string;
    senderName: string | null;
    receiverName: string | null;
    receiverAccount: string | null;
    transactionTime: string | null;
    receiptUrl: string | null;
    errorMessage: string | null;
    isLegacy: number;
    createdAt: string;
    imageUri: string | null;
  }>('SELECT * FROM history WHERE id = ?', [id]);

  if (!row) return null;
  return {
    ...row,
    bank: row.bank as BankId,
    status: row.status as VerificationStatus,
    isLegacy: row.isLegacy === 1,
    imageUri: row.imageUri ?? null,
  };
}

