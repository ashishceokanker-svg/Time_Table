const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

if (!process.env.POSTGRES_URL) {
    const k = Object.keys(process.env).find(x => x.endsWith('_POSTGRES_URL'));
    if (k) process.env.POSTGRES_URL = process.env[k];
}

const LOCAL_DB_PATH = path.join(process.cwd(), 'local_db.json');

async function initDb(c) {
    await c.query(`
        CREATE TABLE IF NOT EXISTS users (username VARCHAR(100) PRIMARY KEY, password_hash TEXT NOT NULL, class_grade VARCHAR(50) NOT NULL, role VARCHAR(50) NOT NULL, status VARCHAR(50) NOT NULL, profile_photo TEXT);
        CREATE TABLE IF NOT EXISTS timetable (id VARCHAR(100) PRIMARY KEY, username VARCHAR(100) NOT NULL, day INTEGER NOT NULL, date VARCHAR(50), subject VARCHAR(100) NOT NULL, start_time VARCHAR(10) NOT NULL, end_time VARCHAR(10) NOT NULL, lesson TEXT, color VARCHAR(50), notes TEXT);
        CREATE TABLE IF NOT EXISTS logs (id VARCHAR(100) PRIMARY KEY, username VARCHAR(100) NOT NULL, date VARCHAR(50) NOT NULL, subject VARCHAR(100) NOT NULL, duration INTEGER NOT NULL, topic TEXT, notes TEXT);
        ALTER TABLE timetable ADD COLUMN IF NOT EXISTS color VARCHAR(50);
        ALTER TABLE timetable ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT;
        DELETE FROM logs WHERE LOWER(username) = 'ayush';
        DELETE FROM timetable WHERE LOWER(username) = 'ayush';
        DELETE FROM users WHERE LOWER(username) = 'ayush';
    `);
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const useDb = !!process.env.POSTGRES_URL;

    if (req.method === 'GET') {
        try {
            const { username, year, month, week, reports } = req.query;

            if (reports === 'true') {
                if (!username) {
                    return res.status(400).json({ error: 'Missing username parameter for reports' });
                }
                const startDate = req.query.startDate;
                const endDate = req.query.endDate;
                
                if (!startDate || !endDate) {
                    return res.status(400).json({ error: 'Missing startDate or endDate parameter for reports' });
                }

                // Fetch the logs and timetable slots
                let logs = [];
                let timetable = [];
                
                if (useDb) {
                    const c = new Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
                    await c.connect();
                    try {
                        await initDb(c);
                        const lgRes = await c.query("SELECT * FROM logs WHERE LOWER(username) = LOWER($1)", [username]);
                        const ttRes = await c.query("SELECT * FROM timetable WHERE LOWER(username) = LOWER($1) OR LOWER(username) = 'admin'", [username]);
                        logs = lgRes.rows.map(r => ({ id: r.id, username: r.username, date: r.date, subject: r.subject, duration: r.duration, topic: r.topic, notes: r.notes }));
                        timetable = ttRes.rows.map(r => ({ id: r.id, username: r.username, day: r.day, date: r.date, subject: r.subject, startTime: r.start_time, endTime: r.end_time, lesson: r.lesson, color: r.color, notes: r.notes }));
                    } finally {
                        await c.end();
                    }
                } else {
                    const db = fs.existsSync(LOCAL_DB_PATH) ? JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8')) : { users: [], timetable: [], logs: [] };
                    logs = (db.logs || []).filter(l => l.username.toLowerCase() === username.toLowerCase());
                    timetable = (db.timetable || []).filter(t => t.username.toLowerCase() === username.toLowerCase() || t.username.toLowerCase() === 'admin');
                }
                
                // 1. Filter logs by date range [startDate, endDate]
                const filteredLogs = logs.filter(l => l.date >= startDate && l.date <= endDate);
                
                // 2. Group logs by date and subject
                const actualMap = {};
                filteredLogs.forEach(l => {
                    const key = `${l.date}_${l.subject}`;
                    if (!actualMap[key]) {
                        actualMap[key] = {
                            date: l.date,
                            subject: l.subject,
                            duration: 0,
                            topics: []
                        };
                    }
                    actualMap[key].duration += l.duration;
                    if (l.topic) actualMap[key].topics.push(l.topic);
                });
                
                const actualBlocks = Object.values(actualMap).map(b => ({
                    date: b.date,
                    subject: b.subject,
                    duration: b.duration,
                    details: b.topics.join(', ')
                }));
                
                // 3. Filter timetable slots and expand recurring ones
                const targetBlocks = [];
                
                function getDatesForWeekday(startStr, endStr, weekday) {
                    const dates = [];
                    const start = new Date(startStr);
                    const end = new Date(endStr);
                    let current = new Date(start);
                    while (current <= end) {
                        if (current.getDay() === weekday) {
                            dates.push(current.toISOString().split('T')[0]);
                        }
                        current.setDate(current.getDate() + 1);
                    }
                    return dates;
                }
                
                function getSessionDurationMinutes(start, end) {
                    if (!start || !end) return 0;
                    const [sh, sm] = start.split(':').map(Number);
                    const [eh, em] = end.split(':').map(Number);
                    return (eh * 60 + em) - (sh * 60 + sm);
                }

                timetable.forEach(t => {
                    const durationMins = getSessionDurationMinutes(t.startTime, t.endTime);
                    if (t.date) {
                        // Date-specific
                        if (t.date >= startDate && t.date <= endDate) {
                            targetBlocks.push({
                                date: t.date,
                                subject: t.subject,
                                duration: durationMins,
                                details: t.lesson || 'General Study'
                            });
                        }
                    } else {
                        // Recurring
                        const occurrenceDates = getDatesForWeekday(startDate, endDate, t.day);
                        occurrenceDates.forEach(d => {
                            targetBlocks.push({
                                date: d,
                                subject: t.subject,
                                duration: durationMins,
                                details: t.lesson || 'General Study'
                            });
                        });
                    }
                });
                
                // Group target blocks by date and subject to aggregate duplicates if any
                const targetMap = {};
                targetBlocks.forEach(tb => {
                    const key = `${tb.date}_${tb.subject}`;
                    if (!targetMap[key]) {
                        targetMap[key] = {
                            date: tb.date,
                            subject: tb.subject,
                            duration: 0,
                            details: []
                        };
                    }
                    targetMap[key].duration += tb.duration;
                    if (tb.details) targetMap[key].details.push(tb.details);
                });
                
                const aggregatedTargetBlocks = Object.values(targetMap).map(b => ({
                    date: b.date,
                    subject: b.subject,
                    duration: b.duration,
                    details: b.details.join(', ')
                }));
                
                return res.status(200).json({
                    actualBlocks,
                    targetBlocks: aggregatedTargetBlocks
                });
            }

            // Normal GET flow (timetable and logs, potentially filtered)
            let startDate = null;
            let endDate = null;

            if (year && month) {
                const y = parseInt(year);
                const m = parseInt(month);
                startDate = `${y}-${String(m).padStart(2, '0')}-01`;
                endDate = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
            } else if (year && week) {
                const y = parseInt(year);
                const w = parseInt(week);
                const simple = new Date(y, 0, 1 + (w - 1) * 7);
                const dayOfWeek = simple.getDay();
                const ISOweekStart = new Date(simple);
                if (dayOfWeek <= 4) {
                    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
                } else {
                    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
                }
                const ISOweekEnd = new Date(ISOweekStart);
                ISOweekEnd.setDate(ISOweekStart.getDate() + 6);
                
                startDate = ISOweekStart.toISOString().split('T')[0];
                endDate = ISOweekEnd.toISOString().split('T')[0];
            }

            if (useDb) {
                const c = new Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
                await c.connect();
                try {
                    await initDb(c);
                    const us = await c.query('SELECT * FROM users');
                    
                    // Build filtered queries for timetable and logs
                    let ttQuery = 'SELECT * FROM timetable';
                    let ttParams = [];
                    if (startDate && endDate) {
                        if (username) {
                            ttQuery += " WHERE (LOWER(username) = LOWER($1) OR LOWER(username) = 'admin') AND (date IS NULL OR date = '' OR (date >= $2 AND date <= $3))";
                            ttParams = [username, startDate, endDate];
                        } else {
                            ttQuery += " WHERE (date IS NULL OR date = '' OR (date >= $1 AND date <= $2))";
                            ttParams = [startDate, endDate];
                        }
                    } else if (username) {
                        ttQuery += " WHERE LOWER(username) = LOWER($1) OR LOWER(username) = 'admin'";
                        ttParams = [username];
                    }
                    
                    let lgQuery = 'SELECT * FROM logs';
                    let lgParams = [];
                    if (startDate && endDate) {
                        if (username) {
                            lgQuery += " WHERE LOWER(username) = LOWER($1) AND date >= $2 AND date <= $3";
                            lgParams = [username, startDate, endDate];
                        } else {
                            lgQuery += " WHERE date >= $1 AND date <= $2";
                            lgParams = [startDate, endDate];
                        }
                    } else if (username) {
                        lgQuery += " WHERE LOWER(username) = LOWER($1)";
                        lgParams = [username];
                    }

                    const tt = await c.query(ttQuery, ttParams);
                    const lg = await c.query(lgQuery, lgParams);
                    
                    res.status(200).json({
                        users: us.rows.map(r => ({ username: r.username, passwordHash: r.password_hash, classGrade: r.class_grade, role: r.role, status: r.status, profilePhoto: r.profile_photo })),
                        timetable: tt.rows.map(r => ({ id: r.id, username: r.username, day: r.day, date: r.date, subject: r.subject, startTime: r.start_time, endTime: r.end_time, lesson: r.lesson, color: r.color, notes: r.notes })),
                        logs: lg.rows.map(r => ({ id: r.id, username: r.username, date: r.date, subject: r.subject, duration: r.duration, topic: r.topic, notes: r.notes }))
                    });
                } finally {
                    await c.end();
                }
            } else {
                const db = fs.existsSync(LOCAL_DB_PATH) ? JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8')) : { users: [], timetable: [], logs: [] };
                let filteredTimetable = db.timetable || [];
                let filteredLogs = db.logs || [];
                
                if (username) {
                    filteredTimetable = filteredTimetable.filter(t => t.username.toLowerCase() === username.toLowerCase() || t.username.toLowerCase() === 'admin');
                    filteredLogs = filteredLogs.filter(l => l.username.toLowerCase() === username.toLowerCase());
                }
                
                if (startDate && endDate) {
                    filteredTimetable = filteredTimetable.filter(t => !t.date || (t.date >= startDate && t.date <= endDate));
                    filteredLogs = filteredLogs.filter(l => l.date >= startDate && l.date <= endDate);
                }

                res.status(200).json({
                    users: db.users || [],
                    timetable: filteredTimetable,
                    logs: filteredLogs
                });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    } else if (req.method === 'POST') {
        try {
            const { key, data } = req.body;
            if (!key || !data) return res.status(400).json({ error: 'Missing key or data' });

            if (useDb) {
                const c = new Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
                await c.connect();
                try {
                    await initDb(c);
                    await c.query('BEGIN');
                    try {
                        if (key === 'users') {
                            const usernames = data.map(u => u.username);
                            for (const u of data) {
                                if (u.profilePhoto && u.profilePhoto.startsWith('data:')) {
                                    const base64Content = u.profilePhoto.split('base64,')[1] || '';
                                    const sizeInBytes = (base64Content.length * 3) / 4;
                                    if (sizeInBytes > 2 * 1024 * 1024) {
                                        throw new Error("Validation Error: The uploaded photo exceeds the maximum size limit of 2MB.");
                                    }
                                }
                            }
                            for (const u of data) {
                                await c.query(`
                                    INSERT INTO users (username, password_hash, class_grade, role, status, profile_photo) 
                                    VALUES ($1, $2, $3, $4, $5, $6) 
                                    ON CONFLICT (username) 
                                    DO UPDATE SET password_hash = EXCLUDED.password_hash, class_grade = EXCLUDED.class_grade, role = EXCLUDED.role, status = EXCLUDED.status, profile_photo = EXCLUDED.profile_photo
                                `, [u.username, u.passwordHash, u.classGrade, u.role, u.status, u.profilePhoto || null]);
                            }
                            if (usernames.length > 0) {
                                // Programmatically cascade delete associated timetable sessions and study logs first
                                await c.query("DELETE FROM timetable WHERE username NOT IN (SELECT unnest($1::varchar[])) AND username != 'admin'", [usernames]);
                                await c.query("DELETE FROM logs WHERE username NOT IN (SELECT unnest($1::varchar[])) AND username != 'admin'", [usernames]);
                                await c.query("DELETE FROM users WHERE username NOT IN (SELECT unnest($1::varchar[])) AND username != 'admin'", [usernames]);
                            }
                        } else if (key === 'timetable') {
                            const ids = data.map(t => t.id);
                            for (const t of data) {
                                await c.query(`
                                    INSERT INTO timetable (id, username, day, date, subject, start_time, end_time, lesson, color, notes) 
                                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
                                    ON CONFLICT (id) 
                                    DO UPDATE SET username = EXCLUDED.username, day = EXCLUDED.day, date = EXCLUDED.date, subject = EXCLUDED.subject, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, lesson = EXCLUDED.lesson, color = EXCLUDED.color, notes = EXCLUDED.notes
                                `, [t.id, t.username, t.day, t.date, t.subject, t.startTime, t.endTime, t.lesson, t.color, t.notes]);
                            }
                            if (ids.length > 0) {
                                await c.query("DELETE FROM timetable WHERE id NOT IN (SELECT unnest($1::varchar[]))", [ids]);
                            } else {
                                await c.query("DELETE FROM timetable");
                            }
                        } else if (key === 'logs') {
                            const ids = data.map(l => l.id);
                            const existingLogsResult = await c.query('SELECT id, date FROM logs');
                            const existingIds = new Set(existingLogsResult.rows.map(r => r.id));

                            const todayIndia = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
                            const todayStr = `${todayIndia.getFullYear()}-${String(todayIndia.getMonth() + 1).padStart(2, '0')}-${String(todayIndia.getDate()).padStart(2, '0')}`;
                            
                            for (const l of data) {
                                if (!existingIds.has(l.id)) {
                                    if (l.date < todayStr) {
                                        throw new Error(`Validation Error: You cannot save new logs for past dates! (${l.date} is in the past)`);
                                    }
                                }
                            }

                            for (const l of data) {
                                await c.query(`
                                    INSERT INTO logs (id, username, date, subject, duration, topic, notes) 
                                    VALUES ($1, $2, $3, $4, $5, $6, $7) 
                                    ON CONFLICT (id) 
                                    DO UPDATE SET username = EXCLUDED.username, date = EXCLUDED.date, subject = EXCLUDED.subject, duration = EXCLUDED.duration, topic = EXCLUDED.topic, notes = EXCLUDED.notes
                                `, [l.id, l.username, l.date, l.subject, l.duration, l.topic, l.notes]);
                            }
                            if (ids.length > 0) {
                                await c.query("DELETE FROM logs WHERE id NOT IN (SELECT unnest($1::varchar[]))", [ids]);
                            } else {
                                await c.query("DELETE FROM logs");
                            }
                        }
                        await c.query('COMMIT');
                    } catch (e) {
                        await c.query('ROLLBACK');
                        throw e;
                    }
                } finally {
                    await c.end();
                }
            } else {
                const db = fs.existsSync(LOCAL_DB_PATH) ? JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8')) : { users: [], timetable: [], logs: [] };
                db[key] = data;
                fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(db, null, 2), 'utf8');
            }
            res.status(200).json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
};
