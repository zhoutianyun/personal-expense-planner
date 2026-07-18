const { db } = require("../db");
const { isDuplicate } = require("./dedupe-service");

const insertBillStmt = db.prepare(`
  INSERT INTO bills (
    user_id, type, amount, category, bill_date, note, created_at, import_fingerprint,
    source_type, source_account_id, external_bill_no, counterparty, raw_trade_time, sync_job_id
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function importStatementRecords(records, context) {
  let insertedCount = 0;
  let skippedCount = 0;

  for (const record of records) {
    if (isDuplicate({
      userId: context.userId,
      sourceType: record.sourceType,
      externalBillNo: record.externalBillNo,
      normalizedFingerprint: record.normalizedFingerprint
    })) {
      skippedCount += 1;
      continue;
    }

    insertBillStmt.run(
      context.userId,
      record.type,
      record.amount,
      record.category,
      record.tradeTime,
      record.note || "",
      new Date().toISOString(),
      record.normalizedFingerprint,
      record.sourceType,
      context.syncAccountId,
      record.externalBillNo || "",
      record.counterparty || "",
      record.tradeTime,
      context.syncJobId
    );
    insertedCount += 1;
  }

  return {
    insertedCount,
    skippedCount
  };
}

module.exports = {
  importStatementRecords
};
