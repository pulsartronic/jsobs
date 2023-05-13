let JSOBS = {};
JSOBS.encoder = new TextEncoder('UTF-8'); // JSOBS.encoder.encode returns Uint8Array
JSOBS.decoder = new TextDecoder('UTF-8');

JSOBS.FLAGS  = 240; // 11110000
JSOBS.OBJECT = 0;   // 00000000
JSOBS.ARRAY  = 32;  // 00100000
JSOBS.BINARY = 64;  // 01000000
JSOBS.STRING = 96;  // 01100000
JSOBS.BOOL   = 128; // 10000000
JSOBS.INT    = 160; // 10100000
JSOBS.UINT   = 192; // 11000000
JSOBS.FLOAT  = 224; // 11100000
JSOBS.NULL   = 240; // 11110000


JSOBS.Tracker = function(buffer) {
	this.index = 0;
	this.dataView = new DataView(buffer, this.index);
};

JSOBS.Tracker.prototype.readUint = function(size) {
	var value = 0;
	switch(size) {
		case 1: value = this.dataView.getUint8(this.index);     break;
		case 2: value = this.dataView.getUint16(this.index);    break;
		case 4: value = this.dataView.getUint32(this.index);    break;
		case 8: value = this.dataView.getBigUint64(this.index); break;
	}
	this.index += size;
	return value;
};

JSOBS.Tracker.prototype.readInt = function(size) {
	var value = 0;
	switch(size) {
		case 1: value = this.dataView.getInt8(this.index);     break;
		case 2: value = this.dataView.getInt16(this.index);    break;
		case 4: value = this.dataView.getInt32(this.index);    break;
		case 8: value = this.dataView.getBigInt64(this.index); break;
	}
	this.index += size;
	return value;
};

JSOBS.Tracker.prototype.readFloat = function(size) {
	var value = 0;
	switch(size) {
		case 4: value = this.dataView.getFloat32(this.index); break;
		case 8: value = this.dataView.getFloat64(this.index); break;
	}
	this.index += size;
	return value;
};

JSOBS.Tracker.prototype.writeUint = function(size, value) {
	switch(size) {
		case 1: this.dataView.setUint8(this.index, value);     break;
		case 2: this.dataView.setUint16(this.index, value);    break;
		case 4: this.dataView.setUint32(this.index, value);    break;
		case 8: this.dataView.setBigUint64(this.index, value); break;
	}
	this.index += size;
};

JSOBS.Tracker.prototype.writeInt = function(size, value) {
	switch(size) {
		case 1: this.dataView.setInt8(this.index, value);     break;
		case 2: this.dataView.setInt16(this.index, value);    break;
		case 4: this.dataView.setInt32(this.index, value);    break;
		case 8: this.dataView.setBigInt64(this.index, value); break;
	}
	this.index += size;
};

JSOBS.Tracker.prototype.writeFloat = function(size, value) {
	switch(size) {
		case 4: this.dataView.setFloat32(this.index, value); break;
		case 8: this.dataView.setFloat64(this.index, value); break;
	}
	this.index += size;
};

JSOBS.Tracker.prototype.readArrayBuffer = function(length) {
	var dataView = new Uint8Array(this.dataView.buffer, this.index, length);
	var uint8Array = new Uint8Array(length);
	uint8Array.set(dataView);
	this.index += length;
	return uint8Array.buffer;
};

JSOBS.Tracker.prototype.writeArrayBuffer = function(arrayBuffer) {
	var dataView = new Uint8Array(this.dataView.buffer, this.index);
	var uint8Array = new Uint8Array(arrayBuffer);
	dataView.set(uint8Array);
	this.index += uint8Array.length;
};

JSOBS.Tracker.prototype.writeHeader = function(type, length) {
	var typesize = JSOBS.typesize(length);
	var HB = type | Math.log2(typesize);
	this.writeUint(1, HB);
	this.writeUint(typesize, length);
};

