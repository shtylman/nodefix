// builtin
var events = require('events');
var util = require('util');

var Msg = require('./msg');

var kFieldSeparator = Msg.kFieldSeparator;
var ENDOFTAG8 = 10;
var STARTOFTAG9VAL = ENDOFTAG8 + 2;
var SIZEOFTAG10 = 8;

FixFrameDecoder = function(stream) {
    var self = this;
    events.EventEmitter.call(self);

    var buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', function(data) {
        buffer += data;

        while (buffer.length > 0) {
            // Step 1: Extract complete FIX message
            // If we don't have enough data to start extracting body length, wait for more data
            if (buffer.length <= ENDOFTAG8) {
                return;
            }

            var _idxOfEndOfTag9Str = buffer.substring(ENDOFTAG8).indexOf(kFieldSeparator);
            var idxOfEndOfTag9 = parseInt(_idxOfEndOfTag9Str, 10) + ENDOFTAG8;

            if (isNaN(idxOfEndOfTag9)) {
                var error = 'Unable to find the location of the end of tag 9. Message probably malformed: ' + buffer;
                return self.emit('error', new Error(error));
            }

            // If we don't have enough data to stop extracting body length AND we have received a lot of data
            // then perhaps there is a problem with how the message is formatted and the session should be killed
            if (idxOfEndOfTag9 < 0 && buffer.length > 100) {
                var error ='Over 100 character received but body length still not extractable.  Message malformed: ' + buffer;
                return self.emit('error', new Error(error));
            }

            // If we don't have enough data to stop extracting body length, wait for more data
            if (idxOfEndOfTag9 < 0) {
                return;
            }

            var _bodyLengthStr = buffer.substring(STARTOFTAG9VAL, idxOfEndOfTag9);
            var bodyLength = parseInt(_bodyLengthStr, 10);
            if (isNaN(bodyLength)) {
                var error = "Unable to parse bodyLength field. Message probably malformed: bodyLength='" + _bodyLengthStr + "', msg=" + buffer;
                return self.emit('error', new Error(error));
            }

            var msgLength = bodyLength + idxOfEndOfTag9 + SIZEOFTAG10;

            // If we don't have enough data for the whole message, wait for more data
            if (buffer.length < msgLength) {
                return;
            }

            // Message received!
            var msg = buffer.substring(0, msgLength);
            if (msgLength == buffer.length) {
                buffer = '';
            } else {
                var remainingBuffer = buffer.substring(msgLength);
                buffer = remainingBuffer;
            }

            // Step 2: Validate message
            var calculatedChecksum = Msg.checksum(msg.substr(0, msg.length - 7));
            var extractedChecksum = msg.substr(msg.length - 4, 3);

            if (calculatedChecksum !== extractedChecksum) {
                var error = 'Discarding message because body length or checksum are wrong (expected checksum: ' + calculatedChecksum + ', received checksum: ' + extractedChecksum + '): [' + msg + ']'
                return self.emit('error', new Error(error));
            }

            // load up proper message type
            var msg = Msg.parse(msg);
            self.emit('message', msg);
        }
    });
}

util.inherits(FixFrameDecoder, events.EventEmitter);
module.exports = FixFrameDecoder;

