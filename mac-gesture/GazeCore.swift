import CoreGraphics
import Foundation

struct EyeFrame {
  let features: [Double]  // pupil x/y in eye coordinates, face center x/y, yaw/pitch
  let faceBounds: CGRect
  var valid: Bool {
    features.count == 6 && features.allSatisfy(\.isFinite) && faceBounds.width > 0.05
      && faceBounds.height > 0.05 && faceBounds.minX.isFinite && faceBounds.minY.isFinite
  }
}
struct GazeSample {
  let eye: EyeFrame
  let target: CGPoint
}

struct GazeModel {
  let mean: [Double], scale: [Double], xWeights: [Double], yWeights: [Double], face: CGRect
  static func fit(_ samples: [GazeSample]) -> GazeModel? {
    guard samples.count >= 9,
      samples.allSatisfy({ $0.eye.valid && $0.target.x.isFinite && $0.target.y.isFinite })
    else { return nil }
    for column in 0...1 {
      let values = samples.map { $0.eye.features[column] }
      guard (values.max() ?? 0) - (values.min() ?? 0) > 0.015 else { return nil }
    }
    let mean = (0..<6).map { i in
      samples.map { $0.eye.features[i] }.reduce(0, +) / Double(samples.count)
    }
    let scale = (0..<6).map { i in
      max(
        0.015,
        sqrt(
          samples.map { pow($0.eye.features[i] - mean[i], 2) }.reduce(0, +) / Double(samples.count))
      )
    }
    let rows = samples.map { s in
      [1.0] + (0..<6).map { (s.eye.features[$0] - mean[$0]) / scale[$0] }
    }
    var gram = Array(repeating: Array(repeating: 0.0, count: 7), count: 7)
    var bx = Array(repeating: 0.0, count: 7)
    var by = bx
    for (r, s) in zip(rows, samples) {
      for i in 0..<7 {
        bx[i] += r[i] * s.target.x
        by[i] += r[i] * s.target.y
        for j in 0..<7 { gram[i][j] += r[i] * r[j] }
      }
    }
    for i in 0..<7 { gram[i][i] += i == 0 ? 0.000001 : 0.02 }
    func solve(_ values: [Double]) -> [Double]? {
      var a = zip(gram, values).map { $0.0 + [$0.1] }
      for i in 0..<7 {
        let pivot = (i..<7).max { abs(a[$0][i]) < abs(a[$1][i]) }!
        guard abs(a[pivot][i]) > 1e-9 else { return nil }
        a.swapAt(i, pivot)
        let v = a[i][i]
        for j in i...7 { a[i][j] /= v }
        for k in 0..<7 where k != i {
          let factor = a[k][i]
          for j in i...7 { a[k][j] -= factor * a[i][j] }
        }
      }
      return a.map { $0[7] }
    }
    guard let wx = solve(bx), let wy = solve(by) else { return nil }
    let n = Double(samples.count)
    let face = CGRect(
      x: samples.map { $0.eye.faceBounds.minX }.reduce(0, +) / n,
      y: samples.map { $0.eye.faceBounds.minY }.reduce(0, +) / n,
      width: samples.map { $0.eye.faceBounds.width }.reduce(0, +) / n,
      height: samples.map { $0.eye.faceBounds.height }.reduce(0, +) / n)
    return GazeModel(mean: mean, scale: scale, xWeights: wx, yWeights: wy, face: face)
  }
  func predict(_ eye: EyeFrame) -> CGPoint? {
    guard eye.valid, eye.faceBounds.width / face.width > 0.75,
      eye.faceBounds.width / face.width < 1.25,
      hypot(eye.faceBounds.midX - face.midX, eye.faceBounds.midY - face.midY) < 0.12
    else { return nil }
    let z = (0..<6).map { (eye.features[$0] - mean[$0]) / scale[$0] }
    guard z.allSatisfy({ abs($0) < 8 }) else { return nil }
    let r = [1.0] + z
    let x = zip(r, xWeights).map(*).reduce(0, +)
    let y = zip(r, yWeights).map(*).reduce(0, +)
    guard x.isFinite, y.isFinite, x > -0.15, x < 1.15, y > -0.15, y < 1.15 else { return nil }
    return CGPoint(x: max(0, min(1, x)), y: max(0, min(1, y)))
  }
}