JSOBS.Tracker.prototype.write = function(element) {
	var type = typeof element;
	switch(type) {
		case 'boolean':
			this.writeHeader(JSOBS.BOOL, 1);
			this.writeUint(1, element|0);
			break;
		case 'number':
			// TODO:: find the best fit to make use of the fewest bytes possible, for low end devices like Arduino
			// TODO:: it always writes floats as 64bit numbers
			this.writeHeader(JSOBS.FLOAT, 8);
			this.writeFloat(8, element);
			break;
		case 'string':
			var encoded = JSOBS.encoder.encode(element);
			this.writeHeader(JSOBS.STRING, encoded.length);
			this.writeArrayBuffer(encoded);
			break;
		case 'undefined':
		case 'object':
			if (element instanceof ArrayBuffer) {
				this.writeHeader(JSOBS.BINARY, element.byteLength);
				this.writeArrayBuffer(element);
			} else if (element instanceof Array) {
				this.writeHeader(JSOBS.ARRAY, element.length);
				for (var i in element) {
					var item = element[i];
					this.write(item)
				}
			} else if (element instanceof Object) {
				 var length = Object.keys(element).length;
				this.writeHeader(JSOBS.OBJECT, length);
				for (var i in element) {
					var item = element[i];
					this.write(i);
					this.write(item);
				}
			} else if (!element) {
				this.writeHeader(JSOBS.NULL, 0);
			}
			break;
	}
};


JSOBS.Tracker.prototype.read = function() {
	var HB = this.readUint(1);
	var exponent = HB & ~JSOBS.FLAGS;
	var typesize = Math.pow(2, exponent);
	var length = this.readUint(typesize);
	let TS = HB & JSOBS.FLAGS;
	var element = null;
	switch(TS) {
		case JSOBS.ARRAY:
			element = [];
			for (var i = 0; i < length; i++) {
				var childElement = this.read();
				element.push(childElement);
			}
			break;
		case JSOBS.OBJECT:
			element = {};
			for (var i = 0; i < length; i++) {
				var keyElement = this.read();
				var childElement = this.read();
				element[keyElement] = childElement;
			}
			break;
		case JSOBS.BINARY:
			element = this.readArrayBuffer(length);
			break;
		case JSOBS.INT:
			element = this.readInt(length);
			break;
		case JSOBS.UINT:
			element = this.readUint(length);
			break;
		case JSOBS.FLOAT:
			element = this.readFloat(length);
			break;
		case JSOBS.STRING:
			var bufferView = this.readArrayBuffer(length);
			element = JSOBS.decoder.decode(bufferView);
			break;
		case JSOBS.BOOL:
			element = !!this.readUint(1);
			break;
		case JSOBS.NULL:
			
			break;
	}
	return element;
};

// TODO:: I'm sure there is a shorter way to get this value
JSOBS.typesize = function(value) {
	var length = Math.max(value, 1);
	var log = Math.log2(length + 1);
	var bytes = Math.ceil(log / 8);
	var sizelog = Math.log2(bytes);
	var exponent = Math.ceil(sizelog);
	var typesize = Math.pow(2, exponent);
	return typesize;
};


/*
 * Calculate javascript object size in bytes
 */
JSOBS.size = function(element) {
	let size = 0;
	var type = typeof element;
	switch(type) {
		case 'boolean':
			size += 3;
			break;
		case 'number':
			size += 10;
			break;
		case 'string':
			// TODO:: here it is created an Uint8Array just to get its length 
			var encoded = JSOBS.encoder.encode(element);
			var typesize = JSOBS.typesize(encoded.length);
			size += 1 + typesize + encoded.length;
			break;
		case 'undefined':
		case 'object':
			if (element instanceof ArrayBuffer) {
				var typesize = JSOBS.typesize(element.byteLength);
				size += 1 + typesize + element.byteLength;
			} else if (element instanceof Array) {
				size += 1 + JSOBS.typesize(element.length);
				for (var i in element) {
					var item = element[i];
					size += JSOBS.size(item);
				}
			} else if (element instanceof Object) {
				var length = Object.keys(element).length;
				size += 1 + JSOBS.typesize(length);
				for (var i in element) {
					var item = element[i];
					size += JSOBS.size(i);
					size += JSOBS.size(item);
				}
			} else if (!element) {
				size += 2;
			}
			break;
	}

	return size;
};

JSOBS.serialize = function(element) {
	let size = JSOBS.size(element);
	var arrayBuffer = new ArrayBuffer(size);
	var iterator = new JSOBS.Tracker(arrayBuffer);
	iterator.write(element);
	return arrayBuffer;
};

JSOBS.deserialize = function(arrayBuffer) {
	var iterator = new JSOBS.Tracker(arrayBuffer);
	var element = iterator.read();
	return element;
};

export default JSOBS;

