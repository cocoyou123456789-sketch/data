import Foundation

@main struct GestureTests {
  static func hand(pinch: Bool = false, x: Double = 0.5, two: Bool = false, fist: Bool = false)
    -> HandFrame
  {
    let wrist = CGPoint(x: x, y: 0.8)
    let palm = CGPoint(x: x, y: 0.65)
    let index = CGPoint(x: x, y: fist ? 0.7 : 0.35)
    let middle = CGPoint(x: x + 0.04, y: (fist || !two) ? 0.7 : 0.32)
    return HandFrame(
      wrist: wrist, palm: palm, thumb: CGPoint(x: x + (pinch ? 0.01 : 0.15), y: index.y),
      index: index, indexPIP: CGPoint(x: x, y: 0.5), middle: middle,
      middlePIP: CGPoint(x: x + 0.04, y: 0.5), ring: CGPoint(x: x + 0.08, y: 0.7),
      ringPIP: CGPoint(x: x + 0.08, y: 0.5), little: CGPoint(x: x + 0.12, y: 0.7),
      littlePIP: CGPoint(x: x + 0.12, y: 0.55))
  }
  static func main() {
    var t = GestureTracker()
    _ = t.update(hand(pinch: true), time: 0)
    if case .down = t.update(hand(pinch: true), time: 0.2) {
      fatalError("Initial closed hand clicked")
    }
    _ = t.update(hand(), time: 0.25)
    _ = t.update(hand(), time: 0.45)
    _ = t.update(hand(pinch: true), time: 0.5)
    guard case .down = t.update(hand(pinch: true), time: 0.65) else {
      fatalError("Debounced pinch did not press")
    }
    guard case .move = t.update(hand(pinch: true, x: 0.55), time: 0.7) else {
      fatalError("Drag did not continue")
    }
    guard case .cancel = t.update(nil, time: 0.75) else { fatalError("Lost hand did not release") }
    if case .down = t.update(hand(pinch: true), time: 0.8) {
      fatalError("Lost hand was not disarmed")
    }
    t.reset()
    _ = t.update(hand(), time: 0)
    _ = t.update(hand(), time: 0.2)
    _ = t.update(hand(pinch: true), time: 0.25)
    _ = t.update(hand(pinch: true), time: 0.4)
    _ = t.update(hand(), time: 0.45)
    guard case .up = t.update(hand(), time: 0.61) else { fatalError("Open did not release") }
    t.reset()
    guard case .scroll(_, let initial) = t.update(hand(two: true), time: 0), initial == 0 else {
      fatalError("Scroll must start without jumping")
    }
    var scrolling = hand(two: true)
    scrolling.index.y += 0.04
    guard case .scroll(_, let delta) = t.update(scrolling, time: 0.1), delta > 0 else {
      fatalError("Scroll direction")
    }
    t.reset()
    _ = t.update(hand(fist: true), time: 0)
    for time in [0.15, 0.3, 0.45, 0.6] { _ = t.update(hand(fist: true), time: time) }
    guard case .stop = t.update(hand(fist: true), time: 0.75) else {
      fatalError("Held fist did not stop")
    }
    t.reset()
    _ = t.update(hand(), time: 0)
    guard case .cancel = t.update(hand(), time: 0.5) else {
      fatalError("Stale frame was not cancelled")
    }
    t.reset()
    var invalid = hand()
    invalid.index.x = .nan
    guard case .cancel = t.update(invalid, time: 0) else {
      fatalError("Invalid coordinates were accepted")
    }
    t.reset()
    guard case .move(let a) = t.update(hand(x: 0.3), time: 0),
      case .move(let b) = t.update(hand(x: 0.4), time: 0.1), b.x < a.x
    else { fatalError("Mirror mapping") }
    t.reset()
    t.scrollOnly = true
    guard case .scroll(_, 0) = t.update(hand(), time: 0) else {
      fatalError("Dedicated scroll mode did not start")
    }
    guard case .scroll = t.update(hand(pinch: true), time: 0.1) else {
      fatalError("Dedicated scroll mode unexpectedly clicked")
    }
    var motion = ScrollMotion()
    guard
      motion.update(
        point: CGPoint(x: 0.5, y: 0.5), delta: 0.2, time: 0, speed: 1, inverted: false,
        continuous: false) == 0
    else { fatalError("Scroll start jumped") }
    guard
      motion.update(
        point: CGPoint(x: 0.5, y: 0.6), delta: 0.04, time: 0.1, speed: 1, inverted: false,
        continuous: false) < 0
    else { fatalError("Downward motion did not scroll down") }
    guard
      motion.update(
        point: CGPoint(x: 0.5, y: 0.5), delta: -0.04, time: 0.2, speed: 1, inverted: false,
        continuous: false) > 0
    else { fatalError("Upward motion did not scroll up") }
    motion.reset()
    _ = motion.update(
      point: CGPoint(x: 0.5, y: 0.5), delta: 0, time: 0, speed: 1, inverted: false, continuous: true
    )
    let one = motion.update(
      point: CGPoint(x: 0.5, y: 0.6), delta: 0, time: 0.1, speed: 1, inverted: false,
      continuous: true)
    let two = motion.update(
      point: CGPoint(x: 0.5, y: 0.6), delta: 0, time: 0.2, speed: 1, inverted: false,
      continuous: true)
    guard one < 0 && two < 0 else { fatalError("Continuous scroll did not continue while held") }
    guard
      motion.update(
        point: CGPoint(x: 0.5, y: 0.5), delta: 0, time: 0.3, speed: 1, inverted: false,
        continuous: true) == 0
    else { fatalError("Neutral position did not stop scrolling") }
    motion.reset()
    _ = motion.update(
      point: CGPoint(x: 0.5, y: 0.5), delta: 0, time: 0, speed: 1, inverted: true, continuous: false
    )
    guard
      motion.update(
        point: CGPoint(x: 0.5, y: 0.6), delta: 0.04, time: 0.1, speed: 1, inverted: true,
        continuous: false) > 0
    else { fatalError("Scroll inversion did not reverse direction") }
    print(
      "PASS: rearming, pinch debounce, drag, release, tracking loss, scroll direction, dedicated scroll mode, continuous scrolling, neutral stop, inversion, fist stop, stale frames, finite coordinates and mirror mapping"
    )
  }
}
