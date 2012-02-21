/// fix session

var events = require('events');

var Msg = require('./msg');
var Msgs = require('./msgs');

var Session = function(is_acceptor, opt) {
    var self = this;

    self.incoming_seq_num = 1;
    self.outgoing_seq_num = 1;

    self.is_acceptor = is_acceptor;
    self.respond_to_logon = true;

    self.sender_comp_id = opt.sender;
    self.target_comp_id = opt.target;

    // incoming messages need to be processed in the order they are received
    self.msg_queue = [];

    // TODO
    self.confirm_logout = false;

    // heartbeat interval
    self.is_logged_in = false;

    // admin handlers
    var admin = self.admin = {};

    admin.Logon = function(msg, next) {
        var heartbt_milli = +msg.HeartBtInt * 1000;
        if (isNaN(heartbt_milli)) {
            // send back invalid heartbeat
            return next(new Error('invalid heartbeat interval, must be numeric'));
        };

        // heatbeat handler
        var heartbeat_timer = setInterval(function () {
            var currentTime = new Date();

            // counter party might be dead, kill connection
            if (currentTime - self.last_incomin_time > heartbt_milli * 2 && self.expectHeartbeats) {
                self.emit('error', new Error('no heartbeat from counter party in ' + heartbt_milli + ' milliseconds'));
                self.end();
                return;
            }

            // ask counter party to wake up
            if (currentTime - self.last_incoming_time > (heartbt_milli * 1.5) && self.expectHeartbeats) {
                // TODO send test message
            }

            // heartbeat time!
            if (currentTime - self.last_outgoing_time > heartbt_milli && self.sendHeartbeats) {
                // send here, not next because it is an interval
                self.send(new Msgs.Heartbeat());
            }
        }, heartbt_milli / 2); //End Set heartbeat mechanism==

        // clear heatbeat interval on end
        self.on('end', function () {
            clearInterval(heartbeat_timer);
        });

        // Logon successful
        self.is_logged_in = true;

        // Logon ack (acceptor)
        if (self.is_acceptor && self.respond_to_logon) {
            // send same message back
            // sender comp/target comp will be swapped
            self.send(msg);
        }

        self.emit('logon');
        next();
    };

    admin.Logout = function(msg, next) {
        // we initiated the logout, wait for confirmation
        // send logout confirmation
        if (!self.confirm_logout) {
            self.send(new Msgs.Logout());
        }

        self.end();
        next();
    };

    admin.TestRequest = function(msg, next) {
        var heartbeat = new Msgs.Heartbeat();
        heartbeat.TestReqID = msg.TestReqID;
        return next(heartbeat);
    };

    admin.ResendRequest = function(msg, next) {
        // TODO
        next();
    };

    admin.SequenceReset = function(msg, next) {
        // check sequence gap
        var msg_seq_num = +msg.MsgSeqNum;

        // ignore gap fill
        if (msg.GapFillFlag === 'Y') {
            if (msg_seq_num < self.incoming_seq_num) {
                return next(new Error('SequenceReset may not decrement sequence numbers'));
            }

            // next number we are expecting
            self.incoming_seq_num = msg_seq_num + 1;
            return next();
        }

        var reset_num = +msg.NewSeqNum;
        if (reset_num < self.incoming_seq_num) {
            return next(new Error('SequenceReset may not decrement sequence numbers'));
        }

        self.incoming_seq_num = reset_num;
    };

    admin.Heartbeat = function(msg, next) {
        next();
    };

    admin.Reject = function(msg, next) {
        self.emit('error', new Error(msg.Text));
        next();
    };

    // our admin handling
    self.on('message', function(msg, next) {
        self._process_incoming(msg, next);
    });

    // handle dispatching messages by name or rejecting if unsupported
    self.on('message', function(msg, next) {
        var listeners = self.listeners(msg.name).concat();
        if (listeners.length === 0) {
            // admin messages don't need to be handled by the app
            if (['0', '1', '2', '3', '4', '5', 'A'].indexOf(msg.MsgType) >= 0) {
                return next();
            }
            return next(new Error('unsupported message type: ' + msg.MsgType));
        }

        (function next_listener() {
            var handler = listeners.shift();
            if (!handler) {
                return next();
            }

            handler(msg, function(result) {
                if (result) {
                    return next(result);
                }

                // next message handler
                next_listener();
            });
        })();
    });
};

Session.prototype = new events.EventEmitter();

Session.prototype.reject = function(orig_msg, reason) {
    var self = this;

    var msg = new Msgs.Reject();
    msg.RefSeqNum = orig_msg.MsgSeqNum;
    msg.RefMsgType = orig_msg.MsgType;
    msg.Text = reason;
    return self.send(msg);
};

