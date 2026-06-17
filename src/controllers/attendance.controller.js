const ExcelJS = require('exceljs');
const AttendanceModel = require('../models/attendance.model');

/**
 * Validates that a date range does not exceed maxDays and start <= end.
 * @param {string} startDate - ISO date string.
 * @param {string} endDate - ISO date string.
 * @param {number} maxDays - Maximum allowed range in days.
 * @returns {{ valid: boolean, message?: string }}
 */
const validateDateRange = (startDate, endDate, maxDays = 90) => {
    if (!startDate && !endDate) return { valid: true };
    if (!startDate || !endDate) return { valid: false, message: 'Both start_date and end_date are required' };

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return { valid: false, message: 'Invalid date format' };
    }

    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays > maxDays) {
        return { valid: false, message: `Date range must not exceed ${maxDays} days` };
    }
    if (start > end) {
        return { valid: false, message: 'start_date must be before or equal to end_date' };
    }
    return { valid: true };
};

/**
 * Escapes a value for safe CSV output, preventing formula injection.
 * Prefixes formula-triggering characters (=, +, -, @, tab, CR) with
 * a single quote so spreadsheet software treats them as text.
 * @param {*} value - The value to escape.
 * @returns {string}
 */
const escapeCsv = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    const needsDefuse = /^[=+\-@\t\r]/.test(str);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || needsDefuse) {
        return `"${needsDefuse ? "'" : ''}${str.replace(/"/g, '""')}"`;
    }
    return str;
};

/**
 * Sanitizes a string for use as an Excel worksheet name.
 * Excel limits sheet names to 31 characters and prohibits: \ / ? * [ ]
 * @param {string} name - The raw name.
 * @returns {string}
 */
const sanitizeSheetName = (name) => {
    if (!name || typeof name !== 'string') return 'Unclassified';
    return name.replace(/[\\/?*\[\]]/g, '_').substring(0, 31) || 'Unclassified';
};

/**
 * Groups records by class name.
 * @param {Array} records - Attendance records with a `class` field.
 * @returns {Map<string, Array>}
 */
const groupByClass = (records) => {
    const groups = new Map();
    for (const record of records) {
        const className = record.class || 'Unclassified';
        if (!groups.has(className)) {
            groups.set(className, []);
        }
        groups.get(className).push(record);
    }
    return groups;
};

