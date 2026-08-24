import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsPath = path.join(__dirname, '..', 'uploads');


// --------------------------------------------------
// Допоміжна функція: перетворення значення в число
// --------------------------------------------------

function numberValue(value) {
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


// --------------------------------------------------
// Визначення, чи є рядок реальною дисципліною
// --------------------------------------------------

function isDisciplineRow(row) {
    const code = String(row[0] ?? '').trim();
    const name = String(row[1] ?? '').trim();

    if (!code || !name) {
        return false;
    }

    // Рядки типу "Всього за циклом" не є дисциплінами
    if (name.toLowerCase().includes('всього за циклом')) {
        return false;
    }

    if (name.toLowerCase() === 'разом') {
        return false;
    }

    // Категорії також не є дисциплінами
    if (
        name.toLowerCase().includes('освітні компоненти') ||
        name.toLowerCase().includes('предмети за програмою') ||
        name.toLowerCase().includes('базові передмети') ||
        name.toLowerCase().includes('вибірково-обов’язкові') ||
        name.toLowerCase().includes('вибіркові освітні компоненти')
    ) {
        return false;
    }

    return true;
}


// --------------------------------------------------
// Читання одного семестру
// --------------------------------------------------

function parseSemester(row, semester) {

    if (semester === 1) {

        return {
            total_hours: numberValue(row[5]),
            classroom_hours: numberValue(row[6]),
            hours_per_week: numberValue(row[7]),

            lectures_hours: numberValue(row[8]),
            practical_hours: numberValue(row[9]),
            laboratory_hours: numberValue(row[10]),
            seminar_hours: numberValue(row[11]),

            self_study_hours: numberValue(row[12]),
            course_projects: numberValue(row[13]),
            calculation_graphic: numberValue(row[14]),

            credits: row[15] ?? '',
            exams: row[16] ?? '',
            control_works: row[17] ?? ''
        };

    }

    return {
        total_hours: numberValue(row[18]),
        classroom_hours: numberValue(row[19]),
        hours_per_week: numberValue(row[20]),

        lectures_hours: numberValue(row[21]),
        practical_hours: numberValue(row[22]),
        laboratory_hours: numberValue(row[23]),
        seminar_hours: numberValue(row[24]),

        self_study_hours: numberValue(row[25]),
        field_training_hours: numberValue(row[26]),
        course_projects: numberValue(row[27]),
        calculation_graphic: numberValue(row[28]),

        credits: row[29] ?? '',
        exams: row[30] ?? '',
        control_works: row[31] ?? ''
    };
}


// --------------------------------------------------
// Читання Excel
// --------------------------------------------------

try {

    const files = fs.readdirSync(uploadsPath);

    const excelFile = files.find(file => {
        const extension = path.extname(file).toLowerCase();

        return extension === '.xls' || extension === '.xlsx';
    });

    if (!excelFile) {
        throw new Error('Excel-файл не знайдено в папці uploads');
    }

    const filePath = path.join(uploadsPath, excelFile);

    console.log('======================================');
    console.log('НАВЧАЛЬНИЙ ПЛАН');
    console.log('======================================');
    console.log(`Файл: ${excelFile}`);
    console.log('');

    const workbook = XLSX.readFile(filePath);

    console.log(`Знайдено листів: ${workbook.SheetNames.length}`);
    console.log('');

    const allPlans = [];


    // --------------------------------------------------
    // Обробляємо всі листи
    // --------------------------------------------------

    for (const sheetName of workbook.SheetNames) {

        const worksheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: '',
            raw: false
        });


        // ----------------------------------------------
        // Група
        // ----------------------------------------------

        let groupName = '';

        if (rows[1] && rows[1][33]) {
            groupName = String(rows[1][33]).trim();
        }


        // ----------------------------------------------
        // Дисципліни
        // ----------------------------------------------

        const disciplines = [];


        rows.forEach((row, index) => {

            if (!isDisciplineRow(row)) {
                return;
            }

            const code = String(row[0]).trim();
            const name = String(row[1]).trim();

            const semester1 = parseSemester(row, 1);
            const semester2 = parseSemester(row, 2);

            const teacher = String(row[32] ?? '').trim();
            const backupTeacher = String(row[33] ?? '').trim();


            disciplines.push({

                excel_row: index + 1,

                code,

                name,

                semester1,

                semester2,

                teacher,

                backup_teacher: backupTeacher

            });

        });


        allPlans.push({

            sheet: sheetName,

            group: groupName,

            disciplines

        });

    }


    // --------------------------------------------------
    // Виводимо результат
    // --------------------------------------------------

    console.log('======================================');
    console.log('РЕЗУЛЬТАТ ПАРСИНГУ');
    console.log('======================================');

    for (const plan of allPlans) {

        console.log('');
        console.log(`ЛИСТ: ${plan.sheet}`);
        console.log(`ГРУПА: ${plan.group}`);
        console.log(`ДИСЦИПЛІН: ${plan.disciplines.length}`);

        console.log('--------------------------------------');


        for (const discipline of plan.disciplines) {

            console.log(
                `${discipline.code} | ${discipline.name}`
            );

            console.log(
                `  1 семестр: ${discipline.semester1.total_hours} год.`
            );

            console.log(
                `  2 семестр: ${discipline.semester2.total_hours} год.`
            );

            console.log(
                `  Викладач: ${discipline.teacher || '-'}`
            );

            console.log(
                `  Дублер: ${discipline.backup_teacher || '-'}`
            );

            console.log('');

        }

    }


    // --------------------------------------------------
    // Загальна статистика
    // --------------------------------------------------

    const totalDisciplines = allPlans.reduce(
        (sum, plan) => sum + plan.disciplines.length,
        0
    );

    console.log('======================================');
    console.log('СТАТИСТИКА');
    console.log('======================================');

    console.log(`Листів: ${allPlans.length}`);
    console.log(`Загальна кількість дисциплін: ${totalDisciplines}`);

} catch (error) {

    console.error('');
    console.error('ПОМИЛКА ПАРСИНГУ');
    console.error('======================================');
    console.error(error);

}