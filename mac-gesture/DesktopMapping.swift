import CoreGraphics

enum DesktopMapping {
  static func position(_ normalized: CGPoint, displays: [CGRect]) -> CGPoint? {
    let screens = displays.filter {
      !$0.isNull && $0.width > 1 && $0.height > 1 && $0.minX.isFinite && $0.minY.isFinite
        && $0.maxX.isFinite && $0.maxY.isFinite
    }
    guard let first = screens.first, normalized.x.isFinite, normalized.y.isFinite else {
      return nil
    }
    let desktop = screens.dropFirst().reduce(first) { $0.union($1) }
    let p = CGPoint(
      x: desktop.minX + min(1, max(0, normalized.x)) * (desktop.width - 1),
      y: desktop.minY + min(1, max(0, normalized.y)) * (desktop.height - 1))
    // Mixed-size monitors can leave gaps in the desktop rectangle. Snap to the
    // closest actual display rather than sending the cursor into empty space.
    return screens.map { r in
      CGPoint(x: min(r.maxX - 1, max(r.minX, p.x)), y: min(r.maxY - 1, max(r.minY, p.y)))
    }
    .min { a, b in hypot(a.x - p.x, a.y - p.y) < hypot(b.x - p.x, b.y - p.y) }
  }
}
