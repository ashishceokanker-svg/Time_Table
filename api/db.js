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
            if (useDb) {
                const c = new Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
                await c.connect();
                try {
                    await initDb(c);
                    const us = await c.query('SELECT * FROM users');
                    const tt = await c.query('SELECT * FROM timetable');
                    const lg = await c.query('SELECT * FROM logs');
                    res.status(200).json({
                        users: us.rows.map(r => ({ username: r.username, passwordHash: r.password_hash, classGrade: r.class_grade, role: r.role, status: r.status, profilePhoto: r.profile_photo })),
                        timetable: tt.rows.map(r => ({ id: r.id, username: r.username, day: r.day, date: r.date, subject: r.subject, startTime: r.start_time, endTime: r.end_time, lesson: r.lesson, color: r.color, notes: r.notes })),
                        logs: lg.rows.map(r => ({ id: r.id, username: r.username, date: r.date, subject: r.subject, duration: r.duration, topic: r.topic, notes: r.notes }))
                    });
                } finally {
                    await c.end();
                }
            } else {
                res.status(200).json(fs.existsSync(LOCAL_DB_PATH) ? JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8')) : { users: [], timetable: [], logs: [] });
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
