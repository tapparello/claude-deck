import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports, module) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var {
      types: { isUint8Array }
    } = __require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header2) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header2.length; i++) {
        code = header2.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header2.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header2.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header2.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header2.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header2.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header2.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var https = __require("https");
    var http = __require("http");
    var net = __require("net");
    var tls = __require("tls");
    var { randomBytes: randomBytes2, createHash } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL: URL2 } = __require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head2, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head2.length > 0) socket.unshift(head2);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes2(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head2) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head2, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws2, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws2.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws2.pause();
      });
      ws2.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws2.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws2.readyState === ws2.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws2.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws2.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws2.terminate();
      };
      duplex._final = function(callback) {
        if (ws2.readyState === ws2.CONNECTING) {
          ws2.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws2._socket === null) return;
        if (ws2._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws2._socket.once("finish", function finish() {
            callback();
          });
          ws2.close();
        }
      };
      duplex._read = function() {
        if (ws2.isPaused) ws2.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws2.readyState === ws2.CONNECTING) {
          ws2.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws2.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header2) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header2.length; i++) {
        const code = header2.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header2.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header2.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var http = __require("http");
    var { Duplex } = __require("stream");
    var { createHash } = __require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head2) => {
              this.handleUpgrade(req, socket, head2, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head2, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head2,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head2, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head2, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws2 = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws2._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws2._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws2.setSocket(socket, head2, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws2);
          ws2.on("close", () => {
            this.clients.delete(ws2);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws2, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);

// src/plugin.js
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path3 from "node:path";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

// src/osa.js
function escapeAppleScript(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
var HK_MODIFIERS = {
  cmd: "command down",
  command: "command down",
  "\u2318": "command down",
  opt: "option down",
  option: "option down",
  alt: "option down",
  "\u2325": "option down",
  ctrl: "control down",
  control: "control down",
  "\u2303": "control down",
  shift: "shift down",
  "\u21E7": "shift down"
};
var HK_KEY_CODES = {
  space: 49,
  return: 36,
  enter: 36,
  tab: 48,
  escape: 53,
  esc: 53,
  up: 126,
  down: 125,
  left: 123,
  right: 124,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111
};
function parseHotkey(str) {
  if (str == null) return null;
  const tokens = String(str).split("+").map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return null;
  const keyTok = tokens.pop();
  const modifiers = [];
  for (const t of tokens) {
    const m = HK_MODIFIERS[t];
    if (!m) return null;
    if (!modifiers.includes(m)) modifiers.push(m);
  }
  if (Object.prototype.hasOwnProperty.call(HK_KEY_CODES, keyTok)) {
    return { modifiers, key: { kind: "code", code: HK_KEY_CODES[keyTok] } };
  }
  if (keyTok.length === 1) return { modifiers, key: { kind: "char", char: keyTok } };
  return null;
}
function hotkeyClause(parsed) {
  if (!parsed) return null;
  const using = parsed.modifiers.length ? ` using {${parsed.modifiers.join(", ")}}` : "";
  if (parsed.key.kind === "code") return `key code ${parsed.key.code}${using}`;
  return `keystroke "${escapeAppleScript(parsed.key.char)}"${using}`;
}
function classifyCustomCommand(cmd, { home = "", exists = () => false } = {}) {
  const raw = String(cmd ?? "").trim();
  if (!raw) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return { mode: "open", arg: raw };
  let path4 = raw;
  if (raw === "~") path4 = home;
  else if (raw.startsWith("~/")) path4 = home + raw.slice(1);
  if (exists(path4)) return { mode: "open", arg: path4 };
  return { mode: "app", arg: raw };
}
function parseKeychainToken(raw) {
  try {
    const j = JSON.parse(raw);
    return j?.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}
function outermostAppBundle(execPath) {
  const m = /^(.*?\.app)\//.exec(String(execPath ?? ""));
  return m ? m[1] : null;
}
function parsePsTree(out) {
  const tree = /* @__PURE__ */ new Map();
  for (const line2 of String(out ?? "").split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/.exec(line2);
    if (m) tree.set(m[1], { ppid: m[2], comm: m[3] });
  }
  return tree;
}
function parseElapsed(str) {
  const s = String(str ?? "").trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(s);
  if (!m) return null;
  const [, dd, hh, mm, ss] = m;
  return Number(dd ?? 0) * 86400 + Number(hh ?? 0) * 3600 + Number(mm) * 60 + Number(ss);
}
function parseProcStarts(out, nowMs) {
  const starts = /* @__PURE__ */ new Map();
  for (const line2 of String(out ?? "").split("\n")) {
    const m = /^\s*(\d+)\s+(\S+)\s*$/.exec(line2);
    if (!m) continue;
    const secs = parseElapsed(m[2]);
    if (secs != null) starts.set(Number(m[1]), nowMs - secs * 1e3);
  }
  return starts;
}
function hostAppForPid(tree, pid, maxDepth = 16) {
  let cur = String(pid);
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < maxDepth && cur && !seen.has(cur); i++) {
    seen.add(cur);
    const node = tree.get(cur);
    if (!node) break;
    const bundle = outermostAppBundle(node.comm);
    if (bundle) return bundle;
    cur = node.ppid;
  }
  return null;
}
function terminalFocusScript(tty) {
  const esc2 = escapeAppleScript(String(tty));
  return [
    "with timeout of 7 seconds",
    'tell application "Terminal"',
    "  activate",
    "  repeat with w in windows",
    "    repeat with t in tabs of w",
    `      if (tty of t) ends with "${esc2}" then`,
    "        set selected of t to true",
    "        set frontmost of w to true",
    "        return",
    "      end if",
    "    end repeat",
    "  end repeat",
    "end tell",
    'error "not found"',
    "end timeout"
  ];
}
function focusStrategyForBundle(bundle) {
  if (!bundle) return null;
  const base2 = String(bundle).replace(/\/+$/, "").split("/").pop();
  if (base2 === "Terminal.app") return "terminal";
  if (base2 === "Visual Studio Code.app") return "vscode";
  return "app";
}

// src/usage.js
function windowStartMs(kind, now) {
  if (kind === "5h") return now - 5 * 3600 * 1e3;
  if (kind === "7day") return now - 7 * 24 * 3600 * 1e3;
  const d = new Date(now);
  if (kind === "month") d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
var RATES = { opus: [5, 25], sonnet: [3, 15], haiku: [1, 5], fable: [10, 50] };
function validNum(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : void 0;
}
function familyOf(model) {
  const m = String(model ?? "").toLowerCase();
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  if (m.includes("fable") || m.includes("mythos")) return "fable";
  return null;
}
function rateFor(model, overrides) {
  const fam = familyOf(model);
  if (!fam) return null;
  const [dIn, dOut] = RATES[fam];
  const o = overrides?.[fam];
  return [validNum(o?.in) ?? dIn, validNum(o?.out) ?? dOut];
}
var CACHE_READ_MULT = 0.1;
var CACHE_WRITE_5M_MULT = 1.25;
var CACHE_WRITE_1H_MULT = 2;
function estimateCost(model, tok, overrides) {
  const r = rateFor(model, overrides);
  if (!r) return 0;
  const [inR, outR] = r;
  const t = tok || {};
  const write = t.cacheCreate || 0;
  const write1h = Math.min(t.cacheCreate1h || 0, write);
  return ((t.in || 0) * inR + (t.out || 0) * outR + (t.cacheRead || 0) * CACHE_READ_MULT * inR + (write - write1h) * CACHE_WRITE_5M_MULT * inR + write1h * CACHE_WRITE_1H_MULT * inR) / 1e6;
}
function totalOf(tok) {
  return tok.in + tok.out + tok.cacheRead + tok.cacheCreate;
}
function parseRequests(text) {
  const byId = /* @__PURE__ */ new Map();
  const noId = [];
  for (const line2 of String(text ?? "").split("\n")) {
    if (!line2) continue;
    let j;
    try {
      j = JSON.parse(line2);
    } catch {
      continue;
    }
    if (j.type !== "assistant") continue;
    const u = j.message?.usage;
    if (!u || !j.timestamp) continue;
    const tok = {
      in: u.input_tokens || 0,
      out: u.output_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
      // Grand total of the cache write, plus the 1-hour-TTL slice of it. The
      // breakdown lives in a nested object that older transcripts lack, hence the
      // 0 default — see estimateCost for why that default is the right one.
      cacheCreate: u.cache_creation_input_tokens || 0,
      cacheCreate1h: u.cache_creation?.ephemeral_1h_input_tokens || 0
    };
    const rec = { id: j.message?.id ?? j.requestId ?? null, t: new Date(j.timestamp).getTime(), model: j.message?.model ?? "", tok };
    if (rec.id == null) {
      noId.push(rec);
      continue;
    }
    const prev = byId.get(rec.id);
    if (!prev || totalOf(tok) > totalOf(prev.tok)) byId.set(rec.id, rec);
  }
  return [...byId.values(), ...noId];
}
function localDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function newDayCounts(day) {
  return { day, msgs: 0, looseTokens: 0, reqTok: /* @__PURE__ */ new Map(), seenMsg: /* @__PURE__ */ new Set() };
}
function foldDayChunk(counts, text) {
  for (const line2 of String(text ?? "").split("\n")) {
    if (!line2) continue;
    let j;
    try {
      j = JSON.parse(line2);
    } catch {
      continue;
    }
    if (!j.timestamp || localDay(j.timestamp) !== counts.day) continue;
    const mid = j.message?.id ?? j.requestId;
    if (j.type === "user") counts.msgs++;
    else if (j.type === "assistant" && (!mid || !counts.seenMsg.has(mid))) {
      if (mid) counts.seenMsg.add(mid);
      counts.msgs++;
    }
    const u = j.message?.usage;
    if (!u) continue;
    const tok = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    if (mid) counts.reqTok.set(mid, Math.max(counts.reqTok.get(mid) ?? 0, tok));
    else counts.looseTokens += tok;
  }
  return counts;
}
function dayCountsTotals(counts) {
  let tokens = counts.looseTokens;
  for (const t of counts.reqTok.values()) tokens += t;
  return { msgs: counts.msgs, tokens };
}
function mergeById(lists) {
  const byId = /* @__PURE__ */ new Map();
  const noId = [];
  for (const list of lists) {
    for (const r of list) {
      if (r.id == null) {
        noId.push(r);
        continue;
      }
      const prev = byId.get(r.id);
      if (!prev || totalOf(r.tok) > totalOf(prev.tok)) byId.set(r.id, r);
    }
  }
  return [...byId.values(), ...noId];
}
function aggregate(requests, startMs, overrides) {
  let tokens = 0, cost = 0, inTok = 0, outTok = 0;
  for (const r of requests) {
    if (r.t < startMs) continue;
    tokens += totalOf(r.tok);
    inTok += r.tok?.in ?? 0;
    outTok += r.tok?.out ?? 0;
    cost += estimateCost(r.model, r.tok, overrides);
  }
  return { tokens, cost, in: inTok, out: outTok };
}
function aggregateByModel(requests, startMs, overrides) {
  const by = /* @__PURE__ */ new Map();
  for (const r of requests ?? []) {
    if (r.t < startMs) continue;
    const fam = familyOf(r.model) ?? "other";
    const cur = by.get(fam) ?? { model: fam, tokens: 0, cost: 0 };
    cur.tokens += (r.tok?.in ?? 0) + (r.tok?.out ?? 0) + (r.tok?.cacheRead ?? 0) + (r.tok?.cacheCreate ?? 0);
    cur.cost += estimateCost(r.model, r.tok, overrides);
    by.set(fam, cur);
  }
  return [...by.values()].filter((e) => e.tokens > 0 || e.cost > 0).sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
}
function budgetPct(spend, budget) {
  const b = Number(budget);
  if (!Number.isFinite(b) || b <= 0) return null;
  const s = Number(spend);
  if (!Number.isFinite(s) || s < 0) return null;
  return s / b * 100;
}
var USAGE_FRESH_MS = 30 * 6e4;
function hasSubscriptionData(usage) {
  if (!usage) return false;
  return !!(usage.fiveHour || usage.weekly || usage.weeklyOpus || usage.scopedPct != null || (usage.models ?? []).length);
}
function gaugeSource({ usage, usageErr, usageAt, now }, hasLocal = false) {
  if (usage == null && !usageErr) return "pending";
  const fresh = hasSubscriptionData(usage) && now - (usageAt ?? 0) < USAGE_FRESH_MS;
  if (fresh) return "subscription";
  if (usageErr && String(usageErr).includes("429")) return "throttled";
  if (usageErr && String(usageErr).includes("no OAuth token")) return "local";
  if (usageErr) return "error";
  return hasLocal ? "local" : "pending";
}

// src/status.js
import path from "node:path";
var QUESTION_WAITS = /* @__PURE__ */ new Set(["input needed", "dialog open"]);
var FINISHED_MS = 6e4;
var ACTIVITY_MS = 6e4;
function sessionWhere(s) {
  const e = String(s?.entrypoint ?? "");
  if (e === "cli") return "cli";
  if (e.includes("vscode")) return "code";
  return "";
}
function transcriptPathFor(projectsDir, s) {
  if (!s?.cwd || !s?.sessionId) return null;
  return joinPath(projectsDir, slugifyCwd(s.cwd), `${s.sessionId}.jsonl`);
}
function slugifyCwd(cwd) {
  return String(cwd).replace(/[/\\_:]/g, "-");
}
function joinPath(...parts) {
  return parts.filter(Boolean).join("/");
}
function sessionState(s, now = Date.now(), activityAt = null) {
  const st = s?.status;
  if (st === "waiting") {
    const w = String(s.waitingFor ?? "").toLowerCase();
    return QUESTION_WAITS.has(w) ? "input-needed" : "needs-approval";
  }
  if (st === "busy" || st === "shell") return "working";
  if (!st) {
    if (!activityAt) return "unknown";
    return Math.max(0, now - activityAt) < ACTIVITY_MS ? "working" : "idle";
  }
  if (st === "idle") {
    const at = s.statusUpdatedAt;
    if (!at) return "idle";
    return Math.max(0, now - at) < FINISHED_MS ? "finished" : "idle";
  }
  return "idle";
}
var PID_START_SLACK_MS = 6e4;
function pidLooksRecycled(session, procStartMs, slackMs = PID_START_SLACK_MS) {
  const startedAt = session?.startedAt;
  if (!startedAt || procStartMs == null) return false;
  return procStartMs > startedAt + slackMs;
}
function sessionSig(sessions, now = Date.now(), activity = null) {
  return JSON.stringify((sessions ?? []).map((s) => [s.pid, s.status ?? "", s.waitingFor ?? "", sessionState(s, now, actOf(s, activity))]));
}
var URGENCY = { "needs-approval": 0, "input-needed": 1, working: 2, finished: 3, idle: 4, unknown: 5 };
var actOf = (s, activity) => activity && s?.sessionId ? activity.get(s.sessionId) ?? null : null;
var rank = (s, now, activity) => URGENCY[sessionState(s, now, actOf(s, activity))] ?? 5;
function blockedSessions(sessions, now = Date.now(), activity = null) {
  return (sessions ?? []).filter((s) => rank(s, now, activity) <= URGENCY["input-needed"]).sort((a, b) => rank(a, now, activity) - rank(b, now, activity) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || (a.pid ?? 0) - (b.pid ?? 0));
}
function fmtShort(ms) {
  if (ms == null || !isFinite(ms)) return "";
  const t = Math.max(0, ms);
  if (t < 6e4) return Math.floor(t / 1e3) + "s";
  const m = Math.floor(t / 6e4);
  if (m < 60) return m + "m";
  return Math.floor(m / 60) + "h " + m % 60 + "m";
}
var WAIT_SHORT = {
  "permission prompt": "permission",
  "sandbox request": "sandbox",
  "worker request": "worker",
  "input needed": "input",
  "dialog open": "dialog"
};
function shortWait(reason) {
  const r = String(reason ?? "").toLowerCase();
  if (!r) return "";
  return WAIT_SHORT[r] ?? String(reason);
}
function autoSlot(keys, context) {
  const me = (keys ?? []).find((k) => k.context === context);
  const sorted = (keys ?? []).filter((k) => (k.device ?? null) === (me?.device ?? null)).sort((a, b) => {
    const ar = a.row ?? Infinity, br = b.row ?? Infinity;
    if (ar !== br) return ar - br;
    const ac = a.col ?? Infinity, bc = b.col ?? Infinity;
    if (ac !== bc) return ac - bc;
    return String(a.context).localeCompare(String(b.context));
  });
  return Math.max(0, sorted.findIndex((k) => k.context === context));
}
function sessionProject(s) {
  return path.basename(s.cwd ?? "").toLowerCase();
}
function byDisplayOrder(a, b, now, activity) {
  const ra = rank(a, now, activity), rb = rank(b, now, activity);
  if (ra !== rb) return ra - rb;
  if ((b.updatedAt ?? 0) !== (a.updatedAt ?? 0)) return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  return (a.pid ?? 0) - (b.pid ?? 0);
}
function resolveStatusKey(sessions, project, autoIdx = 0, now = Date.now(), activity = null) {
  const explicit = !!(project && String(project).trim());
  const want = explicit ? String(project).trim().toLowerCase() : null;
  const list = (sessions ?? []).filter((s) => explicit ? sessionProject(s) === want : true).sort((a, b) => byDisplayOrder(a, b, now, activity)).map((s) => ({
    name: path.basename(s.cwd ?? "") || "claude",
    state: sessionState(s, now, actOf(s, activity)),
    waitingFor: s.status === "waiting" ? String(s.waitingFor ?? "permission prompt") : "",
    // null when the session reports no timestamp at all (VS Code) — otherwise
    // `now - 0` renders as an absurd age like "495817h idle".
    statusAge: s.statusUpdatedAt ?? s.updatedAt ? Math.max(0, now - (s.statusUpdatedAt ?? s.updatedAt)) : null,
    // When the wait began. statusUpdatedAt ONLY — never the updatedAt fallback,
    // so every key measures the same wait from the same anchor.
    waitingSince: s.status === "waiting" && s.statusUpdatedAt ? s.statusUpdatedAt : null,
    cwd: s.cwd ?? "",
    sessionId: s.sessionId ?? null,
    pid: s.pid ?? null,
    where: sessionWhere(s)
  }));
  return { list, index: explicit ? 0 : autoIdx, count: list.length };
}
function statusEntry(resolved, cycleIdx = null) {
  const i = cycleIdx != null ? cycleIdx : resolved.index;
  return resolved.list[i] ?? { name: "", state: "none", waitingFor: "", statusAge: 0, waitingSince: null, cwd: "", sessionId: null, pid: null, where: "" };
}

// src/plugin.js
import { randomBytes } from "node:crypto";

// src/approve.js
var DENY_MESSAGE = "Denied from Stream Deck";
var PORT_DEFAULT = 45623;
function sanitizeSuggestions(suggestions, toolName, sessionOnly = false) {
  if (!Array.isArray(suggestions)) return [];
  if (String(toolName ?? "").startsWith("mcp__")) return [];
  const out = [];
  for (const e of suggestions) {
    if (!e || typeof e !== "object") continue;
    if (e.type !== "addRules" || e.behavior !== "allow") continue;
    if (!Array.isArray(e.rules)) continue;
    const rules = e.rules.filter(
      (r) => r && typeof r.toolName === "string" && r.toolName && typeof r.ruleContent === "string" && r.ruleContent
    ).map((r) => ({ toolName: r.toolName, ruleContent: r.ruleContent }));
    if (!rules.length) continue;
    const destination = sessionOnly || e.destination === "session" ? "session" : "localSettings";
    out.push({ type: "addRules", behavior: "allow", destination, rules });
  }
  return out;
}
var wrap = (decision) => ({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision } });
function oneSafeRule(req, sessionOnly = false) {
  const safe = sanitizeSuggestions(req?.suggestions, req?.toolName, sessionOnly);
  if (safe.length !== 1 || safe[0].rules.length !== 1) return null;
  return safe[0];
}
function decisionBody(kind, req, opts = {}) {
  if (kind === "allow") return wrap({ behavior: "allow" });
  if (kind === "deny") return wrap({ behavior: "deny", message: DENY_MESSAGE });
  if (kind !== "always") return null;
  const entry = oneSafeRule(req, !!opts.sessionOnly);
  if (!entry) return null;
  return wrap({ behavior: "allow", updatedPermissions: [entry] });
}
var NAME_MAX = 11;
var TARGET_MAX = 14;
var RULE_FIT = 36;
var clean = (v) => String(v ?? "").replace(/[\s\p{Cc}]+/gu, " ").trim();
var cut = (s, max) => s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
var base = (p) => clean(p).split(/[\\/]/).filter(Boolean).pop() ?? "";
function targetOf(req) {
  const t = req?.toolName ?? "";
  const i = req?.toolInput;
  const has = i && typeof i === "object";
  if (t === "Bash" && has && i.command) return clean(i.command);
  if (["Edit", "Write", "NotebookEdit", "Read"].includes(t) && has && i.file_path) return base(i.file_path);
  if (t === "WebFetch" && has && i.url) {
    try {
      return clean(new URL(String(i.url)).hostname);
    } catch {
      return clean(t);
    }
  }
  if (t === "WebSearch" && has && i.query) return clean(i.query);
  if (t === "Task" && has && i.subagent_type) return clean(i.subagent_type);
  if (t.startsWith("mcp__")) {
    const [, server, ...rest] = t.split("__");
    if (server && rest.length) return clean(`${server}\xB7${rest.join("__")}`);
  }
  return clean(t);
}
function describeRequest(req) {
  return {
    name: cut(base(req?.cwd), NAME_MAX),
    target: cut(targetOf(req), TARGET_MAX)
  };
}
function alwaysRule(req, sessionOnly = false) {
  const entry = oneSafeRule(req, sessionOnly);
  if (!entry) return null;
  const { toolName, ruleContent } = entry.rules[0];
  const text = clean(`${toolName}(${ruleContent})`);
  return text.length > RULE_FIT ? null : text;
}
var DENY_WINDOW_MS = 3e4;
var pruneDenies = (denies, now) => (denies ?? []).filter((d) => now - d.at < DENY_WINDOW_MS);
function rememberDeny(denies, req, now) {
  const rule = alwaysRule(req);
  const kept = pruneDenies(denies, now).filter((d) => d.rule !== rule);
  return rule ? [...kept, { rule, at: now }] : kept;
}
function denyBlock(denies, req, now) {
  const rule = alwaysRule(req);
  if (!rule) return null;
  return (denies ?? []).some((d) => d.rule === rule && now - d.at < DENY_WINDOW_MS) ? "just denied" : null;
}
var QUEUE_MAX = 8;
var HOLD_S_DEFAULT = 20;
var YOUNG_MS = 1e4;
function enqueue(queue, req) {
  const next = [...queue, req];
  if (next.length <= QUEUE_MAX) return { queue: next, evicted: null };
  const [evicted, ...rest] = next;
  return { queue: rest, evicted };
}
function hookFragment(url, timeoutS) {
  return [
    '"PermissionRequest": [',
    "  {",
    '    "matcher": "",',
    '    "hooks": [',
    "      {",
    '        "type": "http",',
    `        "url": ${JSON.stringify(url)},`,
    `        "timeout": ${Number(timeoutS)}`,
    "      }",
    "    ]",
    "  }",
    "]"
  ].join("\n");
}
var head = (queue) => queue[0] ?? null;
function resolve(queue, id) {
  const req = queue.find((r) => r.id === id) ?? null;
  return { queue: req ? queue.filter((r) => r.id !== id) : queue, req };
}
var expiredIds = (queue, now, holdMs) => queue.filter((r) => now - r.receivedAt > holdMs).map((r) => r.id);
function seedBaselines(queue, sessions, activity) {
  if (!queue.some((r) => !r.baselined)) return queue;
  return queue.map((r) => {
    if (r.baselined) return r;
    const matches = (sessions ?? []).filter((s2) => s2.sessionId === r.sessionId);
    const s = matches.slice().sort((a, b) => (b.statusUpdatedAt ?? 0) - (a.statusUpdatedAt ?? 0))[0] ?? null;
    return {
      ...r,
      statusSnapshot: s?.statusUpdatedAt ?? null,
      activitySnapshot: activity?.get?.(r.sessionId) ?? null,
      baselined: true
    };
  });
}
function staleIds(queue, sessions, activity, now) {
  const out = [];
  for (const r of queue) {
    if (!r.baselined) continue;
    if (now - r.receivedAt < YOUNG_MS) continue;
    const matches = (sessions ?? []).filter((s2) => s2.sessionId === r.sessionId);
    if (!matches.length) continue;
    const s = matches.slice().sort((a, b) => (b.statusUpdatedAt ?? 0) - (a.statusUpdatedAt ?? 0))[0];
    if (s.statusUpdatedAt != null && r.statusSnapshot != null && s.statusUpdatedAt > r.statusSnapshot) {
      out.push(r.id);
      continue;
    }
    const mt = activity?.get?.(r.sessionId) ?? null;
    if (mt != null && r.activitySnapshot != null && mt > r.activitySnapshot) out.push(r.id);
  }
  return out;
}
var SETTLE_MS = 500;
function pressDecision({ queue, shownId, lastHeadChangeAt, now, settleMs = SETTLE_MS }) {
  const h = head(queue);
  if (!h) return { action: "none", reason: "empty" };
  if (now - lastHeadChangeAt < settleMs) return { action: "none", reason: "settling" };
  if (h.id !== shownId) return { action: "alert", reason: "stale-paint" };
  return { action: "resolve", id: h.id, reason: "ok" };
}

// src/hookserver.js
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
var BODY_MAX = 1024 * 1024;
var BADPATH_WINDOW_MS = 5 * 6e4;
var BADPATH_MIN_HITS = 3;
var sameSecret = (a, b) => {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && timingSafeEqual(A, B);
};
function startHookServer({ port, secret, onRequest, onDrop, log: log2 = () => {
}, retries = 3, retryMs = 500 }) {
  if (!secret || String(secret).length < 32) {
    return Promise.reject(new Error("hook secret too short"));
  }
  const wantPath = `/permission/${secret}`;
  const stats = { badPathHits: [] };
  let boundPort = null;
  const server = createServer((req, res) => {
    const deny = (code) => {
      res.writeHead(code).end();
    };
    if (!sameSecret(req.url ?? "", wantPath)) {
      const now = Date.now();
      stats.badPathHits.push(now);
      stats.badPathHits = stats.badPathHits.filter((t) => now - t < BADPATH_WINDOW_MS);
      return deny(404);
    }
    if (stats.badPathHits.length) stats.badPathHits = [];
    const host = String(req.headers.host ?? "");
    if (host !== `127.0.0.1:${boundPort}` && host !== `localhost:${boundPort}`) return deny(403);
    if (req.method !== "POST") return deny(405);
    req.setEncoding("utf8");
    let body = "", over = false;
    req.on("data", (c) => {
      if (over) return;
      body += c;
      if (body.length > BODY_MAX) {
        over = true;
        res.writeHead(413);
        res.end();
        res.on("finish", () => req.destroy());
      }
    });
    req.on("end", () => {
      if (over) return;
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        return deny(400);
      }
      const ticket = {
        id: null,
        closed: false,
        respond(out) {
          if (ticket.closed || res.writableEnded) return false;
          ticket.closed = true;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(out ?? {}));
          return true;
        }
      };
      res.on("close", () => {
        if (res.writableEnded || ticket.closed) return;
        ticket.closed = true;
        onDrop?.(ticket);
      });
      try {
        onRequest(payload, ticket);
      } catch (e) {
        log2("hook onRequest threw:", String(e));
        ticket.respond(null);
      }
    });
    req.on("error", () => {
    });
  });
  return new Promise((resolve2, reject) => {
    let left = retries;
    const attempt = () => {
      server.once("error", (e) => {
        if (e.code === "EADDRINUSE" && left-- > 0) {
          log2(`hook port ${port} busy, retrying (${left} left)`);
          setTimeout(attempt, retryMs);
          return;
        }
        reject(e);
      });
      server.listen(port, "127.0.0.1", () => {
        boundPort = server.address().port;
        server.removeAllListeners("error");
        server.on("error", (err) => log2("hook server error:", String(err)));
        log2(`hook server on http://127.0.0.1:${boundPort}/permission/<secret>`);
        resolve2({
          boundPort,
          // The secret this server actually bound to, so a caller can tell a genuine
          // secret CHANGE (which needs a rebind) apart from a same-secret re-assert
          // (which doesn't) instead of comparing boundPort alone.
          secret,
          stats,
          close: () => new Promise((done) => {
            let settled = false;
            const finish = () => {
              if (!settled) {
                settled = true;
                done();
              }
            };
            server.close(finish);
            server.closeIdleConnections();
            setTimeout(() => {
              server.closeAllConnections?.();
              finish();
            }, 250).unref();
          })
        });
      });
    };
    attempt();
  });
}

// src/view.js
import path2 from "node:path";

// src/keyart.js
var C = {
  bg: "#16151c",
  panel: "#211f2b",
  text: "#f5f1ea",
  dim: "#9b96a8",
  // Band rule for an action. Achromatic on purpose: zero hue is zero collision with
  // any state colour, in any vision type and in greyscale. 3.56:1 as a graphic mark
  // once composited, above the 3:1 non-text target. The old solid-orange launch key
  // WAS findable — it was just shouting; this keeps the findability.
  rail: "#807b8d",
  // Identity hues, one per action: WHICH key is this, never what is happening. Hue
  // alone could not carry identity — every candidate collided with a state colour —
  // but CHROMA can. These sit at chroma ~20 against a state palette whose lowest is
  // 49 (info blue), a 2.5x-4.6x separation, so vivid reads as signal and muted reads
  // as identity. All land at 8.4:1 on the background. They colour the BAND and GLYPH
  // only; the frame tint stays exclusively for state, so a working FOCUS key still
  // cannot be mistaken for the vivid-blue ALWAYS key beside it.
  ident: {
    code: "#96b99e",
    launch: "#cbab8f",
    chat: "#b8abce",
    web: "#cda5bd",
    focus: "#7fbbbf",
    project: "#bbb08c",
    prompt: "#d7a4a6",
    custom: "#94b4d4"
  },
  ok: "#4ade80",
  warn: "#fbbf24",
  bad: "#f87171",
  track: "#3a3745",
  info: "#60a5fa",
  // status: working
  ask: "#a855f7"
  // status: input needed
};
var pctColor = (p) => p == null ? C.dim : p >= 85 ? C.bad : p >= 60 ? C.warn : C.ok;
var esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
var FONT = "-apple-system, Segoe UI, system-ui, sans-serif";
var ADVANCE = 0.6;
var fit = (s, maxW, ideal, min = 11) => Math.max(min, Math.min(ideal, Math.floor(maxW / (ADVANCE * Math.max(1, String(s).length)))));
var fits = (s, maxW, size) => String(s).length * ADVANCE * size <= maxW;
var capacity = (maxW, size) => Math.max(1, Math.floor(maxW / (ADVANCE * size)));
function fitClip(s, maxW, ideal, min = 11) {
  const str = String(s);
  const size = fit(str, maxW, ideal, min);
  if (fits(str, maxW, size)) return [str, size];
  return [str.slice(0, Math.max(1, capacity(maxW, size) - 1)) + "\u2026", size];
}
var txt = (x, y, size, weight, fill, s, anchor = "middle", extra = "") => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}"${extra}>${esc(s)}</text>`;
var line = (x, y, maxW, ideal, weight, fill, s, anchor = "middle", extra = "", min = 11) => {
  const [t, size] = fitClip(s, maxW, ideal, min);
  return txt(x, y, size, weight, fill, t, anchor, extra);
};
var svgWrap = (inner) => "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="18" fill="${C.bg}"/>${inner}</svg>`
);
function tintFrame(col, strong = false, phase = null) {
  if (!col) return "";
  const p = phase == null ? 1 : [0.3, 0.65, 1][phase % 3];
  const washOp = (strong ? 0.22 : 0.1) * (phase == null ? 1 : 0.6 + 0.4 * p);
  const mainOp = phase == null ? strong ? 1 : 0.8 : 0.25 + 0.75 * p;
  return `<rect width="144" height="144" rx="18" fill="${col}" opacity="${washOp.toFixed(3)}"/>
    <rect x="2" y="2" width="140" height="140" rx="17" fill="none" stroke="${col}" stroke-width="2" opacity="${((strong ? 0.45 : 0.22) * p).toFixed(3)}"/>
    <rect x="5" y="5" width="134" height="134" rx="15" fill="none" stroke="${col}" stroke-width="${strong ? 5 : 3}" opacity="${mainOp.toFixed(3)}"/>
    <rect x="9.5" y="9.5" width="125" height="125" rx="12" fill="none" stroke="${col}" stroke-width="1" opacity="${(0.18 * p).toFixed(3)}"/>`;
}
var GLYPHS = {
  allow: ["M4 13 L9.5 18.5 L20 6"],
  always: ["M2 13 L7 18 L16.5 6.5", "M10.5 18 L20 6.5"],
  deny: ["M6.5 6.5 L17.5 17.5", "M17.5 6.5 L6.5 17.5"],
  launch: ["M14 4 h6 v6", "M20 4 L12.5 11.5", "M17 14 v5 a1 1 0 0 1 -1 1 H5 a1 1 0 0 1 -1 -1 V8 a1 1 0 0 1 1 -1 h5"],
  chat: ["M3.5 6 h17 v10 h-9 l-5 4 v-4 h-3 z"],
  web: ["M12 3 a9 9 0 1 0 0.01 0", "M3 12 h18", "M12 3 a13 13 0 0 0 0 18 a13 13 0 0 0 0 -18"],
  code: ["M6 8 L10.5 12.5 L6 17", "M13 17 h5.5"],
  project: ["M3 18 V6 h6 l2 2.5 h10 V18 z"],
  prompt: ["M4 7 h16", "M4 12.5 h11", "M4 18 h7"],
  custom: ["M4 7.5 h16", "M4 16.5 h16", "M9 7.5 m0 0 a2.4 2.4 0 1 0 0.01 0", "M15 16.5 m0 0 a2.4 2.4 0 1 0 0.01 0"],
  focus: ["M12 12 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0", "M12 1.5 v4", "M12 18.5 v4", "M1.5 12 h4", "M18.5 12 h4"],
  // Report-kind marks. Report KEYS carry no glyph — that absence is the action-class
  // signal — but the Stream Deck action list needs one row icon per action, so these
  // exist for iconSvg() only.
  gauge: ["M3.5 18 a8.5 8.5 0 1 1 17 0", "M12 18 L16.5 10.5"],
  meter: ["M3.5 12.5 h17 a3 3 0 0 1 0 6 h-17 a3 3 0 0 1 0 -6 z", "M7 15.5 h6"],
  rising: ["M4 16.5 L10 10 L14 14 L20 7", "M20 12 V7 h-5"],
  layers: ["M12 3 L21 8 L12 13 L3 8 z", "M3 12.5 L12 17.5 L21 12.5", "M3 16.5 L12 21.5 L21 16.5"],
  list: ["M4 7 h13", "M4 12 h13", "M4 17 h13", "M20 7 m0 0 a1 1 0 1 0 0.01 0", "M20 12 m0 0 a1 1 0 1 0 0.01 0", "M20 17 m0 0 a1 1 0 1 0 0.01 0"],
  dot: ["M12 12 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0", "M12 12 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0"],
  clock: ["M12 12 m-8.5 0 a8.5 8.5 0 1 0 17 0 a8.5 8.5 0 1 0 -17 0", "M12 6.5 V12 l4 2.5"],
  calendar: ["M4 6.5 h16 v14 H4 z", "M4 11 h16", "M8 3 v4", "M16 3 v4"],
  week: ["M4 6.5 h16 v14 H4 z", "M4 11 h16", "M8 3 v4", "M16 3 v4", "M7.5 15 h3", "M13.5 15 h3"],
  grid: ["M4 4.5 h6 v6 H4 z", "M14 4.5 h6 v6 h-6 z", "M4 13.5 h6 v6 H4 z", "M14 13.5 h6 v6 h-6 z"]
};
function glyph(name, x, y, size, col, sw = 2.6) {
  const s = size / 24;
  return `<g transform="translate(${x},${y}) scale(${s.toFixed(4)})" fill="none" stroke="${col}" stroke-width="${(sw / s).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">` + (GLYPHS[name] ?? []).map((d) => `<path d="${d}"/>`).join("") + "</g>";
}
var header = (s, narrow = false) => line(12, 25, narrow ? 88 : 106, 15, 700, C.dim, String(s).toUpperCase(), "start", ' letter-spacing="0.6"');
var foot = (s, col = C.dim) => s ? line(72, 127, 130, 14, 400, col, s) : "";
var corner = (tag, col = C.dim) => tag ? txt(132, 25, 12, 600, col, String(tag).slice(0, 8), "end") : "";
var badge = (n, col) => `<circle cx="121" cy="20" r="11.5" fill="${C.panel}" stroke="${col}" stroke-width="1.5"/>` + txt(121, 25, 14, 700, C.text, n);
var WASH = 0.24;
var R = 18;
var topCap = (h) => `M0 ${h} V${R} A${R} ${R} 0 0 1 ${R} 0 H${144 - R} A${R} ${R} 0 0 1 144 ${R} V${h} Z`;
var band = {
  rule: (col, m = 1) => `<rect x="0" y="33" width="144" height="2.5" fill="${col}" opacity="${(0.85 * m).toFixed(2)}"/>`,
  // Identity cap for an action key: a tinted header zone closed by a bright rule.
  cap: (col, m = 1) => `<path d="${topCap(37)}" fill="${col}" opacity="${(WASH * m).toFixed(3)}"/><rect x="0" y="34" width="144" height="3" fill="${col}" opacity="${(0.95 * m).toFixed(2)}"/>`,
  double: (col, m = 1) => `<rect x="0" y="33" width="144" height="2.5" fill="${col}" opacity="${(0.85 * m).toFixed(2)}"/><rect x="0" y="38" width="144" height="1.5" fill="${col}" opacity="${(0.55 * m).toFixed(2)}"/>`,
  fill: (col, m = 1) => `<path d="${topCap(35)}" fill="${col}" opacity="${(0.9 * m).toFixed(2)}"/>`
};
var actionHead = (glyphName, title, fg = C.dim) => glyph(glyphName, 10, 8, 22, fg) + line(38, 25, 82, 16, 800, fg, String(title).toUpperCase(), "start", ' letter-spacing="0.5"');
function usageMeterKey(head2, big, sub, isCost) {
  const none = String(big) === "--";
  const est = isCost && !none;
  return svgWrap(`
    ${header(head2, est)}
    ${est ? corner("est") : ""}
    ${line(72, 88, 128, 42, 700, none ? C.dim : C.text, big, "middle", "", 20)}
    ${foot(sub)}`);
}
function gaugeKey(label, pct, sub, pulsePhase = null) {
  const has = typeof pct === "number" && isFinite(pct);
  const p = has ? Math.max(0, Math.min(100, pct)) : 0;
  const col = has ? pctColor(p) : C.dim;
  const pulse = pulsePhase == null ? "" : `<rect x="4" y="4" width="136" height="136" rx="16" fill="none" stroke="${C.bad}" stroke-width="6" opacity="${[0.2, 0.55, 0.95][pulsePhase % 3]}"/>`;
  return svgWrap(`
    ${pulse}
    ${header(label)}
    ${line(72, 82, 128, has ? 44 : 32, 700, col, has ? Math.round(p) + "%" : "--")}
    <rect x="12" y="94" width="120" height="10" rx="5" fill="${C.track}"/>
    ${has ? `<rect x="12" y="94" width="${Math.max(7, 120 * p / 100).toFixed(1)}" height="10" rx="5" fill="${col}"/>` : ""}
    ${foot(sub)}`);
}
function burnKey(tokensHour, sub) {
  const has = tokensHour != null;
  return svgWrap(`
    ${header("burn rate")}
    ${line(72, 84, 128, has ? 42 : 32, 700, has ? C.text : C.dim, has ? fmtNum(tokensHour) : "--")}
    ${txt(72, 105, 15, 400, C.dim, "tok/hr")}
    ${foot(sub)}`);
}
function linesKey(title, rows) {
  const rowSvg = rows.map((r, i) => line(12, 64 + i * 30, 122, 21, r.big ? 700 : 600, r.color ?? C.text, r.text, "start")).join("");
  return svgWrap(`${header(title)}${rowSvg}`);
}
function bigCountKey(title, count, sub, subColor, animPhase2 = null, tint = null, strong = false) {
  const dots = animPhase2 == null ? "" : [0, 1, 2].map((i) => `<circle cx="128" cy="${58 + i * 15}" r="${i === animPhase2 ? 4.5 : 3}" fill="${i === animPhase2 ? tint ?? C.info : C.track}"/>`).join("");
  return svgWrap(`
    ${tintFrame(tint, strong)}
    ${header(title)}
    ${dots}
    ${line(72, 97, 118, 60, 700, count > 0 ? C.text : C.dim, count)}
    ${foot(sub, subColor ?? C.dim)}`);
}
var STATUS_LOOK = {
  "needs-approval": { label: "Needs approval", col: C.warn, strong: true },
  "input-needed": { label: "Input needed", col: C.ask, strong: true },
  working: { label: "Working", col: C.info },
  finished: { label: "Finished", col: C.ok },
  idle: { label: "Idle", col: C.dim },
  none: { label: "no session", col: C.dim },
  quiet: { label: "all clear", col: C.dim },
  // Waiting key, nothing pending
  // A session that reports no status (VS Code extension) and whose transcript we
  // couldn't stat. Saying "no status" beats inventing "Idle".
  unknown: { label: "no status", col: C.dim }
};
function statusKey(name, st, count, detail = "", tag = "", phase = null) {
  const look = STATUS_LOOK[st] ?? STATUS_LOOK.none;
  const shown = String(name || "CLAUDE").slice(0, 11);
  return svgWrap(`
    ${tintFrame(look.col, !!look.strong, phase)}
    ${count > 1 ? badge(count, look.col) : corner(tag)}
    ${line(72, 78, 128, 25, 700, st === "none" ? C.dim : C.text, shown)}
    ${line(72, 104, 130, 17, 700, look.col, look.label)}
    ${detail ? line(72, 127, 132, 13, 400, C.dim, detail) : ""}`);
}
function fmtNum(n) {
  if (n == null) return "--";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}
