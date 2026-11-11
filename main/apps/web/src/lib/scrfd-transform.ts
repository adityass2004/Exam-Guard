/**
 * SCRFD Real-Time Face Detection & Visualization Transform Helpers
 *
 * Provides coordinate mapping between native camera frame space (e.g. 640x480)
 * and Canvas rendering space, supporting aspect-ratio scaling, horizontal mirroring,
 * and high-fidelity rendering of SCRFD bounding boxes and 5 facial keypoints.
 */

export type ScrfdDetectionState = 'NO_FACE' | 'SINGLE_FACE' | 'MULTIPLE_FACES';

export interface ScrfdKeypoint {
  name: string;
  shortName: string;
  x: number;
  y: number;
}

export interface ScrfdFace {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  confidence: number;
  keypoints: [number, number][]; // 5 keypoints: [left_eye, right_eye, nose, left_mouth, right_mouth]
  yaw?: number | null;
  pitch?: number | null;
  roll?: number | null;
}

export interface ScrfdStateInfo {
  state: ScrfdDetectionState;
  label: string;
  message: string;
  colorHex: string;
  badgeClass: string;
  borderClass: string;
}

export const SCRFD_KEYPOINT_META: Array<{ name: string; shortName: string }> = [
  { name: 'Left Eye', shortName: 'L.Eye' },
  { name: 'Right Eye', shortName: 'R.Eye' },
  { name: 'Nose Tip', shortName: 'Nose' },
  { name: 'Left Mouth Corner', shortName: 'L.Mouth' },
  { name: 'Right Mouth Corner', shortName: 'R.Mouth' },
];

/**
 * Natural facial keypoint triangulation graph:
 * [0, 1]: Inter-pupillary line (Left Eye <-> Right Eye)
 * [0, 2]: Left Eye <-> Nose Tip
 * [1, 2]: Right Eye <-> Nose Tip
 * [2, 3]: Nose Tip <-> Left Mouth Corner
 * [2, 4]: Nose Tip <-> Right Mouth Corner
 * [3, 4]: Outer Lip Line (Left Mouth <-> Right Mouth)
 */
export const SCRFD_KEYPOINT_CONNECTIONS: Array<[number, number]> = [
  [0, 1], // Left Eye - Right Eye
  [0, 2], // Left Eye - Nose
  [1, 2], // Right Eye - Nose
  [2, 3], // Nose - Left Mouth
  [2, 4], // Nose - Right Mouth
  [3, 4], // Left Mouth - Right Mouth
];

/**
 * Classifies detection state based on face count N.
 */
export function classifyDetectionState(faceCount: number): ScrfdStateInfo {
  if (faceCount === 0) {
    return {
      state: 'NO_FACE',
      label: 'NO FACE DETECTED',
      message: 'No face detected. Please position your face in front of the camera.',
      colorHex: '#F59E0B',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
      borderClass: 'border-amber-400',
    };
  }

  if (faceCount === 1) {
    return {
      state: 'SINGLE_FACE',
      label: 'SINGLE FACE DETECTED',
      message: 'Face detection successful. Ready for verification.',
      colorHex: '#16A34A',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      borderClass: 'border-emerald-500',
    };
  }

  return {
    state: 'MULTIPLE_FACES',
    label: `MULTIPLE FACES DETECTED (${faceCount})`,
    message: `Multiple faces detected (${faceCount} candidates). Only one candidate is permitted.`,
    colorHex: '#DC2626',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-300',
    borderClass: 'border-rose-500',
  };
}

/**
 * Maps a single coordinate point (x, y) from source frame space to canvas render space.
 */
export function transformPoint(
  point: [number, number],
  sourceDims: { width: number; height: number },
  displayDims: { width: number; height: number },
  isMirrored: boolean = false
): [number, number] {
  const { width: sw, height: sh } = sourceDims;
  const { width: dw, height: dh } = displayDims;

  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) {
    return point;
  }

  const scaleX = dw / sw;
  const scaleY = dh / sh;

  const rawX = point[0] * scaleX;
  const rawY = point[1] * scaleY;

  const finalX = isMirrored ? dw - rawX : rawX;
  return [Math.round(finalX * 10) / 10, Math.round(rawY * 10) / 10];
}

/**
 * Maps a bounding box [x1, y1, x2, y2] from source frame space to canvas render space.
 */
