const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const DB_DIR = process.env.DB_DIR || path.join(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "expense-planner.db");

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

function safeAlter(sql) {
  try {
    db.exec(sql);
  } catch (error) {
    const message = String(error && error.message || "");
    if (!message.includes("duplicate column name") && !message.includes("no such table")) {
      throw error;
    }
  }
}

function initBaseSchema() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      contact TEXT,
      password_hash TEXT NOT NULL,
      auth_token TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      category TEXT NOT NULL,
      bill_date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      import_fingerprint TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      daily_budget REAL DEFAULT 0,
      monthly_budget REAL DEFAULT 0,
      yearly_budget REAL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS saving_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      target_amount REAL NOT NULL,
      target_days INTEGER NOT NULL,
      daily_save REAL NOT NULL,
      monthly_save REAL NOT NULL,
      yearly_save REAL NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      error_reason TEXT NOT NULL,
      error_time TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_user_fingerprint
    ON bills(user_id, import_fingerprint)
    WHERE import_fingerprint IS NOT NULL AND import_fingerprint <> '';
  `);
}

function initSyncSchema() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS sync_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      account_name TEXT NOT NULL,
      app_id TEXT,
      merchant_id TEXT,
      api_base_url TEXT,
      credential_json TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_sync_time TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_account_id INTEGER NOT NULL,
      job_type TEXT NOT NULL,
      date_from TEXT,
      date_to TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      pulled_count INTEGER NOT NULL DEFAULT 0,
      inserted_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS raw_statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_job_id INTEGER NOT NULL,
      sync_account_id INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      statement_date TEXT,
      file_name TEXT,
      content_type TEXT,
      raw_content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS statement_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_job_id INTEGER NOT NULL,
      sync_account_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      external_bill_no TEXT,
      trade_time TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      counterparty TEXT,
      note TEXT,
      raw_fingerprint TEXT,
      normalized_fingerprint TEXT NOT NULL,
      import_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_job_id INTEGER,
      sync_account_id INTEGER,
      user_id INTEGER,
      stage TEXT NOT NULL,
      error_message TEXT NOT NULL,
      error_detail TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sync_accounts_user
    ON sync_accounts(user_id);

    CREATE INDEX IF NOT EXISTS idx_sync_accounts_status
    ON sync_accounts(status);

    CREATE INDEX IF NOT EXISTS idx_sync_jobs_account
    ON sync_jobs(sync_account_id);

    CREATE INDEX IF NOT EXISTS idx_sync_jobs_status
    ON sync_jobs(status);

    CREATE INDEX IF NOT EXISTS idx_raw_statements_job
    ON raw_statements(sync_job_id);

    CREATE INDEX IF NOT EXISTS idx_statement_records_job
    ON statement_records(sync_job_id);

    CREATE INDEX IF NOT EXISTS idx_statement_records_user
    ON statement_records(user_id);

    CREATE INDEX IF NOT EXISTS idx_statement_records_trade_time
    ON statement_records(trade_time);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_statement_records_source_bill_no
    ON statement_records(source_type, external_bill_no)
    WHERE external_bill_no IS NOT NULL AND external_bill_no <> '';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_statement_records_norm_fp
    ON statement_records(user_id, normalized_fingerprint);

    CREATE INDEX IF NOT EXISTS idx_sync_errors_job
    ON sync_errors(sync_job_id);
  `);

  safeAlter(`ALTER TABLE bills ADD COLUMN source_type TEXT`);
  safeAlter(`ALTER TABLE bills ADD COLUMN source_account_id INTEGER`);
  safeAlter(`ALTER TABLE bills ADD COLUMN external_bill_no TEXT`);
  safeAlter(`ALTER TABLE bills ADD COLUMN counterparty TEXT`);
  safeAlter(`ALTER TABLE bills ADD COLUMN raw_trade_time TEXT`);
  safeAlter(`ALTER TABLE bills ADD COLUMN sync_job_id INTEGER`);

  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bills_source_account
      ON bills(source_account_id);

      CREATE INDEX IF NOT EXISTS idx_bills_sync_job
      ON bills(sync_job_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_source_bill_no
      ON bills(source_type, external_bill_no)
      WHERE external_bill_no IS NOT NULL AND external_bill_no <> '';
    `);
  } catch (error) {
    if (!String(error && error.message || "").includes("no such table")) {
      throw error;
    }
  }
}

initBaseSchema();
initSyncSchema();

module.exports = {
  db,
  DB_PATH,
  initSyncSchema
};
