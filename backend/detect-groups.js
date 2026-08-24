import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// uploads знаходиться:
// C:\OSPanel\domains\ped\uploads
const uploadsPath = path.join(__dirname, '..', 'uploads');

const files = fs.readdirSync(uploadsPath);

const excelFile = files.find(file => {
    const ext = path.extname(file).toLowerCase();
    return ext === '.xls' || ext === '.xlsx';
});

if (!excelFile) {
    console.log('❌ Excel-файл не знайдено');
    process.exit(1);
}

const filePath = path.join(uploadsPath, excelFile);

console.log('');
console.log('======================================');
console.log('ПОШУК ГРУП У ВСІХ ЛИСТАХ');
console.log('======================================');
console.log('');
console.log('Файл:', excelFile);
console.log('Шлях:', filePath);
console.log('');

const workbook = XLSX.readFile(filePath);

console.log('Кількість листів:', workbook.SheetNames.length);
console.log('');

for (
    let sheetIndex = 0;
    sheetIndex < workbook.SheetNames.length;
    sheetIndex++
) {

    const sheetName = workbook.SheetNames[sheetIndex];

    console.log('--------------------------------------');
    console.log(`${sheetIndex + 1}. Лист: ${sheetName}`);

    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: false
    });

    console.log(`Рядків: ${rows.length}`);

    let foundGroup = null;

    /*
     * Шукаємо групу В УСІХ РЯДКАХ листа.
     *
     * Формат:
     * РПЗ 26 1/9
     * РПЗ 26 2/9
     * РПЗ 25 1/9
     * РПЗ 25 2/9
     * тощо.
     */

    for (
        let rowIndex = 0;
        rowIndex < rows.length;
        rowIndex++
    ) {

        const row = rows[rowIndex];

        // ------------------------------------------
        // 1. Перевірка окремих комірок
        // ------------------------------------------

        for (
            let columnIndex = 0;
            columnIndex < row.length;
            columnIndex++
        ) {

            const value = String(row[columnIndex] ?? '').trim();

            if (!value) {
                continue;
            }

            const normalized = value
                .replace(/\s+/g, ' ')
                .trim();

            const match = normalized.match(
                /РПЗ\s*\d+\s*\d+\s*\/\s*\d+/i
            );

            if (match) {

                foundGroup = {
                    name: match[0]
                        .replace(/\s+/g, ' ')
                        .replace(/\s*\/\s*/g, '/')
                        .trim(),

                    row: rowIndex + 1,
                    column: columnIndex + 1
                };

                break;
            }
        }

        if (foundGroup) {
            break;
        }

        // ------------------------------------------
        // 2. Перевірка всього рядка
        // ------------------------------------------

        const rowText = row
            .map(value => String(value ?? '').trim())
            .filter(value => value !== '')
            .join(' ');

        if (rowText) {

            const normalizedRow = rowText
                .replace(/\s+/g, ' ')
                .trim();

            const match = normalizedRow.match(
                /РПЗ\s*\d+\s*\d+\s*\/\s*\d+/i
            );

            if (match) {

                foundGroup = {
                    name: match[0]
                        .replace(/\s+/g, ' ')
                        .replace(/\s*\/\s*/g, '/')
                        .trim(),

                    row: rowIndex + 1,
                    column: 'рядок'
                };

                break;
            }
        }
    }

    // ------------------------------------------
    // Результат
    // ------------------------------------------

    if (foundGroup) {

        console.log(
            `✓ Група: ${foundGroup.name}`
        );

        if (foundGroup.column === 'рядок') {

            console.log(
                `  Розташування: рядок ${foundGroup.row}`
            );

        } else {

            console.log(
                `  Розташування: рядок ${foundGroup.row}, колонка ${foundGroup.column}`
            );
        }

    } else {

        console.log('❌ Групу не знайдено');

        // ------------------------------------------
        // Діагностика
        // ------------------------------------------

        console.log('Перші 15 рядків листа:');

        for (
            let i = 0;
            i < Math.min(15, rows.length);
            i++
        ) {

            const values = rows[i]
                .map((value, index) => {

                    const text = String(value ?? '').trim();

                    if (!text) {
                        return null;
                    }

                    return `[${index + 1}] ${text}`;
                })
                .filter(Boolean);

            console.log(
                `  Рядок ${i + 1}:`,
                values.join(' | ')
            );
        }
    }
}

console.log('');
console.log('======================================');
console.log('ПЕРЕВІРКУ ЗАВЕРШЕНО');
console.log('======================================');