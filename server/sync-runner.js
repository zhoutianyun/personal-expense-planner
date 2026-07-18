const { listActiveSyncAccounts, createSyncJob, finishSyncJob } = require("./services/sync-job-service");
const { saveRawStatement } = require("./services/raw-statement-service");
const { createStatementRecord } = require("./services/statement-record-service");
const { createSyncError } = require("./services/sync-error-service");
const { importStatementRecords } = require("./services/bill-import-service");
const { normalizeRecord } = require("./parsers/normalize-record");
const { parseWechatXlsxContent } = require("./parsers/parse-wechat-xlsx");
const { pullWechatMerchantStatement } = require("./connectors/wechat-merchant");

function getConnectorByType(sourceType) {
  if (sourceType === "wechat_merchant") {
    return pullWechatMerchantStatement;
  }
  return null;
}

function getParserByType(sourceType) {
  if (sourceType === "wechat_merchant") {
    return parseWechatXlsxContent;
  }
  return function () { return []; };
}

async function runSingleSyncAccount(account, options) {
  const job = createSyncJob(account.id, {
    jobType: options && options.jobType || "manual_pull",
    dateFrom: options && options.dateFrom || null,
    dateTo: options && options.dateTo || null
  });

  try {
    const pullStatement = getConnectorByType(account.source_type);
    if (!pullStatement) {
      throw new Error("Unsupported source type: " + account.source_type);
    }
    const rawStatement = await pullStatement({
      accountId: account.id,
      statementDate: options && options.dateTo || new Date().toISOString().slice(0, 10)
    });

    saveRawStatement({
      syncJobId: job.id,
      syncAccountId: account.id,
      sourceType: rawStatement.sourceType,
      statementDate: rawStatement.statementDate,
      fileName: rawStatement.fileName,
      contentType: rawStatement.contentType,
      rawContent: rawStatement.rawContent
    });

    const parser = getParserByType(account.source_type);
    const rawRecords = parser(rawStatement.rawContent);
    const normalizedRecords = rawRecords.map(function (record) {
      const normalized = normalizeRecord(record, {
        userId: account.user_id,
        sourceType: account.source_type,
        tradeTime: record.tradeTime || rawStatement.statementDate
      });
      createStatementRecord({
        syncJobId: job.id,
        syncAccountId: account.id,
        userId: account.user_id,
        sourceType: normalized.sourceType,
        externalBillNo: normalized.externalBillNo,
        tradeTime: normalized.tradeTime,
        type: normalized.type,
        amount: normalized.amount,
        category: normalized.category,
        counterparty: normalized.counterparty,
        note: normalized.note,
        rawFingerprint: normalized.normalizedFingerprint,
        normalizedFingerprint: normalized.normalizedFingerprint,
        importStatus: "pending"
      });
      return normalized;
    });

    const importResult = importStatementRecords(normalizedRecords, {
      userId: account.user_id,
      syncAccountId: account.id,
      syncJobId: job.id
    });

    finishSyncJob(job.id, {
      status: "success",
      pulledCount: normalizedRecords.length,
      insertedCount: importResult.insertedCount,
      skippedCount: importResult.skippedCount,
      errorMessage: ""
    });

    return {
      accountId: account.id,
      jobId: job.id,
      status: "success",
      pulledCount: normalizedRecords.length,
      insertedCount: importResult.insertedCount,
      skippedCount: importResult.skippedCount
    };
  } catch (error) {
    createSyncError({
      syncJobId: job.id,
      syncAccountId: account.id,
      userId: account.user_id,
      stage: "run",
      errorMessage: error.message,
      errorDetail: String(error && error.stack || "")
    });

    finishSyncJob(job.id, {
      status: "failed",
      pulledCount: 0,
      insertedCount: 0,
      skippedCount: 0,
      errorMessage: error.message
    });

    throw error;
  }
}

async function runAllSyncAccounts() {
  const accounts = listActiveSyncAccounts();
  const results = [];

  for (const account of accounts) {
    results.push(await runSingleSyncAccount(account, { jobType: "scheduled_pull" }));
  }

  return results;
}

module.exports = {
  runAllSyncAccounts,
  runSingleSyncAccount
};
