import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { GoAmlReportService } from './goaml-report.service';
import { Sar } from '../compliance/entities/sar.entity';
import { ComplianceFlag } from '../compliance/entities/compliance-flag.entity';
import { User } from '../../users/user.entity';
import { KycRecord, KycStatus } from '../../kyc/entities/kyc.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { FinancialCrimeReportFormat } from './entities/financial-crime-report.entity';
import { GOAML_4_0_SCHEMA } from './formats';
import { validateXml } from './xml/xml-schema';

const SAR = {
  id: 'sar-1',
  flagId: 'flag-1',
  filedById: 'admin-1',
  narrative: 'Rapid inbound & outbound movement inconsistent with <profile>.',
  filedAt: new Date('2026-07-20T09:00:00.000Z'),
  reportReference: 'NX-STR-2026-0001',
};

const FLAG = {
  id: 'flag-1',
  userId: 'user-1',
  transactionId: 'tx-1',
  rule: 'RAPID_MOVEMENT',
  riskScore: 80,
  status: 'SAR_FILED',
  details: {},
  createdAt: new Date('2026-07-19T08:00:00.000Z'),
};

const SUBJECT = {
  id: 'user-1',
  email: 'subject@example.com',
  firstName: 'Ada',
  lastName: 'Okafor',
  phone: '+2348030000000',
  walletPublicKey: 'GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH',
  createdAt: new Date('2025-03-04T12:00:00.000Z'),
};

const KYC = {
  id: 'kyc-1',
  userId: 'user-1',
  status: KycStatus.APPROVED,
  fullName: 'Ada Chiamaka Okafor',
  dateOfBirth: new Date('1990-06-15T00:00:00.000Z'),
  nationality: 'Nigerian',
  documentType: 'passport',
  documentNumber: 'A01234567',
  reviewedAt: new Date('2025-03-10T12:00:00.000Z'),
};

const TRANSACTION = {
  id: 'tx-1',
  userId: 'user-1',
  type: 'SWAP',
  status: 'SUCCESS',
  amount: '25000.00000000',
  currency: 'USD',
  rate: '1550.25000000',
  toCurrency: 'NGN',
  toAmount: '38756250.00000000',
  txHash: 'abc123',
  createdAt: new Date('2026-07-19T07:45:12.000Z'),
};

