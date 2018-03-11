// RFC 5114 (Additional Diffie-Hellman Groups for Use with IETF Standards)
// Section 2.3 (2048-bit MODP Group with 256-bit Prime Order Subgroup)
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

function generateRandom(bits) {
  let array = new Uint8Array(bits >> 3);
  window.crypto.getRandomValues(array);
  return array;
}

function sha256(int8Array) {
  return window.crypto.subtle.digest('SHA-256', int8Array);
}

function modPow(a, pow, mod) {
  return Dispatcher.modPow({a, pow, mod}).then(rv=>{
    bigInt.adopt(rv);
    return rv;
  });
}

function generatePhase1() {
  let id = Codec.base64.decodeBytes(bigInt(parseInt(Date.now() / 1000)).toBuffer());
  let secret = generateRandom(2048);
  let secretStr = Codec.base64.decodeBytes(secret);

  try {
    localStorage.setItem(id, secretStr);
  } catch (e) {
    throw 'Unable to store to local storage';
  }

  return modPow(g, bigInt.fromBuffer(secret), p).then((code)=>{
    return {
      phase: 2,
      id: id,
      code: Codec.base64.decodeBytes(code.toBuffer())
    };
  });
}

function generatePhase2Key(state) {
  let secret = bigInt.fromBuffer(generateRandom(2048));
  state.secret = secret;
  return modPow(bigInt.fromBuffer(Codec.base64.encodeString(state.code)), secret, p);
}

function generatePhase2Code(state) {
  return modPow(g, state.secret, p).then((code)=>{
    return {
      phase: 3,
      id: state.id,
      code : Codec.base64.decodeBytes(code.toBuffer()),
      encoding: state.encoding
    }
  });
}

function generatePhase3Key(phase2) {
  let secret = localStorage.getItem(phase2.id);

  if (secret == null) {
    throw 'Unable to find data from Step 1';
  }

  localStorage.removeItem(phase2.id);
  return modPow(
          bigInt.fromBuffer(Codec.base64.encodeString(phase2.code)),
          bigInt.fromBuffer(Codec.base64.encodeString(secret)),
          p);
}

function buildURL(phase) {
  let base = document.location.href;

  let hashPos = base.indexOf('#');
  if (hashPos >= 0) {
    base = base.substr(0, hashPos);
  }

  let url = base + '#p' + phase.phase + '_i' + phase.id + '_c' + phase.code;

  if (phase.encoding) {
    url += '_e' + phase.encoding;
  }

  return url;
}

