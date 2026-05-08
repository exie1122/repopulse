use anyhow::{anyhow, Result};
use reqwest::{Client, StatusCode};
use serde::de::DeserializeOwned;

use crate::models::*;

pub struct GitHubClient {
    client: Client,
    token: String,
}

impl GitHubClient {
    pub fn new(token: String) -> Self {
        let client = Client::builder()
            .user_agent("RepoPulse/0.1.0 (github.com/exie1122/repopulse)")
            .build()
            .expect("Failed to build HTTP client");
        Self { client, token }
    }

    async fn get<T: DeserializeOwned>(&self, url: &str) -> Result<T> {
        let resp = self
            .client
            .get(url)
            .header("Authorization", format!("Bearer {}", self.token))
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await?;

        match resp.status() {
            StatusCode::OK => Ok(resp.json::<T>().await?),
            StatusCode::NOT_FOUND => Err(anyhow!("Repository not found or no push access (404)")),
            StatusCode::FORBIDDEN => Err(anyhow!(
                "Forbidden — your token needs 'repo' scope with push access to read traffic (403)"
            )),
            StatusCode::UNAUTHORIZED => Err(anyhow!("Invalid token (401)")),
            s => {
                let body = resp.text().await.unwrap_or_default();
                Err(anyhow!("GitHub API error {s}: {body}"))
            }
        }
    }

    pub async fn get_user(&self) -> Result<GitHubUser> {
        self.get("https://api.github.com/user").await
    }

    pub async fn list_repos(&self) -> Result<Vec<GitHubRepo>> {
        let mut all: Vec<GitHubRepo> = vec![];
        let mut page = 1u32;

        loop {
            let url = format!(
                "https://api.github.com/user/repos?per_page=100&page={page}&sort=updated&affiliation=owner,collaborator,organization_member"
            );
            let batch: Vec<GitHubRepo> = self.get(&url).await?;
            let done = batch.is_empty();
            all.extend(batch);
            if done || all.len() >= 1000 {
                break;
            }
            page += 1;
        }

        Ok(all)
    }

    pub async fn get_repo(&self, full_name: &str) -> Result<GitHubRepo> {
        self.get(&format!("https://api.github.com/repos/{full_name}"))
            .await
    }

    pub async fn get_traffic_views(&self, full_name: &str) -> Result<TrafficViews> {
        self.get(&format!(
            "https://api.github.com/repos/{full_name}/traffic/views?per=day"
        ))
        .await
    }

    pub async fn get_traffic_clones(&self, full_name: &str) -> Result<TrafficClones> {
        self.get(&format!(
            "https://api.github.com/repos/{full_name}/traffic/clones?per=day"
        ))
        .await
    }

    pub async fn get_referrers(&self, full_name: &str) -> Result<Vec<Referrer>> {
        self.get(&format!(
            "https://api.github.com/repos/{full_name}/traffic/popular/referrers"
        ))
        .await
    }

    pub async fn get_popular_paths(&self, full_name: &str) -> Result<Vec<PopularPath>> {
        self.get(&format!(
            "https://api.github.com/repos/{full_name}/traffic/popular/paths"
        ))
        .await
    }

    pub async fn get_releases(&self, full_name: &str) -> Result<Vec<GitHubRelease>> {
        let mut all: Vec<GitHubRelease> = vec![];
        let mut page = 1u32;

        loop {
            let url = format!(
                "https://api.github.com/repos/{full_name}/releases?per_page=100&page={page}"
            );
            let batch: Vec<GitHubRelease> = self.get(&url).await?;
            let done = batch.is_empty();
            all.extend(batch);
            if done || all.len() >= 500 {
                break;
            }
            page += 1;
        }

        Ok(all)
    }
}
