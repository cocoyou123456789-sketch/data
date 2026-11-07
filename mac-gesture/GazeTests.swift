import CoreGraphics
import Foundation

@main struct GazeTests {
  static let face = CGRect(x: 0.35, y: 0.25, width: 0.3, height: 0.4)
  static func eye(_ x: Double, _ y: Double) -> EyeFrame {
    EyeFrame(features: [x * 0.4 - 0.2, y * 0.3 - 0.15, 0.5, 0.45, 0, 0], faceBounds: face)
  }
  static func main() {
    let targets = [0.12, 0.5, 0.88].flatMap { y in
      [0.12, 0.5, 0.88].map { x in CGPoint(x: x, y: y) }
    }
    let samples = targets.map { GazeSample(eye: eye($0.x, $0.y), target: $0) }
    guard let model = GazeModel.fit(samples), let p = model.predict(eye(0.25, 0.75)),
      hypot(p.x - 0.25, p.y - 0.75) < 0.01
    else { fatalError("Gaze regression") }
    guard GazeModel.fit(targets.map { GazeSample(eye: eye(0.5, 0.5), target: $0) }) == nil else {
      fatalError("Flat pupil samples accepted")
    }
    let moved = EyeFrame(
      features: eye(0.5, 0.5).features, faceBounds: CGRect(x: 0.1, y: 0.1, width: 0.6, height: 0.7))
    guard model.predict(moved) == nil else { fatalError("Changed head distance accepted") }
    var invalid = eye(0.5, 0.5).features
    invalid[0] = .nan
    guard model.predict(EyeFrame(features: invalid, faceBounds: face)) == nil else {
      fatalError("Invalid eyes accepted")
    }
    let checks = [
      CGPoint(x: 0.25, y: 0.25), CGPoint(x: 0.75, y: 0.25), CGPoint(x: 0.5, y: 0.5),
      CGPoint(x: 0.25, y: 0.75), CGPoint(x: 0.75, y: 0.75),
    ]
    var session = GazeCalibration(
      training: targets, validation: checks, desktopSize: CGSize(width: 1920, height: 1080))
    var time = 0.0
    for _ in 0..<1000 {
      if session.phase == .ready || session.phase == .failed { break }
      let target = session.target
      time += 0.1
      session.consume(eye(target.x, target.y), at: time)
    }
    guard session.phase == .ready, session.meanError < 20 else {
      fatalError("Calibration did not validate")
    }
    var bad = GazeCalibration(
      training: targets, validation: checks, desktopSize: CGSize(width: 1920, height: 1080))
    time = 0
    for _ in 0..<1000 {
      if bad.phase == .ready || bad.phase == .failed { break }
      let t = bad.target
      time += 0.1
      bad.consume(bad.phase == .training ? eye(t.x, t.y) : eye(1 - t.x, 1 - t.y), at: time)
    }
    guard bad.phase == .failed else { fatalError("Bad independent validation accepted") }
    var dwell = GazeDwell()
    _ = dwell.update(CGPoint(x: 500, y: 500), at: 0)
    guard dwell.update(CGPoint(x: 502, y: 501), at: 1.3).click else {
      fatalError("Dwell did not click")
    }
    _ = dwell.update(nil, at: 1.5)
    guard !dwell.update(CGPoint(x: 500, y: 500), at: 3).click else {
      fatalError("Blink retriggered dwell click")
    }
    let away = dwell.update(CGPoint(x: 650, y: 500), at: 3.1)
    guard away.armed, !away.click else { fatalError("Look-away did not rearm dwell") }
    guard dwell.update(CGPoint(x: 650, y: 500), at: 4.4).click else {
      fatalError("Rearmed dwell did not click")
    }
    for found in [0, 1, 2] {
      let text = GazeCameraReport.text(found: found)
      guard text.contains("第二台") else { fatalError("Camera report hid the second camera") }
    }
    guard GazeCameraReport.text(found: 2).contains("只用默认这一路") else {
      fatalError("Two cameras were treated as a stereo localizer")
    }
    print(
      "PASS: gaze regression, flat-pupil rejection, pose limits, independent validation, dwell cooldown and blink cancellation"
    )
  }
}