const AttendanceController = {
    getByDate: async (req, res, next) => {
        try {
            // Defensive check: ensure query parameters are strings to prevent type confusion / prototype pollution.
            const start_date = typeof req.query.start_date === 'string' ? req.query.start_date : undefined;
            const end_date = typeof req.query.end_date === 'string' ? req.query.end_date : undefined;
            const student_id = typeof req.query.student_id === 'string' ? req.query.student_id : undefined;
            const className = typeof req.query.class === 'string' ? req.query.class : undefined;
            const groupBy = typeof req.query.groupBy === 'string' ? req.query.groupBy : undefined;
            const hasAdvancedFilters = start_date || end_date || student_id || className || groupBy;

            if (hasAdvancedFilters) {
                const page = Math.max(1, parseInt(req.query.page, 10) || 1);
                const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

                if (start_date || end_date) {
                    const rangeCheck = validateDateRange(start_date, end_date);
                    if (!rangeCheck.valid) {
                        return res.status(400).json({ success: false, message: rangeCheck.message });
                    }
                }

                const { rows: records, total } = await AttendanceModel.findAdvanced(
                    { startDate: start_date, endDate: end_date, studentId: student_id, className, groupBy },
                    page,
                    limit
                );

                const totalPages = Math.ceil(total / limit);
                return res.json({
                    success: true,
                    data: records,
                    count: records.length,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages,
                    },
                });
            }

            // Ensure date query parameter is a string to prevent type-confusion SQL errors.
            const dateQuery = typeof req.query.date === 'string' ? req.query.date : undefined;
            const date = dateQuery || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
            const { rows: records, total } = await AttendanceModel.findByDate(date, page, limit);
            const totalPages = Math.ceil(total / limit);
            res.json({
                success: true,
                date,
                data: records,
                count: records.length,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                },
            });
        } catch (err) {
            next(err);
        }
    },
    getByStudent: async (req, res, next) => {
        try {
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
            const { rows: records, total } = await AttendanceModel.findByStudentId(req.params.id, page, limit);
            const totalPages = Math.ceil(total / limit);
            res.json({
                success: true,
                data: records,
                count: records.length,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                },
            });
        } catch (err) {
            next(err);
        }
    },
    getStats: async (req, res, next) => {
        try {
            const stats = await AttendanceModel.getStats();
            res.json({ success: true, data: stats });
        } catch (err) {
            next(err);
        }
    },
    exportFile: async (req, res, next) => {
        try {
            // Defensive check: ensure query parameters are strings to prevent type-confusion or crash attacks.
            const format = typeof req.query.format === 'string' ? req.query.format : undefined;
            const start_date = typeof req.query.start_date === 'string' ? req.query.start_date : undefined;
            const end_date = typeof req.query.end_date === 'string' ? req.query.end_date : undefined;
            const student_id = typeof req.query.student_id === 'string' ? req.query.student_id : undefined;
            const className = typeof req.query.class === 'string' ? req.query.class : undefined;
            const exportFormat = format === 'csv' ? 'csv' : 'xlsx';

            if (start_date || end_date) {
                const rangeCheck = validateDateRange(start_date, end_date);
                if (!rangeCheck.valid) {
                    return res.status(400).json({ success: false, message: rangeCheck.message });
                }
            }

            const records = await AttendanceModel.findAdvancedForExport(
                { startDate: start_date, endDate: end_date, studentId: student_id, className },
                10000
            );

            if (records.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No records found for the given filters',
                });
            }

            const safeStart = (start_date || 'all').replace(/[^a-zA-Z0-9_-]/g, '');
            const safeEnd = (end_date || 'all').replace(/[^a-zA-Z0-9_-]/g, '');

            if (exportFormat === 'csv') {
                const header = 'student_id,full_name,class,check_in_time,device_id,status';
                const rows = records.map(r => [
                    escapeCsv(r.student_id),
                    escapeCsv(r.full_name),
                    escapeCsv(r.class),
                    escapeCsv(r.check_in_time),
                    escapeCsv(r.device_id),
                    escapeCsv(r.status),
                ].join(','));

                const csv = '\ufeff' + [header, ...rows].join('\n');
                const filename = `attendance_${safeStart}_to_${safeEnd}.csv`;
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                return res.send(csv);
            }

            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'IoT Attendance';
            workbook.created = new Date();

            const classGroups = groupByClass(records);
            const summaryData = [];
            const usedSheetNames = new Set(['summary']);

            for (const [classNameKey, classRecords] of classGroups) {
                let baseSheetName = sanitizeSheetName(classNameKey);
                let sheetName = baseSheetName;
                let counter = 1;

                while (usedSheetNames.has(sheetName.toLowerCase())) {
                    const suffix = `(${counter})`;
                    sheetName = baseSheetName.substring(0, 31 - suffix.length) + suffix;
                    counter++;
                }
                usedSheetNames.add(sheetName.toLowerCase());

                const worksheet = workbook.addWorksheet(sheetName);

                worksheet.columns = [
                    { header: 'Student ID', key: 'student_id', width: 15 },
                    { header: 'Full Name', key: 'full_name', width: 25 },
                    { header: 'Check-in Time', key: 'check_in_time', width: 20 },
                    { header: 'Device', key: 'device_id', width: 15 },
                    { header: 'Status', key: 'status', width: 12 },
                ];

                const headerRow = worksheet.getRow(1);
                headerRow.font = { bold: true };
                headerRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE0E0E0' },
                };
                headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

                for (const record of classRecords) {
                    worksheet.addRow({
                        student_id: record.student_id,
                        full_name: record.full_name,
                        check_in_time: new Date(record.check_in_time).toLocaleString(),
                        device_id: record.device_id,
                        status: record.status,
                    });
                }

                worksheet.autoFilter = {
                    from: 'A1',
                    to: 'E1',
                };

                const uniqueStudents = new Set(classRecords.map(r => r.student_id)).size;
                summaryData.push({
                    class: classNameKey,
                    totalRecords: classRecords.length,
                    uniqueStudents,
                });
            }

            const summarySheet = workbook.addWorksheet('Summary');
            summarySheet.columns = [
                { header: 'Class', key: 'class', width: 20 },
                { header: 'Total Records', key: 'totalRecords', width: 15 },
                { header: 'Unique Students', key: 'uniqueStudents', width: 18 },
            ];

            const summaryHeaderRow = summarySheet.getRow(1);
            summaryHeaderRow.font = { bold: true };
            summaryHeaderRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' },
            };
            summaryHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };

            for (const data of summaryData) {
                summarySheet.addRow(data);
            }

            const totalRow = summarySheet.addRow({
                class: 'Total',
                totalRecords: summaryData.reduce((sum, d) => sum + d.totalRecords, 0),
                uniqueStudents: summaryData.reduce((sum, d) => sum + d.uniqueStudents, 0),
            });
            totalRow.font = { bold: true };

            const filename = `attendance_${safeStart}_to_${safeEnd}.xlsx`;
            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            await workbook.xlsx.write(res);
            res.end();
        } catch (err) {
            next(err);
        }
    },
};

module.exports = AttendanceController;
