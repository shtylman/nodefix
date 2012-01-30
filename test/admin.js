/// test admin commands

var fix = require('../fix');
var Msgs = fix.Msgs;

module.exports.logon = {
    setUp: function(next) {
        var self = this;
        self.server = fix.createServer().listen(1234, 'localhost', function() {
            next();
        });
    },
    tearDown: function(next) {
        var self = this;
        if (self.client) {
            self.client.close();
        }
        self.server.close();
        next();
    },
    connect: function(test) {
        var self = this;
        var client = self.client = fix.createClient();
        client.on('connect', function() {
            test.done();
        });
        client.connect(1234, 'localhost');
    },
    logon: function(test) {
        var self = this;

        // only when both sides have a logon event
        // can the test be considered done
        var count = 0;
        var incr_session = function() {
            if (++count === 2) {
                test.done();
            }
        };

        var client = self.client = fix.createClient();
        client.on('connect', function() {
            var session = client.session('initiator', 'acceptor');
            session.on('logon', function() {
                incr_session();
            });

            // login to the server
            session.logon();
        });
        client.connect(1234, 'localhost');

        self.server.on('session', function(session) {
            session.on('logon', function() {
                incr_session();
            });
        });
    },
    test_request: function(test) {
        var self = this;
        var client = self.client = fix.createClient();
        client.on('connect', function() {
            var session = client.session('initiator', 'acceptor');
            session.on('logon', function() {
                var msg = new Msgs.TestRequest();
                msg.TestReqID = 1337;
                session.send(msg);
            });

            session.on('Heartbeat', function(msg) {
                test.equal(1337, msg.TestReqID);
                test.done();
            });

            // login to the server
            session.logon();
        });
        client.connect(1234, 'localhost');

        self.server.on('session', function(session) {
            session.on('logon', function() {
            });
        });
    },
};
