import { branch, leaf, serializeXml, XmlNode } from './xml-builder';

/**
 * Declarative XML schema model, validator, and XSD renderer.
 *
 * A regulator format is described once as an `XmlSchema` — an `xsd:sequence`
 * tree with occurrence bounds, simple types and facets. That single definition
 * is both the runtime validator (`validateXml`) and the source of the published
 * `.xsd` (`renderXsd`), so the schema we validate against and the schema we hand
 * an auditor cannot drift apart.
 */

export type XmlSimpleType =
  | 'string'
  | 'date'
  | 'dateTime'
  | 'decimal'
  | 'integer'
  | 'boolean';

export interface XmlElementRule {
  name: string;
  /** Child sequence. Present for container elements, absent for leaves. */
  children?: readonly XmlElementRule[];
  /** Simple type of a leaf's text. Defaults to 'string'. */
  type?: XmlSimpleType;
  /** Defaults to 1. Use 0 for an optional element. */
  minOccurs?: number;
  /** Defaults to 1. */
  maxOccurs?: number | 'unbounded';
  /** Permitted values, rendered as an xsd:enumeration restriction. */
  enum?: readonly string[];
  maxLength?: number;
  /** Anchored pattern, rendered as an xsd:pattern facet. */
  pattern?: { source: string; describedAs: string };
  /** Documentation carried into the rendered XSD. */
  documentation?: string;
}

export interface XmlSchema {
  /** Target namespace, emitted as the root element's default xmlns. */
  namespace: string;
  /** Schema version, e.g. '4.0' for goAML. */
  version: string;
  root: XmlElementRule;
}

export interface XmlValidationError {
  /** Slash-delimited element path, e.g. 'Report/Accounts/Account'. */
  path: string;
  message: string;
}

const TYPE_CHECKS: Record<
  XmlSimpleType,
  { test: (value: string) => boolean; expected: string }
> = {
  string: { test: () => true, expected: 'a string' },
  date: {
    test: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && isRealDate(value),
    expected: 'an xsd:date (YYYY-MM-DD)',
  },
  dateTime: {
    test: (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value) &&
      isRealDate(value.slice(0, 10)),
    expected: 'an xsd:dateTime (YYYY-MM-DDThh:mm:ss)',
  },
  decimal: {
    test: (value) => /^-?\d+(\.\d+)?$/.test(value),
    expected: 'an xsd:decimal',
  },
  integer: { test: (value) => /^-?\d+$/.test(value), expected: 'an xsd:int' },
  boolean: {
    test: (value) => ['true', 'false', '0', '1'].includes(value),
    expected: 'an xsd:boolean',
  },
};

