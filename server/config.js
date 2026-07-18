module.exports = {
  sync: {
    enabled: true,
    runAtHour: 10,
    runAtMinute: 30,
    lookbackDays: 1
  },
  sources: {
    wechat_merchant: {
      enabled: true
    },
    alipay_business: {
      enabled: false
    },
    bank_template: {
      enabled: false
    }
  }
};
