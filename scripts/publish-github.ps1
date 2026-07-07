param(
  [string]$Owner = "thakursandeepu-arch",
  [string]$Repo = "jamallta",
  [string]$Branch = "main",
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$Message = "Replace site with secured Jamallta build",
  [string]$Token = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not $Token) { $Token = [Environment]::GetEnvironmentVariable("GH_TOKEN") }
if (-not $Token) { $Token = [Environment]::GetEnvironmentVariable("GITHUB_TOKEN") }

$rootPath = (Resolve-Path -LiteralPath $Root).Path.TrimEnd("\", "/")
$ignoreDirs = @(
  ".git",
  ".firebase",
  "tools",
  "node_modules",
  "customer/functions/node_modules",
  "email-functions/node_modules"
)
$ignoreFiles = @(
  "# Code Citations.md",
  "deploy.log",
  "package-lock.json",
  "customer/functions/package-lock.json",
  "email-functions/package-lock.json",
  "customer/functions/.env",
  "email-functions/.env",
  ".env"
)

function Convert-ToRepoPath {
  param([string]$Path)
  return $Path.Substring($rootPath.Length + 1).Replace("\", "/")
}

function Test-IsIgnored {
  param([string]$RepoPath)

  foreach ($dir in $ignoreDirs) {
    if ($RepoPath -eq $dir -or $RepoPath.StartsWith("$dir/")) {
      return $true
    }
  }

  foreach ($file in $ignoreFiles) {
    if ($RepoPath -eq $file) {
      return $true
    }
  }

  if ($RepoPath -like "*.log") { return $true }
  if ($RepoPath -like ".env.*") { return $true }
  if ($RepoPath -like "customer/functions/.env.*") { return $true }
  if ($RepoPath -like "email-functions/.env.*") { return $true }
  return $false
}

function Invoke-GitHubApi {
  param(
    [ValidateSet("GET", "POST", "PATCH")]
    [string]$Method,
    [string]$Path,
    $Body = $null
  )

  $headers = @{
    "Accept" = "application/vnd.github+json"
    "Authorization" = "Bearer $Token"
    "User-Agent" = "Jamallta-Publish-Script"
    "X-GitHub-Api-Version" = "2022-11-28"
  }
  $uri = "https://api.github.com$Path"

  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
  }

  $json = $Body | ConvertTo-Json -Depth 50 -Compress
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType "application/json" -Body $json
}

$files = Get-ChildItem -LiteralPath $rootPath -Recurse -File -Force |
  ForEach-Object {
    $repoPath = Convert-ToRepoPath $_.FullName
    if (-not (Test-IsIgnored $repoPath)) {
      [pscustomobject]@{
        FullName = $_.FullName
        RepoPath = $repoPath
        Length = $_.Length
      }
    }
  } |
  Sort-Object RepoPath

$totalBytes = ($files | Measure-Object Length -Sum).Sum
Write-Host "Ready to publish $($files.Count) files ($([math]::Round($totalBytes / 1MB, 2)) MB) to $Owner/$Repo@$Branch"

if ($DryRun) {
  $files | Select-Object RepoPath, Length | Format-Table -AutoSize
  Write-Host "Dry run only. No GitHub changes were made."
  exit 0
}

if (-not $Token) {
  throw "GitHub token missing. Set GH_TOKEN or GITHUB_TOKEN with repo write permission, then run this script again."
}

$refPath = "/repos/$Owner/$Repo/git/ref/heads/$Branch"
$commitPath = "/repos/$Owner/$Repo/git/commits"
$treePath = "/repos/$Owner/$Repo/git/trees"
$blobPath = "/repos/$Owner/$Repo/git/blobs"

$ref = Invoke-GitHubApi -Method GET -Path $refPath
$parentSha = $ref.object.sha

$treeEntries = @()
$index = 0
foreach ($file in $files) {
  $index += 1
  Write-Host "Uploading blob $index/$($files.Count): $($file.RepoPath)"
  $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
  $blob = Invoke-GitHubApi -Method POST -Path $blobPath -Body @{
    content = [Convert]::ToBase64String($bytes)
    encoding = "base64"
  }
  $treeEntries += @{
    path = $file.RepoPath
    mode = "100644"
    type = "blob"
    sha = $blob.sha
  }
}

$tree = Invoke-GitHubApi -Method POST -Path $treePath -Body @{
  tree = $treeEntries
}

$commit = Invoke-GitHubApi -Method POST -Path $commitPath -Body @{
  message = $Message
  tree = $tree.sha
  parents = @($parentSha)
}

Invoke-GitHubApi -Method PATCH -Path $refPath -Body @{
  sha = $commit.sha
  force = $true
} | Out-Null

Write-Host "Published replacement commit: $($commit.sha)"
Write-Host "https://github.com/$Owner/$Repo/commit/$($commit.sha)"
