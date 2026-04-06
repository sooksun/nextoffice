import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface LinkedNote {
  noteId: number;
  relation: string;
  title?: string;
}

export interface GraphNode {
  id: number;
  title: string;
  noteType: string;
  status: string;
}

export interface GraphEdge {
  from: number;
  to: number;
  relation: string;
}

@Injectable()
export class KnowledgeGraphService {
  private readonly logger = new Logger(KnowledgeGraphService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getGraph(organizationId?: number) {
    const where: any = {};
    if (organizationId) where.organizationId = BigInt(organizationId);

    const notes = await this.prisma.knowledgeNote.findMany({
      where,
      select: {
        id: true,
        title: true,
        noteType: true,
        status: true,
        linkedNotes: true,
      },
    });

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const note of notes) {
      nodes.push({
        id: Number(note.id),
        title: note.title,
        noteType: note.noteType,
        status: note.status,
      });

      if (note.linkedNotes) {
        const links: LinkedNote[] = JSON.parse(note.linkedNotes);
        for (const link of links) {
          edges.push({
            from: Number(note.id),
            to: link.noteId,
            relation: link.relation,
          });
        }
      }
    }

    return { nodes, edges };
  }

  async linkNotes(fromId: number, toId: number, relation: string) {
    const [fromNote, toNote] = await Promise.all([
      this.prisma.knowledgeNote.findUnique({ where: { id: BigInt(fromId) } }),
      this.prisma.knowledgeNote.findUnique({ where: { id: BigInt(toId) } }),
    ]);
    if (!fromNote) throw new NotFoundException(`Note #${fromId} not found`);
    if (!toNote) throw new NotFoundException(`Note #${toId} not found`);

    const fromLinks: LinkedNote[] = fromNote.linkedNotes
      ? JSON.parse(fromNote.linkedNotes)
      : [];

    const alreadyLinked = fromLinks.some((l) => l.noteId === toId);
    if (!alreadyLinked) {
      fromLinks.push({ noteId: toId, relation, title: toNote.title });
      await this.prisma.knowledgeNote.update({
        where: { id: BigInt(fromId) },
        data: { linkedNotes: JSON.stringify(fromLinks) },
      });
    }

    const toLinks: LinkedNote[] = toNote.linkedNotes
      ? JSON.parse(toNote.linkedNotes)
      : [];

    const reverseLinked = toLinks.some((l) => l.noteId === fromId);
    if (!reverseLinked) {
      const reverseRelation = relation === 'references' ? 'referenced_by' : relation;
      toLinks.push({ noteId: fromId, relation: reverseRelation, title: fromNote.title });
      await this.prisma.knowledgeNote.update({
        where: { id: BigInt(toId) },
        data: { linkedNotes: JSON.stringify(toLinks) },
      });
    }

    return { linked: true, fromId, toId, relation };
  }

  async unlinkNotes(fromId: number, toId: number) {
    const [fromNote, toNote] = await Promise.all([
      this.prisma.knowledgeNote.findUnique({ where: { id: BigInt(fromId) } }),
      this.prisma.knowledgeNote.findUnique({ where: { id: BigInt(toId) } }),
    ]);

    if (fromNote?.linkedNotes) {
      const links: LinkedNote[] = JSON.parse(fromNote.linkedNotes);
      const filtered = links.filter((l) => l.noteId !== toId);
      await this.prisma.knowledgeNote.update({
        where: { id: BigInt(fromId) },
        data: { linkedNotes: JSON.stringify(filtered) },
      });
    }

    if (toNote?.linkedNotes) {
      const links: LinkedNote[] = JSON.parse(toNote.linkedNotes);
      const filtered = links.filter((l) => l.noteId !== fromId);
      await this.prisma.knowledgeNote.update({
        where: { id: BigInt(toId) },
        data: { linkedNotes: JSON.stringify(filtered) },
      });
    }

    return { unlinked: true, fromId, toId };
  }

  async getRelatedNotes(noteId: number) {
    const note = await this.prisma.knowledgeNote.findUnique({
      where: { id: BigInt(noteId) },
    });
    if (!note) throw new NotFoundException(`Note #${noteId} not found`);

    const links: LinkedNote[] = note.linkedNotes
      ? JSON.parse(note.linkedNotes)
      : [];

    if (links.length === 0) return [];

    const linkedIds = links.map((l) => BigInt(l.noteId));
    const linkedNotes = await this.prisma.knowledgeNote.findMany({
      where: { id: { in: linkedIds } },
    });

    return linkedNotes.map((n) => {
      const link = links.find((l) => l.noteId === Number(n.id));
      return {
        ...this.serialize(n),
        relation: link?.relation || 'related',
      };
    });
  }

  async autoLink(noteId: number) {
    const note = await this.prisma.knowledgeNote.findUnique({
      where: { id: BigInt(noteId) },
    });
    if (!note) throw new NotFoundException(`Note #${noteId} not found`);

    const candidates = await this.prisma.knowledgeNote.findMany({
      where: {
        id: { not: BigInt(noteId) },
        organizationId: note.organizationId,
        status: { notIn: ['archived'] },
      },
    });

    const noteFrontmatter = note.frontmatterJson
      ? JSON.parse(note.frontmatterJson)
      : {};
    const noteTopics: string[] = noteFrontmatter.topic_tags || [];
    let linked = 0;

    for (const candidate of candidates) {
      let shouldLink = false;
      let relation = 'related';

      if (
        note.sourceType &&
        candidate.sourceType === note.sourceType &&
        candidate.sourceId &&
        note.sourceId &&
        Number(candidate.sourceId) === Number(note.sourceId)
      ) {
        shouldLink = true;
        relation = 'same_source';
      }

      if (!shouldLink && noteTopics.length > 0) {
        const candidateFm = candidate.frontmatterJson
          ? JSON.parse(candidate.frontmatterJson)
          : {};
        const candidateTopics: string[] = candidateFm.topic_tags || [];
        const overlap = noteTopics.filter((t) => candidateTopics.includes(t));
        if (overlap.length >= 2) {
          shouldLink = true;
          relation = 'topic_overlap';
        }
      }

      if (shouldLink) {
        const existingLinks: LinkedNote[] = note.linkedNotes
          ? JSON.parse(note.linkedNotes)
          : [];
        const alreadyLinked = existingLinks.some((l) => l.noteId === Number(candidate.id));
        if (!alreadyLinked) {
          await this.linkNotes(noteId, Number(candidate.id), relation);
          linked++;
        }
      }
    }

    this.logger.log(`Auto-linked ${linked} notes to note #${noteId}`);
    return { noteId, linked };
  }

  private serialize(note: any) {
    return {
      ...note,
      id: Number(note.id),
      organizationId: note.organizationId ? Number(note.organizationId) : null,
      sourceId: note.sourceId ? Number(note.sourceId) : null,
      confidence: note.confidence ? Number(note.confidence) : null,
      linkedNotes: note.linkedNotes ? JSON.parse(note.linkedNotes) : [],
      frontmatterJson: note.frontmatterJson ? JSON.parse(note.frontmatterJson) : null,
    };
  }
}
