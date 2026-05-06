import XLSX from 'xlsx';
import fs from 'fs';

const buf = fs.readFileSync('./excel/Gypsum_final.2.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });

const sheetName = 'Rockwool';
const ws = wb.Sheets[sheetName];
const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });

// อ่าน Sheet1 SKU lookup
const skuLookup = {};
const s1 = wb.Sheets['Sheet1'];
if (s1) {
  const s1data = XLSX.utils.sheet_to_json(s1, { header: 1 });
  s1data[0]?.forEach((h, ci) => {
    if (!h) return;
    const name = String(h).trim();
    const skus = [];
    for (let r = 1; r < s1data.length; r++) {
      const v = s1data[r]?.[ci];
      if (v && String(v).trim()) skus.push(String(v).trim());
    }
    if (skus.length > 0) skuLookup[name] = skus;
  });
  console.log('Sheet1 keys:', Object.keys(skuLookup).length);
  // หา Rockwool/Rockchill
  Object.keys(skuLookup).filter(k => k.toLowerCase().includes('rock') || k.toLowerCase().includes('safe') || k.toLowerCase().includes('silent')).forEach(k => {
    console.log(`  "${k}" → ${skuLookup[k].join(', ')}`);
  });
}

// Zone mapping
const ZONE_TO_BRANCHES = { BKK:['00TR','01TJ','02TN','03TS','04TP'], C:['05AY','21BS','22BP','24TL','25SB'], N:['11PL','12CM','17CR','23NS'], NE:['08NR','09UB','10KK','18UD','20SK'], E:['06RY','15CB'], S:['07RB','13SR','14HY','16PK','19PC'] };
const suffixToBranchCode = { TR:'00TR',TJ:'01TJ',TN:'02TN',TS:'03TS',TP:'04TP',AY:'05AY',RY:'06RY',RB:'07RB',NR:'08NR',UB:'09UB',KK:'10KK',PL:'11PL',CM:'12CM',SR:'13SR',HY:'14HY',CB:'15CB',PK:'16PK',CR:'17CR',UD:'18UD',PC:'19PC',SK:'20SK',BS:'21BS',BP:'22BP',NS:'23NS',TL:'24TL',SB:'25SB' };

// Auto-detect branch header
const ALL_ZONE_KEYS = new Set(Object.keys(ZONE_TO_BRANCHES));
const BRANCH_CODE_RE = /^\d{2}[A-Z]{2}$/;
let branchHeaderRowIdx = -1, branchStartCol = 3;
for (let ri = 0; ri <= Math.min(5, rawData.length-1); ri++) {
  const row = rawData[ri]; if (!row) continue;
  let matchCount = 0, firstMatchCol = -1;
  for (let col = 2; col < row.length; col++) {
    const v = row[col]; if (!v || typeof v !== 'string') continue;
    const h = v.trim();
    if (ALL_ZONE_KEYS.has(h) || BRANCH_CODE_RE.test(h) || suffixToBranchCode[h]) {
      matchCount++; if (firstMatchCol === -1) firstMatchCol = col;
    }
  }
  if (matchCount >= 2) { branchHeaderRowIdx = ri; branchStartCol = firstMatchCol; break; }
}
if (branchHeaderRowIdx === -1) { branchHeaderRowIdx = 1; branchStartCol = 3; }
console.log(`\nBranch header row: ${branchHeaderRowIdx}, startCol: ${branchStartCol}`);

// Build branchColumns
const branchColumns = [], branches = [];
const seenHeaders = new Set();
const branchHeaderRow = rawData[branchHeaderRowIdx];
for (let col = branchStartCol; col < branchHeaderRow.length; col++) {
  const h = branchHeaderRow[col];
  if (!h || typeof h !== 'string' || !h.trim()) continue;
  const hh = h.trim();
  if (seenHeaders.has(hh)) { console.log(`Stopped at col${col} (dup "${hh}")`); break; }
  seenHeaders.add(hh);
  branches.push(hh);
  if (ZONE_TO_BRANCHES[hh]) { for (const bc of ZONE_TO_BRANCHES[hh]) branchColumns.push({ colIdx: col, branchCode: bc }); }
  else if (BRANCH_CODE_RE.test(hh)) { branchColumns.push({ colIdx: col, branchCode: hh }); }
  else if (suffixToBranchCode[hh]) { branchColumns.push({ colIdx: col, branchCode: suffixToBranchCode[hh] }); }
  else { branchColumns.push({ colIdx: col, branchCode: hh }); }
}
console.log(`Branches: ${branches.join(', ')}`);
console.log(`Branch codes: ${[...new Set(branchColumns.map(b=>b.branchCode))].join(', ')}`);

// Parse
const PRICE_LABELS = new Set(['Price List','Discount','RE (ex VAT)','VAT','Net Price (inc VAT)','Transportation','COGS','Promotion Rebate','Net Cost','Price : W1','Price : W2','Price : R1','Price : R2','Price : SDM','MG/Bht : W1','MG/Bht : W2','MG/Bht : R1','MG/Bht : R2','MG/Bht : SDM','MG/% : W1','MG/% : W2','MG/% : R1','MG/% : R2','MG/% : SDM']);

let i = branchHeaderRowIdx, found = 0, skipped = [];
while (i < rawData.length) {
  const row = rawData[i]; if (!row) { i++; continue; }
  const col0 = String(row[0]??'').trim();
  const col1 = String(row[1]??'').trim();
  const col2 = String(row[2]??'').trim();
  const isPriceLabel = PRICE_LABELS.has(col1);
  const isBlockHeader = /^Y\d/.test(col0) && (!isPriceLabel || col1==='Price List' || col2==='Price List');

  if (isBlockHeader) {
    let productName = 'Unknown', priceListRowIndex = -1;
    if (col2 === 'Price List') { productName = col1||col0; priceListRowIndex = i; }
    else if (col1 === 'Price List') { productName = col0; priceListRowIndex = i; }
    else if (col1 && branches.length > 0 && row[branchStartCol] !== undefined && String(row[branchStartCol]).trim() === branches[0]) {
      productName = col1;
      for (let k=i+1; k<Math.min(i+5,rawData.length); k++) {
        const nr=rawData[k]; if(!nr) continue;
        const nl1=String(nr[1]??'').trim(), nl2=String(nr[2]??'').trim();
        if (nl1==='Price List'||nl2==='Price List') { priceListRowIndex=k; break; }
      }
    }
    console.log(`\nBlock: col0="${col0}" col1="${col1}" col2="${col2}" → productName="${productName}" priceListRow=${priceListRowIndex}`);
    if (priceListRowIndex === -1) { console.log('  → SKIP (no Price List found)'); i++; continue; }
    if (skuLookup[productName]) {
      found++;
      console.log(`  → FOUND in Sheet1: ${skuLookup[productName].join(', ')}`);
    } else {
      skipped.push(productName);
      console.log(`  → NOT in Sheet1`);
    }
    let next = priceListRowIndex+1;
    while (next < rawData.length) {
      const dr=rawData[next]; if(!dr){next++;continue;}
      const nc0=String(dr[0]??'').trim(), nc1=String(dr[1]??'').trim();
      if (/^Y\d/.test(nc0) && !PRICE_LABELS.has(nc1) && nc1!=='') break;
      next++;
    }
    i = next;
  } else { i++; }
}
console.log(`\nFound: ${found}, Skipped: ${skipped.length} → ${skipped.join(', ')}`);
