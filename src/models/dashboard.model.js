const db = require('../config/db');

function buildWhereClause(column, startDate, endDate) {
    const params = [];
    const conditions = [];
    let paramIndex = 1;

    if (startDate) {
        conditions.push(`${column} >= $${paramIndex}::date`);
        params.push(startDate);
        paramIndex++;
    }

    if (endDate) {
        conditions.push(`${column} < ($${paramIndex}::date + INTERVAL '1 day')`);
        params.push(endDate);
        paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
}

const DashboardModel = {
    getChartData: async (startDate, endDate) => {
        const checkinsMeta = buildWhereClause("ar.check_in_time AT TIME ZONE 'Asia/Ho_Chi_Minh'", startDate, endDate);
        const newStudentsMeta = buildWhereClause("s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'", startDate, endDate);
        const anomaliesMeta = buildWhereClause("uc.latest_seen AT TIME ZONE 'Asia/Ho_Chi_Minh'", startDate, endDate);

        const checkinsSql = `
            SELECT 
                TO_CHAR(DATE(ar.check_in_time AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD') as date,
                COUNT(*) as count
            FROM attendance_records ar
            ${checkinsMeta.whereClause}
            GROUP BY DATE(ar.check_in_time AT TIME ZONE 'Asia/Ho_Chi_Minh')
            ORDER BY date ASC
        `;

        const newStudentsSql = `
            SELECT 
                TO_CHAR(DATE(s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD') as date,
                COUNT(*) as count
            FROM students s
            ${newStudentsMeta.whereClause}
            GROUP BY DATE(s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
            ORDER BY date ASC
        `;

        const anomaliesSql = `
            SELECT 
                TO_CHAR(DATE(uc.latest_seen AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD') as date,
                COUNT(*) as count
            FROM unknown_cards uc
            ${anomaliesMeta.whereClause}
            GROUP BY DATE(uc.latest_seen AT TIME ZONE 'Asia/Ho_Chi_Minh')
            ORDER BY date ASC
        `;

        const [checkinsResult, newStudentsResult, anomaliesResult] = await Promise.all([
            db.query(checkinsSql, checkinsMeta.params),
            db.query(newStudentsSql, newStudentsMeta.params),
            db.query(anomaliesSql, anomaliesMeta.params),
        ]);

        const toDateCountMap = (rows) => {
            const map = new Map();
            for (const row of rows) {
                map.set(row.date, parseInt(row.count, 10));
            }
            return map;
        };

        const checkinsMap = toDateCountMap(checkinsResult.rows);
        const newStudentsMap = toDateCountMap(newStudentsResult.rows);
        const anomaliesMap = toDateCountMap(anomaliesResult.rows);

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const dates = [];
        const current = new Date(start);
        while (current <= end) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }

        const checkins = dates.map(date => ({ date, count: checkinsMap.get(date) || 0 }));
        const newStudents = dates.map(date => ({ date, count: newStudentsMap.get(date) || 0 }));
        const anomalies = dates.map(date => ({ date, count: anomaliesMap.get(date) || 0 }));

        return { checkins, newStudents, anomalies };
    },
};

module.exports = DashboardModel;
