Codec = {};

Codec.hex = {
  name: 'x',
  canEncode: function(string) {
    return string.length % 2 == 0 && /^[a-f0-9]+$/.test(string);
  },
  encodeString: function(string) {
    let array = new Uint8Array(string.length >> 1);

    for (let i = 0; i < array.length; i++) {
      array[i] = parseInt(string.substr(i << 1, 2), 16);
    }

    return array;
  },
  decodeBytes : function(array) {
    array = new Uint8Array(array);
    let str = '';

    for (let i = 0; i < array.length; i++) {
      let ch = array[i].toString(16);
      if (ch.length == 1) {
        str += '0';
        str += ch;
      } else {
        str += ch;
      }
    }

    return str;
  },
  isEnabled: function() {return true;}
}

Codec.hexUpper = {
  name: 'X',
  canEncode: function(string) {
    return string.length % 2 == 0 && /^[A-F0-9]+$/.test(string);
  },
  encodeString: Codec.hex.encodeString,
  decodeBytes: function(array) {
    return Codec.hex.decodeString(array).toUpperCase();
  },
  isEnabled: function() {return true;}
}

let base64 = {
  encode : function(buf, pad) {
    let rv = '';
    buf = new Uint8Array(buf);
    let i = 0;

    for (; i < buf.length - 2; i += 3) {
      let a = buf[i] >> 2;
      let b = (buf[i] << 4 | buf[i + 1] >> 4) & 63;
      let c = (buf[i + 1] << 2 | buf[i + 2] >> 6) & 63;
      let d = buf[i + 2] & 63;

      rv += base64.chs[a] + base64.chs[b] + base64.chs[c] + base64.chs[d];
    }

    if (i == buf.length - 2) {
      let a = buf[i] >> 2;
      let b = (buf[i] << 4 | buf[i + 1] >> 4) & 63;
      let c = (buf[i + 1] << 2) & 63;
      rv += base64.chs[a] + base64.chs[b] + base64.chs[c];
      if (pad) {
        rv += '=';
      }
    } else if (i == buf.length - 1) {
      let a = buf[i] >> 2;
      let b = (buf[i] << 4) & 63;
      rv += base64.chs[a] + base64.chs[b];
      if (pad) {
        rv += '==';
      }
    }

    return rv;
  },
  decode: function(str) {
    if (str[str.length - 1] == '=') {
      let end = str.length - 2;
      while (str[end] == '=') {
        end--;
      }
      str = str.substr(0, end + 1);
    }
    let bytes = Math.floor(str.length * .75);

    let arr = new Uint8Array(bytes);

    let i = 0;
    let z = 0;

    for (; i < str.length - 3; i += 4) {
      let chunk = base64.rev[str.charCodeAt(i)] << 18 |
                  base64.rev[str.charCodeAt(i + 1)] << 12 |
                  base64.rev[str.charCodeAt(i + 2)] << 6 |
                  base64.rev[str.charCodeAt(i + 3)];

      let a = base64.rev[str.charCodeAt(i)];
      let b = base64.rev[str.charCodeAt(i + 1)];
      let c = base64.rev[str.charCodeAt(i + 2)];
      let d = base64.rev[str.charCodeAt(i + 3)];

      arr[z++] = chunk >> 16;
      arr[z++] = chunk >> 8 & 0xFF;
      arr[z++] = chunk & 0xFF;
    }

    if (i == str.length - 2) {
      let chunk = base64.rev[str.charCodeAt(i)] << 2 |
                  base64.rev[str.charCodeAt(i + 1)] >> 4;
      arr[z++] = chunk & 0xFF;
    } else if (i == str.length - 3) {
      let chunk = base64.rev[str.charCodeAt(i)] << 10 |
                  base64.rev[str.charCodeAt(i + 1)] << 4 |
                  base64.rev[str.charCodeAt(i + 2)] >> 2;
      arr[z++] = chunk >> 8;
      arr[z++] = chunk & 0xFF;
    }

    return arr;
  }
};

