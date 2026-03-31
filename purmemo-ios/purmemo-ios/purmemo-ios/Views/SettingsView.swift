import SwiftUI

struct SettingsView: View {
    var authService: AuthService
    @Environment(\.dismiss) private var dismiss
    @State private var showLogoutConfirm = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(spacing: 24) {
                        accountSection
                        appSection
                        dangerSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 20)
                    .padding(.bottom, 60)
                }
            }
        }
        .preferredColorScheme(.dark)
        .confirmationDialog("Sign out of purmemo?", isPresented: $showLogoutConfirm, titleVisibility: .visible) {
            Button("Sign Out", role: .destructive) {
                authService.logout()
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Button { dismiss() } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Back")
                        .font(.system(size: 17))
                }
                .foregroundColor(Color(hex: "#E7FC44"))
            }
            Spacer()
            Text("Settings")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(.white)
            Spacer()
            // Invisible balancer for centering
            HStack(spacing: 4) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                Text("Back")
                    .font(.system(size: 17))
            }
            .opacity(0)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Color.black)
        .overlay(
            Rectangle()
                .frame(height: 0.5)
                .foregroundColor(.white.opacity(0.08)),
            alignment: .bottom
        )
    }

    // MARK: - Account Section

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Account")

            VStack(spacing: 0) {
                settingsRow(icon: "person.circle", label: "Email", value: authService.userEmail)
                divider
                settingsRow(icon: "shield.checkered", label: "Auth", value: authService.userEmail.contains("...") ? "Loading..." : "Active")
            }
            .background(Color(hex: "#1a1a1a"))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )
        }
    }

    // MARK: - App Section

    private var appSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("App")

            VStack(spacing: 0) {
                settingsRow(icon: "apps.iphone", label: "Version", value: appVersion)
                divider
                settingsRow(icon: "server.rack", label: "API", value: "api.purmemo.ai")
                divider
                settingsRow(icon: "target", label: "Platform", value: "iOS \(UIDevice.current.systemVersion)")
            }
            .background(Color(hex: "#1a1a1a"))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )
        }
    }

    // MARK: - Danger Section

    private var dangerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                showLogoutConfirm = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 15))
                    Text("Sign Out")
                        .font(.system(size: 16, weight: .medium))
                    Spacer()
                }
                .foregroundColor(.red.opacity(0.8))
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(Color(hex: "#1a1a1a"))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.red.opacity(0.15), lineWidth: 1)
                )
            }
        }
    }

    // MARK: - Components

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.white.opacity(0.3))
            .tracking(0.8)
            .padding(.leading, 4)
    }

    private func settingsRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15))
                .foregroundColor(Color(hex: "#E7FC44"))
                .frame(width: 20)
            Text(label)
                .font(.system(size: 15))
                .foregroundColor(.white.opacity(0.6))
            Spacer()
            Text(value)
                .font(.system(size: 15))
                .foregroundColor(.white)
                .lineLimit(1)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.06))
            .frame(height: 0.5)
            .padding(.leading, 48)
    }

    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }
}
