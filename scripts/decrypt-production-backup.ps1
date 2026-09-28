[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$EncryptedFile,
  [Parameter(Mandatory=$true)][string]$OutputFile,
  [string]$PrivateRoot = 'C:\bookzenvo\private-launch-records',
  [string]$RecoveryMetadata
)
$ErrorActionPreference = 'Stop'
if ($RecoveryMetadata) {
  $recovery = Get-Content -LiteralPath $RecoveryMetadata -Raw | ConvertFrom-Json
  if ($recovery.algorithm -ne 'scrypt' -or -not $recovery.salt) { throw 'Recovery metadata is invalid.' }
  $passphrase = Read-Host 'Backup recovery passphrase' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passphrase)
  try { $plainPassphrase = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  try {
    $derivedJson = $plainPassphrase | node (Join-Path $PSScriptRoot 'backup-key.mjs') $recovery.salt
    if ($LASTEXITCODE -ne 0) { throw 'Could not derive the backup key.' }
    $key = ($derivedJson | ConvertFrom-Json).key
  }
  finally { $plainPassphrase = $null }
}
else {
  $keyPath = Join-Path $PrivateRoot 'backup-config\encryption-key.dpapi'
  if (-not (Test-Path -LiteralPath $keyPath)) { throw 'The protected backup key is missing.' }
  $secure = Get-Content -LiteralPath $keyPath -Raw | ConvertTo-SecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
try {
  $key | node (Join-Path $PSScriptRoot 'backup-crypto.mjs') decrypt $EncryptedFile $OutputFile
  if ($LASTEXITCODE -ne 0) { throw 'Backup decryption or integrity verification failed.' }
}
finally { $key = $null }
