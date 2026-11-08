// Why a request did not reach a gateway, said with what to change (network.ts `unreachable`): the reasons a company's
// network gives, as Node 24 reports them.

import { describe, expect, test } from "vitest";
import { unreachable } from "../src/network.ts";

const err = (code: string, message: string) => Object.assign(new Error("fetch failed"), { cause: Object.assign(new Error(message), { code }) });

describe("why a gateway was not reached", () => {
  test("it asks for a client certificate and was shown none (mTLS)", () => {
    const said = unreachable(err("ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED", "40BD4C8A8A7F0000:error:0A00045C:SSL routines:ssl3_read_bytes:tlsv13 alert certificate required:../deps/openssl/openssl/ssl/record/rec_layer_s3.c:918:SSL alert number 116"), "https://gw.example/v1");
    expect(said).toMatch(/^tlsv13 alert certificate required/);
    expect(said).toMatch(/client certificate \(mTLS\).*pfx \(with pfx_passphrase\) or cert and cert_key/);
  });
  test("it refused the certificate shown", () => {
    expect(unreachable(err("ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE", "sslv3 alert bad certificate"), "https://gw.example/v1")).toMatch(/refused the client certificate shown/);
  });
  test("the connection closed during the handshake", () => {
    expect(unreachable(err("ECONNRESET", "Client network socket disconnected before secure TLS connection was established"), "https://gw.example/v1")).toMatch(/closed during the TLS handshake/);
  });
  test("the proxy refused the tunnel, as https.Agent's proxy says it", () => {
    const said = unreachable(Object.assign(new Error("Failed to establish tunnel to gw.example:443 via http://proxy:3128: HTTP/1.1 403 Forbidden"), { code: "ERR_PROXY_TUNNEL" }), "https://gw.example/v1");
    expect(said).toMatch(/The proxy \(HTTPS_PROXY\) answered 403/);
    expect(unreachable(Object.assign(new Error("Failed to establish tunnel to gw.example:443 via http://proxy:3128: HTTP/1.1 407 Proxy Authentication Required"), { code: "ERR_PROXY_TUNNEL" }), "https://gw.example/v1")).toMatch(/refused with 407/);
  });
});
