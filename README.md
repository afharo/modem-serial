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
#### isOpen()
It returns `true` if the device is still open for writes.
#### getInfo()
It returns all the information gotten by the moment of the device.
#### getCallInfo()
It returns the current/last call info.
#### setTTL(*ttl*)
Sets *ttl* milliseconds between each full radio info update.
#### setDefaultDuration(*duration*)
Sets default *duration* seconds for outgoing & incoming calls in which duration is not indicated (default: 90 seconds).
#### call(*number*, *duration*)
It calls the specified *number* and will hangup after *duration* seconds.
#### answer(*duration*, *timeout*)
Expects an incoming call in *timeout* seconds and will hangup after *duration* seconds.
#### hangup()
Hangups current call.
#### destroy()
Closes connection.
#### restart()
Restarts device.
**Will cause unplugs from system.**
#### connect(*err*, *callback*)
**NOT WORKING AT THIS TIME. It will in future releases**
It executes the connection process for this model.

### 4. Events
Functions to catch events.
#### getNotified(*callback*)
If you want to be notified when some info has changed, you can call the getNotified function, using as callback, the function you want to execute when something has changed.
```javascript
usb.getNotified(function (field, oldValue, newValue) {
  console.log('%s changed from %s to %s', field, oldValue, newValue);
  console.log(usb.getInfo());
});
```
#### onCallStatusChange(*callback*)
This event is called when the call status has changed.
```javascript
usb.onCallStatusChange(function (status, ts) {
	debug('[%d] Call is in status: %s', ts, status);
	debug(usb.getCallInfo());
});
```

## Supported Models
By the moment, I have tried only with some Huawei models. As soon as new devices are tested, this list will be updated.

Help is really welcome :smiley:

| Manufacturer | Model | Comments |
|:---|:---|---|
|Huawei| E173u | Signal Quality parameters are not provided by this device (only RSSI)<br>**IMPORTANT**: Firmware version 11.126.16.00.00 doesn't work correctly with ATH command (hangup). Consider updating firmware. |
|QualComm| BU580 | Features working: provider and RSSI information and call actions. |

## Testing
To test this module, run the command:
```shell
npm test
```
This, by default, will try to open the device in `/dev/cu.HUAWEIMobile-Pcui`. If your modem linked with other name (pe: `/dev/ttyUSB0`), call it using:
```shell
DEV=/dev/ttyUSB0 npm test
```

If you want to test the outgoing calling function, just add a NUMBER environment variable
```shell
NUMBER=XXXXXX npm test
```

## To-Do's
- Get endingStatus and hangupCause for CDMA
