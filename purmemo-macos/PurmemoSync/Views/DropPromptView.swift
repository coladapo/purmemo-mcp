import SwiftUI

/// Shown when images are dropped into chris memo/.
/// Displays thumbnails and lets user add a note before uploading.
struct DropPromptView: View {
    @Bindable var queue: DropQueue

    private let accent = Color(red: 0.906, green: 0.988, blue: 0.267)
    private let cardBg = Color(red: 0.102, green: 0.102, blue: 0.102)

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Header
            HStack {
                Text(queue.pendingImages.count == 1 ? "New Image" : "\(queue.pendingImages.count) New Images")
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                Spacer()
                Button(action: { queue.cancelUpload() }) {
                    Text("Skip")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 8)

            // Image thumbnails
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(queue.pendingImages) { img in
                        VStack(spacing: 4) {
                            if let thumb = img.thumbnail {
                                Image(nsImage: thumb)
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(width: 90, height: 90)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            } else {
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(cardBg)
                                    .frame(width: 90, height: 90)
                                    .overlay {
                                        Image(systemName: "photo")
                                            .foregroundStyle(.tertiary)
                                    }
                            }

                            // Remove button — always visible, clear tap target
                            Button(action: { queue.removeImage(img) }) {
                                HStack(spacing: 3) {
                                    Image(systemName: "xmark")
                                        .font(.system(size: 9, weight: .bold))
                                    Text("Remove")
                                        .font(.system(size: 10))
                                }
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(cardBg)
                                .cornerRadius(10)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .frame(height: 120)

            // Note input
            VStack(alignment: .leading, spacing: 4) {
                Text("Add a note (optional)")
                    .font(.system(size: 11))
                    .foregroundStyle(.tertiary)

                TextField("What's this about?", text: $queue.userNote)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(cardBg)
                    .cornerRadius(8)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            // Actions
            HStack(spacing: 12) {
                Button(action: { queue.cancelUpload() }) {
                    Text("Keep Local Only")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(cardBg)
                        .cornerRadius(8)
                }
                .buttonStyle(.plain)

                Button(action: { queue.confirmUpload() }) {
                    Text("Save to Cloud")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(accent)
                        .cornerRadius(8)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 14)

            Spacer()
        }
    }
}
