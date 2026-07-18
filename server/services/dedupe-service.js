const { db } = require("../db");

const findBillBySourceBillStmt = db.prepare(`
  SELECT id
  FROM bills
  WHERE source_type = ? AND external_bill_no = ?
  LIMIT 1
`);

const findBillByFingerprintStmt = db.prepare(`
  SELECT id
  FROM bills
  WHERE user_id = ? AND import_fingerprint = ?
  LIMIT 1
`);

function isDuplicate(input) {
  if (input.sourceType && input.externalBillNo) {
    const sourceMatched = findBillBySourceBillStmt.get(input.sourceType, input.externalBillNo);
    if (sourceMatched) return true;
  }

  if (input.userId && input.normalizedFingerprint) {
    const fingerprintMatched = findBillByFingerprintStmt.get(input.userId, input.normalizedFingerprint);
    if (fingerprintMatched) return true;
  }

  return false;
}

module.exports = {
  isDuplicate
};