describe('GoAmlReportService', () => {
  let service: GoAmlReportService;
  let sarRepo: any;
  let flagRepo: any;
  let userRepo: any;
  let kycRepo: any;
  let transactionRepo: any;

  const repo = () => ({ findOne: jest.fn() });

  beforeEach(async () => {
    sarRepo = repo();
    flagRepo = repo();
    userRepo = repo();
    kycRepo = repo();
    transactionRepo = repo();

    sarRepo.findOne.mockResolvedValue(SAR);
    flagRepo.findOne.mockResolvedValue(FLAG);
    userRepo.findOne.mockResolvedValue(SUBJECT);
    kycRepo.findOne.mockResolvedValue(KYC);
    transactionRepo.findOne.mockResolvedValue(TRANSACTION);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoAmlReportService,
        { provide: getRepositoryToken(Sar), useValue: sarRepo },
        { provide: getRepositoryToken(ComplianceFlag), useValue: flagRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(KycRecord), useValue: kycRepo },
        { provide: getRepositoryToken(Transaction), useValue: transactionRepo },
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
      ],
    }).compile();

    service = module.get(GoAmlReportService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generate', () => {
    it('produces a well-formed XML document', async () => {
      const xml = await service.generate('sar-1');

      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(
        true,
      );
      expect(XMLValidator.validate(xml)).toBe(true);
    });

    it('is valid against the goAML 4.0 schema', async () => {
      const xml = await service.generate('sar-1');
      const parsed = parseToTree(xml);

      expect(validateXml(parsed, GOAML_4_0_SCHEMA)).toEqual([]);
    });

    it('declares the goAML namespace on the Report root', async () => {
      const xml = await service.generate('sar-1');
      expect(xml).toContain('<Report xmlns="urn:goAML">');
    });

    it('emits every element the goAML report requires', async () => {
      const xml = await service.generate('sar-1');

      for (const element of [
        'Report',
        'Entity',
        'Reason',
        'Indicators',
        'Accounts',
        'Account',
        'Transactions',
        'Transaction',
      ]) {
        // Tolerate attributes on the opening tag — the root carries xmlns.
        expect(xml).toMatch(new RegExp(`<${element}[ >]`));
        expect(xml).toContain(`</${element}>`);
      }
    });

    it('carries the SAR fields into the document', async () => {
      const xml = await service.generate('sar-1');

      expect(xml).toContain('<Entity_Reference>NX-STR-2026-0001</Entity_Reference>');
      expect(xml).toContain('<Indicator>RAPID_MOVEMENT</Indicator>');
      expect(xml).toContain(
        `<Account_Number>${SUBJECT.walletPublicKey}</Account_Number>`,
      );
      expect(xml).toContain('<Transaction_Number>tx-1</Transaction_Number>');
      expect(xml).toContain('<Amount_Local>25000.00</Amount_Local>');
      expect(xml).toContain('<Currency_Code>USD</Currency_Code>');
      expect(xml).toContain('<Conversion_Currency>NGN</Conversion_Currency>');
    });

    it('escapes markup in the analyst narrative', async () => {
      const xml = await service.generate('sar-1');

      expect(xml).toContain(
        '<Reason>Rapid inbound &amp; outbound movement inconsistent with &lt;profile&gt;.</Reason>',
      );
      expect(XMLValidator.validate(xml)).toBe(true);
    });

    it('reports the verified identity from the approved KYC record', async () => {
      const xml = await service.generate('sar-1');

      expect(xml).toContain('<Full_Name>Ada Chiamaka Okafor</Full_Name>');
      expect(xml).toContain('<Birthdate>1990-06-15</Birthdate>');
      expect(xml).toContain('<Nationality1>Nigerian</Nationality1>');
      expect(xml).toContain('<Type>PASSPORT</Type>');
      expect(xml).toContain('<Number>A01234567</Number>');
    });

    it('only reads an approved KYC record', async () => {
      await service.generate('sar-1');

      expect(kycRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', status: KycStatus.APPROVED },
        }),
      );
    });

    it('stays valid when KYC is absent, omitting the optional identity elements', async () => {
      kycRepo.findOne.mockResolvedValue(null);

      const xml = await service.generate('sar-1');

      expect(validateXml(parseToTree(xml), GOAML_4_0_SCHEMA)).toEqual([]);
      expect(xml).not.toContain('<Identification>');
      expect(xml).not.toContain('<Birthdate>');
      // The unverified name from the user record is still usable.
      expect(xml).toContain('<Full_Name>Ada Okafor</Full_Name>');
    });

    it('formats dates and decimals as the schema types require', async () => {
      const xml = await service.generate('sar-1');

      expect(xml).toMatch(
        /<Submission_Date>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}<\/Submission_Date>/,
      );
      expect(xml).toContain(
        '<Date_Transaction>2026-07-19T07:45:12</Date_Transaction>',
      );
      expect(xml).toContain('<Opened>2025-03-04</Opened>');
      expect(xml).toContain('<Conversion_Amount>38756250.00</Conversion_Amount>');
    });

    it('throws NotFoundException for an unknown SAR', async () => {
      sarRepo.findOne.mockResolvedValue(null);

      await expect(service.generate('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to generate a goAML STR with no transaction', async () => {
      flagRepo.findOne.mockResolvedValue({ ...FLAG, transactionId: null });
      transactionRepo.findOne.mockResolvedValue(null);

      await expect(service.generate('sar-1')).rejects.toThrow(
        /must report at least one/,
      );
      await expect(service.generate('sar-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('refuses to generate when the subject has no account to report', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.generate('sar-1')).rejects.toThrow(
        /subject user record is missing/,
      );
    });

    it('uses the configured reporting institution when one is set', async () => {
      const config = { get: jest.fn() } as any;
      config.get.mockImplementation((key: string) =>
        key === 'FINCRIME_INSTITUTION_CODE' ? 'NEXAFX-NG-001' : undefined,
      );

      const configured = await buildService(config);
      const xml = await configured.generate('sar-1');

      expect(xml).toContain('<Institution_Code>NEXAFX-NG-001</Institution_Code>');
    });

    it('falls back to the NexaFX institution details by default', async () => {
      const xml = await service.generate('sar-1');

      expect(xml).toContain('<Name>NexaFX</Name>');
      expect(xml).toContain(
        '<Institution_Name>NexaFX Financial Services</Institution_Name>',
      );
      expect(xml).toContain('<Country>NG</Country>');
    });
  });

  describe('render', () => {
    it.each([
      FinancialCrimeReportFormat.GOAML,
      FinancialCrimeReportFormat.NCA_UK,
      FinancialCrimeReportFormat.GENERIC,
    ])('produces a schema-valid %s document', async (format) => {
      const { xml } = await service.render('sar-1', format);

      expect(XMLValidator.validate(xml)).toBe(true);
      const definition = (await import('./formats')).REPORT_FORMATS[format];
      expect(validateXml(parseToTree(xml), definition.schema)).toEqual([]);
    });

    it('produces a generic report even with no transaction or subject', async () => {
      flagRepo.findOne.mockResolvedValue({ ...FLAG, transactionId: null });
      userRepo.findOne.mockResolvedValue(null);
      kycRepo.findOne.mockResolvedValue(null);
      transactionRepo.findOne.mockResolvedValue(null);

      const { xml } = await service.render(
        'sar-1',
        FinancialCrimeReportFormat.GENERIC,
      );

      expect(XMLValidator.validate(xml)).toBe(true);
      expect(xml).toContain('<Narrative>');
    });

    it('rejects an unsupported format', async () => {
      await expect(
        service.render('sar-1', 'FATF' as FinancialCrimeReportFormat),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('xsd', () => {
    it('renders the goAML 4.0 XSD from the same model used to validate', () => {
      const xsd = service.xsd(FinancialCrimeReportFormat.GOAML);

      expect(XMLValidator.validate(xsd)).toBe(true);
      expect(xsd).toContain('targetNamespace="urn:goAML"');
      expect(xsd).toContain('version="4.0"');
      expect(xsd).toContain('<xs:element name="Report">');
      expect(xsd).toContain('name="Transaction" maxOccurs="unbounded"');
    });

    it('declares every element the generated document uses', async () => {
      const xml = await service.generate('sar-1');
      const xsd = service.xsd(FinancialCrimeReportFormat.GOAML);

      const usedElements = new Set(
        [...xml.matchAll(/<([A-Za-z_][\w.-]*)[ />]/g)].map((m) => m[1]),
      );
      usedElements.delete('Report'); // matched via the xmlns attribute form

      for (const element of usedElements) {
        expect(xsd).toContain(`name="${element}"`);
      }
    });
  });

  async function buildService(config: any): Promise<GoAmlReportService> {
    const module = await Test.createTestingModule({
      providers: [
        GoAmlReportService,
        { provide: getRepositoryToken(Sar), useValue: sarRepo },
        { provide: getRepositoryToken(ComplianceFlag), useValue: flagRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(KycRecord), useValue: kycRepo },
        { provide: getRepositoryToken(Transaction), useValue: transactionRepo },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    return module.get(GoAmlReportService);
  }
});

/**
 * Parse generated XML back into the XmlNode shape the validator consumes, so the
 * schema check runs against the serialised bytes rather than the in-memory tree
 * the builder produced.
 */
function parseToTree(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    parseTagValue: false,
    trimValues: true,
    preserveOrder: true,
  });
  const parsed = parser.parse(xml) as unknown[];
  const rootEntry = parsed.find(
    (entry) => !Object.prototype.hasOwnProperty.call(entry as object, '?xml'),
  );
  return toNode(rootEntry as Record<string, unknown>);
}

function toNode(entry: Record<string, unknown>): any {
  const name = Object.keys(entry).find((key) => key !== ':@')!;
  const attrsSource = (entry[':@'] ?? {}) as Record<string, string>;
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrsSource)) {
    attrs[key.replace(/^@/, '')] = value;
  }

  const contents = entry[name] as Array<Record<string, unknown>>;
  const textEntry = contents.find((child) =>
    Object.prototype.hasOwnProperty.call(child, '#text'),
  );
  const childEntries = contents.filter(
    (child) => !Object.prototype.hasOwnProperty.call(child, '#text'),
  );

  const node: any = { name };
  if (Object.keys(attrs).length) node.attrs = attrs;
  if (childEntries.length) {
    node.children = childEntries.map(toNode);
  } else {
    node.text = textEntry ? String(textEntry['#text']) : '';
  }
  return node;
}
