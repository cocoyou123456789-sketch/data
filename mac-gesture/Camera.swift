import AVFoundation
import Vision

final class HandCamera: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  let session = AVCaptureSession()
  private let queue = DispatchQueue(label: "photon.camera", qos: .userInitiated)
  private let request = VNDetectHumanHandPoseRequest()
  private var configured = false, lastFrame = 0.0, run = 0, previousPalm: CGPoint?
  var onFrame: ((HandFrame?, Double, Int) -> Void)?
  var onError: ((String, Int) -> Void)?
  override init() {
    super.init()
    request.maximumHandCount = 2
  }
  func start(run: Int) {
    queue.async { [weak self] in
      guard let self else { return }
      self.run = run
      do {
        if !self.configured {
          guard let device = AVCaptureDevice.default(for: .video) else {
            throw NSError(
              domain: "Camera", code: 1, userInfo: [NSLocalizedDescriptionKey: "未找到摄像头。"])
          }
          let input = try AVCaptureDeviceInput(device: device)
          self.session.beginConfiguration()
          defer { self.session.commitConfiguration() }
          self.session.sessionPreset = .vga640x480
          guard self.session.canAddInput(input) else {
            throw NSError(
              domain: "Camera", code: 2, userInfo: [NSLocalizedDescriptionKey: "摄像头无法连接。"])
          }
          self.session.addInput(input)
          let output = AVCaptureVideoDataOutput()
          output.alwaysDiscardsLateVideoFrames = true
          output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
          ]
          output.setSampleBufferDelegate(self, queue: self.queue)
          guard self.session.canAddOutput(output) else {
            throw NSError(
              domain: "Camera", code: 3, userInfo: [NSLocalizedDescriptionKey: "摄像头输出不可用。"])
          }
          self.session.addOutput(output)
          if let c = output.connection(with: .video), c.isVideoMirroringSupported {
            c.automaticallyAdjustsVideoMirroring = false
            c.isVideoMirrored = false
          }
          self.configured = true
        }
        self.lastFrame = 0
        self.previousPalm = nil
        self.session.startRunning()
      } catch { DispatchQueue.main.async { self.onError?(error.localizedDescription, run) } }
    }
  }
  func stop() { queue.async { [weak self] in self?.session.stopRunning() } }
  func captureOutput(
    _ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    let now = ProcessInfo.processInfo.systemUptime
    guard now - lastFrame > 1.0 / 24, let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }
    lastFrame = now
    do {
      try VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .up).perform([request])
      let frames = (request.results ?? []).compactMap { obs -> HandFrame? in
        guard let joints = try? obs.recognizedPoints(.all) else { return nil }
        func p(_ key: VNHumanHandPoseObservation.JointName) -> CGPoint? {
          guard let q = joints[key], q.confidence > 0.45 else { return nil }
          return CGPoint(x: q.location.x, y: 1 - q.location.y)
        }
        guard let wrist = p(.wrist), let palm = p(.middleMCP), let thumb = p(.thumbTip),
          let index = p(.indexTip), let indexPIP = p(.indexPIP), let middle = p(.middleTip),
          let middlePIP = p(.middlePIP), let ring = p(.ringTip), let ringPIP = p(.ringPIP),
          let little = p(.littleTip), let littlePIP = p(.littlePIP)
        else { return nil }
        return HandFrame(
          wrist: wrist, palm: palm, thumb: thumb, index: index, indexPIP: indexPIP, middle: middle,
          middlePIP: middlePIP, ring: ring, ringPIP: ringPIP, little: little, littlePIP: littlePIP)
      }
      let hand: HandFrame?
      if let previous = previousPalm {
        hand = frames.min(by: {
          hypot($0.palm.x - previous.x, $0.palm.y - previous.y)
            < hypot($1.palm.x - previous.x, $1.palm.y - previous.y)
        })
      } else {
        hand = frames.max(by: { $0.palmLength < $1.palmLength })
      }
      previousPalm = hand?.palm
      let run = self.run
      DispatchQueue.main.async { self.onFrame?(hand, now, run) }
    } catch {
      let run = self.run
      DispatchQueue.main.async { self.onFrame?(nil, now, run) }
    }
  }
}
