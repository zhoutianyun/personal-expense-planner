const { createSyncAccount, listSyncAccountsByUser, getSyncAccountById } = require("../services/sync-account-service");
const { listSyncJobsByUser, getSyncJobById } = require("../services/sync-job-service");
const { listRawStatementsByJob } = require("../services/raw-statement-service");
const { listStatementRecordsByJob } = require("../services/statement-record-service");
const { listSyncErrorsByUser } = require("../services/sync-error-service");
const { runSingleSyncAccount } = require("../sync-runner");

function readJson(req) {
  return new Promise(function (resolve, reject) {
    let body = "";
    req.on("data", function (chunk) {
      body += chunk;
    });
    req.on("end", function () {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function registerSyncRoutes(options) {
  const json = options.json;

  return async function handleSyncRoute(req, res, url, authUser) {
    if (!url.pathname.startsWith("/api/sync/")) {
      return false;
    }

    if (!authUser) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/sync/accounts") {
      json(res, 200, { accounts: listSyncAccountsByUser(authUser.id) });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/sync/accounts") {
      const body = await readJson(req);
      if (!body.accountName || !body.sourceType) {
        json(res, 400, { error: "accountName and sourceType are required" });
        return true;
      }
      createSyncAccount({
        userId: authUser.id,
        sourceType: body.sourceType,
        accountName: body.accountName,
        appId: body.appId || "",
        merchantId: body.merchantId || "",
        apiBaseUrl: body.apiBaseUrl || "",
        credentialJson: body.credentialJson || {},
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      json(res, 200, { ok: true });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/sync/jobs") {
      json(res, 200, { jobs: listSyncJobsByUser(authUser.id) });
      return true;
    }

    if (req.method === "GET" && /^\/api\/sync\/jobs\/\d+$/.test(url.pathname)) {
      const jobId = Number(url.pathname.split("/").pop());
      const job = getSyncJobById(jobId);
      if (!job || Number(job.user_id) !== Number(authUser.id)) {
        json(res, 404, { error: "Sync job not found" });
        return true;
      }
      json(res, 200, {
        job: job,
        rawStatements: listRawStatementsByJob(jobId),
        statementRecords: listStatementRecordsByJob(jobId)
      });
      return true;
    }

    if (req.method === "POST" && /^\/api\/sync\/accounts\/\d+\/run$/.test(url.pathname)) {
      const accountId = Number(url.pathname.split("/")[4]);
      const account = getSyncAccountById(accountId);
      if (!account || Number(account.user_id) !== Number(authUser.id)) {
        json(res, 404, { error: "Sync account not found" });
        return true;
      }
      const body = await readJson(req);
      const result = await runSingleSyncAccount(account, {
        jobType: "manual_pull",
        dateFrom: body.dateFrom || null,
        dateTo: body.dateTo || new Date().toISOString().slice(0, 10)
      });
      json(res, 200, { ok: true, result: result });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/sync/errors") {
      json(res, 200, { errors: listSyncErrorsByUser(authUser.id) });
      return true;
    }

    json(res, 404, { error: "Sync route not found" });
    return true;
  };
}

module.exports = {
  registerSyncRoutes
};
