//'use strict'

/**
* Plugin para manejar la interfaz de comandos AT los módems USB desde la
*
* @class ModemSerial
* @constructor
*/

var SerialPort = require('serialport').SerialPort,
	exec = require('child_process').exec,
	translate = require('./translate'),
	DEFAULT_DURATION = 10,
	writeLock = false,
	writeQ = [],
	readQ = [];

if (process.env.DEBUG) {
	var debug = require('debug')('modem-serial:main');
} else {
	var debug = function(text) {};
}

var ModemSerial = function (dev) {
	var self = this;

	var info = {
		'USB_port': dev,
		'statusText': 'Initializing'
	};

	var callInfo = {
		timing: {}
	};

	this.getInfo = function () {
		return info;
	};

	this.getCallInfo = function () {
		return callInfo;
	};

	// Subscribe to notifications of changes in modem
	this.getNotified = function (callback) {
		if (typeof callback === 'function') {
			notify = callback;
		}
	};

	// Stablish connection to the Internet
	this.connect = function () {
		// TODO: Send connect commands to the modem
	};

	// Make a phone call to the number specified
	this.call = function (number, duration) {
		if (typeof duration === "undefined") {
			duration = 10;
		}
		callInfo = {
			type: 'outgoing',
			number: number,
			maxDuration: duration,
			timing: {}
		};
		command('call', number);
	};

	this.answer = function (duration) {
		callInfo.maxDuration = duration;
		command('answer');
	}

	this.hangup = function () {
		command('hangup');
	}

	this.onCallStatusChange = function (callback) {
		if (typeof callback === 'function') {
			notifyCallStatus = function () {
				if (arguments[0] === 'ringing') {
					callInfo = {
						type: 'incoming',
						timing: {}
					};
				}
				callInfo.timing[arguments[0]] = new Date().getTime();
				var args = [
					arguments[0],				// Call status
					callInfo.timing[arguments[0]],
					callInfo
				];
				callback.apply(null, args);
				switch (arguments[0]) {
					case 'answered':
						setTimeout(function () {
							self.hangup();
						}, callInfo.maxDuration*1000);
						break;
					case 'ringing':
						self.answer(DEFAULT_DURATION);
						break;
				}
			}
		}
	}

	// Function to notify changes in call status (empty at the beginning)
	var notifyCallStatus = function () {
		if (arguments[0] === 'ringing') {
			callInfo = {
				type: 'incoming',
				timing: {}
			};
		}
		callInfo.timing[arguments[0]] = new Date().getTime();
		switch (arguments[0]) {
			case 'answered':
				setTimeout(function () {
					self.hangup();
				}, callInfo.maxDuration*1000);
				break;
			case 'ringing':
				self.answer(DEFAULT_DURATION);
				break;
		}
	};

	// Function to notify changes in modem (empty at the beginning)
	var notify = function (field, old, data) {};

	var set = function (field, data) {
		info.ts = new Date().getTime(); // Set new timestamp for the info

		// If the value doesn't change, there's no need to update, nor notify.
		if (info[field]!==data) {
			var old = info[field];
			info[field] = data;
			notify(field, old, data);
		}
	};

	var options = {
		baudrate: 57600
	};
	var serialPort = new SerialPort(dev, options);
	serialPort.on('open', function() {
		debug(dev + ' opened');
		serialPort.on('data', function (data) {
			parseRead(data.toString());
		});
		// Initialization
		init();
		//setInterval(atInfo,3000);
	});

	var commands = {
		'call':{
			'check':'NO CARRIER',
			'action': function (number, callback) {
				send('ATD' + number + ';', function (results) {
					debug('DATA (ATD): ' + results);
					notifyCallStatus("nocarrier");
					if (callback) callback(results);
				});
			}
		},
		'answer':{
			'check':'ATA',
			'action': function (callback) {
				send('ATA', function (results) {
					debug('DATA (ATA): ' + results);
					if (callback) callback(results);
				});
			}
		},
		'hangup':{
			'check':'ATH',
			'action': function (callback) {
				send('+++');
				send('ATH0', function (results) {
					debug('DATA (ATH): ' + results);
					if (callback) callback(results);
				});
			}
		},
		'ATZ': {
			'check':'OK',
			'action': function (callback) {
				send('ATZ', function (results) {
					debug('DATA (ATZ): ' + results);
					if (callback) callback(results);
				});
			}
		},
		'ATI': {
			'check':'Manufacturer',
			'action': function (callback) {
				send('ATI', function (results) {
					debug('DATA (ATI): ' + results);
					var res = results.replace(/\r/g,'').split('\n');
					for (var i = 0; i < res.length; i++) {
						if (res[i].indexOf('Manufacturer')>=0) {
							set('fabricante',res[i].substring(res[i].search('Manufacturer:')+14).replace(/\"/g,''));
						}
						if (res[i].indexOf('Model')>=0) {
							set('modelo',res[i].substring(res[i].search('Model:')+7).replace(/\"/g,''));
						}
						if (res[i].indexOf('Revision')>=0) {
							set('firmware',res[i].substring(res[i].search('Revision:')+10).replace(/\"/g,''));
						}
						if (res[i].indexOf('IMEI:')>=0) {
							set('imei',res[i].substring(res[i].search('IMEI:')+6).replace(/\"/g,''));
						}
					};
					if (callback) callback(results);
				});
			}
		},
		'AT+CIMI':{
			'check': function (msg) {
				var m = msg.split('\n');
				for (var i = m.length - 1; i >= 0; i--) {
					//var r = ((''+(m[i]*1)).length == 15 && !isNaN(m[i]*1) && (m[i]*1)!=0)
					var r = ((''+(m[i]*1)).length == 15 && (m[i]-0)==m[i]);
					debug("checking... " + m[i] + " = " + r);
					if (r) return true;
				};
				return false;
			},
			'action': function (callback) {
				send('AT+CIMI', function (results) {
					debug('DATA (AT+CIMI): ' + results);
					var m = results.split('\n');
					for (var i = m.length - 1; i >= 0; i--) {
						if (!isNaN(m[i]*1) && (m[i]*1)!=0) set('imsi',''+(m[i]*1)+'');
					};
					if (callback) callback(results);
				});
			}
		},
		'AT+CRSM=176,12258,0,0,10':{
			'check':'+CRSM:',
			'action': function (callback) {
				send('AT+CRSM=176,12258,0,0,10', function (results) {
					debug('DATA (AT+CRSM=176,12258,0,0,10): ' + results);
					var res = results.substring(results.search('CRSM:')+6).split(',');
					if (res.length>2){
          	var tmp = res[2].replace(/\"/g,'');
          	var iccid = "";
          	for (var c = 0; c < tmp.length; c=c+2) {
              	iccid += tmp[c+1]+tmp[c];
          	}
          	iccid = iccid.split('\n')[0];
              debug('ICC-ID:'+iccid);
              set('iccid',iccid);
          }
					if (callback) callback(results);
				});
			}
		},
		'AT+COPS?': {
			'check':'+COPS:',
			'action': function (callback) {
				send('AT+COPS=3,2');
				send('AT+COPS?', function (results) {
					debug('DATA (AT+COPS): ' + results);
					var res = results.split('\n');
					for (var i = 0; i < res.length; i++) {
						if (res[i].indexOf('+COPS:')>=0) {
							var data = res[i].parseLine('+COPS:').split(',');
							if (data[2]) {
								var operador_id = data[2].replace(/\"/g,'');
								data[3] = data[3]*1;
								set('provider_id', operador_id);
								set('provider', translate('provider', operador_id, 1));
								set('technology_id', data[3]);
								set('technology', translate('techCOPS', data[3], 1));
								set('subtechnology', translate('techCOPS', data[3], 2));
							}
						}
					}
					if (callback) callback(results);
				});
			}
		},
		'AT+CSQ':{
			'check':'+CSQ:',
			'action': function (callback) {
				send('AT+CSQ', function (results) {
					debug('DATA (AT+CSQ?): ' + results);
					var rssi = results.parseLine('+CSQ:').split(',')[0]*1;
					debug('AT+CSQ= ' + rssi);
					set('rssi',rssi);
					if (callback) callback(results);
				});
			}
		},
		'AT^HCSQ?': {
			'check':'HCSQ:',
			'action': function (callback) {
				send('AT^HCSQ?', function (results) {
					debug('DATA (AT^HCSQ?): ' + results);
					var data = results.substring(6).split('\n')[0].split(',');
					switch(data[0]) {
				    	case 'GSM':
				    		debug('GSM: RSSI:'+data[1]);
				    		set('hcsq',{
					    		'rssi': data[1]*1
				    		});
				    		break;
				    	case 'WCDMA':
				    		debug('WCDMA: RSSI:'+data[1]+' RSCP:'+data[2]+' ECIO:'+data[3]);
				    		set('hcsq', {
					    		'rssi': data[1]*1,
					    		'rscp': data[2]*1,
					    		'ecio': data[3]*1
				    		});
				    		break;
			    		case 'LTE':
				    		debug('LTE: RSSI:'+data[1]+' RSRP:'+data[2]+' SINR:'+data[3]+' RSRQ:'+data[4]);
				    		set('hcsq', {
					    		'rssi': data[1]*1,
					    		'rsrp': data[2]*1,
					    		'sinr': data[3]*1,
					    		'rsrq': data[4]*1
				    		});
				    		break;
				    	case 'CDMA':
				    		debug('CDMA: RSSI:'+data[1]+' ECIO:'+data[2]);
				    		set('hcsq', {
					    		'rssi': data[1]*1,
					    		'ecio': data[2]*1
				    		});
				    		break;
				    	case 'EVDO':
				    		debug('EVDO: RSSI:'+data[1]+' ECIO:'+data[2]+' SINR:'+data[3]);
				    		set('hcsq', {
					    		'rssi': data[1]*1,
					    		'ecio': data[2]*1,
					    		'sinr': data[3]*1
				    		});
				    		break;
				    	case 'CDMA-EVDO':
				    		debug('CDMA-EVDO: RSSI:'+data[1]+' ECIO:'+data[2]+' eRSSI:'+data[3]+' eECIO:'+data[4]+' SINR:'+data[4]);
				    		set('hcsq', {
					    		'rssi': data[1]*1,
					    		'ecio': data[2]*1,
					    		'erssi': data[3]*1,
					    		'eecio': data[4]*1,
					    		'sinr': data[5]*1
				    		});
				    		break;
				    	default:
				    		set('hcsq', {});
			    	}
						if (callback) callback(results);
			    });
			}
		},
		'AT+CGREG?':{
			'check': function (msg) {
				if (msg.indexOf('CGREG:')>=0) {
					var data = msg.parseLine('CGREG:').split(',');
					if (data.length > 3) return true;
				}
				return false;
			},
			'action': function (callback) {
				send('AT+CGREG=2');
				send('AT+CGREG?', function (results) {
					debug('DATA (AT+CGREG?): ' + results);
					var data = results.parseLine('CGREG:').split('\r')[0].split(',');
					set("lac_id", data[2]);
					set("cell_id", data[3]);
					if (callback) callback(results);
				});
			}
		},
		'AT+CREG?':{
			'check': function (msg) {
				if (msg.indexOf('CREG:')>=0) {
					var data = msg.parseLine("CREG:").split(',');
					if (data.length > 3) return true;
				}
				return false;
			},
			'action': function (callback) {
				send('AT+CREG=2');
				send('AT+CREG?', function (results) {
					debug('DATA (AT+CREG?): ' + results);
					var data = results.parseLine("CREG: ").split('\r')[0].split(',');
					set("lac_id", data[2].replace(/\s/g,''));
					set("cell_id", data[3].replace(/\s/g,''));
					if (callback) callback(results);
				});
			}
		},
		'AT^SYSCFGEX?':{
			'check':'SYSCFGEX:',
			'action': function (callback) {
				send('AT^SYSCFGEX?', function (results) {
					debug('DATA (AT^SYSCFGEX?): ' + results);
					var data = results.parseLine('SYSCFGEX:').split(',')[0].replace(/\"/g,'');
					set('config_tech',data);
					if (callback) callback(results);
				});
			}
		},
		'AT^SYSINFOEX':{
			'check':'SYSINFOEX:',
			'action': function (callback) {
				send('AT^SYSINFOEX', function (results) {
					debug('DATA (AT^SYSINFOEX): ' + results);
					var data = results.parseLine('SYSINFOEX:').split('\r')[0].replace(/\"/g,'').replace(/\s/g,'').split(',');
					set('roaming',data[2]*1);
          set('technology_new_id',data[5]*1);
          set('technology_new',data[6]);
          set('subtechnology_new_id',data[7]*1);
          set('subtechnology_new',data[8]);
					if (callback) callback(results);
				});
			}
		},
		'AT+CGACT?':{
			'check':'CGACT: ',
			'action': function (callback) {
				send('AT+CGACT?', function (results) {
					debug('DATA (AT+CGACT?): ' + results);
					var data = results.parseLine('CGACT: ').split('\r')[0].split(',');
					if (data[0]!='') {
						set('status',data[1]*1); // ¿Connected?
					} else {
						set('status',0)
					}
					if (callback) callback(results);
				});
			}
		},
		'AT+CGPADDR':{
			'check':'CGPADDR:',
			'action': function (callback) {
				send('AT+CGPADDR', function (results) {
					debug('DATA (AT+CGPADDR): ' + results);
					var data = results.parseLine('+CGPADDR: ').split('\r')[0].split(',')[1].replace(/\"/g,'');
					if (data !== "0.0.0.0") set('ip',data);
					if (callback) callback(results);
				});
			}
		},
		'AT+CGCONTRDP':{
			'check':'+CGCONTRDP:',
			'action': function (callback) {
				send('AT+CGCONTRDP', function (results) {
					debug('DATA (AT+CGCONTRDP): ' + results);
					var data = results.parseLine('+CGCONTRDP: ').split('\n')[0].split(',');
					if ( ( data[1] * 1 ) > 0 ) {
						var ip = data[3].replace(/\"/g,'').split('.');
						set('ip_cont',''+ip[0]+'.'+ip[1]+'.'+ip[2]+'.'+ip[3]);

			    	if (ip.length >= 7) {
							set('netmask',''+ip[4]+'.'+ip[5]+'.'+ip[6]+'.'+ip[7]);
			    	}

			    	var gw = data[4].replace(/\"/g,'');
			    	if (gw !== '') {
				    	set('gw',gw);
			    	}
			    	var dns1 = data[5].replace(/\"/g,'');
			    	var dns2 = data[6].replace(/\"/g,'');
						set('dns1',dns1);
						set('dns2',dns2);
					}
					// set('status',data); // ¿Connected?
					if (callback) callback(results);
				});
			}
		},
		'AT^DHCP':{
			'check':'^DHCP:',
			'action': function (callback) {
				send('AT^DHCP', function (results) {
					debug('DATA (AT^DHCP): ' + results);

					set('status', 1); // If there is a response, the modem is connected

					var data = results.parseLine('^DHCP:').split('\n')[0];
					var perl = 'print join(",",map { join(".", unpack("C4", pack("L", hex))) } split /,/, shift)';
					exec("perl -e '"+perl+"' "+data, function (err, stdout, stderr){
						var data = stdout.split(',');
						if (data[0].indexOf(".")>=0) {
					    	var ip = data[0].replace(/\"/g,'');
					    	var netmask = data[1].replace(/\"/g,'');
					    	var gw = data[2].replace(/\"/g,'');
					    	var dns1 = data[4].replace(/\"/g,'');
					    	var dns2 = data[5].replace(/\"/g,'');
						} else {
					    	var ip = 0;
					    	var netmask = 0;
					    	var gw = 0;
					    	var dns1 = 0;
					    	var dns2 = 0;
						}
				    set('ip_cont',ip);
				    set('netmask',netmask);
				    set('gw',gw);
				    if (dns1 != "0.0.0.0")
							set('dns1',dns1);
				    if (dns2 != "0.0.0.0")
				    	set('dns2',dns2);
					});
					// set('status',data); // ¿Connected?
					if (callback) callback(results);
				});
			}
		}
	};

	var command = function () {
		var comm = arguments[0];
		var args = [];
		for (var i = 1; i < arguments.length; i++) {
			args.push(arguments[i]);
		};
		if (commands[comm]) {
			commands[comm].action.apply(null, args);
		} else {
			console.err(comm + " not defined.");
		}
	};

	var parseRead = function (message) {
		var found = false;
		var ok = function (r) {
			var action = readQ.splice(r,1)[0];
			clearTimeout(action[3]);
			if (message) {
				return action[1](message);
			} else {
				return;
			}
		}
		for (var r = 0; r < readQ.length; r++) {
			if (readQ[r]) {
				for (var comm in commands) {
					if (readQ[r][0] === comm) {
						if (typeof commands[comm].check === "function") {
							if (commands[comm].check(message)) {
								return ok(r);
							}
						} else {
							if (message.indexOf(commands[comm].check)>=0) {
								return ok(r);
							}
						}
					}
				}
				if (message.indexOf(readQ[r][0])>=0) {
					return;
				}
			}
		};
		// If it arrives here => unsolicited messages
		unsolicited(message);
	};

	String.prototype.parseLine = function (search) {
		if (this.indexOf(search)>=0) {
			return this.substring(this.indexOf(search)+search.length);
		}
	};

	var write = function () {
		writeLock = true;
		if (writeQ.length) {
			var action = writeQ.shift();
			serialPort.write( action[0] + '\r', function (err, results) {
				if (err) debug('err ' + err);
	    		if (action[1]) {
	    			readQ.push(action);
	    			var _index = readQ.length-1;
	    			var ts = new Date().getTime();

	    			// Asign ts as read ID
	    			readQ[_index][2] = new Date().getTime();

	    			// Stablish timeout to delete readQ element after 10 seconds
	    			readQ[_index][3] = setTimeout(function(){
	    				for (var r = 0; r < readQ.length; r++) {
	    					if (readQ[r][2] == ts) {
	    						readQ.splice(r,1);
	    					}
	    				};
	    			},10000);
	    		}
	    		if (writeQ.length) {
						debug("#writeQ:%d",writeQ.length);
						setTimeout(write, 100);
	    		} else {
	    			writeLock = false;
	    		}
			});
		}
	};

	var send = function (message, callback) {
		writeQ.push([message, callback?callback:null]);
		if (!writeLock) {
			write();
		}
	};

	var unsolicited = function (message) {
		if (message.indexOf('^')>=0) {
			var messages = message.split('\n');
			for (var m = 0; m < messages.length; m++) {
				switch (messages[m].substring(1).split(':')[0]) {
					case 'RSSI':
						// Signal strength
						debug('RSSI= '+messages[m].substring(6)*1);
						set('rssi', messages[m].substring(6)*1);
						break;
					case 'HCSQ':
						// Quality levels
						debug('HCSQ= '+messages[m].substring(6));
						commands['AT^HCSQ?'].action(messages[m]);
						break;
					case 'MODE':
						// Technology attached
						var data = messages[m].substring(6).split(',');
						var tech_id = data[0];
						var subtech_id = data[1];
						var tech = translate('tech',tech_id);
						var subtech = translate('subtech',subtech_id);

						debug('MODE= ' + tech + ',' + subtech);
						set('technology', tech);
						set('technology_id', tech_id);
						set('subtechnology', subtech);
						set('subtechnology_id', subtech_id);
						break;
					case 'BOOT':
						// Pending to know what this is for
						debug('BOOT= '+messages[m].substring(6));
						break;
					case 'DSFLOWRPT':
						// Data session statistics (send AT^DSFLOWCLR to clear them).
						var data = messages[m].substring(11).split(',');
						var msg = 'DSFLOWRPT';
						if (data[0]) {
							msg += '\n\t' + data[0] + ' s connected';
						}
						if (data[1]) {
							msg += '\n\t' + (data[1]*8/1000) + ' kbps upload speed';
						}
						if (data[2]) {
							msg += '\n\t' + (data[2]*8/1000) + ' kbps download speed';
						}
						if (data[3]) {
							msg += '\n\t' + data[3] + ' bytes transmitted';
						}
						if (data[4]) {
							msg += '\n\t' + data[4] + ' bytes received';
						}
						if (data[5]) {
							msg += '\n\t' + (data[5]*8/1000) + ' kbps negociated QoS uplink speed';
						}
						if (data[6]) {
							msg += '\n\t' + (data[6]*8/1000) + ' kbps negociated QoS downlink speed';
						}
						debug(msg);
						break;
					case 'ORIG':
						notifyCallStatus('originating');
						set('statusText', 'Dialing');
						break;
					case 'CONF':
						notifyCallStatus('tone');
						set('statusText', 'Dialing');
						break;
					case 'CONN':
						notifyCallStatus('answered');
						if (callInfo.type === 'incoming') {
							set('statusText', 'Incoming');
						} else {
							set('statusText', 'Outgoing');
						}
						break;
					case 'CEND':
						var data = messages[m].substring(6).split(',');
						callInfo.duration = data[1]*1;
						callInfo.endStatus = data[2]*1;
						callInfo.hangupCause = data[3]*1;
						notifyCallStatus('hangup');
						set('statusText', 'Free');
						break;
					default:
						if (messages[m].length>1) {
							console.warn('UNKNOWN UNSOLICITED \'^\' MESSAGE: ' + messages[m]);
						}
				}
			};
		} else if (message.indexOf('+')>=0) {
			var messages = message.split('\n');
			for (var m = 0; m < messages.length; m++) {
				switch (messages[m].substring(1).split(':')[0]) {
					case 'CREG':
						var data = messages[m].parseLine('+CREG: ').split(',');
						debug("Unsolicited CREG= " + messages[m]);
						if (data[1])
							set("lac_id", data[1].replace(/\s/g,''));
						if (data[2])
							set("cell_id", data[2].replace(/\s/g,''));
						break;
					default:
							if (messages[m].length>1) {
								console.warn('UNKNOWN UNSOLICITED \'+\' MESSAGE: ' + messages[m]);
							}
				}
			}
		} else {
			var messages = message.split('\n');
			for (var m = 0; m < messages.length; m++) {
				switch (messages[m].split(':')[0].split('\r')[0]) {
					case 'RING':
						set('statusText','Ringing');
						notifyCallStatus('ringing');
						break;
					default:
							if (messages[m].length>1) {
								console.warn('ELSE UNSOLICITED ' + message);
							}
				}
			}
		}
	};

	var init = function () {
		// Initialization
		command('ATZ',function () {
			atInfo();
			set('statusText','Free');
		});
	};

	var atInfo = function () {
		command('ATI');									// Device Info
		command('AT+CIMI');							// IMSI
		command('AT+CRSM=176,12258,0,0,10'); // ICC-ID
		command('AT+COPS?');					// Provider & Technology
		command('AT+CSQ');						// Signal strength
		command('AT^HCSQ?');					// Signal quality
		command('AT+CGREG?');					// LAC & Cell ID
		command('AT+CREG?');					// LAC & Cell ID
		command('AT^SYSINFOEX');				// Frequency
		command('AT^SYSCFGEX?');				// Frequency
		command('AT+CGACT?');					// Is Connected?
		command('AT+CGPADDR');					// IP Address
		command('AT+CGCONTRDP');				// Routing params
		command('AT^DHCP');						// DHCP
	};

	return this;
};

module.exports = ModemSerial;
