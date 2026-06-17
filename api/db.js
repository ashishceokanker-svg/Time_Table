const { createClient } = require('@vercel/postgres');
const fs = require('fs');
const path = require('path');
// Automatically map prefixed Vercel Postgres connection strings (e.g. Time_Table_POSTGRES_URL)
if (!process.env.POSTGRES_URL) {
    const pgKey = Object.keys(process.env).find(k => k.endsWith('_POSTGRES_URL'));
    if (pgKey) {
        process.env.POSTGRES_URL = process.env[pgKey];
    }
}
const LOCAL_DB_PATH = path.join(process.cwd(), 'local_db.json');
async function ensureTablesExist(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS users (
            username VARCHAR(100) PRIMARY KEY,
            password_hash TEXT NOT NULL,
            class_grade VARCHAR(50) NOT NULL,
            role VARCHAR(50) NOT NULL,
            status VARCHAR(50) NOT NULL
        );
    `);
    await client.query(`
        CREATE TABLE IF NOT EXISTS timetable (
            id VARCHAR(100) PRIMARY KEY,
            username VARCHAR(100) NOT NULL,
            day INTEGER NOT NULL,
            date VARCHAR(50),
            subject VARCHAR(100) NOT NULL,
            start_time VARCHAR(10) NOT NULL,
            end_time VARCHAR(10) NOT NULL,
            lesson TEXT
        );
    `);
    await client.query(`
        CREATE TABLE IF NOT EXISTS logs (
            id VARCHAR(100) PRIMARY KEY,
            username VARCHAR(100) NOT NULL,
            date VARCHAR(50) NOT NULL,
            subject VARCHAR(100) NOT NULL,
            duration INTEGER NOT NULL,
            topic TEXT,
            notes TEXT
        );
    `);
}
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    const usePostgres = !!process.env.POSTGRES_URL;
    if (req.method === 'GET') {
        try {
            let data = {};
            if (usePostgres) {
                const client = createClient();
                await client.connect();
                try {
                    await ensureTablesExist(client);
                    const usersResult = await client.query(`SELECT * FROM users;`);
                    const timetableResult = await client.query(`SELECT * FROM timetable;`);
                    const logsResult = await client.query(`SELECT * FROM logs;`);
                    
                    data = {
                        users: usersResult.rows.map(r => ({
                            username: r.username,
                            passwordHash: r.password_hash,
                            classGrade: r.class_grade,
                            role: r.role,
                            status: r.status
                        })),
                        timetable: timetableResult.rows.map(r => ({
                            id: r.id,
                            username: r.username,
                            day: r.day,
                            date: r.date,
                            subject: r.subject,
                            startTime: r.start_time,
                            endTime: r.end_time,
                            lesson: r.lesson
                        })),
                        logs: logsResult.rows.map(r => ({
                            id: r.id,
                            username: r.username,
                            date: r.date,
                            subject: r.subject,
                            duration: r.duration,
                            topic: r.topic,
                            notes: r.notes
                        }))
                    };
                } finally {
                    await client.end();
                }
            } else {
                if (fs.existsSync(LOCAL_DB_PATH)) {
                    data = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
                } else {
                    data = { users: [], timetable: [], logs: [] };
                }
            }
            res.status(200).json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    } else if (req.method === 'POST') {
        try {
            const { key, data } = req.body;
            if (!key || !data) {
                res.status(400).json({ error: 'Missing key or data' });
                return;
            }
            if (usePostgres) {
                const client = createClient();
                await client.connect();
                try {
                    await ensureTablesExist(client);
                    
                    if (key === 'users') {
                        await client.query('BEGIN');
                        try {
                            await client.query('DELETE FROM users');
                            for (const u of data) {
                                await client.query(
                                    'INSERT INTO users (username, password_hash, class_grade, role, status) VALUES ($1, $2, $3, $4, $5)',
                                    [u.username, u.passwordHash, u.classGrade, u.role, u.status]
                                );
                            }
                            await client.query('COMMIT');
                        } catch (e) {
                            await client.query('ROLLBACK');
                            throw e;
                        }
                    } else if (key === 'timetable') {
                        await client.query('BEGIN');
                        try {
                            await client.query('DELETE FROM timetable');
                            for (const t of data) {
                                await client.query(
                                    'INSERT INTO timetable (id, username, day, date, subject, start_time, end_time, lesson) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                                    [t.id, t.username, t.day, t.date, t.subject, t.startTime, t.endTime, t.lesson]
                                );
                            }
                            await client.query('COMMIT');
                        } catch (e) {
                            await client.query('ROLLBACK');
                            throw e;
                        }
                    } else if (key === 'logs') {
                        await client.query('BEGIN');
                        try {
                            await client.query('DELETE FROM logs');
                            for (const l of data) {
                                await client.query(
                                    'INSERT INTO logs (id, username, date, subject, duration, topic, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                                    [l.id, l.username, l.date, l.subject, l.duration, l.topic, l.notes]
                                );
                            }
                            await client.query('COMMIT');
                        } catch (e) {
                            await client.query('ROLLBACK');
                            throw e;
                        }
                    } else {
                        res.status(400).json({ error: 'Invalid key' });
                        return;
                    }
                } finally {
                    await client.end();
                }
            } else {
                let localData = { users: [], timetable: [], logs: [] };
                if (fs.existsSync(LOCAL_DB_PATH)) {
                    localData = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
                }
                localData[key] = data;
                fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(localData, null, 2), 'utf8');
            }
            res.status(200).json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
};
