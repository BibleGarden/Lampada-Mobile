import Carbon
import Foundation

let hidToVirtual: [Int: UInt16] = [
    4: 0, 5: 11, 6: 8, 7: 2, 8: 14, 9: 3, 10: 5, 11: 4, 12: 34,
    13: 38, 14: 40, 15: 37, 16: 46, 17: 45, 18: 31, 19: 35,
    20: 12, 21: 15, 22: 1, 23: 17, 24: 32, 25: 9, 26: 13,
    27: 7, 28: 16, 29: 6, 30: 18, 31: 19, 32: 20, 33: 21,
    34: 23, 35: 22, 36: 26, 37: 28, 38: 25, 39: 29, 44: 49,
    45: 27, 46: 24, 47: 33, 48: 30, 49: 42, 51: 41, 52: 39,
    53: 50, 54: 43, 55: 47, 56: 44,
]

func translated(_ layout: UnsafePointer<UCKeyboardLayout>, _ virtualKey: UInt16, _ shifted: Bool) -> String {
    var deadKeyState: UInt32 = 0
    var length = 0
    var characters = [UniChar](repeating: 0, count: 8)
    let modifier: UInt32 = shifted ? UInt32(shiftKey >> 8) : 0
    let status = UCKeyTranslate(layout, virtualKey, UInt16(kUCKeyActionDown), modifier,
                                UInt32(LMGetKbdType()), UInt32(kUCKeyTranslateNoDeadKeysBit),
                                &deadKeyState, characters.count, &length, &characters)
    guard status == noErr else {
        fatalError("UCKeyTranslate failed: \(status)")
    }
    return String(decoding: characters.prefix(length), as: UTF16.self)
}

let requested = Array(CommandLine.arguments.dropFirst())
guard !requested.isEmpty else {
    fatalError("Pass at least one macOS keyboard layout ID")
}
let sources = TISCreateInputSourceList(nil, true).takeRetainedValue() as NSArray
var layouts: [String: [String: [String: String]]] = [:]
for id in requested {
    var found: TISInputSource?
    for entry in sources {
        let source = entry as! TISInputSource
        guard let pointer = TISGetInputSourceProperty(source, kTISPropertyInputSourceID) else { continue }
        let sourceID = Unmanaged<CFString>.fromOpaque(pointer).takeUnretainedValue() as String
        if sourceID == id {
            found = source
            break
        }
    }
    guard let source = found,
          let pointer = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData) else {
        fatalError("Keyboard layout definition unavailable: \(id)")
    }
    let data = Unmanaged<CFData>.fromOpaque(pointer).takeUnretainedValue()
    guard let bytes = CFDataGetBytePtr(data) else {
        fatalError("Keyboard layout data is empty: \(id)")
    }
    let layout = UnsafeRawPointer(bytes).assumingMemoryBound(to: UCKeyboardLayout.self)
    var plain: [String: String] = [:]
    var shift: [String: String] = [:]
    for (hid, virtualKey) in hidToVirtual {
        plain[String(hid)] = translated(layout, virtualKey, false)
        shift[String(hid)] = translated(layout, virtualKey, true)
    }
    layouts[id] = ["plain": plain, "shift": shift]
}
let encoded = try JSONSerialization.data(withJSONObject: layouts, options: [.sortedKeys])
guard let output = String(data: encoded, encoding: .utf8) else {
    fatalError("Cannot encode keyboard layout map")
}
print(output)