export function transformBoundingBox(
  box: [number, number, number, number],
  sourceDims: { width: number; height: number },
  displayDims: { width: number; height: number },
  isMirrored: boolean = false
): { x: number; y: number; width: number; height: number } {
  const { width: sw, height: sh } = sourceDims;
  const { width: dw, height: dh } = displayDims;

  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) {
    return { x: box[0], y: box[1], width: box[2] - box[0], height: box[3] - box[1] };
  }

  const scaleX = dw / sw;
  const scaleY = dh / sh;

  const [x1, y1, x2, y2] = box;
  const top = y1 * scaleY;
  const height = (y2 - y1) * scaleY;
  const boxWidth = (x2 - x1) * scaleX;

  let left: number;
  if (isMirrored) {
    left = dw - x2 * scaleX;
  } else {
    left = x1 * scaleX;
  }

  return {
    x: Math.round(left * 10) / 10,
    y: Math.round(top * 10) / 10,
    width: Math.round(boxWidth * 10) / 10,
    height: Math.round(height * 10) / 10,
  };
}

export interface RenderScrfdOptions {
  isMirrored?: boolean;
  showKeypointBadges?: boolean;
  showPolygonalMask?: boolean;
  showBoundingBox?: boolean;
  clearCanvas?: boolean;
}

export interface PolygonalMaskGeometry {
  vertices: Array<[number, number]>; // 13 anatomical mask vertices
  outlineIndices: number[]; // Outer facial perimeter loop
  triangles: Array<[number, number, number]>; // Facet triangulation
}

/**
 * Generates a 13-vertex biometric polygonal face mask anchored to SCRFD box and 5 keypoints.
 */
export function computePolygonalFaceMask(
  box: { x: number; y: number; width: number; height: number },
  keypoints: Array<[number, number]>
): PolygonalMaskGeometry {
  // Identify left-to-right visual coordinates cleanly (mirror-invariant)
  const leftEye = keypoints[0][0] <= keypoints[1][0] ? keypoints[0] : keypoints[1];
  const rightEye = keypoints[0][0] <= keypoints[1][0] ? keypoints[1] : keypoints[0];
  const nose = keypoints[2];
  const leftMouth = keypoints[3][0] <= keypoints[4][0] ? keypoints[3] : keypoints[4];
  const rightMouth = keypoints[3][0] <= keypoints[4][0] ? keypoints[4] : keypoints[3];

  const eyeCenterX = (leftEye[0] + rightEye[0]) / 2;
  const eyeCenterY = (leftEye[1] + rightEye[1]) / 2;
  const mouthCenterX = (leftMouth[0] + rightMouth[0]) / 2;
  const mouthCenterY = (leftMouth[1] + rightMouth[1]) / 2;

  const interOcular = Math.hypot(rightEye[0] - leftEye[0], rightEye[1] - leftEye[1]);
  const mouthWidth = Math.hypot(rightMouth[0] - leftMouth[0], rightMouth[1] - leftMouth[1]);

  const v0_forehead: [number, number] = [
    eyeCenterX,
    Math.max(box.y + box.height * 0.05, eyeCenterY - interOcular * 0.65),
  ];
  const v1_leftTemple: [number, number] = [
    Math.max(box.x + box.width * 0.12, leftEye[0] - interOcular * 0.38),
    Math.max(box.y + box.height * 0.13, leftEye[1] - interOcular * 0.45),
  ];
  const v2_rightTemple: [number, number] = [
    Math.min(box.x + box.width * 0.88, rightEye[0] + interOcular * 0.38),
    Math.max(box.y + box.height * 0.13, rightEye[1] - interOcular * 0.45),
  ];
  const v3_leftEye: [number, number] = leftEye;
  const v4_rightEye: [number, number] = rightEye;
  const v5_nose: [number, number] = nose;
  const v6_leftZygoma: [number, number] = [
    box.x + box.width * 0.07,
    (leftEye[1] + leftMouth[1]) / 2,
  ];
  const v7_rightZygoma: [number, number] = [
    box.x + box.width * 0.93,
    (rightEye[1] + rightMouth[1]) / 2,
  ];
  const v8_leftMouth: [number, number] = leftMouth;
  const v9_rightMouth: [number, number] = rightMouth;
  const v10_leftJaw: [number, number] = [
    box.x + box.width * 0.21,
    leftMouth[1] + (box.y + box.height - leftMouth[1]) * 0.38,
  ];
  const v11_rightJaw: [number, number] = [
    box.x + box.width * 0.79,
    rightMouth[1] + (box.y + box.height - rightMouth[1]) * 0.38,
  ];
  const v12_chin: [number, number] = [
    mouthCenterX,
    Math.min(box.y + box.height - box.height * 0.03, mouthCenterY + mouthWidth * 0.62),
  ];

  const vertices: Array<[number, number]> = [
    v0_forehead, // 0
    v1_leftTemple, // 1
    v2_rightTemple, // 2
    v3_leftEye, // 3
    v4_rightEye, // 4
    v5_nose, // 5
    v6_leftZygoma, // 6
    v7_rightZygoma, // 7
    v8_leftMouth, // 8
    v9_rightMouth, // 9
    v10_leftJaw, // 10
    v11_rightJaw, // 11
    v12_chin, // 12
  ];

  const outlineIndices = [1, 0, 2, 7, 11, 12, 10, 6];

  const triangles: Array<[number, number, number]> = [
    [1, 0, 3],
    [0, 2, 4],
    [0, 3, 4],
    [3, 4, 5],
    [1, 6, 3],
    [2, 4, 7],
    [3, 6, 8],
    [3, 5, 8],
    [4, 5, 9],
    [4, 9, 7],
    [5, 8, 9],
    [6, 10, 8],
    [7, 9, 11],
    [8, 10, 12],
    [9, 11, 12],
    [8, 9, 12],
  ];

  return { vertices, outlineIndices, triangles };
}

