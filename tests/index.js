var USBSerial = require('../index.js');
if (process.env.DEBUG) {
	var debug = require('debug')('modem-serial:test');
} else {
	var debug = function(text) {console.log(text)};
}
var usb = USBSerial('/dev/cu.HUAWEIMobile-Pcui');

usb.getNotified(function (field, oldValue, newValue) {
  debug('%s changed from %s to %s', field, oldValue, newValue);
  debug(usb.getInfo());
});

usb.onCallStatusChange(function (status, ts) {
	debug('[%d] Call is in status: %s', ts, status);
	debug(usb.getCallInfo());
})

if (process.env.NUMBER) {
	setTimeout(function(){
		debug("CALLING")
		usb.call(process.env.NUMBER, 10);
	},10000);
}
