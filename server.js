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
