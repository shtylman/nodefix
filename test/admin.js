/// test admin commands

var assert = require('assert');

var fix = require('..');
var Msgs = fix.Msgs;

module.exports = {
    beforeEach: function(done) {
        var self = this;
        self.server = fix.createServer().listen(1234, 'localhost', function() {
            done();
        });
    },
    afterEach: function(done) {
        var self = this;
        if (self.client) {
            self.client.close();
        }
        self.server.close();
        done();
    },
    connect: function(done) {
        var self = this;
        var client = self.client = fix.createClient();
        client.on('connect', function() {
            done();
        });
        client.connect(1234, 'localhost');
    },
    logon: function(done) {
        var self = this;

        // only when both sides have a logon event
        // can the test be considered done
        var count = 0;
        var incr_session = function() {
            if (++count === 2) {
                done();
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
    logout: function(done) {
        var self = this;

        // only when both sides have a logon event
        // can the test be considered done
        var count = 0;
        var incr_session = function() {
            if (++count === 3) {
                done();
            }
        };

        var client = self.client = fix.createClient();
        client.on('connect', function() {
            var session = client.session('initiator', 'acceptor');
            session.on('logon', function() {
                incr_session();
                session.logout();
            });

            // when the server responds with a clean logout
            session.on('logout', function() {
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
    spoof: function(done) {
        var self = this;

        var client2 = self.client2 = fix.createClient();
        client2.on('connect', function() {
            var session = client2.session('initiator', 'acceptor');

            // trying to reuse a session on a different connection should boot us
            session.logon();
        });

        // we expect to be disconnected by the server for trying to use an existing session
        client2.on('end', function() {
            done();
        });

        var client = self.client = fix.createClient();
        client.on('connect', function() {
            var session = client.session('initiator', 'acceptor');
            session.on('logon', function() {
                client2.connect(1234, 'localhost');
            });

            session.logon();
        });
        client.connect(1234, 'localhost');
    },
    test_request: function(done) {
        var self = this;
        var client = self.client = fix.createClient();
        client.on('connect', function() {
            var session = client.session('initiator', 'acceptor');
            session.on('logon', function() {
                var msg = new Msgs.TestRequest();
                msg.TestReqID = 1337;
                session.send(msg);
            });

            session.on('Heartbeat', function(msg, next) {
                assert.equal(1337, msg.TestReqID);
                next();
                done();
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
    reject_logon: function(done) {
        var self = this;

        var client = self.client = fix.createClient();
        client.on('connect', function() {
            var session = client.session('initiator', 'acceptor');
            session.on('logon', function() {
                assert.false(); //invalid call specifically to fail test
            });

            // a bad login will just terminate the session
            session.on('end', function() {
                done();
            });

            // login to the server
            session.logon();
        });
        client.connect(1234, 'localhost');

        self.server.on('session', function(session) {
            session.on('logon', function() {
                test.false(); //invalid call specifically to fail test
            });

            session.on('Logon', function(msg, next) {
                return next(new Error('testing login reject'));
            });
        });
    },
    unsupported_message: function(done) {
        var self = this;

        var client = self.client = fix.createClient();
        client.on('connect', function() {
            var session = client.session('initiator', 'acceptor');
            session.on('logon', function() {
                session.send(new Msgs.NewOrderSingle());
            });

            session.on('error', function(err) {
                assert.equal('unsupported message type: D', err.message);
                done();
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
    resend_request: function(done) {
        var self = this;

        var client = self.client = fix.createClient();
        client.on('connect', function() {
            var session = client.session('initiator', 'acceptor');
            session.on('logon', function() {
                var resend = new Msgs.ResendRequest();
                resend.BeginSeqNo = '1';
                resend.EndSeqNo = '10';
                session.send(resend);
            });

            session.on('SequenceReset', function(msg, next) {
                assert.equal('10', msg.NewSeqNo);
                assert.equal('N', msg.GapFillFlag);
                next();
                done();
            });

            session.logon();
        });
        client.connect(1234, 'localhost');

        self.server.on('session', function(session) {
            session.on('logon', function() {
            });
        });
    },
    sequence_reset: function(done) {
        var self = this;

        var client = self.client = fix.createClient();
        client.on('connect', function() {
            var session = client.session('initiator', 'acceptor');
            session.on('logon', function() {
                var reset = new Msgs.SequenceReset();
                reset.NewSeqNo = '10';
                reset.GapFillFlag = 'N';
                session.send(reset);

                session.outgoing_seq_num = 10;
                session.send(new Msgs.Heartbeat());
            });

            session.logon();
        });
        client.connect(1234, 'localhost');

        self.server.on('session', function(session) {
            session.on('logon', function() {
            });

            session.on('Heartbeat', function(msg, next) {
                assert.equal('10', msg.MsgSeqNum);
                next();
                done();
            });

        });
    },
};
