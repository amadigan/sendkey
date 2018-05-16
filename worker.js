importScripts('lib/BigInteger.js', 'codec.js', 'lib/pako.js');

let operations = {
  modPow: (params, resolve, reject)=>{
    let a = params.a;
    let pow = params.pow;
    let mod = params.mod;

    bigInt.adopt(a);
    bigInt.adopt(pow);
    bigInt.adopt(mod);
    resolve(a.modPow(pow, mod));
  },
  getEnabledCodecs: function(params, resolve, reject) {
    resolve(Object.values(Codec.byName)
      .filter(codec=>codec.isEnabled && codec.isEnabled())
      .map(codec=>codec.name)
      .join(''));
  },
  codecEncode: function(params, resolve, reject) {
    let buf = Codec[params.codec].encodeString(params.string);
    resolve(buf, [buf.buffer]);
  },
  encodeString: function(params, resolve, reject) {
    let rv = Codec.encodeString(params.string, params.allowCodecs);
    resolve(rv, [rv.buffer.buffer]);
  },
  codecDecode: function(params, resolve, reject) {
    resolve(Codec[params.codec].decodeBytes(params.buf));
  },
  decodeBytes: function(params, resolve, reject) {
    resolve(Codec.decodeBytes(params.buf, params.encoding));
  }
}

onmessage = function(event) {
  let data = event.data;

  try {
    operations[data.op](data.parameters,
      function(rv, transfer) {
        postMessage({id: data.id, returnValue: rv}, transfer);
      },
      function(error) {
        postMessage({id: data.id, error: error});
      });
  } catch (e) {
    console.error('Worker error on ' + event.data.op);
    console.error(e);
  }

}
