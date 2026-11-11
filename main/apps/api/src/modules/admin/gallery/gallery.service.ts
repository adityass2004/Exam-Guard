import { FaceAngle, UserRole } from '@prisma/client';
import { AppError } from '../../../lib/errors.js';
import { prisma } from '../../../lib/prisma.js';
import type {
  CandidateFaceGalleryDto,
  CandidateGalleryItemDto,
  FaceImageDto,
  FaceProfileVersionDto,
} from '@examguard/shared';

export class AdminGalleryService {
  /**
   * Returns complete multi-version face gallery for a specific candidate.
   * Strips all embeddings and ciphertexts; includes authorized image URLs.
   */
  async getStudentFaceGallery(studentUserId: string): Promise<CandidateFaceGalleryDto> {
    const student = await prisma.user.findUnique({
      where: { id: studentUserId },
      include: {
        studentProfile: true,
        faceProfiles: {
          orderBy: { version: 'desc' },
          include: {
            approver: {
              select: {
                fullName: true,
                email: true,
              },
            },
            images: {
              orderBy: { angle: 'asc' },
              select: {
                id: true,
                angle: true,
                capturedAt: true,
                width: true,
                height: true,
                byteSize: true,
                mime: true,
                quality: true,
              },
            },
          },
        },
      },
    });

    if (!student || student.role !== UserRole.STUDENT || student.deletedAt !== null) {
      throw new AppError('NOT_FOUND', 404, 'Candidate not found');
    }

    const profiles: FaceProfileVersionDto[] = student.faceProfiles.map((p) => {
      const images: FaceImageDto[] = p.images.map((img) => ({
        id: img.id,
        angle: img.angle,
        capturedAt: img.capturedAt.toISOString(),
        width: img.width,
        height: img.height,
        byteSize: img.byteSize,
        mime: img.mime,
        quality: img.quality,
        authorizedImageUrl: `/api/v1/admin/images/enrollment/${img.id}`,
      }));

      return {
        id: p.id,
        version: p.version,
        status: p.status,
        submittedAt: p.submittedAt ? p.submittedAt.toISOString() : null,
        approvedAt: p.approvedAt ? p.approvedAt.toISOString() : null,
        approvedBy: p.approvedBy,
        approverName: p.approver?.fullName ?? null,
        rejectedReason: p.rejectedReason,
        revokedAt: p.revokedAt ? p.revokedAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        qualitySummary: p.qualitySummary,
        consistencyMinObserved: p.consistencyMinObserved,
        modelName: p.modelName,
        modelVersion: p.modelVersion,
        embeddingDim: p.embeddingDim,
        images,
      };
    });

    return {
      student: {
        id: student.id,
        fullName: student.fullName,
        studentId: student.studentProfile?.studentId || 'N/A',
        email: student.email,
        status: student.status,
      },
      profiles,
    };
  }

  /**
   * List candidates for the face gallery grid view.
   * Includes FRONT photo authorized URL for preview.
   */
  async listGalleryCandidates(query: {
    search?: string;
    enrollmentStatus?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: CandidateGalleryItemDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 24, 1), 60);
    const skip = (page - 1) * limit;

    const where: any = {
      role: UserRole.STUDENT,
      deletedAt: null,
    };

    if (query.enrollmentStatus) {
      if (query.enrollmentStatus === 'NOT_STARTED') {
        where.studentProfile = { enrollmentStatusCache: null };
      } else {
        where.studentProfile = { enrollmentStatusCache: query.enrollmentStatus };
      }
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { fullName: { contains: term } },
        { email: { contains: term } },
        {
          studentProfile: {
            studentId: { contains: term },
          },
        },
      ];
    }

    const [total, students] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          studentProfile: true,
          faceProfiles: {
            orderBy: { version: 'desc' },
            take: 1,
            include: {
              images: {
                where: { angle: FaceAngle.FRONT },
                take: 1,
                select: { id: true },
              },
            },
          },
        },
      }),
    ]);

    const data: CandidateGalleryItemDto[] = students.map((s) => {
      const latestProfile = s.faceProfiles[0] || null;
      const frontImage = latestProfile?.images[0] || null;

      return {
        studentUserId: s.id,
        fullName: s.fullName,
        studentId: s.studentProfile?.studentId || 'N/A',
        email: s.email,
        status: s.status,
        enrollmentStatus: s.studentProfile?.enrollmentStatusCache || 'NOT_STARTED',
        activeProfileId: latestProfile?.id,
        frontImageId: frontImage?.id,
        frontImageUrl: frontImage ? `/api/v1/admin/images/enrollment/${frontImage.id}` : undefined,
        submittedAt: latestProfile?.submittedAt ? latestProfile.submittedAt.toISOString() : null,
        approvedAt: latestProfile?.approvedAt ? latestProfile.approvedAt.toISOString() : null,
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }
}

export const adminGalleryService = new AdminGalleryService();
