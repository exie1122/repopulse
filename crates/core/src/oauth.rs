use anyhow::{anyhow, Result};
use reqwest::Client;

use crate::models::{AccessTokenResponse, DeviceCodeResponse};

const DEFAULT_GITHUB_CLIENT_ID: &str = "";

fn github_client_id() -> Option<String> {
    std::env::var("REPOPULSE_GITHUB_CLIENT_ID")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            let fallback = DEFAULT_GITHUB_CLIENT_ID.trim();
            (!fallback.is_empty()).then(|| fallback.to_string())
        })
}

pub fn is_configured() -> bool {
    github_client_id().is_some()
}

fn build_client() -> Result<Client> {
    Ok(Client::builder().user_agent("RepoPulse/0.1.0").build()?)
}

pub async fn start_device_flow() -> Result<DeviceCodeResponse> {
    let client_id = github_client_id().ok_or_else(|| {
        anyhow!("GitHub OAuth App not configured. Set REPOPULSE_GITHUB_CLIENT_ID or use a PAT.")
    })?;

    let client = build_client()?;
    let body = format!("client_id={client_id}&scope=repo");

    let resp = client
        .post("https://github.com/login/device/code")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "application/json")
        .body(body)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Device flow init failed ({status}): {text}"));
    }

    let data: DeviceCodeResponse = resp.json().await?;
    Ok(data)
}

pub async fn poll_device_flow(device_code: &str) -> Result<AccessTokenResponse> {
    let client_id = github_client_id().ok_or_else(|| {
        anyhow!("GitHub OAuth App not configured. Set REPOPULSE_GITHUB_CLIENT_ID or use a PAT.")
    })?;
    let client = build_client()?;
    let encoded_code = device_code
        .bytes()
        .flat_map(|b| {
            if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
                vec![b as char]
            } else {
                format!("%{b:02X}").chars().collect::<Vec<_>>()
            }
        })
        .collect::<String>();

    let grant = "urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code";
    let body = format!("client_id={client_id}&device_code={encoded_code}&grant_type={grant}");

    let resp = client
        .post("https://github.com/login/oauth/access_token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "application/json")
        .body(body)
        .send()
        .await?;

    let data: AccessTokenResponse = resp.json().await?;
    Ok(data)
}
