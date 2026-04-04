import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAcademicYearDto } from '../dto/create-academic-year.dto';

@Injectable()
export class AcademicYearsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const items = await this.prisma.academicYear.findMany({
      orderBy: { year: 'desc' },
    });
    return items.map((i) => this.serialize(i));
  }

  async findCurrent() {
    const item = await this.prisma.academicYear.findFirst({
      where: { isCurrent: true },
    });
    return item ? this.serialize(item) : null;
  }

  async create(dto: CreateAcademicYearDto) {
    const item = await this.prisma.academicYear.create({
      data: {
        year: dto.year,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: dto.isCurrent ?? false,
      },
    });
    return this.serialize(item);
  }

  async setCurrent(id: number) {
    // Unset all current
    await this.prisma.academicYear.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });
    // Set the chosen one
    const item = await this.prisma.academicYear.update({
      where: { id: BigInt(id) },
      data: { isCurrent: true },
    });
    return this.serialize(item);
  }

  private serialize(item: any) {
    return {
      ...item,
      id: Number(item.id),
    };
  }
}
