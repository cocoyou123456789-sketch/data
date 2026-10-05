#!/bin/bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")" && pwd)"
task_app="$task_root/../outputs/mac-gesture/Photon Gesture.app"
mkdir -p "$task_app/Contents/MacOS" "$task_app/Contents/Resources"
task_build="$(mktemp -d /tmp/photon-mac-build.XXXXXX)"
trap 'rm -f "$task_build/x86_64" "$task_build/arm64"; rmdir "$task_build"' EXIT
for task_arch in x86_64 arm64; do
  xcrun swiftc -swift-version 5 -O -target "$task_arch-apple-macosx13.0" \
    "$task_root/GestureCore.swift" "$task_root/DesktopMapping.swift" "$task_root/Camera.swift" "$task_root/App.swift" \
    -o "$task_build/$task_arch" \
    -framework SwiftUI -framework AppKit -framework Vision -framework AVFoundation -framework ApplicationServices -framework Carbon
done
xcrun lipo -create "$task_build/x86_64" "$task_build/arm64" -output "$task_app/Contents/MacOS/PhotonGesture"
cp "$task_root/Info.plist" "$task_app/Contents/Info.plist"
codesign --force --sign - --identifier com.cocoyou.photon.gesture "$task_app"
codesign --verify --strict "$task_app"
printf '%s\n' "$task_app"
