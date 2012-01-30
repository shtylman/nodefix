/// fix session

var events = require('events');

var Msgs = require('./msgs');

var Session = function(is_acceptor, opt) {
    var self = this;

    self.incoming_seq_num = 0;
    self.outgoing_seq_num = 0;

    self.is_acceptor = is_acceptor;
    self.respond_to_logon = true;

    self.sender_comp_id = opt.sender;
    self.target_comp_id = opt.target;

    // heartbeat interval
    this.isLoggedIn = false;

    var dispatcher = self.dispatcher = new events.EventEmitter();

    // message handlers
    dispatcher.on('Logon', function(msg) {

        if (self.is_acceptor) {
            /*
            // TODO Authenticate connection
            // provides a way to intercept authentication
            self.authenticate(msg, function(err, auth) {
                // TODO
            });
            */
        }

        var heartbt_milli = +msg.HeartBtInt * 1000;
        if (isNaN(heartbt_milli)) {
            // send back invalid heartbeat
            return;
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
    });

    // TODO
    self.confirm_logout = false;
    dispatcher.on('Logout', function(msg) {
        // we initiated the logout, wait for confirmation
        // send logout confirmation
        if (!self.confirm_logout) {
            self.send(new Msgs.Logout());
        }

        self.end();
    });

    dispatcher.on('TestRequest', function(msg) {
        var heartbeat = new Msgs.Heartbeat();
        heartbeat.TestReqID = msg.TestReqID;
        self.send(heartbeat);
    });

    dispatcher.on('ResendRequest', function(msg) {
    });

    dispatcher.on('SequenceReset', function(msg) {
        // check sequence gap
        var msg_seq_num = +msg.MsgSeqNum;

        // ignore gap fill
        if (msg.GapFillFlag === 'Y') {
            if (msg_seq_num < self.incoming_seq_num) {
                throw new Error('SequenceReset may not decrement sequence numbers');
            }

            // next number we are expecting
            self.incoming_seq_num = msg_seq_num + 1;
            return;
        }

        var reset_num = +msg.NewSeqNum;
        if (reset_num < self.incoming_seq_num) {
            throw new Error('SequenceReset may not decrement sequence numbers');
        }

        self.incoming_seq_num = reset_num;
    });
};

Session.prototype = new events.EventEmitter();

// process incoming message
Session.prototype.incoming = function(msg) {
    var self = this;

    self.last_timestamp = Date.now();

    // check logged on
    if (self.is_logged_in === false && msg.MsgType !== 'A') {
        return self.reject('Expected Logon message, got: ' + msg.MsgType, msg.MsgSeqNum);
    }

    // check sequence gap
    var msg_seq_num = +msg.MsgSeqNum;

    if (msg_seq_num > self.incoming_seq_num) {
        // request resend
        var resend_request = new Msgs.ResendRequest();
        resend_request.BeginSeqNo = self.incomingSeqNum;
        resend_request.EndSeqNo = 0;
        self.send(resend_request);
        return;

    } else if (msg_seq_num < self.incoming_seq_num) {
        // reversal
        if (msg.PossDupFlag === 'Y') {
            // ignore
            return;
        }

        return self.reject('sequence reversal; expecting ' + self.incoming_seq_num + ' got ' + msg_seq_num, msg.MsgSeqNum);
    }

    self.dispatcher.emit(msg.name, msg);

    // set new expected seq
    self.incoming_seq_num = msg_seq_num + 1;

    // send to app once we are done
    self.emit('message', msg);
    self.emit(msg.name, msg);
};

// send a message to the session
Session.prototype.send = function(msg) {
    var self = this;

    // set session specific headers
    msg.SenderCompID = self.sender_comp_id;
    msg.TargetCompID = self.target_comp_id;
    msg.SendingTime = new Date();

    if(self.is_logged_in === false && msg.MsgType === 'A') {

        //==Sync sequence numbers from data store
        var seqnums = self.getSeqNums(self.senderCompID, self.targetCompID);
        self.incomingSeqNum = seqnums.incomingSeqNum;
        self.outgoingSeqNum = seqnums.outgoingSeqNum;
    }

    ++self.outgoing_seq_num;
    self.timeOfLastOutgoing = new Date().getTime();

    msg.MsgSeqNum = self.outgoingSeqNum;
    self.emit('send', msg);
};

/// logon to a client session
/// 'logon' event fired when session is active
Session.prototype.logon = function() {
    var self = this;
    var msg = new Msgs.Logon();
    msg.HeartBtInt = 10;
    msg.EncryptMethod = 0;
    self.send(msg);
};

/// send logoff message and wait for confirmation
Session.prototype.logoff = function(reason) {
    var self = this;
    var msg = new Msgs.Logoff();
    msg.Text = reason;
    self.send(msg);
};

/// terminate the session
Session.prototype.end = function() {
    var self = this;
    self.emit('end');
};

module.exports = Session;
