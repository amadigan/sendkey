// RFC 5114 (Additional Diffie-Hellman Groups for Use with IETF Standards)
// Section 2.3 (2048-bit MODP Group with 256-bit Prime Order Subgroup)
let dhPrime = Codec.hex.encodeString(("87A8E61D B4B6663C FFBBD19C 65195999 8CEEF608 660DD0F2" +
  "5D2CEED4 435E3B00 E00DF8F1 D61957D4 FAF7DF45 61B2AA30" +
  "16C3D911 34096FAA 3BF4296D 830E9A7C 209E0C64 97517ABD" +
  "5A8A9D30 6BCF67ED 91F9E672 5B4758C0 22E0B1EF 4275BF7B" +
  "6C5BFC11 D45F9088 B941F54E B1E59BB8 BC39A0BF 12307F5C" +
  "4FDB70C5 81B23F76 B63ACAE1 CAA6B790 2D525267 35488A0E" +
  "F13C6D9A 51BFA4AB 3AD83477 96524D8E F6A167B5 A41825D9" +
  "67E144E5 14056425 1CCACB83 E6B486F6 B3CA3F79 71506026" +
  "C0B857F6 89962856 DED4010A BD0BE621 C3A3960A 54E710C3" +
  "75F26375 D7014103 A4B54330 C198AF12 6116D227 6E11715F" +
  "693877FA D7EF09CA DB094AE9 1E1A1597").replace(/[^a-zA-Z0-9]/g, ''));

let dhGenerator = Codec.hex.encodeString(("3FB32C9B 73134D0B 2E775066 60EDBD48 4CA7B18F 21EF2054" +
  "07F4793A 1A0BA125 10DBC150 77BE463F FF4FED4A AC0BB555" +
  "BE3A6C1B 0C6B47B1 BC3773BF 7E8C6F62 901228F8 C28CBB18" +
  "A55AE313 41000A65 0196F931 C77A57F2 DDF463E5 E9EC144B" +
  "777DE62A AAB8A862 8AC376D2 82D6ED38 64E67982 428EBC83" +
  "1D14348F 6F2F9193 B5045AF2 767164E1 DFC967C1 FB3F2E55" +
  "A4BD1BFF E83B9C80 D052B985 D182EA0A DB2A3B73 13D3FE14" +
  "C8484B1E 052588B9 B7D2BBD2 DF016199 ECD06E15 57CD0915" +
  "B3353BBB 64E0EC37 7FD02837 0DF92B52 C7891428 CDC67EB6" +
  "184B523D 1DB246C3 2F630784 90F00EF8 D647D148 D4795451" +
  "5E2327CF EF98C582 664B4C0F 6CC41659").replace(/[^a-zA-Z0-9]/g, ''));

let Dispatcher = {
  operations: ['modPow', 'getEnabledCodecs', 'codecEncode', 'encodeString'],
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
  dispatch: function(event, transfer) {
    let worker = this.workers[1].count < this.workers[0].count ? this.workers[1] : this.workers[0];
    event.id = this.callId++;
    worker.worker.postMessage(event, transfer);

    let call = {worker: worker};
    this.calls[event.id] = call;
    return new Promise((resolve, reject)=>{
      call.resolve = resolve;
      call.reject = reject;
    });
  },
  codecDecode: function(codec, buf) {
    return this.dispatch({op: 'codecDecode', parameters: {codec, buf}}, [buf.buffer || buf]);
  },
  decodeBytes: function(buf, encoding) {
    return this.dispatch({op: 'decodeBytes', parameters: {buf, encoding}}, [buf.buffer || buf]);
  }
};

Dispatcher.init();