/**
 * High-performance canvas renderer for SCRFD bounding boxes, polygonal face masks, and 5 keypoints.
 */
export function renderScrfdCanvas(
  ctx: CanvasRenderingContext2D,
  faces: ScrfdFace[],
  sourceDims: { width: number; height: number },
  displayDims: { width: number; height: number },
  options: RenderScrfdOptions = {}
): void {
  const {
    isMirrored = false,
    showKeypointBadges = true,
    showPolygonalMask = true,
    showBoundingBox = true,
    clearCanvas = true,
  } = options;
  const { width: dw, height: dh } = displayDims;

  // Clear previous frame
  if (clearCanvas) {
    ctx.clearRect(0, 0, dw, dh);
  }

  if (!faces || faces.length === 0) {
    return;
  }

  const isMultiple = faces.length > 1;

  faces.forEach((face, faceIdx) => {
    // 1. Transform Bounding Box
    const box = transformBoundingBox(face.bbox, sourceDims, displayDims, isMirrored);

    // Color: Green for valid single detection (#16A34A), Red for multiple warning (#DC2626)
    const boxColor = isMultiple ? '#DC2626' : '#16A34A';
    const tagBgColor = isMultiple ? 'rgba(220, 38, 38, 0.95)' : 'rgba(22, 163, 74, 0.95)';

    if (showBoundingBox) {
      // Draw Box with corner accents
      ctx.save();
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      // Draw Corner Brackets for high-tech aesthetic
      const cornerLen = Math.min(18, box.width * 0.15, box.height * 0.15);
      ctx.lineWidth = 4;
      ctx.beginPath();
      // Top-Left
      ctx.moveTo(box.x, box.y + cornerLen);
      ctx.lineTo(box.x, box.y);
      ctx.lineTo(box.x + cornerLen, box.y);
      // Top-Right
      ctx.moveTo(box.x + box.width - cornerLen, box.y);
      ctx.lineTo(box.x + box.width, box.y);
      ctx.lineTo(box.x + box.width, box.y + cornerLen);
      // Bottom-Left
      ctx.moveTo(box.x, box.y + box.height - cornerLen);
      ctx.lineTo(box.x, box.y + box.height);
      ctx.lineTo(box.x + cornerLen, box.y + box.height);
      // Bottom-Right
      ctx.moveTo(box.x + box.width - cornerLen, box.y + box.height);
      ctx.lineTo(box.x + box.width, box.y + box.height);
      ctx.lineTo(box.x + box.width, box.y + box.height - cornerLen);
      ctx.stroke();

      // 2. Draw Top Detection Label Badge
      const confPct = Math.round(face.confidence * 1000) / 10;
      const titleText = isMultiple ? `FACE #${faceIdx + 1}` : 'FACE DETECTED';
      const subtitleText = `Confidence: ${confPct.toFixed(1)}%`;

      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      const titleWidth = ctx.measureText(titleText).width;
      ctx.font = '10px Inter, system-ui, sans-serif';
      const subWidth = ctx.measureText(subtitleText).width;
      const badgeW = Math.max(titleWidth, subWidth) + 16;
      const badgeH = 34;

      const badgeX = Math.max(4, Math.min(box.x, dw - badgeW - 4));
      const badgeY = box.y - badgeH - 4 >= 4 ? box.y - badgeH - 4 : box.y + 4;

      ctx.fillStyle = tagBgColor;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6) : ctx.rect(badgeX, badgeY, badgeW, badgeH);
      ctx.fill();

      // Label Text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      ctx.fillText(titleText, badgeX + 8, badgeY + 14);
      ctx.font = '500 10px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText(subtitleText, badgeX + 8, badgeY + 28);

      ctx.restore();
    }

    // 3. Transform Keypoints and Render Polygonal Face Mask + 5 SCRFD Landmarks
    if (face.keypoints && face.keypoints.length === 5) {
      const transformedKps: Array<[number, number]> = face.keypoints.map((pt) =>
        transformPoint(pt, sourceDims, displayDims, isMirrored)
      );

      // 3A. Polygonal Face Mask Layer
      if (showPolygonalMask) {
        const mask = computePolygonalFaceMask(box, transformedKps);
        ctx.save();

        // Fill Outer Facial Polygon with subtle futuristic HUD translucent tint
        ctx.beginPath();
        mask.outlineIndices.forEach((vIdx, i) => {
          const [vx, vy] = mask.vertices[vIdx];
          if (i === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        });
        ctx.closePath();

        const maskFill = isMultiple
          ? 'rgba(220, 38, 38, 0.14)'
          : 'rgba(6, 182, 212, 0.13)';
        ctx.fillStyle = maskFill;
        ctx.fill();

        // Draw Internal Triangular Polygonal Mesh Facets
        ctx.strokeStyle = isMultiple
          ? 'rgba(220, 38, 38, 0.45)'
          : 'rgba(6, 182, 212, 0.50)';
        ctx.lineWidth = 1;
        mask.triangles.forEach(([a, b, c]) => {
          const va = mask.vertices[a];
          const vb = mask.vertices[b];
          const vc = mask.vertices[c];
          ctx.beginPath();
          ctx.moveTo(va[0], va[1]);
          ctx.lineTo(vb[0], vb[1]);
          ctx.lineTo(vc[0], vc[1]);
          ctx.closePath();
          ctx.stroke();
        });

        // Draw Bold Outer Polygonal Perimeter Wireframe
        ctx.beginPath();
        mask.outlineIndices.forEach((vIdx, i) => {
          const [vx, vy] = mask.vertices[vIdx];
          if (i === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        });
        ctx.closePath();
        ctx.strokeStyle = isMultiple ? '#EF4444' : '#06B6D4';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Draw Secondary Contour Nodes
        const coreIndices = new Set([3, 4, 5, 8, 9]);
        mask.vertices.forEach(([vx, vy], idx) => {
          if (!coreIndices.has(idx)) {
            ctx.beginPath();
            ctx.arc(vx, vy, 2.5, 0, 2 * Math.PI);
            ctx.fillStyle = isMultiple ? '#F87171' : '#22D3EE';
            ctx.fill();
          }
        });

        ctx.restore();
      }

      ctx.save();

      // Subtle Connecting Constellation Lines between core 5 keypoints
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.55)'; // Cyan
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);

      SCRFD_KEYPOINT_CONNECTIONS.forEach(([i1, i2]) => {
        const p1 = transformedKps[i1];
        const p2 = transformedKps[i2];
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1[0], p1[1]);
          ctx.lineTo(p2[0], p2[1]);
          ctx.stroke();
        }
      });

      ctx.setLineDash([]); // Reset line dash

      // Draw 5 Core SCRFD Keypoint Nodes
      transformedKps.forEach((pt, kpIdx) => {
        const [px, py] = pt;

        // Outer Glow Circle
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#06B6D4'; // Cyan
        ctx.fill();

        // Inner White Dot
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, 2 * Math.PI);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        // Optional Keypoint Badge Label
        if (showKeypointBadges) {
          const meta = SCRFD_KEYPOINT_META[kpIdx] || { shortName: `P${kpIdx}` };
          ctx.font = 'bold 9px monospace';
          const textW = ctx.measureText(meta.shortName).width;

          // Place label slightly offset from the keypoint
          const labelX = px + 7;
          const labelY = py - 4;

          ctx.fillStyle = 'rgba(11, 31, 58, 0.85)'; // Navy semi-transparent
          ctx.fillRect(labelX - 2, labelY - 9, textW + 4, 12);

          ctx.fillStyle = '#38BDF8'; // Light cyan text
          ctx.fillText(meta.shortName, labelX, labelY);
        }
      });

      ctx.restore();
    }
  });
}

