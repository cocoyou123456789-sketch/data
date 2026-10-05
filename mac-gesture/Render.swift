import AppKit
import SwiftUI

@MainActor @main struct Render {
  static func main() throws {
    let app = NSApplication.shared
    app.setActivationPolicy(.prohibited)
    let control = DesktopControl()
    let render = ImageRenderer(
      content: ControlView(control: control, renderOnly: true).environment(\.colorScheme, .light)
        .background(Color.white))
    render.scale = 2
    guard let image = render.cgImage else {
      throw NSError(domain: "Render", code: 1)
    }
    let bitmap = NSBitmapImageRep(cgImage: image)
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
      throw NSError(domain: "Render", code: 2)
    }
    try data.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
    print("Rendered \(image.width)×\(image.height) app interface")
  }
}
