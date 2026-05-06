import XLSX from 'xlsx';
import fs from 'fs';

const buf = fs.readFileSync('./excel/Gypsum_final.1.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });

const sheetName = 'สูตร 4 step SB';
const ws = wb.Sheets[sheetName];
const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });

// อ่าน Sheet1 SKU lookup
const skuLookup = {};
const s1 = wb.Sheets['Sheet1'];
if (s1) {
  const s1data = XLSX.utils.sheet_to_json(s1, { header: 1 });
  const headers = s1data[0] || [];
  headers.forEach((h, ci) => {
    if (!h) return;
    const name = String(h).trim();
    const skus = [];
    for (let r = 1; r < s1data.length; r++) {
      const v = s1data[r]?.[ci];
      if (v && String(v).trim()) skus.push(String(v).trim());
    }
    if (skus.length > 0) skuLookup[name] = skus;
  });
}
console.log('SKU lookup keys:', Object.keys(skuLookup).length);

// Zone mapping
const ZONE_TO_BRANCHES = {
  BKK: ['00TR','01TJ','02TN','03TS','04TP'],
  C:   ['05AY','21BS','22BP','24TL','25SB'],
  N:   ['11PL','12CM','17CR','23NS'],
  NE:  ['08NR','09UB','10KK','18UD','20SK'],
  E:   ['06RY','15CB'],
  S:   ['07RB','13SR','14HY','16PK','19PC'],
};

// Auto-detect branch header row
const ALL_ZONE_KEYS = new Set(Object.keys(ZONE_TO_BRANCHES));
const BRANCH_CODE_RE = /^\d{2}[A-Z]{2}$/;
let branchHeaderRowIdx = -1;
let branchStartCol = 3;

for (let ri = 0; ri <= Math.min(5, rawData.length - 1); ri++) {
  const row = rawData[ri];
  if (!row) continue;
  let matchCount = 0, firstMatchCol = -1;
  for (let col = 2; col < row.length; col++) {
    const v = row[col];
    if (!v || typeof v !== 'string') continue;
    const h = v.trim();
    if (ALL_ZONE_KEYS.has(h) || BRANCH_CODE_RE.test(h)) {
      matchCount++;
      if (firstMatchCol === -1) firstMatchCol = col;
    }
  }
  if (matchCount >= 2) { branchHeaderRowIdx = ri; branchStartCol = firstMatchCol; break; }
}
if (branchHeaderRowIdx === -1) { branchHeaderRowIdx = 1; branchStartCol = 3; }
console.log(`Branch header row: ${branchHeaderRowIdx}, startCol: ${branchStartCol}`);

// Build branchColumns
const branchColumns = [];
const branches = [];
const branchHeaderRow = rawData[branchHeaderRowIdx];
for (let col = branchStartCol; col < branchHeaderRow.length; col++) {
  const h = branchHeaderRow[col];
  if (!h || typeof h !== 'string' || !h.trim()) continue;
  const hh = h.trim();
  branches.push(hh);
  if (ZONE_TO_BRANCHES[hh]) {
    for (const bc of ZONE_TO_BRANCHES[hh]) branchColumns.push({ colIdx: col, branchCode: bc });
  } else {
    branchColumns.push({ colIdx: col, branchCode: hh });
  }
}
console.log(`Branches (${branches.length}): ${branches.join(', ')}`);
console.log(`Branch codes: ${[...new Set(branchColumns.map(b => b.branchCode))].join(', ')}`);

// Simulate parse — dataStartRow = branchHeaderRowIdx
const PRICE_LABELS = new Set(['Price List','Discount','RE (ex VAT)','VAT','Net Price (inc VAT)',
  'Transportation','COGS','Promotion Rebate','Net Cost',
  'Price : W1','Price : W2','Price : R1','Price : R2']);

let i = branchHeaderRowIdx;
let productCount = 0;
let skippedBlocks = [];

while (i < rawData.length) {
  const row = rawData[i];
  if (!row) { i++; continue; }
  const col0 = String(row[0] ?? '').trim();
  const col1 = String(row[1] ?? '').trim();
  const col2 = String(row[2] ?? '').trim();
  const isPriceLabel = PRICE_LABELS.has(col1);

  const isBlockHeader = /^Y\d/.test(col0) && (!isPriceLabel || col1 === 'Price List' || col2 === 'Price List');

  if (isBlockHeader) {
    let productName = 'Unknown';
    let priceListRowIndex = -1;

    if (col2 === 'Price List') {
      productName = col1 || col0; priceListRowIndex = i;
    } else if (col1 === 'Price List') {
      productName = col0; priceListRowIndex = i;
    } else if (col1 && branches.length > 0 && row[branchStartCol] !== undefined && String(row[branchStartCol]).trim() === branches[0]) {
      productName = col1;
      for (let k = i + 1; k < Math.min(i + 5, rawData.length); k++) {
        const nr = rawData[k];
        if (!nr) continue;
        const nl1 = String(nr[1] ?? '').trim();
        const nl2 = String(nr[2] ?? '').trim();
        if (nl1 === 'Price List' || nl2 === 'Price List') { priceListRowIndex = k; break; }
      }
    }

    if (priceListRowIndex === -1) { i++; continue; }

    const inLookup = skuLookup[productName];
    if (inLookup) {
      productCount++;
      console.log(`  ✅ "${productName}" → ${inLookup.length} SKUs (priceListRow=${priceListRowIndex})`);
    } else {
      skippedBlocks.push(productName);
    }

    // skip to next block
    let next = priceListRowIndex + 1;
    while (next < rawData.length) {
      const dr = rawData[next];
      if (!dr) { next++; continue; }
      const nc0 = String(dr[0] ?? '').trim();
      const nc1 = String(dr[1] ?? '').trim();
      if (/^Y\d/.test(nc0) && !PRICE_LABELS.has(nc1) && nc1 !== '') break;
      next++;
    }
    i = next;
  } else {
    i++;
  }
}

console.log(`\nTotal products found: ${productCount}`);
if (skippedBlocks.length > 0) {
  console.log(`Skipped (not in Sheet1): ${skippedBlocks.join(', ')}`);
}
