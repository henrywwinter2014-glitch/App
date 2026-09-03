import SwiftUI

struct StreakBadge: View {
    let streak: Int

    var body: some View {
        if streak > 0 {
            HStack(spacing: 3) {
                Image(systemName: "flame.fill")
                Text("\(streak)")
            }
            .font(.caption.bold())
            .foregroundStyle(.orange)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.orange.opacity(0.15), in: Capsule())
        }
    }
}

struct PointsPill: View {
    let points: Int
    var systemImage = "star.fill"
    var tint: Color = .indigo

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: systemImage)
            Text("\(points)")
        }
        .font(.subheadline.bold())
        .foregroundStyle(tint)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(tint.opacity(0.15), in: Capsule())
    }
}
