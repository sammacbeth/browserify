"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _events = require("events");

var _events2 = _interopRequireDefault(_events);

var _buffer = require("buffer");

var _assert = require("assert");

var _assert2 = _interopRequireDefault(_assert);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncIterator(iterable) { if (typeof Symbol === "function") { if (Symbol.asyncIterator) { var method = iterable[Symbol.asyncIterator]; if (method != null) return method.call(iterable); } if (Symbol.iterator) { return iterable[Symbol.iterator](); } } throw new TypeError("Object is not async iterable"); }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const isUint8Array = value => value instanceof Uint8Array;

const Bind = {
  BIND_STATE_UNBOUND: 0,
  BIND_STATE_BINDING: 1,
  BIND_STATE_BOUND: 2
};

exports.default = lib => {
  class Socket extends _events2.default {
    constructor(type, listener) {
      super();

      if (type !== null && typeof type === "object") {
        var options = type;
        this.type = options.type;
        this.dns = options.lookup ? fromNodeLookup(options.lookup) : lib.dns;
        this._reuseAddr = !!options.reuseAddr;
      } else {
        this._reuseAddr = false;
        this.type = type;
        this.dns = lib.dns;
      }

      if (typeof listener === "function") {
        this.on("message", listener);
      }

      this.isIdle = true;
      this._handle = null;
      this._bindState = Bind.BIND_STATE_UNBOUND;
      this.workQueue = [];
    }
    _healthCheck() {
      if (!this._handle) {
        throw new ERR_SOCKET_DGRAM_NOT_RUNNING();
      }
      return this._handle;
    }

    send(buffer, ...args) {
      let [offset, length, port, address, callback] = args;
      let list;

      if (address || port && typeof port !== "function") {
        buffer = sliceBuffer(buffer, offset, length);
      } else {
        callback = port;
        port = offset;
        address = length;
      }

      if (!Array.isArray(buffer)) {
        if (typeof buffer === "string") {
          list = [_buffer.Buffer.from(buffer)];
        } else if (!isUint8Array(buffer)) {
          throw new ERR_INVALID_ARG_TYPE("buffer", ["Buffer", "Uint8Array", "string"], buffer);
        } else {
          list = [buffer];
        }
      } else if (!(list = fixBufferList(buffer))) {
        throw new ERR_INVALID_ARG_TYPE("buffer list arguments", ["Buffer", "string"], buffer);
      }

      port = port >>> 0;
      if (port === 0 || port > 65535) throw new ERR_SOCKET_BAD_PORT(port);

      if (typeof callback !== "function") callback = undefined;

      if (typeof address === "function") {
        callback = address;
        address = undefined;
      } else if (address && typeof address !== "string") {
        throw new ERR_INVALID_ARG_TYPE("address", ["string", "falsy"], address);
      }

      if (this._bindState === Bind.BIND_STATE_UNBOUND) {
        this.bind({ port: 0, exclusive: true }, null);
      }

      if (list.length === 0) {
        list.push(_buffer.Buffer.alloc(0));
      }

      const host = address || (this.type === "udp4" ? "127.0.0.1" : "::1");
      this.schedule(new Send(this, list, port, host, callback));
    }

    close(callback) {
      if (typeof callback === "function") {
        this.on("close", callback);
      }

      this.schedule(new Close(this));
    }

    schedule(task) {
      this.workQueue.push(task);
      if (this.isIdle) {
        this.awake();
      }
    }
    awake() {
      var _this = this;

      return _asyncToGenerator(function* () {
        if (_this.isIdle) {
          _this.isIdle = false;
          const { workQueue } = _this;
          let index = 0;
          while (index < workQueue.length) {
            const task = workQueue[index++];
            yield task.perform();
          }
          workQueue.length = 0;
          _this.isIdle = true;
        }
      })();
    }

    address() {
      const { host, port, family } = this._healthCheck().address;
      return {
        address: host,
        host,
        port,
        family: toNodeFamily(family)
      };
    }

    setMulticastLoopback(flag) {
      const socket = this._healthCheck();

      try {
        lib.UDPSocket.setMulticastLoopback(socket, flag);
      } catch (error) {
        throw errnoException(error, "setMulticastLoopback");
      }
    }

    setMulticastInterface(interfaceAddress) {
      const socket = this._healthCheck();

      if (typeof interfaceAddress !== "string") {
        throw new ERR_INVALID_ARG_TYPE("interfaceAddress", "string", interfaceAddress);
      }

      try {
        lib.UDPSocket.setMulticastInterface(socket, interfaceAddress);
      } catch (error) {
        throw errnoException(error, "setMulticastInterface");
      }
    }

    addMembership(multicastAddress, interfaceAddress) {
      const socket = this._healthCheck();

      if (!multicastAddress) {
        throw new ERR_MISSING_ARGS("multicastAddress");
      }

      try {
        lib.UDPSocket.addMembership(socket, multicastAddress, interfaceAddress);
      } catch (error) {
        throw errnoException(error, "addMembership");
      }
    }
    dropMembership(multicastAddress, interfaceAddress) {
      const socket = this._healthCheck();

      if (!multicastAddress) {
        throw new ERR_MISSING_ARGS("multicastAddress");
      }

      try {
        lib.UDPSocket.dropMembership(socket, multicastAddress, interfaceAddress || undefined);
      } catch (error) {
        throw errnoException(error, "dropMembership");
      }
    }

    bind(...args) {
      let [port_, address_, callback] = args;
      let port = port_;

      if (this._bindState !== Bind.BIND_STATE_UNBOUND) throw new ERR_SOCKET_ALREADY_BOUND();

      this._bindState = Bind.BIND_STATE_BINDING;

      if (arguments.length && typeof arguments[arguments.length - 1] === "function") this.once("listening", arguments[arguments.length - 1]);

      var address;
      var exclusive;

      if (port !== null && typeof port === "object") {
        address = port.address || "";
        exclusive = !!port.exclusive;
        port = port.port;
      } else {
        address = typeof address_ === "function" ? "" : address_;
        exclusive = false;
      }

      if (!address) {
        if (this.type === "udp4") address = "0.0.0.0";else address = "::";
      }

      this.schedule(new Spawn(this, address, port));

      return this;
    }
  }

  class Spawn {
    constructor(socket, address, port) {
      this.socket = socket;
      this.address = address;
      this.port = port;
    }
    perform() {
      var _this2 = this;

      return _asyncToGenerator(function* () {
        const { socket, address, port } = _this2;
        try {
          const host = yield browser.DNS.resolve(address, 0, false);
          const addressReuse = socket._reuseAddr;
          const options = port != undefined && port !== 0 ? { host, port, addressReuse } : { host, addressReuse };

          const _handle = yield lib.UDPSocket.create(options);
          socket._handle = _handle;
          socket.emit("listening", _this2);
          listen(socket, _handle);
        } catch (error) {
          socket._bindState = Bind.BIND_STATE_UNBOUND;
          socket.emit("error", error);
        }
      })();
    }
  }
  class Send {
    constructor(socket, list, port, address, callback) {
      this.socket = socket;
      this.list = list;
      this.port = port;
      this.address = address;
      this.callback = callback;
    }
    perform() {
      var _this3 = this;

      return _asyncToGenerator(function* () {
        const { socket, list, port, address, callback } = _this3;
        const { _handle } = socket;
        const host = yield browser.DNS.resolve(address, 0, false);

        if (_handle) {
          try {
            for (const { buffer } of list) {
              yield lib.UDPSocket.send(_handle, host, port, buffer);
            }

            if (callback) {
              yield new Promise(function (resolve) {
                return setTimeout(resolve, 20);
              });
              callback(null);
            }
          } catch (error) {
            if (callback) {
              callback(error);
            }
          }
        }
      })();
    }
  }

  class Close {
    constructor(socket) {
      this.socket = socket;
    }
    perform() {
      var _this4 = this;

      return _asyncToGenerator(function* () {
        const { socket } = _this4;
        try {
          const handle = socket._healthCheck();
          socket._handle = null;
          yield lib.UDPSocket.close(handle);
        } catch (error) {
          socket.emit("error", error);
        }
      })();
    }
  }

  const listen = (() => {
    var _ref = _asyncToGenerator(function* (socket, handle) {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _asyncIterator(lib.UDPSocket.messages(handle)), _step, _value; _step = yield _iterator.next(), _iteratorNormalCompletion = _step.done, _value = yield _step.value, !_iteratorNormalCompletion; _iteratorNormalCompletion = true) {
          const { data, from } = _value;

          socket.emit("message", _buffer.Buffer.from(data), {
            address: from.host,
            family: toNodeFamily(from.family),
            port: from.port,
            size: data.byteLength
          });
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            yield _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      socket.emit("close");
    });

    return function listen(_x, _x2) {
      return _ref.apply(this, arguments);
    };
  })();

  const createSocket = (options, callback) => {
    return new Socket(options, callback);
  };

  return { createSocket, Socket };
};

