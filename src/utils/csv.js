function cell(value) {
  const raw = value == null ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

/** Excel-friendly CSV (UTF-8 BOM). */
export function toCsv(headers, rows) {
  const lines = [headers.map(cell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => cell(row[h])).join(','));
  }
  return `\uFEFF${lines.join('\n')}`;
}

export function sendCsv(res, filename, headers, rows) {
  const body = toCsv(headers, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}