function actionKey(glyphName, title, label, sub) {
  const id = C.ident[glyphName] ?? C.rail;
  return svgWrap(`
    ${band.cap(id)}
    ${actionHead(glyphName, title, id)}
    ${line(72, 92, 128, 24, 700, C.text, label)}
    ${foot(sub)}`);
}
var GLYPH_FOR = { PROJECT: "project", FOCUS: "focus", PROMPT: "prompt", CLAUDE: "custom" };
function labelKey(title, label, sub, tint = null, strong = false) {
  const text = String(label ?? "").trim() || "\u2014";
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= 11) cur = (cur + " " + w).trim();
    else {
      lines.push(cur);
      cur = w;
      if (lines.length === 2) break;
    }
  }
  if (cur && lines.length < 2) lines.push(cur);
  const use = lines.slice(0, 2).filter(Boolean);
  const body = use.map((l, i) => line(72, use.length > 1 ? 76 + i * 26 : 92, 128, 23, 700, C.text, l)).join("");
  const g = GLYPH_FOR[String(title).toUpperCase()] ?? "custom";
  const id = C.ident[g] ?? C.rail;
  return svgWrap(`
    ${tintFrame(tint, strong)}
    ${band.cap(id)}
    ${actionHead(g, title, id)}
    ${body}
    ${foot(sub)}`);
}
var APPROVE_LOOK = {
  "approve-allow": { word: "ALLOW", col: C.ok, glyphName: "allow", weight: "rule" },
  "approve-always": { word: "ALWAYS", col: C.info, glyphName: "always", weight: "double" },
  "approve-deny": { word: "DENY", col: C.bad, glyphName: "deny", weight: "fill" }
};
var RULE_W = 132;
var RULE_IDEAL = 19;
var RULE_GOOD = 13;
function ruleLines(rule) {
  const good = (s) => fit(s, RULE_W, RULE_IDEAL) >= RULE_GOOD;
  if (good(rule)) return [rule];
  const at = rule.indexOf("(");
  let parts = at >= 0 ? [rule.slice(0, at), rule.slice(at)] : [rule];
  if (!parts.every(good)) {
    const tail = parts[parts.length - 1];
    const colon = tail.indexOf(":");
    if (colon >= 0) {
      parts = [
        ...parts.slice(0, -1),
        tail.slice(0, colon + 1).replace(/^\(/, ""),
        tail.slice(colon + 1).replace(/\)$/, "")
      ];
    }
  }
  const out = [];
  for (const p of parts.filter(Boolean)) {
    if (good(p)) {
      out.push(p);
      continue;
    }
    const max = capacity(RULE_W, RULE_GOOD);
    for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
  }
  return out;
}
function approveKey(kind, req, o = {}) {
  const look = APPROVE_LOOK[kind];
  const shell = (col2, mult2, bodyLines, sub, cornerSvg2 = "", wordOverride = null) => {
    const onBand = kind === "approve-deny" && mult2 === 1 ? C.bg : col2;
    const n = Math.min(4, bodyLines.length);
    const [top, step] = [[92, 0], [78, 26], [68, 22], [62, 18]][n - 1] ?? [92, 0];
    const body = bodyLines.slice(0, n).map((l, i) => line(72, top + i * step, RULE_W, l.max ?? 22, 700, l.col ?? C.text, l.t)).join("");
    return svgWrap(`
      ${tintFrame(col2, mult2 === 1, o.phase ?? null)}
      ${band[look.weight](col2, mult2)}
      ${actionHead(look.glyphName, wordOverride ?? look.word, onBand)}
      ${cornerSvg2}
      ${body}
      ${foot(sub)}`);
  };
  if (o.err) return shell(C.bad, 1, [], o.err);
  if (!req) return shell(C.dim, 0.4, [], "all clear");
  const { name, target } = describeRequest(req);
  const rule = kind === "approve-always" ? alwaysRule(req, !!o.sessionOnly) : null;
  const denied = kind === "approve-always" && rule !== null && !!o.denied;
  const disabled = kind === "approve-always" && (rule === null || denied);
  const col = disabled ? C.dim : look.col;
  const mult = disabled ? 0.4 : 1;
  const cornerSvg = o.depth > 1 ? badge(o.depth, col) : corner(o.label);
  const word = kind === "approve-always" ? denied ? "ALWAYS" : rule === null ? "ALWAYS n/a" : `ALWAYS \xB7${o.sessionOnly ? "ses" : "prj"}` : look.word;
  if (denied) {
    return shell(col, mult, ruleLines(rule).map((t) => ({ t, col: C.dim, max: 18 })), String(o.denied), cornerSvg, word);
  }
  const shown = kind === "approve-always" ? rule ?? target : target;
  const lines = kind === "approve-always" && rule != null ? ruleLines(rule).map((t) => ({ t, max: 19 })) : [{ t: shown, max: 24 }];
  return shell(col, mult, lines, name, cornerSvg, word);
}

