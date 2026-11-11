import { Router } from 'express';
import { adminGalleryService } from './gallery.service.js';

export const galleryRouter = Router();

/**
 * GET /admin/students/:id/face-gallery
 * All profile versions, metadata, and authorized image URLs for a candidate.
 */
galleryRouter.get('/students/:id/face-gallery', async (req, res, next) => {
  try {
    const data = await adminGalleryService.getStudentFaceGallery(req.params.id);
    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/gallery/candidates
 * Grid listing of candidates with FRONT photo URL and status.
 */
galleryRouter.get('/gallery/candidates', async (req, res, next) => {
  try {
    const { search, enrollmentStatus, page, limit } = req.query;
    const result = await adminGalleryService.listGalleryCandidates({
      search: search ? String(search) : undefined,
      enrollmentStatus: enrollmentStatus ? String(enrollmentStatus) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