function Crypter(state, update) {
  let message = null;
  let cryptKey = null;
  let signKey = null;
  let newState = null;

  function updateCrypted() {
    let currentMessage = message;
    if (currentMessage != null && !currentMessage.cancelled && currentMessage.buffer && cryptKey != null) {
      console.log('encrypting: ' + Codec.hex.decodeBytes(currentMessage.buffer));
      encrypt(cryptKey, currentMessage.buffer).then(crypted=>{
        if (!currentMessage.cancelled) {
          console.log('encrypted: ' + Codec.hex.decodeBytes(crypted));
          Dispatcher.codecDecode('base64', crypted).then(cryptedEncoded=>{
            if (!currentMessage.cancelled) {
              currentMessage.crypted = cryptedEncoded;
              updateOutput();
            }
          })
        }
      }).catch(e=>{console.error(e)});
    }
  }

  function updateSignature() {
    let currentMessage = message;
    if (currentMessage != null && !currentMessage.cancelled && currentMessage.buffer && signKey != null) {
      sign(signKey, currentMessage.buffer, message.encoding).then(signature=>{
        if (!currentMessage.cancelled) {
          Dispatcher.codecDecode('base64', signature).then(encodedSignature=>{
            if (!currentMessage.cancelled) {
              currentMessage.signature = encodedSignature;
              updateOutput();
            }
          })
        }
      });
    }
  }

  function updateOutput() {
    if (newState != null && message != null && !message.cancelled && message.crypted && message.signature) {
      newState.message = message.crypted;
      newState.signature = message.signature;
      newState.encoding = message.encoding;
      update(buildURL(newState));
    }
  }

  generatePhase2Key(state).then(dhKey=>{
    dhKey = dhKey.toBuffer();

    buildCryptKey(dhKey).then(key=>{
      cryptKey = key;
      updateCrypted();
    });

    buildSignKey(dhKey).then(key=>{
      signKey = key;
      updateSignature();
    });
  });

  generatePhase2Code(state).then(phase3State=>{
    newState = phase3State;
    updateOutput();
  });

  return {
    cancel: function() {
      if (message != null) {
        message.cancelled = true;
      }
    },
    update: function(newMessage) {
      if (message != null) {
        message.cancelled = true;
      }

      message = {
        string: newMessage,
        cancelled: false
      }

      let currentMessage = message;

      Dispatcher.encodeString({string: currentMessage.string, allowCodecs: state.accept}).then(msg=>{
        if (!currentMessage.cancelled) {
          currentMessage.buffer = msg.buffer;
          currentMessage.encoding = msg.encoding;

          updateCrypted();
          updateSignature();
        }
      });
    }
  }

}

function buildCryptKey(dhKey) {
  return Promise.all([
      sha256(dhKey.buffer.slice(0, 128)),
      sha256(dhKey.buffer.slice(128, 192))
    ]).then(values=>{
      let [keyBuf, ivBuf] = values;
      console.log('Key: ' + Codec.hex.decodeBytes(keyBuf) + ', iv: ' + Codec.hex.decodeBytes(ivBuf.slice(0, 16)))
      return window.crypto.subtle.importKey('raw', keyBuf, {name: 'AES-CBC'}, false, ['encrypt', 'decrypt'])
        .then(key=>{
          return {key: key, iv: ivBuf.slice(0, 16)}
        });
    });
}

