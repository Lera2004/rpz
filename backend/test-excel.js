import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// uploads знаходиться на рівні PED/uploads,
// а test-excel.js знаходиться в PED/backend/
const uploadsPath = path.join(__dirname, '..', 'uploads');

try {
    console.log('Перевіряємо папку uploads:');
    console.log(uploadsPath);
    console.log('');

    // Отримуємо список файлів
    const files = fs.readdirSync(uploadsPath);

    console.log('Файли в папці uploads:');

    files.forEach((file, index) => {
        console.log(`${index + 1}. ${file}`);
    });

    console.log('');

    // Шукаємо перший Excel-файл
    const excelFile = files.find(file => {
        const extension = path.extname(file).toLowerCase();

        return extension === '.xls' || extension === '.xlsx';
    });

    if (!excelFile) {
        console.error('Excel-файл не знайдено!');
        process.exit(1);
    }

    console.log('Знайдено Excel-файл:');
    console.log(excelFile);
    console.log('');

    // Формуємо правильний шлях
    const filePath = path.join(uploadsPath, excelFile);

    console.log('Відкриваємо файл:');
    console.log(filePath);
    console.log('');

    // Читаємо Excel
    const workbook = XLSX.readFile(filePath);

    console.log('Excel успішно прочитано!');
    console.log('');

    console.log('Кількість листів:', workbook.SheetNames.length);
    console.log('');

    console.log('Назви листів:');

    workbook.SheetNames.forEach((sheetName, index) => {
        console.log(`${index + 1}. ${sheetName}`);
    });

} catch (error) {
    console.error('');
    console.error('Помилка читання Excel:');
    console.error(error);
}