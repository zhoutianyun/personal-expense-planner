const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const XLSX = require("xlsx");
const { registerSyncRoutes } = require("./routes/sync-routes");
const { startScheduler } = require("./scheduler");
const { runAllSyncAccounts } = require("./sync-runner");

const PORT = Number(process.env.PORT || 3000);
const DB_DIR = process.env.DB_DIR || path.join(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "expense-planner.db");
const WEB_DIR = path.join(__dirname, "..", "wangye");
const DEFAULT_HTML_PATH = path.join(WEB_DIR, "个人消费管理与储蓄规划平台.html");

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    contact TEXT,
    password_hash TEXT NOT NULL,
    auth_token TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('收入', '支出')),
    amount REAL NOT NULL CHECK(amount > 0),
    category TEXT NOT NULL,
    bill_date TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    daily_budget REAL DEFAULT 0,
    monthly_budget REAL DEFAULT 0,
    yearly_budget REAL DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS saving_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    target_amount REAL NOT NULL,
    target_days INTEGER NOT NULL,
    daily_save REAL NOT NULL,
    monthly_save REAL NOT NULL,
    yearly_save REAL NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    error_reason TEXT NOT NULL,
    error_time TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

try {
  db.exec(`ALTER TABLE bills ADD COLUMN import_fingerprint TEXT`);
} catch (error) {
  if (!String(error && error.message || "").includes("duplicate column name")) {
    throw error;
  }
}

db.exec(`
  DELETE FROM bills
  WHERE id NOT IN (
    SELECT MIN(id)
    FROM bills
    GROUP BY user_id, bill_date, type, amount, category, IFNULL(note, '')
  );
`);

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_user_fingerprint
  ON bills(user_id, import_fingerprint)
  WHERE import_fingerprint IS NOT NULL AND import_fingerprint <> '';
`);

const insertUser = db.prepare(`
  INSERT INTO users (username, contact, password_hash, auth_token, created_at)
  VALUES (?, ?, ?, NULL, ?)
`);

const findUserByUsername = db.prepare(`
  SELECT id, username, contact, password_hash, auth_token, created_at
  FROM users
  WHERE username = ?
`);

const findUserByAccount = db.prepare(`
  SELECT id, username, contact, password_hash, auth_token, created_at
  FROM users
  WHERE username = ? OR contact = ?
  LIMIT 1
`);

const findUserByToken = db.prepare(`
  SELECT id, username, contact, auth_token, created_at
  FROM users
  WHERE auth_token = ?
`);

const updateUserToken = db.prepare(`
  UPDATE users SET auth_token = ? WHERE id = ?
`);

const clearUserToken = db.prepare(`
  UPDATE users SET auth_token = NULL WHERE id = ?
`);

const insertBill = db.prepare(`
  INSERT INTO bills (user_id, type, amount, category, bill_date, note, created_at, import_fingerprint)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const selectBillsByUser = db.prepare(`
  SELECT id, type, amount, category, bill_date, note, created_at, import_fingerprint
  FROM bills
  WHERE user_id = ?
  ORDER BY bill_date DESC, id DESC
`);

const upsertBudget = db.prepare(`
  INSERT INTO budgets (user_id, daily_budget, monthly_budget, yearly_budget, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    daily_budget = excluded.daily_budget,
    monthly_budget = excluded.monthly_budget,
    yearly_budget = excluded.yearly_budget,
    updated_at = excluded.updated_at
`);

const selectBudgetByUser = db.prepare(`
  SELECT daily_budget, monthly_budget, yearly_budget, updated_at
  FROM budgets
  WHERE user_id = ?
`);

const upsertSavingTarget = db.prepare(`
  INSERT INTO saving_targets (
    user_id, target_amount, target_days, daily_save, monthly_save, yearly_save, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    target_amount = excluded.target_amount,
    target_days = excluded.target_days,
    daily_save = excluded.daily_save,
    monthly_save = excluded.monthly_save,
    yearly_save = excluded.yearly_save,
    updated_at = excluded.updated_at
`);

const selectSavingTargetByUser = db.prepare(`
  SELECT target_amount, target_days, daily_save, monthly_save, yearly_save, updated_at
  FROM saving_targets
  WHERE user_id = ?
`);

