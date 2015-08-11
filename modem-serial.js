//'use strict'

/**
* Plugin para manejar la interfaz de comandos AT los módems USB desde la 
*
* @class USBSerial
* @constructor
*/

var SerialPort = require('serialport').SerialPort,
	writeLock = false,
	writeQ = [],
	readQ = [];

if (process.env.DEBUG) {
	var debug = require('debug')('usbserial');
} else {
	var debug = function(text) {};
}

var USBSerial = function (dev) {
	var self = this;

	var info = {
		'USB_port': dev
	};

	this.getInfo = function () {
		return info;
	};

	// Subscribe to notifications of changes in modem
	this.getNotified = function (callback) {
		if (typeof callback === 'function') {
			notify = callback;
		}
	};

	// Function to notify changes in modem (empty at the beginning)
	var notify = function (field) {};

	var set = function (field, data) {
		info[field] = data;
		notify(field);
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
		setInterval(atInfo,3000);
	});

	var commands = {
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
				var m = msg.split("\n");
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
					var m = results.split("\n");
					for (var i = m.length - 1; i >= 0; i--) {
						if (!isNaN(m[i]*1) && (m[i]*1)!=0) set('imsi',''+(m[i]*1)+'');
					};
					if (callback) callback(results);
				});
			}
		},
		'AT+CRSM=176,12258,0,0,10':{
			'check':'CRSM:', 
			'action': function (callback) {
				send('AT+CRSM=176,12258,0,0,10', function (results) {
					debug('DATA (AT+CRSM=176,12258,0,0,10): ' + results);
					var res = results.substring(results.search('CRSM:')+6).split(",");
					if (res.length>2){
                    	var tmp = res[2].replace(/\"/g,'');
                    	var iccid = "";
                    	for (var c = 0; c < tmp.length; c=c+2) {
                        	iccid += tmp[c+1]+tmp[c];
                    	}
                    	iccid = iccid.split("\n")[0];
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
							var operador_id = data[2].replace(/\"/g,'');
							data[3] = data[3]*1;
							set('provider_id', operador_id);
							set('provider', translate('provider', operador_id, 1));
							set('technology_id', data[3]);
							set('technology', translate('techCOPS', data[3], 1));
							set('subtechnology', translate('techCOPS', data[3], 2));
						}
					}
					if (callback) callback(results);
				});
			}
		},
		'AT+CSQ?':{
			'check':'+CSQ:', 
			'action': function (callback) {
				send('AT+CSQ?', function (results) {
					
					if (callback) callback(results);
				});
			}
		},
		'AT^HCSQ?': {
			'check':'HCSQ:',
			'action': function (callback) {
				send('AT^HCSQ?', function (results) {
					var data = results.substring(6).split(',');
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
			    });
			}
		},
		'AT+CGREG?':{'check':'PARAQLO', 'action': function (callback) {if (callback) callback(results);}},
		'AT^SYSCFGEX?':{'check':'PARAQLO', 'action': function (callback) {if (callback) callback(results);}},
		'AT+CGACT?':{'check':'PARAQLO', 'action': function (callback) {if (callback) callback(results);}},
		'AT+CGPADDR':{'check':'PARAQLO', 'action': function (callback) {if (callback) callback(results);}},
		'AT+CGCONTRDP':{'check':'PARAQLO', 'action': function (callback) {if (callback) callback(results);}},
		'AT^DHCP':{'check':'PARAQLO', 'action': function (callback) {if (callback) callback(results);}}
	};

	var command = function (comm, callback) {
		if (commands[comm]) {
			commands[comm].action(callback);
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
	    			write();
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
					default:
						if (messages[m].length>1) {
							console.warn('UNKNOWN UNSOLICITED MESSAGE: ' + messages[m]);
						}
				}
			};
		} else {
			console.warn('ELSE UNSOLICITED ' + message);
		}
	};

	var init = function () {
		// Initialization
		command('ATZ',function () {
			atInfo();
		});
	};

	var atInfo = function () {
		//command('ATI');							// Device Info
		command('AT+CIMI');						// IMSI
		command('AT+CRSM=176,12258,0,0,10'); 	// ICC-ID
		// command('AT+COPS?');					// Provider & Technology
		// command('AT+CSQ?');						// Signal strength
		// command('AT^HCSQ?');					// Signal quality
		// command('AT+CGREG?');					// LAC & Cell ID
		// command('AT+CGREG?');					// LAC & Cell ID
		// command('AT^SYSCFGEX?');				// Frequency
		// command('AT+CGACT?');					// Is Connected?
		// command('AT+CGPADDR');					// IP Address
		// command('AT+CGCONTRDP');				// Routing params
		// command('AT^DHCP');						// DHCP
	};

	return this;
};

