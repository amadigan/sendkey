importScripts('lib/BigInteger.js');

let operations = {
  modPow: params=>{
    let a = params.a;
    let pow = params.pow;
    let mod = params.mod;

    bigInt.adopt(a);
    bigInt.adopt(pow);
    bigInt.adopt(mod);
    return a.modPow(pow, mod);
  }
}

onmessage = function(event) {
  let data = event.data;
  postMessage({
    id: data.id,
    returnValue: operations[data.op](data.parameters)
  });
}