struct GazeCalibration {
  enum Phase { case training, validation, ready, failed }
  var phase: Phase = .training
  private(set) var index = 0, model: GazeModel?, meanError = 0.0, maxError = 0.0,
    message = "请看圆点，保持头部稳定"
  let training: [CGPoint], validation: [CGPoint], desktopSize: CGSize
  private var since: Double?, buffer: [EyeFrame] = [], samples: [GazeSample] = [],
    errors: [Double] = []
  init(training: [CGPoint], validation: [CGPoint], desktopSize: CGSize) {
    self.training = training
    self.validation = validation
    self.desktopSize = desktopSize
  }
  var target: CGPoint {
    let t = phase == .training ? training : validation
    return t[min(index, t.count - 1)]
  }
  var progress: Double { min(1, Double(buffer.count) / 15) }
  mutating func consume(_ eye: EyeFrame?, at time: Double) {
    guard phase == .training || phase == .validation else { return }
    guard let eye, eye.valid else {
      buffer = []
      since = nil
      message = "未检测到清晰瞳孔，请调整光线并看圆点"
      return
    }
    if since == nil { since = time }
    guard time - (since ?? time) > 0.8 else { return }
    buffer.append(eye)
    message =
      phase == .training
      ? "九点校准 \(index+1) / \(training.count)" : "独立验证 \(index+1) / \(validation.count)"
    guard buffer.count >= 15 else { return }
    let n = Double(buffer.count)
    let frame = EyeFrame(
      features: (0..<6).map { i in buffer.map { $0.features[i] }.reduce(0, +) / n },
      faceBounds: eye.faceBounds)
    let jitter =
      (0...1).map { i in
        sqrt(buffer.map { pow($0.features[i] - frame.features[i], 2) }.reduce(0, +) / n)
      }.max() ?? 1
    guard jitter < 0.06 else {
      buffer = []
      since = time
      message = "瞳孔定位不稳定，请保持不动并重新采样"
      return
    }
    if phase == .training {
      samples.append(GazeSample(eye: frame, target: target))
      index += 1
      if index == training.count {
        guard let fitted = GazeModel.fit(samples) else {
          phase = .failed
          message = "眼部变化不足，无法建立可靠眼控；请调整摄像头后重试"
          return
        }
        model = fitted
        phase = .validation
        index = 0
      }
    } else {
      guard let prediction = model?.predict(frame) else {
        phase = .failed
        message = "验证时姿势变化过大，请重新校准"
        return
      }
      errors.append(
        hypot(
          (prediction.x - target.x) * desktopSize.width,
          (prediction.y - target.y) * desktopSize.height))
      index += 1
      if index == validation.count {
        meanError = errors.reduce(0, +) / Double(errors.count)
        maxError = errors.max() ?? 0
        phase = meanError <= 100 && maxError <= 180 ? .ready : .failed
        message =
          phase == .ready
          ? String(format: "验证平均误差 %.0f 点。按 Return 手动启用实验眼控", meanError)
          : String(format: "验证未通过（平均误差 %.0f 点）。按 R 重试，Esc 取消", meanError)
      }
    }
    buffer = []
    since = time
  }
}

struct GazeDwell {
  private var anchor: CGPoint?, since: Double?, fired = false
  mutating func reset() {
    anchor = nil
    since = nil
    fired = false
  }
  mutating func update(_ point: CGPoint?, at time: Double) -> (progress: Double, click: Bool) {
    guard let point else {
      if !fired { reset() }
      return (0, false)
    }
    if let anchor, hypot(point.x - anchor.x, point.y - anchor.y) <= 40 {
      guard !fired else { return (0, false) }
      let progress = min(1, (time - (since ?? time)) / 1.2)
      if progress == 1 {
        fired = true
        return (1, true)
      }
      return (progress, false)
    }
    anchor = point
    since = time
    fired = false
    return (0, false)
  }
}
