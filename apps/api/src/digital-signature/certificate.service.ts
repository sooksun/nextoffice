import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as forge from 'node-forge';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../intake/services/file-storage.service';

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);
  private readonly passphrase: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly config: ConfigService,
  ) {
    this.passphrase = this.config.get('CERT_KEY_PASSPHRASE', 'nextoffice-default-key');
  }

  async ensureCertificate(userId: number, orgId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { certificatePath: true },
    });
    if (user?.certificatePath) return;
    await this.generateCertificate(userId, orgId);
  }

  async generateCertificate(userId: number, orgId: number): Promise<{ ok: boolean; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { fullName: true, email: true },
    });
    const org = await this.prisma.organization.findUnique({
      where: { id: BigInt(orgId) },
      select: { name: true },
    });

    if (!user) throw new Error(`User #${userId} not found`);

    // Generate RSA 2048-bit key pair
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // Create self-signed X.509 certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = forge.util.bytesToHex(forge.random.getBytesSync(16));

    const now = new Date();
    const expiry = new Date(now);
    expiry.setFullYear(expiry.getFullYear() + 3);

    cert.validity.notBefore = now;
    cert.validity.notAfter = expiry;

    const attrs = [
      { shortName: 'CN', value: user.fullName },
      { shortName: 'O', value: org?.name ?? 'NextOffice' },
      { shortName: 'C', value: 'TH' },
    ];
    if (user.email) {
      attrs.push({ shortName: 'E', value: user.email });
    }

    cert.setSubject(attrs);
    cert.setIssuer(attrs); // self-signed

    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      {
        name: 'keyUsage',
        digitalSignature: true,
        nonRepudiation: true,
      },
      {
        name: 'extKeyUsage',
        emailProtection: true,
      },
      {
        name: 'subjectKeyIdentifier',
      },
    ]);

    // Sign the certificate
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Convert to PEM
    const certPem = forge.pki.certificateToPem(cert);
    const keyPem = forge.pki.encryptRsaPrivateKey(keys.privateKey, this.passphrase, {
      algorithm: 'aes256',
    });

    // Save to MinIO
    const certPath = `certificates/${orgId}/${userId}.cert.pem`;
    const keyPath = `certificates/${orgId}/${userId}.key.pem`;

    await Promise.all([
      this.fileStorage.saveBuffer(certPath, Buffer.from(certPem), 'application/x-pem-file'),
      this.fileStorage.saveBuffer(keyPath, Buffer.from(keyPem), 'application/x-pem-file'),
    ]);

    // Update user record
    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { certificatePath: certPath, privateKeyPath: keyPath },
    });

    this.logger.log(`Generated X.509 certificate for user #${userId} (expires ${expiry.toISOString()})`);
    return { ok: true, expiresAt: expiry };
  }

  async loadSigningCredentials(userId: number): Promise<{
    certificate: forge.pki.Certificate;
    privateKey: forge.pki.rsa.PrivateKey;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { certificatePath: true, privateKeyPath: true },
    });

    if (!user?.certificatePath || !user?.privateKeyPath) {
      throw new Error(`No certificate for user #${userId}`);
    }

    const [certBuf, keyBuf] = await Promise.all([
      this.fileStorage.getBuffer(user.certificatePath),
      this.fileStorage.getBuffer(user.privateKeyPath),
    ]);

    const certificate = forge.pki.certificateFromPem(certBuf.toString('utf-8'));
    const privateKey = forge.pki.decryptRsaPrivateKey(keyBuf.toString('utf-8'), this.passphrase);

    if (!privateKey) throw new Error('Failed to decrypt private key');

    return { certificate, privateKey };
  }

  async getCertificateInfo(userId: number): Promise<{
    hasCertificate: boolean;
    subject?: string;
    expiresAt?: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { certificatePath: true },
    });

    if (!user?.certificatePath) {
      return { hasCertificate: false };
    }

    try {
      const certBuf = await this.fileStorage.getBuffer(user.certificatePath);
      const cert = forge.pki.certificateFromPem(certBuf.toString('utf-8'));
      const cn = cert.subject.getField('CN')?.value ?? '';
      const o = cert.subject.getField('O')?.value ?? '';

      return {
        hasCertificate: true,
        subject: `CN=${cn}, O=${o}, C=TH`,
        expiresAt: cert.validity.notAfter.toISOString(),
      };
    } catch {
      return { hasCertificate: false };
    }
  }
}
