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

module.exports = translate;
