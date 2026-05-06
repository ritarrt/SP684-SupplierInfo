import XLSX from 'xlsx';
import fs from 'fs';

const buf = fs.readFileSync('./excel/Gypsum_final.2.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });

console.log('Sheets:', wb.SheetNames);

const sheetName = 'Rockwool';
const ws = wb.Sheets[sheetName];
if (!ws) { console.log('Sheet Rockwool not found!'); process.exit(1); }

const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
console.log('Total rows:', data.length);

console.log('\n--- Rows 0-10 (first 12 cols) ---');
for (let i = 0; i <= Math.min(10, data.length-1); i++) {
  const row = data[i];
  if (!row) { console.log('row', i, ': empty'); continue; }
  const cols = row.slice(0, 12).map((v, ci) => `[${ci}]=${JSON.stringify(v)}`).filter(x => !x.includes('null') && !x.includes('undefined'));
  if (cols.length > 0) console.log('row', i, ':', cols.join(' | '));
  else console.log('row', i, ': (empty)');
}

// ดู Sheet1
const s1 = wb.Sheets['Sheet1'];
if (s1) {
  const s1data = XLSX.utils.sheet_to_json(s1, { header: 1 });
  console.log('\n--- Sheet1 headers ---');
  console.log(JSON.stringify(s1data[0]));
  // หา Rockwool ใน Sheet1
  s1data[0]?.forEach((h, ci) => {
    if (h && String(h).toLowerCase().includes('rock')) {
      console.log(`Found "${h}" at col ${ci}`);
      for (let r = 1; r < s1data.length; r++) {
        if (s1data[r][ci]) console.log(`  SKU: ${s1data[r][ci]}`);
      }
    }
  });
} else {
  console.log('\nNo Sheet1!');
}

// ตรวจสอบ branch headers
const ZONE_KEYS = new Set(['BKK','C','N','NE','E','S']);
const BRANCH_RE = /^\d{2}[A-Z]{2}$/;
const SUFFIX_RE = /^[A-Z]{2,3}$/;
for (let ri = 0; ri <= Math.min(5, data.length-1); ri++) {
  const row = data[ri];
  if (!row) continue;
  let matches = [];
  for (let col = 2; col < row.length; col++) {
    const v = row[col];
    if (!v || typeof v !== 'string') continue;
    const h = v.trim();
    if (ZONE_KEYS.has(h) || BRANCH_RE.test(h) || SUFFIX_RE.test(h)) matches.push(`col${col}=${h}`);
  }
  if (matches.length >= 2) {
    console.log(`\nBranch header row: row ${ri} → ${matches.slice(0,10).join(', ')}`);
    break;
  }
}

// ตรวจสอบ Y-SKU ใน col0
const hasYSku = data.some(row => row && /^Y\d/.test(String(row[0] ?? '').trim()));
console.log('\nHas Y-SKU in col0:', hasYSku);