const insertErrorLog = db.prepare(`
  INSERT INTO error_logs (user_id, error_reason, error_time, created_at)
  VALUES (?, ?, ?, ?)
`);

const selectErrorsByUser = db.prepare(`
  SELECT id, error_reason, error_time, created_at
  FROM error_logs
  WHERE user_id = ? OR user_id IS NULL
  ORDER BY id DESC
`);

function nowIso() {
  return new Date().toISOString();
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(body);
}

const handleSyncRoute = registerSyncRoutes({ json });

function notFound(res) {
  json(res, 404, { error: "接口不存在" });
}

function serveHtml(res, filePath) {
  try {
    const html = fs.readFileSync(filePath, "utf8");
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(html);
  } catch (error) {
    json(res, 500, { error: "页面读取失败", detail: error.message });
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let aborted = false;
    req.on("data", chunk => {
      if (aborted) {
        return;
      }
      raw += chunk;
      if (raw.length > 25_000_000) {
        aborted = true;
        req.destroy();
        reject(new Error("请求体过大"));
      }
    });
    req.on("end", () => {
      if (aborted) {
        return;
      }
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON 格式错误"));
      }
    });
    req.on("error", reject);
  });
}

function hashPassword(password) {
  return crypto.scryptSync(password, "expense-planner-salt", 64).toString("hex");
}

function createToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7).trim();
}

function getAuthUser(req) {
  const token = getToken(req);
  if (!token) return null;
  return findUserByToken.get(token) || null;
}

function logError(userId, reason) {
  const timestamp = nowIso();
  insertErrorLog.run(userId ?? null, reason, timestamp, timestamp);
}

function parsePositiveNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : NaN;
}

function parseBudgetNumber(value) {
  if (value === "" || value === undefined || value === null) return 0;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : NaN;
}

function parsePeriodDays(raw) {
  const value = String(raw || "").trim();
  const matched = value.match(/(\d+(?:\.\d+)?)/);
  if (!matched) return 0;
  const base = Number(matched[1]);
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (value.includes("年")) return Math.round(base * 365);
  if (value.includes("月")) return Math.round(base * 30);
  if (value.includes("天")) return Math.round(base);
  return Math.round(base);
}

function buildBillKey(bill) {
  const fingerprint = String(bill.importFingerprint || bill.import_fingerprint || "").trim();
  if (fingerprint) {
    return `fp:${fingerprint}`;
  }
  return buildBillContentKey(bill);
}

function buildBillContentKey(bill) {
  return [
    String(bill.type || "").trim(),
    Number(bill.amount || 0).toFixed(2),
    String(bill.category || "").trim(),
    String(bill.billDate || bill.bill_date || "").trim(),
    String(bill.note || "").trim()
  ].join("|");
}

function normalizeImportedType(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text === "收入" || text === "����") return "收入";
  if (text === "支出" || text === "֧��") return "支出";
  if (text.includes("收")) return "收入";
  if (text.includes("支")) return "支出";
  return "";
}

function normalizeImportedCategory(value) {
  const text = String(value || "").trim();
  if (!text) return "其他";
  const allowed = new Set(["餐饮", "交通", "购物", "工资", "学习", "娱乐", "住房", "医疗", "其他"]);
  return allowed.has(text) ? text : "其他";
}

function normalizeImportedRecord(record) {
  return {
    type: normalizeImportedType(record.type),
    amount: Number(record.amount || 0),
    category: normalizeImportedCategory(record.category),
    billDate: String(record.billDate || record.bill_date || "").trim(),
    note: String(record.note || "").trim(),
    importFingerprint: String(record.fingerprint || record.importFingerprint || record.import_fingerprint || "").trim()
  };
}

function containsAny(text, keywords) {
  return keywords.some(keyword => text.includes(keyword));
}

