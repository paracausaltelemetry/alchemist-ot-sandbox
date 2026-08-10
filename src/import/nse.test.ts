import { describe, expect, it } from "vitest";
import { parseNmapXml } from "./nmap";
import { parseNmapNormal } from "./nmapText";
import { cvesFromScripts, enrichFromScripts } from "./nse";

const XML = `<?xml version="1.0"?>
<nmaprun>
  <host>
    <status state="up"/>
    <address addr="10.0.9.20" addrtype="ipv4"/>
    <ports>
      <port protocol="tcp" portid="443">
        <state state="open"/>
        <service name="https"/>
        <script id="ssl-cert" output="Subject: commonName=vpn.example.net&#10;Not valid after: 2019-04-02T11:00:00"/>
        <script id="http-title" output="Remote Access Portal"/>
      </port>
      <port protocol="tcp" portid="445">
        <state state="open"/>
        <service name="microsoft-ds"/>
        <script id="smb-vuln-ms17-010" output="VULNERABLE: Remote Code Execution&#10;IDs: CVE:CVE-2017-0143"/>
      </port>
    </ports>
    <hostscript>
      <script id="smb-os-discovery" output="OS: Windows Server 2012 R2 Standard&#10;Computer name: FILE-01&#10;Domain name: corp.example.net"/>
    </hostscript>
  </host>
</nmaprun>`;

describe("NSE output from Nmap XML", () => {
  it("keeps a port's script results against that port", () => {
    const [host] = parseNmapXml(XML).hosts;
    const https = host.ports.find((port) => port.port === 443)!;
    expect(https.scripts?.map((script) => script.id)).toEqual(["ssl-cert", "http-title"]);
    expect(https.scripts?.[0].output).toContain("vpn.example.net");
  });

  it("keeps host-level scripts off the ports, because they are about the machine", () => {
    const [host] = parseNmapXml(XML).hosts;
    expect(host.scripts?.map((script) => script.id)).toEqual(["smb-os-discovery"]);
    expect(host.ports.every((port) => !port.scripts?.some((script) => script.id === "smb-os-discovery"))).toBe(true);
  });

  it("takes the OS and the name from what the host said over SMB", () => {
    // First-hand: the machine answering with its own name and build, where `osmatch` is a
    // fingerprint guess and a PTR record is whatever DNS was told years ago.
    const [host] = parseNmapXml(XML).hosts;
    expect(host.os).toBe("Windows Server 2012 R2 Standard");
    expect(host.hostname).toBe("FILE-01");
  });

  it("never overwrites what the scan reported directly", () => {
    const withOwn = parseNmapXml(
      XML.replace('<address addr="10.0.9.20" addrtype="ipv4"/>', '<address addr="10.0.9.20" addrtype="ipv4"/><hostnames><hostname name="dns-name"/></hostnames><os><osmatch name="Linux 3.2"/></os>')
    ).hosts[0];
    expect(withOwn.hostname).toBe("dns-name");
    expect(withOwn.os).toBe("Linux 3.2");
  });

  it("strips the NetBIOS padding Nmap writes out in full", () => {
    const enriched = enrichFromScripts({
      ports: [],
      scripts: [{ id: "smb-os-discovery", output: "Computer name: WIN-BUILD01\\x00" }]
    });
    expect(enriched.hostname).toBe("WIN-BUILD01");
  });

  it("leaves a host alone when nothing ran a script on it", () => {
    const host = { ip: "10.0.0.1", ports: [] };
    expect(enrichFromScripts(host)).toBe(host);
  });
});

describe("NSE output from normal output", () => {
  const NORMAL = `Nmap scan report for 10.0.9.20
Host is up (0.0011s latency).
PORT    STATE SERVICE
22/tcp  open  ssh     OpenSSH 8.9p1
| ssh-hostkey:
|   3072 aa:bb:cc:dd (RSA)
|_  256 ee:ff:00:11 (ED25519)
443/tcp open  https
|_http-title: Remote Access Portal

Host script results:
| smb-os-discovery:
|   OS: Windows Server 2012 R2 Standard
|_  Computer name: FILE-01

Nmap done: 1 IP address (1 host up) scanned in 2.31 seconds`;

  it("files each script under the port it was printed beneath", () => {
    const [host] = parseNmapNormal(NORMAL).hosts;
    expect(host.ports.find((port) => port.port === 22)!.scripts?.map((script) => script.id)).toEqual(["ssh-hostkey"]);
    expect(host.ports.find((port) => port.port === 443)!.scripts?.map((script) => script.id)).toEqual(["http-title"]);
  });

  it("reads a continuation line as more of the same script, not a new one", () => {
    // `|   3072 aa:bb:cc:dd (RSA)` has a colon in it. Splitting on colons would invent a script
    // called `3072 aa` and lose the key it was reporting.
    const [host] = parseNmapNormal(NORMAL).hosts;
    const keys = host.ports.find((port) => port.port === 22)!.scripts![0];
    expect(keys.output).toContain("3072 aa:bb:cc:dd (RSA)");
    expect(keys.output).toContain("256 ee:ff:00:11 (ED25519)");
  });

  it("puts the host-script block on the host", () => {
    const [host] = parseNmapNormal(NORMAL).hosts;
    expect(host.scripts?.[0].id).toBe("smb-os-discovery");
    expect(host.os).toBe("Windows Server 2012 R2 Standard");
    expect(host.hostname).toBe("FILE-01");
  });

  it("does not carry a script across to the next host in the file", () => {
    const two = `${NORMAL}\nNmap scan report for 10.0.9.21\nPORT   STATE SERVICE\n80/tcp open  http\n`;
    const hosts = parseNmapNormal(two).hosts;
    expect(hosts[1].scripts).toBeUndefined();
    expect(hosts[1].ports[0].scripts).toBeUndefined();
  });
});

describe("the CVEs a scan named", () => {
  it("pulls identifiers out of whatever prose the script wrote them in", () => {
    const [host] = parseNmapXml(XML).hosts;
    const scripts = host.ports.flatMap((port) => port.scripts ?? []);
    expect(cvesFromScripts(scripts)).toEqual(["CVE-2017-0143"]);
  });

  it("reports each one once, however many scripts mentioned it", () => {
    const found = cvesFromScripts([
      { id: "vulners", output: "cve-2021-44228 10.0 https://vulners.com/…" },
      { id: "http-vuln-cve2021-44228", output: "State: VULNERABLE CVE-2021-44228" }
    ]);
    expect(found).toEqual(["CVE-2021-44228"]);
  });

  it("finds nothing in a clean scan rather than guessing", () => {
    expect(cvesFromScripts([{ id: "http-title", output: "Welcome" }])).toEqual([]);
  });
});
