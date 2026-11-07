import CoreGraphics
import Vision

enum EyeExtractor {
  static func frame(_ face: VNFaceObservation) -> EyeFrame? {
    guard face.confidence > 0.65, let lm = face.landmarks,
      let left = coordinates(lm.leftEye, lm.leftPupil),
      let right = coordinates(lm.rightEye, lm.rightPupil)
    else { return nil }
    let box = face.boundingBox
    return EyeFrame(
      features: [
        (left.x + right.x) / 2, (left.y + right.y) / 2, box.midX, box.midY,
        face.yaw?.doubleValue ?? 0, face.pitch?.doubleValue ?? 0,
      ], faceBounds: box)
  }
  private static func coordinates(_ eye: VNFaceLandmarkRegion2D?, _ pupil: VNFaceLandmarkRegion2D?)
    -> CGPoint?
  {
    guard let outline = eye?.normalizedPoints, outline.count >= 4,
      let p = pupil?.normalizedPoints.first
    else { return nil }
    var pair = (outline[0], outline[1])
    var width = 0.0
    for a in outline {
      for b in outline {
        let d = hypot(a.x - b.x, a.y - b.y)
        if d > width {
          width = d
          pair = (a, b)
        }
      }
    }
    guard width > 0.015 else { return nil }
    if pair.0.x > pair.1.x { pair = (pair.1, pair.0) }
    let dx = (pair.1.x - pair.0.x) / width
    let dy = (pair.1.y - pair.0.y) / width
    let center = CGPoint(x: (pair.0.x + pair.1.x) / 2, y: (pair.0.y + pair.1.y) / 2)
    let heights = outline.map { ($0.x - center.x) * (-dy) + ($0.y - center.y) * dx }
    guard ((heights.max() ?? 0) - (heights.min() ?? 0)) / width > 0.1 else { return nil }
    let x = ((p.x - center.x) * dx + (p.y - center.y) * dy) / width
    let y = ((p.x - center.x) * (-dy) + (p.y - center.y) * dx) / width
    guard abs(x) < 0.65, abs(y) < 0.5 else { return nil }
    return CGPoint(x: x, y: y)
  }
}
