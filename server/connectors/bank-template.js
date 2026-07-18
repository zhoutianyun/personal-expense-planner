async function pullBankStatement(options) {
  return {
    sourceType: "bank_template",
    accountId: options.accountId,
    statementDate: options.statementDate || null,
    fileName: "mock-bank-statement.json",
    contentType: "application/json",
    rawContent: JSON.stringify({ records: [] })
  };
}

module.exports = {
  pullBankStatement
};
