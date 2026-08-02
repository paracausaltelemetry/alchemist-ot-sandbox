/**
 * An illustrative Nmap scan so the mapper can be tried without running one. Written as `-oN`
 * with `--traceroute`, because the traceroute is what lets the map draw real paths rather than
 * inferring every link: the hops name `10.10.1.1` and `10.10.2.1` as routers, which is how the
 * two subnets end up connected to each other rather than floating side by side. The second
 * traceroute uses nmap's collapsed form, which is what it really prints once a path repeats.
 *
 * It opens with the real `-oN` banner, which is also the only place normal output records when the
 * scan ran.
 *
 * Illustrative only — the addresses are documentation ranges (RFC 5737) and no real network is
 * described here.
 */
export const SAMPLE_SCAN = `Starting Nmap 7.94 ( https://nmap.org ) at 2024-04-04 10:00 BST
Nmap scan report for edge-fw (198.51.100.4)
Host is up.
PORT     STATE SERVICE
443/tcp  open  https
22/tcp   open  ssh

Nmap scan report for web-1 (198.51.100.10)
Host is up.
PORT     STATE SERVICE
80/tcp   open  http
443/tcp  open  https
3389/tcp open  ms-wbt-server

Nmap scan report for core-rtr (10.10.1.1)
Host is up.
PORT     STATE SERVICE
22/tcp   open  ssh
161/tcp  open  snmp

Nmap scan report for dc-1 (10.10.1.10)
Host is up.
PORT     STATE SERVICE
53/tcp   open  domain
389/tcp  open  ldap
445/tcp  open  microsoft-ds
88/tcp   open  kerberos-sec
MAC Address: 00:15:5D:00:11:22 (Microsoft)
OS details: Windows Server 2019

Nmap scan report for file-1 (10.10.1.20)
Host is up.
PORT     STATE SERVICE
445/tcp  open  microsoft-ds
139/tcp  open  netbios-ssn

Nmap scan report for print-1 (10.10.1.55)
Host is up.
PORT     STATE SERVICE
161/tcp  open  snmp
9100/tcp open  jetdirect

Nmap scan report for db-1 (10.10.2.30)
Host is up.
PORT     STATE SERVICE
3306/tcp open  mysql
22/tcp   open  ssh
Network Distance: 2 hops

TRACEROUTE (using port 443/tcp)
HOP RTT      ADDRESS
1   0.42 ms  10.10.1.1
2   1.18 ms  dist-rtr (10.10.2.1)
3   1.31 ms  10.10.2.30

Nmap scan report for hmi-legacy (10.10.2.40)
Host is up.
PORT     STATE SERVICE
23/tcp   open  telnet
5900/tcp open  vnc
Network Distance: 2 hops

TRACEROUTE (using port 5900/tcp)
HOP RTT      ADDRESS
-   Hops 1-2 are the same as for 10.10.2.30
3   1.44 ms  10.10.2.40
`;
