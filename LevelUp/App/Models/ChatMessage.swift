import Foundation
import SwiftData

enum ChatRole: String, Codable {
    case user
    case assistant
}

/// One turn in the Coach chat. Kept as a flat, permanent log (no separate "conversation"
/// grouping) since this is a single ongoing chat with your coach, not multiple threads.
@Model
final class ChatMessage {
    var role: ChatRole
    var text: String
    var createdAt: Date

    init(role: ChatRole, text: String, createdAt: Date = .now) {
        self.role = role
        self.text = text
        self.createdAt = createdAt
    }
}
