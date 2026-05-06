import XLSX from 'xlsx';
import fs from 'fs';

const buf = fs.readFileSync('./excel/Gypsum_final.1.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });
const ws = wb.Sheets['สูตร 4 step SB'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

// แสดง row 0 ทั้งหมด (branch header row)
const row0 = data[0];
console.log('Row 0 full length:', row0.length);
console.log('\nAll values in row 0:');
row0.forEach((v, ci) => {
  if (v !== null && v !== undefined && v !== '') {
    console.log(`  col${ci}: ${JSON.stringify(v)}`);
  }
});

// แสดง row 1 (Price List row) เพื่อดูว่า data จริงอยู่ถึง col ไหน
const row1 = data[1];
console.log('\nRow 1 (Price List) non-empty cols:');
row1.forEach((v, ci) => {
  if (v !== null && v !== undefined && v !== '') {
    console.log(`  col${ci}: ${JSON.stringify(v)}`);
  }
});

// ดู row 2 (Discount) ด้วย
const row2 = data[2];
console.log('\nRow 2 (Discount) non-empty cols:');
row2.forEach((v, ci) => {
  if (v !== null && v !== undefined && v !== '') {
    console.log(`  col${ci}: ${JSON.stringify(v)}`);
  }
});
