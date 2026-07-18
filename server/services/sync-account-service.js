const { db } = require("../db");

const insertSyncAccountStmt = db.prepare(`
  INSERT INTO sync_accounts (
    user_id, source_type, account_name, app_id, merchant_id,
    api_base_url, credential_json, status, last_sync_time, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const selectSyncAccountsByUserStmt = db.prepare(`
  SELECT *
  FROM sync_accounts
  WHERE user_id = ?
  ORDER BY id DESC
`);

const selectSyncAccountByIdStmt = db.prepare(`
  SELECT *
  FROM sync_accounts
  WHERE id = ?
  LIMIT 1
`);

function createSyncAccount(input) {
  insertSyncAccountStmt.run(
    input.userId,
    input.sourceType,
    input.accountName,
    input.appId || "",
    input.merchantId || "",
    input.apiBaseUrl || "",
    JSON.stringify(input.credentialJson || {}),
    input.status || "active",
    input.lastSyncTime || null,
    input.createdAt,
    input.updatedAt
  );
  return { ok: true };
}

function listSyncAccountsByUser(userId) {
  return selectSyncAccountsByUserStmt.all(userId);
}

function getSyncAccountById(id) {
  return selectSyncAccountByIdStmt.get(id);
}

module.exports = {
  createSyncAccount,
  listSyncAccountsByUser,
  getSyncAccountById
};