function oneOf(expected, thing) {
  (0, _assert2.default)(typeof thing === "string", "`thing` has to be of type string");
  if (Array.isArray(expected)) {
    const len = expected.length;
    (0, _assert2.default)(len > 0, "At least one expected value needs to be specified");
    expected = expected.map(i => String(i));
    if (len > 2) {
      return `one of ${thing} ${expected.slice(0, len - 1).join(", ")}, or ` + expected[len - 1];
    } else if (len === 2) {
      return `one of ${thing} ${expected[0]} or ${expected[1]}`;
    } else {
      return `of ${thing} ${expected[0]}`;
    }
  } else {
    return `of ${thing} ${String(expected)}`;
  }
}

class ERR_INVALID_ARG_TYPE extends TypeError {
  constructor(name, expected, actual) {
    let determiner;
    if (typeof expected === "string" && expected.startsWith("not ")) {
      determiner = "must not be";
      expected = expected.replace(/^not /, "");
    } else {
      determiner = "must be";
    }

    let msg;
    if (name.endsWith(" argument")) {
      msg = `The ${name} ${determiner} ${oneOf(expected, "type")}`;
    } else {
      const type = name.includes(".") ? "property" : "argument";
      msg = `The "${name}" ${type} ${determiner} ${oneOf(expected, "type")}`;
    }

    msg += `. Received type ${typeof actual}`;
    super(msg);
  }
}

class ERR_MISSING_ARGS extends TypeError {
  constructor(...params) {
    let msg = "The ";
    const len = params.length;
    const args = params.map(a => `"${a}"`);
    switch (len) {
      case 1:
        msg += `${args[0]} argument`;
        break;
      case 2:
        msg += `${args[0]} and ${args[1]} arguments`;
        break;
      default:
        msg += args.slice(0, len - 1).join(", ");
        msg += `, and ${args[len - 1]} arguments`;
        break;
    }
    super(`${msg} must be specified`);
  }
}

class ERR_SOCKET_ALREADY_BOUND extends Error {
  constructor() {
    super("Socket is already bound");
  }
}

class ERR_SOCKET_BAD_BUFFER_SIZE extends TypeError {
  constructor() {
    super("Buffer size must be a positive integer");
  }
}

class ERR_SOCKET_BAD_PORT extends RangeError {
  constructor(port) {
    super("Port should be > 0 and < 65536. Received ${port}.");
  }
}

class ERR_SOCKET_BAD_TYPE extends TypeError {
  constructor() {
    super("Bad socket type specified. Valid types are: udp4, udp6");
  }
}

class ERR_SOCKET_BUFFER_SIZE extends Error {
  constructor() {
    super("Could not get or set buffer size");
  }
}

class ERR_SOCKET_CANNOT_SEND extends Error {
  constructor() {
    super("Unable to send data");
  }
}

class ERR_SOCKET_DGRAM_NOT_RUNNING extends Error {
  constructor() {
    super("Not running");
  }
}

class SystemError extends Error {
  constructor(message, code, syscall) {
    super(message);
    this.code = code;
    this.syscall = syscall;
  }
  get errno() {
    return this.code;
  }
}

const errnoException = (err, syscall, original) => {
  const code = err.message;
  const message = original ? `${syscall} ${code} ${original}` : `${syscall} ${code}`;

  const ex = new SystemError(message, code, syscall);

  return ex;
};

function sliceBuffer(source, offset, length) {
  let buffer = source;
  if (typeof buffer === "string") {
    buffer = _buffer.Buffer.from(buffer);
  } else if (!isUint8Array(buffer)) {
    throw new ERR_INVALID_ARG_TYPE("buffer", ["Buffer", "Uint8Array", "string"], buffer);
  }

  const start = offset >>> 0;
  const end = start + (length >>> 0);

  return buffer.slice(start, end);
}

function fixBufferList(list) {
  const newlist = new Array(list.length);

  for (var i = 0, l = list.length; i < l; i++) {
    var buf = list[i];
    if (typeof buf === "string") newlist[i] = _buffer.Buffer.from(buf);else if (!isUint8Array(buf)) return null;else newlist[i] = buf;
  }

  return newlist;
}

const toNodeFamily = family => family === 2 ? "udp6" : "udp4";

