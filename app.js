let p = bigInt(("87A8E61D B4B6663C FFBBD19C 65195999 8CEEF608 660DD0F2" +
  "5D2CEED4 435E3B00 E00DF8F1 D61957D4 FAF7DF45 61B2AA30" +
  "16C3D911 34096FAA 3BF4296D 830E9A7C 209E0C64 97517ABD" +
  "5A8A9D30 6BCF67ED 91F9E672 5B4758C0 22E0B1EF 4275BF7B" +
  "6C5BFC11 D45F9088 B941F54E B1E59BB8 BC39A0BF 12307F5C" +
  "4FDB70C5 81B23F76 B63ACAE1 CAA6B790 2D525267 35488A0E" +
  "F13C6D9A 51BFA4AB 3AD83477 96524D8E F6A167B5 A41825D9" +
  "67E144E5 14056425 1CCACB83 E6B486F6 B3CA3F79 71506026" +
  "C0B857F6 89962856 DED4010A BD0BE621 C3A3960A 54E710C3" +
  "75F26375 D7014103 A4B54330 C198AF12 6116D227 6E11715F" +
  "693877FA D7EF09CA DB094AE9 1E1A1597").replace(/[^a-zA-Z0-9]/g, ''), 16);

let g = bigInt(("3FB32C9B 73134D0B 2E775066 60EDBD48 4CA7B18F 21EF2054" +
  "07F4793A 1A0BA125 10DBC150 77BE463F FF4FED4A AC0BB555" +
  "BE3A6C1B 0C6B47B1 BC3773BF 7E8C6F62 901228F8 C28CBB18" +
  "A55AE313 41000A65 0196F931 C77A57F2 DDF463E5 E9EC144B" +
  "777DE62A AAB8A862 8AC376D2 82D6ED38 64E67982 428EBC83" +
  "1D14348F 6F2F9193 B5045AF2 767164E1 DFC967C1 FB3F2E55" +
  "A4BD1BFF E83B9C80 D052B985 D182EA0A DB2A3B73 13D3FE14" +
  "C8484B1E 052588B9 B7D2BBD2 DF016199 ECD06E15 57CD0915" +
  "B3353BBB 64E0EC37 7FD02837 0DF92B52 C7891428 CDC67EB6" +
  "184B523D 1DB246C3 2F630784 90F00EF8 D647D148 D4795451" +
  "5E2327CF EF98C582 664B4C0F 6CC41659").replace(/[^a-zA-Z0-9]/g, ''), 16);

let Dispatcher = {
  operations: ['modPow'],
  calls: {},
  callId: 0,
  init: function() {
    this.workers = [{worker: new Worker('worker.js'), count: 0}, {worker: new Worker('worker.js'), count: 0}];

    let dispatcher = this;

    function receive(event) {
      let data = event.data;
      let call = dispatcher.calls[data.id];
      call.worker.count--;
      call.resolve(data.returnValue);
    }

    for (let worker of this.workers) {
      worker.worker.onmessage = receive;
    }

    for (let operation of this.operations) {
      this[operation] = function(params) {
        return dispatcher.dispatch({
          op: operation,
          parameters: params
        })
      }
    }
  },
  dispatch: function(event) {
    let worker = this.workers[1].count < this.workers[0].count ? this.workers[1] : this.workers[0];
    event.id = this.callId++;
    worker.worker.postMessage(event);

    let call = {worker: worker};
    this.calls[event.id] = call;
    return new Promise((resolve, reject)=>{
      call.resolve = resolve;
      call.reject = reject;
    });
  },
};

Dispatcher.init();

let base64 = {
  encode : function(buf) {
    let rv = '';
    buf = new Uint8Array(buf);
    let i = 0;

    for (; i < buf.length - 2; i += 3) {
      let a = buf[i] >> 2; // top 6 bits
      let b = (buf[i] << 4 | buf[i + 1] >> 4) & 63; // bottom 2 bits + top 4 bits
      let c = (buf[i + 1] << 2 | buf[i + 2] >> 6) & 63;
      let d = buf[i + 2] & 63;

      rv += base64.chs[a] + base64.chs[b] + base64.chs[c] + base64.chs[d];
    }

    if (i == buf.length - 2) {
      let a = buf[i] >> 2; // top 6 bits
      let b = (buf[i] << 4 | buf[i + 1] >> 4) & 63; // bottom 2 bits + top 4 bits
      let c = (buf[i + 1] << 2) & 63;
      rv += base64.chs[a] + base64.chs[b] + base64.chs[c];
    } else if (i == buf.length - 1) {
      let a = buf[i] >> 2; // top 6 bits
      let b = (buf[i] << 4) & 63; // bottom 2 bits + top 4 bits
      rv += base64.chs[a] + base64.chs[b];
    }

    return rv;
  },
  decode: function(str) {
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
                  base64.rev[str.charCodeAt(i + 1)] >> 2;
      arr[z++] = chunk >> 8;
      arr[z++] = chunk & 0xFF;
    }

    if (i < str.length) {
      let a = base64.rev[str.charCodeAt(i)];
      let b = base64.rev[str.charCodeAt(i + 1)];
      arr[z++] = a << 2 | b >> 6;

      if (i < str.length - 2) {
        let c = base64.rev[str.charCodeAt(i + 2)];
        arr[z++] = b << 4 | c >> 2;
      }
    }

    return arr;
  }
};

