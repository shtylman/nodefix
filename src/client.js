// builtin
var net = require('net');
var events = require('events');

var FixFrameDecoder = require('./frame_decoder');

var Session = require('./session');

function Client(opt) {
    var self = this;
    events.EventEmitter.call(this);

    var sessions = {};
    var stream = null;

    this.connect = function(port, host, cb) {
        stream = net.createConnection(port, host, cb);

        stream.on('connect', function() {
            self.emit('connect');
        });

        stream.on('end', function() {
            self.emit('end');
        });

        stream.on('error', function(err) {
            self.emit('error', err);
        });

        var decoder = new FixFrameDecoder(stream);

        // new fix message
        decoder.on('message', function(msg) {
            // filter to appropriate session

            var counter = msg.TargetCompID;
            var session = sessions[counter];
            if (!session) {
                // no such session
                self.emit('error', new Error('no session: ' + counter));
                return;
            }

            session.incoming(msg);
        });
    }

    // create a new session, the session is in a non-logged on state
    this.session = function(sender_comp_id, target_comp_id) {
        var session = new Session(false, {
            sender: sender_comp_id,
            target: target_comp_id,
        });

        var session_id = target_comp_id;

        // when session is done, remove it
        session.on('end', function() {
            delete sessions[session_id];
        });

        session.on('send', function(msg) {
            var out = msg.serialize();
            stream.write(out);
        });

        stream.on('end', function() {
            // end the session
            session.end();
        });

        sessions[session_id] = session;
        return session;
    };

    this.close = function(cb) {
        if (cb) {
            stream.on('close', cb);
        }

        stream.end();
    };
}

Client.prototype = new events.EventEmitter();

module.exports = Client;
