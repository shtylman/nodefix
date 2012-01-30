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
    session.on('message', function(msg) {
        console.log(msg);
    });

    // specific FIX messages can be bound as events
    session.on('NewOrderSingle', function(msg) {

        // new FIX messages can be created by name
        var execution = new Msgs.ExecutionReport();

        // fields can be set by name as well
        execution.OrderID = <some order id>

        // use session.send to send the message to the counter party
        session.send(execution);
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
    // has same methods and events
    session.on('logon', function() {
    });

    session.on('ExecutionReport', function(msg) {

        // access fields by name
        msg.Side;
        msg.Price;
    });
});
```

Not yet supported
===========

* Groups
* Encryption

License
=======
Copyright (C) 2011 by Shahbaz Chaudhary

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
