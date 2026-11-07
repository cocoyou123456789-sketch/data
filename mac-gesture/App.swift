import AVFoundation
import AppKit
import ApplicationServices
import Carbon
import SwiftUI

enum InputMethod: String, CaseIterable {
  case hand = "手势控制"
  case eyePinch = "眼睛定位＋捏合点击"
  case eyeDwell = "纯眼控：停留点击"
}

final class CursorView: NSView {
  var down = false
  var progress = 0.0
  override func draw(_ dirtyRect: NSRect) {
    NSColor(calibratedRed: 0.4, green: 1, blue: 0.8, alpha: down ? 0.8 : 0.16).setFill()
    let circle = NSBezierPath(ovalIn: bounds.insetBy(dx: 5, dy: 5))
    circle.fill()
    NSColor(calibratedRed: 0.55, green: 1, blue: 0.85, alpha: 1).setStroke()
    circle.lineWidth = 2
    circle.stroke()
    if progress > 0 {
      let arc = NSBezierPath()
      arc.appendArc(
        withCenter: CGPoint(x: bounds.midX, y: bounds.midY), radius: 14, startAngle: 90,
        endAngle: 90 - CGFloat(progress * 360), clockwise: true)
      arc.lineWidth = 3
      arc.stroke()
    }
  }
}

