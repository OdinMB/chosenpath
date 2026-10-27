// The network half of the guard, installed in every process the harness
// starts (and in the harness itself): a socket may connect only to a port the
// harness started on 127.0.0.1, and every server listens on 127.0.0.1 on a
// port the system picks. A refused connection fails with ECONNREFUSED, before
// any DNS lookup, and is reported, which fails the run.

import net from "node:net";
import { connectionAllowed, isPipeTarget } from "./guard.mjs";

/** The target of a Socket#connect call, whichever of its signatures was used. */
export function connectTarget(args) {
  let first = args[0];
  // net.connect() passes its normalized [options, callback] pair
  if (Array.isArray(first)) first = first[0];
  if (first && typeof first === "object") {
    return { host: first.host, port: first.port, path: first.path };
  }
  if (typeof first === "string" && !/^\d+$/.test(first)) return { path: first };
  return { port: first, host: typeof args[1] === "string" ? args[1] : undefined };
}

/** How a refused target is reported: a pipe by its path, anything else as host:port. */
export function describeTarget(target) {
  if (isPipeTarget(target)) return `socket ${target.path}`;
  return `${target.host ?? "localhost"}:${target.port}`;
}

let connectGuarded = false;

/** Refuses every connection not on `allowedPorts()` (or the array) on 127.0.0.1. */
export function installConnectGuard({ allowedPorts, onRefused }) {
  if (connectGuarded) return;
  connectGuarded = true;
  const ports = typeof allowedPorts === "function" ? allowedPorts : () => allowedPorts;
  const original = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedConnect(...args) {
    const target = connectTarget(args);
    if (connectionAllowed(target, ports())) return original.apply(this, args);
    onRefused(describeTarget(target));
    const error = Object.assign(new Error(`The harness refused a connection to ${describeTarget(target)}`), {
      code: "ECONNREFUSED",
    });
    process.nextTick(() => this.destroy(error));
    return this;
  };
}

let listenGuarded = false;

/** Moves every listen onto 127.0.0.1 and a port the system picks; refuses pipes and unix sockets. */
export function installListenGuard({ onListening }) {
  if (listenGuarded) return;
  listenGuarded = true;
  const original = net.Server.prototype.listen;
  net.Server.prototype.listen = function guardedListen(...args) {
    const first = args[0];
    const callback = typeof args[args.length - 1] === "function" ? args[args.length - 1] : undefined;
    let requested;
    if (first && typeof first === "object") {
      if (first.path !== undefined) throw new Error("The harness allows no listening on a pipe or unix socket");
      requested = first.port;
    } else if (typeof first === "string" && !/^\d+$/.test(first)) {
      throw new Error("The harness allows no listening on a pipe or unix socket");
    } else {
      requested = first;
    }
    this.once("listening", () => {
      const address = this.address();
      onListening({ requested: requested === undefined ? null : Number(requested), port: address?.port });
    });
    return original.call(this, { port: 0, host: "127.0.0.1" }, callback);
  };
}
