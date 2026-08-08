/**
 * A small, dependency-free XML parser. The app runs in the browser (where DOMParser exists)
 * but the unit tests run in the node environment (where it does not), so a tiny hand-rolled
 * parser keeps the import code identical and fully testable everywhere. It is deliberately
 * lenient: it skips the XML declaration, DOCTYPE, processing instructions and comments, and
 * treats CDATA as text. It is sufficient for the well-formed Nmap and GraphML files we ingest.
 */
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === "#") {
      const codePoint = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    switch (body) {
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "amp":
        return "&";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        return match;
    }
  });
}

function findTagEnd(input: string, start: number): number {
  let quote = "";
  for (let i = start + 1; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (char === quote) {
        quote = "";
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return i;
    }
  }
  return input.length;
}

function parseTag(inner: string): { name: string; attrs: Record<string, string> } {
  const trimmed = inner.trim();
  const attrs: Record<string, string> = {};
  let i = 0;
  let name = "";
  while (i < trimmed.length && !/\s/.test(trimmed[i])) {
    name += trimmed[i];
    i += 1;
  }
  while (i < trimmed.length) {
    while (i < trimmed.length && /\s/.test(trimmed[i])) {
      i += 1;
    }
    let key = "";
    while (i < trimmed.length && trimmed[i] !== "=" && !/\s/.test(trimmed[i])) {
      key += trimmed[i];
      i += 1;
    }
    while (i < trimmed.length && /\s/.test(trimmed[i])) {
      i += 1;
    }
    if (trimmed[i] === "=") {
      i += 1;
      while (i < trimmed.length && /\s/.test(trimmed[i])) {
        i += 1;
      }
      const quote = trimmed[i];
      let value = "";
      if (quote === '"' || quote === "'") {
        i += 1;
        while (i < trimmed.length && trimmed[i] !== quote) {
          value += trimmed[i];
          i += 1;
        }
        i += 1;
      } else {
        while (i < trimmed.length && !/\s/.test(trimmed[i])) {
          value += trimmed[i];
          i += 1;
        }
      }
      if (key) {
        attrs[key.toLowerCase()] = decodeEntities(value);
      }
    } else if (key) {
      attrs[key.toLowerCase()] = "";
    }
  }
  return { name: name.toLowerCase(), attrs };
}

/** Parses XML text into a tree rooted at a synthetic `#document` node. */
export function parseXml(input: string): XmlNode {
  const root: XmlNode = { name: "#document", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let i = 0;

  while (i < input.length) {
    if (input[i] === "<") {
      if (input.startsWith("<!--", i)) {
        const end = input.indexOf("-->", i + 4);
        i = end < 0 ? input.length : end + 3;
        continue;
      }
      if (input.startsWith("<![CDATA[", i)) {
        const end = input.indexOf("]]>", i + 9);
        stack[stack.length - 1].text += input.slice(i + 9, end < 0 ? input.length : end);
        i = end < 0 ? input.length : end + 3;
        continue;
      }
      if (input.startsWith("<?", i)) {
        const end = input.indexOf("?>", i + 2);
        i = end < 0 ? input.length : end + 2;
        continue;
      }
      if (input.startsWith("<!", i)) {
        const end = input.indexOf(">", i + 2);
        i = end < 0 ? input.length : end + 1;
        continue;
      }
      if (input[i + 1] === "/") {
        const end = input.indexOf(">", i);
        if (stack.length > 1) {
          stack.pop();
        }
        i = end < 0 ? input.length : end + 1;
        continue;
      }
      const end = findTagEnd(input, i);
      const raw = input.slice(i + 1, end);
      const selfClosing = raw.endsWith("/");
      const { name, attrs } = parseTag(selfClosing ? raw.slice(0, -1) : raw);
      const node: XmlNode = { name, attrs, children: [], text: "" };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) {
        stack.push(node);
      }
      i = end + 1;
    } else {
      const next = input.indexOf("<", i);
      const slice = input.slice(i, next < 0 ? input.length : next);
      stack[stack.length - 1].text += decodeEntities(slice);
      i = next < 0 ? input.length : next;
    }
  }

  return root;
}

/** Direct children whose tag name matches (case-insensitive). */
export function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  const lower = name.toLowerCase();
  return node.children.filter((child) => child.name === lower);
}

/** First direct child with the given tag name, if any. */
export function firstChild(node: XmlNode, name: string): XmlNode | undefined {
  const lower = name.toLowerCase();
  return node.children.find((child) => child.name === lower);
}

/** All descendants with the given tag name, depth-first. */
export function findAll(node: XmlNode, name: string): XmlNode[] {
  const lower = name.toLowerCase();
  const matches: XmlNode[] = [];
  const walk = (current: XmlNode) => {
    for (const child of current.children) {
      if (child.name === lower) {
        matches.push(child);
      }
      walk(child);
    }
  };
  walk(node);
  return matches;
}
