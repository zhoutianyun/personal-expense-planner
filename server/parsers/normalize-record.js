const crypto = require("node:crypto");

function normalizeRecord(record, defaults) {
  const normalized = {
    sourceType: defaults.sourceType,
    externalBillNo: String(record.externalBillNo || "").trim(),
    tradeTime: String(record.tradeTime || defaults.tradeTime || "").trim(),
    type: String(record.type || "").trim(),
    amount: Number(record.amount || 0),
    category: String(record.category || "其他").trim() || "其他",
    counterparty: String(record.counterparty || "").trim(),
    note: String(record.note || "").trim()
  };

  const fingerprintBase = [
    defaults.userId || "",
    normalized.sourceType,
    normalized.externalBillNo,
    normalized.tradeTime,
    normalized.type,
    normalized.amount.toFixed(2),
    normalized.category,
    normalized.counterparty,
    normalized.note
  ].join("|");

  normalized.normalizedFingerprint = crypto
    .createHash("sha256")
    .update(fingerprintBase)
    .digest("hex");

  return normalized;
}

module.exports = {
  normalizeRecord
};
