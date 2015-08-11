var USBSerial = require('../index.js');
if (process.env.DEBUG) {
	var debug = require('debug')('modem-serial:test');
} else {
	var debug = function(text) {console.log(text)};
}
var usb = USBSerial('/dev/cu.HUAWEIMobile-Pcui');

usb.getNotified(function (field) {
  debug(field + ' changed');
  debug(usb.getInfo());
})
