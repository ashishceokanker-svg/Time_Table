var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = 3000;

var MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

var server = http.createServer(function (req, res) {
    console.log('[' + new Date().toISOString() + '] ' + req.method + ' ' + req.url);

    // Handle API endpoints
    if (req.url.startsWith('/api/user/login')) {
        if (req.method === 'OPTIONS') {
            res.writeHead(200, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            });
            res.end();
            return;
        }

        if (req.method === 'POST') {
            var body = '';
            req.on('data', function (chunk) {
                body += chunk;
            });
            req.on('end', function () {
                try {
                    var payload = JSON.parse(body);
                    var username = payload.username;
                    var password = payload.password;
                    var classGrade = payload.classGrade;

                    if (!username || !password || !classGrade) {
                        res.writeHead(400, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        res.end(JSON.stringify({ error: 'Missing username, password, or classGrade' }));
                        return;
                    }

                    var LOCAL_DB_PATH = path.join(__dirname, 'local_db.json');
                    var matchedUser = null;

                    if (fs.existsSync(LOCAL_DB_PATH)) {
                        try {
                            var db = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
                            if (db.users && Array.isArray(db.users)) {
                                matchedUser = db.users.find(function (u) {
                                    return u.username.toLowerCase() === username.toLowerCase();
                                });
                            }
                        } catch (e) {}
                    }

                    if (!matchedUser && username.toLowerCase() === 'admin') {
                        matchedUser = { username: 'admin', passwordHash: 'admin', classGrade: 'Admin', role: 'admin', status: 'approved' };
                    }

                    if (!matchedUser) {
                        res.writeHead(401, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        res.end(JSON.stringify({ error: 'Error: User not found!' }));
                        return;
                    }

                    if (matchedUser.passwordHash !== password) {
                        res.writeHead(401, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        res.end(JSON.stringify({ error: 'Error: Incorrect password!' }));
                        return;
                    }

                    if (matchedUser.classGrade.toLowerCase() !== classGrade.toLowerCase()) {
                        res.writeHead(401, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        res.end(JSON.stringify({ error: 'Error: Class does not match registered details!' }));
                        return;
                    }

                    if (matchedUser.status === 'pending') {
                        res.writeHead(401, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        res.end(JSON.stringify({ error: 'Account Pending Approval: An administrator must approve your registration first.' }));
                        return;
                    } else if (matchedUser.status === 'deactivated') {
                        res.writeHead(401, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        res.end(JSON.stringify({ error: 'Account Deactivated: This account has been deactivated by the administrator.' }));
                        return;
                    }

                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({
                        success: true,
                        user: {
                            username: matchedUser.username,
                            classGrade: matchedUser.classGrade,
                            role: matchedUser.role,
                            status: matchedUser.status,
                            profilePhoto: matchedUser.profilePhoto
                        }
                    }));
                } catch (error) {
                    res.writeHead(500, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ error: 'Internal Server Error: ' + error.message }));
                }
            });
            return;
        }
    }

    if (req.url.startsWith('/api/db')) {
        if (req.method === 'OPTIONS') {
            res.writeHead(200, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            });
            res.end();
            return;
        }

        var LOCAL_DB_PATH = path.join(__dirname, 'local_db.json');

        if (req.method === 'GET') {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            if (fs.existsSync(LOCAL_DB_PATH)) {
                fs.readFile(LOCAL_DB_PATH, 'utf8', function (err, data) {
                    if (err) {
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        res.end(data);
                    }
                });
            } else {
                res.end(JSON.stringify({ users: [], timetable: [], logs: [] }));
            }
            return;
        }

        if (req.method === 'POST') {
            var body = '';
            req.on('data', function (chunk) {
                body += chunk;
            });
            req.on('end', function () {
                try {
                    var payload = JSON.parse(body);
                    var key = payload.key;
                    var data = payload.data;

                    if (!key || !data) {
                        res.writeHead(400, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        res.end(JSON.stringify({ error: 'Missing key or data' }));
                        return;
                    }

                    var localData = { users: [], timetable: [], logs: [] };
                    if (fs.existsSync(LOCAL_DB_PATH)) {
                        try {
                            localData = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
                        } catch (e) {}
                    }
                    localData[key] = data;
                    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(localData, null, 2), 'utf8');

                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ success: true }));
                } catch (error) {
                    res.writeHead(500, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ error: error.message }));
                }
            });
            return;
        }
    }

    // Resolve URL path to local file path
    var filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    // Safeguard against path traversal
    var safePath = path.resolve(filePath);
    var rootPath = path.resolve('.');
    if (safePath.indexOf(rootPath) !== 0) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    var extname = path.extname(safePath).toLowerCase();
    var contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.exists(safePath, function (exists) {
        if (!exists) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        fs.readFile(safePath, function (error, content) {
            if (error) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error: ' + error.code);
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    });
});

server.listen(PORT, function () {
    console.log('Study Tracker Server is running on http://localhost:' + PORT);
    console.log('Press Ctrl+C to stop the server.');
});
