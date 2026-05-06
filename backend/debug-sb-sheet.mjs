import XLSX from 'xlsx';
import fs from 'fs';

const buf = fs.readFileSync('./excel/Gypsum_final.1.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });

console.log('Sheets:', wb.SheetNames);

const sheetName = 'สูตร 4 step SB';
const ws = wb.Sheets[sheetName];
if (!ws) { console.log('Sheet not found!'); process.exit(1); }

const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
console.log('Total rows:', data.length);
console.log('\n--- Rows 0-8 (first 12 cols) ---');
for (let i = 0; i <= Math.min(8, data.length-1); i++) {
  const row = data[i];
  if (!row) { console.log('row', i, ': empty'); continue; }
  const cols = row.slice(0, 12).map((v, ci) => `[${ci}]=${JSON.stringify(v)}`).join(' | ');
  console.log('row', i, ':', cols);
}

// ดู Sheet1
const s1 = wb.Sheets['Sheet1'];
if (s1) {
  const s1data = XLSX.utils.sheet_to_json(s1, { header: 1 });
  console.log('\n--- Sheet1 headers (row 0) ---');
  console.log(JSON.stringify(s1data[0]));
  console.log('Sheet1 rows:', s1data.length);
  if (s1data.length > 1) {
    console.log('Sheet1 row 1 sample:', JSON.stringify(s1data[1]));
  }
} else {
  console.log('\nNo Sheet1 found!');
}

// ตรวจสอบว่ามี Y-SKU ใน col0 ไหม
const hasYSku = data.some(row => {
  if (!row) return false;
  const c0 = String(row[0] ?? '').trim();
  return /^Y\d/.test(c0);
});
console.log('\nHas Y-SKU in col0:', hasYSku);

// ตรวจสอบ branch headers (scan rows 0-5)
const ZONE_KEYS = new Set(['BKK','C','N','NE','E','S']);
const BRANCH_RE = /^\d{2}[A-Z]{2}$/;
for (let ri = 0; ri <= Math.min(5, data.length-1); ri++) {
  const row = data[ri];
  if (!row) continue;
  let matches = [];
  for (let col = 2; col < row.length; col++) {
    const v = row[col];
    if (!v || typeof v !== 'string') continue;
    const h = v.trim();
    if (ZONE_KEYS.has(h) || BRANCH_RE.test(h)) matches.push(`col${col}=${h}`);
  }
  if (matches.length >= 2) {
    console.log(`\nBranch header row found: row ${ri} → ${matches.join(', ')}`);
    break;
  }
}
