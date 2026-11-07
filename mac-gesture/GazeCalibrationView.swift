import AppKit

final class CalibrationPanel: NSPanel { override var canBecomeKey: Bool { true } }
final class CalibrationCanvas: NSView {
  var target = CGPoint.zero, primary = CGRect.zero, desktop = CGRect.zero, progress = 0.0,
    message = "", heading = "", prediction: CGPoint?
  var finished = false, passed = false, confirm = ""
  var cancel: (() -> Void)?, activate: (() -> Void)?, retry: (() -> Void)?
  override var acceptsFirstResponder: Bool { true }
  private func local(_ p: CGPoint) -> CGPoint {
    CGPoint(x: p.x - desktop.minX, y: desktop.maxY - p.y)
  }
  override func draw(_ dirtyRect: NSRect) {
    NSColor(calibratedWhite: 0.055, alpha: 0.98).setFill()
    bounds.fill()
    let origin = local(CGPoint(x: primary.minX + 35, y: primary.minY + 32))
    let title: [NSAttributedString.Key: Any] = [
      .font: NSFont.systemFont(ofSize: 24, weight: .bold), .foregroundColor: NSColor.white,
    ]
    heading.draw(at: origin, withAttributes: title)
    let text: [NSAttributedString.Key: Any] = [
      .font: NSFont.systemFont(ofSize: 16), .foregroundColor: NSColor.lightGray,
    ]
    message.draw(
      in: NSRect(x: origin.x, y: origin.y - 30, width: primary.width - 70, height: 24),
      withAttributes: text)
    "保持头部稳定，眼睛跟随圆点。Esc / ⌃⌥G 停止；完成后 Return 启用，R 重试。校准期间不会选择。".draw(
      in: NSRect(x: origin.x, y: origin.y - 57, width: primary.width - 70, height: 24),
      withAttributes: text)
    confirm.draw(
      in: NSRect(x: origin.x, y: origin.y - 84, width: primary.width - 70, height: 44),
      withAttributes: text)
    if !finished {
      let p = local(target)
      NSColor.systemMint.setFill()
      NSBezierPath(ovalIn: NSRect(x: p.x - 12, y: p.y - 12, width: 24, height: 24)).fill()
      NSColor.systemMint.setStroke()
      let circle = NSBezierPath()
      circle.appendArc(
        withCenter: p, radius: 27, startAngle: 90, endAngle: 90 - CGFloat(progress * 360),
        clockwise: true)
      circle.lineWidth = 4
      circle.stroke()
      if let prediction {
        let q = local(prediction)
        NSColor.systemOrange.setStroke()
        let cross = NSBezierPath()
        cross.move(to: CGPoint(x: q.x - 8, y: q.y))
        cross.line(to: CGPoint(x: q.x + 8, y: q.y))
        cross.move(to: CGPoint(x: q.x, y: q.y - 8))
        cross.line(to: CGPoint(x: q.x, y: q.y + 8))
        cross.stroke()
      }
    } else {
      let p = local(CGPoint(x: primary.midX, y: primary.midY))
      (passed ? "验证通过 · Return 启用眼控" : "校准未通过 · R 重试").draw(
        in: NSRect(x: p.x - 260, y: p.y, width: 520, height: 50), withAttributes: title)
    }
  }
  override func keyDown(with event: NSEvent) {
    if event.keyCode == 53 {
      cancel?()
    } else if event.keyCode == 36 && finished && passed {
      activate?()
    } else if event.keyCode == 15 && finished {
      retry?()
    }
  }
  override func mouseDown(with event: NSEvent) { if finished && passed { activate?() } }
}
final class GazeCalibrationOverlay {
  private let panel = CalibrationPanel(
    contentRect: .zero, styleMask: .borderless, backing: .buffered, defer: false)
  let canvas = CalibrationCanvas()
  init() {
    panel.isOpaque = true
    panel.backgroundColor = .black
    panel.level = .screenSaver
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    panel.contentView = canvas
    panel.isReleasedWhenClosed = false
  }
  func show(
    desktop: CGRect, primary: CGRect, cancel: @escaping () -> Void, activate: @escaping () -> Void,
    retry: @escaping () -> Void
  ) {
    canvas.desktop = desktop
    canvas.primary = primary
    canvas.cancel = cancel
    canvas.activate = activate
    canvas.retry = retry
    let height = NSScreen.screens.first?.frame.height ?? desktop.height
    panel.setFrame(
      NSRect(
        x: desktop.minX, y: height - desktop.maxY, width: desktop.width, height: desktop.height),
      display: true)
    canvas.frame = NSRect(origin: .zero, size: desktop.size)
    NSApp.activate(ignoringOtherApps: true)
    panel.makeKeyAndOrderFront(nil)
    panel.makeFirstResponder(canvas)
  }
  func update(_ session: GazeCalibration, target: CGPoint, prediction: CGPoint?) {
    canvas.heading = session.phase == .training ? "眼控九点校准" : "眼控独立验证"
    canvas.message = session.message
    canvas.target = target
    canvas.progress = session.progress
    canvas.prediction = prediction
    canvas.finished = session.phase == .ready || session.phase == .failed
    canvas.passed = session.phase == .ready
    canvas.needsDisplay = true
  }
  func hide() { panel.orderOut(nil) }
}
