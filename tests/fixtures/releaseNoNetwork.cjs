// Only loaded by the production release smoke test, never by the application.
// Prevent startup's background seed and any provider client from reaching a database or network service.
const net = require("node:net");
net.Socket.prototype.connect = function () {
  throw new Error("Outbound connections are disabled in the release smoke test");
};
// Exercise proxy failure through fetch's rejected-Promise contract; a synchronous socket throw inside undici
// bypasses that contract and can crash the test child. No HTTP/database/provider request is allowed out.
globalThis.fetch = async function () {
  throw new Error("Outbound HTTP is disabled in the release smoke test");
};
