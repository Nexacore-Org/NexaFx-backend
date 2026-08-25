import { branch, leaf, requiredLeaf, serializeXml } from './xml-builder';
import { renderXsd, validateXml, XmlSchema } from './xml-schema';

const SCHEMA: XmlSchema = {
  namespace: 'urn:test',
  version: '1.0',
  root: {
    name: 'Root',
    children: [
      { name: 'Code', enum: ['A', 'B'] },
      { name: 'When', type: 'dateTime' },
      { name: 'Day', type: 'date', minOccurs: 0 },
      { name: 'Amount', type: 'decimal' },
      { name: 'Count', type: 'integer', minOccurs: 0 },
      { name: 'Flag', type: 'boolean', minOccurs: 0 },
      { name: 'Short', maxLength: 3, minOccurs: 0 },
      {
        name: 'Country',
        minOccurs: 0,
        pattern: { source: '[A-Z]{2}', describedAs: 'a 2-letter code' },
      },
      {
        name: 'Items',
        children: [{ name: 'Item', maxOccurs: 'unbounded' }],
      },
    ],
  },
};

function validRoot() {
  return branch(
    'Root',
    [
      requiredLeaf('Code', 'A'),
      requiredLeaf('When', '2026-07-29T10:15:30'),
      requiredLeaf('Amount', '10.50'),
      branch('Items', [requiredLeaf('Item', 'one')]),
    ],
    { xmlns: 'urn:test' },
  );
}

describe('validateXml', () => {
  it('accepts a conforming document', () => {
    expect(validateXml(validRoot(), SCHEMA)).toEqual([]);
  });

  it('rejects the wrong root element', () => {
    const doc = branch('Other', [], { xmlns: 'urn:test' });
    expect(validateXml(doc, SCHEMA)).toEqual([
      { path: 'Other', message: 'Root element must be <Root>, found <Other>' },
    ]);
  });

  it('rejects a missing or wrong namespace', () => {
    const doc = validRoot();
    doc.attrs = { xmlns: 'urn:wrong' };

    expect(validateXml(doc, SCHEMA)).toEqual([
      expect.objectContaining({
        message: "Root xmlns must be 'urn:test', found 'urn:wrong'",
      }),
    ]);
  });

  it('reports every missing required element at once', () => {
    const doc = branch('Root', [requiredLeaf('Code', 'A')], {
      xmlns: 'urn:test',
    });

    const messages = validateXml(doc, SCHEMA).map((e) => e.message);
    expect(messages).toEqual([
      'Required element <When> is missing',
      'Required element <Amount> is missing',
      'Required element <Items> is missing',
    ]);
  });

  it('allows optional elements to be absent', () => {
    expect(validateXml(validRoot(), SCHEMA)).toEqual([]);
  });

  it('rejects a value outside an enumeration', () => {
    const doc = validRoot();
    doc.children![0] = { name: 'Code', text: 'Z' };

    expect(validateXml(doc, SCHEMA)).toEqual([
      expect.objectContaining({
        path: 'Root/Code',
        message: "<Code> must be one of A, B, found 'Z'",
      }),
    ]);
  });

  it.each([
    ['dateTime', 'When', '2026-07-29', 'an xsd:dateTime (YYYY-MM-DDThh:mm:ss)'],
    ['decimal', 'Amount', 'ten', 'an xsd:decimal'],
  ])('rejects a %s value that is not well-typed', (_type, name, bad, expected) => {
    const doc = validRoot();
    const index = doc.children!.findIndex((c) => c.name === name);
    doc.children![index] = { name, text: bad };

    expect(validateXml(doc, SCHEMA)).toEqual([
      expect.objectContaining({
        message: `<${name}> must be ${expected}, found '${bad}'`,
      }),
    ]);
  });

  it('rejects a calendar-invalid date', () => {
    const doc = validRoot();
    doc.children!.splice(2, 0, { name: 'Day', text: '2026-02-30' });

    expect(validateXml(doc, SCHEMA)).toEqual([
      expect.objectContaining({ path: 'Root/Day' }),
    ]);
  });

  it('rejects a value over maxLength', () => {
    const doc = validRoot();
    doc.children!.splice(3, 0, { name: 'Short', text: 'abcd' });

    expect(validateXml(doc, SCHEMA)).toEqual([
      expect.objectContaining({
        message: '<Short> exceeds maxLength 3 (4 characters)',
      }),
    ]);
  });

  it('rejects a value failing its pattern facet', () => {
    const doc = validRoot();
    doc.children!.splice(3, 0, { name: 'Country', text: 'Nigeria' });

    expect(validateXml(doc, SCHEMA)).toEqual([
      expect.objectContaining({
        message: '<Country> must be a 2-letter code',
      }),
    ]);
  });

  it('anchors pattern facets rather than matching a substring', () => {
    const doc = validRoot();
    doc.children!.splice(3, 0, { name: 'Country', text: 'xNGx' });

    expect(validateXml(doc, SCHEMA)).toHaveLength(1);
  });

  it('rejects an empty required element', () => {
    const doc = validRoot();
    doc.children![0] = { name: 'Code', text: '' };

    expect(validateXml(doc, SCHEMA)).toEqual([
      expect.objectContaining({ message: '<Code> must not be empty' }),
    ]);
  });

  it('rejects an undeclared element', () => {
    const doc = validRoot();
    doc.children!.push({ name: 'Rogue', text: 'x' });

    expect(validateXml(doc, SCHEMA)).toEqual([
      expect.objectContaining({
        message: '<Rogue> is not declared in <Root>',
      }),
    ]);
  });

  it('rejects declared elements that appear out of sequence order', () => {
    const doc = branch(
      'Root',
      [
        requiredLeaf('When', '2026-07-29T10:15:30'),
        requiredLeaf('Code', 'A'),
        requiredLeaf('Amount', '10.50'),
        branch('Items', [requiredLeaf('Item', 'one')]),
      ],
      { xmlns: 'urn:test' },
    );

    const messages = validateXml(doc, SCHEMA).map((e) => e.message);
    expect(messages).toContain('<Code> appears out of sequence order');
  });

  it('accepts repetition up to unbounded but rejects it past a bound', () => {
    const unbounded = validRoot();
    unbounded.children![3] = branch('Items', [
      requiredLeaf('Item', 'one'),
      requiredLeaf('Item', 'two'),
      requiredLeaf('Item', 'three'),
    ]);
    expect(validateXml(unbounded, SCHEMA)).toEqual([]);

    const bounded = validRoot();
    bounded.children!.unshift({ name: 'Code', text: 'B' });
    expect(validateXml(bounded, SCHEMA)).toEqual([
      expect.objectContaining({
        message: '<Code> permits at most 1 occurrence(s), found 2',
      }),
    ]);
  });

  it('rejects a container that carries text and a leaf that has children', () => {
    const textyContainer = validRoot();
    textyContainer.children![3] = {
      name: 'Items',
      text: 'nope',
      children: [requiredLeaf('Item', 'one')],
    };
    expect(validateXml(textyContainer, SCHEMA)).toEqual([
      expect.objectContaining({
        message: '<Items> is a container element and must not carry text',
      }),
    ]);

    const childedLeaf = validRoot();
    childedLeaf.children![0] = {
      name: 'Code',
      children: [{ name: 'Nested', text: 'A' }],
    };
    expect(validateXml(childedLeaf, SCHEMA)).toEqual([
      expect.objectContaining({
        message:
          '<Code> is a simple-typed element and must not have child elements',
      }),
    ]);
  });

  it('indexes the path of repeated elements', () => {
    const doc = validRoot();
    doc.children![3] = branch('Items', [
      requiredLeaf('Item', 'one'),
      { name: 'Item', text: '' },
    ]);

    expect(validateXml(doc, SCHEMA)).toEqual([
      expect.objectContaining({ path: 'Root/Items/Item[2]' }),
    ]);
  });
});

