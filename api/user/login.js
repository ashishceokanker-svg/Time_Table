const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const LOCAL_DB_PATH = path.join(process.cwd(), 'local_db.json');

if (!process.env.POSTGRES_URL) {
    const k = Object.keys(process.env).find(x => x.endsWith('_POSTGRES_URL'));
    if (k) process.env.POSTGRES_URL = process.env[k];
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { username, password, classGrade } = req.body;
        if (!username || !password || !classGrade) {
            return res.status(400).json({ error: 'Missing username, password, or classGrade' });
        }

        const useDb = !!process.env.POSTGRES_URL;
        let matchedUser = null;

        if (useDb) {
            const c = new Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
            await c.connect();
            try {
                // Find user case-insensitively
                const result = await c.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
                if (result.rows.length > 0) {
                    const r = result.rows[0];
                    matchedUser = {
                        username: r.username,
                        passwordHash: r.password_hash,
                        classGrade: r.class_grade,
                        role: r.role,
                        status: r.status,
                        profilePhoto: r.profile_photo
                    };
                }
            } finally {
                await c.end();
            }
        } else {
            if (fs.existsSync(LOCAL_DB_PATH)) {
                const db = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
                if (db.users && Array.isArray(db.users)) {
                    matchedUser = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
                }
            }
        }

        // Check if admin user needs to be seeded in case DB is empty
        if (!matchedUser && username.toLowerCase() === 'admin') {
            matchedUser = { username: 'admin', passwordHash: 'admin', classGrade: 'Admin', role: 'admin', status: 'approved' };
        }

        if (!matchedUser) {
            return res.status(401).json({ error: 'Error: User not found!' });
        }

        // Verify password
        if (matchedUser.passwordHash !== password) {
            return res.status(401).json({ error: 'Error: Incorrect password!' });
        }

        // Verify class matches
        if (matchedUser.classGrade.toLowerCase() !== classGrade.toLowerCase()) {
            return res.status(401).json({ error: 'Error: Class does not match registered details!' });
        }

        // Check status
        if (matchedUser.status === 'pending') {
            return res.status(401).json({ error: 'Account Pending Approval: An administrator must approve your registration first.' });
        } else if (matchedUser.status === 'deactivated') {
            return res.status(401).json({ error: 'Account Deactivated: This account has been deactivated by the administrator.' });
        }

        // Success response
        return res.status(200).json({
            success: true,
            user: {
                username: matchedUser.username,
                classGrade: matchedUser.classGrade,
                role: matchedUser.role,
                status: matchedUser.status,
                profilePhoto: matchedUser.profilePhoto
            }
        });
    } catch (err) {
        return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
    }
};
