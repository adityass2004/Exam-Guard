import { describe, it, expect } from 'vitest';
import {
  classifyDetectionState,
  transformPoint,
  transformBoundingBox,
  computePolygonalFaceMask,
  SCRFD_KEYPOINT_META,
  SCRFD_KEYPOINT_CONNECTIONS,
} from './scrfd-transform';

describe('SCRFD Transform & Visualization Unit Tests', () => {
  describe('classifyDetectionState', () => {
    it('returns NO_FACE when 0 faces are detected', () => {
      const state = classifyDetectionState(0);
      expect(state.state).toBe('NO_FACE');
      expect(state.label).toBe('NO FACE DETECTED');
      expect(state.colorHex).toBe('#F59E0B');
    });

    it('returns SINGLE_FACE when exactly 1 face is detected', () => {
      const state = classifyDetectionState(1);
      expect(state.state).toBe('SINGLE_FACE');
      expect(state.label).toBe('SINGLE FACE DETECTED');
      expect(state.colorHex).toBe('#16A34A');
    });

    it('returns MULTIPLE_FACES when 2 or more faces are detected', () => {
      const state = classifyDetectionState(2);
      expect(state.state).toBe('MULTIPLE_FACES');
      expect(state.label).toContain('MULTIPLE FACES DETECTED (2)');
      expect(state.colorHex).toBe('#DC2626');

      const state5 = classifyDetectionState(5);
      expect(state5.state).toBe('MULTIPLE_FACES');
      expect(state5.label).toContain('(5)');
    });
  });

  describe('transformPoint', () => {
    const sourceDims = { width: 640, height: 480 };
    const displayDims = { width: 1280, height: 960 }; // 2x scale

    it('scales points proportionally without mirroring', () => {
      const pt: [number, number] = [100, 150];
      const transformed = transformPoint(pt, sourceDims, displayDims, false);
      expect(transformed[0]).toBe(200);
      expect(transformed[1]).toBe(300);
    });

    it('correctly flips horizontal axis when mirrored', () => {
      const pt: [number, number] = [100, 150];
      const transformed = transformPoint(pt, sourceDims, displayDims, true);
      // Mirrored X = 1280 - (100 * 2) = 1080
      expect(transformed[0]).toBe(1080);
      expect(transformed[1]).toBe(300);
    });

    it('handles center point mirroring accurately', () => {
      const centerPt: [number, number] = [320, 240];
      const unmirrored = transformPoint(centerPt, sourceDims, displayDims, false);
      const mirrored = transformPoint(centerPt, sourceDims, displayDims, true);
      expect(unmirrored[0]).toBe(640);
      expect(mirrored[0]).toBe(640);
      expect(mirrored[1]).toBe(480);
    });
  });

  describe('transformBoundingBox', () => {
    const sourceDims = { width: 640, height: 480 };
    const displayDims = { width: 640, height: 480 }; // 1:1 scale

    it('preserves box width and height when not mirrored', () => {
      const box: [number, number, number, number] = [100, 80, 300, 280]; // width 200, height 200
      const res = transformBoundingBox(box, sourceDims, displayDims, false);
      expect(res.x).toBe(100);
      expect(res.y).toBe(80);
      expect(res.width).toBe(200);
      expect(res.height).toBe(200);
    });

    it('inverts x-coordinate while strictly preserving box width when mirrored', () => {
      const box: [number, number, number, number] = [100, 80, 300, 280]; // width 200
      const res = transformBoundingBox(box, sourceDims, displayDims, true);
      // Mirrored x = 640 - 300 = 340
      expect(res.x).toBe(340);
      expect(res.y).toBe(80);
      expect(res.width).toBe(200);
      expect(res.height).toBe(200);
    });

    it('scales box proportionally on display size changes', () => {
      const box: [number, number, number, number] = [100, 100, 200, 200];
      const largerDisplay = { width: 1280, height: 960 };
      const res = transformBoundingBox(box, sourceDims, largerDisplay, false);
      expect(res.x).toBe(200);
      expect(res.y).toBe(200);
      expect(res.width).toBe(200);
      expect(res.height).toBe(200);
    });
  });

  describe('SCRFD Landmark Meta and Connections', () => {
    it('defines exactly 5 facial landmark specifications', () => {
      expect(SCRFD_KEYPOINT_META.length).toBe(5);
      expect(SCRFD_KEYPOINT_META[0].name).toBe('Left Eye');
      expect(SCRFD_KEYPOINT_META[1].name).toBe('Right Eye');
      expect(SCRFD_KEYPOINT_META[2].name).toBe('Nose Tip');
      expect(SCRFD_KEYPOINT_META[3].name).toBe('Left Mouth Corner');
      expect(SCRFD_KEYPOINT_META[4].name).toBe('Right Mouth Corner');
    });

    it('defines the 6 natural facial triangulation edges', () => {
      expect(SCRFD_KEYPOINT_CONNECTIONS.length).toBe(6);
      expect(SCRFD_KEYPOINT_CONNECTIONS).toEqual([
        [0, 1], // Left Eye - Right Eye
        [0, 2], // Left Eye - Nose
        [1, 2], // Right Eye - Nose
        [2, 3], // Nose - Left Mouth
        [2, 4], // Nose - Right Mouth
        [3, 4], // Left Mouth - Right Mouth
      ]);
    });
  });

  describe('Polygonal Face Mask Computation', () => {
    it('computes 13 anatomical vertices and 16 triangulation facets anchored to SCRFD keypoints', () => {
      const box = { x: 100, y: 50, width: 200, height: 260 };
      const keypoints: Array<[number, number]> = [
        [150, 130], // Left Eye
        [220, 130], // Right Eye
        [185, 175], // Nose Tip
        [160, 220], // Left Mouth
        [210, 220], // Right Mouth
      ];

      const mask = computePolygonalFaceMask(box, keypoints);
      expect(mask.vertices.length).toBe(13);
      expect(mask.outlineIndices.length).toBe(8);
      expect(mask.triangles.length).toBe(16);

      // Verify eye anchors match exactly
      expect(mask.vertices[3]).toEqual([150, 130]);
      expect(mask.vertices[4]).toEqual([220, 130]);
      // Verify nose tip matches exactly
      expect(mask.vertices[5]).toEqual([185, 175]);
      // Verify mouth corners match exactly
      expect(mask.vertices[8]).toEqual([160, 220]);
      expect(mask.vertices[9]).toEqual([210, 220]);

      // Verify forehead is above eyes
      expect(mask.vertices[0][1]).toBeLessThan(130);
      // Verify chin is below mouth
      expect(mask.vertices[12][1]).toBeGreaterThan(220);
    });
  });
});