describe('renderXsd', () => {
  const xsd = renderXsd(SCHEMA);

  it('declares the target namespace and version', () => {
    expect(xsd).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xsd).toContain('targetNamespace="urn:test"');
    expect(xsd).toContain('version="1.0"');
    expect(xsd).toContain('elementFormDefault="qualified"');
  });

  it('renders containers as complexType sequences', () => {
    expect(xsd).toContain('<xs:element name="Root">');
    expect(xsd).toContain('<xs:complexType>');
    expect(xsd).toContain('<xs:sequence>');
  });

  it('renders enumerations, maxLength and pattern as restriction facets', () => {
    expect(xsd).toContain('<xs:enumeration value="A"/>');
    expect(xsd).toContain('<xs:enumeration value="B"/>');
    expect(xsd).toContain('<xs:maxLength value="3"/>');
    expect(xsd).toContain('<xs:pattern value="[A-Z]{2}"/>');
  });

  it('carries occurrence bounds and simple types onto the elements', () => {
    expect(xsd).toContain('name="Day" minOccurs="0" type="xs:date"');
    expect(xsd).toContain('name="Item" maxOccurs="unbounded"');
    expect(xsd).toContain('name="Count" minOccurs="0" type="xs:int"');
    expect(xsd).toContain('type="xs:decimal"');
  });

  it('is itself a well-formed document with balanced tags', () => {
    const opened = (xsd.match(/<xs:element\b/g) ?? []).length;
    const selfClosed = (xsd.match(/<xs:element\b[^>]*\/>/g) ?? []).length;
    const closed = (xsd.match(/<\/xs:element>/g) ?? []).length;
    expect(opened).toBe(selfClosed + closed);
  });
});

describe('serializeXml', () => {
  it('escapes markup and quotes', () => {
    const doc = branch('Root', [leaf('Text', 'a & b < c > d')], {
      xmlns: 'urn:test',
      note: 'say "hi"',
    });

    const xml = serializeXml(doc);
    expect(xml).toContain('<Text>a &amp; b &lt; c &gt; d</Text>');
    expect(xml).toContain('note="say &quot;hi&quot;"');
  });

  it('strips control characters XML 1.0 cannot represent', () => {
    // U+0007 BEL is illegal in XML 1.0 and cannot be escaped, only removed.
    const bell = String.fromCharCode(7);
    const doc = branch('Root', [requiredLeaf('Text', `clean${bell}text`)]);

    const xml = serializeXml(doc);
    expect(xml).toContain('<Text>cleantext</Text>');
    expect(xml).not.toContain(bell);
  });

  it('normalises CRLF so stored bytes match what a parser reads back', () => {
    const doc = branch('Root', [requiredLeaf('Text', 'line1\r\nline2')]);
    expect(serializeXml(doc)).toContain('<Text>line1\nline2</Text>');
  });

  it('omits absent optional leaves and emits empty required ones', () => {
    const doc = branch('Root', [
      leaf('Absent', null),
      leaf('Blank', '   '),
      requiredLeaf('Present', ''),
    ]);

    const xml = serializeXml(doc);
    expect(xml).not.toContain('Absent');
    expect(xml).not.toContain('Blank');
    expect(xml).toContain('<Present/>');
  });
});
