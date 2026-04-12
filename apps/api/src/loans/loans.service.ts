import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: number, status?: string) {
    const where: any = { organizationId: BigInt(organizationId) };
    if (status) where.status = status;

    const items = await this.prisma.documentLoan.findMany({
      where,
      include: {
        registry: { select: { subject: true, documentNo: true, registryNo: true } },
        borrower: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((l) => ({
      id: Number(l.id),
      loanNo: l.loanNo,
      borrowDate: l.borrowDate,
      dueDate: l.dueDate,
      returnDate: l.returnDate,
      purpose: l.purpose,
      status: l.status,
      remarks: l.remarks,
      registrySubject: l.registry?.subject,
      registryDocNo: l.registry?.documentNo,
      borrowerName: l.borrower?.fullName,
      approvedByName: l.approvedBy?.fullName,
      createdAt: l.createdAt,
    }));
  }

  async findOverdue(organizationId: number) {
    const items = await this.prisma.documentLoan.findMany({
      where: {
        organizationId: BigInt(organizationId),
        status: 'active',
        dueDate: { lt: new Date() },
      },
      include: {
        registry: { select: { subject: true, documentNo: true } },
        borrower: { select: { fullName: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    return items.map((l) => ({
      id: Number(l.id),
      loanNo: l.loanNo,
      borrowDate: l.borrowDate,
      dueDate: l.dueDate,
      purpose: l.purpose,
      registrySubject: l.registry?.subject,
      registryDocNo: l.registry?.documentNo,
      borrowerName: l.borrower?.fullName,
    }));
  }

  async create(organizationId: number, dto: {
    registryId: number;
    borrowerUserId: number;
    dueDate: string;
    purpose?: string;
    remarks?: string;
  }) {
    const registry = await this.prisma.documentRegistry.findUnique({
      where: { id: BigInt(dto.registryId) },
    });
    if (!registry || Number(registry.organizationId) !== organizationId) {
      throw new NotFoundException('ไม่พบทะเบียนเอกสาร');
    }

    const activeLoan = await this.prisma.documentLoan.findFirst({
      where: {
        registryId: BigInt(dto.registryId),
        status: 'active',
      },
    });
    if (activeLoan) {
      throw new BadRequestException('เอกสารนี้ถูกยืมอยู่แล้ว');
    }

    const loanNo = await this.getNextSequence(BigInt(organizationId), 'loan');

    const loan = await this.prisma.documentLoan.create({
      data: {
        organizationId: BigInt(organizationId),
        loanNo,
        registryId: BigInt(dto.registryId),
        borrowerUserId: BigInt(dto.borrowerUserId),
        borrowDate: new Date(),
        dueDate: new Date(dto.dueDate),
        purpose: dto.purpose || null,
        remarks: dto.remarks || null,
      },
    });

    return { id: Number(loan.id), loanNo: loan.loanNo };
  }

  async returnDocument(id: number) {
    const loan = await this.prisma.documentLoan.findUnique({ where: { id: BigInt(id) } });
    if (!loan) throw new NotFoundException(`Loan #${id} not found`);
    if (loan.status === 'returned') throw new BadRequestException('คืนแล้ว');

    const updated = await this.prisma.documentLoan.update({
      where: { id: BigInt(id) },
      data: { status: 'returned', returnDate: new Date() },
    });

    return { id: Number(updated.id), status: updated.status };
  }

  async markOverdueLoans() {
    const result = await this.prisma.documentLoan.updateMany({
      where: {
        status: 'active',
        dueDate: { lt: new Date() },
      },
      data: { status: 'overdue' },
    });
    return result.count;
  }

  private async getNextSequence(organizationId: bigint, counterType: string): Promise<string> {
    const buddhistYear = new Date().getFullYear() + 543;
    const counter = await this.prisma.registrationCounter.upsert({
      where: {
        organizationId_year_counterType: {
          organizationId,
          year: buddhistYear,
          counterType,
        },
      },
      create: { organizationId, year: buddhistYear, counterType, lastSeq: 1 },
      update: { lastSeq: { increment: 1 } },
    });
    return `${String(counter.lastSeq).padStart(3, '0')}/${buddhistYear}`;
  }
}
