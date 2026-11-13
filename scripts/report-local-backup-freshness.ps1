[CmdletBinding()]
param(
  [string]$PrivateRoot = 'C:\bookzenvo\private-launch-records',
  [string]$SecretPath = '',
  [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
$token = $null
$pointer = [IntPtr]::Zero
try {
  $helper = Join-Path $PSScriptRoot 'report-backup-freshness.mjs'
  $backupRoot = Join-Path $PrivateRoot 'backups'
  if ($VerifyOnly) {
    & node $helper '--verify-only' $backupRoot
  } else {
    if (-not $SecretPath) { $SecretPath = Join-Path $PrivateRoot 'backup-config\monitoring-cron-secret.dpapi' }
    $protectedText = (Get-Content -LiteralPath $SecretPath -Raw).Trim()
    $secure = ConvertTo-SecureString $protectedText
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    # Stdin keeps the credential out of process arguments and command history.
    $token | & node $helper '--report' $backupRoot
  }
  if ($LASTEXITCODE -ne 0) { throw 'Reporter failed.' }
} catch {
  # Never emit an underlying provider, filesystem or credential exception.
  Write-Output 'Backup freshness verification/report failed. No successful report is assumed.'
  exit 1
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $token = $null
  $protectedText = $null
  $secure = $null
}
