/*jslint node: true */
'use strict';

var USBSerial, debug, usb;

var dev = process.env.DEV || '/dev/cu.HUAWEIMobile-Pcui';

USBSerial = require('../index.js');
if (process.env.DEBUG) {
	debug = require('debug')('modem-serial:test');
} else {
	debug = function() {console.log.apply(this, arguments);};
}
usb = new USBSerial(dev);

usb.getNotified(function (field, oldValue, newValue) {
  debug('%s changed from %s to %s', field, oldValue, newValue);
  debug(usb.getInfo());
});

usb.onCallStatusChange(function (status, ts) {
	debug('[%d] Call is in status: %s', ts, status);
	debug(usb.getCallInfo());
});

if (process.env.NUMBER) {
	setTimeout(function(){
		debug("CALLING");
		usb.call(process.env.NUMBER, 10);
	},60000);
}
