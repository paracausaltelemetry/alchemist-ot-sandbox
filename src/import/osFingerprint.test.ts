import { describe, expect, it } from "vitest";
import { parseNmapXml } from "./nmap";
import { parseNmapNormal } from "./nmapText";
import { classifyItDevice } from "./itInference";

describe("what the OS fingerprint says", () => {
  it("takes the best match, not the first one printed", () => {
    // Nmap usually prints them in accuracy order and nothing in the format promises it. Taking the
    // wrong one names the host after a worse guess.
    const xml = `<?xml version="1.0"?><nmaprun><host><status state="up"/><address addr="10.0.1.5" addrtype="ipv4"/><ports/><os><osmatch name="Linux 2.6" accuracy="88"/><osmatch name="Linux 5.4" accuracy="97"/></os></host></nmaprun>`;
    const [host] = parseNmapXml(xml).hosts;
    expect(host.os).toBe("Linux 5.4");
    expect(host.osAccuracy).toBe(97);
  });

  it("keeps Nmap's own device class", () => {
    const xml = `<?xml version="1.0"?><nmaprun><host><status state="up"/><address addr="10.0.1.1" addrtype="ipv4"/><ports/><os><osclass type="firewall" vendor="Cisco"/><osmatch name="Cisco ASA" accuracy="95"/></os></host></nmaprun>`;
    expect(parseNmapXml(xml).hosts[0].deviceTypeHint).toBe("firewall");
  });

  it("ignores `general purpose`, which is Nmap declining to say", () => {
    // Treating it as a verdict would displace better evidence with nothing.
    const xml = `<?xml version="1.0"?><nmaprun><host><status state="up"/><address addr="10.0.1.6" addrtype="ipv4"/><ports/><os><osclass type="general purpose" vendor="Microsoft"/></os></host></nmaprun>`;
    expect(parseNmapXml(xml).hosts[0].deviceTypeHint).toBeUndefined();
  });

  it("reads the device type and the guess confidence from normal output", () => {
    const text = `Nmap scan report for 10.0.1.1
PORT   STATE SERVICE
22/tcp open  ssh

Device type: firewall|router
Running: Cisco ASA
Aggressive OS guesses: Cisco ASA 9.1 (88%), Cisco ASA 8.4 (85%)
`;
    const [host] = parseNmapNormal(text).hosts;
    expect(host.deviceTypeHint).toBe("firewall");
    expect(host.os).toBe("Cisco ASA 9.1");
    expect(host.osAccuracy).toBe(88);
  });

  it("classifies from the fingerprint database rather than from open ports", () => {
    // Our own classifier is guessing from a hostname and a port list; the database recognised the
    // TCP/IP stack. Where it has spoken, it is the better evidence.
    expect(classifyItDevice({ ip: "10.0.1.1", deviceTypeHint: "firewall", ports: [{ port: 22 }] })).toBe("firewall");
    expect(classifyItDevice({ ip: "10.0.1.2", deviceTypeHint: "printer", ports: [{ port: 80 }] })).toBe("printer");
  });

  it("still lets observed routing win, because that is behaviour rather than a lookup", () => {
    const kind = classifyItDevice(
      { ip: "10.0.1.3", deviceTypeHint: "printer", ports: [] },
      { isTracerouteHop: true }
    );
    expect(kind).toBe("router");
  });
});
