const { db } = require("../db");

const insertStatementRecordStmt = db.prepare(`
  INSERT INTO statement_records (
    sync_job_id, sync_account_id, user_id, source_type, external_bill_no,
    trade_time, type, amount, category, counterparty, note,
    raw_fingerprint, normalized_fingerprint, import_status, created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const selectStatementRecordsByJobStmt = db.prepare(`
  SELECT *
  FROM statement_records
  WHERE sync_job_id = ?
  ORDER BY id DESC
`);

function createStatementRecord(input) {
  insertStatementRecordStmt.run(
    input.syncJobId,
    input.syncAccountId,
    input.userId,
    input.sourceType,
    input.externalBillNo || "",
    input.tradeTime,
    input.type,
    input.amount,
    input.category,
    input.counterparty || "",
    input.note || "",
    input.rawFingerprint || "",
    input.normalizedFingerprint,
    input.importStatus || "pending",
    new Date().toISOString()
  );
}

function listStatementRecordsByJob(syncJobId) {
  return selectStatementRecordsByJobStmt.all(syncJobId);
}

module.exports = {
  createStatementRecord,
  listStatementRecordsByJob
};
