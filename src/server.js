// builtin
var net = require('net');
var events = require('events');

// local
var FixFrameDecoder = require('./frame_decoder');

// TODO config file reader

var Session = require('./session');

var Server = function(opt) {
    var self = this;
    events.EventEmitter.call(self);

    // map of session ids that are currently active
    // the value in the map is an object with fields 'stream', and 'session'
    // this is to ensure that only the connected stream is accessing the session
    var sessions = {};

    var server = net.createServer(function(stream) {
        var decoder = new FixFrameDecoder(stream);

        // TODO disconnect the user after N failed decoder attempts?
        decoder.on('error', function(err) {
        });

        // user has 30 seconds to establish any session, otherwise they are disconnected
        var logon_timeout = setTimeout(function() {
            stream.end();
        }, 1000 * 30);

        server.on('close', function() {
            clearTimeout(logon_timeout);
        });

        var session_count = 0;

        // new fix message
        decoder.on('message', function(msg) {
            // this is a huge problem
            // a person could technically connect with a spoofed SenderCompID
            // and then be re-attached to the session of a previous person

            // check if already have a session
            // if new session
            var session_id = msg.SenderCompID;
            var details = sessions[session_id];

            // no session for this session id yet, create it
            if (!details) {
                var session = new Session(true, {
                    // flipped because we are now the sender
                    sender: msg.TargetCompID,
                    target: msg.SenderCompID,
                });

                // see note above for session variable on why this is
                details = sessions[session_id] = {
                    stream: stream,
                    session: session,
                }

                ++session_count;

                // when session is done, remove it from
                session.on('end', function() {
                    --session_count;
                    delete sessions[session_id];

                    // if the last session is over, end the connection
                    if (session_count === 0) {
                        clearTimeout(logon_timeout);
                        stream.end();
                    }
                });

                session.on('logon', function() {
                    clearTimeout(logon_timeout);
                });

                stream.on('end', function() {
                    session.end();
                });

                stream.on('close', function() {
                    session.end();
                });

                // outgoing messages
                session.on('send', function(msg) {
                    var out = msg.serialize();
                    stream.write(out);
                });

                self.emit('session', session);
            }

            // if the two streams are not the same, someone is trying to spoof us
            if (details.stream !== stream) {
                // terminate immediately
                return stream.end();
            }

            // TODO check for other headers to be consistent?

            details.session.incoming(msg);
        });

        // if no traffic for two minutes, kill connection
        stream.setTimeout(2 * 60 * 1000);
        stream.on('timeout', function() {
            stream.end();
        });

        stream.on('end', function() {
            // anything?
        })
    });

    server.on('error', function(err) {
        self.emit('error', err);
    });

    self.listen = function(port, host, cb) {
        self.port = port;
        server.listen(port, host, cb);
        return this;
    };

    self.close = function(cb) {
        if (cb) {
            server.on('close', cb);
        }
        server.close();
    };
}

Server.prototype = new events.EventEmitter;

module.exports = Server;
