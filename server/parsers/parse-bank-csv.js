function parseBankCsvContent(rawContent) {
  try {
    const parsed = JSON.parse(String(rawContent || "{}"));
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch (error) {
    return [];
  }
}

module.exports = {
  parseBankCsvContent
};
