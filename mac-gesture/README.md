# Photon Gesture for Mac

A native desktop controller using AVFoundation, Apple Vision hand pose detection, and Core Graphics mouse events. Supports macOS 13 or later on Intel and Apple Silicon.

## Start

Open **Photon Gesture.app**. Select **开启辅助功能设置**, then allow Photon Gesture under System Settings → Privacy & Security → Accessibility. Return to the app, select **启动手势控制**, and allow camera access. No microphone, screen recording or cloud service is required.

The default scope is **the entire desktop, across all displays**, including the Dock, menu bar, Finder, browser windows and other apps. It posts native macOS mouse events and does not depend on the HALF webpage. You may choose one monitor instead under 控制范围.

An open hand arms control. Move the index fingertip to move the cursor. Pinch thumb and index finger, then release for a click; hold and move for a drag. Two quick pinches can double-click. Pinch thumb and middle finger, hold briefly, and release for a right-click menu. Extend the index and middle fingers with the other fingers curled, then move vertically to scroll. The normal **移动 / 点击 / 滚动** mode supports these together; continuous scrolling is an optional separate mode.

Stop with **Control + Option + G**, the menu-bar **停止控制** command, the app's stop button, or a held fist. Stopping releases any held mouse button and closes the camera session. Permission revocation, a stalled camera, or computer sleep also stops control.

### Scroll up / down

In selection mode, aim at the list or document, extend the index and middle fingers, then move vertically. The cursor stays anchored to that area while wheel events scroll it.

For long documents, aim the cursor at the desired area and press **Control + Option + S** to enter the dedicated scrolling mode. Move the hand above or below its starting position and hold it there to keep scrolling. Return to the starting position to stop. Press the same shortcut to return to selection / dragging. The control panel also offers the mode selector, scroll speed and inverted-direction setting.

The HALF exhibit now treats ordinary wheel input as page scrolling. Use Command / Control + wheel, the zoom buttons, or the web two-hand gesture for model zoom.

The default mapping uses a mirror view and all active monitors. Gaps between different-sized monitors snap to the nearest real display. The movement-range slider adjusts how much hand movement covers the desktop. Video is processed in memory, never saved or uploaded.

## Experimental gaze control (0.4)

Choose **眼睛定位＋捏合点击** or **纯眼控：停留点击**, then start control. Apple Vision extracts eye outlines and pupils from a 720p camera stream; a locally fitted ridge regression maps the pupil features to desktop coordinates. The app does not use WebGazer or upload face images. Calibration samples and the model live only in memory.

Follow the nine green dots while keeping your head still. Each point waits for settling and collects fifteen valid, stable samples. Five separate validation targets measure prediction error. Desktop input stays off during calibration and validation. If the independent mean error exceeds 100 screen-coordinate points or the worst error exceeds 180, activation is blocked. After a pass, press Return to explicitly enable the experimental cursor. R retries and Esc / Control + Option + G cancels.

In the hybrid mode, gaze moves the cursor; index-thumb pinching clicks, middle-thumb pinching opens a context menu, two fingers scroll, and a deliberately moved held pinch drags. The click position is latched so a glance toward your hand cannot redirect the pending click. In pure gaze mode, steady gaze for 1.2 seconds clicks once, and looking away rearms it. Natural blinking never generates a click. Missing pupils or an out-of-range head pose suspends control; monitor-layout changes require recalibration.

Ordinary webcam pupil estimates are experimental. Passing the synthetic tests or building the application does not establish real-user accuracy. Live calibration and validation are required; small controls may still be difficult. Face/eye landmarks are gaze features, not identity recognition, and no calibration profile is persisted.

## Build and verify

```sh
bash mac-gesture/build.sh
xcrun swiftc mac-gesture/GestureCore.swift mac-gesture/DesktopMapping.swift mac-gesture/GestureCoreTests.swift -o /tmp/photon-gesture-tests
/tmp/photon-gesture-tests
xcrun swiftc mac-gesture/GazeCore.swift mac-gesture/GazeTests.swift -o /tmp/photon-gaze-tests
/tmp/photon-gaze-tests
```

Output: `outputs/mac-gesture/Photon Gesture.app`, locally ad-hoc signed. Builds both x86_64 and arm64 and combines them into a universal executable. The application is locally built, not notarized for general distribution.

The gesture state machine has deterministic tests for rearming, debounce, dragging, releasing, scroll direction, tracking loss, stale frames, invalid coordinates, and fist stop. Camera tracking and desktop event injection require the user-granted macOS permissions and a live trial; compilation and these tests do not prove real-hand accuracy.

Spatial control was informed by HoloTouch's interaction design; its Linux backend is not used. Cursor smoothing uses the general One Euro filtering approach. No HoloTouch source is included.