function buildSignKey(dhKey) {
  return sha256(dhKey.buffer.slice(192, 256))
    .then(keyBuf=>crypto.subtle.importKey('raw', keyBuf, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']));
}

function encrypt(key, message) {
  return window.crypto.subtle.encrypt({name: 'AES-CBC', iv: key.iv}, key.key, message);
}

function sign(key, message, encoding) {
  let buf = new Uint8Array(message.length + encoding.length);
  buf.set(Codec.ascii.encodeString(encoding));
  buf.set(message, encoding.length);
  return window.crypto.subtle.sign('HMAC', key, buf);
}

function decrypt(key, message) {
  return window.crypto.subtle.decrypt({name: 'AES-CBC', iv: key.iv}, key.key, message);
}

function verify(key, message, encoding, signature) {
  let buf = new Uint8Array(message.byteLength + encoding.length);
  buf.set(Codec.ascii.encodeString(encoding));
  buf.set(new Uint8Array(message), encoding.length);
  return window.crypto.subtle.verify('HMAC', key, signature, buf);
}

function generateRandom(bits) {
  let array = new Uint8Array(bits >> 3);
  window.crypto.getRandomValues(array);
  return array;
}

function sha256(buf) {
  return window.crypto.subtle.digest('SHA-256', buf);
}

function sha512(buf) {
  return window.crypto.subtle.digest('SHA-512', buf);
}

function modPow(a, pow, mod) {
  return Dispatcher.modPow({a, pow, mod}).then(rv=>{
    bigInt.adopt(rv);
    return rv;
  });
}

function generatePhase1() {
  let id = Codec.base64.decodeBytes(bigInt(parseInt(Date.now() / 1000)).toBuffer());

  return window.crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-384'}, true, ['deriveBits'])
    .then(key=>{
      window.crypto.subtle.exportKey('jwk', key.privateKey)
        .then(rawPrivateKey=>JSON.stringify(rawPrivateKey))
        .then(base64PrivateKey=>{localStorage.setItem(id, base64PrivateKey)})
        .catch(e=>{console.error('Unable to export private key: %o', e)});

      return window.crypto.subtle.exportKey('raw', key.publicKey)
        .then(rawPublicKey=>Dispatcher.codecDecode('base64', rawPublicKey))
        .then(base64PublicKey=>{
          return {
            phase: 2,
            id: id,
            code: base64PublicKey
          }
        });
    });
}

function generatePhase2Key(state) {
  return Promise.all([
    window.crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-384'}, true, ['deriveBits'])
    .catch(e=>{console.error('Unable to generate public key %o', e)})
    .then(key=>{
      state.ecdhKey = key;
      return window.crypto.subtle.exportKey('raw', key.publicKey).then(rawPublicKey=>Dispatcher.codecDecode('base64', rawPublicKey))
    }).catch(e=>{console.error('Unable to export public key %o', e)}),
    Dispatcher.codecEncode({codec: 'base64', string: state.code})
    .then(bytes=>{
      console.log('importing ' + Codec.hex.decodeBytes(bytes))
      return window.crypto.subtle.importKey('raw', bytes, {name: 'ECDH', namedCurve: 'P-384'}, true, [])
    }).catch(e=>{console.error('Failed to import public key: %o', e)})
  ]).then(values=>{
    state.code = values[0];
    let publicKey = values[1];
    state.phase = 3;
    return window.crypto.subtle.deriveBits({name: 'ECDH', namedCurve: 'P-384', public: publicKey}, state.ecdhKey.privateKey, 384).catch(e=>{console.error('Failed to derive bits: %o', e)});
  })
}

function deriveBits(buf, bits, salt) {
  if (typeof salt == 'string') {
    salt = Codec.base64.encodeString(salt);
  }
  return window.crypto.subtle.importKey('raw', buf, {name: 'HKDF'}, false, ['deriveBits'])
    .then(key=>window.crypto.subtle.deriveBits({name: 'HKDF', hash: {name: 'SHA-512'}, info: new Uint8Array(), salt: salt.buffer || salt}, key, bits));
}

function generatePhase3Key(phase2) {
  let secret = localStorage.getItem(phase2.id);

  if (secret == null) {
    throw 'Unable to find data from Step 1';
  }

  return Promise.all([
    window.crypto.subtle.importKey('jwk', JSON.parse(secret), {name: 'ECDH', namedCurve: 'P-384'}, true, ['deriveBits']),
    Dispatcher.codecEncode({codec: 'base64', string: phase2.code}).then(bytes=>window.crypto.subtle.importKey('raw', bytes, {name: 'ECDH', namedCurve: 'P-384'}, true, []))
  ]).then(values=>{
    let [privateKey, publicKey] = values;
    return window.crypto.subtle.deriveBits({name: 'ECDH', namedCurve: 'P-384', public: publicKey}, privateKey, 384)
  })
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

  if (phase.message) {
    url += '_m' + phase.message;
    url += '_s' + phase.signature;
  }

  return url;
}

let KEY_MAP = {
  p: 'phase',
  i: 'id',
  c: 'code',
  e: 'encoding',
  m: 'message',
  s: 'signature',
  a: 'accept'
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


  function ready(value) {
    copyText.value = value;
    charcount.innerText = value.length;
    covered.classList.remove('d-none');

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
  }

  function clickReveal() {
    copyText.style.height = copyText.scrollHeight + 'px';
    cover.classList.add('d-none');
    if (onReveal) {
      onReveal(prefix);
    }
  }

  reveal.addEventListener('click', clickReveal);

  function clickCopy(e) {
    e.preventDefault();
    let range = document.createRange();
    copyText.contentEditable = true;
    copyText.contenteditable = true;
    copyText.readonly = false;
    copyText.select();
    range.selectNodeContents(copyText);

    let selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    copyText.setSelectionRange(0, 999999);
    document.execCommand('copy');
    selection.removeAllRanges();
    copyLabel.innerText = 'Copied!';
    copyText.contenteditable = false;
    copyText.readonly = true;
    setTimeout(()=>{
      if (copyLabel.innerText == 'Copied!') {
        copyLabel.innerText = 'Copy to Clipboard';}
      }, 2000);
    return false;
  }

  copyButton.addEventListener('click', clickCopy);

  ready(value);

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
      copyText.setAttribute('disabled', 'disabled');
    },
    update: function(value) {
      ready(value);
    },
    allowEditing: function(callback) {
      copyText.value = '';
      copyText.removeAttribute('disabled');
      copyText.style.height = copyText.scrollHeight + 'px';
      cover.classList.add('d-none');

      let timeout;

      copyText.addEventListener('keydown', function(e) {
        copyText.style.height = '';
        copyText.style.height = copyText.scrollHeight + 'px';
        callback(copyText.value);
      });

      copyText.addEventListener('change', function(e) {
        copyText.style.height = '';
        copyText.style.height = copyText.scrollHeight + 'px';
        callback(copyText.value);
      });
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
      let cancelled = false;

      let crypter;

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

        if (encoding == 'm') {
          cancelled = true;
          if (urlBox) {
            urlBox.reset();
          }

          crypter = new Crypter(state, function(url) {
            if (!urlBox) {
              urlBox = copyBox(prefix + ' .url-box', url);
            } else {
              urlBox.update(url);
            }
          });

          let timeout;

          keyBox.allowEditing(msg=>{
            if (urlBox) {
              urlBox.reset();
              urlBox = null;
            }
            crypter.cancel();
            if (timeout) {
              clearTimeout(timeout);
            }
            timeout = setTimeout(function() {
              crypter.update(msg);
            }, 2000);
          });
        } else {
          state.encoding = encoding;
          if (urlBox) {
            urlBox.update(buildURL(state));
          }

          keyBox.update(Codec.byName[state.encoding].decodeBytes(state.sha));
        }
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


        generatePhase2Key(state)
          .then(key=>deriveBits(key.slice(0, 32), 128, key.slice(32, 48)))
          .then(sha=>{
            urlBox = copyBox(prefix + ' .url-box', buildURL(state));
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
      }

      regenerate();
    } else if (state.phase == 3) {
      generatePhase3Key(state)
        .then(key=>{
          if (state.message) {
            Promise.all([
              Promise.all([
                Dispatcher.codecEncode({codec: 'base64', string: state.message}),
                buildCryptKey(keyBuf)
              ]).then(values=>{
                let [message, cryptKey] = values;
                console.log('encrypted: ' + Codec.hex.decodeBytes(message));
                return decrypt(cryptKey, message)
              }),
              buildSignKey(keyBuf),
              Dispatcher.codecEncode({codec: 'base64', string: state.signature})
            ]).then(values=>{
              let [decrypted, signKey, signature] = values;
              console.log('decrypted: ' + Codec.hex.decodeBytes(decrypted))
              verify(signKey, decrypted, state.encoding, signature).then(valid=>{
                if (!valid) {
                  console.error('signature verification failed!')
                } else {
                  Dispatcher.decodeBytes(decrypted, state.encoding).then(decoded=>{
                    copyBox(prefix, decoded);
                  })
                }
              })
            })
          } else {
            deriveBits(key.slice(0, 32), 128, key.slice(32, 48)).then(sha=>{
              copyBox(prefix, Codec.byName[state.encoding].decodeBytes(sha))
            })
          }
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