{
  let chs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  base64.chs = chs;
  let rev = [];

  for (let i = 0; i < chs.length; i++) {
    rev[chs.charCodeAt(i)] = i;
  }

  base64.rev = rev;
}

Codec.base64 = {
  name: 'b',
  canEncode: function(str) {
    return str.length % 4 != 1 && /^[a-zA-Z0-9/+]+$/.test(str);
  },
  encodeString : base64.decode,
  decodeBytes: base64.encode,
  isEnabled: function() {return true;}
};

Codec.base64Padded = {
  name: 'B',
  canEncode: function(str) {
    return str.length % 4 == 0 && /^[a-zA-Z0-9/+]+={0,2}$/.test(str);
  },
  encodeString: function(string) {
    return base64.decode(string, true);
  },
  decodeBytes: base64.encode,
  isEnabled: function() {return true;}
}

Codec.ascii = {
  name: '7',
  canEncode: function(str) {
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(0) > 127) {
        return false;
      }
    }

    return true;
  },
  encodeString: function(string) {
    return Uint8Array.from(string);
  },
  decodeBytes: function(arr) {
    return String.fromCharCode.apply(null, new Uint8Array(arr));
  },
  isEnabled: function() {return true;}
}

Codec.utf16 = {
  name: 'n',
  canEncode: function(str) {
    return true;
  },
  encodeString: function(string) {
    let arr = new Uint16Array(string.length);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = string.charCodeAt(i);
    }
    return new Uint8Array(arr.buffer);
  },
  decodeBytes: function(arr) {
    return String.fromCharCode.apply(null, new Uint16Array(arr));
  },
  isEnabled: function() {return true;}
}

Codec.utf8 = {
  name: '8',
  canEncode: function(str) {
    return true;
  },
  encodeString: function(string) {
    return new TextEncoder().encode(string);
  },
  decodeBytes: function(arr) {
    return new TextDecoder('utf-8').decode(arr);
  },
  isEnabled: function() {
    if (typeof TextEncoder !== 'undefined' && typeof TextDecoder !== 'undefined') {
      return true;
    } else {
      return false;
    }
  }
}

Codec.deflate = {
  name: 'z',
  encodeBytes: function(arr) {
    return pako.deflateRaw(arr, {level: 9});
  },
  decodeBytes: function(arr) {
    return pako.inflateRaw(arr);
  },
  isEnabled: function() {
    if (typeof pako !== 'undefined') {
      return true;
    } else {
      return false;
    }
  }
}

Codec.password = {
  name: 'p',
  decodeBytes: function(arr) {
    let rv = base64.encode(arr);
    rv = rv.replace(/[+]/g, 'A').replace(/[/]/g, 'B');
    rv = rv.substr(0, parseInt(rv.length / 3) * 3);
    rv = rv.replace(/(.{3})/g,"$1-");
    return rv.substr(0, rv.length - 1);
  }
}

let codecs = [Codec.hex, Codec.hexUpper, Codec.base64, Codec.base64Padded, Codec.utf8, Codec.ascii, Codec.utf16, Codec.deflate, Codec.password];

Codec.byName = {};

codecs.forEach(codec=>Codec.byName[codec.name] = codec);

codecs = [Codec.utf8, Codec.ascii, Codec.utf16]

Codec.encodeString = function(string, allowCodecs) {
  let byteCoder = codecs.find(codec=>(!allowCodecs || allowCodecs.includes(code.name)) && codec.isEnabled()
    && codec.canEncode(string));

  let buffer = byteCoder.encodeString(string);
  let encoding = byteCoder.name;

  if (Codec.deflate.isEnabled()) {
    let compressed = Codec.deflate.encodeBytes(buffer);
    if (compressed.length <= buffer.length) {
      buffer = compressed;
      encoding = Codec.deflate.name + encoding;
    }
  }

  return {encoding, buffer};
}

Codec.decodeBytes = function(buf, encoding) {
  let result = buf;
  for (let name of encoding) {
    console.log('decoding with ' + name);
    result = Codec.byName[name].decodeBytes(result);
  }

  return result;
}
