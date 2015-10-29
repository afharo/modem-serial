/*jslint node: true */
'use strict';

/**
* Interface to take care of the communications with each USB modem.
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

	var getInfo = function () {
		return info;
	};

	var getCallInfo = function () {
		return callInfo;
	};

	// Subscribe to notifications of changes in modem
	var getNotified = function (callback) {
		if (typeof callback === 'function') {
			notify = callback;
		}
	};

	// Stablish connection to the Internet
	var connect = function () {
		// TODO: Send connect commands to the modem
	};

	// Make a phone call to the number specified
	var call = function (number, duration) {
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

	var answer = function (duration, timeout) {
		callInfo.maxDuration = duration;
		command('answer');
		// TODO: Alert if timeout and incoming call hasn't arrived
	};

	var hangup = function () {
		command('hangup');
	};

	var onCallStatusChange = function (callback) {
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
							hangup();
						}, callInfo.maxDuration*1000);
						break;
					case 'ringing':
						answer(DEFAULT_DURATION);
						break;
				}
			};
		}
	};

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
					hangup();
				}, callInfo.maxDuration*1000);
				break;
			case 'ringing':
				answer(DEFAULT_DURATION);
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
				send('ATD' + number + ';', 'call', function (results) {
					debug('DATA (ATD): ' + results);
					notifyCallStatus("nocarrier");
					if (callback) callback(results);
				});
			}
		},
		'answer':{
			'check':'ATA',
			'action': function (callback) {
				send('ATA', 'answer', function (results) {
					debug('DATA (ATA): ' + results);
					if (callback) callback(results);
				});
			}
		},
		'hangup':{
			'check':'AT+CHUP',
			'action': function (callback) {
				//send('+++');
				send('AT+CHUP', 'hangup',  function (results) {
					debug('DATA (AT+CHUP): ' + results);
					if (callback) callback(results);
				});
			}
		},
		'resetConfig': {
			'check':'OK',
			'action': function (callback) {
				send('ATZ', 'resetConfig',  function (results) {
					debug('DATA (ATZ): ' + results);
					if (callback) callback(results);
				});
			}
		},
		'deviceInfo': {
			'check':'Manufacturer',
			'action': function (callback) {
				send('ATI', 'deviceInfo', function (results) {
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
					}
					if (callback) callback(results);
				});
			}
		},
		'imsi':{
			'check': function (msg) {
				var m = msg.split('\n');
				for (var i = m.length - 1; i >= 0; i--) {
					var r = (((''+(m[i]*1)).length == 15 && (m[i]-0)==m[i]) || (m[i].indexOf('+CIMI:')>=0));
					debug("checking... " + m[i] + " = " + r);
					if (r) return true;
				}
				return false;
			},
			'action': function (callback) {
				send('AT+CIMI', 'imsi', function (results) {
					debug('DATA (AT+CIMI): ' + results);
					var m = results.split('\n');
					for (var i = m.length - 1; i >= 0; i--) {
						if (!isNaN(m[i]*1) && (m[i]*1) !== 0) {
							set('imsi',''+(m[i]*1)+'');
							if (translate('provider', ''+(m[i]*1)+'', 1) !== ''+(m[i]*1)+'') {
								set('provider', translate('provider', ''+(m[i]*1)+'', 1));
							}
						} else if (m[i].indexOf('+CIMI:')>=0) {
							set('imsi',''+(m[i].parseLine('+CIMI:')*1)+'');
							if (translate('provider', ''+(m[i].parseLine('+CIMI:')*1)+'', 1) !== ''+(m[i].parseLine('+CIMI:')*1)+'') {
								set('provider', translate('provider', ''+(m[i].parseLine('+CIMI:')*1)+'', 1));
							}
						}
					}
					if (callback) callback(results);
				});
			}
		},
		'iccid':{
			'check':'+CRSM:',
			'action': function (callback) {
				send('AT+CRSM=176,12258,0,0,10', 'iccid',  function (results) {
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
		'provider': {
			'check':'+COPS:',
			'action': function (callback) {
				if (info.fabricante && info.modelo &&
					(
						(info.fabricante.indexOf('QualComm .CO') && info.modelo.indexOf('BU580')>=0) ||
						(info.fabricante.indexOf('QUALCOMM')>=0)
					)) {
					send('AT+COPS=0,0', 'provider', function (results) {
						// TODO: Keep going getting provider for CDMA
					});
				} else {
					send('AT+COPS=3,2', 'provider', function (results) {
						send('AT+COPS?', 'provider', function (results) {
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
					});
				}
			}
		},
		'signalStrength':{
			'check':'+CSQ:',
			'action': function (callback) {
				send('AT+CSQ', 'signalStrength', function (results) {
					debug('DATA (AT+CSQ?): ' + results);
					var rssi = results.parseLine('+CSQ:').split(',')[0]*1;
					debug('AT+CSQ= ' + rssi);
					set('rssi',rssi);
					if (callback) callback(results);
				});
			}
		},
		'signalQuality': {
			'check':'HCSQ:',
			'action': function (callback) {
				send('AT^HCSQ?', 'signalQuality', function (results) {
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
		'cellInfo':{
			'check': function (msg) {
				var data;
				if (msg.indexOf('CGREG:')>=0) {
					data = msg.parseLine('CGREG:').split(',');
					if (data.length > 3) return true;
				}
				if (msg.indexOf('CREG:')>=0) {
					data = msg.parseLine('CREG:').split(',');
					if (data.length > 3) return true;
				}
				return false;
			},
			'action': function (callback) {
				if (info.fabricante && info.modelo
					(
						(info.fabricante.indexOf('QualComm .CO') && info.modelo.indexOf('BU580')>=0) ||
						(info.fabricante.indexOf('QUALCOMM')>=0)
					)) {
					//send('AT+CCED=1,1'); // Start automatic snapshots and dump network information (CCED)
					//send('AT+CCED=1,8'); // Start automatic snapshots and dump rssi (CSQ)
					send('AT+CCED=1'); // Start automatic snapshots and dump rssi (CSQ) and network information (CCED)
				} else {
					send('AT+CGREG=2', 'cellInfo');
					send('AT+CGREG?', 'cellInfo', function (results) {
						debug('DATA (AT+CGREG?): ' + results);
						var data = results.parseLine('CGREG:').split('\r')[0].split(',');
						set("lac_id", data[2]);
						set("cell_id", data[3]);
						if (callback) callback(results);
					});
					send('AT+CREG=2', 'cellInfo');
					send('AT+CREG?', 'cellInfo', function (results) {
						debug('DATA (AT+CREG?): ' + results);
						var data = results.parseLine("CREG: ").split('\r')[0].split(',');
						set("lac_id", data[2].replace(/\s/g,''));
						set("cell_id", data[3].replace(/\s/g,''));
						if (callback) callback(results);
					});
				}
			}
		},
		// 'cellInfo2':{
		// 	'check': function (msg) {
		// 		if (msg.indexOf('CREG:')>=0) {
		// 			var data = msg.parseLine("CREG:").split(',');
		// 			if (data.length > 3) return true;
		// 		}
		// 		return false;
		// 	},
		// 	'action': function (callback) {
		// 		send('AT+CREG=2');
		// 		send('AT+CREG?', function (results) {
		// 			debug('DATA (AT+CREG?): ' + results);
		// 			var data = results.parseLine("CREG: ").split('\r')[0].split(',');
		// 			set("lac_id", data[2].replace(/\s/g,''));
		// 			set("cell_id", data[3].replace(/\s/g,''));
		// 			if (callback) callback(results);
		// 		});
		// 	}
		// },
		'bandConfig':{
			'check':'SYSCFGEX:',
			'action': function (callback) {
				send('AT^SYSCFGEX?', 'bandConfig', function (results) {
					debug('DATA (AT^SYSCFGEX?): ' + results);
					var data = results.parseLine('SYSCFGEX:').split(',')[0].replace(/\"/g,'');
					set('config_tech',data);
					if (callback) callback(results);
				});
			}
		},
		'technology':{
			'check':'SYSINFOEX:',
			'action': function (callback) {
				send('AT^SYSINFOEX', 'technology', function (results) {
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
		'isConnected':{
			'check':'CGACT: ',
			'action': function (callback) {
				send('AT+CGACT?', 'isConnected', function (results) {
					debug('DATA (AT+CGACT?): ' + results);
					var data = results.parseLine('CGACT: ').split('\r')[0].split(',');
					if (data[0]!=='') {
						set('status',data[1]*1); // ¿Connected?
					} else {
						set('status',0);
					}
					if (callback) callback(results);
				});
			}
		},
		'ipAddress':{
			'check':['CGPADDR:','+CGCONTRDP:','^DHCP'],
			'action': function (callback) {
				send('AT+CGPADDR', 'ipAddress', function (results) {
					debug('DATA (AT+CGPADDR): ' + results);
					var data = results.parseLine('+CGPADDR: ').split('\r')[0].split(',')[1].replace(/\"/g,'');
					if (data !== "0.0.0.0") set('ip',data);
					if (callback) callback(results);
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
						send('AT^DHCP', function (results) {
							debug('DATA (AT^DHCP): ' + results);

							set('status', 1); // If there is a response, the modem is connected

							var data = results.parseLine('^DHCP:').split('\n')[0];
							var perl = 'print join(",",map { join(".", unpack("C4", pack("L", hex))) } split /,/, shift)';
							exec("perl -e '"+perl+"' "+data, function (err, stdout, stderr){
								var ip, netmask, gw, dns1, dns2;
								var data = stdout.split(',');
								if (data[0].indexOf(".")>=0) {
							    	ip = data[0].replace(/\"/g,'');
							    	netmask = data[1].replace(/\"/g,'');
							    	gw = data[2].replace(/\"/g,'');
							    	dns1 = data[4].replace(/\"/g,'');
							    	dns2 = data[5].replace(/\"/g,'');
								} else {
							    	ip = 0;
							    	netmask = 0;
							    	gw = 0;
							    	dns1 = 0;
							    	dns2 = 0;
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
					});
				});
			}
		}
	};

	var command = function () {
		var comm = arguments[0];
		var args = [];
		for (var i = 1; i < arguments.length; i++) {
			args.push(arguments[i]);
		}
		if (commands[comm]) {
			commands[comm].action.apply(null, args);
		} else {
			console.error(comm + " not defined.");
		}
	};

	var parseRead = function (message) {
		var found = false;
		var ok = function (r) {
			var action = readQ.splice(r,1)[0];
			clearTimeout(action.timeout);
			if (message) {
				return action.callback(message);
			} else {
				return;
			}
		};
		for (var r = 0; r < readQ.length; r++) {
			if (readQ[r]) {
				for (var comm in commands) {
					if (readQ[r].cmd === comm) {
						if (typeof commands[comm].check === "function") {
							if (commands[comm].check(message)) {
								return ok(r);
							}
						} else if (Array.isArray(commands[comm].check)) {
							for (var c = 0; c < commands[comm].check.length; c++) {
								if (message.indexOf(commands[comm].check[c])>=0) {
									return ok(r);
								}
							}
						} else {
							if (message.indexOf(commands[comm].check)>=0) {
								return ok(r);
							}
						}
					}
				}
				if (message.indexOf(readQ[r].msg)>=0) {
					return;
				}
			}
		}
		// If it arrives here => unsolicited messages
		unsolicited(message);
	};

	String.prototype.parseLine = function (search) {
		if (this.indexOf(search)>=0) {
			return this.substring(this.indexOf(search)+search.length);
		} else {
			return this;
		}
	};

	var write = function () {
		writeLock = true;
		if (writeQ.length) {
			var action = writeQ.shift();
			serialPort.write( action.msg + '\r', function (err, results) {
				if (err) debug('err ' + err);
	    		if (action.callback) {
						action.ts = new Date().getTime();
						action.timeout = setTimeout(function () {
							for (var r = 0; r < readQ.length; r++) {
	    					if (readQ[r][2] == action.ts) {
	    						readQ.splice(r,1);
	    					}
	    				}
						}, 10000);
	    			readQ.push(action);
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

	var send = function (message, command, callback) {
		writeQ.push({
			'msg': message,
			'cmd': command,
			'callback': callback?callback:null
		});
		if (!writeLock) {
			write();
		}
	};

	var unsolicited = function (message) {
		var data, messages, m;
		if (message.indexOf('^')>=0) {
			messages = message.split('\n');
			for (m = 0; m < messages.length; m++) {
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
						data = messages[m].substring(6).split(',');
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
						data = messages[m].substring(11).split(',');
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
						data = messages[m].substring(6).split(',');
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
			}
		} else if (message.indexOf('+')>=0) {
			messages = message.split('\n');
			for (m = 0; m < messages.length; m++) {
				switch (messages[m].substring(1).split(':')[0]) {
					case 'CREG':
						data = messages[m].parseLine('+CREG: ').split(',');
						debug('Unsolicited CREG= ' + messages[m]);
						if (data[1])
							set('lac_id', data[1].replace(/\s/g,''));
						if (data[2])
							set('cell_id', data[2].replace(/\s/g,''));
						break;
					case 'CSQ':
						var rssi = messages[m].parseLine('+CSQ: ').split(',')[0]*1;
						debug('AT+CSQ (unsolicited)= ' + rssi);
						set('rssi',rssi);
						break;
					case 'CCED':
						data = messages[m].parseLine('+CCED:').split(',');
						debug('Unsolicited CCED= ' + messages[m]);
						//Main Cell: <mode>, <band class>, <Channel #>, SID, NID, <Base Station P Rev>, [<Pilot PN offset>],
						//						<Base Station ID>, [<Slot cycle index>], [<Ec/Io>], <Rx power>, <Tx power>, <Tx Adj>
						// TODO: Keep parsing
						if (data[3]) {
							set('provider_id', ''+data[3].replace(/\s/g,''));
							set('provider', translate('provider', ''+data[3].replace(/\s/g,''), 1));
						}
						if (data[4]) {
							set("number", data[4].replace(/\s/g,''));
						}
						break;
					default:
						if (messages[m].length>1) {
							console.warn('UNKNOWN UNSOLICITED \'+\' MESSAGE: ' + messages[m]);
						}
				}
			}
		} else {
			messages = message.split('\n');
			for (m = 0; m < messages.length; m++) {
				switch (messages[m].split(':')[0].split('\r')[0]) {
					case 'RING':
						set('statusText','Ringing');
						notifyCallStatus('ringing');
						break;
					default:
							if (messages[m].length>1) {
								debug('ELSE UNSOLICITED ' + message);
							}
				}
			}
		}
	};

	var init = function () {
		// Initialization
		command('resetConfig',function () {
			command('deviceInfo', function () {
				atInfo();
				set('statusText','Free');
			});
		});
	};

	var atInfo = function () {
		command('imsi');							// IMSI
		command('iccid'); 						// ICC-ID
		command('provider');					// Provider & Technology
		command('signalStrength');		// Signal strength
		command('signalQuality');					// Signal quality
		command('cellInfo');					// LAC & Cell ID
		command('technology');				// Frequency
		command('bandConfig');				// Frequency
		command('isConnected');					// Is Connected?
		command('ipAddress');					// IP Address
	};

	return {
		getInfo: getInfo,
		getCallInfo: getCallInfo,
		getNotified: getNotified,
		connect: connect,
		call: call,
		answer: answer,
		hangup: hangup,
		onCallStatusChange: onCallStatusChange
	};
};

module.exports = ModemSerial;