function isRealDate(isoDate: string): boolean {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function maxOf(rule: XmlElementRule): number {
  if (rule.maxOccurs === 'unbounded') return Number.POSITIVE_INFINITY;
  return rule.maxOccurs ?? 1;
}

function minOf(rule: XmlElementRule): number {
  return rule.minOccurs ?? 1;
}

/**
 * Validate a document tree against a schema.
 *
 * Returns every problem found rather than throwing on the first, so a failed
 * generation can report the complete list to the operator in one response.
 */
export function validateXml(
  root: XmlNode,
  schema: XmlSchema,
): XmlValidationError[] {
  const errors: XmlValidationError[] = [];

  if (root.name !== schema.root.name) {
    errors.push({
      path: root.name,
      message: `Root element must be <${schema.root.name}>, found <${root.name}>`,
    });
    return errors;
  }

  const declared = root.attrs?.xmlns;
  if (declared !== schema.namespace) {
    errors.push({
      path: root.name,
      message: `Root xmlns must be '${schema.namespace}', found '${declared ?? 'none'}'`,
    });
  }

  validateElement(root, schema.root, root.name, errors);
  return errors;
}

function validateElement(
  node: XmlNode,
  rule: XmlElementRule,
  path: string,
  errors: XmlValidationError[],
): void {
  if (!rule.children) {
    validateLeaf(node, rule, path, errors);
    return;
  }

  if (node.text !== undefined && node.text !== '') {
    errors.push({
      path,
      message: `<${rule.name}> is a container element and must not carry text`,
    });
  }

  validateSequence(node.children ?? [], rule.children, path, errors);
}

/**
 * Walk the actual children against the declared xsd:sequence in order. Because
 * a sequence is ordered, an element appearing out of position is reported as
 * unexpected rather than silently accepted.
 */
function validateSequence(
  actual: readonly XmlNode[],
  sequence: readonly XmlElementRule[],
  path: string,
  errors: XmlValidationError[],
): void {
  let cursor = 0;

  for (const rule of sequence) {
    const matched: XmlNode[] = [];
    while (cursor < actual.length && actual[cursor].name === rule.name) {
      matched.push(actual[cursor]);
      cursor++;
    }

    if (matched.length < minOf(rule)) {
      errors.push({
        path: `${path}/${rule.name}`,
        message:
          matched.length === 0
            ? `Required element <${rule.name}> is missing`
            : `<${rule.name}> requires at least ${minOf(rule)} occurrence(s), found ${matched.length}`,
      });
    }

    const max = maxOf(rule);
    if (matched.length > max) {
      errors.push({
        path: `${path}/${rule.name}`,
        message: `<${rule.name}> permits at most ${max} occurrence(s), found ${matched.length}`,
      });
    }

    matched.forEach((child, index) => {
      const childPath =
        matched.length > 1
          ? `${path}/${rule.name}[${index + 1}]`
          : `${path}/${rule.name}`;
      validateElement(child, rule, childPath, errors);
    });
  }

  for (; cursor < actual.length; cursor++) {
    const stray = actual[cursor];
    const declaredHere = sequence.some((rule) => rule.name === stray.name);
    errors.push({
      path: `${path}/${stray.name}`,
      message: declaredHere
        ? `<${stray.name}> appears out of sequence order`
        : `<${stray.name}> is not declared in <${path.split('/').pop()}>`,
    });
  }
}

function validateLeaf(
  node: XmlNode,
  rule: XmlElementRule,
  path: string,
  errors: XmlValidationError[],
): void {
  if (node.children?.length) {
    errors.push({
      path,
      message: `<${rule.name}> is a simple-typed element and must not have child elements`,
    });
    return;
  }

  const value = node.text ?? '';

  if (value === '') {
    // An element only reaches validation when the builder emitted it, so an
    // empty one is a missing value rather than an intentional omission.
    errors.push({ path, message: `<${rule.name}> must not be empty` });
    return;
  }

  const type = rule.type ?? 'string';
  const check = TYPE_CHECKS[type];
  if (!check.test(value)) {
    errors.push({
      path,
      message: `<${rule.name}> must be ${check.expected}, found '${value}'`,
    });
  }

  if (rule.enum && !rule.enum.includes(value)) {
    errors.push({
      path,
      message: `<${rule.name}> must be one of ${rule.enum.join(', ')}, found '${value}'`,
    });
  }

  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    errors.push({
      path,
      message: `<${rule.name}> exceeds maxLength ${rule.maxLength} (${value.length} characters)`,
    });
  }

  if (rule.pattern && !new RegExp(`^(?:${rule.pattern.source})$`).test(value)) {
    errors.push({
      path,
      message: `<${rule.name}> must be ${rule.pattern.describedAs}`,
    });
  }
}

export function formatValidationErrors(errors: XmlValidationError[]): string {
  return errors.map((e) => `${e.path}: ${e.message}`).join('; ');
}

/**
 * Render the schema as an XSD document.
 *
 * Lets compliance staff hand the exact schema the generator validates against to
 * a regulator or an external validator such as `xmllint --schema`.
 */
export function renderXsd(schema: XmlSchema): string {
  const root = branch(
    'xs:schema',
    [renderElement(schema.root)],
    {
      'xmlns:xs': 'http://www.w3.org/2001/XMLSchema',
      targetNamespace: schema.namespace,
      xmlns: schema.namespace,
      elementFormDefault: 'qualified',
      version: schema.version,
    },
  );
  return serializeXml(root);
}

function renderElement(rule: XmlElementRule): XmlNode {
  const attrs: Record<string, string> = { name: rule.name };
  if (rule.minOccurs !== undefined) attrs.minOccurs = String(rule.minOccurs);
  if (rule.maxOccurs !== undefined) attrs.maxOccurs = String(rule.maxOccurs);

  const annotation = rule.documentation
    ? branch('xs:annotation', [leaf('xs:documentation', rule.documentation)])
    : null;

  if (rule.children) {
    return branch(
      'xs:element',
      [
        annotation,
        branch('xs:complexType', [
          branch('xs:sequence', rule.children.map(renderElement)),
        ]),
      ],
      attrs,
    );
  }

  const facets = renderFacets(rule);
  if (!facets.length) {
    attrs.type = `xs:${xsdTypeName(rule.type ?? 'string')}`;
    return branch('xs:element', [annotation], attrs);
  }

  return branch(
    'xs:element',
    [
      annotation,
      branch('xs:simpleType', [
        branch('xs:restriction', facets, {
          base: `xs:${xsdTypeName(rule.type ?? 'string')}`,
        }),
      ]),
    ],
    attrs,
  );
}

function renderFacets(rule: XmlElementRule): XmlNode[] {
  const facets: XmlNode[] = [];
  for (const value of rule.enum ?? []) {
    facets.push({ name: 'xs:enumeration', attrs: { value } });
  }
  if (rule.maxLength !== undefined) {
    facets.push({
      name: 'xs:maxLength',
      attrs: { value: String(rule.maxLength) },
    });
  }
  if (rule.pattern) {
    facets.push({ name: 'xs:pattern', attrs: { value: rule.pattern.source } });
  }
  return facets;
}

function xsdTypeName(type: XmlSimpleType): string {
  return type === 'integer' ? 'int' : type;
}
