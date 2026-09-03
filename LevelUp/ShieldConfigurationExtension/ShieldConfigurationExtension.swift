import ManagedSettings
import ManagedSettingsUI
import UIKit
import FamilyControls

/// Customizes the system-drawn shield screen that covers a gated app/category. Purely
/// presentational — it cannot unlock anything itself (see ShieldActionExtension for the
/// button behavior).
class ShieldConfigurationExtension: ShieldConfigurationDataSource {

    override func configuration(shielding application: ApplicationToken) -> ShieldConfiguration {
        makeConfiguration()
    }

    override func configuration(shielding application: ApplicationToken, in category: ActivityCategoryToken) -> ShieldConfiguration {
        makeConfiguration()
    }

    override func configuration(shielding webDomain: WebDomainToken) -> ShieldConfiguration {
        makeConfiguration()
    }

    override func configuration(shielding webDomain: WebDomainToken, in category: ActivityCategoryToken) -> ShieldConfiguration {
        makeConfiguration()
    }

    private func makeConfiguration() -> ShieldConfiguration {
        ShieldConfiguration(
            backgroundBlurStyle: .systemMaterialDark,
            backgroundColor: UIColor(red: 0.09, green: 0.09, blue: 0.14, alpha: 1),
            icon: UIImage(systemName: "lock.shield"),
            title: ShieldConfiguration.Label(text: "Locked", color: .white),
            subtitle: ShieldConfiguration.Label(
                text: "Finish today's chores or boost your fitness score to earn game time.",
                color: .lightGray
            ),
            primaryButtonLabel: ShieldConfiguration.Label(text: "Open LevelUp", color: .white),
            primaryButtonBackgroundColor: UIColor.systemIndigo
        )
    }
}
