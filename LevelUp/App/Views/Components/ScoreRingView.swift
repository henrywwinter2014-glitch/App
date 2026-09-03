import SwiftUI

struct ScoreRingView: View {
    let score: Int // 0...100
    var lineWidth: CGFloat = 14
    var diameter: CGFloat = 140

    private var progress: Double { Double(min(max(score, 0), 100)) / 100.0 }

    private var color: Color {
        switch score {
        case 80...: .green
        case 50..<80: .yellow
        default: .red
        }
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(color.opacity(0.2), lineWidth: lineWidth)

            Circle()
                .trim(from: 0, to: progress)
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.6), value: progress)

            VStack(spacing: 2) {
                Text("\(score)")
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                Text("Fitness")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: diameter, height: diameter)
    }
}

#Preview {
    ScoreRingView(score: 72)
}
