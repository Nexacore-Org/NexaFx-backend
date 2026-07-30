/**
 * Minimal XML document model and serialiser.
 *
 * Regulator submissions are legal records, so the serialiser is deliberately
 * strict: it escapes markup, strips the control characters XML 1.0 forbids
 * outright, and normalises line endings so the bytes we store are the bytes a
 * parser reads back. Report builders assemble an XmlNode tree, the tree is
 * validated against a schema model, and only then is it serialised.
 */

export interface XmlNode {
  name: string;
  attrs?: Record<string, string>;
  /** Leaf text content. Mutually exclusive with `children`. */
  text?: string;
  children?: XmlNode[];
}

/**
 * Characters illegal in XML 1.0 at any position, so they cannot be escaped —
 * only removed. U+0009, U+000A and U+000D are legal whitespace and are
 * deliberately excluded from the class.
 */
const ILLEGAL_XML_CHARS = new RegExp(
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]',
  'g',
);

/**
 * Free text reaches us from analyst narratives, so normalise it before it
 * becomes part of a submitted document. CRLF collapses to LF because XML
 * parsers perform that normalisation on read — doing it up front keeps the
 * stored XML and the parsed value identical.
 */
export function sanitizeXmlText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(ILLEGAL_XML_CHARS, '').trim();
}

function escapeText(value: string): string {
  return sanitizeXmlText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}

/**
 * A leaf element, or `null` when the value is absent.
 *
 * Returning `null` lets builders list optional elements unconditionally and let
 * `branch` drop the empty ones, rather than threading conditionals through the
 * document shape.
 */
export function leaf(
  name: string,
  value: string | number | null | undefined,
): XmlNode | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'number' ? String(value) : value;
  if (sanitizeXmlText(text) === '') return null;
  return { name, text };
}

/** A leaf element that is emitted even when empty, as `<Name/>`. */
export function requiredLeaf(
  name: string,
  value: string | number | null | undefined,
): XmlNode {
  return leaf(name, value) ?? { name, text: '' };
}

/** A container element. `null` children are dropped. */
export function branch(
  name: string,
  children: (XmlNode | null)[],
  attrs?: Record<string, string>,
): XmlNode {
  const kept = children.filter((child): child is XmlNode => child !== null);
  return attrs ? { name, attrs, children: kept } : { name, children: kept };
}

export interface SerializeOptions {
  /** Emit the `<?xml ...?>` declaration. Defaults to true. */
  declaration?: boolean;
  /** Spaces per indent level. Defaults to 2. */
  indent?: number;
}

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

export function serializeXml(
  root: XmlNode,
  options: SerializeOptions = {},
): string {
  const indent = options.indent ?? 2;
  const body = serializeNode(root, 0, ' '.repeat(indent));
  return options.declaration === false ? body : `${XML_DECLARATION}\n${body}\n`;
}

function serializeNode(node: XmlNode, depth: number, unit: string): string {
  const pad = unit.repeat(depth);
  const open = `${node.name}${serializeAttrs(node.attrs)}`;

  if (node.children?.length) {
    const inner = node.children
      .map((child) => serializeNode(child, depth + 1, unit))
      .join('\n');
    return `${pad}<${open}>\n${inner}\n${pad}</${node.name}>`;
  }

  const text = node.text === undefined ? '' : escapeText(node.text);
  if (text === '') {
    return `${pad}<${open}/>`;
  }
  return `${pad}<${open}>${text}</${node.name}>`;
}

function serializeAttrs(attrs: Record<string, string> | undefined): string {
  if (!attrs) return '';
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
    .join('');
}
