[CmdletBinding()]
param(
  [string]$PrivateRoot = 'C:\bookzenvo\private-launch-records',
  [string]$DailyAt = '02:30'
)

$ErrorActionPreference = 'Stop'
$ProjectRef = 'repamfxdbsbotkonhxmj'
$ConfigRoot = Join-Path $PrivateRoot 'backup-config'
$BackupRoot = Join-Path $PrivateRoot 'backups'
$Runner = Join-Path $PSScriptRoot 'run-local-production-backup.ps1'

function Unprotect-Temporarily([Security.SecureString]$Secure) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

New-Item -ItemType Directory -Path $ConfigRoot, $BackupRoot -Force | Out-Null
& icacls.exe $ConfigRoot /inheritance:r /grant:r "$env:USERNAME`:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the local backup configuration directory.' }

$databasePasswordSecret = Read-Host 'Production Supabase database password' -AsSecureString
$databasePasswordText = Unprotect-Temporarily $databasePasswordSecret
try {
  if (-not $databasePasswordText) { throw 'The production database password is required.' }
  $encodedPassword = [Uri]::EscapeDataString($databasePasswordText)
  $databaseUrl = "postgresql://postgres.$ProjectRef`:$encodedPassword@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
  $databaseSecret = ConvertTo-SecureString $databaseUrl -AsPlainText -Force
}
finally {
  $databasePasswordText = $null
  $encodedPassword = $null
  $databaseUrl = $null
}

$storageSecret = Read-Host 'Paste a production Supabase secret key (or legacy service-role key) for Storage backup' -AsSecureString
$storageText = Unprotect-Temporarily $storageSecret
try {
  $looksLikeLegacyJwt = $storageText.Split('.').Count -eq 3 -and $storageText.Length -ge 100
  $looksLikeSecretKey = $storageText.StartsWith('sb_secret_') -and $storageText.Length -ge 30
  if (-not $looksLikeLegacyJwt -and -not $looksLikeSecretKey) {
    throw 'That does not look like a Supabase service-role key.'
  }
}
finally { $storageText = $null }

$recoveryPassphrase = Read-Host 'Create a backup recovery passphrase (at least 16 characters; save it in your password manager)' -AsSecureString
$recoveryConfirmation = Read-Host 'Type the backup recovery passphrase again' -AsSecureString
$recoveryText = Unprotect-Temporarily $recoveryPassphrase
$confirmationText = Unprotect-Temporarily $recoveryConfirmation
try {
  if ($recoveryText.Length -lt 16) { throw 'The backup recovery passphrase must contain at least 16 characters.' }
  if ($recoveryText -cne $confirmationText) { throw 'The backup recovery passphrases did not match.' }
  $derivedJson = $recoveryText | node (Join-Path $PSScriptRoot 'backup-key.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Could not derive the backup encryption key.' }
  $derived = $derivedJson | ConvertFrom-Json
}
finally {
  $recoveryText = $null
  $confirmationText = $null
}

$databaseSecret | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $ConfigRoot 'database-url.dpapi') -Encoding ascii
$storageSecret | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $ConfigRoot 'storage-service-role.dpapi') -Encoding ascii
$keySecret = ConvertTo-SecureString $derived.key -AsPlainText -Force
$keySecret | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $ConfigRoot 'encryption-key.dpapi') -Encoding ascii
$keyRecovery = [ordered]@{ algorithm = $derived.algorithm; salt = $derived.salt; N = $derived.N; r = $derived.r; p = $derived.p }
$keyRecovery | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ConfigRoot 'key-recovery.json') -Encoding utf8NoBOM
$derived = $null

$time = [DateTime]::ParseExact($DailyAt, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
$taskName = 'Bookzenvo encrypted production backup'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$Runner`" -PrivateRoot `"$PrivateRoot`""
$trigger = New-ScheduledTaskTrigger -Daily -At $time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 4)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Daily encrypted Bookzenvo database and Supabase Storage backup.' -Force | Out-Null

Write-Host 'Credentials are protected for this Windows account and the daily task is registered. Keep the recovery passphrase in your password manager.'
& $Runner -PrivateRoot $PrivateRoot
