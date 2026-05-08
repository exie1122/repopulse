use anyhow::{anyhow, Result};
use keyring::Entry;

const SERVICE: &str = "repopulse";
const ACCOUNT: &str = "github-pat";

pub fn save(token: &str) -> Result<()> {
    let entry = Entry::new(SERVICE, ACCOUNT)?;
    entry
        .set_password(token)
        .map_err(|e| anyhow!("Keychain save failed: {e}"))?;
    Ok(())
}

pub fn load() -> Result<String> {
    if let Ok(token) = std::env::var("REPOPULSE_GITHUB_TOKEN") {
        let trimmed = token.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    if let Ok(token) = std::env::var("GITHUB_TOKEN") {
        let trimmed = token.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    let entry = Entry::new(SERVICE, ACCOUNT)?;
    entry.get_password().map_err(|_| {
        anyhow!(
            "No GitHub token found. Set REPOPULSE_GITHUB_TOKEN/GITHUB_TOKEN or add your Personal Access Token in Settings."
        )
    })
}

pub fn delete() -> Result<()> {
    let entry = Entry::new(SERVICE, ACCOUNT)?;
    entry
        .delete_password()
        .map_err(|e| anyhow!("Keychain delete failed: {e}"))?;
    Ok(())
}

pub fn exists() -> bool {
    load().is_ok()
}
