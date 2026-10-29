/**
 * Turns a client IP into the key its login attempts are counted under. It
 * only normalises: where the IP comes from is the login action's
 * `clientIp()` (issue #16). IPv4 keeps the whole address; IPv6 keeps the
 * /64, written one way, so spelling variants cannot spread a guesser across
 * keys. Anything unparseable is kept as given.
 */

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const GROUP = /^[0-9a-f]{1,4}$/i;

function expandIpv6(address: string): string[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string): string[] | null => {
    if (part === "") return [];
    const groups = part.split(":");
    const last = groups[groups.length - 1];
    if (last !== undefined && IPV4.test(last)) {
      const octets = last.split(".").map(Number);
      if (octets.some((o) => o > 255)) return null;
      const [a, b, c, d] = octets as [number, number, number, number];
      groups.splice(-1, 1, ((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
    }
    return groups;
  };
  const head = toGroups(halves[0] ?? "");
  const tail = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  if (!head || !tail) return null;
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8 || !groups.every((g) => GROUP.test(g))) return null;
  return groups;
}

export function clientKey(ip: string): string {
  const address = ip.split("%")[0] ?? ip;
  if (IPV4.test(address)) return `ip:${address}`;
  const mapped = MAPPED.exec(address);
  if (mapped?.[1]) return `ip:${mapped[1]}`;
  const groups = address.includes(":") ? expandIpv6(address) : null;
  if (!groups) return `ip:${ip}`;
  return `net:${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":")}::/64`;
}