function inferWechatCategory(product, tradeType, note) {
  const source = [product, tradeType, note].map(item => String(item || "").trim()).join(" ");
  if (!source) return "其他";
  if (containsAny(source, ["餐", "外卖", "奶茶", "咖啡", "饮品", "小吃"])) return "餐饮";
  if (containsAny(source, ["公交", "地铁", "打车", "出行", "车费"])) return "交通";
  if (containsAny(source, ["超市", "淘宝", "京东", "商品", "购物"])) return "购物";
  if (containsAny(source, ["工资", "薪资", "报酬", "兼职"])) return "工资";
  if (containsAny(source, ["课程", "考试", "书", "学习", "校园"])) return "学习";
  if (containsAny(source, ["视频", "会员", "游戏", "娱乐"])) return "娱乐";
  if (containsAny(source, ["房租", "住宿", "电费", "水费", "住房"])) return "住房";
  if (containsAny(source, ["医院", "药", "医疗", "诊所"])) return "医疗";
  return "其他";
}

function inferWechatType(inOut, tradeType) {
  const source = `${String(inOut || "").trim()} ${String(tradeType || "").trim()}`;
  if (containsAny(source, ["收入", "收款", "退款到账", "转入", "二维码收款"])) return "收入";
  if (containsAny(source, ["支出", "付款", "支付", "转账", "商户消费", "充值"])) return "支出";
  return "";
}

function normalizeWechatDate(value) {
  return String(value || "").trim().replace(/\//g, "-").replace(/\s+/g, " ");
}

function buildWechatFingerprint(parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function parseWechatXlsxBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  if (!rows.length) return [];

  let headerIndex = -1;
  let headerMap = {};
  for (let i = 0; i < rows.length; i += 1) {
    const values = rows[i].map(cell => String(cell || "").trim());
    if (values.some(value => value.includes("交易时间")) && values.some(value => value.includes("金额"))) {
      headerIndex = i;
      values.forEach((value, index) => {
        if (value) headerMap[value] = index;
      });
      break;
    }
  }
  if (headerIndex === -1) {
    throw new Error("未找到微信账单表头");
  }

  function pick(row, names) {
    for (const name of names) {
      const index = headerMap[name];
      if (typeof index === "number" && index < row.length) return row[index];
    }
    return "";
  }

  const records = [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const tradeTime = normalizeWechatDate(pick(row, ["交易时间"]));
    if (!tradeTime) continue;
    const tradeType = pick(row, ["交易类型"]);
    const product = pick(row, ["商品"]);
    const inOut = pick(row, ["收/支", "收支"]);
    const amountRaw = pick(row, ["金额(元)", "金额"]);
    const note = pick(row, ["备注"]);
    const amount = Number(String(amountRaw || "").replace(/[^\d.-]/g, ""));
    const type = inferWechatType(inOut, tradeType);
    if (!type || !Number.isFinite(amount) || amount <= 0) continue;

    records.push({
      type,
      amount,
      category: inferWechatCategory(product, tradeType, note),
      billDate: tradeTime,
      note: String(note || product || tradeType || "").trim(),
      importFingerprint: buildWechatFingerprint([tradeTime, tradeType, product, inOut, amountRaw, note])
    });
  }
  return records;
}

function getBillSummary(userId) {
  const bills = selectBillsByUser.all(userId);
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  let todayExpense = 0;
  let monthIncome = 0;
  let monthExpense = 0;
  let totalIncome = 0;
  let totalExpense = 0;

  for (const bill of bills) {
    const date = new Date(bill.bill_date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    if (bill.type === "收入") {
      totalIncome += bill.amount;
      if (year === currentYear && month === currentMonth) {
        monthIncome += bill.amount;
      }
    } else {
      totalExpense += bill.amount;
      if (year === currentYear && month === currentMonth) {
        monthExpense += bill.amount;
      }
      if (year === currentYear && month === currentMonth && day === currentDay) {
        todayExpense += bill.amount;
      }
    }
  }

  return {
    todayExpense,
    monthIncome,
    monthExpense,
    currentBalance: totalIncome - totalExpense,
    totalIncome,
    totalExpense
  };
}

function getMonthSeries(userId) {
  const bills = selectBillsByUser.all(userId);
  const year = new Date().getFullYear();
  const series = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    income: 0,
    expense: 0,
    saving: 0
  }));

  for (const bill of bills) {
    const date = new Date(bill.bill_date);
    if (date.getFullYear() !== year) continue;
    const index = date.getMonth();
    if (bill.type === "收入") {
      series[index].income += bill.amount;
    } else {
      series[index].expense += bill.amount;
    }
  }

  for (const item of series) {
    item.saving = Math.max(item.income - item.expense, 0);
  }

  return series;
}

