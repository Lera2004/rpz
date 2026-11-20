import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsPath = path.join(__dirname, '..', 'uploads');

const GROUPS = {
    '1-1': 'РПЗ 26 1/9',
    '1-2': 'РПЗ 26 2/9',

    '2-1': 'РПЗ 25 1/9',
    '2-2': 'РПЗ 25 2/9',

    '3-1': 'РПЗ 24 1/9',
    '3-2': 'РПЗ 24 2/9',

    '4-1': 'РПЗ 23 1/9',
    '4-2': 'РПЗ 23 2/9'
};


// =========================================================
// ДОПОМІЖНІ ФУНКЦІЇ
// =========================================================

function clean(value) {
    if (value === undefined || value === null) {
        return '';
    }

    return String(value)
        .replace(/\u00A0/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}


function number(value) {
    if (
        value === undefined ||
        value === null ||
        clean(value) === ''
    ) {
        return 0;
    }

    const text = clean(value)
        .replace(',', '.')
        .replace(/\s/g, '');

    const n = parseFloat(text);

    return Number.isFinite(n) ? n : 0;
}


function getCell(row, index) {
    if (!row) {
        return '';
    }

    return row[index] !== undefined
        ? row[index]
        : '';
}


function columnLetter(index) {
    let result = '';
    let n = index + 1;

    while (n > 0) {
        const remainder = (n - 1) % 26;
        result = String.fromCharCode(65 + remainder) + result;
        n = Math.floor((n - 1) / 26);
    }

    return result;
}


function isEmptyRow(row) {
    if (!row) {
        return true;
    }

    return row.every(
        cell => clean(cell) === ''
    );
}


// =========================================================
// РЯДКИ, ЯКІ НЕ Є ДИСЦИПЛІНАМИ
// =========================================================

function isTotalRow(name) {
    const value = clean(name)
        .toLowerCase()
        .replace(/\s+/g, ' ');

    if (!value) {
        return false;
    }

    return (
        value === 'всього' ||
        value === 'разом' ||
        value === 'total' ||

        value.includes('всього за циклом') ||
        value.includes('разом за циклом') ||

        value.includes('всього за освітнім компонентом') ||
        value.includes('всього за компонентом')
    );
}


function isSectionRow(name) {
    const value = clean(name).toLowerCase();

    return (
        value === 'практика' ||
        value.includes('освітні компоненти') ||
        value.includes('вибіркові освітні компоненти') ||
        value.includes('навчальна практика') ||
        value.includes('виробнича практика')
    );
}

function getDisciplineSection(row) {
    const heading = row
        .map(clean)
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('uk-UA');

    if (/загальн[\p{L}]*\s+компетенц/u.test(heading)) {
        return 'general';
    }

    if (/спеціальн[\p{L}]*\s+компетенц/u.test(heading)) {
        return 'special';
    }

    if (
        /вибірков[\p{L}]*\s+освітн[\p{L}]*\s+компонент/u.test(heading) ||
        /за вибором здобувача/.test(heading)
    ) {
        return 'elective';
    }

    if (
        /предмети за програмою профільної середньої освіти/.test(heading) ||
        /базові предмети/.test(heading)
    ) {
        return 'profile';
    }

    return null;
}


function isCalendarMarker(name) {
    const value = clean(name)
        .toUpperCase()
        .replace(/[–—-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    return [
        'ОТ',
        'ВТ',
        'ПП',
        'ДП',
        'К',
        'СТ',
        'А',
        'Е',
        'ВП'
    ].includes(value);
}


// =========================================================
// КОД ДИСЦИПЛІНИ
// =========================================================

function normalizeCode(value) {
    return clean(value)
        .replace(/\s+/g, '')
        .toUpperCase();
}


function isDisciplineCode(value) {
    const code = normalizeCode(value);

    if (!code) {
        return false;
    }

    // 1, 2, 3, 13, 24, 90...
    if (/^\d+$/.test(code)) {
        return true;
    }

    // ОК5, ОК24, ОК29...
    if (/^ОК\d+$/.test(code)) {
        return true;
    }

    // ВК2, ВК4, ВК7...
    if (/^ВК\d+$/.test(code)) {
        return true;
    }

    return false;
}


// =========================================================
// НАЗВА ГРУПИ
// =========================================================

function getGroupName(sheetName) {
    const parts = clean(sheetName).split('-');

    if (parts.length !== 3) {
        return null;
    }

    const key = `${parts[0]}-${parts[2]}`;

    return GROUPS[key] || null;
}


// =========================================================
// СЕМЕСТРИ
// =========================================================

function getSemesterPair(sheetName) {
    const parts = clean(sheetName).split('-');

    const course = Number(parts[0]);

    if (!course) {
        return {
            first: null,
            second: null
        };
    }

    const first = (course - 1) * 2 + 1;

    return {
        first,
        second: first + 1
    };
}


function addPresentValue(target, key, value, asNumber = true) {
    const text = clean(value);

    if (!text) {
        return;
    }

    if (asNumber) {
        const numericValue = number(value);

        if (numericValue !== 0) {
            target[key] = numericValue;
        }

        return;
    }

    target[key] = text;
}


function findHeaderColumn(headers, start, end, predicate) {
    for (let index = start; index <= end; index++) {
        if (predicate(clean(headers[index]).toLocaleLowerCase('uk-UA'))) {
            return index;
        }
    }

    return null;
}

function extractSemesterSummary(row, semester, semesterSlot, headers) {
    const start = semesterSlot === 1 ? 5 : 18;
    const end = semesterSlot === 1 ? 17 : 31;
    const summary = {
        semester
    };
    const hasHeaders = Array.from({ length: end - start + 1 }, (_, offset) =>
        clean(headers[start + offset])
    ).some(Boolean);
    const valueFor = (predicate, fallbackOffset) => {
        const index = findHeaderColumn(headers, start, end, predicate);
        return index === null
            ? hasHeaders ? '' : getCell(row, start + fallbackOffset)
            : getCell(row, index);
    };

    const numericFields = [
        ['totalHours', 0],
        ['classroomHours', 1],
        ['hoursPerWeek', 2],
        ['lectures', 3],
        ['practical', 4],
        ['laboratory', 5],
        ['seminars', 6],
        ['selfStudy', 7],
        ...(semesterSlot === 2
            ? [['fieldTraining', 8]]
            : []),
        ['courseWork', valueFor(header => header.includes('курсов'), semesterSlot === 1 ? 8 : 9)],
        ['calculationWork', valueFor(
            header => header.includes('розрахунк') || header.includes('графічн'),
            semesterSlot === 1 ? 9 : 10
        )]
    ];

    for (const [key, offsetOrValue] of numericFields) {
        const value = typeof offsetOrValue === 'number'
            ? getCell(row, start + offsetOrValue)
            : offsetOrValue;
        addPresentValue(summary, key, value);
    }

    const controlFields = [
        ['differentialCredit', header => header.includes('диференц') || /диф\.?\s*залік/.test(header), semesterSlot === 1 ? 10 : 11],
        ['credits', header => header.includes('залік') && !header.includes('диференц') && !/диф\.?\s*залік/.test(header), semesterSlot === 1 ? 10 : 11],
        ['exams', header => header.includes('екзамен') || header.includes('іспит'), semesterSlot === 1 ? 11 : 12],
        ['controlWorks', header => header.includes('контрольні роботи'), semesterSlot === 1 ? 12 : 13]
    ];

    for (const [key, predicate, fallbackOffset] of controlFields) {
        const value = valueFor(predicate, fallbackOffset);
        if (key !== 'controlWorks' || !isTeacherLike(value)) {
            addPresentValue(summary, key, value, false);
        }
    }

    for (let index = start; index <= end; index++) {
        const value = getCell(row, index);
        const key = controlFieldFromValue(value);
        if (key && summary[key] === undefined) {
            addPresentValue(summary, key, value, false);
        }
    }

    return summary;
}


function compactHours(values) {
    return Object.fromEntries(
        Object.entries(values)
            .filter(([, value]) => value !== 0 && value !== '')
    );
}


// =========================================================
// ПОБУДОВА КОПІЇ EXCEL З MERGED-КОМІРКАМИ
// =========================================================

function buildExpandedRows(workbook, worksheet) {
    const range = XLSX.utils.decode_range(
        worksheet['!ref']
    );

    const rows = XLSX.utils.sheet_to_json(
        worksheet,
        {
            header: 1,
            defval: '',
            raw: false
        }
    );

    /*
     * Робимо копію.
     */
    const expanded = rows.map(row => [
        ...row
    ]);

    /*
     * Розгортаємо merged cells.
     *
     * Це важливо, бо Excel часто має:
     *
     * "Вид контролю"
     *
     * об'єднаним заголовком.
     */

    const merges = worksheet['!merges'] || [];

    for (const merge of merges) {
        const startRow = merge.s.r;
        const endRow = merge.e.r;

        const startCol = merge.s.c;
        const endCol = merge.e.c;

        const firstValue = clean(
            getCell(
                expanded[startRow],
                startCol
            )
        );

        if (!firstValue) {
            continue;
        }

        for (
            let r = startRow;
            r <= endRow;
            r++
        ) {
            if (!expanded[r]) {
                expanded[r] = [];
            }

            for (
                let c = startCol;
                c <= endCol;
                c++
            ) {
                if (
                    clean(
                        getCell(
                            expanded[r],
                            c
                        )
                    ) === ''
                ) {
                    expanded[r][c] = firstValue;
                }
            }
        }
    }

    return expanded;
}


// =========================================================
// ЗАГОЛОВКИ КОЛОНОК
// =========================================================

function buildColumnHeaders(rows, startRow = 0, endRow = rows.length) {
    const headers = {};

    const maxColumns = Math.max(
        ...rows.map(row => row.length),
        0
    );

    /*
     * Заголовки зазвичай знаходяться
     * у верхніх 30 рядках.
     */

    const headerStart = Math.max(0, startRow);
    const headerEnd = Math.min(rows.length, endRow);

    for (
        let column = 0;
        column < maxColumns;
        column++
    ) {
        const parts = [];

        for (
            let             rowIndex = headerStart;
            rowIndex < headerEnd;
            rowIndex++
        ) {
            const value = clean(
                getCell(
                    rows[rowIndex],
                    column
                )
            );

            if (!value) {
                continue;
            }

            /*
             * Не додаємо однакові значення.
             */

            if (!parts.includes(value)) {
                parts.push(value);
            }
        }

        headers[column] = parts.join(' / ');
    }

    return headers;
}


// =========================================================
// ПОШУК ВИКЛАДАЧА / ДУБЛЕРА
// =========================================================

function isControlText(value) {
    const text = clean(value)
        .toUpperCase()
        .replace(/\s+/g, ' ');

    if (!text) {
        return false;
    }

    return (
        text === 'ЗВ' ||
        text === 'ЗАЛІК' ||
        text === 'ЗАЛ' ||
        text === 'ЕКЗАМЕН' ||
        text === 'ЕКЗ' ||
        text === 'ДИФ' ||
        text === 'ДИФ. ЗАЛІК' ||
        text === 'ДИФЗАЛІК' ||
        text === 'КП' ||
        text === 'КР' ||
        text === 'ДП' ||
        text === 'ПР' ||
        text === 'А'
    );
}

function controlFieldFromValue(value) {
    const text = clean(value)
        .toLocaleLowerCase('uk-UA')
        .replace(/[.\s-]+/g, '');

    if (text.includes('диференц') || text === 'диф' || text === 'дифзалік') return 'differentialCredit';
    if (text === 'екз' || text === 'екзамен') return 'exams';
    if (text === 'зв' || text === 'зал' || text === 'залік') return 'credits';
    return null;
}


function isTeacherLike(value) {
    const text = clean(value);

    if (!text) {
        return false;
    }

    if (number(text).toString() === text) {
        return false;
    }

    if (isControlText(text)) {
        return false;
    }

    /*
     * Викладач — текст, у якому є літери.
     */

    return /[А-ЯІЇЄҐа-яіїєґA-Za-z]/.test(text);
}


function findTeacherAndSubstitute(row, headers) {
    const candidates = [];

    /*
     * Спочатку дивимося на заголовки.
     */

    for (let i = 0; i < row.length; i++) {
        const header = clean(headers[i]);

        if (!header) {
            continue;
        }

        const headerLower = header.toLowerCase();

        const isTeacherColumn =
            headerLower.includes('викладач') ||
            headerLower.includes('викон');

        const isSubstituteColumn =
            headerLower.includes('дублер') ||
            headerLower.includes('заміна') ||
            headerLower.includes('замiна');

        if (
            isTeacherColumn ||
            isSubstituteColumn
        ) {
            const value = clean(
                getCell(row, i)
            );

            if (!value) {
                continue;
            }

            candidates.push({
                index: i,
                value,
                teacher: isTeacherColumn,
                substitute: isSubstituteColumn
            });
        }
    }

    let teacher = '';
    let substitute = '';

    for (const item of candidates) {
        if (item.substitute) {
            substitute = item.value;
        } else if (item.teacher) {
            teacher = item.value;
        }
    }

    /*
     * Якщо заголовки Excel не дозволили визначити
     * викладача — шукаємо праворуч.
     *
     * У твоєму файлі це особливо важливо:
     *
     * ... контроль ... | Викладач | Дублер
     */

    if (!teacher || !substitute) {
        const textCandidates = [];

        for (let i = 25; i < row.length; i++) {
            const value = clean(
                getCell(row, i)
            );

            if (!isTeacherLike(value)) {
                continue;
            }

            textCandidates.push({
                index: i,
                value
            });
        }

        /*
         * Беремо тільки текстові значення,
         * які знаходяться ближче до кінця рядка.
         */

        if (textCandidates.length > 0) {
            if (!teacher) {
                teacher =
                    textCandidates[
                        textCandidates.length - 2
                    ]?.value ||
                    textCandidates[
                        textCandidates.length - 1
                    ]?.value ||
                    '';
            }

            if (!substitute) {
                substitute =
                    textCandidates[
                        textCandidates.length - 1
                    ]?.value || '';
            }

            /*
             * Якщо знайшовся лише один текст —
             * це основний викладач, а дублер порожній.
             */

            if (
                textCandidates.length === 1
            ) {
                teacher =
                    textCandidates[0].value;

                substitute = '';
            }
        }
    }

    /*
     * Якщо викладач та дублер випадково
     * визначилися однаковими — дублера не дублюємо.
     */

    if (
        teacher &&
        substitute &&
        teacher === substitute
    ) {
        substitute = '';
    }

    return {
        teacher,
        substitute
    };
}


// =========================================================
// УСІ ЗНАЧЕННЯ РЯДКА
// =========================================================

const disciplineBaseColumnLabels = {
    0: '№ за навчальним планом',
    1: 'Назва дисципліни',
    2: 'Годин за навчальним планом',
    3: 'Годин прочитано в минулому році (семестрі)',
    4: 'Годин на поточний навчальний рік',
    32: 'Основний викладач',
    33: 'Викладач-дублер'
}

const firstSemesterDisciplineLabels = [
    'Усього годин',
    'Аудиторних годин',
    'Годин на тиждень',
    'Лекції',
    'Практичні заняття',
    'Лабораторні заняття',
    'Семінарські та практичні заняття',
    'Самостійна робота / заняття з ЗОП',
    'Курсові проєкти (роботи)',
    'Розрахункові та графічні роботи',
    'Контрольні заходи — залік',
    'Контрольні заходи — екзамен',
    'Контрольні заходи — обов’язкові контрольні роботи'
]

const secondSemesterDisciplineLabels = [
    ...firstSemesterDisciplineLabels.slice(0, 8),
    'Навчально-польові збори / заняття',
    ...firstSemesterDisciplineLabels.slice(8)
]

const practiceBaseColumnLabels = {
    0: 'Назва практики',
    13: 'За планом — усього годин',
    14: 'За планом — усього годин',
    15: 'За планом — усього годин',
    16: 'За планом — аудиторних годин',
    17: 'За планом — аудиторних годин',
    18: 'За планом — аудиторних годин',
    19: 'За планом — годин самостійної роботи',
    20: 'За планом — годин самостійної роботи',
    21: 'Тривалість практики — тижнів',
    36: 'Основний викладач',
    41: 'Викладач-дублер'
}

const semesterNames = [
    'перший',
    'другий',
    'третій',
    'четвертий',
    'п’ятий',
    'шостий',
    'сьомий',
    'восьмий'
]
const practiceSemesterLabels = {
    totalHours: 'Усього годин',
    classroomHours: 'Аудиторних годин',
    weeklyHours: 'Годин на тиждень',
    differentialCredit: 'Контрольні заходи — диференційний залік',
    credit: 'Контрольні заходи — залік'
}

function practiceSemesterField(index) {
    if (index === 0) return practiceSemesterLabels.totalHours
    if (index === 1 || index === 2) return practiceSemesterLabels.classroomHours
    if (index === 3 || index === 4) return practiceSemesterLabels.weeklyHours
    if (index === 5) return practiceSemesterLabels.differentialCredit
    return practiceSemesterLabels.credit
}

function semesterName(value) {
    const name = semesterNames[value - 1] || `${value}-й`
    return name.charAt(0).toLocaleUpperCase('uk-UA') + name.slice(1)
}

function getSourceColumnLabel(index, kind, semesters, headers, value) {
    if (kind === 'practice') {
        const header = clean(headers[index]).toLowerCase();
        if (index >= 36 && header.includes('дублер')) return 'Викладач-дублер';
        if (index >= 36 && header.includes('основний')) return 'Основний викладач';

        if (index === 0 && !clean(value).toLowerCase().includes('практик')) {
            return 'Продовження назви практики'
        }

        const baseLabel = practiceBaseColumnLabels[index]
        if (baseLabel) return baseLabel

        if (index >= 22 && index <= 28) {
            return `${semesterName(semesters.first)} семестр — ${practiceSemesterField(index - 22)}`
        }

        if (index >= 29 && index <= 35) {
            return `${semesterName(semesters.second)} семестр — ${practiceSemesterField(index - 29)}`
        }
    } else {
        if (index >= 5 && index <= 31) {
            const header = clean(headers[index]).toLocaleLowerCase('uk-UA');
            const valueControl = controlFieldFromValue(value);
            if (valueControl) {
                const controlLabels = {
                    credits: 'Контрольні заходи — залік',
                    differentialCredit: 'Контрольні заходи — диференційний залік',
                    exams: 'Контрольні заходи — екзамен'
                }
                const label = controlLabels[valueControl]
                if (label) {
                    const semester = index <= 17 ? semesters.first : semesters.second
                    return `${semesterName(semester)} семестр — ${label}`
                }
            }
            const semanticLabel = header.includes('диференц')
                ? 'Контрольні заходи — диференційний залік'
                : header.includes('залік')
                    ? 'Контрольні заходи — залік'
                    : header.includes('екзамен') || header.includes('іспит')
                        ? 'Контрольні заходи — екзамен'
                        : header.includes('контрольні роботи')
                            ? 'Контрольні заходи — обов’язкові контрольні роботи'
                            : header.includes('курсов')
                                ? 'Курсові роботи'
                                : header.includes('розрахунк') || header.includes('графічн')
                                    ? 'Розрахункові та графічні роботи'
                                    : ''

            if (semanticLabel) {
                const semester = index <= 17 ? semesters.first : semesters.second
                return `${semesterName(semester)} семестр — ${semanticLabel}`
            }
        }

        const baseLabel = disciplineBaseColumnLabels[index]
        if (baseLabel) return baseLabel

        if (index >= 5 && index <= 17) {
            return `${semesterName(semesters.first)} семестр — ${firstSemesterDisciplineLabels[index - 5]}`
        }

        if (index >= 18 && index <= 31) {
            return `${semesterName(semesters.second)} семестр — ${secondSemesterDisciplineLabels[index - 18]}`
        }
    }

    const header = clean(headers[index])
    if (header && !header.includes('/')) {
        return `За заголовком «${header}»`
    }

    return `Додаткові дані (колонка ${columnLetter(index)})`
}

function readAllColumns(row, kind, semesters, headers) {
    const result = [];

    for (
        let i = 0;
        i < row.length;
        i++
    ) {
        const value = clean(
            getCell(row, i)
        );

        if (!value) {
            continue;
        }

        result.push({
            column: columnLetter(i),
            index: i,
            label: getSourceColumnLabel(i, kind, semesters, headers, value),
            value
        });
    }

    return result;
}


// =========================================================
// ПОШУК ГОДИН
// =========================================================

function extractHours(row, headers) {
    const result = {};

    /*
     * ВАЖЛИВО:
     *
     * Тут НЕ вгадуємо, що саме є годинами
     * тільки за одним індексом.
     *
     * Зберігаємо всі числові значення.
     */

    for (
        let i = 2;
        i < row.length;
        i++
    ) {
        const raw = clean(
            getCell(row, i)
        );

        if (!raw) {
            continue;
        }

        const n = number(raw);

        if (!Number.isFinite(n)) {
            continue;
        }

        result[columnLetter(i)] = {
            column: columnLetter(i),
            index: i,
            header: clean(headers[i]),
            value: raw,
            number: n
        };
    }

    return result;
}


// =========================================================
// ПОШУК ВИДІВ КОНТРОЛЮ
// =========================================================

function extractControls(row, headers) {
    const controls = [];

    for (
        let i = 0;
        i < row.length;
        i++
    ) {
        const value = clean(
            getCell(row, i)
        );

        const header = clean(
            headers[i]
        );

        const combined =
            `${header} ${value}`
                .toLowerCase();

        const looksLikeControl =
            isControlText(value) ||

            combined.includes('екзам') ||
            combined.includes('залік') ||
            combined.includes('диф') ||
            combined.includes('контрол') ||
            combined.includes('кп') ||
            combined.includes('кр');

        if (!looksLikeControl) {
            continue;
        }

        controls.push({
            column: columnLetter(i),
            index: i,
            header,
            value
        });
    }

    return controls;
}


// =========================================================
// СЕМЕСТРОВІ ДАНІ
// =========================================================

function extractSemesterData(
    row,
    headers,
    semester
) {
    const data = [];

    for (
        let i = 2;
        i < row.length;
        i++
    ) {
        const value = clean(
            getCell(row, i)
        );

        if (!value) {
            continue;
        }

        data.push({
            semester,
            column: columnLetter(i),
            index: i,
            header: clean(headers[i]),
            value,
            number: number(value)
        });
    }

    return data;
}


// =========================================================
// ЧИ Є ЦЕ РЯДОК ПРАКТИКИ
// =========================================================

function looksLikePracticeName(name) {
    const value = clean(name).toLowerCase();

    return (
        value.includes('практика') ||
        value.includes('практики')
    );
}


function isRealPracticeName(name) {
    const value = clean(name).toLowerCase();

    return (
        looksLikePracticeName(value) &&
        value !== 'назва практики' &&
        value !== 'практика' &&
        !value.startsWith('позначення:') &&
        !value.startsWith('пп –') &&
        !value.startsWith('пп -')
    );
}


function readPracticeTeacher(row, headers, kind) {
    for (let i = 0; i < row.length; i++) {
        const header = clean(headers[i]).toLowerCase();
        const matches = kind === 'teacher'
            ? header.includes('основний') || header === 'викладач'
            : header.includes('дублер');

        if (matches) {
            const value = clean(getCell(row, i));

            if (value && isTeacherLike(value)) {
                return value;
            }
        }
    }

    const candidates = [...new Set(
        row.slice(36)
            .map(clean)
            .filter(value => value && isTeacherLike(value))
    )]

    if (kind === 'teacher' && candidates.length) return candidates[0]
    if (kind === 'substitute' && candidates.length > 1) return candidates[1]

    const fixedIndex = kind === 'teacher' ? 36 : 41;
    const fixedValue = clean(getCell(row, fixedIndex));
    if (fixedValue && isTeacherLike(fixedValue)) return fixedValue

    return '';
}


function extractPracticeSemester(row, semester, start) {
    const summary = { semester };

    addPresentValue(summary, 'totalHours', getCell(row, start));
    addPresentValue(summary, 'classroomHours', getCell(row, start + 1));
    addPresentValue(summary, 'hoursPerWeek', getCell(row, start + 3));
    addPresentValue(summary, 'differentialCredit', getCell(row, start + 5), false);
    addPresentValue(summary, 'credits', getCell(row, start + 6), false);

    return summary;
}

function hasPracticeData(row) {
    const practiceColumns = [
        13, 16, 19, 21,
        22, 25, 27, 28,
        29, 32, 34, 35,
        36, 41, 42
    ];

    return practiceColumns.some(index => {
        return clean(getCell(row, index)) !== '';
    });
}


// =========================================================
// ЧИТАННЯ ДИСЦИПЛІН
// =========================================================

function readDisciplines(
    rows,
    sheetName,
    headers
) {
    const disciplines = [];
    let currentSection = 'profile';

    const semesters =
        getSemesterPair(sheetName);

    /*
     * ГОЛОВНА ВІДМІННІСТЬ:
     *
     * НЕ шукаємо "Практика"
     * і НЕ обрізаємо таблицю.
     *
     * Переглядаємо ВЕСЬ лист.
     */

    for (
        let rowIndex = 0;
        rowIndex < rows.length;
        rowIndex++
    ) {
        const row = rows[rowIndex];
        const rowSection = getDisciplineSection(row);
        if (rowSection) {
            currentSection = rowSection;
            continue;
        }

        if (isEmptyRow(row)) {
            continue;
        }

        const code = normalizeCode(
            getCell(row, 0)
        );

        const name = clean(
            getCell(row, 1)
        );

        /*
         * Код + назва ОБОВ'ЯЗКОВІ.
         */

        if (!code || !name) {
            continue;
        }

        /*
         * Спочатку відсікаємо "Всього за циклом".
         *
         * Це критично!
         */

        if (isTotalRow(name)) {
            continue;
        }

        /*
         * Відсікаємо службові заголовки.
         */

        if (isSectionRow(name)) {
            continue;
        }

        /*
         * На календарному аркуші позначення тижнів
         * виглядають як дисципліна: наприклад, код "2",
         * назва "ОТ" і значення "К" у колонці викладача.
         * Це службові позначення, а не елементи плану.
         */

        if (isCalendarMarker(name)) {
            continue;
        }

        /*
         * Не беремо практику як дисципліну.
         */

        if (
            looksLikePracticeName(name)
        ) {
            continue;
        }

        /*
         * Перевіряємо код.
         */

        if (!isDisciplineCode(code)) {
            continue;
        }

        /*
         * Отримуємо викладача.
         */

        const {
            teacher,
            substitute
        } = findTeacherAndSubstitute(
            row,
            headers
        );

        /*
         * УСІ години.
         */

        const hours =
            extractHours(
                row,
                headers
            );

        /*
         * УСІ контролі.
         */

        const controls =
            extractControls(
                row,
                headers
            );

        /*
         * УСІ значення рядка.
         */

        const allColumns =
            readAllColumns(
                row,
                'discipline',
                semesters,
                headers
            );

        const summaryHours = {};
        addPresentValue(summaryHours, 'plan', getCell(row, 2));
        addPresentValue(summaryHours, 'previousYear', getCell(row, 3));
        addPresentValue(summaryHours, 'currentYear', getCell(row, 4));

        /*
         * Семестрові дані.
         *
         * Не викидаємо дисципліну,
         * навіть якщо годин 0.
         */

        const semester1 =
            extractSemesterData(
                row,
                headers,
                semesters.first
            );

        const semester2 =
            extractSemesterData(
                row,
                headers,
                semesters.second
            );

        /*
         * Визначаємо тип.
         */

        let type = 'discipline';

        if (/^ОК\d+$/.test(code)) {
            type = 'ОК';
        }

        if (/^ВК\d+$/.test(code)) {
            type = 'ВК';
        }

        const discipline = {
            row: rowIndex + 1,

            code,
            name,
            type,
            section: currentSection,

            teacher,
            substitute,
            sourceData: {
                sheet: sheetName,
                row: rowIndex + 1,
                section: currentSection,
                columns: allColumns,
                hours,
                summaryHours,
                controls,
                semesters: [
                    { semester: semesters.first, values: semester1 },
                    { semester: semesters.second, values: semester2 }
                ]
            },

            hours: compactHours({
                plan: number(getCell(row, 2)),
                previousYear: number(getCell(row, 3)),
                currentYear: number(getCell(row, 4)),
            }),

            semesters: [
                extractSemesterSummary(row, semesters.first, 1, headers),
                extractSemesterSummary(row, semesters.second, 2, headers)
            ].filter(item => Object.keys(item).length > 1)
        };

        disciplines.push(
            discipline
        );
    }

    return disciplines;
}


// =========================================================
// ЧИТАННЯ ПРАКТИК
// =========================================================

function readPractices(
    rows,
    sheetName,
    headers
) {
    const practices = [];

    const semesters =
        getSemesterPair(sheetName);

    let inPracticeSection = false;
    let practiceBaseName = '';

    for (
        let rowIndex = 0;
        rowIndex < rows.length;
        rowIndex++
    ) {
        const row = rows[rowIndex];

        if (isEmptyRow(row)) {
            continue;
        }

        const rowText = row
            .map(clean)
            .join(' ')
            .toLowerCase();

        /*
         * Виявляємо секцію "Практика".
         */

        if (
            rowText === 'практика' ||
            rowText.includes('практика')
        ) {
            inPracticeSection = true;
        }

        /*
         * Код практики зазвичай відсутній.
         */

        const firstCell = clean(
            getCell(row, 0)
        );

        const secondCell = clean(
            getCell(row, 1)
        );

        /* У таблиці практик назва знаходиться у колонці A,
         * тоді як у таблиці дисциплін — у колонці B. */
        const code = secondCell ? firstCell : '';
        let name = secondCell || firstCell;

        if (
            name.toLowerCase() === 'навчальна практика' &&
            !hasPracticeData(row)
        ) {
            practiceBaseName = name;
        } else if (
            practiceBaseName &&
            name.toLowerCase().startsWith('з ')
        ) {
            name = `${practiceBaseName} ${name}`;
        }

        /*
         * Практику також намагаємося
         * знаходити навіть без секції.
         */

        /*
         * Практика не обов'язково починається з окремого рядка
         * "Практика". У різних версіях плану секція може бути
         * без назви або назва практики може одразу йти після
         * підсумкового рядка. Тому визначаємо її за назвою, а не
         * тільки за прапорцем inPracticeSection.
         */
        const isPracticeName =
            name &&
            isRealPracticeName(name);

        /*
         * У таблицях 2-го та 3-го курсів назва рядка
         * може бути продовженням попереднього рядка:
         * "Навчальна практика" → "з програмування".
         * Такі назви не містять слова "практика", але
         * після заголовка секції містять власні години.
         */
        const isPracticeDataRow =
            inPracticeSection &&
            firstCell &&
            name.toLowerCase() !== 'назва практики' &&
            !secondCell &&
            hasPracticeData(row);

        const isPractice =
            (isPracticeName && hasPracticeData(row)) ||
            isPracticeDataRow;

        if (!isPractice) {
            continue;
        }

        if (isTotalRow(name)) {
            continue;
        }

        const teacher = readPracticeTeacher(row, headers, 'teacher');
        const substitute = readPracticeTeacher(row, headers, 'substitute');

        /*
         * Зберігаємо ВСІ значення,
         * не тільки 36 / 54 годин.
         */

        const semester1 =
            extractSemesterData(
                row,
                headers,
                semesters.first
            );

        const semester2 =
            extractSemesterData(
                row,
                headers,
                semesters.second
            );
        const hours = extractHours(row, headers);
        const controls = extractControls(row, headers);
        const allColumns = readAllColumns(row, 'practice', semesters, headers);

        /*
         * Визначаємо години практики.
         *
         * Перш за все беремо очевидні
         * колонки за заголовками.
         */

        const totalHours = number(getCell(row, 13));
        const classroomHours = number(getCell(row, 16));
        const selfStudyHours = number(getCell(row, 19));
        const weeks = number(getCell(row, 21));

        /*
         * Якщо заголовки не дозволили визначити
         * конкретні поля — зберігаємо всі значення
         * у hours, тому інформація не губиться.
         */

        practices.push({
            row: rowIndex + 1,

            code,

            name,

            type: 'practice',

            teacher,
            substitute,

            sourceData: {
                sheet: sheetName,
                row: rowIndex + 1,
                columns: allColumns,
                hours,
                summaryHours: compactHours({
                    total: totalHours,
                    classroom: classroomHours,
                    selfStudy: selfStudyHours,
                    weeks
                }),
                controls,
                semesters: [
                    { semester: semesters.first, values: semester1 },
                    { semester: semesters.second, values: semester2 }
                ]
            },

            hours: compactHours({
                total: totalHours,
                classroom: classroomHours,
                selfStudy: selfStudyHours,
                weeks
            }),

            semesters: [
                extractPracticeSemester(row, semesters.first, 22),
                extractPracticeSemester(row, semesters.second, 29)
            ].filter(item => Object.keys(item).length > 1)
        });
    }

    return practices;
}


// =========================================================
// ДЕТАЛЬНИЙ ВИВІД ДИСЦИПЛІНИ
// =========================================================

function printDiscipline(item, log = console.log) {
    log('');
    log(`    ${item.code} | ${item.name}`);
    log(`      Основний викладач: ${item.teacher || '-'}`);
    log(`      Дублер: ${item.substitute || '-'}`);
    log(`      Тип: ${item.type}`);

    for (const [key, value] of Object.entries(item.hours)) {
        log(`        ${key}: ${value}`);
    }
}


// =========================================================
// ДЕТАЛЬНИЙ ВИВІД ПРАКТИКИ
// =========================================================

function printPractice(item, log = console.log) {
    log('');
    log(
        `    ${item.name}`
    );

    log(
        `      Основний викладач: ${item.teacher || '-'}`
    );

    log(
        `      Дублер: ${item.substitute || '-'}`
    );

    for (const [key, value] of Object.entries(item.hours)) {
        log(
            `        ${key}: ${value}`
        );
    }
}


// =========================================================
// ПОШУК EXCEL
// =========================================================

function findExcelFile() {
    const files =
        fs.readdirSync(
            uploadsPath
        );

    const excelFiles =
        files.filter(file => {
            const ext =
                path.extname(file)
                    .toLowerCase();

            return (
                ext === '.xls' ||
                ext === '.xlsx'
            );
        });

    if (
        excelFiles.length === 0
    ) {
        throw new Error(
            'Excel-файл не знайдено в папці uploads'
        );
    }

    /*
     * Беремо останній файл за датою
     * зміни, а не випадковий перший.
     */

    excelFiles.sort(
        (a, b) => {
            const statA =
                fs.statSync(
                    path.join(
                        uploadsPath,
                        a
                    )
                );

            const statB =
                fs.statSync(
                    path.join(
                        uploadsPath,
                        b
                    )
                );

            return (
                statB.mtimeMs -
                statA.mtimeMs
            );
        }
    );

    return excelFiles[0];
}


// =========================================================
// ОСНОВНА ФУНКЦІЯ
// =========================================================

export function parseStudyPlan(buffer, logger = null) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Файл навчального плану порожній або не переданий');
    }

    const log = typeof logger === 'function' ? logger : () => {}

    /*
     * raw:false залишає форматовані значення Excel.
     */
    const workbook = XLSX.read(buffer, {
        cellDates: true,
        cellNF: false,
        cellText: true
    });

    log(
        'Кількість листів:',
        workbook.SheetNames.length
    );

    log('');

    /*
     * Обробляємо КОЖЕН лист.
     */

    const plans = [];

    for (
        const sheetName
        of workbook.SheetNames
    ) {
        const worksheet =
            workbook.Sheets[
                sheetName
            ];

        if (!worksheet) {
            continue;
        }

        const groupName =
            getGroupName(
                sheetName
            );

        if (!groupName) {
            log(
                `⚠ ${sheetName} → групу не визначено, лист все одно імпортується`
            );
        }

        const resolvedGroupName =
            groupName || sheetName;

        /*
         * ВАЖЛИВО:
         *
         * Тут розгортаємо merged cells.
         */

        const rawRows = XLSX.utils.sheet_to_json(
            worksheet,
            {
                header: 1,
                defval: '',
                raw: false
            }
        );

        const rows =
            buildExpandedRows(
                workbook,
                worksheet
            );

        /*
         * Будуємо заголовки.
         */

        const disciplineHeaders = buildColumnHeaders(rows, 2, 6);
        const practiceHeaders = buildColumnHeaders(rows, 21, 24);

        /*
         * Читаємо дисципліни
         * з УСЬОГО листа.
         */

        const disciplines =
            readDisciplines(
                rawRows,
                sheetName,
                disciplineHeaders
            );

        /*
         * Читаємо практики
         * з УСЬОГО листа.
         */

        const practices =
            readPractices(
                rawRows,
                sheetName,
                practiceHeaders
            );

        /*
         * Один результат для всіх елементів плану.
         * ОК, ВК, звичайні дисципліни та практики не губляться
         * і можуть бути відображені однаково на фронтенді.
         */
        plans.push({
            sheet: sheetName,
            group: resolvedGroupName,
            course: getSemesterPair(sheetName).first
                ? Number(clean(sheetName).split('-')[0])
                : null,
            semesters: getSemesterPair(sheetName),
            items: [
                ...disciplines,
                ...practices
            ]
        });

        log(
            `✓ ${sheetName.padEnd(8)} → ${resolvedGroupName.padEnd(15)} → ${disciplines.length} дисципл. → ${practices.length} практик`
        );

        /*
         * ==================================================
         * ДИСЦИПЛІНИ
         * ==================================================
         */

        if (
            disciplines.length > 0
        ) {
            log(
                '  Дисципліни:'
            );

            for (
                const item
                of disciplines
            ) {
                printDiscipline(item, log);
            }
        }

        /*
         * ==================================================
         * ПРАКТИКИ
         * ==================================================
         */

        if (
            practices.length > 0
        ) {
            log('');
            log(
                '  Практики:'
            );

            for (
                const item
                of practices
            ) {
                printPractice(item, log);
            }
        }

        log('');

        /*
         * Окремо показуємо коди.
         *
         * Це дуже зручно для перевірки:
         *
         * ОК5
         * ОК7
         * ОК24
         * ВК2
         */

        if (
            disciplines.length > 0
        ) {
            log(
                '  Коди дисциплін:'
            );

            log(
                '   ',
                disciplines
                    .map(
                        item =>
                            item.code
                    )
                    .join(', ')
            );

            log('');
        }
    }

    return plans;
}

async function main() {
    try {
        const excelFile = findExcelFile();
        const filePath = path.join(uploadsPath, excelFile);
        const plans = parseStudyPlan(fs.readFileSync(filePath), console.log);
        const outputPath = path.join(__dirname, 'parsed-plan.json');

        fs.writeFileSync(outputPath, JSON.stringify(plans, null, 4), 'utf8');
        console.log('JSON збережено:', outputPath);
        console.log('ІМПОРТ ЗАВЕРШЕНО');
    } catch (error) {
        console.error('');
        console.error(
            '❌ ПОМИЛКА:'
        );

        console.error(error);

        process.exit(1);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}