// process incoming message
Session.prototype.incoming = function(msg) {
    var self = this;

    // messages need to be processes in the order in which they are received
    // it would be wrong to receive order A then order B and for some reason
    // send order B to the matching engine before order A
    if (self.processing) {
        return self.msg_queue.push(msg);
    }

    self.processing = true;

    var message_handlers = self.listeners('message').concat(); //cheap clone

    function next_msg() {
        self.processing = false;
        var msg = self.msg_queue.shift();
        if (!msg) {
            return;
        }
        return self.incoming(msg);
    }

    // we do this because admin handlers should always run last
    // this allows users to hookup their own 'message' handlers and have them always run before
    message_handlers.push(function(msg, next) {
        var admin_handler = self.admin[msg.name];
        if (!admin_handler) {
            return next();
        }
        admin_handler(msg, next);
    });

    (function next() {
        var handler = message_handlers.shift();
        if (!handler) {
            // move on to the next message
            return next_msg();
        }

        // checks that the handler actually returned in a reasonable amount of time
        // TODO let user specify what to do in this case? skip to next message?
        // this would be bad as we did not fully process this message but did mark expected sequence numbers
        // maybe mark sequence number after message is done processing? I kinda like that more
        var execution_timeout = setTimeout(function() {
            self.emit('error', new Error('message handler taking too long to execute: ' + msg.toString()));
        }, 1000);

        handler(msg, function(result) {
            clearTimeout(execution_timeout);

            if (result instanceof Error) {
                self.reject(msg, result.message);
                return next_msg();
            } else if (result instanceof Msg) {
                self.send(result);
                return next_msg();
            }

            // next message handler
            next();
        });
    })();
};

Session.prototype._process_incoming = function(msg, cb) {
    var self = this;

    self.last_timestamp = Date.now();

    if (self.reject_count === undefined) {
        self.reject_count = 0;
    }

    if (msg.MsgType === '3') {
        ++self.reject_count;
    } else {
        self.reject_count = 0;
    }

    if (self.reject_count >= 3) {
        cb(new Error('too many rejects received, disconnecting'));
        return self.logout();
    }

    // check logged on, only allow logon messages or reject messages
    if (self.is_logged_in === false && msg.MsgType !== 'A' && msg.MsgType !== '3') {
        return cb(new Error('Expected Logon message, got: ' + msg.MsgType));
    }

    // check sequence gap
    var msg_seq_num = +msg.MsgSeqNum;

    if (isNaN(msg_seq_num)) {
        return cb(new Error('MsgSeqNum must be numeric: ' + msg.MsgSeqNum));
    }

    if (msg_seq_num > self.incoming_seq_num) {
        // request resend
        var resend_request = new Msgs.ResendRequest();
        resend_request.BeginSeqNo = self.incomingSeqNum;
        resend_request.EndSeqNo = 0;
        return cb(resend_request);
    } else if (msg_seq_num < self.incoming_seq_num) {
        // reversal
        // TODO our callback mechanism needs a way to drop messages to the floor
        // no reject, no send, no further processing
        //if (msg.PossDupFlag === 'Y') {
            // ignore
            //return; // we can't do this, no other handlers will be called ever again
        //}

        return cb(new Error('sequence reversal; expecting ' + self.incoming_seq_num + ' got ' + msg_seq_num));
    }

    // set new expected seq
    self.incoming_seq_num = msg_seq_num + 1;

    // message has passed basic tests, send to next level
    // app then our admin handler
    cb();
};

// send a message to the session
Session.prototype.send = function(msg) {
    var self = this;

    // set session specific headers
    msg.SenderCompID = self.sender_comp_id;
    msg.TargetCompID = self.target_comp_id;
    msg.SendingTime = new Date();

    self.timeOfLastOutgoing = new Date().getTime();

    // increment the next outgoing
    msg.MsgSeqNum = self.outgoing_seq_num++;

    self.emit('send', msg);
};

/// logon to a client session
/// 'logon' event fired when session is active
Session.prototype.logon = function(additional_fields) {
    var self = this;
    var msg = new Msgs.Logon();
    msg.HeartBtInt = 10;
    msg.EncryptMethod = 0;

    if (additional_fields) {
        var ids = Object.keys(additional_fields);
        ids.forEach(function(id) {
            msg.set(id, additional_fields[id]);
        });
    }

    self.send(msg);
};

/// send logoff message and wait for confirmation
Session.prototype.logout = function(reason) {
    var self = this;
    var msg = new Msgs.Logout();
    msg.Text = reason;
    self.send(msg);
};

/// terminate the session
Session.prototype.end = function() {
    var self = this;
    self.emit('end');
};

module.exports = Session;