async function handleRegister(req, res) {
  const body = await parseBody(req);
  const username = String(body.username || "").trim();
  const contact = String(body.contact || "").trim();
  const password = String(body.password || "");

  if (!username || !password) {
    json(res, 400, { error: "用户名和密码不能为空" });
    return;
  }

  if (findUserByUsername.get(username)) {
    json(res, 409, { error: "用户名已存在" });
    return;
  }

  const createdAt = nowIso();
  const passwordHash = hashPassword(password);
  const result = insertUser.run(username, contact, passwordHash, createdAt);

  json(res, 201, {
    message: "注册成功",
    user: {
      id: Number(result.lastInsertRowid),
      username,
      contact,
      createdAt
    }
  });
}

async function handleLogin(req, res) {
  const body = await parseBody(req);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const user = findUserByAccount.get(username, username);

  if (!user || user.password_hash !== hashPassword(password)) {
    logError(user ? user.id : null, "登录失败：账号或密码错误");
    json(res, 401, { error: "账号或密码错误" });
    return;
  }

  const token = createToken();
  updateUserToken.run(token, user.id);

  json(res, 200, {
    message: "登录成功",
    token,
    user: {
      id: user.id,
      username: user.username,
      contact: user.contact
    }
  });
}

async function handleLogout(req, res, user) {
  clearUserToken.run(user.id);
  json(res, 200, { message: "已退出登录" });
}

async function handleCreateBill(req, res, user) {
  const body = await parseBody(req);
  const rawType = String(body.type ?? "").trim();
  const type = rawType === "收入" || rawType === "income"
    ? "收入"
    : rawType === "支出" || rawType === "expense"
      ? "支出"
      : rawType;
  const amount = parsePositiveNumber(body.amount);
  const category = String(body.category ?? "").trim();
  const billDate = String(body.billDate ?? body.date ?? "").trim();
  const note = String(body.note ?? "").trim();

  if (!["收入", "支出"].includes(type) || Number.isNaN(amount) || !category || !billDate) {
    logError(user.id, "保存账单失败：字段缺失或金额格式错误");
    json(res, 400, {
      error: "请完整填写收支类型、金额、分类和日期",
      received: { type: rawType, amount: body.amount, category, billDate }
    });
    return;
  }

  const createdAt = nowIso();
  const result = insertBill.run(user.id, type, amount, category, billDate, note, createdAt, "");
  json(res, 201, {
    message: "账单保存成功",
    bill: {
      id: Number(result.lastInsertRowid),
      type,
      amount,
      category,
      billDate,
      note,
      createdAt,
      importFingerprint: ""
    }
  });
}

async function handleGetBills(req, res, user) {
  const bills = selectBillsByUser.all(user.id).map(bill => ({
    id: bill.id,
    type: bill.type,
    amount: bill.amount,
    category: bill.category,
    billDate: bill.bill_date,
    note: bill.note,
    createdAt: bill.created_at,
    importFingerprint: bill.import_fingerprint || ""
  }));
  json(res, 200, { bills });
}

async function handleSaveBudget(req, res, user) {
  const body = await parseBody(req);
  const dailyBudget = parseBudgetNumber(body.dailyBudget);
  const monthlyBudget = parseBudgetNumber(body.monthlyBudget);
  const yearlyBudget = parseBudgetNumber(body.yearlyBudget);

  if ([dailyBudget, monthlyBudget, yearlyBudget].some(Number.isNaN)) {
    logError(user.id, "预算生成失败：预算值格式错误");
    json(res, 400, { error: "预算值必须是大于等于 0 的数字" });
    return;
  }

  const updatedAt = nowIso();
  upsertBudget.run(user.id, dailyBudget, monthlyBudget, yearlyBudget, updatedAt);
  const summary = getBillSummary(user.id);

  json(res, 200, {
    message: "预算保存成功",
    budget: {
      dailyBudget,
      monthlyBudget,
      yearlyBudget,
      updatedAt
    },
    comparison: {
      dailyRemaining: dailyBudget - summary.todayExpense,
      monthlyRemaining: monthlyBudget - summary.monthExpense,
      yearlyRemaining: yearlyBudget - summary.totalExpense
    }
  });
}

