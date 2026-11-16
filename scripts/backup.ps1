# Cotygodniowa kopia bazy Trackera (Standard modułu: ręczny zrzut co tydzień, dopóki baza jest na planie Free).
# Zrzuca schemat public (tabele, RLS, słowniki + dane) do pliku w formacie pg_dump "custom".
# Wymaga pg_dump w wersji >= wersji Postgresa w Supabase (17). Hasło do bazy skrypt pobiera przy uruchomieniu
# (widać gwiazdki) i przekazuje pg_dump przez PGPASSWORD tylko na czas działania; nie trzymamy go w repozytorium.
# Uwaga: pliki ze Storage (CV, PDF-y ofert) nie wchodzą do zrzutu; w bazie są tylko ich ścieżki.
#
# Uruchomienie:  .\scripts\backup.ps1
# Odtworzenie (do pustej bazy): pg_restore --no-owner --no-privileges -d "<adres bazy>" "<plik .dump>"

$ErrorActionPreference = "Stop"

$backupDir = "C:\Users\wasil\Documents\tracker-backups"   # poza repozytorium: w kopii są dane osobowe
$pgBin     = "C:\Program Files\PostgreSQL\17\bin"
# Session pooler (IPv4). Bez hasła; adres jest też w supabase\.temp\pooler-url
$dbUrl     = "postgresql://postgres.kmfqedmnznnvcecxqavt@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"

if (-not (Test-Path "$pgBin\pg_dump.exe")) { throw "Nie znaleziono pg_dump w $pgBin. Zainstaluj narzędzia PostgreSQL 17." }
New-Item -ItemType Directory -Force $backupDir | Out-Null

$secure = Read-Host "Hasło do bazy Supabase" -AsSecureString
$env:PGPASSWORD = [System.Net.NetworkCredential]::new("", $secure).Password

$file = Join-Path $backupDir ("{0}-public.dump" -f (Get-Date -Format "yyyy-MM-dd"))
try {
  & "$pgBin\pg_dump.exe" $dbUrl --schema=public --format=custom --no-owner --no-privileges --no-password --file $file
  if ($LASTEXITCODE -ne 0) { throw "pg_dump zakończył się błędem ($LASTEXITCODE). Sprawdź hasło do bazy." }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue   # hasło nie zostaje w sesji PowerShella
}

# Kontrola: spis zawartości kopii (tabele i ich dane) bez odtwarzania czegokolwiek
$entries = & "$pgBin\pg_restore.exe" --list $file | Select-String "TABLE DATA public"
Write-Host "Kopia: $file ($([math]::Round((Get-Item $file).Length / 1KB)) KB)"
Write-Host "Tabele z danymi w kopii:"
$entries | ForEach-Object { Write-Host "  $($_.Line.Split(' ')[-2])" }
