const { db } = require("../db");

const insertSyncErrorStmt = db.prepare(`
  INSERT INTO sync_errors (
    sync_job_id, sync_account_id, user_id, stage, error_message, error_detail, created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const selectSyncErrorsByUserStmt = db.prepare(`
  SELECT *
  FROM sync_errors
  WHERE user_id = ? OR user_id IS NULL
  ORDER BY id DESC
`);

function createSyncError(input) {
  insertSyncErrorStmt.run(
    input.syncJobId || null,
    input.syncAccountId || null,
    input.userId || null,
    input.stage,
    input.errorMessage,
    input.errorDetail || "",
    new Date().toISOString()
  );
}

function listSyncErrorsByUser(userId) {
  return selectSyncErrorsByUserStmt.all(userId);
}

module.exports = {
  createSyncError,
  listSyncErrorsByUser
};
