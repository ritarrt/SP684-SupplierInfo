import XLSX from 'xlsx';
import fs from 'fs';

const buf = fs.readFileSync('./excel/Gypsum_final.1.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });

// ค้นหา SDM ในทุก sheet
for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    for (let col = 0; col < row.length; col++) {
      const v = String(row[col] ?? '');
      if (v.toLowerCase().includes('sdm')) {
        console.log(`Sheet "${sheetName}" row${i} col${col}: ${JSON.stringify(v)}`);
        // แสดง row นั้นทั้งหมด
        const nonEmpty = row.slice(0, 10).map((x, ci) => `[${ci}]=${JSON.stringify(x)}`).filter(x => !x.includes('null') && !x.includes('undefined') && !x.includes('""'));
        console.log('  Row:', nonEmpty.join(' | '));
      }
    }
  }
}