// src/view.js
var PULSE_MS = 12e4;
function fmtReset(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (!isFinite(ms) || ms <= 0) return "resetting\u2026";
  const h = Math.floor(ms / 36e5), m = Math.round(ms % 36e5 / 6e4);
  if (h >= 48) return `${Math.round(h / 24)}d left`;
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}
function fmtAgo(ms) {
  const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
var GAUGE_WINDOW = { "usage-session": "5h", "usage-weekly": "7day", "usage-model": "7day" };
function gaugeMode(state2, kind, now) {
  const win = GAUGE_WINDOW[kind];
  const hasLocal = !!(win && state2.usageMeter?.[win]);
  return gaugeSource({ usage: state2.usage, usageErr: state2.usageErr, usageAt: state2.usageAt, now }, hasLocal);
}
function localGauge(header2, agg, budget, view = "cost", animPhase2 = null) {
  if (!agg) return usageMeterKey(header2, "--", "no data yet", true);
  if (view === "tokens") {
    return usageMeterKey(header2, fmtNum(agg.tokens), `${fmtNum(agg.in)} in \xB7 ${fmtNum(agg.out)} out`, false);
  }
  const pct = budgetPct(agg.cost, budget);
  if (pct == null) return usageMeterKey(header2, "$" + agg.cost.toFixed(2), "est", true);
  const over = pct > 100 ? " \xB7 " + Math.round(pct) + "%" : "";
  return gaugeKey(header2, pct, `$${Math.round(agg.cost)} / $${Math.round(Number(budget))}${over}`, pct >= 90 ? animPhase2 : null);
}
function modelList(state2, mode) {
  if (mode === "local") return state2.usageMeterModels ?? [];
  return state2.usage?.models ?? [];
}
function modelListIndex(pressed, list, want) {
  if (pressed != null && list.length) return pressed % list.length;
  if (!want || !list.length) return 0;
  const w = String(want).toLowerCase();
  const byName = list.findIndex((e) => String(e.name ?? e.model).toLowerCase() === w);
  if (byName >= 0) return byName;
  const fam = familyOf(w) ?? w;
  const byFam = list.findIndex((e) => String(e.model ?? e.name).toLowerCase() === fam);
  return byFam >= 0 ? byFam : 0;
}
function sessionEta(state2, now) {
  if (gaugeMode(state2, "usage-session", now) !== "subscription") {
    const b5 = state2.usageMeter?.["5h"];
    return b5 ? "$" + b5.cost.toFixed(2) + " last 5h" : "no cap";
  }
  const h = state2.pctHistory ?? [];
  if (h.length < 2) return "measuring\u2026";
  const latest = h[h.length - 1];
  const past = h.find((s) => latest.t - s.t >= 10 * 6e4) ?? h[0];
  const dt = latest.t - past.t;
  if (dt < 4 * 6e4) return "measuring\u2026";
  const slope = (latest.pct - past.pct) / dt;
  if (slope <= 5e-8) return "steady";
  const msLeft = (100 - latest.pct) / slope;
  const resetMs = state2.usage?.fiveHour?.resetsAt ? new Date(state2.usage.fiveHour.resetsAt).getTime() - latest.t : Infinity;
  if (msLeft >= resetMs) return "resets first";
  const hh = Math.floor(msLeft / 36e5), mm = Math.round(msLeft % 36e5 / 6e4);
  return hh > 0 ? `cap in ~${hh}h ${mm}m` : `cap in ~${mm}m`;
}
function viewFor(kind, env) {
  const {
    state: state2,
    settings = {},
    now,
    animPhase: animPhase2 = null,
    usageViewMode = "cost",
    pressedModelIdx = null,
    cycleIdx = -1,
    focus = null,
    autoSlot: autoSlot2 = 0,
    authFlagged: authFlagged2 = false,
    defaultCodeDir = ""
  } = env;
  const img = (image) => ({ image });
  switch (kind) {
    case "usage-session": {
      const mode = gaugeMode(state2, "usage-session", now);
      if (mode === "local") return img(localGauge("LAST 5H", state2.usageMeter?.["5h"], settings.budget, usageViewMode, animPhase2));
      if (mode !== "subscription") return img(gaugeKey("SESSION 5H", null, mode === "throttled" ? "throttled" : mode === "error" ? "sign in?" : "no data"));
      const b = state2.usage?.fiveHour;
      return img(gaugeKey("SESSION 5H", b?.pct ?? null, b ? fmtReset(b.resetsAt) : "no data", b?.pct >= 90 ? animPhase2 : null));
    }
    case "usage-weekly": {
      const mode = gaugeMode(state2, "usage-weekly", now);
      if (mode === "local") return img(localGauge("LAST 7D", state2.usageMeter?.["7day"], settings.budget, usageViewMode, animPhase2));
      if (mode !== "subscription") return img(gaugeKey("WEEKLY", null, mode === "throttled" ? "throttled" : mode === "error" ? "sign in?" : "no data"));
      const b = state2.usage?.weekly;
      const u = state2.usage;
      const sub = u?.scopedPct != null && u.scopedName ? `${u.scopedName} ${Math.round(u.scopedPct)}%` : u?.weeklyOpus?.pct != null ? `opus ${Math.round(u.weeklyOpus.pct)}%` : b ? fmtReset(b.resetsAt) : "no data";
      return img(gaugeKey("WEEKLY", b?.pct ?? null, sub, b?.pct >= 90 ? animPhase2 : null));
    }
    case "usage-model": {
      const mmode = gaugeMode(state2, "usage-model", now);
      if (mmode !== "subscription" && mmode !== "local") {
        return img(gaugeKey("MODEL 7D", null, mmode === "throttled" ? "throttled" : mmode === "error" ? "sign in?" : "no data"));
      }
      const list = modelList(state2, mmode);
      const want = settings.model;
      const i = modelListIndex(pressedModelIdx, list, want);
      const pick = list[i];
      const head_ = ((pick?.name ?? pick?.model ?? want ?? "MODEL") + "").toUpperCase().slice(0, 8) + " 7D";
      const more = list.length > 1 ? ` ${i + 1}/${list.length}` : "";
      if (!pick) return img(usageMeterKey(head_, "--", mmode === "local" ? "no data yet" : "no data", true));
      if (mmode === "local") {
        return img(localGauge(head_ + more, pick, settings.budget, usageViewMode, animPhase2));
      }
      return img(gaugeKey(head_ + more, pick.pct ?? null, pick.resetsAt ? fmtReset(pick.resetsAt) : "no data", pick.pct >= 90 ? animPhase2 : null));
    }
    case "burn-rate":
      return img(burnKey(state2.burn?.tokensHour ?? null, sessionEta(state2, now)));
    case "project": {
      const label = settings.label || (settings.path ? path2.basename(settings.path) : "");
      return img(labelKey("PROJECT", label || "configure", settings.path ? "" : "set folder in settings"));
    }
    case "focus-session": {
      const blocked = blockedSessions(state2.sessions, now, state2.activity);
      const pool = blocked.length ? blocked : state2.sessions;
      const poolSig = pool.map((x) => x.pid).join(",");
      const s = pool.length ? focus && focus.sig === poolSig ? pool[focus.i % pool.length] : pool[0] : null;
      if (blocked.length) {
        const b = s ?? blocked[0];
        return img(labelKey("FOCUS", b.name ?? "session", String(b.waitingFor ?? "needs you"), C.warn, true));
      }
      const anyWorking = state2.sessions.some((x) => sessionState(x, now, state2.activity.get(x.sessionId) ?? null) === "working");
      return img(labelKey("FOCUS", s ? s.name : `${state2.sessions.length} sessions`, s ? sessionState(s, now, state2.activity.get(s.sessionId) ?? null) : "press to cycle", anyWorking ? C.info : null));
    }
    case "quick-prompt":
      return img(labelKey("PROMPT", settings.label || "configure", settings.prompt ? "" : "set prompt in settings"));
    case "custom":
      return img(labelKey("CLAUDE", settings.label || "custom", settings.command ? "" : "set command in settings"));
    // These four used to have no case at all, so they never called setImage and kept
    // their manifest icon forever — three flat pieces of icon art next to seventeen
    // data panels, which is what ran two visual languages on one deck. Rendering them
    // costs the ability to set a custom image on these keys from the Stream Deck app.
    case "launch":
      return img(actionKey("launch", "launch", "Desktop", "claude app"));
    case "quick-chat":
      return img(actionKey("chat", "chat", "New chat", "claude desktop"));
    case "open-web":
      return img(actionKey("web", "claude.ai", "Open", "in browser"));
    case "claude-code":
      return img(actionKey("code", "code", "Terminal", "~/" + path2.basename(defaultCodeDir)));
    case "sessions": {
      const n = state2.sessions.length;
      if (cycleIdx >= 0 && state2.sessions[cycleIdx]) {
        const s = state2.sessions[cycleIdx];
        const st = sessionState(s, now, state2.activity.get(s.sessionId) ?? null);
        const stLabel = { "needs-approval": "needs you", "input-needed": "input needed", working: "working", finished: "done", idle: "idle" }[st] ?? st;
        const stColor = st === "needs-approval" ? C.warn : st === "input-needed" ? C.ask : st === "working" ? C.info : C.dim;
        return img(linesKey(`${cycleIdx + 1}/${n}`, [
          { text: (s.name ?? "session").slice(0, 11), big: false, color: C.text },
          { text: stLabel, color: stColor },
          { text: fmtAgo(now - (s.startedAt ?? now)) + " old", color: C.dim }
        ]));
      }
      const blocked = blockedSessions(state2.sessions, now, state2.activity).length;
      const busy = state2.sessions.filter((s) => sessionState(s, now, state2.activity.get(s.sessionId) ?? null) === "working").length;
      const sub = blocked > 0 ? `${blocked} needs you` : busy > 0 ? `${busy} working` : n > 0 ? "all idle" : "none running";
      const subCol = blocked > 0 ? C.warn : busy > 0 ? C.info : C.dim;
      return img(bigCountKey("CLAUDE CODE", n, sub, subCol, busy > 0 ? animPhase2 : null, blocked > 0 ? C.warn : busy > 0 ? C.info : null, blocked > 0));
    }
    case "today": {
      const t = state2.today;
      return img(linesKey("TODAY", [
        { text: `${t?.chats ?? "--"} chats`, color: C.text },
        { text: `${fmtNum(t?.msgs)} msgs`, color: C.text },
        { text: `${fmtNum(t?.tokens)} tok`, color: C.text }
      ]));
    }
    case "usage-meter": {
      const win = settings.window ?? "today";
      const header2 = { today: "TODAY", month: "THIS MONTH", "7day": "7-DAY" }[win] ?? "TODAY";
      const agg = state2.usageMeter?.[win];
      const suffix = settings.label ? " \xB7 " + settings.label : "";
      if (!agg) return img(usageMeterKey(header2, "--", "no data", usageViewMode === "cost"));
      if (usageViewMode === "cost") return img(usageMeterKey(header2, "$" + agg.cost.toFixed(2), "cost" + suffix, true));
      return img(usageMeterKey(header2, fmtNum(agg.tokens), agg.in != null ? `${fmtNum(agg.in)} in \xB7 ${fmtNum(agg.out)} out` : "tokens" + suffix, false));
    }
    case "approver-status": {
      const resolved = resolveStatusKey(state2.sessions, settings.project ?? "", autoSlot2, now, state2.activity);
      const cycling = !!settings.cycle && cycleIdx >= 0;
      const entry = statusEntry(resolved, cycling ? cycleIdx : null);
      const explicit = !!(settings.project && settings.project.trim());
      const name = settings.label || entry.name || (settings.project ?? "");
      let detail = "";
      if (cycling && resolved.count > 1) {
        const parent = entry.cwd ? path2.basename(path2.dirname(entry.cwd)) : "";
        detail = `${cycleIdx + 1}/${resolved.count}${parent ? " \xB7 " + parent : ""}`;
      } else if (entry.waitingFor) {
        const waited = entry.waitingSince ? fmtShort(now - entry.waitingSince) : "";
        detail = shortWait(entry.waitingFor) + (waited ? " \xB7 " + waited : "");
      } else if (entry.state === "finished") {
        detail = "just now";
      } else if (entry.state === "idle" && entry.statusAge != null) {
        detail = fmtAgo(entry.statusAge) + " idle";
      }
      const blockedNow = entry.state === "needs-approval" || entry.state === "input-needed";
      const fresh = blockedNow && (!entry.waitingSince || now - entry.waitingSince < PULSE_MS);
      return img(statusKey(name, entry.state, explicit ? resolved.count : 1, detail, entry.where, fresh ? animPhase2 : null));
    }
    case "approver-waiting": {
      const blocked = blockedSessions(state2.sessions, now, state2.activity);
      if (!blocked.length) {
        const n = state2.sessions.length;
        return img(statusKey("WAITING", "quiet", 1, n ? `${n} session${n > 1 ? "s" : ""} ok` : "no sessions"));
      }
      const i = cycleIdx >= 0 ? cycleIdx % blocked.length : 0;
      const b = blocked[i];
      const st = sessionState(b, now, state2.activity.get(b.sessionId) ?? null);
      const since = b.status === "waiting" && b.statusUpdatedAt ? b.statusUpdatedAt : null;
      const waited = since ? fmtShort(now - since) : "";
      const why = shortWait(b.waitingFor ?? "") || "needs you";
      const fresh = !since || now - since < PULSE_MS;
      return img(statusKey(path2.basename(b.cwd ?? "") || "claude", st, blocked.length, why + (waited ? " \xB7 " + waited : ""), sessionWhere(b), fresh ? animPhase2 : null));
    }
    case "approve-allow":
    case "approve-always":
    case "approve-deny": {
      const req = head(state2.approveQueue);
      const fresh = req && now - req.receivedAt < PULSE_MS;
      const err = state2.hookErr ?? (!state2.approveQueue.length && authFlagged2 ? "auth?" : null);
      return {
        image: approveKey(kind, req, {
          sessionOnly: !!settings.sessionOnly,
          label: settings.label,
          err,
          depth: state2.approveQueue.length,
          phase: fresh ? animPhase2 : null,
          denied: kind === "approve-always" && req ? denyBlock(state2.denies, req, now) : null
        }),
        // What this key is PAINTING. The press guard compares against it, so a press
        // can never answer a request the user did not see. Returned rather than
        // written here so this stays a pure function; the caller records it.
        painted: {
          reqId: req?.id ?? null,
          rule: kind === "approve-always" && req ? alwaysRule(req, !!settings.sessionOnly) : null
        }
      };
    }
  }
  return {};
}

// src/plugin.js
var IS_MAC = process.platform === "darwin";
var PLUGIN_DIR = path3.dirname(path3.dirname(fileURLToPath(import.meta.url)));
var CLAUDE_DIR = path3.join(os.homedir(), ".claude");
var CREDS_FILE = path3.join(CLAUDE_DIR, ".credentials.json");
var SESSIONS_DIR = path3.join(CLAUDE_DIR, "sessions");
var PROJECTS_DIR = path3.join(CLAUDE_DIR, "projects");
var USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
var githubDir = path3.join(os.homedir(), "Documents", "GitHub");
var DEFAULT_CODE_DIR = fs.existsSync(githubDir) ? githubDir : os.homedir();
var desktopAppId = "shell:AppsFolder\\Claude_pzs8sxrjxfjjc!Claude";
if (!IS_MAC) {
  execFile(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Get-StartApps | Where-Object {$_.Name -eq 'Claude'} | Select-Object -First 1 -ExpandProperty AppID"
    ],
    (err, out) => {
      const id = out?.trim();
      if (!err && id) desktopAppId = "shell:AppsFolder\\" + id;
    }
  );
}
var LOG_FILE = path3.join(process.cwd(), "claude-deck.log");
var LOG_OLD_FILE = LOG_FILE + ".old";
var LOG_MAX_BYTES = 1e6;
var logBytes = 0;
try {
  logBytes = fs.statSync(LOG_FILE).size;
} catch {
}
function log(...args) {
  const line2 = `${(/* @__PURE__ */ new Date()).toISOString()} ${args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}`;
  console.log(line2);
  const bytes = Buffer.byteLength(line2) + 1;
  try {
    if (logBytes + bytes > LOG_MAX_BYTES) {
      try {
        fs.renameSync(LOG_FILE, LOG_OLD_FILE);
      } catch {
      }
      logBytes = 0;
    }
    fs.appendFileSync(LOG_FILE, line2 + "\n");
    logBytes += bytes;
  } catch {
  }
}
var state = {
  activity: /* @__PURE__ */ new Map(),
  // sessionId -> transcript mtimeMs (status-less sessions only)
  usage: null,
  // { fiveHour, weekly, weeklyOpus } each { pct, resetsAt }
  usageErr: null,
  usageMeter: null,
  // { [window]: {tokens, cost, in, out} } from pollUsageMeter
  usageMeterModels: null,
  // [{model,tokens,cost}] over 7d, for the model key in local mode
  usageAt: 0,
  sessions: [],
  today: null,
  burn: null,
  pctHistory: [],
  loggedRaw: false,
  rates: {},
  approveQueue: [],
  denies: [],
  // {rule, at} for ~30s after a DENY, so the retry cannot be ALWAYS'd
  hookSecret: null,
  hookPort: PORT_DEFAULT,
  hookErr: null,
  lastHeadChangeAt: 0,
  globalSettings: {},
  pluginUUID: null
};
function pickBucket(o) {
  if (!o || typeof o !== "object") return null;
  let pct = null;
  if (typeof o.utilization === "number") pct = o.utilization;
  const resetsAt = o.resets_at ?? o.resetsAt ?? null;
  return pct == null && !resetsAt ? null : { pct, resetsAt };
}
var USAGE_DELAY_BASE = 12e4;
var usageDelay = USAGE_DELAY_BASE;
var lastUsageAttempt = 0;
var CACHE_FILE = path3.join(PLUGIN_DIR, "usage-cache.json");
try {
  const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  if (Date.now() - c.at < 30 * 6e4) {
    state.usage = c.usage;
    state.usageAt = c.at;
  }
} catch {
}
async function pollUsage() {
  lastUsageAttempt = Date.now();
  try {
    const token = await platform.readToken();
    if (!token) throw new Error("no OAuth token in credentials file");
    const res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Content-Type": "application/json"
      }
    });
    if (res.status === 429) {
      usageDelay = Math.min(usageDelay * 2, 9e5);
      throw new Error(`usage endpoint HTTP 429 (backing off to ${usageDelay / 1e3}s)`);
    }
    if (!res.ok) throw new Error(`usage endpoint HTTP ${res.status}`);
    usageDelay = USAGE_DELAY_BASE;
    const j = await res.json();
    if (!state.loggedRaw) {
      state.loggedRaw = true;
      log("usage raw shape:", JSON.stringify(j).slice(0, 1200));
    }
    const limits = Array.isArray(j.limits) ? j.limits : [];
    const fromLimit = (kind) => {
      const l = limits.find((x) => x.kind === kind);
      return l ? { pct: l.percent, resetsAt: l.resets_at } : null;
    };
    const scoped = limits.find((x) => x.kind === "weekly_scoped");
    const models = [];
    for (const l of limits) {
      if (l.kind !== "weekly_scoped") continue;
      const name = l.scope?.model?.display_name;
      if (name && typeof l.percent === "number") models.push({ name, pct: l.percent, resetsAt: l.resets_at ?? null });
    }
    for (const [key, name] of [["seven_day_opus", "Opus"], ["seven_day_sonnet", "Sonnet"]]) {
      const b = pickBucket(j[key]);
      if (b?.pct != null && !models.some((m) => m.name === name)) models.push({ name, pct: b.pct, resetsAt: b.resetsAt });
    }
    state.usage = {
      fiveHour: pickBucket(j.five_hour) ?? fromLimit("session"),
      weekly: pickBucket(j.seven_day) ?? fromLimit("weekly_all"),
      weeklyOpus: pickBucket(j.seven_day_opus),
      scopedPct: scoped?.percent ?? null,
      scopedName: scoped?.scope?.model?.display_name ?? null,
      models
    };
    state.usageErr = null;
    state.usageAt = Date.now();
    const fp5 = state.usage.fiveHour?.pct;
    if (typeof fp5 === "number") {
      state.pctHistory.push({ t: state.usageAt, pct: fp5 });
      state.pctHistory = state.pctHistory.filter((h) => state.usageAt - h.t < 36e5);
    }
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ usage: state.usage, at: state.usageAt }));
    } catch {
    }
    scheduleResetPoll();
  } catch (e) {
    state.usageErr = String(e.message ?? e);
    log("usage poll failed:", state.usageErr);
    pollUsageMeter();
  }
  renderAll(["usage-session", "usage-weekly", "usage-model", "burn-rate"]);
}
var resetTimer = null;
function scheduleResetPoll() {
  const deltas = [state.usage?.fiveHour?.resetsAt, state.usage?.weekly?.resetsAt].filter(Boolean).map((iso) => new Date(iso).getTime() - Date.now()).filter((d) => d > 0 && d < 6 * 36e5);
  if (!deltas.length) return;
  clearTimeout(resetTimer);
  resetTimer = setTimeout(pollUsage, Math.min(...deltas) + 8e3);
}
var transcriptDirFor = /* @__PURE__ */ new Map();
async function transcriptMtime(s) {
  if (!s?.sessionId) return null;
  const file = `${s.sessionId}.jsonl`;
  const known = transcriptDirFor.get(s.sessionId);
  const tryPath = async (p) => {
    try {
      return (await fsp.stat(p)).mtimeMs;
    } catch {
      return null;
    }
  };
  if (known) {
    const mt = await tryPath(path3.join(known, file));
    if (mt != null) return mt;
    transcriptDirFor.delete(s.sessionId);
  }
  const hint = transcriptPathFor(PROJECTS_DIR, s);
  if (hint) {
    const mt = await tryPath(hint);
    if (mt != null) {
      transcriptDirFor.set(s.sessionId, path3.dirname(hint));
      return mt;
    }
  }
  let dirs;
  try {
    dirs = await fsp.readdir(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dir = path3.join(PROJECTS_DIR, d.name);
    const mt = await tryPath(path3.join(dir, file));
    if (mt != null) {
      transcriptDirFor.set(s.sessionId, dir);
      return mt;
    }
  }
  return null;
}
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
var pidVerdict = /* @__PURE__ */ new Map();
var verdictKey = (s) => `${s.pid}:${s.startedAt ?? 0}`;
async function dropRecycledPids(sessions) {
  const unknown = sessions.filter((s) => !pidVerdict.has(verdictKey(s)));
  if (unknown.length) {
    let starts = null;
    try {
      starts = parseProcStarts(await platform.listProcStarts(), Date.now());
    } catch (e) {
      log("sessions: process-start listing failed, keeping all sessions:", String(e?.message ?? e));
    }
    if (starts) {
      for (const s of unknown) {
        const recycled = pidLooksRecycled(s, starts.get(s.pid) ?? null);
        pidVerdict.set(verdictKey(s), !recycled);
        if (recycled) {
          log(`sessions: ignoring ${path3.basename(s.cwd ?? "")} \u2014 pid ${s.pid} belongs to a process younger than the session (stale session file)`);
        }
      }
    }
  }
  const live = new Set(sessions.map(verdictKey));
  for (const k of pidVerdict.keys()) if (!live.has(k)) pidVerdict.delete(k);
  return sessions.filter((s) => pidVerdict.get(verdictKey(s)) !== false);
}
async function pollSessions() {
  try {
    const files = await fsp.readdir(SESSIONS_DIR).catch(() => []);
    let out = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const s = JSON.parse(await fsp.readFile(path3.join(SESSIONS_DIR, f), "utf8"));
        if (s.pid && pidAlive(s.pid)) out.push(s);
      } catch {
      }
    }
    out = await dropRecycledPids(out);
    out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    for (const s of out) {
      if (s.status) continue;
      const mt = await transcriptMtime(s);
      if (mt != null) state.activity.set(s.sessionId, mt);
    }
    for (const id of [...state.activity.keys()]) {
      if (!out.some((s) => s.sessionId === id)) state.activity.delete(id);
    }
    if (state.approveQueue.length) {
      const now = Date.now();
      const gone = /* @__PURE__ */ new Set([
        ...staleIds(state.approveQueue, out, state.activity, now),
        ...expiredIds(state.approveQueue, now, HOLD_MS())
      ]);
      state.approveQueue = seedBaselines(state.approveQueue, out, state.activity);
      if (gone.size) answerAndDrop([...gone], "session moved on or hold expired");
      const kept = pruneDenies(state.denies, now);
      if (kept.length !== state.denies.length) {
        state.denies = kept;
        if (!gone.size) renderApproveAll();
      }
    }
    const nextSig = sessionSig(out, Date.now(), state.activity);
    const changed = nextSig !== lastSessionSig;
    lastSessionSig = nextSig;
    state.sessions = out;
    if (changed) renderAll(["sessions", "focus-session", "approver-status", "approver-waiting"]);
  } catch (e) {
    log("sessions poll failed:", String(e));
  }
}
var APPROVE_KINDS = ["approve-allow", "approve-always", "approve-deny"];
var HOLD_MS = () => (Number(state.globalSettings.hookHoldS) || HOLD_S_DEFAULT) * 1e3;
var TIMEOUT_PAD_S = 3;
var approveSeq = 0;
var hookServer = null;
var renderApproveAll = () => renderAll(APPROVE_KINDS);
var hasApproveKey = () => [...views.values()].some((v) => APPROVE_KINDS.includes(v.kind));
function authFlagged() {
  const hits = hookServer?.stats.badPathHits;
  if (!hits || hits.length < BADPATH_MIN_HITS) return false;
  const now = Date.now();
  return hits.filter((t) => now - t < BADPATH_WINDOW_MS).length >= BADPATH_MIN_HITS;
}
function noteHeadChange(prevId) {
  const now = head(state.approveQueue)?.id ?? null;
  if (now !== prevId) state.lastHeadChangeAt = Date.now();
}
function answerAndDrop(ids, why) {
  if (!ids.length) return;
  const prev = head(state.approveQueue)?.id ?? null;
  for (const id of ids) {
    const { queue, req } = resolve(state.approveQueue, id);
    state.approveQueue = queue;
    if (req) {
      req.ticket.respond(null);
      log(`approve: dropped ${req.toolName} (${why})`);
    }
  }
  noteHeadChange(prev);
  renderApproveAll();
}
function onHookRequest(payload, ticket) {
  const toolName = String(payload?.tool_name ?? "");
  log(`approve: ${toolName} from ${path3.basename(String(payload?.cwd ?? ""))}`);
  if (payload?.hook_event_name !== "PermissionRequest" || !toolName) return void ticket.respond(null);
  if (!hasApproveKey()) return void ticket.respond(null);
  const req = {
    id: ++approveSeq,
    receivedAt: Date.now(),
    sessionId: payload.session_id ?? null,
    cwd: payload.cwd ?? "",
    toolName,
    toolInput: payload.tool_input ?? null,
    suggestions: payload.permission_suggestions ?? [],
    // Baselines are seeded by the first pollSessions tick that OBSERVES this request,
    // never here: state.sessions is up to 5s stale and would predate the status flip
    // that caused this very prompt, making the request look stale forever.
    statusSnapshot: null,
    activitySnapshot: null,
    baselined: false,
    ticket
  };
  ticket.id = req.id;
  const prev = head(state.approveQueue)?.id ?? null;
  const { queue, evicted } = enqueue(state.approveQueue, req);
  state.approveQueue = queue;
  if (evicted) {
    evicted.ticket.respond(null);
    log(`approve: evicted ${evicted.toolName} (queue full at ${QUEUE_MAX})`);
  }
  noteHeadChange(prev);
  renderApproveAll();
}
var onHookDrop = (ticket) => {
  if (ticket.id == null) return;
  const prev = head(state.approveQueue)?.id ?? null;
  const { queue, req } = resolve(state.approveQueue, ticket.id);
  if (!req) return;
  state.approveQueue = queue;
  log(`approve: socket closed for ${req.toolName}`);
  noteHeadChange(prev);
  renderApproveAll();
};
var ensuring = null;
var ensureAgain = false;
function ensureHookServer() {
  if (ensuring) {
    ensureAgain = true;
    return ensuring;
  }
  ensuring = ensureHookServerOnce().finally(() => {
    ensuring = null;
    if (ensureAgain) {
      ensureAgain = false;
      ensureHookServer();
    }
  });
  return ensuring;
}
async function ensureHookServerOnce() {
  const gs = state.globalSettings;
  let secret = typeof gs.hookSecret === "string" && gs.hookSecret.length >= 32 ? gs.hookSecret : state.hookSecret;
  const port = Number(gs.hookPort) > 0 ? Number(gs.hookPort) : PORT_DEFAULT;
  if (!secret) {
    secret = randomBytes(24).toString("base64url");
    state.globalSettings = { ...gs, hookSecret: secret, hookPort: port };
    send({ event: "setGlobalSettings", context: state.pluginUUID, payload: state.globalSettings });
    log("approve: generated a new hook secret");
  } else if (gs.hookSecret !== secret) {
    state.globalSettings = { ...gs, hookSecret: secret, hookPort: port };
    send({ event: "setGlobalSettings", context: state.pluginUUID, payload: state.globalSettings });
    log("approve: re-asserted the hook secret after a foreign global-settings write");
  }
  state.hookSecret = secret;
  if (hookServer && hookServer.boundPort === port && hookServer.secret === secret) {
    if (state.hookErr) {
      state.hookErr = null;
      renderApproveAll();
    }
    return;
  }
  const previous = hookServer;
  try {
    const next = await startHookServer({
      port,
      secret,
      onRequest: onHookRequest,
      onDrop: onHookDrop,
      log
    });
    if (previous && state.approveQueue.length) {
      answerAndDrop(state.approveQueue.map((r) => r.id), "hook server rebinding");
    }
    hookServer = next;
    state.hookPort = next.boundPort;
    state.hookErr = null;
    if (previous) await previous.close();
  } catch (e) {
    state.hookErr = e.code === "EADDRINUSE" ? "port busy" : String(e.message ?? e);
    log("approve: hook server failed:", state.hookErr);
  }
  renderApproveAll();
}
function installSnippet() {
  const url = `http://127.0.0.1:${state.hookPort}/permission/${state.hookSecret ?? "<secret>"}`;
  return hookFragment(url, HOLD_MS() / 1e3 + TIMEOUT_PAD_S);
}
async function walkTranscripts(dir, cutoffMs) {
  const out = [];
  async function rec(d) {
    let entries;
    try {
      entries = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path3.join(d, e.name);
      if (e.isDirectory()) {
        await rec(p);
        continue;
      }
      if (!e.name.endsWith(".jsonl")) continue;
      let st;
      try {
        st = await fsp.stat(p);
      } catch {
        continue;
      }
      if (st.mtimeMs < cutoffMs) continue;
      out.push({ path: p, size: st.size, mtimeMs: st.mtimeMs });
    }
  }
  await rec(dir);
  return out;
}
var SCAN_TTL_MS = 5e3;
var transcriptScan = { at: 0, cutoff: Infinity, files: [] };
async function scanTranscripts(cutoffMs) {
  const now = Date.now();
  const fresh = now - transcriptScan.at < SCAN_TTL_MS;
  if (fresh && transcriptScan.cutoff <= cutoffMs) {
    return transcriptScan.files.filter((f) => f.mtimeMs >= cutoffMs);
  }
  const cutoff = fresh ? Math.min(transcriptScan.cutoff, cutoffMs) : cutoffMs;
  const files = await walkTranscripts(PROJECTS_DIR, cutoff);
  transcriptScan = { at: now, cutoff, files };
  return files.filter((f) => f.mtimeMs >= cutoffMs);
}
var todayTracker = /* @__PURE__ */ new Map();
async function pollToday() {
  try {
    const day = localDay(Date.now());
    const dayStart = /* @__PURE__ */ new Date();
    dayStart.setHours(0, 0, 0, 0);
    let msgs = 0, tokens = 0;
    const chats = /* @__PURE__ */ new Set();
    const files = await scanTranscripts(dayStart.getTime());
    const seen = /* @__PURE__ */ new Set();
    for (const st of files) {
      const fp = st.path;
      seen.add(fp);
      if (!fp.split(path3.sep).includes("subagents")) chats.add(fp);
      let rec = todayTracker.get(fp);
      if (!rec || rec.counts.day !== day || st.size < rec.offset) {
        rec = { offset: 0, rest: "", counts: newDayCounts(day) };
      }
      if (st.size > rec.offset) {
        try {
          const fh = await fsp.open(fp, "r");
          try {
            const len = st.size - rec.offset;
            const buf = Buffer.alloc(len);
            await fh.read(buf, 0, len, rec.offset);
            rec.offset = st.size;
            const chunk = rec.rest + buf.toString("utf8");
            const cut2 = chunk.lastIndexOf("\n");
            rec.rest = cut2 < 0 ? chunk : chunk.slice(cut2 + 1);
            foldDayChunk(rec.counts, cut2 < 0 ? "" : chunk.slice(0, cut2));
          } finally {
            await fh.close();
          }
        } catch {
          continue;
        }
      }
      todayTracker.set(fp, rec);
      const t = dayCountsTotals(rec.counts);
      msgs += t.msgs;
      tokens += t.tokens;
    }
    for (const fp of todayTracker.keys()) if (!seen.has(fp)) todayTracker.delete(fp);
    state.today = { chats: chats.size, msgs, tokens };
    renderAll(["today"]);
  } catch (e) {
    log("today poll failed:", String(e));
  }
}
var hourTracker = /* @__PURE__ */ new Map();
async function pollBurn() {
  try {
    const now = Date.now();
    const scanCutoff = now - 90 * 6e4;
    const files = await scanTranscripts(scanCutoff);
    const seen = /* @__PURE__ */ new Set();
    for (const st of files) {
      const fp = st.path;
      seen.add(fp);
      let rec = hourTracker.get(fp);
      if (!rec || st.size < rec.offset || !rec.seen) rec = { offset: 0, rest: "", events: [], seen: /* @__PURE__ */ new Map() };
      if (st.size > rec.offset) {
        const fh = await fsp.open(fp, "r");
        try {
          const len = st.size - rec.offset;
          const buf = Buffer.alloc(len);
          await fh.read(buf, 0, len, rec.offset);
          rec.offset = st.size;
          const lines = (rec.rest + buf.toString("utf8")).split("\n");
          rec.rest = lines.pop() ?? "";
          for (const line2 of lines) {
            if (!line2) continue;
            let j;
            try {
              j = JSON.parse(line2);
            } catch {
              continue;
            }
            const u = j.message?.usage;
            if (!u || !j.timestamp) continue;
            const tok = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
            if (!tok) continue;
            const mid = j.message?.id ?? j.requestId;
            const ev = mid && rec.seen.get(mid);
            if (ev) {
              ev.tok = Math.max(ev.tok, tok);
              continue;
            }
            const e = { t: new Date(j.timestamp).getTime(), tok };
            if (mid) rec.seen.set(mid, e);
            rec.events.push(e);
          }
        } finally {
          await fh.close();
        }
      }
      rec.events = rec.events.filter((e) => now - e.t < 65 * 6e4);
      for (const [mid, ev] of rec.seen) if (now - ev.t >= 65 * 6e4) rec.seen.delete(mid);
      hourTracker.set(fp, rec);
    }
    for (const fp of hourTracker.keys()) if (!seen.has(fp)) hourTracker.delete(fp);
    let tokensHour = 0;
    for (const rec of hourTracker.values()) for (const e of rec.events) if (now - e.t < 36e5) tokensHour += e.tok;
    state.burn = { tokensHour, at: now };
    renderAll(["burn-rate"]);
  } catch (e) {
    log("burn poll failed:", String(e));
  }
}
var usageFileCache = /* @__PURE__ */ new Map();
async function pollUsageMeter(forceWins) {
  const wins = /* @__PURE__ */ new Set();
  if (forceWins) for (const w of forceWins) wins.add(w);
  else for (const v of views.values()) {
    if (v.kind === "usage-meter") wins.add(v.settings?.window ?? "today");
    else if (GAUGE_WINDOW[v.kind] && gaugeMode(state, v.kind, Date.now()) === "local") wins.add(GAUGE_WINDOW[v.kind]);
    else if (v.kind === "burn-rate" && gaugeMode(state, "usage-session", Date.now()) === "local") wins.add("5h");
  }
  if (!wins.size) return;
  const now = Date.now();
  const cutoff = Math.min(...[...wins].map((w) => windowStartMs(w, now)));
  try {
    const files = await scanTranscripts(cutoff);
    const seen = /* @__PURE__ */ new Set();
    const lists = [];
    for (const { path: fp, size, mtimeMs } of files) {
      seen.add(fp);
      const c = usageFileCache.get(fp);
      if (c && c.size === size && c.mtimeMs === mtimeMs) {
        lists.push(c.requests);
        continue;
      }
      let text;
      try {
        text = await fsp.readFile(fp, "utf8");
      } catch {
        continue;
      }
      const requests = parseRequests(text);
      usageFileCache.set(fp, { size, mtimeMs, requests });
      lists.push(requests);
    }
    for (const fp of usageFileCache.keys()) if (!seen.has(fp)) usageFileCache.delete(fp);
    const merged = mergeById(lists);
    const out = {};
    for (const w of wins) out[w] = aggregate(merged, windowStartMs(w, now), state.rates);
    state.usageMeter = out;
    if (wins.has("7day")) state.usageMeterModels = aggregateByModel(merged, windowStartMs("7day", now), state.rates);
    renderAll(["usage-meter", "usage-session", "usage-weekly", "usage-model", "burn-rate"]);
  } catch (e) {
    log("usage-meter poll failed:", String(e));
  }
}
function argOf(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : void 0;
}
var views = /* @__PURE__ */ new Map();
var cycle = /* @__PURE__ */ new Map();
var focusIdx = /* @__PURE__ */ new Map();
var usageView = /* @__PURE__ */ new Map();
var modelIdx = /* @__PURE__ */ new Map();
var shownReq = /* @__PURE__ */ new Map();
var shownRule = /* @__PURE__ */ new Map();
var ws = null;
var animPhase = 0;
var lastSessionSig = "";
function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
var setImage = (context, image) => send({ event: "setImage", context, payload: { image, target: 0 } });
var setTitle = (context) => send({ event: "setTitle", context, payload: { title: "", target: 0 } });
var showAlert = (context) => send({ event: "showAlert", context });
var kindOf = (action) => action.replace("dev.tapparello.claude-deck.", "");
function render(context, kind) {
  const v = views.get(context);
  const cy = cycle.get(context);
  const { image, painted } = viewFor(kind, {
    state,
    settings: v?.settings ?? {},
    now: Date.now(),
    animPhase,
    usageViewMode: usageView.get(context) ?? "cost",
    pressedModelIdx: modelIdx.get(context) ?? null,
    cycleIdx: cy && cy.idx >= 0 ? cy.idx : -1,
    focus: focusIdx.get(context) ?? null,
    autoSlot: kind === "approver-status" ? autoSlotFor(context) : 0,
    authFlagged: authFlagged(),
    defaultCodeDir: DEFAULT_CODE_DIR
  });
  if (painted) {
    shownReq.set(context, painted.reqId);
    shownRule.set(context, painted.rule);
  }
  if (image != null) setImage(context, image);
}
function renderAll(kinds) {
  for (const [context, v] of views) if (kinds.includes(v.kind)) render(context, v.kind);
}
function autoSlotFor(context) {
  const keys = [...views.entries()].filter(([, v]) => v.kind === "approver-status" && !(v.settings?.project && v.settings.project.trim())).map(([ctx, v]) => ({ context: ctx, device: v.device, row: v.row, col: v.col }));
  return autoSlot(keys, context);
}
function sessionByPid(pid) {
  return state.sessions.find((s) => s.pid === pid) ?? null;
}
var OSA_TIMEOUT_MS = 8e3;
function spawnDetached(cmd, args) {
  return new Promise((resolve2, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve2();
    });
  });
}
function openMac(args) {
  return new Promise((resolve2, reject) => {
    execFile("open", args, (err) => err ? reject(err) : resolve2());
  });
}
function runOsa(lines) {
  return new Promise((resolve2, reject) => {
    const args = [];
    for (const l of lines) {
      args.push("-e", l);
    }
    execFile("osascript", args, { timeout: OSA_TIMEOUT_MS }, (err) => err ? reject(err) : resolve2());
  });
}
function pbcopy(text) {
  return new Promise((resolve2, reject) => {
    const child = spawn("pbcopy");
    child.once("error", reject);
    child.stdin.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve2() : reject(new Error("pbcopy exit " + code)));
    child.stdin.end(String(text ?? ""));
  });
}
function focusTarget(s) {
  const name = String(s.name ?? "").replace(/["'‘’“”]/g, "").slice(0, 40);
  return (name || path3.basename(s.cwd ?? "")).toLowerCase();
}
var winPlatform = {
  launchDesktop() {
    return spawnDetached("explorer.exe", [desktopAppId]);
  },
  openUrl(url) {
    return spawnDetached("cmd.exe", ["/c", "start", "", url]);
  },
  runCustom(command) {
    return spawnDetached("cmd.exe", ["/c", "start", "", command]);
  },
  // Global quick-chat hotkey Ctrl+Alt+Space via keybd_event (verbatim from the
  // original quickChat). The `hotkey` arg is ignored on Windows.
  fireHotkey(_hotkey) {
    const ps = `
Add-Type -Namespace K -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);';
[K.W]::keybd_event(0x11,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x12,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x20,0,0,[UIntPtr]::Zero);
Start-Sleep -Milliseconds 60;
[K.W]::keybd_event(0x20,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x12,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x11,0,2,[UIntPtr]::Zero);`;
    return spawnDetached("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps]);
  },
  // Set-Clipboard + keybd_event chord + Ctrl+V + optional Enter (verbatim from
  // the original sendPrompt). `hotkey` ignored on Windows.
  pasteInto(_hotkey, text, enter) {
    const ps = `
Set-Clipboard -Value '${String(text).replace(/'/g, "''")}';
Add-Type -Namespace K -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);';
function P([byte]$k){[K.W]::keybd_event($k,0,0,[UIntPtr]::Zero)}; function R([byte]$k){[K.W]::keybd_event($k,0,2,[UIntPtr]::Zero)};
P 0x11; P 0x12; P 0x20; Start-Sleep -Milliseconds 60; R 0x20; R 0x12; R 0x11;
Start-Sleep -Milliseconds 800;
P 0x11; P 0x56; Start-Sleep -Milliseconds 60; R 0x56; R 0x11;
${enter ? "Start-Sleep -Milliseconds 200; P 0x0D; R 0x0D;" : ""}`;
    return spawnDetached("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps]);
  },
  // Bring the session's terminal window to front by title substring (verbatim
  // EnumWindows/SetForegroundWindow). execFile gives a real exit code.
  focusWindow(s) {
    const target = focusTarget(s);
    if (!target) return Promise.reject(new Error("no focus target"));
    const ps = `
$target = '${target.replace(/'/g, "''")}';
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; using System.Text; public class W { public delegate bool EP(IntPtr h, IntPtr l); [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb, IntPtr l); [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); }';
$found = [IntPtr]::Zero;
[void][W]::EnumWindows({ param($h, $l) $sb = New-Object System.Text.StringBuilder 512; [void][W]::GetWindowText($h, $sb, 512); if ([W]::IsWindowVisible($h) -and $sb.ToString().ToLower().Contains($target)) { $script:found = $h; return $false }; return $true }, [IntPtr]::Zero);
if ($found -eq [IntPtr]::Zero) { exit 1 };
[void][W]::ShowWindow($found, 9); [void][W]::SetForegroundWindow($found); exit 0`;
    return new Promise((resolve2, reject) => {
      execFile("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], (err) => err ? reject(err) : resolve2());
    });
  },
  // Windows Terminal (new foreground window) with a PowerShell fallback. The
  // whole fallback chain stays internal and settles the Promise once (spec §5.8).
  openTerminal(dir) {
    return new Promise((resolve2, reject) => {
      const psFallback = () => {
        const fb = spawn("cmd.exe", ["/c", "start", "", "powershell", "-NoExit", "-Command", `cd '${dir}'; claude`], { detached: true, stdio: "ignore" });
        fb.once("error", reject);
        fb.once("spawn", () => {
          fb.unref();
          resolve2();
        });
      };
      const wt = spawn("cmd.exe", ["/c", "start", "", "wt", "-w", "new", "-d", dir, "powershell", "-NoExit", "-Command", "claude"], { detached: true, stdio: "ignore" });
      wt.once("error", psFallback);
      wt.once("exit", (code) => {
        if (code === 0) resolve2();
        else psFallback();
      });
      wt.unref();
    });
  },
  // "<pid> <elapsed-seconds>" per line, for the recycled-pid check. Shaped to
  // match macOS `ps -axo pid=,etimes=` so one parser serves both platforms.
  // StartTime throws on some protected system processes — skip those rather than
  // failing the whole listing, since a pid we cannot read is simply left
  // unverified (and therefore kept).
  listProcStarts() {
    const ps = 'Get-Process | ForEach-Object { try { "$($_.Id) $([int]((Get-Date) - $_.StartTime).TotalSeconds)" } catch {} }';
    return new Promise((resolve2, reject) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-Command", ps],
        { timeout: OSA_TIMEOUT_MS, maxBuffer: 4 << 20 },
        (err, out) => err ? reject(err) : resolve2(String(out))
      );
    });
  },
  // OAuth token from the credentials file (Windows/Linux location).
  async readToken() {
    try {
      const raw = await fsp.readFile(CREDS_FILE, "utf8");
      return parseKeychainToken(raw);
    } catch {
      return null;
    }
  }
};
var macPlatform = {
  launchDesktop() {
    return openMac(["-b", "com.anthropic.claudefordesktop"]).catch(() => openMac(["-a", "Claude"]));
  },
  openUrl(url) {
    return openMac([url]);
  },
  runCustom(command) {
    const c = classifyCustomCommand(command, { home: os.homedir(), exists: fs.existsSync });
    if (!c) return Promise.reject(new Error("empty command"));
    return c.mode === "open" ? openMac([c.arg]) : openMac(["-a", c.arg]);
  },
  openTerminal(dir) {
    const d = escapeAppleScript(dir);
    return runOsa([
      "with timeout of 7 seconds",
      'tell application "Terminal"',
      `do script "cd " & quoted form of "${d}" & " && claude"`,
      "activate",
      "end tell",
      "end timeout"
    ]);
  },
  fireHotkey(hotkey) {
    const clause = hotkeyClause(parseHotkey(hotkey));
    if (!clause) return Promise.reject(new Error("no hotkey configured"));
    return runOsa([
      "with timeout of 7 seconds",
      `tell application "System Events" to ${clause}`,
      "end timeout"
    ]);
  },
  pasteInto(hotkey, text, enter) {
    const clause = hotkeyClause(parseHotkey(hotkey));
    if (!clause) return Promise.reject(new Error("no hotkey configured"));
    const lines = [
      "with timeout of 7 seconds",
      'tell application "System Events"',
      `  ${clause}`,
      "  delay 0.8",
      '  keystroke "v" using {command down}'
    ];
    if (enter) {
      lines.push("  delay 0.2", "  key code 36");
    }
    lines.push("end tell", "end timeout");
    return pbcopy(text).then(() => runOsa(lines));
  },
  // Bring the exact window hosting this session to the front. The GUI app is
  // resolved from the session PID's ancestry; then, best-effort per app:
  //   Terminal -> raise the window whose tab tty matches the session tty
  //   VS Code  -> raise the window whose title contains the session's folder
  //   otherwise -> just activate the app.
  // Falls back to activating the app if the window match/permission fails, so
  // it degrades to "app to front" rather than nothing. Terminal needs
  // Automation->Terminal; VS Code needs Accessibility.
  focusWindow(s) {
    const pid = s?.pid;
    if (!pid) return Promise.reject(new Error("no pid for session"));
    const ps = (args) => new Promise((resolve2, reject) => execFile("ps", args, { timeout: OSA_TIMEOUT_MS }, (e, out) => e ? reject(e) : resolve2(String(out))));
    return ps(["-axo", "pid=,ppid=,comm="]).then((out) => {
      const bundle = hostAppForPid(parsePsTree(out), pid);
      if (!bundle) throw new Error("no host app for pid " + pid);
      const activateApp = () => openMac([bundle]);
      const strat = focusStrategyForBundle(bundle);
      const fallback = (why) => (e) => {
        log(`focusWindow: ${why} for pid ${pid} (${bundle}) -> activating app instead:`, String(e?.message ?? e));
        return activateApp();
      };
      if (strat === "terminal") {
        return ps(["-o", "tty=", "-p", String(pid)]).then((t) => {
          const tty = t.trim();
          if (!tty || tty === "??") {
            log(`focusWindow: no tty for pid ${pid} -> activating app instead`);
            return activateApp();
          }
          log(`focusWindow: terminal strategy, pid ${pid}, tty ${tty}`);
          return runOsa(terminalFocusScript(tty)).catch(fallback("terminal tty match failed"));
        }).catch(fallback("tty lookup failed"));
      }
      if (strat === "vscode") {
        const base2 = path3.basename(s.cwd ?? "");
        if (!base2) return activateApp();
        const esc2 = escapeAppleScript(base2);
        return runOsa([
          "with timeout of 7 seconds",
          'tell application "System Events"',
          '  tell process "Code"',
          "    set matched to false",
          "    repeat with w in windows",
          `      if (name of w) contains "${esc2}" then`,
          '        perform action "AXRaise" of w',
          "        set frontmost to true",
          "        set matched to true",
          "        exit repeat",
          "      end if",
          "    end repeat",
          '    if not matched then error "not found"',
          "  end tell",
          "end tell",
          "end timeout"
        ]).catch(fallback("vscode window match failed"));
      }
      return activateApp();
    });
  },
  // "<pid> <elapsed>" per line, for the recycled-pid check. `etime`, not `etimes`:
  // the seconds-valued `etimes` keyword is a GNU procps extension and BSD ps exits
  // with "keyword not found" (measured). parseElapsed handles etime's
  // "[[dd-]hh:]mm:ss" shape, which is numeric and so locale-independent.
  listProcStarts() {
    return new Promise((resolve2, reject) => {
      execFile(
        "ps",
        ["-axo", "pid=,etime="],
        { timeout: OSA_TIMEOUT_MS, maxBuffer: 4 << 20 },
        (err, out) => err ? reject(err) : resolve2(String(out))
      );
    });
  },
  // OAuth token from the login Keychain (service "Claude Code-credentials"),
  // falling back to the credentials file if a user exported it.
  readToken() {
    return new Promise((resolve2) => {
      execFile(
        "security",
        ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
        { timeout: OSA_TIMEOUT_MS },
        async (err, out) => {
          const tok = err ? null : parseKeychainToken(out);
          if (tok) return resolve2(tok);
          try {
            const raw = await fsp.readFile(CREDS_FILE, "utf8");
            resolve2(parseKeychainToken(raw));
          } catch {
            resolve2(null);
          }
        }
      );
    });
  }
};
var platform = IS_MAC ? macPlatform : winPlatform;
function act(context, p) {
  p.catch(() => showAlert(context));
}
function onKeyDown(context, kind) {
  switch (kind) {
    case "usage-session":
    case "usage-weekly":
      if (gaugeMode(state, kind, Date.now()) === "local") {
        usageView.set(context, (usageView.get(context) ?? "cost") === "cost" ? "tokens" : "cost");
        pollUsageMeter();
        return render(context, kind);
      }
      if (Date.now() - lastUsageAttempt > 3e4) pollUsage();
      return;
    case "today":
      pollToday();
      return;
    case "sessions": {
      const n = state.sessions.length;
      if (n === 0) return showAlert(context);
      const cy = cycle.get(context) ?? { idx: -1, timer: null };
      cy.idx = (cy.idx + 1) % n;
      if (cy.timer) clearTimeout(cy.timer);
      cy.timer = setTimeout(() => {
        cycle.set(context, { idx: -1, timer: null });
        render(context, "sessions");
      }, 4e3);
      cycle.set(context, cy);
      return render(context, "sessions");
    }
    case "usage-model": {
      const mode = gaugeMode(state, "usage-model", Date.now());
      const list = modelList(state, mode);
      if (list.length > 1) {
        const cur = modelListIndex(modelIdx.get(context) ?? null, list, views.get(context)?.settings?.model);
        modelIdx.set(context, (cur + 1) % list.length);
      } else if (mode === "local") pollUsageMeter();
      else if (Date.now() - lastUsageAttempt > 3e4) pollUsage();
      return render(context, "usage-model");
    }
    case "burn-rate":
      pollBurn();
      return;
    case "project": {
      const s = views.get(context)?.settings ?? {};
      if (!s.path) return showAlert(context);
      return act(context, platform.openTerminal(s.path));
    }
    case "focus-session": {
      const blocked = blockedSessions(state.sessions, Date.now(), state.activity);
      const pool = blocked.length ? blocked : state.sessions;
      const n = pool.length;
      if (!n) return showAlert(context);
      const poolSig = pool.map((s) => s.pid).join(",");
      const prev = focusIdx.get(context);
      const i = prev?.sig === poolSig ? (prev.i + 1) % n : 0;
      focusIdx.set(context, { i, sig: poolSig });
      act(context, platform.focusWindow(pool[i]));
      return render(context, "focus-session");
    }
    case "quick-prompt": {
      const s = views.get(context)?.settings ?? {};
      if (!s.prompt) return showAlert(context);
      return act(context, platform.pasteInto(s.hotkey, s.prompt, !!s.enter));
    }
    case "custom": {
      const s = views.get(context)?.settings ?? {};
      if (!s.command) return showAlert(context);
      return act(context, platform.runCustom(s.command));
    }
    case "launch":
      return act(context, platform.launchDesktop());
    case "quick-chat": {
      const s = views.get(context)?.settings ?? {};
      return act(context, platform.fireHotkey(s.hotkey));
    }
    case "open-web":
      return act(context, platform.openUrl("https://claude.ai/new"));
    case "claude-code":
      return act(context, platform.openTerminal(DEFAULT_CODE_DIR));
    case "usage-meter": {
      usageView.set(context, (usageView.get(context) ?? "cost") === "cost" ? "tokens" : "cost");
      pollUsageMeter();
      return render(context, "usage-meter");
    }
    case "approver-status": {
      const s = views.get(context)?.settings ?? {};
      const resolved = resolveStatusKey(state.sessions, s.project ?? "", autoSlotFor(context), Date.now(), state.activity);
      if (!resolved.count) return showAlert(context);
      const cycling = !!s.cycle && resolved.count > 1;
      let idx = resolved.index;
      if (cycling) {
        const cy = cycle.get(context) ?? { idx: resolved.index - 1, timer: null };
        cy.idx = (cy.idx + 1) % resolved.count;
        if (cy.timer) clearTimeout(cy.timer);
        cy.timer = setTimeout(() => {
          cycle.set(context, { idx: -1, timer: null });
          render(context, "approver-status");
        }, 4e3);
        cycle.set(context, cy);
        idx = cy.idx;
      }
      const entry = statusEntry(resolved, cycling ? idx : null);
      render(context, "approver-status");
      return act(context, platform.focusWindow(sessionByPid(entry.pid)));
    }
    case "approver-waiting": {
      const blocked = blockedSessions(state.sessions, Date.now(), state.activity);
      if (!blocked.length) return showAlert(context);
      const cy = cycle.get(context) ?? { idx: -1, timer: null };
      cy.idx = (cy.idx + 1) % blocked.length;
      if (cy.timer) clearTimeout(cy.timer);
      cy.timer = setTimeout(() => {
        cycle.set(context, { idx: -1, timer: null });
        render(context, "approver-waiting");
      }, 4e3);
      cycle.set(context, cy);
      render(context, "approver-waiting");
      return act(context, platform.focusWindow(blocked[cy.idx]));
    }
    case "approve-allow":
    case "approve-always":
    case "approve-deny": {
      try {
        if (state.hookErr) return showAlert(context);
        const s = views.get(context)?.settings ?? {};
        const d = pressDecision({
          queue: state.approveQueue,
          shownId: shownReq.get(context) ?? null,
          lastHeadChangeAt: state.lastHeadChangeAt,
          now: Date.now()
        });
        if (d.action === "none") return;
        if (d.action === "alert") {
          renderApproveAll();
          return showAlert(context);
        }
        const which = kind.slice("approve-".length);
        const target = head(state.approveQueue);
        const body = decisionBody(which, target, { sessionOnly: !!s.sessionOnly });
        const ruleOk = kind !== "approve-always" || shownRule.get(context) != null && alwaysRule(target, !!s.sessionOnly) === shownRule.get(context);
        const denied = which === "always" ? denyBlock(state.denies, target, Date.now()) : null;
        if (!body || !ruleOk || denied) {
          const why = denied ?? (!body ? "no single safe rule" : "rule is not what was shown");
          log(`approve: refused ${which} for ${target.toolName} (${why})`);
          renderApproveAll();
          return showAlert(context);
        }
        const { queue, req } = resolve(state.approveQueue, d.id);
        if (!req) {
          renderApproveAll();
          return showAlert(context);
        }
        state.approveQueue = queue;
        req.ticket.respond(body);
        if (which === "deny") state.denies = rememberDeny(state.denies, req, Date.now());
        log(`approve: ${which} ${req.toolName}${which === "always" ? ` as ${shownRule.get(context)}` : ""}`);
        state.lastHeadChangeAt = Date.now();
        renderApproveAll();
      } catch (e) {
        log("approve press failed:", e?.stack ?? String(e));
        showAlert(context);
      }
      return;
    }
  }
}
if (process.argv.includes("--selftest")) {
  (async () => {
    log("selftest: polling usage\u2026");
    await pollUsage();
    log("selftest usage:", state.usage ? JSON.stringify(state.usage) : `ERROR: ${state.usageErr}`);
    await pollSessions();
    log("selftest sessions:", state.sessions.map((s) => `${s.name}[${s.status}]`).join(", ") || "(none)");
    log("selftest states:", state.sessions.map((s) => `${s.name}=${sessionState(s, Date.now(), state.activity.get(s.sessionId) ?? null)}${s.waitingFor ? "(" + s.waitingFor + ")" : ""}`).join(", ") || "(none)");
    log("selftest blocked:", blockedSessions(state.sessions, Date.now(), state.activity).map((s) => s.name).join(", ") || "(none)");
    log("selftest status (auto k0):", JSON.stringify(statusEntry(resolveStatusKey(state.sessions, "", 0, Date.now(), state.activity))));
    const demo0 = state.sessions[0];
    if (demo0) {
      const proj = path3.basename(demo0.cwd ?? "");
      const r = resolveStatusKey(state.sessions, proj, 0, Date.now(), state.activity);
      log(`selftest status (explicit ${proj}) count=${r.count}:`, JSON.stringify(statusEntry(r)));
    }
    await pollToday();
    log("selftest today:", JSON.stringify(state.today));
    await pollUsageMeter(["5h"]);
    await pollBurn();
    log("selftest burn:", JSON.stringify(state.burn), "eta:", sessionEta(state, Date.now()));
    await pollUsageMeter(["5h", "today", "month", "7day"]);
    log("selftest usage-meter:", JSON.stringify(state.usageMeter));
    log("selftest per-model 7d:", JSON.stringify(state.usageMeterModels));
    const secret = randomBytes(24).toString("base64url");
    let got = null;
    const srv = await startHookServer({
      port: 0,
      secret,
      log,
      onRequest: (payload, ticket) => {
        got = payload;
        ticket.respond(decisionBody("allow", {}));
      }
    });
    const res = await fetch(`http://127.0.0.1:${srv.boundPort}/permission/${secret}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "npm test" } })
    });
    const body = await res.json();
    log(
      "selftest hook:",
      res.status,
      "payload tool:",
      got?.tool_name,
      "decision:",
      body?.hookSpecificOutput?.decision?.behavior
    );
    log("selftest approver config: holdS=", HOLD_S_DEFAULT, "portDefault=", PORT_DEFAULT, "queueMax=", QUEUE_MAX);
    await srv.close();
    if (res.status !== 200 || got?.tool_name !== "Bash" || body?.hookSpecificOutput?.decision?.behavior !== "allow") {
      log("selftest hook FAILED");
      process.exit(1);
    }
    process.exit(0);
  })().catch((e) => {
    log("selftest crashed:", e?.stack ?? String(e));
    process.exit(1);
  });
} else {
  process.on("uncaughtException", (e) => log("uncaughtException:", e?.stack ?? String(e)));
  process.on("unhandledRejection", (e) => log("unhandledRejection:", e?.stack ?? String(e)));
  const port = argOf("-port");
  const pluginUUID = argOf("-pluginUUID");
  const registerEvent = argOf("-registerEvent");
  log(`starting: port=${port} uuid=${pluginUUID}`);
  ws = new import_websocket.default(`ws://127.0.0.1:${port}`);
  ws.on("open", () => {
    state.pluginUUID = pluginUUID;
    send({ event: registerEvent, uuid: pluginUUID });
    log("registered with Stream Deck");
    send({ event: "getGlobalSettings", context: pluginUUID });
    if (Date.now() - state.usageAt > 9e4) pollUsage();
    pollSessions();
    pollToday();
  });
  ws.on("close", () => {
    log("socket closed, exiting");
    process.exit(0);
  });
  ws.on("error", (e) => {
    log("socket error:", String(e));
  });
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    const { event, context, action } = msg;
    if (event === "willAppear" && action) {
      views.set(context, {
        kind: kindOf(action),
        settings: msg.payload?.settings ?? {},
        // Device + physical position: used to give several auto Status keys a
        // stable slot, numbered per device (two Stream Decks are live at once).
        device: msg.device ?? null,
        row: msg.payload?.coordinates?.row ?? null,
        col: msg.payload?.coordinates?.column ?? null
      });
      setTitle(context);
      render(context, kindOf(action));
      if (kindOf(action) === "usage-meter" || GAUGE_WINDOW[kindOf(action)]) pollUsageMeter();
    } else if (event === "willDisappear") {
      const wasApproveKey = APPROVE_KINDS.includes(views.get(context)?.kind);
      views.delete(context);
      cycle.delete(context);
      focusIdx.delete(context);
      usageView.delete(context);
      modelIdx.delete(context);
      if (wasApproveKey) {
        setTimeout(() => {
          if (!hasApproveKey() && state.approveQueue.length) {
            answerAndDrop(state.approveQueue.map((r) => r.id), "no Approve key visible");
          }
        }, 1e3);
      }
    } else if (event === "didReceiveSettings" && action) {
      const v = views.get(context);
      if (v) {
        v.settings = msg.payload?.settings ?? {};
        render(context, v.kind);
        if (v.kind === "usage-meter" || GAUGE_WINDOW[v.kind]) pollUsageMeter();
      }
    } else if (event === "didReceiveGlobalSettings") {
      state.globalSettings = msg.payload?.settings ?? {};
      state.rates = state.globalSettings.rates ?? {};
      pollUsageMeter();
      ensureHookServer();
    } else if (event === "sendToPlugin" && action) {
      if (msg.payload?.cmd === "getModels") {
        send({ event: "sendToPropertyInspector", context, payload: { models: (state.usage?.models ?? []).map((m) => m.name) } });
      }
      if (msg.payload?.cmd === "getInstall") {
        send({ event: "sendToPropertyInspector", context, payload: {
          install: { port: state.hookPort, holdS: HOLD_MS() / 1e3, snippet: installSnippet(), error: state.hookErr }
        } });
      }
    } else if (event === "keyDown" && action) {
      onKeyDown(context, kindOf(action));
    }
  });
  (function usageLoop() {
    setTimeout(async () => {
      await pollUsage();
      usageLoop();
    }, usageDelay);
  })();
  setInterval(pollSessions, 5e3);
  setInterval(pollToday, 3e5);
  pollBurn();
  setInterval(pollBurn, 6e4);
  setInterval(pollUsageMeter, 6e4);
  setInterval(() => {
    animPhase = (animPhase + 1) % 3;
    const kinds = [];
    if (state.sessions.some((s) => sessionState(s, Date.now(), state.activity.get(s.sessionId) ?? null) === "working")) kinds.push("sessions");
    if (state.usage?.fiveHour?.pct >= 90) kinds.push("usage-session");
    if (state.usage?.weekly?.pct >= 90) kinds.push("usage-weekly");
    if ((state.usage?.models ?? []).some((m) => m.pct >= 90)) kinds.push("usage-model");
    for (const [k, win] of Object.entries(GAUGE_WINDOW)) {
      if (gaugeMode(state, k, Date.now()) !== "local") continue;
      const agg = k === "usage-model" ? (state.usageMeterModels ?? [])[0] : state.usageMeter?.[win];
      const bud = [...views.values()].find((v) => v.kind === k)?.settings?.budget;
      if (agg && (budgetPct(agg.cost, bud) ?? 0) >= 90) kinds.push(k);
    }
    const freshBlocked = blockedSessions(state.sessions, Date.now(), state.activity).some((b) => !b.statusUpdatedAt || Date.now() - b.statusUpdatedAt < PULSE_MS);
    if (freshBlocked) kinds.push("approver-status", "approver-waiting");
    if (state.approveQueue.length) {
      const dead = expiredIds(state.approveQueue, Date.now(), HOLD_MS());
      if (dead.length) answerAndDrop(dead, "hold expired");
      if (state.approveQueue.length) kinds.push(...APPROVE_KINDS);
    }
    if (kinds.length && [...views.values()].some((v) => kinds.includes(v.kind))) renderAll(kinds);
    const expired = [state.usage?.fiveHour, state.usage?.weekly].some((b) => b?.resetsAt && Date.now() - new Date(b.resetsAt).getTime() > 5e3);
    if (expired && !state.usageErr && Date.now() - lastUsageAttempt > 3e4) pollUsage();
  }, 600);
  setInterval(() => {
    renderAll(["usage-session", "usage-weekly", "usage-model", "burn-rate", "approver-status", "approver-waiting", "focus-session", ...APPROVE_KINDS]);
    if (state.hookErr) ensureHookServer();
  }, 3e4);
}
