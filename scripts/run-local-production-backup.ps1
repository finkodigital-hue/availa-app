[CmdletBinding()]
param(
  [string]$PrivateRoot = 'C:\bookzenvo\private-launch-records',
  [switch]$KeepDailyBeyondRetention
)

$ErrorActionPreference = 'Stop'
$ProjectRef = 'repamfxdbsbotkonhxmj'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ConfigRoot = Join-Path $PrivateRoot 'backup-config'
$BackupRoot = Join-Path $PrivateRoot 'backups'
$ToolBin = Join-Path $PrivateRoot 'tools\postgresql17\bin'
$DatabaseSecretPath = Join-Path $ConfigRoot 'database-url.dpapi'
$StorageSecretPath = Join-Path $ConfigRoot 'storage-service-role.dpapi'
$EncryptionSecretPath = Join-Path $ConfigRoot 'encryption-key.dpapi'
$KeyRecoveryPath = Join-Path $ConfigRoot 'key-recovery.json'

function Read-ProtectedText([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Backup configuration is incomplete: $Path"
  }
  # Set-Content terminates the DPAPI ciphertext with a newline. Windows
  # PowerShell 5.1 does not ignore it when converting the value back.
  $protectedValue = (Get-Content -LiteralPath $Path -Raw).Trim()
  $secure = $protectedValue | ConvertTo-SecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Assert-Within([string]$Child, [string]$Parent) {
  $resolvedChild = [IO.Path]::GetFullPath($Child)
  $resolvedParent = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  if (-not $resolvedChild.StartsWith($resolvedParent, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to operate outside the backup directory: $resolvedChild"
  }
}

function Remove-PrivatePath([string]$Path, [string]$Boundary) {
  if (Test-Path -LiteralPath $Path) {
    Assert-Within $Path $Boundary
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

$PgDump = Join-Path $ToolBin 'pg_dump.exe'
$PgRestore = Join-Path $ToolBin 'pg_restore.exe'
foreach ($tool in @($PgDump, $PgRestore)) {
  if (-not (Test-Path -LiteralPath $tool)) { throw "PostgreSQL backup tool not found: $tool" }
}

$DatabaseUrlText = Read-ProtectedText $DatabaseSecretPath
$StorageKey = Read-ProtectedText $StorageSecretPath
$EncryptionKey = Read-ProtectedText $EncryptionSecretPath
$DatabaseUri = [Uri]$DatabaseUrlText
$identity = $DatabaseUri.UserInfo.Split(':', 2)
if ($identity.Count -ne 2) { throw 'The stored database connection URL has no password.' }
$DatabaseUser = [Uri]::UnescapeDataString($identity[0])
$DatabasePassword = [Uri]::UnescapeDataString($identity[1])
$DatabaseName = [Uri]::UnescapeDataString($DatabaseUri.AbsolutePath.TrimStart('/'))
$looksLikeProduction = $DatabaseUri.Host -eq "db.$ProjectRef.supabase.co" -or $DatabaseUser.Contains($ProjectRef)
if (-not $looksLikeProduction -or $DatabaseName -ne 'postgres') {
  throw 'The stored connection does not match the approved production Supabase project.'
}

$Timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHHmmssZ')
$Generation = Join-Path $BackupRoot $Timestamp
$Staging = Join-Path $Generation '.staging'
$PlainDump = Join-Path $Staging 'database.dump'
$PlainStorage = Join-Path $Staging 'storage'
$StorageZip = Join-Path $Staging 'storage.zip'
$EncryptedDump = Join-Path $Generation 'database.dump.bzenc'
$EncryptedStorage = Join-Path $Generation 'storage.zip.bzenc'
$MetadataPath = Join-Path $Generation 'backup-metadata.json'
New-Item -ItemType Directory -Path $Staging, $PlainStorage -Force | Out-Null
if (-not (Test-Path -LiteralPath $KeyRecoveryPath)) { throw 'Backup key recovery metadata is missing.' }
Copy-Item -LiteralPath $KeyRecoveryPath -Destination (Join-Path $Generation 'key-recovery.json')

try {
  $env:PGHOST = $DatabaseUri.Host
  $env:PGPORT = if ($DatabaseUri.Port -gt 0) { "$($DatabaseUri.Port)" } else { '5432' }
  $env:PGDATABASE = $DatabaseName
  $env:PGUSER = $DatabaseUser
  $env:PGPASSWORD = $DatabasePassword
  $env:PGSSLMODE = 'require'
  & $PgDump --format=custom --compress=6 --no-owner --no-privileges --no-subscriptions --file=$PlainDump
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE." }
  & $PgRestore --list $PlainDump | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The database dump could not be read back by pg_restore.' }

  $StorageKey | node (Join-Path $PSScriptRoot 'backup-storage.mjs') 'https://repamfxdbsbotkonhxmj.supabase.co' $PlainStorage
  if ($LASTEXITCODE -ne 0) { throw 'The Storage object copy failed.' }
  Compress-Archive -Path (Join-Path $PlainStorage '*') -DestinationPath $StorageZip -CompressionLevel Optimal

  $databaseResult = $EncryptionKey | node (Join-Path $PSScriptRoot 'backup-crypto.mjs') encrypt $PlainDump $EncryptedDump
  if ($LASTEXITCODE -ne 0) { throw 'Database backup encryption failed.' }
  $storageResult = $EncryptionKey | node (Join-Path $PSScriptRoot 'backup-crypto.mjs') encrypt $StorageZip $EncryptedStorage
  if ($LASTEXITCODE -ne 0) { throw 'Storage backup encryption failed.' }
  $EncryptionKey | node (Join-Path $PSScriptRoot 'backup-crypto.mjs') verify $EncryptedDump | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Encrypted database verification failed.' }
  $EncryptionKey | node (Join-Path $PSScriptRoot 'backup-crypto.mjs') verify $EncryptedStorage | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Encrypted Storage verification failed.' }

  $databaseCrypto = $databaseResult | ConvertFrom-Json
  $storageCrypto = $storageResult | ConvertFrom-Json
  $metadata = [ordered]@{
    projectRef = $ProjectRef
    completedAt = (Get-Date).ToUniversalTime().ToString('o')
    database = [ordered]@{
      encryptedFile = 'database.dump.bzenc'
      plaintextSha256 = $databaseCrypto.plaintextSha256
      encryptedSha256 = $databaseCrypto.encryptedSha256
      encryptedBytes = (Get-Item -LiteralPath $EncryptedDump).Length
    }
    storage = [ordered]@{
      buckets = @('business-assets', 'business-public-assets')
      encryptedFile = 'storage.zip.bzenc'
      plaintextSha256 = $storageCrypto.plaintextSha256
      encryptedSha256 = $storageCrypto.encryptedSha256
      encryptedBytes = (Get-Item -LiteralPath $EncryptedStorage).Length
    }
    encryption = 'AES-256-GCM; key protected for the current Windows user with DPAPI'
    restoreRehearsal = 'pending'
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $metadataJson = $metadata | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText($MetadataPath, $metadataJson, $utf8NoBom)
  Remove-PrivatePath $Staging $Generation

  if (-not $KeepDailyBeyondRetention) {
    $cutoff = (Get-Date).ToUniversalTime().AddDays(-35)
    foreach ($directory in Get-ChildItem -LiteralPath $BackupRoot -Directory) {
      $parsed = [DateTime]::MinValue
      if ([DateTime]::TryParseExact($directory.Name, 'yyyy-MM-ddTHHmmssZ', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$parsed) -and $parsed.ToUniversalTime() -lt $cutoff) {
        Remove-PrivatePath $directory.FullName $BackupRoot
      }
    }
  }
  Write-Host "Backup completed and verified: $Generation"
}
catch {
  Remove-PrivatePath $Staging $Generation
  throw
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PGHOST, Env:PGPORT, Env:PGDATABASE, Env:PGUSER, Env:PGSSLMODE -ErrorAction SilentlyContinue
  $DatabaseUrlText = $null
  $DatabasePassword = $null
  $StorageKey = $null
  $EncryptionKey = $null
}
