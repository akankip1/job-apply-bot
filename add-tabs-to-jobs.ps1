# add-tabs-to-jobs.ps1
# Reads URLs from clipboard + existing jobs.txt, deduplicates, and writes one URL per line.

$jobsFile = ".\jobs.txt"

if (!(Test-Path $jobsFile)) {
    "# Add one job application URL per line." | Set-Content $jobsFile
}

# Regex stops before another http/https even if there is no space between URLs.
$urlPattern = 'https?://(?:(?!https?://)[^\s,"<>])+'

# Read existing jobs.txt as raw text so even broken single-line URLs can be recovered.
$existingText = Get-Content $jobsFile -Raw

# Keep existing comments.
$comments = Get-Content $jobsFile | Where-Object {
    $_.Trim().StartsWith("#")
}

# Extract existing URLs.
$existingUrls = @(
    [regex]::Matches($existingText, $urlPattern) |
    ForEach-Object {
        $_.Value.Trim()
    }
)

# Extract clipboard URLs.
$clipboardText = Get-Clipboard -Raw

$newUrls = @(
    [regex]::Matches($clipboardText, $urlPattern) |
    ForEach-Object {
        $_.Value.Trim()
    }
)

# Combine and deduplicate.
$combinedInput = @($existingUrls) + @($newUrls)

$allUrls = @(
    $combinedInput |
    ForEach-Object {
        $_.Trim()
    } |
    Where-Object {
        $_ -match '^https?://'
    } |
    Sort-Object -Unique
)

# Write one URL per line.
$output = @()

if ($comments.Count -gt 0) {
    $output += $comments
    $output += ""
}

$output += $allUrls

Set-Content -Path $jobsFile -Value $output

Write-Host "Added URLs from clipboard to jobs.txt."
Write-Host "New URLs found:" $newUrls.Count
Write-Host "Total unique URLs:" $allUrls.Count