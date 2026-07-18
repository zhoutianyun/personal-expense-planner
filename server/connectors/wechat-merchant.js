async function pullWechatMerchantStatement(options) {
  const statementDate = options.statementDate || new Date().toISOString().slice(0, 10);
  return {
    sourceType: "wechat_merchant",
    accountId: options.accountId,
    statementDate: statementDate,
    fileName: "mock-wechat-statement.json",
    contentType: "application/json",
    rawContent: JSON.stringify({
      records: [
        {
          externalBillNo: "WX-" + String(options.accountId) + "-" + statementDate + "-001",
          tradeTime: statementDate + " 09:12:00",
          type: "收入",
          amount: 88.5,
          category: "工资",
          counterparty: "模拟微信商户",
          note: "自动同步测试收入"
        },
        {
          externalBillNo: "WX-" + String(options.accountId) + "-" + statementDate + "-002",
          tradeTime: statementDate + " 18:46:00",
          type: "支出",
          amount: 23.8,
          category: "餐饮",
          counterparty: "模拟微信支付",
          note: "自动同步测试支出"
        }
      ]
    })
  };
}

module.exports = {
  pullWechatMerchantStatement
};
