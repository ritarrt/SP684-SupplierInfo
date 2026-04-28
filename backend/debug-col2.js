import XLSX from 'xlsx';
import fs from 'fs';

const buf = fs.readFileSync('./excel/Gypsum.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });
const ws = wb.Sheets['สูตร 4 step Y1'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

const r2 = data[2];
console.log('Row 2 raw:', JSON.stringify(r2));
console.log('col0:', r2[0]);
console.log('col1:', r2[1]);
console.log('col2:', r2[2], '| type:', typeof r2[2], '| repr:', JSON.stringify(r2[2]));
console.log('col3:', r2[3]);

// Check if col2 is undefined vs empty string
console.log('\ncol2 === undefined?', r2[2] === undefined);
console.log('col2 === ""?', r2[2] === '');
console.log('String(col2).trim() === "Price List"?', String(r2[2] ?? '').trim() === 'Price List');