const fromNodeLookup = lookup => ({
  resolve: hostname => new Promise((resolve, reject) => {
    lookup(hostname, (error, address, family) => {
      if (error) {
        reject(error);
      } else {
        resolve({ addresses: [address] });
      }
    });
  })
});
module.exports = exports["default"];
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9ub2RlLWRncmFtLmpzIl0sIm5hbWVzIjpbImlzVWludDhBcnJheSIsInZhbHVlIiwiVWludDhBcnJheSIsIkJpbmQiLCJCSU5EX1NUQVRFX1VOQk9VTkQiLCJCSU5EX1NUQVRFX0JJTkRJTkciLCJCSU5EX1NUQVRFX0JPVU5EIiwibGliIiwiU29ja2V0IiwiRXZlbnRFbWl0dGVyIiwiY29uc3RydWN0b3IiLCJ0eXBlIiwibGlzdGVuZXIiLCJvcHRpb25zIiwiZG5zIiwibG9va3VwIiwiZnJvbU5vZGVMb29rdXAiLCJfcmV1c2VBZGRyIiwicmV1c2VBZGRyIiwib24iLCJpc0lkbGUiLCJfaGFuZGxlIiwiX2JpbmRTdGF0ZSIsIndvcmtRdWV1ZSIsIl9oZWFsdGhDaGVjayIsIkVSUl9TT0NLRVRfREdSQU1fTk9UX1JVTk5JTkciLCJzZW5kIiwiYnVmZmVyIiwiYXJncyIsIm9mZnNldCIsImxlbmd0aCIsInBvcnQiLCJhZGRyZXNzIiwiY2FsbGJhY2siLCJsaXN0Iiwic2xpY2VCdWZmZXIiLCJBcnJheSIsImlzQXJyYXkiLCJCdWZmZXIiLCJmcm9tIiwiRVJSX0lOVkFMSURfQVJHX1RZUEUiLCJmaXhCdWZmZXJMaXN0IiwiRVJSX1NPQ0tFVF9CQURfUE9SVCIsInVuZGVmaW5lZCIsImJpbmQiLCJleGNsdXNpdmUiLCJwdXNoIiwiYWxsb2MiLCJob3N0Iiwic2NoZWR1bGUiLCJTZW5kIiwiY2xvc2UiLCJDbG9zZSIsInRhc2siLCJhd2FrZSIsImluZGV4IiwicGVyZm9ybSIsImZhbWlseSIsInRvTm9kZUZhbWlseSIsInNldE11bHRpY2FzdExvb3BiYWNrIiwiZmxhZyIsInNvY2tldCIsIlVEUFNvY2tldCIsImVycm9yIiwiZXJybm9FeGNlcHRpb24iLCJzZXRNdWx0aWNhc3RJbnRlcmZhY2UiLCJpbnRlcmZhY2VBZGRyZXNzIiwiYWRkTWVtYmVyc2hpcCIsIm11bHRpY2FzdEFkZHJlc3MiLCJFUlJfTUlTU0lOR19BUkdTIiwiZHJvcE1lbWJlcnNoaXAiLCJwb3J0XyIsImFkZHJlc3NfIiwiRVJSX1NPQ0tFVF9BTFJFQURZX0JPVU5EIiwiYXJndW1lbnRzIiwib25jZSIsIlNwYXduIiwiYnJvd3NlciIsIkROUyIsInJlc29sdmUiLCJhZGRyZXNzUmV1c2UiLCJjcmVhdGUiLCJlbWl0IiwibGlzdGVuIiwiUHJvbWlzZSIsInNldFRpbWVvdXQiLCJoYW5kbGUiLCJtZXNzYWdlcyIsImRhdGEiLCJzaXplIiwiYnl0ZUxlbmd0aCIsImNyZWF0ZVNvY2tldCIsIm9uZU9mIiwiZXhwZWN0ZWQiLCJ0aGluZyIsImxlbiIsIm1hcCIsImkiLCJTdHJpbmciLCJzbGljZSIsImpvaW4iLCJUeXBlRXJyb3IiLCJuYW1lIiwiYWN0dWFsIiwiZGV0ZXJtaW5lciIsInN0YXJ0c1dpdGgiLCJyZXBsYWNlIiwibXNnIiwiZW5kc1dpdGgiLCJpbmNsdWRlcyIsInBhcmFtcyIsImEiLCJFcnJvciIsIkVSUl9TT0NLRVRfQkFEX0JVRkZFUl9TSVpFIiwiUmFuZ2VFcnJvciIsIkVSUl9TT0NLRVRfQkFEX1RZUEUiLCJFUlJfU09DS0VUX0JVRkZFUl9TSVpFIiwiRVJSX1NPQ0tFVF9DQU5OT1RfU0VORCIsIlN5c3RlbUVycm9yIiwibWVzc2FnZSIsImNvZGUiLCJzeXNjYWxsIiwiZXJybm8iLCJlcnIiLCJvcmlnaW5hbCIsImV4Iiwic291cmNlIiwic3RhcnQiLCJlbmQiLCJuZXdsaXN0IiwibCIsImJ1ZiIsImhvc3RuYW1lIiwicmVqZWN0IiwiYWRkcmVzc2VzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFPQTs7OztBQUNBOztBQUNBOzs7Ozs7Ozs7O0FBRUEsTUFBTUEsZUFBZUMsU0FBU0EsaUJBQWlCQyxVQUEvQzs7QUFFQSxNQUFNQyxPQUFPO0FBQ1hDLHNCQUFvQixDQURUO0FBRVhDLHNCQUFvQixDQUZUO0FBR1hDLG9CQUFrQjtBQUhQLENBQWI7O2tCQWtFZ0JDLEdBQUQsSUFBYztBQUMzQixRQUFNQyxNQUFOLFNBQXFCQyxnQkFBckIsQ0FBa0M7QUFTaENDLGdCQUNFQyxJ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TUFBTXZFLGVBQWVELFVBQVdBLFdBQVcsQ0FBWCxHQUFlLE1BQWYsR0FBd0IsTUFBeEQ7O0FBVUEsTUFBTXpDLGlCQUFrQkQsTUFBRCxLQUFxQjtBQUMxQ2dFLFdBQVVxRCxRQUFELElBQ1AsSUFBSWhELE9BQUosQ0FBWSxDQUFDTCxPQUFELEVBQVVzRCxNQUFWLEtBQXFCO0FBQy9CdEgsV0FBT3FILFFBQVAsRUFBaUIsQ0FBQ3JFLEtBQUQsRUFBUS9CLE9BQVIsRUFBaUJ5QixNQUFqQixLQUE0QjtBQUMzQyxVQUFJTSxLQUFKLEVBQVc7QUFDVHNFLGVBQU90RSxLQUFQO0FBQ0QsT0FGRCxNQUVPO0FBQ0xnQixnQkFBUSxFQUFFdUQsV0FBVyxDQUFDdEcsT0FBRCxDQUFiLEVBQVI7QUFDRDtBQUNGLEtBTkQ7QUFPRCxHQVJEO0FBRndDLENBQXJCLENBQXZCIiwiZmlsZSI6Im5vZGUtZGdyYW0uanMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xyXG5cclxuaW1wb3J0IHR5cGUge1xyXG4gIFVEUFNvY2tldE1hbmFnZXIsXHJcbiAgVURQU29ja2V0LFxyXG4gIFNvY2tldE9wdGlvbnNcclxufSBmcm9tIFwibGliZHdlYi9zcmMvVURQU29ja2V0L1VEUFNvY2tldFwiXHJcbmltcG9ydCBFdmVudEVtaXR0ZXIgZnJvbSBcImV2ZW50c1wiXHJcbmltcG9ydCB7IEJ1ZmZlciB9IGZyb20gXCJidWZmZXJcIlxyXG5pbXBvcnQgYXNzZXJ0IGZyb20gXCJhc3NlcnRcIlxyXG5cclxuY29uc3QgaXNVaW50OEFycmF5ID0gdmFsdWUgPT4gdmFsdWUgaW5zdGFuY2VvZiBVaW50OEFycmF5XHJcblxyXG5jb25zdCBCaW5kID0ge1xyXG4gIEJJTkRfU1RBVEVfVU5CT1VORDogMCxcclxuICBCSU5EX1NUQVRFX0JJTkRJTkc6IDEsXHJcbiAgQklORF9TVEFURV9CT1VORDogMlxyXG59XHJcblxyXG50eXBlIEJpbmRTdGF0ZSA9ICRWYWx1ZXM8dHlwZW9mIEJpbmQ+XHJcblxyXG4vLyBTZWU6IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL0FkZC1vbnMvV2ViRXh0ZW5zaW9ucy9BUEkvZG5zL3Jlc29sdmVcclxuXHJcbmludGVyZmFjZSBETlMge1xyXG4gIHJlc29sdmUoaG9zdG5hbWU6IHN0cmluZywgZmxhZ3M/OiBETlNSZXNvbHZlRmxhZ1tdKTogUHJvbWlzZTxETlNSZWNvcmQ+O1xyXG59XHJcblxyXG50eXBlIEROU1Jlc29sdmVGbGFnID1cclxuICB8IFwiYWxsb3dfbmFtZV9jb2xsaXNpb25zXCJcclxuICB8IFwiYnlwYXNzX2NhY2hlXCJcclxuICB8IFwiY2Fub25pY2FsX25hbWVcIlxyXG4gIHwgXCJkaXNhYmxlX2lwdjRcIlxyXG4gIHwgXCJkaXNhYmxlX2lwdjZcIlxyXG4gIHwgXCJkaXNhYmxlX3RyclwiXHJcbiAgfCBcIm9mZmxpbmVcIlxyXG4gIHwgXCJwcmlvcml0eV9sb3dcIlxyXG4gIHwgXCJwcmlvcml0eV9tZWRpdW1cIlxyXG4gIHwgXCJzcGVjdWxhdGVcIlxyXG5cclxuaW50ZXJmYWNlIEROU1JlY29yZCB7XHJcbiAgYWRkcmVzc2VzOiBzdHJpbmdbXTtcclxuICBjYW5vbmljYWxOYW1lPzogc3RyaW5nO1xyXG4gIGlzVFJSOiBib29sZWFuO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTGliIHtcclxuICBVRFBTb2NrZXQ6IFVEUFNvY2tldE1hbmFnZXI7XHJcbiAgZG5zOiBETlM7XHJcbn1cclxuXHJcbmludGVyZmFjZSBOb2RlU29ja2V0T3B0aW9ucyB7XHJcbiAgdHlwZTogU29ja2V0VHlwZTtcclxuICByZXVzZUFkZHI/OiBib29sZWFuO1xyXG4gIHJlY3ZCdWZmZXJTaXplPzogbnVtYmVyO1xyXG4gIHNlbmRCdWZmZXJTaXplPzogbnVtYmVyO1xyXG4gIGxvb2t1cD86IChob3N0bmFtZTogc3RyaW5nLCAoZXJyb3I6ID9FcnJvciwgc3RyaW5nLCBzdHJpbmcpID0+IHZvaWQpID0+IHZvaWQ7XHJcbn1cclxuXHJcbnR5cGUgU29ja2V0VHlwZSA9IFwidWRwNFwiIHwgXCJ1ZHA2XCJcclxuXHJcbmludGVyZmFjZSBUYXNrIHtcclxuICBwZXJmb3JtKCk6IFByb21pc2U8dm9pZD47XHJcbn1cclxuXHJcbmludGVyZmFjZSBNZXNzYWdlTGlzdGVuZXIge1xyXG4gIChcclxuICAgIG1zZzogQnVmZmVyLFxyXG4gICAgcmluZm86IHsgYWRkcmVzczogc3RyaW5nLCBmYW1pbHk6IHN0cmluZywgcG9ydDogbnVtYmVyLCBzaXplOiBudW1iZXIgfVxyXG4gICk6IHZvaWQ7XHJcbn1cclxuXHJcbmludGVyZmFjZSBCaW5kTGlzdGVuZXIge1xyXG4gICgpOiB2b2lkO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ2xvc2VMaXN0ZW5lciB7XHJcbiAgKCk6IHZvaWQ7XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IChsaWI6IExpYikgPT4ge1xyXG4gIGNsYXNzIFNvY2tldCBleHRlbmRzIEV2ZW50RW1pdHRlciB7XHJcbiAgICBfaGFuZGxlOiA/VURQU29ja2V0XHJcbiAgICBpc0lkbGU6IGJvb2xlYW5cclxuICAgIF9iaW5kU3RhdGU6IEJpbmRTdGF0ZVxyXG4gICAgX3JldXNlQWRkcjogYm9vbGVhblxyXG4gICAgZG5zOiB7IHJlc29sdmUoc3RyaW5nKTogUHJvbWlzZTx7IGFkZHJlc3Nlczogc3RyaW5nW10gfT4gfVxyXG4gICAgd29ya1F1ZXVlOiBUYXNrW11cclxuICAgIHR5cGU6IFNvY2tldFR5cGVcclxuICAgIGxpc3RlbmVyOiA/TWVzc2FnZUxpc3RlbmVyXHJcbiAgICBjb25zdHJ1Y3RvcihcclxuICAgICAgdHlwZTogU29ja2V0VHlwZSB8IE5vZGVTb2NrZXRPcHRpb25zLFxyXG4gICAgICBsaXN0ZW5lcjogTWVzc2FnZUxpc3RlbmVyXHJcbiAgICApIHtcclxuICAgICAgc3VwZXIoKVxyXG5cclxuICAgICAgaWYgKHR5cGUgIT09IG51bGwgJiYgdHlwZW9mIHR5cGUgPT09IFwib2JqZWN0XCIpIHtcclxuICAgICAgICB2YXIgb3B0aW9ucyA9IHR5cGVcclxuICAgICAgICB0aGlzLnR5cGUgPSBvcHRpb25zLnR5cGVcclxuICAgICAgICB0aGlzLmRucyA9IG9wdGlvbnMubG9va3VwID8gZnJvbU5vZGVMb29rdXAob3B0aW9ucy5sb29rdXApIDogbGliLmRuc1xyXG4gICAgICAgIHRoaXMuX3JldXNlQWRkciA9ICEhb3B0aW9ucy5yZXVzZUFkZHJcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLl9yZXVzZUFkZHIgPSBmYWxzZVxyXG4gICAgICAgIHRoaXMudHlwZSA9IHR5cGVcclxuICAgICAgICB0aGlzLmRucyA9IGxpYi5kbnNcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHR5cGVvZiBsaXN0ZW5lciA9PT0gXCJmdW5jdGlvblwiKSB7XHJcbiAgICAgICAgdGhpcy5vbihcIm1lc3NhZ2VcIiwgbGlzdGVuZXIpXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMuaXNJZGxlID0gdHJ1ZVxyXG4gICAgICB0aGlzLl9oYW5kbGUgPSBudWxsXHJcbiAgICAgIHRoaXMuX2JpbmRTdGF0ZSA9IEJpbmQuQklORF9TVEFURV9VTkJPVU5EXHJcbiAgICAgIHRoaXMud29ya1F1ZXVlID0gW11cclxuICAgIH1cclxuICAgIF9oZWFsdGhDaGVjaygpOiBVRFBTb2NrZXQge1xyXG4gICAgICBpZiAoIXRoaXMuX2hhbmRsZSkge1xyXG4gICAgICAgIC8vIEVycm9yIG1lc3NhZ2UgZnJvbSBkZ3JhbV9sZWdhY3kuanMuXHJcbiAgICAgICAgdGhyb3cgbmV3IEVSUl9TT0NLRVRfREdSQU1fTk9UX1JVTk5JTkcoKVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB0aGlzLl9oYW5kbGVcclxuICAgIH1cclxuXHJcbiAgICBzZW5kKGJ1ZmZlcjogQnVmZmVyLCAuLi5hcmdzOiAqKSB7XHJcbiAgICAgIGxldCBbb2Zmc2V0LCBsZW5ndGgsIHBvcnQsIGFkZHJlc3MsIGNhbGxiYWNrXSA9IGFyZ3NcclxuICAgICAgbGV0IGxpc3RcclxuXHJcbiAgICAgIGlmIChhZGRyZXNzIHx8IChwb3J0ICYmIHR5cGVvZiBwb3J0ICE9PSBcImZ1bmN0aW9uXCIpKSB7XHJcbiAgICAgICAgYnVmZmVyID0gc2xpY2VCdWZmZXIoYnVmZmVyLCBvZmZzZXQsIGxlbmd0aClcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjYWxsYmFjayA9IHBvcnRcclxuICAgICAgICBwb3J0ID0gb2Zmc2V0XHJcbiAgICAgICAgYWRkcmVzcyA9IGxlbmd0aFxyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYnVmZmVyKSkge1xyXG4gICAgICAgIGlmICh0eXBlb2YgYnVmZmVyID09PSBcInN0cmluZ1wiKSB7XHJcbiAgICAgICAgICBsaXN0ID0gW0J1ZmZlci5mcm9tKGJ1ZmZlcildXHJcbiAgICAgICAgfSBlbHNlIGlmICghaXNVaW50OEFycmF5KGJ1ZmZlcikpIHtcclxuICAgICAgICAgIHRocm93IG5ldyBFUlJfSU5WQUxJRF9BUkdfVFlQRShcclxuICAgICAgICAgICAgXCJidWZmZXJcIixcclxuICAgICAgICAgICAgW1wiQnVmZmVyXCIsIFwiVWludDhBcnJheVwiLCBcInN0cmluZ1wiXSxcclxuICAgICAgICAgICAgYnVmZmVyXHJcbiAgICAgICAgICApXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGxpc3QgPSBbYnVmZmVyXVxyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIGlmICghKGxpc3QgPSBmaXhCdWZmZXJMaXN0KGJ1ZmZlcikpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVSUl9JTlZBTElEX0FSR19UWVBFKFxyXG4gICAgICAgICAgXCJidWZmZXIgbGlzdCBhcmd1bWVudHNcIixcclxuICAgICAgICAgIFtcIkJ1ZmZlclwiLCBcInN0cmluZ1wiXSxcclxuICAgICAgICAgIGJ1ZmZlclxyXG4gICAgICAgIClcclxuICAgICAgfVxyXG5cclxuICAgICAgcG9ydCA9IHBvcnQgPj4+IDBcclxuICAgICAgaWYgKHBvcnQgPT09IDAgfHwgcG9ydCA+IDY1NTM1KSB0aHJvdyBuZXcgRVJSX1NPQ0tFVF9CQURfUE9SVChwb3J0KVxyXG5cclxuICAgICAgLy8gTm9ybWFsaXplIGNhbGxiYWNrIHNvIGl0J3MgZWl0aGVyIGEgZnVuY3Rpb24gb3IgdW5kZWZpbmVkIGJ1dCBub3QgYW55dGhpbmdcclxuICAgICAgLy8gZWxzZS5cclxuICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPT0gXCJmdW5jdGlvblwiKSBjYWxsYmFjayA9IHVuZGVmaW5lZFxyXG5cclxuICAgICAgaWYgKHR5cGVvZiBhZGRyZXNzID09PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgICAgICBjYWxsYmFjayA9IGFkZHJlc3NcclxuICAgICAgICBhZGRyZXNzID0gdW5kZWZpbmVkXHJcbiAgICAgIH0gZWxzZSBpZiAoYWRkcmVzcyAmJiB0eXBlb2YgYWRkcmVzcyAhPT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgIHRocm93IG5ldyBFUlJfSU5WQUxJRF9BUkdfVFlQRShcImFkZHJlc3NcIiwgW1wic3RyaW5nXCIsIFwiZmFsc3lcIl0sIGFkZHJlc3MpXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmICh0aGlzLl9iaW5kU3RhdGUgPT09IEJpbmQuQklORF9TVEFURV9VTkJPVU5EKSB7XHJcbiAgICAgICAgdGhpcy5iaW5kKHsgcG9ydDogMCwgZXhjbHVzaXZlOiB0cnVlIH0sIG51bGwpXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGxpc3QucHVzaChCdWZmZXIuYWxsb2MoMCkpXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGhvc3QgPSBhZGRyZXNzIHx8ICh0aGlzLnR5cGUgPT09IFwidWRwNFwiID8gXCIxMjcuMC4wLjFcIiA6IFwiOjoxXCIpXHJcbiAgICAgIHRoaXMuc2NoZWR1bGUobmV3IFNlbmQodGhpcywgbGlzdCwgcG9ydCwgaG9zdCwgY2FsbGJhY2spKVxyXG4gICAgfVxyXG5cclxuICAgIGNsb3NlKGNhbGxiYWNrPzogQ2xvc2VMaXN0ZW5lcikge1xyXG4gICAgICBpZiAodHlwZW9mIGNhbGxiYWNrID09PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgICAgICB0aGlzLm9uKFwiY2xvc2VcIiwgY2FsbGJhY2spXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMuc2NoZWR1bGUobmV3IENsb3NlKHRoaXMpKVxyXG4gICAgfVxyXG5cclxuICAgIHNjaGVkdWxlKHRhc2s6IFRhc2spIHtcclxuICAgICAgdGhpcy53b3JrUXVldWUucHVzaCh0YXNrKVxyXG4gICAgICBpZiAodGhpcy5pc0lkbGUpIHtcclxuICAgICAgICB0aGlzLmF3YWtlKClcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgYXN5bmMgYXdha2UoKSB7XHJcbiAgICAgIGlmICh0aGlzLmlzSWRsZSkge1xyXG4gICAgICAgIHRoaXMuaXNJZGxlID0gZmFsc2VcclxuICAgICAgICBjb25zdCB7IHdvcmtRdWV1ZSB9ID0gdGhpc1xyXG4gICAgICAgIGxldCBpbmRleCA9IDBcclxuICAgICAgICB3aGlsZSAoaW5kZXggPCB3b3JrUXVldWUubGVuZ3RoKSB7XHJcbiAgICAgICAgICBjb25zdCB0YXNrID0gd29ya1F1ZXVlW2luZGV4KytdXHJcbiAgICAgICAgICBhd2FpdCB0YXNrLnBlcmZvcm0oKVxyXG4gICAgICAgIH1cclxuICAgICAgICB3b3JrUXVldWUubGVuZ3RoID0gMFxyXG4gICAgICAgIHRoaXMuaXNJZGxlID0gdHJ1ZVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYWRkcmVzcygpIHtcclxuICAgICAgY29uc3QgeyBob3N0LCBwb3J0LCBmYW1pbHkgfSA9IHRoaXMuX2hlYWx0aENoZWNrKCkuYWRkcmVzc1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGFkZHJlc3M6IGhvc3QsXHJcbiAgICAgICAgaG9zdCxcclxuICAgICAgICBwb3J0LFxyXG4gICAgICAgIGZhbWlseTogdG9Ob2RlRmFtaWx5KGZhbWlseSlcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHNldE11bHRpY2FzdExvb3BiYWNrKGZsYWc6IGJvb2xlYW4pIHtcclxuICAgICAgY29uc3Qgc29ja2V0ID0gdGhpcy5faGVhbHRoQ2hlY2soKVxyXG5cclxuICAgICAgdHJ5IHtcclxuICAgICAgICBsaWIuVURQU29ja2V0LnNldE11bHRpY2FzdExvb3BiYWNrKHNvY2tldCwgZmxhZylcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICB0aHJvdyBlcnJub0V4Y2VwdGlvbihlcnJvciwgXCJzZXRNdWx0aWNhc3RMb29wYmFja1wiKVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgc2V0TXVsdGljYXN0SW50ZXJmYWNlKGludGVyZmFjZUFkZHJlc3M6IHN0cmluZykge1xyXG4gICAgICBjb25zdCBzb2NrZXQgPSB0aGlzLl9oZWFsdGhDaGVjaygpXHJcblxyXG4gICAgICBpZiAodHlwZW9mIGludGVyZmFjZUFkZHJlc3MgIT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRVJSX0lOVkFMSURfQVJHX1RZUEUoXHJcbiAgICAgICAgICBcImludGVyZmFjZUFkZHJlc3NcIixcclxuICAgICAgICAgIFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBpbnRlcmZhY2VBZGRyZXNzXHJcbiAgICAgICAgKVxyXG4gICAgICB9XHJcblxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGxpYi5VRFBTb2NrZXQuc2V0TXVsdGljYXN0SW50ZXJmYWNlKHNvY2tldCwgaW50ZXJmYWNlQWRkcmVzcylcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICB0aHJvdyBlcnJub0V4Y2VwdGlvbihlcnJvciwgXCJzZXRNdWx0aWNhc3RJbnRlcmZhY2VcIilcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGFkZE1lbWJlcnNoaXAobXVsdGljYXN0QWRkcmVzczogc3RyaW5nLCBpbnRlcmZhY2VBZGRyZXNzPzogc3RyaW5nKSB7XHJcbiAgICAgIGNvbnN0IHNvY2tldCA9IHRoaXMuX2hlYWx0aENoZWNrKClcclxuXHJcbiAgICAgIGlmICghbXVsdGljYXN0QWRkcmVzcykge1xyXG4gICAgICAgIHRocm93IG5ldyBFUlJfTUlTU0lOR19BUkdTKFwibXVsdGljYXN0QWRkcmVzc1wiKVxyXG4gICAgICB9XHJcblxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGxpYi5VRFBTb2NrZXQuYWRkTWVtYmVyc2hpcChzb2NrZXQsIG11bHRpY2FzdEFkZHJlc3MsIGludGVyZmFjZUFkZHJlc3MpXHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgdGhyb3cgZXJybm9FeGNlcHRpb24oZXJyb3IsIFwiYWRkTWVtYmVyc2hpcFwiKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBkcm9wTWVtYmVyc2hpcChtdWx0aWNhc3RBZGRyZXNzOiBzdHJpbmcsIGludGVyZmFjZUFkZHJlc3M6ID9zdHJpbmcpIHtcclxuICAgICAgY29uc3Qgc29ja2V0ID0gdGhpcy5faGVhbHRoQ2hlY2soKVxyXG5cclxuICAgICAgaWYgKCFtdWx0aWNhc3RBZGRyZXNzKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVSUl9NSVNTSU5HX0FSR1MoXCJtdWx0aWNhc3RBZGRyZXNzXCIpXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgbGliLlVEUFNvY2tldC5kcm9wTWVtYmVyc2hpcChcclxuICAgICAgICAgIHNvY2tldCxcclxuICAgICAgICAgIG11bHRpY2FzdEFkZHJlc3MsXHJcbiAgICAgICAgICBpbnRlcmZhY2VBZGRyZXNzIHx8IHVuZGVmaW5lZFxyXG4gICAgICAgIClcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICB0aHJvdyBlcnJub0V4Y2VwdGlvbihlcnJvciwgXCJkcm9wTWVtYmVyc2hpcFwiKVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYmluZCguLi5hcmdzOiAqKSB7XHJcbiAgICAgIGxldCBbcG9ydF8sIGFkZHJlc3NfLCBjYWxsYmFja10gPSBhcmdzXHJcbiAgICAgIGxldCBwb3J0ID0gcG9ydF9cclxuXHJcbiAgICAgIGlmICh0aGlzLl9iaW5kU3RhdGUgIT09IEJpbmQuQklORF9TVEFURV9VTkJPVU5EKVxyXG4gICAgICAgIHRocm93IG5ldyBFUlJfU09DS0VUX0FMUkVBRFlfQk9VTkQoKVxyXG5cclxuICAgICAgdGhpcy5fYmluZFN0YXRlID0gQmluZC5CSU5EX1NUQVRFX0JJTkRJTkdcclxuXHJcbiAgICAgIGlmIChcclxuICAgICAgICBhcmd1bWVudHMubGVuZ3RoICYmXHJcbiAgICAgICAgdHlwZW9mIGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0gMV0gPT09IFwiZnVuY3Rpb25cIlxyXG4gICAgICApXHJcbiAgICAgICAgdGhpcy5vbmNlKFwibGlzdGVuaW5nXCIsIGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0gMV0pXHJcblxyXG4gICAgICB2YXIgYWRkcmVzc1xyXG4gICAgICB2YXIgZXhjbHVzaXZlXHJcblxyXG4gICAgICBpZiAocG9ydCAhPT0gbnVsbCAmJiB0eXBlb2YgcG9ydCA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgICAgIGFkZHJlc3MgPSBwb3J0LmFkZHJlc3MgfHwgXCJcIlxyXG4gICAgICAgIGV4Y2x1c2l2ZSA9ICEhcG9ydC5leGNsdXNpdmVcclxuICAgICAgICBwb3J0ID0gcG9ydC5wb3J0XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYWRkcmVzcyA9IHR5cGVvZiBhZGRyZXNzXyA9PT0gXCJmdW5jdGlvblwiID8gXCJcIiA6IGFkZHJlc3NfXHJcbiAgICAgICAgZXhjbHVzaXZlID0gZmFsc2VcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gZGVmYXVsdGluZyBhZGRyZXNzIGZvciBiaW5kIHRvIGFsbCBpbnRlcmZhY2VzXHJcbiAgICAgIGlmICghYWRkcmVzcykge1xyXG4gICAgICAgIGlmICh0aGlzLnR5cGUgPT09IFwidWRwNFwiKSBhZGRyZXNzID0gXCIwLjAuMC4wXCJcclxuICAgICAgICBlbHNlIGFkZHJlc3MgPSBcIjo6XCJcclxuICAgICAgfVxyXG5cclxuICAgICAgdGhpcy5zY2hlZHVsZShuZXcgU3Bhd24odGhpcywgYWRkcmVzcywgcG9ydCkpXHJcblxyXG4gICAgICByZXR1cm4gdGhpc1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgY2xhc3MgU3Bhd24ge1xyXG4gICAgc29ja2V0OiBTb2NrZXRcclxuICAgIGFkZHJlc3M6IHN0cmluZ1xyXG4gICAgcG9ydDogbnVtYmVyXHJcbiAgICBjb25zdHJ1Y3Rvcihzb2NrZXQ6IFNvY2tldCwgYWRkcmVzczogc3RyaW5nLCBwb3J0OiBudW1iZXIpIHtcclxuICAgICAgdGhpcy5zb2NrZXQgPSBzb2NrZXRcclxuICAgICAgdGhpcy5hZGRyZXNzID0gYWRkcmVzc1xyXG4gICAgICB0aGlzLnBvcnQgPSBwb3J0XHJcbiAgICB9XHJcbiAgICBhc3luYyBwZXJmb3JtKCkge1xyXG4gICAgICBjb25zdCB7IHNvY2tldCwgYWRkcmVzcywgcG9ydCB9ID0gdGhpc1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IGhvc3QgPSBhd2FpdCBicm93c2VyLkROUy5yZXNvbHZlKGFkZHJlc3MsIDAsIGZhbHNlKTtcclxuICAgICAgICBjb25zdCBhZGRyZXNzUmV1c2UgPSBzb2NrZXQuX3JldXNlQWRkclxyXG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPVxyXG4gICAgICAgICAgcG9ydCAhPSB1bmRlZmluZWQgJiYgcG9ydCAhPT0gMFxyXG4gICAgICAgICAgICA/IHsgaG9zdCwgcG9ydCwgYWRkcmVzc1JldXNlIH1cclxuICAgICAgICAgICAgOiB7IGhvc3QsIGFkZHJlc3NSZXVzZSB9XHJcblxyXG4gICAgICAgIGNvbnN0IF9oYW5kbGUgPSBhd2FpdCBsaWIuVURQU29ja2V0LmNyZWF0ZShvcHRpb25zKVxyXG4gICAgICAgIHNvY2tldC5faGFuZGxlID0gX2hhbmRsZVxyXG4gICAgICAgIHNvY2tldC5lbWl0KFwibGlzdGVuaW5nXCIsIHRoaXMpXHJcbiAgICAgICAgbGlzdGVuKHNvY2tldCwgX2hhbmRsZSlcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBzb2NrZXQuX2JpbmRTdGF0ZSA9IEJpbmQuQklORF9TVEFURV9VTkJPVU5EXHJcbiAgICAgICAgc29ja2V0LmVtaXQoXCJlcnJvclwiLCBlcnJvcilcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuICBjbGFzcyBTZW5kIHtcclxuICAgIHNvY2tldDogU29ja2V0XHJcbiAgICBsaXN0OiBCdWZmZXJbXVxyXG4gICAgcG9ydDogbnVtYmVyXHJcbiAgICBhZGRyZXNzOiBzdHJpbmdcclxuICAgIGNhbGxiYWNrOiA/KD9FcnJvcikgPT4gdm9pZFxyXG4gICAgY29uc3RydWN0b3Ioc29ja2V0OiBTb2NrZXQsIGxpc3QsIHBvcnQ6IG51bWJlciwgYWRkcmVzczogc3RyaW5nLCBjYWxsYmFjaykge1xyXG4gICAgICB0aGlzLnNvY2tldCA9IHNvY2tldFxyXG4gICAgICB0aGlzLmxpc3QgPSBsaXN0XHJcbiAgICAgIHRoaXMucG9ydCA9IHBvcnRcclxuICAgICAgdGhpcy5hZGRyZXNzID0gYWRkcmVzc1xyXG4gICAgICB0aGlzLmNhbGxiYWNrID0gY2FsbGJhY2tcclxuICAgIH1cclxuICAgIGFzeW5jIHBlcmZvcm0oKSB7XHJcbiAgICAgIGNvbnN0IHsgc29ja2V0LCBsaXN0LCBwb3J0LCBhZGRyZXNzLCBjYWxsYmFjayB9ID0gdGhpc1xyXG4gICAgICBjb25zdCB7IF9oYW5kbGUgfSA9IHNvY2tldFxyXG4gICAgICBjb25zdCBob3N0ID0gYXdhaXQgYnJvd3Nlci5ETlMucmVzb2x2ZShhZGRyZXNzLCAwLCBmYWxzZSlcclxuXHJcbiAgICAgIGlmIChfaGFuZGxlKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGZvciAoY29uc3QgeyBidWZmZXIgfSBvZiBsaXN0KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IGxpYi5VRFBTb2NrZXQuc2VuZChfaGFuZGxlLCBob3N0LCBwb3J0LCBidWZmZXIpXHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gQXMgZmFyIGFzIEkgY2FuIHRlbGwgdGhlcmUgaXMgbm8gd2F5IHRvIHRlbGwgd2hlbiBzZW5kIG1lc3NhZ2VcclxuICAgICAgICAgIC8vIHdhcyBkcmFpbmVkIGh0dHBzOi8vZ2l0aHViLmNvbS9tb3ppbGxhL2dlY2tvLWRldi9ibG9iLzg2ODk3ODU5OTEzNDAzYjY4ODI5ZGJmOWExNTRmNWE4N2M0YjA2MzgvZG9tL3dlYmlkbC9VRFBTb2NrZXQud2ViaWRsI0wzOVxyXG4gICAgICAgICAgLy8gVGhlcmUgZm9yIHdlIGp1c3Qgd2FpdCAyMG1zIGluc3RlYWQuXHJcbiAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcclxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDIwKSlcclxuICAgICAgICAgICAgY2FsbGJhY2sobnVsbClcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XHJcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycm9yKVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgY2xhc3MgQ2xvc2Uge1xyXG4gICAgc29ja2V0OiBTb2NrZXRcclxuICAgIGNvbnN0cnVjdG9yKHNvY2tldCkge1xyXG4gICAgICB0aGlzLnNvY2tldCA9IHNvY2tldFxyXG4gICAgfVxyXG4gICAgYXN5bmMgcGVyZm9ybSgpIHtcclxuICAgICAgY29uc3QgeyBzb2NrZXQgfSA9IHRoaXNcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCBoYW5kbGUgPSBzb2NrZXQuX2hlYWx0aENoZWNrKClcclxuICAgICAgICBzb2NrZXQuX2hhbmRsZSA9IG51bGxcclxuICAgICAgICBhd2FpdCBsaWIuVURQU29ja2V0LmNsb3NlKGhhbmRsZSlcclxuICAgICAgICAvLyBzb2NrZXQuZW1pdChcImNsb3NlXCIpXHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgc29ja2V0LmVtaXQoXCJlcnJvclwiLCBlcnJvcilcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgY29uc3QgbGlzdGVuID0gYXN5bmMgZnVuY3Rpb24oc29ja2V0LCBoYW5kbGUpIHtcclxuICAgIGZvciBhd2FpdCAoY29uc3QgeyBkYXRhLCBmcm9tIH0gb2YgbGliLlVEUFNvY2tldC5tZXNzYWdlcyhoYW5kbGUpKSB7XHJcbiAgICAgIHNvY2tldC5lbWl0KFwibWVzc2FnZVwiLCBCdWZmZXIuZnJvbShkYXRhKSwge1xyXG4gICAgICAgIGFkZHJlc3M6IGZyb20uaG9zdCxcclxuICAgICAgICBmYW1pbHk6IHRvTm9kZUZhbWlseShmcm9tLmZhbWlseSksXHJcbiAgICAgICAgcG9ydDogZnJvbS5wb3J0LFxyXG4gICAgICAgIHNpemU6IGRhdGEuYnl0ZUxlbmd0aFxyXG4gICAgICB9KVxyXG4gICAgfVxyXG4gICAgc29ja2V0LmVtaXQoXCJjbG9zZVwiKVxyXG4gIH1cclxuXHJcbiAgY29uc3QgY3JlYXRlU29ja2V0ID0gKFxyXG4gICAgb3B0aW9uczogTm9kZVNvY2tldE9wdGlvbnMgfCBTb2NrZXRUeXBlLFxyXG4gICAgY2FsbGJhY2s6ICgpID0+IHZvaWRcclxuICApID0+IHtcclxuICAgIHJldHVybiBuZXcgU29ja2V0KG9wdGlvbnMsIGNhbGxiYWNrKVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHsgY3JlYXRlU29ja2V0LCBTb2NrZXQgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBvbmVPZihleHBlY3RlZCwgdGhpbmcpIHtcclxuICBhc3NlcnQodHlwZW9mIHRoaW5nID09PSBcInN0cmluZ1wiLCBcImB0aGluZ2AgaGFzIHRvIGJlIG9mIHR5cGUgc3RyaW5nXCIpXHJcbiAgaWYgKEFycmF5LmlzQXJyYXkoZXhwZWN0ZWQpKSB7XHJcbiAgICBjb25zdCBsZW4gPSBleHBlY3RlZC5sZW5ndGhcclxuICAgIGFzc2VydChsZW4gPiAwLCBcIkF0IGxlYXN0IG9uZSBleHBlY3RlZCB2YWx1ZSBuZWVkcyB0byBiZSBzcGVjaWZpZWRcIilcclxuICAgIGV4cGVjdGVkID0gZXhwZWN0ZWQubWFwKGkgPT4gU3RyaW5nKGkpKVxyXG4gICAgaWYgKGxlbiA+IDIpIHtcclxuICAgICAgcmV0dXJuIChcclxuICAgICAgICBgb25lIG9mICR7dGhpbmd9ICR7ZXhwZWN0ZWQuc2xpY2UoMCwgbGVuIC0gMSkuam9pbihcIiwgXCIpfSwgb3IgYCArXHJcbiAgICAgICAgZXhwZWN0ZWRbbGVuIC0gMV1cclxuICAgICAgKVxyXG4gICAgfSBlbHNlIGlmIChsZW4gPT09IDIpIHtcclxuICAgICAgcmV0dXJuIGBvbmUgb2YgJHt0aGluZ30gJHtleHBlY3RlZFswXX0gb3IgJHtleHBlY3RlZFsxXX1gXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gYG9mICR7dGhpbmd9ICR7ZXhwZWN0ZWRbMF19YFxyXG4gICAgfVxyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gYG9mICR7dGhpbmd9ICR7U3RyaW5nKGV4cGVjdGVkKX1gXHJcbiAgfVxyXG59XHJcblxyXG5jbGFzcyBFUlJfSU5WQUxJRF9BUkdfVFlQRSBleHRlbmRzIFR5cGVFcnJvciB7XHJcbiAgY29uc3RydWN0b3IobmFtZSwgZXhwZWN0ZWQsIGFjdHVhbCkge1xyXG4gICAgLy8gZGV0ZXJtaW5lcjogJ211c3QgYmUnIG9yICdtdXN0IG5vdCBiZSdcclxuICAgIGxldCBkZXRlcm1pbmVyXHJcbiAgICBpZiAodHlwZW9mIGV4cGVjdGVkID09PSBcInN0cmluZ1wiICYmIGV4cGVjdGVkLnN0YXJ0c1dpdGgoXCJub3QgXCIpKSB7XHJcbiAgICAgIGRldGVybWluZXIgPSBcIm11c3Qgbm90IGJlXCJcclxuICAgICAgZXhwZWN0ZWQgPSBleHBlY3RlZC5yZXBsYWNlKC9ebm90IC8sIFwiXCIpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBkZXRlcm1pbmVyID0gXCJtdXN0IGJlXCJcclxuICAgIH1cclxuXHJcbiAgICBsZXQgbXNnXHJcbiAgICBpZiAobmFtZS5lbmRzV2l0aChcIiBhcmd1bWVudFwiKSkge1xyXG4gICAgICAvLyBGb3IgY2FzZXMgbGlrZSAnZmlyc3QgYXJndW1lbnQnXHJcbiAgICAgIG1zZyA9IGBUaGUgJHtuYW1lfSAke2RldGVybWluZXJ9ICR7b25lT2YoZXhwZWN0ZWQsIFwidHlwZVwiKX1gXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zdCB0eXBlID0gbmFtZS5pbmNsdWRlcyhcIi5cIikgPyBcInByb3BlcnR5XCIgOiBcImFyZ3VtZW50XCJcclxuICAgICAgbXNnID0gYFRoZSBcIiR7bmFtZX1cIiAke3R5cGV9ICR7ZGV0ZXJtaW5lcn0gJHtvbmVPZihleHBlY3RlZCwgXCJ0eXBlXCIpfWBcclxuICAgIH1cclxuXHJcbiAgICAvLyBUT0RPKEJyaWRnZUFSKTogSW1wcm92ZSB0aGUgb3V0cHV0IGJ5IHNob3dpbmcgYG51bGxgIGFuZCBzaW1pbGFyLlxyXG4gICAgbXNnICs9IGAuIFJlY2VpdmVkIHR5cGUgJHt0eXBlb2YgYWN0dWFsfWBcclxuICAgIHN1cGVyKG1zZylcclxuICB9XHJcbn1cclxuXHJcbmNsYXNzIEVSUl9NSVNTSU5HX0FSR1MgZXh0ZW5kcyBUeXBlRXJyb3Ige1xyXG4gIGNvbnN0cnVjdG9yKC4uLnBhcmFtcykge1xyXG4gICAgbGV0IG1zZyA9IFwiVGhlIFwiXHJcbiAgICBjb25zdCBsZW4gPSBwYXJhbXMubGVuZ3RoXHJcbiAgICBjb25zdCBhcmdzID0gcGFyYW1zLm1hcChhID0+IGBcIiR7YX1cImApXHJcbiAgICBzd2l0Y2ggKGxlbikge1xyXG4gICAgICBjYXNlIDE6XHJcbiAgICAgICAgbXNnICs9IGAke2FyZ3NbMF19IGFyZ3VtZW50YFxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgMjpcclxuICAgICAgICBtc2cgKz0gYCR7YXJnc1swXX0gYW5kICR7YXJnc1sxXX0gYXJndW1lbnRzYFxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgbXNnICs9IGFyZ3Muc2xpY2UoMCwgbGVuIC0gMSkuam9pbihcIiwgXCIpXHJcbiAgICAgICAgbXNnICs9IGAsIGFuZCAke2FyZ3NbbGVuIC0gMV19IGFyZ3VtZW50c2BcclxuICAgICAgICBicmVha1xyXG4gICAgfVxyXG4gICAgc3VwZXIoYCR7bXNnfSBtdXN0IGJlIHNwZWNpZmllZGApXHJcbiAgfVxyXG59XHJcblxyXG5jbGFzcyBFUlJfU09DS0VUX0FMUkVBRFlfQk9VTkQgZXh0ZW5kcyBFcnJvciB7XHJcbiAgY29uc3RydWN0b3IoKSB7XHJcbiAgICBzdXBlcihcIlNvY2tldCBpcyBhbHJlYWR5IGJvdW5kXCIpXHJcbiAgfVxyXG59XHJcblxyXG5jbGFzcyBFUlJfU09DS0VUX0JBRF9CVUZGRVJfU0laRSBleHRlbmRzIFR5cGVFcnJvciB7XHJcbiAgY29uc3RydWN0b3IoKSB7XHJcbiAgICBzdXBlcihcIkJ1ZmZlciBzaXplIG11c3QgYmUgYSBwb3NpdGl2ZSBpbnRlZ2VyXCIpXHJcbiAgfVxyXG59XHJcblxyXG5jbGFzcyBFUlJfU09DS0VUX0JBRF9QT1JUIGV4dGVuZHMgUmFuZ2VFcnJvciB7XHJcbiAgY29uc3RydWN0b3IocG9ydCkge1xyXG4gICAgc3VwZXIoXCJQb3J0IHNob3VsZCBiZSA+IDAgYW5kIDwgNjU1MzYuIFJlY2VpdmVkICR7cG9ydH0uXCIpXHJcbiAgfVxyXG59XHJcblxyXG5jbGFzcyBFUlJfU09DS0VUX0JBRF9UWVBFIGV4dGVuZHMgVHlwZUVycm9yIHtcclxuICBjb25zdHJ1Y3RvcigpIHtcclxuICAgIHN1cGVyKFwiQmFkIHNvY2tldCB0eXBlIHNwZWNpZmllZC4gVmFsaWQgdHlwZXMgYXJlOiB1ZHA0LCB1ZHA2XCIpXHJcbiAgfVxyXG59XHJcblxyXG5jbGFzcyBFUlJfU09DS0VUX0JVRkZFUl9TSVpFIGV4dGVuZHMgRXJyb3Ige1xyXG4gIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgc3VwZXIoXCJDb3VsZCBub3QgZ2V0IG9yIHNldCBidWZmZXIgc2l6ZVwiKVxyXG4gIH1cclxufVxyXG5cclxuY2xhc3MgRVJSX1NPQ0tFVF9DQU5OT1RfU0VORCBleHRlbmRzIEVycm9yIHtcclxuICBjb25zdHJ1Y3RvcigpIHtcclxuICAgIHN1cGVyKFwiVW5hYmxlIHRvIHNlbmQgZGF0YVwiKVxyXG4gIH1cclxufVxyXG5cclxuY2xhc3MgRVJSX1NPQ0tFVF9ER1JBTV9OT1RfUlVOTklORyBleHRlbmRzIEVycm9yIHtcclxuICBjb25zdHJ1Y3RvcigpIHtcclxuICAgIHN1cGVyKFwiTm90IHJ1bm5pbmdcIilcclxuICB9XHJcbn1cclxuXHJcbmNsYXNzIFN5c3RlbUVycm9yIGV4dGVuZHMgRXJyb3Ige1xyXG4gIGNvZGU6IG51bWJlclxyXG4gIHN5c2NhbGw6IHN0cmluZ1xyXG4gIGNvbnN0cnVjdG9yKG1lc3NhZ2UsIGNvZGUsIHN5c2NhbGwpIHtcclxuICAgIHN1cGVyKG1lc3NhZ2UpXHJcbiAgICB0aGlzLmNvZGUgPSBjb2RlXHJcbiAgICB0aGlzLnN5c2NhbGwgPSBzeXNjYWxsXHJcbiAgfVxyXG4gIGdldCBlcnJubygpIHtcclxuICAgIHJldHVybiB0aGlzLmNvZGVcclxuICB9XHJcbn1cclxuXHJcbmNvbnN0IGVycm5vRXhjZXB0aW9uID0gKGVyciwgc3lzY2FsbCwgb3JpZ2luYWwpID0+IHtcclxuICBjb25zdCBjb2RlID0gZXJyLm1lc3NhZ2VcclxuICBjb25zdCBtZXNzYWdlID0gb3JpZ2luYWxcclxuICAgID8gYCR7c3lzY2FsbH0gJHtjb2RlfSAke29yaWdpbmFsfWBcclxuICAgIDogYCR7c3lzY2FsbH0gJHtjb2RlfWBcclxuXHJcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XHJcbiAgY29uc3QgZXggPSBuZXcgU3lzdGVtRXJyb3IobWVzc2FnZSwgY29kZSwgc3lzY2FsbClcclxuXHJcbiAgcmV0dXJuIGV4XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNsaWNlQnVmZmVyKHNvdXJjZSwgb2Zmc2V0LCBsZW5ndGgpIHtcclxuICBsZXQgYnVmZmVyID0gc291cmNlXHJcbiAgaWYgKHR5cGVvZiBidWZmZXIgPT09IFwic3RyaW5nXCIpIHtcclxuICAgIGJ1ZmZlciA9IEJ1ZmZlci5mcm9tKGJ1ZmZlcilcclxuICB9IGVsc2UgaWYgKCFpc1VpbnQ4QXJyYXkoYnVmZmVyKSkge1xyXG4gICAgdGhyb3cgbmV3IEVSUl9JTlZBTElEX0FSR19UWVBFKFxyXG4gICAgICBcImJ1ZmZlclwiLFxyXG4gICAgICBbXCJCdWZmZXJcIiwgXCJVaW50OEFycmF5XCIsIFwic3RyaW5nXCJdLFxyXG4gICAgICBidWZmZXJcclxuICAgIClcclxuICB9XHJcblxyXG4gIGNvbnN0IHN0YXJ0ID0gb2Zmc2V0ID4+PiAwXHJcbiAgY29uc3QgZW5kID0gc3RhcnQgKyAobGVuZ3RoID4+PiAwKVxyXG5cclxuICByZXR1cm4gYnVmZmVyLnNsaWNlKHN0YXJ0LCBlbmQpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZpeEJ1ZmZlckxpc3QobGlzdCkge1xyXG4gIGNvbnN0IG5ld2xpc3QgPSBuZXcgQXJyYXkobGlzdC5sZW5ndGgpXHJcblxyXG4gIGZvciAodmFyIGkgPSAwLCBsID0gbGlzdC5sZW5ndGg7IGkgPCBsOyBpKyspIHtcclxuICAgIHZhciBidWYgPSBsaXN0W2ldXHJcbiAgICBpZiAodHlwZW9mIGJ1ZiA9PT0gXCJzdHJpbmdcIikgbmV3bGlzdFtpXSA9IEJ1ZmZlci5mcm9tKGJ1ZilcclxuICAgIGVsc2UgaWYgKCFpc1VpbnQ4QXJyYXkoYnVmKSkgcmV0dXJuIG51bGxcclxuICAgIGVsc2UgbmV3bGlzdFtpXSA9IGJ1ZlxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIG5ld2xpc3RcclxufVxyXG5cclxuY29uc3QgdG9Ob2RlRmFtaWx5ID0gZmFtaWx5ID0+IChmYW1pbHkgPT09IDIgPyBcInVkcDZcIiA6IFwidWRwNFwiKVxyXG5cclxuaW50ZXJmYWNlIExvb2t1cCB7XHJcbiAgKGhvc3RuYW1lOiBzdHJpbmcsIExvb2t1cENhbGxiYWNrKTogdm9pZDtcclxufVxyXG5cclxuaW50ZXJmYWNlIExvb2t1cENhbGxiYWNrIHtcclxuICAoP0Vycm9yLCBhZGRyZXNzOiBzdHJpbmcsIGZhbWlseTogNCB8IDYpOiB2b2lkO1xyXG59XHJcblxyXG5jb25zdCBmcm9tTm9kZUxvb2t1cCA9IChsb29rdXA6IExvb2t1cCkgPT4gKHtcclxuICByZXNvbHZlOiAoaG9zdG5hbWU6IHN0cmluZykgPT5cclxuICAgIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgbG9va3VwKGhvc3RuYW1lLCAoZXJyb3IsIGFkZHJlc3MsIGZhbWlseSkgPT4ge1xyXG4gICAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgICAgcmVqZWN0KGVycm9yKVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICByZXNvbHZlKHsgYWRkcmVzc2VzOiBbYWRkcmVzc10gfSlcclxuICAgICAgICB9XHJcbiAgICAgIH0pXHJcbiAgICB9KVxyXG59KVxyXG4iXX0=