# sendkey
sendkey is an in-browser implementation of Diffie-Hellman Key Exchange. This is intended as a secure, trivial way to
share passwords. You can use this utility through GitHub Pages here:
[https://amadigan.github.io/sendkey/](https://amadigan.github.io/sendkey/).

# License
sendkey itself is in the public domain, and you may do with this code what you wish. However, some of the dependencies
are not public domain, including some files in this repository.

* Bootstrap, jQuery, and  which is loaded directly from CDN, is licensed under the MIT license
* fontawesome, which is present in this repository, is licensed under the MIT License

Note that BigInteger is also in the public domain, but the version here has been modified to better support conversion
back and forth to ArrayBuffers.
