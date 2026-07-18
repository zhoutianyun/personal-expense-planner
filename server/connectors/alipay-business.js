async function pullAlipayBusinessStatement(options) {
  return {
    sourceType: "alipay_business",
    accountId: options.accountId,
    statementDate: options.statementDate || null,
    fileName: "mock-alipay-statement.json",
    contentType: "application/json",
    rawContent: JSON.stringify({ records: [] })
  };
}

module.exports = {
  pullAlipayBusinessStatement
};