(function() {
  let chs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  base64.chs = chs;
  let rev = [];

  for (let i = 0; i < chs.length; i++) {
    rev[chs.charCodeAt(i)] = i;
  }

  base64.rev = rev;
})();

function int8toHex(array) {
  let str = '';
  for (let i = 0; i < array.length; i++) {
    let hex = array[i].toString(16);
    if (hex.length == 1) {
      str = str + '0' + hex;
    } else {
      str = str + hex;
    }
  }

  return str;
}

function generateRandom(bits) {
  let array = new Uint8Array(bits / 8);
  window.crypto.getRandomValues(array);
  return array;
}

function sha256(int8Array) {
  return window.crypto.subtle.digest('SHA-256', int8Array).then(hash=>int8toHex(new Uint8Array(hash)))
}

function parseHex(hex) {
  return bigInt(hex, 16);
}

function modPow(a, pow, mod) {
  return Dispatcher.modPow({a, pow, mod}).then(rv=>{
    bigInt.adopt(rv);
    return rv;
  });
}

function generatePhase1() {
  let id = base64.encode(bigInt(parseInt(Date.now() / 1000)).toBuffer())
  let secret = generateRandom(2048);
  let secretStr = base64.encode(secret);

  try {
    localStorage.setItem(id, secretStr);
  } catch (e) {
    throw 'Unable to store to local storage';
  }

  return modPow(g, bigInt.fromBuffer(secret), p).then((code)=>{
    return {
      phase: 2,
      id: id,
      code: base64.encode(code.toBuffer())
    };
  });
}

function generatePhase2Key(state) {
  let secret = bigInt.fromBuffer(generateRandom(2048));
  state.secret = secret;
  return modPow(bigInt.fromBuffer(base64.decode(state.code)), secret, p);
}

function generatePhase2Code(state) {
  return modPow(g, state.secret, p).then((code)=>{
    return {
      phase: 3,
      id: state.id,
      code : base64.encode(code.toBuffer())
    }
  });
}

function generatePhase3Key(phase2) {
  let secret = localStorage.getItem(phase2.id);

  if (secret == null) {
    throw 'Unable to find data from Step 1';
  }

  localStorage.removeItem(phase2.id);
  return modPow(bigInt.fromBuffer(base64.decode(phase2.code)), bigInt.fromBuffer(base64.decode(secret)), p);
}

function buildURL(phase) {
  let base = document.location.href;

  let hashPos = base.indexOf('#');
  if (hashPos >= 0) {
    base = base.substr(0, hashPos);
  }

  return base + '#p' + phase.phase + '_i' + phase.id + '_c' + phase.code;
}

let KEY_MAP = {
  p: 'phase',
  i: 'id',
  c: 'code'
}

function parseHash() {
  let rv = {
    phase: 1
  };

  let hash = document.location.hash;

  if (hash) {
    if (hash[0] == '#') {
      hash = hash.substr(1);
    }

    let parts = hash.split(/_/);

    for (let part of parts) {
      let key = part[0];
      let value = part.substr(1);
      rv[KEY_MAP[key]] = value;
    }
  }

  return rv;
}

function reset() {
  localStorage.clear();
  document.location.href = '#';
  location.reload();
}

function reload() {
  let state = parseHash();

  if (localStorage.length) {
    document.getElementById('resetButton').classList.remove('disabled');
  }

  if (state.phase != 1) {
    document.getElementById('startOverButton').classList.remove('disabled');
  }

  let prefix = '#phase' + state.phase;
  let card = document.querySelector(prefix);

  let urlEl = document.querySelector(prefix + ' a.url');
  let keyEl = document.querySelector(prefix + ' p.key');


  try {
    if (state.phase == 1) {
      generatePhase1().then(state=>{
        let url = buildURL(state);
        urlEl.setAttribute('href', url);
        urlEl.innerText = url;
      });
    } else if (state.phase == 2) {
      generatePhase2Key(state).then(key=>sha256(key.toBuffer())).then(sha=>keyEl.innerText = sha);

      generatePhase2Code(state).then(phase2=>{
        let url = buildURL(phase2);
        urlEl.setAttribute('href', url);
        urlEl.innerText = url;
      });
    } else if (state.phase == 3) {
      generatePhase3Key(state).then(key=>sha256(key.toBuffer())).then(sha=>keyEl.innerText = sha);
    }

    card.classList.remove('d-none');
  } catch (e) {
    if (console) {
      console.error(e);
    }
    document.getElementById('errorText').innerText = e.toString();
    document.getElementById('error').classList.remove('d-none');
  }
}

window.onload = reload;
