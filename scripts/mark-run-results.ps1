param(
    [string]$StatusFile
)

# Use paths relative to the script location
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if ($ScriptDir -eq "") { $ScriptDir = "." }
$ProjectRoot = (Get-Item $ScriptDir).Parent.FullName

if (-not $StatusFile) {
    # Find the latest runs/<timestamp>/job-status.json
    $RunsDir = Join-Path $ProjectRoot "runs"
    if (Test-Path $RunsDir) {
        $LatestStatusFile = Get-ChildItem -Path $RunsDir -Filter "job-status.json" -Recurse | 
                            Sort-Object LastWriteTime -Descending | 
                            Select-Object -First 1
        if ($LatestStatusFile) {
            $StatusFile = $LatestStatusFile.FullName
        }
    }
}

if (-not $StatusFile -or -not (Test-Path $StatusFile)) {
    Write-Error "Could not find a job-status.json file. Please specify one with -StatusFile."
    exit 1
}

Write-Host "Marking results from: $StatusFile"

$Data = Get-Content $StatusFile -Raw | ConvertFrom-Json
$Results = $Data.results

if (-not $Results) {
    Write-Host "No results found in $StatusFile"
    exit 0
}

$JobsFile = Join-Path $ProjectRoot "jobs.txt"
$AppliedFile = Join-Path $ProjectRoot "applied_jobs.txt"
$FailedFile = Join-Path $ProjectRoot "failed_jobs.txt"
$SkippedFile = Join-Path $ProjectRoot "skipped_jobs.txt"

function Get-FileLines($Path) {
    if (Test-Path $Path) {
        # Force it to return an array of strings even if 1 line
        $lines = @(Get-Content $Path)
        return $lines
    }
    return @()
}

$JobsContent = Get-FileLines $JobsFile
$AppliedContent = Get-FileLines $AppliedFile
$FailedContent = Get-FileLines $FailedFile
$SkippedContent = Get-FileLines $SkippedFile

$RemovedFromJobs = 0
$AddedToApplied = 0
$AddedToFailed = 0
$AddedToSkipped = 0
$UnknownStatuses = @()

foreach ($res in $Results) {
    $url = $res.url.Trim()
    $bucket = $res.bucket

    # Remove from Jobs
    $newJobs = @()
    $foundInJobs = $false
    foreach ($line in $JobsContent) {
        if ($line.Trim() -eq $url) {
            $foundInJobs = $true
        } else {
            $newJobs += $line
        }
    }
    if ($foundInJobs) {
        $JobsContent = $newJobs
        $RemovedFromJobs++
    }

    # Ensure URL is removed from all buckets first
    $AppliedContent = @($AppliedContent | Where-Object { $_.Trim() -ne $url })
    $FailedContent = @($FailedContent | Where-Object { $_.Trim() -ne $url })
    $SkippedContent = @($SkippedContent | Where-Object { $_.Trim() -ne $url })

    # Add to target bucket
    if ($bucket -eq "applied") {
        $AppliedContent += $url
        $AddedToApplied++
    } elseif ($bucket -eq "failed") {
        $FailedContent += $url
        $AddedToFailed++
    } elseif ($bucket -eq "skipped") {
        $SkippedContent += $url
        $AddedToSkipped++
    } else {
        $UnknownStatuses += $bucket
    }
}

function Save-FileLines($Path, $lines) {
    $seen = @{}
    $toWrite = @()
    foreach ($line in $lines) {
        if ($line -like "#*") {
            $toWrite += $line
        } elseif ($line.Trim() -ne "") {
            $trimmed = $line.Trim()
            if (-not $seen.ContainsKey($trimmed)) {
                $toWrite += $trimmed
                $seen[$trimmed] = $true
            }
        }
    }
    # Using Set-Content with explicit array ensures newlines
    Set-Content -Path $Path -Value $toWrite -Encoding UTF8
}

Save-FileLines $JobsFile $JobsContent
Save-FileLines $AppliedFile $AppliedContent
Save-FileLines $FailedFile $FailedContent
Save-FileLines $SkippedFile $SkippedContent

Write-Host "--------------------------------"
Write-Host "Summary:"
Write-Host "Results read: $($Results.Count)"
Write-Host "Removed from jobs.txt: $RemovedFromJobs"
Write-Host "Added to applied_jobs.txt: $AddedToApplied"
Write-Host "Added to failed_jobs.txt: $AddedToFailed"
Write-Host "Added to skipped_jobs.txt: $AddedToSkipped"

$remainingCount = 0
foreach ($line in (Get-Content $JobsFile)) {
    if ($line.Trim() -ne "" -and $line -notlike "#*") { $remainingCount++ }
}
Write-Host "Total queued URLs remaining: $remainingCount"

if ($UnknownStatuses.Count -gt 0) {
    $uniqueUnknown = $UnknownStatuses | Select-Object -Unique
    Write-Host "Unknown statuses encountered: $($uniqueUnknown -join ', ')" -ForegroundColor Yellow
}