var translations = {
	'tech': [
		['3',2,'GSM'], 		//2G
		['5',3,'WCDMA'], 	//3G
		['7',4,'LTE'], 		//4G
	],
	'subtech': [
		['2',2,'GPRS'],
		['3',3,'EDGE'],
		['4',4,'WCDMA'],
		['5',5,'HSDPA']
	],
	'techCOPS': [
		['0',2,'GPRS'], // GSM
		['1',2,'GPRS'], // Compact GSM
		['3',2,'EDGE'], // GSM with EGPRS
		['2',3,'UMTS'], // UTRAN
		['4',3,'HSDPA'], // UTRAN with HSDPA
		['5',3,'HSUPA'], // UTRAN with HSUPA
		['6',3,'HSPA'], // UTRAN with HSPA
		['7',4,'LTE'], // LTE
	],
	'provider': [
		// Spain
		['21401','vodafone'],
		['21406','vodafone'],
		['21403','orange'],
		['21409','orange'],
		['21404','yoigo'],
		['21405','movistar'],
		['21407','movistar'],
		['21408','euskaltel'],
		['21416','telecable'],
		['21417','mobilR'],
		['21418','ono'],
		['21419','simyo'],
		['2142','jazztel'],
		// Colombia
		['732001','Movistar-colombia'],
		['732102','Movistar-colombia'],
		['732123','Movistar-colombia'],
		['732101','Claro'],
		['732103','Tigo'],
		['732002','Une'],
		['732142','Une'],
		// Portugal
		['26801','vodafone-pt'],
		['26803','optimus'],
		['26806','tmn'],
		// UK
		['23402','O2'],
		['23410','O2'],
		['23411','O2'],
		['23415','vodafone'],
		['23420','three'],
		['23430','EE'],
		['23433','EE'],
		// Germany
		['26201','t-mobile'],
		['26206','t-mobile'],
		['26278','t-mobile'],
		['26203','ortel'],
		['26205','ortel'],
		['26217','ortel'],
		['26202','vodafone'],
		['26209','vodafone'],
		// Mexico
		['33420','telcel'],
		['334020','telcel'],
		['33403','movistar'],
		['33450','iusacell'],
		['334050','iusacell'],
		['33409','nextel'],
		// Equatorial Guinea
		['62701','getesa'],
		['62703','muni']
	]
};

var translate = function (ns, text, index) {
	if (translations[ns]) {
		for (var i = translations[ns].length - 1; i >= 0; i--) {
			if (ns=='provider') {
				if (text.indexOf(translations[ns][i][0])==0) {
					return translations[ns][i][index];
				}
			}
			if (translations[ns][i][0] == text) {
				return translations[ns][i][index];
			}
		};
	} else {
		return text;
	}
}

module.exports = USBSerial;
if (process.env.DEBUG) {
	var usb = USBSerial('/dev/cu.HUAWEIMobile-Pcui');

	usb.getNotified(function (field) {
		debug(field + ' changed');
		debug(usb.getInfo());
	})
}