const { db } = require("../db");

const selectActiveSyncAccountsStmt = db.prepare(`
  SELECT *
  FROM sync_accounts
  WHERE status = 'active'
  ORDER BY id ASC
`);

const insertSyncJobStmt = db.prepare(`
  INSERT INTO sync_jobs (
    sync_account_id, job_type, date_from, date_to, status,
    pulled_count, inserted_count, skipped_count, error_message,
    started_at, finished_at, created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateSyncJobStmt = db.prepare(`
  UPDATE sync_jobs
  SET status = ?, pulled_count = ?, inserted_count = ?, skipped_count = ?,
      error_message = ?, finished_at = ?
  WHERE id = ?
`);

const selectSyncJobsStmt = db.prepare(`
  SELECT sync_jobs.*, sync_accounts.user_id, sync_accounts.account_name, sync_accounts.source_type
  FROM sync_jobs
  JOIN sync_accounts ON sync_accounts.id = sync_jobs.sync_account_id
  ORDER BY sync_jobs.id DESC
`);

const selectSyncJobsByUserStmt = db.prepare(`
  SELECT sync_jobs.*, sync_accounts.user_id, sync_accounts.account_name, sync_accounts.source_type
  FROM sync_jobs
  JOIN sync_accounts ON sync_accounts.id = sync_jobs.sync_account_id
  WHERE sync_accounts.user_id = ?
  ORDER BY sync_jobs.id DESC
`);

const selectSyncJobByIdStmt = db.prepare(`
  SELECT sync_jobs.*, sync_accounts.user_id, sync_accounts.account_name, sync_accounts.source_type
  FROM sync_jobs
  JOIN sync_accounts ON sync_accounts.id = sync_jobs.sync_account_id
  WHERE sync_jobs.id = ?
  LIMIT 1
`);

function nowIso() {
  return new Date().toISOString();
}

function listActiveSyncAccounts() {
  return selectActiveSyncAccountsStmt.all();
}

function createSyncJob(syncAccountId, input) {
  const createdAt = nowIso();
  insertSyncJobStmt.run(
    syncAccountId,
    input.jobType,
    input.dateFrom,
    input.dateTo,
    "running",
    0,
    0,
    0,
    "",
    createdAt,
    null,
    createdAt
  );
  const row = db.prepare("SELECT * FROM sync_jobs WHERE rowid = last_insert_rowid()").get();
  return row;
}

function finishSyncJob(jobId, input) {
  updateSyncJobStmt.run(
    input.status,
    input.pulledCount || 0,
    input.insertedCount || 0,
    input.skippedCount || 0,
    input.errorMessage || "",
    nowIso(),
    jobId
  );
}

function listSyncJobs() {
  return selectSyncJobsStmt.all();
}

function listSyncJobsByUser(userId) {
  return selectSyncJobsByUserStmt.all(userId);
}

function getSyncJobById(jobId) {
  return selectSyncJobByIdStmt.get(jobId);
}

module.exports = {
  listActiveSyncAccounts,
  createSyncJob,
  finishSyncJob,
  listSyncJobs,
  listSyncJobsByUser,
  getSyncJobById
};
