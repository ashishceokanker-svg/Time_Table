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
        CREATE TABLE IF NOT EXISTS users (username VARCHAR(100) PRIMARY KEY, password_hash TEXT NOT NULL, class_grade VARCHAR(50) NOT NULL, role VARCHAR(50) NOT NULL, status VARCHAR(50) NOT NULL);
        CREATE TABLE IF NOT EXISTS timetable (id VARCHAR(100) PRIMARY KEY, username VARCHAR(100) NOT NULL, day INTEGER NOT NULL, date VARCHAR(50), subject VARCHAR(100) NOT NULL, start_time VARCHAR(10) NOT NULL, end_time VARCHAR(10) NOT NULL, lesson TEXT, color VARCHAR(50), notes TEXT);
        CREATE TABLE IF NOT EXISTS logs (id VARCHAR(100) PRIMARY KEY, username VARCHAR(100) NOT NULL, date VARCHAR(50) NOT NULL, subject VARCHAR(100) NOT NULL, duration INTEGER NOT NULL, topic TEXT, notes TEXT);
        ALTER TABLE timetable ADD COLUMN IF NOT EXISTS color VARCHAR(50);
        ALTER TABLE timetable ADD COLUMN IF NOT EXISTS notes TEXT;
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
                        users: us.rows.map(r => ({ username: r.username, passwordHash: r.password_hash, classGrade: r.class_grade, role: r.role, status: r.status })),
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
                            await c.query('DELETE FROM users');
                            for (const u of data) await c.query('INSERT INTO users VALUES ($1, $2, $3, $4, $5)', [u.username, u.passwordHash, u.classGrade, u.role, u.status]);
                        } else if (key === 'timetable') {
                            await c.query('DELETE FROM timetable');
                            for (const t of data) await c.query('INSERT INTO timetable VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [t.id, t.username, t.day, t.date, t.subject, t.startTime, t.endTime, t.lesson, t.color, t.notes]);
                        } else if (key === 'logs') {
                            await c.query('DELETE FROM logs');
                            for (const l of data) await c.query('INSERT INTO logs VALUES ($1, $2, $3, $4, $5, $6, $7)', [l.id, l.username, l.date, l.subject, l.duration, l.topic, l.notes]);
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
