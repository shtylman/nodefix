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
    logout: function(test) {
        var self = this;

        // only when both sides have a logon event
        // can the test be considered done
        var count = 0;
        var incr_session = function() {
            if (++count === 3) {
                test.done();
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
    spoof: function(test) {
        var self = this;

        var client2 = self.client2 = fix.createClient();
        client2.on('connect', function() {
            var session = client2.session('initiator', 'acceptor');

            // trying to reuse a session on a different connection should boot us
            session.logon();
        });

        // we expect to be disconnected by the server for trying to use an existing session
        client2.on('end', function() {
            test.done();
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

            session.on('Heartbeat', function(msg, next) {
                test.equal(1337, msg.TestReqID);
                test.done();
                next();
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
    reject_logon: function(test) {
        var self = this;

        var client = self.client = fix.createClient();
        client.on('connect', function() {
            var session = client.session('initiator', 'acceptor');
            session.on('logon', function() {
                test.false(); //invalid call specifically to fail test
            });

            // a bad login will just terminate the session
            session.on('end', function() {
                test.done();
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
    unsupported_message: function(test) {
        var self = this;

        var client = self.client = fix.createClient();
        client.on('connect', function() {
            var session = client.session('initiator', 'acceptor');
            session.on('logon', function() {
                session.send(new Msgs.NewOrderSingle());
            });

            session.on('error', function(err) {
                test.equal('unsupported message type: D', err.message);
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
    resend_request: function(test) {
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
                test.equal('10', msg.NewSeqNo);
                test.equal('N', msg.GapFillFlag);
                next();
                test.done();
            });

            session.logon();
        });
        client.connect(1234, 'localhost');

        self.server.on('session', function(session) {
            session.on('logon', function() {
            });
        });
    },
    sequence_reset: function(test) {
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
                test.equal('10', msg.MsgSeqNum);
                next();
                test.done();
            });

        });
    },
};
