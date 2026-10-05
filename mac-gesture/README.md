# Photon Gesture for Mac

A native desktop controller using AVFoundation, Apple Vision hand pose detection, and Core Graphics mouse events. Supports macOS 13 or later on Intel and Apple Silicon.

## Start

Open **Photon Gesture.app**. Select **开启辅助功能设置**, then allow Photon Gesture under System Settings → Privacy & Security → Accessibility. Return to the app, select **启动手势控制**, and allow camera access. No microphone, screen recording or cloud service is required.

An open hand arms control. Move the index fingertip to move the cursor. Pinch thumb and index finger, then release for a click; hold and move for a drag. Two quick pinches can double-click. Extend the index and middle fingers with the other fingers curled, then move vertically to scroll.

Stop with **Control + Option + G**, the menu-bar **停止控制** command, the app's stop button, or a held fist. Stopping releases any held mouse button and closes the camera session. Permission revocation, a stalled camera, or computer sleep also stops control.

### Scroll up / down

In selection mode, aim at the list or document, extend the index and middle fingers, then move vertically. The cursor stays anchored to that area while wheel events scroll it.

For long documents, aim the cursor at the desired area and press **Control + Option + S** to enter the dedicated scrolling mode. Move the hand above or below its starting position and hold it there to keep scrolling. Return to the starting position to stop. Press the same shortcut to return to selection / dragging. The control panel also offers the mode selector, scroll speed and inverted-direction setting.

The HALF exhibit now treats ordinary wheel input as page scrolling. Use Command / Control + wheel, the zoom buttons, or the web two-hand gesture for model zoom.

The default mapping uses a mirror view and the selected monitor. The movement-range slider adjusts how much hand movement covers the screen. Video is processed in memory, never saved or uploaded.

## Build and verify

```sh
bash mac-gesture/build.sh
xcrun swiftc mac-gesture/GestureCore.swift mac-gesture/GestureCoreTests.swift -o /tmp/photon-gesture-tests
/tmp/photon-gesture-tests
```

Output: `outputs/mac-gesture/Photon Gesture.app`, locally ad-hoc signed. Builds both x86_64 and arm64 and combines them into a universal executable. The application is locally built, not notarized for general distribution.

The gesture state machine has deterministic tests for rearming, debounce, dragging, releasing, scroll direction, tracking loss, stale frames, invalid coordinates, and fist stop. Camera tracking and desktop event injection require the user-granted macOS permissions and a live trial; compilation and these tests do not prove real-hand accuracy.

Spatial control was informed by HoloTouch's interaction design; its Linux backend is not used. Cursor smoothing uses the general One Euro filtering approach. No HoloTouch source is included.
