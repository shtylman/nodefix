An implementation of the [FIX protocol (Financial Information Exchange)](http://en.wikipedia.org/wiki/Financial_Information_eXchange).

Currently the implementation is pre-beta.

Install
====

    npm install git://github.com/bitfloor/nodefix.git

API
===

###Server:
```javascript
var fix = require('fix');

// for creating new outgoing messages
var Msgs = fix.Msgs;

var opt = {};
var server = fix.createServer({}, function(session) {

    // session has logged on
    session.on('logon', function() {
    });

    // session has logged off
    session.on('logoff', function() {
    });

    // a message has been received
    // calling next(new Error(reason)) will send a reject back to the counter party
    session.on('message', function(msg, next) {
        console.log(msg.toString());

        // allows other handlers to be run and more messages to be processed
        // if you forget to call this, no more incoming messages can be processed
        next();
    });

    // specific FIX messages can be bound as events
    // the next argument has the same behavior as with 'message'
    // any app messages you do not handle will be rejected as unsupported messages
    // admin messages are handled for you by the session
    // if you want to send a response back to the user
    // you can just call next(fix message) and it will be sent
    session.on('NewOrderSingle', function(msg, next) {

        // new FIX messages can be created by name
        var execution = new Msgs.ExecutionReport();

        // fields can be set by name as well
        execution.OrderID = <some order id>

        // use session.send to send the message to the counter party
        session.send(execution)
        return next();

        // or use the shorthand and just pass the outgoing message to next
        // next is smart enough to detect error vs regular message and send accordingly
        //return next(execution);
    });

    // using the handlers, you can easily perform login authentication
    // just call next with an error and a reject will be sent for the logon
    // call next with no argument to allow the logon
    // if an error is passed to next, the session will be immediately disconnected
    session.on('Logon', function(msg, next) {
        if (!auth_good) {
            return next(new Error('permission denied!')); // logon rejected
        }

        return next(); // logon ok
    });
});
server.listen(1234, "localhost", function(){});
```

###Client:
```javascript
var fix = require('fix');

var opt = {};

// create a fix client
var client = fix.createClient(opt);

// connect to a particular fix server
client.connect(1234, 'localhost');
client.on('connect', function() {
    // client is connected to the server

    // a client can handle multiple sessions
    // initiator, acceptor (SenderCompID, TargetCompID)
    var session = client.session('initiator', 'acceptor');

    // session object is the same as server session
    // has same methods and events, see above for details
    session.on('logon', function() {
    });

    session.on('ExecutionReport', function(msg, next) {

        // access fields by name
        msg.Side;
        msg.Price;

        // call next once done processing
        next();
    });
});
```

Not yet supported
===========

* Groups
* Encryption

