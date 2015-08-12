# Modem Serial
This NodeJS utility aims to make it easy to interact with USB dongles, providing functions to get info, connect, make calls with just a function. This module will take care of all communications with the device.

**IMPORTANT NOTE**: This module its in a very early alpha version. I do not recommend using it in production environments.

## How to use it

### 1. Installation
To install it, you just have to install it as a normal npm module:

```shell
npm install modem-serial
```

### 2. Initialization
In order to initialize de device and the module, you must require it and use the constructor passing as argument the route to your device:

```javascript
var USBSerial = require('modem-serial');
var usb = USBSerial('/dev/ttyUSB0');
```

### 3. API functions
#### getInfo()
It returns all the information gotten by the moment of the device.

### 4. Events
If you want to be notified when some info is changed, you can call the getNotified function, using as callback, the function you want to execute when something has changed.
```javascript
usb.getNotified(function (field, oldValue, newValue) {
  console.log(field + ' changed');
  console.log(usb.getInfo());
})
```

## Supported Models
By the moment, I have tried only with some Huawei models. As soon as new devices are tested, this list will be updated.

Help is really welcome :smiley:

| Manufacturer | Model | Comments |
|:---|:---|---|
|Huawei| E173u | Signal Quality parameters are not provided by this device (only RSSI)<br>**IMPORTANT**: Firmware version 11.126.16.00.00 doesn't work correctly with ATH command (hangup). Consider updating firmware. |

## Testing
To test this module, run the command:
```shell
npm test
```

If you want to test the outgoing calling function, just add a NUMBER environment variable
```shell
NUMBER=XXXXXX npm test
```