async function handleGetBudget(req, res, user) {
  const budget = selectBudgetByUser.get(user.id) || {
    daily_budget: 0,
    monthly_budget: 0,
    yearly_budget: 0,
    updated_at: null
  };
  json(res, 200, {
    budget: {
      dailyBudget: budget.daily_budget,
      monthlyBudget: budget.monthly_budget,
      yearlyBudget: budget.yearly_budget,
      updatedAt: budget.updated_at
    }
  });
}

async function handleSaveSavingTarget(req, res, user) {
  const body = await parseBody(req);
  const targetAmount = parsePositiveNumber(body.targetAmount);
  const targetDays = body.targetDays ? Number(body.targetDays) : parsePeriodDays(body.targetPeriod);

  if (Number.isNaN(targetAmount) || !targetAmount || !targetDays || targetDays <= 0) {
    logError(user.id, "储蓄建议生成失败：目标金额或期限格式错误");
    json(res, 400, { error: "请正确填写目标金额和期限" });
    return;
  }

  const dailySave = targetAmount / targetDays;
  const monthlySave = targetAmount / Math.max(1, targetDays / 30);
  const yearlySave = targetAmount / Math.max(1, targetDays / 365);
  const updatedAt = nowIso();

  upsertSavingTarget.run(
    user.id,
    targetAmount,
    targetDays,
    dailySave,
    monthlySave,
    yearlySave,
    updatedAt
  );

  json(res, 200, {
    message: "储蓄目标保存成功",
    savingPlan: {
      targetAmount,
      targetDays,
      dailySave,
      monthlySave,
      yearlySave,
      updatedAt
    }
  });
}

async function handleGetSavingTarget(req, res, user) {
  const saving = selectSavingTargetByUser.get(user.id);
  json(res, 200, {
    savingPlan: saving
      ? {
          targetAmount: saving.target_amount,
          targetDays: saving.target_days,
          dailySave: saving.daily_save,
          monthlySave: saving.monthly_save,
          yearlySave: saving.yearly_save,
          updatedAt: saving.updated_at
        }
      : null
  });
}

async function handleGetDashboard(req, res, user) {
  const summary = getBillSummary(user.id);
  const budget = selectBudgetByUser.get(user.id);
  const saving = selectSavingTargetByUser.get(user.id);
  const errors = selectErrorsByUser.all(user.id);
  json(res, 200, {
    summary,
    budget: budget
      ? {
          dailyBudget: budget.daily_budget,
          monthlyBudget: budget.monthly_budget,
          yearlyBudget: budget.yearly_budget
        }
      : null,
    savingPlan: saving
      ? {
          targetAmount: saving.target_amount,
          targetDays: saving.target_days,
          dailySave: saving.daily_save,
          monthlySave: saving.monthly_save,
          yearlySave: saving.yearly_save
        }
      : null,
    errorCount: errors.length
  });
}

async function handleGetCharts(req, res, user) {
  json(res, 200, { monthlySeries: getMonthSeries(user.id) });
}

async function handleGetErrors(req, res, user) {
  const logs = selectErrorsByUser.all(user.id).map(item => ({
    id: item.id,
    errorReason: item.error_reason,
    errorTime: item.error_time,
    createdAt: item.created_at
  }));
  json(res, 200, { errors: logs });
}

async function handleCreateError(req, res, user) {
  const body = await parseBody(req);
  const reason = String(body.reason || "").trim();
  if (!reason) {
    json(res, 400, { error: "错误原因不能为空" });
    return;
  }
  logError(user.id, reason);
  json(res, 201, { message: "异常记录已写入" });
}

