#requires -version 5.1
<#
.SYNOPSIS
  Locally capture a real SNAPVERE Windows HWND at native DPI for visual review.
.DESCRIPTION
  Operator-driven. Does not upload screenshots, log private screen content,
  elevate privileges, or substitute Chromium renders for WebView2 evidence.
  Bring the target SNAPVERE window to the foreground, choose theme and state,
  then run the script. The always-no-activate recording HUD requires -Hud.
.EXAMPLE
  .\tools\windows-native-capture.ps1 -State home -Theme dark
.EXAMPLE
  .\tools\windows-native-capture.ps1 -State recbar-palette -Theme light -Hud
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9][a-z0-9-]{0,70}$')]
  [string]$State,
  [Parameter(Mandatory = $true)]
  [ValidateSet('dark', 'light')]
  [string]$Theme,
  [switch]$Hud,
  [string]$OutputDirectory = (Join-Path $PWD 'native-evidence')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
if (-not ('SnapvereNativeQa' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class SnapvereNativeQa
{
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
  public delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
}
'@
}

$os = Get-CimInstance Win32_OperatingSystem
if ($os.Caption -notmatch 'Windows (10|11)') {
  throw "Native visual acceptance requires real Windows 10 or 11; detected $($os.Caption)"
}
$processes = @(Get-Process -Name 'snapvere' -ErrorAction SilentlyContinue)
if ($processes.Count -eq 0) { throw 'Start the actual SNAPVERE desktop executable first.' }
$ids = @($processes | ForEach-Object { [uint32]$_.Id })
$target = [IntPtr]::Zero
if ($Hud) {
  $matches = [System.Collections.Generic.List[IntPtr]]::new()
  $callback = [SnapvereNativeQa+EnumProc] {
    param([IntPtr]$hwnd, [IntPtr]$data)
    [uint32]$pid = 0
    [void][SnapvereNativeQa]::GetWindowThreadProcessId($hwnd, [ref]$pid)
    if (($ids -contains $pid) -and [SnapvereNativeQa]::IsWindowVisible($hwnd)) {
      $caption = [System.Text.StringBuilder]::new(300)
      [void][SnapvereNativeQa]::GetWindowText($hwnd, $caption, $caption.Capacity)
      if ($caption.ToString() -like '*Snapvere*Recording*') { $matches.Add($hwnd) }
    }
    return $true
  }
  [void][SnapvereNativeQa]::EnumWindows($callback, [IntPtr]::Zero)
  if ($matches.Count -ne 1) { throw "Expected one visible Snapvere recording HUD, found $($matches.Count)." }
  $target = $matches[0]
} else {
  $target = [SnapvereNativeQa]::GetForegroundWindow()
  [uint32]$pid = 0
  [void][SnapvereNativeQa]::GetWindowThreadProcessId($target, [ref]$pid)
  if ($ids -notcontains $pid) {
    throw 'The foreground window is not owned by Snapvere. Activate the intended app window.'
  }
}
if (-not [SnapvereNativeQa]::IsWindowVisible($target)) {
  throw 'The selected SNAPVERE window is not visible.'
}
$rect = [SnapvereNativeQa+RECT]::new()
if (-not [SnapvereNativeQa]::GetWindowRect($target, [ref]$rect)) {
  throw 'GetWindowRect failed.'
}
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -lt 40 -or $height -lt 40 -or $width -gt 12000 -or $height -gt 12000) {
  throw "Unreasonable window screenshot dimensions: $width x $height"
}
$dpi = [SnapvereNativeQa]::GetDpiForWindow($target)
if ($dpi -lt 96 -or $dpi -gt 384) {
  throw "Unexpected native DPI: $dpi"
}
$percent = [math]::Round(100.0 * $dpi / 96.0)
$major = if ($os.BuildNumber -ge 22000) { 'windows11' } else { 'windows10' }
$folder = Join-Path $OutputDirectory ("$major-dpi-$percent-$Theme")
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$filename = Join-Path $folder ("$State.png")
if (Test-Path -LiteralPath $filename) {
  throw "Refusing to overwrite a previous capture: $filename"
}
$bitmap = [System.Drawing.Bitmap]::new($width, $height)
try {
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen(
      $rect.Left, $rect.Top, 0, 0,
      [System.Drawing.Size]::new($width, $height)
    )
  } finally { $graphics.Dispose() }
  $bitmap.Save($filename, [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $bitmap.Dispose() }
$hash = (Get-FileHash -LiteralPath $filename -Algorithm SHA256).Hash.ToLowerInvariant()
$meta = [ordered]@{
  artifact = (Split-Path $filename -Leaf)
  sha256 = $hash
  source = 'native_Windows_screen_region_of_Snapvere_HWND'
  is_browser_preview = $false
  recorded_utc = [DateTime]::UtcNow.ToString('o')
  windows_caption = $os.Caption
  windows_build = [string]$os.BuildNumber
  process = 'snapvere.exe'
  display_dpi = [int]$dpi
  display_scale_percent = [int]$percent
  theme_operator_confirmed = $Theme
  screen_state_operator_confirmed = $State
  window_hwnd = $target.ToInt64().ToString('x')
  captured_pixel_dimensions = @([int]$width, [int]$height)
  foreground_capture = (-not $Hud)
  physical_windows_test_passed = $false
  approved_reference_match = $false
  note = 'Inspect confidential content and window occlusion manually. Do not upload screenshots automatically.'
}
$metaPath = Join-Path $folder ("$State.metadata.json")
$meta | ConvertTo-Json -Depth 5 | Set-Content -Path $metaPath -Encoding UTF8
Write-Host "Saved $filename"
Write-Host "SHA256: $hash"
Write-Host "DPI: $dpi ($percent%); Windows: $($os.Caption) ($($os.BuildNumber))"
Write-Host 'Unverified until compared with approved native reference PNG and human-reviewed.'
