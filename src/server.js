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

     var sessions = {};
     var server = net.createServer(function(stream) {
        var decoder = new FixFrameDecoder(stream);

        // new fix message
        decoder.on('message', function(msg) {
            // check if already have a session
            // if new session
            var session_id = msg.TargetCompID;
            var session = sessions[session_id];
            if (!session) {
                session = sessions[session_id] = new Session(true, {
                    sender: msg.SenderCompID,
                    target: msg.TargetCompID
                });

                // when session is done, remove it from
                session.on('end', function() {
                    delete sessions[session_id];
                });

                stream.on('end', function() {
                    // end the session
                    session.end();
                });

                // outgoing messages
                session.on('send', function(msg) {
                    var out = msg.serialize();
                    stream.write(out);
                });

                self.emit('session', session);
            }

            session.incoming(msg);
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
