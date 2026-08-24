import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsPath = path.join(__dirname, '..', 'uploads');

function toNumber(value) {
    if (value === undefined || value === null || value === '') {
        return 0;
    }

    const number = Number(
        String(value)
            .replace(',', '.')
            .trim()
    );

    return Number.isFinite(number) ? number : 0;
}

function cleanText(value) {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Визначає інформацію з назви листа.
 *
 * Формат:
 *
 * 1-1-1
 * │ │ │
 * │ │ └── група
 * │ └──── сторінка плану
 * └────── курс
 */
function parseSheetName(sheetName) {

    const match = sheetName.match(/^(\d+)-(\d+)-(\d+)$/);

    if (!match) {
        return null;
    }

    return {
        course: Number(match[1]),
        page: Number(match[2]),
        groupNumber: Number(match[3])
    };
}

/**
 * Визначає, чи є рядок реальною дисципліною.
 *
 * Враховує:
 * - звичайні предмети з номером 1, 2, 3...
 * - ОК5
 * - ОК7
 * - ОК24
 * - ВК2
 *
 * Не приймає:
 * - Всього за циклом
 * - Разом
 * - заголовки
 * - порожні рядки
 */
function isDisciplineRow(row) {

    const code = cleanText(row[0]);
    const name = cleanText(row[1]);

    if (!name) {
        return false;
    }

    // Підсумкові рядки
    if (
        name.toLowerCase() === 'всього за циклом' ||
        name.toLowerCase() === 'разом'
    ) {
        return false;
    }

    // Звичайний номер: 1, 2, 3...
    if (/^\d+$/.test(code)) {
        return true;
    }

    // ОК5, ОК24, ВК2 тощо
    if (/^(ОК|ВК)\d+$/i.test(code)) {
        return true;
    }

    return false;
}

/**
 * Читає одну дисципліну.
 */
function parseDiscipline(row) {

    return {
        code: cleanText(row[0]),
        name: cleanText(row[1]),

        hours: {
            plan: toNumber(row[2]),
            previousYear: toNumber(row[3]),
            currentYear: toNumber(row[4])
        },

        semester1: {
            total: toNumber(row[5]),
            classroom: toNumber(row[6]),
            hoursPerWeek: toNumber(row[7]),

            lectures: toNumber(row[8]),
            practical: toNumber(row[9]),
            laboratory: toNumber(row[10]),
            seminars: toNumber(row[11]),

            independent: toNumber(row[12]),

            courseWork: toNumber(row[13]),
            calculationWork: toNumber(row[14]),

            credit: toNumber(row[15]),
            exam: toNumber(row[16]),
            controlWork: toNumber(row[17])
        },

        semester2: {
            total: toNumber(row[18]),
            classroom: toNumber(row[19]),
            hoursPerWeek: toNumber(row[20]),

            lectures: toNumber(row[21]),
            practical: toNumber(row[22]),
            laboratory: toNumber(row[23]),
            seminars: toNumber(row[24]),

            independent: toNumber(row[25]),

            fieldTraining: toNumber(row[26]),

            courseWork: toNumber(row[27]),
            calculationWork: toNumber(row[28]),

            credit: toNumber(row[29]),
            exam: toNumber(row[30]),
            controlWork: toNumber(row[31])
        },

        teacher: {
            main: cleanText(row[32]),
            substitute: cleanText(row[33])
        }
    };
}

/**
 * Головна функція.
 */
function parseWorkbook(filePath) {

    const workbook = XLSX.readFile(filePath);

    const result = [];

    for (const sheetName of workbook.SheetNames) {

        const sheetInfo = parseSheetName(sheetName);

        if (!sheetInfo) {
            console.log(
                `⚠️ Пропущено лист "${sheetName}" — неправильний формат назви`
            );

            continue;
        }

        const worksheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: '',
            raw: false
        });

        // Знаходимо групу
        let groupName = '';

        for (const row of rows.slice(0, 15)) {

            for (const cell of row) {

                const value = cleanText(cell);

                const match = value.match(
                    /РПЗ\s*\d+\s*\d+\s*\/\s*\d+/i
                );

                if (match) {

                    groupName = match[0]
                        .replace(/\s+/g, ' ')
                        .replace(/\s*\/\s*/g, '/')
                        .trim();

                    break;
                }
            }

            if (groupName) {
                break;
            }
        }

        // Збираємо дисципліни
        const disciplines = [];

        rows.forEach((row, index) => {

            if (!isDisciplineRow(row)) {
                return;
            }

            const discipline = parseDiscipline(row);

            discipline.row = index + 1;

            disciplines.push(discipline);
        });

        result.push({

            sheet: sheetName,

            course: sheetInfo.course,

            page: sheetInfo.page,

            groupNumber: sheetInfo.groupNumber,

            group: groupName,

            disciplines
        });
    }

    return result;
}

/**
 * ==============================
 * ЗАПУСК
 * ==============================
 */

try {

    const files = fs.readdirSync(uploadsPath);

    const excelFile = files.find(file => {

        const extension = path.extname(file).toLowerCase();

        return (
            extension === '.xls' ||
            extension === '.xlsx'
        );
    });

    if (!excelFile) {
        throw new Error('Excel-файл не знайдено');
    }

    const filePath = path.join(
        uploadsPath,
        excelFile
    );

    console.log('');
    console.log('==========================================');
    console.log('ПАРСИНГ НАВЧАЛЬНОГО ПЛАНУ');
    console.log('==========================================');
    console.log('');

    console.log('Файл:', excelFile);
    console.log('');

    const result = parseWorkbook(filePath);

    console.log(
        `Оброблено листів: ${result.length}`
    );

    console.log('');

    for (const plan of result) {

        console.log(
            `${plan.sheet} | ` +
            `курс: ${plan.course} | ` +
            `сторінка: ${plan.page} | ` +
            `група: ${plan.group}`
        );

        console.log(
            `  Дисциплін: ${plan.disciplines.length}`
        );

        for (const discipline of plan.disciplines) {

            console.log(
                `    ${discipline.code} — ${discipline.name}`
            );

            console.log(
                `      годин: ${discipline.hours.currentYear}`
            );

            console.log(
                `      1 семестр: ${discipline.semester1.total} год.`
            );

            console.log(
                `      2 семестр: ${discipline.semester2.total} год.`
            );

            if (discipline.teacher.main) {

                console.log(
                    `      викладач: ${discipline.teacher.main}`
                );
            }
        }

        console.log('');
    }

    // Зберігаємо результат для перевірки
    const outputPath = path.join(
        __dirname,
        'parsed-plan.json'
    );

    fs.writeFileSync(
        outputPath,
        JSON.stringify(result, null, 4),
        'utf8'
    );

    console.log('==========================================');
    console.log('ГОТОВО');
    console.log('==========================================');
    console.log('');

    console.log(
        'JSON збережено:',
        outputPath
    );

    console.log('');

} catch (error) {

    console.error('');
    console.error('❌ ПОМИЛКА');
    console.error('');
    console.error(error);
}