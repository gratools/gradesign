param([string]$Version = '5.3.0')
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Pass an exact Fontsource package version.' }
$families = @('inter', 'roboto', 'open-sans', 'lato', 'montserrat', 'poppins', 'lora', 'playfair-display', 'merriweather', 'bebas-neue', 'oswald', 'space-mono')
$projectRoot = Split-Path -Parent $PSScriptRoot
$fontRoot = Join-Path $projectRoot 'apps/web/public/fonts'
$downloadRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('gradesign-fonts-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $fontRoot, $downloadRoot | Out-Null
$manifest = @()
foreach ($family in $families) {
  $metadata = Invoke-RestMethod -Uri "https://registry.npmjs.org/@fontsource%2F$family/$Version"
  $archive = Join-Path $downloadRoot "$family.tgz"
  Invoke-WebRequest -Uri $metadata.dist.tarball -OutFile $archive
  $digest = [Convert]::ToBase64String([Security.Cryptography.SHA512]::HashData([IO.File]::ReadAllBytes($archive)))
  if ($metadata.dist.integrity -ne "sha512-$digest") { throw "Package integrity check failed for $family." }
  $destination = Join-Path $fontRoot $family
  $extraction = Join-Path $downloadRoot $family
  New-Item -ItemType Directory -Force -Path $destination, $extraction | Out-Null
  $entries = & tar -tzf $archive
  if ($LASTEXITCODE -ne 0) { throw "Unable to inspect $family archive." }
  $wanted = @($entries | Where-Object { $_ -match "^package/files/$family-latin-(400|700)-(normal|italic)\.woff2$" -or $_ -eq 'package/LICENSE' })
  if ($wanted.Count -lt 2 -or $wanted -notcontains 'package/LICENSE') { throw "Missing license or font data for $family." }
  & tar -xzf $archive -C $extraction @wanted
  if ($LASTEXITCODE -ne 0) { throw "Unable to extract $family archive." }
  foreach ($entry in $wanted) {
    Copy-Item -LiteralPath (Join-Path $extraction $entry) -Destination (Join-Path $destination (Split-Path -Leaf $entry))
  }
  $files = @($wanted | Where-Object { $_ -like '*.woff2' } | ForEach-Object { Split-Path -Leaf $_ })
  $manifest += @{ family = $family; package = $metadata.name; version = $metadata.version; source = $metadata.dist.tarball; license = $metadata.license; integrity = $metadata.dist.integrity; files = $files }
  Write-Output "$family $($metadata.version): $($files.Count) font faces"
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $fontRoot 'sources.json')
Write-Output "Bundled fonts saved to $fontRoot"