async function handleImportWechatXlsx(req, res, user) {
  const body = await parseBody(req);
  const filename = String(body.filename || body.fileName || "").trim();
  const contentBase64 = String(body.contentBase64 || body.fileBase64 || "").trim();
  if (!filename || !contentBase64) {
    logError(user.id, "导入失败：缺少文件名或文件内容");
    json(res, 400, { error: "缺少文件名或文件内容" });
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-xlsx-"));
  const tempExt = path.extname(filename) || ".xlsx";
  const tempFile = path.join(tempDir, `imported${tempExt}`);
  const parserScript = path.join(__dirname, "parse_wechat_xlsx.py");

  try {
    fs.writeFileSync(tempFile, Buffer.from(contentBase64, "base64"));
    const result = spawnSync("python", ["-X", "utf8", parserScript, tempFile], {
      encoding: "utf8",
      env: { ...process.env, PYTHONUTF8: "1" }
    });
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || "微信账单解析失败").trim());
    }

    const parsed = JSON.parse(result.stdout || "{}");
    const records = Array.isArray(parsed.records) ? parsed.records : [];
    if (!records.length) {
      json(res, 200, {
        message: "未解析到可导入的账单记录",
        importedCount: 0,
        skippedCount: 0
      });
      return;
    }

    const existingBills = selectBillsByUser.all(user.id).map(item => ({
      type: item.type,
      amount: item.amount,
      category: item.category,
      billDate: item.bill_date,
      note: item.note || "",
      importFingerprint: item.import_fingerprint || ""
    }));
    const existingKeys = new Set(existingBills.map(buildBillKey));
    const existingContentKeys = new Set(existingBills.map(buildBillContentKey));
    const importedKeys = new Set();
    const importedContentKeys = new Set();
    let importedCount = 0;
    let skippedCount = 0;
    const createdAt = nowIso();

    for (const rawRecord of records) {
      const record = normalizeImportedRecord(rawRecord);
      if (!record.type || !(record.amount > 0) || !record.billDate) {
        skippedCount += 1;
        continue;
      }
      const key = buildBillKey(record);
      const contentKey = buildBillContentKey(record);
      if (existingKeys.has(key) || importedKeys.has(key) || existingContentKeys.has(contentKey) || importedContentKeys.has(contentKey)) {
        skippedCount += 1;
        continue;
      }
      try {
        insertBill.run(
          user.id,
          record.type,
          record.amount,
          record.category,
          record.billDate,
          record.note || "",
          createdAt,
          record.importFingerprint || ""
        );
      } catch (error) {
        if (String(error && error.message || "").includes("idx_bills_user_fingerprint") || String(error && error.message || "").includes("UNIQUE constraint failed")) {
          skippedCount += 1;
          continue;
        }
        throw error;
      }
      importedKeys.add(key);
      importedContentKeys.add(contentKey);
      importedCount += 1;
    }

    json(res, 200, {
      message: importedCount ? `账单导入成功，已写入 ${importedCount} 条记录` : "导入完成，但所有账单都已存在",
      importedCount,
      skippedCount
    });
  } catch (error) {
    logError(user.id, `导入失败：${error.message}`);
    json(res, 500, { error: `导入失败：${error.message}` });
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      serveHtml(res, DEFAULT_HTML_PATH);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      json(res, 200, {
        status: "ok",
        time: nowIso(),
        database: DB_PATH
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/register") {
      await handleRegister(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/login") {
      await handleLogin(req, res);
      return;
    }

    const authUser = getAuthUser(req);
    if (url.pathname.startsWith("/api/") && !authUser && !["/api/register", "/api/login"].includes(url.pathname)) {
      json(res, 401, { error: "请先登录" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/logout") {
      await handleLogout(req, res, authUser);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/bills") {
      await handleCreateBill(req, res, authUser);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/bills") {
      await handleGetBills(req, res, authUser);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/budgets") {
      await handleSaveBudget(req, res, authUser);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/budgets") {
      await handleGetBudget(req, res, authUser);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/saving-target") {
      await handleSaveSavingTarget(req, res, authUser);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/saving-target") {
      await handleGetSavingTarget(req, res, authUser);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      await handleGetDashboard(req, res, authUser);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/charts") {
      await handleGetCharts(req, res, authUser);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/errors") {
      await handleGetErrors(req, res, authUser);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/errors") {
      await handleCreateError(req, res, authUser);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/import/wechat-xlsx") {
      await handleImportWechatXlsx(req, res, authUser);
      return;
    }
    if (url.pathname.startsWith("/api/sync/")) {
      const handled = await handleSyncRoute(req, res, url, authUser);
      if (handled) return;
    }

    notFound(res);
  } catch (error) {
    if (authUser) {
      logError(authUser.id, `服务异常：${error.message}`);
    }
    json(res, 500, { error: "服务器内部错误", detail: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
  console.log(`SQLite database ready at ${DB_PATH}`);
  startScheduler(runAllSyncAccounts);
});
