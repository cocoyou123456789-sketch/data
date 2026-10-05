import CoreGraphics
import Foundation

struct HandFrame {
  var wrist, palm, thumb, index, indexPIP, middle, middlePIP, ring, ringPIP, little,
    littlePIP: CGPoint
  var palmLength: Double { hypot(palm.x - wrist.x, palm.y - wrist.y) }
}

enum GestureAction {
  case idle, cancel, stop
  case move(CGPoint)
  case down(CGPoint)
  case up(CGPoint)
  case scroll(CGPoint, Double)
}

struct OneEuroPoint {
  private var previous: CGPoint?
  private var velocity = CGPoint.zero
  private var time: Double?
  mutating func reset() {
    previous = nil
    velocity = .zero
    time = nil
  }
  mutating func update(_ point: CGPoint, at now: Double) -> CGPoint {
    guard let p = previous, let t = time else {
      previous = point
      time = now
      return point
    }
    let dt = max(0.001, min(0.15, now - t))
    func alpha(_ cutoff: Double) -> Double { 1 / (1 + 1 / (2 * .pi * cutoff * dt)) }
    let a = alpha(1)
    velocity.x += a * ((point.x - p.x) / dt - velocity.x)
    velocity.y += a * ((point.y - p.y) / dt - velocity.y)
    let k = alpha(1.2 + 4 * hypot(velocity.x, velocity.y))
    let out = CGPoint(x: p.x + k * (point.x - p.x), y: p.y + k * (point.y - p.y))
    previous = out
    time = now
    return out
  }
}

struct GestureTracker {
  private var filter = OneEuroPoint()
  private var candidate = false, pressed = false, armed = false
  private var since = 0.0, lastTime: Double?, fistSince: Double?, scrollPoint: CGPoint?,
    lastPalm: CGPoint?
  var mirrored = true
  var gain = 1.0
  var scrollOnly = false
  mutating func reset() {
    filter.reset()
    candidate = false
    pressed = false
    armed = false
    since = 0
    lastTime = nil
    fistSince = nil
    scrollPoint = nil
    lastPalm = nil
  }
  mutating func update(_ hand: HandFrame?, time: Double) -> GestureAction {
    guard let h = hand, h.palmLength > 0.045 else {
      let held = pressed
      reset()
      return held ? .cancel : .idle
    }
    guard
      [
        h.wrist, h.palm, h.thumb, h.index, h.indexPIP, h.middle, h.middlePIP, h.ring, h.ringPIP,
        h.little, h.littlePIP,
      ].allSatisfy({ $0.x.isFinite && $0.y.isFinite })
    else {
      reset()
      return .cancel
    }
    if let last = lastTime, time - last > 0.3 {
      reset()
      lastTime = time
      return .cancel
    }
    if let previous = lastPalm, hypot(h.palm.x - previous.x, h.palm.y - previous.y) > 0.25 {
      reset()
      return .cancel
    }
    lastPalm = h.palm
    lastTime = time
    func dist(_ a: CGPoint, _ b: CGPoint) -> Double { hypot(a.x - b.x, a.y - b.y) }
    func extended(_ tip: CGPoint, _ pip: CGPoint) -> Bool {
      dist(tip, h.wrist) > dist(pip, h.wrist) * 1.18
    }
    let indexUp = extended(h.index, h.indexPIP)
    let middleUp = extended(h.middle, h.middlePIP)
    let ringUp = extended(h.ring, h.ringPIP)
    let littleUp = extended(h.little, h.littlePIP)
    let ratio = dist(h.thumb, h.index) / h.palmLength
    // A deliberate held fist stops control. A partly occluded hand never counts as a fist.
    let tightlyCurled = [
      (h.index, h.indexPIP), (h.middle, h.middlePIP), (h.ring, h.ringPIP), (h.little, h.littlePIP),
    ].allSatisfy { dist($0.0, h.wrist) < dist($0.1, h.wrist) * 0.72 }
    if tightlyCurled {
      if fistSince == nil {
        fistSince = time
        armed = false
        candidate = false
        since = time
      }
      if time - (fistSince ?? time) > 0.65 {
        reset()
        return .stop
      }
      if pressed {
        pressed = false
        armed = false
        return .cancel
      }
      return .idle
    }
    fistSince = nil
    let cameraX = mirrored ? 1 - h.index.x : h.index.x
    func clamp(_ v: Double) -> Double { min(1, max(0, v)) }
    let point = filter.update(
      CGPoint(
        x: clamp(0.5 + ((cameraX - 0.12) / 0.76 - 0.5) * gain),
        y: clamp(0.5 + ((h.index.y - 0.1) / 0.75 - 0.5) * gain)), at: time)
    if scrollOnly || indexUp && middleUp && !ringUp && !littleUp && ratio > 0.55 {
      if pressed {
        pressed = false
        armed = false
        scrollPoint = nil
        return .cancel
      }
      let dy = scrollPoint.map { point.y - $0.y } ?? 0
      scrollPoint = point
      armed = false
      candidate = false
      since = time
      return .scroll(point, dy)
    }
    scrollPoint = nil
    let desired = pressed ? ratio < 0.55 : ratio < 0.32
    if desired != candidate {
      candidate = desired
      since = time
    }
    if !desired && time - since >= 0.14 {
      armed = true
      if pressed {
        pressed = false
        return .up(point)
      }
    } else if desired && armed && !pressed && time - since >= 0.12 {
      pressed = true
      armed = false
      return .down(point)
    }
    return .move(point)
  }
}

// Converts hand motion into wheel pixels, retaining fractions between frames.
struct ScrollMotion {
  private(set) var anchor: CGPoint?
  private var lastTime: Double?, remainder = 0.0
  mutating func reset() {
    anchor = nil
    lastTime = nil
    remainder = 0
  }
  mutating func update(
    point: CGPoint, delta: Double, time: Double, speed: Double, inverted: Bool, continuous: Bool
  ) -> Int32 {
    guard let anchor = self.anchor, let previous = lastTime else {
      self.anchor = point
      lastTime = time
      return 0
    }
    let dt = max(0, min(0.1, time - previous))
    lastTime = time
    let amount: Double
    if continuous {
      let offset = point.y - anchor.y
      let strength = min(1, max(0, (abs(offset) - 0.03) / 0.18))
      amount = (offset < 0 ? -1.0 : 1.0) * strength * 700 * speed * dt
    } else {
      amount = abs(delta) < 0.0008 ? 0 : delta * 1800 * speed
    }
    let pixels = (inverted ? amount : -amount) + remainder
    let result = Int32(max(-100, min(100, pixels.rounded(.towardZero))))
    remainder = pixels - Double(result)
    if abs(remainder) > 1 { remainder = 0 }
    return result
  }
}
