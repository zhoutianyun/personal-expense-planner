const crypto = require("node:crypto");
const { db } = require("../db");

const insertRawStatementStmt = db.prepare(`
  INSERT INTO raw_statements (
    sync_job_id, sync_account_id, source_type, statement_date,
    file_name, content_type, raw_content, content_hash, created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const selectRawStatementsByJobStmt = db.prepare(`
  SELECT *
  FROM raw_statements
  WHERE sync_job_id = ?
  ORDER BY id DESC
`);

function saveRawStatement(input) {
  const rawContent = String(input.rawContent || "");
  const contentHash = crypto.createHash("sha256").update(rawContent).digest("hex");
  insertRawStatementStmt.run(
    input.syncJobId,
    input.syncAccountId,
    input.sourceType,
    input.statementDate || null,
    input.fileName || "",
    input.contentType || "text/plain",
    rawContent,
    contentHash,
    new Date().toISOString()
  );
}

function listRawStatementsByJob(syncJobId) {
  return selectRawStatementsByJobStmt.all(syncJobId);
}

module.exports = {
  saveRawStatement,
  listRawStatementsByJob
};
