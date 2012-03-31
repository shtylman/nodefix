var Mocha = require('mocha');

var mocha = new Mocha;
mocha.reporter('list').ui('exports');

mocha.addFile('test/admin.js');

mocha.run();

