var Server = require('./src/server');
var Client = require('./src/client');

/// create a new fix server
/// @param cb Callback(session) when a new session is established
exports.createServer = function(opt, cb) {
    var server = new Server(opt);
    if (cb) {
        server.on('session', cb);
    }
    return server;
};

exports.createClient = function(opt) {
    return new Client(opt);
};

exports.Msgs = require('./src/msgs');

