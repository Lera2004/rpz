import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsPath = path.join(__dirname, '..', 'uploads');

const files = fs.readdirSync(uploadsPath);

const excelFile = files.find(file => {
    const ext = path.extname(file).toLowerCase();
    return ext === '.xls' || ext === '.xlsx';
});

if (!excelFile) {
    console.log('Excel-файл не знайдено');
    process.exit(1);
}

const filePath = path.join(uploadsPath, excelFile);

const workbook = XLSX.readFile(filePath);

const practiceSheets = [
    '1-1-1',
    '1-1-2',
    '2-1-1',
    '2-1-2',
    '3-1-1',
    '3-1-2',
    '4-1-1',
    '4-1-2'
];

console.log('');
console.log('==============================================');
console.log('ПЕРЕВІРКА ЛИСТІВ ПРАКТИК');
console.log('==============================================');

for (const sheetName of practiceSheets) {

    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
        console.log(`\n❌ ${sheetName} — лист не знайдено`);
        continue;
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        raw: false
    });

    console.log('');
    console.log('----------------------------------------------');
    console.log(`ЛИСТ: ${sheetName}`);
    console.log(`Рядків: ${rows.length}`);
    console.log('----------------------------------------------');

    // Шукаємо всі заповнені клітинки після рядка 20
    let found = false;

    for (let i = 19; i < rows.length; i++) {

        const row = rows[i];

        const values = [];

        for (let j = 0; j < row.length; j++) {

            const value = String(row[j] ?? '').trim();

            if (!value) {
                continue;
            }

            values.push(`[${j}] ${JSON.stringify(value)}`);
        }

        if (values.length > 0) {

            found = true;

            console.log(`РЯДОК ${i + 1}:`);
            console.log(values.join(' | '));
        }
    }

    if (!found) {
        console.log('⚠ Даних практики в клітинках не знайдено');
    }

    // Додатково показуємо діапазон листа
    console.log('');
    console.log('Діапазон Excel:', worksheet['!ref']);

    // Перевіряємо реальні клітинки після рядка 20
    const cellAddresses = Object.keys(worksheet)
        .filter(key => !key.startsWith('!'));

    const practiceCells = cellAddresses.filter(address => {

        const cell = worksheet[address];

        if (!cell) {
            return false;
        }

        const match = address.match(/^([A-Z]+)(\d+)$/);

        if (!match) {
            return false;
        }

        const rowNumber = Number(match[2]);

        return rowNumber >= 20;
    });

    console.log(
        'Клітинок після рядка 20:',
        practiceCells.length
    );

    if (practiceCells.length > 0) {

        console.log('Адреси клітинок:');

        practiceCells.forEach(address => {

            const cell = worksheet[address];

            console.log(
                `  ${address}:`,
                JSON.stringify(cell.v)
            );

        });
    }
}

console.log('');
console.log('==============================================');
console.log('КІНЕЦЬ ПЕРЕВІРКИ');
console.log('==============================================');