let KEY_MAP = {
  p: 'phase',
  i: 'id',
  c: 'code',
  e: 'encoding'
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

function copyBox(prefix, value, onReveal) {
  function el(selector) {
    return document.querySelector(prefix + ' ' + selector);
  }
  let copyText = el('.copy-text');
  let reveal = el('.reveal');
  let charcount = el('.reveal .charcount');
  let covered = el('.covered');
  let cover = el('.cover');
  let copyButton = el('.copy-button');
  let copyLabel = el('.copy-button .copy-label');


  copyText.value = value;
  charcount.innerText = value.length;
  covered.classList.remove('d-none');

  function clickReveal() {
    copyText.style.height = copyText.scrollHeight + 'px';
    cover.classList.add('d-none');
    if (onReveal) {
      onReveal(prefix);
    }
  }

  reveal.addEventListener('click', clickReveal);

  cover.style.height = copyText.clientHeight + 1 + 'px';
  cover.style.width = copyText.clientWidth + 'px';

  if (copyText.style.scrollHeight < covered.clientHeight) {
    covered.style.height = covered.clientHeight + 'px';
  }


  if (copyButton.tagName == 'A') {
    copyButton.href = value;
    copyButton.classList.remove('disabled');
  } else {
    copyButton.removeAttribute('disabled');
  }

  copyButton.classList.remove('btn-outline-success');
  copyButton.classList.add('btn-success');

  let copyIcon = el('.copy-button [data-fa-i2svg]');
  copyIcon.classList.remove('fa-spin', 'fa-circle-notch');
  copyIcon.classList.add('fa-clone');
  copyLabel.innerText = 'Copy to Clipboard';
  copyButton.style.width = copyButton.clientWidth + 'px';

  function clickCopy(e) {
    e.preventDefault();
    copyText.select();
    document.execCommand('copy');
    window.getSelection().removeAllRanges();
    copyLabel.innerText = 'Copied!';
    setTimeout(()=>{
      if (copyLabel.innerText == 'Copied!') {
        copyLabel.innerText = 'Copy to Clipboard';}
      }, 2000);
    return false;
  }

  copyButton.addEventListener('click', clickCopy);

  return {
    reset: function() {
      let copyIcon = el('.copy-button [data-fa-i2svg]');
      covered.classList.add('d-none');
      cover.classList.remove('d-none');
      reveal.removeEventListener('click', clickReveal);
      copyButton.removeEventListener('click', clickCopy);
      if (copyButton.tagName == 'A') {
        copyButton.href = '';
        copyButton.classList.add('disabled');
      } else {
        copyButton.setAttribute('disabled', 'disabled');
      }
      copyButton.classList.add('btn-outline-success');
      copyButton.classList.remove('btn-success');
      copyIcon.classList.remove('fa-clone');
      copyIcon.classList.add('fa-spin', 'fa-circle-notch');
      copyLabel.innerText = 'Working...';
    },
    update: function(value) {
      copyText.value = value;
      if (copyButton.tagName == 'A') {
        copyButton.href = value;
      }
      charcount.innerText = value.length;
    }
  }
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

  function el(selector) {
    return document.querySelector(prefix + ' ' + selector);
  }

  let urlEl = document.querySelector(prefix + ' .url');
  let keyEl = document.querySelector(prefix + ' p.key');


  try {
    if (state.phase == 1) {
      generatePhase1().then(state=>{
        copyBox(prefix, buildURL(state));
      });
    } else if (state.phase == 2) {
      let keyBox;
      let urlBox;

      if (!state.encoding) {
        state.encoding = Codec.password.name;
      }

      function setEncoding(encoding) {
        document.querySelectorAll(prefix + ' .encoding-dropdown .dropdown-item').forEach(item=>{
          if (encoding == item.getAttribute('data-encoding')) {
            item.classList.add('d-none');
            el('.encoding-label').innerText = item.innerText;
          } else {
            item.classList.remove('d-none');
          }
        })

        state.encoding = encoding;
        if (urlBox) {
          urlBox.update(buildURL(state));
        }

        keyBox.update(Codec.byName[state.encoding].decodeBytes(state.sha));
      }

      document.querySelectorAll(prefix + ' .encoding-dropdown .dropdown-item').forEach(item=>{
        if (item.getAttribute('data-encoding') == state.encoding) {
          item.classList.add('d-none');
        }
        item.addEventListener('click', (e)=>{
          e.preventDefault();
          setEncoding(item.getAttribute('data-encoding'));
        })
      });

      function regenerate() {
        let cancelled = false;

        generatePhase2Key(state)
          .then(key=>sha256(key.toBuffer()))
          .then(sha=>{
            state.sha = sha;
            el('.encoding-dropdown').classList.remove('d-none');
            let key = Codec.byName[state.encoding].decodeBytes(sha);

            el('.regenerate').removeAttribute('disabled');
            keyBox = copyBox(prefix + ' .key-box', key, function() {
              el('.regenerate').classList.remove('d-none');

              function clickRegenerate() {
                cancelled = true;
                keyBox.reset();
                if (urlBox) {
                  urlBox.reset();
                }

                el('.regenerate').setAttribute('disabled', 'disabled');

                regenerate();
              }

              el('.regenerate').addEventListener('click', clickRegenerate);
            });
          });

        generatePhase2Code(state).then(phase2=>{
          if (!cancelled) {
            phase2.encoding = state.encoding;
            phase2.sha = state.sha;
            state = phase2;
            urlBox = copyBox(prefix + ' .url-box', buildURL(phase2));
          }
        });
      }

      regenerate();
    } else if (state.phase == 3) {
      generatePhase3Key(state)
        .then(key=>sha256(key.toBuffer()))
        .then(sha=>{
          let key = Codec.byName[state.encoding].decodeBytes(sha);

          copyBox(prefix, key)
        });
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
window.onhashchange = ()=>{window.location.reload();};
