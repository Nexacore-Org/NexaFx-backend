import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'crypto';
import JSZip from 'jszip';
import { Repository } from 'typeorm';
import { AuditLog } from '../../audit-logs/entities/audit-log.entity';
import { KycRecord } from '../../kyc/entities/kyc.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../users/user.entity';
import {
  EvidencePackage,
  EvidencePackageStatus,
} from '../entities/evidence-package.entity';

@Injectable()
export class EvidencePackageService {
  constructor(
    @InjectRepository(EvidencePackage)
    private readonly evidencePackageRepository: Repository<EvidencePackage>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(KycRecord)
    private readonly kycRepository: Repository<KycRecord>,
  ) {}

  async requestPackage(userId: string) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const job = await this.evidencePackageRepository.save(
      this.evidencePackageRepository.create({
        requestedByUserId: userId,
        status: EvidencePackageStatus.PROCESSING,
        generatedAt: null,
        expiresAt,
      }),
    );

    setTimeout(() => {
      void this.generatePackage(job.id).catch(async (error) => {
        await this.evidencePackageRepository.update(job.id, {
          status: EvidencePackageStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      });
    }, 0);

    return {
      jobId: job.id,
      status: job.status,
    };
  }

  async listPackages(userId: string) {
    const packages = await this.evidencePackageRepository.find({
      where: { requestedByUserId: userId },
      order: { createdAt: 'DESC' },
    });

    return Promise.all(
      packages.map(async (item) => {
        const current = await this.applyExpiry(item);
        return {
          id: current.id,
          status: current.status,
          generatedAt: current.generatedAt,
          expiresAt: current.expiresAt,
          documentCount: current.documentCount,
          manifestHash: current.manifestHash,
          downloadLink:
            current.status === EvidencePackageStatus.READY
              ? `/v1/compliance/evidence/packages/${current.id}/download`
              : null,
        };
      }),
    );
  }

  async downloadPackage(userId: string, id: string) {
    const pkg = await this.getOwnedPackage(userId, id);
    const current = await this.applyExpiry(pkg);

    if (current.status !== EvidencePackageStatus.READY || !current.packageDataBase64) {
      throw new BadRequestException('Evidence package is not available for download');
    }

    return Buffer.from(current.packageDataBase64, 'base64');
  }

  async verifyPackage(userId: string, id: string) {
    const pkg = await this.getOwnedPackage(userId, id);
    const current = await this.applyExpiry(pkg);

    if (
      current.status !== EvidencePackageStatus.READY ||
      !current.manifestJson ||
      !current.manifestSignature ||
      !current.manifestHash
    ) {
      return {
        status: 'INVALID',
        reason: 'Package is not ready for verification',
      };
    }

    const manifestBuffer = Buffer.from(
      `${JSON.stringify(current.manifestJson, null, 2)}\n`,
      'utf8',
    );
    const manifestHash = this.sha256(manifestBuffer);
    const { publicKey, algorithm } = this.getSigningKeys();

    const signatureValid =
      manifestHash === current.manifestHash &&
      this.verifySignature(
        publicKey,
        algorithm,
        manifestBuffer,
        Buffer.from(current.manifestSignature, 'base64'),
      );

    return {
      status: signatureValid ? 'VALID' : 'INVALID',
      manifestHash,
      signatureAlgorithm: current.signatureAlgorithm,
      chainOfCustody: current.chainOfCustody,
    };
  }

  private async generatePackage(id: string) {
    const pkg = await this.evidencePackageRepository.findOne({
      where: { id },
    });
    if (!pkg) {
      throw new NotFoundException('Evidence package job not found');
    }

    const [user, transactions, notifications, auditLogs, kycRecords] =
      await Promise.all([
        this.userRepository.findOneBy({ id: pkg.requestedByUserId }),
        this.transactionRepository.find({
          where: { userId: pkg.requestedByUserId },
          order: { createdAt: 'DESC' },
        }),
        this.notificationRepository.find({
          where: { userId: pkg.requestedByUserId },
          order: { createdAt: 'DESC' },
        }),
        this.auditLogRepository.find({
          where: { userId: pkg.requestedByUserId },
          order: { createdAt: 'DESC' },
        }),
        this.kycRepository.find({
          where: { userId: pkg.requestedByUserId },
          order: { createdAt: 'DESC' },
        }),
      ]);

    if (!user) {
      throw new NotFoundException('Requesting user not found');
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      walletPublicKey: user.walletPublicKey,
      role: user.role,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    const files = new Map<string, Buffer>([
      ['profile.json', this.toJsonBuffer(safeUser)],
      ['transactions.json', this.toJsonBuffer(transactions)],
      ['notifications.json', this.toJsonBuffer(notifications)],
      ['audit-logs.json', this.toJsonBuffer(auditLogs)],
      ['kyc-records.json', this.toJsonBuffer(kycRecords)],
    ]);

    const manifestFiles = Array.from(files.entries()).map(([path, buffer]) => ({
      path,
      sha256: this.sha256(buffer),
      size: buffer.length,
    }));

    const generatedAt = new Date();
    const manifest = {
      packageId: pkg.id,
      requestedBy: pkg.requestedByUserId,
      generatedAt: generatedAt.toISOString(),
      expiresAt: pkg.expiresAt.toISOString(),
      documentCount: manifestFiles.length,
      files: manifestFiles,
    };

    const manifestBuffer = this.toJsonBuffer(manifest);
    const manifestHash = this.sha256(manifestBuffer);
    const { privateKey, algorithm } = this.getSigningKeys();
    const signature = this.signManifest(privateKey, algorithm, manifestBuffer);

    const zip = new JSZip();
    for (const [path, buffer] of files.entries()) {
      zip.file(path, buffer);
    }
    zip.file('manifest.json', manifestBuffer);
    zip.file('manifest.sig', signature.toString('base64'));

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    await this.evidencePackageRepository.update(pkg.id, {
      status: EvidencePackageStatus.READY,
      generatedAt,
      documentCount: manifestFiles.length,
      manifestHash,
      manifestJson: manifest,
      manifestSignature: signature.toString('base64'),
      signatureAlgorithm: algorithm,
      chainOfCustody: {
        requestedBy: pkg.requestedByUserId,
        generatedAt: generatedAt.toISOString(),
        documentCount: manifestFiles.length,
        manifestHash,
      },
      packageDataBase64: zipBuffer.toString('base64'),
      errorMessage: null,
    });
  }

  private async getOwnedPackage(userId: string, id: string) {
    const pkg = await this.evidencePackageRepository.findOne({
      where: { id, requestedByUserId: userId },
    });
    if (!pkg) {
      throw new NotFoundException('Evidence package not found');
    }
    return pkg;
  }

  private async applyExpiry(pkg: EvidencePackage) {
    if (
      pkg.status === EvidencePackageStatus.READY &&
      pkg.expiresAt.getTime() <= Date.now()
    ) {
      pkg.status = EvidencePackageStatus.EXPIRED;
      await this.evidencePackageRepository.save(pkg);
    }
    return pkg;
  }

  private toJsonBuffer(value: unknown) {
    return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  private sha256(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private getSigningKeys() {
    const rawKey = process.env.COMPLIANCE_EVIDENCE_SIGNING_PRIVATE_KEY;
    if (!rawKey) {
      throw new BadRequestException(
        'COMPLIANCE_EVIDENCE_SIGNING_PRIVATE_KEY is not configured',
      );
    }

    const normalized = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;
    const privateKey = createPrivateKey(normalized);
    const publicKey = createPublicKey(privateKey);
    const keyType = privateKey.asymmetricKeyType;
    const algorithm = keyType === 'ed25519' ? 'Ed25519' : 'RSA-SHA256';

    return { privateKey, publicKey, algorithm };
  }

  private signManifest(
    privateKey: ReturnType<typeof createPrivateKey>,
    algorithm: string,
    data: Buffer,
  ) {
    return algorithm === 'Ed25519'
      ? sign(null, data, privateKey)
      : sign('sha256', data, privateKey);
  }

  private verifySignature(
    publicKey: ReturnType<typeof createPublicKey>,
    algorithm: string,
    data: Buffer,
    signature: Buffer,
  ) {
    return algorithm === 'Ed25519'
      ? verify(null, data, publicKey, signature)
      : verify('sha256', data, publicKey, signature);
  }
}