final class DesktopControl: NSObject, ObservableObject {
  @Published var running = false
  @Published var starting = false
  @Published var accessible = false
  @Published var cameraPermission = "未授权"
  @Published var status = "准备就绪"
  @Published var showPointer = true
  @Published var mirrored = true
  @Published var gain = 1.0
  @Published var scrollOnly = false { didSet { if oldValue != scrollOnly { resetInteraction() } } }
  @Published var scrollSpeed = 1.4
  @Published var invertScroll = false
  @Published var globalStopAvailable = true
  @Published var screenID: UInt32 = 0
  @Published var inputMethod: InputMethod = .hand {
    didSet { if oldValue != inputMethod { stop() } }
  }
  @Published var gazeInfo = "实验眼控需完成九点校准和五点独立验证"
  @Published var gazeActive = false
  let camera = HandCamera()
  private var tracker = GestureTracker(), run = 0, pressed = false, clickCount: Int64 = 1
  private var scrollMotion = ScrollMotion()
  private var scrollCursor: CGPoint?
  private var gazeSession: GazeCalibration?, gazeModel: GazeModel?, gazeFilter = OneEuroPoint(),
    gazeDwell = GazeDwell()
  private let calibrationOverlay = GazeCalibrationOverlay()
  private var calibrationDesktop = CGRect.zero, calibrationLayout = ""
  private var gazeDragHand: CGPoint?, gazeDragPixel: CGPoint?, gazeDragging = false,
    rightGazePixel: CGPoint?
  private var point = CGPoint.zero, lastClick = 0.0, lastClickPoint = CGPoint.zero, lastFrame = 0.0
  private var timer: Timer?, statusItem: NSStatusItem?, hotKey: EventHotKeyRef?,
    hotKeyHandler: EventHandlerRef?
  private var scrollHotKey: EventHotKeyRef?
  private let hud = NSPanel(
    contentRect: NSRect(x: 0, y: 0, width: 34, height: 34), styleMask: .borderless,
    backing: .buffered, defer: false)
  private let cursor = CursorView(frame: NSRect(x: 0, y: 0, width: 34, height: 34))
  override init() {
    super.init()
    hud.isOpaque = false
    hud.backgroundColor = .clear
    hud.hasShadow = false
    hud.ignoresMouseEvents = true
    hud.level = .statusBar
    hud.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    hud.contentView = cursor
    camera.onFrame = { [weak self] hand, eye, time, run in
      guard let self, self.running, self.run == run else { return }
      self.lastFrame = time
      guard AXIsProcessTrusted() else {
        self.stop()
        self.status = "辅助功能权限已关闭"
        return
      }
      self.tracker.mirrored = self.mirrored
      self.tracker.gain = self.gain
      self.tracker.scrollOnly = self.scrollOnly
      if self.inputMethod != .hand {
        self.processGaze(hand: hand, eye: eye, time: time)
        return
      }
      self.act(self.tracker.update(hand, time: time), time: time)
      if hand == nil {
        self.hud.orderOut(nil)
        self.status = "请举起一只手，先张开手指"
      }
    }
    camera.onError = { [weak self] text, run in
      guard let self, self.run == run else { return }
      self.stop()
      self.status = text
    }
  }
  func setup() {
    guard timer == nil else { return }
    refreshPermissions()
    timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
      guard let self else { return }
      self.refreshPermissions()
      if self.running && ProcessInfo.processInfo.systemUptime - self.lastFrame > 8 {
        self.stop()
        self.status = "摄像头没有响应，请重新启动"
      }
    }
    statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    statusItem?.button?.title = "◈ 桌面手势"
    let menu = NSMenu()
    let show = NSMenuItem(
      title: "打开 Photon Gesture", action: #selector(showWindow), keyEquivalent: "")
    show.target = self
    menu.addItem(show)
    let stopItem = NSMenuItem(
      title: "停止控制  ⌃⌥G", action: #selector(stopFromMenu), keyEquivalent: "")
    stopItem.target = self
    menu.addItem(stopItem)
    menu.addItem(.separator())
    menu.addItem(
      NSMenuItem(title: "退出", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
    statusItem?.menu = menu
    var event = EventTypeSpec(
      eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(
      GetApplicationEventTarget(),
      { _, event, context in
        guard let context, let event else { return OSStatus(eventNotHandledErr) }
        let control = Unmanaged<DesktopControl>.fromOpaque(context).takeUnretainedValue()
        var id = EventHotKeyID()
        let result = GetEventParameter(
          event, UInt32(kEventParamDirectObject), UInt32(typeEventHotKeyID), nil,
          MemoryLayout<EventHotKeyID>.size,
          nil, &id)
        guard result == noErr, id.signature == 0x5048_4F54 else {
          return OSStatus(eventNotHandledErr)
        }
        if id.id == 2 {
          if control.inputMethod == .hand { control.scrollOnly.toggle() }
        } else {
          control.stop()
        }
        return noErr
      }, 1, &event, Unmanaged.passUnretained(self).toOpaque(), &hotKeyHandler)
    let id = EventHotKeyID(signature: 0x5048_4F54, id: 1)
    globalStopAvailable =
      RegisterEventHotKey(
        UInt32(kVK_ANSI_G), UInt32(controlKey | optionKey), id, GetApplicationEventTarget(), 0,
        &hotKey) == noErr
    RegisterEventHotKey(
      UInt32(kVK_ANSI_S), UInt32(controlKey | optionKey),
      EventHotKeyID(signature: 0x5048_4F54, id: 2), GetApplicationEventTarget(), 0, &scrollHotKey)
    NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.willSleepNotification, object: nil, queue: .main
    ) { [weak self] _ in self?.stop() }
    NotificationCenter.default.addObserver(
      forName: NSApplication.willTerminateNotification, object: nil, queue: .main
    ) { [weak self] _ in self?.stop() }
  }
  func refreshPermissions() {
    accessible = AXIsProcessTrusted()
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: cameraPermission = "已允许"
    case .denied, .restricted: cameraPermission = "未允许"
    default: cameraPermission = "首次启动时请求"
    }
  }
  func start() {
    refreshPermissions()
    guard !running && !starting else { return }
    guard accessible else {
      status = "请先在辅助功能中允许 Photon Gesture"
      return
    }
    run += 1
    let token = run
    starting = true
    status = "正在等待摄像头许可"
    AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
      DispatchQueue.main.async {
        guard let self, self.run == token else { return }
        self.starting = false
        self.refreshPermissions()
        guard granted else {
          self.status = "请在系统设置 → 隐私与安全性 → 摄像头中允许访问"
          return
        }
        self.tracker.reset()
        self.running = true
        self.lastFrame = ProcessInfo.processInfo.systemUptime
        self.status = "桌面控制已启动：移动、点击、拖动、双指滚动"
        self.camera.start(run: token, eyes: self.inputMethod != .hand)
        if self.inputMethod != .hand {
          self.scrollOnly = false
          self.beginGazeCalibration()
        }
      }
    }
  }
  func stop() {
    run += 1
    release()
    running = false
    starting = false
    tracker.reset()
    scrollMotion.reset()
    scrollCursor = nil
    camera.stop()
    hud.orderOut(nil)
    calibrationOverlay.hide()
    gazeSession = nil
    gazeModel = nil
    gazeActive = false
    gazeFilter.reset()
    gazeDwell.reset()
    cursor.progress = 0
    if inputMethod != .hand { gazeInfo = "眼控已停止，重新启动将重新校准" }
    status = "已停止，摄像头已关闭"
  }
  private func resetInteraction() {
    release()
    tracker.reset()
    scrollMotion.reset()
    scrollCursor = nil
  }
  @objc private func stopFromMenu() { stop() }
  @objc private func showWindow() {
    NSApp.activate(ignoringOtherApps: true)
    NSApp.windows.first(where: { $0.title == "Photon Gesture" })?.makeKeyAndOrderFront(nil)
  }
  func openAccessibility() {
    let options =
      [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    _ = AXIsProcessTrustedWithOptions(options)
    NSWorkspace.shared.open(
      URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!)
  }
  func openCameraSettings() {
    NSWorkspace.shared.open(
      URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera")!)
  }
  private func position(_ normalized: CGPoint) -> CGPoint {
    return DesktopMapping.position(normalized, displays: displayBounds())
      ?? (CGEvent(source: nil)?.location ?? .zero)
  }
  private func displayBounds() -> [CGRect] {
    return
      screenID == 0
      ? NSScreen.screens.compactMap { s -> CGRect? in
        guard
          let id = (s.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?
            .uint32Value
        else { return nil }
        return CGDisplayBounds(id)
      } : [CGDisplayBounds(screenID)]
  }
  private func layoutKey() -> String {
    displayBounds().map { "\($0.minX),\($0.minY),\($0.width),\($0.height)" }.sorted().joined(
      separator: ";")
  }
  func beginGazeCalibration() {
    guard running, inputMethod != .hand, let first = displayBounds().first else { return }
    release()
    tracker.reset()
    gazeFilter.reset()
    gazeDwell.reset()
    gazeActive = false
    gazeModel = nil
    hud.orderOut(nil)
    calibrationDesktop = displayBounds().dropFirst().reduce(first) { $0.union($1) }
    calibrationLayout = layoutKey()
    func actual(_ p: CGPoint) -> CGPoint {
      let q = position(p)
      return CGPoint(
        x: (q.x - calibrationDesktop.minX) / max(1, calibrationDesktop.width - 1),
        y: (q.y - calibrationDesktop.minY) / max(1, calibrationDesktop.height - 1))
    }
    let training = [0.18, 0.5, 0.82].flatMap { y in
      [0.12, 0.5, 0.88].map { x in actual(CGPoint(x: x, y: y)) }
    }
    let validation = [
      CGPoint(x: 0.25, y: 0.25), CGPoint(x: 0.75, y: 0.25), CGPoint(x: 0.5, y: 0.5),
      CGPoint(x: 0.25, y: 0.75), CGPoint(x: 0.75, y: 0.75),
    ].map(actual)
    gazeSession = GazeCalibration(
      training: training, validation: validation, desktopSize: calibrationDesktop.size)
    calibrationOverlay.show(
      desktop: calibrationDesktop, primary: CGDisplayBounds(CGMainDisplayID()),
      cancel: { [weak self] in self?.stop() }, activate: { [weak self] in self?.enableGaze() },
      retry: { [weak self] in self?.beginGazeCalibration() })
    if let session = gazeSession {
      calibrationOverlay.update(session, target: position(session.target), prediction: nil)
    }
    gazeInfo = "请看校准圆点，校准期间不控制桌面光标"
  }
  private func enableGaze() {
    guard let session = gazeSession, session.phase == .ready, let model = session.model else {
      return
    }
    gazeModel = model
    gazeSession = nil
    gazeActive = true
    calibrationOverlay.hide()
    tracker.reset()
    gazeFilter.reset()
    gazeDwell.reset()
    gazeInfo = String(format: "实验眼控已启用 · 验证平均误差 %.0f 屏幕坐标点", session.meanError)
  }
  private func processGaze(hand: HandFrame?, eye: EyeFrame?, time: Double) {
    guard layoutKey() == calibrationLayout else {
      stop()
      gazeInfo = "显示器布局改变，请重新校准"
      return
    }
    if var session = gazeSession {
      session.consume(eye, at: time)
      gazeSession = session
      gazeInfo = session.message
      let preview = eye.flatMap { session.model?.predict($0) }.map(position)
      calibrationOverlay.update(session, target: position(session.target), prediction: preview)
      return
    }
    guard gazeActive, let eye, let prediction = gazeModel?.predict(eye) else {
      release()
      tracker.reset()
      gazeDragHand = nil
      gazeDragPixel = nil
      rightGazePixel = nil
      gazeDragging = false
      _ = gazeDwell.update(nil, at: time)
      cursor.progress = 0
      hud.orderOut(nil)
      status = "视线暂不可用；看向屏幕，保持姿势，必要时重新校准"
      return
    }
    let gaze = position(gazeFilter.update(prediction, at: time))
    if inputMethod == .eyeDwell {
      mouse(.mouseMoved, gaze)
      let dwell = gazeDwell.update(gaze, at: time)
      cursor.progress = dwell.progress
      cursor.needsDisplay = true
      if dwell.click {
        clickCount = 1
        mouse(.leftMouseDown, gaze)
        mouse(.leftMouseUp, gaze)
      }
      status = "纯眼控：稳定注视 1.2 秒点击；自然眨眼不点击"
      return
    }
    cursor.progress = 0
    let action = tracker.update(hand, time: time)
    switch action {
    case .stop: stop()
    case .cancel:
      release()
      gazeDragHand = nil
      gazeDragPixel = nil
      rightGazePixel = nil
      gazeDragging = false
      mouse(.mouseMoved, gaze)
    case .down(let p):
      gazeDragHand = p
      gazeDragPixel = point
      gazeDragging = false
      pressed = true
      clickCount = 1
      mouse(.leftMouseDown, point)
    case .move(let p):
      rightGazePixel = nil
      if pressed, let handAnchor = gazeDragHand, let pixelAnchor = gazeDragPixel {
        let dx = p.x - handAnchor.x
        let dy = p.y - handAnchor.y
        if hypot(dx, dy) > 0.04 { gazeDragging = true }
        if gazeDragging {
          let desired = CGPoint(
            x: pixelAnchor.x + dx * calibrationDesktop.width,
            y: pixelAnchor.y + dy * calibrationDesktop.height)
          let normalized = CGPoint(
            x: (desired.x - calibrationDesktop.minX) / max(1, calibrationDesktop.width - 1),
            y: (desired.y - calibrationDesktop.minY) / max(1, calibrationDesktop.height - 1))
          mouse(.leftMouseDragged, position(normalized))
        }
      } else {
        mouse(.mouseMoved, gaze)
      }
    case .up:
      pressed = false
      mouse(.leftMouseUp, point)
      gazeDragHand = nil
      gazeDragPixel = nil
      gazeDragging = false
    case .holdRight:
      if rightGazePixel == nil { rightGazePixel = point }
    case .rightClick:
      let target = rightGazePixel ?? point
      release()
      mouse(.rightMouseDown, target)
      mouse(.rightMouseUp, target)
      rightGazePixel = nil
    case .scroll(_, let delta):
      let pixels = Int32(max(-100, min(100, (invertScroll ? delta : -delta) * 1800 * scrollSpeed)))
      if pixels != 0 {
        CGEvent(
          scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: pixels, wheel2: 0,
          wheel3: 0)?.post(tap: .cghidEventTap)
      }
    case .idle: mouse(.mouseMoved, gaze)
    }
    if running { status = pressed ? "手势拖动中，松开结束" : "眼睛移动光标 · 捏合点击 · 双指滚动" }
  }
  private func mouse(_ type: CGEventType, _ p: CGPoint) {
    guard
      let event = CGEvent(
        mouseEventSource: nil, mouseType: type, mouseCursorPosition: p,
        mouseButton: type == .rightMouseDown || type == .rightMouseUp ? .right : .left)
    else { return }
    if type == .leftMouseDown || type == .leftMouseUp {
      event.setIntegerValueField(.mouseEventClickState, value: clickCount)
    }
    if type == .rightMouseDown || type == .rightMouseUp {
      event.setIntegerValueField(.mouseEventClickState, value: 1)
    }
    event.post(tap: .cghidEventTap)
    point = p
    if showPointer {
      let height = NSScreen.screens.first?.frame.height ?? 0
      hud.setFrameOrigin(NSPoint(x: p.x - 17, y: height - p.y - 17))
      cursor.down = pressed
      cursor.needsDisplay = true
      hud.orderFrontRegardless()
    } else {
      hud.orderOut(nil)
    }
  }
  private func release() {
    if pressed {
      pressed = false
      mouse(.leftMouseUp, point)
    }
    lastClick = 0
  }
  private func act(_ action: GestureAction, time: Double) {
    switch action {
    case .idle:
      scrollMotion.reset()
      scrollCursor = nil
    case .cancel:
      release()
      scrollMotion.reset()
      scrollCursor = nil
      hud.orderOut(nil)
    case .stop:
      stop()
      status = "握拳已停止控制"
    case .move(let p):
      scrollMotion.reset()
      scrollCursor = nil
      mouse(pressed ? .leftMouseDragged : .mouseMoved, position(p))
      status = pressed ? "捏合拖动中" : "食指移动 · 捏合点击 / 拖动"
    case .down(let p):
      scrollMotion.reset()
      scrollCursor = nil
      let next = position(p)
      clickCount =
        (time - lastClick < 0.5 && hypot(next.x - lastClickPoint.x, next.y - lastClickPoint.y) < 35)
        ? 2 : 1
      pressed = true
      mouse(.leftMouseDown, next)
      status = "捏合拖动中"
    case .up(let p):
      pressed = false
      mouse(.leftMouseUp, position(p))
      lastClick = time
      lastClickPoint = point
    case .holdRight(let p):
      scrollMotion.reset()
      scrollCursor = nil
      mouse(.mouseMoved, position(p))
      status = "拇指与中指捏合中 · 松开打开右键菜单"
    case .rightClick(let p):
      release()
      let target = position(p)
      mouse(.rightMouseDown, target)
      mouse(.rightMouseUp, target)
      status = "右键菜单已打开"
    case .scroll(let p, let delta):
      if scrollCursor == nil {
        let target = scrollOnly ? (CGEvent(source: nil)?.location ?? position(p)) : position(p)
        scrollCursor = target
        mouse(.mouseMoved, target)
      }
      let pixels = scrollMotion.update(
        point: p, delta: delta, time: time, speed: scrollSpeed, inverted: invertScroll,
        continuous: scrollOnly)
      if pixels != 0 {
        CGEvent(
          scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: pixels, wheel2: 0,
          wheel3: 0)?.post(tap: .cghidEventTap)
      }
      status = scrollOnly ? "上下移动并停留 → 连续滚动；回到起始位置 → 停止" : "双指上下滚动中"
    }
  }
}

struct CameraPreview: NSViewRepresentable {
  let session: AVCaptureSession
  func makeNSView(context: Context) -> NSView {
    let view = NSView()
    view.wantsLayer = true
    let preview = AVCaptureVideoPreviewLayer(session: session)
    preview.videoGravity = .resizeAspect
    view.layer = preview
    return view
  }
  func updateNSView(_ view: NSView, context: Context) {
    guard let layer = view.layer as? AVCaptureVideoPreviewLayer else { return }
    layer.frame = view.bounds
    if let c = layer.connection, c.isVideoMirroringSupported {
      c.automaticallyAdjustsVideoMirroring = false
      c.isVideoMirrored = true
    }
  }
}

struct ControlView: View {
  @ObservedObject var control: DesktopControl
  var renderOnly = false
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack {
        Image(systemName: "hand.point.up.left.fill").font(.largeTitle).foregroundStyle(.mint)
        VStack(alignment: .leading) {
          Text("Photon Gesture").font(.title.bold())
          Text("控制整个 Mac 桌面 · 所有应用与窗口").foregroundStyle(.secondary)
        }
        Spacer()
      }
      Picker("输入方式", selection: $control.inputMethod) {
        ForEach(InputMethod.allCases, id: \.self) { Text($0.rawValue).tag($0) }
      }.disabled(control.running || control.starting)
      if control.inputMethod != .hand {
        Text(control.gazeInfo).font(.caption).foregroundStyle(.secondary)
        Button("重新进行九点校准") { control.beginGazeCalibration() }.disabled(!control.running)
      }
      HStack {
        Label(
          control.accessible ? "辅助功能已允许" : "辅助功能待允许",
          systemImage: control.accessible ? "checkmark.circle.fill" : "circle")
        Spacer()
        Button("开启辅助功能设置") { control.openAccessibility() }
      }
      HStack {
        Label("摄像头：\(control.cameraPermission)", systemImage: "camera")
        Spacer()
        Button("摄像头设置") { control.openCameraSettings() }
      }
      if control.running {
        CameraPreview(session: control.camera.session).frame(height: 190).clipShape(
          RoundedRectangle(cornerRadius: 12))
      }
      Text(control.status).font(.headline).foregroundStyle(control.running ? .mint : .secondary)
        .frame(maxWidth: .infinity, alignment: .leading).padding().background(
          .quaternary, in: RoundedRectangle(cornerRadius: 12))
      HStack {
        Button(control.running || control.starting ? "停止控制" : "启动控制") {
          if control.running || control.starting { control.stop() } else { control.start() }
        }.buttonStyle(.borderedProminent).tint(.mint).controlSize(.large)
        Spacer()
        Text(control.globalStopAvailable ? "随时停止：⌃⌥G" : "快捷键被占用，请用菜单栏停止").font(
          .callout.monospaced()
        ).foregroundStyle(.secondary)
      }
      Picker("操作模式", selection: $control.scrollOnly) {
        Text("移动 / 点击 / 滚动").tag(false)
        Text("连续滚动 ⌃⌥S").tag(true)
      }.pickerStyle(.segmented).disabled(control.inputMethod != .hand)
      Picker("控制范围", selection: $control.screenID) {
        Text("整个桌面（所有显示器）").tag(UInt32(0))
        ForEach(NSScreen.screens.indices, id: \.self) { i in
          let screen = NSScreen.screens[i]
          Text(screen.localizedName).tag(
            (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?
              .uint32Value ?? CGMainDisplayID())
        }
      }.disabled(control.running)
      HStack {
        Text("移动范围")
        Slider(value: $control.gain, in: 0.7...1.6)
        Text(String(format: "%.1f×", control.gain)).monospacedDigit()
      }
      HStack {
        Text("滚动速度")
        Slider(value: $control.scrollSpeed, in: 0.5...3.0)
        Text(String(format: "%.1f×", control.scrollSpeed)).monospacedDigit()
      }
      Toggle("反转上下滚动方向", isOn: $control.invertScroll)
      HStack {
        Toggle("镜像移动", isOn: $control.mirrored)
        Toggle("显示手势光标", isOn: $control.showPointer)
      }
      Divider()
      VStack(alignment: .leading, spacing: 8) {
        Text(control.inputMethod == .hand ? "食指移动  →  光标跟随" : "先完成九点校准和五点验证，再按 Return 启用眼控")
        Text("拇指与食指捏合  →  点击；按住并移动  →  拖动")
        Text("拇指与中指捏合后松开  →  右键菜单")
        Text("快速捏合两次  →  双击")
        Text("伸出食指和中指，上下移动  →  滚动")
        Text("⌃⌥S 切换连续滚动：先把光标放在目标列表，再移动手；回到起始位置停止")
        Text("握拳停留约 0.7 秒  →  停止控制")
      }.font(.callout)
      Text("可操作 Finder、Dock、菜单栏、浏览器和其他应用。视频在 Mac 本机处理，不上传或保存。启动前先张开手，让识别稳定。").font(.caption)
        .foregroundStyle(
          .secondary)
    }.padding(26).frame(width: 540).onAppear { if !renderOnly { control.setup() } }
  }
}

#if !PHOTON_RENDER
  @main struct PhotonGestureApp: App {
    @StateObject private var control = DesktopControl()
    var body: some Scene {
      WindowGroup("Photon Gesture") {
        ScrollView { ControlView(control: control) }
          .frame(
            width: 560,
            height: min(
              control.running ? 820 : 620, (NSScreen.main?.visibleFrame.height ?? 900) - 70))
      }.windowResizability(
        .contentSize
      )
      .commands {
        CommandGroup(after: .appInfo) {
          Button("停止手势控制") { control.stop() }.keyboardShortcut("g", modifiers: [.control, .option])
        }
      }
    }
  }
#endif
