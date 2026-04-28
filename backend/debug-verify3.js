import XLSX from 'xlsx';
import fs from 'fs';

const filePath = './excel/Gypsum.xlsx';

const PRICE_LABELS = new Set(['Price List','Discount','RE (ex VAT)','VAT','Net Price (inc VAT)',
  'Transportation','COGS','Promotion Rebate','Net Cost',
  'Price : W1','Price : W2','Price : R1','Price : R2',
  'MG/Bht : W1','MG/Bht : W2','MG/Bht : R1','MG/Bht : R2',
  'MG/% : W1','MG/% : W2','MG/% : R1','MG/% : R2']);

function analyzeSheet(data, sheetName) {
  // Collect all Y-SKUs in col0
  const allSkus = new Set();
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const c0 = row[0] !== undefined ? String(row[0]).trim() : '';
    if (c0.startsWith('Y')) allSkus.add(c0);
  }
  if (allSkus.size === 0) return null;

  // Get branches
  const branches = [];
  if (data[1]) {
    for (let col = 3; col < data[1].length; col++) {
      const b = data[1][col];
      if (b && typeof b === 'string' && b.trim()) branches.push(b.trim());
    }
  }

  // Simulate parser
  const parsedSkus = new Set();
  const formatCounts = { A: 0, B: 0, C: 0, skipped: 0 };
  const skippedRows = [];
  let i = 2;

  while (i < data.length) {
    const row = data[i];
    if (!row) { i++; continue; }

    const col0 = row[0] !== undefined ? String(row[0]).trim() : '';
    const col1 = row[1] !== undefined ? String(row[1]).trim() : '';
    const col2 = row[2] !== undefined ? String(row[2]).trim() : '';
    const col3 = row[3] !== undefined ? String(row[3]).trim() : '';
    const isPriceLabel = PRICE_LABELS.has(col1);

    if (col0.startsWith('Y') && !isPriceLabel) {
      let priceListRowIndex = -1;
      let fmt = null;

      if (col2 === 'Price List') {
        priceListRowIndex = i; fmt = 'A';
      } else if (col1 === 'Price List') {
        priceListRowIndex = i; fmt = 'B';
      } else if (col1 && col3 === 'BKK') {
        for (let k = i + 1; k < Math.min(i + 5, data.length); k++) {
          const nr = data[k];
          if (!nr) continue;
          const nl1 = nr[1] !== undefined ? String(nr[1]).trim() : '';
          const nl2 = nr[2] !== undefined ? String(nr[2]).trim() : '';
          if (nl1 === 'Price List' || nl2 === 'Price List') {
            priceListRowIndex = k; fmt = 'C'; break;
          }
        }
        if (priceListRowIndex === -1) {
          skippedRows.push({ i, col0, col1, col2, col3, reason: 'Format C but no Price List found' });
          formatCounts.skipped++;
          i++; continue;
        }
      } else {
        skippedRows.push({ i, col0, col1, col2, col3, reason: 'No matching format' });
        formatCounts.skipped++;
        i++; continue;
      }

      formatCounts[fmt]++;
      parsedSkus.add(col0);

      // Collect SKU from Price List row
      const plRow = data[priceListRowIndex];
      if (plRow) {
        const plSku = plRow[0] !== undefined ? String(plRow[0]).trim() : '';
        if (plSku.startsWith('Y')) parsedSkus.add(plSku);
      }

      let priceW1 = null;
      let nextBlockIndex = priceListRowIndex + 1;
      while (nextBlockIndex < data.length) {
        const dr = data[nextBlockIndex];
        if (!dr) { nextBlockIndex++; continue; }
        const nc0 = dr[0] !== undefined ? String(dr[0]).trim() : '';
        const nc1 = dr[1] !== undefined ? String(dr[1]).trim() : '';
        const nextIsPriceLabel = PRICE_LABELS.has(nc1);
        if (nc0.startsWith('Y') && !nextIsPriceLabel && nc1 !== '') break;
        if (nc0.startsWith('Y')) parsedSkus.add(nc0);
        if (nc1 === 'Price : W1') priceW1 = dr;
        nextBlockIndex++;
      }

      i = nextBlockIndex;
    } else {
      i++;
    }
  }

  const missing = [...allSkus].filter(s => !parsedSkus.has(s));

  return { sheetName, allSkus: allSkus.size, parsedSkus: parsedSkus.size,
           missing: missing.length, missingList: missing,
           branches: branches.length, totalRows: parsedSkus.size * branches.length,
           formatCounts, skippedRows };
}

try {
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const r = analyzeSheet(data, sheetName);
    if (!r) { console.log(`Sheet "${sheetName}": no Y-SKUs, skip\n`); continue; }

    const status = r.missing === 0 ? '✅' : '❌';
    console.log(`${status} Sheet: "${sheetName}"`);
    console.log(`   SKUs: ${r.allSkus} total | ${r.parsedSkus} parsed | ${r.missing} missing`);
    console.log(`   Branches: ${r.branches} | Rows to DB: ${r.totalRows}`);
    console.log(`   Formats: A=${r.formatCounts.A} B=${r.formatCounts.B} C=${r.formatCounts.C} skipped=${r.formatCounts.skipped}`);
    if (r.missing > 0) {
      console.log(`   Missing SKUs:`);
      r.missingList.forEach(s => console.log(`     - ${s}`));
    }
    if (r.skippedRows.length > 0) {
      console.log(`   Skipped rows:`);
      r.skippedRows.slice(0, 5).forEach(s =>
        console.log(`     Row ${s.i}: col0="${s.col0}" col1="${s.col1}" col2="${s.col2}" col3="${s.col3}" → ${s.reason}`)
      );
    }
    console.log('');
  }
} catch (err) {
  console.error('Error:', err.message);
}
